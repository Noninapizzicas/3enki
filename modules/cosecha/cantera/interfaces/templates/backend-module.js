// ─────────────────────────────────────────────
// TEMPLATE: Módulo Backend Enki para POS
// Copia a modules/<vertical>/<slug>/index.js
// ─────────────────────────────────────────────
'use strict';

/**
 * midominio — template para módulo POS.
 * State machine / Reflejo puro / Híbrido (elige según toque).
 */

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

class MidominioModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'midominio';
    this.version = '1.0.0';
  }

  async onLoad(context) {
    await super.onLoad(context);
    this._storage = context?.storage || new Map();
    this.logger?.info(`${this.name}.loaded`);
  }

  // ── RPC Handlers ──

  // GET / list
  async handleList(payload) {
    const { project_id } = payload || {};
    if (!project_id) return { status: 400, error: 'project_id requerido' };

    try {
      const items = await this._obtenerItems(project_id);
      return { status: 200, data: { items } };
    } catch (err) {
      this.logger?.error?.('list.error', err);
      return { status: 500, error: 'Error interno' };
    }
  }

  // GET / get { id }
  async handleGet(payload) {
    const { project_id, id } = payload || {};
    if (!id) return { status: 400, error: 'id requerido' };

    const item = await this._obtenerItem(project_id, id);
    if (!item) return { status: 404, error: 'No encontrado' };
    return { status: 200, data: item };
  }

  // POST / create { nombre, ... }
  async handleCreate(payload) {
    const { project_id, nombre } = payload || {};
    if (!project_id) return { status: 400, error: 'project_id requerido' };
    if (!nombre) return { status: 400, error: 'nombre requerido' };

    const item = {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      nombre,
      ...this._extraerExtras(payload),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await this._guardarItem(project_id, item);

    // Publicar evento → frontend reacciona
    this.eventBus?.publish?.('midominio.creado', {
      project_id,
      item_id: item.id,
      nombre,
      ...item
    });

    return { status: 201, data: item };
  }

  // DELETE / delete { id }
  async handleDelete(payload) {
    const { project_id, id } = payload || {};
    if (!id) return { status: 400, error: 'id requerido' };

    await this._eliminarItem(project_id, id);

    this.eventBus?.publish?.('midominio.eliminado', {
      project_id,
      item_id: id
    });

    return { status: 200, data: { deleted: true } };
  }

  // ── Helpers ──

  _extraerExtras(payload) {
    const skip = new Set(['project_id', 'nombre', 'id', 'correlation_id']);
    const extras = {};
    for (const [k, v] of Object.entries(payload || {})) {
      if (!skip.has(k)) extras[k] = v;
    }
    return extras;
  }

  async _obtenerItems(project_id) {
    // Implementar persistencia real aquí
    // Ej: db.query('SELECT * FROM items WHERE project_id = ?', [project_id])
    return this._storage.get(project_id) || [];
  }

  async _obtenerItem(project_id, id) {
    const items = await this._obtenerItems(project_id);
    return items.find(i => i.id === id) || null;
  }

  async _guardarItem(project_id, item) {
    const items = await this._obtenerItems(project_id);
    const idx = items.findIndex(i => i.id === item.id);
    if (idx >= 0) items[idx] = item;
    else items.push(item);
    this._storage.set(project_id, items);
  }

  async _eliminarItem(project_id, id) {
    const items = await this._obtenerItems(project_id);
    this._storage.set(project_id, items.filter(i => i.id !== id));
  }
}

module.exports = MidominioModule;
