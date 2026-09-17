# Preguntas teóricas — GitOps, entrega progresiva y cadena de suministro

> El enunciado no publica un listado específico. El criterio 1.4 pide
> "analizar el comportamiento de su propia implementación y sus
> implicaciones operativas", y penaliza las respuestas "contradictorias con
> su implementación". Por eso cada respuesta cita el archivo concreto donde
> vive la decisión.

---

## 1. ¿Qué es GitOps y en qué se distingue de "tener el despliegue automatizado"?

GitOps es un modelo operativo con cuatro propiedades: el estado deseado del
sistema se describe de forma **declarativa**, ese estado está
**versionado** en Git, los cambios se aplican **automáticamente**, y un
agente **reconcilia continuamente** el estado real con el declarado.

La Práctica 7 ya tenía despliegue automatizado y **no era GitOps**. La
diferencia está en las dos últimas propiedades.

En la P7 el pipeline empujaba cambios al clúster (*push*). Si alguien
modificaba algo a mano con `kubectl`, ese cambio sobrevivía hasta el
siguiente despliegue, y nadie se enteraba. El repositorio describía lo que
*se había desplegado la última vez*, no lo que *está corriendo*.

Aquí ArgoCD opera en modo *pull*: consulta el repositorio, lo compara con
el clúster y corrige la diferencia. Con `selfHeal: true`
(`apps/api-gateway.yaml`), un cambio manual se revierte solo. Eso convierte
el repositorio en la única fuente de verdad, no por convención sino porque
el sistema lo impone.

La consecuencia operativa concreta: `git log` del repositorio GitOps
responde a "qué está corriendo y desde cuándo" sin consultar el clúster.

---

## 2. ¿Por qué el repositorio de manifiestos está separado del de código?

Tres razones, en orden de importancia práctica.

**Separa el historial de desarrollo del de despliegue.** El repositorio de
código registra cómo evolucionó el software; el GitOps registra qué versión
estuvo en producción y cuándo. Mezclarlos hace que un `git log` se llene de
commits irrelevantes para responder la pregunta que se está haciendo.

**Evita el bucle de retroalimentación.** Si el pipeline escribiera en el
mismo repositorio que lo dispara, cada despliegue generaría un commit que
dispararía otro pipeline. Se resuelve con filtros de ruta o mensajes
`[skip ci]`, pero es frágil.

**Permite permisos distintos.** El repositorio GitOps puede exigir revisión
obligatoria y restringir quién aprueba un cambio a producción, sin imponer
esa misma rigidez al desarrollo diario.

En esta implementación el pipeline clona el repo GitOps con un token
específico (`GITOPS_TOKEN`) cuyo alcance es solo ese repositorio, con
permiso de contenidos y pull requests. El `GITHUB_TOKEN` por defecto no
alcanza a otros repositorios, lo que en este caso es una protección y no un
estorbo.

---

## 3. ¿Por qué se le quitó al pipeline el acceso al clúster?

En la P7 el pipeline necesitaba permisos de administración de Kubernetes
Engine para poder desplegar. Eso significaba que **comprometer el
repositorio de código equivalía a comprometer la infraestructura**: un
atacante con capacidad de modificar un workflow podía ejecutar lo que
quisiera en el clúster.

No es un riesgo teórico. Un workflow se modifica con un commit, y los
pipelines de CI son un blanco habitual precisamente porque suelen tener
credenciales amplias.

En la P8 el pipeline no tiene credenciales de Kubernetes. Su capacidad
máxima es **proponer** un cambio de versión mediante un Pull Request. Para
que ese cambio llegue al clúster hace falta que una persona lo apruebe, y
después ArgoCD —que sí tiene permisos— lo aplica.

Terraform define además una cuenta de servicio `pipeline-lector`
(`terraform/main.tf`) con verbos limitados a `get`, `list` y `watch`. Sin
`create`, `update`, `patch` ni `delete`. Existe para que el pipeline pueda
consultar estado si hiciera falta, sin poder cambiar nada.

---

## 4. ¿Por qué canary y no blue-green?

Ambas contienen el daño de una versión defectuosa, pero de forma distinta.

**Blue-green** mantiene dos entornos completos y conmuta el tráfico de
golpe. La reversión es instantánea —se conmuta de vuelta— pero el momento
de la conmutación es todo o nada: si la versión nueva falla bajo carga
real, falla para el 100 % de los usuarios a la vez.

**Canary** dirige un porcentaje creciente del tráfico a la versión nueva.
El defecto se manifiesta con una fracción de los usuarios afectados, y hay
tiempo de reaccionar antes de que escale.

Se eligió canary por dos razones concretas de esta práctica:

**El daño queda acotado de antemano.** Con `setWeight: 20` en el primer
paso (`rollouts/api-gateway-rollout.yaml`), una versión mala nunca alcanza
al 50 % ni al 100 %. En el fallo inducido, el máximo de tráfico afectado
fue el 20 %.

**Consume menos recursos.** Blue-green exige duplicar la capacidad durante
la transición. En un clúster de 4 nodos con cuota de namespace, eso habría
requerido dimensionar para el doble del pico.

El costo de la decisión: durante la promoción coexisten dos versiones
atendiendo tráfico. Si el cambio incluyera una migración de base de datos
incompatible hacia atrás, el canary sería peligroso y blue-green preferible.

---

## 5. ¿Cómo se eligieron los umbrales de promoción?

De la línea base medida con k6 en la Práctica 6 (26.427 peticiones, 100
usuarios concurrentes):

| Métrica | Base P6 | Umbral P8 | Razonamiento |
|---|---|---|---|
| Tasa de error | 0,01 % | ≥ 99 % éxito | Pasar de 0,01 % a 1 % es un aumento de cien veces: es una regresión, no ruido de red |
| Latencia p95 | 222 ms | ≤ 500 ms | Poco más del doble; el canary comparte nodos con el estable, así que algo de contención es esperable |
| Disponibilidad | — | 200 obligatorio | Binaria, `failureLimit: 0` |

El razonamiento de fondo: **un umbral solo sirve si distingue una regresión
de una fluctuación normal.**

Un umbral demasiado estricto genera falsos positivos, y un equipo que ve
reversiones espurias acaba desactivando el análisis — con lo que el control
deja de existir aunque el archivo siga ahí. Un umbral demasiado laxo deja
pasar la regresión que debía detener.

Los 500 ms para el p95 salen de ese equilibrio: el doble de la base tolera
la contención esperable de dos versiones compartiendo nodos, y detecta una
degradación seria.

La métrica de disponibilidad es la excepción deliberada: tiene
`failureLimit: 0` porque un `/health` que devuelve 500 no admite
interpretación. No hay umbral que negociar.

---

## 6. ¿Qué implica `failureLimit` en el tiempo de recuperación?

`failureLimit: 2` sobre `interval: 30s` significa que la métrica tolera dos
mediciones fallidas antes de abortar. Con la tercera, revierte.

En la práctica: **hasta 90 segundos** entre la primera señal de degradación
y la reversión, en las métricas de tasa de éxito y latencia.

La métrica de disponibilidad, con `failureLimit: 0`, revierte en el primer
fallo — unos 30 segundos.

El compromiso es explícito. Un `failureLimit` de 0 en todas las métricas
daría la reversión más rápida posible, pero cualquier hipo de red durante
una medición abortaría un despliegue sano. Con 2 se exige que el fallo sea
**sostenido**: tres mediciones consecutivas fallidas no son ruido.

Esa distinción es la razón de que las tres métricas no compartan
configuración: un timeout de red puede afectar a la medición de latencia,
pero un 500 sostenido en `/health` no es ambiguo.

---

## 7. ¿Por qué Trivy usa `ignore-unfixed: true`?

Porque una vulnerabilidad crítica **sin parche disponible** no se arregla
bloqueando el pipeline.

Si se bloquea por CVE sin solución publicada, el equipo se encuentra con un
pipeline que no puede pasar y nada que hacer al respecto. La respuesta
inevitable es añadir una excepción, y a partir de ahí las excepciones se
acumulan hasta que el control deja de funcionar en la práctica.

Con `ignore-unfixed: true`, el bloqueo ocurre solo cuando **hay algo que
hacer**: actualizar la dependencia. El bloqueo pasa a ser accionable, y por
eso se respeta.

Las CVE sin parche no se ignoran: el paso previo del workflow genera el
reporte completo con severidades `LOW` a `CRITICAL`, lo publica en el
resumen de la ejecución, lo sube a la pestaña Security en formato SARIF y
lo conserva como artefacto 30 días. Quedan visibles y auditables; lo que no
hacen es detener la entrega.

---

## 8. ¿Qué aporta el SBOM que no aporte el análisis de CVE?

El análisis de Trivy responde "¿tiene vulnerabilidades conocidas **hoy**?".
El SBOM responde "¿qué contiene exactamente esta imagen?".

La diferencia importa cuando aparece una CVE nueva. Cuando se publicó la
vulnerabilidad de Log4j, la pregunta urgente en miles de organizaciones fue
"¿estamos afectados?", y quienes no tenían inventario tardaron días en
responder revisando imagen por imagen.

Con el SBOM en formato CycloneDX, esa pregunta se contesta con una
búsqueda. El workflow lo genera con `anchore/sbom-action` y lo adjunta a la
imagen firmada como atestación (`cosign attest --type cyclonedx`), de modo
que el inventario viaja **con** la imagen y no en un repositorio aparte que
puede desincronizarse.

---

## 9. ¿Qué significa que la firma sea *keyless* y por qué es mejor aquí?

La firma convencional usa un par de llaves: la privada firma, y hay que
guardarla en algún sitio. En un pipeline eso significa un secreto más que
rotar, proteger y que puede filtrarse.

La firma *keyless* de Sigstore usa el **token OIDC del propio workflow**
como identidad. Cosign lo intercambia por un certificado de corta duración,
firma, y registra la firma en el log de transparencia público de Sigstore.
No hay llave privada en ningún momento.

Concretamente, aquí eso da:

**Nada que rotar ni que filtrar.** No existe el secreto.

**Identidad verificable, no solo firma válida.** La verificación comprueba
**quién** firmó y **desde dónde**:

```
cosign verify \
  --certificate-identity-regexp "https://github.com/<repo>/.github/workflows/.*" \
  --certificate-oidc-issuer "https://token.actions.githubusercontent.com"
```

Sin esas dos condiciones, cualquier firma válida pasaría —incluida la de un
atacante con su propia identidad de Sigstore. Es el error más común al
implementar verificación de firmas: comprobar que *hay* firma en lugar de
comprobar *de quién* es.

**Auditoría pública.** La firma queda en un log de transparencia
append-only, consultable por terceros.

---

## 10. ¿Qué previene cada política de admisión y por qué en el clúster y no solo en el pipeline?

| Política | Qué previene |
|---|---|
| `disallow-latest-tag` | Una etiqueta móvil hace que el repositorio deje de describir el estado real: dos despliegues del mismo manifiesto pueden traer código distinto |
| `require-resource-limits` | Sin requests el HPA no puede calcular el uso y el autoescalado no funciona; sin limits un contenedor con fuga de memoria puede agotar el nodo |
| `require-run-as-nonroot` | Un contenedor root que escapa del aislamiento obtiene root en el **nodo**, no solo en el contenedor |

**Por qué en el clúster y no solo en el pipeline:** el pipeline valida lo
que pasa por él. La política valida **todo lo que intenta entrar**, sin
importar por dónde venga.

El pipeline de esta práctica ya comprueba etiquetas `latest` en la fase 1,
y esa comprobación es útil porque falla antes y con mejor mensaje. Pero solo
cubre el camino previsto. Un `kubectl apply` manual, un chart instalado a
mano, un operador que crea pods: nada de eso pasa por el pipeline, y todo
pasa por el webhook de admisión.

La comprobación del pipeline es conveniencia; la política es la garantía.

El pod de prueba (`policies/pod-de-prueba-rechazado.yaml`) viola las tres a
la vez, precisamente para demostrar que el control opera en el clúster y no
depende del pipeline.

---

## 11. ¿Por qué Terraform y ArgoCD se reparten el clúster, en lugar de usar uno solo?

Ambos son declarativos, así que la separación podría parecer redundante. La
frontera está en **la frecuencia de cambio y quién lo ejecuta**.

**Terraform** administra lo que se crea una vez y cambia rara vez:
namespaces, cuotas, límites y RBAC. Lo ejecuta un operador desde su
máquina, de forma deliberada. Modificar una cuota de recursos no es parte
del ciclo de entrega.

**ArgoCD** administra lo que cambia en cada despliegue: rollouts, servicios,
configuración, políticas.

Hay además una dependencia concreta: la Application lleva
`CreateNamespace=false` porque los namespaces necesitan la etiqueta
`sa-platform/aplicar-politicas` para que Kyverno distinga producción
(bloquea) de staging (audita). Si ArgoCD los creara, esa etiqueta se
perdería y las políticas dejarían de aplicarse donde deben.

El RBAC es el otro punto de contacto: Terraform es quien **otorga** a
ArgoCD el permiso de escribir cargas de trabajo. Esa asimetría es
intencional — el componente que concede privilegios no es el mismo que los
usa.

---

## 12. ¿Cómo puede un repositorio público contener los secretos del sistema?

Porque lo que contiene no son los secretos, sino su versión cifrada.

Sealed Secrets usa criptografía asimétrica. El controlador genera un par de
llaves **dentro del clúster**; la pública se usa para cifrar y **la privada
nunca sale de ahí**. El archivo `sealed-secrets.yaml` solo puede
descifrarlo ese controlador.

El flujo (documentado en `secrets/README.md` del repo GitOps):

```
secretos.env (local)
      ↓  kubectl create secret --dry-run=client | kubeseal
sealed-secrets.yaml (cifrado, se versiona)
      ↓  ArgoCD lo aplica
el controlador lo descifra con su llave privada
      ↓
Secret de Kubernetes (existe solo en el clúster)
```

El `--dry-run=client` es el detalle que importa: construye el Secret
localmente sin enviarlo al clúster, lo pasa a `kubeseal` y solo la versión
cifrada toca el disco. El archivo en claro se borra.

**Límite honesto del modelo:** si la llave privada del controlador se
perdiera —al recrear el clúster, por ejemplo— los archivos cifrados se
vuelven inservibles y hay que regenerarlos desde los valores originales.
Por eso los secretos en claro deben conservarse fuera del repositorio, en
un gestor de contraseñas, y no solo en la máquina de quien los cifró.

---

## 13. ¿Qué no cubre esta implementación?

Vale la pena nombrarlo, porque presentar el flujo como completo sería
inexacto.

**El canary no valida lógica de negocio.** El `AnalysisTemplate` comprueba
que `/health` responda 200 y que la latencia esté en rango. Una versión que
devolviera 200 con datos equivocados pasaría la promoción. Cubrir eso
requiere pruebas de contrato sobre los endpoints reales, ejecutadas contra
el canary.

**No hay verificación de firma en la admisión.** El pipeline verifica la
firma antes de proponer el despliegue, pero el clúster no la comprueba al
admitir el pod. Un `kubectl apply` manual con una imagen sin firmar sería
admitido. La solución es una política `verifyImages` de Kyverno, que exige
distribuir la clave pública o configurar la identidad de Sigstore en el
clúster.

**El análisis usa sondas propias, no métricas del sistema.** Los jobs de
`curl` miden lo que ellos mismos generan. Un análisis basado en Prometheus
mediría el tráfico **real** de los usuarios, que es una señal mejor: un
endpoint puede responder bien a la sonda y mal al tráfico de producción.

**La aprobación del PR es el único control humano.** Y un PR generado
automáticamente con todos sus checks en verde tiende a aprobarse sin leer.
El control existe formalmente; su eficacia depende de la disciplina del
equipo, que no es algo que el sistema pueda garantizar.
