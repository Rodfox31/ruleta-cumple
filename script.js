/* =========================================================
   RULETA DEL CUMPLE — pantalla de la TV
   Dibujo en Canvas, física de giro, sonidos con Web Audio API,
   confeti y conexión con el celular (PeerJS).
   ========================================================= */
'use strict';

/* ---------------------------------------------------------
   ✏️ PERSONALIZÁ ACÁ
   --------------------------------------------------------- */

// Título que se ve en la TV y en el celular.
const TITULO = '¡Ruleta del Cumple!';
// Línea chica debajo del título (dejala vacía '' para ocultarla).
const SUBTITULO = 'Cada tirada suma puntos';

// Palabra que acompaña al número en la tarjeta del resultado.
const UNIDAD = { singular: 'PUNTO', plural: 'PUNTOS' };

/*
  ✏️ SECTORES DE LA RULETA
  - El orden del array es el orden en la rueda, en sentido horario.
    Está mezclado a propósito: el 10 (la tajada más finita) queda
    entre el 0 y el 1, que son las más grandes. ¡Mucho "casi"!
  - id:          identificador único (no se muestra).
  - texto:       lo que se lee en la rueda y en grande en la tarjeta.
  - color:       color de la tajada (hex o hsl).
  - descripcion: frase que aparece debajo del número en la tarjeta.
  - chances:     peso del sector. El tamaño de la tajada es proporcional:
                 el 0 (11 chances) ocupa 11 veces más que el 10 (1 chance).
                 Total actual: 66 → el 0 sale 1 de cada 6 veces y el 10, 1 de cada 66.
  - festejo:     'triste' | 'normal' | 'jackpot' (cambia el sonido y el confeti).
*/
const SECTORES = [
  { id: 0,  texto: '0',  color: '#7B2FF7', chances: 11, festejo: 'triste',  descripcion: '¡Uy! Esta vez no sumás nada.' },
  { id: 10, texto: '10', color: '#FFB800', chances: 1,  festejo: 'jackpot', descripcion: '¡El premio mayor de la noche!' },
  { id: 1,  texto: '1',  color: '#FF2D87', chances: 10, festejo: 'normal',  descripcion: 'Algo es algo… ¡un puntito!' },
  { id: 6,  texto: '6',  color: '#00A6E8', chances: 5,  festejo: 'normal',  descripcion: '¡Muy buena tirada!' },
  { id: 3,  texto: '3',  color: '#FF7B00', chances: 8,  festejo: 'normal',  descripcion: 'Suma, y suma bien.' },
  { id: 8,  texto: '8',  color: '#2B50FF', chances: 3,  festejo: 'normal',  descripcion: '¡Uf! Eso fue una tirada de lujo.' },
  { id: 2,  texto: '2',  color: '#12B76A', chances: 9,  festejo: 'normal',  descripcion: 'Poquito, pero cuenta.' },
  { id: 7,  texto: '7',  color: '#E3243B', chances: 4,  festejo: 'normal',  descripcion: '¡El número de la suerte!' },
  { id: 4,  texto: '4',  color: '#00B3A4', chances: 7,  festejo: 'normal',  descripcion: 'Ni mucho ni poco: ¡bien ahí!' },
  { id: 9,  texto: '9',  color: '#C13BF0', chances: 2,  festejo: 'normal',  descripcion: '¡Casi casi el máximo!' },
  { id: 5,  texto: '5',  color: '#6FB800', chances: 6,  festejo: 'normal',  descripcion: '¡Mitad de tabla, nada mal!' },
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
  centro: $('#centro'),
  flecha: $('#flecha'),
  titulo: $('#titulo'),
  subtitulo: $('#subtitulo'),
  qr: $('#qr'),
  codigo: $('#codigo'),
  conexion: $('#conexion'),
  conexionTexto: $('#conexionTexto'),
  avisoLocal: $('#avisoLocal'),
  botonGirar: $('#botonGirar'),
  resultado: $('#resultado'),
  tarjeta: $('#tarjeta'),
  resEtiqueta: $('#resEtiqueta'),
  resNumero: $('#resNumero'),
  resUnidad: $('#resUnidad'),
  resDescripcion: $('#resDescripcion'),
  botonContinuar: $('#botonContinuar'),
  inicio: $('#inicio'),
  inicioTitulo: $('#inicioTitulo'),
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
   Geometría: cada sector ocupa un ángulo proporcional a sus chances.
   Los ángulos de la rueda se miden en grados, en sentido horario,
   desde las 12 en punto.
   ========================================================= */

const TOTAL_CHANCES = SECTORES.reduce((suma, s) => suma + s.chances, 0);

const GEOMETRIA = (() => {
  let acumulado = 0;
  return SECTORES.map((s) => {
    const ancho = (s.chances / TOTAL_CHANCES) * 360;
    const g = { ...s, inicio: acumulado, ancho };
    acumulado += ancho;
    return g;
  });
})();

/** Índice del sector que contiene un ángulo de la rueda. */
function indiceEn(anguloRueda) {
  const a = normalizar(anguloRueda);
  for (let i = 0; i < GEOMETRIA.length; i++) {
    if (a < GEOMETRIA[i].inicio + GEOMETRIA[i].ancho) return i;
  }
  return GEOMETRIA.length - 1;
}

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
  for (const g of GEOMETRIA) {
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, r, aRad(g.inicio - 90), aRad(g.inicio + g.ancho - 90));
    ctx.closePath();
    ctx.fillStyle = g.color;
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
  ctx.lineWidth = Math.max(2, r * 0.012);
  for (const g of GEOMETRIA) {
    const a = aRad(g.inicio - 90);
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
    ctx.stroke();
  }

  // Números
  for (const g of GEOMETRIA) dibujarTexto(ctx, c, r, g);

  // Clavijas en cada división (son las que "golpean" la flecha)
  for (const g of GEOMETRIA) {
    const a = aRad(g.inicio - 90);
    const px = c + Math.cos(a) * r * 0.955;
    const py = c + Math.sin(a) * r * 0.955;
    const radio = r * 0.022;
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

/**
 * Elige la orientación que permite el número más grande:
 * - "derecho": se lee derecho cuando la tajada pasa por la flecha (tajadas anchas).
 * - "radial": acostado a lo largo del radio (tajadas finitas, como la del 10).
 */
function dibujarTexto(ctx, c, r, g) {
  ctx.font = `100px ${FUENTE_NUMEROS}`;
  const k = ctx.measureText(g.texto).width / 100; // ancho del texto por cada px de fuente
  const s = Math.sin(aRad(Math.min(g.ancho, 150) / 2));
  const maximo = r * 0.27;

  // Derecho centrado al 68% del radio; si no entra, se corre hacia el borde (más ancho)
  const fCentrado = (1.36 * r * s) / (1.1 * k + 0.72 * s);
  const fBorde = Math.min(maximo, (1.8 * r * s) / (1.1 * k + 1.44 * s));
  const centrado = fCentrado >= maximo * 0.85;
  const fDerecho = centrado ? Math.min(maximo, fCentrado) : fBorde;
  const fRadial = Math.min(maximo, (1.8 * r * s) / (0.8 + 2 * s * k));
  // Se prefiere derecho; acostado solo si gana por mucho (en la práctica, el 10)
  const radial = fRadial > fDerecho * 1.3;
  const f = radial ? fRadial : fDerecho;

  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(aRad(g.inicio + g.ancho / 2));
  if (radial) {
    ctx.translate(0, -(r * 0.9 - (k * f) / 2));
    ctx.rotate(-Math.PI / 2);
  } else {
    ctx.translate(0, -(centrado ? r * 0.68 : r * 0.9 - f * 0.36));
  }
  ctx.font = `${f}px ${FUENTE_NUMEROS}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = f * 0.14;
  ctx.strokeStyle = 'rgba(30,0,60,0.6)';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = f * 0.12;
  ctx.shadowOffsetY = f * 0.04;
  // Luckiest Guy apoya las cifras un poco bajas: se compensa subiéndolas
  ctx.strokeText(g.texto, 0, f * 0.06);
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(g.texto, 0, f * 0.06);
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

  /** Crea o despierta el AudioContext. Hay que llamarlo tras un clic o una tecla. */
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
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  const disponible = () => ctx && ctx.state === 'running' && !mudo;

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
      canones(240, [color, color, '#FF2D87', '#00C2FF', '#FFC83D', '#6FB800', '#FFFFFF', '#C13BF0']);
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

let estado = 'inicio'; // 'inicio' | 'listo' | 'girando' | 'resultado'
let rotacion = 0;      // grados, sentido horario
let animacion = null;
let indiceActual = 0;
let anguloFlecha = 0;
let ultimoFrame = 0;
let bucleActivo = false;
let ultimoResultado = null;
let momentoResultado = 0;
let momentoCierre = 0;

/** Elige un sector según sus chances (equivale a elegir un ángulo al azar). */
function elegirSector() {
  let x = aleatorio() * TOTAL_CHANCES;
  for (const g of GEOMETRIA) {
    if (x < g.chances) return g;
    x -= g.chances;
  }
  return GEOMETRIA[GEOMETRIA.length - 1];
}

function girar() {
  if (estado === 'inicio') empezar({ conGesto: false });
  if (estado !== 'listo') return;
  if (performance.now() - momentoCierre < 350) return;

  sonido.activar();

  // 1) Se elige el sector y un punto dentro de él, lejos de los bordes.
  const elegido = elegirSector();
  const margen = Math.min(elegido.ancho * 0.2, 2.5);
  const anguloDestino = elegido.inicio + margen + aleatorio() * (elegido.ancho - 2 * margen);

  // 2) Se calcula la rotación final para que ese punto quede bajo la flecha.
  const vueltas = GIRO.vueltasMin + Math.floor(aleatorio() * (GIRO.vueltasMax - GIRO.vueltasMin + 1));
  const delta = normalizar(-anguloDestino - rotacion);
  const duracion = GIRO.duracionMin + aleatorio() * (GIRO.duracionMax - GIRO.duracionMin);

  const giro = {
    desde: rotacion,
    hasta: rotacion + vueltas * 360 + delta,
    inicio: performance.now(),
    duracion,
    elegido,
  };
  animacion = giro;

  cambiarEstado('girando');
  arrancarBucle();
  // Respaldo: si la pestaña no se está dibujando (minimizada o tapada), igual termina a tiempo
  setTimeout(() => { if (animacion === giro) terminarGiro(); }, duracion + 250);
}

function terminarGiro() {
  const { elegido, hasta } = animacion;
  animacion = null;
  rotacion = normalizar(hasta);
  el.rueda.style.transform = `rotate(${rotacion}deg)`;
  indiceActual = indiceEn(anguloBajoFlecha(rotacion));

  // El resultado se lee del ángulo final: siempre coincide con la flecha.
  const ganador = GEOMETRIA[indiceActual];
  if (ganador.id !== elegido.id) console.warn('[ruleta] desfase entre sorteo y ángulo', elegido, ganador);
  mostrarResultado(ganador);
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
  let terminado = false;

  if (animacion) {
    const t = (ahora - animacion.inicio) / animacion.duracion;
    rotacion = animacion.desde + (animacion.hasta - animacion.desde) * progreso(t);
    terminado = t >= 1;
    el.rueda.style.transform = `rotate(${rotacion}deg)`;

    // "Tic" cada vez que la flecha cambia de sector
    const indice = indiceEn(anguloBajoFlecha(rotacion));
    if (indice !== indiceActual) {
      indiceActual = indice;
      sonido.tic();
      anguloFlecha = Math.min(anguloFlecha, -20); // la clavija empuja la flecha
    }
  }

  // La flecha vuelve a su lugar como un resorte
  anguloFlecha *= Math.exp(-dt / 70);
  el.flecha.style.transform = `rotate(${anguloFlecha}deg)`;

  if (terminado) terminarGiro();

  if (animacion || Math.abs(anguloFlecha) > 0.05) {
    requestAnimationFrame(cuadro);
  } else {
    bucleActivo = false;
    anguloFlecha = 0;
    el.flecha.style.transform = '';
  }
}

/* =========================================================
   Resultado
   ========================================================= */

const ETIQUETAS = { triste: '¡Ay, no!', normal: '¡Salió!', jackpot: '★ ¡JACKPOT! ★' };

function unidadPara(texto) {
  return Number(texto) === 1 ? UNIDAD.singular : UNIDAD.plural;
}

function mostrarResultado(g) {
  ultimoResultado = g;
  momentoResultado = performance.now();

  el.resEtiqueta.textContent = ETIQUETAS[g.festejo] || ETIQUETAS.normal;
  el.resNumero.textContent = g.texto;
  el.resUnidad.textContent = unidadPara(g.texto);
  el.resDescripcion.textContent = g.descripcion;
  el.tarjeta.style.setProperty('--color', g.color);
  el.resultado.classList.remove('resultado--triste', 'resultado--jackpot');
  if (g.festejo === 'triste' || g.festejo === 'jackpot') el.resultado.classList.add(`resultado--${g.festejo}`);
  el.resultado.hidden = false;

  sonido.festejo(g.festejo);
  confeti.lanzar(g.festejo, g.color);
  cambiarEstado('resultado');
}

function cerrarResultado() {
  if (estado !== 'resultado') return;
  if (performance.now() - momentoResultado < 700) return; // evita cerrar sin querer
  el.resultado.hidden = true;
  momentoCierre = performance.now();
  cambiarEstado('listo');
}

/** Acción principal (ESPACIO, Enter, control remoto, centro de la rueda). */
function accionPrincipal() {
  if (estado === 'resultado') cerrarResultado();
  else girar();
}

function cambiarEstado(nuevo) {
  estado = nuevo;
  el.marco.classList.toggle('girando', nuevo === 'girando');
  el.marco.classList.toggle('festejo', nuevo === 'resultado');
  el.botonGirar.disabled = nuevo === 'girando' || nuevo === 'resultado';
  el.botonGirar.textContent = nuevo === 'girando' ? 'GIRANDO…' : '¡GIRAR RULETA!';
  conexion.difundir(mensajeEstado());
}

/** Lo que se le manda a los celulares para que muestren lo mismo que la TV. */
function mensajeEstado() {
  const r = estado === 'resultado' ? ultimoResultado : null;
  return {
    tipo: 'estado',
    estado: estado === 'inicio' ? 'listo' : estado,
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
   Pantalla de inicio, pantalla completa y pantalla siempre encendida
   ========================================================= */

let bloqueoPantalla = null;

async function mantenerPantallaEncendida() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible') {
      bloqueoPantalla = await navigator.wakeLock.request('screen');
    }
  } catch { /* no soportado o sin permiso: no pasa nada */ }
}

function pantallaCompleta() {
  const doc = document.documentElement;
  if (!document.fullscreenElement && doc.requestFullscreen) doc.requestFullscreen().catch(() => {});
}

function alternarPantallaCompleta() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else pantallaCompleta();
}

/** Primer clic/tecla: habilita audio (los navegadores lo exigen) y pantalla completa. */
function empezar({ conGesto = true } = {}) {
  if (estado !== 'inicio') return;
  sonido.activar();
  if (conGesto) pantallaCompleta();
  mantenerPantallaEncendida();
  el.inicio.hidden = true;
  cambiarEstado('listo');
}

/* =========================================================
   Conexión con los celulares (PeerJS / WebRTC)
   La TV se registra con un ID fijo (ruletacumple-<código>) y el celular
   se conecta a ese ID. El QR lleva a control.html?sala=<código>.
   ========================================================= */

const conexion = (() => {
  const PREFIJO = 'ruletacumple-';
  const CLAVE_SALA = 'ruleta.sala';
  const controles = new Set();
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

  /** Se reutiliza el código guardado para que los celulares se reconecten si se recarga la TV. */
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

  function actualizarContador() {
    if (!peer || !peer.open) return;
    const n = controles.size;
    if (n === 0) mostrar('ok', 'Listo: esperando celulares');
    else mostrar('ok', n === 1 ? '1 celular conectado' : `${n} celulares conectados`);
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
    controles.clear();
    mostrar('conectando', 'Conectando…');

    const p = new Peer(PREFIJO + codigo, { debug: 1 });
    peer = p;

    p.on('open', () => {
      if (p !== peer) return;
      intentosId = 0;
      actualizarContador();
    });

    p.on('connection', aceptar);

    // Se cortó el servidor de señalización (los celulares ya conectados siguen andando)
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
        mostrar('error', 'Sin conexión. Reintentando…');
        programar(crearPeer, 4000);
      }
    });
  }

  function aceptar(conn) {
    conn.ultimoContacto = Date.now();
    conn.on('open', () => {
      controles.add(conn);
      actualizarContador();
      enviar(conn, mensajeEstado());
    });
    conn.on('data', (datos) => {
      conn.ultimoContacto = Date.now();
      recibir(datos, conn);
    });
    const quitar = () => {
      if (controles.delete(conn)) actualizarContador();
    };
    conn.on('close', quitar);
    conn.on('error', quitar);
  }

  function recibir(datos, conn) {
    if (!datos || typeof datos !== 'object') return;
    switch (datos.tipo) {
      case 'girar':
        girar();
        break;
      case 'continuar':
        cerrarResultado();
        break;
      case 'ping':
        enviar(conn, { tipo: 'pong' });
        return;
      default:
        break;
    }
    // Siempre se le confirma el estado real a quien pidió algo
    enviar(conn, mensajeEstado());
  }

  function enviar(conn, mensaje) {
    try {
      if (conn.open) conn.send(mensaje);
    } catch (e) {
      console.warn('[ruleta] no se pudo enviar', e);
    }
  }

  function difundir(mensaje) {
    for (const c of controles) enviar(c, mensaje);
  }

  // Los celulares mandan "ping" cada 4 s; si uno deja de hablar, se lo da por ido.
  setInterval(() => {
    const ahora = Date.now();
    let cambio = false;
    for (const c of controles) {
      if (ahora - c.ultimoContacto > 15000) {
        controles.delete(c);
        cambio = true;
        try { c.close(); } catch { /* ya estaba cerrada */ }
      }
    }
    if (cambio) actualizarContador();
  }, 5000);

  function iniciar() {
    if (location.protocol === 'file:') el.avisoLocal.hidden = false;
    codigo = codigoGuardado();
    pintarQR();
    if (typeof Peer === 'undefined') {
      mostrar('error', 'Sin internet: girá con el botón o ESPACIO');
      return;
    }
    crearPeer();
  }

  return { iniciar, difundir, pintarQR };
})();

/* =========================================================
   Eventos
   ========================================================= */

const TECLAS_ACCION = new Set([' ', 'Enter', 'PageDown', 'PageUp', 'ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp']);

document.addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

  if (estado === 'inicio') {
    if (e.key === 'Escape' || e.key === 'Tab') return;
    e.preventDefault();
    empezar();
    return;
  }

  const tecla = e.key.toLowerCase();
  if (tecla === 'f') {
    alternarPantallaCompleta();
  } else if (tecla === 'm') {
    sonido.alternarMudo();
  } else if (TECLAS_ACCION.has(e.key)) {
    e.preventDefault(); // que ESPACIO no "clickee" además el botón con foco
    accionPrincipal();
  }
});

el.inicio.addEventListener('click', () => empezar());

el.botonGirar.addEventListener('click', (e) => {
  e.currentTarget.blur();
  girar();
});

el.centro.addEventListener('click', (e) => {
  e.currentTarget.blur();
  accionPrincipal();
});

el.botonContinuar.addEventListener('click', (e) => {
  e.currentTarget.blur();
  cerrarResultado();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && estado !== 'inicio') mantenerPantallaEncendida();
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
  el.inicioTitulo.textContent = TITULO;
  el.subtitulo.textContent = SUBTITULO;

  crearFocos();
  // Arranca con la flecha en el medio del primer sector
  rotacion = -(GEOMETRIA[0].inicio + GEOMETRIA[0].ancho / 2);
  indiceActual = indiceEn(anguloBajoFlecha(rotacion));
  el.rueda.style.transform = `rotate(${rotacion}deg)`;

  dibujarRueda();
  // Cuando llega la tipografía de los números, se redibuja con ella
  if (document.fonts && document.fonts.load) {
    document.fonts.load(`100px ${FUENTE_NUMEROS}`).then(dibujarRueda).catch(() => {});
  }

  confeti.ajustar();
  conexion.iniciar();
}

arrancar();
