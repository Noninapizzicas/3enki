/**
 * contabilidad-analitica/presupuesto — CUSTODIO CON PERSISTENCIA (J3, hoja del plan).
 *
 * La parcela de la CIFRA OBJETIVO por dimension declarable. El presupuesto NO se
 * estima: se DECLARA. El jefe/asesor fija el objetivo (dimension · periodo) y queda
 * como la vara contra la que `desviacion` (J4) y `comparador-periodos` (J9) miden el
 * real. Es UN SOLO ESCRITOR: solo el rol PRESUPUESTO fija objetivos; cualquier otro
 * rol es rechazado (segundo escritor → 403).
 *
 * Invariantes:
 *  - Nada se estima: un objetivo sin cifra declarada NO se rellena con un valor por
 *    defecto — queda [ABIERTO] (el sistema pregunta; no decide).
 *  - No se borra: re-fijar un objetivo APPENDEA a su historial con su fecha y su autor.
 *  - Dato ausente = desconocido: lo que no viene queda null, nunca 0.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y
 *    vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja J3 del plan-construccion y diseno-oop.md (CLASE Presupuesto).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la parcela del presupuesto.
const ROL_ESCRITOR = 'PRESUPUESTO';

class Presupuesto extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'presupuesto';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, objetivos: Map<clave, Objetivo> }
    this._presupuestos = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'presupuesto.json',
      dir: '/contabilidad/presupuesto',
      snapshot: (pid) => {
        const p = this._presupuestos.get(pid);
        if (!p) return null;
        return { project_id: pid, esquema: p.esquema, objetivos: [...p.objetivos.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const objetivos = new Map();
        for (const o of (data.objetivos || [])) if (o && o.clave != null) objetivos.set(String(o.clave), o);
        this._presupuestos.set(pid, { esquema: data.esquema || 'contabilidad-presupuesto-v1', objetivos });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el presupuesto del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC (una linea, delega a _atender). CLASE ORDEN → ui_handler ──
  onFijarRequest(e) {
    return this._atender(e, 'fijar', 'presupuesto.fijar.response', async (d) => {
      const res = this._fijar(d);
      if (res.status === 200) {
        // R2 · si ESCRIBE, anuncia el HECHO: un objetivo quedo fijado (o sigue [ABIERTO]).
        this.eventBus?.publish('contabilidad.presupuesto_fijado', {
          project_id: res.data.project_id,
          clave: res.data.clave,
          dimension: res.data.objetivo.dimension,
          periodo: res.data.objetivo.periodo,
          importe: res.data.objetivo.importe,
          moneda: res.data.objetivo.moneda,
          estado: res.data.objetivo.estado,
          abierto: res.data.abierto,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('presupuesto.fijar.failed', res);
      }
      return res;
    });
  }

  // ── handler RPC (PREGUNTA → sin ui_handler: su cara es el bus) ──
  onObjetivoRequest(e) {
    return this._atender(e, 'objetivo', 'presupuesto.objetivo.response', async (d) => {
      const res = this._objetivo(d);
      // Reflejo de lectura: no cambia estado → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('presupuesto.objetivo.failed', res);
      return res;
    });
  }

  // ── proyeccion de escritura (UN escritor): fijar la cifra objetivo ──
  _fijar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el rol del presupuesto fija objetivos.
    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el escritor del presupuesto (PRESUPUESTO) fija objetivos',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    const dimension = input.dimension != null ? String(input.dimension).trim()
      : (input.clave != null ? String(input.clave).trim() : '');
    if (!dimension) return this._invalid('dimension');

    const periodo = (input.periodo !== undefined && input.periodo !== null && String(input.periodo).trim() !== '')
      ? String(input.periodo).trim() : null;

    // La CIFRA objetivo: declarada. Ausente/vacia NO se estima → queda [ABIERTO].
    const importe = this._num(input.importe !== undefined ? input.importe
      : (input.objetivo !== undefined ? input.objetivo
        : (input.cifra !== undefined ? input.cifra : null)));

    const clave = this._clave(dimension, periodo);
    const p = this._obtenerOCrear(pid);
    const ahora = new Date().toISOString();
    const existente = p.objetivos.get(clave) || null;

    const objetivo = existente || {
      clave, dimension, periodo, importe: null, moneda: null,
      estado: 'ABIERTO', fijado_por: null, fijado_en: null, historial: []
    };
    objetivo.dimension = dimension;
    objetivo.periodo = periodo;

    if (importe !== null) {
      objetivo.importe = importe;
      objetivo.estado = 'DECLARADO';
      objetivo.fijado_por = ROL_ESCRITOR;
      objetivo.fijado_en = ahora;
    } else {
      // El sistema pregunta y el jefe aun no ha declarado la cifra: sigue [ABIERTO].
      objetivo.importe = null;
      objetivo.estado = 'ABIERTO';
      objetivo.fijado_en = objetivo.fijado_en || ahora;
    }
    if (input.moneda !== undefined) objetivo.moneda = input.moneda != null ? String(input.moneda) : null;

    objetivo.historial = Array.isArray(objetivo.historial) ? objetivo.historial : [];
    objetivo.historial.push({ estado: objetivo.estado, importe: objetivo.importe, por: ROL_ESCRITOR, en: ahora });

    p.objetivos.set(clave, objetivo);
    p.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: { project_id: pid, clave, objetivo, fijado: true, abierto: objetivo.estado === 'ABIERTO' }
    };
  }

  // ── proyeccion de lectura: la cifra objetivo vigente (o [ABIERTO]) ──
  _objetivo(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const dimension = input.dimension != null ? String(input.dimension).trim()
      : (input.clave != null ? String(input.clave).trim() : '');
    if (!dimension) return this._invalid('dimension');

    const periodo = (input.periodo !== undefined && input.periodo !== null && String(input.periodo).trim() !== '')
      ? String(input.periodo).trim() : null;
    const clave = this._clave(dimension, periodo);

    const p = this._presupuestos.get(pid) || null;
    const objetivo = p ? (p.objetivos.get(clave) || null) : null;

    if (!objetivo) {
      // El sistema pregunta y NO estima: sin objetivo fijado no se inventa una cifra.
      return {
        status: 200,
        data: {
          project_id: pid, clave, dimension, periodo, objetivo: null,
          abierto: true, motivo: 'el objetivo no esta fijado: el sistema pregunta, no estima'
        }
      };
    }
    return {
      status: 200,
      data: { project_id: pid, clave, dimension, periodo, objetivo, abierto: objetivo.estado === 'ABIERTO' }
    };
  }

  _clave(dimension, periodo) { return `${periodo || '*'}::${dimension}`; }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  _obtenerOCrear(pid) {
    let p = this._presupuestos.get(pid);
    if (!p) {
      p = { esquema: 'contabilidad-presupuesto-v1', objetivos: new Map() };
      this._presupuestos.set(pid, p);
      this._persist.marcarDirty(pid);
    }
    return p;
  }

  // ── Tools ──
  toolFijar(params) { return this._fijar(params); }
  toolObjetivo(params) { return this._objetivo(params); }
}

module.exports = Presupuesto;
