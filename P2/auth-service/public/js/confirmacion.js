async function cargarPerfil() {
  const titulo = document.getElementById('titulo');
  try {
    const respuesta = await fetch('/api/auth/me', { credentials: 'include' });
    if (!respuesta.ok) throw new Error();
    const usuario = await respuesta.json();
    titulo.innerHTML = `Bienvenido, ${usuario.nombre} <span class="badge-rol">${usuario.rol}</span>`;
  } catch {
    // No hay sesión activa (o expiró fuera del período de gracia): al login.
    location.href = '/login.html';
  }
}

async function probarRuta(ruta, contenedorId) {
  const contenedor = document.getElementById(contenedorId);
  contenedor.style.display = 'block';
  contenedor.className = 'resultado-ruta';
  contenedor.textContent = 'Consultando...';

  try {
    const respuesta = await fetch(`/api/recursos/${ruta}`, { credentials: 'include' });
    const datos = await respuesta.json();

    if (respuesta.ok) {
      contenedor.className = 'resultado-ruta ok';
      contenedor.textContent = `${datos.mensaje}`;
    } else {
      contenedor.className = 'resultado-ruta denegado';
      contenedor.textContent = `[${respuesta.status}] ${datos.error}`;
    }
  } catch (error) {
    contenedor.className = 'resultado-ruta denegado';
    contenedor.textContent = 'No se pudo contactar al servidor.';
  }
}

document.getElementById('btnRuta1').addEventListener('click', () => probarRuta('ruta1', 'resultadoRuta1'));
document.getElementById('btnRuta2').addEventListener('click', () => probarRuta('ruta2', 'resultadoRuta2'));

document.getElementById('btnLogout').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  location.href = '/login.html';
});

cargarPerfil();
