# ---------------------------------------------------------------------------
# Estado remoto con bloqueo.
#
# El estado no puede vivir en la maquina del estudiante: si esa maquina se
# pierde, la infraestructura deja de ser reconstruible por nadie mas. GCS
# ofrece bloqueo mediante generaciones de objeto, asi que dos ejecuciones
# simultaneas no se pisan.
#
# El bucket debe crearse ANTES del primer init, fuera de Terraform:
#   gsutil mb -l us-central1 gs://NOMBRE-DEL-BUCKET
#   gsutil versioning set on gs://NOMBRE-DEL-BUCKET
#
# Es el unico paso previo al bootstrap y esta documentado en el runbook.
# ---------------------------------------------------------------------------
terraform {
  required_version = ">= 1.6"

  backend "gcs" {
    bucket = "sa-p9-tfstate-201612218"
    prefix = "p9/estado"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.30"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.13"
    }
  }
}
