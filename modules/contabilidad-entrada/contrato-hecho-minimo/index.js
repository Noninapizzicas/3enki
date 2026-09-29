/**
 * contabilidad-entrada/contrato-hecho-minimo — CUSTODIO CON PERSISTENCIA (A11, hoja del plan).
 *
 * LA CARA VISTA DESDE LA FUENTE. La parcela declarable del MINIMO exigible a cada
 * vertical: no un formato impuesto, un minimo declarado. Contabilidad se adapta; no
 * obliga a la fuente a emitir de una forma concreta.
 *
 * Invariante 13 (el minimo se DECLARA, no se estima): el contrato de una vertical solo
 * existe si la fuente (o el asesor, con su rol) lo declara. `exigir` verifica el minimo
 * DECLARADO contra el hecho que llega y lista lo que FALTA en `faltantes`; jamas rellena
 * un campo ausente con una estimacion.
 *
 * UN SOLO ESCRITOR de la parcela: el declarante (rol DECLARANTE_CONTRATO); cualquier
 * otro rol es rechazado (segundo escritor → 403). `exigir` es lectura determinista:
 * no muta.
 *
 * Invariantes:
 *  - Sin contrato declarado → `declarado:false` y no se exige nada cableado.
 *  - Un campo declarado que el hecho no aporta se lista en `faltantes`; nada se rellena.
 *  - No se sobrescribe un contrato en silencio: re-declarar APPENDEA version nueva
 *    (historial) y el contrato vigente queda fechado.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y
 *    vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja A11 del plan-construccion y diseno-oop.md (CLASE ContratoHechoMinimo).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la parcela: quien declara el minimo de una fuente.
const ROL_ESCRITOR = 'DECLARANTE_CONTRATO';

class ContratoHechoMinimo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'contrato-hecho-minimo';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, contratos: Map<vertical, Contrato> }
    this._parcelas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'contrato-hecho-minimo.json',
      dir: '/contabilidad/contrato-hecho-minimo',
      snapshot: (pid) => {
        const p = this._parcelas.get(pid);
        if (!p) return null;
        return { project_id: pid, esquema: p.esquema, contratos: [...p.contratos.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const contratos = new Map();
        for (const c of (data.contratos || [])) if (c && c.vertical != null) contratos.set(String(c.vertical), c);
        this._parcelas.set(pid, { esquema: data.esquema || 'contabilidad-contrato-hecho-minimo-v1', contratos });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura los contratos del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una linea, delegan a _atender) ──
  onExigirRequest(e) {
    return this._atender(e, 'exigir', 'contrato-hecho-minimo.exigir.response', async (d) => {
      const res = this._exigir(d);
      if (res.status !== 200) this.eventBus?.publish('contrato-hecho-minimo.exigir.failed', res);
      return res;
    });
  }

  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'contrato-hecho-minimo.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: el minimo de una fuente quedo declarado.
        this.eventBus?.publish('contabilidad.contrato_declarado', {
          project_id: res.data.project_id,
          contrato: res.data.contrato,
          vertical: res.data.contrato.vertical,
          version: res.data.contrato.version,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contrato-hecho-minimo.declarar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion de lectura (determinista, NO muta): exigir(f:Fuente) → Contrato ──
  _exigir(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const vertical = input.vertical != null ? String(input.vertical).trim() : '';
    if (!vertical) return this._invalid('vertical');

    const parcela = this._obtenerOCrear(pid);
    const contrato = parcela.contratos.get(vertical) || null;

    // Sin contrato declarado: no se exige ningun minimo cableado.
    if (!contrato) {
      return {
        status: 200,
        data: {
          project_id: pid,
          vertical,
          declarado: false,
          contrato: null,
          campos: [],
          faltantes: [],
          completo: false,
          motivo: 'la fuente no ha declarado aun su minimo'
        }
      };
    }

    // Minimo declarado vs hecho que llega: lo que falta se DECLARA (no se rellena).
    const hecho = input.hecho && typeof input.hecho === 'object' ? input.hecho : null;
    const faltantes = hecho
      ? contrato.campos.filter(c => {
          const v = hecho[c];
          return v === undefined || v === null || v === '';
        })
      : [];

    return {
      status: 200,
      data: {
        project_id: pid,
        vertical,
        declarado: true,
        contrato: {
          vertical,
          campos: contrato.campos,
          version: contrato.version,
          declarado_por: contrato.declarado_por,
          declarado_en: contrato.declarado_en
        },
        campos: contrato.campos,
        faltantes,
        completo: hecho ? faltantes.length === 0 : false,
        evaluado: Boolean(hecho)
      }
    };
  }

  // ── proyeccion de escritura (UN escritor): el minimo se declara ──
  _declarar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el declarante asienta contratos.
    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el declarante (DECLARANTE_CONTRATO) puede declarar el minimo de una fuente',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    const vertical = input.vertical != null ? String(input.vertical).trim() : '';
    if (!vertical) return this._invalid('vertical');

    const campos = Array.isArray(input.campos)
      ? input.campos.map(c => String(c).trim()).filter(Boolean)
      : null;
    if (!campos || campos.length === 0) return this._invalid('campos');

    const parcelas = this._obtenerOCrear(pid);
    const previo = parcelas.contratos.get(vertical) || null;
    const ahora = new Date().toISOString();

    const contrato = {
      vertical,
      campos,
      version: previo ? previo.version + 1 : 1,
      declarado_por: ROL_ESCRITOR,
      declarado_en: ahora,
      // Re-declarar NO borra el minimo anterior: se apila su historial.
      historial: previo && Array.isArray(previo.historial) ? previo.historial : [],
      actualizado_en: ahora
    };
    contrato.historial.push({ campos, version: contrato.version, por: ROL_ESCRITOR, en: ahora });

    parcelas.contratos.set(vertical, contrato);
    parcelas.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        contrato: { vertical, campos, version: contrato.version, declarado_por: ROL_ESCRITOR, declarado_en: ahora },
        declarado: true,
        sobrescritura: Boolean(previo)
      }
    };
  }

  // Contrato vigente de una fuente (mismo proceso) — no muta.
  contratoDe(pid, vertical) {
    const p = pid ? this._parcelas.get(pid) : null;
    return p && vertical != null ? (p.contratos.get(String(vertical)) || null) : null;
  }

  _obtenerOCrear(pid) {
    let p = this._parcelas.get(pid);
    if (!p) {
      p = { esquema: 'contabilidad-contrato-hecho-minimo-v1', contratos: new Map() };
      this._parcelas.set(pid, p);
      this._persist.marcarDirty(pid);
    }
    return p;
  }

  // ── Tools ──
  toolExigir(params) { return this._exigir(params); }
  toolDeclarar(params) { return this._declarar(params); }
}

module.exports = ContratoHechoMinimo;
