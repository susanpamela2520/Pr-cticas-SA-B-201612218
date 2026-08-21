import os

DATABASE_URL = os.getenv(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5434/tickets_db"
)
JWT_SECRET = os.getenv("JWT_SECRET", "clave-de-desarrollo-cambiar-en-produccion")
JWT_ALGORITHM = "HS256"
NOTIFICACIONES_URL = os.getenv("NOTIFICACIONES_URL", "http://localhost:8002")
PORT = int(os.getenv("PORT", "8001"))
