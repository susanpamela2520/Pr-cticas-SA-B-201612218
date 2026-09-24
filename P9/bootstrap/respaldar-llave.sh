#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Exporta la llave privada del controlador de Sealed Secrets.
#
# EJECUTAR ANTES DE CUALQUIER PRUEBA DE DESTRUCCION.
#
# El archivo resultante permite descifrar todos los secretos del repositorio:
# gudardelo con el mismo cuidado que una credencial de produccion.
# ---------------------------------------------------------------------------
set -euo pipefail

DESTINO="${1:-$HOME/.sa-p9/llave-sealed-secrets.yaml}"
mkdir -p "$(dirname "$DESTINO")"

kubectl get secret -n kube-system \
  -l sealedsecrets.bitnami.com/sealed-secrets-key \
  -o yaml > "$DESTINO"

chmod 600 "$DESTINO"
echo "Llave respaldada en $DESTINO"
echo "Llaves incluidas: $(grep -c 'name: sealed-secrets-key' "$DESTINO" || echo 0)"
