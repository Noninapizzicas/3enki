/**
 * catalogo-modelos — CUSTODIO del proyecto 3D (taller personal de impresion 3D).
 *
 * Registro de modelos 3D. Es el UNICO escritor de su store (Map<id,Modelo>).
 * Op registrar (append + emite catalogo.modelo_registrado), listar, obtener,
 * categorias (distinct de listar, pieza 1.2) y metadatos (pieza 1.3, huecos
 * como 'desconocido'). Lo llaman importacion-modelo (tras leer el .3mf) y el
 * dueno. Persiste por proyecto via _shared/pos-persistencia (snapshot fs por
 * project_id, debounced) en /3d/catalogo/catalogo-modelos.json; restaura en
 * project.activated; vuelca en onUnload.
 *
 * Par de fallo: catalogo.registrar.failed (todo flujo cierra su circulo).
 * Ver plan-construccion.md seccion 6.1.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();

class CatalogoModelosReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'catalogo-modelos';
    this.version = 'reflejo-0.1.0';
    this.modelos = new Map();   // id → Modelo { project_id, ... }

    this._persist = new PosPersistencia({
      modulo: this, file: 'catalogo-modelos.json', dir: '/3d/catalogo',
      snapshot: (pid) => ({ modelos: [...this.modelos].filter(([, m]) => m.project_id === pid) }),
      hidratar: (pid, data) => { for (const [id, m] of (data.modelos || [])) this.modelos.set(id, m); }
    });
  }

  async onUnload() { await this._persist.flush(); this._persist.detener(); return super.onUnload(); }
  onProjectActivated(e) { const d = (e && (e.data || e)) || {}; return this._persist.restaurar(d.project_id); }

  onRegistrarRequest(e)  { return this._atender(e, 'registrar', 'catalogo.registrar.response', d => this._registrar(d)); }
  onListarRequest(e)     { return this._atender(e, 'listar', 'catalogo.listar.response', d => this._listar(d)); }
  onObtenerRequest(e)    { return this._atender(e, 'obtener', 'catalogo.obtener.response', d => this._obtener(d)); }
  onCategoriasRequest(e) { return this._atender(e, 'categorias', 'catalogo.categorias.response', d => this._categorias(d)); }

  // ---- proyecciones deterministas ----------------------------------------

  _registrar(input) {
    if (!input.nombre) return this._invalid('nombre');
    if (!input.project_id) return this._invalid('project_id');
    const id = input.id || crypto.randomUUID();
    if (this.modelos.has(id)) {
      return this._errorResponse(409, 'ALREADY_EXISTS', 'el modelo ya existe en el catalogo', { entity_type: 'modelo', id });
    }
    const modelo = {
      id,
      project_id: input.project_id,
      nombre: input.nombre,
      categoria: input.categoria || 'sin_categoria',
      archivo3mf: input.archivo3mf || null,
      origen: input.origen || 'desconocido',
      metadatos: this._metadatos(input),
      created_at: nowISO()
    };
    this.modelos.set(id, modelo);
    this._persist.marcarDirty(input.project_id);
    this.eventBus?.publish('catalogo.modelo_registrado', {
      modelo_id: id, nombre: modelo.nombre, categoria: modelo.categoria,
      project_id: input.project_id, correlation_id: input.correlation_id, timestamp: nowISO()
    });
    return { status: 201, data: { modelo } };
  }

  _listar(input) {
    const pid = input && input.project_id;
    const out = [];
    for (const [id, m] of this.modelos) {
      if (pid && m.project_id !== pid) continue;
      out.push({ id, nombre: m.nombre, categoria: m.categoria, archivo3mf: m.archivo3mf, origen: m.origen });
    }
    return { status: 200, data: { modelos: out, total: out.length } };
  }

  _obtener(input) {
    if (!input.id) return this._invalid('id');
    const m = this.modelos.get(input.id);
    if (!m) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'modelo no existe en el catalogo', { entity_type: 'modelo', id: input.id });
    return { status: 200, data: { modelo: m } };
  }

  _categorias(input) {
    const pid = input && input.project_id;
    const set = new Set();
    for (const m of this.modelos.values()) {
      if (pid && m.project_id !== pid) continue;
      set.add(m.categoria || 'sin_categoria');
    }
    const categorias = [...set].sort();
    return { status: 200, data: { categorias, total: categorias.length } };
  }

  // pieza 1.3 — metadatos del modelo; huecos como 'desconocido' (nunca inventado).
  _metadatos(input) {
    const md = input.metadatos || {};
    return {
      material: md.material || 'desconocido',
      dimensiones: md.dimensiones || 'desconocido',
      tiempo_estimado: md.tiempo_estimado || 'desconocido',
      peso_estimado: md.peso_estimado || 'desconocido'
    };
  }
}

module.exports = CatalogoModelosReflejo;
