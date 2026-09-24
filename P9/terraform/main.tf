// ---------------------------------------------------------------------------
// P9 · Bootstrap de dia cero
//
// Diferencia con la Practica 8: alli Terraform asumia que el cluster ya
// existia y solo preparaba namespaces, cuotas y RBAC. Aqui provisiona el
// cluster COMPLETO e instala los componentes de plataforma, de modo que la
// reconstruccion arranca desde un unico punto de entrada.
//
// Lo que este archivo administra:
//   - El cluster de GKE y su pool de nodos
//   - ArgoCD, Argo Rollouts, Kyverno, Sealed Secrets y Velero
//
// Lo que NO administra, a proposito:
//   - Las cargas de trabajo de la aplicacion  -> las aplica ArgoCD
//   - Las politicas de Kyverno                -> viven en el repo GitOps
//
// La frontera es deliberada: Terraform prepara el terreno una vez, ArgoCD
// opera lo que cambia en cada despliegue. Ademas Terraform es quien OTORGA
// a ArgoCD el permiso de escribir: el componente que concede privilegios no
// es el mismo que los usa.
// ---------------------------------------------------------------------------

provider "google" {
  project = var.proyecto
  region  = var.region
}

// ---------------------------------------------------------------------------
// Cluster
//
// Un pool separado del predeterminado permite recrear los nodos sin tocar
// el plano de control, y es lo que hace posible la prueba de drenaje de
// nodo sin arriesgar el cluster entero.
// ---------------------------------------------------------------------------

resource "google_container_cluster" "sa" {
  name     = var.nombre_cluster
  location = var.zona

  // GKE exige crear el pool predeterminado y eliminarlo despues si se
  // quiere un pool administrado por separado.
  remove_default_node_pool = true
  initial_node_count       = 1

  deletion_protection = false

  // Necesario para que Velero pueda tomar instantaneas de los discos.
  addons_config {
    gce_persistent_disk_csi_driver_config {
      enabled = true
    }
  }
}

resource "google_container_node_pool" "principal" {
  name       = "principal"
  cluster    = google_container_cluster.sa.name
  location   = var.zona
  node_count = var.nodos

  node_config {
    machine_type = var.tipo_maquina
    disk_size_gb = 50
    disk_type    = "pd-standard"

    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]

    labels = {
      "sa-platform/pool" = "principal"
    }
  }

  management {
    auto_repair  = true
    auto_upgrade = false
  }
}

// ---------------------------------------------------------------------------
// Proveedores que hablan con el cluster recien creado
//
// Se autentican con el token del propio Terraform en lugar de un kubeconfig
// en disco: durante una reconstruccion ese archivo todavia no existe, y
// depender de el romperia el bootstrap de un solo comando.
// ---------------------------------------------------------------------------

data "google_client_config" "actual" {}

provider "kubernetes" {
  host                   = "https://${google_container_cluster.sa.endpoint}"
  token                  = data.google_client_config.actual.access_token
  cluster_ca_certificate = base64decode(google_container_cluster.sa.master_auth[0].cluster_ca_certificate)
}

provider "helm" {
  kubernetes {
    host                   = "https://${google_container_cluster.sa.endpoint}"
    token                  = data.google_client_config.actual.access_token
    cluster_ca_certificate = base64decode(google_container_cluster.sa.master_auth[0].cluster_ca_certificate)
  }
}

// ---------------------------------------------------------------------------
// ArgoCD
//
// Es el unico componente con permiso de escritura sobre las cargas de
// trabajo. El pipeline perdio ese permiso en la P8 y no lo recupera aqui.
// ---------------------------------------------------------------------------

resource "helm_release" "argocd" {
  name             = "argocd"
  namespace        = "argocd"
  create_namespace = true

  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argo-cd"
  version    = var.version_argocd

  // El bootstrap aplica la aplicacion raiz justo despues, asi que conviene
  // esperar a que el servidor este listo.
  wait    = true
  timeout = 900

  set {
    name  = "server.service.type"
    value = "LoadBalancer"
  }

  // El sondeo por defecto es de 3 minutos. Durante una reconstruccion eso
  // se suma al RTO sin aportar nada, asi que se acorta.
  set {
    name  = "configs.cm.timeout\\.reconciliation"
    value = "60s"
  }

  depends_on = [google_container_node_pool.principal]
}

// ---------------------------------------------------------------------------
// Argo Rollouts — entrega progresiva heredada de la P8
// ---------------------------------------------------------------------------

resource "helm_release" "argo_rollouts" {
  name             = "argo-rollouts"
  namespace        = "argo-rollouts"
  create_namespace = true

  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argo-rollouts"
  version    = var.version_rollouts

  depends_on = [google_container_node_pool.principal]
}

// ---------------------------------------------------------------------------
// Kyverno — politicas de admision
//
// Se instala antes que la aplicacion raiz para que ninguna carga de trabajo
// entre sin pasar por el webhook. Una politica que llega despues no valido
// nada de lo que ya estaba dentro.
// ---------------------------------------------------------------------------

resource "helm_release" "kyverno" {
  name             = "kyverno"
  namespace        = "kyverno"
  create_namespace = true

  repository = "https://kyverno.github.io/kyverno"
  chart      = "kyverno"
  version    = var.version_kyverno

  wait    = true
  timeout = 600

  depends_on = [google_container_node_pool.principal]
}

// ---------------------------------------------------------------------------
// Sealed Secrets
//
// El controlador genera un par de llaves al arrancar. Si se deja generar
// una nueva durante la reconstruccion, los secretos del repositorio quedan
// ilegibles: por eso el bootstrap restaura la llave respaldada ANTES de
// aplicar la aplicacion raiz.
// ---------------------------------------------------------------------------

resource "helm_release" "sealed_secrets" {
  name      = "sealed-secrets"
  namespace = "kube-system"

  repository = "https://bitnami-labs.github.io/sealed-secrets"
  chart      = "sealed-secrets"
  version    = var.version_sealed_secrets

  set {
    name  = "fullnameOverride"
    value = "sealed-secrets-controller"
  }

  wait    = true
  timeout = 600

  depends_on = [google_container_node_pool.principal]
}

// ---------------------------------------------------------------------------
// Velero — respaldo y restauracion
//
// El destino es un bucket de Cloud Storage, externo al cluster: un respaldo
// guardado dentro del mismo cluster que respalda no sirve de nada cuando
// ese cluster desaparece.
//
// La cuenta de servicio de los nodos necesita permiso sobre el bucket; se
// concede mas abajo.
// ---------------------------------------------------------------------------

resource "helm_release" "velero" {
  name             = "velero"
  namespace        = "velero"
  create_namespace = true

  repository = "https://vmware-tanzu.github.io/helm-charts"
  chart      = "velero"
  version    = var.version_velero

  values = [yamlencode({
    credentials = {
      // Sin secreto propio: Velero usa la identidad de la cuenta de
      // servicio de los nodos, de modo que no hay ninguna llave que rotar
      // ni que se pueda filtrar.
      useSecret = false
    }

    configuration = {
      backupStorageLocation = [{
        name     = "default"
        provider = "gcp"
        bucket   = var.bucket_respaldos
        default  = true
      }]
      volumeSnapshotLocation = [{
        name     = "default"
        provider = "gcp"
        config   = { project = var.proyecto, snapshotLocation = var.region }
      }]
    }

    initContainers = [{
      name            = "velero-plugin-for-gcp"
      image           = "velero/velero-plugin-for-gcp:v1.11.0"
      imagePullPolicy = "IfNotPresent"
      volumeMounts    = [{ mountPath = "/target", name = "plugins" }]
    }]

    // Respaldo del sistema de archivos: captura el contenido de los
    // volumenes, no solo los objetos de Kubernetes. Sin esto se
    // restauraria un volumen vacio.
    deployNodeAgent = true
  })]

  wait    = true
  timeout = 900

  depends_on = [google_container_node_pool.principal]
}

// ---------------------------------------------------------------------------
// Permisos de Velero sobre el bucket de respaldos
// ---------------------------------------------------------------------------

data "google_compute_default_service_account" "nodos" {}

resource "google_storage_bucket_iam_member" "velero" {
  bucket = var.bucket_respaldos
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${data.google_compute_default_service_account.nodos.email}"
}
