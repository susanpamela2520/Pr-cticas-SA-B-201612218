# Diagramas de Secuencia — Flujos Críticos

## 1. Aprobación de transacciones en 3 pasos (maker → checker → authorizer)

```mermaid
sequenceDiagram
    actor Maker
    actor Checker
    actor Authorizer
    participant GW as API Gateway
    participant Ing as ingesta-service
    participant Apr as aprobaciones-service
    participant Broker as Message Broker

    Maker->>GW: POST /lotes (sube CSV)
    GW->>Ing: crear lote + validar transacciones
    Ing-->>GW: 201 lote creado (estado VALIDADO)
    Ing->>Apr: crear SolicitudAprobacion(loteId)
    Apr-->>Ing: estado = PENDIENTE_CHECKER

    Note over Checker,Apr: Paso 2 - Checker
    Checker->>GW: POST /aprobaciones/{id}/decision {APROBADO}
    GW->>Apr: registrar PasoAprobacion(CHECKER)
    Apr->>Apr: verificar que Checker != Maker
    Apr-->>GW: estado = PENDIENTE_AUTHORIZER

    Note over Authorizer,Apr: Paso 3 - Authorizer
    Authorizer->>GW: POST /aprobaciones/{id}/decision {APROBADO}
    GW->>Apr: registrar PasoAprobacion(AUTHORIZER)
    Apr->>Apr: verificar que Authorizer != Maker y != Checker
    Apr->>Apr: estado = APROBADO

    Apr->>Broker: publicar evento "lote.aprobado" {loteId}
    Apr-->>GW: 200 {estado: APROBADO}
    GW-->>Authorizer: confirmación
```

**Nota:** si `Checker` o `Authorizer` rechazan en cualquier paso, el
estado pasa directo a `RECHAZADO` y el flujo termina ahí — no se
publica el evento `lote.aprobado`, así que ni la transmisión al core
bancario ni las notificaciones se disparan.

---

## 2. Envío al sistema core bancario

```mermaid
sequenceDiagram
    participant Broker as Message Broker
    participant Tra as transmision-core-service
    participant Core as Sistema Core Bancario (externo)
    participant Log as Logging centralizado

    Broker->>Tra: evento "lote.aprobado" {loteId}
    Tra->>Tra: armar payload del lote
    Tra->>Tra: crear EnvioCore(estado=PENDIENTE)

    loop hasta max intentos o exito
        Tra->>Core: POST /transacciones-lote
        alt Core responde OK
            Core-->>Tra: 200 {codigoReferencia}
            Tra->>Tra: estado = CONFIRMADO
        else timeout / error 5xx
            Tra->>Log: registrar intento fallido
            Tra->>Tra: esperar backoff exponencial
        end
    end

    alt se agotaron los reintentos
        Tra->>Tra: estado = FALLIDO
        Tra->>Log: alerta - requiere intervencion manual
    end
```

**Reutilización explícita de la P2:** este bucle de reintentos con
backoff exponencial y número máximo de intentos configurable es el
mismo patrón ya implementado y probado en `HttpAutorizacionClient`
(Práctica 2) — aquí se aplica contra el sistema core bancario en vez
de contra `authorization-service`, por la misma razón: un sistema
externo puede fallar temporalmente y no hay que rendirse al primer error.

---

## 3. Notificación a clientes

```mermaid
sequenceDiagram
    participant Broker as Message Broker
    participant Not as notificaciones-service
    participant Ing as ingesta-service
    participant SMTP as Proveedor de correo
    participant Log as Logging centralizado

    Broker->>Not: evento "lote.aprobado" {loteId}
    Not->>Ing: GET /lotes/{loteId}/transacciones
    Ing-->>Not: lista de transacciones (con beneficiario)

    loop por cada transaccion del lote
        Not->>Not: crear Notificacion(PENDIENTE)
        Not->>SMTP: enviar correo (plantilla "en_proceso")
        alt envio exitoso
            SMTP-->>Not: 200 OK
            Not->>Not: estado = ENVIADO
        else fallo de envio
            Not->>Not: estado = FALLIDO, reintentar despues
            Not->>Log: registrar fallo de notificacion
        end
    end
```
