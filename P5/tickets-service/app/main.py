import os
import uuid
import json
import enum
import logging
import threading
import time
from datetime import datetime
from typing import Optional, List

import jwt
import pika
from fastapi import FastAPI, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, Column, String, Text, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import sessionmaker, declarative_base, Session
import strawberry
from strawberry.fastapi import GraphQLRouter
from strawberry.types import Info

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("tickets-service")

# ---------- Config ----------
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/tickets_db")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/%2F")
COLA_TICKETS_RESUELTOS = os.getenv("COLA_TICKETS_RESUELTOS", "tickets.resueltos")
COLA_RESUMENES_CRON = os.getenv("COLA_RESUMENES_CRON", "cron.resumenes")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------- Modelo ----------
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


class ResumenCron(Base):
    """Guarda los resúmenes que publica el Cronjob 2 al broker. Esta
    tabla es la evidencia de que el flujo productor/consumidor del
    Cronjob 2 funciona de extremo a extremo (no solo que el cronjob
    publicó algo, sino que alguien lo consumió y lo guardó)."""
    __tablename__ = "resumenes_cron"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    generado_en = Column(String(30), nullable=False)
    hora = Column(String(20), nullable=False)
    cantidad = Column(String(10), nullable=False)
    recibido_en = Column(DateTime, default=datetime.utcnow, nullable=False)


# ---------- Auth (JWT compartido, sin llamar a auth-service) ----------
def obtener_usuario_actual(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="No hay sesión activa.")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sesión expirada.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido.")
    return {"id": payload["sub"], "rol": payload["rol"]}


# ---------- Publicación asíncrona a RabbitMQ ----------
# Requisito D de la práctica: este flujo deja de ser síncrono. Antes (P4),
# tickets-service llamaba por HTTP directo a notificaciones-service y
# esperaba la respuesta. Ahora publica el evento y retorna de inmediato;
# quien procesa el mensaje (notificaciones-service) lo hace de forma
# totalmente independiente, en su propio tiempo.
def publicar_ticket_resuelto(ticket: Ticket) -> None:
    mensaje = {
        "ticket_id": str(ticket.id),
        "cliente_id": str(ticket.cliente_id),
        "titulo": ticket.titulo,
        "resuelto_en": datetime.utcnow().isoformat(),
    }
    try:
        parametros = pika.URLParameters(RABBITMQ_URL)
        conexion = pika.BlockingConnection(parametros)
        canal = conexion.channel()
        # Cola durable: sobrevive a un reinicio del broker. Mensaje
        # persistente (delivery_mode=2): sobrevive aunque el broker se
        # caiga con el mensaje todavía en cola sin consumir.
        canal.queue_declare(queue=COLA_TICKETS_RESUELTOS, durable=True)
        canal.basic_publish(
            exchange="",
            routing_key=COLA_TICKETS_RESUELTOS,
            body=json.dumps(mensaje),
            properties=pika.BasicProperties(delivery_mode=2, content_type="application/json"),
        )
        conexion.close()
        log.info(f"Publicado evento ticket.resuelto para {ticket.id}")
    except Exception as error:
        # No bloqueante: si el broker está caído, el ticket ya quedó
        # RESUELTO en la base de datos. Se registra el error pero no se
        # revierte la operación principal.
        log.error(f"No se pudo publicar el evento (no bloqueante): {error}")


# ---------- Esquemas REST ----------
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


# ---------- GraphQL ----------
def _usuario_o_error(info: Info) -> dict:
    return obtener_usuario_actual(info.context["request"])


@strawberry.type
class TicketType:
    id: strawberry.ID
    titulo: str
    descripcion: str
    cliente_id: strawberry.ID
    agente_id: Optional[strawberry.ID]
    estado: str
    prioridad: str


def _a_graphql(t: Ticket) -> TicketType:
    return TicketType(
        id=strawberry.ID(str(t.id)), titulo=t.titulo, descripcion=t.descripcion,
        cliente_id=strawberry.ID(str(t.cliente_id)),
        agente_id=strawberry.ID(str(t.agente_id)) if t.agente_id else None,
        estado=t.estado.value, prioridad=t.prioridad.value,
    )


@strawberry.type
class Query:
    @strawberry.field
    def tickets(self, info: Info, estado: Optional[str] = None) -> List[TicketType]:
        _usuario_o_error(info)
        with SessionLocal() as db:
            q = db.query(Ticket)
            if estado:
                q = q.filter(Ticket.estado == EstadoTicket(estado))
            return [_a_graphql(t) for t in q.order_by(Ticket.creado_en.desc()).all()]

    @strawberry.field
    def ticket(self, info: Info, id: strawberry.ID) -> Optional[TicketType]:
        _usuario_o_error(info)
        with SessionLocal() as db:
            t = db.query(Ticket).filter(Ticket.id == uuid.UUID(str(id))).first()
            return _a_graphql(t) if t else None


@strawberry.type
class Mutation:
    @strawberry.mutation
    def crear_ticket(self, info: Info, titulo: str, descripcion: str, prioridad: Optional[str] = "MEDIA") -> TicketType:
        usuario = _usuario_o_error(info)
        with SessionLocal() as db:
            t = Ticket(titulo=titulo, descripcion=descripcion, prioridad=PrioridadTicket(prioridad), cliente_id=uuid.UUID(usuario["id"]))
            db.add(t); db.commit(); db.refresh(t)
            return _a_graphql(t)

    @strawberry.mutation
    def cambiar_estado(self, info: Info, id: strawberry.ID, estado: str) -> TicketType:
        _usuario_o_error(info)
        with SessionLocal() as db:
            t = db.query(Ticket).filter(Ticket.id == uuid.UUID(str(id))).first()
            if not t:
                raise Exception("Ticket no encontrado.")
            t.estado = EstadoTicket(estado)
            db.commit(); db.refresh(t)
            if t.estado == EstadoTicket.RESUELTO:
                publicar_ticket_resuelto(t)
            return _a_graphql(t)


schema = strawberry.Schema(query=Query, mutation=Mutation)

# ---------- Consumidor del resumen del Cronjob 2 ----------
def consumir_resumenes_cron():
    """Corre en un hilo de fondo, igual que el consumidor de
    notificaciones-service: escucha la cola que publica el Cronjob 2,
    y por cada resumen recibido guarda una fila por cada (hora, cantidad).
    Solo confirma (ack) tras guardar exitosamente en la base de datos."""
    while True:
        try:
            parametros = pika.URLParameters(RABBITMQ_URL)
            conexion = pika.BlockingConnection(parametros)
            canal = conexion.channel()
            canal.queue_declare(queue=COLA_RESUMENES_CRON, durable=True)
            canal.basic_qos(prefetch_count=1)

            def callback(ch, method, properties, body):
                try:
                    datos = json.loads(body)
                    with SessionLocal() as db:
                        for item in datos.get("resumen", []):
                            db.add(ResumenCron(
                                generado_en=datos["generado_en"],
                                hora=item["hora"],
                                cantidad=str(item["cantidad"]),
                            ))
                        db.commit()
                    log.info(f"[CONSUMIDOR resumen-cron] Guardado resumen generado_en={datos['generado_en']}")
                    ch.basic_ack(delivery_tag=method.delivery_tag)
                except Exception as error:
                    log.error(f"Error guardando resumen, NO se confirma (se reintentará): {error}")
                    ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)

            canal.basic_consume(queue=COLA_RESUMENES_CRON, on_message_callback=callback)
            log.info(f"Escuchando la cola '{COLA_RESUMENES_CRON}'...")
            canal.start_consuming()
        except Exception as error:
            log.error(f"Conexión con RabbitMQ perdida/no disponible (resumen-cron), reintentando en 5s: {error}")
            time.sleep(5)


# ---------- FastAPI ----------
app = FastAPI(title="tickets-service")


@app.on_event("startup")
def crear_tablas():
    Base.metadata.create_all(bind=engine)
    hilo = threading.Thread(target=consumir_resumenes_cron, daemon=True)
    hilo.start()


@app.get("/health")
def health():
    return {"status": "ok", "servicio": "tickets-service"}


@app.get("/resumenes-cron")
def listar_resumenes_cron(db: Session = Depends(get_db)):
    """Endpoint de evidencia: permite comprobar que los resumenes que
    publica el Cronjob 2 realmente llegaron y se guardaron via el
    consumidor. Sin autenticacion a proposito, para verificarlo rapido
    con curl durante la demo."""
    filas = db.query(ResumenCron).order_by(ResumenCron.recibido_en.desc()).all()
    return [{"generado_en": f.generado_en, "hora": f.hora, "cantidad": f.cantidad, "recibido_en": f.recibido_en} for f in filas]


@app.post("/tickets", response_model=TicketSalida, status_code=201)
def crear_ticket_rest(datos: TicketCrear, usuario: dict = Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    t = Ticket(titulo=datos.titulo, descripcion=datos.descripcion, prioridad=datos.prioridad, cliente_id=uuid.UUID(usuario["id"]))
    db.add(t); db.commit(); db.refresh(t)
    return t


@app.get("/tickets", response_model=List[TicketSalida])
def listar_tickets(estado: Optional[EstadoTicket] = None, usuario: dict = Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    q = db.query(Ticket)
    if estado is not None:
        q = q.filter(Ticket.estado == estado)
    return q.order_by(Ticket.creado_en.desc()).all()


@app.get("/tickets/{ticket_id}", response_model=TicketSalida)
def obtener_ticket(ticket_id: uuid.UUID, usuario: dict = Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    t = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Ticket no encontrado.")
    return t


@app.patch("/tickets/{ticket_id}/estado", response_model=TicketSalida)
def cambiar_estado_rest(ticket_id: uuid.UUID, datos: TicketCambiarEstado, usuario: dict = Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    t = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Ticket no encontrado.")
    t.estado = datos.estado
    db.commit(); db.refresh(t)
    if datos.estado == EstadoTicket.RESUELTO:
        publicar_ticket_resuelto(t)
    return t


@app.patch("/tickets/{ticket_id}/asignar", response_model=TicketSalida)
def asignar_agente(ticket_id: uuid.UUID, datos: TicketAsignar, usuario: dict = Depends(obtener_usuario_actual), db: Session = Depends(get_db)):
    t = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Ticket no encontrado.")
    t.agente_id = datos.agente_id
    t.estado = EstadoTicket.EN_PROCESO
    db.commit(); db.refresh(t)
    return t


async def obtener_contexto(request: Request):
    return {"request": request}


app.include_router(GraphQLRouter(schema, context_getter=obtener_contexto), prefix="/graphql")
