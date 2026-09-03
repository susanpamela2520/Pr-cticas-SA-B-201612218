# Preguntas Teóricas — Práctica 6

## 1. ¿Qué es un clúster de Kubernetes administrado y qué diferencias tiene frente a uno local?

Un clúster administrado (GKE, EKS, AKS, DOKS) es un clúster de
Kubernetes donde el **proveedor de nube opera el plano de control**
(el API Server, `etcd`, el scheduler, el controller-manager) por ti —
tú nunca lo instalas, lo parcheas ni lo mantienes en alta
disponibilidad; solo consumes su API. En un clúster local (minikube),
**tú eres el plano de control**: un solo proceso corriendo en tu propia
máquina, sin alta disponibilidad, sin actualizaciones automáticas, y
que desaparece si apagas tu laptop.

Diferencias concretas que se sintieron al migrar:

| Aspecto | Local (minikube) | Administrado (GKE) |
|---|---|---|
| Dirección pública | No existe — hay que usar `port-forward`/`tunnel` | Un Service `LoadBalancer` obtiene una IP pública real automáticamente |
| Almacenamiento | `hostpath` (un directorio dentro del contenedor de minikube) | Discos persistentes reales de Compute Engine, sobreviven aunque se destruya el nodo |
| NetworkPolicy | Requiere instalar Calico manualmente (`--cni=calico`) | Se habilita con una bandera al crear el clúster (o viene integrado según la versión) |
| Nodos | Uno solo, simulado en un contenedor Docker | Varias máquinas virtuales reales, pudiendo escalar horizontalmente de verdad |
| Disponibilidad | Se cae si tu laptop se suspende o reinicia | El plano de control sigue arriba aunque tu laptop se apague |
| Costo | Gratis (usa tus propios recursos) | Se paga por los nodos (VMs) que uses, aunque el plano de control de GKE Standard no tenga costo aparte |

## 2. ¿Qué es un Service de tipo LoadBalancer y cómo lo implementa el proveedor de nube?

Un Service `LoadBalancer` es el tipo de Service de Kubernetes que le
pide al **proveedor de infraestructura subyacente** que aprovisione un
balanceador de carga real, con una IP pública, y lo conecte al Service.
Es una capa por encima de un `ClusterIP` normal: sigue enrutando el
tráfico hacia los pods que coincidan con el `selector`, pero además
expone ese tráfico fuera del clúster.

En GKE, esto lo implementa el **cloud-controller-manager** de Google:
al crear un Service `type: LoadBalancer`, GKE detecta ese recurso y
automáticamente crea (fuera de Kubernetes, en la capa de red de GCP)
un **Network Load Balancer** de Google Cloud con una IP externa
asignada, con reglas de firewall para permitir el tráfico entrante, y
lo apunta hacia los nodos donde corren los pods del Service. Todo esto
ocurre sin que el estudiante tenga que crear el balanceador a mano —
basta con declarar el Service, y en 1-3 minutos GKE completa el
aprovisionamiento y refleja la IP en `kubectl get svc`.

## 3. ¿Qué es un registro de contenedores y por qué es necesario para desplegar en la nube?

Un registro de contenedores es un servidor donde se almacenan y
distribuyen imágenes Docker, identificadas por nombre y tag (similar a
como npm o pip almacenan paquetes). Cuando un pod arranca, el nodo de
Kubernetes que lo aloja necesita **descargar (`pull`)** la imagen desde
algún lugar — y ahí está la diferencia clave frente a un clúster local.

En minikube (P5), las imágenes se construían **directamente dentro**
del Docker interno de minikube (`minikube docker-env`), así que el
nodo ya las tenía localmente — nunca hacía falta un registro. En la
nube, los nodos de GKE son máquinas nuevas que **no conocen tus
imágenes locales**: si intentas desplegar sin publicarlas primero a
algún lugar accesible, el pod se queda en `ImagePullBackOff` porque el
nodo no encuentra de dónde descargarlas. Por eso es obligatorio
publicarlas a un registro accesible desde los nodos del clúster —en
este caso, **Artifact Registry** de Google Cloud— antes de poder
desplegar.

## 4. ¿Qué componentes del clúster administra el proveedor y cuáles siguen siendo responsabilidad del estudiante?

**Administra el proveedor (GKE):**
- El plano de control completo: API Server, `etcd`, scheduler, controller-manager
- Las actualizaciones de versión de Kubernetes del plano de control
- La alta disponibilidad y el respaldo de `etcd`
- El aprovisionamiento de los balanceadores de carga (`LoadBalancer`) y de los discos persistentes (`StorageClass`) a nivel de infraestructura física

**Sigue siendo responsabilidad del estudiante:**
- El contenido de los manifiestos/Helm charts (Deployments, Services, NetworkPolicies, RBAC, etc.)
- La seguridad a nivel de aplicación: `securityContext`, gestión de Secrets, cifrado de datos sensibles
- El dimensionamiento de los nodos (cuántos, de qué tamaño) y su costo asociado
- Mantener las imágenes de los contenedores actualizadas y sin vulnerabilidades
- Monitorear el uso de recursos y escalar (`HorizontalPodAutoscaler`) según la carga real
- Eliminar los recursos cuando ya no se necesiten, para no seguir generando costos

## 5. ¿Qué costos genera el despliegue realizado y cómo podrían reducirse?

**Costos generados:**
- **Nodos de cómputo (Compute Engine):** el costo dominante — 2 VMs
  corriendo continuamente, cobradas por hora mientras el clúster exista
- **Balanceador de carga:** un costo fijo por hora por tener un Network
  Load Balancer activo, más una tarifa pequeña por el tráfico de datos
  que procese
- **Disco persistente:** un costo por GB-mes por el volumen que usa
  PostgreSQL, independiente de si el clúster está "apagado" o no
  (mientras el disco exista, se cobra)
- **Artifact Registry:** un costo pequeño por GB almacenado de imágenes

*(El plano de control de GKE Standard no tiene costo adicional aparte
de los recursos anteriores; GKE Autopilot cobra distinto, por pod.)*

**Cómo reducirlos:**
- Usar la capa gratuita/créditos de estudiante mientras dure la práctica
- Elegir el tipo de nodo más pequeño que alcance (`e2-small`/`e2-medium`
  en vez de instancias más grandes)
- Usar exactamente el mínimo de nodos que pide el enunciado (2), no más
- **Eliminar el clúster completo apenas se termine de capturar la
  evidencia** — es la reducción más grande posible, ya que deja de
  cobrar por completo en vez de solo reducir el costo
- Revisar que no queden discos persistentes "huérfanos" después de
  borrar el clúster (a veces sobreviven al clúster y siguen cobrando)
