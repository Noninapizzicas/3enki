/**
 * contabilidad/ratificacion-regla-aprendida — PUENTE STATELESS (L10, hoja del plan).
 *
 * PUERTA UNICA de RATIFICACION: el ASESOR ratifica o BLOQUEA una regla aprendida
 * ANTES de que actue sobre el volumen. Cubre DOS repositorios con UNA sola
 * puerta — A6.2 `regla-contrapartida` y E8 `regla-movimiento-bancario` — no tres
 * puertas distintas. El sistema NO firma ni decide (invariante 11): arma la
 * SolicitudDecision y la entrega; si VENCE sin respuesta, la regla NO actua
 * (JAMAS asume).
 *
 * PUENTE (patron real, stateless): sin PosPersistencia ni project.activated — no
 * guarda estado. La regla aprendida llega por EVENTO (contabilidad.regla_aprendida,
 * de regla-contrapartida / del lado banco), y la decision vuelve por el MISMO
 * canal: si el payload trae `decision` es la RESOLUCION del asesor; si no, es una
 * regla candidata y se arma la solicitud. La dependencia con los repositorios es
 * por EVENTO, NUNCA por require cruzado. Emisor/par de fallo: aprobada publica
 * contabilidad.regla_ratificada (que consumen A6.2/E8 para dejar actuar la
 * regla); bloqueada o vencida publica contabilidad.regla.ratificar.failed. NO
 * REUTILIZA: no existe en el inventario una puerta unica de ratificacion.
 *
 * Ver hoja L10 del diseno-oop y bloque `ratificacion-regla-aprendida` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Decisiones validas del asesor. El sistema NO decide: solo registra la marca.
const DECISIONES = new Set(['APRUEBA', 'RECHAZA', 'BLOQUEA', 'EXPIRA']);

// Estados de la SolicitudDecision (vehiculo de TODA decision humana).
const SOLICITUD_PENDIENTE = 'PENDIENTE';
const SOLICITUD_EXPIRADA = 'EXPIRADA';

class RatificacionReglaAprendida extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'ratificacion-regla-aprendida';
    this.version = 'reflejo-0.1.0';
    // Puente stateless: sin store que persistir. La solicitud va por el bus.
  }

  async onUnload() { return super.onUnload(); }

  // Fire-and-forget: una regla APRENDIDA entra por el canal de ratificacion.
  // Si trae `decision`, es la RESOLUCION del asesor; si no, es la candidata y se
  // arma la SolicitudDecision (el sistema NO resuelve).
  onReglaAprendida(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;

    // Caso RESOLUCION: el asesor respondio → se aplica (ratifica | bloquea).
    if (d.decision !== undefined && d.decision !== null) {
      const res = this._aplicarRatificacion({ ...d, regla: d.regla || d });
      if (res.status === 200 && res.data.actua === true) {
        this.eventBus?.publish('contabilidad.regla_ratificada', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.regla.ratificar.failed', {
          status: res.status === 200 ? 409 : res.status,
          error: res.error || {
            code: 'RATIFICACION_BLOQUEADA',
            message: 'la regla aprendida NO actua: bloqueada o vencida sin respuesta',
            details: res.data
          }
        });
      }
      return res;
    }

    // Caso SOLICITUD: regla candidata → se arma y se entrega la decision al asesor.
    const sol = this._solicitarRatificacion({ ...d, regla: d.regla || d });
    if (sol.status !== 200) {
      this.eventBus?.publish('contabilidad.regla.ratificar.failed', sol);
      return sol;
    }
    this.eventBus?.publish('contabilidad.regla.ratificar.request', {
      ...sol.data,
      correlation_id: d.correlation_id
    });
    return sol;
  }

  // ── proyecciones puras (el sistema arma y entrega; NO resuelve) ──
  // solicitarRatificacion(regla) -> SolicitudDecision {tipo:'RATIFICAR_REGLA',
  // contexto: Documento autocxplicado, estado:'PENDIENTE', resolucion:null}.
  _solicitarRatificacion(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const regla = input && input.regla;
    if (!regla || typeof regla !== 'object') return this._invalid('regla');
    const reglaId = regla.regla_id || regla.id;
    if (!reglaId) return this._invalid('regla.id');

    const solicitud = {
      solicitud_id: input.solicitud_id || `${pid}-rat-${reglaId}`,
      tipo: 'RATIFICAR_REGLA',
      project_id: pid,
      regla_id: reglaId,
      repositorio: regla.repositorio || regla.ambito || null,
      destinatario: 'ASESOR',
      // Paquete AUTOCXPLICADO: calculo + base + cobertura + estado (Documento).
      contexto: {
        patron: regla.patron || null,
        contrapartida: regla.contrapartida || null,
        evidencia: regla.evidencia || null,
        estado_origen: regla.estado || null,
        origen: regla.aportada_por || regla.declarado_por || null
      },
      estado: SOLICITUD_PENDIENTE,
      resolucion: null,
      // Invariante: el sistema NUNCA resuelve; solo crea y entrega.
      creada_por_sistema: true,
      emitida_en: new Date().toISOString()
    };
    return { status: 200, data: { project_id: pid, solicitud, regla_id: reglaId } };
  }

  // aplicarRatificacion(regla, decision) -> ok | bloqueada.
  // Una regla APRENDIDA no actua hasta que el asesor ratifique; si vence, NO actua.
  _aplicarRatificacion(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const regla = input && input.regla;
    if (!regla || typeof regla !== 'object') return this._invalid('regla');
    const reglaId = (input && (input.regla_id || regla.regla_id || regla.id)) || null;
    if (!reglaId) return this._invalid('regla_id');

    const decision = String((input && input.decision) || '').toUpperCase();
    if (!DECISIONES.has(decision)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'decision no valida para ratificar', {
        decision_recibida: decision, decisiones_validas: [...DECISIONES]
      });
    }

    const aprobada = decision === 'APRUEBA';
    const ratificadaPor = (input && (input.ratificada_por || input.asesor || input.rol)) || 'ASESOR';

    return {
      status: 200,
      data: {
        project_id: pid,
        regla_id: reglaId,
        repositorio: regla.repositorio || regla.ambito || null,
        decision,
        estado: aprobada ? 'RATIFICADA' : (decision === 'EXPIRA' ? SOLICITUD_EXPIRADA : 'BLOQUEADA'),
        actua: aprobada,                       // solo APRUEBA deja actuar la regla
        ratificada_por: aprobada ? ratificadaPor : null,
        // Vencida sin respuesta → NO actua (jamas asume); se re-pregunta.
        re_preguntar: decision === 'EXPIRA',
        firma_del_sistema: false                // el sistema NO firma ni decide
      }
    };
  }

  // ── Tools ──
  toolSolicitarRatificacion(params) { return this._solicitarRatificacion(params); }
  toolAplicarRatificacion(params) { return this._aplicarRatificacion(params); }
}

module.exports = RatificacionReglaAprendida;
