import os
import json
import time
import uuid
import logging
import threading
from datetime import datetime

import pika
from fastapi import FastAPI
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("notificaciones-service")

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/%2F")
COLA_TICKETS_RESUELTOS = os.getenv("COLA_TICKETS_RESUELTOS", "tickets.resueltos")

app = FastAPI(title="notificaciones-service")


class NotificacionEntrada(BaseModel):
    destinatario: str
    asunto: str
    mensaje: str


@app.get("/health")
def health():
    return {"status": "ok", "servicio": "notificaciones-service"}


@app.post("/notificaciones/enviar")
def enviar_notificacion(datos: NotificacionEntrada):
    """Endpoint síncrono que se conserva por compatibilidad / pruebas
    manuales, pero el flujo real de negocio (ticket resuelto) ya NO pasa
    por aquí — llega por la cola (ver consumir_cola más abajo)."""
    notificacion_id = str(uuid.uuid4())
    log.info(f"[REST directo] Enviando a '{datos.destinatario}': {datos.asunto} (id={notificacion_id})")
    return {"id": notificacion_id, "enviado": True, "fecha": datetime.utcnow().isoformat()}


def procesar_mensaje(cuerpo: bytes) -> bool:
    """Simula el envío del correo. Devuelve True si se procesó bien —
    solo entonces se confirma (ack) el mensaje ante RabbitMQ."""
    try:
        evento = json.loads(cuerpo)
        log.info(
            f"[CONSUMIDOR] Ticket resuelto recibido: {evento['ticket_id']} "
            f"(cliente {evento['cliente_id']}) -> simulando envío de correo..."
        )
        # Aquí iría la integración real con un proveedor SMTP.
        return True
    except Exception as error:
        log.error(f"Error procesando mensaje, NO se confirma (se reintentará): {error}")
        return False


def consumir_cola():
    """Corre en un hilo de fondo durante toda la vida del proceso.
    Requisito D de la práctica: el consumidor confirma (ack) el mensaje
    SOLO después de procesarlo correctamente — así, si notificaciones-service
    se cae a mitad del procesamiento, el mensaje sigue en la cola (no se
    perdió) y se vuelve a entregar cuando el servicio se restaura.
    """
    while True:
        try:
            parametros = pika.URLParameters(RABBITMQ_URL)
            conexion = pika.BlockingConnection(parametros)
            canal = conexion.channel()
            canal.queue_declare(queue=COLA_TICKETS_RESUELTOS, durable=True)
            # prefetch_count=1: no tomar un mensaje nuevo hasta confirmar el actual.
            canal.basic_qos(prefetch_count=1)

            def callback(ch, method, properties, body):
                if procesar_mensaje(body):
                    ch.basic_ack(delivery_tag=method.delivery_tag)
                else:
                    # requeue=True: el mensaje vuelve a la cola para reintentarse.
                    ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)

            canal.basic_consume(queue=COLA_TICKETS_RESUELTOS, on_message_callback=callback)
            log.info(f"Escuchando la cola '{COLA_TICKETS_RESUELTOS}'...")
            canal.start_consuming()
        except Exception as error:
            log.error(f"Conexión con RabbitMQ perdida/no disponible, reintentando en 5s: {error}")
            time.sleep(5)


@app.on_event("startup")
def iniciar_consumidor():
    hilo = threading.Thread(target=consumir_cola, daemon=True)
    hilo.start()
