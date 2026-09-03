# Comandos Reproducibles — Despliegue en GKE

Sigue esto en orden. Cada bloque asume que el anterior terminó bien.
Al final está la sección de **eliminación de recursos** — no la
saltes, es parte obligatoria de la entrega.

---

## 0. Antes de empezar

- Cuenta de Google (la misma de Gmail sirve).
- Una tarjeta de crédito/débito para verificar identidad en Google
  Cloud (no se cobra automáticamente al terminar la capa gratuita —
  hay que activarlo manualmente).
- Docker Desktop (ya lo tienes de las prácticas anteriores).
- Las 6 imágenes de la P5 ya compiladas localmente (o el código fuente
  listo para reconstruirlas).

## 1. Crear la cuenta y el proyecto de Google Cloud

1. Ve a **https://console.cloud.google.com**
2. Si es tu primera vez, acepta activar la **prueba gratuita** ($300
   USD de crédito, válido 90 días)
3. Crea un proyecto nuevo (menú superior → "Nuevo proyecto"), ej.
   `sa-p6-practica`. Anota el **ID del proyecto** (no el nombre — el ID
   es único, tipo `sa-p6-practica-123456`)

## 2. Instalar y configurar gcloud CLI

```powershell
# Windows (winget, igual que hicimos con minikube/kubectl/helm)
winget install Google.CloudSDK
```
**Cierra y abre una terminal nueva** (mismo patrón de siempre).

```powershell
gcloud init
```
Esto abre el navegador para que inicies sesión con tu cuenta de Google
y selecciones el proyecto que creaste. Confirma con:
```powershell
gcloud config get-value project
```

## 3. Habilitar las APIs necesarias

```powershell
gcloud services enable container.googleapis.com
gcloud services enable artifactregistry.googleapis.com
```

## 4. Crear el repositorio de imágenes (Artifact Registry)

```powershell
gcloud artifacts repositories create sa-p5-repo `
  --repository-format=docker `
  --location=us-central1 `
  --description="Imagenes de la plataforma de tickets"
```
(`us-central1` es una región económica típica; puedes usar otra si
prefieres, solo sé consistente en todos los comandos siguientes)

Configura Docker para poder subir imágenes a este repositorio:
```powershell
gcloud auth configure-docker us-central1-docker.pkg.dev
```

## 5. Obtén tu REGION y PROJECT_ID exactos (los vas a necesitar seguido)

```powershell
gcloud config get-value project
```
Anota el resultado — ese es tu `TU_PROJECT_ID`. Tu `TU_REGION` en este
runbook es `us-central1` (o la que hayas elegido en el paso 4).

## 6. Reemplaza los marcadores en `values-gke.yaml`

Abre `charts/values-gke.yaml` y reemplaza **todas** las apariciones de
`TU_REGION` y `TU_PROJECT_ID` por tus valores reales. Más rápido con
PowerShell (ajusta los valores de las variables primero):
```powershell
$REGION = "us-central1"
$PROYECTO = "PEGA-AQUI-TU-PROJECT-ID"

(Get-Content charts\values-gke.yaml) `
  -replace "TU_REGION", $REGION `
  -replace "TU_PROJECT_ID", $PROYECTO `
  | Set-Content charts\values-gke.yaml
```

## 7. Construir y subir las 6 imágenes a Artifact Registry

Ya no usamos `minikube docker-env` — construimos con el Docker normal
de tu máquina, y las etiquetamos directo con la ruta del registro:

```powershell
cd P5
$REGION = "us-central1"
$PROYECTO = "PEGA-AQUI-TU-PROJECT-ID"
$REGISTRO = "$REGION-docker.pkg.dev/$PROYECTO/sa-p5-repo"

docker build -t "$REGISTRO/auth-service:gke" .\auth-service
docker build -t "$REGISTRO/tickets-service:gke" .\tickets-service
docker build -t "$REGISTRO/comentarios-service:gke" .\comentarios-service
docker build -t "$REGISTRO/notificaciones-service:gke" .\notificaciones-service
docker build -t "$REGISTRO/api-gateway:gke" .\api-gateway
docker build -t "$REGISTRO/cronjobs:gke" .\cronjobs

docker push "$REGISTRO/auth-service:gke"
docker push "$REGISTRO/tickets-service:gke"
docker push "$REGISTRO/comentarios-service:gke"
docker push "$REGISTRO/notificaciones-service:gke"
docker push "$REGISTRO/api-gateway:gke"
docker push "$REGISTRO/cronjobs:gke"
```

**Evidencia a capturar:** entra a la consola de Google Cloud → Artifact
Registry → tu repositorio `sa-p5-repo` — deben verse las 6 imágenes
listadas con su tag `gke`.

## 8. Crear el clúster de GKE (2 nodos, con NetworkPolicy habilitada)

```powershell
gcloud container clusters create sa-p6-cluster `
  --zone us-central1-a `
  --num-nodes 2 `
  --machine-type e2-medium `
  --enable-network-policy
```
Esto tarda unos 5-10 minutos — es normal, está creando VMs reales.

**Evidencia a capturar:** consola de Google Cloud → Kubernetes Engine
→ Clústeres — debe verse `sa-p6-cluster` con estado verde/OK y 2 nodos.

## 9. Conectar kubectl al clúster de la nube

```powershell
gcloud container clusters get-credentials sa-p6-cluster --zone us-central1-a
kubectl get nodes
```
Deben salir tus 2 nodos, `Ready`. **Nota:** ya no necesitas `minikube`
para nada de aquí en adelante — `kubectl` ahora apunta al clúster real
en la nube.

## 10. Verificar la StorageClass real del clúster

```powershell
kubectl get storageclass
```
Confirma que el nombre coincide con lo que pusiste en
`values-gke.yaml` (`standard-rwo`). Si sale distinto, ajusta ese
archivo antes de continuar.

## 11. Preparar los secretos (mismo patrón que la P5)

```powershell
cd charts
```
Si conservas tu `values-secrets.yaml` de la P5, puedes reutilizarlo
tal cual (las credenciales no cambian solo por cambiar de clúster). Si
no lo tienes a mano, créalo de nuevo con el mismo patrón:
```powershell
Get-Content values.example.yaml
```
y complétalo con valores reales, igual que hiciste en la P5.

## 12. Instalar la plataforma en el clúster de la nube

```powershell
helm dependency update
helm install sa-platform . -f values.yaml -f values-gke.yaml -f values-secrets.yaml -n sa-p5 --create-namespace
```

## 13. Verificar que todo esté arriba

```powershell
kubectl get pods -n sa-p5
```
Espera a que todos digan `Running` (puede tardar 1-2 minutos más que
en local, ya que Google tiene que descargar tus imágenes desde
Artifact Registry por primera vez).

**Evidencia a capturar:** la salida completa de este comando.

## 14. Obtener la IP pública real

```powershell
kubectl get svc -n sa-p5 sa-platform-api-gateway
```
La columna `EXTERNAL-IP` va a decir `<pending>` los primeros 1-3
minutos — vuelve a correr el comando hasta que aparezca una IP real
(ej. `34.123.45.67`).

**Evidencia a capturar:** esta salida mostrando la IP externa ya asignada.

## 15. Probar el sistema desde internet

```powershell
$IP = "PEGA-AQUI-LA-IP-EXTERNA"
curl.exe "http://$IP/health"
```
Debe responder `{"status":"ok","servicio":"api-gateway"}` — esto ya es
una petición real desde tu máquina hacia una IP pública de Google
Cloud, no un `port-forward` ni un `tunnel` local.

Prueba también el flujo completo (registro, login, crear ticket) igual
que hiciste en la P5, mismos comandos de `curl.exe`, solo cambiando
`http://sa-p5.local:8888` por `http://$IP` y quitando el header `Host`
(ya no hace falta, no hay Ingress de por medio).

**Evidencia a capturar (importante — la rúbrica la pide
explícitamente):** una petición exitosa hecha desde fuera de tu red si
es posible (por ejemplo, desde tu celular con datos móviles apuntando
a `http://IP_PUBLICA/health`, o pidiéndole a alguien más que la pruebe)
— esto demuestra que de verdad es pública, no solo alcanzable desde tu
propia red.

---

## 16. Eliminar los recursos (OBLIGATORIO al terminar)

**Orden importante:** borra primero el release de Helm (para que el
LoadBalancer y los discos se liberen limpiamente), y hasta el final el
clúster.

```powershell
helm uninstall sa-platform -n sa-p5
kubectl delete pvc --all -n sa-p5
```

Espera 1-2 minutos para que el LoadBalancer de Google se libere, y
confirma que no quedó huérfano:
```powershell
gcloud compute forwarding-rules list
gcloud compute addresses list
```
Si aparece algo ahí relacionado a tu clúster, bórralo:
```powershell
gcloud compute forwarding-rules delete NOMBRE_QUE_APAREZCA --region us-central1
```

Ahora sí, borra el clúster completo:
```powershell
gcloud container clusters delete sa-p6-cluster --zone us-central1-a
```
Confirma con `y` cuando pregunte. Esto tarda unos minutos.

Opcionalmente, borra también el repositorio de imágenes (si ya no lo
necesitas):
```powershell
gcloud artifacts repositories delete sa-p5-repo --location us-central1
```

**Evidencia a capturar:** la consola de Google Cloud → Kubernetes
Engine → Clústeres, mostrando que ya no existe `sa-p6-cluster` (o el
resultado del comando `gcloud container clusters list` mostrando una
lista vacía).

**Verificación final de que no sigue cobrando:** ve a **Facturación →
Informes** en la consola de Google Cloud unos días después y confirma
que el costo diario volvió a $0.
