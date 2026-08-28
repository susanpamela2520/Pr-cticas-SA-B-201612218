# Comparación de Tamaño de Imágenes (Antes / Después)

## Cómo se generó el "antes"

Para tener un punto de comparación real, construye también la versión
**sin optimizar** de cada imagen (un solo `FROM`, sin multi-stage, base
`node:20` o `python:3.12` completas en vez de `-alpine`/`-slim`):

```bash
# Ejemplo para auth-service — repite el patrón para los demas
cd P5/auth-service
cat > Dockerfile.sin-optimizar << 'EOF'
FROM node:20
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
CMD ["node", "dist/server.js"]
EOF

docker build -f Dockerfile.sin-optimizar -t sa-p5/auth-service:sin-optimizar .
docker build -t sa-p5/auth-service:dev .   # la version multi-stage que ya tienes

docker images | grep auth-service
```

Repite para los 6 servicios (los 4 microservicios + api-gateway +
cronjobs) y llena la tabla de abajo con los números reales que te dé
`docker images`.

## Tabla (llenar con los valores reales de tu máquina)

| Imagen | Sin optimizar (1 sola etapa) | Optimizada (multi-stage) | Reducción |
|---|---|---|---|
| auth-service | ___ MB | ___ MB | ___ % |
| tickets-service | ___ MB | ___ MB | ___ % |
| comentarios-service | ___ MB | ___ MB | ___ % |
| notificaciones-service | ___ MB | ___ MB | ___ % |
| api-gateway | ___ MB | ___ MB | ___ % |
| cronjobs | ___ MB | ___ MB | ___ % |

## Por qué la versión optimizada es más chica

- **Multi-stage build**: la etapa de "build" (que instala compiladores,
  todas las dependencias de desarrollo, y el código fuente sin
  compilar) se descarta por completo. Solo se copian a la imagen final
  los artefactos ya compilados (`dist/` en los servicios Node,
  paquetes Python ya instalados) — el compilador y las herramientas de
  build nunca llegan a la imagen que se despliega.
- **Base mínima** (`-alpine` / `-slim`): estas variantes excluyen
  utilidades de sistema, documentación, y gestores de paquetes
  completos que una imagen base normal sí trae, y que un contenedor en
  producción nunca necesita.
- **`npm ci --omit=dev`** / no instalar `gcc`/`libpq-dev` en la etapa
  final (tickets-service): las dependencias de desarrollo (linters,
  tipos, herramientas de test) y las herramientas de compilación
  (necesarias solo para instalar `psycopg2`) tampoco llegan a la
  imagen final.
