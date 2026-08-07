document.getElementById('formLogin').addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const mensaje = document.getElementById('mensaje');
  mensaje.className = 'mensaje';
  mensaje.textContent = '';

  const cuerpo = {
    correo: document.getElementById('correo').value,
    contrasena: document.getElementById('contrasena').value,
  };

  try {
    const respuesta = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // importante: para que el navegador guarde la cookie httpOnly
      body: JSON.stringify(cuerpo),
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      throw new Error(datos.error || 'No se pudo iniciar sesión.');
    }

    location.href = '/confirmacion.html';
  } catch (error) {
    mensaje.className = 'mensaje error';
    mensaje.textContent = error.message;
  }
});
