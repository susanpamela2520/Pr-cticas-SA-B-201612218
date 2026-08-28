# Diagrama de Arquitectura

```mermaid
flowchart TB
    Usuario["Usuario / cliente HTTP<br/>(fuera del cluster)"]

    subgraph Externo["Fuera del cluster"]
        Usuario
    end

    subgraph Cluster["Dentro del cluster de Kubernetes (namespace sa-p5)"]
        Ingress["Ingress (NGINX)<br/>host: sa-p5.local"]

        Gateway["api-gateway<br/>2-5 replicas (HPA)"]

        subgraph Sync["Microservicios (llamadas sincronas via Service)"]
            Auth["auth-service<br/>2-5 replicas"]
            Tickets["tickets-service<br/>2-5 replicas"]
            Coment["comentarios-service<br/>2-5 replicas"]
            Notif["notificaciones-service<br/>2-5 replicas"]
        end

        DB[("db (StatefulSet + PVC)<br/>PostgreSQL")]
        Broker(["broker (Deployment)<br/>RabbitMQ"])

        CronReg["CronJob: cronjob-registro<br/>cada 2 min"]
        CronRes["CronJob: cronjob-resumen<br/>cada 10 min"]
    end

    Usuario -->|"HTTPS/HTTP"| Ingress
    Ingress -->|"unico backend permitido"| Gateway

    Gateway -->|"sincrono"| Auth
    Gateway -->|"sincrono"| Tickets
    Gateway -->|"sincrono"| Coment
    Gateway -->|"sincrono"| Notif

    Auth --> DB
    Tickets --> DB
    Coment --> DB

    Tickets -. "asincrono: publica evento<br/>ticket.resuelto y retorna" .-> Broker
    Broker -. "asincrono: entrega el evento<br/>cuando el consumidor este listo" .-> Notif

    CronReg -->|"INSERT"| DB
    CronRes -->|"SELECT (lee lo de CronReg)"| DB
    CronRes -. "asincrono: publica resumen" .-> Broker
    Broker -. "asincrono: entrega el resumen" .-> Tickets
```

## Elementos internos vs. externos al clúster

| Externo al clúster | Interno al clúster |
|---|---|
| El cliente HTTP (navegador, Postman, k6) | Ingress, api-gateway, los 4 microservicios, db, broker, los 2 cronjobs |
| El repositorio de imágenes Docker (solo durante `docker build`, dentro de minikube en este caso) | Todo lo demás |

## Flujos síncronos vs. asíncronos

- **Síncronos** (línea sólida en el diagrama): Ingress → api-gateway →
  cada microservicio. El cliente espera la respuesta antes de continuar.
- **Asíncronos** (línea punteada): `tickets-service → broker → notificaciones-service`
  (evento de ticket resuelto) y `cronjob-resumen → broker → tickets-service`
  (resumen del cronjob). En ambos casos, quien publica **no espera** a
  que el consumidor procese el mensaje — sigue de inmediato.

## Límites impuestos por las NetworkPolicies

```mermaid
flowchart LR
    Ingress2["Ingress Controller<br/>(otro namespace)"] -->|permitido| GW["api-gateway"]
    GW -->|permitido| Servicios["auth / tickets / comentarios / notificaciones"]
    Servicios -->|"permitido SOLO<br/>desde auth/tickets/comentarios/cronjobs"| DB2[("db")]
    Servicios -->|"permitido SOLO<br/>desde tickets/notificaciones/cronjob-resumen"| BK["broker"]

    GW -.->|"BLOQUEADO"| DB2
    GW -.->|"BLOQUEADO"| BK
    Servicios -.->|"BLOQUEADO entre si<br/>(ej. notificaciones -> comentarios)"| Servicios
```

En palabras: por defecto **nadie puede hablarle a nadie** (deny-all).
Encima de eso se agregan 4 excepciones explícitas: Ingress→Gateway,
Gateway→(los 4 servicios), (auth/tickets/comentarios/cronjobs)→db, y
(tickets/notificaciones/cronjob-resumen)→broker. Cualquier otra
combinación (por ejemplo, `api-gateway` intentando hablarle directo a
`db`, o `notificaciones-service` a `comentarios-service`) queda
bloqueada — ver `docs/05-evidencias.md` punto 4 para la prueba en vivo.
