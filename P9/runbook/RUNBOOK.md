# Runbook de recuperación

**Sistema:** Plataforma de tickets (sa-platform) · **Carné:** 201612218

**Para quién es:** alguien que no construyó este sistema y no puede
consultar a quien lo hizo.

**Qué asume:** acceso a Google Cloud con permisos de administrador sobre el
proyecto `p6-sa2s2026`, y las herramientas de la sección 0 instaladas.

**Qué NO asume:** conocimiento previo del sistema.

---

## Índice

| Sección | Cuándo usarla |
|---|---|
| 0 | Antes de cualquier cosa: verificar herramientas y datos |
| 1 | El clúster se perdió: reconstrucción completa |
| 2 | Los datos se perdieron: restauración desde respaldo |
| 3 | El sistema no responde tras reconstruir: diagnóstico |
| 4 | Los secretos no se descifran |
| 5 | Un nodo falla o hay que drenarlo |
| 6 | Cuándo escalar en lugar de seguir intentando |

---

## 0. Verificación previa

### 0.1 Herramientas

```bash
gcloud version
terraform version
kubectl version --client
helm version
velero version --client-only
kubeseal --version
```

Si falta alguna, instálela antes de continuar. El bootstrap falla a mitad
de camino si no están todas, y reiniciarlo desde cero cuesta más que
instalarlas ahora.

### 0.2 Credenciales de Google Cloud

```bash
gcloud auth login
gcloud auth application-default login
gcloud auth application-default set-quota-project p6-sa2s2026
gcloud config set project p6-sa2s2026
```

El segundo comando es el que Terraform necesita para escribir en el bucket
del estado. Sin él, `terraform init` falla con
`could not find default credentials`.

### 0.3 Datos que debe tener a mano

| Dato | Valor | Dónde verificarlo |
|---|---|---|
| Proyecto | `p6-sa2s2026` | `gcloud config get-value project` |
| Bucket del estado | `sa-p9-tfstate-201612218` | `P9/terraform/backend.tf` |
| Bucket de respaldos | `sa-p9-respaldos-201612218` | `P9/terraform/terraform.tfvars` |
| Repositorio GitOps | `github.com/susanpamela2520/Pr-cticas-SA-B-201612218-gitops` | Público, no requiere credencial |
| Respaldo de la llave de Sealed Secrets | `~/.sa-p9/llave-sealed-secrets.yaml` | **No está en el repositorio** |

### 0.4 Comprobación que decide el resto del procedimiento

```bash
ls -la ~/.sa-p9/llave-sealed-secrets.yaml
gcloud storage ls gs://sa-p9-respaldos-201612218/
```

**Si el archivo de la llave no existe, deténgase y lea la sección 4 antes
de reconstruir.** Los secretos del repositorio están cifrados con esa llave
y sin ella no hay forma de descifrarlos: no es un problema de
procedimiento, es criptografía. Reconstruir sin ella deja el sistema en pie
pero con todos los pods en `CreateContainerConfigError`.

---

## 1. Reconstrucción completa

### 1.1 Anotar la hora de inicio

```bash
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

Anótela. El RTO se calcula contra esta marca.

### 1.2 Clonar y configurar

```bash
git clone https://github.com/susanpamela2520/Pr-cticas-SA-B-201612218
cd Pr-cticas-SA-B-201612218
cp P9/terraform/terraform.tfvars.ejemplo P9/terraform/terraform.tfvars
```

Edite `terraform.tfvars` y complete:

```hcl
proyecto         = "p6-sa2s2026"
region           = "us-central1"
zona             = "us-central1-a"
nombre_cluster   = "sa-p9-cluster"
nodos            = 3
bucket_respaldos = "sa-p9-respaldos-201612218"
repo_gitops      = "https://github.com/susanpamela2520/Pr-cticas-SA-B-201612218-gitops"
```

### 1.3 Ejecutar el bootstrap

```bash
mkdir -p P9/evidencia
bash P9/bootstrap/bootstrap.sh 2>&1 | tee P9/evidencia/reconstruccion.log
```

**No ejecute los pasos por separado.** El script los encadena en el orden
correcto y registra las marcas de tiempo que el informe necesita.

**Duración esperada:** 25 a 40 minutos. El grueso es el aprovisionamiento
del clúster de GKE, entre 8 y 12 minutos, seguido de los cinco componentes
de Helm.

### 1.4 Verificación

```bash
kubectl get nodes
kubectl get applications -n argocd
kubectl get pods -n sa-prod
```

**Criterios de éxito:**

| Comprobación | Resultado esperado |
|---|---|
| Nodos | 3, todos en `Ready` |
| Applications | 4, todas `Synced` y `Healthy` |
| Pods en `sa-prod` | 12 o más, todos `Running` |

Si alguna Application queda en `Progressing` más de diez minutos, vaya a la
sección 3.

### 1.5 Comprobar que el sistema responde

```bash
IP=$(kubectl get svc api-gateway-stable -n sa-prod \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "IP publica: $IP"
curl -s http://$IP:8080/health
```

Respuesta esperada:

```json
{"status":"ok","servicio":"api-gateway"}
```

El LoadBalancer tarda 1 a 3 minutos en obtener IP. Si sale vacía, espere y
repita.

### 1.6 Anotar la hora de fin

```bash
date -u '+%Y-%m-%dT%H:%M:%SZ'
```

**RTO real = esta marca menos la de 1.1.**

El sistema está en pie, pero **sin datos**: la base de datos arranca vacía.
Continúe con la sección 2.

---

## 2. Restauración de datos

### 2.1 Listar los respaldos disponibles

```bash
velero backup get
```

Salida típica:

```
NAME                                  STATUS      CREATED
respaldo-datos-horario-20261126020000 Completed   2026-11-26 02:00:00
respaldo-diario-20261126020000        Completed   2026-11-26 02:00:00
```

Elija el más reciente con estado `Completed`. **Un respaldo en
`PartiallyFailed` puede haber omitido los volúmenes**, que es justo lo que
necesita: verifíquelo con `velero backup describe NOMBRE --details`.

### 2.2 Restaurar

```bash
velero restore create --from-backup NOMBRE-DEL-RESPALDO \
  --include-namespaces sa-prod

velero restore get
```

Espere a que el estado sea `Completed`. Si tarda, siga el progreso:

```bash
velero restore logs NOMBRE-DE-LA-RESTAURACION | tail -30
```

### 2.3 Verificación — este paso no es opcional

```bash
bash P9/tests/verificar-datos.sh
```

Salida esperada:

```
Filas en prueba_dr : 3
Ultima marca       : dr-20261126013000
Tickets            : 12
Usuarios           : 4
```

**Un PVC restaurado que existe pero está vacío es un respaldo que falló sin
avisar.** Comprobar que el volumen se montó no demuestra nada; hay que leer
filas.

Si los conteos son cero, el respaldo no incluyó los volúmenes. Revise:

```bash
velero backup describe NOMBRE --details | grep -A5 "Backup Volumes"
```

### 2.4 Calcular el RPO

```
RPO real = hora de la destrucción − hora del último respaldo completado
```

La hora del respaldo sale de `velero backup get`.

---

## 3. El sistema no responde tras reconstruir

### 3.1 Diagnóstico inicial

```bash
kubectl get applications -n argocd
kubectl get pods -n sa-prod
kubectl get events -n sa-prod --sort-by=.lastTimestamp | tail -15
```

### 3.2 Tabla de síntomas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `CreateContainerConfigError` | El Secret no se descifró | Sección 4 |
| `ImagePullBackOff` | Ruta o etiqueta de imagen incorrecta | `kubectl describe pod` y comparar con `values-prod.yaml` |
| `CrashLoopBackOff` con error `28P01` | La contraseña del servicio no coincide con la de PostgreSQL | Sección 3.3 |
| `Pending` | Cuota del namespace o capacidad del clúster | `kubectl describe pod` y revisar eventos |
| Application en `Unknown` | Error de sintaxis en el repositorio GitOps | Sección 3.4 |
| Pods rechazados en la admisión | Kyverno bloqueando | `kubectl describe rs` y leer el mensaje del webhook |

### 3.3 Error 28P01: autenticación de PostgreSQL

Ocurre cuando el volumen de la base sobrevivió a una rotación de
credenciales: PostgreSQL solo crea el usuario en su primera
inicialización, así que conserva la contraseña antigua.

```bash
CLAVE=$(kubectl get secret sa-platform-db-credenciales -n sa-prod \
  -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)

kubectl exec -n sa-prod sa-platform-db-0 -- \
  psql -U appuser -d sa_platform_db \
  -c "ALTER USER appuser WITH PASSWORD '$CLAVE';"
```

Debe responder `ALTER ROLE`. Luego reinicie los servicios:

```bash
for S in auth-service tickets-service comentarios-service; do
  kubectl delete pod -n sa-prod -l app.kubernetes.io/component=$S
done
```

### 3.4 Application en Unknown

```bash
kubectl get application NOMBRE -n argocd -o jsonpath='{.status.conditions}'
```

El mensaje indica el archivo y la línea. ArgoCD **cachea** el error, así
que tras corregir el repositorio hay que forzar la recarga:

```bash
kubectl patch application NOMBRE -n argocd --type merge \
  -p '{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"hard"}}}'
```

Si persiste, reinicie el servidor de repositorios, que es donde vive esa
caché:

```bash
kubectl rollout restart deployment argocd-repo-server -n argocd
```

---

## 4. Secretos

### 4.1 Respaldar la llave — hacer esto ANTES de cualquier prueba

```bash
bash P9/bootstrap/respaldar-llave.sh
ls -la ~/.sa-p9/llave-sealed-secrets.yaml
```

Ese archivo permite descifrar todos los secretos del repositorio. Guárdelo
con el mismo cuidado que una credencial de producción: fuera del
repositorio, en un gestor de secretos o almacenamiento cifrado.

### 4.2 Verificar que los secretos se descifraron

```bash
kubectl get sealedsecret -n sa-prod
kubectl get secret sa-platform-auth-service-secret -n sa-prod \
  -o jsonpath='{.data.DB_PASSWORD}' | base64 -d | wc -c
```

El último debe devolver un número mayor que cero. **Si devuelve 0, el
Secret existe pero está vacío**, que es peor que si no existiera: los pods
arrancan y fallan al conectarse.

Logs del controlador:

```bash
kubectl logs -n kube-system -l name=sealed-secrets-controller --tail=20
```

Busque `SealedSecret unsealed successfully`. Si dice `no key could decrypt
secret`, la llave restaurada no corresponde a estos secretos.

### 4.3 Si la llave se perdió definitivamente

No hay forma de descifrar los secretos existentes. El camino es
regenerarlos:

```bash
# 1. Dejar que el controlador genere una llave nueva (lo hace el bootstrap).

# 2. Reconstruir los valores en un archivo local.
cat > /tmp/secretos.env <<'EOF'
POSTGRES_DB=sa_platform_db
POSTGRES_USER=appuser
POSTGRES_PASSWORD=<generar con: openssl rand -hex 24>
EOF

# 3. Cifrarlos contra el controlador nuevo.
kubectl create secret generic sa-platform-db-credenciales \
  --namespace sa-prod --from-env-file=/tmp/secretos.env \
  --dry-run=client -o yaml \
| kubeseal --controller-name sealed-secrets-controller \
           --controller-namespace kube-system --format yaml \
> secrets/sealed-secrets-plataforma.yaml

rm /tmp/secretos.env
```

**Advertencia:** si el volumen de PostgreSQL sobrevivió, conserva la
contraseña antigua. Tras regenerar los secretos, aplique el procedimiento
de la sección 3.3.

**Consecuencia adicional:** si esos valores eran credenciales de un sistema
externo, hay que actualizarlas también allí.

---

## 5. Pérdida o drenaje de un nodo

### 5.1 Verificar que hay margen antes de drenar

```bash
kubectl get pdb -n sa-prod
kubectl get pods -n sa-prod -o wide | awk '{print $1, $7}'
```

La columna `ALLOWED DISRUPTIONS` del PDB debe ser al menos 1. Si es 0,
drenar bloqueará el nodo indefinidamente en lugar de completarse.

### 5.2 Drenar

```bash
bash P9/tests/drenaje-nodo.sh http://IP:8080 | tee P9/evidencia/drenaje-nodo.log
```

El script sondea el servicio en bucle mientras drena. **La evidencia que
importa no es que el nodo se drene, sino que ninguna petición falle
mientras ocurre.**

### 5.3 Devolver el nodo al servicio

```bash
kubectl uncordon NOMBRE-DEL-NODO
kubectl get nodes
```

---

## 6. Cuándo escalar

| Situación | Por qué no insistir |
|---|---|
| El bucket del estado no existe | La infraestructura no es reconstruible automáticamente; hay que recrearlo y el estado anterior se perdió |
| El bucket de respaldos no existe | Los datos no son recuperables; el sistema se levanta vacío |
| La llave de Sealed Secrets se perdió y hay credenciales externas | Regenerarlas exige coordinar con los sistemas que las usan |
| Dos reconstrucciones completas fallidas | Repetir una tercera vez rara vez cambia el resultado; el problema está en un supuesto, no en la ejecución |

---

## Anexo: comandos de verificación rápida

```bash
# Estado general
kubectl get applications -n argocd
kubectl get pods -n sa-prod

# El sistema responde
curl -s http://$(kubectl get svc api-gateway-stable -n sa-prod \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}'):8080/health

# Respaldos
velero backup get
velero schedule get

# Contenido de la base de datos
bash P9/tests/verificar-datos.sh

# Resiliencia
kubectl get pdb -n sa-prod
kubectl get pods -n sa-prod -o wide | awk '{print $1, $7}'
```
