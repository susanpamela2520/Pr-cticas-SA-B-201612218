# Documentación de Prompts de IA — Práctica 4

Herramienta utilizada: **Claude (Anthropic)**.

---

## Prompt 1 — Arquitectura polyglot y reutilización de la Práctica 2

**Prompt utilizado:**
> "Necesito diseñar un sistema de mínimo 4 microservicios con temática
> libre, en al menos 2 lenguajes distintos, que reutilice el
> auth-service de mi Práctica 2 (Node/TypeScript, JWT en cookie
> HttpOnly con renovación automática, cifrado AES). Todo debe levantar
> con un solo docker-compose, con un API Gateway al frente."

**Respuesta obtenida (resumen):**
La IA propuso un sistema de helpdesk (tickets de soporte) con
`auth-service` reutilizado casi sin cambios, y 3 servicios nuevos
(`tickets-service` en Python/FastAPI, `comentarios-service` en
Node/TypeScript, `notificaciones-service` en Python sin base de datos),
con un `api-gateway` en Node como proxy simple hacia los 4.

**Ajustes / revisión crítica aplicados:**
- Se decidió que `tickets-service` verificara el JWT **localmente**
  (mismo secreto compartido) en vez de llamar por HTTP a
  `auth-service` en cada petición — más acorde al carácter sin estado
  de JWT, y evita un punto único de falla adicional.
- Al construir el `docker-compose.yml`, se detectó que faltaba el
  archivo de migración SQL de la tabla `usuarios` (`auth-service`
  fallaba con "relation does not exist" al primer registro/login). Se
  corrigió creando la migración y aplicándola antes de dar por
  terminada la práctica — el error se detectó justamente porque se
  hizo una prueba de integración real con PostgreSQL, no solo
  compilación.

---

## Prompt 2 — GraphQL en dos stacks distintos (Node y Python)

**Prompt utilizado:**
> "Necesito GraphQL en al menos 2 microservicios: uno en Node/TypeScript
> (auth-service, para exponer una query 'me' del usuario autenticado) y
> uno en Python/FastAPI (tickets-service, con queries y mutations para
> tickets). Debe reusar la misma verificación de JWT que ya usa el REST
> de cada servicio, sin duplicar esa lógica."

**Respuesta obtenida (resumen):**
Para Node, se propuso `graphql-http` (más liviano que Apollo Server)
montado como middleware de Express después de `verificarToken`, leyendo
`req.usuario` desde el `context`. Para Python, se propuso Strawberry
con `GraphQLRouter` de FastAPI, usando un `context_getter` que expone
el `Request` completo a cada resolver, y llamando a la misma función
`obtener_usuario_actual()` que usan los endpoints REST.

**Ajustes / revisión crítica aplicados:**
- Al instalar las dependencias de `tickets-service`, `strawberry-graphql`
  falló al importar por un conflicto real con la versión más reciente
  de `pydantic` (una función interna que Strawberry esperaba encontrar
  ya no existía en `pydantic` 2.13). Se fijó `pydantic<2.10` en
  `requirements.txt` — un problema real de compatibilidad entre
  librerías, detectado al instalar de verdad, no algo que se pueda
  anticipar solo leyendo el código.
- Se probó explícitamente el caso "sin sesión" en ambos endpoints
  GraphQL para confirmar que el error se refleja como un elemento
  dentro del arreglo `errors` de la respuesta (sin tumbar el proceso) —
  en ambos lenguajes.

---

## Prompt 3 — Orquestación con Docker Compose y secreto JWT compartido

**Prompt utilizado:**
> "Arma el docker-compose.yml para los 5 servicios más Postgres, con un
> solo comando de arranque. Los 3 servicios que verifican JWT
> (auth-service, tickets-service, comentarios-service) deben compartir
> exactamente el mismo secreto. Necesito que los demás servicios
> esperen a que Postgres esté realmente listo antes de arrancar, no
> solo a que el contenedor exista."

**Respuesta obtenida (resumen):**
La IA propuso variables de entorno compartidas vía un `.env` en la
raíz del proyecto (`JWT_SECRET`, `AES_KEY_HEX`, `CORREO_HASH_SECRET`)
interpoladas con `${VAR}` en `docker-compose.yml`, un `healthcheck` de
`pg_isready` en el servicio `db`, y `depends_on: condition:
service_healthy` en los servicios que necesitan la base de datos ya
lista.

**Ajustes / revisión crítica aplicados:**
- Se corrió una prueba de integración completa a través del Gateway
  (registro, login por REST y GraphQL, crear tickets por REST y
  GraphQL, asignar agente, comentar, cambiar estado a RESUELTO) usando
  PostgreSQL real en vez de mocks, exactamente para poder detectar
  este tipo de problemas de integración (como el de la migración
  faltante del Prompt 1) antes de entregar.
- Se confirmó que la notificación automática (`tickets-service →
  notificaciones-service`, sin pasar por el Gateway) efectivamente se
  disparó al cambiar un ticket a `RESUELTO`, revisando el log del
  servicio de notificaciones en la misma corrida de pruebas.
