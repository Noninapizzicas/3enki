'use strict';
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

/**
 * adaptador-slicing — PUENTE (stateless) del proyecto 3D.
 *
 * Traduce la orden de slicear a una invocacion del slicer externo (CrealityPrint
 * CLI) que corre en el PC del dueno (bastante RAM), NUNCA en el VPS. El puente
 * thin del PC ejecuta la CLI. Input: archivo .3mf (no STL suelto). Output: gcode.
 *
 * Es PUENTE: sin store, escucha y delega. No persiste estado (sin PosPersistencia,
 * sin project.activated). El slicer se inyecta por el puerto
 * 'slicear(.3mf, perfil) -> gcode' (registrarSlicer). El gcode se entrega para que
 * la cupula-gcode lo guarde POR MODELO (una vez sliceado se reutiliza sin reslicear).
 *
 * Proyecciones:
 *   _slicear(archivo3mf, perfil)  — invoca el slicer, valida gcode no vacio, entrega.
 *   _leer3mf(archivo)             — conversor 10.2: metadatos del .3mf o desconocido.
 */
class AdaptadorSlicingReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'adaptador-slicing';
    this.version = 'reflejo-0.1.0';
    this._slicer = null;   // puerto inyectado: { slicear(archivo3mf, perfil) -> Promise<{gcode}> }
  }

  // El puente thin del PC cablea el slicer concreto (CrealityPrint CLI).
  registrarSlicer(slicer) {
    if (slicer && typeof slicer.slicear === 'function') this._slicer = slicer;
  }

  onSlicearRequest(e) {
    return this._atender(e, 'slicear', 'adaptador-slicing.slicear.response', d => this._slicear(d));
  }

  onLeer3mfRequest(e) {
    return this._atender(e, 'leer_3mf', 'adaptador-slicing.leer_3mf.response', d => this._leer3mf(d));
  }

  // 10.1 — invoca el slicer, valida el gcode (no vacio) y lo entrega para guardar en la cupula.
  async _slicear(input) {
    const archivo3mf = (input && input.archivo3mf) || null;
    const perfil = (input && input.perfil) || 'desconocido';
    const pid = (input && input.project_id) || null;
    const modeloId = (input && input.modelo_id) || null;

    if (!archivo3mf || typeof archivo3mf !== 'string' || archivo3mf.trim().length === 0) {
      this._publicarEvento('adaptador-slicing.slicear.failed', {
        project_id: pid, modelo_id: modeloId, motivo: 'archivo_3mf_requerido'
      });
      return { status: 400, data: { error: 'INVALID_INPUT', message: 'archivo3mf requerido (no vacio)' } };
    }

    if (!this._slicer) {
      this._publicarEvento('adaptador-slicing.slicear.failed', {
        project_id: pid, modelo_id: modeloId, archivo3mf, perfil, motivo: 'slicer_no_configurado'
      });
      return { status: 503, data: { error: 'SLICER_NO_CONFIGURADO', message: 'no hay slicer cableado (puente thin del PC del dueno)' } };
    }

    let gcode = null;
    try {
      const res = await this._slicer.slicear(archivo3mf.trim(), perfil);
      gcode = (res && res.gcode) || null;
    } catch (err) {
      this._publicarEvento('adaptador-slicing.slicear.failed', {
        project_id: pid, modelo_id: modeloId, archivo3mf, perfil, motivo: 'slicer_fallo', error: err.message
      });
      return { status: 502, data: { error: 'SLICER_FALLO', message: err.message } };
    }

    // Invariante 7: el ciclo no avanza sin gcode. Gcode vacio/corrupto no se entrega.
    if (!gcode || typeof gcode !== 'string' || gcode.trim().length === 0) {
      this._publicarEvento('adaptador-slicing.slicear.failed', {
        project_id: pid, modelo_id: modeloId, archivo3mf, perfil, motivo: 'gcode_vacio'
      });
      return { status: 502, data: { error: 'GCODE_VACIO', message: 'el slicer devolvio gcode vacio' } };
    }

    return { status: 200, data: {
      modelo_id: modeloId, archivo3mf: archivo3mf.trim(), perfil,
      gcode, bytes: gcode.length,
      listo_para_cupula: true
    } };
  }

  // 10.2 — conversor: lee metadatos del .3mf; huecos como desconocido (invariante 5).
  async _leer3mf(input) {
    const archivo = (input && input.archivo) || null;
    const pid = (input && input.project_id) || null;

    if (!archivo || typeof archivo !== 'string' || archivo.trim().length === 0) {
      return { status: 400, data: { error: 'INVALID_INPUT', message: 'archivo requerido (no vacio)' } };
    }

    // Sin parser real en el VPS: el puente thin del PC lee el .3mf. Si no hay
    // lector cableado, devolvemos metadatos con huecos 'desconocido' (no inventamos).
    let metadatos = null;
    if (this._slicer && typeof this._slicer.leer3mf === 'function') {
      try {
        const res = await this._slicer.leer3mf(archivo.trim());
        metadatos = (res && res.metadatos) || null;
      } catch (_) { metadatos = null; }
    }

    return { status: 200, data: {
      archivo: archivo.trim(),
      metadatos: metadatos || {
        nombre: 'desconocido', autor: 'desconocido', licencia: 'desconocido',
        material: 'desconocido', dimensiones: null
      }
    } };
  }

  _publicarEvento(evento, data) {
    if (this.eventBus?.publish) this.eventBus.publish(evento, { ...data, timestamp: new Date().toISOString() });
  }
}

module.exports = AdaptadorSlicingReflejo;
