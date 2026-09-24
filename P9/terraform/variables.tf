// ---------------------------------------------------------------------------
// Variables del bootstrap
// ---------------------------------------------------------------------------

variable "proyecto" {
  description = "Identificador del proyecto de Google Cloud."
  type        = string
}

variable "region" {
  description = "Region donde viven el bucket de respaldos y las instantaneas."
  type        = string
  default     = "us-central1"
}

variable "zona" {
  description = "Zona del cluster."
  type        = string
  default     = "us-central1-a"
}

variable "nombre_cluster" {
  description = "Nombre del cluster de GKE."
  type        = string
  default     = "sa-p9-cluster"
}

variable "nodos" {
  description = <<-TEXTO
    Numero de nodos del pool principal.

    Tres es el minimo para que la prueba de perdida de nodo sea
    significativa: con dos, drenar uno deja el PodDisruptionBudget sin
    margen y el drenaje se bloquea en lugar de demostrar resiliencia.
  TEXTO
  type        = number
  default     = 3
}

variable "tipo_maquina" {
  description = "Tipo de maquina de los nodos."
  type        = string
  default     = "e2-standard-2"
}

variable "bucket_respaldos" {
  description = "Bucket de Cloud Storage donde Velero guarda los respaldos, sin el prefijo gs://."
  type        = string
}

variable "repo_gitops" {
  description = "URL publica del repositorio de manifiestos."
  type        = string
}

// --- Versiones fijadas ------------------------------------------------------
// Se fijan a proposito: una reconstruccion que instala versiones distintas
// a las probadas no es una reconstruccion, es un despliegue nuevo con
// riesgos que nadie evaluo.

variable "version_argocd" {
  description = "Version del chart de ArgoCD."
  type        = string
  default     = "7.7.11"
}

variable "version_rollouts" {
  description = "Version del chart de Argo Rollouts."
  type        = string
  default     = "2.38.2"
}

variable "version_kyverno" {
  description = "Version del chart de Kyverno."
  type        = string
  default     = "3.3.4"
}

variable "version_sealed_secrets" {
  description = "Version del chart de Sealed Secrets."
  type        = string
  default     = "2.16.1"
}

variable "version_velero" {
  description = "Version del chart de Velero."
  type        = string
  default     = "8.1.0"
}

// --- Ambientes --------------------------------------------------------------

variable "ambientes" {
  description = <<-TEXTO
    Namespaces de la plataforma, su modo de politicas y su cuota.

    La etiqueta aplicar_politicas es lo que Kyverno consulta para decidir
    donde bloquear y donde solo auditar. Por eso la Application de ArgoCD
    lleva CreateNamespace=false: si ArgoCD creara los namespaces, esa
    etiqueta se perderia.
  TEXTO

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
        max_pods         = "20"
      }
    }
    prod = {
      namespace         = "sa-prod"
      aplicar_politicas = "bloquear"
      cuota = {
        requests_cpu     = "4"
        requests_memoria = "6Gi"
        limits_cpu       = "8"
        limits_memoria   = "10Gi"
        max_pods         = "40"
      }
    }
  }
}
