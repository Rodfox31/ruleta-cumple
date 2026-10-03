/* =========================================================
   RULETA DEL CUMPLE — control desde el celular
   Se conecta a la TV a través del broker de mensajería (ver mensajeria.js)
   usando el código de la sala (control.html?sala=<código>&b=<broker>)
   y manda "girar", "continuar" y "salir".
   ========================================================= */
'use strict';

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
  try {
    let id = sessionStorage.getItem('ruleta.cliente');
    if (!id) {
      id = idAleatorio(12);
      sessionStorage.setItem('ruleta.cliente', id);
    }
    return id;
  } catch (e) {
    return idAleatorio(12);
  }
}

const parametros = new URLSearchParams(location.search);
let codigo = limpiarCodigo(parametros.get('sala'));
const broker = Math.min(BROKERS.length - 1, Math.max(0, parseInt(parametros.get('b'), 10) || 0));
const cliente = idCliente();

let canal = null;
let temas = null;
let idConexion = null;             // cambia en cada conexión al broker (va en el aviso de salida automático)
let sesionTV = null;               // sesión de la TV que vimos por última vez
let tvPrendida = false;
let presentado = false;            // la TV ya nos respondió
let estadoRuleta = 'desconectado'; // 'desconectado' | 'listo' | 'girando' | 'resultado'
let detenido = false;              // después de "Salir" o de "ocupada" no se reconecta solo
let timerHola = null;
let timerBusqueda = null;

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

function conectar() {
  if (!codigo || detenido) return;
  if (canal) {
    canal.reconectarYa();
    return;
  }
  temas = temasDeSala(codigo);
  mostrarConexion('conectando', 'Conectando…');

  const c = new Canal({
    url: BROKERS[broker],
    keepalive: 10,
    // Si este celular cierra la página o se queda sin señal, el broker le avisa a la TV
    ultimoDeseo: () => {
      idConexion = idAleatorio(8);
      return { tema: temas.control, mensaje: JSON.stringify({ tipo: 'salir', cliente, conexion: idConexion }) };
    },
    alConectar: () => {
      if (canal !== c) return;
      presentado = false;
      sesionTV = null;
      tvPrendida = false;
      c.suscribir(temas.presencia);
      c.suscribir(temas.tv);
      mostrarConexion('conectando', 'Buscando la ruleta…');
      clearTimeout(timerBusqueda);
      timerBusqueda = setTimeout(() => {
        if (canal === c && !tvPrendida) mostrarConexion('error', 'No encuentro la ruleta. ¿Está abierta en la TV?');
      }, 5000);
    },
    alDesconectar: () => {
      if (canal !== c) return;
      presentado = false;
      clearInterval(timerHola);
      aplicarEstado('desconectado');
      mostrarConexion('error', 'Sin conexión. Reintentando…');
    },
    alMensaje: (tema, texto) => {
      if (canal === c) recibir(tema, texto);
    },
  });
  canal = c;
}

/** Deja de usar el canal actual. `prolijo` = despedirse (la TV no recibe el "salir" automático). */
function soltarCanal(prolijo) {
  clearInterval(timerHola);
  clearTimeout(timerBusqueda);
  if (canal) canal.cerrar({ prolijo });
  canal = null;
  presentado = false;
}

function enviar(tipo) {
  if (!canal || !presentado) return false;
  return canal.publicar(temas.control, JSON.stringify({ tipo, cliente, conexion: idConexion }));
}

/** Le avisa a la TV que este celular quiere el control (insiste hasta que conteste). */
function presentarse() {
  clearInterval(timerHola);
  const hola = () => {
    if (presentado || !tvPrendida || detenido || !canal) {
      clearInterval(timerHola);
      return;
    }
    canal.publicar(temas.control, JSON.stringify({ tipo: 'hola', cliente, conexion: idConexion }));
  };
  mostrarConexion('conectando', 'Conectando con la ruleta…');
  hola();
  timerHola = setInterval(() => {
    hola();
    if (!presentado && tvPrendida) mostrarConexion('conectando', 'Esperando respuesta de la TV…');
  }, 4000);
}

function recibir(tema, texto) {
  let datos;
  try { datos = JSON.parse(texto); } catch (e) { return; }
  if (!datos) return;

  if (tema === temas.presencia) {
    tvPrendida = datos.online === true;
    if (!tvPrendida) {
      presentado = false;
      clearInterval(timerHola);
      aplicarEstado('desconectado');
      mostrarConexion('error', 'La ruleta de la TV está cerrada. Esperando a que vuelva…');
    } else if (datos.sesion !== sesionTV) {
      // TV nueva o reconectada: hay que presentarse otra vez
      sesionTV = datos.sesion;
      presentado = false;
      presentarse();
    }
    return;
  }

  if (tema !== temas.tv || datos.para !== cliente) return;

  if (datos.tipo === 'ocupado') {
    detenido = true;
    soltarCanal(true);
    aplicarEstado('desconectado');
    mostrarConexion('error', 'Ruleta ocupada');
    mostrarAviso('ocupado');
  } else if (datos.tipo === 'liberado') {
    // La TV nos soltó sin que lo pidiéramos (por ejemplo, un aviso viejo): volvemos a entrar
    if (!detenido) {
      presentado = false;
      presentarse();
    }
  } else if (datos.tipo === 'estado') {
    presentado = true;
    clearInterval(timerHola);
    mostrarConexion('ok', 'Conectado a la ruleta');
    if (datos.titulo) {
      el.titulo.textContent = datos.titulo;
      document.title = `Control · ${datos.titulo.replace(/[¡!]/g, '').trim()}`;
    }
    aplicarEstado(datos.estado, datos.resultado);
  }
}

/** "Salir": la TV vuelve al QR y este celular deja de reconectarse solo. */
function salir() {
  enviar('salir');
  detenido = true;
  soltarCanal(true);
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
  } catch (e) { /* no soportado: no pasa nada */ }
}

/* ---------- Eventos ---------- */

el.botonGirar.addEventListener('click', () => {
  if (estadoRuleta !== 'listo') return;
  if (enviar('girar')) {
    vibrar(40);
    aplicarEstado('girando'); // la TV confirma (o corrige) enseguida
  }
  mantenerPantallaEncendida();
});

el.botonContinuar.addEventListener('click', () => {
  if (enviar('continuar')) {
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

// Al volver a la pestaña (o desbloquear el celu), se reconecta si la conexión se murió
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !codigo || detenido) return;
  mantenerPantallaEncendida();
  conectar();
});

// Cerrar la página cuenta como "Salir": se corta de golpe y el broker le avisa a la TV
window.addEventListener('pagehide', () => {
  if (canal) soltarCanal(false);
});

// Si el navegador restaura la página desde su caché (botón "atrás"), se vuelve a conectar
window.addEventListener('pageshow', (e) => {
  if (e.persisted && codigo && !detenido) conectar();
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
