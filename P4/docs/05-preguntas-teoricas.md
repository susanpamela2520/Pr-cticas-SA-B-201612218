# Preguntas Teóricas — Preparación para la Defensa Oral

15 de los 100 puntos son preguntas orales sobre microservicios, Docker
y GraphQL. Aquí las más probables, con respuesta lista para decir con
tus propias palabras.

## Microservicios

**¿Por qué separar en microservicios en vez de un solo backend?**
Cada servicio puede desarrollarse, desplegarse y escalarse por
separado. Si `tickets-service` recibe mucho más tráfico que
`notificaciones-service`, se pueden correr más instancias de uno sin
tocar el otro. También aísla fallas: si `notificaciones-service` se
cae, los tickets se siguen creando y resolviendo con normalidad.

**¿Cómo se comunican los microservicios entre sí en este proyecto?**
De dos formas: (1) HTTP directo — `tickets-service` llama a
`notificaciones-service` cuando un ticket se resuelve; (2)
verificación local de JWT — `tickets-service` y `comentarios-service`
verifican el token con el mismo secreto que `auth-service`, sin
llamada de red, porque JWT es un mecanismo sin estado.

**¿Qué pasa si `auth-service` se cae mientras alguien usa
`tickets-service`?** Si el usuario ya tiene una sesión activa
(cookie con JWT válido), `tickets-service` sigue funcionando
normalmente — no depende de que `auth-service` esté arriba para
verificar el token, porque lo verifica localmente. Lo único que se
rompería es que nadie nuevo podría hacer login mientras
`auth-service` esté caído.

**¿Por qué cada microservicio tiene su propia base de datos?**
Para que ningún servicio dependa del esquema interno de otro. El costo
es que no hay `JOIN` directos entre datos de distintos servicios — por
eso `comentarios-service` guarda una copia del `autor_rol` en vez de
consultarlo cada vez a `auth-service`.

## Docker

**¿Para qué sirve el `Dockerfile` de cada servicio?**
Define cómo construir la imagen: qué base usar (Node o Python),
instalar dependencias, copiar el código, y qué comando correr al
iniciar el contenedor. Cada microservicio tiene el suyo porque cada
uno tiene un runtime y dependencias distintas.

**¿Qué hace `docker-compose.yml` que un `Dockerfile` no hace?**
El `Dockerfile` construye UNA imagen. `docker-compose.yml` orquesta
VARIOS contenedores juntos: define la red compartida entre ellos, el
orden de arranque (`depends_on`), las variables de entorno de cada
uno, y los puertos que se exponen — todo con un solo comando
(`docker compose up`).

**¿Cómo se comunican los contenedores entre sí?**
Por nombre de servicio, no por `localhost`. Docker Compose crea una
red interna con DNS propio: `http://auth-service:3001` desde otro
contenedor resuelve automáticamente a la IP del contenedor
`auth-service` dentro de esa red.

**¿Por qué hay un `healthcheck` en el servicio `db`?**
Porque "el contenedor ya arrancó" no es lo mismo que "Postgres ya
puede aceptar conexiones" — hay un pequeño lapso de inicialización. El
`healthcheck` + `depends_on: condition: service_healthy` hace que los
demás servicios esperen a que Postgres esté realmente listo, evitando
errores de conexión al arrancar todo junto.

## GraphQL

**¿En qué se diferencia GraphQL de REST en este proyecto?**
En REST, cada endpoint devuelve una forma fija de datos (`GET
/tickets` siempre devuelve los mismos campos). En GraphQL
(`/graphql/tickets`), el cliente escribe una query pidiendo
exactamente los campos que necesita — por ejemplo, solo `titulo` y
`estado`, sin el resto.

**¿Por qué GraphQL solo en 2 de los 4 servicios?**
Porque no todos los servicios se benefician igual. `auth-service` y
`tickets-service` tienen datos que un cliente típicamente consulta con
distintos niveles de detalle. `comentarios-service`, en cambio, tiene
operaciones simples (crear, listar) donde REST alcanza y es más fácil
de mantener — agregar GraphQL ahí sería complejidad sin beneficio real.

**¿Cómo verifica GraphQL quién es el usuario, si no usa el mismo
middleware que REST?**
En `auth-service`, el `context` de GraphQL lee `req.usuario`, que ya
fue poblado por el mismo middleware `verificarToken` que usa el REST —
se reutiliza, no se duplica. En `tickets-service` (Python), el
`context_getter` de Strawberry recibe el `Request` completo, y cada
resolver llama a la misma función `obtener_usuario_actual()` que usan
los endpoints REST.

**¿Qué pasa si alguien manda una query GraphQL sin estar logueado?**
No se cae el servidor: la función de verificación lanza un error
controlado, y tanto `graphql-http` (Node) como Strawberry (Python) lo
convierten automáticamente en un elemento dentro del arreglo
`errors` de la respuesta GraphQL — la petición HTTP responde 200,
pero con `data: null` y el mensaje de error explicando qué faltó.
