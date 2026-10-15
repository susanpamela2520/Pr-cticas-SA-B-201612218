# Runbook — Latencia fuera del SLO

**Alerta que apunta aquí:** `LatenciaFueraDeSLO`

## Qué significa

Menos del 95 % de las peticiones se responden en 500 ms. La línea base
medida en la Práctica 6 fue p95 de 222 ms, así que el sistema está al
menos al doble de su comportamiento normal.

## Diagnóstico

**1. ¿Qué servicio aporta la latencia?**
```promql
histogram_quantile(0.95, sum by (service, le) (
  rate(http_request_duration_seconds_bucket{namespace="sa-prod"}[5m])))
```

**2. ¿Es saturación?**
```bash
kubectl top pods -n sa-prod
kubectl get hpa -n sa-prod
```
Si el HPA está en su máximo de réplicas y el CPU sigue alto, el límite es
de capacidad, no de código.

**3. ¿Dónde se va el tiempo dentro de la petición?**

En Grafana → Tempo, ordenar las trazas del servicio por duración y abrir
la más lenta. El diagrama de spans muestra qué llamada consume el tiempo:
una consulta a PostgreSQL, una publicación a RabbitMQ, o el propio
servicio.

Esta es la pregunta que las métricas no responden y la traza sí.

## Mitigación

| Causa | Acción |
|---|---|
| Saturación de CPU | Subir `maxReplicas` del HPA o agregar un nodo |
| Consulta lenta a BD | Identificar la consulta en el span y revisar índices |
| Cola de RabbitMQ creciendo | Escalar el consumidor |
| Degradación tras despliegue | Rollback del Rollout |

## Por qué esta alerta no paga

La latencia alta degrada la experiencia pero no interrumpe el servicio.
Se atiende en horario hábil salvo que coincida con consumo acelerado del
presupuesto de error, en cuyo caso manda esa otra alerta.
