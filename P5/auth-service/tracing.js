// ---------------------------------------------------------------------------
// Instrumentacion con OpenTelemetry — servicios Node.js
//
// Se carga ANTES que cualquier otro modulo (ver instrucciones abajo), porque
// la instrumentacion automatica funciona parcheando express, http y pg en el
// momento en que se importan. Si la app arranca primero, no hay nada que
// parchear.
//
// Uso en el Dockerfile o en el arranque:
//     CMD ["node", "--require", "./tracing.js", "dist/server.js"]
// ---------------------------------------------------------------------------
'use strict';

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { W3CTraceContextPropagator } = require('@opentelemetry/core');
const { propagation } = require('@opentelemetry/api');

const SERVICIO = process.env.OTEL_SERVICE_NAME || 'servicio-sin-nombre';

// Propagacion de contexto entre servicios: el estandar W3C traceparent.
// Es lo que permite que una peticion que atraviesa gateway -> auth ->
// tickets conserve el MISMO trace_id de extremo a extremo.
propagation.setGlobalPropagator(new W3CTraceContextPropagator());

const exportadorPrometheus = new PrometheusExporter({ port: 9464 });

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: SERVICIO,
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'sa-platform',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
      process.env.NODE_ENV || 'production',
  }),
  traceExporter: new OTLPTraceExporter({
    url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector.observabilidad:4318'}/v1/traces`,
  }),
  metricReader: exportadorPrometheus,
  instrumentations: [
    getNodeAutoInstrumentations({
      // El ruido de lectura de archivos no aporta nada y multiplica el
      // volumen de spans.
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-http': {
        // Las sondas de Kubernetes generarian una traza cada 5 segundos
        // por pod. Se excluyen.
        ignoreIncomingRequestHook: (req) =>
          req.url === '/health' || req.url === '/metrics',
      },
    }),
  ],
});

sdk.start();
console.log(JSON.stringify({
  level: 'info',
  service: SERVICIO,
  msg: 'OpenTelemetry iniciado',
  timestamp: new Date().toISOString(),
}));

process.on('SIGTERM', () => {
  sdk.shutdown().finally(() => process.exit(0));
});
