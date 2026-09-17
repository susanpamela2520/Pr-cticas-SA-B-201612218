# Diagrama del flujo GitOps

Los diagramas están en Mermaid, que GitHub renderiza directamente.

---

## 1. Del commit al clúster

El diagrama distingue, con color, **quién aplica los cambios** (verde: solo
ArgoCD) y **dónde ocurre cada validación** (violeta).

```mermaid
flowchart TD
    subgraph CODIGO["REPOSITORIO DE CODIGO"]
        A["Desarrollador<br/>git tag v1.0.1"]
    end

    A --> P1

    subgraph PIPELINE["PIPELINE · sin acceso al cluster"]
        P1["Fase 1<br/>helm lint por ambiente"]
        P1 --> V1{"Chart valido?"}
        V1 -->|"No"| STOP1["Detenido"]
        V1 -->|"Si"| P2

        P2["Fase 2<br/>Trivy: analisis de CVE"]
        P2 --> V2{"CVE criticas<br/>con parche?"}
        V2 -->|"Si"| STOP2["PR bloqueado"]
        V2 -->|"No"| P3

        P3["Fase 3<br/>build + SBOM + firma Cosign"]
        P3 --> P4["Fase 4<br/>verificar firma"]
        P4 --> V3{"Firma valida<br/>y de este repo?"}
        V3 -->|"No"| STOP3["Detenido"]
        V3 -->|"Si"| P5

        P5["Fase 5<br/>abrir Pull Request"]
    end

    P5 --> PR

    subgraph GITOPS["REPOSITORIO GITOPS · unica fuente de verdad"]
        PR["Pull Request<br/>cambia UNA linea: la etiqueta"]
        PR --> APROB{"Aprobacion<br/>humana"}
        APROB -->|"Rechazado"| STOP4["Version no promovida"]
        APROB -->|"Fusionado"| MAIN["main actualizado"]
    end

    MAIN --> ARGO

    subgraph CLUSTER["CLUSTER · ArgoCD es el unico que aplica"]
        ARGO["ArgoCD detecta la diferencia<br/>entre repo y cluster"]
        ARGO --> KYV{"Kyverno:<br/>politicas de admision"}
        KYV -->|"No conforme"| STOP5["Admision rechazada"]
        KYV -->|"Conforme"| ROLL

        ROLL["Argo Rollouts<br/>inicia el canary"]

        ROLL --> S1["Paso 1 · 20% del trafico"]
        S1 --> AN1{"AnalysisTemplate"}
        AN1 -->|"Falla"| REV["REVERSION AUTOMATICA<br/>al estable"]
        AN1 -->|"Pasa"| S2

        S2["Paso 2 · 50%"]
        S2 --> AN2{"AnalysisTemplate"}
        AN2 -->|"Falla"| REV
        AN2 -->|"Pasa"| S3

        S3["Paso 3 · 100%"]
        S3 --> AN3{"AnalysisTemplate"}
        AN3 -->|"Falla"| REV
        AN3 -->|"Pasa"| OK["Promocion completa"]
    end

    style PIPELINE fill:#e3f2fd,stroke:#1565c0
    style GITOPS fill:#fff3e0,stroke:#e65100
    style CLUSTER fill:#e8f5e9,stroke:#2e7d32
    style REV fill:#ffebee,stroke:#c62828
    style OK fill:#c8e6c9,stroke:#2e7d32
    style STOP1 fill:#ffebee,stroke:#c62828
    style STOP2 fill:#ffebee,stroke:#c62828
    style STOP3 fill:#ffebee,stroke:#c62828
    style STOP4 fill:#ffebee,stroke:#c62828
    style STOP5 fill:#ffebee,stroke:#c62828
```

**Los cinco puntos donde el flujo se detiene** están en rojo. Ninguno
requiere intervención humana para activarse: el sistema se frena solo.

---

## 2. Quién puede escribir en el clúster

```mermaid
flowchart LR
    subgraph ANTES["Practica 7"]
        direction TB
        A1["Pipeline de GitHub Actions"]
        A1 -->|"permisos de administracion<br/>del cluster"| A2["Cluster de GKE"]
        A3["Comprometer el repositorio<br/>= comprometer la infraestructura"]
    end

    subgraph AHORA["Practica 8"]
        direction TB
        B1["Pipeline de GitHub Actions"]
        B1 -->|"solo abre un PR"| B2["Repositorio GitOps"]
        B2 -->|"lectura"| B3["ArgoCD"]
        B3 -->|"unica identidad<br/>con escritura"| B4["Cluster de GKE"]
        B5["Comprometer el repositorio<br/>no otorga acceso al cluster"]
    end

    style ANTES fill:#ffebee,stroke:#c62828
    style AHORA fill:#e8f5e9,stroke:#2e7d32
```

El pipeline mantiene una cuenta de servicio de **solo lectura**
(`pipeline-lector`, definida en Terraform) por si necesita consultar
estado, pero no puede crear, modificar ni eliminar nada.

---

## 3. Anatomía de la reversión

```mermaid
sequenceDiagram
    participant PR as PR fusionado
    participant AC as ArgoCD
    participant AR as Argo Rollouts
    participant CAN as Pods canary
    participant AN as AnalysisRun
    participant EST as Pods estables

    PR->>AC: main actualizado con v1.0.2
    AC->>AR: aplica el Rollout
    AR->>CAN: crea ReplicaSet de v1.0.2
    AR->>AR: setWeight 20

    Note over CAN,EST: 20% del trafico al canary,<br/>80% al estable

    AR->>AN: inicia el analisis
    AN->>CAN: GET /health
    CAN-->>AN: HTTP 500

    Note over AN: failureLimit 0<br/>un solo fallo aborta

    AN-->>AR: AnalysisRun Failed
    AR->>AR: aborta la promocion
    AR->>EST: devuelve el 100% del trafico
    AR->>CAN: reduce el ReplicaSet a 0

    Note over PR,EST: Trafico maximo afectado: 20%<br/>Sin intervencion humana
```

---

## 4. Dónde vive cada secreto

```mermaid
flowchart TB
    subgraph LOCAL["Maquina del operador"]
        L1["secretos.env<br/>en claro"]
        L2["kubeseal + certificado publico"]
        L1 --> L2
    end

    subgraph REPO["Repositorio GitOps · PUBLICO"]
        R1["sealed-secrets.yaml<br/>cifrado"]
    end

    subgraph CLUSTER["Cluster"]
        C1["Controlador de Sealed Secrets<br/>llave privada"]
        C2["Secret de Kubernetes<br/>descifrado"]
        C3["Pods del api-gateway"]
        C1 --> C2
        C2 --> C3
    end

    L2 -->|"cifra"| R1
    R1 -->|"ArgoCD aplica"| C1
    L1 -.->|"se BORRA<br/>tras cifrar"| X["Eliminado"]

    style REPO fill:#fff3e0,stroke:#e65100
    style CLUSTER fill:#e8f5e9,stroke:#2e7d32
    style X fill:#ffebee,stroke:#c62828
```

La llave privada **nunca sale del clúster**, por lo que el archivo cifrado
es seguro de versionar en un repositorio público: solo el controlador puede
descifrarlo.

---

## 5. Los tres controles de admisión

```mermaid
flowchart LR
    POD["Pod propuesto<br/>por ArgoCD"] --> K["Webhook de<br/>admision de Kyverno"]

    K --> P1{"Etiqueta<br/>distinta de latest?"}
    P1 -->|"No"| R1["Rechazado:<br/>disallow-latest-tag"]
    P1 -->|"Si"| P2

    P2{"Declara requests<br/>y limits?"}
    P2 -->|"No"| R2["Rechazado:<br/>require-resource-limits"]
    P2 -->|"Si"| P3

    P3{"runAsNonRoot<br/>y sin escalada?"}
    P3 -->|"No"| R3["Rechazado:<br/>require-run-as-nonroot"]
    P3 -->|"Si"| OK["Admitido<br/>al cluster"]

    style R1 fill:#ffebee,stroke:#c62828
    style R2 fill:#ffebee,stroke:#c62828
    style R3 fill:#ffebee,stroke:#c62828
    style OK fill:#c8e6c9,stroke:#2e7d32
```

Las políticas se aplican en modo `Enforce` solo en el namespace de
producción, etiquetado `sa-platform/aplicar-politicas: bloquear`. En
staging auditan sin bloquear, para detectar problemas sin frenar la
iteración.

---

## 6. Frontera entre Terraform y ArgoCD

```mermaid
flowchart TB
    subgraph TF["TERRAFORM · lo que cambia rara vez"]
        T1["Namespaces<br/>con sus etiquetas"]
        T2["ResourceQuota"]
        T3["LimitRange"]
        T4["Roles y RoleBindings"]
    end

    subgraph AC["ARGOCD · lo que cambia en cada despliegue"]
        A1["Rollouts"]
        A2["Services"]
        A3["ConfigMaps"]
        A4["ClusterPolicies"]
        A5["Sealed Secrets"]
    end

    T1 -->|"las etiquetas deciden<br/>donde Kyverno bloquea"| A4
    T4 -->|"otorga permiso<br/>de escritura"| AC

    OP["Operador<br/>terraform apply"] --> TF
    PRM["PR fusionado<br/>en el repo GitOps"] --> AC

    style TF fill:#e3f2fd,stroke:#1565c0
    style AC fill:#e8f5e9,stroke:#2e7d32
```

La Application de ArgoCD lleva `CreateNamespace=false` a propósito: si
ArgoCD creara los namespaces, se perderían las etiquetas que Kyverno
necesita para distinguir producción de staging.
