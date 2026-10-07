/**
 * nichos/alerta-sangria — PUENTE STATELESS (F4, hoja del plan).
 *
 * Techo de pérdida: vigila el CUADRO de salud financiera del nicho (F3) y, al
 * cruzar el techo de sangría declarado, arma una SolicitudDecision y la entrega
 * al canal de supervisión (G1) — el SISTEMA NUNCA mata el proyecto por su
 * cuenta, siempre es caso a decidir por el dueño.
 *
 * Proyecciones puras:
 *   _monitorear  evalúa el cuadro contra el techo_de_perdida → CruzaTecho:bool.
 *   _emitirDecision  al cruzar, arma la SolicitudDecision (estado PENDIENTE)
 *                    y la emite por evento → caso a decidir, no mata sola.
 *
 * Stateless (patrón real del puente, canal-supervision/gate-decision-operar):
 * sin store, sin persistencia, cada op entra objeto, sale objeto. El puente
 * comunica el techo al exterior (el dueño via canal-supervision), NO decide.
 * Publica nichos.alerta.sangria (+ nichos.alerta.monitorear.failed).
 * Ver hoja F4 del plan-construccion.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class AlertaSangria extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'alerta-sangria';
    this.version = 'reflejo-0.1.0';
    this.project_id = null;
  }
  async onUnload() { return super.onUnload(); }

  // project.activated — puente sin estado: solo registra el project activo.
  async onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    this.project_id = d.project_id || this.project_id;
    this.logger?.info(`${this.name}.reflejo.project_activated`, { project_id: this.project_id });
    return { status: 200, data: { project_id: this.project_id } };
  }

  onMonitorearRequest(e) {
    return this._atender(e, 'monitorear', 'nichos.alerta.monitorear.response', async (d) => {
      const res = await this._monitorear(d);
      if (res.status !== 200) {
        this.eventBus?.publish('nichos.alerta.monitorear.failed', res);
        return res;
      }
      if (res.data.cruza_techo) {
        // Al cruzar el techo → caso a decidir: se arma y emite la SolicitudDecision.
        this.eventBus?.publish('nichos.alerta.sangria', res.data);
      }
      return res;
    });
  }

  // ── proyección pura: cruza techo? + emisor de la SolicitudDecision ──
  async _monitorear({ project_id, cuadro, techo_perdida_eur, canal, pagador } = {}) {
    project_id = project_id || this.project_id;
    if (!project_id) return this._invalid('project_id');
    if (!cuadro || typeof cuadro !== 'object') return this._invalid('cuadro');
    if (!canal || typeof canal !== 'string' || !canal.trim()) return this._invalid('canal');

    const techo = techo_perdida_eur != null ? Number(techo_perdida_eur) : null;
    // El techo es del contrato/umbría declarado (F0); sin él no hay cruce a decidir.
    if (techo == null || !Number.isFinite(techo) || techo <= 0) return this._invalid('techo_perdida_eur');

    // Perdida real del cuadro (F3) — el sistema calcula de hechos, no de promesas.
    const perdida = Number(cuadro.perdida_eur ?? cuadro.sangria_eur ?? 0);
    const cruza_techo = Number.isFinite(perdida) && perdida >= techo;

    const base = {
      project_id,
      estado: 'PENDIENTE',
      tipo: 'sangria',
      cuadro,
      techo_perdida_eur: techo,
      perdida_eur: perdida,
      cruza_techo,
      canal,
      pagador: (pagador && String(pagador).trim()) ? String(pagador).trim() : null,
      decision_esperada: 'MANTENER_A_PERDIDA|MATA_PROYECTO',
      alertado_en: new Date().toISOString()
    };

    // Al cruzar → SolicitudDecision armada y emitida por evento (caso a decidir,
    // el sistema nunca mata sola). Si no cruza, no se emite alerta.
    const data = cruza_techo
      ? { ...base, decision: this._emitirDecision(base) }
      : base;

    return { status: 200, data };
  }

  // ── REFLEJO (mecánico, determinista): arma la SolicitudDecision ──
  _emitirDecision(solicitud) {
    return {
      solicitud_id: `${solicitud.project_id}-${solicitud.tipo}-${Date.now()}`,
      ...solicitud,
      estado: 'PENDIENTE',        // PENDIENTE → RESUELTA | EXPIRADA (la gestiona K2)
      decision: null,
      entregado_a: solicitud.canal
    };
  }

  // ── Tools ──
  toolMonitorear(params) { return this._monitorear(params); }
  toolEmitir(params) { return this._emitirDecision(params); }
}

module.exports = AlertaSangria;
