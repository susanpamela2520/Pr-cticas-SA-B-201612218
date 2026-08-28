#!/bin/sh
set -eu

# Cronjob 2: cada 10 minutos, consulta los registros generados por el
# Cronjob 1, calcula un resumen (cantidad de ejecuciones por hora), y
# publica ese resumen como mensaje en RabbitMQ. tickets-service lo
# consume y lo guarda (ver app/main.py -> consumir_resumenes_cron).
#
# Nota importante (descubierta al probar esto de verdad): si publicas a
# una cola que nadie ha declarado todavia, RabbitMQ la descarta en
# silencio ("routed": false). Por eso el consumidor (tickets-service)
# declara la cola en su arranque, ANTES de que este cronjob corra por
# primera vez.

export PGPASSWORD="$DB_PASSWORD"

# Se deja que PostgreSQL arme el JSON (json_agg/row_to_json) en vez de
# construirlo a mano con concatenacion de strings en el shell - mucho
# menos propenso a errores de escapado.
RESUMEN_JSON=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -A -v ON_ERROR_STOP=1 -c "
  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
  FROM (
    SELECT to_char(fecha_hora, 'YYYY-MM-DD HH24:00') AS hora, COUNT(*) AS cantidad
    FROM cron_ejecuciones
    GROUP BY hora
    ORDER BY hora
  ) t;
")

GENERADO_EN=$(TZ="Etc/GMT+6" date '+%Y-%m-%d %H:%M:%S')

PAYLOAD=$(jq -nc --argjson resumen "$RESUMEN_JSON" --arg generado_en "$GENERADO_EN" \
  '{generado_en: $generado_en, resumen: $resumen}')

BODY=$(jq -n --arg rk "$COLA_RESUMENES" --arg payload "$PAYLOAD" \
  '{properties: {delivery_mode: 2}, routing_key: $rk, payload: $payload, payload_encoding: "string"}')

RESPUESTA=$(curl -s -u "${RABBITMQ_USER}:${RABBITMQ_PASSWORD}" \
  -X POST "http://${RABBITMQ_HOST}:15672/api/exchanges/%2F/amq.default/publish" \
  -H "Content-Type: application/json" \
  -d "$BODY")

echo "[cronjob-resumen] Payload: ${PAYLOAD}"
echo "[cronjob-resumen] Respuesta de RabbitMQ: ${RESPUESTA}"

# Si "routed" viene en false, el mensaje se perdió (nadie lo consumió) -
# fallar el Job explícitamente para que quede evidencia en `kubectl get jobs`.
echo "$RESPUESTA" | grep -q '"routed":true' || { echo "ERROR: el mensaje no se enruto a ninguna cola"; exit 1; }
