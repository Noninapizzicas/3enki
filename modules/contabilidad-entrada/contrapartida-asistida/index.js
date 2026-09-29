/**
 * contabilidad-entrada/contrapartida-asistida — MICRO-AGENTE (A6.1, hoja del plan).
 *
 * PROPONE la contrapartida de un hecho (cuenta + tercero + periodo) contra el PLAN
 * DECLARADO (`catalogo-cuentas`, B1) y la ficha del tercero (`maestro-terceros`, N1),
 * ambas consultadas POR EVENTO — nunca por import cruzado.
 *
 * Es la cara ASISTIDA: PROPONE, no escribe, no decide. El CORTE DURO lo fija la REGLA
 * (`regla-contrapartida`, A6.2). Si NO hay regla que cubra el hecho, NO inventa la
 * cuenta: devuelve `propuesta:null` y manda el asunto a la cola de excepcion (A8.1),
 * con su destino derivado de la naturaleza.
 *
 * Invariantes:
 *  - JAMAS fabrica una cuenta. No hay regla → no hay propuesta.
 *  - JAMAS escribe: no asienta, no persiste, no marca nada.
 *  - El plan manda: una cuenta propuesta fuera del plan no se propone (se declara y va a cola).
 *  - Si el plan o el maestro de terceros NO estan disponibles, no se inventa dato: `disponible:false`.
 *  - La propuesta es determinista y auditable (regla, plan_confirmado, tercero, motivo).
 *
 * Forma: MICRO-AGENTE → STATELESS en este contrato (no persiste estado propio): su cajon
 * fuzzy vive en el blueprint, y toda su memoria relevante es EXTERNA (plan + reglas +
 * terceros). Persistir aqui duplicaria estado ya custodido por A6.2/N1 sin ganar nada.
 * Ver hoja A6.1 del plan-construccion y diseno-oop.md (CLASE ContrapartidaAsistida).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class ContrapartidaAsistida extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'contrapartida-asistida';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  onJuzgarRequest(e) {
    return this._atender(e, 'juzgar', 'contrapartida-asistida.juzgar.response', async (d) => {
      const res = await this._juzgar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: hay propuesta (o hay queja razonada si no la hay).
        this.eventBus?.publish('contabilidad.contrapartida_propuesta', {
          project_id: res.data.project_id,
          propuesta: res.data.propuesta,
          propuesta_por: res.data.propuesta_por,
          regla: res.data.regla,
          plan_disponible: res.data.plan_disponible,
          tercero_disponible: res.data.tercero_disponible,
          requiere_cola: res.data.requiere_cola,
          destino_cola: res.data.destino_cola,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contrapartida-asistida.juzgar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion: juzgar(h:Hecho) → Propuesta<Apunte> | null ──
  async _juzgar(input = {}) {
    const hecho = input.hecho || input.h;
    if (!hecho || typeof hecho !== 'object') return this._invalid('hecho');

    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const naturaleza = input.naturaleza != null ? String(input.naturaleza).toUpperCase() : 'CONTABLE';

    // 1) EL CORTE DURO primero: la REGLA (A6.2). Sin regla que cubra → no se propone.
    const resp_regla = await this._rpc('regla-contrapartida.aplicar.request',
      { project_id: pid, hecho }, { timeout_ms: 4000 });
    const corte = resp_regla && resp_regla.data ? resp_regla.data : null;
    if (!corte) {
      return {
        status: 200,
        data: {
          project_id: pid,
          propuesta: null,
          propuesta_por: null,
          regla: null,
          plan_disponible: false,
          tercero_disponible: false,
          motivo: 'la regla (A6.2) no respondio: no hay corte duro y esta hoja no decide',
          requiere_cola: true,
          destino_cola: naturaleza === 'NEGOCIO' ? 'DUENO' : 'ASESOR',
          disponible: false
        }
      };
    }
    if (!corte.cubierta) {
      return {
        status: 200,
        data: {
          project_id: pid,
          propuesta: null,
          propuesta_por: null,
          regla: null,
          plan_disponible: true,
          tercero_disponible: false,
          motivo: corte.motivo || 'ninguna regla cubre el hecho: no se inventa la cuenta',
          requiere_cola: true,
          destino_cola: corte.destino_cola || (naturaleza === 'NEGOCIO' ? 'DUENO' : 'ASESOR'),
          disponible: true
        }
      };
    }

    // 2) La regla cubre: se PROPONE su apunte, confirmado contra el plan si el plan responde.
    const cuenta = corte.apunte ? corte.apunte.cuenta : null;
    let plan_disponible = false;
    let plan_confirmado = null;
    const resp_plan = await this._rpc('catalogo-cuentas.buscar.request',
      { project_id: pid, codigo: cuenta }, { timeout_ms: 4000 });
    const plan = resp_plan && resp_plan.data ? resp_plan.data : null;
    if (plan) {
      plan_disponible = true;
      plan_confirmado = plan.encontrada === true;
      if (!plan_confirmado) {
        // El plan manda: la cuenta no existe en el plan declarado → no se propone.
        return {
          status: 200,
          data: {
            project_id: pid,
            propuesta: null,
            propuesta_por: null,
            regla: corte.regla || null,
            plan_disponible,
            plan_confirmado,
            tercero_disponible: false,
            motivo: `la regla apunta a la cuenta ${cuenta}, que no esta en el plan declarado`,
            requiere_cola: true,
            destino_cola: 'ASESOR',
            disponible: true
          }
        };
      }
    }

    // 3) Tercero: se confirma la ficha (N1) si el hecho trae tercero y el maestro responde.
    const nif = this._nifDe(hecho);
    let tercero_disponible = false;
    let tercero = null;
    if (nif) {
      const resp_tercero = await this._rpc('maestro-terceros.ficha.request',
        { project_id: pid, tercero: { nif } }, { timeout_ms: 4000 });
      const ficha = resp_tercero && resp_tercero.data ? resp_tercero.data : null;
      if (ficha) {
        tercero_disponible = true;
        tercero = ficha.tercero || null;
      }
    }

    const propuesta = {
      cuenta,
      tercero: corte.apunte ? (corte.apunte.tercero != null ? corte.apunte.tercero : nif) : nif,
      periodo: corte.apunte ? corte.apunte.periodo : null,
      // Trazabilidad de la propuesta: de donde sale cada pieza, sin inventar nada.
      base: {
        regla_id: corte.regla ? corte.regla.id : null,
        plan_confirmado,
        tercero_conocido: Boolean(tercero)
      }
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        propuesta,
        propuesta_por: 'REGLA',
        regla: corte.regla || null,
        plan_disponible,
        plan_confirmado,
        tercero_disponible,
        tercero,
        motivo: 'propuesta derivada de la regla declarada; el corte duro lo fija A6.2',
        requiere_cola: false,
        destino_cola: null,
        disponible: true
      }
    };
  }

  _nifDe(hecho) {
    const t = hecho.tercero;
    const raw = (t && typeof t === 'object') ? (t.nif ?? t.numero_fiscal) : t;
    if (raw === undefined || raw === null || raw === '') return null;
    return String(raw).toUpperCase().replace(/[\s.\-_/]/g, '');
  }

  toolJuzgar(params) { return this._juzgar(params); }
}

module.exports = ContrapartidaAsistida;
