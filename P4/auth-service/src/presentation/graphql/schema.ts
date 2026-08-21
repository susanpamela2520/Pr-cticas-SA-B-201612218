import { createHandler } from 'graphql-http/lib/use/express';
import { buildSchema } from 'graphql';
import { RequestHandler } from 'express';
import { AuthService } from '../../application/services/AuthService';

/**
 * Segunda interfaz de auth-service, además del REST ya existente.
 * Expone una sola query: `me`, que devuelve el perfil del usuario
 * autenticado (misma información que GET /api/auth/me por REST, pero
 * vía GraphQL). Requiere que `verificarToken` ya haya corrido antes
 * en la cadena de middlewares para poblar `req.usuario`.
 */
const schema = buildSchema(`
  type Usuario {
    id: ID!
    nombre: String!
    correo: String!
    rol: String!
  }

  type Query {
    me: Usuario
  }
`);

export function crearHandlerGraphQL(authService: AuthService): RequestHandler {
  return createHandler({
    schema,
    context: (req: any) => ({ usuario: req.raw.usuario }),
    rootValue: {
      me: async (_args: unknown, context: { usuario?: { id: string } }) => {
        if (!context.usuario) {
          throw new Error('No autenticado.');
        }
        return authService.obtenerPerfil(context.usuario.id);
      },
    },
  }) as unknown as RequestHandler;
}
