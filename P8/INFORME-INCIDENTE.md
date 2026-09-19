# Informe de incidente — Fallo inducido

**Práctica 8 · Carné 201612218 · Sección B · 19/09/2026**

## 1. Qué falló

Se modificó el manejador del endpoint `/health` del `api-gateway` para que
devolviera HTTP 500 en lugar de 200, y se publicó como `v1.2.0`.

- Archivo: `P5/api-gateway/src/app.ts`, línea 12
- Imagen: `ghcr.io/susanpamela2520/pr-cticas-sa-b-201612218/api-gateway:v1.2.0`

El defecto se eligió porque es realista (un endpoint de salud que deja de
responder es un fallo común tras un despliegue), detectable por las
validaciones existentes y reversible sin dejar rastro en el estado del
sistema.

## 2. Cómo se detectó

Lo detectó la métrica `disponibilidad` del AnalysisTemplate
`validacion-canary`, que ejecuta cada 30 segundos un job con `curl` contra
el servicio canary y exige código 200.

Mensaje registrado por Argo Rollouts:


| Dato | Valor |
|---|---|
| AnalysisRun | `api-gateway-5f89ffc996-6` |
| Métrica que falló | `disponibilidad` |
| Valor esperado | HTTP 200 |
| Valor observado | HTTP 500 |
| `failureLimit` | 0 |
| Inicio del análisis | 2026-09-19 14:24:46 UTC |

El `failureLimit: 0` es deliberado en esta métrica: un `/health` que no
responde no admite interpretación, así que un único fallo aborta la
promoción. Las otras dos métricas toleran hasta dos fallos para no
confundir ruido de red con una regresión.

## 3. Cómo se contuvo

Argo Rollouts abortó la promoción automáticamente al recibir el resultado
fallido y devolvió el ReplicaSet canary a cero réplicas. **No hubo
intervención humana.**

| Dato | Valor |
|---|---|
| Mecanismo | Argo Rollouts, aborto por análisis fallido |
| Estado del rollout | `Degraded`, canary en `ScaledDown` |
| Tráfico afectado | 20 % (1 réplica de 5 durante el primer paso) |
| Versión estable | `v1.1.9`, 4 réplicas sirviendo sin interrupción |

El primer paso del canary fija `setWeight: 20`, y el análisis arranca en
ese paso, de modo que una versión defectuosa nunca alcanza al 50 % ni al
100 % de los usuarios. Ese es el propósito de la entrega progresiva: acotar
el daño de antemano en lugar de reaccionar después.

## 4. Tiempo de recuperación

| Momento | Hora (UTC) |
|---|---|
| Sincronización de ArgoCD con la versión defectuosa | 14:24:38 |
| Canary alcanza estado `Ready` y recibe tráfico | 14:24:46 |
| Primer análisis fallido | 14:25:17 |
| Canary reducido a cero, retorno al estable | 14:25:58 |
| **Tiempo total desde que el canary recibió tráfico** | **~1 minuto 12 segundos** |

Coincide con lo esperado por diseño: el intervalo de 30 segundos del
análisis más el tiempo de creación del job de la sonda dominan esa cifra.

## 5. Cómo prevenirlo

El defecto llegó al canary porque ninguna validación previa **ejecutó** el
sistema. El pipeline comprobó que el chart renderiza, que la imagen se
construye y que no tiene CVE críticas, pero nunca arrancó el servicio para
preguntarle si responde.

**Control propuesto:** prueba de humo contra un contenedor efímero, dentro
del pipeline, antes de publicar la imagen.

```yaml
- name: Prueba de humo sobre la imagen construida
  run: |
    docker run -d --name candidata -p 8080:8080 "${IMAGEN}:${VERSION}"
    sleep 10
    CODIGO=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health)
    docker rm -f candidata
    [ "$CODIGO" = "200" ] || exit 1
```

Con ese control el defecto se habría detectado antes de que la imagen
existiera en el registro, y ningún usuario habría recibido una respuesta
errónea.

**Por qué no estaba:** la prueba de humo del repositorio se ejecuta contra
un sistema ya desplegado, que era el modelo de la Práctica 7. Al introducir
el canary la validación se movió al clúster y quedó un hueco en el
pipeline: entre "la imagen se construye" y "la imagen funciona" hay una
diferencia que ninguna fase cubría.

**Límite de la propuesta:** detecta que el servicio arranca y responde, no
que su lógica de negocio sea correcta. Un defecto que devolviera 200 con
datos equivocados pasaría igual; para eso hacen falta pruebas unitarias en
el propio servicio.

## Anexo: evidencia

| Archivo | Contenido |
|---|---|
| `img/20-rollout-paso-20.png` | Canary en `ready:1/1` con el AnalysisRun en ejecución |
| `img/24-version-defectuosa.png` | PR de promoción de `v1.2.0` |
| `img/25-rollout-degraded.png` | Rollout en estado `Degraded` |
| `img/26-analysisrun-failed.png` | AnalysisRun y job `disponibilidad` en `Failed` |
| `img/28-rollout-revertido.png` | Canary en `ScaledDown`, estables sirviendo |