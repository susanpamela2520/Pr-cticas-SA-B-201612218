# Informe de la prueba de recuperación ante desastres

**Carné:** 201612218 · **Sección:** B · **Fecha de la prueba:** PENDIENTE

---

## 1. Objetivos declarados

| Objetivo | Valor comprometido |
|---|---|
| RTO | PENDIENTE |
| RPO | PENDIENTE |

**Justificación del RTO:** PENDIENTE — cuánto puede estar caído el sistema
antes de que el impacto deje de ser tolerable, y por qué ese número y no otro.

**Justificación del RPO:** PENDIENTE — cuántos datos puede perder el sistema
sin que el negocio quede en un estado inconsistente.

Ambos se declararon **antes** de ejecutar la prueba.

---

## 2. Escenario ejecutado

Qué se destruyó, exactamente y en qué orden:

1. PENDIENTE
2. PENDIENTE

Qué **no** se destruyó y por qué: PENDIENTE
(por ejemplo, el bucket del estado remoto y el de respaldos: son
precisamente lo que permite reconstruir, y destruirlos convertiría la
prueba en una pérdida real).

---

## 3. Tiempos medidos

| Hito | Marca de tiempo (UTC) |
|---|---|
| Inicio de la reconstrucción | PENDIENTE |
| Clúster provisionado | PENDIENTE |
| ArgoCD disponible | PENDIENTE |
| Llave de Sealed Secrets restaurada | PENDIENTE |
| Aplicación raíz sincronizada | PENDIENTE |
| Sistema respondiendo en su IP pública | PENDIENTE |
| **RTO real** | **PENDIENTE** |

Registro completo: `P9/evidencia/reconstruccion.log`

---

## 4. Pérdida medida

| Dato | Valor |
|---|---|
| Último respaldo disponible | PENDIENTE |
| Momento de la destrucción | PENDIENTE |
| **RPO real** | **PENDIENTE** |

**Qué no se recuperó y por qué:** PENDIENTE

Verificación del contenido restaurado: `P9/evidencia/restauracion-datos.log`

---

## 5. Puntos únicos de fallo detectados

Lo que la prueba reveló que no estaba cubierto:

- PENDIENTE

---

## 6. Brecha y plan

| Objetivo | Declarado | Medido | Diferencia |
|---|---|---|---|
| RTO | PENDIENTE | PENDIENTE | PENDIENTE |
| RPO | PENDIENTE | PENDIENTE | PENDIENTE |

**Análisis:** PENDIENTE — si el medido excede al declarado, qué lo explica.

**Qué haría para cerrarla:** PENDIENTE — controles concretos, no intenciones.
