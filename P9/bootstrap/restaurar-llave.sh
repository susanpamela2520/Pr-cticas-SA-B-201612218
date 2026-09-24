#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# CONTINUIDAD DE LOS SECRETOS
#
# El repositorio GitOps contiene los secretos cifrados, pero la llave que los
# descifra vive dentro del clúster. Si el clúster se pierde y la llave no se
# restaura, el repositorio queda lleno de contenido ilegible: los
# SealedSecrets nunca se descifran y los pods no arrancan.
#
# Este script restaura la llave ANTES de que ArgoCD aplique los manifiestos.
#
# El respaldo de la llave se genera con:
#   bash P9/bootstrap/respaldar-llave.sh
#
# El archivo resultante contiene una llave privada: NO se versiona. Debe
# guardarse en un gestor de secretos o en almacenamiento cifrado externo.
# ---------------------------------------------------------------------------
set -euo pipefail

ORIGEN="${1:-$HOME/.sa-p9/llave-sealed-secrets.yaml}"

if [ ! -f "$ORIGEN" ]; then
  echo "AVISO: no se encontro el respaldo de la llave en $ORIGEN"
  echo "       Los SealedSecrets existentes NO podran descifrarse."
  echo "       Consulte P9/runbook/RUNBOOK.md, seccion 'Secretos'."
  exit 1
fi

kubectl apply -f "$ORIGEN"
kubectl delete pod -n kube-system -l name=sealed-secrets-controller --ignore-not-found
echo "Llave restaurada. El controlador se reinicia para tomarla."
