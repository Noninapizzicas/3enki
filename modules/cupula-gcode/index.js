'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

// Material por defecto cuando el gcode no declara material (pregunta abierta 11).
const MATERIAL_POR_DEFECTO = 'material_por_defecto';

// Umbral mínimo de contenido para considerar un gcode no corrupto.
const GCODE_MIN_LEN = 16;

class CupulaGcodeReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cupula-gcode';
    this.version = 'reflejo-0.1.0';
    // store: Map<project_id, Map<clave, Gcode>>  — clave = `${modeloId}::${material}`
    this._stores = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'cupula-gcode.json',
      dir: '/3d/cupula-gcode',
      snapshot: (pid) => {
        const s = this._stores.get(pid);
        return s ? { project_id: pid, gcode: [...s.entries()].map(([clave, g]) => ({ clave, ...g })) } : null;
      },
      hidratar: (pid, data) => {
        if (!data || !Array.isArray(data.gcode)) return;
        const s = this._obtenerOCrear(pid);
        for (const item of data.gcode) {
          if (item && item.clave) s.set(item.clave, item);
        }
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // =============================================================
  // Handlers RPC (una linea cada uno, delegan a _atender)
  // =============================================================
  onAlmacenarRequest(e) {
    return this._atender(e, 'almacenar', 'cupula.almacenar.response', d => this._almacenar(d));
  }
  onBuscarRequest(e) {
    return this._atender(e, 'buscar', 'cupula.buscar.response', d => this._buscar(d));
  }

  // =============================================================
  // Store
  // =============================================================
  _obtenerOCrear(pid) {
    let store = this._stores.get(pid);
    if (!store) {
      store = new Map();
      this._stores.set(pid, store);
    }
    return store;
  }

  _clave(modeloId, material) {
    return `${modeloId}::${material || MATERIAL_POR_DEFECTO}`;
  }

  // =============================================================
  // Proyecciones
  // =============================================================
  _almacenar(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };
    if (!input.modelo_id) return { status: 400, data: { error: 'INVALID_INPUT', message: 'modelo_id requerido' } };
    if (!input.gcode || typeof input.gcode !== 'string' || input.gcode.trim().length === 0) {
      // Invariante 10: el gcode corrupto no se guarda — se rechaza y avisa.
      this._publicarEvento('cupula.almacenar.failed', {
        project_id: pid, modelo_id: input.modelo_id, material: input.material || null,
        motivo: 'gcode_vacio'
      });
      return { status: 400, data: { error: 'INVALID_INPUT', message: 'gcode requerido (no vacio)' } };
    }
    if (input.gcode.trim().length < GCODE_MIN_LEN) {
      // Gcode sospechosamente corto → corrupto. Se rechaza y avisa.
      this._publicarEvento('cupula.almacenar.failed', {
        project_id: pid, modelo_id: input.modelo_id, material: input.material || null,
        motivo: 'gcode_corrupto', longitud: input.gcode.trim().length
      });
      return { status: 400, data: { error: 'INVALID_INPUT', message: 'gcode corrupto (longitud insuficiente)' } };
    }

    const material = input.material || MATERIAL_POR_DEFECTO;
    const clave = this._clave(input.modelo_id, material);
    const store = this._obtenerOCrear(pid);

    const gcode = {
      clave,
      modelo_id: input.modelo_id,
      material,
      contenido: input.gcode,
      perfil: input.perfil || 'desconocido',
      sliceado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString()
    };
    store.set(clave, gcode);
    this._persist.marcarDirty(pid);

    this._publicarEvento('cupula.gcode_almacenado', {
      project_id: pid, modelo_id: input.modelo_id, material, clave
    });

    return { status: 200, data: { project_id: pid, clave, modelo_id: input.modelo_id, material, reutilizable: true } };
  }

  _buscar(input) {
    const pid = input.project_id;
    if (!pid) return { status: 400, data: { error: 'INVALID_INPUT', message: 'project_id requerido' } };
    if (!input.modelo_id) return { status: 400, data: { error: 'INVALID_INPUT', message: 'modelo_id requerido' } };

    const store = this._stores.get(pid);
    if (!store) {
      return { status: 200, data: { project_id: pid, modelo_id: input.modelo_id, encontrado: false, gcode: null } };
    }

    // 5.3 _indexar: clave (modelo, material) o material_por_defecto.
    const material = input.material || MATERIAL_POR_DEFECTO;
    const gcode = store.get(this._clave(input.modelo_id, material))
      || store.get(this._clave(input.modelo_id, MATERIAL_POR_DEFECTO));

    if (!gcode) {
      return { status: 200, data: { project_id: pid, modelo_id: input.modelo_id, material, encontrado: false, gcode: null } };
    }
    return { status: 200, data: { project_id: pid, modelo_id: input.modelo_id, material, encontrado: true, gcode } };
  }

  // =============================================================
  // Utilidades
  // =============================================================
  _publicarEvento(evento, data) {
    if (this.eventBus?.publish) {
      this.eventBus.publish(evento, { ...data, timestamp: new Date().toISOString() });
    }
  }

  // =============================================================
  // Tools (para el LLM / UI)
  // =============================================================
  toolAlmacenar(params) { return this._almacenar(params); }
  toolBuscar(params) { return this._buscar(params); }

  handleUiAlmacenar(msg, reply) {
    const data = msg.data || msg;
    if (typeof reply !== 'function') return this._almacenar(data);
    return reply(this._almacenar(data));
  }
  handleUiBuscar(msg, reply) {
    const data = msg.data || msg;
    if (typeof reply !== 'function') return this._buscar(data);
    return reply(this._buscar(data));
  }
}

module.exports = CupulaGcodeReflejo;
