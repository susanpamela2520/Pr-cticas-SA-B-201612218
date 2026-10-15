# Informe de operación — Práctica 10

**Carné 201612218 · Sección B** · Máximo dos páginas.

> Los campos marcados `[MEDIR]` se llenan tras ejecutar el fallo inducido.
> La rúbrica penaliza tiempos estimados en lugar de medidos: cada campo
> indica el comando que da el dato real.

---

## 1. SLO declarados

**SLO-1 · Disponibilidad:** 99,5 % de las peticiones al api-gateway
responden sin error de servidor, en ventana móvil de 30 días.
Presupuesto de error: 0,5 % ≈ 216 minutos al mes.

*Por qué 99,5 y no 99,9:* el clúster tiene 4 nodos en una sola zona, sin
redundancia regional. Un reinicio de nodo o una actualización de GKE
consumen minutos de disponibilidad que 99,9 % no perdona. Declarar un
objetivo que la arquitectura no sostiene convierte el SLO en un número
decorativo que nadie consulta.

**SLO-2 · Latencia:** 95 % de las peticiones se responden en menos de
500 ms, en ventana móvil de 30 días.

*Por qué 500 ms:* la línea base medida con k6 en la Práctica 6 fue p95 de
222 ms sobre 26.427 peticiones con 100 usuarios concurrentes. 500 ms es
poco más del doble — tolera la contención normal de pods compartiendo
nodos, y detecta una regresión seria.

---

## 2. Fallo inducido

**Qué se rompió y cómo.** `[COMPLETAR]`

El fallo debe ser **distinto** al de la Práctica 8 (allí fue `/health`
devolviendo 500). Opción recomendada: introducir latencia artificial en el
api-gateway, de modo que el canary sea rechazado por el umbral de latencia
y no por el de disponibilidad — así se demuestra que el segundo SLO también
gobierna la promoción.

```javascript
// VERSIÓN DEFECTUOSA — P10, fallo inducido deliberado
app.use(async (req, res, next) => {
  await new Promise(r => setTimeout(r, 1200));  // 1,2 s > umbral de 500 ms
  next();
});
```

- Commit del defecto: `[COMPLETAR]`
- Tag publicado: `[COMPLETAR]`
- Hora de publicación: `[MEDIR]`

---

## 3. Tiempo de detección

**Minutos entre el inicio del fallo y la primera señal.**

| Momento | Hora | Cómo obtenerlo |
|---|---|---|
| Canary recibe tráfico (20 %) | `[MEDIR]` | `kubectl argo rollouts get rollout api-gateway -n sa-prod` |
| Primera medición fuera de umbral | `[MEDIR]` | `kubectl describe analysisrun <nombre> -n sa-prod` |
| **Tiempo de detección** | `[MEDIR]` | |

Esperado por diseño: entre 30 y 90 segundos. El `interval` del análisis es
de 30 s y `failureLimit` de la métrica de latencia es 2, así que hacen
falta tres mediciones consecutivas fuera de umbral.

---

## 4. Recorrido hasta la causa

**Los pasos exactos desde la alerta hasta el registro del error.**

| Paso | Qué se hace | Dónde | Tiempo |
|---|---|---|---|
| 1 | Llega la alerta `LatenciaFueraDeSLO` | Alertmanager | `[MEDIR]` |
| 2 | Abrir el runbook enlazado en la anotación | `P10/runbooks/latencia-alta.md` | |
| 3 | Identificar el servicio con el p95 más alto | Grafana → panel de latencia | |
| 4 | Ordenar trazas del servicio por duración | Grafana → Tempo | |
| 5 | Abrir la traza más lenta, localizar el span | Tempo | |
| 6 | "Logs for this span" → registro con el `trace_id` | Tempo → Loki | |
| **Total** | | | `[MEDIR]` |

Objetivo de la rúbrica: **menos de 3 minutos**, usando las tres señales.

Lo que hace posible ese recorrido no es tener métricas, trazas y registros
por separado, sino los enlaces entre ellos: `derivedFields` en el
datasource de Loki extrae el `trace_id` de cada línea JSON y lo convierte
en un enlace a Tempo; `tracesToLogsV2` en Tempo hace el salto inverso.

---

## 5. Tiempo de recuperación

| Momento | Hora | Comando |
|---|---|---|
| AnalysisRun marcado como Failed | `[MEDIR]` | `kubectl get analysisrun -n sa-prod` |
| Rollout revertido al estable | `[MEDIR]` | `kubectl argo rollouts get rollout api-gateway -n sa-prod` |
| **Tiempo de recuperación** | `[MEDIR]` | |

**Quién lo resolvió:** Argo Rollouts, sin intervención humana. Al recibir
el resultado fallido del `AnalysisRun`, abortó la promoción y devolvió el
100 % del tráfico al ReplicaSet estable.

**Tráfico máximo afectado:** 20 %, el peso del primer paso del canary.

---

## 6. Alerta faltante o sobrante

**Qué señal habría acortado la detección.**

Una **alerta sobre la tasa de cambio del p95 del canary respecto al
estable**, en lugar de sobre su valor absoluto. La alerta actual espera a
que la latencia cruce 500 ms; una que compare canary contra estable
detectaría una degradación del 50 % aunque ambos siguieran por debajo del
umbral:

```promql
(histogram_quantile(0.95, sum by (le) (rate(
    http_request_duration_seconds_bucket{rollouts_pod_template_hash="<canary>"}[2m])))
 /
 histogram_quantile(0.95, sum by (le) (rate(
    http_request_duration_seconds_bucket{rollouts_pod_template_hash="<estable>"}[2m]))))
> 1.5
```

Esa comparación detecta la regresión **antes** de que incumpla el SLO, que
es el momento en que todavía no ha costado presupuesto.

**Qué alerta resultó ruido.** `[COMPLETAR tras observar el sistema]`

Candidata probable: cualquier alerta de CPU o memoria por umbral que
venga por defecto en kube-prometheus-stack. Esas miden salud de
infraestructura, no experiencia del usuario: un pod al 90 % de CPU que
responde en 100 ms no es un problema que amerite despertar a nadie. Se
eliminan o se bajan a severidad informativa.

---

## Límite honesto de esta implementación

El análisis del canary mide latencia y errores HTTP, no corrección
funcional. Una versión que respondiera 200 en 50 ms con datos equivocados
pasaría la promoción sin que ninguna de las tres métricas lo notara.
Cubrir eso requiere métricas de negocio en el análisis —por ejemplo, que
la tasa de tickets creados por petición no caiga—, que es trabajo
pendiente.
