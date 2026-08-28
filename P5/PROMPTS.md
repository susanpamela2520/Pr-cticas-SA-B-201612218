# Documentación de Prompts de IA — Práctica 5

Herramienta utilizada: **Claude (Anthropic)**.

## Prompt 1 — Conversión del flujo síncrono a asíncrono con RabbitMQ

**Prompt utilizado:**
> "En la Práctica 4, tickets-service llamaba por HTTP directo a
> notificaciones-service cuando un ticket se resolvía. Necesito
> convertir ese flujo a asíncrono de verdad con RabbitMQ: el productor
> publica y retorna de inmediato, el consumidor confirma (ack) solo
> tras procesar bien, y si el consumidor está caído los mensajes se
> acumulan sin perderse."

**Respuesta obtenida (resumen):** se propuso usar `pika` con
`BlockingConnection` para publicar (cola durable, mensaje con
`delivery_mode=2` para persistencia), y un consumidor corriendo en un
hilo de fondo (`threading.Thread`, `daemon=True`) iniciado en el
evento de arranque de FastAPI, con `basic_qos(prefetch_count=1)` y
`basic_ack`/`basic_nack(requeue=True)` según el resultado del
procesamiento.

**Ajustes / revisión crítica aplicados:** se instaló RabbitMQ
localmente (posible en este entorno vía `apt-get install
rabbitmq-server`, a diferencia de Kubernetes/Helm) y se probó el flujo
completo de verdad: crear un ticket, marcarlo `RESUELTO`, y confirmar
en el log del consumidor que el mensaje se recibió y procesó. Esto es
justamente lo que permitió detectar, más adelante, el problema de
"cola no declarada = mensaje descartado en silencio" (ver Prompt 2).

## Prompt 2 — Script del Cronjob 2 (publicar sin cliente AMQP)

**Prompt utilizado:**
> "El Cronjob 2 corre en una imagen mínima (solo psql + curl + jq, sin
> Python ni Node) y necesita publicar un resumen a RabbitMQ. ¿Cómo lo
> hago sin instalar un cliente AMQP completo solo para esto?"

**Respuesta obtenida (resumen):** se propuso usar la API HTTP del
plugin de administración de RabbitMQ
(`POST /api/exchanges/%2F/amq.default/publish`), construyendo el JSON
del cuerpo con `jq` (en vez de concatenación de strings en shell, que
es frágil con el escapado de comillas), y dejando que PostgreSQL mismo
arme el JSON del resumen vía `json_agg(row_to_json(...))` en la
consulta SQL.

**Ajustes / revisión crítica aplicados:** al probar el script de
verdad contra un RabbitMQ real, la primera publicación devolvió
`{"routed": false}` — el mensaje se había descartado porque ninguna
cola con ese nombre existía todavía. Esto no es algo que se pueda
anticipar solo leyendo la documentación de la API; se descubrió
insertando datos de prueba y ejecutando el script real. La solución
(que el consumidor declare la cola en su arranque, antes de que el
cronjob corra por primera vez) quedó documentada explícitamente en el
propio script (`resumen.sh`) y en `docs/04-tecnologias-y-decisiones.md`.

## Prompt 3 — Namespace creado por el chart, sin conflicto de ownership

**Prompt utilizado:**
> "El enunciado exige que el namespace sa-p5 lo cree el propio chart de
> Helm, no un kubectl create namespace manual. ¿Debo incluir un
> Namespace.yaml como template del chart?"

**Respuesta obtenida (resumen):** se explicó un problema conocido de
Helm: si el chart declara un recurso `Namespace` como template, Y se
instala con `--create-namespace` (necesario porque Helm necesita el
namespace para guardar los metadatos de la release ANTES de procesar
cualquier plantilla), el `Namespace` creado por la bandera queda sin
las anotaciones de ownership de Helm — y cuando el chart intenta
"adoptarlo" vía su propio template, Helm rechaza la instalación con un
error de "ownership metadata" inválido.

**Ajustes / revisión crítica aplicados:** se decidió NO incluir un
`namespace.yaml` en el chart, y usar únicamente
`--create-namespace` en el comando de instalación — documentado
explícitamente como la forma correcta de lograr "el chart crea el
namespace en un solo comando" sin caer en ese conflicto conocido. Esta
decisión no se pudo verificar ejecutándola (no hay clúster disponible
en este entorno), así que queda marcada como un riesgo a confirmar en
el primer `helm install` real.

## Nota general sobre el nivel de prueba de esta práctica

A diferencia de las Prácticas 1-4 (donde cada pieza se probó en
ejecución real antes de entregarse), esta práctica se entregó **sin
poder correr el chart de Helm ni tener un clúster de Kubernetes
disponible**. Sí se probó de verdad todo lo que no dependía de
Kubernetes: los 5 servicios, el flujo asíncrono completo end-to-end
(incluyendo el segundo consumidor de resúmenes), y los 2 scripts de
los cronjobs como archivos reales contra PostgreSQL y RabbitMQ
instalados localmente. El chart de Helm en sí se revisó a mano
(balance de llaves, ausencia de tabs, bloques `define/range/if/end`
correctamente cerrados) pero su primera ejecución real (`helm lint`,
`helm template`, `helm install`) le corresponde al estudiante, tal
como se indica al inicio de `docs/02-comandos-reproducibles.md`.
