# Preguntas teóricas — Observabilidad y operación

> El criterio 1.4 pide "analizar el comportamiento de su propia
> instrumentación y reconocer sus límites", y penaliza respuestas
> contradictorias con lo que el sistema demuestra. Cada respuesta cita el
> archivo donde vive la decisión.

---

## 1. ¿Qué diferencia hay entre monitoreo y observabilidad?

**Monitoreo** responde preguntas que se formularon de antemano: ¿el CPU
superó el 80 %? ¿el servicio responde? Se construye sabiendo qué puede
fallar, y por eso solo detecta los fallos previstos.

**Observabilidad** es la propiedad de poder responder preguntas que **no**
se anticiparon, a partir de lo que el sistema emite. No es una herramienta
sino una característica del sistema.

Las prácticas anteriores tenían monitoreo: un `/health` y un HPA mirando
CPU. Eso detecta "el servicio se cayó" y "hay mucha carga". No responde
"¿por qué esta petición concreta tardó 4 segundos?".

Lo que esta práctica agrega es la capacidad de descomponer una petición
individual: la traza muestra en qué span se fue el tiempo, y el `trace_id`
del registro lleva al mensaje de error. Esa pregunta no estaba prevista al
instrumentar, y aun así tiene respuesta.

---

## 2. ¿Por qué los tres pilares por separado no bastan?

Tener métricas, trazas y registros en tres sistemas distintos deja el
trabajo de correlacionarlos a la persona que está diagnosticando a las dos
de la mañana.

Lo que hace útil el conjunto son los **enlaces**:

- `derivedFields` en el datasource de Loki extrae el `trace_id` de cada
  línea JSON con una expresión regular y lo convierte en un enlace a Tempo
- `tracesToLogsV2` en Tempo hace el salto inverso, filtrando por
  `trace_id` en la ventana de tiempo del span

Ambos están en `observabilidad/grafana-datasources.yaml`.

Sin esos enlaces, el paso "encontré el span lento" → "quiero ver qué dijo
ese servicio" obliga a copiar un identificador, cambiar de pestaña,
escribir una consulta y ajustar el rango de tiempo a mano. Con ellos es un
clic. La diferencia decide si el recorrido toma 40 segundos o 15 minutos.

---

## 3. ¿Qué es un SLO y en qué se distingue de una métrica?

Una **métrica** es una medición: el p95 de latencia es 222 ms.

Un **SLO** es un compromiso con un objetivo y una ventana: *el 95 % de las
peticiones se responderán en menos de 500 ms, medido sobre 30 días*. De él
se deriva un **presupuesto de error**: cuánto incumplimiento es aceptable
antes de que haya que actuar.

La diferencia práctica es que el SLO **convierte una medición en una
decisión**. Con la métrica sola, "la latencia subió" no dice si hay que
hacer algo. Con el SLO, la pregunta pasa a ser cuantificable: si queda
80 % del presupuesto del mes, se puede seguir desplegando; si queda 5 %,
se congela.

Los dos SLO de esta práctica están expresados desde lo que el usuario
experimenta —si su petición falla, si tarda— y no desde infraestructura.
Un SLO sobre uso de CPU no le dice nada al usuario: puede estar al 90 % y
el servicio responder perfecto.

---

## 4. ¿Por qué alertar por consumo del presupuesto y no por umbral?

Una alerta de umbral instantáneo (`tasa de error > 1 %`) se dispara con
cualquier pico de 30 segundos: un reinicio de pod, una partición de red
momentánea. Después de la tercera falsa alarma, el equipo la silencia — y
entonces el control dejó de existir aunque el archivo siga en el
repositorio.

La alerta por **velocidad de consumo** pregunta otra cosa: a este ritmo,
¿cuándo se agota el presupuesto del mes?

En `observabilidad/prometheus-rules.yaml`:

| Alerta | Velocidad | Se agota en | Respuesta |
|---|---|---|---|
| `PresupuestoErrorConsumoRapido` | 14,4x | ~2 días | Inmediata |
| `PresupuestoErrorConsumoSostenido` | 6x | ~5 días | Ticket |

Cada una combina **dos ventanas**: la corta (5 min o 1 h) confirma que el
problema ocurre ahora, la larga (1 h o 6 h) que no es un pico aislado.
Ambas condiciones deben cumplirse, lo que elimina los disparos por ruido.

Y cada alerta declara en su anotación `accion` qué se espera de quien la
recibe. Una alerta sin acción asociada es ruido con formato de urgencia.

---

## 5. ¿Por qué las consultas del análisis filtran por `rollouts_pod_template_hash`?

Porque sin ese filtro medirían canary y estable juntos, y el canary
quedaría diluido.

El cálculo concreto: con el canary al 20 % del tráfico, una versión que
fallara el **100 %** de sus peticiones movería la tasa de error global a
apenas 20 % — por debajo de cualquier umbral que no sea absurdamente
estricto. El defecto pasaría la promoción al 50 %, y luego al 100 %.

Argo Rollouts inyecta `rollouts_pod_template_hash` en los pods de la
versión candidata, y el `AnalysisTemplate` lo recibe como argumento con
`podTemplateHashValue: Latest`. Las tres consultas de
`rollouts/analysis-prometheus.yaml` lo usan en su selector.

Es el detalle que separa un análisis que funciona de uno que parece
funcionar.

---

## 6. ¿Cómo se eligieron los umbrales del análisis?

De la línea base medida con k6 en la Práctica 6: 26.427 peticiones, 100
usuarios concurrentes, **0,01 % de error** y **p95 de 222 ms**.

| Métrica | Base | Umbral | Razonamiento |
|---|---|---|---|
| Tasa de error | 0,01 % | < 1 % | Cien veces la base: es regresión, no ruido |
| Latencia p95 | 222 ms | < 500 ms | Poco más del doble; el canary comparte nodos |
| Disponibilidad | — | ≥ 1 pod | Binaria, `failureLimit: 0` |

El criterio de fondo: **un umbral solo sirve si distingue una regresión de
una fluctuación normal.** Demasiado estricto genera reversiones espurias y
el equipo acaba desactivando el análisis. Demasiado laxo deja pasar lo que
debía detener.

La disponibilidad es la excepción deliberada con `failureLimit: 0`: si no
hay pods del canary sirviendo, no hay nada que interpretar.

---

## 7. ¿Por qué un Collector en medio y no exportar directo?

Los servicios envían toda su telemetría por OTLP al Collector, y este
enruta a Tempo y Prometheus (`observabilidad/otel-collector.yaml`).

Tres razones concretas:

**Desacople.** Cambiar Tempo por Jaeger es editar la configuración del
Collector. Sin él, habría que tocar, reconstruir y redesplegar los tres
servicios.

**Enriquecimiento.** El procesador `k8sattributes` agrega el nombre del
pod, el namespace y el deployment a cada señal. El servicio no sabe en qué
pod corre; el Collector sí, porque consulta la API de Kubernetes.

**Control de volumen.** El `batch` agrupa antes de exportar y el
`memory_limiter` evita que un pico de telemetría tumbe el pipeline.

El costo: es un punto de fallo más. Si el Collector cae, se pierden trazas
y métricas OTLP hasta que vuelva. Los registros no, porque van por
Promtail leyendo stdout — un camino independiente, y eso es deliberado.

---

## 8. ¿Qué aporta una métrica de negocio que no aporte una técnica?

Las métricas técnicas le dicen a un ingeniero si el sistema está sano. Las
de negocio le dicen a cualquiera si está sirviendo para lo que existe.

El caso que lo ilustra: si un cambio rompe la validación del formulario de
tickets, el api-gateway devuelve **400**, no 500. La tasa de error 5xx
sigue en cero, la latencia perfecta, el CPU tranquilo. Todos los paneles
en verde — y nadie puede crear un ticket.

`tickets_creados_total` cae a cero y lo delata de inmediato.

Las tres definidas en `instrumentacion/metricas-negocio.js` son
`tickets_creados_total`, `tickets_resueltos_total` y
`logins_fallidos_total`. La última además detecta un ataque de fuerza
bruta, que ninguna métrica técnica distinguiría de tráfico normal.

---

## 9. ¿Por qué los registros deben ser JSON y llevar `trace_id`?

**JSON** porque permite consultar por campo. Con texto plano, buscar
"todos los errores del tickets-service en los últimos 10 minutos con
duración mayor a un segundo" es una expresión regular frágil. Con JSON
estructurado es un filtro:

```logql
{namespace="sa-prod"} | json | level="error" | duration_ms > 1000
```

**`trace_id`** porque sin él la correlación es imposible. Con veinte pods
escribiendo registros simultáneamente, saber cuáles pertenecen a *la*
petición que falló requiere adivinar por marca de tiempo. Con el
`trace_id` se filtra exacto.

`instrumentacion/logger.js` lo obtiene del span activo con
`trace.getSpan(context.active())`, así que cada línea queda ligada a su
traza sin que el código de la aplicación tenga que pasarlo.

---

## 10. ¿Qué límites tiene esta instrumentación?

Vale nombrarlos, porque presentarla como completa sería inexacto.

**El análisis del canary no valida corrección funcional.** Mide latencia,
errores HTTP y disponibilidad. Una versión que respondiera 200 en 50 ms
con datos equivocados pasaría la promoción. Cubrirlo requiere llevar las
métricas de negocio al análisis — por ejemplo, que la tasa de tickets
creados por petición no caiga.

**El muestreo está al 100 %.** Con el volumen de esta práctica funciona,
pero en producción real saturaría Tempo. La solución es muestreo por cola:
conservar todas las trazas con error y una fracción de las exitosas.

**Las alertas no consideran estacionalidad.** A las 3 de la mañana con
cinco peticiones por minuto, un solo error es el 20 % de la tasa y dispara
la alerta de consumo rápido. Un `clamp_min` sobre el denominador mitiga la
división por volúmenes pequeños, pero no resuelve el problema de fondo.

**El SLO se mide desde dentro del clúster.** Prometheus cuenta las
peticiones que *llegaron*. Si el LoadBalancer de Google falla, el usuario
ve un error y el SLI sigue en 100 %. Medir la experiencia real exige
monitoreo sintético desde fuera.

**Un solo Prometheus sin alta disponibilidad.** Si cae, se pierde la
capacidad de medir — y, como el análisis del canary depende de él, también
la de promover con seguridad.
