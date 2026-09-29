/**
 * contabilidad-analitica/plan-amortizacion — CUSTODIO CON PERSISTENCIA (F2, hoja del plan).
 *
 * LA TABLA DE AMORTIZACION del inmovilizado: el PLAN de cuotas de cada bien (F1) y la CUOTA
 * QUE TOCA en un periodo (dispara en el cierre). Es el custodio de la parcela `planes`.
 *
 * LOS COEFICIENTES Y METODOS SON DECLARABLES (invariante 5 — la ley entra como DATO):
 * el metodo (lineal, suma de digitos, porcentaje declarado...) y sus COEFICIENTES entran como
 * `ParametroDeclarable` del negocio — la tabla la DECLARA el dueno/asesor. **PROHIBIDO cablear
 * coeficientes fiscales**: en este modulo NO hay ninguna tabla legal, ningun porcentaje fijo,
 * ninguna vida util por defecto, ningun cuadro ministerio. Sin metodo declarado NO se genera
 * la tabla y la cuota queda `[ABIERTO]` (`cuota:null`, `motivo`). El sistema PREGUNTA; no decide.
 *
 * EL METODO ES TAMBIEN DECLARABLE POR PLAN: cada `declarar` fija el metodo y sus parametros del
 * bien; el plan queda persistido y su generacion es DETERMINISTA.
 *
 * UN SOLO ESCRITOR: solo el camino de declaracion (rol DECLARACION_AMORTIZACION) fija planes;
 * cualquier otro rol es rechazado (segundo escritor → 403).
 *
 * Invariantes:
 *  - `cuota_del_periodo` NO muta el plan declarado: calcula la cuota determinista del periodo.
 *  - Sin metodo/coeficiente declarado NO se inventa la cuota: `cuota:null` y `[ABIERTO]`.
 *  - El bien y su valor se LEEN de alta-activo (F1) POR EVENTO; el criterio de cierre se puede
 *    consultar en la cola declarativa (K9) POR EVENTO, pero nunca se asume un valor de ella.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja F2 del plan-construccion y diseno-oop.md (CLASE PlanAmortizacion).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor: los planes/metodos de amortizacion los declara el dueno/asesor.
const ROL_ESCRITOR = 'DECLARACION_AMORTIZACION';

// Los PARAMETROS declarables de un plan (el molde). Ningun VALOR cableado: solo los nombres.
// `metodo` y `coeficientes` los declara el negocio; el modulo NO conoce ninguna tabla fiscal.
const PARAMETROS_PLAN = ['metodo', 'coeficientes', 'vida_util', 'valor_residual', 'coste', 'valor', 'porcentaje', 'cuota', 'base', 'periodicidad'];

class PlanAmortizacion extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'plan-amortizacion';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, planes: Map<id_activo, Plan>, orden: [id, ...] }
    this._parcelas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'plan-amortizacion.json',
      dir: '/contabilidad/plan-amortizacion',
      snapshot: (pid) => {
        const p = this._parcelas.get(pid);
        if (!p) return null;
        return { project_id: pid, esquema: p.esquema, planes: [...p.planes.values()], orden: p.orden };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const planes = new Map();
        const orden = [];
        for (const pl of (data.planes || [])) {
          if (!pl || pl.id_activo == null) continue;
          planes.set(String(pl.id_activo), pl);
          orden.push(String(pl.id_activo));
        }
        this._parcelas.set(pid, {
          esquema: data.esquema || 'contabilidad-plan-amortizacion-v1',
          planes,
          orden: Array.isArray(data.orden) ? data.orden.map(String) : orden
        });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la parcela de planes de amortizacion del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC (una linea, delegan a _atender) ──
  onCuotaDelPeriodoRequest(e) {
    return this._atender(e, 'cuota_del_periodo', 'plan-amortizacion.cuota_del_periodo.response', async (d) => {
      const res = await this._cuota_del_periodo(d);
      if (res.status === 200) {
        if (res.data.cuota !== null) {
          // Exito → evento de dominio: hay cuota del periodo. Lo LEEN valor-neto-contable (F4),
          // el cierre y el asiento de amortizacion.
          this.eventBus?.publish('contabilidad.cuota_amortizacion', {
            project_id: res.data.project_id,
            id_activo: res.data.id_activo,
            periodo: res.data.periodo,
            cuota: res.data.cuota,
            acumulada: res.data.acumulada,
            metodo: res.data.metodo,
            correlation_id: d.correlation_id
          });
        }
      } else {
        this.eventBus?.publish('plan-amortizacion.cuota_del_periodo.failed', res);
      }
      return res;
    });
  }

  onDeclararRequest(e) {
    return this._atender(e, 'declarar', 'plan-amortizacion.declarar.response', async (d) => {
      const res = this._declarar(d);
      if (res.status !== 200) this.eventBus?.publish('plan-amortizacion.declarar.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: cuota_del_periodo(id_activo, periodo) → Opcion<Cuantía> ──
  async _cuota_del_periodo(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const id_activo = input.id_activo != null ? String(input.id_activo).trim()
      : (input.activo && input.activo.id_activo != null ? String(input.activo.id_activo) : '');
    if (!id_activo) return this._invalid('id_activo');

    const periodo = input.periodo != null ? String(input.periodo) : null;

    // 1) El PLAN: el declarado en la peticion, o el persistido para ese bien. Sin plan no hay cuota.
    const plan = (input.plan && typeof input.plan === 'object')
      ? input.plan
      : (this._planesDe(pid).get(id_activo) || null);

    // Sin plan declarado NO se inventa: `[ABIERTO]`.
    if (!plan) {
      return {
        status: 200,
        data: {
          project_id: pid, id_activo, periodo,
          cuota: null, acumulada: null, metodo: null, plan: null,
          abierto: true,
          motivo: 'el bien no tiene plan de amortizacion declarado (la tabla la declara el negocio)'
        }
      };
    }

    // 2) El METODO es DECLARABLE. Sin metodo declarado no hay generacion: `[ABIERTO]` (no se asume lineal).
    const metodo = plan.metodo != null ? String(plan.metodo) : null;
    if (!metodo) {
      return {
        status: 200,
        data: {
          project_id: pid, id_activo, periodo,
          cuota: null, acumulada: null, metodo: null, plan,
          abierto: true,
          motivo: 'el plan no declara metodo de amortizacion: no se asume ninguno (nada se estima)'
        }
      };
    }

    // 3) El COSTE del bien: DECLARADO en la tabla del plan o en la peticion. Sin el, `[ABIERTO]`.
    // El coste solo es necesario si el metodo DERIVA la cuota de una base (lineal, porcentaje):
    // un metodo de cuota fija declarada no necesita base para nada.
    const { valor, fuente_valor } = this._valorDelBien(plan, input);
    const pide_base = !(this._esCuotaFija(metodo));
    if (valor === null && pide_base) {
      return {
        status: 200,
        data: {
          project_id: pid, id_activo, periodo,
          cuota: null, acumulada: null, metodo, plan,
          abierto: true,
          motivo: 'no hay coste del bien declarado en la tabla del plan (y el metodo lo necesita): no se estima'
        }
      };
    }

    // 4) La cuota DERIVADA del metodo y sus coeficientes DECLARADOS (la tabla es del negocio).
    const vida_util = this._num(plan.vida_util);
    const residual = this._num(plan.valor_residual) || 0;
    const coeficientes = (plan.coeficientes && typeof plan.coeficientes === 'object') ? plan.coeficientes : null;
    const base = this._num(plan.base) !== null ? this._num(plan.base)
      : (valor !== null ? valor - residual : 0);

    const calculo = this._cuota(base, metodo, vida_util, coeficientes, plan, input);
    if (calculo.cuota === null) {
      return {
        status: 200,
        data: {
          project_id: pid, id_activo, periodo,
          cuota: null, acumulada: null, metodo, plan, fuente_valor,
          abierto: true,
          motivo: calculo.motivo
        }
      };
    }

    // 5) La acumulada del periodo: la aportada por la peticion (de la tabla generada) o la cuota.
    const acumulada = this._num(input.amortizacion_acumulada);
    const cuota_num = calculo.cuota;

    return {
      status: 200,
      data: {
        project_id: pid,
        id_activo,
        periodo,
        cuota: this._round(cuota_num, 2),
        acumulada: acumulada !== null ? this._round(acumulada, 2) : this._round(cuota_num, 2),
        metodo,
        base: this._round(base, 2),
        plan,
        fuente_valor,
        // Nada [ABIERTO]: el plan y el metodo estan declarados.
        abierto: false,
        motivo: null
      }
    };
  }

  // El metodo se DERIVA del metodo DECLARADO. Nunca se asume uno por defecto.
  // Un metodo de CUOTA FIJA declarada no deriva de una base: no necesita coste.
  _esCuotaFija(metodo) {
    const m = String(metodo).toLowerCase();
    return m === 'cuota_declarada' || m === 'importe_declarado';
  }

  _cuota(base, metodo, vida_util, coeficientes, plan, input = {}) {
    const m = String(metodo).toLowerCase();

    // Metodo % DECLARADO: el coeficiente entra como dato (en la tabla del plan o en la peticion).
    if (m === 'porcentaje' || m === 'porcentaje_declarado' || m === 'tanto_por_ciento') {
      const pct = this._num(plan_valor(coeficientes, ['porcentaje', 'coeficiente', 'tanto_por_ciento']))
        ?? this._num(plan && plan.porcentaje)
        ?? this._num(input.porcentaje);
      if (pct === null) return { cuota: null, motivo: 'metodo porcentaje declarado pero sin coeficiente declarado' };
      return { cuota: base * (pct / 100) };
    }

    // Metodo LINEAL: base / vida_util declarada.
    if (m === 'lineal' || m === 'lineal_declarado') {
      if (vida_util === null || vida_util <= 0) {
        return { cuota: null, motivo: 'metodo lineal declarado pero sin vida_util declarada (no se asume ninguna)' };
      }
      return { cuota: base / vida_util };
    }

    // Metodo CUOTA DECLARADA: la cuota fija la declara el negocio.
    if (m === 'cuota_declarada' || m === 'importe_declarado') {
      const c = this._num(plan_valor(coeficientes, ['cuota', 'importe']))
        ?? this._num(plan && plan.cuota)
        ?? this._num(input.cuota);
      if (c === null) return { cuota: null, motivo: 'metodo cuota declarada pero sin importe declarado' };
      return { cuota: c };
    }

    // Un metodo que el modulo NO conoce NO se improvisa: el negocio declara su metodo y su tabla.
    // (No hay ningun catalogo de metodos cableado; aqui solo se aplican los que la base entiende.)
    return { cuota: null, motivo: `metodo '${metodo}' no aplicable con los parametros declarados: el negocio declara su tabla` };
  }

  // ── proyeccion de escritura (UN escritor): fijar el plan/tabla de un bien ──
  _declarar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el camino de declaracion fija planes.
    const rol = input.rol;
    if (rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el camino de declaracion (DECLARACION_AMORTIZACION) fija planes de amortizacion',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: rol ?? null });
    }

    const fuente = (input.plan && typeof input.plan === 'object') ? input.plan : input;
    const id_activo = (fuente.id_activo != null ? String(fuente.id_activo).trim()
      : (input.id_activo != null ? String(input.id_activo).trim() : ''));
    if (!id_activo) return this._invalid('plan.id_activo');

    const parcela = this._obtenerOCrear(pid);
    const existente = parcela.planes.get(id_activo) || null;
    const ahora = new Date().toISOString();

    // Los PARAMETROS del plan se toman declarados. Lo ausente queda null y se declara [ABIERTO].
    const plan = existente || {
      id_activo,
      metodo: null,
      coeficientes: null,
      vida_util: null,
      valor_residual: null,
      base: null,
      periodicidad: null,
      estado: 'DECLARADO',
      historial: []
    };
    const abierto = [];
    for (const p of PARAMETROS_PLAN) {
      const raw = fuente[p];
      if (raw === undefined || raw === null || raw === '') {
        abierto.push(p);
        continue;
      }
      plan[p] = (p === 'vida_util' || p === 'valor_residual' || p === 'base') ? this._num(raw) : raw;
    }
    plan.abierto = abierto;
    plan.declarado_en = plan.declarado_en || ahora;
    plan.updated_at = ahora;
    plan.historial = Array.isArray(plan.historial) ? plan.historial : [];
    plan.historial.push({ metodo: plan.metodo, coeficientes: plan.coeficientes, por: ROL_ESCRITOR, en: ahora });

    parcela.planes.set(id_activo, plan);
    if (!parcela.orden.includes(id_activo)) parcela.orden.push(id_activo);
    parcela.updated_at = ahora;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        plan,
        declarado: true,
        // Lo que el negocio aun no ha declarado de la tabla (nada se rellena solo).
        abierto
      }
    };
  }

  // El COSTE del bien: el que DECLARA la tabla del negocio (plan) o la peticion. Sin el, null.
  _valorDelBien(plan, input) {
    const declarado = this._num(input.valor);
    if (declarado !== null) return { valor: declarado, fuente_valor: 'declarado' };
    const enPlan = plan && this._num(plan.coste) !== null ? this._num(plan.coste)
      : (plan && this._num(plan.valor) !== null ? this._num(plan.valor) : null);
    if (enPlan !== null) return { valor: enPlan, fuente_valor: 'plan' };
    return { valor: null, fuente_valor: null };
  }

  _planesDe(pid) {
    const p = pid ? this._parcelas.get(pid) : null;
    return p ? p.planes : new Map();
  }

  plansDe(pid) {
    const p = pid ? this._parcelas.get(pid) : null;
    return p ? [...p.planes.values()] : [];
  }

  _obtenerOCrear(pid) {
    let p = this._parcelas.get(pid);
    if (!p) {
      p = { esquema: 'contabilidad-plan-amortizacion-v1', planes: new Map(), orden: [] };
      this._parcelas.set(pid, p);
      this._persist.marcarDirty(pid);
    }
    return p;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCuotaDelPeriodo(params) { return this._cuota_del_periodo(params); }
  toolDeclarar(params) { return this._declarar(params); }
}

// Lee el primer coeficiente presente en el mapa declarado (sin cablear ningun valor).
function plan_valor(coeficientes, claves) {
  if (!coeficientes || typeof coeficientes !== 'object') return null;
  for (const k of claves) {
    if (coeficientes[k] !== undefined && coeficientes[k] !== null && coeficientes[k] !== '') return coeficientes[k];
  }
  return null;
}

module.exports = PlanAmortizacion;
