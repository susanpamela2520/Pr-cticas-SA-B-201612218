import jwt
from fastapi import Request, HTTPException

from app.config import JWT_SECRET, JWT_ALGORITHM


def obtener_usuario_actual(request: Request) -> dict:
    """
    Verifica el JWT que auth-service (Node.js) emitió, usando el mismo
    JWT_SECRET compartido entre ambos servicios. No hay ninguna llamada
    de red a auth-service: la verificación de firma es puramente local,
    porque JWT es un mecanismo sin estado (stateless) por diseño.

    A diferencia de auth-service, este servicio NO renueva el token
    automáticamente si expiró — solo verifica. La renovación queda
    centralizada en auth-service (ya implementada y probada en la
    Práctica 2); aquí, si el token expiró, se responde 401 y el
    frontend debe volver a pasar por auth-service.
    """
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="No se encontró una sesión activa.")

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="La sesión expiró. Inicia sesión de nuevo.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido.")

    return {"id": payload["sub"], "rol": payload["rol"]}
