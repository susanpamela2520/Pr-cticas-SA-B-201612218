# Runbook de recuperación

**Para quién es:** alguien que no construyó este sistema y no puede
consultar a quien lo hizo.

**Qué asume:** acceso a Google Cloud con permisos de administrador del
proyecto, y las herramientas de la sección 0 instaladas.

**Qué NO asume:** conocimiento previo del sistema.

---

## 0. Antes de empezar

Herramientas necesarias:

```bash
gcloud version && terraform version && kubectl version --client && velero version --client-only
```

Datos que necesita tener a mano:

| Dato | Dónde obtenerlo |
|---|---|
| Identificador del proyecto de GCP | Consola de Google Cloud |
| Bucket del estado de Terraform | `P9/terraform/backend.tf` |
| Bucket de respaldos | `P9/terraform/terraform.tfvars` |
| Respaldo de la llave de Sealed Secrets | Gestor de secretos (no está en el repositorio) |

**Si no tiene el respaldo de la llave, deténgase aquí y lea la sección 4**
antes de reconstruir: los secretos no se podrán descifrar y los pods no
arrancarán.

---

## 1. Reconstrucción completa

```bash
git clone https://github.com/susanpamela2520/Pr-cticas-SA-B-201612218
cd Pr-cticas-SA-B-201612218
cp P9/terraform/terraform.tfvars.ejemplo P9/terraform/terraform.tfvars
# Complete los valores del archivo antes de continuar.

bash P9/bootstrap/bootstrap.sh | tee P9/evidencia/reconstruccion.log
```

**Verificación:** el script termina listando las Applications. Todas deben
decir `Synced` y `Healthy`. Si alguna queda en `Progressing` más de diez
minutos, vaya a la sección 5.

**Tiempo esperado:** PENDIENTE (complete tras la prueba cronometrada).

---

## 2. Restauración de datos

Listar los respaldos disponibles:

```bash
velero backup get
```

Restaurar el más reciente:

```bash
velero restore create --from-backup NOMBRE-DEL-RESPALDO
velero restore logs NOMBRE-DE-LA-RESTAURACION
```

**Verificación — este paso no es opcional:**

```bash
bash P9/tests/verificar-datos.sh
```

Debe mostrar conteos mayores a cero. Un PVC restaurado que existe pero está
vacío es un respaldo que falló sin avisar.

---

## 3. Si el sistema no responde tras reconstruir

```bash
kubectl get applications -n argocd
kubectl get pods -n sa-prod
```

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Pods en `CreateContainerConfigError` | El Secret no se descifró | Sección 4 |
| Pods en `Pending` | Cuota o capacidad del clúster | `kubectl describe pod` y revisar eventos |
| Application en `Unknown` | Error de sintaxis en el repositorio | `kubectl get app NOMBRE -n argocd -o jsonpath='{.status.conditions}'` |
| Pods rechazados en la admisión | Kyverno bloqueando | `kubectl describe rs` y leer el mensaje del webhook |

---

## 4. Secretos: qué hacer si la llave se perdió

Los secretos del repositorio están cifrados con una llave que vive en el
clúster. Si se perdió y no hay respaldo, **no hay forma de descifrarlos**:
no es un problema de procedimiento, es criptografía.

El camino es regenerarlos:

1. Instalar el controlador (lo hace el bootstrap) y dejar que genere una
   llave nueva.
2. Reconstruir el archivo `secretos.env` con valores nuevos.
3. Volver a cifrarlo:

```bash
kubectl create secret generic sa-platform-secretos \
  --namespace sa-prod --from-env-file=secretos.env \
  --dry-run=client -o yaml \
  | kubeseal --controller-name sealed-secrets-controller \
             --controller-namespace kube-system --format yaml \
  > rollouts/sealed-secrets.yaml
rm secretos.env
```

4. Subirlo al repositorio GitOps y sincronizar.

**Consecuencia:** si esos valores eran credenciales de un sistema externo,
hay que actualizarlas también allí.

---

## 5. Contactos y escalamiento

| Situación | Acción |
|---|---|
| El bucket del estado no existe | La infraestructura no es reconstruible automáticamente; ver `P9/terraform/backend.tf` |
| El bucket de respaldos no existe | Los datos no son recuperables; el sistema se levanta vacío |
| Reconstrucción completa sin éxito tras dos intentos | Escalar; no repetir indefinidamente |
