import uuid
from typing import Optional, List
from datetime import datetime

import strawberry
from strawberry.types import Info

from app.database import SessionLocal
from app.models import Ticket as TicketModel, EstadoTicket, PrioridadTicket
from app.auth import obtener_usuario_actual


def _usuario_o_error(info: Info) -> dict:
    """Reutiliza la misma verificación de JWT que usa el REST (app/auth.py).
    Si no hay sesión válida, la excepción se propaga y Strawberry la
    convierte automáticamente en un error GraphQL controlado (no un
    crash del servidor)."""
    request = info.context["request"]
    return obtener_usuario_actual(request)


@strawberry.type
class TicketType:
    id: strawberry.ID
    titulo: str
    descripcion: str
    cliente_id: strawberry.ID
    agente_id: Optional[strawberry.ID]
    estado: str
    prioridad: str
    creado_en: datetime
    actualizado_en: datetime


def _a_graphql(t: TicketModel) -> TicketType:
    return TicketType(
        id=strawberry.ID(str(t.id)),
        titulo=t.titulo,
        descripcion=t.descripcion,
        cliente_id=strawberry.ID(str(t.cliente_id)),
        agente_id=strawberry.ID(str(t.agente_id)) if t.agente_id else None,
        estado=t.estado.value,
        prioridad=t.prioridad.value,
        creado_en=t.creado_en,
        actualizado_en=t.actualizado_en,
    )


@strawberry.type
class Query:
    @strawberry.field
    def tickets(self, info: Info, estado: Optional[str] = None) -> List[TicketType]:
        _usuario_o_error(info)
        with SessionLocal() as db:
            consulta = db.query(TicketModel)
            if estado:
                consulta = consulta.filter(TicketModel.estado == EstadoTicket(estado))
            filas = consulta.order_by(TicketModel.creado_en.desc()).all()
            return [_a_graphql(t) for t in filas]

    @strawberry.field
    def ticket(self, info: Info, id: strawberry.ID) -> Optional[TicketType]:
        _usuario_o_error(info)
        with SessionLocal() as db:
            t = db.query(TicketModel).filter(TicketModel.id == uuid.UUID(str(id))).first()
            return _a_graphql(t) if t else None


@strawberry.type
class Mutation:
    @strawberry.mutation
    def crear_ticket(
        self, info: Info, titulo: str, descripcion: str, prioridad: Optional[str] = "MEDIA"
    ) -> TicketType:
        usuario = _usuario_o_error(info)
        with SessionLocal() as db:
            t = TicketModel(
                titulo=titulo,
                descripcion=descripcion,
                prioridad=PrioridadTicket(prioridad),
                cliente_id=uuid.UUID(usuario["id"]),
            )
            db.add(t)
            db.commit()
            db.refresh(t)
            return _a_graphql(t)

    @strawberry.mutation
    def cambiar_estado(self, info: Info, id: strawberry.ID, estado: str) -> TicketType:
        _usuario_o_error(info)
        with SessionLocal() as db:
            t = db.query(TicketModel).filter(TicketModel.id == uuid.UUID(str(id))).first()
            if not t:
                raise Exception(f'Ticket con id "{id}" no fue encontrado.')
            t.estado = EstadoTicket(estado)
            db.commit()
            db.refresh(t)
            return _a_graphql(t)


schema = strawberry.Schema(query=Query, mutation=Mutation)
