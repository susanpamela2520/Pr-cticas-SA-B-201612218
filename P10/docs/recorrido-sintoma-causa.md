# Recorrido del síntoma a la causa

> Criterio 2.4 (10 pts): llegar desde la alerta hasta el registro del error
> en **menos de tres minutos**, usando las tres señales.

## Procedimiento

| # | Paso | Herramienta | Tiempo |
|---|---|---|---|
| 1 | Llega la alerta con su `runbook_url` | Alertmanager | `[MEDIR]` |
| 2 | Abrir el runbook enlazado | `P10/runbooks/` | |
| 3 | Panel de latencia p95 → identificar el servicio | Grafana / Prometheus | |
| 4 | Explore → Tempo → filtrar por servicio, ordenar por duración | Tempo | |
| 5 | Abrir la traza más lenta → ver el diagrama de spans | Tempo | |
| 6 | Clic en "Logs for this span" | Tempo → Loki | |
| 7 | Leer el mensaje de error con su contexto | Loki | |
| | **Total** | | `[MEDIR]` |

## Consultas usadas

**Paso 3 — qué servicio:**
```promql
histogram_quantile(0.95, sum by (service, le) (
  rate(http_request_duration_seconds_bucket{namespace="sa-prod"}[5m])))
```

**Paso 6 — registros de esa traza:**
```logql
{namespace="sa-prod"} | json | trace_id = "<el trace_id del span>"
```

## Cómo cronometrarlo

Inicia el cronómetro cuando aparezca la alerta y detenlo cuando tengas en
pantalla la línea de registro con el mensaje de error. Graba la pantalla:
sirve de evidencia y permite medir con exactitud después.

## Evidencia a capturar

- La alerta disparada en Alertmanager o Grafana
- El panel de latencia señalando el servicio culpable
- La traza abierta en Tempo con el span lento marcado
- El registro en Loki con el `trace_id` visible
- El cronómetro o la marca de tiempo de inicio y fin
