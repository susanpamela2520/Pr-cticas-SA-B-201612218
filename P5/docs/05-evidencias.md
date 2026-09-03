# Evidencias Requeridas — Comandos Exactos


## 1. `helm history` con upgrade y rollback

```bash
cd P5/charts

# Version 1 ya instalada (paso 6). Ahora sube la version del chart:
# edita charts/Chart.yaml y cambia "version: 1.0.0" a "version: 1.1.0"

helm upgrade sa-platform . -f values.yaml -f values-dev.yaml -f values-secrets.yaml -n sa-p5

helm history sa-platform -n sa-p5
# Debe mostrar REVISION 1 (install) y REVISION 2 (upgrade)

helm rollback sa-platform 1 -n sa-p5

helm history sa-platform -n sa-p5
# Debe mostrar una REVISION 3 nueva (el rollback en si cuenta como
# una revision mas — ver la respuesta a "que hace helm rollback
# internamente" en las preguntas teoricas)
```

## 2. Escalado por HPA bajo carga (y descenso al cesar)

Necesitas 2 terminales.

**Terminal A** (mirar el HPA en vivo):
```bash
kubectl get hpa -n sa-p5 -w
```

**Terminal B** (generar carga con k6):
```bash
# Instalar k6 si no lo tienes: https://k6.io/docs/get-started/installation/
cd P5/loadtest
k6 run --env GATEWAY_URL=http://sa-p5.local prueba-carga.js
```

Deja correr el script completo (dura ~6.5 minutos por los `stages`
definidos). En la Terminal A deberías ver el número de réplicas subir
mientras la carga sube, y bajar unos minutos después de que la carga
termine (el HPA tiene un período de enfriamiento antes de reducir,
es normal que tarde 1-5 min en bajar).

Guarda también:
```bash
kubectl get pods -n sa-p5 -l app.kubernetes.io/component=tickets-service
```
antes, durante y después de la prueba, para mostrar el conteo de pods
cambiando.

## 3. Persistencia: los datos sobreviven al borrado del pod de la BD

```bash
# 1. Crea un usuario de prueba (para tener un dato marcador)
curl -X POST http://sa-p5.local/api/auth/registro -H "Content-Type: application/json" \
  -d '{"nombre":"Persistencia Test","correo":"persistencia@test.com","contrasena":"clave1234"}'

# 2. Confirma que existe
kubectl exec -it -n sa-p5 sa-platform-db-0 -- psql -U appuser -d sa_platform_db -c "SELECT correo_hash FROM usuarios;"

# 3. Borra el pod de la base de datos (el StatefulSet lo vuelve a crear solo)
kubectl delete pod sa-platform-db-0 -n sa-p5

# 4. Espera a que vuelva a estar Running
kubectl get pods -n sa-p5 -l app.kubernetes.io/name=postgresql -w

# 5. Confirma que el dato SIGUE ahi (esto es la evidencia)
kubectl exec -it -n sa-p5 sa-platform-db-0 -- psql -U appuser -d sa_platform_db -c "SELECT correo_hash FROM usuarios;"
```

## 4. NetworkPolicy bloqueando tráfico no autorizado

```bash
# Prueba desde un pod SIN permiso (ej. notificaciones-service intentando
# hablarle directo a la base de datos, algo que NO deberia poder hacer):
kubectl exec -it -n sa-p5 deploy/sa-platform-notificaciones-service -- \
  sh -c "apk add --no-cache curl >/dev/null 2>&1 || true; curl -m 3 -v telnet://sa-platform-db:5432"
# Debe FALLAR (timeout / connection refused) - esa falla ES la evidencia.

# Contraste: desde un pod SI autorizado (tickets-service SI puede
# hablarle a la base de datos):
kubectl exec -it -n sa-p5 deploy/sa-platform-tickets-service -- \
  python3 -c "import socket; s=socket.create_connection(('sa-platform-db',5432), timeout=3); print('CONECTO OK')"
```

## 5. Actualización sin caída de servicio (RollingUpdate, maxUnavailable: 0)

**Terminal A** (peticiones continuas durante el upgrade):
```bash
while true; do
  curl -s -o /dev/null -w "%{http_code} " http://sa-p5.local/api/tickets -H "Cookie: access_token=TU_COOKIE_DE_UN_LOGIN_PREVIO"
  sleep 0.5
done
```

**Terminal B** (dispara un upgrade mientras el loop de arriba sigue corriendo):
```bash
cd P5/charts
# cambia algo trivial, ej. el tag de una imagen o un valor de log level,
# y sube la version del chart de nuevo
helm upgrade sa-platform . -f values.yaml -f values-dev.yaml -f values-secrets.yaml -n sa-p5
```

Revisa la Terminal A: no debe aparecer ningún código `5xx` ni
conexiones rechazadas durante el upgrade — solo `200`/`401` (según si
la cookie seguía válida), lo que demuestra que `maxUnavailable: 0`
efectivamente evitó que el servicio quedara sin réplicas disponibles.

## 6. Resultados de la prueba de carga (RPS, latencia p95, % error)

Al terminar el `k6 run` del punto 2, k6 imprime un resumen al final
con exactamente estos 3 datos. Cópialo tal cual a
`docs/07-reporte-carga.md` (crea ese archivo con el resultado real).
