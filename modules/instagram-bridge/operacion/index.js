'use strict';

/**
 * operacion — bloque 11a · publicar y sus fronteras.
 *
 * Cinco piezas con las que el puente PREPARA una pieza, la RETIRA y protege las
 * tres fronteras de alrededor:
 *
 *   L1 `PreparadorDePieza`      operacion/piezas.js     conversor (puro)
 *   L3 `RetiradaDePublicacion`  operacion/retirada.js   puente (compone)
 *   M3 `RecorteDePrivacidad`    core/recorte.js         reflejo (puro)
 *   S1 `DestinatarioPrevio`     puente/destinatario.js  reflejo (puro)
 *   S2 `DetectorDeFueraDeAlcance` puente/alcance.js     reflejo (puro)
 *
 * Este fichero es el BORDE: correlacion de eventos, los puertos de L3 y el
 * UNICO IO del bloque — el respaldo de lo que habia antes de retirar, en
 * `storage/instagram-bridge/respaldos-retirada.json`, append-only, con escritura
 * temporal + rename y un candado de single-writer.
 *
 * LO QUE ESTE BORDE NO HACE, A PROPOSITO:
 *   - **No ejecuta nada.** La mano (A3) se inyecta; si no esta, la retirada
 *     devuelve `sin_puerto` con el nombre del que falta. El puente compone.
 *   - **No concede permisos.** Q6 (`autonomia/politica.js`) es el que decide; y
 *     L3 le pasa el nivel CON TECHO, asi que el nivel declarado no compra una
 *     retirada. Aqui no hay ninguna via para saltarse esa consulta.
 *   - **No verifica.** O (el verificador) tambien se inyecta: "ya no esta" lo
 *     afirma una observacion, no este modulo.
 *   - **No tiene reloj.** Ni un `Date.now()`: el `momento` viene en el payload.
 *     `guardado_en` del respaldo es metadato del fichero, no del negocio.
 *   - **No recorta, no detecta, no prepara.** Esas cuatro piezas son puras y se
 *     llaman tal cual: un reflejo envuelto en IO deja de ser un reflejo.
 */

const path = require('path');
const fsp = require('fs/promises');

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const { es_objeto, texto_no_vacio } = require('../core/formas');

const piezas = require('./piezas');
const retirada = require('./retirada');
const recorte = require('../core/recorte');
const destinatario = require('../puente/destinatario');
const alcance = require('../puente/alcance');
const politica = require('../autonomia/politica');
const evidencia = require('../puente/evidencia');

const ESQUEMA_RESPALDOS = 'respaldos-retirada-v1';
const FICHERO_RESPALDOS = 'respaldos-retirada.json';
const DIR_POR_DEFECTO = path.resolve(__dirname, '../../../storage/instagram-bridge');

const TOPICS = Object.freeze({
  PIEZA_ADMITIR: 'instagram.operacion.pieza.admitir.request',
  PIEZA_PREPARAR: 'instagram.operacion.pieza.preparar.request',
  RETIRADA: 'instagram.operacion.retirada.request',
  RECORTE_RECORTAR: 'instagram.operacion.recorte.recortar.request',
  RECORTE_AUDITAR: 'instagram.operacion.recorte.auditar.request',
  DESTINATARIO_COMPROBAR: 'instagram.operacion.destinatario.comprobar.request',
  ALCANCE_DETECTAR: 'instagram.operacion.alcance.detectar.request'
});

// ---------------------------------------------------------------------------
// respaldo: lo que habia antes de retirar
// ---------------------------------------------------------------------------

function estado_vacio() {
  return { esquema: ESQUEMA_RESPALDOS, revision: 0, respaldos: [] };
}

function es_estado(estado) {
  return es_objeto(estado) && estado.esquema === ESQUEMA_RESPALDOS && Array.isArray(estado.respaldos);
}

/**
 * Custodio minimo del respaldo. Append-only: un respaldo no se edita ni se
 * borra (borrarlo seria borrar la prueba de lo que habia, que es justo lo que
 * la retirada existe para conservar). Idempotente por `respaldo_id`: reenviar
 * la misma orden no duplica el asiento.
 */
class RespaldoDeRetiradas {
  constructor(opts = {}) {
    this._directorio = opts.directorio || process.env.ENKI_INSTAGRAM_STORAGE || DIR_POR_DEFECTO;
    this._fichero = path.join(this._directorio, opts.fichero || FICHERO_RESPALDOS);
    this._estado = estado_vacio();
    this._cargado = false;
    this._ilegible = null;
    this._cola = Promise.resolve();
    this._reloj = opts.reloj || (() => new Date().toISOString());
  }

  async _leer() {
    try {
      const crudo = await fsp.readFile(this._fichero, 'utf8');
      const datos = JSON.parse(crudo);
      if (!es_estado(datos)) { this._ilegible = 'esquema_desconocido'; return estado_vacio(); }
      return datos;
    } catch (err) {
      if (err && err.code === 'ENOENT') return estado_vacio();
      this._ilegible = err && err.code === 'EACCES' ? 'respaldos_sin_permiso' : 'respaldos_ilegibles';
      return estado_vacio();
    }
  }

  async cargar() {
    this._estado = await this._leer();
    this._cargado = true;
    return { ok: this._ilegible === null, motivo: this._ilegible };
  }

  async _escribir(estado) {
    await fsp.mkdir(this._directorio, { recursive: true });
    const temporal = `${this._fichero}.${process.pid}.tmp`;
    await fsp.writeFile(temporal, `${JSON.stringify(estado, null, 2)}\n`, 'utf8');
    await fsp.rename(temporal, this._fichero);
  }

  /**
   * Guarda el estado de lo publicado. Devuelve siempre `respaldo_id` cuando el
   * asiento existe (nuevo o ya estaba), para que la evidencia pueda anclarse.
   */
  conservar(snapshot) {
    const siguiente = this._cola.then(async () => {
      if (!this._cargado) await this.cargar();
      if (this._ilegible) return { ok: false, motivo: this._ilegible, guardado: false };

      const s = es_objeto(snapshot) ? snapshot : {};
      const id = texto_no_vacio(s.respaldo_id) ? String(s.respaldo_id).trim() : null;
      if (!id) return { ok: false, motivo: 'respaldo_sin_id', faltan: ['respaldo_id'], guardado: false };
      if (!texto_no_vacio(s.referencia)) return { ok: false, motivo: 'respaldo_sin_referencia', faltan: ['referencia'], guardado: false };

      const ya = this._estado.respaldos.find((r) => r && r.respaldo_id === id);
      if (ya) return { ok: true, respaldo_id: id, repetido: true, guardado: true };

      const asiento = Object.assign({}, s, { respaldo_id: id, guardado_en: this._reloj() });
      const estado = {
        esquema: ESQUEMA_RESPALDOS,
        revision: Number(this._estado.revision) + 1,
        respaldos: this._estado.respaldos.concat([asiento])
      };

      try {
        await this._escribir(estado);
      } catch (err) {
        return {
          ok: false,
          motivo: err && err.code === 'ENOSPC' ? 'disco_lleno' : 'no_se_pudo_guardar',
          detalle: err && err.message,
          guardado: false
        };
      }

      this._estado = estado;
      return { ok: true, respaldo_id: id, guardado: true };
    });

    this._cola = siguiente.then(() => undefined, () => undefined);
    return siguiente;
  }

  /** Cuantos respaldos hay (para el log de carga y para el dueno). */
  total() {
    return this._estado.respaldos.length;
  }

  /** Espera a que termine la escritura en curso (parada limpia). */
  drenar() {
    return this._cola;
  }

  recuperar(respaldo_id) {
    return this._cola.then(async () => {
      if (!this._cargado) await this.cargar();
      if (this._ilegible) return { ok: false, motivo: this._ilegible };
      const r = this._estado.respaldos.find((x) => x && x.respaldo_id === String(respaldo_id)) || null;
      return { ok: true, respaldo: r, encontrado: r !== null };
    });
  }
}

// ---------------------------------------------------------------------------
// el modulo
// ---------------------------------------------------------------------------

class Operacion extends ModuloHibridoReflejo {
  /**
   * @param {{directorio?:string, fichero_respaldos?:string,
   *          permiso?:object, respaldo?:object, mano?:object,
   *          verificador?:object, evidencia?:object}} [opts]
   */
  constructor(opts = {}) {
    super();
    this.name = 'operacion';
    this.version = '0.1.0';

    this._directorio = opts.directorio || process.env.ENKI_INSTAGRAM_STORAGE || DIR_POR_DEFECTO;

    // Q6 por defecto: la politica REAL, que es pura. Inyectar otra cosa es
    // posible en pruebas, pero no hay un camino que se la salte.
    this._permiso = opts.permiso || { decidir: (peticion) => politica.decidir(peticion) };

    this._respaldo = opts.respaldo || new RespaldoDeRetiradas({
      directorio: this._directorio,
      fichero: opts.fichero_respaldos
    });

    this._mano = opts.mano || null;
    this._verificador = opts.verificador || null;

    this._evidencia = opts.evidencia || new evidencia.EvidenciaConservada({ directorio: path.join(this._directorio, 'evidencia') });

    this._retiradas = 0;
    this._piezas = 0;
    this._recortes = 0;
  }

  get retirada() {
    // Se construye con los puertos de HOY: si la mano se inyecta en onLoad,
    // entra sin reconstruir el modulo.
    return new retirada.RetiradaDePublicacion({
      permiso: this._permiso,
      respaldo: this._respaldo,
      mano: this._mano,
      verificador: this._verificador,
      evidencia: this._evidencia
    });
  }

  async onLoad(context) {
    await super.onLoad(context);
    this._evidencia.onLoad({ eventBus: this.eventBus, logger: this.logger });
    const estado = await this._respaldo.cargar();
    this.logger?.info('operacion.loaded', {
      module: this.name,
      respaldos: this._respaldo.total(),
      respaldos_ok: estado.ok,
      mano: this._mano !== null,
      verificador: this._verificador !== null
    });
  }

  async onUnload() {
    await this._respaldo.drenar();
    return super.onUnload();
  }

  /** RPC uniforme del bloque: `ok:false` con motivo, nunca un error mudo. */
  async _responder(topic, event, fn) {
    const d = (event && event.data) || event || {};
    const request_id = d.request_id === undefined ? null : d.request_id;
    let r;
    try {
      r = await fn(d);
    } catch (err) {
      this.logger?.error('operacion.failed', { topic, error: err && err.message });
      r = { ok: false, motivo: 'entrada_invalida', detalle: err && err.message };
    }

    if (r && r.ok === true) {
      const payload = Object.assign({ request_id, ok: true }, r);
      this.eventBus?.publish(`${topic}.response`, payload);
      return payload;
    }

    const fallo = { request_id, ok: false, motivo: (r && r.motivo) || 'entrada_invalida' };
    if (r && es_objeto(r)) {
      for (const campo of Object.keys(r)) {
        if (['ok', 'motivo'].includes(campo)) continue;
        if (r[campo] === undefined) continue;
        fallo[campo] = r[campo];
      }
    }
    this.eventBus?.publish(`${topic}.failed`, fallo);
    return fallo;
  }

  // ---- L1 ---------------------------------------------------------------

  onPiezaAdmitirRequest(event) {
    return this._responder(TOPICS.PIEZA_ADMITIR, event, (d) => {
      const r = piezas.admitir(d.pieza, d.opciones || d);
      this._piezas += 1;
      return r;
    });
  }

  onPiezaPrepararRequest(event) {
    return this._responder(TOPICS.PIEZA_PREPARAR, event, (d) => {
      const r = piezas.adaptar(d.pieza, d.opciones || d);
      this._piezas += 1;
      return r;
    });
  }

  // ---- L3 ---------------------------------------------------------------

  onRetiradaRequest(event) {
    return this._responder(TOPICS.RETIRADA, event, async (d) => {
      const operacion = texto_no_vacio(d.operacion) ? String(d.operacion).trim() : 'retirar';
      if (!retirada.OPERACIONES.includes(operacion)) {
        return { ok: false, motivo: retirada.MOTIVOS.OPERACION_DESCONOCIDA, admitidas: retirada.OPERACIONES.slice() };
      }
      const r = await this.retirada[operacion](d);
      if (r.ok === true) this._retiradas += 1;
      return r;
    });
  }

  // ---- M3 ---------------------------------------------------------------

  onRecorteRecortarRequest(event) {
    return this._responder(TOPICS.RECORTE_RECORTAR, event, (d) => {
      const r = recorte.recortar(d.hecho || d.hecho_visible, d.opciones || { campos_extra: d.campos_extra });
      if (r.ok === true) this._recortes += 1;
      return r;
    });
  }

  onRecorteAuditarRequest(event) {
    return this._responder(TOPICS.RECORTE_AUDITAR, event, (d) => recorte.auditar(d.retrato || d.hecho));
  }

  // ---- S1 ---------------------------------------------------------------

  onDestinatarioComprobarRequest(event) {
    return this._responder(TOPICS.DESTINATARIO_COMPROBAR, event, (d) => {
      const r = destinatario.comprobar(d.destinatario, d.conversacion);
      // Un rechazo de frontera NO es un error del sistema: se devuelve `ok:true`
      // con `legitimo:false` y su motivo, para que el borde de envio lo cuente
      // como decision y no como averia. Por eso se fuerza `ok` al final: el
      // `ok:false` de la comprobacion significa "no hay envio", no "hay fallo".
      return Object.assign({}, r, { ok: true, hay_envio: r.legitimo === true });
    });
  }

  // ---- S2 ---------------------------------------------------------------

  onAlcanceDetectarRequest(event) {
    return this._responder(TOPICS.ALCANCE_DETECTAR, event, (d) => alcance.detectar(d.peticion || d, d.interlocutor));
  }
}

function crear(opts) {
  return new Operacion(opts);
}

module.exports = {
  TOPICS,
  ESQUEMA_RESPALDOS,
  RespaldoDeRetiradas,
  Operacion,
  crear,
  piezas,
  retirada,
  recorte,
  destinatario,
  alcance,
  politica
};

module.exports.PreparadorDePieza = piezas;
module.exports.RetiradaDePublicacion = retirada.RetiradaDePublicacion;
module.exports.RecorteDePrivacidad = recorte;
module.exports.DestinatarioPrevio = destinatario;
module.exports.DetectorDeFueraDeAlcance = alcance;
