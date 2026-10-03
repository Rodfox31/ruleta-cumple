/* =========================================================
   RULETA DEL CUMPLE — pantalla de la TV

   Tres estados:
     1. QR       → espera a que un celular abra el control.
     2. Ruleta   → la rueda y el historial; se gira desde el celular.
     3. Resultado→ tarjeta con los puntos; se cierra con "Continuar" en el celular.
   Si el celular toca "Salir" o cierra la página, vuelve al estado 1.
   ========================================================= */
'use strict';

/* ---------------------------------------------------------
   ✏️ PERSONALIZÁ ACÁ
   --------------------------------------------------------- */

// Título que se ve en la TV y en el celular.
const TITULO = '¡Ruleta del Cumple!';

// Palabra que acompaña al número en la tarjeta del resultado.
const UNIDAD = { singular: 'PUNTO', plural: 'PUNTOS' };

/*
  ✏️ SECTORES DE LA RULETA
  Todas las tajadas son del mismo tamaño; lo que cambia es cuántas veces
  aparece cada número en la rueda. Más tajadas = más chances.
  - id:          identificador único (no se muestra).
  - texto:       lo que se lee en la rueda y en grande en la tarjeta.
  - cantidad:    cuántas tajadas tiene ese número en la rueda.
  - color:       color de sus tajadas (hex o hsl). Los colores están elegidos
                 para que dos tajadas vecinas nunca se parezcan; si cambiás
                 las cantidades, el orden cambia y quizás convenga revisarlos.
  - descripcion: frase que aparece debajo del número en la tarjeta.
  - festejo:     'triste' | 'normal' | 'jackpot' (cambia el sonido y el confeti).

  Con estos valores hay 24 tajadas: el 0, 1, 2 y 3 salen 3 de cada 24 veces;
  del 4 al 8, 2 de cada 24; el 9 y el 10, 1 de cada 24.
  El programa reparte las tajadas solo, para que los números iguales queden
  separados.
*/
const SECTORES = [
  { id: 0,  texto: '0',  cantidad: 3, color: '#7B2FF7', festejo: 'triste',  descripcion: '¡Uy! Esta vez no sumás nada.' },
  { id: 1,  texto: '1',  cantidad: 3, color: '#FF2D87', festejo: 'normal',  descripcion: 'Algo es algo… ¡un puntito!' },
  { id: 2,  texto: '2',  cantidad: 3, color: '#C13BF0', festejo: 'normal',  descripcion: 'Poquito, pero cuenta.' },
  { id: 3,  texto: '3',  cantidad: 3, color: '#12B76A', festejo: 'normal',  descripcion: 'Suma, y suma bien.' },
  { id: 4,  texto: '4',  cantidad: 2, color: '#00A6E8', festejo: 'normal',  descripcion: 'Ni mucho ni poco: ¡bien ahí!' },
  { id: 5,  texto: '5',  cantidad: 2, color: '#00B3A4', festejo: 'normal',  descripcion: '¡Mitad de tabla, nada mal!' },
  { id: 6,  texto: '6',  cantidad: 2, color: '#7CB800', festejo: 'normal',  descripcion: '¡Muy buena tirada!' },
  { id: 7,  texto: '7',  cantidad: 2, color: '#E3243B', festejo: 'normal',  descripcion: '¡El número de la suerte!' },
  { id: 8,  texto: '8',  cantidad: 2, color: '#FF7B00', festejo: 'normal',  descripcion: '¡Uf! Eso fue una tirada de lujo.' },
  { id: 9,  texto: '9',  cantidad: 1, color: '#2B50FF', festejo: 'normal',  descripcion: '¡Casi casi el máximo!' },
  { id: 10, texto: '10', cantidad: 1, color: '#FFB800', festejo: 'jackpot', descripcion: '¡El premio mayor de la noche!' },
];

// Duración del giro (milisegundos) y vueltas completas antes de frenar.
const GIRO = { duracionMin: 4500, duracionMax: 6000, vueltasMin: 5, vueltasMax: 7 };

// Volumen general (0 a 1).
const VOLUMEN = 0.8;

/* ---------------------------------------------------------
   Fin de la personalización
   --------------------------------------------------------- */

const $ = (sel) => document.querySelector(sel);

const el = {
  marco: $('#marco'),
  focos: $('#focos'),
  rueda: $('#rueda'),
  flecha: $('#flecha'),
  titulo: $('#titulo'),
  historialLista: $('#historialLista'),
  historialTotal: $('#historialTotal'),
  historialVacio: $('#historialVacio'),
  pantallaQR: $('#pantallaQR'),
  qrTitulo: $('#qrTitulo'),
  qr: $('#qr'),
  codigo: $('#codigo'),
  conexion: $('#conexion'),
  conexionTexto: $('#conexionTexto'),
  avisoLocal: $('#avisoLocal'),
  resultado: $('#resultado'),
  tarjeta: $('#tarjeta'),
  resEtiqueta: $('#resEtiqueta'),
  resNumero: $('#resNumero'),
  resUnidad: $('#resUnidad'),
  resDescripcion: $('#resDescripcion'),
  avisoSonido: $('#avisoSonido'),
  mudo: $('#mudo'),
  confeti: $('#confeti'),
};

/** Número aleatorio en [0, 1) con calidad criptográfica. */
function aleatorio() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] / 4294967296;
}

const normalizar = (grados) => ((grados % 360) + 360) % 360;
const aRad = (grados) => (grados * Math.PI) / 180;

/* =========================================================
   Armado de la rueda: todas las tajadas iguales, con los números
   repetidos repartidos para que no queden pegados.
   Los ángulos se miden en grados, en sentido horario, desde las 12.
   ========================================================= */

function distribuir(sectores) {
  // Cada copia de un número tiene una posición ideal pareja alrededor de la rueda;
  // el desfase (proporción áurea) evita que todos los números arranquen juntos.
  const fichas = [];
  sectores.forEach((s, i) => {
    const desfase = (i * 0.618034) % 1;
    for (let k = 0; k < s.cantidad; k++) fichas.push({ s, pos: (k + desfase) / s.cantidad });
  });
  fichas.sort((a, b) => a.pos - b.pos || a.s.id - b.s.id);
  const orden = fichas.map((f) => f.s);

  // Si quedaron dos iguales pegados, se intercambia uno con otra tajada que no genere otro choque
  const n = orden.length;
  const id = (i) => orden[((i % n) + n) % n].id;
  for (let i = 0; i < n; i++) {
    const sig = (i + 1) % n;
    if (id(i) !== id(sig)) continue;
    for (let j = 2; j < n; j++) {
      const k = (i + j) % n;
      if (id(k) === id(i) || id(k) === id(sig + 1) || id(sig) === id(k - 1) || id(sig) === id(k + 1)) continue;
      [orden[sig], orden[k]] = [orden[k], orden[sig]];
      break;
    }
  }
  return orden;
}

const TAJADAS = (() => {
  const orden = distribuir(SECTORES);
  const ancho = 360 / orden.length;
  return orden.map((s, i) => ({ ...s, inicio: i * ancho, ancho }));
})();

/** Índice de la tajada que contiene un ángulo de la rueda. */
const indiceEn = (anguloRueda) => Math.min(TAJADAS.length - 1, Math.floor(normalizar(anguloRueda) / TAJADAS[0].ancho));

/**
 * Con la rueda rotada `rotacion` grados (horario), qué ángulo de la rueda
 * queda justo debajo de la flecha de arriba.
 */
const anguloBajoFlecha = (rotacion) => normalizar(-rotacion);

/* =========================================================
   Dibujo de la rueda (se dibuja una vez; al girar solo se rota el canvas)
   ========================================================= */

const FUENTE_NUMEROS = '"Luckiest Guy", "Arial Black", sans-serif';

function dibujarRueda() {
  const lado = el.rueda.clientWidth;
  if (!lado) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  el.rueda.width = Math.round(lado * dpr);
  el.rueda.height = Math.round(lado * dpr);

  const ctx = el.rueda.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, lado, lado);

  const c = lado / 2;
  const r = lado / 2;

  // Tajadas
  for (const t of TAJADAS) {
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, r, aRad(t.inicio - 90), aRad(t.inicio + t.ancho - 90));
    ctx.closePath();
    ctx.fillStyle = t.color;
    ctx.fill();
  }

  // Volumen: brillo en el centro y sombra hacia el borde
  const luz = ctx.createRadialGradient(c, c, 0, c, c, r);
  luz.addColorStop(0, 'rgba(255,255,255,0.28)');
  luz.addColorStop(0.45, 'rgba(255,255,255,0.05)');
  luz.addColorStop(0.8, 'rgba(0,0,0,0)');
  luz.addColorStop(1, 'rgba(0,0,0,0.32)');
  ctx.fillStyle = luz;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fill();

  // Líneas divisorias
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = Math.max(2, r * 0.01);
  for (const t of TAJADAS) {
    const a = aRad(t.inicio - 90);
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    ctx.stroke();
  }

  // Números
  for (const t of TAJADAS) dibujarTexto(ctx, c, r, t);

  // Clavijas en cada división (son las que "golpean" la flecha)
  for (const t of TAJADAS) {
    const a = aRad(t.inicio - 90);
    const px = c + Math.cos(a) * r * 0.955;
    const py = c + Math.sin(a) * r * 0.955;
    const radio = r * 0.02;
    const brillo = ctx.createRadialGradient(px - radio * 0.4, py - radio * 0.4, 0, px, py, radio);
    brillo.addColorStop(0, '#ffffff');
    brillo.addColorStop(0.4, '#ffe08a');
    brillo.addColorStop(1, '#b86e00');
    ctx.fillStyle = brillo;
    ctx.beginPath();
    ctx.arc(px, py, radio, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Número derecho (se lee bien cuando la tajada pasa por la flecha), lo más grande que entre. */
function dibujarTexto(ctx, c, r, t) {
  ctx.font = `100px ${FUENTE_NUMEROS}`;
  const k = ctx.measureText(t.texto).width / 100; // ancho del texto por cada px de fuente
  const s = Math.sin(aRad(Math.min(t.ancho, 150) / 2));
  const radio = r * 0.76;
  // El ancho del número tiene que entrar en la tajada a la altura de su borde interno
  const f = Math.min(r * 0.2, (2 * s * radio) / (1.1 * k + 0.72 * s));

  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(aRad(t.inicio + t.ancho / 2));
  ctx.translate(0, -radio);
  ctx.font = `${f}px ${FUENTE_NUMEROS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = f * 0.14;
  ctx.strokeStyle = 'rgba(30,0,60,0.6)';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = f * 0.12;
  ctx.shadowOffsetY = f * 0.04;
  // Luckiest Guy apoya las cifras un poco bajas: se compensa con un pequeño corrimiento
  ctx.strokeText(t.texto, 0, f * 0.06);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(t.texto, 0, f * 0.06);
  ctx.restore();
}

/** Lamparitas alrededor del marco. */
function crearFocos(cantidad = 28) {
  const fragmento = document.createDocumentFragment();
  for (let i = 0; i < cantidad; i++) {
    const a = aRad((360 / cantidad) * i - 90);
    const foco = document.createElement('span');
    foco.className = 'foco';
    foco.style.left = `${50 + Math.cos(a) * 46.6}%`;
    foco.style.top = `${50 + Math.sin(a) * 46.6}%`;
    fragmento.appendChild(foco);
  }
  el.focos.appendChild(fragmento);
}

/* =========================================================
   Sonido (Web Audio API, sin archivos externos)
   ========================================================= */

const sonido = (() => {
  let ctx = null;
  let salida = null;
  let ruido = null;
  let mudo = false;
  let ultimoTic = 0;

  /** Crea o despierta el AudioContext. Los navegadores exigen un clic o una tecla en la TV. */
  function activar() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      const compresor = ctx.createDynamicsCompressor();
      compresor.connect(ctx.destination);
      salida = ctx.createGain();
      salida.gain.value = VOLUMEN;
      salida.connect(compresor);

      // Ruido blanco corto que se reutiliza en cada "tic"
      ruido = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
      const datos = ruido.getChannelData(0);
      for (let i = 0; i < datos.length; i++) datos[i] = Math.random() * 2 - 1;

      ctx.addEventListener('statechange', actualizarAviso);
    }
    if (ctx.state === 'suspended') ctx.resume().then(actualizarAviso).catch(() => {});
    actualizarAviso();
  }

  const activo = () => !!ctx && ctx.state === 'running';
  const disponible = () => activo() && !mudo;

  function actualizarAviso() {
    el.avisoSonido.hidden = activo();
  }

  /** "Tic" mecánico: golpe de ruido filtrado + un clic tonal corto. */
  function tic() {
    if (!disponible()) return;
    const t = ctx.currentTime;
    if (t - ultimoTic < 0.028) return; // a toda velocidad, evita que se empasten
    ultimoTic = t;

    const golpe = ctx.createBufferSource();
    golpe.buffer = ruido;
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.frequency.value = 2200 + Math.random() * 700;
    filtro.Q.value = 1.4;
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.9, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    golpe.connect(filtro).connect(g1).connect(salida);
    golpe.start(t);
    golpe.stop(t + 0.05);

    const clic = ctx.createOscillator();
    clic.type = 'triangle';
    clic.frequency.setValueAtTime(1300, t);
    clic.frequency.exponentialRampToValueAtTime(450, t + 0.03);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.3, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    clic.connect(g2).connect(salida);
    clic.start(t);
    clic.stop(t + 0.05);
  }

  /** Una nota con envolvente suave. */
  function nota(frecuencia, inicio, duracion, { tipo = 'square', volumen = 0.12, vibrato = 0, hasta = null, destino = salida } = {}) {
    const osc = ctx.createOscillator();
    osc.type = tipo;
    osc.frequency.setValueAtTime(frecuencia, inicio);
    if (hasta) osc.frequency.linearRampToValueAtTime(hasta, inicio + duracion);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, inicio);
    env.gain.exponentialRampToValueAtTime(volumen, inicio + 0.02);
    env.gain.setValueAtTime(volumen, inicio + duracion * 0.75);
    env.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);

    if (vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6;
      const profundidad = ctx.createGain();
      profundidad.gain.value = vibrato;
      lfo.connect(profundidad).connect(osc.frequency);
      lfo.start(inicio);
      lfo.stop(inicio + duracion);
    }

    osc.connect(env).connect(destino);
    osc.start(inicio);
    osc.stop(inicio + duracion + 0.05);
  }

  /** Nota "de bronce": cuadrada + triangular superpuestas. */
  function metal(frecuencia, inicio, duracion, vibrato = 0) {
    nota(frecuencia, inicio, duracion, { tipo: 'square', volumen: 0.06, vibrato });
    nota(frecuencia, inicio, duracion, { tipo: 'triangle', volumen: 0.16, vibrato });
  }

  const NOTAS = { G4: 392, C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, E6: 1318.5, G6: 1568 };

  function fanfarria() {
    const t = ctx.currentTime + 0.05;
    const paso = 0.11;
    ['G4', 'C5', 'E5', 'G5'].forEach((n, i) => metal(NOTAS[n], t + i * paso, 0.16));
    metal(NOTAS.E5, t + 4 * paso, 0.1);
    metal(NOTAS.G5, t + 5 * paso, 0.1);
    ['C5', 'E5', 'G5', 'C6'].forEach((n) => metal(NOTAS[n], t + 6 * paso, 1.0, 5));
  }

  function jackpot() {
    const t = ctx.currentTime + 0.05;
    const paso = 0.075;
    ['C5', 'E5', 'G5', 'C6', 'E6', 'G6'].forEach((n, i) => metal(NOTAS[n], t + i * paso, 0.12));
    const t2 = t + 6 * paso + 0.05;
    [0, 0.14, 0.28].forEach((d) => metal(NOTAS.C6, t2 + d, 0.11));
    ['C5', 'E5', 'G5', 'C6', 'E6'].forEach((n) => metal(NOTAS[n], t2 + 0.44, 1.6, 6));
    // Destellos agudos
    for (let i = 0; i < 18; i++) {
      nota(2000 + Math.random() * 2500, t2 + 0.44 + Math.random() * 1.5, 0.12, { tipo: 'sine', volumen: 0.05 });
    }
  }

  /** "Trombón triste" para cuando sale 0. */
  function triste() {
    const t = ctx.currentTime + 0.05;
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 1100;
    filtro.connect(salida);
    const opciones = { tipo: 'sawtooth', volumen: 0.16, destino: filtro };
    nota(293.66, t, 0.38, opciones);
    nota(277.18, t + 0.42, 0.38, opciones);
    nota(261.63, t + 0.84, 0.38, opciones);
    nota(246.94, t + 1.26, 1.3, { ...opciones, vibrato: 7, hasta: 238 });
  }

  function festejo(tipo) {
    if (!disponible()) return;
    if (tipo === 'triste') triste();
    else if (tipo === 'jackpot') jackpot();
    else fanfarria();
  }

  function alternarMudo() {
    mudo = !mudo;
    el.mudo.hidden = !mudo;
  }

  return { activar, tic, festejo, alternarMudo };
})();

/* =========================================================
   Confeti (Canvas)
   ========================================================= */

const confeti = (() => {
  const ctx = el.confeti.getContext('2d');
  let piezas = [];
  let corriendo = false;
  let anterior = 0;
  let ancho = 0;
  let alto = 0;

  function ajustar() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    ancho = window.innerWidth;
    alto = window.innerHeight;
    el.confeti.width = Math.round(ancho * dpr);
    el.confeti.height = Math.round(alto * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function pieza(x, y, vx, vy, colores) {
    const tam = alto / 80;
    return {
      x, y, vx, vy,
      w: tam * (0.6 + aleatorio() * 0.8),
      h: tam * (0.9 + aleatorio() * 1.1),
      giro: aleatorio() * Math.PI * 2,
      velGiro: (aleatorio() - 0.5) * 12,
      volteo: aleatorio() * Math.PI * 2,
      velVolteo: 4 + aleatorio() * 8,
      fase: aleatorio() * Math.PI * 2,
      color: colores[Math.floor(aleatorio() * colores.length)],
      redondo: aleatorio() < 0.25,
    };
  }

  /** Dos cañones desde las esquinas de abajo. */
  function canones(cantidad, colores) {
    for (let i = 0; i < cantidad; i++) {
      const izquierda = i % 2 === 0;
      const angulo = aRad(20 + aleatorio() * 38); // grados desde la vertical, hacia adentro
      const velocidad = alto * (1.5 + aleatorio() * 1.3);
      const vx = Math.sin(angulo) * velocidad * (izquierda ? 1 : -1);
      const vy = -Math.cos(angulo) * velocidad;
      piezas.push(pieza(izquierda ? -10 : ancho + 10, alto + 10, vx, vy, colores));
    }
  }

  /** Lluvia desde arriba (solo en el jackpot). */
  function lluvia(cantidad, colores) {
    for (let i = 0; i < cantidad; i++) {
      piezas.push(pieza(aleatorio() * ancho, -20 - aleatorio() * alto * 0.6, (aleatorio() - 0.5) * 60, alto * 0.1, colores));
    }
  }

  function lanzar(tipo, color) {
    if (tipo === 'triste') return;
    ajustar();
    if (tipo === 'jackpot') {
      const dorados = ['#FFD700', '#FFC300', '#FFF1A8', '#FFFFFF', '#FFB000', '#FF2D87'];
      canones(320, dorados);
      lluvia(260, dorados);
      setTimeout(() => canones(240, dorados), 700);
    } else {
      canones(240, [color, color, '#FF2D87', '#00C2FF', '#FFC83D', '#7CB800', '#FFFFFF', '#C13BF0']);
    }
    if (!corriendo) {
      corriendo = true;
      anterior = performance.now();
      requestAnimationFrame(paso);
    }
  }

  function paso(ahora) {
    const dt = Math.min(0.033, (ahora - anterior) / 1000);
    anterior = ahora;
    const gravedad = alto * 1.2;
    const freno = Math.exp(-2.6 * dt);

    ctx.clearRect(0, 0, ancho, alto);
    const vivas = [];
    for (const p of piezas) {
      p.vx *= freno;
      p.vy = p.vy * freno + gravedad * dt;
      p.x += (p.vx + Math.sin(ahora / 300 + p.fase) * alto * 0.04) * dt;
      p.y += p.vy * dt;
      p.giro += p.velGiro * dt;
      p.volteo += p.velVolteo * dt;
      if (p.y > alto + 40) continue;
      vivas.push(p);

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.giro);
      ctx.scale(1, Math.cos(p.volteo)); // simula el papelito dándose vuelta
      ctx.fillStyle = p.color;
      if (p.redondo) {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }
    piezas = vivas;

    if (piezas.length) {
      requestAnimationFrame(paso);
    } else {
      corriendo = false;
      ctx.clearRect(0, 0, ancho, alto);
    }
  }

  return { lanzar, ajustar };
})();

/* =========================================================
   Historial de lo que salió (queda guardado en el navegador de la TV)
   ========================================================= */

const historial = (() => {
  const CLAVE = 'ruleta.historial';
  const MAXIMO_GUARDADO = 500;
  const MAXIMO_VISIBLE = 30;
  let tiradas = [];

  function cargar() {
    try {
      const datos = JSON.parse(localStorage.getItem(CLAVE) || '[]');
      if (Array.isArray(datos)) tiradas = datos.filter((t) => t && typeof t.texto === 'string');
    } catch { tiradas = []; }
  }

  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(tiradas.slice(-MAXIMO_GUARDADO))); } catch { /* sin almacenamiento */ }
  }

  const hora = (ms) => new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  function item(tirada, numero, nuevo) {
    const li = document.createElement('li');
    li.className = nuevo ? 'historial-item nuevo' : 'historial-item';
    li.style.setProperty('--color', tirada.color);

    const valor = document.createElement('span');
    valor.className = 'historial-numero';
    valor.textContent = tirada.texto;

    const detalle = document.createElement('span');
    detalle.className = 'historial-detalle';
    const puntos = document.createElement('span');
    puntos.className = 'historial-puntos';
    puntos.textContent = unidadPara(tirada.texto);
    const momento = document.createElement('span');
    momento.className = 'historial-hora';
    momento.textContent = hora(tirada.hora);
    detalle.append(puntos, momento);

    const orden = document.createElement('span');
    orden.className = 'historial-orden';
    orden.textContent = `#${numero}`;

    li.append(valor, detalle, orden);
    return li;
  }

  function pintar(conNuevo = false) {
    const total = tiradas.length;
    el.historialTotal.textContent = total === 1 ? '1 tirada' : `${total} tiradas`;
    el.historialVacio.hidden = total > 0;
    const ultimas = tiradas.slice(-MAXIMO_VISIBLE).reverse();
    el.historialLista.replaceChildren(...ultimas.map((t, i) => item(t, total - i, conNuevo && i === 0)));
  }

  function agregar(sector) {
    tiradas.push({ id: sector.id, texto: sector.texto, color: sector.color, hora: Date.now() });
    guardar();
    pintar(true);
  }

  function borrar() {
    tiradas = [];
    guardar();
    pintar();
  }

  return { cargar, pintar, agregar, borrar };
})();

/* =========================================================
   Giro: aceleración corta y frenado largo, con resultado determinista
   ========================================================= */

// Perfil de velocidad: sube lineal hasta ACELERACION (fracción del tiempo)
// y después cae como (1 - u)^FRENADO. La posición es su integral normalizada.
const ACELERACION = 0.1;
const FRENADO = 2.6;
const AREA = ACELERACION / 2 + (1 - ACELERACION) / (FRENADO + 1);

function progreso(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < ACELERACION) return (t * t) / (2 * ACELERACION) / AREA;
  const u = (t - ACELERACION) / (1 - ACELERACION);
  return (ACELERACION / 2 + ((1 - ACELERACION) / (FRENADO + 1)) * (1 - Math.pow(1 - u, FRENADO + 1))) / AREA;
}

let estado = 'qr';     // 'qr' | 'listo' | 'girando' | 'resultado'
let rotacion = 0;      // grados, sentido horario
let animacion = null;
let indiceActual = 0;
let anguloFlecha = 0;
let ultimoFrame = 0;
let bucleActivo = false;
let ultimoResultado = null;
let momentoResultado = 0;

function girar() {
  if (estado !== 'listo') return;

  // 1) Se elige una tajada al azar (todas valen lo mismo) y un punto dentro de ella, lejos de los bordes.
  const elegida = TAJADAS[Math.floor(aleatorio() * TAJADAS.length)];
  const margen = elegida.ancho * 0.15;
  const anguloDestino = elegida.inicio + margen + aleatorio() * (elegida.ancho - 2 * margen);

  // 2) Se calcula la rotación final para que ese punto quede bajo la flecha.
  const vueltas = GIRO.vueltasMin + Math.floor(aleatorio() * (GIRO.vueltasMax - GIRO.vueltasMin + 1));
  const delta = normalizar(-anguloDestino - rotacion);
  const duracion = GIRO.duracionMin + aleatorio() * (GIRO.duracionMax - GIRO.duracionMin);

  const giro = {
    desde: rotacion,
    hasta: rotacion + vueltas * 360 + delta,
    inicio: performance.now(),
    duracion,
    elegida,
  };
  animacion = giro;

  cambiarEstado('girando');
  arrancarBucle();
  // Respaldo: si la pestaña no se está dibujando (minimizada o tapada), igual termina a tiempo
  setTimeout(() => { if (animacion === giro) terminarGiro(); }, duracion + 250);
}

function arrancarBucle() {
  if (bucleActivo) return;
  bucleActivo = true;
  ultimoFrame = performance.now();
  requestAnimationFrame(cuadro);
}

function cuadro(ahora) {
  const dt = Math.min(50, ahora - ultimoFrame);
  ultimoFrame = ahora;

  if (animacion) {
    const t = (ahora - animacion.inicio) / animacion.duracion;
    rotacion = animacion.desde + (animacion.hasta - animacion.desde) * progreso(t);
    el.rueda.style.transform = `rotate(${rotacion}deg)`;

    // "Tic" cada vez que la flecha cambia de tajada
    const indice = indiceEn(anguloBajoFlecha(rotacion));
    if (indice !== indiceActual) {
      indiceActual = indice;
      sonido.tic();
      anguloFlecha = Math.min(anguloFlecha, -20); // la clavija empuja la flecha
    }
    if (t >= 1) terminarGiro();
  }

  // La flecha vuelve a su lugar como un resorte
  anguloFlecha *= Math.exp(-dt / 70);
  el.flecha.style.transform = `rotate(${anguloFlecha}deg)`;

  if (animacion || Math.abs(anguloFlecha) > 0.05) {
    requestAnimationFrame(cuadro);
  } else {
    bucleActivo = false;
    anguloFlecha = 0;
    el.flecha.style.transform = '';
  }
}

function terminarGiro() {
  const { elegida, hasta } = animacion;
  animacion = null;
  rotacion = normalizar(hasta);
  el.rueda.style.transform = `rotate(${rotacion}deg)`;
  indiceActual = indiceEn(anguloBajoFlecha(rotacion));

  // El resultado se lee del ángulo final: siempre coincide con la flecha.
  const ganadora = TAJADAS[indiceActual];
  if (ganadora !== elegida) console.warn('[ruleta] desfase entre sorteo y ángulo', elegida, ganadora);

  historial.agregar(ganadora);
  // Si el celular salió mientras giraba, se anota en el historial pero no se muestra la tarjeta
  if (estado === 'girando') mostrarResultado(ganadora);
}

/* =========================================================
   Estados de la pantalla
   ========================================================= */

const ETIQUETAS = { triste: '¡Ay, no!', normal: '¡Salió!', jackpot: '★ ¡JACKPOT! ★' };

function unidadPara(texto) {
  return Number(texto) === 1 ? UNIDAD.singular : UNIDAD.plural;
}

function cambiarEstado(nuevo) {
  estado = nuevo;
  el.pantallaQR.hidden = nuevo !== 'qr';
  el.resultado.hidden = nuevo !== 'resultado';
  el.marco.classList.toggle('girando', nuevo === 'girando');
  el.marco.classList.toggle('festejo', nuevo === 'resultado');
  conexion.enviarAlControl(mensajeEstado());
}

function mostrarResultado(t) {
  ultimoResultado = t;
  momentoResultado = performance.now();

  el.resEtiqueta.textContent = ETIQUETAS[t.festejo] || ETIQUETAS.normal;
  el.resNumero.textContent = t.texto;
  el.resUnidad.textContent = unidadPara(t.texto);
  el.resDescripcion.textContent = t.descripcion;
  el.tarjeta.style.setProperty('--color', t.color);
  el.resultado.classList.remove('resultado--triste', 'resultado--jackpot');
  if (t.festejo === 'triste' || t.festejo === 'jackpot') el.resultado.classList.add(`resultado--${t.festejo}`);

  cambiarEstado('resultado');
  sonido.festejo(t.festejo);
  confeti.lanzar(t.festejo, t.color);
}

function cerrarResultado() {
  if (estado !== 'resultado') return;
  if (performance.now() - momentoResultado < 700) return; // evita cerrar sin querer
  cambiarEstado('listo');
}

/** Estado 1 → 2: un celular tomó el control. */
function entrarAlJuego() {
  if (estado === 'qr') cambiarEstado(animacion ? 'girando' : 'listo');
}

/** Cualquier estado → 1: el celular salió o se desconectó. */
function volverAlQR() {
  cambiarEstado('qr');
}

/** Lo que se le manda al celular para que muestre lo mismo que la TV. */
function mensajeEstado() {
  const r = estado === 'resultado' ? ultimoResultado : null;
  return {
    tipo: 'estado',
    estado: estado === 'qr' ? 'listo' : estado,
    titulo: TITULO,
    resultado: r && {
      texto: r.texto,
      unidad: unidadPara(r.texto),
      descripcion: r.descripcion,
      color: r.color,
      festejo: r.festejo,
      etiqueta: ETIQUETAS[r.festejo] || ETIQUETAS.normal,
    },
  };
}

/* =========================================================
   Pantalla completa, sonido y pantalla siempre encendida
   ========================================================= */

async function mantenerPantallaEncendida() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      await navigator.wakeLock.request('screen');
    }
  } catch { /* no soportado o sin permiso: no pasa nada */ }
}

function alternarPantallaCompleta() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

/** Primer clic o tecla en la TV: habilita el sonido (los navegadores lo exigen) y la pantalla completa. */
let yaActivado = false;
function activarTV() {
  sonido.activar();
  mantenerPantallaEncendida();
  if (!yaActivado) {
    yaActivado = true;
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }
}

/* =========================================================
   Conexión con el celular (PeerJS / WebRTC)
   La TV se registra con un ID fijo (ruletacumple-<código>) y el celular
   se conecta a ese ID. El QR lleva a control.html?sala=<código>.
   Solo un celular controla a la vez; si entra otro, se le avisa que está ocupada.
   ========================================================= */

const conexion = (() => {
  const PREFIJO = 'ruletacumple-';
  const CLAVE_SALA = 'ruleta.sala';
  const GRACIA_NORMAL = 6000;   // el celular avisa cada 2 s; sin noticias por 6 s → se lo da por ido
  const GRACIA_PAUSA = 15000;   // si avisó que se bloqueó o cambió de app, se espera un poco más
                                // (cuando vuelve, se reconecta solo y la TV regresa a la ruleta)
  const pendientes = new Set(); // conexiones que todavía no se presentaron
  let control = null;           // { conn, cliente, ultimoContacto, gracia }
  let peer = null;
  let codigo = null;
  let intentosId = 0;
  let reintento = null;

  function nuevoCodigo() {
    const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += abc[Math.floor(aleatorio() * abc.length)];
    try { localStorage.setItem(CLAVE_SALA, s); } catch { /* sin almacenamiento */ }
    return s;
  }

  /** Se reutiliza el código guardado para que el celular se reconecte si se recarga la TV. */
  function codigoGuardado() {
    let s = null;
    try { s = localStorage.getItem(CLAVE_SALA); } catch { /* sin almacenamiento */ }
    return s && /^[a-z0-9]{6}$/.test(s) ? s : nuevoCodigo();
  }

  function urlControl() {
    const url = new URL('control.html', location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('sala', codigo);
    return url.href;
  }

  function mostrar(estadoConexion, texto) {
    el.conexion.dataset.estado = estadoConexion;
    el.conexionTexto.textContent = texto;
  }

  function pintarQR() {
    el.codigo.textContent = codigo ? codigo.toUpperCase() : '—';
    if (!codigo || typeof qrcode === 'undefined') {
      el.qr.hidden = true;
      return;
    }
    el.qr.hidden = false;
    const qr = qrcode(0, 'M');
    qr.addData(urlControl());
    qr.make();

    const modulos = qr.getModuleCount();
    const borde = 2;
    const total = modulos + borde * 2;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const porModulo = Math.max(2, Math.floor((el.qr.clientWidth * dpr) / total));
    el.qr.width = el.qr.height = porModulo * total;

    const ctx = el.qr.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, el.qr.width, el.qr.height);
    ctx.fillStyle = '#1b0640';
    for (let fila = 0; fila < modulos; fila++) {
      for (let col = 0; col < modulos; col++) {
        if (qr.isDark(fila, col)) ctx.fillRect((col + borde) * porModulo, (fila + borde) * porModulo, porModulo, porModulo);
      }
    }
  }

  function programar(fn, ms) {
    clearTimeout(reintento);
    reintento = setTimeout(fn, ms);
  }

  function crearPeer() {
    clearTimeout(reintento);
    if (peer && !peer.destroyed) peer.destroy();
    pendientes.clear();
    if (control) soltarControl();
    mostrar('conectando', 'Conectando…');

    const p = new Peer(PREFIJO + codigo, { debug: 1 });
    peer = p;

    p.on('open', () => {
      if (p !== peer) return;
      intentosId = 0;
      mostrar('ok', 'Listo: esperando un celular');
    });

    p.on('connection', aceptar);

    // Se cortó el servidor de señalización (un celular ya conectado sigue andando)
    p.on('disconnected', () => {
      if (p !== peer || p.destroyed) return;
      mostrar('conectando', 'Reconectando…');
      programar(() => {
        if (p !== peer || p.destroyed || !p.disconnected) return;
        try { p.reconnect(); } catch { crearPeer(); }
      }, 2000);
    });

    p.on('error', (err) => {
      if (p !== peer) return;
      console.warn('[ruleta] PeerJS:', err.type, err);
      if (err.type === 'unavailable-id') {
        // El ID todavía figura ocupado (pasa al recargar la página): se reintenta y luego se cambia.
        intentosId++;
        if (intentosId > 4) {
          intentosId = 0;
          codigo = nuevoCodigo();
          pintarQR();
        }
        mostrar('conectando', 'Reservando el código…');
        programar(crearPeer, 3000);
      } else if (['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible'].includes(err.type)) {
        mostrar('error', 'Sin conexión a internet. Reintentando…');
        programar(crearPeer, 4000);
      }
    });
  }

  function aceptar(conn) {
    conn.abiertaEn = Date.now();
    conn.on('open', () => pendientes.add(conn));
    conn.on('data', (datos) => recibir(datos, conn));
    const perdida = () => {
      pendientes.delete(conn);
      if (control && control.conn === conn) soltarControl();
    };
    conn.on('close', perdida);
    conn.on('error', perdida);
  }

  /** El celular se presenta con un id propio; así, si recarga la página, recupera el control. */
  function presentar(conn, cliente) {
    pendientes.delete(conn);
    if (control && control.cliente !== cliente) {
      enviar(conn, { tipo: 'ocupado' });
      setTimeout(() => cerrar(conn), 800);
      return;
    }
    const anterior = control && control.conn;
    control = { conn, cliente, ultimoContacto: Date.now(), gracia: GRACIA_NORMAL };
    if (anterior && anterior !== conn) cerrar(anterior);
    entrarAlJuego();
    enviar(conn, mensajeEstado());
  }

  function soltarControl() {
    const c = control && control.conn;
    control = null;
    if (c) cerrar(c);
    volverAlQR();
  }

  function recibir(datos, conn) {
    if (!datos || typeof datos !== 'object') return;
    if (datos.tipo === 'hola') {
      presentar(conn, String(datos.cliente || conn.peer));
      return;
    }
    if (!control || control.conn !== conn) return; // solo manda el celular que tiene el control

    control.ultimoContacto = Date.now();
    switch (datos.tipo) {
      case 'ping':
        control.gracia = GRACIA_NORMAL;
        enviar(conn, { tipo: 'pong' });
        return;
      case 'pausa':
        control.gracia = GRACIA_PAUSA;
        return;
      case 'salir':
        soltarControl();
        return;
      case 'girar':
        girar();
        break;
      case 'continuar':
        cerrarResultado();
        break;
      default:
        break;
    }
    // Siempre se le confirma el estado real
    enviar(conn, mensajeEstado());
  }

  function enviar(conn, mensaje) {
    try {
      if (conn.open) conn.send(mensaje);
    } catch (e) {
      console.warn('[ruleta] no se pudo enviar', e);
    }
  }

  function cerrar(conn) {
    try { conn.close(); } catch { /* ya estaba cerrada */ }
  }

  function enviarAlControl(mensaje) {
    if (control) enviar(control.conn, mensaje);
  }

  // Vigilancia: si el celular dejó de hablar (por ejemplo, se cerró la página), la TV vuelve al QR
  setInterval(() => {
    const ahora = Date.now();
    if (control && ahora - control.ultimoContacto > control.gracia) soltarControl();
    for (const c of pendientes) {
      if (ahora - c.abiertaEn > 10000) {
        pendientes.delete(c);
        cerrar(c);
      }
    }
  }, 1000);

  function iniciar() {
    if (location.protocol === 'file:') el.avisoLocal.hidden = false;
    codigo = codigoGuardado();
    pintarQR();
    if (typeof Peer === 'undefined') {
      mostrar('error', 'Sin internet: no se puede conectar el celular');
      return;
    }
    crearPeer();
  }

  return { iniciar, enviarAlControl, pintarQR };
})();

/* =========================================================
   Eventos de la TV (el juego se maneja desde el celular)
   ========================================================= */

document.addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  activarTV();
  const tecla = e.key.toLowerCase();
  if (tecla === 'f') {
    alternarPantallaCompleta();
  } else if (tecla === 'm') {
    sonido.alternarMudo();
  } else if (tecla === 'r') {
    if (confirm('¿Borrar todo el historial de tiradas?')) historial.borrar();
  }
});

document.addEventListener('pointerdown', activarTV);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && yaActivado) mantenerPantallaEncendida();
});

let esperaRedimension = null;
window.addEventListener('resize', () => {
  clearTimeout(esperaRedimension);
  esperaRedimension = setTimeout(() => {
    dibujarRueda();
    conexion.pintarQR();
    confeti.ajustar();
  }, 150);
});

/* =========================================================
   Arranque
   ========================================================= */

function arrancar() {
  document.title = TITULO.replace(/[¡!]/g, '').trim();
  el.titulo.textContent = TITULO;
  el.qrTitulo.textContent = TITULO;

  crearFocos();
  // Arranca con la flecha en el medio de la primera tajada
  rotacion = -(TAJADAS[0].inicio + TAJADAS[0].ancho / 2);
  indiceActual = indiceEn(anguloBajoFlecha(rotacion));
  el.rueda.style.transform = `rotate(${rotacion}deg)`;

  dibujarRueda();
  // Cuando llega la tipografía de los números, se redibuja con ella
  if (document.fonts && document.fonts.load) {
    document.fonts.load(`100px ${FUENTE_NUMEROS}`).then(dibujarRueda).catch(() => {});
  }

  historial.cargar();
  historial.pintar();
  confeti.ajustar();
  cambiarEstado('qr');
  conexion.iniciar();
}

arrancar();
