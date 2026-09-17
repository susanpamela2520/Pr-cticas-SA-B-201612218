# Informe de incidente — Fallo inducido

**Práctica 8 · Carné 201612218 · Sección B**

> **Plantilla a completar tras ejecutar el paso 10 de la guía de puesta en
> marcha.** Cada campo indica el comando que da el dato. La rúbrica exige
> datos concretos: "narración vaga, sin tiempos, sin causa identificada o
> sin propuesta de prevención" se califica en el rango bajo.
>
> Extensión máxima: una página.

---

## 1. Qué falló

**Naturaleza del defecto introducido deliberadamente.**

Se modificó el manejador del endpoint `/health` del `api-gateway` para que
devolviera HTTP 500 en lugar de 200, publicando esa versión como
`v1.0.2`.

El defecto se eligió por tres razones:

- **Es realista.** Un endpoint de salud que deja de responder es uno de los
  fallos más comunes tras un despliegue, y suele originarse en algo tan
  simple como una dependencia que no arranca.
- **Es detectable por las validaciones existentes**, sin necesidad de
  inventar una métrica a la medida.
- **Es reversible** con un `git revert`, sin dejar rastro en la base de
  datos ni en el estado del sistema.

> Completar si el defecto introducido fue distinto:
>
> - Archivo modificado: `______________________`
> - Commit del defecto: `______________________`
> - Tag publicado: `______________________`

---

## 2. Cómo se detectó

**Validación específica que lo identificó y umbral superado.**

Lo detectó la métrica `disponibilidad` del `AnalysisTemplate`
`validacion-canary`, que ejecuta cada 30 segundos un job con `curl` contra
el servicio canary y exige código 200.

Esa métrica tiene `failureLimit: 0`: un único fallo aborta la promoción,
porque un `/health` que no responde no admite interpretación.

| Dato | Valor |
|---|---|
| Métrica que falló | `disponibilidad` |
| Valor esperado | HTTP 200 |
| Valor observado | HTTP 500 |
| `failureLimit` | 0 |
| Paso del canary en que ocurrió | 1 (20 % del tráfico) |

Datos a completar con:

```bash
kubectl get analysisrun -n sa-prod
kubectl describe analysisrun <nombre> -n sa-prod | tail -40
```

> - Nombre del AnalysisRun: `______________________`
> - Hora de la detección: `______________________`

---

## 3. Cómo se contuvo

**Mecanismo que ejecutó la reversión y porcentaje de tráfico afectado.**

Argo Rollouts abortó la promoción automáticamente al recibir el resultado
fallido del `AnalysisRun`, y devolvió el 100 % del tráfico al ReplicaSet
estable (`v1.0.1`). No hubo intervención humana.

| Dato | Valor |
|---|---|
| Mecanismo | Argo Rollouts, aborto por análisis fallido |
| Estado del rollout | `Degraded` → revertido a estable |
| Tráfico máximo afectado | 20 % (peso del primer paso) |
| Versión a la que revirtió | `v1.0.1` |

**Por qué el 20 % y no más:** el primer paso del canary fija
`setWeight: 20`. Como el análisis arranca en ese paso, una versión
defectuosa nunca alcanza al 50 % ni al 100 % de los usuarios. Ese es
precisamente el propósito de la entrega progresiva: acotar el daño de
antemano en lugar de reaccionar después.

Datos a completar con:

```bash
kubectl argo rollouts get rollout api-gateway -n sa-prod
kubectl argo rollouts history api-gateway -n sa-prod
```

> - Revisión defectuosa: `______________________`
> - Revisión a la que revirtió: `______________________`

---

## 4. Tiempo de recuperación

**Minutos entre la publicación y el retorno al estado estable.**

| Momento | Hora | Cómo obtenerlo |
|---|---|---|
| Merge del PR de promoción | `__________` | Historial del PR en el repo GitOps |
| ArgoCD detecta el cambio | `__________` | `kubectl get application sa-platform-gateway -n argocd -o jsonpath='{.status.operationState.startedAt}'` |
| Canary alcanza el 20 % | `__________` | `kubectl argo rollouts get rollout api-gateway -n sa-prod` |
| Primer análisis fallido | `__________` | `kubectl describe analysisrun <nombre> -n sa-prod` |
| Retorno al estable | `__________` | Eventos del rollout |
| **Tiempo total** | `__________` | |

**Estimación esperada por diseño:** entre 1 y 3 minutos desde que el
canary recibe tráfico hasta la reversión completa. El intervalo de 30
segundos del análisis, más el tiempo de creación del job de la sonda, es lo
que domina esa cifra.

Nota: el tiempo entre el merge y el inicio del rollout depende del intervalo
de sondeo de ArgoCD, que por defecto es de 3 minutos. Ese tramo no es
tiempo de fallo —la versión defectuosa aún no recibía tráfico— y conviene
reportarlo por separado para no inflar la métrica.

---

## 5. Cómo prevenirlo

**Control adicional que habría evitado que la versión defectuosa llegara al
canary.**

El defecto llegó al canary porque **ninguna validación previa ejecutó el
sistema**. El pipeline comprobó que el chart renderiza, que la imagen se
construye y que no tiene CVE críticas, pero nunca arrancó el servicio para
preguntarle si responde.

**Control propuesto: prueba de humo contra un contenedor efímero, dentro
del pipeline, antes de publicar la imagen.**

Concretamente, añadir a la fase 3 un paso que levante la imagen recién
construida y le consulte `/health`:

```yaml
- name: Prueba de humo sobre la imagen construida
  run: |
    docker run -d --name candidata -p 8080:8080 \
      --env-file P8/tests/fixtures/minimo.env \
      "${IMAGEN}:${VERSION}"
    sleep 10
    CODIGO=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health)
    docker rm -f candidata
    [ "$CODIGO" = "200" ] || {
      echo "::error::La imagen no responde 200 en /health. No se publica."
      exit 1
    }
```

Con ese control, el defecto se habría detectado **antes de que la imagen
existiera en el registro**, y ningún usuario habría recibido una respuesta
errónea.

**Por qué no estaba ya:** la prueba de humo del repositorio se ejecuta
contra un sistema ya desplegado, que era el modelo de la Práctica 7. Al
introducir el canary, la validación se movió al clúster, y quedó un hueco
en el pipeline: entre "la imagen se construye" y "la imagen funciona" hay
una diferencia que ninguna fase cubría.

**Límite honesto de la propuesta:** este control detecta que el servicio
arranca y responde, no que su lógica de negocio sea correcta. Un defecto
que devolviera 200 con datos equivocados pasaría igual, y para eso hacen
falta pruebas unitarias en el propio servicio — que es un trabajo distinto,
en el repositorio de código y no en el pipeline.

---

## Anexo: evidencia recogida

| Archivo | Contenido |
|---|---|
| `img/__-rollout-degraded.png` | Rollout en estado Degraded |
| `img/__-analysisrun-failed.png` | AnalysisRun marcado como Failed |
| `img/__-logs-sonda.png` | Logs del job mostrando el HTTP 500 |
| `img/__-rollout-revertido.png` | Rollout de vuelta en el estable |
| `img/__-historial-rollout.png` | Salida de `rollouts history` |
