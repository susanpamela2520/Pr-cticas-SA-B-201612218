# Preguntas Teóricas — Preparación para la Defensa Oral

La rúbrica incluye 10 pts de "Preguntas teóricas" sin especificar
cuáles — probablemente se hacen de forma oral el día de la
calificación. Aquí van las más probables sobre este diseño, con
respuesta corta lista para decir con tus propias palabras.

## Sobre la arquitectura general

**¿Por qué microservicios y no seguir con el monolito?**
Porque el problema real es que el monolito se vuelve lento en picos de
demanda (fin de mes, planillas). Con microservicios, cada pieza escala
por separado — si el cuello de botella es la ingesta de CSV, se
escalan más instancias de `ingesta-service` sin tocar el resto.

**¿Cuántos microservicios propusiste y por qué esos?**
5: `auth-service` (reutilizado), `ingesta-service`,
`aprobaciones-service`, `transmision-core-service` y
`notificaciones-service`. Cada uno tiene una responsabilidad de negocio
clara y distinta — separarlos así evita que un cambio en, por ejemplo,
la lógica de notificaciones obligue a re-desplegar el servicio que
habla con el core bancario.

**¿Por qué base de datos independiente por microservicio?**
Para que ningún servicio dependa del esquema interno de otro. El
costo es que no se pueden hacer `JOIN` directos entre datos de
distintos servicios — por eso `notificaciones-service` le **pide** los
datos a `ingesta-service` por API en vez de leerlos directo de su base.

## Sobre la comunicación

**¿Por qué mensajería asíncrona para el evento "lote aprobado" y no
una llamada REST directa?**
Porque el evento lo consumen 2 servicios distintos (transmisión y
notificaciones), y si uno estuviera caído en ese momento con una
llamada REST directa se perdería esa parte del proceso. Con un broker,
el mensaje espera en la cola hasta que el consumidor vuelva a estar
disponible.

**¿Qué pasa si `transmision-core-service` está caído cuando se publica
el evento?**
El mensaje queda en la cola del broker (RabbitMQ) esperando; en cuanto
el servicio vuelve a levantarse, lo consume y sigue el flujo normal —
no se pierde la transacción.

## Sobre el flujo de aprobación

**¿Cómo evitas que la misma persona sea maker y checker del mismo lote?**
`aprobaciones-service` valida, antes de aceptar cada `PasoAprobacion`,
que el `usuario_id` no aparezca ya en un paso anterior de esa misma
solicitud. Si lo intenta, responde 409.

**¿Qué pasa si el Checker rechaza?**
El estado pasa directo a `RECHAZADO`, no se publica el evento
`lote.aprobado`, así que ni se envía al core bancario ni se notifica a
nadie. El Maker puede ver el motivo del rechazo en el historial.

## Sobre la integración con la Práctica 2

**¿Cómo se integra el módulo de autenticación de la P2 en este diseño?**
`auth-service` se reutiliza tal cual — mismo JWT en cookie HTTP-only,
misma renovación automática, mismo cifrado AES de datos sensibles.
Se le agregó federación con el OAuth corporativo (el empleado primero
se autentica contra el OAuth de la empresa, y `auth-service` traduce
esa identidad a su propio JWT interno) y se extendió el catálogo de
roles de `Admin`/`Cliente` a `Maker`/`Checker`/`Authorizer`/`Admin`.

**¿Por qué no usar directamente el token del OAuth corporativo en todo
el sistema, sin pasar por `auth-service`?**
Porque el OAuth corporativo es compartido con otros sistemas de la
empresa y no controlamos su formato ni su ciclo de vida (dura 12h,
mucho más que lo que conviene para operaciones sensibles como aprobar
transacciones). Aislarlo detrás de `auth-service` significa que si la
empresa cambia de proveedor de identidad, solo se toca ese único punto.

## Sobre logging

**¿Cómo rastreas una operación completa a través de los 5 microservicios?**
Con un `correlation_id` generado por el API Gateway en cada petición,
que viaja como header en las llamadas REST y como parte del payload en
los eventos del broker. En Kibana, filtrando por ese ID (o por
`lote_id`), aparece toda la secuencia de eventos de esa operación.
