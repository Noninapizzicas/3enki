/**
 * panel-jefe — REFLEJO del taller 3D (pieza 17, rol FUTURO).
 *
 * Cara AGREGADA del jefe. Expone la visión de conjunto cruzando los stores por
 * proyección (CERO juicio) y acciones para el FUTURO que DELEGAN:
 *   - _resumen: impresion actual + cola + filamento + consumo/eficiencia + historial.
 *   - _propuestas: orden propuesta (motor-propuesta.proponer) — PROPUESTA ≠ DECISIÓN.
 *   - _aprobarPropuesta: el jefe aprueba -> cola.reordenar SOLO con decisión humana.
 *   - _marcarPrioridad: el jefe marca urgencia (cola.marcar_urgente).
 *   - _pedirReposicion: pide reposición de filamento (adaptador-confirmacion).
 *   - _verDetalle: detalle de un modelo (catalogo.por_id / cupula-gcode.obtener).
 *
 * Se repinta con cola.actualizada | pieza.imprimida | impresion.registrada |
 * material.actualizado (fire-and-forget, no muta; el panel es de solo lectura).
 * CERO juicio: el sistema proyecta y transporta; el jefe decide. Cliente nulo.
 *
 * Reflejo puro, sin store propio. Pares de fallo panel-jefe.*.failed.
 *
 * v0.1.0: FASE 4 TANDA 4 (última).
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const nowISO = () => new Date().toISOString();

class PanelJefeReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'panel-jefe';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // fire-and-forget: se repinta (panel solo lectura, no muta). Log de repintado.
  async onColaActualizada(e) { this.logger?.debug('panel-jefe.repintar', { event: 'cola.actualizada', project_id: ((e||{}).data||e||{}).project_id }); }
  async onPiezaImprimida(e)  { this.logger?.debug('panel-jefe.repintar', { event: 'pieza.imprimida', project_id: ((e||{}).data||e||{}).project_id }); }
  async onImpresionRegistrada(e) { this.logger?.debug('panel-jefe.repintar', { event: 'impresion.registrada', project_id: ((e||{}).data||e||{}).project_id }); }
  async onMaterialActualizado(e) { this.logger?.debug('panel-jefe.repintar', { event: 'material.actualizado', project_id: ((e||{}).data||e||{}).project_id }); }

  // ── Handlers RPC ──
  onResumenRequest(e)          { return this._atender(e, 'resumen',          'panel-jefe.resumen.response', d => this._resumen(d)); }
  onPropuestasRequest(e)       { return this._atender(e, 'propuestas',       'panel-jefe.propuestas.response', d => this._propuestas(d)); }
  onAprobarPropuestaRequest(e) { return this._atender(e, 'aprobar_propuesta', 'panel-jefe.aprobar_propuesta.response', d => this._aprobarPropuesta(d)); }
  onMarcarPrioridadRequest(e)  { return this._atender(e, 'marcar_prioridad', 'panel-jefe.marcar_prioridad.response', d => this._marcarPrioridad(d)); }
  onPedirReposicionRequest(e)  { return this._atender(e, 'pedir_reposicion', 'panel-jefe.pedir_reposicion.response', d => this._pedirReposicion(d)); }
  onVerDetalleRequest(e)       { return this._atender(e, 'ver_detalle',      'panel-jefe.ver_detalle.response', d => this._verDetalle(d)); }

  // ── PROYECCIONES (dominio) ──

  // _resumen: visión de conjunto AGREGADA cruzando los stores por RPC (best-effort).
  // Dato ausente -> 'desconocido' (nunca inventado).
  async _resumen(input) {
    if (!input.project_id) return this._invalid('project_id');
    const pid = input.project_id;
    const cid = input.correlation_id;
    const [ciclo, cola, filamento, consumo, historial] = await Promise.all([
      this._rpc('ciclo-impresion.estado.request', { project_id: pid, correlation_id: cid }),
      this._rpc('cola.siguiente.request', { project_id: pid, correlation_id: cid }),
      this._rpc('filamento.evaluar.request', { project_id: pid, correlation_id: cid }),
      this._rpc('consumo.promedio.request', { modelo_id: input.modelo_filtro || null, project_id: pid, correlation_id: cid }),
      this._rpc('historial.recientes.request', { project_id: pid, n: Number(input.n || 10), correlation_id: cid })
    ]);
    return {
      status: 200,
      data: {
        impresion_actual: (ciclo && ciclo.status === 200 && ciclo.data) ? ciclo.data : { estado: 'desconocido' },
        cola: (cola && cola.status === 200 && cola.data) ? cola.data : 'desconocido',
        filamento: (filamento && filamento.status === 200 && filamento.data) ? filamento.data : 'desconocido',
        consumo: (consumo && consumo.status === 200 && consumo.data) ? consumo.data : 'desconocido',
        historial: (historial && historial.status === 200 && historial.data) ? historial.data.registros || [] : [],
        repintado_por: ['cola.actualizada', 'pieza.imprimida', 'impresion.registrada', 'material.actualizado'],
        timestamp: nowISO()
      }
    };
  }

  // _propuestas: la orden propuesta (motor-propuesta.proponer). PROPUESTA, NO decisión.
  async _propuestas(input) {
    if (!input.project_id) return this._invalid('project_id');
    const pid = input.project_id;
    // La cola provee las tareas vigentes al proponedor (o el llamante las pasa).
    let tareas = input.tareas;
    if (!Array.isArray(tareas)) {
      const colaRes = await this._rpc('cola.siguiente.request', { project_id: pid, correlation_id: input.correlation_id });
      tareas = ((colaRes || {}).data || {}).siguiente ? [{ ...((colaRes || {}).data).siguiente }] : [];
    }
    const r = await this._rpc('motor-propuesta.proponer.request', {
      project_id: pid, tareas, correlation_id: input.correlation_id });
    if (!r || r.status >= 400) {
      this._failed('propuestas', input, r && r.error ? r.error.code : 'proponer_fallo', {});
      return r && r.error ? { status: r.status, error: r.error } : this._errorResponse(502, 'PROPONER_FALLO', 'no se pudo proponer el orden', {});
    }
    return { status: 200, data: { ...r.data, propuesta: true, nota: 'PROPUESTA — el jefe la aprueba; el sistema no reordena solo' } };
  }

  // _aprobarPropuesta: el JEFE aprueba (decision humana). El sistema transporta a
  // cola.reordenar con la marca de decisión. CERO juicio.
  async _aprobarPropuesta(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!Array.isArray(input.orden) || input.orden.length === 0) return this._invalid('orden');
    const decisor = input.aprobada_by || input.jefe || input.decision || 'panel-jefe';
    const r = await this._rpc('cola.reordenar.request', {
      project_id: input.project_id, orden: input.orden, aprobada_by: decisor, correlation_id: input.correlation_id });
    if (!r || r.status >= 400) {
      this._failed('aprobar_propuesta', input, r && r.error ? r.error.code : 'reordenar_fallo', {});
      return r && r.error ? { status: r.status, error: r.error } : this._errorResponse(502, 'REORDENAR_FALLO', 'no se pudo aplicar el orden aprobado', {});
    }
    return { status: 200, data: { aprobada: true, por: decisor, orden: r.data.orden, total: r.data.total } };
  }

  // _marcarPrioridad: el jefe marca urgencia de una tarea (cola.marcar_urgente).
  async _marcarPrioridad(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.id && !input.tarea_id) return this._invalid('id');
    const r = await this._rpc('cola.marcar_urgente.request', {
      project_id: input.project_id, id: input.id || input.tarea_id, urgente: input.urgente !== false,
      correlation_id: input.correlation_id });
    if (!r || r.status >= 400) {
      this._failed('marcar_prioridad', input, r && r.error ? r.error.code : 'marcar_urgente_fallo', {});
      return r && r.error ? { status: r.status, error: r.error } : this._errorResponse(502, 'MARCAR_URGENTE_FALLO', 'no se pudo marcar prioridad', {});
    }
    return { status: 200, data: { marcada: true, tarea: r.data.tarea } };
  }

  // _pedirReposicion: el jefe pide reposición de filamento (SolicitudDecision al dueño).
  async _pedirReposicion(input) {
    if (!input.project_id) return this._invalid('project_id');
    const r = await this._rpc('adaptador-confirmacion.confirmar.request', {
      project_id: input.project_id, tipo: 'reanudar_ciclo', // placeholder; el ack del canal decide
      confirmacion_id: input.confirmacion_id,
      nombre: input.bobina_id ? `bobina ${input.bobina_id}` : null,
      detalle: 'Reposición de filamento solicitada por el jefe',
      correlation_id: input.correlation_id
    }, { timeout_ms: 30000 });
    if (!r || r.status >= 400) {
      this._failed('pedir_reposicion', input, r && r.error ? r.error.code : 'reposicion_fallo', {});
      return r && r.error ? { status: r.status, error: r.error } : this._errorResponse(502, 'REPOSICION_FALLO', 'no se pudo pedir reposicion', {});
    }
    return { status: 200, data: { pedida: true, confirmacion_id: r.data.confirmacion_id } };
  }

  // _verDetalle: detalle de un modelo (catalogo.por_id o cupula-gcode.obtener).
  async _verDetalle(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.modelo_id && !input.archivo_id) {
      return this._invalid(input.project_id ? 'modelo_id' : 'archivo_id');
    }
    const cid = input.correlation_id;
    const [catalogo, cupula] = await Promise.all([
      input.modelo_id ? this._rpc('catalogo.por_id.request', { project_id: input.project_id, modelo_id: input.modelo_id, id: input.modelo_id, correlation_id: cid }) : null,
      input.archivo_id ? this._rpc('cupula-gcode.obtener.request', { project_id: input.project_id, archivo_id: input.archivo_id, correlation_id: cid }) : null
    ]);
    return {
      status: 200,
      data: {
        modelo: (catalogo && catalogo.status === 200 && catalogo.data)
          ? (catalogo.data.modelo || catalogo.data) : 'desconocido',
        archivo: (cupula && cupula.status === 200 && cupula.data) ? cupula.data.archivo : null
      }
    };
  }

  // helpers internos (lógica de negocio DENTRO del módulo)
  _failed(op, input, motivo, extra) {
    this._publicarEvento(`panel-jefe.${op}.failed`, {
      project_id: input.project_id, motivo, ...extra,
      correlation_id: input.correlation_id, timestamp: nowISO()
    });
  }

  _publicarEvento(evento, data) {
    if (this.eventBus?.publish) this.eventBus.publish(evento, data);
  }
}

module.exports = PanelJefeReflejo;
