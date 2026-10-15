# Diagrama del flujo de telemetría

## 1. De la señal al tablero y a la alerta

```mermaid
flowchart LR
    subgraph SERV["Servicios · namespace sa-prod"]
        S1["api-gateway<br/>SDK OpenTelemetry"]
        S2["auth-service<br/>SDK OpenTelemetry"]
        S3["tickets-service<br/>SDK OpenTelemetry"]
    end

    subgraph COL["Recolección"]
        OC["OTel Collector<br/>OTLP 4317/4318"]
        PT["Promtail<br/>lee stdout de los pods"]
    end

    subgraph ALM["Almacenamiento"]
        PR["Prometheus<br/>métricas"]
        TE["Tempo<br/>trazas"]
        LO["Loki<br/>registros JSON"]
    end

    subgraph USO["Consumo"]
        GR["Grafana<br/>tablero"]
        AM["Alertmanager<br/>alertas"]
        AR["Argo Rollouts<br/>decide la promoción"]
    end

    S1 -->|"trazas + métricas"| OC
    S2 --> OC
    S3 --> OC
    S1 -.->|"stdout JSON<br/>con trace_id"| PT
    S2 -.-> PT
    S3 -.-> PT

    OC -->|"OTLP"| TE
    OC -->|"expone :8889"| PR
    PT --> LO

    PR --> GR
    TE --> GR
    LO --> GR
    PR -->|"reglas de alerta"| AM
    PR -->|"PromQL del AnalysisRun"| AR

    style SERV fill:#e3f2fd,stroke:#1565c0
    style ALM fill:#fff3e0,stroke:#e65100
    style USO fill:#e8f5e9,stroke:#2e7d32
```

El detalle que importa: **Prometheus alimenta a Argo Rollouts**. Esa flecha
es la diferencia con la Práctica 8, donde la promoción la decidía un Job
con `curl` que no medía tráfico real.

---

## 2. El recorrido del síntoma a la causa

```mermaid
flowchart TD
    A["Usuario reporta lentitud<br/>o se dispara una alerta"] --> B

    B["ALERTA<br/>LatenciaFueraDeSLO"] --> C
    C["Anotación runbook_url<br/>lleva al procedimiento"] --> D

    D["MÉTRICA<br/>¿qué servicio tiene el p95 alto?"] --> E
    E["TRAZA<br/>Tempo: ordenar por duración<br/>abrir la más lenta"] --> F
    F["¿Qué span consume el tiempo?"] --> G

    G["REGISTRO<br/>'Logs for this span'<br/>salta a Loki por trace_id"] --> H
    H["Mensaje de error real<br/>con su contexto"]

    style B fill:#ffebee,stroke:#c62828
    style D fill:#e3f2fd,stroke:#1565c0
    style E fill:#f3e5f5,stroke:#6a1b9a
    style G fill:#fff3e0,stroke:#e65100
    style H fill:#e8f5e9,stroke:#2e7d32
```

Sin correlación, el paso de E a G obliga a revisar los registros servicio
por servicio adivinando cuál falló. Con el `trace_id` en cada línea JSON,
es un clic.

---

## 3. Qué gobierna la promoción del canary

```mermaid
sequenceDiagram
    participant AR as Argo Rollouts
    participant CAN as Pods canary
    participant US as Usuarios reales
    participant PR as Prometheus
    participant AN as AnalysisRun

    AR->>CAN: crea ReplicaSet<br/>hash abc123
    AR->>AR: setWeight 20

    US->>CAN: 20% del tráfico real
    CAN->>PR: http_requests_total{hash="abc123"}
    CAN->>PR: http_request_duration_seconds

    AR->>AN: inicia análisis (hash=abc123)
    AN->>PR: PromQL filtrado por hash
    PR-->>AN: p95 = 1.24s

    Note over AN: umbral 0.5s<br/>medición fallida

    AN-->>AR: AnalysisRun Failed
    AR->>CAN: aborta y escala a 0
    AR->>AR: 100% al estable

    Note over AR,US: Sin intervención humana<br/>Máx. 20% del tráfico afectado
```

El filtro por `rollouts_pod_template_hash` es lo que permite medir **solo**
el canary. Sin él, con el canary al 20 %, una versión que fallara por
completo movería el promedio global apenas al 20 % de error — por debajo
del umbral. El defecto pasaría.

---

## 4. Los cuatro señales de oro en el tablero

```mermaid
flowchart LR
    subgraph T["Tablero de operación"]
        L["LATENCIA<br/>p95 por servicio<br/>línea de SLO"]
        TR["TRÁFICO<br/>peticiones/s<br/>por ruta"]
        E["ERRORES<br/>tasa 5xx<br/>presupuesto consumido"]
        S["SATURACIÓN<br/>CPU vs requests<br/>réplicas del HPA"]
    end

    L --> P["¿El usuario<br/>espera demasiado?"]
    TR --> Q["¿Cuánta carga<br/>hay ahora?"]
    E --> R["¿Cuánto margen<br/>queda este mes?"]
    S --> U["¿Aguanta<br/>más carga?"]

    style T fill:#e8f5e9,stroke:#2e7d32
```

Cada panel responde una pregunta concreta de operación. El tablero no
muestra todas las métricas disponibles: muestra las cuatro que deciden si
hay que intervenir.
