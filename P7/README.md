# Evidencias — Práctica 7: Integración y despliegue continuo (CI/CD)

**Curso:** Software Avanzado — 2S 2026 · **Carné:** 201612218 · **Sección:** B
**Repositorio:** `susanpamela2520/Pr-cticas-SA-B-201612218`
**Registro de imágenes:** `ghcr.io/susanpamela2520/pr-cticas-sa-b-201612218`
**Clúster de despliegue:** `sa-p6-cluster` (GKE, `us-central1-a`)
**IP pública alcanzada por el pipeline:** `104.197.47.223:8080`

---

## Resumen

Se automatizó el ciclo completo de integración y entrega para la
plataforma de tickets de las prácticas 5 y 6, mediante un pipeline de
GitHub Actions con cuatro fases: build y pruebas, validación de
manifiestos, publicación de imágenes en GHCR y despliegue automático a
GKE.

El pipeline se verifica a sí mismo: la última etapa no termina cuando
Helm reporta éxito, sino cuando el sistema responde HTTP 200 desde
internet.

---

## 1. Cierre de la práctica anterior

### 1.1 Eliminación del release y del clúster de la P6
![Eliminación del clúster](img/Captura1%20-%20EliminacionKluster.png)

### 1.2 Confirmación de eliminación
![Eliminación confirmada](img/Captura2%20-%20EliminacionKluster%20P6.png)

### 1.3 Verificación de que no quedaron recursos cobrando
![Listado sin cobros](img/Captura3%20-%20ListadodeNOcobros.png)

Se verificó que no quedaran reglas de reenvío, direcciones IP ni discos
huérfanos, que siguen generando costo aunque el clúster ya no exista.

---

## 2. Versionamiento y flujo de trabajo

### 2.1 Pull Request con verificaciones superadas
![Pull Request fusionado](img/04-pr-checks.png.png)

El trabajo se desarrolló en la rama `feature/cicd` y se integró a `main`
mediante Pull Request. Las verificaciones automáticas se ejecutaron en el
PR **antes** del merge: 5 commits, 9 checks superados.

**Criterio de la rúbrica:** el cambio no llega a `main` sin haber pasado
las etapas de build, prueba y validación.

### 2.2 Ejecución disparada por tag de versión
![Ejecución por tag](img/15-run-por-tag.png.png)

### 2.3 Etiquetas generadas sobre la misma imagen
![Etiquetas de la imagen](img/16-etiquetas-imagen.png.png)

Estrategia de disparadores implementada:

| Disparador | Fases que corren | Etiquetas generadas |
|---|---|---|
| Pull Request | 1 y 2 | ninguna — no publica |
| Push a `main` | 1, 2, 3 y 4 | `sha-xxxxxxx`, `main`, `latest` |
| Tag `v1.0.0` | 1, 2, 3 y 4 | `sha-xxxxxxx`, `1.0.0`, `1.0` |

El despliegue usa siempre la etiqueta inmutable derivada del commit
(`sha-628154b`), nunca `latest`.

---

## 3. El pipeline completo

### 3.1 Las cuatro fases en verde
![Pipeline completo](img/05-pipeline-completo.png.png)

Grafo de ejecución mostrando las cuatro fases, sus dependencias y la IP
pública alcanzada. Las fases 1 y 2 corren en paralelo; la 3 espera a
ambas; la 4 espera a la 3.

---

## 4. Fase 1 — Build y pruebas unitarias

![Fase 1 - pruebas](img/06-etapa1-pruebas.png.png)

Seis jobs en paralelo, uno por microservicio, mediante
`strategy.matrix`. Cada job detecta el lenguaje del servicio (Node.js o
Python), instala dependencias con el gestor correspondiente, compila,
ejecuta las pruebas del servicio y verifica que su Dockerfile se pueda
construir.

Con `fail-fast: false`, un servicio roto no cancela a los otros cinco:
una sola ejecución revela todos los problemas.

---

## 5. Fase 2 — Validación de manifiestos

![Fase 2 - validación](img/07-etapa2-validacion.png.png)

El chart de Helm se renderiza con la misma combinación de valores que se
usa en producción, y el YAML resultante se somete a **15 pruebas de
contrato** escritas en pytest. Corren en menos de un segundo y no
necesitan clúster.

Dos de ellas son **pruebas de regresión** de incidentes reales de la P6:

| Prueba | Incidente que previene |
|---|---|
| `test_el_api_gateway_se_expone_como_loadbalancer` | La plantilla del Service tenía `type: ClusterIP` escrito de forma fija, así que el archivo de valores de la nube no tenía efecto y el sistema nunca obtuvo IP pública |
| `test_la_politica_del_gateway_admite_trafico_externo` | La NetworkPolicy solo aceptaba tráfico de pods del clúster, de modo que el tráfico del LoadBalancer externo era descartado en silencio |

Ambos incidentes se descubrieron en la P6 **después** de crear el
clúster, subir las seis imágenes y desplegar. Esta fase los detecta en
segundos, antes de tocar la nube.

Las pruebas se validaron introduciendo a propósito cada error que
pretenden detectar; en los tres casos falló únicamente la prueba
correspondiente. El procedimiento está documentado en
`P7/tests/README.md`.

---

## 6. Fase 3 — Dockerización y publicación

### 6.1 Las seis imágenes publicadas
![Fase 3 - publicación](img/08-etapa3-publicar.png.png)

### 6.2 Paquetes en GHCR
![Packages en GHCR](img/14-packages-ghcr.png.png)

Se eligió GitHub Container Registry sobre DockerHub porque se autentica
con el `GITHUB_TOKEN` que Actions genera por ejecución y revoca al
terminar: no hay credenciales de registro que administrar ni rotar.

Los seis paquetes se configuraron como **públicos**, tanto por requisito
de la rúbrica como porque el clúster de GKE no posee credenciales de
GitHub para descargar paquetes privados.

Detalle de implementación: GHCR exige rutas en minúsculas y el nombre
del repositorio contiene mayúsculas, por lo que el workflow lo normaliza
con `${GITHUB_REPOSITORY,,}` antes de construir la ruta de la imagen.

---

## 7. Fase 4 — Despliegue automático

### 7.1 El job de despliegue completo
![Fase 4 - despliegue](img/09-etapa4-deploy.png.png)

### 7.2 Resumen generado por el pipeline
![Resumen del despliegue](img/10-resumen-deploy.png.png)

Trazabilidad completa en una sola vista: commit `628154b` → etiqueta
`sha-628154b` → clúster `sa-p6-cluster` → namespace `sa-p5` → IP pública
`104.197.47.223`.

### 7.3 Pods desplegados en el clúster
![Pods desplegados](img/11-pods-desplegados.png.png)

### 7.4 LoadBalancer con IP pública asignada
![LoadBalancer](img/12-loadbalancer-ip.png.png)

### 7.5 El sistema respondiendo desde internet
![Sistema en el navegador](img/13-sistema-navegador.png.png)

El pipeline no da por exitoso el despliegue cuando Helm reporta éxito,
sino cuando el sistema responde HTTP 200 desde internet. La prueba de
humo reintenta hasta diez veces con diez segundos de intervalo; si no
obtiene respuesta, el pipeline se marca en rojo aunque Helm haya
terminado sin errores.

Esa distinción importa: en la P6 llegamos a tener todos los pods en
`1/1 Running` mientras el sistema devolvía timeout desde internet.

---

## 8. Limpieza de recursos

![Limpieza final](img/17-limpieza-final.png.png)

Orden de eliminación: primero el release de Helm (para que el
LoadBalancer y los discos persistentes se liberen limpiamente), después
los PVC, y al final el clúster.

Las imágenes de GHCR se conservan: no generan costo y sirven como
evidencia permanente del funcionamiento del pipeline.

---

## 9. Problemas resueltos durante la implementación

Los cinco incidentes diagnosticados y corregidos, con su causa raíz.

| # | Síntoma | Causa raíz | Solución aplicada |
|---|---|---|---|
| 1 | `nil pointer evaluating interface {}.type` en `helm lint` | El lint corría sin `values-gke.yaml`, y `service.type` solo está definido ahí | Incluir el archivo en el lint **y** proteger la plantilla con `(.Values.service \| default dict).type` |
| 2 | `Key creation is not allowed on this service account` | Política de organización que bloquea la creación de llaves JSON de cuentas de servicio | Migrar a **Workload Identity Federation** |
| 3 | `cannot unmarshal string into Go value of type map[string]interface {}` | El secreto multilínea perdía sus saltos de línea al interpolarse en la línea de bash | Codificar el archivo en **base64** y decodificarlo en el runner |
| 4 | 18 errores `roles.rbac.authorization.k8s.io is forbidden` | `roles/container.developer` no puede crear objetos de RBAC: Kubernetes impide que una identidad otorgue permisos que ella misma no posee | Cambiar a `roles/container.admin` |
| 5 | `UPGRADE FAILED: context deadline exceeded`, 10 pods en `Pending` | El clúster reducido (2 nodos `e2-medium`) no tenía CPU suficiente para 11 pods | Redimensionar a 4 nodos |

### Sobre el incidente 2 — Workload Identity Federation

El método convencional (una llave JSON guardada como secreto de GitHub)
estaba bloqueado por política de la organización. La alternativa que se
implementó resulta **más segura**: GitHub obtiene un token de corta
duración mediante OIDC, y no existe ninguna credencial de larga duración
que pueda filtrarse.

La configuración incluye una condición que amarra el acceso
exclusivamente a este repositorio:

```
--attribute-condition="assertion.repository=='susanpamela2520/Pr-cticas-SA-B-201612218'"
```

Sin ella, cualquier repositorio de GitHub podría solicitar credenciales
del proyecto.

### Sobre el incidente 4 — el privilegio necesario

`roles/container.admin` es más amplio de lo ideal, pero sigue acotado a
Kubernetes Engine: no concede acceso a facturación, a IAM del proyecto
ni a otros servicios de Google Cloud. La alternativa estricta habría
sido definir un ClusterRole específico dentro del clúster, lo que agrega
complejidad sin aportar a los objetivos de la práctica.

---

## 10. Índice de capturas

| Archivo | Sección | Contenido |
|---|---|---|
| `Captura1 - EliminacionKluster.png` | 1.1 | Eliminación del clúster de la P6 |
| `Captura2 - EliminacionKluster P6.png` | 1.2 | Confirmación de eliminación |
| `Captura3 - ListadodeNOcobros.png` | 1.3 | Sin recursos huérfanos |
| `04-pr-merged.png` | 2.1 | Pull Request fusionado con 9 checks |
| `05-pipeline-completo.png` | 3.1 | Las cuatro fases en verde |
| `06-etapa1-pruebas.png` | 4 | Seis jobs de build y pruebas |
| `07-etapa2-validacion.png` | 5 | Las 15 pruebas de contrato |
| `08-etapa3-publicar.png` | 6.1 | Seis jobs de publicación |
| `09-etapa4-deploy.png` | 7.1 | Job de despliegue completo |
| `10-resumen-deploy.png` | 7.2 | Tabla de trazabilidad |
| `11-pods-desplegados.png` | 7.3 | Pods en el clúster |
| `12-loadbalancer-ip.png` | 7.4 | LoadBalancer con IP |
| `13-sistema-navegador.png` | 7.5 | `/health` desde internet |
| `14-packages-ghcr.png` | 6.2 | Seis paquetes en GHCR |
| `15-run-por-tag.png` | 2.2 | Ejecución disparada por `v1.0.0` |
| `16-etiquetas-imagen.png` | 2.3 | Etiquetas de una imagen |
| `17-limpieza-final.png` | 8 | Clúster eliminado |

