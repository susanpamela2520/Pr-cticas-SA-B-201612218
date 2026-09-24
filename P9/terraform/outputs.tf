// ---------------------------------------------------------------------------
// Salidas que el script de bootstrap consume.
//
// No son informativas: bootstrap.sh las lee para obtener las credenciales
// del cluster sin que nadie tenga que escribirlas a mano. Es lo que permite
// que la reconstruccion sea un solo comando.
// ---------------------------------------------------------------------------

output "proyecto" {
  description = "Proyecto de Google Cloud."
  value       = var.proyecto
}

output "nombre_cluster" {
  description = "Nombre del cluster provisionado."
  value       = google_container_cluster.sa.name
}

output "zona" {
  description = "Zona del cluster."
  value       = google_container_cluster.sa.location
}

output "bucket_respaldos" {
  description = "Destino de los respaldos de Velero."
  value       = var.bucket_respaldos
}

output "repo_gitops" {
  description = "Repositorio de manifiestos que ArgoCD sincroniza."
  value       = var.repo_gitops
}

output "namespaces" {
  description = "Namespaces creados y su modo de politicas."
  value = {
    for k, v in var.ambientes : v.namespace => v.aplicar_politicas
  }
}

output "siguiente_paso" {
  description = "Que hacer despues de terraform apply."
  value       = <<-TEXTO

    Infraestructura lista. El bootstrap continua con:

      1. Restaurar la llave de Sealed Secrets
         bash P9/bootstrap/restaurar-llave.sh

      2. Aplicar la aplicacion raiz
         kubectl apply -f P9/bootstrap/root-app.yaml

    Si ejecuta bootstrap.sh, ambos pasos ocurren automaticamente.
  TEXTO
}
