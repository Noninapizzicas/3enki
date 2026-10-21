/**
 * contabilidad-analitica/etiquetado-analitico — MICRO-AGENTE (J1, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * ASIGNA centro/linea/producto a cada hecho con REGLA DECLARABLE. PROPONE.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * Es la mitad REFLEJA (determinista) del micro-agente: aplica las reglas DECLARADAS de
 * etiquetado a un hecho y expone la ETIQUETA PROPUESTA. NO fija nada por su cuenta: lo que
 * las reglas declaran se aplica; lo que NO cubren NO se rellena — va a la cola (A8.1).
 *
 * Invariantes:
 *  - PROPONE, no escribe: `juzgar` deriva una propuesta; NUNCA la apila en el dominio.
 *  - Dato ausente = desconocido: sin hecho NO hay nada que etiquetar; sin regla que cubra,
 *    la etiqueta queda ABIERTA (no se adivina el centro de coste).
 *  - Cuando la regla NO cubre → SUBE `encolado-excepcion.encolar.request` (lo dudoso a cola).
 *
 * ESCUCHA (R3): contabilidad.hecho_recibido (puerto-evento-vertical A1) y
 * contabilidad.criterio_fijado (cola-declaraciones-criterio) → ambos con emisor vivo.
 * Los handlers son fire-and-forget (toman constancia del contexto; no anuncian hecho).
 *
 * Forma: MICRO-AGENTE (mitad refleja) → STATELESS. Sin PosPersistencia.
 * RPC juzgar es CLASE PREGUNTA → SIN ui_handler.
 * Ver hoja J1 del plan-construccion y diseno-oop.md (CLASE EtiquetadoAnalitico).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class EtiquetadoAnalitico extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'etiquetado-analitico';
    this.version = 'reflejo-0.1.0';
    // Criterios/reglas de etiquetado observados por proyecto (memoria acotada, no store).
    this._criterios = new Map(); // project_id -> [criterio]
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC PREGUNTA (sin ui_handler: su cara es el bus) ──
  onJuzgarRequest(e) {
    return this._atender(e, 'juzgar', 'etiquetado-analitico.juzgar.response', (d) => {
      const res = this._juzgar(d);
      // Micro-agente (mitad refleja): PROPONE; no escribe dominio → no hay hecho que anunciar (R2).
      if (res.status !== 200) {
        this.eventBus?.publish('etiquetado-analitico.juzgar.failed', res);
      } else if (res.data && res.data.propuesta && !res.data.propuesta.completa) {
        // La regla NO cubre el hecho → lo dudoso va a la cola (A8.1). No se adivina la etiqueta.
        this.eventBus?.publish('encolado-excepcion.encolar.request', {
          project_id: res.data.project_id,
          rol: 'ETIQUETADO_ANALITICO',
          clave: res.data.clave || `etiquetado:${res.data.hecho_id || 's/ref'}`,
          motivo: 'ninguna regla declarada cubre este hecho: la etiqueta analitica queda abierta (no se adivina)',
          origen: 'etiquetado-analitico',
          payload: { dimensiones: res.data.propuesta.dimensiones, faltan: res.data.propuesta.faltan },
          correlation_id: d.correlation_id
        });
      }
      return res;
    });
  }

  // ── handlers FIRE-AND-FORGET: contexto declarado (hecho / criterio) ──
  onHechoRecibido(e) {
    const d = (e && (e.data || e)) || {};
    try {
      this.logger?.info(`${this.name}.contexto.hecho`, { project_id: d.project_id || null });
    } catch (err) {
      this.logger?.error(`${this.name}.hecho_recibido.error`, { error: err.message });
    }
  }

  // Se fijo un criterio declarable de etiquetado → se observa (memoria acotada) para aplicar.
  onCriterioFijado(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id || this.project_id;
    if (!pid) return;
    const lista = this._criterios.get(pid) || [];
    lista.push(d.criterio || d);
    if (lista.length > 500) lista.shift();
    this._criterios.set(pid, lista);
  }

  // ══════════════════════════════════════════════════════════════════════
  // juzgar(hecho) → PROPUESTA de etiqueta (PREGUNTA; PROPONE, no fija)
  // ══════════════════════════════════════════════════════════════════════
  _juzgar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const hecho = input.hecho !== undefined ? input.hecho
      : (input.evento !== undefined ? input.evento : null);
    if (!hecho || typeof hecho !== 'object') return this._invalid('hecho');

    const hecho_id = hecho.hecho_id != null ? String(hecho.hecho_id) : null;
    const clave = input.clave != null ? String(input.clave) : (hecho.clave != null ? String(hecho.clave) : null);

    // Las DIMENSIONES declarables (centro/linea/producto). El conjunto es DATO, no constante oculta.
    const dimensiones = this._dimensiones(input.dimensiones);

    // Las reglas: declaradas en el input, o los criterios observados (fire-and-forget).
    const reglas = Array.isArray(input.reglas) && input.reglas.length
      ? input.reglas
      : (this._criterios.get(pid) || []);

    const propuesta = [];
    const faltan = [];
    for (const dim of dimensiones) {
      const valor = this._aplica(reglas, dim, hecho, input);
      if (valor != null) {
        propuesta.push({ dimension: dim, valor: String(valor), fuente: 'regla_declarada' });
      } else {
        propuesta.push({ dimension: dim, valor: null, fuente: null });
        faltan.push(dim);
      }
    }

    const completa = faltan.length === 0 && propuesta.length > 0;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'etiquetado-analitico',
        hecho_id,
        clave,
        dimensiones,
        propuesta: {
          etiquetas: propuesta,
          dimensiones: propuesta.reduce((acc, p) => { acc[p.dimension] = p.valor; return acc; }, {}),
          completa,
          faltan: faltan.length ? faltan : null
        },
        // PROPONE; el corte duro (fijar la etiqueta) NO es de esta hoja.
        propone: true,
        fija: false,
        reglas_aplicadas: reglas.length,
        // Lo no cubierto por una regla declarada es juicio: queda abierto (no se estima).
        abierto: completa ? null
          : `no hay regla declarada que cubra: ${faltan.join(', ')} — la etiqueta queda abierta (es juicio, no se adivina)`
      }
    };
  }

  // Las dimensiones a etiquetar: declaradas en el input, o las canonicas (dato por defecto).
  _dimensiones(v) {
    if (Array.isArray(v) && v.length) return v.map((x) => String(x));
    return ['centro', 'linea', 'producto'];
  }

  // Aplica la primera regla declarada que CUBRE la dimension. Sin regla → null (no se adivina).
  _aplica(reglas, dim, hecho, input) {
    for (const r of reglas) {
      if (!r || typeof r !== 'object') continue;
      // La regla declara que dimension etiqueta y con que valor.
      if (r.dimension && String(r.dimension) !== dim) continue;
      // La condicion: un campo del hecho que debe igualar al valor declarado (si viene).
      if (r.campo != null) {
        const v = hecho[String(r.campo)] !== undefined ? hecho[String(r.campo)]
          : input[String(r.campo)];
        if (r.igual != null && String(v) !== String(r.igual)) continue;
        if (r.en != null && !Array.isArray(r.en)) continue;
        if (Array.isArray(r.en) && !r.en.map(String).includes(String(v))) continue;
      }
      const valor = r.valor ?? r[dim] ?? r.etiqueta;
      if (valor != null && String(valor).trim() !== '') return valor;
    }
    // Valor declarado directamente en el hecho (no es adivinar: es leer lo declarado).
    if (hecho[dim] != null && String(hecho[dim]).trim() !== '') return hecho[dim];
    return null;
  }

  // ── Tools ──
  toolJuzgar(params) { return this._juzgar(params); }
}

module.exports = EtiquetadoAnalitico;
