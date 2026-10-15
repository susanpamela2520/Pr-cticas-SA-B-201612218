# Instrumentación con OpenTelemetry

## Cómo aplicarla a cada servicio

Para los tres servicios Node.js (`api-gateway`, `auth-service`,
`comentarios-service`):

**1. Copiar los tres archivos** a la raíz del servicio:
```bash
cp P10/instrumentacion/{tracing.js,logger.js,metricas-negocio.js} P5/api-gateway/
```

**2. Agregar las dependencias** al `package.json`:
```json
"dependencies": {
  "@opentelemetry/api": "^1.9.0",
  "@opentelemetry/sdk-node": "^0.57.0",
  "@opentelemetry/auto-instrumentations-node": "^0.56.0",
  "@opentelemetry/exporter-trace-otlp-http": "^0.57.0",
  "@opentelemetry/exporter-prometheus": "^0.57.0",
  "@opentelemetry/resources": "^1.30.0",
  "@opentelemetry/semantic-conventions": "^1.28.0",
  "@opentelemetry/core": "^1.30.0"
}
```

**3. Cargar la instrumentación antes que la app** — en el Dockerfile:
```dockerfile
CMD ["node", "--require", "./tracing.js", "dist/server.js"]
```

El `--require` es esencial: la instrumentación automática funciona
parcheando `express`, `http` y `pg` cuando se importan. Si la aplicación
arranca primero, no queda nada que parchear.

**4. Usar el logger y las métricas** en el código:
```javascript
const log = require('./logger');
const { registrarTicketCreado } = require('./metricas-negocio');

app.use(log.middleware());

// en el manejador de creación de tickets:
registrarTicketCreado(ticket.prioridad);
log.info('ticket creado', { ticket_id: ticket.id });
```

## Qué aporta cada archivo

| Archivo | Criterio de la rúbrica |
|---|---|
| `tracing.js` | 2.1 — trazas con propagación de contexto W3C entre servicios |
| `logger.js` | 2.5 — registros JSON con `trace_id` para correlación |
| `metricas-negocio.js` | 2.1 — métricas que significan algo para quien no es ingeniero |

## Verificación

```bash
# El servicio expone sus métricas
kubectl exec -n sa-prod deploy/api-gateway -- wget -qO- localhost:9464/metrics | head

# Los registros salen en JSON con trace_id
kubectl logs -n sa-prod deploy/api-gateway --tail=5 | jq .

# La métrica de negocio llegó a Prometheus
kubectl port-forward -n observabilidad svc/prometheus-operated 9090:9090 &
curl -sG --data-urlencode 'query=tickets_creados_total' localhost:9090/api/v1/query | jq
```
