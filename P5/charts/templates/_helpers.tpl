{{/*
sa-platform.fullname
Nombre completo de un componente, combinando el nombre del release con
el nombre del servicio. Se usa `required` porque sin un nombre de
servicio el resultado no tendría sentido (mejor fallar temprano y claro
que generar un recurso con nombre vacío/duplicado).

Uso: {{ include "sa-platform.fullname" (dict "root" $ "name" "auth-service") }}
*/}}
{{- define "sa-platform.fullname" -}}
{{- $nombre := .name | required "sa-platform.fullname: falta 'name'" -}}
{{- printf "%s-%s" .root.Release.Name $nombre | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
sa-platform.labels
Labels comunes aplicadas a todos los recursos de la plataforma, para
poder seleccionarlos juntos (por ejemplo, en las NetworkPolicies) sin
importar de qué subchart vengan.

Uso: {{ include "sa-platform.labels" (dict "root" $ "componente" "auth-service") }}
*/}}
{{- define "sa-platform.labels" -}}
app.kubernetes.io/part-of: sa-platform
app.kubernetes.io/managed-by: {{ .root.Release.Service | quote }}
app.kubernetes.io/instance: {{ .root.Release.Name | quote }}
app.kubernetes.io/component: {{ .componente | default "sin-nombre" | quote }}
helm.sh/chart: {{ printf "%s-%s" .root.Chart.Name .root.Chart.Version | quote }}
{{- end -}}

{{/*
sa-platform.envVarsFromMap
Convierte un mapa arbitrario de values.yaml (clave: valor) en una lista
de variables de entorno de Kubernetes. Demuestra el uso de `range` para
iterar un mapa y de `if/else` para decidir cómo tratar valores vacíos.

Uso: {{ include "sa-platform.envVarsFromMap" .Values.envExtra }}
*/}}
{{- define "sa-platform.envVarsFromMap" -}}
{{- range $clave, $valor := . }}
{{- if $valor }}
- name: {{ $clave }}
  value: {{ $valor | quote }}
{{- else }}
- name: {{ $clave }}
  value: {{ "" | quote }}
{{- end }}
{{- end }}
{{- end -}}
