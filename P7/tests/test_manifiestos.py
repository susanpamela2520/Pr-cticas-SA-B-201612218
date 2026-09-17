"""
Pruebas de contrato sobre los manifiestos renderizados del chart de Helm.

Estas pruebas NO necesitan un cluster: trabajan sobre la salida de
`helm template`, por lo que corren en segundos dentro del pipeline y
detectan errores de configuracion ANTES de que lleguen a produccion.

Varias de ellas nacieron de fallos reales encontrados durante la
Practica 6 (ver P7/README.md, seccion "Por que estas pruebas").

Ejecucion local:
    helm template sa-platform P5/charts \\
      -f P5/charts/values.yaml \\
      -f P6/values-gke.yaml \\
      -f P7/values-ci.yaml \\
      -n sa-p5 > /tmp/manifiestos.yaml
    MANIFIESTOS=/tmp/manifiestos.yaml pytest P7/tests -v
"""

import os
import pytest
import yaml

RUTA = os.environ.get("MANIFIESTOS", "/tmp/manifiestos.yaml")

# Servicios propios: los que construimos nosotros y publicamos en GHCR.
# Se excluyen postgres y rabbitmq, que son imagenes publicas de terceros.
SERVICIOS_PROPIOS = {
    "api-gateway",
    "auth-service",
    "tickets-service",
    "comentarios-service",
    "notificaciones-service",
    "cronjobs",
}


def cargar():
    if not os.path.exists(RUTA):
        pytest.skip(f"No se encontro el archivo de manifiestos en {RUTA}")
    with open(RUTA, encoding="utf-8") as f:
        return [d for d in yaml.safe_load_all(f) if d]


@pytest.fixture(scope="module")
def docs():
    return cargar()


def por_tipo(docs, kind):
    return [d for d in docs if d.get("kind") == kind]


def contenedores(recurso):
    """Devuelve los contenedores de un Deployment, StatefulSet o CronJob."""
    kind = recurso.get("kind")
    if kind == "CronJob":
        spec = (
            recurso["spec"]["jobTemplate"]["spec"]["template"]["spec"]
        )
    else:
        spec = recurso["spec"]["template"]["spec"]
    return spec.get("containers", [])


def nombre(recurso):
    return recurso.get("metadata", {}).get("name", "<sin nombre>")


# ---------------------------------------------------------------------------
# El chart debe producir algo
# ---------------------------------------------------------------------------

def test_el_chart_produce_manifiestos(docs):
    assert len(docs) > 0, "El chart no genero ningun manifiesto"


def test_existen_los_cinco_microservicios(docs):
    nombres = " ".join(nombre(d) for d in por_tipo(docs, "Deployment"))
    esperados = [
        "api-gateway",
        "auth-service",
        "tickets-service",
        "comentarios-service",
        "notificaciones-service",
    ]
    faltantes = [s for s in esperados if s not in nombres]
    assert not faltantes, f"Faltan Deployments para: {faltantes}"


# ---------------------------------------------------------------------------
# Imagenes
# ---------------------------------------------------------------------------

def test_ninguna_imagen_usa_la_etiqueta_latest(docs):
    """
    Desplegar con :latest rompe la trazabilidad y la reproducibilidad:
    dos despliegues del mismo manifiesto pueden traer codigo distinto.
    """
    infractores = []
    for kind in ("Deployment", "StatefulSet", "CronJob"):
        for recurso in por_tipo(docs, kind):
            for c in contenedores(recurso):
                imagen = c.get("image", "")
                if imagen.endswith(":latest") or ":" not in imagen.split("/")[-1]:
                    infractores.append(f"{nombre(recurso)} -> {imagen}")
    assert not infractores, f"Imagenes sin version fija: {infractores}"


def test_las_imagenes_propias_apuntan_a_un_registro_remoto(docs):
    """
    En la P5 las imagenes eran locales de minikube. En la nube el cluster
    debe poder descargarlas de un registro accesible.
    """
    locales = []
    for kind in ("Deployment", "StatefulSet", "CronJob"):
        for recurso in por_tipo(docs, kind):
            for c in contenedores(recurso):
                imagen = c.get("image", "")
                if any(s in imagen for s in SERVICIOS_PROPIOS):
                    if "." not in imagen.split("/")[0]:
                        locales.append(f"{nombre(recurso)} -> {imagen}")
    assert not locales, (
        f"Estas imagenes no incluyen host de registro: {locales}"
    )


# ---------------------------------------------------------------------------
# Salud y disponibilidad
# ---------------------------------------------------------------------------

def test_todos_los_deployments_tienen_sondas(docs):
    """
    Sin readinessProbe, Kubernetes envia trafico a pods que aun no estan
    listos, y el rolling update deja de ser sin caida de servicio.
    """
    faltantes = []
    for recurso in por_tipo(docs, "Deployment"):
        for c in contenedores(recurso):
            if "readinessProbe" not in c:
                faltantes.append(f"{nombre(recurso)}/{c.get('name')} (readiness)")
            if "livenessProbe" not in c:
                faltantes.append(f"{nombre(recurso)}/{c.get('name')} (liveness)")
    assert not faltantes, f"Contenedores sin sondas: {faltantes}"


def test_los_deployments_declaran_recursos(docs):
    """
    Sin requests el planificador no sabe cuanto reservar; sin limits un pod
    puede consumir el nodo entero. Ademas el HPA necesita requests de CPU
    para poder calcular el porcentaje de uso.
    """
    faltantes = []
    for recurso in por_tipo(docs, "Deployment"):
        for c in contenedores(recurso):
            recursos = c.get("resources", {})
            if not recursos.get("requests"):
                faltantes.append(f"{nombre(recurso)}/{c.get('name')} (requests)")
            if not recursos.get("limits"):
                faltantes.append(f"{nombre(recurso)}/{c.get('name')} (limits)")
    assert not faltantes, f"Contenedores sin recursos declarados: {faltantes}"


def test_el_rolling_update_no_permite_indisponibilidad(docs):
       # La base de datos y el broker montan volúmenes ReadWriteOnce: dos pods
    # no pueden montarlos a la vez, así que Recreate es la estrategia
    # correcta para ellos, no un defecto.
    CON_ESTADO = ("broker", "db")
    problemas = []
    for recurso in por_tipo(docs, "Deployment"):
        if any(c in nombre(recurso) for c in CON_ESTADO):
            continue
        estrategia = recurso["spec"].get("strategy", {})
        if estrategia.get("type") == "Recreate":
            problemas.append(f"{nombre(recurso)} usa la estrategia Recreate")
    assert not problemas, problemas


# ---------------------------------------------------------------------------
# Escalado
# ---------------------------------------------------------------------------

def test_los_hpa_arrancan_con_al_menos_dos_replicas(docs):
    """Con una sola replica no hay tolerancia a fallos durante el update."""
    problemas = []
    for hpa in por_tipo(docs, "HorizontalPodAutoscaler"):
        minimo = hpa["spec"].get("minReplicas", 1)
        if minimo < 2:
            problemas.append(f"{nombre(hpa)} tiene minReplicas={minimo}")
    assert not problemas, problemas


def test_los_hpa_tienen_margen_para_escalar(docs):
    problemas = []
    for hpa in por_tipo(docs, "HorizontalPodAutoscaler"):
        spec = hpa["spec"]
        if spec.get("maxReplicas", 0) <= spec.get("minReplicas", 1):
            problemas.append(
                f"{nombre(hpa)}: maxReplicas no supera a minReplicas"
            )
    assert not problemas, problemas


# ---------------------------------------------------------------------------
# Red y exposicion
# ---------------------------------------------------------------------------

def test_el_api_gateway_se_expone_como_loadbalancer(docs):
    """
    Regresion del incidente 4 de la P6: la plantilla del Service tenia el
    tipo escrito de forma fija como ClusterIP, asi que values-gke.yaml no
    tenia ningun efecto y el sistema nunca obtuvo IP publica.
    """
    servicios = [
        s for s in por_tipo(docs, "Service") if "api-gateway" in nombre(s)
    ]
    assert servicios, "No se genero ningun Service para el api-gateway"
    tipos = {s["spec"].get("type") for s in servicios}
    assert "LoadBalancer" in tipos, (
        f"El api-gateway se expone como {tipos}, no como LoadBalancer. "
        "Revisa que la plantilla lea .Values.service.type."
    )


def test_solo_el_api_gateway_esta_expuesto(docs):
    """
    Patron API Gateway: los demas microservicios no deben tener IP publica.
    """
    expuestos = [
        nombre(s)
        for s in por_tipo(docs, "Service")
        if s["spec"].get("type") in ("LoadBalancer", "NodePort")
        and "api-gateway" not in nombre(s)
    ]
    assert not expuestos, f"Servicios expuestos indebidamente: {expuestos}"


def test_existe_una_politica_de_denegacion_por_defecto(docs):
    politicas = por_tipo(docs, "NetworkPolicy")
    assert politicas, "El chart no genero ninguna NetworkPolicy"
    nombres = " ".join(nombre(p) for p in politicas)
    assert "deny" in nombres, (
        "No se encontro una politica de denegacion por defecto"
    )


def test_la_politica_del_gateway_admite_trafico_externo(docs):
    """
    Regresion del incidente 5 de la P6: la politica solo aceptaba trafico
    de pods del cluster. Un LoadBalancer real entrega el trafico externo
    directamente al pod, sin pasar por ningun pod intermedio, asi que era
    descartado en silencio y el sistema daba timeout desde internet.
    """
    politicas = [
        p for p in por_tipo(docs, "NetworkPolicy") if "gateway" in nombre(p)
    ]
    assert politicas, "No existe una NetworkPolicy para el api-gateway"

    tiene_ipblock = False
    for politica in politicas:
        for regla in politica["spec"].get("ingress", []):
            for origen in regla.get("from", []):
                if "ipBlock" in origen:
                    tiene_ipblock = True
    assert tiene_ipblock, (
        "La politica del api-gateway no declara ningun ipBlock: el trafico "
        "del LoadBalancer externo seria bloqueado."
    )


# ---------------------------------------------------------------------------
# Configuracion y secretos
# ---------------------------------------------------------------------------

def test_no_hay_secretos_escritos_en_texto_plano(docs):
    """
    Las credenciales deben inyectarse por Secret o variable de entorno,
    nunca escribirse directamente en un ConfigMap.
    """
    sospechosos = []
    claves = ("password", "secret", "aeskey", "contrasena", "token", "apikey")
    sospechosos = []
    for cm in por_tipo(docs, "ConfigMap"):
        for clave, valor in cm.get("data", {}).items():
            # Los valores puramente numéricos son parámetros de
            # configuración (TTL, timeouts), no credenciales.
            if str(valor).strip().isdigit():
                continue
            if any(p in clave.lower() for p in claves):
                sospechosos.append(f"{nombre(cm)} -> {clave}")


def test_la_base_de_datos_usa_almacenamiento_persistente(docs):
    statefulsets = por_tipo(docs, "StatefulSet")
    assert statefulsets, "No se genero ningun StatefulSet para la base de datos"
    for sts in statefulsets:
        plantillas = sts["spec"].get("volumeClaimTemplates", [])
        assert plantillas, (
            f"{nombre(sts)} no declara volumeClaimTemplates: los datos se "
            "perderian al reiniciar el pod."
        )
