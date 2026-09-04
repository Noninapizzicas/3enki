/**
 * orquestador_cola — ORQUESTADOR del ciclo de impresión 3D (PASO 3 del plan-construccion).
 *
 * Contrato: cierra el ciclo libre → propuesta → aprobación → imprimiendo → impreso → libre.
 * Es la ÚNICA línea de conexión dominio↔mundo externo (la máquina). Compone los dos
 * módulos ya construidos por bus:
 *   - cola_modelos   (custodio single-writer: agrega, actualiza estado, lista)
 *   - motor_propuesta (motor puro: elige el siguiente por prioridad)
 *
 * FORMA: HÍBRIDO — reflejo (index.js) + blueprint (orquestador_cola.blueprint.json).
 *   - REFLEJO: lo determinista — al_liberarse y al_terminar_impresion componen
 *     cola_modelos + motor_propuesta (transiciones legales, reversión de fallo,
 *     ociosa explícita). Sin store propio: lee/escribe via cola_modelos.
 *   - BLUEPRINT: la decisión de VALOR — presentar_candidato / aprobar_rechazar
 *     (el LLM de página decide si el candidato propuesto se aprueba). NUNCA
 *     blueprint→blueprint; siempre blueprint→reflejo.
 *
 * Garantía central (n.º 11 del plan): el ciclo SIEMPRE responde — la máquina queda
 * imprimiendo o se emite ociosa() con causa. Nunca silencio, nunca se inventa trabajo.
 *
 * Invariantes que sostiene:
 *   - al_liberarse con cola vacía → ociosa() + evento cola.ociosa (n.º 1).
 *   - fallo al arrancar la impresión → revierte a PENDIENTE y reintenta (n.º 6).
 *   - aprobación rechazada → deja el modelo pendiente y reintenta con el siguiente (n.º 5).
 *   - un solo trabajo a la vez: el singleton 'imprimiendo' lo garantiza cola_modelos (n.º 8).
 *
 * v0.1.0 (primera pasada del plan-construccion): esqueleto del orquestador.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

class OrquestadorColaReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'orquestador_cola';
    this.version = 'reflejo-0.1.0';
  }

  // Handlers RPC
  onAlLiberarseRequest(e)        { return this._atender(e, 'al_liberarse', 'orquestador_cola.al_liberarse.response', d => this._alLiberarse(d)); }
  onAlTerminarImpresionRequest(e){ return this._atender(e, 'al_terminar_impresion', 'orquestador_cola.al_terminar_impresion.response', d => this._alTerminarImpresion(d)); }

  // ── PROYECCIONES (dominio) ──

  // _alLiberarse: la máquina quedó libre → propone el siguiente por prioridad y lo
  // pasa a IMPRIMIENDO. Si no hay candidato pendiente → ociosa() con causa explícita
  // (nunca silencio). Si el arranque falla → revierte a PENDIENTE y reintenta con el
  // siguiente (no pierde el trabajo, no deja la máquina muda).
  async _alLiberarse(input) {
    if (!input.project_id) return this._invalid('project_id');

    // 1. Proponer el siguiente (motor puro lee la cola del custodio).
    const prop = await this._rpc('motor_propuesta.proponer_siguiente.request', { project_id: input.project_id });
    if (!prop) {
      return this._errorResponse(502, 'UPSTREAM_UNREACHABLE', 'no se pudo consultar el motor de propuesta', {});
    }
    if (prop.status !== 200 || !prop.data || !prop.data.propuesta) {
      // Ausente canónico: cola sin candidatos → ociosa explícita (n.º 1).
      this._publicarEvento('cola.ociosa', { project_id: input.project_id, causa: prop.data?.causa || 'sin_candidatos_pendientes', instante: nowISO() });
      return { status: 200, data: { ocupacion: 'ociosa', causa: prop.data?.causa || 'sin_candidatos_pendientes' } };
    }

    const modelo = prop.data.propuesta;

    // 2. Pasar a IMPRIMIENDO (el custodio valida el arco + el singleton 'imprimiendo').
    const trans = await this._rpc('cola_modelos.actualizar_estado.request', { project_id: input.project_id, id: modelo.id, estado: 'IMPRIMIENDO' });
    if (!trans) {
      return this._errorResponse(502, 'UPSTREAM_UNREACHABLE', 'no se pudo actualizar el estado del modelo', { id: modelo.id });
    }
    if (trans.status !== 200) {
      // El custodio rechazó (p.ej. ya hay otra pieza imprimiendo). Reintenta con el
      // siguiente candidato (bucle de reintento, n.º 5/6) — la máquina nunca queda muda.
      return this._reintentar(input, modelo, trans);
    }

    // 3. Emitir el evento de dominio y responder con la ocupación.
    this._publicarEvento('cola.propuesta.siguiente', { project_id: input.project_id, modelo, prioridad: modelo.prioridad, instante: nowISO() });
    return { status: 200, data: { ocupacion: 'imprimiendo', modelo } };
  }

  // _alTerminarImpresion: la pieza terminó → se marca IMPRESO (el custodio la mueve a
  // histórico) y, si hay más pendientes, se propone el siguiente (encadena al_liberarse).
  async _alTerminarImpresion(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.id) return this._invalid('id');

    // 1. Marcar IMPRESO (terminal → histórico, sale de la cola viva).
    const fin = await this._rpc('cola_modelos.actualizar_estado.request', { project_id: input.project_id, id: input.id, estado: 'IMPRESO' });
    if (!fin) {
      return this._errorResponse(502, 'UPSTREAM_UNREACHABLE', 'no se pudo marcar el modelo como impreso', { id: input.id });
    }
    if (fin.status !== 200) {
      return this._errorResponse(fin.status, fin.error?.code || 'CONFLICT_STATE', fin.error?.message || 'no se pudo marcar como impreso', { id: input.id });
    }

    // 2. Si hay más pendientes, proponer el siguiente (la máquina sigue ocupada).
    const siguiente = await this._alLiberarse({ project_id: input.project_id });
    if (siguiente.status === 200 && siguiente.data?.ocupacion === 'imprimiendo') {
      return { status: 200, data: { ocupacion: 'imprimiendo', modelo: siguiente.data.modelo } };
    }
    // Sin más candidatos → ociosa explícita (nunca silencio).
    return { status: 200, data: { ocupacion: 'ociosa', causa: 'sin_candidatos_pendientes' } };
  }

  // _reintentar: el custodio rechazó pasar a IMPRIMIENDO (p.ej. singleton ocupado o
  // transición inválida). Reintenta con el siguiente candidato; si no queda ninguno,
  // ociosa explícita. La máquina nunca queda muda (n.º 5/6).
  async _reintentar(input, modeloRechazado, trans) {
    // Marcar el rechazo como señal (el modelo queda pendiente; no se pierde).
    this._publicarEvento('cola.propuesta.rechazada', {
      project_id: input.project_id, id: modeloRechazado.id,
      motivo: trans.error?.code || 'CONFLICT_STATE', detalle: trans.error?.message || '', instante: nowISO()
    });

    // Reintentar al_liberarse (el motor propone el siguiente candidato distinto).
    const reintento = await this._alLiberarse({ project_id: input.project_id });
    if (reintento.status === 200 && reintento.data?.ocupacion === 'imprimiendo') {
      return reintento;
    }
    return { status: 200, data: { ocupacion: 'ociosa', causa: 'sin_candidatos_pendientes' } };
  }

  // ── utilidades ──
  _publicarEvento(evento, payload) {
    try { this.eventBus?.publish(evento, payload); } catch (_) { /* best-effort */ }
  }
}

module.exports = OrquestadorColaReflejo;
