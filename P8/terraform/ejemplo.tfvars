# Copia este archivo a local.tfvars y ajusta el contexto antes de aplicar:
#   terraform plan  -var-file=local.tfvars
#   terraform apply -var-file=local.tfvars
#
# El nombre del contexto lo obtienes con:
#   kubectl config current-context

contexto = "gke_p6-sa2s2026_us-central1-a_sa-p8-cluster"
