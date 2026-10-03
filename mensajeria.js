/* =========================================================
   RULETA DEL CUMPLE — mensajería entre la TV y el celular

   Cliente MQTT 3.1.1 mínimo sobre WebSocket seguro, contra un servidor
   (broker) público. Los mensajes pasan por el broker, así que funciona
   aunque la TV y el celular estén en redes distintas (Wi-Fi, datos, etc.).

   Solo implementa lo que usa la ruleta:
   - mensajes simples (QoS 0) y mensajes retenidos (el broker guarda el último),
   - "último deseo": si alguien se desconecta de golpe (cierra la página,
     se queda sin señal), el broker publica un mensaje en su nombre.
   ========================================================= */
'use strict';

// Brokers públicos con WebSocket seguro. La TV usa el primero que ande
// y le pasa al celular cuál es (parámetro "b" del QR).
const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

/** Temas (canales) de una sala. */
function temasDeSala(sala) {
  const base = `ruletacumple/v1/${sala}`;
  return {
    presencia: `${base}/presencia`, // la TV avisa si está prendida (retenido)
    tv: `${base}/tv`,               // TV → celular
    control: `${base}/control`,     // celular → TV
  };
}

function idAleatorio(largo = 10) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(largo);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

/** Une varios pedazos (arrays de bytes o Uint8Array) en un solo Uint8Array. */
function concatenar(partes) {
  const total = partes.reduce((suma, p) => suma + p.length, 0);
  const salida = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    salida.set(p, pos);
    pos += p.length;
  }
  return salida;
}

class Canal {
  /**
   * @param {object} opciones
   * @param {string} opciones.url          broker (wss://…)
   * @param {number} [opciones.keepalive]  segundos entre latidos
   * @param {object|function} [opciones.ultimoDeseo] { tema, mensaje, retener } o una función que lo
   *        devuelva (se llama en cada conexión, para que el mensaje pueda cambiar)
   * @param {function} [opciones.alConectar]
   * @param {function} [opciones.alDesconectar] recibe true si se cayó una conexión que andaba
   * @param {function} [opciones.alMensaje]     recibe (tema, texto)
   */
  constructor({ url, keepalive = 10, ultimoDeseo = null, alConectar, alDesconectar, alMensaje }) {
    this.url = url;
    this.keepalive = keepalive;
    this.ultimoDeseo = ultimoDeseo;
    this.alConectar = alConectar || (() => {});
    this.alDesconectar = alDesconectar || (() => {});
    this.alMensaje = alMensaje || (() => {});

    this.socket = null;
    this.conectado = false;
    this.cerrado = false;
    this.buffer = new Uint8Array(0);
    this.temas = new Set();
    this.idPaquete = 1;
    this.ultimoDato = 0;
    this.timerLatido = null;
    this.timerReintento = null;
    this.timerConexion = null;
    this.codificador = new TextEncoder();
    this.decodificador = new TextDecoder();

    this.abrir();
  }

  /* ---------- API ---------- */

  suscribir(tema) {
    if (this.temas.has(tema)) return;
    this.temas.add(tema);
    if (this.conectado) this.enviarSuscripcion([tema]);
  }

  publicar(tema, mensaje, { retener = false } = {}) {
    if (!this.conectado) return false;
    return this.enviar(0x30 | (retener ? 0x01 : 0), [this.texto(tema), this.codificador.encode(mensaje)]);
  }

  /**
   * Cierra para siempre. Con `prolijo` se despide (el broker NO publica el último deseo);
   * sin él, corta de golpe y el broker sí lo publica.
   */
  cerrar({ prolijo = true } = {}) {
    this.cerrado = true;
    clearTimeout(this.timerReintento);
    clearTimeout(this.timerConexion);
    clearInterval(this.timerLatido);
    const s = this.socket;
    this.socket = null;
    this.conectado = false;
    if (!s) return;
    if (prolijo) this.enviarPor(s, 0xe0);
    try { s.close(); } catch (e) { /* ya estaba cerrado */ }
  }

  /** Si la conexión no está viva (por ejemplo, al volver de segundo plano), reconecta ya. */
  reconectarYa() {
    if (this.cerrado) return;
    if (this.conectado && Date.now() - this.ultimoDato < this.keepalive * 1000) return;
    if (this.socket) this.cortar();
    this.abrir();
  }

  /* ---------- Conexión ---------- */

  abrir() {
    clearTimeout(this.timerReintento);
    if (this.cerrado || this.socket) return;
    let s;
    try {
      s = new WebSocket(this.url, ['mqtt']);
    } catch (e) {
      this.programarReintento();
      return;
    }
    s.binaryType = 'arraybuffer';
    this.socket = s;
    this.buffer = new Uint8Array(0);
    this.timerConexion = setTimeout(() => { if (this.socket === s && !this.conectado) this.cortar(); }, 8000);
    s.onopen = () => { if (this.socket === s) this.enviarConnect(); };
    s.onmessage = (e) => { if (this.socket === s) this.recibir(new Uint8Array(e.data)); };
    s.onclose = () => { if (this.socket === s) this.alCerrarse(); };
  }

  /** Da por muerta la conexión actual sin esperar al navegador. */
  cortar() {
    const s = this.socket;
    if (!s) return;
    try { s.close(); } catch (e) { /* nada */ }
    this.alCerrarse();
  }

  alCerrarse() {
    const estaba = this.conectado;
    this.socket = null;
    this.conectado = false;
    clearInterval(this.timerLatido);
    clearTimeout(this.timerConexion);
    this.alDesconectar(estaba);
    this.programarReintento();
  }

  programarReintento(ms = 2000) {
    if (this.cerrado) return;
    clearTimeout(this.timerReintento);
    this.timerReintento = setTimeout(() => this.abrir(), ms);
  }

  latido() {
    // Si el broker no contestó nada en un rato, la conexión está muerta aunque el navegador no lo sepa
    if (Date.now() - this.ultimoDato > this.keepalive * 1500) {
      this.cortar();
      return;
    }
    this.enviar(0xc0); // PINGREQ
  }

  /* ---------- Paquetes MQTT ---------- */

  /** Texto con su largo adelante (2 bytes), como lo pide MQTT. */
  texto(cadena) {
    const bytes = typeof cadena === 'string' ? this.codificador.encode(cadena) : cadena;
    return concatenar([[bytes.length >> 8, bytes.length & 0xff], bytes]);
  }

  enviarConnect() {
    const deseo = typeof this.ultimoDeseo === 'function' ? this.ultimoDeseo() : this.ultimoDeseo;
    let banderas = 0x02; // sesión limpia
    const cola = [this.texto(`ruleta-${idAleatorio(12)}`)];
    if (deseo) {
      banderas |= 0x04 | (deseo.retener ? 0x20 : 0);
      cola.push(this.texto(deseo.tema), this.texto(deseo.mensaje));
    }
    this.enviar(0x10, [this.texto('MQTT'), [0x04, banderas, this.keepalive >> 8, this.keepalive & 0xff], ...cola]);
  }

  enviarSuscripcion(temas) {
    const id = this.idPaquete;
    this.idPaquete = (this.idPaquete % 65535) + 1;
    const partes = [[id >> 8, id & 0xff]];
    for (const t of temas) partes.push(this.texto(t), [0]);
    this.enviar(0x82, partes);
  }

  enviar(cabecera, partes = []) {
    return this.enviarPor(this.socket, cabecera, partes);
  }

  enviarPor(s, cabecera, partes = []) {
    if (!s || s.readyState !== WebSocket.OPEN) return false;
    const cuerpo = concatenar(partes);
    const largo = [];
    let n = cuerpo.length;
    do {
      let b = n % 128;
      n = Math.floor(n / 128);
      if (n > 0) b |= 0x80;
      largo.push(b);
    } while (n > 0);
    s.send(concatenar([[cabecera], largo, cuerpo]));
    return true;
  }

  recibir(datos) {
    this.ultimoDato = Date.now();
    this.buffer = concatenar([this.buffer, datos]);
    // Un mensaje del WebSocket puede traer varios paquetes MQTT, o uno a medias
    while (this.buffer.length >= 2) {
      let largo = 0;
      let multiplicador = 1;
      let i = 1;
      let b;
      do {
        if (i >= this.buffer.length) return;
        b = this.buffer[i++];
        largo += (b & 0x7f) * multiplicador;
        multiplicador *= 128;
      } while (b & 0x80);
      if (this.buffer.length < i + largo) return;
      const cabecera = this.buffer[0];
      const cuerpo = this.buffer.slice(i, i + largo);
      this.buffer = this.buffer.slice(i + largo);
      this.procesar(cabecera, cuerpo);
    }
  }

  procesar(cabecera, cuerpo) {
    const tipo = cabecera >> 4;
    if (tipo === 2) {
      // CONNACK
      clearTimeout(this.timerConexion);
      if (cuerpo[1] !== 0) {
        this.cortar();
        return;
      }
      this.conectado = true;
      if (this.temas.size) this.enviarSuscripcion([...this.temas]);
      clearInterval(this.timerLatido);
      this.timerLatido = setInterval(() => this.latido(), this.keepalive * 500);
      this.alConectar();
    } else if (tipo === 3) {
      // PUBLISH
      const qos = (cabecera >> 1) & 0x03;
      const largoTema = (cuerpo[0] << 8) | cuerpo[1];
      const tema = this.decodificador.decode(cuerpo.subarray(2, 2 + largoTema));
      const inicio = 2 + largoTema + (qos > 0 ? 2 : 0);
      this.alMensaje(tema, this.decodificador.decode(cuerpo.subarray(inicio)));
    }
    // SUBACK y PINGRESP no necesitan nada: alcanza con haber anotado que llegó algo
  }
}
