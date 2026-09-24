# Práctica 9 — Continuidad operativa y recuperación ante desastres

**Carné:** 201612218 · **Sección:** B

## Tabla de enlaces

| Ítem | Enlace o dato |
|---|---|
| Repositorio GitOps | https://github.com/susanpamela2520/Pr-cticas-SA-B-201612218-gitops |
| Aplicación raíz en ArgoCD | `sa-platform-root` en el namespace `argocd` |
| Punto de entrada del bootstrap | `P9/bootstrap/bootstrap.sh` |
| Backend remoto de Terraform | Google Cloud Storage, bucket `PENDIENTE`, prefijo `p9/estado` |
| Schedule de Velero | `respaldo-diario` → bucket `PENDIENTE` |
| Reconstrucción cronometrada | `P9/evidencia/reconstruccion.log` |
| Restauración de datos | `P9/evidencia/restauracion-datos.log` |
| Prueba de pérdida de nodo | `P9/evidencia/drenaje-nodo.log` |
| RTO y RPO declarados | RTO objetivo 45 min / medido `PENDIENTE` · RPO objetivo 24 h / medido `PENDIENTE` |
| Video demostrativo | `PENDIENTE` |

## Contenido de esta carpeta

| Ruta | Qué contiene |
|---|---|
| `terraform/` | Infraestructura con backend remoto y bloqueo de estado |
| `bootstrap/` | Punto de entrada único de reconstrucción |
| `velero/` | Schedule de respaldos, retención y destino |
| `resiliencia/` | PodDisruptionBudget y anti-afinidad |
| `runbook/RUNBOOK.md` | Procedimiento ejecutable por un tercero |
| `tests/` | Scripts de verificación de datos y de drenaje de nodo |
| `INFORME-DR.md` | Informe de la prueba, según la plantilla del enunciado |
| `DIAGRAMA.md` | Orden de reconstrucción y dependencias |
| `evidencia/` | Registros con marcas de tiempo |
