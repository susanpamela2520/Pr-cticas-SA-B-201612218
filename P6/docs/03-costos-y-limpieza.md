# Costos Aproximados y Eliminación de Recursos

## Estimación de costo (llenar con los valores reales de tu facturación)

Precios de referencia de Google Cloud (us-central1, 2026) — verifica
los tuyos en https://cloud.google.com/products/calculator, ya que
pueden cambiar:

| Recurso | Cantidad | Costo aproximado | Por cuánto tiempo lo tuviste arriba | Costo real |
|---|---|---|---|---|
| Nodo `e2-medium` (Compute Engine) | 2 | ~$0.034/hora c/u | ___ horas | $ ___ |
| Disco persistente (StorageClass) | 2Gi | ~$0.04/GB-mes | ___ días | $ ___ |
| Network Load Balancer | 1 | ~$0.025/hora + tráfico | ___ horas | $ ___ |
| Artifact Registry (almacenamiento de imágenes) | ~1.5 GB (6 imágenes) | ~$0.10/GB-mes | ___ días | $ ___ |
| **Total aproximado** | | | | **$ ___** |

Con el crédito gratuito de $300 (válido 90 días para cuentas nuevas),
un despliegue de unas pocas horas para capturar evidencia y luego
eliminar los recursos cuesta centavos de dólar — muy por debajo del
crédito disponible.

**Cómo verificarlo con datos reales:** consola de Google Cloud →
**Facturación → Informes**, filtrando por el rango de fechas en que
tuviste el clúster arriba. Copia esa cifra real a la tabla de arriba.

## Procedimiento de eliminación de recursos

Ver el detalle completo con comandos en
[`01-comandos-gke.md`](./01-comandos-gke.md), sección 16. Resumen del
orden correcto (importante seguirlo así, no al revés):

1. **`helm uninstall`** — libera los pods, Services y, con ellos, el
   LoadBalancer de Google (que es lo que más cuesta por hora)
2. **`kubectl delete pvc --all`** — libera los discos persistentes
   (sobreviven al `helm uninstall` por diseño, para no perder datos
   por accidente en un `upgrade` — hay que borrarlos explícitamente)
3. **Verificar que no quedó ningún `forwarding-rule` o IP reservada
   huérfana** — a veces el LoadBalancer deja restos que siguen
   cobrando aunque el Service ya no exista
4. **`gcloud container clusters delete`** — elimina las VMs de los
   nodos, que es el costo dominante
5. **(Opcional) `gcloud artifacts repositories delete`** — si ya no
   vas a necesitar las imágenes

## Por qué este orden y no simplemente borrar el clúster de una vez

Si borras el clúster directamente sin pasar por `helm uninstall`
primero, Kubernetes no tiene oportunidad de decirle a Google Cloud
"libera este LoadBalancer" de forma limpia — a veces el recurso de red
externo (la IP pública, las reglas de firewall asociadas) queda
huérfano en la cuenta de Google Cloud, sin un clúster que lo reclame, y
**sigue generando costo** aunque ya no haya ningún clúster visible en
la consola de Kubernetes Engine. Por eso el paso de verificación
(`gcloud compute forwarding-rules list`) es tan importante — es la
única forma de confirmar que no quedó nada cobrando de manera invisible.
