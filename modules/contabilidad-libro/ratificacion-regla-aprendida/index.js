/**
 * contabilidad-libro/ratificacion-regla-aprendida — PUENTE (L10, hoja del plan).
 *
 * EL GATE HUMANO UNICO. Una REGLA APRENDIDA (por A6.2 contrapartida-asistida o por E8
 * regla-movimiento-bancario) NO actua sobre el volumen hasta que el ASESOR la RATIFICA.
 * Esta pieza es el unico punto donde el humano RATIFICA o BLOQUEA una regla antes de que
 * empiece a operar: mientras no haya ratificacion, la regla NO actua.
 *
 *   · ratificar — el asesor se pronuncia: RATIFICADA (puede actuar) o BLOQUEADA (no actua).
 *     El acto queda con su autor y su fecha, y se ANUNCIA el hecho de dominio
 *     `contabilidad.regla_ratificada` para que los consumidores (regla-contrapartida E8... )
 *     la apliquen o la dejen inerte.
 *
 * Es PUENTE, no custodio: NO persiste el cuerpo de las reglas (eso es de quien las aprende);
 * su cara es el acto de ratificacion y el hecho que anuncia (el acto es efimero y correlado).
 *
 * Invariante: dato ausente = desconocido. Sin una DECISION declarada no hay pronunciamiento
 * (no se asume ratificacion): se pide. Lo que falte se declara en `abierto`, nunca se estima.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja L10 del plan-construccion y diseno-oop.md (CLASE RatificacionReglaAprendida).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Las dos DECISIONES del asesor: ratificar (actua) o bloquear (no actua).
const RATIFICAR = new Set(['RATIFICAR', 'RATIFICADA', 'RATIFICADO', 'APROBAR', 'APROBADA', 'ACTUA']);
const BLOQUEAR = new Set(['BLOQUEAR', 'BLOQUEADA', 'BLOQUEADO', 'RECHAZAR', 'RECHAZADA', 'NO_ACTUA']);

class RatificacionReglaAprendida extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'ratificacion-regla-aprendida';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE ORDEN → ui_handler ──
  onRatificarRequest(e) {
    return this._atender(e, 'ratificar', 'ratificacion-regla-aprendida.ratificar.response', async (d) => {
      const res = this._ratificar(d);
      if (res.status === 200) {
        // R2 · si ESCRIBE (el asesor se pronuncio), anuncia el HECHO: la regla quedo ratificada/bloqueada.
        this.eventBus?.publish('contabilidad.regla_ratificada', {
          project_id: res.data.project_id,
          regla: res.data.regla,
          decision: res.data.decision,
          actua: res.data.actua,
          por: res.data.por,
          en: res.data.en,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('ratificacion-regla-aprendida.ratificar.failed', res);
      }
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // ratificar: el asesor se pronuncia sobre una regla ANTES de que actue
  // ══════════════════════════════════════════════════════════════════════
  _ratificar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const regla = input.regla != null ? String(input.regla).trim()
      : (input.regla_id != null ? String(input.regla_id).trim() : '');
    if (!regla) return this._invalid('regla');

    // La DECISION es del humano: sin ella NO se asume ratificacion (no se estima el acto).
    const decision = this._decision(input.decision);
    if (!decision) return this._invalid('decision');

    const en = new Date().toISOString();
    const por = input.rol != null ? String(input.rol) : (input.por != null ? String(input.por) : null);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'ratificacion-regla-aprendida',
        regla,
        decision,                                    // RATIFICADA | BLOQUEADA
        actua: decision === 'RATIFICADA',            // solo la ratificada opera sobre el volumen
        por,
        en,
        // El acto del asesor es el hecho: la regla deja de estar pendiente.
        pendiente: false,
        abierto: {
          por: por ? null : 'el acto no declaro su autor (rol/por): se anota el hueco, no se inventa quien'
        }
      }
    };
  }

  // Normaliza la decision declarada a RATIFICADA|BLOQUEADA. Ausente/desconocida → null.
  _decision(raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    const v = String(raw).toUpperCase().trim();
    if (RATIFICAR.has(v)) return 'RATIFICADA';
    if (BLOQUEAR.has(v)) return 'BLOQUEADA';
    return null;
  }

  // ── Tools ──
  toolRatificar(params) { return this._ratificar(params); }
}

module.exports = RatificacionReglaAprendida;
