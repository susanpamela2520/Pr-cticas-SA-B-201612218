# Práctica 4 — Diseño y Toma de Decisiones
## Sistema de Tickets de Soporte Técnico (Helpdesk)

Arquitectura de microservicios con **temática libre**: un helpdesk
donde un `Cliente` reporta tickets, un `Agente` los atiende y comenta,
y al resolverse se dispara una notificación automática. Reutiliza el
módulo de autenticación de la Práctica 2.

**4 microservicios** + **1 API Gateway**, en **2 lenguajes**
(Node.js/TypeScript y Python), con **GraphQL en 2 de ellos**, cada uno
con su `Dockerfile`, todo levantado con **un solo comando** de Docker
Compose.

---

## Índice de documentación

| Documento | Contenido |
|---|---|
| Este README | Resumen, cómo correr el sistema, endpoints |
| [`docs/01-arquitectura.md`](./docs/01-arquitectura.md) | Diagrama de arquitectura y comunicación entre servicios |
| [`docs/02-despliegue.md`](./docs/02-despliegue.md) | Diagrama de despliegue (contenedores, red, volúmenes) |
| [`docs/03-er.md`](./docs/03-er.md) | Diagrama ER completo de las 3 bases de datos |
| [`docs/04-tecnologias-y-decisiones.md`](./docs/04-tecnologias-y-decisiones.md) | Justificación técnica y principios de desacoplamiento |
| [`docs/05-preguntas-teoricas.md`](./docs/05-preguntas-teoricas.md) | Preparación para la defensa oral |
| [`docs/openapi/auth-service.yaml`](./docs/openapi/auth-service.yaml) | Contrato Swagger de `auth-service` |
| [`docs/openapi/comentarios-service.yaml`](./docs/openapi/comentarios-service.yaml) | Contrato Swagger de `comentarios-service` |
| `PROMPTS.md` | Documentación de prompts de IA usados |

`tickets-service` y `notificaciones-service` (FastAPI) exponen su
contrato automáticamente en `/docs` (Swagger UI) — no tienen YAML
escrito a mano, ver justificación en
[`04-tecnologias-y-decisiones.md`](./docs/04-tecnologias-y-decisiones.md).

---

## Los 4 microservicios

| Servicio | Lenguaje | Rol en el sistema |
|---|---|---|
| `auth-service` | Node.js + TypeScript | Registro, login, JWT en cookie HttpOnly con renovación automática, cifrado AES (reutilizado de la P2) |
| `tickets-service` | Python + FastAPI | CRUD de tickets, cambio de estado, asignación de agente |
| `comentarios-service` | Node.js + TypeScript | Comentarios sobre un ticket |
| `notificaciones-service` | Python + FastAPI | Simula el envío de correo cuando un ticket se resuelve |
| `api-gateway` | Node.js + TypeScript | Único punto de entrada — enruta hacia los 4 servicios |

---

## Cómo levantar todo (un solo comando)

```bash
cd P4
cp .env.example .env
docker compose up -d --build
```

Espera a que los 6 contenedores queden `Up` (`docker compose ps`).
Todo el sistema queda disponible en **`http://localhost:8080`** (el
Gateway).

## Probar rápido

```bash
# Registro
curl -X POST http://localhost:8080/api/auth/registro \
  -H "Content-Type: application/json" \
  -d '{"nombre":"Carlos","correo":"carlos@test.com","contrasena":"clave1234","rol":"Cliente"}'

# Login (guarda la cookie)
curl -c cookies.txt -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"correo":"carlos@test.com","contrasena":"clave1234"}'

# Crear un ticket
curl -b cookies.txt -X POST http://localhost:8080/api/tickets \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Impresora no funciona","descripcion":"No imprime a color","prioridad":"ALTA"}'
```

Swagger de los servicios Python: `http://localhost:8080` no lo expone
directamente (el Gateway es un proxy simple), pero se puede abrir
`http://localhost:8001/docs` (tickets-service) o
`http://localhost:8002/docs` (notificaciones-service) directo, ya que
esos puertos también quedan publicados por Docker Compose para debugging.

---

## Endpoints principales (a través del Gateway, puerto 8080)

| Método | Ruta | Servicio destino | Descripción |
|---|---|---|---|
| POST | `/api/auth/registro` | auth-service | Crear usuario |
| POST | `/api/auth/login` | auth-service | Login (cookie) |
| GET | `/api/auth/me` | auth-service | Perfil |
| POST | `/graphql/auth` | auth-service | GraphQL: `query { me { ... } }` |
| POST | `/api/tickets` | tickets-service | Crear ticket |
| GET | `/api/tickets` | tickets-service | Listar tickets |
| PATCH | `/api/tickets/:id/estado` | tickets-service | Cambiar estado |
| PATCH | `/api/tickets/:id/asignar` | tickets-service | Asignar agente |
| POST | `/graphql/tickets` | tickets-service | GraphQL: queries/mutations de tickets |
| POST | `/api/comentarios` | comentarios-service | Crear comentario |
| GET | `/api/comentarios?ticket_id=` | comentarios-service | Listar comentarios |
| POST | `/api/notificaciones/enviar` | notificaciones-service | Enviar notificación (uso interno) |

Ejemplo de mutation GraphQL para crear un ticket:
```graphql
mutation {
  crearTicket(titulo: "WiFi lento", descripcion: "La red va lenta") {
    id
    estado
  }
}
```

---

## Validado antes de entregarse

Todo el sistema se probó de punta a punta con PostgreSQL real, a
través del Gateway: registro, login (REST y GraphQL), crear tickets
por REST y por GraphQL, asignar agente, comentar, cambiar estado a
`RESUELTO` (con la notificación automática disparándose de verdad),
además de los casos de error esperados (401 sin sesión, 400 con JSON
inválido).
