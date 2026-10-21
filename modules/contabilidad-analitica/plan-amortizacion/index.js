/**
 * contabilidad-analitica/plan-amortizacion — CUSTODIO CON PERSISTENCIA (F2, hoja del plan).
 *
 * Genera la cuota de amortizacion CUANDO TOCA (dispara en el CIERRE). El METODO y el
 * COEFICIENTE son DATO (declarables), no constantes cableadas. UN escritor de la parcela
 * de planes de amortizacion.
 *
 *   · cuota_del_periodo — deriva la cuota del periodo SIN escribir (calculo; el asesor la consulta).
 *   · generar_cuota    — GENERA y REGISTRA la cuota del periodo (escribe) → anuncia el HECHO.
 *
 * Invariantes:
 *  - Dato ausente = desconocido: sin activo, sin base y sin vida util NO se inventa una cuota.
 *  - APPEND-ONLY: cada cuota generada se APILA; NADA se borra ni se sobrescribe.
 *  - El metodo es DECLARABLE (`lineal` por defecto): no se cablea un coeficiente de negocio.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * R2 · ESCRIBE → ANUNCIA: al generar la cuota publica `contabilidad.cuota_amortizacion_generada`
 * (lo consumen baja-activo y valor-neto-contable). Ademas SUBE (best-effort) el asiento a
 * escritor-diario y la peticion de criterio a cola-declaraciones-criterio.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + single-writer + append-only.
 * Ver hoja F2 del plan-construccion y diseno-oop.md (CLASE PlanAmortizacion).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

const METODOS = new Set(['lineal', 'constante', 'porcentaje_fijo']);

class PlanAmortizacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'plan-amortizacion';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, activos: Map<activo_id, Plan>, cuotas: [append-only] }
    this._planes = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'plan-amortizacion.json',
      dir: '/contabilidad/plan-amortizacion',
      snapshot: (pid) => {
        const p = this._planes.get(pid);
        if (!p) return null;
        return { project_id: pid, esquema: p.esquema, activos: [...p.activos.values()], cuotas: p.cuotas };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const activos = new Map();
        for (const a of (data.activos || [])) if (a && a.activo_id != null) activos.set(String(a.activo_id), a);
        this._planes.set(pid, {
          esquema: data.esquema || 'contabilidad-plan-amortizacion-v1',
          activos,
          cuotas: Array.isArray(data.cuotas) ? data.cuotas : []
        });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC PREGUNTA (sin ui_handler): cuota del periodo (calculo) ──
  onCuotaDelPeriodoRequest(e) {
    return this._atender(e, 'cuota_del_periodo', 'plan-amortizacion.cuota_del_periodo.response', async (d) => {
      const res = this._cuota_del_periodo(d);
      if (res.status !== 200) this.eventBus?.publish('plan-amortizacion.cuota_del_periodo.failed', res);
      return res;
    });
  }

  // ── handler RPC ORDEN (ui_handler: el asesor genera la cuota) ──
  onGenerarCuotaRequest(e) {
    return this._atender(e, 'generar_cuota', 'plan-amortizacion.generar_cuota.response', async (d) => {
      const res = this._generar_cuota(d);
      if (res.status === 200) {
        // R2 · si ESCRIBE (la cuota quedo generada), anuncia el HECHO.
        this.eventBus?.publish('contabilidad.cuota_amortizacion_generada', {
          project_id: res.data.project_id,
          activo_id: res.data.cuota.activo_id,
          periodo: res.data.cuota.periodo,
          cuota: res.data.cuota.importe,
          total: res.data.total,
          correlation_id: d.correlation_id
        });
        this._encadenar(res, d);
      } else {
        this.eventBus?.publish('plan-amortizacion.generar_cuota.failed', res);
      }
      return res;
    });
  }

  // SUBE (best-effort) el asiento de la cuota y, si falta metodo/base, la peticion de criterio.
  _encadenar(res, d) {
    const pid = res.data.project_id;
    const cuota = res.data.cuota;
    try {
      this.eventBus?.publish('escritor-diario.asentar.request', {
        project_id: pid,
        asiento: cuota.asiento || null,
        origen: 'plan-amortizacion',
        correlation_id: d.correlation_id
      });
      if (res.data.abierto && res.data.abierto.metodo) {
        this._rpc('cola-declaraciones-criterio.fijar.request', {
          project_id: pid,
          clave: 'amortizacion',
          origen: 'plan-amortizacion'
        }, { timeout_ms: 2000 });
      }
    } catch (_) { /* best-effort */ }
  }

  // ── proyeccion PREGUNTA: cuota del periodo (deriva, NO escribe) ──
  _cuota_del_periodo(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // El plan puede venir DECLARADO en la propia pregunta (calculo) o estar ya registrado.
    // No se escribe nada: si viene inline, se usa para derivar sin registrar.
    const inline = input.activo || input.plan;
    const plan = this._planDe(pid, input) || (inline && typeof inline === 'object' ? inline : null);
    if (!plan) {
      return {
        status: 200,
        data: {
          project_id: pid, activo_id: null, periodo: input.periodo || null, cuota: null,
          calculada: false,
          abierto: { activo: 'no hay plan de amortizacion declarado para este activo (no se inventa)' }
        }
      };
    }

    const calculo = this._calcular(plan, input.periodo);
    return {
      status: 200,
      data: {
        project_id: pid,
        activo_id: plan.activo_id,
        periodo: calculo.periodo,
        cuota: calculo.cuota,
        metodo: plan.metodo,
        calculada: calculo.cuota != null,
        determinista: true,
        abierto: calculo.abierto
      }
    };
  }

  // ── proyeccion ORDEN: generar_cuota (registra el plan si viene y apila la cuota) ──
  _generar_cuota(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const p = this._obtenerOCrear(pid);

    // Si viene el plan, se registra (upsert declarado); si no, se usa el ya guardado.
    const plan = this._registrarSiViene(p, input) || this._planDe(pid, input);
    if (!plan) return this._invalid('activo');

    const calculo = this._calcular(plan, input.periodo);
    if (calculo.cuota == null) {
      return this._errorResponse(422, 'CUOTA_NO_DETERMINABLE',
        'falta base o vida util para calcular la cuota: no se inventa el importe',
        { project_id: pid, activo_id: plan.activo_id, abierto: calculo.abierto, metodo: plan.metodo });
    }

    const ahora = new Date().toISOString();
    const cuota = {
      numero: p.cuotas.length + 1,
      activo_id: plan.activo_id,
      periodo: calculo.periodo,
      importe: calculo.cuota,
      metodo: plan.metodo,
      acumulada: this._round(this._acumulado(p, plan.activo_id) + calculo.cuota, 2),
      asiento: input.asiento || null,
      en: ahora
    };
    // APPEND-ONLY: se apila; NUNCA se sobrescribe.
    p.cuotas.push(cuota);
    p.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        cuota,
        generada: true,
        total: p.cuotas.length,
        append_only: true,
        abierto: calculo.abierto
      }
    };
  }

  // Calcula la cuota del periodo segun el METODO declarado. Determinista.
  _calcular(plan, periodo) {
    const periodoS = periodo != null ? String(periodo)
      : (plan.inicio_periodo != null ? String(plan.inicio_periodo) : null);

    const base = plan.base_amortizable != null ? Number(plan.base_amortizable) : null;
    const vida = plan.vida_util != null ? Number(plan.vida_util) : null;
    const metodo = METODOS.has(String(plan.metodo)) ? String(plan.metodo) : 'lineal';

    const abierto = {
      metodo: plan.metodo ? null : 'no se declaro metodo de amortizacion: se aplica lineal por defecto',
      periodo: periodoS ? null : 'no se declaro el periodo a generar',
      base: base != null && Number.isFinite(base) ? null : 'el plan no declara base amortizable',
      vida_util: vida != null && Number.isFinite(vida) && vida > 0 ? null : 'el plan no declara vida util (o es <= 0)'
    };

    if (base == null || !Number.isFinite(base) || vida == null || !Number.isFinite(vida) || vida <= 0) {
      return { cuota: null, periodo: periodoS, abierto };
    }

    // lineal/constante: base / vida. porcentaje_fijo: base * coeficiente declarado.
    let cuota;
    if (metodo === 'porcentaje_fijo') {
      const coef = Number(plan.coeficiente);
      if (!Number.isFinite(coef)) return { cuota: null, periodo: periodoS, abierto: { ...abierto, coeficiente: 'metodo porcentaje_fijo sin coeficiente declarado' } };
      cuota = base * (coef > 1 ? coef / 100 : coef);
    } else {
      cuota = base / vida;
    }
    return { cuota: this._round(cuota, 2), periodo: periodoS, abierto };
  }

  _registrarSiViene(p, input) {
    const a = input.activo || input.plan;
    if (!a || typeof a !== 'object') return null;
    const activo_id = a.activo_id != null ? String(a.activo_id) : (input.activo_id != null ? String(input.activo_id) : null);
    if (!activo_id) return null;
    const existente = p.activos.get(activo_id) || {
      activo_id, base_amortizable: null, valor_residual: null, vida_util: null,
      metodo: null, coeficiente: null, inicio_periodo: null, creado_en: new Date().toISOString()
    };
    if (a.base_amortizable != null) existente.base_amortizable = Number(a.base_amortizable);
    if (a.valor_residual != null) existente.valor_residual = Number(a.valor_residual);
    if (a.vida_util != null) existente.vida_util = Number(a.vida_util);
    if (a.metodo != null) existente.metodo = String(a.metodo);
    if (a.coeficiente != null) existente.coeficiente = Number(a.coeficiente);
    if (a.inicio_periodo != null) existente.inicio_periodo = String(a.inicio_periodo);
    p.activos.set(activo_id, existente);
    this._persist.marcarDirty(p.project_id || this.project_id);
    return existente;
  }

  _planDe(pid, input) {
    const p = this._planes.get(pid);
    if (!p) return null;
    const activo_id = input.activo_id != null ? String(input.activo_id)
      : (input.activo && input.activo.activo_id != null ? String(input.activo.activo_id) : null);
    if (activo_id) return p.activos.get(activo_id) || null;
    // Sin activo declarado: el unico plan si solo hay uno (declarado); si hay varios, ambiguo.
    const todos = [...p.activos.values()];
    return todos.length === 1 ? todos[0] : null;
  }

  _acumulado(p, activo_id) {
    return this._round(p.cuotas.filter((c) => c.activo_id === activo_id).reduce((a, c) => a + (Number(c.importe) || 0), 0), 2);
  }

  _obtenerOCrear(pid) {
    let p = this._planes.get(pid);
    if (!p) {
      p = { esquema: 'contabilidad-plan-amortizacion-v1', activos: new Map(), cuotas: [], project_id: pid };
      this._planes.set(pid, p);
      this._persist.marcarDirty(pid);
    }
    return p;
  }

  // ── Tools ──
  toolCuotaDelPeriodo(params) { return this._cuota_del_periodo(params); }
  toolGenerarCuota(params) { return this._generar_cuota(params); }
}

module.exports = PlanAmortizacion;
