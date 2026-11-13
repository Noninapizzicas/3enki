'use strict';

/**
 * autonomia — bloque 9 · Q1..Q6 · CUSTODIO (Q2 y Q5) + los reflejos (Q1, Q3, Q4,
 * Q6) por detras.
 *
 * Este fichero es el UNICO sitio del puente que escribe
 * `storage/instagram-bridge/{autorizaciones.json,confirmaciones.json}`. La
 * logica de dominio vive en los ficheros puros (`puerta.js`,
 * `autorizaciones.js`, `politica.js`, `nivel.js`, `ventana.js` y
 * `core/casillas.js`); aqui solo hay IO, correlacion de eventos, los dos candados
 * de escritura y la auditoria previa a cada escritura.
 *
 * DOS ALMACENES, DOS CANDADOS:
 *   - `confirmaciones.json`  lo que se pregunto y lo que se contesto (Q2).
 *   - `autorizaciones.json`  los si que se pueden gastar, y su gasto (Q5).
 * Un candado por fichero: una respuesta no espera a que se anote otra. El orden
 * de escritura es SIEMPRE confirmaciones -> autorizaciones (primero se contesta,
 * luego se acuna el permiso). No se anidan candados, asi que no hay abrazo
 * mortal; y si el proceso muere entre los dos, queda un si SIN permiso, que es
 * el lado seguro del fallo.
 *
 * LO QUE ESTE BORDE NO TIENE, A PROPOSITO:
 *   - **No hay topic para anotar una autorizacion.** El unico camino es
 *     `responder_confirmacion` -> si la puerta dice que si -> `anotar_autorizacion`.
 *     Si hubiera un `autorizacion.anotar.request` en el bus, existiria una
 *     segunda via para conseguir permiso, que es exactamente el agujero que el
 *     bloque entero cierra.
 *   - **No hay reloj.** Ni un `Date.now()`: todos los momentos vienen en el
 *     payload (P1). Una ventana o una caducidad calculadas con el reloj del
 *     proceso no se pueden reproducir ni auditar.
 *
 * EL CANAL DEL DUENO. La pregunta sale por el modulo REAL
 * `adaptador-confirmacion` (RPC `adaptador-confirmacion.confirmar.request`) y la
 * respuesta vuelve por `adaptador-confirmacion.confirmacion_recibida`. Las dos
 * desembocan en `responder()`, la misma puerta que el RPC directo: un si es un
 * si, venga de donde venga, y pasa por las mismas comprobaciones.
 *
 * LIMITE CONOCIDO Y DECLARADO: el adaptador es del taller 3D y su vocabulario de
 * tipos es cerrado (`modelo_aprobado` / `modelo_rechazado`), y su `contexto` no
 * incluye la cuenta. Por eso la respuesta del canal solo se acepta si se puede
 * atar a UNA pregunta:
 *   1. si trae `confirmacion_id` (o un `callback_data` con `cf:<id>`), se ata por
 *      id y no hay duda;
 *   2. si no, solo se acepta cuando hay EXACTAMENTE UNA pregunta pendiente en ese
 *      proyecto y esa cuenta (`contexto.cuenta`), y se dice que se resolvio por
 *      ambito;
 *   3. en cualquier otro caso se rechaza (`confirmacion_ambigua` /
 *      `confirmacion_sin_contexto`) y la pregunta sigue pendiente hasta caducar.
 * Un si que no se puede atar a su pregunta no es un si. Para cerrar el circulo
 * del todo, al adaptador le falta ecoar el `confirmacion_id` en el
 * `callback_data` de los botones.
 */

const path = require('path');
const fsp = require('fs/promises');

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const { es_objeto, es_instante, texto_no_vacio, clonar } = require('../core/formas');
const casillas = require('../core/casillas');
const nivel = require('./nivel');
const ventana = require('./ventana');
const puerta = require('./puerta');
const autorizaciones = require('./autorizaciones');
const politica = require('./politica');

const TOPICS = Object.freeze({
  CASILLA_CONSULTAR: 'instagram.autonomia.casilla.consultar',
  NIVEL_CONSULTAR: 'instagram.autonomia.nivel.consultar',
  VENTANA_ABRIR: 'instagram.autonomia.ventana.abrir',
  VENTANA_CANCELAR: 'instagram.autonomia.ventana.cancelar',
  CONFIRMACION_PEDIR: 'instagram.autonomia.confirmacion.pedir',
  CONFIRMACION_RESPONDER: 'instagram.autonomia.confirmacion.responder',
  CONFIRMACION_CONSULTAR: 'instagram.autonomia.confirmacion.consultar',
  CONFIRMACION_VENCER: 'instagram.autonomia.confirmacion.vencer',
  AUTORIZACION_CONSUMIR: 'instagram.autonomia.autorizacion.consumir',
  AUTORIZACION_CONSULTAR: 'instagram.autonomia.autorizacion.consultar',
  DECIDIR: 'instagram.autonomia.decidir'
});

// El puente con el canal del dueno (modulo real del taller 3D).
const CANAL = Object.freeze({
  PEDIR: 'adaptador-confirmacion.confirmar.request',
  RECIBIDA: 'adaptador-confirmacion.confirmacion_recibida',
  FALLIDA: 'adaptador-confirmacion.confirmar.failed',
  // El par si/no del adaptador. Nuestro "si" es su `modelo_aprobado`; su
  // "rechazar" es nuestro "no". La accion de verdad viaja en `nombre`/`detalle`
  // y, sobre todo, en el `confirmacion_id`, que es lo que manda.
  TIPO_SI: 'modelo_aprobado',
  TIPO_NO: 'modelo_rechazado'
});

const DIR_POR_DEFECTO = path.resolve(__dirname, '../../../storage/instagram-bridge');
const FICHERO_CONFIRMACIONES = 'confirmaciones.json';
const FICHERO_AUTORIZACIONES = 'autorizaciones.json';

const ALMACENES = Object.freeze({
  confirmaciones: {
    fichero: FICHERO_CONFIRMACIONES,
    estado_vacio: puerta.estado_vacio,
    es_estado: puerta.es_estado,
    auditar: puerta.auditar,
    sin: 'sin_confirmaciones',
    etiqueta: 'confirmaciones'
  },
  autorizaciones: {
    fichero: FICHERO_AUTORIZACIONES,
    estado_vacio: autorizaciones.estado_vacio,
    es_estado: autorizaciones.es_estado,
    auditar: autorizaciones.auditar,
    sin: 'sin_autorizaciones',
    etiqueta: 'autorizaciones'
  }
});

class Autonomia extends ModuloHibridoReflejo {
  /**
   * @param {{directorio?:string, fichero_confirmaciones?:string,
   *          fichero_autorizaciones?:string, preguntar_por_canal?:boolean,
   *          timeout_canal_ms?:number}} [opts]
   */
  constructor(opts = {}) {
    super();
    this.name = 'autonomia';
    this.version = '0.1.0';

    this._directorio = opts.directorio || process.env.ENKI_INSTAGRAM_STORAGE || DIR_POR_DEFECTO;
    this._rutas = {
      confirmaciones: path.join(this._directorio, opts.fichero_confirmaciones || FICHERO_CONFIRMACIONES),
      autorizaciones: path.join(this._directorio, opts.fichero_autorizaciones || FICHERO_AUTORIZACIONES)
    };

    this._estados = {
      confirmaciones: puerta.estado_vacio(),
      autorizaciones: autorizaciones.estado_vacio()
    };
    this._ilegibles = { confirmaciones: null, autorizaciones: null };
    this._cerrojos = { confirmaciones: Promise.resolve(), autorizaciones: Promise.resolve() };

    this._cargado = false;
    this._lecturas = 0;
    this._escrituras = 0;
    this._canal = { preguntas: 0, respuestas: 0, rechazadas: 0 };

    // En pruebas se apaga para no depender del bus; en produccion la pregunta
    // sale de verdad por el adaptador.
    this._preguntarPorCanal = opts.preguntar_por_canal !== false;
    this._timeoutCanalMs = Number(opts.timeout_canal_ms) > 0 ? Number(opts.timeout_canal_ms) : 30000;
  }

  // ---- ciclo de vida -------------------------------------------------------

  async onLoad(context) {
    await super.onLoad(context);
    await this.cargar();
    this.logger?.info('autonomia.loaded', {
      module: this.name,
      confirmaciones: this._rutas.confirmaciones,
      autorizaciones: this._rutas.autorizaciones,
      preguntas: this._estados.confirmaciones.confirmaciones.length,
      autorizaciones: this._estados.autorizaciones.autorizaciones.length
    });
  }

  async onUnload() {
    await this._cerrojos.confirmaciones;
    await this._cerrojos.autorizaciones;
    return super.onUnload();
  }

  async _leerFichero(nombre) {
    const def = ALMACENES[nombre];
    const ruta = this._rutas[nombre];
    try {
      const crudo = await fsp.readFile(ruta, 'utf8');
      const datos = JSON.parse(crudo);
      if (!def.es_estado(datos)) return { estado: def.estado_vacio(), ilegible: 'esquema_desconocido' };
      return { estado: datos, ilegible: null };
    } catch (err) {
      if (err && err.code === 'ENOENT') return { estado: def.estado_vacio(), ilegible: null };
      const motivo = err && err.code === 'EACCES' ? `${def.etiqueta}_sin_permiso` : `${def.etiqueta}_ilegible`;
      return { estado: def.estado_vacio(), ilegible: motivo };
    }
  }

  /**
   * Carga los dos almacenes. Un fichero que no existe arranca vacio; uno roto
   * NO se toca: se marca ilegible y el custodio responde `sin_*` hasta que una
   * persona lo mire. Reescribir un registro de permisos corrupto es perder la
   * unica prueba de quien autorizo que.
   */
  async cargar() {
    for (const nombre of Object.keys(ALMACENES)) {
      const r = await this._leerFichero(nombre);
      this._estados[nombre] = r.estado;
      this._ilegibles[nombre] = r.ilegible;
    }
    this._cargado = true;
    return {
      ok: this._ilegibles.confirmaciones === null && this._ilegibles.autorizaciones === null,
      confirmaciones: this._ilegibles.confirmaciones,
      autorizaciones: this._ilegibles.autorizaciones
    };
  }

  async recargar() {
    return this.cargar();
  }

  // ---- escritura atomica ---------------------------------------------------

  async _escribir(ruta, estado) {
    await fsp.mkdir(this._directorio, { recursive: true });
    const temporal = `${ruta}.${process.pid}.tmp`;
    await fsp.writeFile(temporal, `${JSON.stringify(estado, null, 2)}\n`, 'utf8');
    await fsp.rename(temporal, ruta);
    this._escrituras += 1;
    return ruta;
  }

  /**
   * Aplica una mutacion pura bajo el candado de su almacen, auditando antes de
   * escribir. Si la mutacion devuelve `estado: null` es una lectura: no escribe.
   */
  _mutar(nombre, mutacion) {
    const def = ALMACENES[nombre];
    const ruta = this._rutas[nombre];

    const siguiente = this._cerrojos[nombre].then(async () => {
      if (!this._cargado) await this.cargar();
      if (this._ilegibles[nombre]) {
        return { ok: false, motivo: def.sin, detalle: this._ilegibles[nombre], ruta };
      }

      const r = mutacion(this._estados[nombre]);
      if (!r || r.ok !== true) return r || { ok: false, motivo: 'entrada_invalida' };
      if (!r.estado) return r;

      const auditoria = def.auditar(r.estado);
      if (!auditoria.ok) {
        return {
          ok: false,
          motivo: 'almacen_no_auditado',
          problemas: auditoria.problemas,
          guardado: false
        };
      }

      try {
        await this._escribir(ruta, r.estado);
      } catch (err) {
        return {
          ok: false,
          motivo: err && err.code === 'ENOSPC' ? 'disco_lleno' : 'no_se_pudo_guardar',
          detalle: err && err.message,
          guardado: false
        };
      }

      this._estados[nombre] = r.estado;
      return r;
    });

    this._cerrojos[nombre] = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  _leer(nombre, lectura) {
    const def = ALMACENES[nombre];

    const siguiente = this._cerrojos[nombre].then(async () => {
      if (!this._cargado) await this.cargar();
      if (this._ilegibles[nombre]) return { ok: false, motivo: def.sin, detalle: this._ilegibles[nombre], ruta: this._rutas[nombre] };
      this._lecturas += 1;
      return lectura(this._estados[nombre]);
    });

    this._cerrojos[nombre] = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  /** Fotografia en memoria, para auditorias y pruebas. */
  foto() {
    return {
      confirmaciones: clonar(this._estados.confirmaciones),
      autorizaciones: clonar(this._estados.autorizaciones),
      canal: Object.assign({}, this._canal),
      lecturas: this._lecturas,
      escrituras: this._escrituras
    };
  }

  // ---- Q1 · casilla --------------------------------------------------------

  consultar_casilla(entrada) {
    const e = es_objeto(entrada) ? entrada : { accion: entrada };
    if (e.accion === undefined) return { ok: true, acciones: casillas.acciones(), regla: 'una accion sin casilla no se ejecuta' };
    const v = casillas.validar({ accion: e.accion, casilla: e.casilla });
    if (!v.ok) return Object.assign({}, v, { ejecutable: false });
    return Object.assign({}, v, { ejecutable: true, ventana_segundos: v.casilla.ventana_segundos });
  }

  // ---- Q3 · nivel ----------------------------------------------------------

  consultar_nivel(entrada) {
    const e = es_objeto(entrada) ? entrada : {};
    const declaracion = e.nivel !== undefined ? e.nivel : (e.niveles !== undefined ? e.niveles : e.declaraciones);
    return nivel.resolver(declaracion, { cuenta: e.cuenta, proyecto: e.proyecto, momento: e.momento });
  }

  // ---- Q4 · ventana --------------------------------------------------------

  abrir_ventana(entrada) {
    return ventana.abrir(entrada);
  }

  cancelar_ventana(entrada) {
    const e = es_objeto(entrada) ? entrada : {};
    if (!es_objeto(e.ventana)) {
      return { ok: false, motivo: ventana.MOTIVOS.ENTRADA_INVALIDA, faltan: ['ventana'] };
    }
    return ventana.cancelar(e.ventana, e);
  }

  // ---- Q2 · la puerta ------------------------------------------------------

  /**
   * Abre una pregunta al dueno y la manda por el canal real.
   *
   * La escritura va primero (la pregunta existe antes de salir) y el RPC
   * despues: si el canal falla, lo que queda es una pregunta pendiente que
   * caduca sola, nunca un si a medias.
   */
  async pedir_confirmacion(entrada) {
    const e = es_objeto(entrada) ? entrada : {};
    const r = await this._mutar('confirmaciones', (estado) => puerta.pedir(estado, e));
    if (!r || r.ok !== true || r.pedida !== true) return r;

    if (this._preguntarPorCanal !== false && e.preguntar !== false) {
      const salida = await this._preguntarPorElCanal(r.confirmacion, e);
      return Object.assign({}, r, { canal: salida });
    }
    return r;
  }

  async _preguntarPorElCanal(confirmacion, entrada) {
    if (!this.eventBus || typeof this.eventBus.publish !== 'function') {
      return { enviada: false, motivo: 'sin_bus' };
    }
    this._canal.preguntas += 1;

    // `super._rpc` es el RPC request/response de la base; `this._rpc` es el
    // envoltorio de handlers de este modulo. No se pueden confundir.
    const respuesta = await super._rpc(CANAL.PEDIR, {
      project_id: confirmacion.proyecto,
      confirmacion_id: confirmacion.confirmacion_id,
      // El adaptador tiene un vocabulario cerrado (es del taller 3D): se usa su
      // par si/no y la accion de verdad viaja en nombre/detalle. Lo que ata la
      // respuesta a la pregunta es el confirmacion_id y el ambito, no el tipo.
      tipo: CANAL.TIPO_SI,
      nombre: `${confirmacion.accion} en @${confirmacion.cuenta}`,
      detalle: `[${confirmacion.confirmacion_id}] ${confirmacion.motivo}`,
      canal: 'telegram',
      botName: entrada.botName || null,
      chatId: entrada.chatId !== undefined ? entrada.chatId : null,
      correlation_id: confirmacion.confirmacion_id
    }, { timeout_ms: this._timeoutCanalMs });

    if (respuesta && respuesta.ok === true) {
      return { enviada: true, confirmacion_id: respuesta.confirmacion_id || confirmacion.confirmacion_id, canal: respuesta.canal || 'telegram' };
    }

    // El canal no pudo preguntar. Se anota el intento: la pregunta sigue viva y
    // el fallo NO se convierte en silencio ni el silencio en si.
    // Sin respuesta no hay momento del fallo: se anota el intento sin inventar
    // la hora (poner `pedida_en` seria hacer pasar la pregunta por el fallo).
    await this._mutar('confirmaciones', (estado) => puerta.marcar_intento(estado, {
      confirmacion_id: confirmacion.confirmacion_id,
      error: (respuesta && respuesta.motivo) || 'canal_no_confirmo'
    }));

    return { enviada: false, motivo: (respuesta && respuesta.motivo) || 'canal_no_confirmo' };
  }

  /**
   * UNICA entrada de un si. La usan el RPC directo y el canal del dueno.
   *
   * Si la puerta dice que si, el permiso se acuna en el registro. Si el registro
   * lo rechaza, el veredicto es `autoriza: false`: el si existio, pero sin
   * asiento en el libro no hay nada que gastar (y se dice por que).
   */
  async responder_confirmacion(entrada) {
    const e = es_objeto(entrada) ? entrada : {};
    const r = await this._mutar('confirmaciones', (estado) => puerta.responder(estado, e));
    if (!r || r.ok !== true || r.autoriza !== true) return r;

    const anotada = await this.anotar_autorizacion(r.autorizacion);
    if (!anotada || anotada.ok !== true) {
      return Object.assign({}, r, {
        autoriza: false,
        autorizacion: null,
        guardado: false,
        motivo_autorizacion: (anotada && anotada.motivo) || 'no_se_pudo_anotar',
        problemas: (anotada && anotada.problemas) || undefined,
        nota: 'el dueno dijo si, pero el registro no lo acepto: sin asiento no hay permiso'
      });
    }

    return Object.assign({}, r, {
      autoriza: true,
      autorizacion: anotada.autorizacion,
      autorizacion_id: anotada.autorizacion_id,
      huella: anotada.huella
    });
  }

  vencer_confirmaciones(entrada) {
    const e = es_objeto(entrada) ? entrada : {};
    return this._mutar('confirmaciones', (estado) => puerta.vencer(estado, e));
  }

  consultar_confirmacion(entrada) {
    return this._leer('confirmaciones', (estado) => puerta.consultar(estado, entrada));
  }

  listar_confirmaciones(filtro) {
    return this._leer('confirmaciones', (estado) => puerta.pendientes(estado, filtro));
  }

  // ---- Q5 · el registro ----------------------------------------------------

  /**
   * Anota una autorizacion. NO tiene topic: solo la llama la puerta, cuando ya
   * dijo que si. Existe como metodo para el custodio y para las pruebas.
   */
  anotar_autorizacion(entrada) {
    return this._mutar('autorizaciones', (estado) => autorizaciones.anotar(estado, entrada));
  }

  consumir_autorizacion(entrada) {
    return this._mutar('autorizaciones', (estado) => autorizaciones.consumir(estado, entrada));
  }

  consultar_autorizacion(entrada) {
    return this._leer('autorizaciones', (estado) => autorizaciones.consultar(estado, entrada));
  }

  listar_autorizaciones(filtro) {
    return this._leer('autorizaciones', (estado) => autorizaciones.listar(estado, filtro));
  }

  // ---- Q6 · la sintesis ----------------------------------------------------

  /**
   * El veredicto. La autorizacion NO se acepta del que pide: si trae un
   * `autorizacion_id`, se busca en el registro y es el registro el que dice si
   * existe, si esta viva y si esta gastada. Lo que venga en `entrada.autorizacion`
   * se DESCARTA: aceptar un objeto de permiso del payload seria la segunda via.
   */
  async decidir(entrada) {
    const e = es_objeto(entrada) ? entrada : {};
    const peticion = Object.assign({}, e);
    delete peticion.autorizacion;

    let aut = null;
    if (texto_no_vacio(e.autorizacion_id)) {
      const r = await this.consultar_autorizacion({ autorizacion_id: e.autorizacion_id, momento: e.momento });
      if (!r || r.ok !== true) {
        return {
          ok: true,
          dictamen: 'no',
          motivo: (r && r.motivo) || 'autorizacion_desconocida',
          porque: [{ paso: 'autorizacion', resultado: 'desconocida', motivo: (r && r.motivo) || 'autorizacion_desconocida' }],
          exige_ventana: false,
          ventana_segundos: 0
        };
      }
      aut = Object.assign(clonar(r.autorizacion), { procedencia: 'registro_autorizaciones' });
    }

    peticion.autorizacion = aut;
    return politica.decidir(peticion);
  }

  // ---- canal del dueno (adaptador-confirmacion) ----------------------------

  /**
   * Respuesta del dueno por el canal. Fire-and-forget: el adaptador ya la
   * publico, aqui solo se ata a su pregunta y se mete por la puerta.
   */
  async onConfirmacionRecibida(evento) {
    const d = (evento && evento.data) || evento || {};
    this._canal.respuestas += 1;

    const decision = this._decisionDelCanal(d);
    if (decision === null) {
      return this._rechazarCanal(d, 'respuesta_no_reconocida');
    }

    const atada = await this._ataraUnaPregunta(d);
    if (!atada.ok) return this._rechazarCanal(d, atada.motivo, atada);

    if (!es_instante(d.timestamp)) {
      // Sin momento no hay respuesta: el momento se inyecta, no se inventa.
      return this._rechazarCanal(d, 'respuesta_sin_momento');
    }

    // El si del canal es un si del dueno; la referencia es el propio callback,
    // que es lo unico que prueba que alguien pulso.
    return this.responder_confirmacion({
      confirmacion_id: atada.confirmacion.confirmacion_id,
      decision,
      quien: 'dueno',
      momento: d.timestamp,
      referencia: `adaptador-confirmacion:${String(d.callback_data || d.text || d.tipo || 'callback')}`,
      via: 'canal'
    });
  }

  /** El adaptador no pudo entregar la pregunta. Se anota; no se resuelve nada. */
  async onConfirmarFailed(evento) {
    const d = (evento && evento.data) || evento || {};
    const id = texto_no_vacio(d.confirmacion_id) ? String(d.confirmacion_id) : null;
    if (!id || !es_instante(d.timestamp)) {
      this.logger?.warn('autonomia.canal.fallo_sin_id', { module: this.name, error: d.error });
      return { ok: false, motivo: 'fallo_sin_confirmacion_id' };
    }
    return this._mutar('confirmaciones', (estado) => puerta.marcar_intento(estado, {
      confirmacion_id: id,
      momento: d.timestamp,
      error: d.error || 'adaptador_confirmo_fallo'
    }));
  }

  _decisionDelCanal(d) {
    const tipo = String(d.tipo || d.callback_data || d.text || '').trim().toLowerCase();
    if (tipo === CANAL.TIPO_SI) return 'si';
    if (tipo === CANAL.TIPO_NO) return 'no';
    return null;
  }

  /**
   * A que pregunta corresponde esta respuesta. Por id si lo trae; si no, solo
   * cuando hay UNA sola pregunta pendiente en ese proyecto y esa cuenta.
   */
  async _ataraUnaPregunta(d) {
    const contexto = es_objeto(d.contexto) ? d.contexto : {};
    const ids = [
      d.confirmacion_id,
      contexto.confirmacion_id,
      this._idEnCallback(d.callback_data),
      this._idEnTexto(d.text)
    ].filter((x) => texto_no_vacio(x)).map(String);

    for (const id of ids) {
      const r = await this.consultar_confirmacion({ confirmacion_id: id });
      if (r && r.ok === true) return { ok: true, por: 'id', confirmacion: r.confirmacion };
    }

    const proyecto = texto_no_vacio(d.project_id) ? String(d.project_id).trim() : (texto_no_vacio(contexto.proyecto) ? String(contexto.proyecto).trim() : null);
    const cuenta = texto_no_vacio(contexto.cuenta) ? casillas.normalizar_cuenta(contexto.cuenta) : null;
    if (!proyecto || !cuenta) {
      return { ok: false, motivo: 'confirmacion_sin_contexto', nota: 'el canal no dijo de que proyecto ni de que cuenta es la respuesta' };
    }
    if (!es_instante(d.timestamp)) return { ok: false, motivo: 'respuesta_sin_momento' };

    const pend = await this.listar_confirmaciones({ proyecto, cuenta, momento: d.timestamp });
    if (!pend || pend.ok !== true) return { ok: false, motivo: (pend && pend.motivo) || 'sin_confirmaciones' };
    if (pend.total === 0) return { ok: false, motivo: 'confirmacion_desconocida' };
    if (pend.total > 1) {
      return {
        ok: false,
        motivo: 'confirmacion_ambigua',
        candidatas: pend.confirmaciones.map((c) => c.confirmacion_id),
        nota: 'hay mas de una pregunta viva en esa cuenta: un si no se puede repartir'
      };
    }
    return { ok: true, por: 'ambito', confirmacion: pend.confirmaciones[0] };
  }

  _idEnCallback(callback) {
    if (!texto_no_vacio(callback)) return null;
    const m = String(callback).match(/cf:[a-z0-9-]{4,}/i);
    return m ? m[0].slice(3) : null;
  }

  _idEnTexto(texto) {
    if (!texto_no_vacio(texto)) return null;
    const m = String(texto).match(/cf-[a-f0-9]{6,}/i);
    return m ? m[0] : null;
  }

  _rechazarCanal(d, motivo, extra) {
    this._canal.rechazadas += 1;
    const payload = Object.assign({
      motivo,
      confirmacion_id: d && d.confirmacion_id ? d.confirmacion_id : null,
      proyecto: d && d.project_id ? d.project_id : null,
      tipo: d && d.tipo ? d.tipo : null
    }, extra || {});
    this.eventBus?.publish('instagram.autonomia.confirmacion.rechazada', payload);
    this.logger?.warn('autonomia.canal.rechazada', { module: this.name, motivo });
    return Object.assign({ ok: false, motivo, rechazada: true }, extra || {});
  }

  // ---- handlers del bus ----------------------------------------------------

  onCasillaConsultarRequest(e) { return this._rpc(TOPICS.CASILLA_CONSULTAR, e, (d) => this.consultar_casilla(d)); }
  onNivelConsultarRequest(e) { return this._rpc(TOPICS.NIVEL_CONSULTAR, e, (d) => this.consultar_nivel(d)); }
  onVentanaAbrirRequest(e) { return this._rpc(TOPICS.VENTANA_ABRIR, e, (d) => this.abrir_ventana(d)); }
  onVentanaCancelarRequest(e) { return this._rpc(TOPICS.VENTANA_CANCELAR, e, (d) => this.cancelar_ventana(d)); }
  onConfirmacionPedirRequest(e) { return this._rpc(TOPICS.CONFIRMACION_PEDIR, e, (d) => this.pedir_confirmacion(d)); }
  onConfirmacionResponderRequest(e) { return this._rpc(TOPICS.CONFIRMACION_RESPONDER, e, (d) => this.responder_confirmacion(d)); }
  onConfirmacionConsultarRequest(e) { return this._rpc(TOPICS.CONFIRMACION_CONSULTAR, e, (d) => this.consultar_confirmacion(d)); }
  onConfirmacionVencerRequest(e) { return this._rpc(TOPICS.CONFIRMACION_VENCER, e, (d) => this.vencer_confirmaciones(d)); }
  onAutorizacionConsumirRequest(e) { return this._rpc(TOPICS.AUTORIZACION_CONSUMIR, e, (d) => this.consumir_autorizacion(d)); }
  onAutorizacionConsultarRequest(e) { return this._rpc(TOPICS.AUTORIZACION_CONSULTAR, e, (d) => this.consultar_autorizacion(d)); }
  onDecidirRequest(e) { return this._rpc(TOPICS.DECIDIR, e, (d) => this.decidir(d)); }

  /**
   * Atiende un RPC con su PAR DE FALLO. Un rechazo sale por `.failed` con su
   * motivo; una respuesta, por `.response`, sin devolver el almacen entero.
   */
  async _rpc(topic, event, fn) {
    const d = (event && event.data) || event || {};
    const request_id = d.request_id;
    let r;
    try {
      r = await fn(d);
    } catch (err) {
      this.logger?.error(`${this.name}.rpc.error`, { topic, error: err && err.message });
      r = { ok: false, motivo: 'error_interno', detalle: err && err.message };
    }

    if (r && r.ok === true) {
      const { ok, estado, ...datos } = r;
      const payload = Object.assign({ request_id, ok: true }, datos);
      this.eventBus?.publish(`${topic}.response`, payload);
      return payload;
    }

    const fallo = {
      request_id,
      ok: false,
      motivo: (r && r.motivo) || 'entrada_invalida',
      faltan: (r && r.faltan) || [],
      invalidos: (r && r.invalidos) || []
    };
    if (r && es_objeto(r)) {
      for (const campo of Object.keys(r)) {
        if (['ok', 'motivo', 'faltan', 'invalidos', 'estado'].includes(campo)) continue;
        if (r[campo] === undefined) continue;
        fallo[campo] = r[campo];
      }
    }
    this.eventBus?.publish(`${topic}.failed`, fallo);
    return fallo;
  }
}

/** Factory: la forma comoda para tests y para el loader. */
function crear(opts = {}) {
  return new Autonomia(opts);
}

module.exports = {
  TOPICS,
  CANAL,
  ALMACENES,
  Autonomia,
  crear,
  // Los reflejos se re-exportan para que un consumidor no tenga que saber en que
  // fichero vive: `autonomia/index.js#politica` es el nombre del plano.
  casillas,
  nivel,
  ventana,
  puerta,
  autorizaciones,
  politica
};

module.exports.CasillaDeAccion = casillas.CasillaDeAccion;
module.exports.NivelDeAutonomia = nivel.NivelDeAutonomia;
module.exports.VentanaDeArrepentimiento = ventana.VentanaDeArrepentimiento;
module.exports.PuertaDeConfirmacion = puerta.PuertaDeConfirmacion;
module.exports.RegistroDeAutorizaciones = autorizaciones.RegistroDeAutorizaciones;
module.exports.PoliticaDeAutonomia = politica.PoliticaDeAutonomia;
