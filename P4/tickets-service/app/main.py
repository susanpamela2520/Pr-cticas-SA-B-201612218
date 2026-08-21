from fastapi import FastAPI, Request
from strawberry.fastapi import GraphQLRouter

from app.database import Base, engine
from app.routers import tickets
from app.graphql_schema import schema

app = FastAPI(title="tickets-service", version="1.0.0")


@app.on_event("startup")
def crear_tablas():
    # SQLAlchemy crea la tabla automaticamente si no existe (no se
    # escribio un .sql de migracion a mano para este servicio, a
    # diferencia de los servicios Node/pg del resto del sistema).
    Base.metadata.create_all(bind=engine)


app.include_router(tickets.router)


async def obtener_contexto(request: Request):
    return {"request": request}


graphql_app = GraphQLRouter(schema, context_getter=obtener_contexto)
app.include_router(graphql_app, prefix="/graphql")


@app.get("/health")
def health():
    return {"status": "ok", "servicio": "tickets-service"}
