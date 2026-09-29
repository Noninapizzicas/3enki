/**
 * contabilidad-libro/ratificacion-regla-aprendida — PUENTE STATELESS (L10, hoja del plan).
 *
 * 🔴 **LA RATIFICACION ES DEL ASESOR. EL SISTEMA PROPONE Y ESPERA; NO RATIFICA POR SI MISMO.**
 *
 * Gate humano UNICO para A6.2 (regla-contrapartida) y E8 (regla-movimiento-bancario): una regla
 * aprendida NO actua sobre el volumen hasta que el ASESOR la ratifica. Es el ESPEJO de flujo-firma
 * (L3): alli la firma; aqui la ratificacion de la regla.
 *
 * DOS CAMINOS, JAMAS CONFUNDIDOS:
 *   · SIN `decision` → el sistema ARMA la solicitud y ESPERA (`armada:true`, `ratificada:false`,
 *     `espera_ratificacion:true`). NO ratifica, NO asume el silencio.
 *   · CON `decision` y `asesor` → REGISTRA la RATIFICACION del asesor (`'ratifica'`) o su BLOQUEO
 *     (`'bloquea'`). Cualquier otro rol (el SISTEMA incluido) → 403: el sistema NO ratifica.
 *
 * 🔴 **SI VENCE SIN RATIFICACION → EXPIRA Y SE RE-PREGUNTA, JAMAS ASUME.** Una solicitud cuya
 * validez declarada pasa sin ratificacion NO se da por ratificada ni por bloqueada: se marca
 * EXPIRADA y se ARMA una solicitud NUEVA (`re_preguntada:true`). La ausencia de ratificacion
 * NUNCA se interpreta como un si. La validez es DECLARABLE (`vence_en` ISO o `validez_ms`): sin
 * validez declarada la solicitud NO vence — y se declara que no vence (cero plazos cableados).
 *
 * ATRIBUTOS del diseno: `propuestas:Set<ReglaAprendida>`.
 * METODOS: `ratificar(r, decision∈{ratifica,bloquea})`.
 *
 * Invariantes:
 *  - El sistema NO ratifica y NO decide (invariante 6): la decision entra como DATO del asesor.
 *  - Dato ausente = desconocido: sin `decision` no hay ratificacion; sin propuesta no hay nada que
 *    ratificar; sin validez declarada no expira. Nada se estima.
 *  - DETERMINISTA: misma propuesta + misma decision + mismo reloj declarado → mismo resultado.
 *  - La regla SOLO actua con `ratifica` (`actua:true`); con `bloquea` la regla NO actua.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated (no custodia las
 * propuestas: las ratifica BAJO DEMANDA quien las tiene pendientes).
 * Ver hoja L10 del plan-construccion y diseno-oop.md (CLASE RatificacionReglaAprendida).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// 🔴 EL UNICO QUE RATIFICA ES EL ASESOR. Cualquier otro rol (SISTEMA incluido) → 403.
const ROL_ASESOR = 'ASESOR';
// Las dos decisiones posibles del asesor (contrato de la op: decision∈{ratifica,bloquea}).
// NO son un criterio de negocio cableado: son la FORMA del acto de ratificar.
const DECISIONES = new Set(['ratifica', 'bloquea']);

class RatificacionReglaAprendida extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'ratificacion-regla-aprendida';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onRatificarRequest(e) {
    return this._atender(e, 'ratificar', 'ratificacion-regla-aprendida.ratificar.response', async (d) => {
      const res = this._ratificar(d);
      if (res.status === 200) {
        // Solo una RATIFICACION REAL (puesta por el asesor) emite el evento de dominio.
        if (res.data.registrada === true) {
          this.eventBus?.publish('contabilidad.regla_ratificada', {
            project_id: res.data.project_id,
            regla: res.data.propuesta.regla,
            propuesta_id: res.data.propuesta.id,
            origen: res.data.propuesta.origen,
            // La DECISION viaja entera: regla-contrapartida (A6.2) y regla-movimiento-bancario
            // (E8) solo ACTUAN si es 'ratifica'; con 'bloquea' la regla NO actua.
            decision: res.data.decision,
            actua: res.data.actua,
            asesor: res.data.asesor,
            ratificada_por: 'asesor',
            ratificada_en: res.data.ratificada_en,
            correlation_id: d.correlation_id
          });
        }
      } else {
        // Incluye 403 cuando quien pretende ratificar NO es el asesor: el sistema no ratifica.
        this.eventBus?.publish('ratificacion-regla-aprendida.ratificar.failed', res);
      }
      return res;
    });
  }

  // ── SEÑALES (fire-and-forget, TOLERANTES): A6.2 y E8 proponen una regla aprendida.
  // L10 es un PUENTE STATELESS: no custodia las propuestas (no las acumula). Solo deja
  // constancia en el log de que hay una regla esperando la ratificacion del ASESOR — la
  // ratificacion se pide BAJO DEMANDA por RPC, con la propuesta en la mano.
  _senal(evento, e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    this.logger?.info(`ratificacion-regla-aprendida.senal.${evento}`, {
      module: this.name,
      project_id: d.project_id,
      regla: d.regla !== undefined ? d.regla : null,
      propuesta_id: d.propuesta_id !== undefined ? d.propuesta_id : (d.id !== undefined ? d.id : null),
      // La regla NO ha actuado todavia: espera la ratificacion del asesor (el sistema no la suple).
      espera_ratificacion: true,
      correlation_id: d.correlation_id
    });
    return null;
  }

  // A6.2 → L10: regla-contrapartida propuso una regla aprendida.
  onReglaContrapartidaPropuesta(e) { return this._senal('regla_contrapartida_propuesta', e); }
  // E8 → L10: regla-movimiento-bancario propuso una regla aprendida.
  onReglaBancariaPropuesta(e) { return this._senal('regla_bancaria_propuesta', e); }

  // ══════════════════════════════════════════════════════════════════════
  // ratificar(r, decision) — ARMA (el sistema propone y espera) o REGISTRA la decision del asesor
  // ══════════════════════════════════════════════════════════════════════
  _ratificar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // La PROPUESTA: la regla aprendida que se somete al gate. Sin propuesta no hay nada que ratificar.
    const propuesta = this._propuesta(input);
    if (!propuesta) return this._invalid('propuesta');

    // Sin decision declarada → el SISTEMA ARMA la solicitud y ESPERA. NO es una ratificacion.
    const decision_declarada = input.decision !== undefined ? String(input.decision).toLowerCase().trim() : '';
    if (!decision_declarada) return this._armar(pid, input, propuesta);

    // Con decision declarada, pero sin asesor → no hay acto: la ratificacion es de una PERSONA.
    // (Un rol del sistema no puede ratificar aunque se declare una decision.)
    if (input.asesor === undefined || input.asesor === null || String(input.asesor).trim() === '') {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'la ratificacion es del asesor: el sistema NO ratifica ni decide en su nombre',
        { rol_esperado: ROL_ASESOR, rol_recibido: null, regla: propuesta.regla });
    }

    return this._registrar(pid, input, propuesta, decision_declarada);
  }

  // ── ARMA la solicitud de ratificacion (el sistema PROPONE y ESPERA; NO ratifica) ──
  _armar(pid, input, propuesta) {
    const ahora = this._ahora(input);
    const validez = this._validez(input, ahora);

    // 🔴 VENCIDA SIN RATIFICACION → EXPIRA Y SE RE-PREGUNTA, jamas se asume.
    if (this._vencido(input, ahora)) {
      const nueva = this._solicitud(pid, propuesta, validez, ahora, { re_de: propuesta.solicitud_id ?? null });
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'ratificacion-regla-aprendida',
          propuesta,
          decision: null,
          registrada: false,
          ratificada: false,
          armada: true,
          estado: 'EXPIRADA',
          solicitud: nueva,
          // La ausencia de ratificacion NO se interpreta: se expira y se vuelve a preguntar.
          vencida: true,
          re_preguntada: true,
          espera_ratificacion: true,
          actua: false,
          ratifica_por: 'asesor',
          ratificacion_del_sistema: false,
          motivo: 'la solicitud de ratificacion vencio sin decision: se expira y se RE-PREGUNTA, jamas se asume',
          abierto: { decision: 'la ratificacion del asesor sigue pendiente: el sistema no la suple' }
        }
      };
    }

    const solicitud = this._solicitud(pid, propuesta, validez, ahora, {});
    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'ratificacion-regla-aprendida',
        propuesta,
        decision: null,
        // 🔴 El sistema PROPONE y espera: NO hay ratificacion.
        registrada: false,
        ratificada: false,
        armada: true,
        estado: 'PENDIENTE',
        solicitud,
        vencida: false,
        re_preguntada: false,
        espera_ratificacion: true,
        // La regla NO actua sobre el volumen hasta que el asesor ratifique.
        actua: false,
        ratifica_por: 'asesor',
        ratificacion_del_sistema: false,
        abierto: {
          decision: 'la regla espera la ratificacion del asesor: el sistema NO ratifica ni asume el silencio',
          vence_en: solicitud.vence_en ? null : 'no se declaro validez: la solicitud no vence (cero plazos cableados)'
        }
      }
    };
  }

  // ── REGISTRA la decision del ASESOR (ratifica o bloquea) ──
  _registrar(pid, input, propuesta, decision) {
    // 🔴 GUARD — EL SISTEMA NO RATIFICA: solo el rol del asesor puede ratificar/bloquear.
    const rol = input.rol != null ? String(input.rol).toUpperCase() : ROL_ASESOR;
    if (rol !== ROL_ASESOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'la ratificacion es del asesor: el sistema NO ratifica ni decide',
        { rol_esperado: ROL_ASESOR, rol_recibido: rol, regla: propuesta.regla });
    }

    // La DECISION debe ser una de las dos del contrato (la forma del acto, no un criterio de negocio).
    if (!DECISIONES.has(decision)) {
      return this._errorResponse(400, 'INVALID_INPUT',
        "decision debe ser 'ratifica' o 'bloquea'",
        { decision, admitidas: [...DECISIONES], field: 'decision' });
    }

    const ahora = this._ahora(input);
    const asesor = String(input.asesor).trim();

    const ratificacion = {
      regla: propuesta.regla,
      propuesta_id: propuesta.id,
      origen: propuesta.origen,
      // Quien ratifica: EL ASESOR (dato declarado). El sistema solo custodia la marca del acto.
      asesor,
      decision,
      // La MARCA de la decision: DECLARADA. Nada se interpreta por el asesor.
      marca: input.marca !== undefined ? input.marca : null,
      comentario: input.comentario != null ? String(input.comentario) : null,
      solicitud_id: input.solicitud_id != null ? String(input.solicitud_id) : (propuesta.solicitud_id ?? null),
      ratificada_en: ahora
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'ratificacion-regla-aprendida',
        propuesta,
        decision,
        // 🔴 RATIFICACION REAL: la puso el asesor, no el sistema.
        registrada: true,
        ratificada: decision === 'ratifica',
        bloqueada: decision === 'bloquea',
        armada: false,
        estado: decision === 'ratifica' ? 'RATIFICADA' : 'BLOQUEADA',
        ratificacion,
        asesor,
        // La regla SOLO actua con `ratifica`. Con `bloquea` la regla NO actua sobre el volumen.
        actua: decision === 'ratifica',
        espera_ratificacion: false,
        ratifica_por: 'asesor',
        ratificacion_del_sistema: false,
        abierto: { decision: null, vence_en: null }
      }
    };
  }

  // La PROPUESTA: DECLARADA. Sin regla no hay nada que someter al gate. Cero formatos impuestos.
  _propuesta(input) {
    const p = input.propuesta && typeof input.propuesta === 'object' ? input.propuesta
      : (input.regla && typeof input.regla === 'object' ? input.regla : null);
    if (!p) return null;
    return {
      id: p.id != null ? String(p.id) : (input.propuesta_id != null ? String(input.propuesta_id) : null),
      // El ORIGEN declarado: de donde vino la regla aprendida (A6.2 / E8 / otro) — no se cablea.
      origen: p.origen != null ? String(p.origen) : (input.origen != null ? String(input.origen) : null),
      regla: p.regla !== undefined ? p.regla : p,
      propuesta_en: p.propuesta_en != null ? String(p.propuesta_en) : null,
      solicitud_id: p.solicitud_id != null ? String(p.solicitud_id) : null
    };
  }

  _solicitud(pid, propuesta, validez, ahora, extra = {}) {
    return {
      id: `solicitud_${pid}_${propuesta.id != null ? propuesta.id : 'regla'}_${ahora}`,
      regla: propuesta.regla,
      propuesta_id: propuesta.id,
      origen: propuesta.origen,
      // A quien se pregunta: DECLARABLE ([ABIERTO] quien ratifica). Sin declarar → null.
      destinatario: null,
      // La validez es DECLARABLE: sin validez declarada la solicitud NO vence (cero plazos cableados).
      vence_en: validez.vence_en,
      validez_ms: validez.validez_ms,
      estado: 'PENDIENTE',
      armada_en: ahora,
      ...extra
    };
  }

  _vencido(input, ahora_iso) {
    // El reloj es DATO declarable (`ahora`); si no se declara, el reloj real. Determinista con `ahora`.
    const ahora = Date.parse(ahora_iso);
    let vence_en = input.vence_en != null ? String(input.vence_en) : null;
    if (!vence_en && input.validez_ms != null && input.armada_en != null) {
      const ms = Number(input.validez_ms);
      const armada = Date.parse(String(input.armada_en));
      if (Number.isFinite(ms) && Number.isFinite(armada)) vence_en = new Date(armada + ms).toISOString();
    }
    if (!vence_en) return false;                       // sin validez declarada, no vence (cero plazos cableados)
    const v = Date.parse(vence_en);
    if (!Number.isFinite(v) || !Number.isFinite(ahora)) return false;
    return ahora > v;
  }

  // La validez es DATO: `vence_en` (ISO) o `validez_ms` (+ `armada_en`). Sin declarar → null (no vence).
  _validez(input, armada_iso) {
    const validez_ms = (input.validez_ms !== undefined && input.validez_ms !== null && Number.isFinite(Number(input.validez_ms)))
      ? Number(input.validez_ms) : null;
    let vence_en = input.vence_en != null ? String(input.vence_en) : null;
    if (!vence_en && validez_ms !== null) {
      vence_en = new Date(Date.parse(armada_iso) + validez_ms).toISOString();
    }
    return { vence_en: Number.isFinite(Date.parse(String(vence_en))) ? vence_en : null, validez_ms };
  }

  // El reloj: declarable (`ahora`) para que el resultado sea reproducible; si no, el real.
  _ahora(input) {
    if (input.ahora != null) {
      const t = Date.parse(String(input.ahora));
      if (Number.isFinite(t)) return new Date(t).toISOString();
    }
    return new Date().toISOString();
  }

  // ── Tools ──
  toolRatificar(params) { return this._ratificar(params); }
}

module.exports = RatificacionReglaAprendida;
