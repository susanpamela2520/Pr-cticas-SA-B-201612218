#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Prueba de humo: comprueba que el sistema esta vivo y responde.
#
# Es la mas barata y la primera que corre. Si esta falla, no tiene sentido
# ejecutar las demas. Es tambien la que usa el AnalysisTemplate del canary,
# por lo que su resultado decide si una version se promueve o se revierte.
#
# Uso:
#   ./humo.sh http://IP:8080
# ---------------------------------------------------------------------------
set -uo pipefail

BASE="${1:?Uso: humo.sh <url-base>}"
FALLOS=0

comprobar() {
  local descripcion="$1" ruta="$2" esperado="$3"
  local codigo
  codigo=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "${BASE}${ruta}" || echo "000")

  if [ "$codigo" = "$esperado" ]; then
    echo "  OK    ${descripcion} (HTTP ${codigo})"
  else
    echo "  FALLA ${descripcion} (esperaba ${esperado}, recibio ${codigo})"
    FALLOS=$((FALLOS + 1))
  fi
}

echo "Prueba de humo contra ${BASE}"
echo ""

# El endpoint de salud: si no responde, nada mas importa.
comprobar "El gateway responde a /health" "/health" "200"

# Una ruta inexistente debe dar 404 y no 500: comprueba que el manejo de
# errores del gateway funciona.
comprobar "Ruta inexistente devuelve 404" "/no-existe-esta-ruta" "404"

# Un endpoint protegido sin sesion debe rechazar. Si devolviera 200, el
# control de acceso estaria roto, que es peor que una caida.
comprobar "Endpoint protegido exige sesion" "/api/tickets" "401"

echo ""
if [ "${FALLOS}" -eq 0 ]; then
  echo "Prueba de humo superada."
  exit 0
fi
echo "Prueba de humo fallida: ${FALLOS} comprobacion(es)."
exit 1
