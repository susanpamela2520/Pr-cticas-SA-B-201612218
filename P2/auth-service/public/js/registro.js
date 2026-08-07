document.getElementById('formRegistro').addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const mensaje = document.getElementById('mensaje');
  mensaje.className = 'mensaje';
  mensaje.textContent = '';

  const cuerpo = {
    nombre: document.getElementById('nombre').value,
    correo: document.getElementById('correo').value,
    contrasena: document.getElementById('contrasena').value,
    rol: document.getElementById('rol').value,
  };

  try {
    const respuesta = await fetch('/api/auth/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      const detalle = datos.detalles ? datos.detalles.join(' ') : datos.error;
      throw new Error(detalle || 'No se pudo completar el registro.');
    }

    mensaje.className = 'mensaje exito';
    mensaje.textContent = `Cuenta creada para ${datos.nombre}. Redirigiendo al login...`;
    setTimeout(() => (location.href = '/login.html'), 1200);
  } catch (error) {
    mensaje.className = 'mensaje error';
    mensaje.textContent = error.message;
  }
});
