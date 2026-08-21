import httpx

from app.config import NOTIFICACIONES_URL


async def notificar_ticket_resuelto(destinatario_id: str, ticket_id: str, titulo: str) -> None:
    """
    Llamada directa de servicio a servicio (no pasa por el API Gateway):
    el Gateway existe para el tráfico externo/cliente, no para
    comunicación interna entre microservicios que ya se conocen entre
    sí por su propósito de negocio. Es "fire and forget" simplificado:
    si notificaciones-service no responde, se registra el error pero
    no se bloquea ni se revierte el cambio de estado del ticket (una
    notificación fallida no debería impedir que el ticket se marque
    como resuelto).
    """
    payload = {
        "destinatario": destinatario_id,
        "asunto": f"Tu ticket ha sido resuelto: {titulo}",
        "mensaje": f"El ticket {ticket_id} fue marcado como RESUELTO. Si el problema persiste, responde este correo.",
    }
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(f"{NOTIFICACIONES_URL}/notificaciones/enviar", json=payload)
    except httpx.HTTPError as error:
        print(f"[tickets-service] No se pudo notificar (no bloqueante): {error}")
