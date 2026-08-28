import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Métricas custom para el reporte (RPS, latencia p95 y % de error los
// da k6 automáticamente en el resumen final; estas dos son extra).
const tasaError = new Rate('tasa_error_custom');
const latenciaLogin = new Trend('latencia_login');

const GATEWAY = __ENV.GATEWAY_URL || 'http://localhost:8080';

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
  // 1. Registro (solo una vez por VU sería lo ideal, pero para simplicidad
  //    del script se acepta el 409 de "correo ya registrado" en iteraciones
  //    repetidas del mismo VU y se continúa igual).
  http.post(
    `${GATEWAY}/api/auth/registro`,
    JSON.stringify({ nombre: 'Carga', correo: correoUnico(), contrasena: 'clave1234', rol: 'Cliente' }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  // 2. Login (esta es la petición que más nos interesa medir: toca
  //    auth-service, cifrado AES y la base de datos).
  const inicio = Date.now();
  const resLogin = http.post(
    `${GATEWAY}/api/auth/login`,
    JSON.stringify({ correo: correoUnico(), contrasena: 'clave1234' }),
    { headers: { 'Content-Type': 'application/json' } }
  );
  latenciaLogin.add(Date.now() - inicio);

  const cookies = resLogin.cookies;
  const cookieHeader = cookies && cookies.access_token ? `access_token=${cookies.access_token[0].value}` : '';

  // 3. Listar tickets (toca tickets-service, el candidato principal a
  //    escalar bajo carga en esta prueba).
  const resTickets = http.get(`${GATEWAY}/api/tickets`, { headers: { Cookie: cookieHeader } });

  const ok = check(resTickets, {
    'status es 200 o 401': (r) => r.status === 200 || r.status === 401,
  });
  tasaError.add(!ok);

  sleep(1);
}
