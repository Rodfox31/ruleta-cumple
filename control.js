/* =========================================================
   RULETA DEL CUMPLE — control desde el celular
   Se conecta a la TV por PeerJS usando el código de la sala
   (control.html?sala=<código>) y manda "girar", "continuar" y "salir".
   ========================================================= */
'use strict';

const PREFIJO = 'ruletacumple-';

const $ = (sel) => document.querySelector(sel);

const el = {
  titulo: $('#titulo'),
  estado: $('#estado'),
  estadoTexto: $('#estadoTexto'),
  vistaControl: $('#vistaControl'),
  vistaAviso: $('#vistaAviso'),
  vistaCodigo: $('#vistaCodigo'),
  indicacion: $('#indicacion'),
  botonGirar: $('#botonGirar'),
  botonTexto: $('#botonTexto'),
  botonSalir: $('#botonSalir'),
  avisoEmoji: $('#avisoEmoji'),
  avisoTitulo: $('#avisoTitulo'),
  avisoTexto: $('#avisoTexto'),
  avisoBoton: $('#avisoBoton'),
  formCodigo: $('#formCodigo'),
  inputCodigo: $('#inputCodigo'),
  resultado: $('#resultado'),
  tarjeta: $('#tarjeta'),
  resEtiqueta: $('#resEtiqueta'),
  resNumero: $('#resNumero'),
  resUnidad: $('#resUnidad'),
  resDescripcion: $('#resDescripcion'),
  botonContinuar: $('#botonContinuar'),
  botonSalirResultado: $('#botonSalirResultado'),
};

const limpiarCodigo = (texto) => (texto || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);

/** Id de esta pestaña: si se recarga la página, la TV lo reconoce y le devuelve el control. */
function idCliente() {
  const nuevo = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  try {
    let id = sessionStorage.getItem('ruleta.cliente');
    if (!id) {
      id = nuevo();
      sessionStorage.setItem('ruleta.cliente', id);
    }
    return id;
  } catch {
    return nuevo();
  }
}

let codigo = limpiarCodigo(new URLSearchParams(location.search).get('sala'));
const cliente = idCliente();
let peer = null;
let conn = null;
let estadoRuleta = 'desconectado'; // 'desconectado' | 'listo' | 'girando' | 'resultado'
let detenido = false;              // después de "Salir" o de "ocupada" no se reconecta solo
let ultimoMensaje = 0;
let timerPing = null;
let timerReintento = null;
let timerApertura = null;

/* ---------- Interfaz ---------- */

function mostrarConexion(estado, texto) {
  el.estado.dataset.estado = estado;
  el.estadoTexto.textContent = texto;
}

function mostrarVista(nombre) {
  el.vistaControl.hidden = nombre !== 'control';
  el.vistaAviso.hidden = nombre !== 'aviso';
  el.vistaCodigo.hidden = nombre !== 'codigo';
  if (nombre !== 'control') el.resultado.hidden = true;
}

const AVISOS = {
  afuera: {
    emoji: '👋',
    titulo: 'Saliste del control',
    texto: 'La tele volvió a mostrar el QR para que otro pueda jugar.',
    boton: 'Volver a conectar',
  },
  ocupado: {
    emoji: '✋',
    titulo: 'La ruleta está ocupada',
    texto: 'Otro celular la está controlando. Cuando salga, vas a poder entrar vos.',
    boton: 'Reintentar',
  },
};

function mostrarAviso(tipo) {
  const a = AVISOS[tipo];
  el.avisoEmoji.textContent = a.emoji;
  el.avisoTitulo.textContent = a.titulo;
  el.avisoTexto.textContent = a.texto;
  el.avisoBoton.textContent = a.boton;
  mostrarVista('aviso');
}

function vibrar(patron) {
  if (navigator.vibrate) navigator.vibrate(patron);
}

function aplicarEstado(nuevo, resultado) {
  const anterior = estadoRuleta;
  estadoRuleta = nuevo;

  el.botonGirar.disabled = nuevo !== 'listo';
  el.botonGirar.classList.toggle('girando', nuevo === 'girando');

  if (nuevo === 'listo') {
    el.botonTexto.textContent = '¡GIRAR!';
    el.indicacion.textContent = 'Apretá para girar la ruleta de la TV';
  } else if (nuevo === 'girando') {
    el.botonTexto.textContent = 'GIRANDO';
    el.indicacion.textContent = '¡Mirá la tele!';
  } else if (nuevo === 'resultado') {
    el.botonTexto.textContent = '¡YA!';
  } else {
    el.botonTexto.textContent = 'ESPERANDO…';
    el.indicacion.textContent = 'Conectando con la ruleta de la TV';
  }

  if (nuevo === 'resultado' && resultado) {
    el.resEtiqueta.textContent = resultado.etiqueta || '¡Salió!';
    el.resNumero.textContent = resultado.texto;
    el.resUnidad.textContent = resultado.unidad || '';
    el.resDescripcion.textContent = resultado.descripcion || '';
    el.tarjeta.style.setProperty('--color', resultado.color || '#7B2FF7');
    el.resultado.hidden = false;
    if (anterior !== 'resultado') vibrar(resultado.festejo === 'jackpot' ? [80, 60, 80, 60, 300] : [60, 50, 120]);
  } else {
    el.resultado.hidden = true;
  }
}

/* ---------- Conexión ---------- */

function programarReintento(ms) {
  clearTimeout(timerReintento);
  timerReintento = setTimeout(conectar, ms);
}

function conectar() {
  clearTimeout(timerReintento);
  if (!codigo || detenido) return;
  if (typeof Peer === 'undefined') {
    mostrarConexion('error', 'Sin internet. Recargá la página.');
    return;
  }
  if (conn && conn.open) return;

  mostrarConexion('conectando', 'Conectando…');
  if (!peer || peer.destroyed) {
    crearPeer();
  } else if (peer.disconnected) {
    try { peer.reconnect(); } catch { crearPeer(); } // al reabrirse dispara 'open' → abrirConexion
  } else if (peer.open) {
    abrirConexion();
  }
}

function crearPeer() {
  if (peer && !peer.destroyed) {
    try { peer.destroy(); } catch { /* ya estaba cerrado */ }
  }
  const p = new Peer({ debug: 1 });
  peer = p;

  p.on('open', () => {
    if (p === peer && !detenido) abrirConexion();
  });

  p.on('error', (err) => {
    if (p !== peer || detenido) return;
    console.warn('[control] PeerJS:', err.type, err);
    if (err.type === 'peer-unavailable') {
      mostrarConexion('error', 'No encuentro la ruleta. ¿Está abierta en la TV?');
    } else {
      mostrarConexion('error', 'Problema de conexión. Reintentando…');
    }
    programarReintento(3000);
  });
}

function abrirConexion() {
  cerrarConexion();
  const c = peer.connect(PREFIJO + codigo, { reliable: true });
  conn = c;

  // Si en unos segundos no abrió, se reintenta
  clearTimeout(timerApertura);
  timerApertura = setTimeout(() => {
    if (conn === c && !c.open) {
      cerrarConexion();
      mostrarConexion('error', 'La ruleta no responde. Reintentando…');
      programarReintento(1000);
    }
  }, 9000);

  c.on('open', () => {
    if (conn !== c) return;
    clearTimeout(timerApertura);
    ultimoMensaje = Date.now();
    mostrarConexion('ok', 'Conectado a la ruleta');
    iniciarPing();
    enviar({ tipo: 'hola', cliente });
  });

  c.on('data', (datos) => {
    if (conn !== c) return;
    ultimoMensaje = Date.now();
    recibir(datos);
  });

  c.on('close', () => { if (conn === c) conexionPerdida(); });
  c.on('error', () => { if (conn === c) conexionPerdida(); });
}

/** Cierra la conexión actual sin disparar la reconexión automática. */
function cerrarConexion() {
  const c = conn;
  conn = null;
  detenerPing();
  if (c) {
    try { c.close(); } catch { /* ya estaba cerrada */ }
  }
}

function conexionPerdida() {
  cerrarConexion();
  if (detenido) return;
  aplicarEstado('desconectado');
  mostrarConexion('error', 'Se cortó. Reconectando…');
  programarReintento(1500);
}

function iniciarPing() {
  detenerPing();
  timerPing = setInterval(() => {
    if (!conn || !conn.open) return;
    if (Date.now() - ultimoMensaje > 8000) {
      conexionPerdida();
      return;
    }
    enviar({ tipo: 'ping' });
  }, 2000);
}

function detenerPing() {
  clearInterval(timerPing);
  timerPing = null;
}

function enviar(mensaje) {
  try {
    if (conn && conn.open) {
      conn.send(mensaje);
      return true;
    }
  } catch (e) {
    console.warn('[control] no se pudo enviar', e);
  }
  return false;
}

function recibir(datos) {
  if (!datos || typeof datos !== 'object') return;
  if (datos.tipo === 'ocupado') {
    detenido = true;
    cerrarConexion();
    aplicarEstado('desconectado');
    mostrarConexion('error', 'Ruleta ocupada');
    mostrarAviso('ocupado');
    return;
  }
  if (datos.tipo !== 'estado') return;
  if (datos.titulo) {
    el.titulo.textContent = datos.titulo;
    document.title = `Control · ${datos.titulo.replace(/[¡!]/g, '').trim()}`;
  }
  aplicarEstado(datos.estado, datos.resultado);
}

/** "Salir": la TV vuelve al QR y este celular deja de reconectarse solo. */
function salir() {
  detenido = true;
  clearTimeout(timerReintento);
  enviar({ tipo: 'salir' });
  const c = conn;
  conn = null;
  detenerPing();
  setTimeout(() => { try { if (c) c.close(); } catch { /* nada */ } }, 400); // deja salir el mensaje
  aplicarEstado('desconectado');
  mostrarConexion('error', 'Desconectado');
  mostrarAviso('afuera');
  vibrar(20);
}

/* ---------- Pantalla siempre encendida ---------- */

async function mantenerPantallaEncendida() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      await navigator.wakeLock.request('screen');
    }
  } catch { /* no soportado: no pasa nada */ }
}

/* ---------- Eventos ---------- */

el.botonGirar.addEventListener('click', () => {
  if (estadoRuleta !== 'listo') return;
  if (enviar({ tipo: 'girar' })) {
    vibrar(40);
    aplicarEstado('girando'); // la TV confirma (o corrige) enseguida
  }
  mantenerPantallaEncendida();
});

el.botonContinuar.addEventListener('click', () => {
  if (enviar({ tipo: 'continuar' })) {
    vibrar(20);
    el.resultado.hidden = true;
  }
});

el.botonSalir.addEventListener('click', salir);
el.botonSalirResultado.addEventListener('click', salir);

el.avisoBoton.addEventListener('click', () => {
  detenido = false;
  mostrarVista('control');
  aplicarEstado('desconectado');
  conectar();
  mantenerPantallaEncendida();
});

el.formCodigo.addEventListener('submit', (e) => {
  e.preventDefault();
  const nuevo = limpiarCodigo(el.inputCodigo.value);
  if (nuevo.length !== 6) {
    el.inputCodigo.focus();
    return;
  }
  codigo = nuevo;
  const url = new URL(location.href);
  url.searchParams.set('sala', codigo);
  history.replaceState(null, '', url);
  mostrarVista('control');
  conectar();
  mantenerPantallaEncendida();
});

// Bloqueo de pantalla o cambio de app: se avisa a la TV para que espere un poco más.
// Al volver, se reconecta si hace falta.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    enviar({ tipo: 'pausa' });
    return;
  }
  if (!codigo || detenido) return;
  mantenerPantallaEncendida();
  if (conn && conn.open && Date.now() - ultimoMensaje < 8000) {
    enviar({ tipo: 'ping' });
  } else {
    cerrarConexion();
    conectar();
  }
});

// Cerrar la pestaña o salir de la página cuenta como "Salir": se avisa y se corta la conexión.
// Si el aviso no llega a salir, la TV igual se da cuenta a los pocos segundos porque dejan de llegar los "ping".
window.addEventListener('pagehide', () => {
  enviar({ tipo: 'salir' });
  const c = conn;
  conn = null;
  detenerPing();
  try { if (c) c.close(); } catch { /* nada */ }
});

// Si el navegador restaura la página desde su caché (botón "atrás"), se vuelve a conectar
window.addEventListener('pageshow', (e) => {
  if (e.persisted && codigo && !detenido) {
    cerrarConexion();
    conectar();
  }
});

/* ---------- Arranque ---------- */

aplicarEstado('desconectado');
if (codigo.length === 6) {
  mostrarVista('control');
  conectar();
  mantenerPantallaEncendida();
} else {
  mostrarVista('codigo');
  mostrarConexion('error', 'Falta el código de la sala');
  el.inputCodigo.focus();
}
