# Pruebas de contrato

15 pruebas que validan los manifiestos renderizados por Helm, sin
necesidad de un clúster.

## Ejecución local

```powershell
cd P5\charts
helm dependency update
helm template sa-platform . `
  -f values.yaml `
  -f ..\..\P6\values-gke.yaml `
  -f ..\..\P7\values-ci.yaml `
  -n sa-p5 > $env:TEMP\manifiestos.yaml

cd ..\..
pip install pytest pyyaml
$env:MANIFIESTOS = "$env:TEMP\manifiestos.yaml"
pytest P7\tests -v
```

## Verificación de que las pruebas sirven

Una prueba que nunca falla no aporta nada. Estas fueron validadas
introduciendo a propósito cada error que pretenden detectar:

| Error introducido | Prueba que lo detecta |
|---|---|
| `type: ClusterIP` en el Service del gateway | `test_el_api_gateway_se_expone_como_loadbalancer` |
| NetworkPolicy sin `ipBlock` | `test_la_politica_del_gateway_admite_trafico_externo` |
| Imágenes con `:latest` | `test_ninguna_imagen_usa_la_etiqueta_latest` |

En los tres casos falló únicamente la prueba correspondiente, y las otras
14 siguieron pasando.
