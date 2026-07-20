/**
 * prisma/compuestos — REFLEJO JS: el CUSTODIO de la biblioteca de COMPUESTOS (formulaciones).
 *
 * Store propio: /prisma/compuestos/<id>.json (+ .versions/). Un compuesto guarda SOLO refs+cantidades
 * (a insumos o a otros compuestos: sub-mezclas, recursivo), nunca los datos del insumo. Biblioteca
 * independiente del producto (300 formulaciones pueden existir sin venderse). El coste NO se embebe:
 * lo calcula el costeador y viaja por evento. NO toca producto/venta.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const DIR = '/prisma/compuestos/';
const cPath = (id) => DIR + id + '.json';
const versionPath = (id, ts) => DIR + '.versions/' + id + '/' + ts + '.json';
const nowISO = () => new Date().toISOString();
const tsSafe = () => nowISO().replace(/[:.]/g, '-');
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);

class PrismaCompuestosReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'compuestos';
    this.version = 'reflejo-0.1.0';
  }
  async onUnload() { return super.onUnload(); }

  onCrearRequest(e)      { return this._atender(e, 'crear',      'compuestos.crear.response',      d => this._crear(d)); }
  onGetRequest(e)        { return this._atender(e, 'get',        'compuestos.get.response',        d => this._get(d)); }
  onListRequest(e)       { return this._atender(e, 'list',       'compuestos.list.response',       d => this._list(d)); }
  onActualizarRequest(e) { return this._atender(e, 'actualizar', 'compuestos.actualizar.response', d => this._actualizar(d)); }
  onPendientesRequest(e) { return this._atender(e, 'pendientes', 'compuestos.pendientes.response', d => this._pendientes(d)); }

  // ── PURO: valida la forma de los componentes (refs+cantidades) ──
  _validarComponentes(comp) {
    if (!Array.isArray(comp) || comp.length === 0) return { ok: false, motivo: 'sin componentes' };
    for (const c of comp) {
      if (!c || !c.ref || typeof c.ref !== 'string') return { ok: false, motivo: 'componente sin ref canónica' };
      if (!(typeof c.cantidad === 'number' && c.cantidad > 0)) return { ok: false, motivo: `cantidad inválida en ${c.ref}` };
    }
    return { ok: true };
  }

  async _crear({ project_id, nombre, componentes, clasificacion_ref } = {}) {
    if (!project_id) return this._invalid('project_id');
    if (!nombre || typeof nombre !== 'string') return this._invalid('nombre');
    const v = this._validarComponentes(componentes);
    if (!v.ok) return this._errorResponse(400, 'INVALID_INPUT', v.motivo, { field: 'componentes' });
    const id = slug(nombre);
    if (!id) return this._invalid('nombre');
    if (await this._read(project_id, cPath(id))) return this._errorResponse(409, 'CONFLICT_STATE', 'el compuesto ya existe (usa actualizar)', { compuesto_id: id });
    const compuesto = { id, nombre: String(nombre).trim(),
      componentes: componentes.map(c => ({ ref: c.ref, cantidad: c.cantidad, unidad: c.unidad || 'ud' })),
      clasificacion_ref: clasificacion_ref || null, creado: nowISO(), actualizado: nowISO() };
    await this._write(project_id, cPath(id), compuesto);
    this.eventBus?.publish?.('compuesto.creado', { project_id, compuesto_id: id, nombre: compuesto.nombre, timestamp: nowISO() });
    this.metrics?.increment?.('compuestos.creados.total', {});
    return { status: 201, data: { compuesto } };
  }

  async _get({ project_id, compuesto_id } = {}) {
    if (!project_id) return this._invalid('project_id');
    if (!compuesto_id) return this._invalid('compuesto_id');
    const c = await this._read(project_id, cPath(compuesto_id));
    if (!c) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'compuesto no existe', { entity_type: 'compuesto', id: compuesto_id });
    return { status: 200, data: { compuesto: c } };
  }

  async _list({ project_id } = {}) {
    if (!project_id) return this._invalid('project_id');
    const todos = await this._leerTodos(project_id);
    return { status: 200, data: { compuestos: todos.map(c => ({ id: c.id, nombre: c.nombre, n_componentes: (c.componentes || []).length })), total: todos.length } };
  }

  async _actualizar({ project_id, compuesto_id, campos } = {}) {
    if (!project_id) return this._invalid('project_id');
    if (!compuesto_id) return this._invalid('compuesto_id');
    if (!campos || typeof campos !== 'object') return this._invalid('campos');
    const raw = await this._read(project_id, cPath(compuesto_id));
    if (!raw) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'compuesto no existe', { entity_type: 'compuesto', id: compuesto_id });
    if (campos.componentes) {
      const v = this._validarComponentes(campos.componentes);
      if (!v.ok) return this._errorResponse(400, 'INVALID_INPUT', v.motivo, { field: 'componentes' });
    }
    await this._write(project_id, versionPath(compuesto_id, tsSafe()), raw);
    const merged = { ...raw, ...campos, id: raw.id, actualizado: nowISO() };
    await this._write(project_id, cPath(compuesto_id), merged);
    this.eventBus?.publish?.('compuesto.actualizado', { project_id, compuesto_id, campos: Object.keys(campos), timestamp: nowISO() });
    return { status: 200, data: { compuesto: merged } };
  }

  // la COLA para costear de a una (el loop nunca procesa en bloque)
  async _pendientes({ project_id } = {}) {
    if (!project_id) return this._invalid('project_id');
    const todos = await this._leerTodos(project_id);
    return { status: 200, data: { pendientes: todos.map(c => c.id), total: todos.length } };
  }

  // ── IO ──
  async _read(project_id, path) {
    const r = await this._rpc('fs.read.request', { project_id, path });
    if (!r || r.status === 404 || !r.content) return null;
    try { return JSON.parse(r.content); } catch { return null; }
  }
  async _write(project_id, path, obj) {
    const r = await this._rpc('fs.write.request', { project_id, path, content: JSON.stringify(obj, null, 2), encoding: 'utf-8', atomic: true });
    if (!r || r.status >= 400) throw new Error('fs.write falló: ' + path);
    return r;
  }
  async _leerTodos(project_id) {
    const r = await this._rpc('fs.list.request', { project_id, path: DIR });
    const files = (r && r.status === 200 && Array.isArray(r.data)) ? r.data : [];
    const out = [];
    for (const f of files) {
      const name = (typeof f === 'string') ? f : (f && f.name);
      if (!name || !name.endsWith('.json') || name.startsWith('.versions')) continue;
      const c = await this._read(project_id, DIR + name);
      if (c && c.id) out.push(c);
    }
    return out;
  }
}

module.exports = PrismaCompuestosReflejo;
