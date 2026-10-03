/* =========================================================
   RULETA DEL CUMPLE — control desde el celular
   Se conecta a la TV por PeerJS usando el código de la sala
   (control.html?sala=<código>) y manda "girar" / "continuar".
   ========================================================= */
'use strict';

const PREFIJO = 'ruletacumple-';

const $ = (sel) => document.querySelector(sel);

const el = {
  titulo: $('#titulo'),
  estado: $('#estado'),
  estadoTexto: $('#estadoTexto'),
  vistaControl: $('#vistaControl'),
  vistaCodigo: $('#vistaCodigo'),
  indicacion: $('#indicacion'),
  botonGirar: $('#botonGirar'),
  botonTexto: $('#botonTexto'),
  codigoActual: $('#codigoActual'),
  cambiarSala: $('#cambiarSala'),
  formCodigo: $('#formCodigo'),
  inputCodigo: $('#inputCodigo'),
  resultado: $('#resultado'),
  tarjeta: $('#tarjeta'),
  resEtiqueta: $('#resEtiqueta'),
  resNumero: $('#resNumero'),
  resUnidad: $('#resUnidad'),
  resDescripcion: $('#resDescripcion'),
  botonContinuar: $('#botonContinuar'),
};

const limpiarCodigo = (texto) => (texto || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);

let codigo = limpiarCodigo(new URLSearchParams(location.search).get('sala'));
let peer = null;
let conn = null;
let estadoRuleta = 'desconectado'; // 'desconectado' | 'listo' | 'girando' | 'resultado'
let ultimoMensaje = 0;
let timerPing = null;
let timerReintento = null;
let timerApertura = null;

/* ---------- Interfaz ---------- */

function mostrarConexion(estado, texto) {
  el.estado.dataset.estado = estado;
  el.estadoTexto.textContent = texto;
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

function mostrarVistaCodigo() {
  el.vistaControl.hidden = true;
  el.vistaCodigo.hidden = false;
  el.inputCodigo.value = codigo.toUpperCase();
  el.inputCodigo.focus();
  mostrarConexion('error', 'Falta el código de la sala');
}

function mostrarVistaControl() {
  el.vistaCodigo.hidden = true;
  el.vistaControl.hidden = false;
  el.codigoActual.textContent = codigo.toUpperCase();
}

/* ---------- Conexión ---------- */

function programarReintento(ms) {
  clearTimeout(timerReintento);
  timerReintento = setTimeout(conectar, ms);
}

function conectar() {
  clearTimeout(timerReintento);
  if (!codigo) return;
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
    if (p === peer) abrirConexion();
  });

  p.on('error', (err) => {
    if (p !== peer) return;
    console.warn('[control] PeerJS:', err.type, err);
    if (err.type === 'peer-unavailable') {
      mostrarConexion('error', 'No encuentro la ruleta. ¿Está abierta en la TV?');
      programarReintento(3000);
    } else {
      mostrarConexion('error', 'Problema de conexión. Reintentando…');
      programarReintento(3000);
    }
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
      conn = null;
      try { c.close(); } catch { /* nada */ }
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
    enviar({ tipo: 'hola' });
  });

  c.on('data', (datos) => {
    if (conn !== c) return;
    ultimoMensaje = Date.now();
    recibir(datos);
  });

  c.on('close', () => { if (conn === c) conexionPerdida(); });
  c.on('error', () => { if (conn === c) conexionPerdida(); });
}

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
  aplicarEstado('desconectado');
  mostrarConexion('error', 'Se cortó. Reconectando…');
  programarReintento(1500);
}

function iniciarPing() {
  detenerPing();
  timerPing = setInterval(() => {
    if (!conn || !conn.open) return;
    if (Date.now() - ultimoMensaje > 12000) {
      conexionPerdida();
      return;
    }
    enviar({ tipo: 'ping' });
  }, 4000);
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
  if (!datos || datos.tipo !== 'estado') return;
  if (datos.titulo) {
    el.titulo.textContent = datos.titulo;
    document.title = `Control · ${datos.titulo.replace(/[¡!]/g, '').trim()}`;
  }
  aplicarEstado(datos.estado, datos.resultado);
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

el.cambiarSala.addEventListener('click', () => {
  cerrarConexion();
  clearTimeout(timerReintento);
  aplicarEstado('desconectado');
  mostrarVistaCodigo();
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
  mostrarVistaControl();
  conectar();
  mantenerPantallaEncendida();
});

// Al volver a la pestaña (o desbloquear el celu), se reconecta si hace falta
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !codigo) return;
  mantenerPantallaEncendida();
  if (!conn || !conn.open || Date.now() - ultimoMensaje > 12000) {
    cerrarConexion();
    conectar();
  }
});

/* ---------- Arranque ---------- */

aplicarEstado('desconectado');
if (codigo.length === 6) {
  mostrarVistaControl();
  conectar();
  mantenerPantallaEncendida();
} else {
  mostrarVistaCodigo();
}
