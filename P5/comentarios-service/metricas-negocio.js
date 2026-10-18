// ---------------------------------------------------------------------------
// Metricas de negocio
//
// Las metricas tecnicas (latencia, errores, saturacion) le dicen a un
// ingeniero si el sistema esta sano. Estas dos le dicen a cualquiera si el
// sistema esta sirviendo para lo que existe.
//
// Un sistema puede tener 0 % de error y 50 ms de latencia mientras nadie
// logra crear un ticket: las metricas tecnicas no lo notarian.
// ---------------------------------------------------------------------------
'use strict';

const { metrics } = require('@opentelemetry/api');
const medidor = metrics.getMeter('sa-platform', '1.0.0');

const ticketsCreados = medidor.createCounter('tickets_creados_total', {
  description: 'Tickets creados correctamente, por prioridad',
});

const ticketsResueltos = medidor.createCounter('tickets_resueltos_total', {
  description: 'Tickets que pasaron a estado RESUELTO',
});

const loginsFallidos = medidor.createCounter('logins_fallidos_total', {
  description: 'Intentos de autenticacion rechazados',
});

module.exports = {
  registrarTicketCreado: (prioridad) =>
    ticketsCreados.add(1, { prioridad: prioridad || 'MEDIA' }),
  registrarTicketResuelto: () => ticketsResueltos.add(1),
  registrarLoginFallido: (motivo) =>
    loginsFallidos.add(1, { motivo: motivo || 'credenciales' }),
};
