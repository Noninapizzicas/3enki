/**
 * contabilidad-entrada/contrapartida-asistida — MICRO-AGENTE (A6.1, hoja del plan).
 *
 * PROPONE cuenta/tercero/periodo contra el PLAN DECLARADO. PROPONE; el corte duro lo fija
 * `regla-contrapartida` (A6.2). Esta hoja NO decide: sugiere la contrapartida de un hecho y deja
 * que la regla declarada (el humano) fije la contrapartida definitiva.
 *
 * La mitad REFLEJA (determinista) de este micro-agente: NO inventa una contrapartida. Junta lo
 * DECLARADO (la regla vigente, via `regla-contrapartida.aplicar.request` por EVENTO) y lo expone
 * como PROPUESTA. Lo que no este cubierto por una regla declarada NO se rellena: queda declarado
 * como juicio (mitad fuzzy), nunca estimado.
 *
 * Invariantes:
 *  - PROPONE, no fija: `juzgar` deriva; el corte duro es de regla-contrapartida (A6.2).
 *  - Dato ausente = desconocido: sin hecho NO hay nada que proponer; sin regla declarada la
 *    propuesta queda ABIERTA (no se adivina una contrapartida).
 *  - NO escribe, NO persiste.
 *
 * ESCUCHA (R3): contabilidad.hecho_recibido (puerto-evento-vertical A1), contabilidad.plan_cuentas_declarado
 * (catalogo-cuentas B1) y contabilidad.tercero_actualizado (maestro-terceros N1) — TODOS con emisor vivo.
 * Los tres handlers son fire-and-forget: toman constancia del contexto (hecho/plan/tercero) sin
 * anunciar hecho (el proponedor no escribe dominio).
 *
 * Forma: MICRO-AGENTE (mitad refleja) → STATELESS. Sin PosPersistencia, sin onProjectActivated. RPC PREGUNTA → sin ui_handler.
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

  // ── handler RPC PREGUNTA (sin ui_handler: su cara es el bus) ──
  onJuzgarRequest(e) {
    return this._atender(e, 'juzgar', 'contrapartida-asistida.juzgar.response', async (d) => {
      const res = await this._juzgar(d);
      // Micro-agente (mitad refleja): PROPONE; no escribe dominio → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('contrapartida-asistida.juzgar.failed', res);
      return res;
    });
  }

  // ── handlers FIRE-AND-FORGET: contexto declarado (hecho / plan / tercero) ──
  // No son RPC: no publican response. Toman constancia del contexto; no escriben dominio.
  onHechoRecibido(e) {
    const d = (e && (e.data || e)) || {};
    try {
      // El proponedor no persiste: solo deja pasar el hecho recibido (contexto).
      this.logger?.info(`${this.name}.contexto.hecho`, { project_id: d.project_id || null });
    } catch (err) {
      this.logger?.error(`${this.name}.hecho_recibido.error`, { error: err.message });
    }
  }

  onPlanCuentasDeclarado(e) {
    const d = (e && (e.data || e)) || {};
    try {
      this.logger?.info(`${this.name}.contexto.plan`, { project_id: d.project_id || null, codigo: d.codigo || null });
    } catch (err) {
      this.logger?.error(`${this.name}.plan_cuentas_declarado.error`, { error: err.message });
    }
  }

  onTerceroActualizado(e) {
    const d = (e && (e.data || e)) || {};
    try {
      this.logger?.info(`${this.name}.contexto.tercero`, { project_id: d.project_id || null, nif: d.nif || null });
    } catch (err) {
      this.logger?.error(`${this.name}.tercero_actualizado.error`, { error: err.message });
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // juzgar(hecho) → PROPUESTA de contrapartida (PREGUNTA; PROPONE, no fija)
  // ══════════════════════════════════════════════════════════════════════
  async _juzgar(input = {}) {
    const pid = input.project_id || this.project_id || null;

    const hecho = input.hecho !== undefined ? input.hecho
      : (input.evento !== undefined ? input.evento : null);
    if (!hecho || typeof hecho !== 'object') return this._invalid('hecho');

    const contexto = this._contexto(input, hecho);

    // SUBE a regla-contrapartida (A6.2) por EVENTO: la regla declarada es la que decide.
    // Aqui solo se PROPONE; el corte duro lo fija el custodio de reglas.
    const regla = await this._rpc('regla-contrapartida.aplicar.request', {
      project_id: pid,
      contexto,
      hecho
    });

    const aplicada = Boolean(regla && regla.status === 200 && regla.data && regla.data.aplicada === true);
    const contrapartida = aplicada ? (regla.data.contrapartida != null ? regla.data.contrapartida : null) : null;

    // El TERCERO y el PERIODO se proponen desde lo DECLARADO en el hecho (no se estiman).
    const tercero = this._campo(hecho, input.tercero, ['tercero', 'proveedor', 'cliente', 'nif', 'numero_fiscal']);
    const periodo = this._campo(hecho, input.periodo, ['periodo', 'ejercicio', 'fecha', 'fecha_valor']);

    const propuesta = {
      contrapartida,                    // de la regla declarada; sin regla → null (no se adivina)
      tercero,                          // declarado en el hecho; ausente → null
      periodo
    };
    const completa = propuesta.contrapartida != null;

    return {
      status: 200,
      data: {
        project_id: pid,
        hecho,
        contexto,
        propuesta,
        completa,
        // PROPONE; el corte duro lo fija regla-contrapartida (A6.2). Esta hoja NO fija.
        propone: true,
        fija: false,
        regla: aplicada ? (regla.data.regla || null) : null,
        // Determinista en lo declarado; lo no cubierto es juicio (mitad fuzzy del micro-agente).
        abierto: completa ? null
          : 'no hay regla declarada que cubra este hecho: la contrapartida queda declarada abierta (es juicio de la mitad fuzzy, no se estima)'
      }
    };
  }

  // El contexto de la propuesta: declarado o derivado de campos del hecho (proveedor/cliente).
  _contexto(input, hecho) {
    if (input.contexto != null) return String(input.contexto).trim();
    for (const k of ['contexto', 'proveedor', 'cliente', 'tercero', 'nif', 'numero_fiscal']) {
      if (hecho[k] != null && String(hecho[k]).trim() !== '') return String(hecho[k]).trim();
    }
    return null;
  }

  // Lee un campo declarado del hecho (o el valor directo del input). Ausente → null (no se estima).
  _campo(hecho, directo, claves) {
    if (directo !== undefined && directo !== null && String(directo).trim() !== '') return directo;
    for (const k of claves) if (hecho[k] != null && String(hecho[k]).trim() !== '') return hecho[k];
    return null;
  }

  // ── Tools ──
  toolJuzgar(params) { return this._juzgar(params); }
}

module.exports = ContrapartidaAsistida;
