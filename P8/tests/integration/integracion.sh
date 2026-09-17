#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Prueba de integracion: recorre el flujo funcional completo.
#
# A diferencia de la de humo, esta atraviesa los cuatro microservicios y la
# base de datos, asi que valida que el sistema funciona como conjunto y no
# solo que cada pieza esta encendida.
#
# Detecta una clase de fallo que la de humo no ve: un servicio puede
# responder /health correctamente y a la vez fallar al escribir en la base
# de datos o al publicar en RabbitMQ.
#
# Uso:
#   ./integracion.sh http://IP:8080
# ---------------------------------------------------------------------------
set -uo pipefail

BASE="${1:?Uso: integracion.sh <url-base>}"
SUFIJO="$(date +%s)"
CORREO="prueba-${SUFIJO}@test.com"
CLAVE="clave1234"
COOKIES="$(mktemp)"
FALLOS=0

paso()  { echo ""; echo "--- $1"; }
ok()    { echo "  OK    $1"; }
falla() { echo "  FALLA $1"; FALLOS=$((FALLOS + 1)); }

# --- 1. auth-service: registro ---------------------------------------------
paso "1. Registro de usuario (auth-service)"
CODIGO=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE}/api/auth/registro" \
  -H "Content-Type: application/json" \
  -d "{\"correo\":\"${CORREO}\",\"contrasena\":\"${CLAVE}\",\"nombre\":\"Prueba\",\"rol\":\"Cliente\"}" \
  --max-time 15)
if [ "${CODIGO}" = "201" ]; then
  ok "Usuario creado"
else
  falla "Registro devolvio ${CODIGO}"
fi

# --- 2. auth-service: autenticacion ----------------------------------------
paso "2. Autenticacion y emision de JWT"
CODIGO=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"correo\":\"${CORREO}\",\"contrasena\":\"${CLAVE}\"}" \
  -c "${COOKIES}" --max-time 15)
if [ "${CODIGO}" = "200" ]; then
  ok "Sesion iniciada"
else
  falla "Login devolvio ${CODIGO}"
fi

if grep -q "access_token" "${COOKIES}" 2>/dev/null; then
  ok "Cookie HttpOnly de sesion recibida"
else
  falla "No se recibio la cookie access_token"
fi

# --- 3. tickets-service: escritura en base de datos ------------------------
paso "3. Creacion de ticket (tickets-service + PostgreSQL)"
RESPUESTA=$(curl -s -X POST "${BASE}/api/tickets" \
  -H "Content-Type: application/json" \
  -d '{"titulo":"Ticket de integracion","descripcion":"Generado por la prueba automatizada","prioridad":"ALTA"}' \
  -b "${COOKIES}" --max-time 15)
TICKET_ID=$(echo "${RESPUESTA}" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
if [ -n "${TICKET_ID}" ]; then
  ok "Ticket creado (${TICKET_ID})"
else
  falla "No se obtuvo el id del ticket"
fi

# --- 4. comentarios-service ------------------------------------------------
paso "4. Creacion de comentario (comentarios-service)"
if [ -n "${TICKET_ID}" ]; then
  CODIGO=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${BASE}/api/comentarios" \
    -H "Content-Type: application/json" \
    -d "{\"ticket_id\":\"${TICKET_ID}\",\"mensaje\":\"Comentario de integracion\"}" \
    -b "${COOKIES}" --max-time 15)
  if [ "${CODIGO}" = "201" ]; then
    ok "Comentario creado"
  else
    falla "Comentario devolvio ${CODIGO}"
  fi
else
  falla "Omitido: no hay ticket al que comentar"
fi

# --- 5. Lectura ------------------------------------------------------------
paso "5. Listado de tickets"
CODIGO=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/tickets" \
  -b "${COOKIES}" --max-time 15)
if [ "${CODIGO}" = "200" ]; then
  ok "Listado accesible"
else
  falla "Listado devolvio ${CODIGO}"
fi

# --- 6. Flujo asincrono: RabbitMQ ------------------------------------------
# Resolver el ticket publica un mensaje en la cola. El productor responde de
# inmediato, asi que aqui solo se verifica que la publicacion no falle; que
# el consumidor lo procese se comprueba en los logs.
paso "6. Resolucion de ticket (publica en RabbitMQ)"
if [ -n "${TICKET_ID}" ]; then
  CODIGO=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH \
    "${BASE}/api/tickets/${TICKET_ID}/estado" \
    -H "Content-Type: application/json" \
    -d '{"estado":"RESUELTO"}' \
    -b "${COOKIES}" --max-time 15)
  if [ "${CODIGO}" = "200" ]; then
    ok "Ticket resuelto, evento publicado"
  else
    falla "Resolucion devolvio ${CODIGO}"
  fi
else
  falla "Omitido: no hay ticket que resolver"
fi

rm -f "${COOKIES}"

echo ""
if [ "${FALLOS}" -eq 0 ]; then
  echo "Prueba de integracion superada: los 4 microservicios, PostgreSQL y"
  echo "RabbitMQ respondieron correctamente."
  exit 0
fi
echo "Prueba de integracion fallida: ${FALLOS} comprobacion(es)."
exit 1
