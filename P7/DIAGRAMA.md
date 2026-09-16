# Diagrama del pipeline CI/CD

Los diagramas están en Mermaid, que GitHub renderiza directamente en la
vista del repositorio.

---

## 1. Flujo completo con las cuatro fases

```mermaid
flowchart TD
    subgraph DEV["Desarrollo"]
        A["Commit del desarrollador"]
        A -->|"push a rama feature"| PR["Pull Request hacia main"]
        A -->|"merge a main"| MAIN["Rama main"]
        A -->|"git tag vX.Y.Z"| TAG["Tag de version"]
    end

    PR --> F1
    MAIN --> F1
    TAG --> F1

    subgraph FASE1["FASE 1 · Build y pruebas unitarias"]
        F1["Matriz de 6 jobs en paralelo"]
        F1 --> F1A["Detectar lenguaje del servicio"]
        F1A --> F1B["Instalar dependencias<br/>npm ci / pip install"]
        F1B --> F1C["Compilar<br/>npm run build"]
        F1C --> F1D["Ejecutar pruebas<br/>npm test / pytest"]
        F1D --> F1E["Verificar que el Dockerfile compila"]
    end

    subgraph FASE2["FASE 2 · Validacion de manifiestos"]
        F2["helm dependency update"]
        F2 --> F2A["helm lint"]
        F2A --> F2B["helm template<br/>renderiza el chart"]
        F2B --> F2C["pytest sobre los manifiestos<br/>15 pruebas de contrato"]
    end

    F1E --> GATE{"Ambas fases<br/>en verde?"}
    F2C --> GATE

    GATE -->|"No"| STOP["Pipeline detenido<br/>no se publica nada"]
    GATE -->|"Si, y no es un PR"| FASE3
    GATE -->|"Si, pero es un PR"| ONLYCI["Fin: el PR queda validado"]

    subgraph FASE3["FASE 3 · Dockerizacion y publicacion"]
        F3["Matriz de 6 jobs en paralelo"]
        F3 --> F3A["Autenticarse en GHCR<br/>con GITHUB_TOKEN"]
        F3A --> F3B["docker build con cache de capas"]
        F3B --> F3C["Etiquetar:<br/>sha-abc1234 · main · 1.0.0 · latest"]
        F3C --> F3D["docker push a GHCR"]
    end

    FASE3 --> FASE4

    subgraph FASE4["FASE 4 · Despliegue automatico"]
        F4["Autenticarse en GCP<br/>con la cuenta de servicio"]
        F4 --> F4A["get-gke-credentials<br/>conecta kubectl al cluster"]
        F4A --> F4B["Reconstruir values-secrets<br/>desde GitHub Secrets"]
        F4B --> F4C["helm upgrade --install --wait<br/>con las etiquetas del commit"]
        F4C --> F4D["kubectl rollout status"]
        F4D --> F4E["Prueba de humo<br/>curl a la IP publica"]
    end

    F4E --> OK["Sistema actualizado<br/>y verificado en produccion"]
    F4E -->|"no responde 200"| FAIL["Pipeline en rojo"]

    style FASE1 fill:#e3f2fd,stroke:#1565c0
    style FASE2 fill:#f3e5f5,stroke:#6a1b9a
    style FASE3 fill:#fff3e0,stroke:#e65100
    style FASE4 fill:#e8f5e9,stroke:#2e7d32
    style STOP fill:#ffebee,stroke:#c62828
    style FAIL fill:#ffebee,stroke:#c62828
    style OK fill:#e8f5e9,stroke:#2e7d32
```

---

## 2. Qué se ejecuta según el disparador

```mermaid
flowchart LR
    PR["Pull Request"] --> P1["Fase 1<br/>Build y test"]
    P1 --> P2["Fase 2<br/>Validacion"]
    P2 --> PFIN["Fin<br/>sin publicar"]

    MAIN["Push a main"] --> M1["Fase 1"]
    M1 --> M2["Fase 2"]
    M2 --> M3["Fase 3<br/>tags: sha · main · latest"]
    M3 --> M4["Fase 4<br/>Despliegue"]

    TAG["Tag v1.0.0"] --> T1["Fase 1"]
    T1 --> T2["Fase 2"]
    T2 --> T3["Fase 3<br/>tags: sha · 1.0.0 · 1.0"]
    T3 --> T4["Fase 4<br/>Despliegue"]

    style PFIN fill:#fff3e0,stroke:#e65100
    style M4 fill:#e8f5e9,stroke:#2e7d32
    style T4 fill:#e8f5e9,stroke:#2e7d32
```

El principio: **cuanto más cerca de producción, más garantías se exigen**.
Un Pull Request solo necesita compilar y pasar pruebas; llegar al clúster
exige además haber pasado la revisión y el merge.

---

## 3. Dónde vive cada credencial

```mermaid
flowchart TB
    subgraph REPO["Repositorio de GitHub (publico)"]
        R1["Codigo fuente"]
        R2["ci-cd.yml"]
        R3["values.yaml · values-gke.yaml"]
        R4["values-ci.yaml<br/>valores ficticios"]
    end

    subgraph SECRETS["GitHub Secrets (cifrado)"]
        S1["GCP_SA_KEY<br/>llave de la cuenta de servicio"]
        S2["HELM_VALUES_SECRETS<br/>credenciales de la aplicacion"]
        S3["GITHUB_TOKEN<br/>generado por ejecucion"]
    end

    subgraph RUNNER["Runner efimero de Actions"]
        E1["/tmp/values-secrets.yaml"]
        E2["kubeconfig temporal"]
    end

    subgraph NUBE["Google Cloud"]
        N1["GKE · sa-p6-cluster"]
        N2["Secrets de Kubernetes"]
    end

    subgraph GHCR["GitHub Container Registry"]
        G1["6 imagenes publicas"]
    end

    S1 --> E2
    S2 --> E1
    S3 --> G1
    E1 --> N2
    E2 --> N1
    R2 --> RUNNER
    G1 --> N1

    style SECRETS fill:#fff3e0,stroke:#e65100
    style RUNNER fill:#e3f2fd,stroke:#1565c0
```

Ninguna credencial real se guarda en el repositorio. El runner es
efímero: se destruye al terminar la ejecución y con él los archivos
temporales.

---

## 4. Comparación: antes y después del pipeline

```mermaid
flowchart LR
    subgraph ANTES["Practica 6 · Proceso manual"]
        direction TB
        A1["docker build x6"] --> A2["docker push x6"]
        A2 --> A3["helm upgrade a mano"]
        A3 --> A4["curl para verificar"]
        A4 --> A5["~25 min<br/>y errores humanos"]
    end

    subgraph DESPUES["Practica 7 · Automatizado"]
        direction TB
        B1["git push"] --> B2["El pipeline hace<br/>todo lo anterior"]
        B2 --> B3["~8 min<br/>reproducible y auditable"]
    end

    ANTES -.->|"automatizacion"| DESPUES

    style ANTES fill:#ffebee,stroke:#c62828
    style DESPUES fill:#e8f5e9,stroke:#2e7d32
```

En la P6, cada uno de esos pasos se ejecutó a mano y varios fallaron por
razones que solo se descubrieron a mitad del proceso (nombre de repositorio
equivocado, tipo de Service incorrecto, política de red incompleta). El
pipeline convierte ese proceso en algo repetible: la misma secuencia, en
el mismo orden, con las mismas verificaciones, cada vez.
