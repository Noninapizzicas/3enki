/**
 * contabilidad-entrada/anclaje-cierre-vertical — CUSTODIO CON PERSISTENCIA (A14, hoja del plan).
 *
 * La PARCELA declarable POR VERTICAL de QUE ES 'un cierre' y COMO se identifica. UN escritor.
 *
 * Un cierre no se adivina: cada vertical declara su anclaje (que hecho/que campo/que clave marca
 * el cierre). Sin anclaje declarado, el sistema PREGUNTA y NO inventa un criterio de cierre.
 *
 *   · anclar  — PREGUNTA: dada una senal de cierre, ¿es un cierre segun el anclaje declarado?
 *                Calcula la clave natural de la senal (clave-natural M3, por EVENTO) y la
 *                contrasta con el anclaje de la vertical. Deriva; no muta.
 *   · declarar — ORDEN: la vertical declara su anclaje de cierre (que es y como se identifica).
 *
 * Invariantes:
 *  - SIN ANCLAJE DECLARADO no hay cierre: `anclar` devuelve es_cierre:false y `abierto` (no se
 *    estima); y se SUBE una peticion best-effort a la cola declarativa (cola-declaraciones-criterio).
 *  - Dato ausente = desconocido: sin vertical o sin anclaje NO se declara nada.
 *  - No se borra: re-declarar APPENDEA al historial; el anclaje vigente es el ultimo declarado.
 *  - UN escritor por parcela (guard rol ANCLAJE_CIERRE; segundo escritor → 403).
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * R3 · ESCUCHA: `contabilidad.criterio_fijado` lo emite cola-declaraciones-criterio (K9) — existe.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja A14 del plan-construccion y diseno-oop.md (CLASE AnclajeCierreVertical).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la parcela de anclaje de cierre.
const ROL_ESCRITOR = 'ANCLAJE_CIERRE';

class AnclajeCierreVertical extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'anclaje-cierre-vertical';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, verticales: Map<vertical, Anclaje> }
    this._parcelas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'anclaje-cierre-vertical.json',
      dir: '/contabilidad/anclaje-cierre-vertical',
      snapshot: (pid) => {
        const p = this._parcelas.get(pid);
        if (!p) return null;
        return { project_id: pid, esquema: p.esquema, verticales: [...p.verticales.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const verticales = new Map();
        for (const v of (data.verticales || [])) if (v && v.vertical != null) verticales.set(String(v.vertical), v);
        this._parcelas.set(pid, { esquema: data.esquema || 'contabilidad-anclaje-cierre-vertical-v1', verticales });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura los anclajes de cierre del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler FIRE-AND-FORGET: el JEFE fijo un criterio (cola-declaraciones-criterio K9) ──
  // Si el criterio fijado es el tipo de cierre de una vertical, se anota la variacion (R2 no aplica:
  // no se crea un anclaje, solo se toma constancia para que la parcela no quede ciega).
  onCriterioFijado(e) {
    const d = (e && (e.data || e)) || {};
    try {
      const pid = d.project_id || this.project_id;
      if (!pid) return;
      const clave = d.clave != null ? String(d.clave).trim() : '';
      // Solo interesa el criterio de cierre/anclaje; el resto de la cola no toca esta parcela.
      if (!/cierre|anclaje/i.test(clave)) return;
      const p = this._obtenerOCrear(pid);
      p.updated_at = new Date().toISOString();
      this._persist.marcarDirty(pid);
    } catch (err) {
      this.logger?.error(`${this.name}.criterio_fijado.error`, { error: err.message });
    }
  }

  // ── handler RPC PREGUNTA (sin ui_handler: su cara es el bus) ──
  onAnclarRequest(e) {
    return this._atender(e, 'anclar', 'anclaje-cierre-vertical.anclar.response', async (d) => {
      const res = await this._anclar(d);
      // PREGUNTA: deriva (contrasta la senal con el anclaje); no escribe → sin hecho (R2).
      if (res.status !== 200) this.eventBus?.publish('anclaje-cierre-vertical.anclar.failed', res);
      else if (res.data && res.data.anclaje_declarado === false) this._subirPeticionCriterio(res.data.project_id, res.data.vertical);
      return res;
    });
  }

  // ── handler RPC ORDEN (ui_handler: la vertical declara su anclaje) ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'anclaje-cierre-vertical.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        // R2 · si ESCRIBE, anuncia el HECHO: la vertical declaro que es 'un cierre'.
        this.eventBus?.publish('contabilidad.anclaje_cierre_declarado', {
          project_id: res.data.project_id,
          vertical: res.data.vertical,
          anclaje: res.data.anclaje,
          declarado: true,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('anclaje-cierre-vertical.declarar.failed', res);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // anclar(senal, vertical) → ¿es un cierre? (PREGUNTA, deriva contra el anclaje declarado)
  // ══════════════════════════════════════════════════════════════════════
  async _anclar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const vertical = input.vertical != null ? String(input.vertical).trim() : '';
    if (!vertical) return this._invalid('vertical');

    const sign = input.senal !== undefined ? input.senal
      : (input.hecho !== undefined ? input.hecho : input.cierre);
    if (sign === undefined || sign === null) return this._invalid('senal');

    const p = this._parcelas.get(pid) || null;
    const anclaje = p ? (p.verticales.get(vertical) || null) : null;

    // SIN anclaje declarado NO hay cierre: no se estima; el sistema pregunta.
    if (!anclaje) {
      return {
        status: 200,
        data: {
          project_id: pid,
          vertical,
          senal: sign,
          es_cierre: false,
          anclaje_declarado: false,
          anclaje: null,
          clave_senal: null,
          abierto: { anclaje: `${vertical} no ha declarado su anclaje de cierre: el sistema pregunta, no decide` }
        }
      };
    }

    // Calcula la clave natural de la senal (clave-natural M3) por EVENTO — best-effort.
    const claveResp = await this._rpc('clave-natural.calcular.request', {
      project_id: pid,
      elemento: sign,
      componentes: Array.isArray(anclaje.componentes) && anclaje.componentes.length ? anclaje.componentes : undefined
    });
    const clave_senal = (claveResp && claveResp.status === 200 && claveResp.data) ? claveResp.data.clave : null;

    // El cierre se identifica por el CAMPO/CAMPO+VALOR declarado en el anclaje.
    const es_cierre = this._coincideAnclaje(anclaje, sign, clave_senal);

    return {
      status: 200,
      data: {
        project_id: pid,
        vertical,
        senal: sign,
        es_cierre,
        anclaje_declarado: true,
        anclaje,
        clave_senal,
        // El anclaje se DECLARA; el sistema solo lo aplica.
        criterio_declarado_por: anclaje.declarado_por || ROL_ESCRITOR,
        abierto: { anclaje: null }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // declarar(vertical, anclaje) → que es 'un cierre' y como se identifica (ORDEN)
  // ══════════════════════════════════════════════════════════════════════
  _declarar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el escritor de la parcela (ANCLAJE_CIERRE) declara el anclaje de cierre de una vertical',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    const vertical = input.vertical != null ? String(input.vertical).trim() : '';
    if (!vertical) return this._invalid('vertical');

    const a = input.anclaje || input.a;
    if (!a || typeof a !== 'object') return this._invalid('anclaje');

    const p = this._obtenerOCrear(pid);
    const ahora = new Date().toISOString();
    const existente = p.verticales.get(vertical) || null;

    const anclaje = existente || { vertical, historial: [], declarado_en: null };
    // El anclaje DECLARA como se identifica un cierre: campo (+ valor) y/o componentes de la clave.
    anclaje.campo = a.campo != null ? String(a.campo) : (anclaje.campo ?? null);
    anclaje.valor = a.valor !== undefined ? a.valor : (anclaje.valor ?? null);
    anclaje.componentes = Array.isArray(a.componentes) ? a.componentes.map((c) => String(c)) : (anclaje.componentes || []);
    anclaje.descripcion = a.descripcion != null ? String(a.descripcion) : (anclaje.descripcion ?? null);
    anclaje.declarado_por = ROL_ESCRITOR;
    anclaje.declarado_en = ahora;
    anclaje.historial = Array.isArray(anclaje.historial) ? anclaje.historial : [];
    anclaje.historial.push({ campo: anclaje.campo, valor: anclaje.valor, componentes: anclaje.componentes, en: ahora });

    p.verticales.set(vertical, anclaje);
    p.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        vertical,
        anclaje,
        declarado: true,
        total_verticales: p.verticales.size,
        abierto: {
          campo: anclaje.campo ? null : 'no se declaro el campo que marca el cierre: el anclaje queda abierto',
          componentes: anclaje.componentes.length ? null : 'no se declararon componentes de la clave natural del cierre'
        }
      }
    };
  }

  // Decide si la senal es un cierre segun el anclaje: por campo/valor declarado y/o clave natural.
  _coincideAnclaje(anclaje, sign, clave_senal) {
    if (!anclaje || typeof anclaje !== 'object') return false;
    const obj = (sign && typeof sign === 'object') ? sign : {};
    let coincide = false;

    if (anclaje.campo) {
      const actual = obj[anclaje.campo];
      if (anclaje.valor === undefined || anclaje.valor === null) {
        coincide = actual !== undefined && actual !== null;
      } else {
        coincide = String(actual) === String(anclaje.valor);
      }
    }
    // Si el anclaje declara tambien una clave natural esperada, tambien debe coincidir.
    if (anclaje.clave != null && clave_senal != null) {
      coincide = coincide || String(clave_senal) === String(anclaje.clave);
    }
    return coincide;
  }

  // Peticion best-effort a la cola declarativa cuando falta el anclaje. NO suplanta al JEFE.
  _subirPeticionCriterio(pid, vertical) {
    try {
      if (pid) this._rpc('cola-declaraciones-criterio.fijar.request', {
        project_id: pid,
        clave: 'unidad_de_cierre',
        origen: 'anclaje-cierre-vertical',
        vertical: vertical || null
      }, { timeout_ms: 2000 });
    } catch (_) { /* best-effort */ }
  }

  _obtenerOCrear(pid) {
    let p = this._parcelas.get(pid);
    if (!p) {
      p = { esquema: 'contabilidad-anclaje-cierre-vertical-v1', verticales: new Map() };
      this._parcelas.set(pid, p);
      this._persist.marcarDirty(pid);
    }
    return p;
  }

  // Lectura directa (mismo proceso) — no muta.
  anclajesDe(pid) {
    const p = pid ? this._parcelas.get(pid) : null;
    return p ? [...p.verticales.values()] : [];
  }

  // ── Tools ──
  toolAnclar(params) { return this._anclar(params); }
  toolDeclarar(params) { return this._declarar(params); }
}

module.exports = AnclajeCierreVertical;
