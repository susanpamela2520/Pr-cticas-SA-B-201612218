# Práctica 9 — Continuidad operativa y recuperación ante desastres

**Carné:** 201612218 · **Sección:** B

## Tabla de enlaces

| Ítem | Enlace o dato |
|---|---|
| Repositorio GitOps | https://github.com/susanpamela2520/Pr-cticas-SA-B-201612218-gitops |
| Aplicación raíz en ArgoCD | `sa-platform-root`, namespace `argocd` |
| Punto de entrada del bootstrap | `P9/bootstrap/bootstrap.sh` |
| Backend remoto de Terraform | Google Cloud Storage, bucket `sa-p9-tfstate-201612218`, prefijo `p9/estado`, con versionado de objetos |
| Schedule de Velero | `respaldo-diario` y `respaldo-datos-horario` → `gs://sa-p9-respaldos-201612218` |
| Reconstrucción cronometrada | `P9/evidencia/reconstruccion.log` |
| Restauración de datos | `P9/evidencia/restauracion-datos.log` |
| Prueba de pérdida de nodo | `P9/evidencia/drenaje-nodo.log` |
| RTO y RPO declarados | RTO 45 min · RPO 1 h — medidos en `P9/INFORME-DR.md` |
| Video demostrativo | PENDIENTE |

## Qué cambia respecto a la Práctica 8

La P8 desplegaba de forma controlada, pero nunca había sido sometida a una
pérdida real. Tres debilidades:

| Debilidad | Cómo se resuelve aquí |
|---|---|
| Los volúmenes de la base de datos no se respaldaban | Velero con calendario, retención y destino externo al clúster |
| El estado de Terraform vivía en una sola máquina | Backend en Cloud Storage con versionado |
| La llave de los secretos solo existía dentro del clúster | Respaldo y restauración documentados y automatizados en el bootstrap |

Además, Terraform pasó de preparar namespaces sobre un clúster existente a
**provisionar el clúster completo** e instalar ArgoCD, Argo Rollouts,
Kyverno, Sealed Secrets y Velero, de modo que la reconstrucción arranca
desde un único punto de entrada.

## Estructura

| Ruta | Contenido |
|---|---|
| `terraform/` | Clúster, componentes de plataforma, namespaces, cuotas y RBAC |
| `bootstrap/bootstrap.sh` | Punto de entrada único de reconstrucción |
| `bootstrap/root-app.yaml` | Aplicación raíz del patrón app-of-apps |
| `bootstrap/respaldar-llave.sh` | Exporta la llave de Sealed Secrets |
| `bootstrap/restaurar-llave.sh` | La reinstala antes de que ArgoCD aplique nada |
| `velero/schedule.yaml` | Respaldo diario completo y horario de la base de datos |
| `resiliencia/` | PodDisruptionBudget y notas de anti-afinidad |
| `runbook/RUNBOOK.md` | Procedimiento ejecutable por un tercero |
| `tests/verificar-datos.sh` | Siembra y verifica contenido real de la base |
| `tests/drenaje-nodo.sh` | Drena un nodo sondeando el servicio en bucle |
| `INFORME-DR.md` | Objetivos declarados y resultados medidos |
| `DIAGRAMA.md` | Orden de reconstrucción y dependencias |
| `evidencia/` | Registros con marcas de tiempo |
| `img/` | Capturas |

## Reconstrucción en un comando

```bash
bash P9/bootstrap/bootstrap.sh 2>&1 | tee P9/evidencia/reconstruccion.log
```

Requisito previo, y el único paso manual fuera del script: el bucket del
estado debe existir, porque Terraform necesita dónde guardar su estado
antes de crear nada.

```bash
gcloud storage buckets create gs://sa-p9-tfstate-201612218 \
  --location=us-central1 --project=p6-sa2s2026 --uniform-bucket-level-access
gcloud storage buckets update gs://sa-p9-tfstate-201612218 --versioning
```

## Objetivos

| Objetivo | Valor | De dónde sale |
|---|---|---|
| RTO | 45 min | Suma de las fases medibles del bootstrap, más margen |
| RPO | 1 h | Cadencia del respaldo horario de la base de datos |

Ambos se declararon antes de ejecutar la prueba. El razonamiento completo
está en la sección 1 del informe.

## Límites conocidos

Presentar el sistema como plenamente recuperable sería inexacto:

- El respaldo de la llave de Sealed Secrets vive en la máquina del
  operador. Si esa máquina se pierde junto con el clúster, los secretos son
  irrecuperables.
- El bootstrap requiere una credencial de Google Cloud obtenida a mano, así
  que la reconstrucción no puede dispararse de forma desatendida.
- La cola de RabbitMQ no se respalda: los eventos publicados y no
  consumidos se pierden.
- El RPO de una hora aplica a la base de datos. El resto de la plataforma
  se respalda a diario, con un RPO de 24 horas.
