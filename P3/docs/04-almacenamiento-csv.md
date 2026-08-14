# Estrategia de Almacenamiento de Archivos CSV

## Dónde se guardan

**Cloud Storage** (propuesta: AWS S3, aunque el diseño es equivalente
en GCP Cloud Storage o Azure Blob Storage — no se ata a un proveedor
específico). Se descarta FTP como opción principal por no dar control
de acceso granular ni versionado nativo; queda documentado como
alternativa válida si la institución ya tiene infraestructura FTP interna.

## Estructura de carpetas (convención de nombres)

```
s3://banco-transacciones-lotes/
  └── {yyyy}/{mm}/{dd}/
        └── {lote_id}__{nombre_original}.csv
```

Ejemplo:
```
s3://banco-transacciones-lotes/2026/08/13/8f14e...__planilla-agosto.csv
```

Particionar por fecha (`yyyy/mm/dd`) mantiene los objetos organizados
para auditoría y facilita aplicar políticas de ciclo de vida por
antigüedad sin tener que revisar todo el bucket.

## Qué se guarda en la base de datos vs. qué se guarda en Storage

- **Cloud Storage**: el archivo CSV original, sin modificar — es la
  fuente de verdad de "qué se cargó exactamente".
- **Base de datos de `ingesta-service`**: la tabla `LOTES` guarda solo
  la **ruta** (`ruta_almacenamiento`) al objeto en Storage, no el
  archivo — y la tabla `TRANSACCIONES` guarda cada fila ya parseada,
  para poder consultarlas individualmente sin tener que volver a leer
  el CSV cada vez.

## Ciclo de vida y descarga

- El **historial consultable** (requerido por el enunciado) se sirve
  desde `ingesta-service`, que expone un endpoint para listar lotes y
  otro para generar una **URL prefirmada** (*pre-signed URL*) de
  descarga directa del CSV original desde Storage — así el propio
  microservicio nunca tiene que leer y reenviar el archivo completo.
- **Política de retención**: los objetos se mueven automáticamente a
  almacenamiento de menor costo (S3 Glacier o equivalente) después de
  ~90 días, y se conservan un mínimo de tiempo definido por la
  normativa bancaria aplicable — no se documentan aquí regulaciones
  específicas por no ser el alcance de esta práctica.

## Validación en dos momentos

1. **Antes de subir a Storage**: `ingesta-service` valida que el
   archivo sea un CSV bien formado (columnas esperadas, tipos de dato)
   — si falla, se rechaza sin llegar a ocupar espacio en Storage.
2. **Después de subir, fila por fila**: cada transacción se valida
   contra las reglas de negocio (saldo, límites, cuentas válidas), y el
   resultado se guarda en `estado_validacion` / `motivo_rechazo` de
   cada `Transaccion` — un lote puede subir completo a Storage aunque
   algunas de sus filas terminen rechazadas.
