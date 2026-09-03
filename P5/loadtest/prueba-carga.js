import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Métricas custom para el reporte (RPS, latencia p95 y % de error los
// da k6 automáticamente en el resumen final; estas dos son extra).
const tasaError = new Rate('tasa_error_custom');
const latenciaLogin = new Trend('latencia_login');

const GATEWAY = __ENV.GATEWAY_URL || 'http://localhost:8080';
const HEADERS_HOST = { Host: __ENV.INGRESS_HOST || 'sa-p5.local' };

// Concurrencia creciente por etapas, para poder ver en vivo (con
// `kubectl get hpa -w` en otra terminal) cómo el HPA escala hacia
// arriba mientras sube la carga, y hacia abajo cuando termina.
export const options = {
  stages: [
    { duration: '1m', target: 10 },   // sube gradual a 10 usuarios concurrentes
    { duration: '2m', target: 50 },   // sube a 50 - aquí debería empezar a escalar el HPA
    { duration: '2m', target: 100 },  // pico de carga
    { duration: '1m', target: 10 },   // baja la carga - el HPA debería reducir réplicas
    { duration: '30s', target: 0 },   // enfriamiento
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // referencia; el reporte real se documenta aparte
    tasa_error_custom: ['rate<0.05'],
  },
};

// Un correo distinto por VU (usuario virtual de k6) para no chocar con
// el UNIQUE de correo_hash en la base de datos.
function correoUnico() {
  return `carga_${__VU}_${Date.now()}@test.com`;
}

export default function () {
  const correo = correoUnico();

  http.post(
    `${GATEWAY}/api/auth/registro`,
    JSON.stringify({ nombre: 'Carga', correo: correo, contrasena: 'clave1234', rol: 'Cliente' }),
    { headers: { 'Content-Type': 'application/json', ...HEADERS_HOST } }
  );

  const inicio = Date.now();
  const resLogin = http.post(
    `${GATEWAY}/api/auth/login`,
    JSON.stringify({ correo: correo, contrasena: 'clave1234' }),
    { headers: { 'Content-Type': 'application/json', ...HEADERS_HOST } }
  );
  latenciaLogin.add(Date.now() - inicio);

  const cookies = resLogin.cookies;
  const cookieHeader = cookies && cookies.access_token ? `access_token=${cookies.access_token[0].value}` : '';

  const resTickets = http.get(`${GATEWAY}/api/tickets`, {
    headers: { Cookie: cookieHeader, ...HEADERS_HOST },
  });

  const ok = check(resTickets, {
    'status es 200 o 401': (r) => r.status === 200 || r.status === 401,
  });
  tasaError.add(!ok);

  sleep(1);
}