# Práctica 7 — Integración y despliegue continuo (CI/CD)

**Curso:** Software Avanzado — 2S 2026 · **Carné:** 201612218 · **Sección:** B

Automatización del ciclo completo de integración y entrega para la
plataforma de tickets construida en las prácticas 5 y 6: cinco
microservicios en dos lenguajes, PostgreSQL, RabbitMQ y un chart de Helm
con siete subcharts, desplegados sobre Google Kubernetes Engine.

| Componente | Tecnología |
|---|---|
| Orquestador de CI/CD | GitHub Actions |
| Registro de imágenes | GitHub Container Registry (público) |
| Orquestador de contenedores | Google Kubernetes Engine |
| Gestor de despliegues | Helm 3 |
| Pruebas de contrato | pytest + PyYAML |

---

## Índice

- [1. El problema que resuelve](#1-el-problema-que-resuelve)
- [2. Arquitectura del pipeline](#2-arquitectura-del-pipeline)
- [3. Fase 1 — Build y pruebas unitarias](#3-fase-1--build-y-pruebas-unitarias)
- [4. Fase 2 — Validación de manifiestos](#4-fase-2--validación-de-manifiestos)
- [5. Fase 3 — Dockerización y publicación](#5-fase-3--dockerización-y-publicación)
- [6. Fase 4 — Despliegue automático](#6-fase-4--despliegue-automático)
- [7. Estrategia de versionamiento](#7-estrategia-de-versionamiento)
- [8. Manejo de secretos](#8-manejo-de-secretos)
- [9. Por qué estas pruebas](#9-por-qué-estas-pruebas)
- [10. Decisiones de diseño](#10-decisiones-de-diseño)
- [11. Estructura de archivos](#11-estructura-de-archivos)

---

## 1. El problema que resuelve

En la Práctica 6, llevar un cambio de código hasta producción requería
ejecutar a mano, en orden y sin equivocarse:

1. Seis `docker build`
2. Seis `docker push`
3. Un `helm upgrade` con tres archivos de valores y rutas relativas
4. Verificaciones manuales con `kubectl` y `curl`

El proceso tomaba unos 25 minutos y **cuatro de los cinco incidentes
documentados en la P6 fueron errores de configuración que solo se
manifestaron a mitad del despliegue**: un nombre de repositorio que no
coincidía, un tipo de Service escrito de forma fija en una plantilla, una
política de red que bloqueaba el tráfico legítimo del balanceador y unos
permisos IAM que faltaban.

Ninguno de esos errores era difícil de arreglar. El costo estuvo en
descubrirlos tarde, ya con la infraestructura levantada.

El pipeline ataca exactamente eso: **mueve las verificaciones hacia el
inicio del proceso**, donde fallar es barato. Un error de plantilla ahora
se detecta en la fase 2, en segundos, sin haber creado un solo recurso en
la nube.

---

## 2. Arquitectura del pipeline

El flujo tiene **cuatro fases** que se ejecutan como jobs encadenados en
un único workflow (`.github/workflows/ci-cd.yml`).

| Fase | Job | Qué hace | Paralelismo |
|---|---|---|---|
| 1 | `pruebas` | Compila y prueba cada microservicio | 6 jobs simultáneos |
| 2 | `validar-chart` | Renderiza el chart y valida los manifiestos | 1 job |
| 3 | `publicar` | Construye y sube las imágenes a GHCR | 6 jobs simultáneos |
| 4 | `desplegar` | Aplica los cambios en GKE y verifica | 1 job |

Las fases 1 y 2 corren **en paralelo entre sí**: son independientes y así
el desarrollador recibe retroalimentación de ambas al mismo tiempo. La
fase 3 espera a que ambas terminen en verde; la fase 4 espera a la 3.

El diagrama completo está en [DIAGRAMA.md](DIAGRAMA.md).

### Por qué una matriz y no un job monolítico

Los seis servicios se procesan con una `strategy.matrix`, lo que genera un
job independiente por servicio. Esto aporta tres cosas:

- **Velocidad:** los seis corren a la vez, no en fila
- **Diagnóstico:** si falla `tickets-service`, el job rojo dice cuál es;
  en un job monolítico habría que leer el log completo
- **Aislamiento:** con `fail-fast: false`, un servicio roto no cancela a
  los otros cinco, así se ven todos los problemas en una sola ejecución

---

## 3. Fase 1 — Build y pruebas unitarias

```yaml
strategy:
  fail-fast: false
  matrix:
    servicio: [auth-service, tickets-service, comentarios-service,
               notificaciones-service, api-gateway, cronjobs]
```

El sistema mezcla Node.js/TypeScript y Python/FastAPI, así que el job
**detecta el lenguaje** en lugar de codificarlo:

```bash
if [ -f package.json ]; then
  echo "lenguaje=node"
elif [ -f requirements.txt ] || [ -f pyproject.toml ]; then
  echo "lenguaje=python"
fi
```

Esta decisión hace que agregar un servicio nuevo no requiera tocar el
workflow: basta con añadir su nombre a la matriz.

Los pasos por servicio:

1. **Instalar dependencias** — `npm ci` (que respeta el lockfile y es
   reproducible, a diferencia de `npm install`) o `pip install -r requirements.txt`
2. **Compilar** — `npm run build --if-present`; el flag evita fallar en
   servicios sin paso de compilación
3. **Probar** — `npm run test --if-present` o `pytest` si existe el
   directorio `tests/`
4. **Verificar el Dockerfile** — un `docker build` completo, que valida que
   la imagen se puede construir antes de intentar publicarla

---

## 4. Fase 2 — Validación de manifiestos

Esta fase no estaba en el enunciado. Se añadió porque **es la que habría
evitado tres de los cinco incidentes de la P6**.

```
helm dependency update  →  helm lint  →  helm template  →  pytest
```

El chart se renderiza con la misma combinación de valores que se usa en
producción, y el YAML resultante se somete a **15 pruebas de contrato**
escritas en pytest.

Ejemplo, la prueba que reproduce el incidente 4:

```python
def test_el_api_gateway_se_expone_como_loadbalancer(docs):
    servicios = [s for s in por_tipo(docs, "Service")
                 if "api-gateway" in nombre(s)]
    tipos = {s["spec"].get("type") for s in servicios}
    assert "LoadBalancer" in tipos
```

En la P6, la plantilla del Service tenía `type: ClusterIP` escrito de forma
fija, así que `values-gke.yaml` no tenía efecto y el sistema nunca obtuvo
IP pública. Se descubrió después de crear el clúster, subir las seis
imágenes y desplegar. **Esta prueba lo detecta en 4 segundos, sin nube.**

Los manifiestos renderizados se guardan como artefacto de la ejecución,
así que quedan disponibles para inspección aunque el job falle.

---

## 5. Fase 3 — Dockerización y publicación

### Autenticación sin secretos

GHCR se autentica con el `GITHUB_TOKEN`, un token efímero que Actions
genera para cada ejecución y revoca al terminar:

```yaml
permissions:
  packages: write
```

No hay credenciales de registro que administrar ni que rotar. Es la
ventaja concreta de GHCR sobre DockerHub en este contexto.

### Normalización del nombre

```bash
echo "ruta=${GITHUB_REPOSITORY,,}" >> "$GITHUB_OUTPUT"
```

GHCR exige rutas en minúsculas y el repositorio es
`Pr-cticas-SA-B-201612218`. El operador `,,` de bash convierte a
minúsculas; sin este paso, el push falla con un error de nombre inválido.

### Caché de capas

```yaml
cache-from: type=gha,scope=${{ matrix.servicio }}
cache-to: type=gha,mode=max,scope=${{ matrix.servicio }}
```

El caché de Actions conserva las capas entre ejecuciones. El `scope` por
servicio evita que se pisen entre sí. En la práctica, la segunda ejecución
en adelante baja de ~8 minutos a ~2 en esta fase.

---

## 6. Fase 4 — Despliegue automático

### Identidad dedicada

El pipeline usa una cuenta de servicio propia
(`github-actions-deploy@...`) con el rol `roles/container.developer`, que
permite desplegar cargas de trabajo pero **no** crear ni destruir
clústeres. Es el principio de mínimo privilegio: si la credencial se
filtrara, el daño posible está acotado.

### Despliegue por digest de commit

```bash
TAG="sha-${GITHUB_SHA::7}"
helm upgrade --install sa-platform . \
  --set-string "api-gateway.image.tag=$TAG" \
  ... \
  --wait --timeout 10m
```

Se despliega la etiqueta derivada del commit, no `latest`. Así, dado
cualquier pod en ejecución, se puede saber exactamente qué commit lo
originó — y volver atrás es cuestión de desplegar el SHA anterior.

El `--wait` hace que Helm espere a que todos los recursos estén listos
antes de dar por exitoso el despliegue.

### Verificación real

El job no termina cuando Helm dice "ok". Termina cuando el sistema
responde:

```bash
for intento in $(seq 1 10); do
  CODIGO=$(curl -s -o /dev/null -w "%{http_code}" "http://$IP:8080/health")
  [ "$CODIGO" = "200" ] && exit 0
  sleep 10
done
exit 1
```

Es la diferencia entre "el despliegue se aplicó" y "el sistema funciona".
Un chart puede aplicarse sin errores y dejar la aplicación caída; esta
prueba de humo cierra ese hueco.

---

## 7. Estrategia de versionamiento

| Disparador | Fases | Etiquetas generadas |
|---|---|---|
| Pull Request | 1, 2 | ninguna (no publica) |
| Push a `main` | 1, 2, 3, 4 | `sha-abc1234`, `main`, `latest` |
| Tag `v1.2.3` | 1, 2, 3, 4 | `sha-abc1234`, `1.2.3`, `1.2` |

El principio: **cuanto más cerca de producción, más garantías se exigen**.

Un Pull Request es una propuesta; se valida pero no se publica. Solo el
código que pasó revisión y llegó a `main` produce artefactos, y solo esos
artefactos llegan al clúster.

Cada imagen recibe siempre una etiqueta inmutable (`sha-abc1234`) además
de las móviles. `latest` sirve para pruebas rápidas, pero **el despliegue
nunca la usa**: una etiqueta móvil hace que dos despliegues del mismo
manifiesto puedan traer código distinto, lo que rompe la reproducibilidad
y complica cualquier diagnóstico.

---

## 8. Manejo de secretos

Ninguna credencial vive en el repositorio.

| Secreto | Contenido | Se usa en |
|---|---|---|
| `GCP_SA_KEY` | Llave JSON de la cuenta de servicio | Fase 4 |
| `HELM_VALUES_SECRETS` | Credenciales de BD, RabbitMQ, JWT, AES | Fase 4 |
| `GITHUB_TOKEN` | Generado automáticamente por ejecución | Fase 3 |

Para que el chart pueda renderizarse en la fase 2 sin exponer nada, se usa
`P7/values-ci.yaml`, un archivo con **valores ficticios**. En esa fase solo
se comprueba que las plantillas produzcan YAML válido; no hay conexión con
ningún servicio, así que unas credenciales falsas cumplen la función.

Las reales solo se materializan en la fase 4, dentro del runner efímero,
en `/tmp`, y desaparecen cuando la máquina se destruye. GitHub además
enmascara automáticamente cualquier valor de secreto que aparezca en los
logs.

---

## 9. Por qué estas pruebas

Las 15 pruebas de `P7/tests/test_manifiestos.py` no son genéricas: cada
una responde a un riesgo concreto de este sistema.

| Prueba | Qué previene |
|---|---|
| `test_ninguna_imagen_usa_la_etiqueta_latest` | Despliegues no reproducibles |
| `test_las_imagenes_propias_apuntan_a_un_registro_remoto` | Imágenes locales de minikube que el clúster no puede descargar |
| `test_todos_los_deployments_tienen_sondas` | Rolling updates con caída de servicio |
| `test_los_deployments_declaran_recursos` | Un HPA que no puede calcular el uso de CPU |
| `test_los_hpa_arrancan_con_al_menos_dos_replicas` | Sin tolerancia a fallos durante el update |
| `test_el_api_gateway_se_expone_como_loadbalancer` | **Incidente 4 de la P6** |
| `test_solo_el_api_gateway_esta_expuesto` | Microservicios internos con IP pública |
| `test_la_politica_del_gateway_admite_trafico_externo` | **Incidente 5 de la P6** |
| `test_no_hay_secretos_escritos_en_texto_plano` | Credenciales en un ConfigMap |
| `test_la_base_de_datos_usa_almacenamiento_persistente` | Pérdida de datos al reiniciar el pod |

Las dos marcadas en negrita son **pruebas de regresión**: reproducen
fallos que ya ocurrieron. Si el chart pierde alguna de esas correcciones,
el pipeline se pone rojo antes de que nadie toque la nube.

---

## 10. Decisiones de diseño

**GHCR en lugar de DockerHub.** El enunciado admite ambos. GHCR se
autentica con el token que Actions ya provee, no requiere administrar
credenciales adicionales, y mantiene código e imágenes bajo la misma
identidad. DockerHub habría exigido crear una cuenta, generar un token de
acceso y guardarlo como secreto.

**Un solo workflow y no varios.** Separar CI y CD en archivos distintos
obliga a coordinarlos con `workflow_run`, que complica el diagnóstico y la
lectura. Con `needs` y condiciones sobre el evento se logra el mismo
control de flujo en un archivo que se entiende de arriba abajo.

**Helm en lugar de `kubectl apply`.** El sistema ya usa Helm desde la P5.
Además `helm upgrade --install` es idempotente y `helm history` deja un
registro auditable de cada despliegue, con posibilidad de rollback.

**Validación de manifiestos como fase propia.** Es la fase que aporta más
valor por tiempo invertido: corre en segundos, no necesita infraestructura
y ataca la clase de error que más caro salió en la práctica anterior.

**Prueba de humo dentro del pipeline.** Sin ella, el criterio de éxito
sería "Helm no dio error", que es más débil que "el sistema responde 200
desde internet".

---

## 11. Estructura de archivos

```
.github/
└── workflows/
    └── ci-cd.yml               Pipeline completo, 4 fases

P7/
├── README.md                   Este documento
├── DIAGRAMA.md                 Diagramas del flujo (Mermaid)
├── PREGUNTAS-TEORICAS.md       Respuestas conceptuales
├── values-ci.yaml              Valores ficticios para la validación
├── docs/
│   └── 01-puesta-en-marcha.md  Guía paso a paso
└── tests/
    ├── test_manifiestos.py     15 pruebas de contrato
    └── README.md               Cómo ejecutarlas localmente
```

Reutilizados de prácticas anteriores, sin modificación:

```
P5/<servicio>/                  Código fuente y Dockerfile de cada servicio
P5/charts/                      Chart de Helm con 7 subcharts
P6/values-gke.yaml              Valores de la nube
```

Que el pipeline **no requiera modificar el chart de la P5** es
intencional: la infraestructura como código se mantiene única, y la
automatización se construye alrededor de ella en lugar de duplicarla.

---

## Puesta en marcha

Ver [docs/01-puesta-en-marcha.md](docs/01-puesta-en-marcha.md) para la
guía completa: creación de la cuenta de servicio, carga de secretos,
primera ejecución y publicación de las imágenes.
