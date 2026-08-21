import uuid
import enum
from datetime import datetime

from sqlalchemy import Column, String, Text, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class EstadoTicket(str, enum.Enum):
    ABIERTO = "ABIERTO"
    EN_PROCESO = "EN_PROCESO"
    RESUELTO = "RESUELTO"
    CERRADO = "CERRADO"


class PrioridadTicket(str, enum.Enum):
    BAJA = "BAJA"
    MEDIA = "MEDIA"
    ALTA = "ALTA"


class Ticket(Base):
    """
    Entidad principal del microservicio. `cliente_id` y `agente_id` son
    referencias externas al `id` de un usuario en auth-service — no hay
    llave foránea real porque cada microservicio tiene su propia base
    de datos (patrón Database per Service).
    """

    __tablename__ = "tickets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    titulo = Column(String(150), nullable=False)
    descripcion = Column(Text, nullable=False)
    cliente_id = Column(UUID(as_uuid=True), nullable=False)
    agente_id = Column(UUID(as_uuid=True), nullable=True)
    estado = Column(SAEnum(EstadoTicket), nullable=False, default=EstadoTicket.ABIERTO)
    prioridad = Column(SAEnum(PrioridadTicket), nullable=False, default=PrioridadTicket.MEDIA)
    creado_en = Column(DateTime, default=datetime.utcnow, nullable=False)
    actualizado_en = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
