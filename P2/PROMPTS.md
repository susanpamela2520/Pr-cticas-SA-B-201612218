# Documentación de Prompts de IA — Práctica 2

Herramienta utilizada: **Claude (Anthropic)**.

---

## Prompt 1 — Arquitectura de dos servicios y flujo de renovación de JWT

**Prompt utilizado:**
> "Necesito un servicio de autenticación en Express + TypeScript con registro,
> login y JWT guardado en cookie HttpOnly. El JWT debe tener tiempo de vida
> configurable, y cuando expire pero haya pasado menos de un tiempo X
> (también configurable), debe renovarse automáticamente sin que el usuario
> tenga que volver a loguearse. Además necesito un segundo servicio,
> totalmente separado, que reciba un rol y un recurso y responda si el
> acceso está permitido."

**Respuesta obtenida (resumen):**
La IA propuso separar el proyecto en dos servicios Express independientes
(`auth-service` y `authorization-service`), con un `TokenService` que usa
`jwt.verify(token, secreto, { ignoreExpiration: true })` para poder
distinguir "token con firma inválida" de "token expirado pero renovable",
y así decidir si emitir un nuevo token o rechazar la petición.

**Ajustes / revisión crítica aplicados:**
- Se verificó que la renovación usa `ignoreExpiration` **sin dejar de
  validar la firma** — si solo se hubiera hecho `jwt.decode()` (sin verificar
  firma), cualquiera podría fabricar un token "expirado" falso y forzar una
  renovación. Se confirmó con una prueba explícita: un token firmado con una
  clave distinta es rechazado incluso dentro del período de gracia.
- Se probó en vivo el caso límite: token con TTL de 2 segundos y gracia de
  3 segundos, esperar 2.5s, y confirmar que se renueva automáticamente
  (documentado como parte de las pruebas del proyecto).

---

## Prompt 2 — Cifrado AES de campos sensibles y el problema de buscar por correo cifrado

**Prompt utilizado:**
> "Necesito cifrar con AES nombre, correo y contraseña antes de guardarlos en
> PostgreSQL, y poder desencriptarlos para el login. El problema es que si
> uso AES con IV aleatorio, el mismo correo se cifra distinto cada vez y no
> puedo hacer un WHERE correo = ? para buscar al usuario en el login. ¿Cómo
> resuelvo esto sin dejar de cifrar el correo?"

**Respuesta obtenida (resumen):**
La IA explicó que el problema es inherente a cualquier cifrado no
determinístico (como AES-GCM con IV aleatorio, que es lo recomendado por
seguridad) y propuso la solución estándar: guardar, además del correo
cifrado, un **HMAC-SHA256** del correo normalizado (minúsculas, sin
espacios) en una columna separada (`correo_hash`), usado únicamente como
índice de búsqueda. El HMAC no es reversible, así que no compromete la
confidencialidad del correo, pero sí permite localizarlo.

**Ajustes / revisión crítica aplicados:**
- Se agregó normalización del correo (`trim().toLowerCase()`) **antes** de
  calcular el HMAC, porque sin eso "Ana@Correo.com" y "ana@correo.com"
  generarían hashes distintos y el login fallaría por un detalle de
  mayúsculas.
- Se decidió usar AES-**GCM** en vez de AES-CBC (que fue lo primero que
  propuso la IA) porque GCM añade un `authTag` que detecta si el valor
  cifrado fue manipulado en la base de datos; con CBC un dato corrupto se
  "desencriptaría" en basura silenciosamente en vez de lanzar un error.

---

## Prompt 3 — Reintentos con backoff hacia el microservicio de autorización

**Prompt utilizado:**
> "El backend principal debe consultar el microservicio de autorización, y si
> falla por timeout o el servicio está caído, debe reintentar un número
> máximo de veces con espera entre cada intento (backoff), antes de negar el
> acceso por error de comunicación (no confundir esto con un 403 por rol
> incorrecto). Todo configurable por variables de entorno."

**Respuesta obtenida (resumen):**
La IA propuso un cliente HTTP (`HttpAutorizacionClient`) con un bucle
`for` que reintenta hasta `maxIntentos`, esperando entre cada intento
`backoffBaseMs * 2^intento` (backoff exponencial), y que al agotar los
reintentos lanza un error específico (`ServiceUnavailableError`, código
503) en vez de simplemente devolver `false` — para no confundir "no se
pudo verificar el permiso" con "el permiso fue denegado".

**Ajustes / revisión crítica aplicados:**
- Se probó el escenario real apagando el proceso de `authorization-service`
  a la mitad de una petición activa: `auth-service` reintentó 3 veces
  (con `AUTHZ_MAX_RETRIES=3` y `AUTHZ_BACKOFF_BASE_MS=200`) y devolvió
  `503` en ~650ms, consistente con la suma de las esperas (200ms + 400ms)
  entre los 3 intentos. Esto confirmó que el backoff exponencial se estaba
  aplicando correctamente y no solo reintentando sin esperar.
- Se separó explícitamente el código `403` (rol sin permiso, respuesta
  normal del microservicio) del `503` (microservicio no disponible tras
  agotar reintentos), porque la primera versión generada por la IA
  devolvía `403` en ambos casos, lo cual habría ocultado un problema de
  infraestructura real como si fuera una simple falta de permisos.
