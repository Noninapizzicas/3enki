/**
 * nichos/escalones-mensaje — REFLEJO STATELESS (G2, hoja del plan).
 *
 * Clasifica los mensajes al supervisor del nicho en el ESCALÓN que les toca:
 * decide qué tipo de mensaje es (pulso | alerta | decisión) según la regla
 * declarada y le asigna la cadencia/escalón de entrega. Consume el tipo de
 * mensaje (origen de escalones-mensaje: pulso-avance, alerta-sangria, gate, ...)
 * y, con el perfil de supervisión (H2), determina el escalón sin ambigüedad.
 *
 * REFLEJO (patrón real, stateless): sin store, sin persistencia, cada op entra
 * objeto, sale objeto — proyección pura determinista. Regla DUROA, no ambigua:
 *   pulso    → notificación informativa con cadencia (no interrumpe)
 *   alerta   → notificación urgente al canal (interrumpe)
 *   decisión → SolicitudDecision que espera respuesta del dueño (exige acción)
 *
 * Publica nichos.escalon.clasificado (-> canal-supervision G1 para enrutar) +
 * par determinista nichos.escalon.clasificar.failed. Ver hoja G2 del plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Tipos de mensaje de supervisión que escalones-mensaje sabe clasificar.
const TIPOS_MENSAJE = new Set(['pulso', 'alerta', 'decision']);

// Escalón que le toca a cada tipo de mensaje — regla dura, no ambigua.
const ESCALON_POR_TIPO = {
  pulso: { escalon: 'PULSO', prioridad: 1, interrumpe: false, exige_accion: false, cadencia: 'declarada' },
  alerta: { escalon: 'ALERTA', prioridad: 2, interrumpe: true, exige_accion: false, cadencia: 'inmediata' },
  decision: { escalon: 'DECISION', prioridad: 3, interrumpe: true, exige_accion: true, cadencia: 'inmediata' }
};

class EscalonesMensaje extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'escalones-mensaje';
    this.version = 'reflejo-0.1.0';
    this.project_id = null;
  }
  async onUnload() { return super.onUnload(); }

  // project.activated — reflejo sin estado: solo registra el project activo.
  async onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    this.project_id = d.project_id || this.project_id;
    this.logger?.info(`${this.name}.reflejo.project_activated`, { project_id: this.project_id });
    return { status: 200, data: { project_id: this.project_id } };
  }

  onClasificarRequest(e) {
    return this._atender(e, 'clasificar', 'nichos.escalon.clasificar.response', async (d) => {
      const res = this._clasificar(d);
      // Emisor/par de fallo: exito → dominio; error → par determinista.
      if (res.status === 200) {
        this.eventBus?.publish('nichos.escalon.clasificado', {
          project_id: res.data.project_id,
          escalon: res.data.escalon,
          clasificado: true,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('nichos.escalon.clasificar.failed', res);
      }
      return res;
    });
  }

  // ── proyección pura: clasifica el tipo → escalón (regla dura, determinista) ──
  _clasificar({ project_id, tipo, mensaje, perfil_supervision } = {}) {
    project_id = project_id || this.project_id;
    if (!project_id) return this._invalid('project_id');
    if (!tipo) return this._invalid('tipo');
    const t = String(tipo).toLowerCase();
    if (!TIPOS_MENSAJE.has(t)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'tipo de mensaje no clasificable', { tipo });
    }

    const regla = this._clasificarTipo(t);
    const cuerpo = String(mensaje || '').trim();

    // Si hay perfil de supervision, aplica la cadencia declarada del dueño (H2).
    const cadencia = (perfil_supervision && perfil_supervision.cadencia_pulso)
      ? perfil_supervision.cadencia_pulso
      : regla.cadencia;

    return {
      status: 200,
      data: {
        project_id,
        tipo: t,
        escalon: regla.escalon,
        prioridad: regla.prioridad,
        interrumpe: regla.interrumpe,
        exige_accion: regla.exige_accion,
        cadencia,
        mensaje: cuerpo,
        regla: 'duro',
        clasificado: true
      }
    };
  }

  // ── proyección pura: rotula/escala un tipo → regla (mecánica, sin juicio) ──
  _clasificarTipo(tipo) {
    const t = String(tipo || '').toLowerCase();
    return ESCALON_POR_TIPO[t] || { escalon: 'PULSO', prioridad: 0, interrumpe: false, exige_accion: false, cadencia: 'declarada' };
  }

  // ── Tools ──
  toolClasificar(params) { return this._clasificar(params); }
  toolClasificarTipo(params) { return this._clasificarTipo(params); }
}

module.exports = EscalonesMensaje;
