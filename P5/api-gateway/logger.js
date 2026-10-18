// ---------------------------------------------------------------------------
// Registros estructurados en JSON con identificador de traza
//
// Cada linea incluye el trace_id del span activo. Eso es lo que permite el
// salto bidireccional: desde una traza en Tempo se llega a sus registros en
// Loki, y desde un registro se llega a su traza.
//
// Sin el trace_id, diagnosticar significa revisar los registros de cada
// servicio por separado adivinando cual atendio la peticion que fallo.
// ---------------------------------------------------------------------------
'use strict';

const { trace, context } = require('@opentelemetry/api');

const SERVICIO = process.env.OTEL_SERVICE_NAME || 'servicio-sin-nombre';
const NIVELES = { debug: 10, info: 20, warn: 30, error: 40 };
const NIVEL_MINIMO = NIVELES[process.env.LOG_LEVEL || 'info'] || 20;

function contextoDeTraza() {
  const span = trace.getSpan(context.active());
  if (!span) return {};
  const ctx = span.spanContext();
  return { trace_id: ctx.traceId, span_id: ctx.spanId };
}

function emitir(nivel, mensaje, extra = {}) {
  if (NIVELES[nivel] < NIVEL_MINIMO) return;
  const linea = {
    timestamp: new Date().toISOString(),
    level: nivel,
    service: SERVICIO,
    msg: mensaje,
    ...contextoDeTraza(),
    ...extra,
  };
  // Una sola linea por registro: Promtail la recoge de stdout y Loki la
  // indexa por campo.
  process.stdout.write(JSON.stringify(linea) + '\n');
}

module.exports = {
  debug: (m, e) => emitir('debug', m, e),
  info:  (m, e) => emitir('info', m, e),
  warn:  (m, e) => emitir('warn', m, e),
  error: (m, e) => emitir('error', m, e),

  // Middleware de Express: registra cada peticion con su trace_id
  middleware() {
    return (req, res, next) => {
      const inicio = Date.now();
      res.on('finish', () => {
        emitir(res.statusCode >= 500 ? 'error' : 'info', 'peticion atendida', {
          method: req.method,
          route: req.route?.path || req.path,
          status: res.statusCode,
          duration_ms: Date.now() - inicio,
        });
      });
      next();
    };
  },
};
