/**
 * historial — REFLEJO append-only del taller 3D (pieza 14).
 *
 * Memoria del taller y base del consumo agregado. Registro APPEND-ONLY: solo se
 * añade, jamás se reescribe. El único borrado permitido es _borrarAsiento (asiento
 * erróneo). Cada RegistroImpresion es dato MEDIDO (gramosReales, tiempoReal por
 * pesaje/longitud del gcode), nunca estimado.
 *
 * Operaciones del plano (plan-construccion.md 6.11): _registrar (append-only; emite
 * impresion.registrada y, si resultado es OK, pieza.imprimida para el encadenamiento),
 * _porModelo, _recientes, _borrarAsiento. Par de fallo historial.registrar.failed.
 *
 * v0.1.0: FASE 4 TANDA 1.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const RESULTADOS = Object.freeze(['OK', 'FALLIDA', 'CANCELADA']);
const FORMATOS = Object.freeze(['STL', '3MF', 'GCODE']);
const nowISO = () => new Date().toISOString();
const _key = (pid, id) => `${pid}:${id}`;

class HistorialReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'historial';
    this.version = 'reflejo-0.1.0';
    this.registros = new Map(); // `${project_id}:${id}` → RegistroImpresion

    this._persist = new PosPersistencia({
      modulo: this, file: 'historial.json', dir: '/3d/historial',
      snapshot: (pid) => ({
        project_id: pid,
        registros: [...this.registros.values()]
          .filter(r => r.project_id === pid)
          .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0))
      }),
      hidratar: (pid, data) => {
        if (!data) return;
        for (const r of (data.registros || [])) this.registros.set(_key(pid, r.id), r);
      }
    });
  }

  async onUnload() { await this._persist.flush(); this._persist.detener(); return super.onUnload(); }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── Handlers RPC ──
  onRegistrarRequest(e) { return this._atender(e, 'registrar', 'historial.registrar.response', d => this._registrar(d)); }
  onPorModeloRequest(e)   { return this._atender(e, 'por_modelo', 'historial.por_modelo.response', d => this._porModelo(d)); }
  onRecientesRequest(e)   { return this._atender(e, 'recientes', 'historial.recientes.response', d => this._recientes(d)); }
  onBorrarRequest(e)      { return this._atender(e, 'borrar', 'historial.borrar.response', d => this._borrarAsiento(d)); }

  // ── PROYECCIONES (dominio) ──

  // _registrar: APPEND-ONLY. Emite impresion.registrada SIEMPRE (con dato medido) y,
  // si resultado === OK, pieza.imprimida (dispara el encadenamiento).
  async _registrar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.modelo_id && !input.modeloId) return this._invalid('modelo_id');

    const resultado = input.resultado || input.result;
    if (!RESULTADOS.includes(resultado)) {
      return this._errorResponse(400, 'INVALID_INPUT', `resultado inválido: ${resultado} (OK|FALLIDA|CANCELADA)`, { resultado });
    }
    // CERO estimación: todo registro exige dato MEDIDO (gramos y tiempo reales).
    if (input.gramos_reales == null && input.gramosReales == null) {
      return this._errorResponse(400, 'INVALID_INPUT', 'gramos_reales (dato medido) requerido', { campo: 'gramos_reales' });
    }
    if (input.tiempo_real == null && input.tiempoReal == null) {
      return this._errorResponse(400, 'INVALID_INPUT', 'tiempo_real (dato medido) requerido', { campo: 'tiempo_real' });
    }

    const id = input.id || `reg_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
    const formatoOrigen = FORMATOS.includes(input.formato_origen || input.formatoOrigen)
      ? (input.formato_origen || input.formatoOrigen) : 'GCODE';
    const registro = {
      id, project_id: input.project_id,
      modelo_id: input.modelo_id || input.modeloId,
      formato_origen: formatoOrigen,
      filamento: input.filamento || input.material || 'PETG',
      gramos_reales: Number(input.gramos_reales != null ? input.gramos_reales : input.gramosReales),
      tiempo_real: Number(input.tiempo_real != null ? input.tiempo_real : input.tiempoReal),
      resultado,
      fecha: input.fecha || nowISO(),
      perfil: input.perfil || null
    };

    this.registros.set(_key(input.project_id, id), registro);
    this._persist.marcarDirty(input.project_id);

    this.eventBus?.publish('impresion.registrada', {
      registro_id: id, modelo_id: registro.modelo_id, project_id: input.project_id,
      resultado, gramos_reales: registro.gramos_reales, tiempo_real: registro.tiempo_real, timestamp: nowISO()
    });
    if (resultado === 'OK') {
      this.eventBus?.publish('pieza.imprimida', {
        registro_id: id, modelo_id: registro.modelo_id, project_id: input.project_id,
        formato_origen: registro.formato_origen, timestamp: nowISO()
      });
    }
    return { status: 201, data: { registro } };
  }

  async _porModelo(input) {
    if (!input.project_id || (!input.modelo_id && !input.modeloId)) {
      return this._invalid(input.project_id ? 'modelo_id' : 'project_id');
    }
    const modeloId = input.modelo_id || input.modeloId;
    const de = [...this.registros.values()]
      .filter(r => r.project_id === input.project_id && r.modelo_id === modeloId)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
    return { status: 200, data: { registros: de, total: de.length } };
  }

  async _recientes(input) {
    if (!input.project_id) return this._invalid('project_id');
    const n = Number(input.n || 10);
    const de = [...this.registros.values()]
      .filter(r => r.project_id === input.project_id)
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
      .slice(0, n);
    return { status: 200, data: { registros: de } };
  }

  // _borrarAsiento: único borrado permitido = asiento erróneo (nunca borrado lógico
  // de resultado). Si ya se emitió pieza.imprimida (resultado OK), se marca como
  // corregido en lugar de eliminar el asiento que alimentó el encadenamiento.
  async _borrarAsiento(input) {
    if (!input.project_id || !input.registro_id && !input.id) {
      return this._invalid(input.project_id ? 'registro_id' : 'project_id');
    }
    const id = input.registro_id || input.id;
    const key = _key(input.project_id, id);
    const reg = this.registros.get(key);
    if (!reg) return this._errorResponse(404, 'NOT_FOUND', `asiento no encontrado: ${id}`, { registro_id: id });

    if (reg.resultado === 'OK') {
      const corregido = { ...reg, resultado: 'CANCELADA', corregido_en: nowISO(), asiento_erroneo: true };
      this.registros.set(key, corregido);
      this._persist.marcarDirty(input.project_id);
      return { status: 200, data: { registro: corregido, corregido: true } };
    }
    this.registros.delete(key);
    this._persist.marcarDirty(input.project_id);
    return { status: 200, data: { eliminado: true, registro_id: id } };
  }
}

module.exports = HistorialReflejo;
