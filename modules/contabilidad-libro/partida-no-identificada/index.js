/**
 * contabilidad-libro/partida-no-identificada — MICRO-AGENTE (E7, hoja del plan).
 *
 * EL UNICO PUNTO DE JUICIO SOBRE LA DESCRIPCION AMBIGUA DEL BANCO. Un movimiento del extracto
 * que no tiene contrapartida clara ("COMISION MANTENIMIENTO", "DEV. RECIBO 4471", "INT. ACREEDOR")
 * llega aqui. Reconoce y clasifica esa partida (comision / interes / devolucion / ...) y PROPONE
 * el apunte (cuenta + tercero + periodo).
 *
 * EL JUICIO ESTA AISLADO EN ESTA HOJA: conciliacion-bancaria (E1) y cuadre-cobro-pago (E3) son
 * puros y NO interpretan nada; todo lo que no casa por clave natural determinista aterriza aqui.
 * Esto NO se duplica en ningun reflejo.
 *
 * Invariantes:
 *  - PROPONE, NO ESCRIBE: no asienta, no persiste, no marca nada. La escritura la hace el custodio
 *    dueño de la parcela (regla-movimiento-bancario E8 la ratifica; escritor-diario B2 la asienta).
 *  - SI NO PUEDE RESOLVER → `[ABIERTO]` Y A LA COLA, NUNCA INVENTA: si no hay regla declarada (E8,
 *    corte duro) que cubra el movimiento y la descripcion no es reconocible, devuelve `propuesta:null`,
 *    `estado:'ABIERTO'` y `requiere_cola:true` con su destino. JAMAS fabrica una cuenta.
 *  - PRIMERO EL CORTE DURO, DESPUES EL JUICIO: la regla declarada (E8) se consulta POR EVENTO. Si
 *    E8 cubre → la propuesta es determinista (no es juicio). Solo si E8 no cubre se ejerce el juicio
 *    sobre la descripcion, y aun asi la cuenta propuesta debe estar en el PLAN declarado (B1).
 *  - La cuenta propuesta se VERIFICA contra catalogo-cuentas (B1) POR EVENTO. Si el plan dice que
 *    no existe → no se propone (se declara `[ABIERTO]`).
 *
 * El cajon fuzzy (el reconocimiento de la descripcion ambigua) vive en el blueprint; este reflejo
 * sirve la proyeccion determinista de fallback y el corte duro. Toda su memoria es EXTERNA (reglas
 * E8 + plan B1), por eso es STATELESS: persistir aqui duplicaria estado ya custodido.
 *
 * Forma: MICRO-AGENTE → STATELESS (sin PosPersistencia, sin onProjectActivated).
 * Ver hoja E7 del plan-construccion y diseno-oop.md (CLASE PartidaNoIdentificada).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Tipos de partida NO IDENTIFICADA reconocibles. El RECONOCIMIENTO es juicio (blueprint);
// aqui solo se declara la taxonomia canonica a la que el juicio puede llegar.
const TIPOS_PARTIDA = ['comision', 'interes', 'devolucion', 'impuesto', 'seguro', 'otro'];

class PartidaNoIdentificada extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'partida-no-identificada';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  onJuzgarRequest(e) {
    return this._atender(e, 'juzgar', 'partida-no-identificada.juzgar.response', async (d) => {
      const res = await this._juzgar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: hay propuesta (o hay [ABIERTO] razonado si no se pudo resolver).
        this.eventBus?.publish('contabilidad.partida_propuesta', {
          project_id: res.data.project_id,
          movimiento: res.data.movimiento,
          propuesta: res.data.propuesta,
          propuesta_por: res.data.propuesta_por,
          estado: res.data.estado,
          tipo_partida: res.data.tipo_partida,
          corte_duro: res.data.corte_duro,
          requiere_cola: res.data.requiere_cola,
          destino_cola: res.data.destino_cola,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('partida-no-identificada.juzgar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion: juzgar(m:Movimiento) → Propuesta<Apunte> | [ABIERTO] ──
  async _juzgar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const movimiento = input.movimiento || input.m || input.mov;
    if (!movimiento || typeof movimiento !== 'object') return this._invalid('movimiento');

    const descripcion = movimiento.concepto != null ? String(movimiento.concepto)
      : (movimiento.descripcion != null ? String(movimiento.descripcion) : null);

    // ── 1 · EL CORTE DURO PRIMERO (regla declarada E8, POR EVENTO). Si cubre, NO hay juicio. ──
    const r_regla = await this._rpc('regla-movimiento-bancario.aplicar.request',
      { project_id: pid, movimiento }, { timeout_ms: 4000 });
    const corte = r_regla && r_regla.data ? r_regla.data : null;

    if (corte && corte.cubierta === true && corte.apunte) {
      return {
        status: 200,
        data: {
          project_id: pid,
          movimiento: this._resumen(movimiento, descripcion),
          propuesta: {
            cuenta: corte.apunte.cuenta,
            tercero: corte.apunte.tercero != null ? corte.apunte.tercero : null,
            periodo: corte.apunte.periodo != null ? corte.apunte.periodo : this._periodoDe(movimiento),
            base: { regla_id: corte.regla ? corte.regla.id : null, via: 'regla_declarada' }
          },
          propuesta_por: 'REGLA',
          estado: 'RESUELTO',
          tipo_partida: null,
          corte_duro: corte.regla || null,
          reglas_disponibles: true,
          requiere_cola: false,
          destino_cola: null
        }
      };
    }

    // El corte duro no responde o no cubre: ahora SI se ejerce el juicio, pero con DOS reglas —
    // (a) solo se puede proponer una cuenta que exista en el PLAN declarado (B1);
    // (b) si el blueprint no aporto clasificacion, NO se inventa: [ABIERTO] y a la cola.

    // ── 2 · El JUICIO lo aporta el cajon fuzzy del blueprint; el reflejo no adivina solo. ──
    // `clasificacion` es la salida del juicio (descripcion ambigua + catalogo de tipos declarado).
    const clasificacion = input.clasificacion && typeof input.clasificacion === 'object' ? input.clasificacion : null;
    const tipo_partida = clasificacion && clasificacion.tipo != null
      ? String(clasificacion.tipo).toLowerCase().trim() : null;

    // Sin clasificacion (el juicio no se pudo/pudo ejercer) → [ABIERTO], NUNCA se inventa.
    if (!clasificacion || !tipo_partida || !TIPOS_PARTIDA.includes(tipo_partida)) {
      return this._abierto(pid, movimiento, descripcion, {
        motivo: !corte
          ? 'ni el corte duro (E8) ni el juicio (blueprint) resolvieron la partida: no se inventa la cuenta'
          : (corte.cubierta !== true
            ? 'el corte duro (E8) declaro que ninguna regla cubre el movimiento y no hay clasificacion del juicio'
            : 'clasificacion del juicio ausente o fuera de la taxonomia declarada'),
        corte_duro: corte ? corte.regla : null,
        reglas_disponibles: Boolean(corte)
      });
    }

    // La cuenta la propone el JUICIO (clasificacion), no una constante.
    const cuenta = clasificacion.cuenta != null ? String(clasificacion.cuenta).trim() : null;
    if (!cuenta) {
      return this._abierto(pid, movimiento, descripcion, {
        motivo: 'el juicio reconocio el tipo pero no propuso cuenta: [ABIERTO], no se inventa',
        corte_duro: corte ? corte.regla : null,
        reglas_disponibles: Boolean(corte)
      });
    }

    // ── 3 · La cuenta propuesta debe estar en el PLAN declarado (B1), POR EVENTO. ──
    const r_plan = await this._rpc('catalogo-cuentas.buscar.request', { project_id: pid, codigo: cuenta }, { timeout_ms: 4000 });
    const plan = r_plan && r_plan.data ? r_plan.data : null;
    if (plan && plan.encontrada === false) {
      return this._abierto(pid, movimiento, descripcion, {
        motivo: `el juicio propuso la cuenta ${cuenta}, que no existe en el plan declarado`,
        corte_duro: corte ? corte.regla : null,
        reglas_disponibles: Boolean(corte),
        plan_disponible: true
      });
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        movimiento: this._resumen(movimiento, descripcion),
        propuesta: {
          cuenta,
          tercero: clasificacion.tercero != null ? String(clasificacion.tercero) : null,
          periodo: clasificacion.periodo != null ? String(clasificacion.periodo) : this._periodoDe(movimiento),
          base: {
            regla_id: null,
            via: 'juicio_sobre_descripcion',
            tipo_partida,
            plan_confirmado: plan ? plan.encontrada === true : null,
            clasificacion_origen: clasificacion.origen != null ? String(clasificacion.origen) : 'blueprint'
          }
        },
        propuesta_por: 'JUICIO',
        estado: 'RESUELTO',
        tipo_partida,
        corte_duro: null,
        reglas_disponibles: Boolean(corte),
        plan_disponible: Boolean(plan),
        requiere_cola: false,
        destino_cola: null
      }
    };
  }

  // [ABIERTO]: no se pudo resolver → a la cola, NUNCA se inventa. La escritura la hara el custodio.
  _abierto(pid, movimiento, descripcion, extra = {}) {
    return {
      status: 200,
      data: {
        project_id: pid,
        movimiento: this._resumen(movimiento, descripcion),
        propuesta: null,
        propuesta_por: null,
        estado: 'ABIERTO',
        tipo_partida: null,
        corte_duro: extra.corte_duro || null,
        reglas_disponibles: extra.reglas_disponibles === true,
        plan_disponible: extra.plan_disponible === true,
        motivo: extra.motivo || 'no se pudo identificar la partida: [ABIERTO], no se inventa',
        requiere_cola: true,
        // El destino de la duda es ParametroDeclarable; sin declarar se propone el default honesto.
        destino_cola: 'ASESOR'
      }
    };
  }

  _resumen(movimiento, descripcion) {
    return {
      clave: movimiento.clave != null ? String(movimiento.clave) : null,
      fecha: movimiento.fecha != null ? String(movimiento.fecha) : null,
      importe: this._num(movimiento.importe),
      signo: movimiento.signo != null ? String(movimiento.signo).toLowerCase().trim() : null,
      contraparte: movimiento.contraparte != null ? String(movimiento.contraparte) : null,
      descripcion,
      // La ambiguedad de la descripcion es el objeto del juicio: se declara que esta sin resolver.
      ambigua: true
    };
  }

  _periodoDe(movimiento) {
    const f = movimiento.fecha;
    if (f === undefined || f === null || f === '') return null;
    const s = String(f);
    return /^\d{4}-\d{2}/.test(s) ? s.slice(0, 7) : null;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.abs(n) : null;
  }

  // ── Tools ──
  toolJuzgar(params) { return this._juzgar(params); }
}

module.exports = PartidaNoIdentificada;
