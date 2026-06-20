/**
 * carta-manager — REFLEJO JS (aggregate root del subsistema-carta). Todo es
 * DETERMINISTA: CRUD de cartas + versionado + manipulacion de productos/categorias.
 * Antes lo ejecutaba el turno LLM (blueprint puro, 15 ops); ahora JS de milisegundos,
 * sin teatro. Mismo contrato de bus (carta.<op>.request) → los carta-* no se enteran.
 *
 * Custodio unico del store /pizzepos/cartas/<id>.json (+ .versions/<id>/<ts>.json).
 * Los demas (carta-design/digital/impresion/marketing/scheduler) LEEN via el; NUNCA
 * escriben al store directamente.
 *
 * Patron de mutacion versionada (5 ops add/remove/update/add_category/update_prices)
 * consolidado en _mutar(): read → snapshot → aplicar → fs.edit → version++ → carta.editada.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const DIR = '/pizzepos/cartas/';
const cartaPath = (id) => DIR + id + '.json';
const versionPath = (id, ts) => DIR + '.versions/' + id + '/' + ts + '.json';
const nowISO = () => new Date().toISOString();
const tsSafe = () => nowISO().replace(/[:.]/g, '-');
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
// Familias canónicas de ingrediente (las que agrupa escandallo/mise-en-place). Default: 'otro'.
const FAMILIAS = new Set(['queso', 'verdura', 'carne', 'salsa', 'pescado', 'fruta', 'extra', 'condimento', 'otro']);

class CartaManagerReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'carta-manager';
    this.version = 'reflejo-1.8.0';
  }

  // ── handlers RPC (una linea) ──
  onSaveRequest(e) { return this._atender(e, 'save', 'carta.save.response', d => this._save(d)); }
  onGetRequest(e) { return this._atender(e, 'get', 'carta.get.response', d => this._get(d)); }
  onListRequest(e) { return this._atender(e, 'list', 'carta.list.response', d => this._list(d)); }
  onDeleteRequest(e) { return this._atender(e, 'delete', 'carta.delete.response', d => this._delete(d)); }
  onAddProductRequest(e) { return this._atender(e, 'add_product', 'carta.add_product.response', d => this._addProduct(d)); }
  onRemoveProductRequest(e) { return this._atender(e, 'remove_product', 'carta.remove_product.response', d => this._removeProduct(d)); }
  onUpdateProductRequest(e) { return this._atender(e, 'update_product', 'carta.update_product.response', d => this._updateProduct(d)); }
  onAddCategoryRequest(e) { return this._atender(e, 'add_category', 'carta.add_category.response', d => this._addCategory(d)); }
  onUpdatePricesRequest(e) { return this._atender(e, 'update_prices', 'carta.update_prices.response', d => this._updatePrices(d)); }
  onClonarRequest(e) { return this._atender(e, 'clonar', 'carta.clonar.response', d => this._clonar(d)); }
  onSearchRequest(e) { return this._atender(e, 'search', 'carta.search.response', d => this._search(d)); }
  onStatsRequest(e) { return this._atender(e, 'stats', 'carta.stats.response', d => this._stats(d)); }
  onVersionsRequest(e) { return this._atender(e, 'versions', 'carta.versions.response', d => this._versions(d)); }
  onRestoreRequest(e) { return this._atender(e, 'restore', 'carta.restore.response', d => this._restore(d)); }
  // entrada event-driven (fire-and-forget desde menu-generator).
  // IDENTIDAD (FASE 3): una carta general por proyecto. Si ya existe la carta general,
  // REUSA su id para SOBREESCRIBIRLA (snapshot+version++), no spawnear un fichero nuevo.
  // Red de seguridad determinista: no depende de que el LLM de menu-generator haga el LEER.
  async onCartaCreada(e) {
    const d = (e && e.data) || e || {};
    const carta = d.carta;
    if (carta && carta.meta) {
      const idGeneral = await this._idCartaGeneral(d.project_id);
      if (idGeneral && idGeneral !== carta.meta.id) carta.meta.id = idGeneral;   // mapea a la general existente
    }
    return this._save({ project_id: d.project_id, correlation_id: d.correlation_id, user_id: d.user_id || 'async-subscriber', carta, motivo: d.motivo || 'generada por menu-generator (async)' });
  }

  // Resuelve el id de la carta GENERAL del proyecto, SOLO cuando es inequívoco:
  // la en_servicio; o, si no hay, la única no archivada. Con 0 o varias activas → null
  // (no fuerza: deja que el id entrante mande, para no pisar una carta de canal).
  async _idCartaGeneral(project_id) {
    const files = await this._listFiles(project_id);
    if (!files || files.length === 0) return null;
    const metas = [];
    for (const file of files) {
      const raw = await this._read(project_id, DIR + file);
      if (!raw || raw.status !== 200) continue;
      try { metas.push(JSON.parse(raw.content).meta || {}); } catch (_) { /* ilegible: ignora */ }
    }
    const enServicio = metas.find(m => m.estado === 'en_servicio');
    if (enServicio) return enServicio.id;
    const activas = metas.filter(m => m.estado !== 'archivada');
    return activas.length === 1 ? activas[0].id : null;
  }

  // =============================================================
  // helpers de fs (sobre _rpc del bus)
  // Contrato real de filesystem: éxito → {request_id, ...data} SIN status (read trae
  // content; list trae files/items); error → {request_id, error:{code,message}} SIN status.
  // Estos helpers NORMALIZAN a {status, content?/error?} para el resto del reflejo.
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
  async _snapshot(project_id, carta_id, rawContent, sufijo) {
    return this._write(project_id, versionPath(carta_id, tsSafe() + (sufijo || '')), rawContent);
  }

  // Nombres de fichero (.json, sin .versions) en un dir. Lee files/items (objetos {name}) — NO data.
  async _listFilesIn(project_id, dir) {
    const r = await this._rpc('fs.list.request', { project_id, path: dir });
    if (!r) return null;
    if (r.error) return r.error.code === 'RESOURCE_NOT_FOUND' ? [] : null;
    const entries = r.files || r.items || [];
    return entries
      .map(x => (typeof x === 'string' ? x : x && x.name))
      .filter(name => name && name.endsWith('.json') && !name.startsWith('.versions'));
  }

  // Mutacion versionada (DRY de add/remove/update/add_category/update_prices):
  // lee → snapshot → aplicar(carta) devuelve patches → fs.edit(patches + version/updated_at) → emite carta.editada.
  async _mutar(input, operacion, aplicar) {
    const raw = await this._read(input.project_id, cartaPath(input.carta_id));
    if (raw && raw.status === 404) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'carta no existe', { entity_type: 'carta', id: input.carta_id });
    if (!raw || raw.status >= 400) return raw || this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs no responde');
    let carta;
    try { carta = JSON.parse(raw.content); } catch (_) { return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'carta ilegible'); }

    const res = aplicar(carta);              // { patches, extra?, error? } — sincrono, determinista
    if (res && res.error) return res.error;  // proyeccion puede abortar (RESOURCE_NOT_FOUND/PRECONDITION/etc.)

    await this._snapshot(input.project_id, input.carta_id, raw.content);   // snapshot ANTES de sobrescribir
    const now = nowISO();
    const versionNueva = ((carta.meta && carta.meta.version) || 1) + 1;
    const patches = res.patches.concat([
      { op: 'replace', path: '/meta/version', value: versionNueva },
      { op: 'replace', path: '/meta/updated_at', value: now }
    ]);
    const ed = await this._edit(input.project_id, cartaPath(input.carta_id), patches);
    if (ed && ed.status >= 400) return ed;

    carta.meta.version = versionNueva;
    carta.meta.updated_at = now;
    this.eventBus.publish('carta.editada', {
      project_id: input.project_id, carta, operacion,
      correlation_id: input.correlation_id || crypto.randomUUID(), timestamp: now
    });
    return { status: res.status || 200, data: res.data ? res.data(carta) : { carta_version: versionNueva } };
  }

  // =============================================================
  // LECTURA (no muta)
  // =============================================================
  async _get(input) {
    if (!input.project_id || !input.carta_id) return this._invalid('carta_id');
    const raw = await this._read(input.project_id, cartaPath(input.carta_id));
    if (raw && raw.status === 404) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'carta no existe', { entity_type: 'carta', id: input.carta_id });
    if (!raw || raw.status >= 400) return raw || this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs no responde');
    try { return { status: 200, data: JSON.parse(raw.content) }; } catch (_) { return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'carta ilegible'); }
  }

  async _listFiles(project_id) {
    return this._listFilesIn(project_id, DIR);
  }

  async _eachCarta(project_id, fn) {
    const files = await this._listFiles(project_id);
    if (files === null) return null;
    const out = [];
    for (const file of files) {
      const raw = await this._read(project_id, DIR + file);
      if (!raw || raw.status !== 200) continue;
      let carta; try { carta = JSON.parse(raw.content); } catch (_) { continue; }
      const r = fn(carta); if (r !== undefined) out.push(r);
    }
    return out;
  }

  async _list(input) {
    if (!input.project_id) return this._invalid('project_id');
    const res = await this._eachCarta(input.project_id, (carta) => {
      const m = carta.meta || {};
      if (input.estado && input.estado !== 'todos' && m.estado !== input.estado) return undefined;
      if (input.tag && !(Array.isArray(m.tags) && m.tags.includes(input.tag))) return undefined;
      return { id: m.id, nombre: m.nombre, descripcion: m.descripcion, version: m.version, estado: m.estado, tags: m.tags, productos_count: (carta.productos || []).length, categorias_count: (carta.categorias || []).length, updated_at: m.updated_at };
    });
    if (res === null) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs no responde');
    res.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    return { status: 200, data: res };
  }

  async _search(input) {
    if (!input.project_id || !input.query) return this._invalid('query');
    const q = String(input.query).toLowerCase().trim();
    const tipo = input.tipo || 'todos';
    const cartas = [], productos = [];
    const r = await this._eachCarta(input.project_id, (carta) => {
      const m = carta.meta || {};
      if ((tipo === 'todos' || tipo === 'carta') && String(m.nombre || '').toLowerCase().includes(q)) cartas.push({ id: m.id, nombre: m.nombre, estado: m.estado });
      if (tipo === 'todos' || tipo === 'producto') for (const p of (carta.productos || [])) if (String(p.nombre || '').toLowerCase().includes(q) || String(p.descripcion || '').toLowerCase().includes(q)) productos.push({ producto_id: p.id, nombre: p.nombre, precio: p.precio, carta_id: m.id, carta_nombre: m.nombre });
      return undefined;
    });
    if (r === null) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs no responde');
    return { status: 200, data: { cartas, productos } };
  }

  async _stats(input) {
    if (!input.project_id) return this._invalid('project_id');
    let total = 0, total_productos = 0; const por_estado = {};
    const r = await this._eachCarta(input.project_id, (carta) => {
      total += 1; const e = (carta.meta && carta.meta.estado) || 'sin_estado'; por_estado[e] = (por_estado[e] || 0) + 1; total_productos += (carta.productos || []).length; return undefined;
    });
    if (r === null) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs no responde');
    return { status: 200, data: { total, por_estado, total_productos } };
  }

  async _versions(input) {
    if (!input.project_id || !input.carta_id) return this._invalid('carta_id');
    const r = await this._rpc('fs.list.request', { project_id: input.project_id, path: DIR + '.versions/' + input.carta_id + '/' });
    if (!r) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs no responde');
    if (r.error) return r.error.code === 'RESOURCE_NOT_FOUND' ? { status: 200, data: [] } : this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs no responde');
    const entries = r.files || r.items || [];
    const v = entries
      .map(x => (typeof x === 'string' ? x : x && x.name))
      .filter(name => name && name.endsWith('.json'))
      .map(name => ({ timestamp: name.replace('.json', ''), filename: name }));
    v.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return { status: 200, data: v };
  }

  // =============================================================
  // RAIZ (snapshot + version)
  // =============================================================
  async _save(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.carta || !input.carta.meta || !input.carta.meta.nombre) return this._invalid('carta.meta.nombre');
    const carta = input.carta;
    const carta_id = carta.meta.id || crypto.randomUUID();
    const path = cartaPath(carta_id);

    const prevRaw = await this._read(input.project_id, path);
    const existe = prevRaw && prevRaw.status === 200;
    const conservado = {};
    if (existe) {
      await this._snapshot(input.project_id, carta_id, prevRaw.content);
      let prev = {}; try { prev = JSON.parse(prevRaw.content); } catch (_) {}
      carta.meta.version = ((prev.meta && prev.meta.version) || 1) + 1;
      carta.meta.created_at = (prev.meta && prev.meta.created_at) || nowISO();
      // GUARDADO CONSERVADOR: una carta CONSERVA su contenido. Este save reemplaza lo
      // que TRAE; lo que no trae, lo MANTIENE. Una escritura sin productos sobre una
      // carta que sí los tiene conserva los suyos — la carta no pierde contenido por una
      // escritura que no lo aporta. (Para vaciar de verdad: remove_product, que es explícito.)
      if (!(Array.isArray(carta.productos) && carta.productos.length) && Array.isArray(prev.productos) && prev.productos.length) {
        carta.productos = prev.productos; conservado.productos = prev.productos.length;
      }
      if (!(Array.isArray(carta.categorias) && carta.categorias.length) && Array.isArray(prev.categorias) && prev.categorias.length) {
        carta.categorias = prev.categorias; conservado.categorias = prev.categorias.length;
      }
      if (conservado.productos || conservado.categorias) {
        this.logger?.info('carta-manager.save.conservado', { carta_id, ...conservado });
        this.metrics?.increment('carta-manager.reflejo.conservado', { op: 'save' });
      }
    } else {
      carta.meta.version = 1;
      carta.meta.created_at = nowISO();
    }
    carta.meta.id = carta_id;
    carta.meta.updated_at = nowISO();
    if (!carta.meta.estado) carta.meta.estado = 'borrador';

    let w;
    if (!existe) w = await this._write(input.project_id, path, carta);
    else w = await this._edit(input.project_id, path, [{ op: 'replace', path: '', value: carta }]);
    if (w && w.status >= 400) return w;

    const cid = input.correlation_id || crypto.randomUUID();
    const tieneConservado = !!(conservado.productos || conservado.categorias);
    this.eventBus.publish('carta.actualizada', { project_id: input.project_id, user_id: input.user_id || 'system', carta, motivo: input.motivo || null, ...(tieneConservado ? { conservado } : {}), correlation_id: cid, timestamp: nowISO() });
    await this._autoPromoTarifas(input.project_id, carta_id, cid);
    return { status: 200, data: carta, ...(tieneConservado ? { conservado } : {}) };
  }

  // Auto-promocion primera carta: si tarifas.config vacio, esta carta pasa a general. Fire-and-forget.
  async _autoPromoTarifas(project_id, carta_id, correlation_id) {
    try {
      const raw = await this._read(project_id, '/config/tarifas.json');
      let promocionar = false;
      if (raw && raw.status === 404) promocionar = true;
      else if (raw && raw.status === 200) {
        let cfg = {}; try { cfg = JSON.parse(raw.content); } catch (_) {}
        const generalVacio = cfg.general === null || cfg.general === undefined;
        const canales = cfg.canales || {};
        const algun = ['mesa', 'telefono', 'llevar', 'glovo', 'whatsapp', 'llevadoo'].some(k => canales[k] !== null && canales[k] !== undefined);
        if (generalVacio && !algun) promocionar = true;
      }
      if (promocionar) this.eventBus.publish('tarifas.set_general', { project_id, carta_id, correlation_id, request_id: crypto.randomUUID(), timestamp: nowISO() });
    } catch (_) { /* no critico: la carta ya esta persistida */ }
  }

  async _restore(input) {
    if (!input.project_id || !input.carta_id || !input.version_filename) return this._invalid('version_filename');
    const fname = String(input.version_filename).replace(/^.*\//, '');   // solo el nombre, sin path
    const verRaw = await this._read(input.project_id, DIR + '.versions/' + input.carta_id + '/' + fname);
    if (verRaw && verRaw.status === 404) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'version no existe', { entity_type: 'version' });
    if (!verRaw || verRaw.status >= 400) return verRaw || this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs no responde');
    let carta; try { carta = JSON.parse(verRaw.content); } catch (_) { return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'version ilegible'); }

    const actualRaw = await this._read(input.project_id, cartaPath(input.carta_id));
    const existe = actualRaw && actualRaw.status === 200;
    if (existe) {
      await this._snapshot(input.project_id, input.carta_id, actualRaw.content, '-pre-restore');
      let actual = {}; try { actual = JSON.parse(actualRaw.content); } catch (_) {}
      carta.meta.version = ((actual.meta && actual.meta.version) || 0) + 1;
    }
    carta.meta.updated_at = nowISO();
    let w;
    if (!existe) w = await this._write(input.project_id, cartaPath(input.carta_id), carta);
    else w = await this._edit(input.project_id, cartaPath(input.carta_id), [{ op: 'replace', path: '', value: carta }]);
    if (w && w.status >= 400) return w;
    this.eventBus.publish('carta.actualizada', { project_id: input.project_id, carta, motivo: 'restore:' + input.version_filename, correlation_id: input.correlation_id || crypto.randomUUID(), timestamp: nowISO() });
    return { status: 200, data: carta };
  }

  async _clonar(input) {
    if (!input.project_id || !input.carta_base_id) return this._invalid('carta_base_id');
    if (!input.nuevo_nombre || !String(input.nuevo_nombre).trim()) return this._invalid('nuevo_nombre');
    const raw = await this._read(input.project_id, cartaPath(input.carta_base_id));
    if (raw && raw.status === 404) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'carta base no existe', { entity_type: 'carta', id: input.carta_base_id });
    if (!raw || raw.status >= 400) return raw || this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs no responde');
    let base; try { base = JSON.parse(raw.content); } catch (_) { return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'carta base ilegible'); }
    const nueva = JSON.parse(JSON.stringify(base));
    nueva.meta.id = 'carta_' + slug(input.nuevo_nombre);
    nueva.meta.nombre = input.nuevo_nombre;
    nueva.meta.version = 1;
    nueva.meta.created_at = nowISO();
    nueva.meta.updated_at = nowISO();
    if (nueva.meta.id === base.meta.id) return this._errorResponse(409, 'CONFLICT_STATE', 'nuevo_nombre genera el mismo id que la base');
    const exists = await this._read(input.project_id, cartaPath(nueva.meta.id));
    if (exists && exists.status === 200) return this._errorResponse(409, 'CONFLICT_STATE', 'ya existe una carta con ese id', { entity_type: 'carta', id: nueva.meta.id });
    const w = await this._write(input.project_id, cartaPath(nueva.meta.id), nueva);
    if (w && w.status >= 400) return w;
    this.eventBus.publish('carta.actualizada', { project_id: input.project_id, carta: nueva, operacion: 'clonar', origen: base.meta.id, correlation_id: input.correlation_id || crypto.randomUUID(), timestamp: nowISO() });
    return { status: 201, data: { carta_id: nueva.meta.id, origen: base.meta.id, nombre: nueva.meta.nombre } };
  }

  async _delete(input) {
    if (!input.project_id || !input.carta_id) return this._invalid('carta_id');
    const res = await this._mutar(input, 'delete_soft', (carta) => ({
      patches: [{ op: 'replace', path: '/meta/estado', value: 'archivada' }],
      data: () => ({ carta_id: input.carta_id, estado: 'archivada' })
    }));
    if (res && res.status < 400) {
      // _mutar emite carta.editada; delete emite carta.borrada en su lugar.
    }
    if (!res || res.status >= 400) return res;
    // re-emitir como carta.borrada (en vez de editada): leemos la carta resultante via get.
    const g = await this._get(input);
    if (g && g.status === 200) this.eventBus.publish('carta.borrada', { project_id: input.project_id, carta: g.data, motivo: input.motivo || null, correlation_id: input.correlation_id || crypto.randomUUID(), timestamp: nowISO() });
    return { status: 200, data: { carta_id: input.carta_id, estado: 'archivada' } };
  }

  // =============================================================
  // MUTACION ESTRUCTURADA (via _mutar)
  // =============================================================
  // Ingredientes a la forma CANÓNICA {id, nombre, emoji?, familia, precio_extra?}. id determinista
  // (slug), familia validada contra el set canónico (default 'otro'), precio_extra preservado (lo
  // necesita variaciones para cobrar extras). Misma ley que menu-generator.
  _normalizarIngredientes(lista) {
    if (!Array.isArray(lista)) return [];
    return lista.filter(ing => ing && ing.nombre).map(ing => {
      const out = { id: ing.id || slug(ing.nombre), nombre: String(ing.nombre), familia: FAMILIAS.has(ing.familia) ? ing.familia : 'otro' };
      if (ing.emoji) out.emoji = ing.emoji;
      if (typeof ing.precio_extra === 'number') out.precio_extra = ing.precio_extra;
      return out;
    });
  }

  // Aptitudes dietéticas a forma canónica: objeto de booleanos. undefined si no es objeto.
  _normalizarDietas(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return undefined;
    const out = {};
    for (const k of Object.keys(d)) out[k] = !!d[k];
    return Object.keys(out).length ? out : undefined;
  }

  async _addProduct(input) {
    if (!input.project_id || !input.carta_id) return this._invalid('carta_id');
    const p = input.producto || {};
    if (!p.nombre) return this._invalid('producto.nombre');
    if (typeof p.precio !== 'number' || p.precio < 0) return this._invalid('producto.precio');
    if (!p.categoria_id) return this._invalid('producto.categoria_id');
    // id DETERMINISTA: mismo (categoria, nombre) → mismo id SIEMPRE. Idempotencia, sin duplicados.
    const id = slug(p.categoria_id) + '_' + slug(p.nombre);
    let nuevo;
    return this._mutar(input, 'add_product', (carta) => {
      if (!(carta.categorias || []).some(c => c.id === p.categoria_id)) return { error: this._errorResponse(412, 'PRECONDITION_FAILED', 'categoria_id no existe en la carta') };
      if ((carta.productos || []).some(x => x.id === id)) return { error: this._errorResponse(409, 'ALREADY_EXISTS', 'el producto ya existe en la carta', { entity_type: 'producto', id }) };
      nuevo = {
        id, nombre: p.nombre, precio: p.precio, categoria_id: p.categoria_id,
        descripcion: p.descripcion || '', etiquetas: p.etiquetas || [], alergenos: p.alergenos || [],
        disponible: p.disponible !== undefined ? p.disponible : true,
        ingredientes: this._normalizarIngredientes(p.ingredientes)
      };
      // abstracción del producto (las 6 W): campos intrínsecos opcionales, solo si vienen.
      if (p.tipo) nuevo.tipo = String(p.tipo);
      if (p.emoji) nuevo.emoji = String(p.emoji);
      if (Array.isArray(p.estaciones) && p.estaciones.length) nuevo.estaciones = p.estaciones;
      if (Array.isArray(p.ingredientes_base) && p.ingredientes_base.length) nuevo.ingredientes_base = this._normalizarIngredientes(p.ingredientes_base);
      const dnAdd = this._normalizarDietas(p.dietas); if (dnAdd) nuevo.dietas = dnAdd;
      carta.productos = (carta.productos || []).concat([nuevo]);
      return { status: 201, patches: [{ op: 'replace', path: '/productos', value: carta.productos }], data: (c) => ({ producto: nuevo, carta_version: c.meta.version }) };
    });
  }

  async _removeProduct(input) {
    if (!input.project_id || !input.carta_id || !input.producto_id) return this._invalid('producto_id');
    return this._mutar(input, 'remove_product', (carta) => {
      const idx = (carta.productos || []).findIndex(p => p.id === input.producto_id);
      if (idx < 0) return { error: this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'producto no existe', { entity_type: 'producto', id: input.producto_id }) };
      return { patches: [{ op: 'remove', path: '/productos/' + idx }], data: (c) => ({ producto_id: input.producto_id, carta_version: c.meta.version }) };
    });
  }

  async _updateProduct(input) {
    if (!input.project_id || !input.carta_id || !input.producto_id) return this._invalid('producto_id');
    if (!input.campos || typeof input.campos !== 'object' || Object.keys(input.campos).length === 0) return this._invalid('campos');
    // Abstracción del producto (las 6 W): todo lo intrínseco es actualizable salvo el id
    // (identidad estable aunque se renombre). ingredientes/ingredientes_base/dietas se
    // normalizan; el resto son escalares/arrays pasados tal cual.
    const permitidos = ['nombre', 'precio', 'categoria_id', 'descripcion', 'etiquetas', 'alergenos', 'disponible', 'tipo', 'emoji', 'estaciones'];
    return this._mutar(input, 'update_product', (carta) => {
      const idx = (carta.productos || []).findIndex(p => p.id === input.producto_id);
      if (idx < 0) return { error: this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'producto no existe', { entity_type: 'producto', id: input.producto_id }) };
      if (input.campos.categoria_id && !(carta.categorias || []).some(c => c.id === input.campos.categoria_id)) return { error: this._errorResponse(412, 'PRECONDITION_FAILED', 'categoria_id destino no existe') };
      const prod = carta.productos[idx];
      for (const k of permitidos) if (input.campos[k] !== undefined) prod[k] = input.campos[k];
      if (input.campos.ingredientes !== undefined) prod.ingredientes = this._normalizarIngredientes(input.campos.ingredientes);
      if (input.campos.ingredientes_base !== undefined) prod.ingredientes_base = this._normalizarIngredientes(input.campos.ingredientes_base);
      if (input.campos.dietas !== undefined) { const dn = this._normalizarDietas(input.campos.dietas); if (dn) prod.dietas = dn; }
      return { patches: [{ op: 'replace', path: '/productos/' + idx, value: prod }], data: (c) => ({ producto: prod, carta_version: c.meta.version }) };
    });
  }

  async _addCategory(input) {
    if (!input.project_id || !input.carta_id) return this._invalid('carta_id');
    const cat = input.categoria || {};
    if (!cat.nombre) return this._invalid('categoria.nombre');
    // id DETERMINISTA: slug del nombre. "Hamburguesas" → "hamburguesas" SIEMPRE (dedup por id).
    const id = slug(cat.nombre);
    if (!id) return this._invalid('categoria.nombre');
    let nueva;
    return this._mutar(input, 'add_category', (carta) => {
      carta.categorias = carta.categorias || [];
      if (carta.categorias.some(c => c.id === id)) return { error: this._errorResponse(409, 'ALREADY_EXISTS', 'categoria ya existe', { entity_type: 'categoria', id }) };
      nueva = { id, nombre: String(cat.nombre).trim(), descripcion: cat.descripcion || null, orden: typeof cat.orden === 'number' ? cat.orden : carta.categorias.length };
      return { status: 201, patches: [{ op: 'add', path: '/categorias/-', value: nueva }], data: (c) => ({ categoria: nueva, carta_version: c.meta.version }) };
    });
  }

  async _updatePrices(input) {
    if (!input.project_id || !input.carta_id) return this._invalid('carta_id');
    if (!Array.isArray(input.updates) || input.updates.length === 0) return this._invalid('updates');
    const aplicados = [], errores = [];
    const res = await this._mutar(input, 'update_prices', (carta) => {
      for (const u of input.updates) {
        if (typeof u.precio_nuevo !== 'number' || u.precio_nuevo < 0) { errores.push({ producto_id: u.producto_id, error: 'precio_invalido' }); continue; }
        const prod = (carta.productos || []).find(p => p.id === u.producto_id);
        if (!prod) { errores.push({ producto_id: u.producto_id, error: 'no_existe' }); continue; }
        aplicados.push({ producto_id: u.producto_id, precio_antes: prod.precio, precio_despues: u.precio_nuevo });
        prod.precio = u.precio_nuevo;
      }
      if (aplicados.length === 0) return { error: this._errorResponse(412, 'PRECONDITION_FAILED', 'ningun update aplicado', { errores }) };
      return { patches: [{ op: 'replace', path: '/productos', value: carta.productos }], data: (c) => ({ aplicados, errores, carta_version: c.meta.version }) };
    });
    return res;
  }
}

module.exports = CartaManagerReflejo;
