# ---- Etapa 1: build ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Etapa 2: runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force && rm -f package.json package-lock.json
COPY --from=builder /app/dist ./dist

# Herramientas de construccion que no se usan en tiempo de ejecucion.
# El contenedor arranca con `node`, nunca con npm/yarn. Eliminarlas reduce
# la superficie de ataque y elimina las CVE que arrastra npm en sus
# dependencias empaquetadas (node-tar 6.2.1, CVE-2026-59873).
RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm \
           /usr/local/bin/npx \
           /usr/local/bin/corepack \
           /opt/yarn-v1.22.22 \
           /usr/local/bin/yarn \
           /usr/local/bin/yarnpkg

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
EXPOSE 8080
CMD ["node", "dist/server.js"]