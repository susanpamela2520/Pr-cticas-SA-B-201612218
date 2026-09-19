# Práctica 8 — GitOps, entrega progresiva y seguridad de la cadena de suministro

**Curso:** Software Avanzado — 2S 2026 · **Carné:** 201612218 · **Sección:** B

---

## Tabla de enlaces

| Ítem | Enlace o dato |
|---|---|
| Repositorio GitOps | https://github.com/susanpamela2520/Pr-cticas-SA-B-201612218-gitops |
| Aplicación en ArgoCD | `sa-platform-gateway` en el namespace `argocd` — estado `Synced` y `Healthy` |
| Sistema en producción | http://136.111.98.109:8080/health |
| Ejecución exitosa del pipeline | https://github.com/susanpamela2520/Pr-cticas-SA-B-201612218/actions/runs/35426560910 |
| Bloqueo por vulnerabilidad crítica | https://github.com/susanpamela2520/Pr-cticas-SA-B-201612218/actions/runs/35424231424 |
| Pipeline de la versión defectuosa | https://github.com/susanpamela2520/Pr-cticas-SA-B-201612218/actions/runs/35426900000 |
| Pull Requests de promoción | https://github.com/susanpamela2520/Pr-cticas-SA-B-201612218-gitops/pulls?q=is%3Apr |
| Despliegue rechazado por política | `P8/img/12-pod-rechazado.png` |
| Imagen firmada | `ghcr.io/susanpamela2520/pr-cticas-sa-b-201612218/api-gateway:v1.1.9` |
| Reversión del incidente | `P8/img/28-rollout-revertido.png` |

---

## Documentación técnica

### El problema que resuelve

El flujo de la Práctica 7 funcionaba, pero tenía tres debilidades que
ninguna organización acepta en producción:

**El despliegue avanzaba a ciegas.** Un commit defectuoso alcanzaba al
100 % de los usuarios de inmediato. La única validación posterior era la
prueba de humo del pipeline, que corría *después* de que el cambio ya
estaba aplicado.

**El pipeline tenía privilegios de administración del clúster.** Para
desplegar necesitaba permisos amplios sobre Kubernetes Engine, de modo que
comprometer el repositorio equivalía a comprometer la infraestructura.

**Nadie detectaba la deriva de configuración.** Si alguien modificaba algo
a mano en el clúster, el estado real dejaba de corresponder al declarado y
no había mecanismo que lo notara.

### Cómo se resuelve cada una

| Debilidad | Mecanismo | Resultado |
|---|---|---|
| Despliegue a ciegas | Argo Rollouts con canary de 3 pasos y análisis en cada uno | Un defecto afecta como máximo al 20 % del tráfico antes de revertirse |
| Pipeline con privilegios | El pipeline solo abre un Pull Request; ArgoCD aplica | Comprometer el repositorio de código no otorga acceso al clúster |
| Deriva no detectada | ArgoCD con `selfHeal: true` | Cualquier cambio manual se revierte automáticamente |

### Arquitectura del flujo

El recorrido completo está en [DIAGRAMA.md](DIAGRAMA.md). En resumen:

```
tag v1.0.1 en el repo de código
   ↓
Pipeline: helm lint → Trivy → build → SBOM → firma Cosign → verificar firma
   ↓
Pull Request automático en el repo GitOps (cambia UNA línea: la etiqueta)
   ↓
Aprobación humana del PR
   ↓
ArgoCD detecta el cambio en main
   ↓
Argo Rollouts: canary 20 % → 50 % → 100 %, con análisis en cada paso
   ↓
   ├── análisis OK ........... promoción completa
   └── análisis falla ........ reversión automática al estable
```

**El punto clave:** el pipeline termina en el Pull Request. No posee
credenciales del clúster y no puede aplicar nada. ArgoCD es el único
componente con capacidad de escritura sobre las cargas de trabajo.

### Separación de repositorios

| Repositorio | Contiene | Quién escribe |
|---|---|---|
| Código | Servicios, Dockerfiles, charts, workflows, pruebas | Desarrolladores |
| GitOps | Manifiestos declarativos, políticas, rollouts | El pipeline, mediante PR |

La separación no es burocracia: permite que el historial de despliegues sea
independiente del de desarrollo. El repositorio GitOps responde a *qué está
corriendo ahora y desde cuándo*, y esa pregunta se contesta con
`git log`, sin consultar el clúster.

### Frontera entre Terraform y ArgoCD

Una decisión que conviene explicitar, porque ambos son declarativos y
podría parecer redundante:

- **Terraform** administra lo que se crea una vez y cambia rara vez:
  namespaces, cuotas, límites y RBAC. Lo ejecuta un operador desde su
  máquina.
- **ArgoCD** administra lo que cambia en cada despliegue: deployments,
  rollouts, servicios, políticas.

Si ArgoCD creara los namespaces, se perderían las etiquetas que Kyverno usa
para decidir dónde bloquear y dónde solo auditar. Por eso la Application
lleva `CreateNamespace=false`.

### Umbrales de validación y su justificación

Los umbrales del `AnalysisTemplate` se derivan de la línea base medida con
k6 en la Práctica 6 (26.427 peticiones, 100 usuarios concurrentes):

| Métrica | Línea base P6 | Umbral P8 | Razonamiento |
|---|---|---|---|
| Tasa de error | 0,01 % | ≥ 99 % de éxito | Pasar de 0,01 % a 1 % es un aumento de cien veces: es una regresión, no ruido |
| Latencia p95 | 222 ms | ≤ 500 ms | Poco más del doble; el canary comparte nodos con el estable, así que algo de contención es esperable |
| Disponibilidad | — | 200 obligatorio | Comprobación binaria, `failureLimit: 0`: si `/health` no responde, nada más importa |

Con `failureLimit: 2` sobre intervalos de 30 segundos, una versión
defectuosa se revierte en aproximadamente un minuto.

### Seguridad de la cadena de suministro

Cuatro controles, en orden de ejecución:

**1. Trivy bloquea CVE críticas.** Se usa `ignore-unfixed: true`: una
vulnerabilidad crítica sin parche disponible no se arregla bloqueando el
pipeline, y tratarla como bloqueante solo enseña al equipo a ignorar la
alerta.

**2. SBOM en formato CycloneDX.** Inventario de todo lo que contiene la
imagen. Cuando aparezca la próxima CVE de una librería, el SBOM responde en
segundos si el sistema está afectado.

**3. Firma con Cosign, sin llaves.** La identidad es el token OIDC del
workflow, no una llave privada guardada en un secreto: no hay nada que
rotar ni que se pueda filtrar, y la firma queda registrada de forma pública
y auditable en el log de transparencia de Sigstore.

**4. Verificación independiente.** Un job aparte comprueba la firma como lo
haría un tercero, validando **quién** firmó y **desde dónde**:

```
cosign verify \
  --certificate-identity-regexp "https://github.com/<repo>/.github/workflows/.*" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
```

Sin esas dos condiciones, cualquier firma válida pasaría — incluida la de
un atacante con su propia identidad de Sigstore.

### Políticas de admisión

| Política | Qué previene |
|---|---|
| `disallow-latest-tag` | Una etiqueta móvil hace que el repositorio deje de describir el estado real del sistema |
| `require-resource-limits` | Sin requests el HPA no puede calcular el uso; sin limits un contenedor puede agotar el nodo |
| `require-run-as-nonroot` | Un contenedor root que escapa del aislamiento obtiene root en el **nodo**, no solo en el contenedor |

Se aplican en modo `Enforce` únicamente en el namespace etiquetado
`sa-platform/aplicar-politicas: bloquear` (producción). En staging solo
auditan, para detectar problemas sin frenar la iteración.

### Gestión de secretos

Sealed Secrets usa criptografía asimétrica: el controlador genera un par de
llaves dentro del clúster y **la privada nunca sale de ahí**. Eso hace que
el archivo cifrado sea seguro de versionar en un repositorio público — solo
el controlador puede descifrarlo.

El procedimiento completo está en
[`secrets/README.md`](https://github.com/susanpamela2520/Pr-cticas-SA-B-201612218-gitops/blob/main/secrets/README.md)
del repositorio GitOps.

---

## Estructura de archivos

### Repositorio de código (`/P8`)

```
P8/
├── README.md                    Este documento
├── DIAGRAMA.md                  Flujo del commit al clúster
├── INFORME-INCIDENTE.md         Análisis del fallo inducido
├── PREGUNTAS-TEORICAS.md        Respuestas conceptuales
├── charts/
│   ├── values-staging.yaml      Valores del ambiente de staging
│   └── values-prod.yaml         Valores del ambiente de producción
├── terraform/
│   ├── main.tf                  Namespaces, cuotas, límites, RBAC
│   ├── variables.tf
│   └── outputs.tf
├── tests/
│   ├── smoke/humo.sh            Endpoints críticos
│   ├── integration/integracion.sh   Flujo funcional completo
│   └── load/carga-canary.js     Prueba de carga con umbrales
└── docs/
    └── 01-puesta-en-marcha.md   Guía paso a paso

.github/workflows/
└── p8-supply-chain.yml          Pipeline de 5 fases
```

### Repositorio GitOps (independiente)

```
apps/
├── api-gateway.yaml             Application de ArgoCD
└── politicas.yaml               Application de las políticas
rollouts/
├── api-gateway-rollout.yaml     Rollout canary de 3 pasos
├── analysis-template.yaml       Puerta de calidad
└── services.yaml                Servicios stable y canary
policies/
├── 01-disallow-latest.yaml
├── 02-require-resources.yaml
├── 03-require-nonroot.yaml
└── pod-de-prueba-rechazado.yaml Pod no conforme, para evidenciar el rechazo
secrets/
└── README.md                    Procedimiento con Sealed Secrets
```

---

## Puesta en marcha

Ver [docs/01-puesta-en-marcha.md](docs/01-puesta-en-marcha.md): creación del
clúster, instalación de ArgoCD, Argo Rollouts, Kyverno y Sealed Secrets,
aplicación de Terraform y demostración del fallo inducido.
