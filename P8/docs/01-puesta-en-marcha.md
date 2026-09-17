# Puesta en marcha — Práctica 8

Sigue esto en orden. Cada bloque asume que el anterior terminó bien.

**Tiempo estimado:** 3 a 4 horas, de las cuales unos 40 minutos son
esperas de instalación.

> **Aviso sobre el clúster:** a diferencia de la P7, el clúster debe seguir
> encendido el día de la calificación. Es requisito para optar a nota: "La
> aplicación se encuentra en estado Synced y Healthy al momento de la
> calificación".

---

## Paso 1 — Crear el clúster

Más grande que el de la P7, porque encima de los 11 pods de la aplicación
corren ArgoCD (~7 pods), Argo Rollouts (2), Kyverno (3) y Sealed Secrets (1).

```bash
gcloud container clusters create sa-p8-cluster \
  --zone=us-central1-a \
  --num-nodes=4 \
  --machine-type=e2-standard-2 \
  --disk-size=30 \
  --enable-ip-alias \
  --enable-dataplane-v2
```

```bash
gcloud container clusters get-credentials sa-p8-cluster --zone us-central1-a
kubectl get nodes
kubectl config current-context
```

Anota el contexto que devuelve el último comando: lo necesitas para
Terraform.

---

## Paso 2 — Instalar los componentes de la plataforma

### 2.1 ArgoCD

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl wait --for=condition=available --timeout=300s deployment/argocd-server -n argocd
```

Obtén la contraseña inicial y expón la interfaz:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
echo ""
kubectl patch svc argocd-server -n argocd -p '{"spec":{"type":"LoadBalancer"}}'
kubectl get svc argocd-server -n argocd -w
```

Cuando aparezca la IP externa, entra a `https://IP` con usuario `admin`.
El navegador advertirá sobre el certificado: es autofirmado, acepta el
riesgo.

**Captura de evidencia:** la interfaz de ArgoCD con sesión iniciada.

### 2.2 Argo Rollouts

```bash
kubectl create namespace argo-rollouts
kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml
kubectl wait --for=condition=available --timeout=300s deployment/argo-rollouts -n argo-rollouts
```

Instala el plugin de `kubectl`, que es el que muestra la promoción paso a
paso (imprescindible para la evidencia):

```bash
curl -LO https://github.com/argoproj/argo-rollouts/releases/latest/download/kubectl-argo-rollouts-linux-amd64
chmod +x kubectl-argo-rollouts-linux-amd64
mkdir -p ~/bin && mv kubectl-argo-rollouts-linux-amd64 ~/bin/kubectl-argo-rollouts
export PATH="$HOME/bin:$PATH"
kubectl argo rollouts version
```

### 2.3 Kyverno

```bash
helm repo add kyverno https://kyverno.github.io/kyverno
helm repo update
helm install kyverno kyverno/kyverno -n kyverno --create-namespace --wait
kubectl get pods -n kyverno
```

### 2.4 Sealed Secrets

```bash
helm repo add sealed-secrets https://bitnami-labs.github.io/sealed-secrets
helm repo update
helm install sealed-secrets sealed-secrets/sealed-secrets -n kube-system --wait
```

---

## Paso 3 — Aplicar la infraestructura con Terraform

```bash
cd P8/terraform
cp ejemplo.tfvars local.tfvars
```

Edita `local.tfvars` y pon el contexto real (el del paso 1). Luego:

```bash
terraform init
terraform plan -var-file=local.tfvars
```

**Captura de evidencia:** la salida del `plan` mostrando los recursos a
crear. La rúbrica pide "evidencia de plan y apply".

```bash
terraform apply -var-file=local.tfvars
```

Verifica:

```bash
kubectl get namespaces --show-labels | grep sa-
kubectl get resourcequota -A
kubectl get limitrange -A
kubectl get role,rolebinding -n sa-prod
```

**Captura de evidencia:** la salida del `apply` y estas verificaciones.

> Las etiquetas de los namespaces importan: Kyverno usa
> `sa-platform/aplicar-politicas` para decidir dónde bloquear y dónde solo
> auditar.

---

## Paso 4 — Cifrar los secretos

```bash
cd ../../   # a la raíz del repositorio de código
```

Instala `kubeseal`:

```bash
winget install BitnamiLabs.SealedSecrets.Kubeseal
```

Obtén el certificado público del controlador:

```bash
kubeseal --fetch-cert \
  --controller-name sealed-secrets \
  --controller-namespace kube-system > pub-cert.pem
```

Crea el archivo de variables a partir de tus secretos de la P5, cífralo y
**borra el original**:

```bash
kubectl create secret generic sa-platform-secretos \
  --namespace sa-prod \
  --from-env-file=secretos.env \
  --dry-run=client -o yaml \
  | kubeseal --cert pub-cert.pem --format yaml > sealed-secrets.yaml

rm secretos.env pub-cert.pem
```

El `--dry-run=client` es lo que evita que el Secret en claro llegue al
clúster: se construye localmente, se cifra, y solo la versión cifrada se
versiona.

Copia `sealed-secrets.yaml` a la carpeta `secrets/` del repositorio GitOps.

---

## Paso 5 — Subir el repositorio GitOps

```bash
cd ~/Desktop   # o donde prefieras clonarlo
git clone https://github.com/susanpamela2520/Pr-cticas-SA-B-201612218-gitops.git
cd Pr-cticas-SA-B-201612218-gitops
```

Copia aquí el contenido de la carpeta `gitops/` del zip, y también el
`sealed-secrets.yaml` del paso anterior. Luego:

```bash
git add .
git commit -m "P8: manifiestos declarativos, rollout canary y politicas"
git push
```

**Comprobación importante:** verifica que el repositorio es **público**. Un
enlace que pida autenticación se califica con cero.

---

## Paso 6 — Registrar las Applications en ArgoCD

```bash
kubectl apply -f apps/politicas.yaml
kubectl apply -f apps/api-gateway.yaml
```

Observa la sincronización:

```bash
kubectl get applications -n argocd -w
```

Ambas deben llegar a `Synced` y `Healthy`.

**Captura de evidencia:** la interfaz de ArgoCD con las dos aplicaciones en
verde, y el árbol de recursos de `sa-platform-gateway`.

Si alguna queda en `OutOfSync` o `Degraded`:

```bash
kubectl describe application sa-platform-gateway -n argocd | tail -30
```

---

## Paso 7 — Evidenciar el rechazo por política

Aplica el pod deliberadamente no conforme:

```bash
kubectl apply -f policies/pod-de-prueba-rechazado.yaml
```

Kyverno debe rechazarlo con los mensajes de las tres políticas violadas.

**Captura de evidencia:** esa salida de error completa. Es el criterio
"Despliegue rechazado por política".

Comprueba también que las políticas están activas:

```bash
kubectl get clusterpolicy
kubectl get clusterpolicyreport -A 2>/dev/null | head -20
```

---

## Paso 8 — Configurar el token del repositorio GitOps

El pipeline necesita permiso para abrir Pull Requests en el otro
repositorio. El `GITHUB_TOKEN` por defecto solo alcanza al repositorio
actual.

1. GitHub → tu foto → **Settings** → **Developer settings** →
   **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
2. Nombre: `gitops-pr`
3. Repository access: **Only select repositories** →
   `Pr-cticas-SA-B-201612218-gitops`
4. Permissions → Repository permissions:
   - **Contents**: Read and write
   - **Pull requests**: Read and write
5. Genera el token y cópialo

En el repositorio de código: **Settings → Secrets and variables → Actions →
New repository secret**:

- Nombre: `GITOPS_TOKEN`
- Valor: el token

---

## Paso 9 — Primera promoción exitosa

Copia los archivos de la P8 al repositorio de código y súbelos:

```bash
git add .github P8
git commit -m "P8: pipeline de cadena de suministro y GitOps"
git push
```

Dispara una versión:

```bash
git tag -a v1.0.1 -m "Primera promocion por el flujo GitOps"
git push origin v1.0.1
```

El pipeline recorre sus cinco fases y abre un Pull Request en el
repositorio GitOps.

**Capturas de evidencia:**
- El pipeline completo en verde
- El reporte de Trivy
- La verificación de la firma con Cosign
- El Pull Request automático en el repo GitOps

Aprueba y fusiona el PR. Luego observa el rollout:

```bash
kubectl argo rollouts get rollout api-gateway -n sa-prod --watch
```

Verás la promoción avanzar: 20 % → 50 % → 100 %, con el análisis corriendo
en cada paso.

**Captura de evidencia:** la promoción paso a paso. Es el criterio "1
promoción exitosa de versión".

---

## Paso 10 — El fallo inducido

Este es el criterio de mayor peso (14 pts) y el que requiere más cuidado.

### 10.1 Introducir el defecto

Edita el `api-gateway` para que su endpoint de salud falle. La forma más
limpia y reversible es hacer que devuelva 500:

En `P5/api-gateway/src/` busca el manejador de `/health` y cámbialo para
que responda con código 500. Un ejemplo del tipo de cambio:

```javascript
// VERSIÓN DEFECTUOSA — introducida deliberadamente para la P8
app.get('/health', (req, res) => {
  res.status(500).json({ status: 'error', servicio: 'api-gateway' });
});
```

Anota la **hora exacta** antes de continuar: la necesitas para el tiempo de
recuperación del informe de incidente.

### 10.2 Publicar la versión defectuosa

```bash
git add P5/api-gateway
git commit -m "P8: version defectuosa para demostrar la reversion automatica"
git push
git tag -a v1.0.2 -m "Version defectuosa (fallo inducido)"
git push origin v1.0.2
```

### 10.3 Observar la reversión

Aprueba el PR que se genere, y **de inmediato** deja corriendo:

```bash
kubectl argo rollouts get rollout api-gateway -n sa-prod --watch
```

En otra terminal:

```bash
kubectl get analysisrun -n sa-prod -w
```

Lo que debe ocurrir:

1. El rollout llega al 20 % del tráfico
2. El `AnalysisTemplate` ejecuta la métrica de disponibilidad
3. `/health` devuelve 500, la métrica falla con `failureLimit: 0`
4. Argo Rollouts aborta la promoción y **revierte al estable**

**Capturas de evidencia (las más importantes de la práctica):**
- El rollout en estado `Degraded` y luego revertido
- El `AnalysisRun` marcado como `Failed`
- Los logs del job de análisis mostrando el código 500 recibido
- La hora de inicio y de retorno al estado estable

```bash
kubectl describe analysisrun -n sa-prod | tail -40
kubectl logs -n sa-prod -l job-name --tail=20
kubectl argo rollouts history api-gateway -n sa-prod
```

### 10.4 Restaurar

```bash
git revert HEAD --no-edit
git push
git tag -a v1.0.3 -m "Restaurar la version correcta"
git push origin v1.0.3
```

Aprueba el PR y confirma que el rollout vuelve a promoverse completo.

### 10.5 Completar el informe

Con los datos recogidos, llena `P8/INFORME-INCIDENTE.md`. Los cinco campos
piden datos concretos: la plantilla ya tiene indicado qué comando da cada
dato.

---

## Paso 11 — Prueba de carga

```bash
IP=$(kubectl get svc api-gateway-stable -n sa-prod -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "IP pública: $IP"

cd P8/tests/load
k6 run -e URL="http://$IP:8080" carga-canary.js
```

Genera `reporte-carga-canary.json`, que es el archivo que pide la tabla de
enlaces. Súbelo al repositorio:

```bash
cd ../../..
git add P8/tests/load/reporte-carga-canary.json
git commit -m "P8: reporte de la prueba de carga"
git push
```

Corre también las otras dos pruebas y guarda sus salidas:

```bash
bash P8/tests/smoke/humo.sh "http://$IP:8080"
bash P8/tests/integration/integracion.sh "http://$IP:8080"
```

---

## Paso 12 — Evidenciar el bloqueo por vulnerabilidad

La tabla pide la URL de un Pull Request bloqueado por Trivy. Si tus
imágenes no tienen CVE críticas con parche, hay que provocarlo de forma
controlada.

Crea una rama con una imagen base deliberadamente vieja:

```bash
git checkout -b demo/cve-critica
```

En `P5/api-gateway/Dockerfile`, cambia temporalmente la imagen base por una
versión antigua con vulnerabilidades conocidas, por ejemplo
`node:18.0.0-alpine3.15`. Luego:

```bash
git add P5/api-gateway/Dockerfile
git commit -m "Demostracion: imagen base con CVE criticas"
git push -u origin demo/cve-critica
```

Abre el Pull Request. Trivy debe fallar y bloquearlo.

**Captura de evidencia:** el PR con el check de Trivy en rojo y el reporte
de las CVE encontradas. Guarda su URL para la tabla.

**No fusiones ese PR.** Ciérralo después de capturar la evidencia.

---

## Paso 13 — Video demostrativo

De 5 a 8 minutos, con minutaje en el README. Guion sugerido:

| Minuto | Contenido |
|---|---|
| 0:00–0:45 | Los dos repositorios y para qué sirve cada uno |
| 0:45–1:30 | Terraform: `plan`, `apply` y los namespaces resultantes |
| 1:30–2:30 | ArgoCD: aplicaciones Synced y Healthy, árbol de recursos |
| 2:30–3:30 | El pipeline: Trivy, SBOM, firma y el PR automático |
| 3:30–5:00 | El fallo inducido y la reversión automática en vivo |
| 5:00–5:45 | El pod rechazado por Kyverno |
| 5:45–6:30 | Verificación de la firma con Cosign |

Súbelo a YouTube como **no listado** (no privado, que requiere permisos).

---

## Antes de entregar

- [ ] Los dos repositorios son **públicos**
- [ ] La tabla de enlaces del README está completa, sin `PENDIENTE`
- [ ] Cada enlace abre en una ventana de incógnito
- [ ] ArgoCD muestra `Synced` y `Healthy`
- [ ] El informe de incidente tiene datos concretos, no aproximaciones
- [ ] `grep -riE "password|jwt.*[A-Za-z0-9]{20}" .` no encuentra secretos en claro

## Verificación del requisito de no-despliegue-directo

La rúbrica lo comprueba explícitamente. Verifícalo tú primero:

```bash
grep -rniE 'kubectl (apply|set image)|helm upgrade|kubeconfig' .github/workflows/
```

Solo debería aparecer en el workflow de la P7 (`ci-cd.yml`), que es
evidencia de esa práctica y no se modifica. El de la P8
(`p8-supply-chain.yml`) debe estar limpio.

> Si Kevin evalúa el requisito sobre *todos* los workflows del repositorio
> y no solo el de la P8, hay dos salidas: renombrar `ci-cd.yml` a
> `ci-cd.yml.p7` para desactivarlo conservando la evidencia, o mover la P7
> a una rama etiquetada. Conviene preguntarle antes de entregar.
