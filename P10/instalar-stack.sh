#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Instala el stack de observabilidad completo. ~10 minutos.
#   bash P10/instalar-stack.sh
# ---------------------------------------------------------------------------
set -e
echo "=== 1/5 Namespace ==="
kubectl create namespace observabilidad --dry-run=client -o yaml | kubectl apply -f -

echo "=== 2/5 Prometheus + Grafana + Alertmanager ==="
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts 2>/dev/null || true
helm repo add grafana https://grafana.github.io/helm-charts 2>/dev/null || true
helm repo update
helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
  -n observabilidad \
  --set grafana.service.type=LoadBalancer \
  --set grafana.adminPassword=admin123 \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false \
  --set prometheus.prometheusSpec.ruleSelectorNilUsesHelmValues=false \
  --set prometheus.prometheusSpec.podMonitorSelectorNilUsesHelmValues=false \
  --set grafana.sidecar.datasources.enabled=true \
  --wait --timeout 10m

echo "=== 3/5 Loki (registros) ==="
helm upgrade --install loki grafana/loki-stack \
  -n observabilidad \
  --set loki.isDefault=false \
  --set promtail.enabled=true \
  --set grafana.enabled=false \
  --wait --timeout 10m

echo "=== 4/5 Tempo (trazas) ==="
helm upgrade --install tempo grafana/tempo \
  -n observabilidad \
  --wait --timeout 5m

echo "=== 5/5 Collector, datasources y reglas ==="
kubectl apply -f ../../Pr-cticas-SA-B-201612218-gitops/observabilidad/ 2>/dev/null \
  || echo "Aplica manualmente: kubectl apply -f <repo-gitops>/observabilidad/"

echo ""
echo "LISTO. Verifica:"
echo "  kubectl get pods -n observabilidad"
echo "  kubectl get svc -n observabilidad prometheus-operated"
echo "  kubectl get svc -n observabilidad prometheus-grafana   # IP de Grafana"
