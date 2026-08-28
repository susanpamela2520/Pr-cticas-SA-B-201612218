# Tecnologías y Decisiones de Diseño

## Sobre Bitnami (léelo primero — es importante para tu defensa)

El enunciado sugiere Bitnami "por ejemplo" para el broker y la base de
datos. En mi entorno de trabajo no tuve forma de verificar si el
registro de charts de Bitnami está disponible o si sus imágenes
recientes requieren autenticación (VMware/Broadcom cambió varias
condiciones de licenciamiento de Bitnami entre 2024 y 2025). Como no
podía arriesgar que tu única noche para esto se fuera en un problema de
red que no puedo diagnosticar a distancia, tomé esta decisión:

- **`Chart.yaml` SÍ declara** `postgresql` y `rabbitmq` como
  dependencias de Bitnami (satisface el requisito literal de "declarar
  dependencias... y resolverse con `helm dependency update`").
- Pero **`postgresql.enabled` y `rabbitmq.enabled` están en `false`**
  en `values.yaml` — el despliegue real usa dos subcharts propios
  (`db` y `broker`) que yo controlo por completo: un `StatefulSet` con
  PVC para PostgreSQL, y un `Deployment` para RabbitMQ.

**Si quieres intentar la ruta 100% Bitnami** (por ejemplo, si te sobra
tiempo y quieres apegarte más al ejemplo del enunciado): cambia ambos
`enabled` a `true`, corre `helm dependency update`, y ajusta las
referencias de `DB_HOST`/`RABBITMQ_HOST` en los `ConfigMap`/`Secret` de
cada servicio al nombre de servicio que genere el chart de Bitnami
(revísalo con `helm template` después de instalar la dependencia). No
lo dejé como ruta principal porque no pude probarlo yo misma.

## Resumen de tecnologías

| Componente | Tecnología | Por qué |
|---|---|---|
| `auth-service`, `comentarios-service`, `api-gateway` | Node.js + TypeScript | Heredado de la Práctica 4, mismo stack ya probado |
| `tickets-service`, `notificaciones-service` | Python + FastAPI | Segundo lenguaje requerido; FastAPI da Swagger automático |
| `db` | PostgreSQL 16 (StatefulSet) | Relacional, con `pg_isready` nativo para probes sencillas |
| `broker` | RabbitMQ 3 (management) | El plugin de administración expone una API HTTP, usada por el Cronjob 2 para publicar sin necesitar un cliente AMQP en esa imagen |
| Orquestación | Kubernetes (minikube + Calico) | Calico específicamente porque el CNI default de minikube no aplica NetworkPolicies |
| Empaquetado | Helm 3 (chart padre + 7 subcharts) | Un solo `helm install`/`upgrade`/`rollback` para toda la plataforma |
| Ingress | NGINX Ingress Controller (addon de minikube) | Único punto de entrada expuesto |
| Prueba de carga | k6 | Sintaxis de JavaScript, reporta p95 y tasa de error nativamente |

## Por qué RabbitMQ vía API HTTP para el Cronjob 2 (y no un cliente AMQP)

La imagen de los cronjobs es deliberadamente mínima (Alpine + psql +
curl + jq, sin Node ni Python) para minimizar su tamaño y superficie de
ataque — un cronjob no necesita un runtime de aplicación completo, solo
ejecutar un script. RabbitMQ expone su propia API HTTP de
administración (puerto 15672) con un endpoint para publicar mensajes
directamente (`POST /api/exchanges/%2F/amq.default/publish`), así que
`curl` + `jq` (para armar el JSON del cuerpo de forma segura) bastan —
sin necesitar instalar una librería cliente de AMQP en una imagen que
por lo demás no la necesitaría para nada más.

**Detalle encontrado al probarlo de verdad** (no algo que se pueda
anticipar solo leyendo documentación): si publicas a una cola que
ningún consumidor ha declarado todavía, RabbitMQ **descarta el mensaje
en silencio** (`"routed": false`) en vez de crear la cola sola. Por
eso el consumidor (`tickets-service`) declara la cola `cron.resumenes`
apenas arranca — antes de que el primer Cronjob 2 tenga oportunidad de
correr.

## Por qué solo se restringe el ingreso de red (no también el egreso)

Restringir egreso obligaría a permitir explícitamente DNS (`kube-dns`)
en cada NetworkPolicy, ya que sin esa excepción ningún pod podría
resolver nombres — ni siquiera el nombre del propio Service al que
necesita hablarle. El foco de esta práctica es demostrar que el
tráfico lateral **no autorizado** es rechazado (requisito E), lo cual
se logra completamente restringiendo solo el ingreso — agregar
restricción de egreso sería una capa extra de rigor, pero también una
fuente extra de errores difíciles de depurar en una sola noche.

## Por qué las CronJobs tienen `readOnlyRootFilesystem: true` sin volumen extra

A diferencia de los microservicios (que llevan un volumen `emptyDir`
en `/tmp` por si alguna dependencia intenta escribir un temporal), los
scripts de los cronjobs no escriben nada en el sistema de archivos del
contenedor — solo hacen consultas de red (`psql`, `curl`) y muestran
resultado por `stdout`. Se probó así (ver `docs/02-comandos-reproducibles.md`)
sin necesitar ese volumen adicional.
