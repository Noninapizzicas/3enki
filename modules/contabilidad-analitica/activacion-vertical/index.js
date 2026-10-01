/**
 * contabilidad-analitica/activacion-vertical — REFLEJO STATELESS (K4, hoja del plan).
 *
 * Enciende la VERTICAL por la CONFIGURACION DECLARADA. La regla que lo define todo:
 *   si contabilidad NO esta activada, la vertical FUNCIONA IGUAL.
 * Contabilidad es un OBSERVADOR opcional: su ausencia jamas bloquea la operacion. Este
 * modulo lee la configuracion que la vertical ya declaro (`onboarding-negocio`) y DICE si
 * la observacion contable queda encendida y con que alcance; NO enciende la operacion ni
 * la condiciona.
 *
 * Invariante (13): lo que no este declarado NO se estima. Sin configuracion legible, la
 * activacion queda `activa:false` + `abierto.config` — no se asume un default.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. PREGUNTA → sin ui_handler.
 * Ver hoja K4 del plan-construccion y diseno-oop.md (CLASE ActivacionVertical).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class ActivacionVertical extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'activacion-vertical';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onActivarRequest(e) {
    return this._atender(e, 'activar', 'activacion-vertical.activar.response', async (d) => {
      const res = this._activar(d);
      // Reflejo: lee y declara; no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('activacion-vertical.activar.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _activar(input) → { status, data }  ·  enciende la observacion contable por DECLARACION
  // ══════════════════════════════════════════════════════════════════════
  _activar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // La configuracion DECLARADA por la vertical (la trae onboarding-negocio). Ausente → no se estima.
    const config = (input.config && typeof input.config === 'object') ? input.config
      : (input.configuracion && typeof input.configuracion === 'object' ? input.configuracion : null);

    // Alcance declarado: que modulos contables (si alguno) deben observarse.
    const alcance = Array.isArray(input.alcance) ? input.alcance.map(String)
      : (config && Array.isArray(config.contabilidad) ? config.contabilidad.map(String) : []);

    // La declaracion explicita manda; sin ella, se esta activada SOLO si el alcance no viene vacio.
    const declarada = input.activa !== undefined ? input.activa === true
      : (config && config.contabilidad_activa !== undefined ? config.contabilidad_activa === true
        : alcance.length > 0);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'activacion-vertical',
        // Si contabilidad no esta activada, la vertical funciona IGUAL. Por eso:
        activa: declarada,
        // El hecho de que la operacion NO dependa de esto es parte de la respuesta:
        bloquea_operacion: false,
        alcance,
        config_declarada: Boolean(config),
        // Lo no declarado se declara (no se rellena con un default).
        abierto: {
          config: config ? null
            : 'la vertical no declaro configuracion legible: la activacion se resuelve por lo explicito (no se estima un default)',
          alcance: alcance.length ? null : 'no se declaro alcance contable (la observacion queda sin modulos declarados)'
        }
      }
    };
  }

  // ── Tools ──
  toolActivar(params) { return this._activar(params); }
}

module.exports = ActivacionVertical;
