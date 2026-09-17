// ---------------------------------------------------------------------------
// P8 · Infraestructura como código
//
// Define los namespaces, cuotas, límites y RBAC del clúster. Nada de esto
// se crea a mano: la rúbrica lo exige ("No se acepta infraestructura creada
// manualmente") y además es lo que permite reconstruir el entorno completo
// desde cero de forma reproducible.
//
// Lo que Terraform NO administra aquí, a propósito:
//   - Las cargas de trabajo de la aplicación  -> las aplica ArgoCD
//   - Las políticas de Kyverno                -> viven en el repo GitOps
// La frontera es deliberada: Terraform prepara el terreno (una vez, por un
// operador), ArgoCD opera lo que cambia en cada despliegue.
// ---------------------------------------------------------------------------

terraform {
  required_version = ">= 1.6"
  required_providers {
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.32"
    }
  }
}

provider "kubernetes" {
  config_path    = var.kubeconfig
  config_context = var.contexto
}

// ---------------------------------------------------------------------------
// Namespaces
// ---------------------------------------------------------------------------

resource "kubernetes_namespace" "ambientes" {
  for_each = var.ambientes

  metadata {
    name = each.value.namespace
    labels = {
      "app.kubernetes.io/part-of"    = "sa-platform"
      "app.kubernetes.io/managed-by" = "terraform"
      "sa-platform/ambiente"         = each.key
      // Kyverno usa esta etiqueta para saber dónde aplicar sus políticas
      // en modo bloqueante y dónde solo auditar.
      "sa-platform/aplicar-politicas" = each.value.aplicar_politicas
    }
  }
}

// ---------------------------------------------------------------------------
// Cuotas de recursos
//
// El límite existe para que un despliegue mal configurado no consuma el
// clúster entero. En la P6 el namespace quedó al 97 % de su cuota y el HPA
// no pudo escalar: los pods nuevos fueron rechazados por cuota, no por
// falta de nodos. Aquí se dimensiona con margen para el canary, que durante
// la promoción mantiene réplicas de la versión vieja y de la nueva a la vez.
// ---------------------------------------------------------------------------

resource "kubernetes_resource_quota" "cuota" {
  for_each = var.ambientes

  metadata {
    name      = "${each.value.namespace}-cuota"
    namespace = kubernetes_namespace.ambientes[each.key].metadata[0].name
  }

  spec {
    hard = {
      "requests.cpu"    = each.value.cuota.requests_cpu
      "requests.memory" = each.value.cuota.requests_memoria
      "limits.cpu"      = each.value.cuota.limits_cpu
      "limits.memory"   = each.value.cuota.limits_memoria
      "pods"            = each.value.cuota.max_pods
    }
  }
}

// ---------------------------------------------------------------------------
// Límites por contenedor
//
// Complementa a Kyverno: la política rechaza el pod que no declara límites,
// y el LimitRange le pone un techo al que declara valores excesivos.
// ---------------------------------------------------------------------------

resource "kubernetes_limit_range" "limites" {
  for_each = var.ambientes

  metadata {
    name      = "${each.value.namespace}-limites"
    namespace = kubernetes_namespace.ambientes[each.key].metadata[0].name
  }

  spec {
    limit {
      type = "Container"
      default = {
        cpu    = "250m"
        memory = "256Mi"
      }
      default_request = {
        cpu    = "100m"
        memory = "128Mi"
      }
      max = {
        cpu    = "1"
        memory = "1Gi"
      }
    }
  }
}

// ---------------------------------------------------------------------------
// RBAC
//
// Tres identidades con permisos distintos, siguiendo mínimo privilegio:
//
//   1. argocd-aplicador  -> la única identidad que escribe cargas de trabajo
//   2. pipeline-lector   -> solo lectura; el pipeline ya no despliega
//   3. analisis-rollouts -> lo que Argo Rollouts necesita para el canary
//
// La número 2 es el cambio conceptual de esta práctica. En la P7 el pipeline
// tenía roles/container.admin: comprometer el repositorio equivalía a
// comprometer el clúster. Ahora el pipeline no puede modificar nada.
// ---------------------------------------------------------------------------

resource "kubernetes_service_account" "argocd_aplicador" {
  for_each = var.ambientes

  metadata {
    name      = "argocd-aplicador"
    namespace = kubernetes_namespace.ambientes[each.key].metadata[0].name
  }
}

resource "kubernetes_role" "aplicador" {
  for_each = var.ambientes

  metadata {
    name      = "aplicador-de-cargas"
    namespace = kubernetes_namespace.ambientes[each.key].metadata[0].name
  }

  rule {
    api_groups = ["", "apps", "batch", "autoscaling", "networking.k8s.io"]
    resources  = ["*"]
    verbs      = ["get", "list", "watch", "create", "update", "patch", "delete"]
  }

  rule {
    api_groups = ["argoproj.io"]
    resources  = ["rollouts", "analysisruns", "analysistemplates", "experiments"]
    verbs      = ["get", "list", "watch", "create", "update", "patch", "delete"]
  }
}

resource "kubernetes_role_binding" "aplicador" {
  for_each = var.ambientes

  metadata {
    name      = "argocd-aplicador"
    namespace = kubernetes_namespace.ambientes[each.key].metadata[0].name
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Role"
    name      = kubernetes_role.aplicador[each.key].metadata[0].name
  }

  subject {
    kind      = "ServiceAccount"
    name      = "argocd-application-controller"
    namespace = "argocd"
  }
}

// --- Identidad del pipeline: SOLO LECTURA -----------------------------------

resource "kubernetes_service_account" "pipeline_lector" {
  for_each = var.ambientes

  metadata {
    name      = "pipeline-lector"
    namespace = kubernetes_namespace.ambientes[each.key].metadata[0].name
  }
}

resource "kubernetes_role" "lector" {
  for_each = var.ambientes

  metadata {
    name      = "solo-lectura"
    namespace = kubernetes_namespace.ambientes[each.key].metadata[0].name
  }

  // Sin create, update, patch ni delete. Deliberadamente.
  rule {
    api_groups = ["", "apps", "argoproj.io"]
    resources  = ["pods", "services", "deployments", "replicasets", "rollouts", "events"]
    verbs      = ["get", "list", "watch"]
  }
}

resource "kubernetes_role_binding" "lector" {
  for_each = var.ambientes

  metadata {
    name      = "pipeline-lector"
    namespace = kubernetes_namespace.ambientes[each.key].metadata[0].name
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Role"
    name      = kubernetes_role.lector[each.key].metadata[0].name
  }

  subject {
    kind      = "ServiceAccount"
    name      = kubernetes_service_account.pipeline_lector[each.key].metadata[0].name
    namespace = kubernetes_namespace.ambientes[each.key].metadata[0].name
  }
}

// --- Identidad del análisis del canary ---------------------------------------

resource "kubernetes_service_account" "analisis" {
  for_each = var.ambientes

  metadata {
    name      = "analisis-rollouts"
    namespace = kubernetes_namespace.ambientes[each.key].metadata[0].name
  }
}

resource "kubernetes_role" "analisis" {
  for_each = var.ambientes

  metadata {
    name      = "ejecutor-de-analisis"
    namespace = kubernetes_namespace.ambientes[each.key].metadata[0].name
  }

  rule {
    api_groups = ["", "batch"]
    resources  = ["pods", "pods/log", "jobs"]
    verbs      = ["get", "list", "watch", "create", "delete"]
  }
}

resource "kubernetes_role_binding" "analisis" {
  for_each = var.ambientes

  metadata {
    name      = "analisis-rollouts"
    namespace = kubernetes_namespace.ambientes[each.key].metadata[0].name
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Role"
    name      = kubernetes_role.analisis[each.key].metadata[0].name
  }

  subject {
    kind      = "ServiceAccount"
    name      = kubernetes_service_account.analisis[each.key].metadata[0].name
    namespace = kubernetes_namespace.ambientes[each.key].metadata[0].name
  }
}
