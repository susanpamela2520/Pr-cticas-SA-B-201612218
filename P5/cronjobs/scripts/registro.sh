#!/bin/sh
set -eu

# Cronjob 1: inserta un registro con la fecha/hora de ejecucion (GMT-6)
# y el carne del estudiante. Se ejecuta cada 2 minutos (ver schedule en
# templates/cronjobs.yaml).

export PGPASSWORD="$DB_PASSWORD"

FECHA_HORA=$(TZ="Etc/GMT+6" date '+%Y-%m-%d %H:%M:%S')

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<SQL
CREATE TABLE IF NOT EXISTS cron_ejecuciones (
  id SERIAL PRIMARY KEY,
  fecha_hora TIMESTAMP NOT NULL,
  carne VARCHAR(20) NOT NULL
);

INSERT INTO cron_ejecuciones (fecha_hora, carne)
VALUES ('${FECHA_HORA}', '${CARNE}');
SQL

echo "[cronjob-registro] Registro insertado: ${FECHA_HORA} - carne ${CARNE}"
