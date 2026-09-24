#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# PUNTO DE ENTRADA UNICO DE RECONSTRUCCION
#
# Un solo comando reconstruye el sistema completo. No hay pasos manuales
# intermedios: Terraform provisiona el cluster e instala ArgoCD, Argo
# Rollouts, Kyverno, Sealed Secrets y Velero; a partir de ahi la aplicacion
# raiz levanta todo lo demas.
#
# Uso:
#   bash P9/bootstrap/bootstrap.sh 2>&1 | tee P9/evidencia/reconstruccion.log
#
# Requisito previo, documentado en el runbook: el bucket del estado remoto
# debe existir. Es el unico recurso que no puede crearse a si mismo, porque
# Terraform necesita donde guardar su estado antes de crear nada.
# ---------------------------------------------------------------------------
set -euo pipefail

marca() { echo ""; echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $1"; }

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
TF="$RAIZ/P9/terraform"

marca "INICIO DE LA RECONSTRUCCION"

marca "1/6  Terraform: inicializando con estado remoto"
cd "$TF"
terraform init -input=false

marca "2/6  Terraform: provisionando cluster y componentes de plataforma"
terraform apply -auto-approve -input=false

marca "3/6  Obteniendo credenciales del cluster"
gcloud container clusters get-credentials \
  "$(terraform output -raw nombre_cluster)" \
  --zone "$(terraform output -raw zona)" \
  --project "$(terraform output -raw proyecto)"

marca "4/6  Restaurando la llave de Sealed Secrets"
# Antes de que ArgoCD aplique nada: si los SealedSecrets llegan primero, el
# controlador no puede descifrarlos y los pods quedan en
# CreateContainerConfigError.
bash "$RAIZ/P9/bootstrap/restaurar-llave.sh"

marca "5/6  Aplicando la aplicacion raiz (app-of-apps)"
kubectl apply -f "$RAIZ/P9/bootstrap/root-app.yaml"

marca "6/6  Esperando a que la plataforma quede sincronizada"
for i in $(seq 1 60); do
  ESTADO=$(kubectl get application sa-platform-prod -n argocd \
    -o jsonpath='{.status.health.status}' 2>/dev/null || echo "ausente")
  echo "  [$(date -u '+%H:%M:%S')] sa-platform-prod: $ESTADO"
  [ "$ESTADO" = "Healthy" ] && break
  sleep 20
done

kubectl get applications -n argocd
kubectl get pods -n sa-prod

marca "FIN DE LA RECONSTRUCCION"
echo ""
echo "El RTO es la diferencia entre las marcas de INICIO y FIN."
echo "Los datos se restauran por separado; ver P9/runbook/RUNBOOK.md seccion 2."
