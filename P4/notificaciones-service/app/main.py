import uuid
from datetime import datetime

from fastapi import FastAPI
from pydantic import BaseModel, EmailStr, Field
from typing import Optional

app = FastAPI(title="notificaciones-service", version="1.0.0")


class NotificacionEntrada(BaseModel):
    destinatario: str = Field(min_length=1)  # id del usuario o correo, según quien llame
    asunto: str
    mensaje: str


class NotificacionSalida(BaseModel):
    id: str
    enviado: bool
    fecha: datetime


@app.post("/notificaciones/enviar", response_model=NotificacionSalida)
def enviar_notificacion(datos: NotificacionEntrada):
    """
    Servicio deliberadamente simple y sin base de datos: no persiste
    nada, solo "simula" el envío (lo imprime en su propio log) y
    confirma. En un sistema real, aquí se integraría un proveedor SMTP
    real (SendGrid, SES, etc.) — se deja fuera del alcance de esta
    práctica para mantener el servicio enfocado en demostrar
    comunicación directa entre microservicios (tickets-service lo llama
    sin pasar por el API Gateway).
    """
    notificacion_id = str(uuid.uuid4())
    print(
        f"[notificaciones-service] Enviando correo a '{datos.destinatario}' "
        f"| asunto='{datos.asunto}' | mensaje='{datos.mensaje}' | id={notificacion_id}"
    )
    return NotificacionSalida(id=notificacion_id, enviado=True, fecha=datetime.utcnow())


@app.get("/health")
def health():
    return {"status": "ok", "servicio": "notificaciones-service"}
