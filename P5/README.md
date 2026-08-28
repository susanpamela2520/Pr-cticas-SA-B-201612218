# Práctica 5 — Orquestación Avanzada de Microservicios en Kubernetes con Helm

Empaqueta el sistema de tickets de soporte (Práctica 4) como un chart
de Helm único, parametrizable por ambiente, con persistencia durable,
comunicación asíncrona real, aislamiento de red, y escalado automático.

## ⚠️ Léeme primero

Este proyecto se construyó **sin acceso a un clúster de Kubernetes ni
al binario de Helm** (limitación del entorno donde se escribió). Todo
el código de aplicación (los 5 servicios) sí se probó de verdad contra
PostgreSQL y RabbitMQ reales — incluyendo el flujo asíncrono completo
de punta a punta. El chart de Helm en sí (`charts/`) se escribió con
cuidado pero **no se ejecutó ni una sola vez antes de entregártelo**.
Por eso tu primer paso, sin excepción, tiene que ser
`helm lint` / `helm template` (ver `docs/02-comandos-reproducibles.md`,
sección 0).

## Índice

| Documento | Contenido |
|---|---|
| [`docs/01-arquitectura.md`](./docs/01-arquitectura.md) | Diagrama de arquitectura: interno/externo, sync/async, límites de NetworkPolicy |
| [`docs/02-comandos-reproducibles.md`](./docs/02-comandos-reproducibles.md) | **Empieza aquí** — de cero a funcionando, paso a paso |
| [`docs/03-imagenes-comparacion.md`](./docs/03-imagenes-comparacion.md) | Plantilla para la tabla de tamaño de imágenes antes/después |
| [`docs/04-tecnologias-y-decisiones.md`](./docs/04-tecnologias-y-decisiones.md) | Justificación técnica, y la nota importante sobre Bitnami |
| [`docs/05-evidencias.md`](./docs/05-evidencias.md) | Comandos exactos para cada evidencia que pide la rúbrica |
| [`docs/06-preguntas-teoricas.md`](./docs/06-preguntas-teoricas.md) | Las 8 preguntas teóricas, respondidas |
| `PROMPTS.md` | Documentación de prompts de IA usados |

## Estructura del repositorio

```
P5/
├── auth-service/            (Node.js/TypeScript)
├── tickets-service/         (Python/FastAPI)
├── comentarios-service/     (Node.js/TypeScript)
├── notificaciones-service/  (Python/FastAPI, sin BD)
├── api-gateway/             (Node.js/TypeScript)
├── cronjobs/                (imagen compartida Alpine + scripts)
├── loadtest/                (script de k6)
├── charts/                  (el chart de Helm — chart padre + subcharts)
│   ├── Chart.yaml
│   ├── values.yaml / values-dev.yaml / values-prod.yaml / values.example.yaml
│   ├── templates/           (recursos del chart padre: quotas, networkpolicies, cronjobs)
│   └── charts/              (subcharts: db, broker, y los 5 servicios)
└── docs/
```

## Los 4 microservicios + Gateway (heredados de la Práctica 4)

| Servicio | Lenguaje | Rol |
|---|---|---|
| `auth-service` | Node.js/TypeScript | Login, JWT, cifrado AES |
| `tickets-service` | Python/FastAPI | CRUD de tickets + **publica** a RabbitMQ |
| `comentarios-service` | Node.js/TypeScript | Comentarios sobre tickets |
| `notificaciones-service` | Python/FastAPI | **Consume** de RabbitMQ, sin BD |
| `api-gateway` | Node.js/TypeScript | Único punto de entrada |

## Lo nuevo de esta práctica

- Chart de Helm único (`sa-platform`) con 7 subcharts (`db`, `broker`,
  los 4 microservicios, `api-gateway`)
- El flujo "ticket resuelto → notificación" ahora es **asíncrono de
  verdad** vía RabbitMQ (antes, en la P4, era una llamada HTTP directa)
- 2 CronJobs encadenados por el broker (el segundo consume lo que
  genera el primero, resume, y publica — otro consumidor lo guarda)
- NetworkPolicies, RBAC de mínimo privilegio, `securityContext`
  restrictivo, HPA, PodDisruptionBudget, ResourceQuota/LimitRange
- Dockerfiles multi-stage para las 6 imágenes
