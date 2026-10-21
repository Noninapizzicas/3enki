/**
 * consumo — REFLEJO puro del taller 3D (pieza 13). Cálculo de consumo y tiempo estimado.
 *
 * Usa el dato MEDIDO del historial (promedio de gramos/tiempo reales por modelo) para
 * responder promedios y pronósticos. CERO estimación sin muestra MEDIDA: si un modelo no
 * tiene registros en el historial, el promedio es NULO (no se conjetura). Lo no medido
 * queda [ABIERTO] (se pregunta al dueño).
 *
 * Consume impresion.registrada (fire-and-forget del historial) para acumular las muestras
 * en memoria (Map project:modelo → listas de gramos y tiempos). Reflejo puro: sin store
 * propio persistente, sin project.activated.
 *
 * Operaciones del plano (plan-construccion.md 6.10): _consumoPromedio, _tiempoPromedio,
 * _pronosticoTanda. Pares de fallo consumo.promedio.failed y consumo.pronostico.failed.
 *
 * v0.1.0: FASE 4 TANDA 2.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

class ConsumoReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'consumo';
    this.version = 'reflejo-0.1.0';
    // muestras en memoria: `${project_id}:${modelo_id}` → { gramos: [], tiempos: [] }
    this._muestras = new Map();
  }

  // fire-and-forget del historial: acumula la muestra MEDIDA (no decide).
  onImpresionRegistrada(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id;
    const modeloId = d.modelo_id || d.modeloId;
    if (!pid || !modeloId) return;
    const gramo = d.gramos_reales != null ? Number(d.gramos_reales) : (d.gramos != null ? Number(d.gramos) : NaN);
    const tiempo = d.tiempo_real != null ? Number(d.tiempo_real) : (d.tiempo != null ? Number(d.tiempo) : NaN);
    if (Number.isNaN(gramo) && Number.isNaN(tiempo)) return; // sin dato medido → nada que acumular
    const key = `${pid}:${modeloId}`;
    if (!this._muestras.has(key)) this._muestras.set(key, { gramos: [], tiempos: [] });
    const s = this._muestras.get(key);
    if (!Number.isNaN(gramo)) s.gramos.push(gramo);
    if (!Number.isNaN(tiempo)) s.tiempos.push(tiempo);
    this.logger?.debug('consumo.muestra.acumulada', { project_id: pid, modelo_id: modeloId });
  }

  // ── Handlers RPC ──
  onPromedioRequest(e)   { return this._atender(e, 'promedio', 'consumo.promedio.response', d => this._consumoPromedio(d)); }
  onPronosticoRequest(e) { return this._atender(e, 'pronostico', 'consumo.pronostico.response', d => this._pronosticoTanda(d)); }

  // ── PROYECCIONES (dominio) ──

  // _consumoPromedio: promedio de gramos y tiempo MEDIDOS de un modelo. Si no hay
  // muestras → NULO (CERO estimación); se pregunta al dueño, no se conjetura.
  async _consumoPromedio(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.modelo_id && !input.modeloId) return this._invalid('modelo_id');
    const modeloId = input.modelo_id || input.modeloId;
    const muestras = this._muestras.get(`${input.project_id}:${modeloId}`) || { gramos: [], tiempos: [] };
    const gramos = muestras.gramos.filter(n => !Number.isNaN(n));
    const tiempos = muestras.tiempos.filter(n => !Number.isNaN(n));

    // CERO estimación sin dato medido → NULO (no inventar)
    const res = {
      modelo_id: modeloId,
      muestras: { gramos: gramos.length, tiempos: tiempos.length },
      gramos_promedio: gramos.length ? this._round(gramos.reduce((a, b) => a + b, 0) / gramos.length) : null,
      tiempo_promedio_s: tiempos.length ? this._round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : null,
      estimacion: gramos.length === 0 && tiempos.length === 0 ? 'NULO' : 'medida'
    };
    return { status: 200, data: res };
  }

  // _tiempoPromedio: atajo del promedio de tiempo (usado por el pronóstico).
  _tiempoPromedio(pid, modeloId) {
    const muestras = this._muestras.get(`${pid}:${modeloId}`) || { tiempos: [] };
    const tiempos = muestras.tiempos.filter(n => !Number.isNaN(n));
    if (!tiempos.length) return null;
    return this._round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length);
  }

  // _pronosticoTanda: suma de promedios MEDIDOS de cada modelo de la tanda. Un hueco sin
  // muestra → el pronóstico se marca NULO en ese tramo (CERO conjetura; ABIERTO si se
  // pregunta al dueño). gramos_estimados y tiempo_estimado totales solo si TODOS median.
  async _pronosticoTanda(input) {
    if (!input.project_id) return this._invalid('project_id');
    const items = input.modelos || input.items || [];
    if (!Array.isArray(items) || items.length === 0) return this._invalid('modelos');

    const detalle = items.map((m, i) => {
      const id = (m && (m.modelo_id || m.modeloId || m.id)) || null;
      const veces = (m && (m.veces != null ? Number(m.veces) : 1)) || 1;
      if (!id) return { posicion: i, modelo_id: null, pendiente: true };
      const gramo = this._round(this._promedioGramos(input.project_id, id) * veces);
      const tiempo = this._tiempoPromedio(input.project_id, id);
      return {
        posicion: i, modelo_id: id, veces,
        gramos_estimados: gramo != null && !Number.isNaN(gramo) ? gramo : null,
        tiempo_estimado_s: tiempo != null ? this._round(tiempo * veces) : null,
        pendiente: gramo == null || tiempo == null
      };
    });

    const conDato = detalle.filter(d => !d.pendiente && d.modelo_id);
    const sinDato = detalle.filter(d => d.pendiente).length;
    const totalGramo = detalle.every(d => !d.pendiente)
      ? this._round(detalle.reduce((a, b) => a + (b.gramos_estimados || 0), 0)) : null;
    const totalTiempo = detalle.every(d => !d.pendiente)
      ? this._round(detalle.reduce((a, b) => a + (b.tiempo_estimado_s || 0), 0)) : null;

    return {
      status: 200,
      data: {
        detalle, muestras_ok: conDato.length, pendientes: sinDato,
        total: sinDato === 0 ? { gramos_estimados: totalGramo, tiempo_estimado_s: totalTiempo } : null,
        // CERO estimación: si algún modelo no tiene dato medido, el total es NULO (se pregunta al dueño).
        completo: sinDato === 0
      }
    };
  }

  // helpers internos (lógica de negocio DENTRO del módulo)
  _promedioGramos(pid, modeloId) {
    const muestras = this._muestras.get(`${pid}:${modeloId}`) || { gramos: [] };
    const gramos = muestras.gramos.filter(n => !Number.isNaN(n));
    if (!gramos.length) return null;
    return this._round(gramos.reduce((a, b) => a + b, 0) / gramos.length);
  }
}

module.exports = ConsumoReflejo;
