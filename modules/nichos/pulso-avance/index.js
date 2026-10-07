/**
 * nichos/pulso-avance — REFLEJO STATELESS (L5, hoja del plan).
 *
 * Emite el avance del ciclo del nicho por etapa → pulso escalonado al supervisor.
 * Dado el estado/etapa en que va la máquina del nicho (SEMILLA → ... → EN_CAJA),
 * calcula un PROGRESO determinista (0-100, mecánico por regla declarada) y lo
 * traduce a un ESCALÓN de mensaje que escala a escalones-mensaje / canal-supervision.
 *
 * Consumidor de nichos.salud.actualizada (estado real COBRÓ|SANGRA|NEUTRO) y de
 * nichos.pipeline.avanzado (etapa). Cada etapa mapea a un % de avance del ciclo:
 *   SEMILLA 5 · BUSCADO 15 · VALIDANDO 35 · VALIDADO 55 · CONSTRUIDO 70
 *   OPERANDO 85 · COBRANDO 93 · EN_CAJA 100 · SANGRA 100 · CORTADO 100
 *
 * REFLEJO (patrón real, stateless): sin store, sin PosPersistencia, cada op entra
 * objeto, sale objeto — proyección pura determinista. Publica nichos.pulso_emitido
 * (+ par determinista nichos.pulso.emitir.failed). Ver hoja L5 del plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Etapas del ciclo del nicho → % de avance hacia EN_CAJA (regla dura, determinista).
const PROGRESO_POR_ETAPA = {
  SEMILLA: 5,
  BUSCADO: 15,
  VALIDANDO: 35,
  VALIDADO: 55,
  CONSTRUIDO: 70,
  OPERANDO: 85,
  COBRANDO: 93,
  EN_CAJA: 100,
  SANGRA: 100,
  CORTADO: 100,
  OPERANDO_EN_ESPERA: 85
};

// Etapas terminales (el pulso avisa de cierre, no de avance).
const TERMINALES = new Set(['EN_CAJA', 'SANGRA', 'CORTADO']);

// Escalón que corresponde según el estado del avance (informa | urge | cierra).
function escalonDe(etapa, avance) {
  if (TERMINALES.has(etapa)) return { escalon: 'PULSO', prioridad: 1, tipo: 'cierre' };
  if (avance >= 85) return { escalon: 'PULSO', prioridad: 2, tipo: 'avance' };
  if (etapa === 'VALIDANDO' || etapa === 'CONSTRUIDO') return { escalon: 'PULSO', prioridad: 1, tipo: 'avance' };
  return { escalon: 'PULSO', prioridad: 0, tipo: 'avance' };
}

class PulsoAvance extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'pulso-avance';
    this.version = 'reflejo-0.1.0';
    this.project_id = null;
  }

  async onUnload() { return super.onUnload(); }

  // project.activated — reflejo sin estado: solo registra el proyecto activo.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    this.project_id = d.project_id || this.project_id;
    this.logger?.info(`${this.name}.reflejo.project_activated`, { project_id: this.project_id });
    return { status: 200, data: { project_id: this.project_id } };
  }

  // ── handler RPC (una línea, delega a _atender / fire-and-forget) ──
  onEmitirRequest(e) {
    return this._atender(e, 'emitir', 'nichos.pulso.emitir.response', (d) => {
      const res = this._emitirEscalon(d);
      if (res.status === 200) {
        this.eventBus?.publish('nichos.pulso_emitido', res.data);
      } else {
        this.eventBus?.publish('nichos.pulso.emitir.failed', res);
      }
      return res;
    });
  }

  // Fire-and-forget: la máquina del pipeline avanzó de etapa → emite pulso.
  onPipelineAvanzado(e) {
    const d = (e && (e.data || e)) || {};
    const res = this._emitirEscalon({
      project_id: d.project_id || this.project_id,
      nicho: d.nicho || d.nicho_id,
      etapa: d.estado || d.nuevo_estado || d.etapa
    });
    if (res.status === 200) this.eventBus?.publish('nichos.pulso_emitido', res.data);
    else this.eventBus?.publish('nichos.pulso.emitir.failed', res);
    return res;
  }

  // Fire-and-forget: el resultado real del nicho (COBRÓ|SANGRA|NEUTRO) → pulso de cierre.
  onSaludActualizada(e) {
    const d = (e && (e.data || e)) || {};
    const resultado = d.resultado || d.salud || d.estado;
    const etapa = d.etapa || (resultado === 'COBRO' ? 'EN_CAJA' : (resultado === 'SANGRA' ? 'SANGRA' : 'OPERANDO'));
    const res = this._emitirEscalon({
      project_id: d.project_id || this.project_id,
      nicho: d.nicho || d.nicho_id,
      etapa,
      resultado_real: resultado
    });
    if (res.status === 200) this.eventBus?.publish('nichos.pulso_emitido', res.data);
    else this.eventBus?.publish('nichos.pulso.emitir.failed', res);
    return res;
  }

  // ── proyección pura: calcula el % de avance desde la etapa ──
  _calcularProgreso({ project_id, nicho, etapa } = {}) {
    project_id = project_id || this.project_id;
    if (!project_id) return this._invalid('project_id');
    const et = String(etapa || '').toUpperCase();
    const avance = PROGRESO_POR_ETAPA[et];
    if (avance == null) {
      return this._errorResponse(400, 'INVALID_INPUT', 'etapa del ciclo no reconocida', { etapa });
    }
    return {
      status: 200,
      data: { project_id, nicho: nicho || null, etapa: et, avance, terminal: TERMINALES.has(et) }
    };
  }

  // ── proyección pura: emite el pulso escalonado al supervisor ──
  _emitirEscalon(input) {
    const calc = this._calcularProgreso(input);
    if (calc.status !== 200) return calc;
    const { project_id, nicho, etapa: et, avance } = calc.data;
    const escalon = escalonDe(et, avance);
    return {
      status: 200,
      data: {
        project_id,
        nicho,
        etapa: et,
        avance,
        escalon: escalon.escalon,
        prioridad: escalon.prioridad,
        tipo: escalon.tipo,
        // pulso hacia canal-supervision (G1) / escalones-mensaje (G2)
        cuerpo: `nicho ${nicho || '—'} avanza a ${et} (${avance}% del ciclo)`,
        regla: 'duro',
        emitido: true
      }
    };
  }

  // ── Tools ──
  toolCalcularProgreso(params) { return this._calcularProgreso(params); }
  toolEmitirEscalon(params) { return this._emitirEscalon(params); }
}

module.exports = PulsoAvance;
