# Práctica 1 — Software Avanzado
## Gestión de Solicitudes Operativas — Principios SOLID y Uso de IA

API REST para gestionar las solicitudes operativas de una academia ficticia,
construida con Express + TypeScript + PostgreSQL, aplicando arquitectura
por capas y los 5 principios SOLID.

---

## 1. Arquitectura

```
src/
├── domain/            → Entidades y contratos (no dependen de nada más)
│   ├── models/
│   └── repositories/
├── application/        → Lógica de negocio y validaciones
│   ├── services/
│   └── validators/
├── infrastructure/     → Implementaciones concretas (Postgres, en memoria)
│   ├── database/
│   └── repositories/
├── presentation/       → HTTP: controladores, rutas, middlewares
│   ├── controllers/
│   ├── routes/
│   └── middlewares/
└── errors/              → Jerarquía de errores de negocio
```

La regla general: cada capa solo conoce a la capa inmediatamente inferior
a través de una **abstracción** (interfaz), nunca de una implementación
concreta. Eso es lo que hace posible aplicar SOLID de forma consistente
en todo el proyecto.

---

## 2. Los 5 principios SOLID aplicados

### S — Single Responsibility Principle (Responsabilidad Única)

Cada clase tiene **una sola razón para cambiar**:

| Clase | Responsabilidad única |
|---|---|
| `SolicitudController` | Traducir HTTP ↔ llamadas al servicio |
| `SolicitudService` | Reglas de negocio |
| `PostgresSolicitudRepository` | Persistencia en PostgreSQL |
| `SolicitudValidator` | Validar datos de entrada |
| `errorHandler` | Traducir errores a respuestas HTTP |

Ejemplo real (`src/presentation/controllers/SolicitudController.ts`):

```typescript
crear = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const nueva = await this.service.crear(req.body);
    res.status(201).json(nueva);
  } catch (error) {
    next(error);
  }
};
```

El controlador no valida nada ni sabe de SQL: solo recibe el body, se lo
pasa al servicio, y responde. Si algo falla, delega el error hacia el
middleware central en lugar de manejarlo aquí mismo.

### O — Open/Closed Principle (Abierto/Cerrado)

El manejo de errores está diseñado para **extenderse sin modificarse**.
`errorHandler.ts` solo revisa si el error es instancia de `AppError`:

```typescript
if (err instanceof AppError) {
  res.status(err.statusCode).json({ error: err.message });
  return;
}
```

Si mañana se necesita un nuevo error de negocio (por ejemplo, un
`ConflictError` con código 409), basta con crear la clase extendiendo
`AppError` — **no hay que tocar `errorHandler.ts`**. Está cerrado a
modificación pero abierto a extensión.

Lo mismo aplica en `SolicitudValidator.ts`: las reglas de validación son
funciones independientes en un arreglo. Agregar una regla nueva no
requiere cambiar las reglas existentes ni el método que las ejecuta.

### L — Liskov Substitution Principle (Sustitución de Liskov)

`PostgresSolicitudRepository` e `InMemorySolicitudRepository` implementan
el mismo contrato (`ISolicitudRepository`) y se comportan de forma
consistente entre sí (mismos casos de éxito, mismo `null` cuando algo
no existe). Por eso `SolicitudService` puede recibir **cualquiera de
las dos** sin que el comportamiento observable cambie:

```typescript
// En producción:
const repositorio = new PostgresSolicitudRepository(pool);
// Para pruebas rápidas, sin tocar el service ni el controller:
const repositorio = new InMemorySolicitudRepository();

const service = new SolicitudService(repositorio); // funciona igual con ambas
```

### I — Interface Segregation Principle (Segregación de Interfaces)

En vez de una sola interfaz gigante, `ISolicitudRepository` se separa en
dos interfaces pequeñas y específicas (`src/domain/repositories/ISolicitudRepository.ts`):

```typescript
export interface ISolicitudReader {
  findAll(): Promise<SolicitudOperativa[]>;
  findById(id: string): Promise<SolicitudOperativa | null>;
}

export interface ISolicitudWriter {
  create(data: NuevaSolicitudDTO): Promise<SolicitudOperativa>;
  update(id: string, data: ActualizarSolicitudDTO): Promise<SolicitudOperativa | null>;
  updateEstado(id: string, estado: EstadoSolicitud): Promise<SolicitudOperativa | null>;
  delete(id: string): Promise<boolean>;
}
```

Una clase que solo necesite leer datos (por ejemplo, un futuro servicio
de reportes) puede depender únicamente de `ISolicitudReader`, sin verse
obligada a implementar métodos de escritura que nunca usaría.

### D — Dependency Inversion Principle (Inversión de Dependencias)

`SolicitudService` depende de la abstracción `ISolicitudRepository`, no
de una clase concreta:

```typescript
export class SolicitudService {
  constructor(private readonly repositorio: ISolicitudRepository) {}
  ...
}
```

La decisión de qué implementación concreta usar se toma en un solo
lugar, `src/app.ts`, donde se "arma" la aplicación inyectando las
dependencias de abajo hacia arriba (repositorio → servicio → controlador).

---

## 3. Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/solicitudes` | Obtener todas las solicitudes |
| `POST` | `/api/solicitudes` | Registrar una nueva solicitud |
| `PUT` | `/api/solicitudes/:id` | Actualizar completamente una solicitud |
| `PATCH` | `/api/solicitudes/:id/estado` | Actualizar únicamente el estado |
| `DELETE` | `/api/solicitudes/:id` | Eliminar una solicitud |

### Ejemplo — Crear solicitud

```
POST /api/solicitudes
Content-Type: application/json

{
  "titulo": "Adquisición de nuevo servidor",
  "areaSolicitante": "Infraestructura TI",
  "prioridad": 3,
  "costoEstimado": 2500.00
}
```

### Ejemplo — Actualizar solo el estado

```
PATCH /api/solicitudes/{id}/estado
Content-Type: application/json

{ "estado": "en_proceso" }
```

### Manejo de errores

Todas las respuestas de error siguen el mismo formato JSON:

```json
{ "error": "Solicitud operativa con id \"abc\" no fue encontrado." }
```

```json
{
  "error": "Los datos enviados no son válidos.",
  "detalles": ["El campo \"prioridad\" debe ser un entero entre 1 y 5."]
}
```

---

## 4. Seguridad aplicada

- **Prevención de inyección SQL**: todas las consultas en
  `PostgresSolicitudRepository` usan parámetros (`$1`, `$2`, ...) en vez
  de concatenar strings.
- **Validación de entrada**: ningún dato llega al repositorio sin pasar
  por `SolicitudValidator` (tipos, rangos de `prioridad`, valores válidos
  de `estado`, `costoEstimado` no negativo).
- **JSON malformado**: si el cliente envía un body que no es JSON válido,
  la API responde `400` con un mensaje claro en vez de un error genérico
  de servidor (ver `errorHandler.ts`).
- **Restricciones a nivel de base de datos**: la tabla también tiene
  `CHECK` constraints (`prioridad BETWEEN 1 AND 5`, `estado IN (...)`)
  como segunda capa de defensa, independiente de la validación en código.

---

## 5. Cómo correr el proyecto

```bash
# 1. Levantar PostgreSQL local con Docker
docker compose up -d

# 2. Instalar dependencias
npm install

# 3. Copiar variables de entorno
cp .env.example .env

# 4. Correr en modo desarrollo
npm run dev
```

El servidor queda escuchando en `http://localhost:3000`.

---

## 6. Documentación de uso de IA

Ver [`PROMPTS.md`](./PROMPTS.md) para el detalle de los prompts usados,
las respuestas obtenidas y los ajustes críticos aplicados sobre el
código generado.
