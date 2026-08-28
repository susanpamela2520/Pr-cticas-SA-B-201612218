# Preguntas Teóricas

## ¿Qué es Helm y qué problema resuelve frente a los manifiestos sueltos?

Helm es el gestor de paquetes de Kubernetes. Un manifiesto suelto
(`kubectl apply -f`) es un archivo estático: si quieres el mismo
Deployment en 3 ambientes con distintos valores, terminas copiando y
pegando YAML con pequeños cambios, sin versión, sin forma limpia de
deshacer un cambio. Helm empaqueta todos esos manifiestos como
plantillas parametrizables (un "chart"), permite instalarlos con un
solo comando pasando valores distintos por ambiente, y — lo más
importante — lleva un historial de cada instalación (`release`), así
que un `helm rollback` puede regresar el clúster exactamente al estado
anterior sin que tú tengas que recordar qué cambiaste.

## ¿Cuál es la diferencia entre chart, release y repository?

- **Chart**: el paquete en sí — la carpeta con `Chart.yaml`,
  `values.yaml` y `templates/`. Es la "receta".
- **Release**: una instancia concreta de ese chart ya instalada en un
  clúster, con un nombre y un namespace específicos. El mismo chart se
  puede instalar varias veces como releases distintos.
- **Repository**: un lugar (una URL) donde se publican charts
  empaquetados para que `helm install` los pueda descargar, similar a
  como npm o pip tienen su registro de paquetes.

## ¿Qué es un StatefulSet y cuándo NO usarlo?

Un StatefulSet es para cargas de trabajo con estado: cada pod tiene
una identidad estable (nombre y volumen persistente propios, ej.
`db-0`, `db-1`) que sobrevive a un reinicio o reprogramación del pod —
a diferencia de un Deployment, donde los pods son intercambiables y
desechables. Se usa para bases de datos, colas con persistencia, o
cualquier cosa donde el orden de arranque o la identidad del pod
importe. **No** se debe usar para servicios sin estado (como los
microservicios de esta práctica) — ahí un Deployment normal es más
simple y se escala más rápido, porque no carga con la complejidad de
mantener identidad/volumen por pod.

## ¿Cuál es la diferencia entre liveness, readiness y startup probe?

- **Startup probe**: le da tiempo a la aplicación de arrancar antes de
  que las otras dos empiecen a evaluarla — útil si el arranque es
  lento (por ejemplo, esperando conexión a la base de datos).
- **Liveness probe**: pregunta "¿sigue vivo el proceso?". Si falla,
  Kubernetes **reinicia el contenedor** — es para recuperarse de un
  estado colgado/deadlock.
- **Readiness probe**: pregunta "¿está listo para recibir tráfico
  ahora mismo?". Si falla, Kubernetes **saca el pod del Service**
  (deja de mandarle tráfico) pero NO lo reinicia — es para pausas
  temporales, como cuando el pod está sobrecargado o reconectándose a
  una dependencia.

## ¿Qué es una NetworkPolicy y por qué el tráfico es permitido por defecto?

Una NetworkPolicy es una regla que restringe qué tráfico de red puede
entrar o salir de un grupo de pods (seleccionados por label). Por
defecto, Kubernetes permite **todo** el tráfico entre todos los pods
de un clúster — es un diseño intencional de "abierto por defecto,
cierras lo que necesitas cerrar", pensado para que un clúster nuevo
funcione sin fricción. Eso significa que la seguridad de red no existe
hasta que alguien define explícitamente las NetworkPolicies — no hay
aislamiento "gratis".

## ¿Qué es un PodDisruptionBudget?

Define cuántos pods de una aplicación pueden estar caídos **a la vez**
durante una interrupción voluntaria (como un `kubectl drain` de un
nodo, o una actualización). Por ejemplo, con `minAvailable: 1` en un
Deployment de 2 réplicas, Kubernetes no dejará que ambas caigan al
mismo tiempo durante un mantenimiento planeado — así el servicio nunca
queda completamente sin réplicas por una operación que sí se podía
coordinar.

## ¿Qué ventajas y qué nuevos problemas introduce la comunicación asíncrona?

Ventajas: el productor no espera al consumidor (menor latencia
percibida), y si el consumidor está caído, el mensaje espera en la
cola en vez de perderse — desacopla la disponibilidad de un servicio
de la del otro. Problemas nuevos: consistencia eventual (el productor
"termina" antes de que el efecto secundario realmente ocurra, así que
hay una ventana donde el sistema está en un estado intermedio),
necesidad de manejar mensajes duplicados o fuera de orden, y más
piezas de infraestructura que pueden fallar (el broker mismo se vuelve
un punto crítico que hay que operar y monitorear).

## ¿Qué hace `helm rollback` internamente?

Helm guarda, en cada `install`/`upgrade`, una copia completa del
manifiesto renderizado de esa revisión (no solo los `values` — el YAML
final ya resuelto). `helm rollback <release> <revisión>` toma esa
copia guardada de la revisión anterior y la vuelve a aplicar contra el
clúster como si fuera un nuevo `upgrade` — internamente es un
`upgrade` normal, solo que el contenido que aplica es el de una
revisión pasada en vez de una nueva plantilla renderizada. Por eso
`helm history` sigue creciendo hacia adelante incluso después de un
rollback: el rollback en sí también queda registrado como una revisión
nueva.
