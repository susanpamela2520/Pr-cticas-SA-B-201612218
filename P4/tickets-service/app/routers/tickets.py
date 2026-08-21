import uuid
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Ticket, EstadoTicket
from app.schemas import TicketCrear, TicketSalida, TicketCambiarEstado, TicketAsignar
from app.auth import obtener_usuario_actual
from app.notificaciones_client import notificar_ticket_resuelto

router = APIRouter(prefix="/tickets", tags=["tickets"])


@router.post("", response_model=TicketSalida, status_code=201)
def crear_ticket(
    datos: TicketCrear,
    usuario: dict = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    ticket = Ticket(
        titulo=datos.titulo,
        descripcion=datos.descripcion,
        prioridad=datos.prioridad,
        cliente_id=uuid.UUID(usuario["id"]),
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return ticket


@router.get("", response_model=List[TicketSalida])
def listar_tickets(
    estado: Optional[EstadoTicket] = None,
    usuario: dict = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    consulta = db.query(Ticket)
    if estado is not None:
        consulta = consulta.filter(Ticket.estado == estado)
    return consulta.order_by(Ticket.creado_en.desc()).all()


@router.get("/{ticket_id}", response_model=TicketSalida)
def obtener_ticket(
    ticket_id: uuid.UUID,
    usuario: dict = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail=f'Ticket con id "{ticket_id}" no fue encontrado.')
    return ticket


@router.patch("/{ticket_id}/estado", response_model=TicketSalida)
async def cambiar_estado(
    ticket_id: uuid.UUID,
    datos: TicketCambiarEstado,
    usuario: dict = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail=f'Ticket con id "{ticket_id}" no fue encontrado.')

    ticket.estado = datos.estado
    db.commit()
    db.refresh(ticket)

    if datos.estado == EstadoTicket.RESUELTO:
        await notificar_ticket_resuelto(str(ticket.cliente_id), str(ticket.id), ticket.titulo)

    return ticket


@router.patch("/{ticket_id}/asignar", response_model=TicketSalida)
def asignar_agente(
    ticket_id: uuid.UUID,
    datos: TicketAsignar,
    usuario: dict = Depends(obtener_usuario_actual),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail=f'Ticket con id "{ticket_id}" no fue encontrado.')

    ticket.agente_id = datos.agente_id
    ticket.estado = EstadoTicket.EN_PROCESO
    db.commit()
    db.refresh(ticket)
    return ticket
