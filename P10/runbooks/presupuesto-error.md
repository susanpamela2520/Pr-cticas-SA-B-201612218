# Runbook — Consumo del presupuesto de error

**Alertas que apuntan aquí:** `PresupuestoErrorConsumoRapido`,
`PresupuestoErrorConsumoSostenido`, `PresupuestoErrorCasiAgotado`

## Qué significa

El SLO de disponibilidad es 99,5 % en 30 días. Eso concede un presupuesto
de error de 0,5 %: unos 216 minutos de fallo al mes.

La alerta no dice "hay errores". Dice **a qué velocidad se está gastando
ese margen**. Un consumo de 14,4x agota el mes entero en dos días.

## Diagnóstico — en este orden

**1. ¿Cuánto queda del presupuesto?**
```
slo:disponibilidad:presupuesto_consumido
```
0 = intacto, 1 = agotado.

**2. ¿Coincide con un despliegue?**
```bash
kubectl argo rollouts history api-gateway -n sa-prod
kubectl get events -n sa-prod --sort-by='.lastTimestamp' | tail -20
```
Si el inicio del consumo coincide con una promoción, esa es la causa
probable y el rollback es la primera opción.

**3. ¿Qué servicio y qué ruta?**
```promql
topk(5, sum by (service, route) (
  rate(http_requests_total{namespace="sa-prod",status=~"5.."}[5m])))
```

**4. Del síntoma a la causa.** En Grafana, explorar Tempo filtrando por
`status=error` en el servicio identificado. Abrir una traza, localizar el
span que falla, y usar el enlace "Logs for this span" para ver el registro
con el `trace_id` correspondiente. Ese registro tiene el mensaje de error
real.

## Mitigación

| Situación | Acción |
|---|---|
| Coincide con un despliegue | `kubectl argo rollouts undo api-gateway -n sa-prod` |
| Un solo servicio degradado | Escalar réplicas y revisar sus límites de recursos |
| Base de datos saturada | Revisar conexiones activas y consultas lentas |
| Presupuesto >90 % consumido | Congelar despliegues no críticos |

## Cuándo NO escalar a nadie

La alerta de 6x (`ConsumoSostenido`) no amerita despertar a nadie: el
presupuesto aguanta cinco días a ese ritmo. Se atiende en horario hábil.
Solo la de 14,4x y la de presupuesto casi agotado justifican intervención
inmediata.
