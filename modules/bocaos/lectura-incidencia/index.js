'use strict';

/**
 * lectura-incidencia · MICRO-AGENTE · PLAZA — F07 (LecturaDeIncidencia). El BORDE.
 *
 * Lee el relato libre de una incidencia y lo pone en una ETIQUETA DE LA LISTA CERRADA. Prepara el
 * caso para que un humano lo lea antes; no dictamina nada.
 *
 * Tres reglas que son el módulo:
 *
 *   1. LA LISTA ES CERRADA. Cinco etiquetas y ninguna más: no encontraba el portal · el cliente no
 *      bajaba · el local no estaba listo · dirección incorrecta · otro. Un campo nuevo se RECHAZA,
 *      no se inventa. El validador es lo que hace honesta la mitad fuzzy: si el modelo devuelve algo
 *      que no está en la lista, la lectura se tira y el caso sigue su curso SIN etiqueta.
 *   2. NO ES JUEZ. No dice si el fallo existió (eso es G02 con hechos) ni a quién culpar. Devuelve
 *      campos, no un veredicto: `es_juez: false`, `dice_si_hubo_fallo: false`.
 *   3. SI SE CAE, EL CENTRO NO SE ENTERA. Sin modelo, con el modelo caído o tardando, la incidencia
 *      entra SIN clasificar y sigue su curso. El borde puede fallar sin que el negocio pare.
 *
 * El cajón del agente (`cajon_clasificar`) NO va en `module.json.subscribes`: es una proyección
 * interna, y la regla anti-colisión del ecosistema lo prohíbe (validate-hibridos).
 *
 * Isla: cero require a otra isla. Sin estado: lo que llega en el evento se lee y se va.
 */

const ModuloBocaos = require('../_bocaos');

// La lista CERRADA. Es la del diseño (F07), no una taxonomía que se pueda ampliar por comodidad.
const ETIQUETAS = [
  'no_encontraba_el_portal',
  'el_cliente_no_bajaba',
  'el_local_no_estaba_listo',
  'direccion_incorrecta',
  'otro'
];

const LLM_TIMEOUT_MS = 1500;

class LecturaIncidencia extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'lectura-incidencia';
    this.version = 'micro-agente-0.1.0';
    this._path = null;                 // sin estado: lee y devuelve
    this.llm = null;                   // inyectable: ({relato, etiquetas}) → string | {etiqueta, campos}
    this.llm_timeout_ms = LLM_TIMEOUT_MS;
  }

  // ================= RPC del bus =================
  onClasificarRequest(e) { return this.servir(e, 'clasificar', 'lectura-incidencia.clasificar', (d) => this._clasificar(d)); }

  // ================= F07 · clasificar (ORDEN) =================
  async _clasificar(d) {
    if (!d.project_id) return this._invalid('project_id');
    const relato = typeof d.relato === 'string' ? d.relato.trim() : '';
    if (!relato) {
      return this._errorResponse(400, 'INVALID_INPUT',
        'relato requerido: sin relato no hay nada que leer (y no se redacta uno)', { field: 'relato' });
    }

    const leida = await this._leer(relato);
    const juicio = this._validador(leida, relato);
    const rechazados = juicio.campos_rechazados || null;

    if (!juicio.ok) {
      // F07 · la lectura ambigua NO para el caso: entra en la cola sin etiqueta y con el motivo.
      this.hecho('bocaos.lectura_ambigua', {
        incidencia_id: d.incidencia_id || null,
        pedido_id: d.pedido_id || null,
        plaza_id: d.plaza_id || this.plaza_id || d.project_id,
        motivo: juicio.motivo,
        etiqueta_rechazada: juicio.etiqueta_rechazada || null,
        etiquetas_permitidas: ETIQUETAS,
        sigue_su_curso: true,
        hora: this.ahora()
      });
      return {
        status: 200,
        data: {
          incidencia_id: d.incidencia_id || null,
          etiqueta: null,
          clasificado: false,
          motivo: juicio.motivo,
          // El borde falla y el centro no se entera.
          sigue_su_curso: true,
          es_juez: false,
          dice_si_hubo_fallo: false
        }
      };
    }

    this.hecho('bocaos.incidencia_clasificada', {
      incidencia_id: d.incidencia_id || null,
      pedido_id: d.pedido_id || null,
      plaza_id: d.plaza_id || this.plaza_id || d.project_id,
      etiqueta: juicio.etiqueta,
      campos: juicio.campos,
      campos_rechazados: rechazados,
      fuente: leida.fuente,
      // F07 · lo que este hecho NO dice, y hay que poder verlo en el propio hecho.
      es_juez: false,
      dice_si_hubo_fallo: false,
      hora: this.ahora()
    });

    return {
      status: 200,
      data: {
        incidencia_id: d.incidencia_id || null,
        etiqueta: juicio.etiqueta,
        campos: juicio.campos,
        campos_rechazados: rechazados,
        clasificado: true,
        fuente: leida.fuente,
        es_juez: false,
        dice_si_hubo_fallo: false
      }
    };
  }

  // ================= el cajón (mitad fuzzy, opcional) =================
  async _leer(relato) {
    if (typeof this.llm !== 'function') {
      return { etiqueta: null, campos: null, fuente: 'sin_modelo', motivo: 'sin lectura: no hay modelo inyectado' };
    }

    let timer = null;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ fallo: 'el modelo tardó más de lo que hay para leer' }), this.llm_timeout_ms);
    });

    let salida;
    try {
      salida = await Promise.race([
        Promise.resolve().then(() => this.llm({ relato, etiquetas: [...ETIQUETAS] })),
        timeout
      ]);
    } catch (err) {
      if (timer) clearTimeout(timer);
      return { etiqueta: null, campos: null, fuente: 'modelo_caido', motivo: `el modelo falló: ${err.message}` };
    }
    if (timer) clearTimeout(timer);

    if (salida && salida.fallo) {
      return { etiqueta: null, campos: null, fuente: 'modelo_lento', motivo: salida.fallo };
    }
    if (typeof salida === 'string') {
      return { etiqueta: this._normaliza(salida), campos: null, fuente: 'llm' };
    }
    if (salida && typeof salida === 'object') {
      const campos = (salida.campos && typeof salida.campos === 'object') ? salida.campos : null;
      const etiqueta = typeof salida.etiqueta === 'string' ? this._normaliza(salida.etiqueta) : null;
      return { etiqueta, campos, fuente: 'llm' };
    }
    return { etiqueta: null, campos: null, fuente: 'modelo_vacio', motivo: 'el modelo no devolvió una etiqueta' };
  }

  // ================= F07 · el validador (lo que hace honesta la mitad fuzzy) =================
  // Sólo etiquetas de la lista. Nada más entra: ni una etiqueta nueva, ni una descripción libre.
  _validador(leida, relato) {
    if (!leida || !leida.etiqueta) {
      return {
        ok: false,
        motivo: leida && leida.motivo ? leida.motivo : 'sin lectura: el relato entra sin clasificar y sigue su curso',
        etiqueta_rechazada: null
      };
    }
    if (!ETIQUETAS.includes(leida.etiqueta)) {
      return {
        ok: false,
        motivo: `«${leida.etiqueta}» no está en la lista cerrada: un campo nuevo se rechaza, no se inventa`,
        etiqueta_rechazada: leida.etiqueta
      };
    }
    // Los campos que acompañan a la etiqueta tampoco se inventan: si el modelo devuelve un campo que
    // no está en la lista, se queda fuera y se dice cuál.
    const campos = {};
    const rechazados = [];
    for (const [k, v] of Object.entries(leida.campos || {})) {
      if (k === 'etiqueta' || k === 'campo' || k === 'descripcion') { campos[k] = v; continue; }
      rechazados.push(k);
    }
    return {
      ok: true,
      etiqueta: leida.etiqueta,
      campos: Object.keys(campos).length > 0 ? campos : null,
      campos_rechazados: rechazados.length > 0 ? rechazados : null
    };
  }

  _normaliza(v) {
    return String(v || '')
      .trim()
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }
}

module.exports = LecturaIncidencia;
module.exports.ETIQUETAS = ETIQUETAS;
