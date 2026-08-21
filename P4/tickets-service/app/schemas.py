import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models import EstadoTicket, PrioridadTicket


class TicketCrear(BaseModel):
    titulo: str = Field(min_length=3, max_length=150)
    descripcion: str = Field(min_length=3)
    prioridad: PrioridadTicket = PrioridadTicket.MEDIA


class TicketCambiarEstado(BaseModel):
    estado: EstadoTicket


class TicketAsignar(BaseModel):
    agente_id: uuid.UUID


class TicketSalida(BaseModel):
    id: uuid.UUID
    titulo: str
    descripcion: str
    cliente_id: uuid.UUID
    agente_id: Optional[uuid.UUID]
    estado: EstadoTicket
    prioridad: PrioridadTicket
    creado_en: datetime
    actualizado_en: datetime

    class Config:
        from_attributes = True
