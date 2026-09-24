# Anti-afinidad

El PodDisruptionBudget garantiza cuántas réplicas siguen vivas, pero no
sirve de nada si todas están en el mismo nodo: cuando ese nodo cae, caen
todas a la vez y el presupuesto se viola de golpe.

La anti-afinidad las reparte. Este bloque va en el `spec.template.spec` de
cada servicio con más de una réplica:

```yaml
      affinity:
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                topologyKey: kubernetes.io/hostname
                labelSelector:
                  matchLabels:
                    app.kubernetes.io/name: api-gateway
```

**Por qué `preferred` y no `required`:** con `required`, si hay menos nodos
que réplicas, los pods sobrantes quedan en `Pending` para siempre. En un
clúster pequeño eso convierte una mejora de disponibilidad en una caída.
`preferred` reparte cuando puede y tolera cuando no.

Verificación de que funcionó:

```bash
kubectl get pods -n sa-prod -o wide | awk '{print $1, $7}'
```

Las réplicas deben aparecer en nodos distintos.
