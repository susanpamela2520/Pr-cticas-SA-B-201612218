#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# VERIFICACION DE CONTENIDO RESTAURADO
#
# Comprueba que la restauracion recupero datos REALES y no un volumen vacio.
# Un PVC que existe no prueba nada: hay que leer filas.
#
# Uso:
#   bash P9/tests/verificar-datos.sh        # cuenta y muestra
#   bash P9/tests/verificar-datos.sh sembrar  # inserta datos de prueba
# ---------------------------------------------------------------------------
set -euo pipefail

NS="${NS:-sa-prod}"
POD=$(kubectl get pod -n "$NS" -l app.kubernetes.io/name=db -o name | head -1)

if [ -z "$POD" ]; then
  echo "ERROR: no se encontro el pod de la base de datos en $NS"
  exit 1
fi

sql() { kubectl exec -n "$NS" "$POD" -- psql -U "${PGUSER:-postgres}" -d "${PGDB:-sa_platform_db}" -tAc "$1"; }

if [ "${1:-}" = "sembrar" ]; then
  MARCA="dr-$(date -u +%Y%m%d%H%M%S)"
  sql "CREATE TABLE IF NOT EXISTS prueba_dr (id serial primary key, marca text, creado timestamptz default now());"
  sql "INSERT INTO prueba_dr (marca) VALUES ('$MARCA');"
  echo "Sembrado: $MARCA"
  exit 0
fi

echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] Verificando contenido en $NS"
echo ""
echo "Filas en prueba_dr : $(sql 'SELECT count(*) FROM prueba_dr;' 2>/dev/null || echo 'tabla ausente')"
echo "Ultima marca       : $(sql 'SELECT marca FROM prueba_dr ORDER BY id DESC LIMIT 1;' 2>/dev/null || echo '-')"
echo "Tickets            : $(sql 'SELECT count(*) FROM tickets;' 2>/dev/null || echo 'tabla ausente')"
echo "Usuarios           : $(sql 'SELECT count(*) FROM usuarios;' 2>/dev/null || echo 'tabla ausente')"
