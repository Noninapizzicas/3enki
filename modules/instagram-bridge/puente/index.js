'use strict';

/**
 * puente — la BOCA del puente (bloque 13) y el FALLO CONTADO (bloque 14).
 *
 * Cinco piezas pequenas que comparten oficio: hablar con el dueno. Dos de ida
 * (entender lo que pide y completar lo que falta), una de vuelta (contar lo que
 * paso) y dos para cuando algo va mal (traducir el fallo y avisar antes de que
 * pregunten).
 *
 *   C1 `ClasificadorDePeticion`  puente/clasificador.js  micro-agente
 *   C2 `CompletadorDePeticion`   puente/completador.js   micro-agente
 *   C4 `NarradorDeResultado`     puente/narrador.js      micro-agente
 *   R2 `TraductorDeFallo`        puente/traductor.js     micro-agente
 *   R4 `AvisoAnticipado`         puente/avisos.js        puente
 *
 * LAS CUATRO REGLAS QUE ESTE BLOQUE HACE EJECUTABLES (una por pieza, y no son
 * estilo: son la diferencia entre un puente y un loro):
 *   - bajo el umbral, DOS candidatas y una pregunta; no se elige (C1);
 *   - una respuesta que no encaja se repregunta UNA VEZ, y despues se rinde con
 *     lo que tenga (C2);
 *   - NUNCA se dice «hecho» sin veredicto `ocurrio` Y evidencia (C4);
 *   - al dueno no se le nombran pantallas, botones ni tecnicos: se le dice que
 *     hace falta (R2);
 *   - UN aviso por causa y ventana (R4).
 *
 * ESTE FICHERO ES EL BORDE, Y ES LO UNICO QUE HACE: correlacion de eventos
 * (`request` → `response` | `failed`), traducir payloads del bus a las firmas de
 * las piezas y devolver lo que las piezas contestan. **No piensa**: si empieza a
 * decidir aqui, habra dos sitios donde se decide y uno de ellos sin tests.
 *
 * LO QUE ESTE BORDE NO HACE:
 *   - **No habla con el LLM.** Ninguna de las cinco lo necesita: sin LLM
 *     funcionan y con LLM no mejoran (el juicio, donde existe, es opcional y su
 *     fallo no rompe nada).
 *   - **No tiene reloj.** La `ventana` del aviso y el `momento` de la evidencia
 *     los trae quien llama.
 *   - **No guarda estado de negocio.** La unica memoria es la anti-repeticion de
 *     los avisos (claves `causa::ventana` en RAM, exportables con `avisados()` y
 *     rehidratables con `sembrar()`): es lo que hace posible «un aviso por causa
 *     y ventana» sin convertir este modulo en un custodio.
 *   - **No entrega avisos.** Los produce `motor-avisos` (real), que los sube a
 *     `aviso-al-negocio`; el canal es de `adaptador-avisos`. Aqui solo se pide.
 *   - **No narra a mano.** Las frases las viste `contabilidad-analitica/
 *     puente-lenguaje-dueno` (real) con las plantillas declaradas del puente.
 */

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const { es_objeto, texto_no_vacio } = require('../core/formas');

const clasificador = require('./clasificador');
const completador = require('./completador');
const narrador = require('./narrador');
const traductor = require('./traductor');
const avisos = require('./avisos');

const TOPICS = Object.freeze({
  PEDIR: 'instagram.pedir',
  COMPLETAR: 'instagram.completar',
  NARRAR: 'instagram.narrar',
  FALLO_TRADUCIR: 'instagram.fallo.traducir',
  AVISO_AVISAR: 'instagram.aviso.avisar'
});

class Puente extends ModuloHibridoReflejo {
  /**
   * @param {{juicio_peticion?:Function, aviso?:object}} [opts] `juicio_peticion`
   *   es OPCIONAL: sin el, C1 decide con su tabla. `aviso` permite inyectar el
   *   productor de avisos (pruebas); por defecto, `motor-avisos` por el bus.
   */
  constructor(opts = {}) {
    super();
    this.name = 'puente';
    this.version = '0.1.0';

    this._juicio_peticion = typeof opts.juicio_peticion === 'function' ? opts.juicio_peticion : null;

    this._avisos = opts.aviso instanceof avisos.AvisoAnticipado
      ? opts.aviso
      : new avisos.AvisoAnticipado(opts.aviso && typeof opts.aviso === 'object' ? opts.aviso : {});

    this._pedidas = 0;
    this._completadas = 0;
    this._narradas = 0;
    this._traducidos = 0;
    this._avisados = 0;
  }

  async onLoad(context) {
    await super.onLoad(context);
    this._avisos.con_bus(this.eventBus);
    this.logger?.info('puente.loaded', {
      module: this.name,
      juicio_peticion: this._juicio_peticion !== null,
      causas_de_aviso: Object.keys(avisos.CAUSAS).length,
      avisos_ya_dados: this._avisos.avisados().length
    });
  }

  /** RPC uniforme del bloque: `ok:false` con motivo, nunca un error mudo. */
  async _responder(topic, event, fn) {
    const d = (event && event.data) || event || {};
    const request_id = d.request_id === undefined ? null : d.request_id;
    let r;
    try {
      r = await fn(d);
    } catch (err) {
      this.logger?.error('puente.failed', { topic, error: err && err.message });
      r = { ok: false, motivo: 'entrada_invalida', detalle: err && err.message };
    }

    if (r && r.ok === true) {
      const payload = Object.assign({ request_id, ok: true }, r);
      this.eventBus?.publish(`${topic}.response`, payload);
      return payload;
    }

    const fallo = { request_id, ok: false, motivo: (r && r.motivo) || 'entrada_invalida' };
    if (es_objeto(r)) {
      for (const campo of Object.keys(r)) {
        if (campo === 'ok' || campo === 'motivo' || r[campo] === undefined) continue;
        fallo[campo] = r[campo];
      }
    }
    this.eventBus?.publish(`${topic}.failed`, fallo);
    return fallo;
  }

  // ── C1 (+ C2 cuando la capacidad esta clara) ──────────────────────────────

  onPedirRequest(event) {
    return this._responder(TOPICS.PEDIR, event, (d) => {
      const peticion = texto_no_vacio(d.peticion) ? d.peticion : d.texto;
      const clasificacion = clasificador.clasificar(peticion, {
        juicio: this._juicio_peticion,
        umbral: d.umbral,
        margen: d.margen
      });

      if (clasificacion.ok !== true) {
        return { ok: false, motivo: clasificacion.motivo, abierto: clasificacion.abierto };
      }

      this._pedidas += 1;

      // Bajo el umbral: se devuelven dos candidatas y la pregunta. NO se elige,
      // y por eso no se abre ningun estado de operacion: no hay capacidad.
      if (!clasificacion.decidida) {
        return {
          ok: true,
          decidida: false,
          capacidad: null,
          candidatas: clasificacion.candidatas,
          pregunta: clasificacion.pregunta,
          motivo: clasificacion.motivo,
          abierto: clasificacion.abierto
        };
      }

      // Capacidad clara: se abre el hueco de lo que falta y se pregunta lo primero.
      const abierta = completador.nueva(clasificacion.capacidad, peticion, d.datos || {});
      if (abierta.ok !== true) {
        return { ok: false, motivo: abierta.motivo, admitidas: abierta.admitidas };
      }

      return {
        ok: true,
        decidida: true,
        capacidad: clasificacion.capacidad,
        regla: clasificacion.regla || null,
        candidatas: clasificacion.candidatas,
        completo: completador.esta_completa(abierta.estado),
        pregunta: completador.siguiente_pregunta(abierta.estado),
        estado: abierta.estado,
        descartados: abierta.estado.descartados
      };
    });
  }

  // ── C2 ────────────────────────────────────────────────────────────────────

  onCompletarRequest(event) {
    return this._responder(TOPICS.COMPLETAR, event, (d) => {
      const r = completador.recibir(d.estado, d.respuesta);
      if (r.ok === true && r.encaja === true) this._completadas += 1;
      // Un «no encaja» NO es un error del puente: es una respuesta del dueno y
      // se devuelve como decision (ok:true) con lo que toca hacer.
      return Object.assign({}, r, { ok: r.ok === true });
    });
  }

  // ── C4 ────────────────────────────────────────────────────────────────────

  onNarrarRequest(event) {
    return this._responder(TOPICS.NARRAR, event, (d) => {
      const resultado = es_objeto(d.resultado) ? d.resultado : d;
      const r = narrador.narrar(resultado, { proyecto: d.proyecto || d.project_id || null });
      if (r.ok === true) this._narradas += 1;
      return r;
    });
  }

  // ── R2 ────────────────────────────────────────────────────────────────────

  onFalloTraducirRequest(event) {
    return this._responder(TOPICS.FALLO_TRADUCIR, event, (d) => {
      const fallo = d.fallo !== undefined ? d.fallo : d;
      const r = traductor.traducir(fallo);
      this._traducidos += 1;
      return r;
    });
  }

  // ── R4 ────────────────────────────────────────────────────────────────────

  onAvisoAvisarRequest(event) {
    return this._responder(TOPICS.AVISO_AVISAR, event, async (d) => {
      const r = await this._avisos.avisar(d);
      if (r.ok === true && r.avisado === true) this._avisados += 1;
      return r;
    });
  }

  // ── Tools (las mismas cinco, para el panel y para el chat) ────────────────

  toolPedir(params = {}) { return clasificador.clasificar(params.peticion || params.texto, { juicio: this._juicio_peticion }); }
  toolCompletar(params = {}) { return completador.recibir(params.estado, params.respuesta); }
  toolNarrar(params = {}) { return narrador.narrar(params.resultado || params, { proyecto: params.proyecto || null }); }
  toolTraducirFallo(params = {}) { return traductor.traducir(params.fallo !== undefined ? params.fallo : params); }
  async toolAvisar(params = {}) { return this._avisos.avisar(params); }

  /** Lo ya avisado, para que quien corresponda lo guarde antes de un reinicio. */
  avisados() { return this._avisos.avisados(); }

  /** Rehidrata la anti-repeticion de los avisos. */
  sembrar_avisados(claves) { return this._avisos.sembrar(claves); }
}

function crear(opts = {}) {
  return new Puente(opts);
}

module.exports = {
  TOPICS,
  Puente,
  crear,
  // Las cinco piezas se re-exportan para que un consumidor no tenga que saber
  // en que fichero vive cada una: `puente/index.js#clasificador` es su nombre.
  clasificador,
  completador,
  narrador,
  traductor,
  avisos
};
