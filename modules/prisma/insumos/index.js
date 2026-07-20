/**
 * prisma/insumos — REFLEJO JS: el CUSTODIO de la biblioteca de INSUMOS (materia prima).
 *
 * Store propio: /prisma/insumos/<id>.json (+ .versions/<id>/<ts>.json), escritura atómica.
 * Habilita el PASO 0 de la skill prisma-compuestos: `buscar` devuelve candidatos rankeados
 * por SIMILITUD (normaliza tildes/mayúsculas/plural + solape de tokens) para RECONCILIAR
 * antes de crear — la biblioteca no se duplica (una harina, una identidad, un precio, un sitio).
 *
 * _normalizar y _score son PUROS (testeados). El coste es de REFERENCIA (fase 1); sin factura.
 * NO cuesta recetas (eso es el costeador) ni toca producto/venta.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const U = require('../../_shared/prisma-unidades');   // normaliza precio → base · referencia prudente (p75)

const DIR = '/prisma/insumos/';
const insPath = (id) => DIR + id + '.json';
const versionPath = (id, ts) => DIR + '.versions/' + id + '/' + ts + '.json';
const nowISO = () => new Date().toISOString();
const tsSafe = () => nowISO().replace(/[:.]/g, '-');

// slug determinista para el id canónico
const slug = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);

class PrismaInsumosReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'insumos';
    this.version = 'reflejo-0.1.0';
  }
  async onUnload() { return super.onUnload(); }

  onBuscarRequest(e)     { return this._atender(e, 'buscar',     'insumos.buscar.response',     d => this._buscar(d)); }
  onCrearRequest(e)      { return this._atender(e, 'crear',      'insumos.crear.response',      d => this._crear(d)); }
  onGetRequest(e)        { return this._atender(e, 'get',        'insumos.get.response',        d => this._get(d)); }
  onListRequest(e)       { return this._atender(e, 'list',       'insumos.list.response',       d => this._list(d)); }
  onActualizarRequest(e) { return this._atender(e, 'actualizar', 'insumos.actualizar.response', d => this._actualizar(d)); }

  // ── PURO: normaliza el PRECIO de las naturalezas al contrato que lee el costeador.
  //    Acepta precio en crudo — uno: {precio_centimos, cantidad, unidad}  ·  varios: {precios:[{...}]}.
  //    Uno → céntimos POR UNIDAD BASE (precioPorBase).  Varios → referencia PRUDENTE (p75, tirando a alto: no es compra).
  //    Deja naturalezas.{coste_centimos_por_unidad, unidad_base} y preserva densidad_g_ml. Sin datos de precio → intacto. ──
  _normalizarPrecio(nat) {
    if (!nat || typeof nat !== 'object') return nat || {};
    const out = { ...nat };
    const aBase = (p) => { const r = U.precioPorBase({ precio_centimos: p?.precio_centimos, cantidad: p?.cantidad, unidad: p?.unidad }); return r.error ? null : r; };
    if (Array.isArray(nat.precios) && nat.precios.length) {
      const norm = nat.precios.map(aBase).filter(Boolean);
      if (norm.length) {
        const base = norm[0].base;                                   // promedia solo los de la misma base (no cruza dimensiones)
        const ref = U.precioReferencia(norm.filter(x => x.base === base).map(x => x.coste_centimos_por_unidad));
        if (ref != null) { out.coste_centimos_por_unidad = ref; out.unidad_base = base; }
      }
      delete out.precios;
    } else if (nat.precio_centimos != null && nat.unidad) {
      const r = aBase(nat);
      if (r) { out.coste_centimos_por_unidad = r.coste_centimos_por_unidad; out.unidad_base = r.base; }
      delete out.precio_centimos; delete out.cantidad; delete out.unidad;   // consumidos → ya viven normalizados
    }
    return out;
  }

  // ── PURO: normaliza un nombre para comparar (tildes, mayúsculas, plural simple, espacios) ──
  _normalizar(nombre) {
    let s = String(nombre || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    s = s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    return s.split(' ').map(w => (w.length > 3 && w.endsWith('s')) ? w.slice(0, -1) : w).join(' '); // plural simple
  }

  // ── PURO: distancia de edición (Levenshtein) → base de la similitud tipográfica ──
  _lev(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }

  // ── PURO: puntúa similitud 0..1 (exacto·typo/caracteres·solape de tokens·contiene).
  //    Captura typo/tildes/plural/mayúsculas. Los SINÓNIMOS/IDIOMAS los resuelve el LLM, no esto. ──
  _score(a, b) {
    const na = this._normalizar(a), nb = this._normalizar(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;                                   // exacto tras normalizar → tildes/plural/mayúsculas
    const simChars = 1 - this._lev(na, nb) / Math.max(na.length, nb.length);   // typo de pocas letras → alto
    const ta = new Set(na.split(' ')), tb = new Set(nb.split(' '));
    let inter = 0; for (const t of ta) if (tb.has(t)) inter++;
    const jaccard = inter / (ta.size + tb.size - inter);       // solape de tokens (multi-palabra)
    const contiene = (na.includes(nb) || nb.includes(na)) ? 0.6 : 0;
    return Math.max(simChars, jaccard, contiene);
  }

  // ── reconciliación: candidatos rankeados. El adaptador elige/pregunta; aquí NO se crea nada. ──
  async _buscar({ project_id, nombre, limite = 5 } = {}) {
    if (!project_id) return this._invalid('project_id');
    if (!nombre) return this._invalid('nombre');
    const todos = await this._leerTodos(project_id);
    const rank = todos
      .map(x => ({ id: x.id, nombre: x.nombre, familia: x.clasificacion_ref?.familia || null,
                   precio_centimos: x.naturalezas?.coste_centimos_por_unidad ?? null,
                   score: this._score(nombre, x.nombre) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limite);
    const exacto = rank.find(x => x.score === 1) || null;
    return { status: 200, data: { candidatos: rank, exacto, total: rank.length } };
  }

  async _crear({ project_id, nombre, naturalezas, clasificacion_ref } = {}) {
    if (!project_id) return this._invalid('project_id');
    if (!nombre || typeof nombre !== 'string') return this._invalid('nombre');
    const id = slug(nombre);
    if (!id) return this._invalid('nombre');
    const existe = await this._read(project_id, insPath(id));
    if (existe) return this._errorResponse(409, 'CONFLICT_STATE', 'el insumo ya existe (usa actualizar)', { insumo_id: id });
    const insumo = { id, nombre: String(nombre).trim(),
      naturalezas: this._normalizarPrecio(naturalezas || { precio: 'por_unidad' }),
      clasificacion_ref: clasificacion_ref || null,
      creado: nowISO(), actualizado: nowISO() };
    await this._write(project_id, insPath(id), insumo);
    this.eventBus?.publish?.('insumo.creado', { project_id, insumo_id: id, nombre: insumo.nombre, timestamp: nowISO() });
    this.metrics?.increment?.('insumos.creados.total', {});
    return { status: 201, data: { insumo } };
  }

  async _get({ project_id, insumo_id } = {}) {
    if (!project_id) return this._invalid('project_id');
    if (!insumo_id) return this._invalid('insumo_id');
    const ins = await this._read(project_id, insPath(insumo_id));
    if (!ins) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'insumo no existe', { entity_type: 'insumo', id: insumo_id });
    return { status: 200, data: { insumo: ins } };
  }

  async _list({ project_id } = {}) {
    if (!project_id) return this._invalid('project_id');
    const todos = await this._leerTodos(project_id);
    return { status: 200, data: { insumos: todos.map(x => ({ id: x.id, nombre: x.nombre,
      familia: x.clasificacion_ref?.familia || null, precio_centimos: x.naturalezas?.coste_centimos_por_unidad ?? null })),
      total: todos.length } };
  }

  async _actualizar({ project_id, insumo_id, campos } = {}) {
    if (!project_id) return this._invalid('project_id');
    if (!insumo_id) return this._invalid('insumo_id');
    if (!campos || typeof campos !== 'object') return this._invalid('campos');
    const raw = await this._read(project_id, insPath(insumo_id));
    if (!raw) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'insumo no existe', { entity_type: 'insumo', id: insumo_id });
    await this._write(project_id, versionPath(insumo_id, tsSafe()), raw);           // snapshot previo
    if (campos.naturalezas) campos = { ...campos, naturalezas: this._normalizarPrecio(campos.naturalezas) };
    const merged = { ...raw, ...campos, id: raw.id, actualizado: nowISO() };
    await this._write(project_id, insPath(insumo_id), merged);
    this.eventBus?.publish?.('insumo.actualizado', { project_id, insumo_id, campos: Object.keys(campos), timestamp: nowISO() });
    return { status: 200, data: { insumo: merged } };
  }

  // ── IO (mismo patrón que producto-manager: fs por RPC, atómico) ──
  async _read(project_id, path) {
    const r = await this._rpc('fs.read.request', { project_id, path });
    if (!r || r.status === 404 || !r.content) return null;
    try { return JSON.parse(r.content); } catch { return null; }
  }
  async _write(project_id, path, obj) {
    const content = JSON.stringify(obj, null, 2);
    const r = await this._rpc('fs.write.request', { project_id, path, content, encoding: 'utf-8', atomic: true });
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
      const ins = await this._read(project_id, DIR + name);
      if (ins && ins.id) out.push(ins);
    }
    return out;
  }
}

module.exports = PrismaInsumosReflejo;
