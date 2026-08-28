# Comandos Reproducibles — De Cero a Funcionando

Sigue esto en orden exacto. Cada bloque asume que el anterior terminó
bien. **Antes que nada**, lee la sección 0 — es la más importante de
todo este documento.

---

## 0. Verificación de sintaxis (HAZLO PRIMERO, antes que nada más)

Todo el chart de Helm fue escrito y revisado a mano, pero **no pude
ejecutar `helm lint` ni `helm template` en mi entorno de trabajo**
(no tuve forma de instalar el binario de Helm ahí). Es la única parte
de esta práctica que no pude probar yo misma antes de dártela.

```bash
cd P5/charts
helm lint .
helm template sa-platform . -f values.yaml -f values-dev.yaml -f values.example.yaml
```

- Si `helm lint` da errores, generalmente son de indentación o de un
  `required` que falta — el mensaje trae el archivo y la línea.
- Si `helm template` falla, el error casi siempre apunta a una función
  o variable mal escrita — cópiame el error completo si te quedas
  atascada y lo resolvemos rápido.
- Si ambos pasan limpio, ya tienes de facto los "12 pts" del criterio
  de calidad del chart resueltos en la parte de sintaxis.

---

## 1. Instalar herramientas (si no las tienes)

```bash
# Docker Desktop: ya lo tienes de las prácticas anteriores.

# minikube
curl -Lo minikube https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube /usr/local/bin/

# kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install kubectl /usr/local/bin/

# Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```
(En Windows, usa `choco install minikube kubernetes-cli kubernetes-helm`
si tienes Chocolatey, o descarga los `.exe` de cada sitio oficial.)

## 2. Levantar el clúster con NetworkPolicy real y los addons necesarios

```bash
minikube start --cni=calico --memory=4096 --cpus=2
minikube addons enable ingress
minikube addons enable metrics-server
```

`--cni=calico` es OBLIGATORIO — el CNI por defecto de minikube NO hace
cumplir las NetworkPolicies (las acepta pero las ignora). Sin esto, el
requisito E de la práctica no se puede evidenciar.

Verifica que el Ingress Controller y metrics-server estén listos:
```bash
kubectl get pods -n ingress-nginx
kubectl get pods -n kube-system | grep metrics-server
kubectl top nodes   # si esto responde con numeros, metrics-server ya funciona
```

## 3. Construir las imágenes DENTRO del clúster de minikube

Este es el paso donde más gente se traba: si construyes las imágenes
con el Docker normal de tu máquina, minikube (que tiene su propio
Docker interno) no las va a encontrar.

```bash
eval $(minikube docker-env)   # A partir de aqui, "docker build" construye DENTRO de minikube

cd P5
docker build -t sa-p5/auth-service:dev ./auth-service
docker build -t sa-p5/tickets-service:dev ./tickets-service
docker build -t sa-p5/comentarios-service:dev ./comentarios-service
docker build -t sa-p5/notificaciones-service:dev ./notificaciones-service
docker build -t sa-p5/api-gateway:dev ./api-gateway
docker build -t sa-p5/cronjobs:dev ./cronjobs

docker images | grep sa-p5   # deben verse las 6 imagenes
```

**Anota el tamaño de cada imagen aquí mismo** (lo necesitas para
`docs/03-imagenes-comparacion.md`):
```bash
docker images | grep sa-p5
```

**Importante:** cada terminal nueva que abras necesita volver a correr
`eval $(minikube docker-env)` para seguir apuntando al Docker de
minikube. Si abres una terminal nueva y `docker images | grep sa-p5`
sale vacío, es porque se te olvidó ese paso en esa terminal.

## 4. Preparar los secretos (NO se suben al repo)

```bash
cd P5/charts
cp values.example.yaml values-secrets.yaml
```
Edita `values-secrets.yaml` y reemplaza los valores ficticios por
reales (puedes generarlos con `openssl rand -hex 24`, y para
`aesKeyHex` específicamente con `openssl rand -hex 32`). Pon tu carné
real en `cronjobs.carne`.

Confirma que `values-secrets.yaml` está en `.gitignore` de tu repo
ANTES de seguir (así no se sube por accidente):
```bash
echo "values-secrets.yaml" >> .gitignore
```

## 5. Resolver la dependencia de Helm declarada (aunque no se use por defecto)

```bash
cd P5/charts
helm dependency update
```
Esto intenta descargar los charts de Bitnami declarados en
`Chart.yaml`. Como `postgresql.enabled` y `rabbitmq.enabled` están en
`false` en `values.yaml`, no se van a desplegar aunque la descarga
falle o tarde — el chart usa sus propios subcharts (`db`, `broker`) en
su lugar (ver `docs/04-tecnologias-y-decisiones.md` para la
justificación completa). Si este comando da error de red, **no te
detiene** — sigue al paso 6.

## 6. Instalar la plataforma (chart padre + subcharts, un solo comando)

```bash
cd P5/charts
helm install sa-platform . \
  -f values.yaml -f values-dev.yaml -f values-secrets.yaml \
  -n sa-p5 --create-namespace
```

Espera a que todo levante:
```bash
kubectl get pods -n sa-p5 -w
```
(Ctrl+C cuando todos digan `Running` y `1/1` o `2/2` listos)

## 7. Agregar el host del Ingress

```bash
minikube ip
```
Copia esa IP y agrégala a tu archivo de hosts:
- Linux/Mac: `sudo nano /etc/hosts` → agrega `<IP>  sa-p5.local`
- Windows: edita `C:\Windows\System32\drivers\etc\hosts` como
  administrador → agrega `<IP>  sa-p5.local`

Prueba:
```bash
curl http://sa-p5.local/health
```

## 8. Probar el sistema completo

```bash
curl -X POST http://sa-p5.local/api/auth/registro -H "Content-Type: application/json" \
  -d '{"nombre":"Carlos","correo":"carlos@test.com","contrasena":"clave1234","rol":"Cliente"}'

curl -c cookies.txt -X POST http://sa-p5.local/api/auth/login -H "Content-Type: application/json" \
  -d '{"correo":"carlos@test.com","contrasena":"clave1234"}'

curl -b cookies.txt -X POST http://sa-p5.local/api/tickets -H "Content-Type: application/json" \
  -d '{"titulo":"Prueba","descripcion":"Verificando el despliegue","prioridad":"ALTA"}'
```

## 9. Los cronjobs — déjalos corriendo cuanto antes

Los cronjobs corren solos (cada 2 y 10 minutos) en cuanto el chart
está instalado — no necesitas hacer nada más. Pero **necesitas tiempo
real transcurrido** para tener evidencia: al menos ~25-30 minutos con
todo arriba para que el Cronjob 2 (cada 10 min) haya corrido 2-3 veces
y tengas varios resúmenes guardados. **Por eso este paso conviene
dejarlo corriendo de fondo mientras avanzas con el resto de la
documentación/evidencias.**

Verificar que van corriendo:
```bash
kubectl get cronjobs -n sa-p5
kubectl get jobs -n sa-p5
kubectl logs -n sa-p5 -l app.kubernetes.io/component=cronjob-registro --tail=20
```

## 10. Ver los pasos siguientes (evidencias, upgrade/rollback, carga)

Continúa con [`05-evidencias.md`](./05-evidencias.md) para los
comandos exactos de cada pieza de evidencia que pide la rúbrica.
