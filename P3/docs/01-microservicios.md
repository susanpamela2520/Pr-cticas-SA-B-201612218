# Microservicios — Responsabilidad, ER y Clases UML

Se proponen **5 microservicios** (el enunciado exige mínimo 3), cada uno
con **base de datos independiente** (patrón *Database per Service*),
sin acoplamiento entre esquemas: si un servicio necesita un dato de
otro, lo pide por API o lo recibe por evento — nunca hace `JOIN` contra
la base de datos de otro servicio.

---

## 1. `auth-service` (reutilizado de la Práctica 2)

**Responsabilidad:** autenticación (login, JWT, renovación automática,
cifrado AES de datos sensibles) y punto de apoyo para la autorización
por rol. Se reutiliza el código tal cual de la P2; el único cambio de
diseño es el catálogo de roles (`Maker`, `Checker`, `Authorizer`,
`Admin` en vez de `Admin`/`Cliente`) y un nuevo campo para vincular al
usuario con su identidad del OAuth corporativo.

```mermaid
erDiagram
    USUARIOS {
        uuid id PK
        text nombre_cifrado
        text correo_cifrado
        char correo_hash UK
        text contrasena_cifrada
        varchar rol
        varchar oauth_subject_id "identidad en el OAuth corporativo"
        timestamp creado_en
    }
```

```mermaid
classDiagram
    class Usuario {
        +UUID id
        +String nombreCifrado
        +String correoCifrado
        +String correoHash
        +String contrasenaCifrada
        +Rol rol
        +String oauthSubjectId
    }
    class Rol {
        <<enumeration>>
        MAKER
        CHECKER
        AUTHORIZER
        ADMIN
    }
    Usuario --> Rol
```

*(El detalle de `TokenService`, `AesCipher`, cookie HTTP-only, y el
cliente con reintentos hacia `authorization-service` ya está
documentado y probado en el README de la Práctica 2 — no se repite
aquí.)*

---

## 2. `ingesta-service`

**Responsabilidad:** recibe el archivo CSV, valida cada transacción
contra las reglas de negocio (saldo disponible, límites por tipo de
cuenta, cuentas válidas, señales básicas de fraude), sube el archivo
original a Cloud Storage, y crea el **lote** con sus transacciones.

```mermaid
erDiagram
    LOTES ||--o{ TRANSACCIONES : contiene
    LIMITES_TRANSACCION ||--o{ TRANSACCIONES : "valida contra"

    LOTES {
        uuid id PK
        varchar nombre_archivo
        text ruta_almacenamiento
        uuid usuario_carga_id "FK logica a auth-service"
        varchar estado
        int total_transacciones
        numeric monto_total
        timestamp fecha_carga
    }
    TRANSACCIONES {
        uuid id PK
        uuid lote_id FK
        varchar cuenta_origen
        varchar cuenta_destino
        numeric monto
        varchar tipo "transferencia/pago/deposito"
        varchar estado_validacion
        text motivo_rechazo
    }
    LIMITES_TRANSACCION {
        uuid id PK
        varchar tipo_cuenta
        numeric monto_maximo_diario
    }
```

```mermaid
classDiagram
    class Lote {
        +UUID id
        +String nombreArchivo
        +String rutaAlmacenamiento
        +UUID usuarioCargaId
        +EstadoLote estado
        +int totalTransacciones
        +Decimal montoTotal
        +validarTransacciones() ResultadoValidacion
    }
    class Transaccion {
        +UUID id
        +String cuentaOrigen
        +String cuentaDestino
        +Decimal monto
        +TipoTransaccion tipo
        +EstadoValidacion estadoValidacion
        +String motivoRechazo
    }
    class LimiteTransaccion {
        +UUID id
        +String tipoCuenta
        +Decimal montoMaximoDiario
    }
    class EstadoLote {
        <<enumeration>>
        CARGADO
        VALIDADO
        RECHAZADO
        ENVIADO_A_APROBACION
    }
    Lote "1" --> "*" Transaccion
    Transaccion --> LimiteTransaccion : se valida contra
    Lote --> EstadoLote
```

**Reglas de negocio reflejadas en el modelo:** `LimiteTransaccion`
existe como catálogo propio (no se consulta al core bancario para
validar límites, evitando una dependencia síncrona costosa); cada
`Transaccion` guarda su propio `estadoValidacion` y `motivoRechazo`,
así un lote puede tener transacciones válidas e inválidas mezcladas —
solo las válidas continúan al flujo de aprobación.

---

## 3. `aprobaciones-service`

**Responsabilidad:** gestiona el flujo maker-checker-authorizer sobre
cada lote. No conoce el detalle de las transacciones (eso vive en
`ingesta-service`) — solo referencia el `lote_id` y controla quién
aprobó cada paso.

```mermaid
erDiagram
    SOLICITUDES_APROBACION ||--o{ PASOS_APROBACION : registra

    SOLICITUDES_APROBACION {
        uuid id PK
        uuid lote_id "referencia externa a ingesta-service"
        varchar estado
        timestamp creado_en
    }
    PASOS_APROBACION {
        uuid id PK
        uuid solicitud_id FK
        varchar paso "MAKER/CHECKER/AUTHORIZER"
        uuid usuario_id "referencia externa a auth-service"
        varchar decision "APROBADO/RECHAZADO"
        text comentario
        timestamp fecha
    }
```

```mermaid
classDiagram
    class SolicitudAprobacion {
        +UUID id
        +UUID loteId
        +EstadoSolicitud estado
        +avanzarPaso(paso, usuarioId, decision) void
    }
    class PasoAprobacion {
        +UUID id
        +TipoPaso paso
        +UUID usuarioId
        +Decision decision
        +String comentario
        +Date fecha
    }
    class EstadoSolicitud {
        <<enumeration>>
        PENDIENTE_MAKER
        PENDIENTE_CHECKER
        PENDIENTE_AUTHORIZER
        APROBADO
        RECHAZADO
    }
    class TipoPaso {
        <<enumeration>>
        MAKER
        CHECKER
        AUTHORIZER
    }
    SolicitudAprobacion "1" --> "*" PasoAprobacion
    SolicitudAprobacion --> EstadoSolicitud
    PasoAprobacion --> TipoPaso
```

**Regla de negocio clave:** antes de registrar un `PasoAprobacion`, el
servicio verifica que `usuario_id` no se repita entre los pasos ya
registrados de esa misma `SolicitudAprobacion` — así se impone en
código la regla de que una misma persona no puede ser maker y checker
(o cualquier combinación) del mismo lote.

---

## 4. `transmision-core-service`

**Responsabilidad:** una vez un lote llega a `APROBADO`, arma el
payload y lo transmite al sistema core bancario externo. Reutiliza el
mismo patrón de **reintentos con backoff exponencial** ya construido y
probado en la P2 (`HttpAutorizacionClient`), aplicado aquí contra el
core bancario en vez de contra `authorization-service`.

```mermaid
erDiagram
    ENVIOS_CORE ||--o{ ACUSES_TRANSACCION : genera

    ENVIOS_CORE {
        uuid id PK
        uuid lote_id "referencia externa"
        varchar estado "PENDIENTE/ENVIADO/CONFIRMADO/FALLIDO"
        int intentos
        text ultima_respuesta_core
        timestamp fecha_envio
        timestamp fecha_confirmacion
    }
    ACUSES_TRANSACCION {
        uuid id PK
        uuid envio_id FK
        uuid transaccion_id "referencia externa"
        varchar codigo_referencia_core
        varchar estado_core
    }
```

```mermaid
classDiagram
    class EnvioCore {
        +UUID id
        +UUID loteId
        +EstadoEnvio estado
        +int intentos
        +String ultimaRespuestaCore
        +enviarConReintentos() void
    }
    class AcuseTransaccion {
        +UUID id
        +UUID transaccionId
        +String codigoReferenciaCore
        +String estadoCore
    }
    class EstadoEnvio {
        <<enumeration>>
        PENDIENTE
        ENVIADO
        CONFIRMADO
        FALLIDO
    }
    EnvioCore "1" --> "*" AcuseTransaccion
    EnvioCore --> EstadoEnvio
```

---

## 5. `notificaciones-service`

**Responsabilidad:** al recibir el evento de lote aprobado, envía un
correo a cada beneficiario incluido en el lote informando que su
transacción está en proceso.

```mermaid
erDiagram
    NOTIFICACIONES }o--|| PLANTILLAS_CORREO : usa

    NOTIFICACIONES {
        uuid id PK
        uuid lote_id "referencia externa"
        uuid transaccion_id "referencia externa"
        varchar destinatario_correo
        varchar estado_envio
        int intentos
        timestamp fecha_envio
    }
    PLANTILLAS_CORREO {
        uuid id PK
        varchar nombre
        varchar asunto
        text cuerpo_html
    }
```

```mermaid
classDiagram
    class Notificacion {
        +UUID id
        +UUID loteId
        +UUID transaccionId
        +String destinatarioCorreo
        +EstadoEnvio estadoEnvio
        +int intentos
        +enviar() void
    }
    class PlantillaCorreo {
        +UUID id
        +String nombre
        +String asunto
        +String cuerpoHtml
    }
    class EstadoEnvio {
        <<enumeration>>
        PENDIENTE
        ENVIADO
        FALLIDO
    }
    Notificacion --> PlantillaCorreo : usa
    Notificacion --> EstadoEnvio
```
