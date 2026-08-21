# Diagrama de Despliegue

```mermaid
flowchart TB
    subgraph Host["Maquina host (donde corre docker compose up)"]
        subgraph DockerNet["Red Docker: helpdesk_p4_default"]
            direction TB

            C1["Contenedor: db<br/>imagen postgres:16<br/>puerto interno 5432"]
            C2["Contenedor: auth-service<br/>imagen construida desde ./auth-service/Dockerfile<br/>Node 20-alpine<br/>puerto interno 3001"]
            C3["Contenedor: tickets-service<br/>imagen construida desde ./tickets-service/Dockerfile<br/>Python 3.12-slim<br/>puerto interno 8001"]
            C4["Contenedor: comentarios-service<br/>imagen construida desde ./comentarios-service/Dockerfile<br/>Node 20-alpine<br/>puerto interno 3002"]
            C5["Contenedor: notificaciones-service<br/>imagen construida desde ./notificaciones-service/Dockerfile<br/>Python 3.12-slim<br/>puerto interno 8002"]
            C6["Contenedor: api-gateway<br/>imagen construida desde ./api-gateway/Dockerfile<br/>Node 20-alpine<br/>puerto interno 8080"]

            C2 --> C1
            C3 --> C1
            C4 --> C1
            C6 --> C2
            C6 --> C3
            C6 --> C4
            C6 --> C5
            C3 -. directo .-> C5
        end

        V[("Volumen: helpdesk_db_data<br/>persiste los datos de Postgres<br/>entre reinicios")]
        C1 --- V
    end

    Dev["Maquina del desarrollador<br/>(navegador / Postman)"]
    Dev -->|"localhost:8080"| C6
    Dev -.->|"localhost:3001/3002/8001/8002<br/>(solo debugging)"| C2
```

## Puertos publicados hacia el host

| Servicio | Puerto en el host | Puerto interno (red Docker) |
|---|---|---|
| `api-gateway` | **8080** (el que se usa normalmente) | 8080 |
| `auth-service` | 3001 (debugging) | 3001 |
| `tickets-service` | 8001 (debugging) | 8001 |
| `comentarios-service` | 3002 (debugging) | 3002 |
| `notificaciones-service` | 8002 (debugging) | 8002 |
| `db` (PostgreSQL) | 5434 (debugging con un cliente SQL externo) | 5432 |

Dentro de la red Docker, los servicios se llaman entre sí **por nombre
de contenedor** (`db`, `auth-service`, `tickets-service`, etc.), no por
`localhost` — Docker Compose crea un DNS interno automático que
resuelve el nombre del servicio a su IP dentro de la red. Por eso las
variables de entorno en `docker-compose.yml` usan
`http://auth-service:3001` y no `http://localhost:3001` (ese valor
`localhost` solo se usa en los `.env.example` para correr cada
servicio individualmente, fuera de Docker).

## Cómo levantar todo (un solo comando)

```bash
cd P4
cp .env.example .env
docker compose up -d --build
```

El `healthcheck` de `db` hace que los demás contenedores esperen a que
PostgreSQL esté realmente listo para aceptar conexiones antes de
arrancar (`depends_on: condition: service_healthy`), evitando el error
típico de "arrancar antes de que la base de datos esté lista".
