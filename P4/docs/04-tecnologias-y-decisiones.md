# Tecnologías y Decisiones de Diseño

## Resumen de tecnologías por servicio

| Servicio | Lenguaje | Framework | Interfaz | Base de datos |
|---|---|---|---|---|
| `auth-service` | **Node.js + TypeScript** | Express | REST + GraphQL | `auth_db` |
| `tickets-service` | **Python** | FastAPI + SQLAlchemy | REST + GraphQL (Strawberry) | `tickets_db` |
| `comentarios-service` | Node.js + TypeScript | Express | REST | `comentarios_db` |
| `notificaciones-service` | Python | FastAPI | REST | Sin base de datos |
| `api-gateway` | Node.js + TypeScript | Express + http-proxy-middleware | Proxy HTTP | N/A |

Cumple los requisitos explícitos: **4 microservicios** de negocio
(`auth`, `tickets`, `comentarios`, `notificaciones`), **2 lenguajes**
distintos (Node.js/TypeScript y Python), y **GraphQL en 2 servicios**
(`auth-service` y `tickets-service`).

## Por qué Node.js + TypeScript para la mitad de los servicios

Es el mismo stack usado en las Prácticas 1 y 2, lo que permitió
**reutilizar directamente** el código de `auth-service` (JWT, cifrado
AES, cookies HTTP-only) sin reescribirlo ni traducirlo — justo lo que
pide el enunciado ("integrar el servicio de autenticación desarrollado
en la Práctica 2").

## Por qué Python + FastAPI para la otra mitad

- **Documentación de contrato automática**: FastAPI genera Swagger UI
  (`/docs`) y el JSON de OpenAPI (`/openapi.json`) **sin escribir una
  sola línea de YAML a mano** — por eso `tickets-service` y
  `notificaciones-service` no tienen un archivo `openapi.yaml` en
  `docs/openapi/` (a diferencia de los servicios Node): su contrato
  vive en el propio código y se sirve en vivo.
- **SQLAlchemy + Pydantic** dan validación de tipos y de esquema de
  base de datos con poco código, ideal para un microservicio con un
  modelo de datos simple como `tickets-service`.
- Es uno de los lenguajes explícitamente sugeridos en el enunciado, y
  demuestra dominio de un stack distinto al usado en el resto del curso.

## GraphQL: por qué en `auth-service` y `tickets-service`

Se eligieron los dos servicios donde un cliente típicamente necesita
**pedir formas distintas de la misma información** según la pantalla:
el perfil del usuario (`auth-service`) y los tickets con distintos
niveles de detalle o filtros (`tickets-service`). GraphQL le permite al
cliente pedir exactamente los campos que necesita en una sola petición,
en vez de sobre-pedir (como pasa típicamente con REST) o
tener que crear un endpoint REST nuevo por cada combinación de filtros.
`comentarios-service` y `notificaciones-service`, en cambio, tienen
operaciones simples y bien definidas (crear, listar) donde REST puro es
suficiente y más simple de mantener — no todo microservicio necesita
GraphQL solo porque puede tenerlo.

## API Gateway: por qué un proxy "tonto" y no uno "inteligente"

`api-gateway` (`http-proxy-middleware`) solo enruta — no valida JWT, no
parsea el body, no aplica reglas de negocio. La alternativa (centralizar
la validación de JWT en el Gateway) se descartó a propósito:

- Cada microservicio necesita poder verificar el JWT igual **aunque el
  Gateway no exista** (por ejemplo, en pruebas de integración directas
  a un servicio, como las que se corrieron para validar este proyecto).
- Si mañana se agrega un microservicio nuevo, no depende de que alguien
  recuerde configurar la validación en el Gateway — cada servicio es
  responsable de su propia seguridad (principio de **responsabilidad
  distribuida**, coherente con la filosofía de microservicios).

## Comunicación directa vs. a través del Gateway

El enunciado marca la comunicación directa entre microservicios (sin
pasar por el Gateway) como **no obligatoria pero recomendada** para
casos internos. Se aplicó exactamente así:

- **A través del Gateway** (tráfico externo/cliente): todo lo que un
  usuario o frontend hace — login, crear tickets, comentar.
- **Directo, sin Gateway** (tráfico interno): `tickets-service` llama
  directamente a `notificaciones-service` cuando un ticket se marca
  `RESUELTO`. El Gateway existe para exponer una API pública unificada,
  no para intermediar una decisión interna entre dos servicios que ya
  se conocen por su propósito de negocio — pasar por el Gateway ahí
  solo agregaría una parada de red innecesaria.

## Principios de desacoplamiento aplicados

- **Database per Service**: cada microservicio con persistencia tiene
  su propia base de datos lógica; ninguno hace `JOIN` contra el
  esquema de otro (ver [`03-er.md`](./03-er.md)).
- **Autenticación sin estado (JWT stateless)**: `tickets-service` y
  `comentarios-service` verifican el JWT localmente con el secreto
  compartido, sin depender de que `auth-service` esté disponible en
  cada petición — solo lo necesitan para el login inicial.
- **Falla aislada**: si `notificaciones-service` está caído, un ticket
  igual puede marcarse como `RESUELTO` (la llamada de notificación es
  "no bloqueante" — ver `notificaciones_client.py`); un servicio de
  soporte secundario no debería poder tumbar la operación principal.
- **Contratos explícitos**: cada servicio documenta su API (Swagger,
  a mano o automático) en vez de exponer implícitamente su modelo de
  base de datos — los demás servicios (y el Gateway) solo conocen el
  contrato HTTP, nunca el esquema SQL interno de otro.

## Por qué un solo contenedor de PostgreSQL en vez de 3

El enunciado marca "base de datos separada por servicio" como
recomendado, no obligatorio. Se logró la separación **lógica** (3
bases de datos distintas, sin cruces) sin pagar el costo operativo de
3 contenedores de Postgres corriendo en paralelo — un compromiso
consciente entre pureza arquitectónica y simplicidad para poder correr
todo el sistema en una laptop con `docker compose up -d --build` sin
que consuma recursos excesivos.
