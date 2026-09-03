# Práctica 6 — Despliegue en un Clúster de Kubernetes en la Nube

Lleva la plataforma de tickets de soporte (construida en las Prácticas
4 y 5) a un clúster de **Google Kubernetes Engine (GKE)** real, con
imágenes publicadas en **Artifact Registry** y una **IP pública real**
(Service `LoadBalancer`) — sin reescribir la aplicación, tal como pide
el enunciado.

## Por qué esta carpeta no repite el código ni el chart completo

El chart de Helm y el código de los 5 servicios son **exactamente los
mismos** de la Práctica 5 (`../P5/charts/` y los `Dockerfile` de cada
servicio) — el enunciado es explícito en que el objetivo "no es
reescribir la aplicación, sino llevar a un entorno real lo que ya está
construido". Por eso esta carpeta solo contiene lo que **cambia** para
desplegar en la nube:

| Archivo | Qué es |
|---|---|
| `values-gke.yaml` | Ajustes del chart para GKE — se usa junto con `../P5/charts/values.yaml`, no lo reemplaza |
| `docs/01-comandos-gke.md` | Runbook completo, de la cuenta de Google Cloud a la IP pública funcionando, y la eliminación de recursos |
| `docs/02-preguntas-teoricas.md` | Las 5 preguntas teóricas de esta práctica, respondidas |
| `docs/03-costos-y-limpieza.md` | Estimación de costos y el procedimiento correcto de eliminación |

## Qué cambia respecto al despliegue local (P5)

| Aspecto | P5 (minikube, local) | P6 (GKE, nube) |
|---|---|---|
| Exposición pública | Ingress + `port-forward`/`tunnel` local | Service `type: LoadBalancer` con IP pública real |
| Imágenes | Construidas dentro del Docker de minikube | Publicadas en Artifact Registry, descargadas por los nodos reales |
| StorageClass | `standard` (hostpath simulado) | `standard-rwo` (disco persistente real de Compute Engine) |
| NetworkPolicy | Requiere `--cni=calico` al crear el clúster | Requiere `--enable-network-policy` al crear el clúster |
| Nodos | 1, simulado en un contenedor | 2 VMs reales (`e2-medium`) |
| Costo | $0 (recursos propios) | Se paga por los nodos/LB/disco mientras el clúster exista — **ver `docs/03-costos-y-limpieza.md`** |

## Cómo desplegar (resumen — el detalle completo está en `docs/01-comandos-gke.md`)

```bash
cd ../P5/charts
helm install sa-platform . -f values.yaml -f ../../P6/values-gke.yaml -f values-secrets.yaml -n sa-p5 --create-namespace
```

## Evidencias a incluir en la entrega

- Captura de la consola de GKE mostrando el clúster con 2 nodos
- Captura de Artifact Registry mostrando las 6 imágenes publicadas
- Captura de `kubectl get pods -n sa-p5` (todo `Running`)
- Captura de `kubectl get svc` mostrando la IP pública asignada
- Captura de una petición exitosa hecha **desde fuera del clúster**
  (idealmente desde una red distinta a la tuya, ej. datos móviles)
- Captura de la eliminación del clúster ya completada
