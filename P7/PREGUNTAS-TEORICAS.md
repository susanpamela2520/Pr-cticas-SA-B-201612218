# Preguntas teóricas — CI/CD y DevOps

> El enunciado no publica un listado específico de preguntas; el criterio
> 1.4 pide "analizar e interiorizar conceptos clave sobre CI/CD y DevOps de
> forma concisa". Se responden aquí los conceptos centrales, **anclados a
> decisiones reales de este pipeline** en lugar de definiciones genéricas.

---

## 1. ¿Qué diferencia hay entre integración continua, entrega continua y despliegue continuo?

Son tres niveles de automatización sobre el mismo eje, y se distinguen por
**dónde está la última intervención humana**.

**Integración continua (CI)** es la práctica de fusionar los cambios de
todos los desarrolladores en una rama compartida de forma frecuente, con
verificación automática en cada fusión. Su objetivo es que los conflictos y
las regresiones aparezcan cuando aún son pequeños. En este proyecto, las
fases 1 y 2 son CI: compilan, prueban y validan cada Pull Request.

**Entrega continua (CD, *delivery*)** extiende lo anterior hasta dejar un
artefacto listo para producción, pero **el despliegue lo dispara una
persona**. La garantía es que cualquier commit en `main` podría desplegarse
en cualquier momento.

**Despliegue continuo (CD, *deployment*)** elimina esa última aprobación:
todo lo que pasa las verificaciones llega a producción automáticamente.

Este pipeline implementa **despliegue continuo sobre `main`**: un merge
aprobado publica las imágenes y actualiza el clúster sin que nadie ejecute
un comando. La aprobación humana no desapareció, se movió al Pull Request
— que es donde tiene más valor, porque ahí se revisa el cambio y no el
mecanismo de entrega.

---

## 2. ¿Qué es DevOps y en qué se distingue de "usar herramientas de automatización"?

DevOps es una forma de organizar el trabajo en la que quienes construyen el
software también son responsables de operarlo. Su propósito es eliminar la
frontera donde tradicionalmente se perdía información: desarrollo entregaba
un paquete y operaciones lo desplegaba, sin que ninguno viera el problema
completo.

Las herramientas son consecuencia, no definición. Un equipo puede tener
GitHub Actions y Kubernetes y seguir sin hacer DevOps si el desarrollador
no se entera cuando su cambio rompe producción.

Lo que sí es propiamente DevOps en este proyecto es el **acortamiento del
ciclo de retroalimentación**. En la P6, un error de configuración en una
plantilla de Helm se descubría después de crear un clúster, subir seis
imágenes y desplegar: unos 25 minutos y una infraestructura levantada.
Ahora ese mismo error aparece en la fase 2, en segundos, antes de tocar la
nube. El cambio de fondo no es la herramienta; es que **el costo de
equivocarse bajó lo suficiente como para que equivocarse deje de ser
grave**.

---

## 3. ¿Qué ventajas tiene contenerizar los microservicios dentro del pipeline?

**El artefacto es idéntico en todos los entornos.** La imagen que se
construye en la fase 3 es exactamente la que corre en producción — mismo
sistema base, mismas dependencias, mismas versiones. Desaparece la clase
de fallo que empieza con "en mi máquina funcionaba".

**El pipeline no necesita conocer los lenguajes.** Este sistema mezcla
Node.js y Python. Sin contenedores, el runner tendría que instalar y
gestionar ambos entornos correctamente. Con contenedores, cada `Dockerfile`
declara sus propias necesidades y el pipeline solo ejecuta `docker build`.

**El versionamiento se vuelve concreto.** Una imagen etiquetada con
`sha-abc1234` es un objeto inmutable y verificable. Volver a una versión
anterior no requiere reconstruir nada: la imagen ya existe en el registro.

**Se pueden aplicar verificaciones al artefacto mismo.** La fase 1 incluye
un `docker build` completo, lo que valida que la imagen se puede construir
antes de intentar publicarla.

---

## 4. ¿Por qué el pipeline no despliega usando la etiqueta `latest`?

Porque `latest` es una etiqueta **móvil**: apunta a lo último que se subió,
y ese destino cambia con cada publicación.

Eso rompe tres propiedades importantes:

**Reproducibilidad.** Dos despliegues del mismo manifiesto pueden traer
código distinto si entre ambos alguien publicó una imagen nueva. El
manifiesto deja de describir el sistema.

**Trazabilidad.** Ante un pod en producción, no hay forma de saber qué
commit lo originó. Diagnosticar un fallo se vuelve adivinanza.

**Rollback.** Volver atrás exige reconstruir la versión anterior, porque
no quedó registrada bajo ninguna etiqueta estable.

Por eso el despliegue usa `sha-${GITHUB_SHA::7}`: cada imagen queda ligada
a un commit concreto. `latest` se publica igualmente, pero solo como
comodidad para pruebas manuales.

Hay una prueba automática que lo vigila:

```python
def test_ninguna_imagen_usa_la_etiqueta_latest(docs):
    ...
    assert not infractores
```

---

## 5. ¿Qué es "shift left" y cómo se aplica aquí?

*Shift left* consiste en mover las verificaciones **hacia el inicio** del
ciclo de vida, porque el costo de corregir un defecto crece con el tiempo
que tarda en descubrirse.

La fase 2 es el ejemplo directo. Renderiza el chart de Helm y valida el
YAML resultante con 15 pruebas, sin necesidad de un clúster. Dos de esas
pruebas reproducen incidentes reales de la P6:

- El Service del api-gateway tenía el tipo escrito de forma fija como
  `ClusterIP`, así que el archivo de valores de la nube no tenía efecto y
  el sistema nunca obtuvo IP pública.
- La política de red solo aceptaba tráfico originado en pods del clúster,
  de modo que el tráfico externo del LoadBalancer era descartado en
  silencio.

Ambos se descubrieron **después** de crear el clúster y desplegar. Con la
fase 2, cualquiera de los dos rompe el pipeline en la primera validación,
sin haber creado un solo recurso en la nube.

---

## 6. ¿Cómo se manejan los secretos y por qué de esa manera?

El principio es que **ninguna credencial vive en el repositorio**, ni
siquiera en ramas privadas: el historial de Git es difícil de limpiar y un
secreto expuesto una vez debe considerarse comprometido para siempre.

Se usan tres mecanismos, según la necesidad:

**`GITHUB_TOKEN`** — generado automáticamente por ejecución y revocado al
terminar. Autentica contra GHCR. No hay nada que administrar ni rotar.

**GitHub Secrets** — `GCP_SA_KEY` y `HELM_VALUES_SECRETS` están cifrados en
reposo, solo son legibles por el workflow, y GitHub los enmascara si
aparecen en los logs. Se materializan en `/tmp` dentro del runner, que se
destruye al terminar.

**Valores ficticios en CI** — `P7/values-ci.yaml` contiene credenciales
falsas. La fase 2 solo comprueba que las plantillas produzcan YAML válido,
sin conectarse a nada, así que valores inventados cumplen la función sin
exponer los reales.

A esto se suma el **mínimo privilegio** en la nube: la cuenta de servicio
del pipeline tiene `roles/container.developer`, que permite desplegar
cargas de trabajo pero no crear ni destruir clústeres. Si la llave se
filtrara, el daño posible está acotado.

---

## 7. ¿Qué diferencia hay entre `npm install` y `npm ci`, y por qué importa en un pipeline?

`npm install` resuelve las dependencias contra los rangos de versión
declarados en `package.json` y puede **actualizar el lockfile**. Dos
ejecuciones separadas por días pueden instalar versiones distintas.

`npm ci` instala exactamente lo que dice `package-lock.json`, borra
`node_modules` antes de empezar y falla si el lockfile no concuerda con el
`package.json`.

En un pipeline la diferencia es determinismo. Con `npm install`, un build
puede romperse sin que nadie haya cambiado una línea de código, porque una
dependencia transitiva publicó una versión nueva. Eso convierte un fallo
real en algo que parece aleatorio.

El workflow usa `npm ci` cuando existe lockfile y cae a `npm install` solo
si no lo hay.

---

## 8. ¿Por qué los seis servicios se procesan con una matriz y no en un solo job?

```yaml
strategy:
  fail-fast: false
  matrix:
    servicio: [auth-service, tickets-service, ...]
```

**Velocidad.** Los seis jobs corren simultáneamente en runners distintos.
En secuencia, la fase 1 tardaría la suma de los seis tiempos.

**Diagnóstico.** Si falla `tickets-service`, el job rojo lleva su nombre.
En un job monolítico habría que leer el log completo para ubicar dónde se
rompió.

**Aislamiento.** `fail-fast: false` evita que el primer fallo cancele a los
demás. Así una sola ejecución muestra *todos* los servicios con problemas,
en lugar de obligar a corregir y reintentar uno por uno.

**Mantenimiento.** Agregar un séptimo microservicio es añadir una línea a
la matriz, no escribir un bloque de pasos nuevo.

---

## 9. ¿Por qué el pipeline verifica con `curl` si Helm ya reportó éxito?

Porque son dos afirmaciones distintas. `helm upgrade --wait` garantiza que
**los recursos se aplicaron y los pods alcanzaron el estado Ready**. No
garantiza que el sistema responda.

Un despliegue puede ser exitoso desde el punto de vista de Kubernetes y
dejar la aplicación inalcanzable: una NetworkPolicy mal configurada, un
LoadBalancer sin IP asignada, una variable de entorno equivocada. En la P6
ocurrió exactamente eso — todos los pods en `1/1 Running` y el sistema
respondiendo timeout desde internet.

Por eso la fase 4 termina con una prueba de humo real:

```bash
CODIGO=$(curl -s -o /dev/null -w "%{http_code}" "http://$IP:8080/health")
```

Si el sistema no devuelve 200 tras diez intentos, el pipeline se marca en
rojo aunque Helm haya dicho que todo salió bien. El criterio de éxito pasa
de "se aplicó" a "funciona".

---

## 10. ¿Qué es la infraestructura como código y cómo se refleja en este proyecto?

Infraestructura como código (IaC) es tratar la definición de la
infraestructura como se trata el código de la aplicación: versionada,
revisada y aplicada de forma automática, en lugar de configurada a mano.

En este proyecto el chart de Helm cumple ese papel. Los deployments,
services, HPA, NetworkPolicies, cuotas y volúmenes están declarados en el
repositorio, no configurados desde una consola web.

Las consecuencias prácticas:

- **El historial de la infraestructura es el de Git.** Se puede saber quién
  cambió el número mínimo de réplicas y en qué commit.
- **Los cambios de infraestructura pasan por revisión.** Modificar una
  NetworkPolicy requiere un Pull Request, igual que modificar el código.
- **La infraestructura es verificable.** Las 15 pruebas de la fase 2 son
  posibles precisamente porque la definición es un archivo, no una serie
  de clics.
- **Es reproducible.** Levantar el sistema de cero en un clúster nuevo es
  un `helm install`.

Un detalle deliberado: el pipeline **no modifica el chart de la P5**. La
definición de la infraestructura se mantiene única, y la automatización se
construye alrededor de ella. Duplicar manifiestos para CI/CD habría creado
dos fuentes de verdad que se desincronizan a la primera distracción.

---

## 11. ¿Qué se gana y qué se pierde al automatizar el despliegue?

**Se gana** velocidad, reproducibilidad y auditoría. El ciclo pasó de ~25
minutos manuales a ~8 automatizados, siempre en el mismo orden y con las
mismas verificaciones. Cada despliegue queda registrado con su commit, su
ejecución y su resultado.

**Se pierde** la pausa. Un proceso manual tiene un momento en el que
alguien mira lo que va a hacer antes de hacerlo; ese momento a veces
detiene errores. Automatizar significa que un error también se propaga
rápido.

La respuesta a eso no es volver al proceso manual, sino **poner las
verificaciones dentro del pipeline**: las pruebas de las fases 1 y 2, la
revisión obligatoria del Pull Request antes de llegar a `main`, y la prueba
de humo que revierte el veredicto si el sistema no responde. La confianza
no viene de que el proceso sea automático, sino de que las verificaciones
que reemplazan a la pausa humana sean buenas.

También hay un costo de mantenimiento real: el pipeline es código y se
rompe. Una acción que cambia de versión mayor, un runner que actualiza su
imagen base. Es trabajo que antes no existía, y conviene reconocerlo en
lugar de presentar la automatización como gratuita.
