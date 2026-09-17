// ---------------------------------------------------------------------------
// Prueba de carga para la version candidata del canary.
//
// Difiere de la de la Practica 6 en su proposito: aquella medi­a la capacidad
// del sistema; esta decide si una version se promueve o se revierte. Por eso
// es mas corta (3 minutos frente a 6,5) y sus umbrales son mas estrictos.
//
// JUSTIFICACION DE LOS UMBRALES
//
// Linea base medida en la P6 con 100 usuarios concurrentes:
//   - tasa de error ... 0,01 %  (4 de 26.427 peticiones)
//   - latencia p95 .... 222 ms
//   - latencia mediana  122 ms
//
// Umbrales aqui:
//   http_req_failed  < 1 %     Cien veces la tasa observada. Deja margen
//                              para ruido de red sin tolerar una regresion
//                              real.
//   http_req_duration p95 < 500 ms   Poco mas del doble de la base. El
//                              canary comparte nodos con la version estable,
//                              asi que algo de contencion es esperable.
//   checks           > 99 %    Coherente con el umbral del AnalysisTemplate.
//
// Uso:
//   k6 run -e URL=http://IP:8080 carga-canary.js
// ---------------------------------------------------------------------------

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.URL || 'http://localhost:8080';

const tasaErrores = new Rate('errores_canary');
const latenciaSalud = new Trend('latencia_health');

export const options = {
  stages: [
    { duration: '30s', target: 20 },  // rampa
    { duration: '1m',  target: 50 },  // carga sostenida
    { duration: '1m',  target: 80 },  // pico
    { duration: '30s', target: 0 },   // enfriamiento
  ],

  thresholds: {
    // Estos tres umbrales son la puerta de calidad: si alguno no se cumple,
    // k6 termina con codigo distinto de cero y el paso del pipeline falla.
    'http_req_failed':   ['rate<0.01'],
    'http_req_duration': ['p(95)<500'],
    'checks':            ['rate>0.99'],
    'errores_canary':    ['rate<0.01'],
  },
};

export default function () {
  // --- Endpoint de salud: el mas sensible a una version defectuosa -------
  const salud = http.get(`${BASE}/health`, {
    tags: { endpoint: 'health' },
  });

  const saludOk = check(salud, {
    'health responde 200': (r) => r.status === 200,
    'health responde en menos de 500ms': (r) => r.timings.duration < 500,
    'health devuelve status ok': (r) => {
      try {
        return JSON.parse(r.body).status === 'ok';
      } catch (e) {
        return false;
      }
    },
  });

  latenciaSalud.add(salud.timings.duration);
  tasaErrores.add(!saludOk);

  // --- Endpoint protegido: debe rechazar sin sesion ----------------------
  // Si empezara a devolver 200, el control de acceso estaria roto. Esa es
  // una regresion silenciosa que un chequeo de /health no detectaria.
  const protegido = http.get(`${BASE}/api/tickets`, {
    tags: { endpoint: 'tickets-sin-sesion' },
  });

  const proteccionOk = check(protegido, {
    'endpoint protegido rechaza sin sesion': (r) => r.status === 401,
  });

  tasaErrores.add(!proteccionOk);

  sleep(1);
}

export function handleSummary(data) {
  const m = data.metrics;
  const p95 = m.http_req_duration ? m.http_req_duration.values['p(95)'].toFixed(2) : 'n/d';
  const fallos = m.http_req_failed ? (m.http_req_failed.values.rate * 100).toFixed(3) : 'n/d';
  const total = m.http_reqs ? m.http_reqs.values.count : 'n/d';

  const resumen = `
=========================================================
  RESULTADO DE LA PRUEBA DE CARGA DEL CANARY
=========================================================
  Peticiones totales ....... ${total}
  Tasa de fallo ............ ${fallos} %   (umbral: < 1 %)
  Latencia p95 ............. ${p95} ms  (umbral: < 500 ms)

  Linea base de la P6: 0,01 % de error, p95 de 222 ms
=========================================================
`;

  return {
    'stdout': resumen,
    'reporte-carga-canary.json': JSON.stringify(data, null, 2),
  };
}
