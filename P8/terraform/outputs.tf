output "namespaces" {
  description = "Namespaces creados, para referenciarlos en las Applications de ArgoCD."
  value       = { for k, v in var.ambientes : k => v.namespace }
}

output "cuentas_de_servicio" {
  description = "Identidades creadas por ambiente y su proposito."
  value = {
    for k, v in var.ambientes : k => {
      aplicador = "argocd-aplicador (escribe cargas: solo ArgoCD)"
      lector    = "pipeline-lector (solo lectura: el pipeline no despliega)"
      analisis  = "analisis-rollouts (ejecuta los AnalysisRun del canary)"
    }
  }
}

output "recordatorio" {
  description = "Frontera de responsabilidades."
  value       = "Terraform administra namespaces, cuotas, limites y RBAC. Las cargas de trabajo las aplica ArgoCD desde el repositorio de manifiestos."
}
