variable "kubeconfig" {
  description = "Ruta al kubeconfig local del operador. Terraform lo ejecuta una persona desde su maquina, NO el pipeline."
  type        = string
  default     = "~/.kube/config"
}

variable "contexto" {
  description = "Contexto de kubectl que apunta al cluster de GKE."
  type        = string
  default     = "gke_p6-sa2s2026_us-central1-a_sa-p8-cluster"
}

variable "ambientes" {
  description = <<-DESC
    Ambientes a crear. Dos namespaces separados permiten que el canary se
    valide en staging antes de promoverse a produccion, y que las politicas
    de Kyverno bloqueen en produccion mientras solo auditan en staging.
  DESC

  type = map(object({
    namespace         = string
    aplicar_politicas = string
    cuota = object({
      requests_cpu     = string
      requests_memoria = string
      limits_cpu       = string
      limits_memoria   = string
      max_pods         = string
    })
  }))

  default = {
    staging = {
      namespace         = "sa-staging"
      aplicar_politicas = "auditar"
      cuota = {
        requests_cpu     = "2"
        requests_memoria = "2Gi"
        limits_cpu       = "4"
        limits_memoria   = "4Gi"
        max_pods         = "30"
      }
    }
    prod = {
      namespace         = "sa-prod"
      aplicar_politicas = "bloquear"
      # Holgada a proposito: durante la promocion del canary coexisten
      # replicas de la version estable y de la candidata.
      cuota = {
        requests_cpu     = "4"
        requests_memoria = "4Gi"
        limits_cpu       = "8"
        limits_memoria   = "8Gi"
        max_pods         = "50"
      }
    }
  }
}
