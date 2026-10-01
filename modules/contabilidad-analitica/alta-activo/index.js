/**
 * contabilidad-analitica/alta-activo — CUSTODIO CON PERSISTENCIA (F1, hoja del plan).
 *
 * Parcela del INMOVILIZADO. UN escritor. Aqui se da de ALTA un activo (bien durable) y se apila su
 * ficha; NADA se sobreescribe. La valoracion del alta es reflejo hidratador: se ANOTA lo declarado,
 * no se recalcula por cuenta propia.
 *
 * EL CERROJO: la identidad del activo es su identificador declarado (activo_id/codigo); sin el NO se
 * da de alta. La fecha de alta se declara; ausente = desconocida (se anota el hueco, no se inventa).
 *
 * R2 · ESCRIBE → ANUNCIA: al dar de alta publica `contabilidad.activo_alta` (el hecho que alimenta
 * amortizacion, informes y expediente). Ademas, por EVENTO (best-effort, respetando el single-writer
 * de cada custodio), SUBE: el asiento del alta a escritor-diario, la primera cuota a plan-amortizacion
 * y el documento origen a expediente-documental — este modulo NUNCA escribe esas parcelas.
 *
 * Invariantes:
 *  - SIN identidad declarada no se da de alta (no hay activo anonimo).
 *  - APPEND-ONLY por activo: re-dar de alta el mismo activo APILA su historial; no se pisa en silencio.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + UN escritor.
 * Ver hoja F1 del plan-construccion y diseno-oop.md (CLASE AltaActivo).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

class AltaActivo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'alta-activo';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, activos: Map<activo_id, Activo> }
    this._parcelas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'alta-activo.json',
      dir: '/contabilidad/alta-activo',
      snapshot: (pid) => {
        const p = this._parcelas.get(pid);
        if (!p) return null;
        return { project_id: pid, esquema: p.esquema, activos: [...p.activos.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const activos = new Map();
        for (const a of (data.activos || [])) {
          if (a && a.activo_id != null) activos.set(String(a.activo_id), a);
        }
        this._parcelas.set(pid, { esquema: data.esquema || 'contabilidad-alta-activo-v1', activos });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el inmovilizado del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC: registrar (ORDEN → ui_handler panel) ──
  onRegistrarRequest(e) {
    return this._atender(e, 'registrar', 'alta-activo.registrar.response', async (d) => {
      const res = this._registrar(d);
      if (res.status === 200) {
        // R2 · si ESCRIBE, anuncia el HECHO: quedo dado de alta un activo.
        this.eventBus?.publish('contabilidad.activo_alta', {
          project_id: res.data.project_id,
          activo_id: res.data.activo.activo_id,
          activo: res.data.activo,
          valor: res.data.activo.valor,
          alta: true,
          correlation_id: d.correlation_id
        });
        // Por EVENTO (best-effort): el asiento del alta, la primera cuota y el documento origen se
        // SUBEN a sus custodios; este modulo NO escribe esas parcelas (single-writer ajeno).
        await this._delegarAlta(res.data, d);
      } else {
        this.eventBus?.publish('alta-activo.registrar.failed', res);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _registrar(input) → { status, data }  ·  UN escritor (append-only)
  // ══════════════════════════════════════════════════════════════════════
  _registrar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const raw = input.activo && typeof input.activo === 'object' ? input.activo
      : (input.activo_id != null || input.codigo != null ? input : null);
    if (!raw) return this._invalid('activo');

    const activo_id = raw.activo_id != null ? String(raw.activo_id).trim()
      : (raw.codigo != null ? String(raw.codigo).trim() : '');
    if (!activo_id) return this._invalid('activo_id');   // sin identidad no hay activo

    const parcela = this._obtenerOCrear(pid);
    const existente = parcela.activos.get(activo_id) || null;
    const ahora = new Date().toISOString();

    const activo = existente || {
      activo_id,
      descripcion: null,
      cuenta: null,            // cuenta de inmovilizado (declarable)
      valor: null,             // valoracion del alta (reflejo hidratador: se anota, no se recalcula)
      fecha_alta: null,
      vida_util: null,
      metodo_amortizacion: null,
      documentado: false,
      registrado_en: null,
      historial: []
    };
    if (raw.descripcion != null) activo.descripcion = String(raw.descripcion);
    if (raw.cuenta != null) activo.cuenta = String(raw.cuenta);
    if (raw.valor != null) activo.valor = this._round(this._num(raw.valor), 2);
    if (raw.fecha_alta != null) activo.fecha_alta = String(raw.fecha_alta);
    if (raw.vida_util != null) activo.vida_util = this._num(raw.vida_util);
    if (raw.metodo_amortizacion != null) activo.metodo_amortizacion = String(raw.metodo_amortizacion);
    activo.documentado = raw.documento != null || raw.documento_id != null || activo.documentado === true;
    activo.registrado_en = ahora;
    activo.historial = Array.isArray(activo.historial) ? activo.historial : [];
    // APPEND-ONLY: re-dar de alta el mismo activo apila su estado; no se pisa en silencio.
    activo.historial.push({
      valor: activo.valor, fecha_alta: activo.fecha_alta, vida_util: activo.vida_util,
      metodo_amortizacion: activo.metodo_amortizacion, en: ahora
    });

    parcela.activos.set(activo_id, activo);
    parcela.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        activo,
        registrado: true,
        total: parcela.activos.size,
        append_only: true,
        abierto: {
          valor: activo.valor != null ? null : 'el alta no declaro valor (se anota el hueco, no se inventa la valoracion)',
          fecha_alta: activo.fecha_alta ? null : 'el alta no declaro fecha (se anota el hueco)',
          documento: activo.documentado ? null : 'el alta no trae documento origen (no se enlaza prueba)'
        }
      }
    };
  }

  // Sube (best-effort) a los custodios ajenos: asiento, primera cuota, documento. NUNCA escribe aqui.
  async _delegarAlta(data, input) {
    const pid = data.project_id;
    const a = data.activo;
    try {
      if (a.valor != null && a.cuenta != null) {
        await this._rpc('escritor-diario.asentar.request', {
          project_id: pid,
          asiento: {
            fecha: a.fecha_alta || new Date().toISOString().slice(0, 10),
            concepto: `Alta de activo ${a.activo_id}`,
            clave: `alta-activo:${a.activo_id}`,
            lineas: [{ cuenta: a.cuenta, debe: a.valor, haber: 0 }]
          },
          origen: 'alta-activo', correlation_id: input.correlation_id
        }, { timeout_ms: 800 });
      }
      await this._rpc('plan-amortizacion.cuota_del_periodo.request', {
        project_id: pid, activo_id: a.activo_id, periodo: (a.fecha_alta || '').slice(0, 7),
        correlation_id: input.correlation_id
      }, { timeout_ms: 800 });
      if (a.documentado) {
        await this._rpc('expediente-documental.archivar.request', {
          project_id: pid, cifra: `alta-activo:${a.activo_id}`,
          documento: input.documento || input.activo.documento || null,
          correlation_id: input.correlation_id
        }, { timeout_ms: 800 });
      }
    } catch (_) { /* best-effort: el alta ya quedo registrada y anunciada */ }
  }

  _obtenerOCrear(pid) {
    let p = this._parcelas.get(pid);
    if (!p) {
      p = { esquema: 'contabilidad-alta-activo-v1', activos: new Map() };
      this._parcelas.set(pid, p);
      this._persist.marcarDirty(pid);
    }
    return p;
  }

  // Activo concreto (mismo proceso) — no muta.
  activoDe(pid, activo_id) {
    const p = pid ? this._parcelas.get(pid) : null;
    return p && activo_id != null ? (p.activos.get(String(activo_id)) || null) : null;
  }

  _num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

  // ── Tools ──
  toolRegistrar(params) { return this._registrar(params); }
}

module.exports = AltaActivo;
