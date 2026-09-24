# Evidencias — Práctica 8: GitOps, entrega progresiva y cadena de suministro

**Curso:** Software Avanzado — 2S 2026 · **Carné:** 201612218 · **Sección:** B

**Repositorio de código:** https://github.com/susanpamela2520/Pr-cticas-SA-B-201612218
**Repositorio GitOps:** https://github.com/susanpamela2520/Pr-cticas-SA-B-201612218-gitops
**Clúster:** `sa-p8-cluster` (GKE, `us-central1-a`)
**Sistema en producción:** http://136.114.139.211:8080/health

---

## Resumen

La plataforma de tickets se migró de un modelo de despliegue por *push*
(Práctica 7) a un modelo GitOps: el pipeline perdió todo acceso al clúster y
su capacidad máxima es abrir un Pull Request en un repositorio de
manifiestos independiente. ArgoCD es el único componente con permiso de
escritura sobre las cargas de trabajo, y Argo Rollouts gobierna la
promoción mediante un canary de tres pasos condicionado a análisis
automático.

Se añadieron cuatro controles de cadena de suministro —análisis de CVE,
SBOM, firma sin llaves y verificación independiente— y tres políticas de
admisión que se evalúan dentro del clúster, no solo en el pipeline.

---

## 1. Infraestructura declarativa (Terraform)

### 1.1 Namespaces, cuotas y límites
**Archivo:** `05-namespaces-cuotas.png`

Salida de `kubectl get namespaces --show-labels` y `get resourcequota -A`.
Se crearon dos ambientes, `sa-staging` y `sa-prod`, cada uno con su
`ResourceQuota` y `LimitRange`.

La etiqueta `sa-platform/aplicar-politicas` es la que decide el modo de
Kyverno: `bloquear` en producción, `auditar` en staging. Por eso la
Application de ArgoCD lleva `CreateNamespace=false` — si ArgoCD creara los
namespaces, esa etiqueta se perdería y las políticas dejarían de aplicarse
donde deben.

### 1.2 RBAC con mínimo privilegio
**Archivo:** `06-rbac.png`

Salida de `kubectl get role,rolebinding -n sa-prod`. Tres identidades con
alcances distintos:

| Identidad | Permisos | Propósito |
|---|---|---|
| `argocd-aplicador` | escritura sobre cargas de trabajo | única identidad que despliega |
| `pipeline-lector` | solo `get`, `list`, `watch` | el pipeline ya no despliega |
| `analisis-rollouts` | jobs y logs | ejecuta los AnalysisRun del canary |

La segunda es el cambio conceptual de la práctica. En la P7 el pipeline
tenía permisos de administración del clúster: comprometer el repositorio
equivalía a comprometer la infraestructura. Aquí no puede modificar nada.

---

## 2. GitOps con ArgoCD

### 2.1 Aplicaciones sincronizadas y sanas
**Archivo:** `08-argocd-synced-healthy.png`

Las dos Applications en estado `Synced` y `Healthy`:

| Aplicación | Namespace | Ruta del repositorio |
|---|---|---|
| `sa-platform-gateway` | `sa-prod` | `rollouts/` |
| `sa-platform-politicas` | `kyverno` | `policies/` |

Ambas con `prune: true` y `selfHeal: true`: cualquier cambio manual hecho
con kubectl se revierte automáticamente. El repositorio no es la fuente de
verdad por convención, sino porque el sistema lo impone.

### 2.2 Árbol de recursos
**Archivo:** `09-argocd-arbol-recursos.png`

Recursos que ArgoCD administra a partir de la carpeta `rollouts/`: el
Rollout, los Services `api-gateway-stable` y `api-gateway-canary`, el
ConfigMap, el SealedSecret, el AnalysisTemplate y los pods.

### 2.3 Historial de sincronizaciones
**Archivo:** `10-argocd-historial.png`

Registro de cada sincronización con su revisión de Git. Permite responder
"qué está corriendo y desde cuándo" sin consultar el clúster.

---

## 3. Políticas de admisión (Kyverno)

### 3.1 Despliegue rechazado por política
**Archivo:** `12-pod-rechazado.png`

Rechazo real del webhook de admisión:

```
admission webhook "validate.kyverno.svc-fail" denied the request:
resource Pod/sa-prod/api-gateway-... was blocked due to the following policies
require-run-as-nonroot:
  prohibe-escalada-de-privilegios: 'validation error: ...'
```

**Contexto del hallazgo:** este rechazo no se provocó con un pod de prueba,
sino que apareció durante un despliegue legítimo. Al investigarlo se
encontró que la regla comparaba contra la cadena `"false"` mientras el
manifiesto declaraba el booleano `false`; Kyverno los trata como valores
distintos y rechazaba un pod que sí cumplía el requisito de seguridad.

**Decisión operativa:** la regla se pasó a modo `Audit` para no bloquear
despliegues conformes mientras se corrige el patrón. Las otras dos
políticas permanecen en `Enforce`.

| Política | Modo | Qué previene |
|---|---|---|
| `disallow-latest-tag` | Enforce | Una etiqueta móvil hace que el repositorio deje de describir el estado real |
| `require-resource-limits` | Enforce | Sin requests el HPA no calcula uso; sin limits un contenedor agota el nodo |
| `require-run-as-nonroot` | Audit | Root en el contenedor es root en el nodo si hay escape |

**Por qué en el clúster y no solo en el pipeline:** el pipeline valida lo
que pasa por él; la política valida todo lo que intenta entrar. Un
`kubectl apply` manual no pasa por el pipeline, pero sí por el webhook.

---

## 4. Pipeline de cadena de suministro

### 4.1 Ejecución completa
**Archivo:** `13-pipeline-completo.png`
**Enlace:** https://github.com/susanpamela2520/Pr-cticas-SA-B-201612218/actions/runs/35426560910

Las cinco fases en verde: validación de charts, análisis de CVE,
construcción con SBOM y firma, verificación independiente y apertura del
Pull Request.

El workflow **no contiene ninguna herramienta de despliegue ni credenciales
de Kubernetes**. Termina en el PR; ArgoCD aplica.

### 4.2 Análisis de vulnerabilidades
**Archivo:** `14-trivy-reporte.png`

Reporte de Trivy sin vulnerabilidades críticas. Se usa
`ignore-unfixed: true`: una CVE crítica sin parche disponible no se arregla
bloqueando el pipeline, y tratarla como bloqueante solo enseña al equipo a
ignorar la alerta.

### 4.3 Bloqueo por vulnerabilidad crítica
**Enlace:** https://github.com/susanpamela2520/Pr-cticas-SA-B-201612218/actions/runs/35424231424

Ejecución detenida en la fase 2 por `CVE-2026-59873` (node-tar 6.2.1,
denegación de servicio por gzip bomb, corregida en 7.5.19).

**Diagnóstico:** la vulnerabilidad no estaba en las dependencias de la
aplicación —`app/node_modules` reportó 0 hallazgos en sus ~100 paquetes—
sino en el `tar` que npm trae empaquetado dentro de la imagen base de Node,
en `/usr/local/lib/node_modules/npm/`.

**Solución adoptada:** en lugar de documentar una excepción, se eliminaron
npm, npx, corepack y yarn de la etapa final del Dockerfile. Son
herramientas de construcción; el contenedor arranca con `node` y nunca las
invoca en ejecución.

**Resultado medido:** la CVE desapareció y la imagen pasó de 141 MB a
49.7 MB. Se resolvió la causa en lugar de silenciar la alerta, y además se
redujo la superficie de ataque.

### 4.4 SBOM
**Archivo:** `15-sbom-generado.png`

Inventario en formato CycloneDX generado con `anchore/sbom-action` y
adjuntado a la imagen como atestación.

El análisis de CVE responde "¿tiene vulnerabilidades conocidas hoy?"; el
SBOM responde "¿qué contiene exactamente esta imagen?". La diferencia
importa cuando aparece una CVE nueva: con el inventario, la pregunta
"¿estamos afectados?" se contesta con una búsqueda.

### 4.5 Firma de la imagen
**Archivo:** `16-cosign-firma.png`

Firma *keyless* con Cosign. La identidad es el token OIDC del workflow, no
una llave privada guardada en un secreto: no hay nada que rotar ni que se
pueda filtrar, y la firma queda registrada en el log de transparencia
público de Sigstore.

### 4.6 Verificación independiente
**Archivo:** `17-cosign-verificacion.png`

Job aparte que comprueba la firma como lo haría un tercero, validando
**quién** firmó y **desde dónde**:

```
cosign verify \
  --certificate-identity-regexp "https://github.com/<repo>/.github/workflows/.*" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
```

Sin esas dos condiciones cualquier firma válida pasaría, incluida la de un
atacante con su propia identidad de Sigstore. Comprobar que *hay* firma no
es lo mismo que comprobar *de quién* es.

### 4.7 Pull Request automático
**Archivo:** `18-pr-automatico.png`

PR abierto por el pipeline en el repositorio GitOps, modificando una sola
línea: la etiqueta de la imagen. Para que llegue al clúster hace falta
aprobación humana; después, ArgoCD lo aplica.

---

## 5. Entrega progresiva

### 5.1 Canary en el primer paso
**Archivo:** `20-rollout-paso-20.png`

Rollout con `SetWeight: 20` y un solo pod de la versión candidata, mientras
los estables siguen sirviendo el resto del tráfico.

Sin enrutador de tráfico, el reparto se hace por número de réplicas: la
granularidad mínima es un pod, y el peso real depende de cuántos estén en
estado `Ready`.

### 5.2 Análisis automático en ejecución
**Archivo:** `23-analysisrun-exitoso.png`

AnalysisRun con sus tres métricas ejecutándose contra el servicio canary:

| Métrica | Umbral | `failureLimit` | Línea base (P6) |
|---|---|---|---|
| `disponibilidad` | HTTP 200 obligatorio | 0 | — |
| `tasa-de-exito` | ≥ 99 % de 100 peticiones | 2 | 0,01 % de error |
| `latencia-p95` | ≤ 500 ms | 2 | 222 ms |

Los umbrales se derivan de la prueba con k6 de la Práctica 6 (26 427
peticiones, 100 usuarios concurrentes). El razonamiento: un umbral solo
sirve si distingue una regresión de una fluctuación. Pasar de 0,01 % a 1 %
de error es un aumento de cien veces, no ruido; 500 ms es poco más del
doble de la base, lo que tolera la contención esperable de dos versiones
compartiendo nodos.

La métrica de disponibilidad es la excepción deliberada: con
`failureLimit: 0` revierte al primer fallo, porque un `/health` que
devuelve 500 no admite interpretación.

### 5.3 Promoción completa
**Archivo:** `22-rollout-promovido.png`

Rollout en estado `Healthy` con todas las réplicas en la versión promovida
y la revisión anterior en `ScaledDown`.

### 5.4 Estado final del sistema
**Archivo:** `4pods.png`

Cuatro pods `Running` y `Ready` sirviendo tráfico en producción.

---

## 6. Incidente: fallo inducido

### 6.1 Publicación de la versión defectuosa
**Archivo:** `24-version-defectuosa.png`

Se modificó el manejador de `/health` del api-gateway para devolver
HTTP 500 y se publicó como `v1.2.0`. El pipeline completó sus cinco fases
—el defecto es lógico, no una vulnerabilidad— y abrió el PR de promoción.

### 6.2 Detección y contención
**Archivo:** `25-rollout-degraded.png`

El pod canary quedó en `CrashLoopBackOff` con `ready:0/1`. El Rollout pasó
a `Degraded` con `ProgressDeadlineExceeded` sin promover la versión.

**Qué lo detectó:** el `readinessProbe`, configurado como `httpGet` contra
`/health` cada 5 segundos. El pod nunca alcanzó estado `Ready`.

**Tráfico afectado: 0 %.** Los pods estables sirvieron el 100 % de las
peticiones durante todo el incidente. El sistema permaneció disponible en
su IP pública sin interrupción.

**Observación sobre el mecanismo:** la contención la ejecutó la sonda de
Kubernetes, no el AnalysisTemplate. Argo Rollouts solo dirige tráfico a
pods en estado `Ready`, de modo que el análisis del canary nunca llegó a
ejecutarse sobre la versión defectuosa.

Esto revela un solapamiento de responsabilidades en el diseño original: el
`readinessProbe` y la métrica `disponibilidad` validaban exactamente lo
mismo. La sonda, al actuar primero, impidió que el análisis demostrara su
función.

**Corrección aplicada:** las sondas se cambiaron a `tcpSocket`, de modo que
Kubernetes comprueba que el proceso acepta conexiones y el
AnalysisTemplate comprueba que la respuesta es correcta. Son
responsabilidades distintas y confundirlas dejó el rollout detenido en
`Degraded` en lugar de revertido.

### 6.3 Restauración
**Archivo:** `4pods.png` (estado posterior)

Reversión con `kubectl argo rollouts undo --to-revision`, seguida de la
actualización del repositorio GitOps a la versión estable para que el
estado declarado coincidiera con el real y ArgoCD no reintrodujera la
versión defectuosa por `selfHeal`.

---

## 7. Sistema en producción

**Archivo:** `33-sistema-publico.png`

Respuesta desde internet a `http://136.114.139.211:8080/health`:

```json
{"status":"ok","servicio":"api-gateway"}
```

Petición real desde una máquina externa a una IP pública de Google Cloud,
sin port-forward ni túnel.

---

## 8. Gestión de secretos

Ningún secreto en texto plano existe en el repositorio GitOps, que es
público. Sealed Secrets usa criptografía asimétrica: el controlador genera
un par de llaves dentro del clúster y la privada nunca sale de ahí, por lo
que el archivo cifrado es seguro de versionar.

```
secretos.env (local)
      ↓  kubectl create secret --dry-run=client | kubeseal
sealed-secrets.yaml (cifrado, se versiona)
      ↓  ArgoCD lo aplica
el controlador lo descifra con su llave privada
      ↓
Secret de Kubernetes (existe solo en el clúster)
```

El `--dry-run=client` es el detalle que importa: el Secret se construye
localmente sin enviarlo al clúster, se cifra, y solo la versión cifrada
toca el disco.

**Hallazgo durante la implementación:** se detectó que el archivo
`values-secrets.yaml` de prácticas anteriores había sido versionado en el
repositorio de código. Los valores se consideraron comprometidos y **no se
reutilizaron**: el Secret de la P8 se generó con valores nuevos, y el
archivo se retiró del seguimiento de Git junto con la actualización del
`.gitignore`.

---

## 9. Problemas diagnosticados y resueltos

| # | Síntoma | Causa raíz | Solución |
|---|---|---|---|
| 1 | Trivy bloqueaba por CVE crítica | node-tar 6.2.1 dentro de npm en la imagen base, no en las dependencias propias | Eliminar npm, yarn y corepack de la etapa final (imagen: 141 MB → 49.7 MB) |
| 2 | La fase 5 fallaba con el `sed` correcto | `git diff --quiet` devuelve 1 cuando hay cambios, y era la última instrucción del script | Comprobación explícita con `if` y salida en 0 |
| 3 | La corrección no surtía efecto | Los runs por tag usan el workflow congelado en ese commit | Tag nuevo sobre el `main` corregido |
| 4 | Rollout en `Degraded` sin desplegar | `scaleDownDelaySeconds` requiere un enrutador de tráfico | Retirar el campo: el canary básico reparte por réplicas |
| 5 | Pods en `CreateContainerConfigError` | El Secret cifrado no existía en el namespace | Generar y aplicar el SealedSecret |
| 6 | ArgoCD en `Unknown` | Error de indentación en el YAML del Rollout; el manifiesto quedó cacheado | Corregir el YAML y forzar refresh duro |
| 7 | Pods rechazados por Kyverno | La regla comparaba `"false"` (cadena) con `false` (booleano) | Regla a modo `Audit` mientras se corrige el patrón |
| 8 | El análisis nunca corría sobre el canary | `readinessProbe` y métrica `disponibilidad` validaban lo mismo; la sonda actuaba primero | Sondas a `tcpSocket`: Kubernetes valida conectividad, el análisis valida semántica |

---

## 10. Límites conocidos de la implementación

Presentar el flujo como completo sería inexacto. Lo que no cubre:

**El canary no valida lógica de negocio.** El análisis comprueba que
`/health` responda 200 y que la latencia esté en rango. Una versión que
devolviera 200 con datos equivocados pasaría la promoción.

**No hay verificación de firma en la admisión.** El pipeline verifica la
firma antes de proponer el despliegue, pero el clúster no la comprueba al
admitir el pod. Una política `verifyImages` de Kyverno cerraría ese hueco.

**El análisis usa sondas propias, no métricas del sistema.** Los jobs de
`curl` miden lo que ellos mismos generan. Un análisis basado en Prometheus
mediría el tráfico real de los usuarios, que es mejor señal.

**La aprobación del PR es el único control humano**, y un PR automático con
todos sus checks en verde tiende a aprobarse sin leer. El control existe
formalmente; su eficacia depende de la disciplina del equipo.
