/**
 * contabilidad-analitica/activacion-vertical — REFLEJO STATELESS (K4, hoja del plan).
 *
 * **ENCIENDE LA VERTICAL por la configuracion DECLARADA.** Cuando `onboarding-negocio` (K1)
 * publica que un negocio quedo dado de alta (`contabilidad.negocio_onboarded`), este reflejo
 * DERIVA — de la configuracion que el alta declaro — QUE verticales de contabilidad se encienden
 * y publica `contabilidad.vertical_activada` para que el resto del sistema se ponga en marcha.
 *
 * MECANICO, CERO JUICIO: no decide si el negocio debe tener tal o cual vertical, no inventa
 * planes, no habilita nada que la configuracion no declare. Si el alta no declara verticales,
 * NO se enciende nada y se declara que falta la declaracion (`faltan:['verticales']`).
 *
 * ATRIBUTOS del diseno: `config:OnboardingNegocio`. METODOS: `activar(vertical):bool`.
 * REGLA: enciende la vertical por la configuracion declarada. Mecanico, cero juicio.
 *
 * Invariantes:
 *  - DETERMINISTA: misma config declarada → mismas verticales encendidas.
 *  - LEY/PARAMETRO COMO DATO: la LISTA de verticales es ENTRADA (declarada por el alta o en la
 *    peticion); no hay ningun catalogo de verticales cableado.
 *  - Dato ausente = desconocido: sin verticales declaradas NO se enciende nada ni se asume una
 *    vertical por defecto; se declara ABIERTO.
 *  - NO escribe, NO persiste: la vertical se ENCIENDE publicando; no guarda estado.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
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

  // ── handler RPC (una linea, delega a _atender) ──
  onActivarRequest(e) {
    return this._atender(e, 'activar', 'activacion-vertical.activar.response', async (d) => {
      const res = await this._activar(d);
      if (res.status === 200) this._emitirActivadas(res.data, d.correlation_id);
      else this.eventBus?.publish('activacion-vertical.activar.failed', res);
      return res;
    });
  }

  // ── fire-and-forget: el alta del negocio (K1) declaro la config → se DERIVA la activacion ──
  async onNegocioOnboarded(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const res = await this._activar({
      project_id: d.project_id,
      negocio: d.negocio != null ? d.negocio : null,
      // La config declarada por el alta es la ENTRADA: de ahi se DERIVAN las verticales.
      config: d.config || null,
      plan: d.plan !== undefined ? d.plan : (d.config ? d.config.plan : undefined),
      verticales: d.verticales !== undefined ? d.verticales
        : (d.config && d.config.verticales !== undefined ? d.config.verticales : undefined),
      correlation_id: d.correlation_id
    });
    if (res.status === 200) this._emitirActivadas(res.data, d.correlation_id);
    else this.eventBus?.publish('activacion-vertical.activar.failed', res);
    return res;
  }

  // Se emite UNA vez por vertical encendida: el resto del sistema se engancha por evento.
  _emitirActivadas(data, correlation_id) {
    for (const vertical of data.verticales_activadas) {
      this.eventBus?.publish('contabilidad.vertical_activada', {
        project_id: data.project_id,
        negocio: data.negocio,
        vertical,
        plan: data.plan,
        origen_config: data.origen_config,
        correlation_id
      });
    }
  }

  // ── proyeccion determinista: activar(vertical) → bool (DERIVA de la config, no decide) ──
  _activar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // Las VERTICALES son DATO: declaradas en la peticion, o derivadas de la config del alta.
    const declaradas = this._verticalesDeclaradas(input);
    const plan = this._plan(input);

    if (declaradas.length === 0) {
      // Sin verticales declaradas NO se enciende nada ni se asume una por defecto.
      return {
        status: 200,
        data: {
          project_id: pid,
          negocio: input.negocio != null ? input.negocio : null,
          plan,
          origen_config: input.config ? 'onboarding-negocio' : (input.verticales !== undefined ? 'declarado' : null),
          verticales_declaradas: [],
          verticales_activadas: [],
          total: 0,
          activada: false,
          // Cero juicio: no se elige una vertical "por defecto" si nadie la declaro.
          deriva: false,
          faltan: ['verticales'],
          abierto: {
            verticales: 'la configuracion del alta no declara ninguna vertical: no se enciende nada por defecto',
            origen_config: input.config ? null : 'no llega la config del alta (K1): la activacion es declarada'
          }
        }
      };
    }

    // Activacion DETERMINISTA: se encienden EXACTAMENTE las verticales declaradas, sin ampliar
    // ni reducir. `activada` es true si se enciende al menos una.
    return {
      status: 200,
      data: {
        project_id: pid,
        negocio: input.negocio != null ? input.negocio : null,
        plan,
        origen_config: input.config ? 'onboarding-negocio' : 'declarado',
        verticales_declaradas: declaradas,
        verticales_activadas: declaradas,
        total: declaradas.length,
        activada: true,
        // Derivada: la lista sale de la config declarada; este reflejo no la juzga ni la decide.
        deriva: true,
        faltan: [],
        abierto: { verticales: null, origen_config: null }
      }
    };
  }

  // Las verticales declaradas: en la peticion, o en la config del alta (config.verticales).
  _verticalesDeclaradas(input) {
    const candidatas = [];
    const push = (v) => {
      if (v === undefined || v === null) return;
      if (Array.isArray(v)) { for (const x of v) push(x); return; }
      if (typeof v === 'object') {
        // Formato declarable: {nombre|vertical|id, activa|habilitada|on}
        const nombre = v.nombre != null ? v.nombre : (v.vertical != null ? v.vertical : (v.id != null ? v.id : null));
        if (nombre === null) return;
        // Una vertical explicitamente apagada NO se enciende (es dato declarado, no juicio).
        const activa = v.activa !== undefined ? v.activa
          : (v.habilitada !== undefined ? v.habilitada : (v.on !== undefined ? v.on : true));
        if (activa === true) candidatas.push(String(nombre).trim());
        return;
      }
      const s = String(v).trim();
      if (s) candidatas.push(s);
    };

    push(input.verticales);
    if (input.config && typeof input.config === 'object') {
      push(input.config.verticales);
      push(input.config.verticales_activas);
    }
    // Deduplicado determinista conservando el orden declarado.
    const vistas = new Set();
    const out = [];
    for (const v of candidatas) {
      if (!v || vistas.has(v)) continue;
      vistas.add(v);
      out.push(v);
    }
    return out;
  }

  _plan(input) {
    if (input.plan !== undefined && input.plan !== null) return input.plan;
    if (input.config && typeof input.config === 'object' && input.config.plan !== undefined) return input.config.plan;
    return null;
  }

  // ── Tools ──
  toolActivar(params) { return this._activar(params); }
}

module.exports = ActivacionVertical;
