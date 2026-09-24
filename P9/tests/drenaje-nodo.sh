#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# PRUEBA DE PERDIDA DE NODO
#
# Drena un nodo mientras se consulta el servicio en bucle. La evidencia que
# importa no es que el nodo se drene, sino que NINGUNA peticion falle
# mientras ocurre.
#
# Uso:
#   bash P9/tests/drenaje-nodo.sh http://IP:8080 | tee P9/evidencia/drenaje-nodo.log
# ---------------------------------------------------------------------------
set -uo pipefail

URL="${1:?Uso: drenaje-nodo.sh http://IP:PUERTO}"
NS="${NS:-sa-prod}"

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Distribucion inicial de pods"
kubectl get pods -n "$NS" -o wide | awk '{print $1, $3, $7}'

NODO=$(kubectl get pods -n "$NS" -l app.kubernetes.io/name=api-gateway \
       -o jsonpath='{.items[0].spec.nodeName}')
echo ""
echo "Nodo a drenar: $NODO"
echo ""

# Sondeo continuo en segundo plano.
( for i in $(seq 1 180); do
    CODIGO=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "$URL/health" || echo "000")
    [ "$CODIGO" = "200" ] || echo "  [$(date -u '+%H:%M:%S')] respuesta $CODIGO"
    sleep 1
  done ) &
SONDEO=$!

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Iniciando drenaje"
kubectl drain "$NODO" --ignore-daemonsets --delete-emptydir-data --timeout=180s
echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Drenaje completado"

wait $SONDEO
echo ""
echo "Distribucion tras el drenaje"
kubectl get pods -n "$NS" -o wide | awk '{print $1, $3, $7}'
echo ""
echo "Para devolver el nodo al servicio:"
echo "  kubectl uncordon $NODO"
