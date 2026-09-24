# Informe de la prueba de recuperación ante desastres

**Sistema:** Plataforma de tickets (sa-platform) · **Carné:** 201612218 · **Sección:** B

> **Estado de este documento.** Las secciones 1 y 2 se escribieron **antes**
> de ejecutar la prueba: declarar los objetivos después de medir los
> resultados no es declarar objetivos, es describir lo que pasó. Las
> secciones 3 a 6 se completan con los datos medidos.
>
> Fecha de declaración de objetivos: **24 de septiembre de 2026**
> Fecha de ejecución de la prueba: *pendiente*

---

## 1. Objetivos declarados

| Objetivo | Valor comprometido |
|---|---|
| **RTO** (tiempo de recuperación) | **45 minutos** |
| **RPO** (punto de recuperación) | **1 hora** |

### Justificación del RTO

Cuarenta y cinco minutos es la suma de lo que el proceso tarda por
construcción, más margen para lo que falle:

| Fase | Duración esperada |
|---|---|
| `terraform init` con estado remoto | 1 min |
| Aprovisionamiento del clúster de GKE y su pool | 8 a 12 min |
| ArgoCD, Argo Rollouts, Kyverno, Sealed Secrets y Velero | 5 a 8 min |
| Restauración de la llave de Sealed Secrets | < 1 min |
| Sincronización de la aplicación raíz y sus tres hijas | 3 a 6 min |
| Arranque de la base de datos, el broker y los cinco servicios | 3 a 5 min |
| Aprovisionamiento del LoadBalancer | 1 a 3 min |
| **Subtotal** | **22 a 36 min** |
| Margen | 9 a 23 min |

El margen no es relleno. GKE tarda distinto según la carga de la zona, y la
descarga de las imágenes depende de la red. Un objetivo de 25 minutos se
cumpliría en el caso bueno y se incumpliría en cuanto algo se desviara, lo
que enseña al equipo a desconfiar del número.

El criterio de fondo: **es preferible declarar un objetivo que se cumple y
superarlo, que declarar uno ambicioso y explicar cada vez por qué no se
alcanzó.** Un RTO que se incumple con frecuencia deja de usarse para
planificar.

Para este sistema —una plataforma de tickets interna, sin transacciones
financieras ni obligaciones contractuales de disponibilidad— 45 minutos de
indisponibilidad son tolerables. Un sistema de pagos exigiría un objetivo
de minutos, y eso obligaría a un clúster de reserva permanentemente
encendido, con su costo. Ese gasto no se justifica aquí.

### Justificación del RPO

Una hora corresponde a la cadencia del respaldo de la base de datos:

```yaml
# P9/velero/schedule.yaml
respaldo-datos-horario:  schedule: "0 * * * *"    # cada hora, retención 48 h
respaldo-diario:         schedule: "0 2 * * *"    # diario 02:00 UTC, retención 168 h
```

Hay dos calendarios a propósito. El respaldo completo diario protege la
plataforma entera pero deja un RPO de 24 horas, inaceptable para los datos.
El horario cubre solo la base de datos —seleccionada por etiqueta— y acota
el RPO del dato que realmente duele perder, sin el costo de respaldar todo
cada hora.

En el peor caso, un fallo un minuto antes del respaldo siguiente pierde 59
minutos de tickets y comentarios. Para este sistema eso significa que un
usuario deba volver a crear un ticket, no una pérdida contable.

**Lo que este RPO no cubre:** los eventos publicados en RabbitMQ que aún no
se hayan consumido. La cola no se respalda, así que una notificación en
tránsito se pierde. Es una decisión consciente: el emisor puede
reintentarla y respaldar un broker en memoria añade complejidad
desproporcionada al beneficio.

### Cómo se derivaron estos números

No salen de una referencia externa sino de la propia arquitectura. El RTO
se calculó sumando las fases medibles del bootstrap; el RPO es exactamente
la cadencia que se eligió para el respaldo. Un objetivo que no se
corresponde con ningún mecanismo del sistema es una aspiración, no un
compromiso.

---

## 2. Escenario a ejecutar

### Qué se destruye

En este orden:

1. **Las Applications de ArgoCD**, con `--cascade=orphan` primero para
   comprobar que los recursos huérfanos quedan sin gobierno, y después su
   eliminación completa.
2. **El clúster de GKE entero**, con `terraform destroy`. Esto elimina los
   nodos, los volúmenes persistentes, los LoadBalancer y la llave del
   controlador de Sealed Secrets.

La destrucción del clúster se lleva por delante el disco de PostgreSQL, de
modo que la restauración tiene que recuperar datos reales y no puede
apoyarse en un volumen que sobrevivió.

### Qué NO se destruye, y por qué

| Recurso | Motivo |
|---|---|
| Bucket del estado de Terraform | Es lo que permite reconstruir; destruirlo convierte la prueba en una pérdida real |
| Bucket de respaldos de Velero | Contiene los datos a recuperar; está fuera del clúster precisamente para sobrevivir a esto |
| Repositorio de código y repositorio GitOps | Son la fuente de verdad, viven en GitHub |
| Respaldo de la llave de Sealed Secrets | Guardado fuera del repositorio; sin él los secretos serían irrecuperables |

Esta lista es, en sí misma, la respuesta a qué mantiene recuperable al
sistema: **todo lo que no puede destruirse sin pérdida irreversible vive
fuera del clúster.**

### Preparación previa

Antes de destruir, se siembran datos verificables:

```bash
bash P9/tests/verificar-datos.sh sembrar
bash P9/tests/verificar-datos.sh          # registrar el conteo inicial
velero backup create prueba-dr --include-namespaces sa-prod --wait
```

La marca sembrada lleva su hora en el nombre, de modo que al restaurar se
puede comprobar **cuál** respaldo se recuperó, no solo que haya filas.

---

## 3. Tiempos medidos

*Se completa tras la ejecución.*

| Hito | Marca de tiempo (UTC) |
|---|---|
| Destrucción completada | |
| Inicio del bootstrap | |
| `terraform apply` completado | |
| Componentes de plataforma listos | |
| Llave de Sealed Secrets restaurada | |
| Aplicación raíz sincronizada | |
| Todos los pods en `Running` | |
| Sistema respondiendo en su IP pública | |
| **RTO real** | |

Registro completo: `P9/evidencia/reconstruccion.log`

---

## 4. Pérdida medida

*Se completa tras la ejecución.*

| Dato | Valor |
|---|---|
| Último respaldo completado antes de la destrucción | |
| Momento de la destrucción | |
| **RPO real** | |
| Filas antes de destruir | |
| Filas tras restaurar | |
| Diferencia | |

**Qué no se recuperó y por qué:**

Verificación: `P9/evidencia/restauracion-datos.log`

---

## 5. Puntos únicos de fallo detectados

*Se completa tras la ejecución. Los siguientes se identificaron durante el
diseño y deben confirmarse o descartarse con la prueba.*

### 5.1 La llave de Sealed Secrets (identificado en el diseño)

El repositorio GitOps contiene los secretos cifrados, pero la llave que los
descifra vive dentro del clúster. Si el clúster desaparece y la llave no
está respaldada, el repositorio queda lleno de contenido ilegible.

**Mitigación implementada:** `P9/bootstrap/respaldar-llave.sh` exporta la
llave y `restaurar-llave.sh` la reinstala antes de que ArgoCD aplique nada.

**Lo que sigue sin cubrir:** el respaldo de la llave se guarda en la
máquina del operador. Si esa máquina se pierde junto con el clúster, el
problema persiste. Cerrarlo exige un gestor de secretos externo —Secret
Manager de Google Cloud— o migrar a External Secrets.

### 5.2 La credencial local de Google Cloud

El bootstrap requiere que un operador ejecute
`gcloud auth application-default login` a mano. No es automatizable sin una
cuenta de servicio con su propia llave, lo que desplazaría el problema en
lugar de resolverlo.

**Consecuencia:** la reconstrucción no puede dispararse de forma desatendida.

### 5.3 El bucket del estado de Terraform

No puede crearse a sí mismo: Terraform necesita dónde guardar su estado
antes de crear nada. Es el único paso previo al bootstrap y está
documentado en el runbook.

**Riesgo residual:** si alguien lo elimina, el estado se pierde y los
recursos existentes quedan sin gobierno de Terraform, aunque sigan
corriendo.

### 5.4 La cola de RabbitMQ

No se respalda. Los eventos publicados y no consumidos se pierden con el
clúster.

---

## 6. Brecha y plan

*Se completa tras la ejecución.*

| Objetivo | Declarado | Medido | Diferencia |
|---|---|---|---|
| RTO | 45 min | | |
| RPO | 1 h | | |

### Análisis

*Si el valor medido excede al declarado, explicar qué lo causó. Si queda
muy por debajo, considerar si el objetivo era demasiado conservador.*

### Plan para cerrar la brecha

*Controles concretos, no intenciones.*

Candidatos identificados durante el diseño, en orden de relación entre
beneficio y esfuerzo:

1. **Migrar la llave de Sealed Secrets a Secret Manager de Google Cloud.**
   Elimina el punto 5.1 por completo. Esfuerzo: bajo.

2. **Prealimentar la caché de imágenes del pool de nodos.** Buena parte del
   tiempo de arranque se va en descargar imágenes desde GHCR. Esfuerzo:
   medio, beneficio directo sobre el RTO.

3. **Reducir el respaldo de la base de datos a cada 15 minutos.** Baja el
   RPO a un cuarto de hora a cambio de más almacenamiento y más carga en
   los discos. Solo merece la pena si la pérdida de una hora resulta
   inaceptable en la práctica.

4. **Clúster de reserva en otra zona.** Llevaría el RTO a minutos, pero
   duplica el costo de forma permanente. No se justifica para este sistema.
