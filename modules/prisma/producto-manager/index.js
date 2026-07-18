/**
 * prisma/producto-manager — REFLEJO JS (aggregate root de Prisma).
 *
 * COPIADO Y GENERALIZADO de pizzepos/carta-manager. La fontanería es la misma
 * (custodio + _mutar versionado + helpers de fs sobre el bus + un freno); lo que
 * CAMBIA es la FORMA del item: de "producto pizza" (ingredientes/variaciones/
 * dietas) al ProductoUniversal — los 5 huecos de Prisma:
 *
 *   1 IDENTIDAD          { que_es, trabajo_que_resuelve }
 *   2 RESTRICCIONES      [{ tipo, regla, no_negociable }]      reglas duras
 *   3 CONTRATO           { atributos_saber[], opciones[], estados[] }
 *   4 NO_OBJETIVOS       [String]
 *   5 PREGUNTAS_ABIERTAS [{ campo, para, porque, respondida? }]  lo que NO se sabe
 *   + arquetipo · ejes(tiempo/estado_de_partida/ciclo) · naturalezas(stock/precio) · madurez
 *
 * Custodio único de /prisma/catalogo/<id>.json (+ .versions/<id>/<ts>.json). El
 * catálogo es el agregado (= la "carta"); sus items son ProductoUniversal. El
 * adaptador (prisma/adaptador) DESCOMPONE un producto crudo y escribe aquí via
 * catalogo.<op>.request / producto.adaptado; el proyector LEE. Nadie más escribe.
 *
 * Ver arquitectura/decisiones/propuestas/prisma.md.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const DIR = '/prisma/catalogo/';
const catPath = (id) => DIR + id + '.json';
const versionPath = (id, ts) => DIR + '.versions/' + id + '/' + ts + '.json';
const nowISO = () => new Date().toISOString();
const tsSafe = () => nowISO().replace(/[:.]/g, '-');
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// ── vocabulario canónico de Prisma (salido de los 6 casos; ver prisma.md) ──
const SUB_FORMAS = new Set(['variante', 'modificacion', 'añadido', 'personalizacion_libre']);
const MODOS      = new Set(['ELEGIR_UNO', 'ELEGIR_VARIOS', 'QUITAR', 'LIBRE']);
const TIEMPO     = new Set(['ninguno', 'instante', 'cita', 'intervalo_que_cobra']);
const CICLO      = new Set(['de_ida', 'con_retorno']);
const STOCK      = new Set(['unidades', 'ingredientes', 'capacidad_temporal', 'activo_reutilizable']);
const PRECIO     = new Set(['por_unidad', 'por_peso', 'por_tiempo', 'rango_valoracion']);
const MADUREZ    = new Set(['listo', 'necesita_aclaracion_comerciante', 'necesita_revision']);
// origen — el eje que decide si el producto lleva TU TRABAJO. `elaborado` = lo creas o lo
// modificas (tiene recetario: libro de su composición + proceso); `de_reventa` = lo compras
// hecho y lo vendes intacto (solo descripción). Ortogonal al arquetipo: una lámpara elaborada
// y una pizza cocinada son ambas `elaborado`; una pizza comprada para revender es `de_reventa`.
const ORIGEN     = new Set(['elaborado', 'de_reventa']);
// modo por defecto según la sub-forma (variante=uno, modificacion=quitar, añadido=varios, libre=libre)
const MODO_DEFECTO = { variante: 'ELEGIR_UNO', modificacion: 'QUITAR', añadido: 'ELEGIR_VARIOS', personalizacion_libre: 'LIBRE' };

class ProductoManagerReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'producto-manager';
    this.version = 'reflejo-0.1.0';
  }

  // ── handlers RPC (una línea) ──
  onSaveRequest(e)          { return this._atender(e, 'save', 'catalogo.save.response', d => this._save(d)); }
  onGetRequest(e)           { return this._atender(e, 'get', 'catalogo.get.response', d => this._get(d)); }
  onListRequest(e)          { return this._atender(e, 'list', 'catalogo.list.response', d => this._list(d)); }
  onDeleteRequest(e)        { return this._atender(e, 'delete', 'catalogo.delete.response', d => this._delete(d)); }
  onAddProductRequest(e)    { return this._atender(e, 'add_product', 'catalogo.add_product.response', d => this._addProduct(d)); }
  onRemoveProductRequest(e) { return this._atender(e, 'remove_product', 'catalogo.remove_product.response', d => this._removeProduct(d)); }
  onUpdateProductRequest(e) { return this._atender(e, 'update_product', 'catalogo.update_product.response', d => this._updateProduct(d)); }
  onAddCategoryRequest(e)   { return this._atender(e, 'add_category', 'catalogo.add_category.response', d => this._addCategory(d)); }
  onValidarRequest(e)       { return this._atender(e, 'validar', 'catalogo.validar.response', d => this._validar(d)); }
  onActivarRequest(e)       { return this._atender(e, 'activar', 'catalogo.activar.response', d => this._activar(d)); }
  onClonarRequest(e)        { return this._atender(e, 'clonar', 'catalogo.clonar.response', d => this._clonar(d)); }
  onSearchRequest(e)        { return this._atender(e, 'search', 'catalogo.search.response', d => this._search(d)); }
  onStatsRequest(e)         { return this._atender(e, 'stats', 'catalogo.stats.response', d => this._stats(d)); }
  onVersionsRequest(e)      { return this._atender(e, 'versions', 'catalogo.versions.response', d => this._versions(d)); }
  onRestoreRequest(e)       { return this._atender(e, 'restore', 'catalogo.restore.response', d => this._restore(d)); }

  // entrada event-driven (fire-and-forget desde el adaptador): un producto crudo
  // ya descompuesto en 5 huecos → upsert idempotente en el catálogo general del proyecto.
  async onProductoAdaptado(e) {
    const d = (e && e.data) || e || {};
    if (!d.project_id || !d.producto) return;
    const catalogo_id = d.catalogo_id || await this._idCatalogoGeneral(d.project_id) || await this._crearCatalogoGeneral(d.project_id, d.correlation_id);
    if (!catalogo_id) return;
    return this._upsertProducto({ project_id: d.project_id, catalogo_id, producto: d.producto, correlation_id: d.correlation_id });
  }

  // Resuelve el id del catálogo GENERAL del proyecto, solo cuando es inequívoco:
  // el en_servicio; o, si no hay, el único no archivado. 0 o varios → null.
  async _idCatalogoGeneral(project_id) {
    const metas = await this._eachCatalogo(project_id, (c) => c.meta || {});
    if (!metas || metas.length === 0) return null;
    const enServicio = metas.find(m => m.estado === 'en_servicio');
    if (enServicio) return enServicio.id;
    const activos = metas.filter(m => m.estado !== 'archivado');
    return activos.length === 1 ? activos[0].id : null;
  }

  async _crearCatalogoGeneral(project_id, correlation_id) {
    const r = await this._save({ project_id, correlation_id, motivo: 'catálogo general auto-creado (adaptador)',
      catalogo: { meta: { id: 'catalogo_general', nombre: 'Catálogo', estado: 'en_servicio' }, categorias: [], productos: [] } });
    return (r && r.status < 400 && r.data && r.data.meta) ? r.data.meta.id : null;
  }

  // =============================================================
  // helpers de fs (sobre _rpc del bus) — contrato real de filesystem normalizado
  // =============================================================
  async _read(project_id, path) {
    const r = await this._rpc('fs.read.request', { project_id, path });
    if (!r) return { status: 503 };
    if (r.error) return { status: r.error.code === 'RESOURCE_NOT_FOUND' ? 404 : 502, error: r.error };
    if (typeof r.content === 'string') return { status: 200, content: r.content };
    return { status: 404 };
  }
  async _write(project_id, path, obj) {
    const content = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
    const r = await this._rpc('fs.write.request', { project_id, path, content, encoding: 'utf-8', atomic: true });
    if (!r) return { status: 503 };
    if (r.error) return { status: 502, error: r.error };
    return { status: 200 };
  }
  async _edit(project_id, path, patches) {
    const r = await this._rpc('fs.edit.request', { project_id, path, patches });
    if (!r) return { status: 503 };
    if (r.error) return { status: r.error.code === 'RESOURCE_NOT_FOUND' ? 404 : 502, error: r.error };
    return { status: 200 };
  }
  async _snapshot(project_id, id, rawContent, sufijo) {
    return this._write(project_id, versionPath(id, tsSafe() + (sufijo || '')), rawContent);
  }
  async _listFiles(project_id) {
    const r = await this._rpc('fs.list.request', { project_id, path: DIR });
    if (!r) return null;
    if (r.error) return r.error.code === 'RESOURCE_NOT_FOUND' ? [] : null;
    const entries = r.files || r.items || [];
    return entries.map(x => (typeof x === 'string' ? x : x && x.name))
      .filter(name => name && name.endsWith('.json') && !name.startsWith('.versions'));
  }
  async _eachCatalogo(project_id, fn) {
    const files = await this._listFiles(project_id);
    if (files === null) return null;
    const out = [];
    for (const file of files) {
      const raw = await this._read(project_id, DIR + file);
      if (!raw || raw.status !== 200) continue;
      let cat; try { cat = JSON.parse(raw.content); } catch (_) { continue; }
      const r = fn(cat); if (r !== undefined) out.push(r);
    }
    return out;
  }

  // Mutación versionada (DRY de add/remove/update/add_category):
  // lee → snapshot → aplicar(cat) devuelve patches → fs.edit(patches + version/updated_at) → emite catalogo.editado.
  async _mutar(input, operacion, aplicar) {
    const raw = await this._read(input.project_id, catPath(input.catalogo_id));
    if (raw && raw.status === 404) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'catálogo no existe', { entity_type: 'catalogo', id: input.catalogo_id });
    if (!raw || raw.status >= 400) return raw || this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs no responde');
    let cat;
    try { cat = JSON.parse(raw.content); } catch (_) { return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'catálogo ilegible'); }

    const res = aplicar(cat);
    if (res && res.error) return res.error;

    await this._snapshot(input.project_id, input.catalogo_id, raw.content);
    const now = nowISO();
    const versionNueva = ((cat.meta && cat.meta.version) || 1) + 1;
    const patches = res.patches.concat([
      { op: 'replace', path: '/meta/version', value: versionNueva },
      { op: 'replace', path: '/meta/updated_at', value: now }
    ]);
    const ed = await this._edit(input.project_id, catPath(input.catalogo_id), patches);
    if (ed && ed.status >= 400) return ed;

    cat.meta.version = versionNueva;
    cat.meta.updated_at = now;
    this.eventBus.publish('catalogo.editado', {
      project_id: input.project_id, catalogo: cat, operacion,
      correlation_id: input.correlation_id || crypto.randomUUID(), timestamp: now
    });
    return { status: res.status || 200, data: res.data ? res.data(cat) : { catalogo_version: versionNueva } };
  }

  // =============================================================
  // LECTURA
  // =============================================================
  async _get(input) {
    if (!input.project_id || !input.catalogo_id) return this._invalid('catalogo_id');
    const raw = await this._read(input.project_id, catPath(input.catalogo_id));
    if (raw && raw.status === 404) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'catálogo no existe', { entity_type: 'catalogo', id: input.catalogo_id });
    if (!raw || raw.status >= 400) return raw || this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs no responde');
    try { return { status: 200, data: JSON.parse(raw.content) }; } catch (_) { return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'catálogo ilegible'); }
  }

  async _list(input) {
    if (!input.project_id) return this._invalid('project_id');
    const res = await this._eachCatalogo(input.project_id, (cat) => {
      const m = cat.meta || {};
      if (input.estado && input.estado !== 'todos' && m.estado !== input.estado) return undefined;
      if (input.tag && !(Array.isArray(m.tags) && m.tags.includes(input.tag))) return undefined;
      return { id: m.id, nombre: m.nombre, version: m.version, estado: m.estado, tags: m.tags,
        productos_count: (cat.productos || []).length, categorias_count: (cat.categorias || []).length, updated_at: m.updated_at };
    });
    if (res === null) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs no responde');
    res.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    return { status: 200, data: res };
  }

  async _search(input) {
    if (!input.project_id || !input.query) return this._invalid('query');
    const q = String(input.query).toLowerCase().trim();
    const catalogos = [], productos = [];
    const r = await this._eachCatalogo(input.project_id, (cat) => {
      const m = cat.meta || {};
      if (String(m.nombre || '').toLowerCase().includes(q)) catalogos.push({ id: m.id, nombre: m.nombre, estado: m.estado });
      for (const p of (cat.productos || [])) {
        const que = (p.identidad && p.identidad.que_es) || '';
        if (String(p.nombre || '').toLowerCase().includes(q) || String(que).toLowerCase().includes(q))
          productos.push({ producto_id: p.id, nombre: p.nombre, arquetipo: p.arquetipo, catalogo_id: m.id });
      }
      return undefined;
    });
    if (r === null) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs no responde');
    return { status: 200, data: { catalogos, productos } };
  }

  async _stats(input) {
    if (!input.project_id) return this._invalid('project_id');
    let total = 0, total_productos = 0; const por_estado = {}, por_arquetipo = {}, por_madurez = {};
    const r = await this._eachCatalogo(input.project_id, (cat) => {
      total += 1;
      const e = (cat.meta && cat.meta.estado) || 'sin_estado'; por_estado[e] = (por_estado[e] || 0) + 1;
      for (const p of (cat.productos || [])) {
        total_productos += 1;
        const a = p.arquetipo || 'sin_arquetipo'; por_arquetipo[a] = (por_arquetipo[a] || 0) + 1;
        const mad = p.madurez || 'sin_madurez'; por_madurez[mad] = (por_madurez[mad] || 0) + 1;
      }
      return undefined;
    });
    if (r === null) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs no responde');
    return { status: 200, data: { total, por_estado, total_productos, por_arquetipo, por_madurez } };
  }

  async _versions(input) {
    if (!input.project_id || !input.catalogo_id) return this._invalid('catalogo_id');
    const r = await this._rpc('fs.list.request', { project_id: input.project_id, path: DIR + '.versions/' + input.catalogo_id + '/' });
    if (!r) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs no responde');
    if (r.error) return r.error.code === 'RESOURCE_NOT_FOUND' ? { status: 200, data: [] } : this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs no responde');
    const entries = r.files || r.items || [];
    const v = entries.map(x => (typeof x === 'string' ? x : x && x.name))
      .filter(name => name && name.endsWith('.json'))
      .map(name => ({ timestamp: name.replace('.json', ''), filename: name }));
    v.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return { status: 200, data: v };
  }

  // =============================================================
  // RAÍZ (snapshot + version)
  // =============================================================
  async _save(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.catalogo || !input.catalogo.meta || !input.catalogo.meta.nombre) return this._invalid('catalogo.meta.nombre');
    const cat = input.catalogo;
    const id = cat.meta.id || crypto.randomUUID();
    const path = catPath(id);

    const prevRaw = await this._read(input.project_id, path);
    const existe = prevRaw && prevRaw.status === 200;
    const conservado = {};
    if (existe) {
      await this._snapshot(input.project_id, id, prevRaw.content);
      let prev = {}; try { prev = JSON.parse(prevRaw.content); } catch (_) {}
      cat.meta.version = ((prev.meta && prev.meta.version) || 1) + 1;
      cat.meta.created_at = (prev.meta && prev.meta.created_at) || nowISO();
      // GUARDADO CONSERVADOR (como carta-manager): un save reemplaza lo que TRAE; lo que no
      // trae, lo MANTIENE. Una escritura sin productos sobre un catálogo que los tiene conserva
      // los suyos — no se pierde contenido por una escritura que no lo aporta.
      if (!(Array.isArray(cat.productos) && cat.productos.length) && Array.isArray(prev.productos) && prev.productos.length) {
        cat.productos = prev.productos; conservado.productos = prev.productos.length;
      }
      if (!(Array.isArray(cat.categorias) && cat.categorias.length) && Array.isArray(prev.categorias) && prev.categorias.length) {
        cat.categorias = prev.categorias; conservado.categorias = prev.categorias.length;
      }
    } else {
      cat.meta.version = 1;
      cat.meta.created_at = nowISO();
    }
    cat.meta.id = id;
    cat.meta.updated_at = nowISO();
    if (!cat.meta.estado) cat.meta.estado = 'borrador';

    // GATE: normaliza los 5 huecos de todos los productos ANTES de persistir. Un producto que
    // entre plano (turno LLM) sale con la forma canónica; el rico (adaptador) pasa intacto.
    this._normalizarCatalogo(cat);

    let w;
    if (!existe) w = await this._write(input.project_id, path, cat);
    else w = await this._edit(input.project_id, path, [{ op: 'replace', path: '', value: cat }]);
    if (w && w.status >= 400) return w;

    const cid = input.correlation_id || crypto.randomUUID();
    const tieneConservado = !!(conservado.productos || conservado.categorias);
    this.eventBus.publish('catalogo.actualizado', { project_id: input.project_id, user_id: input.user_id || 'system', catalogo: cat, motivo: input.motivo || null, ...(tieneConservado ? { conservado } : {}), correlation_id: cid, timestamp: nowISO() });
    return { status: 200, data: cat, ...(tieneConservado ? { conservado } : {}) };
  }

  async _restore(input) {
    if (!input.project_id || !input.catalogo_id || !input.version_filename) return this._invalid('version_filename');
    const fname = String(input.version_filename).replace(/^.*\//, '');
    const verRaw = await this._read(input.project_id, DIR + '.versions/' + input.catalogo_id + '/' + fname);
    if (verRaw && verRaw.status === 404) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'versión no existe', { entity_type: 'version' });
    if (!verRaw || verRaw.status >= 400) return verRaw || this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs no responde');
    let cat; try { cat = JSON.parse(verRaw.content); } catch (_) { return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'versión ilegible'); }

    const actualRaw = await this._read(input.project_id, catPath(input.catalogo_id));
    const existe = actualRaw && actualRaw.status === 200;
    if (existe) {
      await this._snapshot(input.project_id, input.catalogo_id, actualRaw.content, '-pre-restore');
      let actual = {}; try { actual = JSON.parse(actualRaw.content); } catch (_) {}
      cat.meta.version = ((actual.meta && actual.meta.version) || 0) + 1;
    }
    cat.meta.updated_at = nowISO();
    this._normalizarCatalogo(cat);
    let w;
    if (!existe) w = await this._write(input.project_id, catPath(input.catalogo_id), cat);
    else w = await this._edit(input.project_id, catPath(input.catalogo_id), [{ op: 'replace', path: '', value: cat }]);
    if (w && w.status >= 400) return w;
    this.eventBus.publish('catalogo.actualizado', { project_id: input.project_id, catalogo: cat, motivo: 'restore:' + input.version_filename, correlation_id: input.correlation_id || crypto.randomUUID(), timestamp: nowISO() });
    return { status: 200, data: cat };
  }

  async _clonar(input) {
    if (!input.project_id || !input.catalogo_base_id) return this._invalid('catalogo_base_id');
    if (!input.nuevo_nombre || !String(input.nuevo_nombre).trim()) return this._invalid('nuevo_nombre');
    const raw = await this._read(input.project_id, catPath(input.catalogo_base_id));
    if (raw && raw.status === 404) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'catálogo base no existe', { entity_type: 'catalogo', id: input.catalogo_base_id });
    if (!raw || raw.status >= 400) return raw || this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs no responde');
    let base; try { base = JSON.parse(raw.content); } catch (_) { return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'catálogo base ilegible'); }
    const nuevo = JSON.parse(JSON.stringify(base));
    nuevo.meta.id = 'catalogo_' + slug(input.nuevo_nombre);
    nuevo.meta.nombre = input.nuevo_nombre;
    nuevo.meta.version = 1;
    nuevo.meta.created_at = nowISO();
    nuevo.meta.updated_at = nowISO();
    if (nuevo.meta.id === base.meta.id) return this._errorResponse(409, 'CONFLICT_STATE', 'nuevo_nombre genera el mismo id que la base');
    const exists = await this._read(input.project_id, catPath(nuevo.meta.id));
    if (exists && exists.status === 200) return this._errorResponse(409, 'CONFLICT_STATE', 'ya existe un catálogo con ese id', { entity_type: 'catalogo', id: nuevo.meta.id });
    const w = await this._write(input.project_id, catPath(nuevo.meta.id), nuevo);
    if (w && w.status >= 400) return w;
    this.eventBus.publish('catalogo.actualizado', { project_id: input.project_id, catalogo: nuevo, operacion: 'clonar', origen: base.meta.id, correlation_id: input.correlation_id || crypto.randomUUID(), timestamp: nowISO() });
    return { status: 201, data: { catalogo_id: nuevo.meta.id, origen: base.meta.id, nombre: nuevo.meta.nombre } };
  }

  async _delete(input) {
    if (!input.project_id || !input.catalogo_id) return this._invalid('catalogo_id');
    const res = await this._mutar(input, 'delete_soft', () => ({
      patches: [{ op: 'replace', path: '/meta/estado', value: 'archivado' }],
      data: () => ({ catalogo_id: input.catalogo_id, estado: 'archivado' })
    }));
    if (!res || res.status >= 400) return res;
    const g = await this._get(input);
    if (g && g.status === 200) this.eventBus.publish('catalogo.borrado', { project_id: input.project_id, catalogo: g.data, motivo: input.motivo || null, correlation_id: input.correlation_id || crypto.randomUUID(), timestamp: nowISO() });
    return { status: 200, data: { catalogo_id: input.catalogo_id, estado: 'archivado' } };
  }

  async _activar(input) {
    if (!input.project_id || !input.catalogo_id) return this._invalid('catalogo_id');
    const res = await this._mutar(input, 'activar', () => ({
      patches: [{ op: 'replace', path: '/meta/estado', value: 'en_servicio' }],
      data: () => ({ catalogo_id: input.catalogo_id, estado: 'en_servicio' })
    }));
    if (!res || res.status >= 400) return res;
    const otras = await this._eachCatalogo(input.project_id, (c) =>
      (c.meta && c.meta.estado === 'en_servicio' && c.meta.id !== input.catalogo_id) ? c.meta.id : undefined);
    for (const id of (otras || [])) {
      await this._mutar({ project_id: input.project_id, catalogo_id: id, correlation_id: input.correlation_id }, 'desactivar', () => ({
        patches: [{ op: 'replace', path: '/meta/estado', value: 'borrador' }],
        data: () => ({ catalogo_id: id, estado: 'borrador' })
      }));
    }
    const g = await this._get(input);
    if (g && g.status === 200) this.eventBus.publish('catalogo.actualizado', { project_id: input.project_id, catalogo: g.data, motivo: 'activar', operacion: 'activar', correlation_id: input.correlation_id || crypto.randomUUID(), timestamp: nowISO() });
    return { status: 200, data: { catalogo_id: input.catalogo_id, estado: 'en_servicio' } };
  }

  // =============================================================
  // NORMALIZACIÓN — un ProductoUniversal a la forma canónica de los 5 huecos.
  // Rellena huecos ausentes con defaults sanos; NO inventa contenido (deja vacío
  // lo que no viene, y eso es borrador legítimo). Normaliza el vocabulario de las
  // opciones (sub_forma/modo/valores) y los ejes/naturalezas al vocabulario canónico.
  // =============================================================
  _normalizarProducto(p) {
    if (!p || typeof p !== 'object') return p;
    const nombre = String(p.nombre || (p.identidad && p.identidad.que_es) || '').trim();
    const out = {
      id: p.id || ((p.categoria_id ? slug(p.categoria_id) + '_' : '') + slug(nombre)),
      nombre,
      arquetipo: p.arquetipo ? String(p.arquetipo) : null,
      identidad: {
        que_es: String((p.identidad && p.identidad.que_es) || nombre || ''),
        trabajo_que_resuelve: String((p.identidad && p.identidad.trabajo_que_resuelve) || '')
      },
      restricciones: Array.isArray(p.restricciones) ? p.restricciones.filter(r => r && r.regla).map(r => ({
        tipo: r.tipo || 'otro', regla: String(r.regla), no_negociable: !!r.no_negociable
      })) : [],
      contrato: {
        atributos_saber: Array.isArray(p.contrato && p.contrato.atributos_saber)
          ? p.contrato.atributos_saber.filter(a => a && a.nombre).map(a => ({ nombre: String(a.nombre), valor: a.valor, derivado: a.derivado, eje: a.eje }))
          : [],
        opciones: this._normalizarOpciones(p.contrato && p.contrato.opciones),
        estados: Array.isArray(p.contrato && p.contrato.estados) ? p.contrato.estados.map(String) : []
      },
      ejes: {
        tiempo: TIEMPO.has(p.ejes && p.ejes.tiempo) ? p.ejes.tiempo : 'ninguno',
        estado_de_partida: (p.ejes && p.ejes.estado_de_partida) || false,
        ciclo: CICLO.has(p.ejes && p.ejes.ciclo) ? p.ejes.ciclo : 'de_ida'
      },
      naturalezas: {
        stock: STOCK.has(p.naturalezas && p.naturalezas.stock) ? p.naturalezas.stock : 'unidades',
        precio: PRECIO.has(p.naturalezas && p.naturalezas.precio) ? p.naturalezas.precio : 'por_unidad',
        origen: ORIGEN.has(p.naturalezas && p.naturalezas.origen) ? p.naturalezas.origen : 'de_reventa'
      },
      no_objetivos: Array.isArray(p.no_objetivos) ? p.no_objetivos.map(String) : [],
      preguntas_abiertas: Array.isArray(p.preguntas_abiertas) ? p.preguntas_abiertas.filter(q => q && q.campo).map(q => ({
        campo: String(q.campo), para: q.para || 'comerciante', porque: q.porque || 'privado', respondida: !!q.respondida
      })) : [],
      madurez: MADUREZ.has(p.madurez) ? p.madurez : 'necesita_revision'
    };
    if (p.categoria_id) out.categoria_id = p.categoria_id;
    if (p.precio_base_centimos !== undefined) out.precio_base_centimos = p.precio_base_centimos;
    // receta_ref — el arco de IDENTIDAD hacia la ficha técnica (store de recetas). Es la
    // REALIZACIÓN de un producto ELABORADO (naturalezas.origen === 'elaborado'): apunta a su
    // composición/proceso. NO depende del arquetipo — una lámpara elaborada lo lleva igual que una
    // pizza cocinada. Preservado si viene; ausente = sin ficha (borrador legítimo o de_reventa).
    if (typeof p.receta_ref === 'string' && p.receta_ref.trim()) out.receta_ref = p.receta_ref.trim();
    return out;
  }

  _normalizarOpciones(lista) {
    if (!Array.isArray(lista)) return [];
    return lista.filter(o => o && o.etiqueta).map(o => {
      const sub = SUB_FORMAS.has(o.sub_forma) ? o.sub_forma : 'variante';
      const modo = MODOS.has(o.modo) ? o.modo : MODO_DEFECTO[sub];
      return {
        id: o.id || slug(o.etiqueta),
        etiqueta: String(o.etiqueta),
        sub_forma: sub,
        modo,
        valores: Array.isArray(o.valores) ? o.valores.filter(v => v && v.etiqueta).map(v => ({
          id: v.id || slug(v.etiqueta),
          etiqueta: String(v.etiqueta),
          delta_precio: (typeof v.delta_precio === 'number') ? v.delta_precio : 0,
          disponible: v.disponible !== undefined ? !!v.disponible : true
        })) : []
      };
    });
  }

  _normalizarCatalogo(cat) {
    if (!cat || !Array.isArray(cat.productos)) return;
    cat.productos = cat.productos.map(p => this._normalizarProducto(p));
  }

  // =============================================================
  // EL FRENO — valida la FORMA de los 5 huecos (no la completitud del borrador).
  // Un producto que "necesita_aclaracion_comerciante" con preguntas_abiertas es
  // legítimo: Prisma NO inventa lo que no sabe, lo marca. Función pura.
  // =============================================================
  _checkProducto(p, ref) {
    const errors = [];
    const at = ref || (p && p.nombre) || 'producto';
    if (!p || typeof p !== 'object' || Array.isArray(p)) { errors.push({ code: 'PRODUCTO_AUSENTE', message: 'producto debe ser un objeto' }); return errors; }
    if (!p.nombre || !String(p.nombre).trim()) errors.push({ code: 'PRODUCTO_SIN_NOMBRE', message: `${at}: sin nombre` });
    if (!p.identidad || !String(p.identidad.que_es || '').trim()) errors.push({ code: 'SIN_IDENTIDAD', message: `${at}: identidad.que_es vacío (hueco 1)` });
    if (!p.arquetipo || !String(p.arquetipo).trim()) errors.push({ code: 'SIN_ARQUETIPO', message: `${at}: sin arquetipo` });
    if (p.madurez !== undefined && !MADUREZ.has(p.madurez)) errors.push({ code: 'MADUREZ_INVALIDA', message: `${at}: madurez '${p.madurez}' no canónica` });
    // receta_ref es OPCIONAL (idiosincrasia comestible) — no se exige; pero si viene, un id no vacío.
    if (p.receta_ref !== undefined && (typeof p.receta_ref !== 'string' || !p.receta_ref.trim())) errors.push({ code: 'RECETA_REF_INVALIDA', message: `${at}: receta_ref debe ser un id no vacío` });
    // origen — si viene, canónico. Ausente = de_reventa (default sano al normalizar).
    if (p.naturalezas && p.naturalezas.origen !== undefined && !ORIGEN.has(p.naturalezas.origen)) errors.push({ code: 'ORIGEN_INVALIDO', message: `${at}: naturalezas.origen debe ser 'elaborado' | 'de_reventa'` });
    // opciones (si hay) bien formadas
    const ops = (p.contrato && Array.isArray(p.contrato.opciones)) ? p.contrato.opciones : [];
    for (let k = 0; k < ops.length; k++) {
      const o = ops[k] || {};
      const oref = o.etiqueta || `#${k}`;
      if (!o.etiqueta || !String(o.etiqueta).trim()) errors.push({ code: 'OPCION_SIN_ETIQUETA', path: `/contrato/opciones/${k}`, message: `${at}: opción ${k} sin etiqueta` });
      if (o.sub_forma !== undefined && !SUB_FORMAS.has(o.sub_forma)) errors.push({ code: 'SUB_FORMA_INVALIDA', path: `/contrato/opciones/${k}`, message: `${at}/${oref}: sub_forma '${o.sub_forma}' no canónica` });
      if (o.modo !== undefined && !MODOS.has(o.modo)) errors.push({ code: 'MODO_INVALIDO', path: `/contrato/opciones/${k}`, message: `${at}/${oref}: modo '${o.modo}' no canónico` });
      for (const v of (Array.isArray(o.valores) ? o.valores : [])) {
        if (v && v.delta_precio !== undefined && typeof v.delta_precio !== 'number') errors.push({ code: 'DELTA_PRECIO_INVALIDO', path: `/contrato/opciones/${k}`, message: `${at}/${oref}: delta_precio no es número` });
      }
    }
    return errors;
  }

  _checkCatalogo(cat) {
    const errors = [];
    if (!cat || typeof cat !== 'object' || Array.isArray(cat)) { errors.push({ code: 'CATALOGO_AUSENTE', message: 'catálogo debe ser un objeto' }); return errors; }
    const prods = Array.isArray(cat.productos) ? cat.productos : [];
    if (prods.length === 0) errors.push({ code: 'SIN_PRODUCTOS', message: 'el catálogo no tiene productos' });
    const catIds = new Set((Array.isArray(cat.categorias) ? cat.categorias : []).map(c => c && c.id).filter(Boolean));
    for (let i = 0; i < prods.length; i++) {
      const p = prods[i] || {};
      errors.push(...this._checkProducto(p, `/productos/${i}`));
      const cid = p.categoria_id;
      if (cid && catIds.size && !catIds.has(cid)) errors.push({ code: 'CATEGORIA_DANGLING', path: `/productos/${i}`, message: `${p.nombre || i}: categoria_id '${cid}' no existe` });
    }
    return errors;
  }

  // Acepta { producto } → valida uno; { catalogo } → valida el catálogo entero.
  async _validar(input) {
    if (input && input.producto) {
      const errs = this._checkProducto(input.producto);
      return { status: 200, data: { valid: errs.length === 0, errors: errs, scope: 'producto' } };
    }
    const cat = (input && input.catalogo) ? input.catalogo : input;
    const errs = this._checkCatalogo(cat);
    return { status: 200, data: { valid: errs.length === 0, errors: errs, scope: 'catalogo', productos: Array.isArray(cat && cat.productos) ? cat.productos.length : 0 } };
  }

  // =============================================================
  // MUTACIÓN ESTRUCTURADA DE PRODUCTOS (via _mutar)
  // =============================================================
  async _addProduct(input) {
    if (!input.project_id || !input.catalogo_id) return this._invalid('catalogo_id');
    const raw = input.producto || {};
    if (!raw.nombre) return this._invalid('producto.nombre');
    const nuevo = this._normalizarProducto(raw);
    return this._mutar(input, 'add_product', (cat) => {
      if (nuevo.categoria_id && !(cat.categorias || []).some(c => c.id === nuevo.categoria_id)) return { error: this._errorResponse(412, 'PRECONDITION_FAILED', 'categoria_id no existe en el catálogo') };
      if ((cat.productos || []).some(x => x.id === nuevo.id)) return { error: this._errorResponse(409, 'ALREADY_EXISTS', 'el producto ya existe', { entity_type: 'producto', id: nuevo.id }) };
      cat.productos = (cat.productos || []).concat([nuevo]);
      return { status: 201, patches: [{ op: 'replace', path: '/productos', value: cat.productos }], data: (c) => ({ producto: nuevo, catalogo_version: c.meta.version }) };
    });
  }

  async _removeProduct(input) {
    if (!input.project_id || !input.catalogo_id || !input.producto_id) return this._invalid('producto_id');
    return this._mutar(input, 'remove_product', (cat) => {
      const idx = (cat.productos || []).findIndex(p => p.id === input.producto_id);
      if (idx < 0) return { error: this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'producto no existe', { entity_type: 'producto', id: input.producto_id }) };
      return { patches: [{ op: 'remove', path: '/productos/' + idx }], data: (c) => ({ producto_id: input.producto_id, catalogo_version: c.meta.version }) };
    });
  }

  async _updateProduct(input) {
    if (!input.project_id || !input.catalogo_id || !input.producto_id) return this._invalid('producto_id');
    if (!input.campos || typeof input.campos !== 'object') return this._invalid('campos');
    return this._mutar(input, 'update_product', (cat) => {
      const idx = (cat.productos || []).findIndex(p => p.id === input.producto_id);
      if (idx < 0) return { error: this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'producto no existe', { entity_type: 'producto', id: input.producto_id }) };
      if (input.campos.categoria_id && !(cat.categorias || []).some(c => c.id === input.campos.categoria_id)) return { error: this._errorResponse(412, 'PRECONDITION_FAILED', 'categoria_id destino no existe') };
      // merge por hueco + re-normaliza; el id se conserva (identidad estable aunque se renombre).
      const fusion = Object.assign({}, cat.productos[idx], input.campos, { id: cat.productos[idx].id });
      cat.productos[idx] = this._normalizarProducto(fusion);
      return { patches: [{ op: 'replace', path: '/productos/' + idx, value: cat.productos[idx] }], data: (c) => ({ producto: cat.productos[idx], catalogo_version: c.meta.version }) };
    });
  }

  // upsert idempotente por id (lo usa onProductoAdaptado): update si existe, add si no.
  async _upsertProducto(input) {
    const nuevo = this._normalizarProducto(input.producto || {});
    if (!nuevo.nombre) return this._invalid('producto.nombre');
    return this._mutar(input, 'upsert_product', (cat) => {
      const idx = (cat.productos || []).findIndex(p => p.id === nuevo.id);
      if (idx < 0) cat.productos = (cat.productos || []).concat([nuevo]);
      else cat.productos[idx] = nuevo;
      return { status: idx < 0 ? 201 : 200, patches: [{ op: 'replace', path: '/productos', value: cat.productos }], data: (c) => ({ producto: nuevo, nuevo: idx < 0, catalogo_version: c.meta.version }) };
    });
  }

  async _addCategory(input) {
    if (!input.project_id || !input.catalogo_id) return this._invalid('catalogo_id');
    const cat_in = input.categoria || {};
    if (!cat_in.nombre) return this._invalid('categoria.nombre');
    const id = slug(cat_in.nombre);
    if (!id) return this._invalid('categoria.nombre');
    let nueva;
    return this._mutar(input, 'add_category', (cat) => {
      cat.categorias = cat.categorias || [];
      if (cat.categorias.some(c => c.id === id)) return { error: this._errorResponse(409, 'ALREADY_EXISTS', 'categoría ya existe', { entity_type: 'categoria', id }) };
      nueva = { id, nombre: String(cat_in.nombre).trim(), descripcion: cat_in.descripcion || null, orden: typeof cat_in.orden === 'number' ? cat_in.orden : cat.categorias.length };
      return { status: 201, patches: [{ op: 'add', path: '/categorias/-', value: nueva }], data: (c) => ({ categoria: nueva, catalogo_version: c.meta.version }) };
    });
  }
}

module.exports = ProductoManagerReflejo;
