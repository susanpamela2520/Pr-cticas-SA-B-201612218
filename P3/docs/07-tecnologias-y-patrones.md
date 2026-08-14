# Tecnologías y Patrones de Diseño

## Tecnologías propuestas

| Componente | Tecnología propuesta | Justificación |
|---|---|---|
| Microservicios | Node.js + TypeScript (Express) | Mismo stack ya usado y probado en las Prácticas 1 y 2 — reduce curva de aprendizaje y permite reutilizar `auth-service` sin reescribirlo |
| Bases de datos | PostgreSQL, una instancia por microservicio | Relacional, con `CHECK` constraints útiles para reglas de negocio (igual que en P1/P2); cada microservicio es dueño exclusivo de su esquema |
| API Gateway | Kong (alternativa: KrakenD) | Maduro, con plugins listos para JWT, rate limiting y logging — evita construir esa lógica a mano en cada servicio |
| Mensajería asíncrona | RabbitMQ | Modelo de colas simple (publish/subscribe con exchanges), suficiente para el volumen de eventos de este dominio; Kafka se descarta por ahora al ser más complejo de operar de lo que este caso de uso justifica |
| Almacenamiento de archivos | AWS S3 (o equivalente GCP/Azure) | Durabilidad alta, URLs prefirmadas para descarga segura, políticas de ciclo de vida nativas |
| Logging centralizado | ELK (Elasticsearch + Logstash + Kibana) | Estándar de la industria, buena capacidad de búsqueda por `correlation_id` |
| Contenedores | Docker (orquestación con Kubernetes opcional a futuro) | Igual que en P1/P2, facilita levantar cada microservicio con su base de datos de forma reproducible |

## Patrones de diseño aplicados

### Database per Service
Cada microservicio tiene su propia base de datos, sin acceso directo
entre esquemas. Evita que un cambio de modelo en un servicio rompa a
otro, a cambio de tener que resolver consultas "entre servicios" vía
API o eventos en vez de `JOIN` — ese es el trade-off consciente de
microservicios frente a un monolito.

### API Gateway
Un único punto de entrada que centraliza autenticación, enrutamiento y
rate limiting (detalle completo en
[`06-comunicacion-y-gateway.md`](./06-comunicacion-y-gateway.md)).

### Event-Driven Architecture (arquitectura orientada a eventos)
`aprobaciones-service` publica el evento `lote.aprobado` sin saber (ni
importarle) quién lo consume. Hoy lo consumen 2 servicios; si mañana
se agrega, por ejemplo, un servicio de reportes que también necesita
enterarse de lotes aprobados, se suscribe al mismo evento sin tocar
`aprobaciones-service` — esto es el mismo principio Abierto/Cerrado
(OCP) que se aplicó a nivel de código en la P1, aquí aplicado a nivel
de arquitectura.

### Maker-Checker-Authorizer (control de 3 ojos)
Patrón de control interno estándar en banca — ninguna transacción se
autoriza por la decisión de una sola persona (detalle completo en
[`03-flujo-aprobacion.md`](./03-flujo-aprobacion.md)).

### Retry con Backoff Exponencial
Ya implementado y probado en la P2 para las llamadas hacia
`authorization-service`; se reutiliza el mismo patrón en
`transmision-core-service` para las llamadas al sistema core bancario
externo — un sistema externo bajo alta carga (fin de mes) es
exactamente el escenario donde este patrón demuestra su valor.

### Circuit Breaker (propuesta a futuro)
No implementado en el diseño actual, pero se documenta como siguiente
paso natural: si el sistema core bancario empieza a fallar
consistentemente (no solo timeouts ocasionales), un *circuit breaker*
dejaría de intentar por un período de tiempo en vez de seguir
acumulando reintentos fallidos uno tras otro, dándole tiempo al
sistema externo de recuperarse.

### Correlation ID / Distributed Tracing
Cada operación de negocio lleva un identificador único que se propaga
por REST y por los eventos del broker, permitiendo reconstruir el
camino completo de una operación a través de varios microservicios
(detalle en [`05-logging.md`](./05-logging.md)).
