# Documentación de Prompts de IA

Herramienta utilizada: **Claude (Anthropic)**.
A continuación se documentan los prompts utilizados para generar y
refinar el código de la API, la respuesta obtenida (resumen) y los
ajustes críticos que se aplicaron sobre lo generado.

---

## Prompt 1 — Arquitectura y estructura del proyecto

**Prompt utilizado:**
> "Necesito una API REST en Express + TypeScript para gestionar
> 'solicitudes operativas' (CRUD + un endpoint extra para actualizar
> solo el estado). Quiero que la arquitectura separe claramente
> controlador, lógica de negocio y acceso a datos, y que aplique los
> 5 principios SOLID de forma que pueda señalar en el código dónde
> está cada uno. El código debe ser seguro: validar entradas, prevenir
> inyección SQL y manejar errores de forma centralizada."

**Respuesta obtenida (resumen):**
La IA propuso una arquitectura por capas (`domain / application /
infrastructure / presentation`), con interfaces de repositorio para
aplicar DIP e ISP, un `SolicitudService` para las reglas de negocio, y
un `SolicitudController` delgado que solo traduce HTTP.

**Ajustes / revisión crítica aplicados:**
- Se dividió la interfaz de repositorio en `ISolicitudReader` /
  `ISolicitudWriter` para evidenciar mejor el principio de Segregación
  de Interfaces (ISP), en vez de dejar una sola interfaz con todos los
  métodos mezclados.
- Se agregó `InMemorySolicitudRepository` como segunda implementación
  del contrato, específicamente para poder mostrar de forma concreta
  el principio de Sustitución de Liskov (LSP): dos implementaciones
  intercambiables sin tocar el servicio.

---

## Prompt 2 — Manejo de errores robusto (400/404 vs 500)

**Prompt utilizado:**
> "¿Cómo estructuro el manejo de errores para que los errores de
> negocio conocidos (recurso no encontrado, datos inválidos) devuelvan
> 400/404, y cualquier fallo inesperado de infraestructura (por ejemplo,
> un fallo interno de la base de datos) devuelva 500, sin crear un
> middleware que 'invente' un nuevo tipo de error y sin duplicar
> validaciones en cada controlador? También me preocupa que si mandan
> un JSON inválido, la API responda con HTML feo en vez de un error
> claro."

**Respuesta obtenida (resumen):**
La IA sugirió una clase base abstracta `AppError` con `statusCode`, de
la cual heredan `ValidationError` (400) y `NotFoundError` (404). Un
único middleware `errorHandler` revisa `instanceof AppError` y arma la
respuesta; cualquier error que no sea una instancia conocida cae al
`500` genérico. Además, propuso capturar explícitamente el
`SyntaxError` que lanza `express.json()` cuando el body no es JSON
válido, para responder `400` en vez de dejarlo caer al `500`.

**Ajustes / revisión crítica aplicados:**
- Se verificó que el middleware **no crea un nuevo tipo de error**,
  solo interpreta los que ya existen (tal como se buscaba): esto
  cumple Open/Closed, porque agregar un error nuevo en el futuro no
  obliga a modificar `errorHandler.ts`.
- Se añadió también `notFoundRoute.ts` para que las rutas inexistentes
  devuelvan JSON en vez de la página HTML por defecto de Express,
  manteniendo consistencia en todas las respuestas de la API.
- Se probó manualmente enviando un body `{ titulo: }` (JSON roto) para
  confirmar que la respuesta es `400` con mensaje claro y no un `500`.

---

## Prompt 3 — Validación de datos y prevención de inyección SQL

**Prompt utilizado:**
> "Genera la validación de entrada para crear/actualizar una solicitud
> operativa (título, área solicitante, prioridad entre 1 y 5, costo
> estimado no negativo, estado limitado a 3 valores). Que sea fácil de
> extender con nuevas reglas sin tocar las que ya existen. También
> genera las consultas SQL del repositorio de forma que sea imposible
> hacer inyección SQL."

**Respuesta obtenida (resumen):**
La IA propuso un validador basado en un arreglo de "reglas" (funciones
puras, una por campo) que se ejecutan y acumulan errores, en vez de un
método largo con muchos `if` anidados. Para el repositorio, propuso
usar exclusivamente consultas parametrizadas (`$1, $2, ...`) del driver
`pg`, nunca concatenación de strings.

**Ajustes / revisión crítica aplicados:**
- Se revisó cada consulta en `PostgresSolicitudRepository.ts` para
  confirmar que ningún valor proveniente del usuario se concatena
  directamente en el string SQL.
- Se agregaron restricciones `CHECK` a nivel de base de datos
  (`prioridad BETWEEN 1 AND 5`, `estado IN (...)`) como una segunda
  capa de seguridad, independiente de la validación en código — en
  caso de que algún otro cliente distinto a esta API escriba
  directamente en la tabla.
- Se ajustó la regla de `prioridad` para rechazar explícitamente
  valores decimales (por ejemplo `2.5`), ya que la primera versión
  generada solo validaba el rango pero no que fuera un entero.
