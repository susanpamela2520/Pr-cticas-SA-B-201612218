# Imagen deliberadamente minima: los cronjobs no necesitan Node ni Python,
# solo psql + curl + jq. Multi-stage igual que los demas servicios, aunque
# aqui la "etapa de build" solo agrega tzdata (necesaria para TZ=Etc/GMT+6).
FROM alpine:3.20 AS builder
RUN apk add --no-cache tzdata

FROM alpine:3.20 AS runtime
RUN apk add --no-cache postgresql16-client curl jq bash \
    && addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY scripts/ /scripts/
RUN chmod +x /scripts/*.sh
USER appuser
