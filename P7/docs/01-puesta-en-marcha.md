# Puesta en marcha del pipeline — paso a paso

Sigue esto en orden. Cada bloque asume que el anterior terminó bien.

---

## Paso 0 — Cerrar la Práctica 6 (antes que nada)

El clúster de la P6 sigue existiendo y sigue generando costo. La evidencia
de eliminación es requisito obligatorio de esa práctica, así que primero
se cierra la P6 y después se levanta la infraestructura de la P7.

```powershell
cd P5\charts
helm uninstall sa-platform -n sa-p5
kubectl delete pvc --all -n sa-p5
gcloud compute forwarding-rules list
gcloud compute addresses list
gcloud container clusters delete sa-p6-cluster --zone us-central1-a
gcloud container clusters list
```

**Captura de evidencia P6:** la última línea debe devolver una lista vacía.

---

## Paso 1 — Recrear el clúster para la P7

Mismo comando que en la P6, pero **con Dataplane V2 desde el inicio** para
no repetir la corrección de NetworkPolicy que tuvimos que hacer a medias.

```powershell
gcloud container clusters create sa-p6-cluster `
  --zone=us-central1-a `
  --num-nodes=3 `
  --machine-type=e2-standard-2 `
  --disk-size=30 `
  --enable-ip-alias `
  --enable-dataplane-v2
```

Tarda 5-8 minutos. Al terminar, verifica:

```powershell
gcloud container clusters describe sa-p6-cluster --zone us-central1-a `
  --format="value(networkPolicy.enabled)"
kubectl get nodes
```

> El nombre del clúster se conserva a propósito: así el workflow no
> necesita cambios y la documentación de la P6 sigue siendo válida.

---

## Paso 2 — Crear la cuenta de servicio para GitHub Actions

El pipeline necesita credenciales propias para hablar con GKE. **No se usa
tu cuenta personal**: se crea una identidad dedicada con los permisos
mínimos, que es la práctica correcta y además es defendible en la
evaluación.

```powershell
# 2.1 Crear la cuenta de servicio
gcloud iam service-accounts create github-actions-deploy `
  --display-name="Despliegue automatico desde GitHub Actions"

# 2.2 Guardar su correo en una variable
$SA = "github-actions-deploy@p6-sa2s2026.iam.gserviceaccount.com"

# 2.3 Permiso para operar sobre el cluster
gcloud projects add-iam-policy-binding p6-sa2s2026 `
  --member="serviceAccount:$SA" `
  --role="roles/container.developer"

# 2.4 Generar la llave en formato JSON
gcloud iam service-accounts keys create $env:TEMP\gcp-key.json `
  --iam-account=$SA
```

> `roles/container.developer` permite desplegar cargas de trabajo pero
> **no** crear ni borrar clústeres. Es el mínimo necesario.

⚠️ El archivo `gcp-key.json` es una credencial real. **Nunca lo subas al
repositorio.** Se copia a GitHub Secrets y se borra del disco.

---

## Paso 3 — Cargar los secretos en GitHub

En tu repositorio: **Settings → Secrets and variables → Actions →
New repository secret**.

### Secreto 1: `GCP_SA_KEY`

```powershell
Get-Content $env:TEMP\gcp-key.json -Raw | Set-Clipboard
```

Pega el contenido completo (el JSON entero, incluidas las llaves `{}`).

Después **borra el archivo local**:
```powershell
Remove-Item $env:TEMP\gcp-key.json
```

### Secreto 2: `HELM_VALUES_SECRETS`

```powershell
Get-Content P5\charts\values-secrets.yaml -Raw | Set-Clipboard
```

Pega el contenido tal cual, respetando la indentación del YAML.

> Estos dos secretos son la razón por la que el pipeline puede desplegar
> sin que ninguna credencial viva en el repositorio. GitHub los enmascara
> automáticamente en los logs.

---

## Paso 4 — Copiar los archivos de la P7 al repositorio

Descomprime el zip en la **raíz del repositorio**, de modo que quede:

```
Pr-cticas-SA-B-201612218/
├── .github/
│   └── workflows/
│       └── ci-cd.yml
├── P1/ ... P6/
└── P7/
    ├── README.md
    ├── PREGUNTAS-TEORICAS.md
    ├── DIAGRAMA.md
    ├── values-ci.yaml
    ├── docs/
    │   └── 01-puesta-en-marcha.md
    └── tests/
        └── test_manifiestos.py
```

La carpeta `.github` va en la raíz, **no** dentro de `P7`. GitHub solo
busca workflows en esa ubicación.

---

## Paso 5 — Probar las pruebas localmente (antes de hacer push)

Vale la pena verificar que el chart renderiza y las pruebas pasan en tu
máquina; así no gastas ejecuciones de Actions depurando lo obvio.

```powershell
cd P5\charts
helm dependency update

helm template sa-platform . `
  -f values.yaml `
  -f ..\..\P6\values-gke.yaml `
  -f ..\..\P7\values-ci.yaml `
  -n sa-p5 > $env:TEMP\manifiestos.yaml

cd ..\..
pip install pytest pyyaml
$env:MANIFIESTOS = "$env:TEMP\manifiestos.yaml"
pytest P7\tests -v
```

**Si alguna prueba falla, es un hallazgo real, no un falso positivo.** Las
pruebas de red y de Service reproducen exactamente los errores que
encontramos en la P6; si vuelven a fallar es porque el chart perdió alguna
de esas correcciones.

---

## Paso 6 — Primera ejecución (rama de prueba)

Conviene estrenar el pipeline en un Pull Request: así se ejecutan las
etapas 1 y 2 sin publicar ni desplegar nada.

```powershell
git checkout -b feature/cicd
git add .github P7
git commit -m "P7: pipeline de CI/CD con GitHub Actions"
git push -u origin feature/cicd
```

En GitHub: **Compare & pull request**. Se dispararán solo las etapas de
prueba y validación.

**Captura de evidencia:** la vista de Actions mostrando los jobs en verde.

---

## Paso 7 — Publicación y despliegue (merge a main)

Al aprobar y hacer merge del PR, se ejecuta el ciclo completo: las cuatro
etapas, incluida la publicación en GHCR y el despliegue a GKE.

```powershell
git checkout main
git merge feature/cicd
git push
```

---

## Paso 8 — Hacer públicas las imágenes de GHCR ⚠️

**Este paso se olvida y hace fallar el despliegue.** GHCR publica los
paquetes como **privados** la primera vez. Un clúster de GKE no tiene
credenciales de GitHub, así que no podrá descargarlos y los pods quedarán
en `ImagePullBackOff` — exactamente el mismo síntoma que el incidente 3
de la P6, con otra causa.

Además, la rúbrica pide explícitamente un **registry público**.

Después del primer push exitoso, para **cada uno de los 6 paquetes**:

1. Ve a tu perfil de GitHub → pestaña **Packages**
2. Entra al paquete (por ejemplo `.../auth-service`)
3. **Package settings** → sección **Danger Zone**
4. **Change visibility** → **Public** → confirma escribiendo el nombre

Repítelo con los seis. Después vuelve a lanzar el workflow desde
**Actions → Re-run all jobs**.

---

## Paso 9 — Probar el disparo por versión

Es la evidencia del criterio "Versionamiento" (10 pts):

```powershell
git tag -a v1.0.0 -m "Primera version desplegada por el pipeline"
git push origin v1.0.0
```

Esto dispara una ejecución que etiqueta las imágenes con `1.0.0` y `1.0`
además del SHA, y vuelve a desplegar.

**Captura de evidencia:** la vista de Packages mostrando las etiquetas
`1.0.0`, `1.0`, `latest` y `sha-xxxxxxx` sobre la misma imagen.

---

## Paso 10 — Demostrar el ciclo completo

La evidencia más contundente para la defensa: un cambio trivial que
recorre todo el pipeline sin intervención manual.

1. Edita un texto visible (por ejemplo el mensaje de `/health`)
2. `git commit` y `git push` a `main`
3. Observa las cuatro etapas en Actions
4. Cuando termine, consulta la IP pública y comprueba el cambio

**Captura de evidencia:** el commit, el pipeline en verde y la respuesta
del servicio ya con el texto nuevo.

---

## Al terminar la práctica

```powershell
helm uninstall sa-platform -n sa-p5
kubectl delete pvc --all -n sa-p5
gcloud container clusters delete sa-p6-cluster --zone us-central1-a
```

Las imágenes de GHCR no generan costo y sirven como evidencia
permanente, así que pueden quedarse.

---

## Solución de problemas frecuentes

| Síntoma en Actions | Causa probable | Solución |
|---|---|---|
| `denied: permission_denied` al publicar | Falta el permiso `packages: write` | Ya está en el workflow; revisa Settings → Actions → Workflow permissions |
| `ImagePullBackOff` en el despliegue | Los paquetes de GHCR siguen privados | Paso 8 |
| `could not find default credentials` | Falta o está mal el secreto `GCP_SA_KEY` | Repite el paso 3 pegando el JSON completo |
| `cluster not found` | El clúster no existe o cambió de nombre | Paso 1, o ajusta `CLUSTER` y `ZONA` en el workflow |
| `Error: execution error at ... nil pointer` en helm template | Falta algún valor obligatorio | Agrégalo a `P7/values-ci.yaml` |
| El job de despliegue no aparece | Estás en un Pull Request | Es el comportamiento esperado; solo corre en `main` o en tags |
| `no matches for kind` o timeout en `--wait` | Los pods no llegan a Ready en 10 min | Revisa `kubectl get pods -n sa-p5` y los logs del pod que falla |
