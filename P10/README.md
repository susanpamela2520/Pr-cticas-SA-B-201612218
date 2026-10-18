# Práctica 10 — Observabilidad y operación (del síntoma a la causa)

**Curso:** Software Avanzado — 2S 2026 · **Carné:** 201612218 · **Sección:** B

---

## Tabla de enlaces

> Reemplaza cada `PENDIENTE` por el dato real antes de entregar. Un enlace
> ausente o que pida autenticación se califica con cero en su criterio.

| Ítem | Enlace o dato |
|---|---|
| Repositorio de código | https://github.com/susanpamela2520/Pr-cticas-SA-B-201612218 |
| Repositorio GitOps | https://github.com/susanpamela2520/Pr-cticas-SA-B-201612218-gitops |
| Servicios instrumentados | `api-gateway`, `auth-service`, `tickets-service` — namespace `sa-prod` |
| AnalysisTemplate por métricas | `analisis-por-metricas` — `rollouts/analysis-prometheus.yaml` (repo GitOps) |
| Consultas del análisis | Ver sección "Consultas que deciden la promoción" |
| SLO declarados | Disponibilidad ≥ 99,5 % / 30 d · Latencia p95 < 500 ms en 95 % / 30 d |
| Reglas de alerta | `observabilidad/prometheus-rules.yaml` (repo GitOps) |
| Tablero | `P10/dashboards/operacion-senales-de-oro.json` |
| Reversión por métricas | No ejecutada: depende de `http_requests_total`, ver Limitación reconocida. Se demuestra en vivo |
| Recorrido síntoma a causa | `P10/docs/recorrido-sintoma-causa.md` — tiempo cronometrado durante la demostración |
| Video demostrativo | Se presenta en la demostración presencial |

---

## Consultas que deciden la promoción

Las tres expresiones PromQL del `AnalysisTemplate`. Todas filtran por
`rollouts_pod_template_hash`, la etiqueta que Argo Rollouts inyecta en los
pods de la versión candidata.

**Tasa de error del canary** (umbral: < 1 %)
```promql
sum(rate(http_requests_total{namespace="sa-prod",service="api-gateway",
      rollouts_pod_template_hash="{{args.canary-hash}}",status=~"5.."}[2m]))
/
clamp_min(sum(rate(http_requests_total{namespace="sa-prod",service="api-gateway",
      rollouts_pod_template_hash="{{args.canary-hash}}"}[2m])), 1)
```

**Latencia p95 del canary** (umbral: < 500 ms)
```promql
histogram_quantile(0.95,
  sum(rate(http_request_duration_seconds_bucket{namespace="sa-prod",
        service="api-gateway",
        rollouts_pod_template_hash="{{args.canary-hash}}"}[2m])) by (le))
```

**Disponibilidad del canary** (umbral: ≥ 1 pod sirviendo, `failureLimit: 0`)
```promql
sum(up{namespace="sa-prod", rollouts_pod_template_hash="{{args.canary-hash}}"})
```

**Por qué el filtro por hash importa:** sin él, las consultas medirían el
tráfico de canary y estable juntos. Con el canary al 20 %, una versión que
fallara el 100 % de sus peticiones apenas movería el promedio global al
20 % de error — por debajo de cualquier umbral razonable. El defecto
pasaría la promoción.

---

## Qué cambió respecto a la Práctica 8

El enunciado lo plantea como un pendiente deliberado, y es el cambio
central de esta práctica.

| | Práctica 8 | Práctica 10 |
|---|---|---|
| Qué decide la promoción | Un `Job` con `curl` que yo escribí | Métricas de Prometheus del tráfico real |
| Qué mide | Peticiones sintéticas generadas por la sonda | Las peticiones que los usuarios hacen |
| Alcance de la medición | El endpoint `/health` | Todas las rutas del servicio |
| Qué puede detectar | Que el servicio arranca y responde | Degradación bajo carga real de usuarios |

La diferencia práctica: una sonda a `/health` puede responder 200 mientras
las rutas que importan devuelven 500. La métrica no.

---

## SLO declarados

### SLO-1 · Disponibilidad

**99,5 % de las peticiones al api-gateway responden sin error de servidor,
en ventana móvil de 30 días.**

Presupuesto de error: 0,5 % ≈ **216 minutos al mes**.

Por qué 99,5 y no 99,9: la plataforma corre en un clúster de 4 nodos en
una sola zona, sin redundancia regional. Prometer 99,9 % sería declarar un
objetivo que la arquitectura no puede sostener — y un SLO que se incumple
siempre deja de usarse como señal.

### SLO-2 · Latencia

**95 % de las peticiones se responden en menos de 500 ms, en ventana móvil
de 30 días.**

Por qué 500 ms: la línea base medida con k6 en la Práctica 6 fue p95 de
**222 ms** con 100 usuarios concurrentes y 26.427 peticiones. 500 ms es
poco más del doble: deja margen para contención normal sin tolerar una
regresión seria.

Ambos están expresados desde lo que el usuario experimenta —si su petición
falla, si tarda— y no desde métricas de infraestructura como uso de CPU,
que al usuario no le dicen nada.

---

## Alertas: por presupuesto, no por umbral

Una alerta de umbral instantáneo (`error > 1 %`) se dispara con cualquier
pico de 30 segundos. Después de la tercera falsa alarma, nadie la atiende —
y entonces el control dejó de existir aunque el archivo siga ahí.

Las alertas de esta práctica preguntan otra cosa: **a este ritmo, ¿cuándo se
agota el presupuesto del mes?**

| Alerta | Velocidad | Agota el presupuesto en | Acción |
|---|---|---|---|
| `PresupuestoErrorConsumoRapido` | 14,4x | ~2 días | Intervención inmediata |
| `PresupuestoErrorConsumoSostenido` | 6x | ~5 días | Ticket, horario hábil |
| `PresupuestoErrorCasiAgotado` | >90 % consumido | — | Congelar despliegues |
| `LatenciaFueraDeSLO` | — | — | Revisar saturación y BD |

Cada una combina dos ventanas (corta y larga): la corta confirma que el
problema ocurre **ahora**, la larga que no es un pico aislado. Las dos
deben cumplirse.

Cada alerta enlaza a su runbook en `P10/runbooks/` y declara en la
anotación `accion` qué se espera que haga quien la recibe. Una alerta sin
acción asociada es ruido, y se eliminó.

---

## Estructura

```
P10/
├── README.md                       Este documento
├── p10.conf                        Configuración del script de verificación
├── instalar-stack.sh               Instalación del stack completo
├── DIAGRAMA.md                     Flujo de la telemetría
├── INFORME-OPERACION.md            Los seis campos de la plantilla
├── PREGUNTAS-TEORICAS.md           Respuestas conceptuales
├── dashboards/
│   └── operacion-senales-de-oro.json
├── runbooks/
│   ├── presupuesto-error.md
│   └── latencia-alta.md
└── docs/
    └── recorrido-sintoma-causa.md

Repo GitOps:
observabilidad/
├── prometheus-rules.yaml           SLO, recording rules y alertas
├── otel-collector.yaml             Collector + RBAC + ServiceMonitor
└── grafana-datasources.yaml        Los tres pilares, con enlaces cruzados
rollouts/
├── analysis-prometheus.yaml        El análisis por métricas
└── api-gateway-rollout.yaml        Canary condicionado al análisis
apps/
└── observabilidad.yaml             Applications de ArgoCD
```

---

## Puesta en marcha

```bash
bash P10/instalar-stack.sh
kubectl get pods -n observabilidad
```

Verificación con el script del auxiliar:

```bash
cp P10/p10.conf .
bash verificar_p10.sh
```

---

## Nota de verificación para el auxiliar

El script `verificar_p10.sh` reporta tres comprobaciones en cero por un
defecto propio del script, reproducido en dos sistemas operativos: Git Bash
sobre Windows y Google Cloud Shell sobre Linux, con idéntico resultado.

El síntoma visible en el reporte:

    AnalysisTemplates en sa-prod: 2
    0
    Reglas de registro: 103
    0   reglas de alerta: 159
    0
    verificar_p10.sh: line 229: [: 103\n0: integer expression expected

Cada sustitución de comando devuelve el valor correcto seguido de una
segunda línea con `0`, de modo que la comparación numérica falla. Además el
conteo de AnalysisTemplates informa 2 cuando en el namespace existe una
sola. Comandos para verificarlo directamente contra el clúster:

**Una sola plantilla, y consulta Prometheus**

    kubectl get analysistemplate -n sa-prod
    kubectl get analysistemplate analisis-por-metricas -n sa-prod \
      -o jsonpath='{.spec.metrics[*].provider.prometheus.address}'

**La promoción está condicionada al análisis en las tres etapas**

    kubectl get rollout api-gateway -n sa-prod \
      -o jsonpath='{.spec.strategy.canary.steps[*].analysis.templates[*].templateName}'

**Reglas de registro y de alerta**

    kubectl get prometheusrule sa-platform-slo -n observabilidad -o json \
      | jq '[.spec.groups[].rules[] | select(.record)] | length'
    kubectl get prometheusrule sa-platform-slo -n observabilidad -o json \
      | jq -r '.spec.groups[].rules[] | select(.alert)
               | "\(.alert) -> \(.annotations.runbook_url)"'

**Orígenes de datos de Grafana**

    kubectl get cm grafana-datasources -n observabilidad \
      -o jsonpath='{.data.datasources\.yaml}'

Devuelve `prometheus`, `loki` y `tempo` con los enlaces cruzados:
`derivedFields` de Loki hacia Tempo y `tracesToLogsV2` de Tempo hacia Loki.

### Limitación reconocida

Las consultas del análisis y la regla `sli:disponibilidad:ratio_rate5m` no
devuelven datos porque la métrica `http_requests_total` todavía no se emite.
La instrumentación está declarada en los tres servicios y el Rollout ya
inyecta `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME` y el puerto 9464,
pero las imágenes en ejecución (v1.1.5) se construyeron antes de incorporar
`tracing.js`. Queda pendiente reconstruirlas y publicarlas para que la
telemetría de aplicación llegue a Prometheus, y con ello que el análisis del
canary y el SLI de disponibilidad tengan serie que evaluar.
