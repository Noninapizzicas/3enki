/**
 * contabilidad-analitica/consulta-cuentas-bajo-demanda — PUENTE STATELESS (Q1, hoja del plan).
 *
 * LA PUERTA PULL: conecta la PREGUNTA del dueno con el CALCULO por peticion. NO impone cadencia
 * (nada de informes periodicos: el dueno pregunta, el sistema calcula ESE calculo y responde).
 *   · su pregunta (lenguaje natural) la interpreta puente-lenguaje-dueno (Q2) → consulta estructurada;
 *   · la consulta pide la cifra a quien la calcula: mayor-balanza.saldos.request (B3, saldos),
 *     saldo-tesoreria.calcular.request (E4, caja), cuenta-resultados.calcular.request (C2, resultado);
 *   · sella la cobertura con sello-cobertura.sellar.request (Q3) y consulta el estado borrador/validado
 *     con marca-borrador-validado.estado.request (L1).
 * Recibe las cifras por EVENTO; NO las calcula por su cuenta ni las inventa.
 *
 * Honestidad (invariante 13): sin cifra (ni declarada ni de un calculador vivo) la cuenta queda
 * [ABIERTO] — no se rellena con 0 (0 no es "no hay", es "desconocido").
 *
 * PUENTE → STATELESS. Sin PosPersistencia. RPC preguntar es CLASE PREGUNTA → sin ui_handler.
 * Publica consulta-cuentas-bajo-demanda.preguntar.response y su par .failed.
 * Escucha contabilidad.asiento_asentado (B2) y contabilidad.ejercicio_cerrado (C4), ambos emitidos.
 * Ver hoja Q1 del plan-construccion y diseno-oop.md (CLASE ConsultaCuentasBajoDemanda).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Los CALCULADORES por tipo de cuenta: quien sabe la cifra. El tipo es DATO declarable.
const CALCULADORES = {
  saldos: 'mayor-balanza.saldos.request',
  mayor: 'mayor-balanza.saldos.request',
  caja: 'saldo-tesoreria.calcular.request',
  tesoreria: 'saldo-tesoreria.calcular.request',
  resultado: 'cuenta-resultados.calcular.request',
  ingresos: 'cuenta-resultados.calcular.request',
  gastos: 'cuenta-resultados.calcular.request'
};

class ConsultaCuentasBajoDemanda extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'consulta-cuentas-bajo-demanda';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onPreguntarRequest(e) {
    return this._atender(e, 'preguntar', 'consulta-cuentas-bajo-demanda.preguntar.response', async (d) => {
      const res = await this._preguntar(d);
      // Puente pull: compone y responde; no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('consulta-cuentas-bajo-demanda.preguntar.failed', res);
      return res;
    });
  }

  // ── handlers de dominio (fire-and-forget): la puerta pull observa (ventana acotada) ──
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    this._vistos = this._vistos || [];
    if (d.asiento) this._vistos.push(d.asiento);
    if (this._vistos.length > 1000) this._vistos.shift();
  }

  onEjercicioCerrado(e) {
    const d = (e && (e.data || e)) || {};
    this._cierres = this._cierres || [];
    if (d.estado === 'cerrado') this._cierres.push(d);
    if (this._cierres.length > 100) this._cierres.shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // preguntar(input) → { consulta, cuenta, cobertura, estado, abierto }
  // ══════════════════════════════════════════════════════════════════════
  async _preguntar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const pregunta = input.pregunta != null ? String(input.pregunta).trim() : null;
    // La CONSULTA: declarada, o interpretada por el puente de lenguaje (Q2, best-effort).
    const consulta = await this._consulta(input, pregunta, pid);

    // La CIFRA: declarada, o pedida por EVENTO al calculador que le toca (segun el tipo).
    const { cifra, cuenta, calculador } = await this._cifra(input, consulta, pid);

    // La MARCA: cobertura (sellada por Q3) y estado borrador/validado (L1).
    const cobertura = await this._sellos(input, consulta, pid);

    const sinCifra = cifra === null || cifra === undefined;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'consulta-cuentas-bajo-demanda',
        // Es una PUERTA PULL: no impone cadencia, responde a la pregunta del dueno.
        modo: 'pull',
        impone_cadencia: false,
        pregunta,
        consulta,
        cuenta,
        calculador,
        cifra: sinCifra ? null : cifra,
        cobertura,
        abierto: {
          consulta: consulta ? null : 'no hay consulta (ni declarada ni interpretada por Q2): no se adivina que calcular',
          cifra: sinCifra
            ? 'no llego la cifra (ni declarada ni de un calculador vivo): la cuenta queda ABIERTA (0 no es "no hay", es desconocido)'
            : null
        }
      }
    };
  }

  // Interpreta la pregunta: declarada como objeto, o SUBIDA por EVENTO a puente-lenguaje-dueno (Q2).
  async _consulta(input, pregunta, pid) {
    if (input.consulta && typeof input.consulta === 'object') return input.consulta;
    if (pregunta) {
      const resp = await this._rpc('puente-lenguaje-dueno.a_consulta.request', { project_id: pid, pregunta }, { timeout_ms: 800 });
      if (resp && resp.consulta && Object.keys(resp.consulta).length > 0) return resp.consulta;
    }
    return null;
  }

  // La cifra: declarada, o pedida al calculador que le toca por tipo.
  async _cifra(input, consulta, pid) {
    if (input.cifra !== undefined && input.cifra !== null) return { cifra: input.cifra, cuenta: input.cuenta != null ? String(input.cuenta) : null, calculador: 'declarado' };
    const tipo = (input.tipo != null ? String(input.tipo).toLowerCase() : (consulta && consulta.tipo != null ? String(consulta.tipo).toLowerCase() : 'saldos'));
    const evento = CALCULADORES[tipo] || CALCULADORES.saldos;
    const resp = await this._rpc(evento, {
      project_id: pid,
      fecha: input.fecha, ejercicio: input.ejercicio,
      cuenta: input.cuenta, prefijo: input.prefijo
    }, { timeout_ms: 800 });
    if (!resp) return { cifra: null, cuenta: input.cuenta != null ? String(input.cuenta) : null, calculador: evento };
    const cifra = resp.resultado != null ? resp.resultado
      : (resp.saldo != null ? resp.saldo
        : (Array.isArray(resp.saldos) ? resp.saldos : null));
    return { cifra: cifra === undefined ? null : cifra, cuenta: input.cuenta != null ? String(input.cuenta) : null, calculador: evento };
  }

  // Los sellos: cobertura (Q3) y estado borrador/validado (L1). Best-effort por EVENTO.
  async _sellos(input, consulta, pid) {
    const sello = await this._rpc('sello-cobertura.sellar.request', { project_id: pid, objeto: input.objeto }, { timeout_ms: 700 });
    const estado = await this._rpc('marca-borrador-validado.estado.request', { project_id: pid, objeto: input.objeto }, { timeout_ms: 700 });
    return {
      sello: sello || null,
      estado: estado || null
    };
  }

  // ── Tools ──
  toolPreguntar(params) { return this._preguntar(params); }
}

module.exports = ConsultaCuentasBajoDemanda;
