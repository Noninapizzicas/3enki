/**
 * Design Manager
 * CRUD operations for scratch designs
 */

const { v4: uuidv4 } = require('uuid');

class DesignManager {
  constructor() {
    this.designs = new Map();
  }

  list() {
    return Array.from(this.designs.values()).map(d => ({
      id: d.id,
      nombre: d.nombre,
      tipo: d.tipo,
      icono: d.icono,
      bloques_count: d.bloques?.length || 0,
      created_at: d.created_at,
      updated_at: d.updated_at
    }));
  }

  get(id) {
    return this.designs.get(id) || null;
  }

  create(data) {
    const design = {
      id: uuidv4(),
      nombre: data.nombre,
      tipo: data.tipo || 'mobile',
      icono: data.icono || '📱',
      bloques: [],
      conexiones: [],
      variables: [],
      eventos_globales: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.designs.set(design.id, design);
    return design;
  }

  update(id, data) {
    const design = this.designs.get(id);
    if (!design) return null;

    if (data.nombre !== undefined) design.nombre = data.nombre;
    if (data.bloques !== undefined) design.bloques = data.bloques;
    if (data.conexiones !== undefined) design.conexiones = data.conexiones;
    if (data.variables !== undefined) design.variables = data.variables;
    if (data.eventos_globales !== undefined) design.eventos_globales = data.eventos_globales;
    design.updated_at = new Date().toISOString();

    this.designs.set(id, design);
    return design;
  }

  delete(id) {
    if (!this.designs.has(id)) return false;
    this.designs.delete(id);
    return true;
  }

  duplicate(id) {
    const original = this.designs.get(id);
    if (!original) return null;

    const duplicate = {
      ...JSON.parse(JSON.stringify(original)),
      id: uuidv4(),
      nombre: `${original.nombre} (copia)`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.designs.set(duplicate.id, duplicate);
    return duplicate;
  }

  count() {
    return this.designs.size;
  }
}

module.exports = DesignManager;
