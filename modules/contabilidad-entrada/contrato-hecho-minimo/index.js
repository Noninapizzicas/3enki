/**
 * contabilidad-entrada/contrato-hecho-minimo — CUSTODIO CON PERSISTENCIA (A11, hoja del plan).
 *
 * Parcela DECLARABLE del MÍNIMO exigible: la cara vista desde la FUENTE. UN escritor.
 * Responde a la pregunta "¿qué campos mínimos debe traer un hecho de esta vertical?" — y la
 * respuesta la DECLARA el JEFE/asesor; el módulo NO inventa un mínimo cableado.
 *
 * Invariantes:
 *  - `exigir` es PREGUNTA: contrasta un hecho contra el contrato declarado. No escribe → no anuncia hecho.
 *  - `declarar` es ORDEN/ESCRITURA: fija el contrato de una vertical → anuncia el HECHO.
 *  - SIN contrato declarado: `verificable:false` y `conforme:null` (no true). Un mínimo que no consta
 *    NO se da por cumplido por silencio (dato ausente = desconocido).
 *  - No se pisa en silencio: re-declarar APPENDEA al historial del contrato.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + UN escritor.
 * Ver hoja A11 del plan-construccion y diseno-oop.md (CLASE ContratoHechoMinimo).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

class ContratoHechoMinimo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'contrato-hecho-minimo';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, contratos: Map<vertical, Contrato> }
    this._contratos = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'contrato-hecho-minimo.json',
      dir: '/contabilidad/contrato-hecho-minimo',
      snapshot: (pid) => {
        const c = this._contratos.get(pid);
        if (!c) return null;
        return { project_id: pid, esquema: c.esquema, contratos: [...c.contratos.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const contratos = new Map();
        for (const ct of (data.contratos || [])) {
          if (ct && ct.vertical != null) contratos.set(String(ct.vertical), ct);
        }
        this._contratos.set(pid, { esquema: data.esquema || 'contabilidad-contrato-hecho-minimo-v1', contratos });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura los contratos de hecho mínimo del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC: exigir (PREGUNTA → sin ui_handler; su cara es el bus) ──
  onExigirRequest(e) {
    return this._atender(e, 'exigir', 'contrato-hecho-minimo.exigir.response', async (d) => {
      const res = this._exigir(d);
      // PREGUNTA: no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('contrato-hecho-minimo.exigir.failed', res);
      else if (res.data && res.data.verificable === false) {
        // Falta el contrato declarado: se deja la peticion en la cola (sin suplantar al JEFE).
        this._subirPeticionCriterio(res.data.project_id, res.data.vertical);
      }
      return res;
    });
  }

  // ── handler RPC: declarar (ORDEN → ui_handler panel) ──
  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'contrato-hecho-minimo.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        // R2 · si ESCRIBE, anuncia el HECHO: quedo declarado el mínimo exigible de una vertical.
        this.eventBus?.publish('contabilidad.contrato_hecho_declarado', {
          project_id: res.data.project_id,
          vertical: res.data.contrato.vertical,
          contrato: res.data.contrato,
          declarado: true,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contrato-hecho-minimo.declarar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion PREGUNTA: contrastar un hecho contra el contrato declarado ──
  _exigir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const vertical = input.vertical != null ? String(input.vertical).trim() : '';
    if (!vertical) return this._invalid('vertical');

    const hecho = input.hecho;
    if (!hecho || typeof hecho !== 'object') return this._invalid('hecho');

    const contratos = this._contratos.get(pid);
    const contrato = contratos ? (contratos.contratos.get(vertical) || null) : null;

    // SIN contrato declarado: NO se da por cumplido. El silencio no es conformidad.
    if (!contrato) {
      return {
        status: 200,
        data: {
          project_id: pid,
          vertical,
          conforme: null,
          verificable: false,
          campos_exigidos: [],
          faltantes: [],
          abierto: { contrato: 'no se declaró el contrato de hecho mínimo de esta vertical' }
        }
      };
    }

    const campos = Array.isArray(contrato.campos_exigidos) ? contrato.campos_exigidos : [];
    const faltantes = campos.filter((c) => {
      const v = hecho[c];
      return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
    });

    return {
      status: 200,
      data: {
        project_id: pid,
        vertical,
        conforme: faltantes.length === 0,
        verificable: true,
        campos_exigidos: campos,
        faltantes,
        contrato,
        abierto: null
      }
    };
  }

  // ── proyeccion ORDEN (UN escritor): declarar el contrato de hecho mínimo de una vertical ──
  _declarar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const vertical = input.vertical != null ? String(input.vertical).trim() : '';
    if (!vertical) return this._invalid('vertical');

    const campos_exigidos = Array.isArray(input.campos_exigidos)
      ? input.campos_exigidos.map((x) => String(x)).filter(Boolean)
      : [];
    if (campos_exigidos.length === 0) return this._invalid('campos_exigidos');

    const store = this._obtenerOCrear(pid);
    const existente = store.contratos.get(vertical) || null;
    const ahora = new Date().toISOString();

    const contrato = existente || { vertical, campos_exigidos: [], declarado_en: null, historial: [] };
    contrato.campos_exigidos = campos_exigidos;
    contrato.descripcion = input.descripcion != null ? String(input.descripcion) : (contrato.descripcion || null);
    contrato.declarado_en = ahora;
    contrato.historial = Array.isArray(contrato.historial) ? contrato.historial : [];
    // No se pisa en silencio: re-declarar apila el estado anterior.
    contrato.historial.push({ campos_exigidos: [...campos_exigidos], en: ahora });

    store.contratos.set(vertical, contrato);
    store.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: { project_id: pid, contrato, declarado: true, abierto: null }
    };
  }

  _obtenerOCrear(pid) {
    let c = this._contratos.get(pid);
    if (!c) {
      c = { esquema: 'contabilidad-contrato-hecho-minimo-v1', contratos: new Map() };
      this._contratos.set(pid, c);
      this._persist.marcarDirty(pid);
    }
    return c;
  }

  // Contrato de una vertical (mismo proceso) — no muta.
  contratoDe(pid, vertical) {
    const c = pid ? this._contratos.get(pid) : null;
    return c && vertical != null ? (c.contratos.get(String(vertical)) || null) : null;
  }

  // Peticion best-effort a la cola declarativa cuando falta el contrato (sin suplantar al JEFE).
  _subirPeticionCriterio(pid, vertical) {
    try {
      if (pid) this._rpc('cola-declaraciones-criterio.fijar.request', {
        project_id: pid,
        clave: `contrato_hecho_minimo:${vertical}`,
        origen: 'contrato-hecho-minimo'
      }, { timeout_ms: 2000 });
    } catch (_) { /* best-effort */ }
  }

  // ── Tools ──
  toolExigir(params) { return this._exigir(params); }
  toolDeclarar(params) { return this._declarar(params); }
}

module.exports = ContratoHechoMinimo;
