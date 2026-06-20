/**
 * menu-generator — REFLEJO JS (mitad determinista del módulo híbrido).
 *
 * menu-generator era blueprint-only: el LLM tenía que EMITIR la carta entera
 * (38+ productos enriquecidos) en una respuesta. No cabía → o mandaba vacío
 * (carta-manager la persistía y BORRABA lo que había) o troceaba a mano y
 * cantaba "✅ completas" sin que el bus lo respaldara (alucinación de guardado).
 *
 * Este reflejo importa POR REFERENCIA: el LLM solo dice "importa el JSON que
 * pegué" (cero tokens de producto). El reflejo LEE el último mensaje del usuario
 * con un JSON de carta (db.query), lo PROYECTA al shape canónico carta-pizzepos
 * (determinista, réplica de la ley de carta-manager) y lo GUARDA con UNA sola
 * carta.save (atómica, versionada) — VERIFICADA por el response correlado.
 *
 * Lo determinista (leer/proyectar/guardar) vive aquí; el blueprint conserva lo
 * fuzzy (clasificar ruta, estructurar texto libre dictado). El loader carga
 * ambos (blueprint_driven + index.js = híbrido), como recetas/escandallo/carta-manager.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const slug = (s) => String(s || '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// Familias canónicas de ingrediente (mismas que carta-manager / escandallo). Default: 'otro'.
const FAMILIAS = new Set(['queso', 'verdura', 'carne', 'salsa', 'pescado', 'fruta', 'extra', 'condimento', 'otro']);
// Alias del campo de clasificación del catálogo de origen ('tipo'/'grupo') -> familia canónica.
const FAMILIA_ALIAS = {
  marisco: 'pescado', mariscos: 'pescado', pescados: 'pescado',
  lacteo: 'queso', lacteos: 'queso', quesos: 'queso',
  embutido: 'carne', embutidos: 'carne', carnes: 'carne',
  vegetal: 'verdura', vegetales: 'verdura', verduras: 'verdura', hortaliza: 'verdura',
  salsas: 'salsa', frutas: 'fruta', extras: 'extra', condimentos: 'condimento',
};

class MenuGeneratorReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'menu-generator';
    this.version = 'reflejo-1.0.0';
  }

  // ── handler RPC (una línea: delega a _atender de la base) ──
  onImportRequest(e) { return this._atender(e, 'import', 'menu.import.response', d => this._import(d)); }

  // ── operación determinista: import por referencia ──
  async _import(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.nombre || !String(input.nombre).trim()) return this._invalid('nombre');
    if (!input.conversation_id) return this._invalid('conversation_id');

    // LEER por referencia: el JSON de carta más reciente en los mensajes del usuario.
    const fuente = await this._localizarFuente(input.project_id, input.conversation_id);
    if (!fuente) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND',
        'no encontré un JSON de carta en los últimos mensajes del usuario',
        { hint: 'pide al usuario que pegue el JSON con productos/categorías' });
    }

    // IDENTIDAD (FASE 3): reusa la carta general del proyecto; si no, id determinista.
    const carta_id = await this._resolverCartaId(input.project_id, input.nombre);

    // PROYECTAR a shape canónico carta-pizzepos (determinista, sin re-emisión del LLM).
    const carta = this._proyectar(fuente, input.nombre, carta_id);
    if (carta.categorias.length === 0 || carta.productos.length === 0) {
      return this._errorResponse(422, 'UPSTREAM_INVALID_RESPONSE',
        'el JSON no tiene productos/categorías detectables',
        { categorias: carta.categorias.length, productos: carta.productos.length });
    }

    // GUARDAR una vez, atómico, VERIFICADO por el response correlado.
    const resp = await this._rpc('carta.save.request', {
      project_id: input.project_id, carta,
      user_id: 'menu-generator', motivo: 'import desde JSON (reflejo)',
      correlation_id: input.correlation_id,
    }, { timeout_ms: 15000 });
    if (!resp) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'carta-manager no responde');
    if (resp.status >= 400) return { status: resp.status, error: resp.error };

    this.metrics?.increment('menu-generator.reflejo.served', { op: 'import' });
    return {
      status: 200,
      data: {
        carta_id, nombre: String(input.nombre).trim(),
        categorias: carta.categorias.length,
        productos: carta.productos.length,
      },
    };
  }

  // ── LEER por referencia: busca en los últimos mensajes de usuario el JSON de carta ──
  async _localizarFuente(project_id, conversation_id) {
    const resp = await this._rpc('db.query.request', {
      project_id, read_only: true,
      query: "SELECT content FROM messages WHERE conversation_id = ? AND role = 'user' ORDER BY created_at DESC LIMIT 12",
      params: [conversation_id],
    }, { timeout_ms: 8000 });
    const rows = (resp && resp.data) || [];
    for (const row of rows) {
      const obj = this._extraerJson(String((row && row.content) || ''));
      if (obj && Array.isArray(obj.productos) && obj.productos.length > 0) return obj;
    }
    return null;
  }

  // Extrae un objeto JSON de texto libre: primero bloque cercado ```json, luego
  // el primer {...} balanceado (consciente de strings, no rompe con llaves dentro de comillas).
  _extraerJson(text) {
    const candidatos = [];
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) candidatos.push(fence[1]);
    const bal = this._primerObjetoBalanceado(text);
    if (bal) candidatos.push(bal);
    for (const c of candidatos) {
      try { const o = JSON.parse(c.trim()); if (o && typeof o === 'object') return o; } catch (_) { /* siguiente */ }
    }
    return null;
  }

  _primerObjetoBalanceado(text) {
    const i = text.indexOf('{');
    if (i < 0) return null;
    let depth = 0, inStr = false, esc = false;
    for (let k = i; k < text.length; k++) {
      const ch = text[k];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) return text.slice(i, k + 1); }
    }
    return null;
  }

  // Resuelve el id de la carta general (en_servicio o única no archivada); si no, determinista.
  async _resolverCartaId(project_id, nombre) {
    const resp = await this._rpc('carta.list.request', { project_id }, { timeout_ms: 8000 });
    const metas = (resp && resp.data) || [];
    const enServicio = metas.find(m => m && m.estado === 'en_servicio');
    if (enServicio) return enServicio.id;
    const activas = metas.filter(m => m && m.estado !== 'archivada');
    if (activas.length === 1) return activas[0].id;
    return 'carta_' + slug(nombre);
  }

  // PROYECCIÓN determinista origen -> carta-pizzepos. MÁXIMA INFORMACIÓN por
  // producto: preserva TODO lo que la fuente trae (ingredientes_base con
  // precio_extra -> variaciones/mitad; estaciones -> cocina; tipo/descripcion/
  // alergenos/etiquetas/disponible/variaciones). Mapea drift (categoria->
  // categoria_id, tipo/grupo->familia). NO inventa: campo ausente = ausente, no fabricado.
  _proyectar(fuente, nombre, carta_id) {
    const catsIn = Array.isArray(fuente.categorias) ? fuente.categorias : [];
    const prodsIn = Array.isArray(fuente.productos) ? fuente.productos : [];

    const categorias = catsIn
      .map((c, i) => {
        const cat = {
          id: slug(c && (c.id || c.nombre)),
          nombre: String((c && (c.nombre || c.id)) || ''),
          orden: (c && typeof c.orden === 'number') ? c.orden : i + 1,
        };
        // estaciones viven en la categoría; el producto las hereda (proyector productos).
        if (c && Array.isArray(c.estaciones) && c.estaciones.length) cat.estaciones = c.estaciones;
        if (c && c.activa !== undefined) cat.activa = !!c.activa;
        return cat;
      })
      .filter(c => c.id);
    const idsCat = new Set(categorias.map(c => c.id));

    const productos = [];
    for (const p of prodsIn) {
      if (!p) continue;
      const catId = slug(p.categoria_id || p.categoria);
      if (!catId || !idsCat.has(catId)) continue;     // sin categoría válida -> se omite (no inventar)
      const nombreP = String(p.nombre || '').trim();
      if (!nombreP) continue;

      // La familia REAL vive en la lista simple (campo 'tipo'); el 'grupo' de
      // ingredientes_base es el grupo del catálogo, NO la familia. Mapa nombre->familia
      // desde la lista simple, para hidratar la base (que no trae familia).
      const famByName = this._mapaFamilias(p.ingredientes);

      const prod = {
        id: catId + '_' + slug(nombreP),               // id determinista CON prefijo de categoría
        nombre: nombreP,
        precio: (typeof p.precio === 'number' && p.precio >= 0)
          ? p.precio
          : (typeof p.precio_base === 'number' && p.precio_base >= 0 ? p.precio_base : 0),
        categoria_id: catId,
        ingredientes: this._normalizarIngredientes(p.ingredientes, famByName),
      };

      // ── máxima info: SOLO lo que la fuente trae (iron rule: no fabricar) ──
      // ingredientes_base (CRÍTICO): lista rica con precio_extra -> variaciones + mitad-mitad.
      const base = this._normalizarIngredientes(p.ingredientes_base, famByName);
      if (base.length) prod.ingredientes_base = base;
      // reglas de variación (quitar/añadir/máx extras).
      const variaciones = this._normalizarVariaciones(p.variaciones);
      if (variaciones) prod.variaciones = variaciones;
      // routing de cocina (si no, se hereda de la categoría en el proyector).
      if (Array.isArray(p.estaciones) && p.estaciones.length) prod.estaciones = p.estaciones;
      if (p.tipo) prod.tipo = String(p.tipo);
      if (p.descripcion) prod.descripcion = String(p.descripcion);
      if (Array.isArray(p.alergenos) && p.alergenos.length) prod.alergenos = p.alergenos;
      if (Array.isArray(p.etiquetas) && p.etiquetas.length) prod.etiquetas = p.etiquetas;
      if (p.disponible !== undefined) prod.disponible = !!p.disponible;

      productos.push(prod);
    }

    return {
      meta: { id: carta_id, nombre: String(nombre).trim(), generado_desde: 'json' },
      categorias,
      productos,
    };
  }

  // Mapa nombre(slug) -> familia, derivado de la lista simple (campo 'tipo'/'familia').
  // Solo entradas con familia resuelta (≠ 'otro'), para hidratar ingredientes_base.
  _mapaFamilias(lista) {
    const m = new Map();
    if (!Array.isArray(lista)) return m;
    for (const i of lista) {
      if (!i || !i.nombre) continue;
      const f = this._familia(i.familia || i.tipo);   // 'grupo' NO es familia
      if (f !== 'otro') m.set(slug(i.nombre), f);
    }
    return m;
  }

  // Normaliza una lista de ingredientes a forma canónica, PRESERVANDO precio_extra
  // (lo necesita variaciones para cobrar extras). La familia sale de familia/tipo
  // (NUNCA de 'grupo'); si no la trae, se hidrata por nombre desde famByName.
  _normalizarIngredientes(lista, famByName) {
    if (!Array.isArray(lista)) return [];
    return lista.filter(i => i && i.nombre).map(i => {
      const key = slug(i.nombre);
      let familia = this._familia(i.familia || i.tipo);
      if (familia === 'otro' && famByName && famByName.has(key)) familia = famByName.get(key);
      const out = { id: i.id || key, nombre: String(i.nombre), familia };
      if (i.emoji) out.emoji = i.emoji;
      if (typeof i.precio_extra === 'number') out.precio_extra = i.precio_extra;
      return out;
    });
  }

  // Reglas de variación canónicas (las lee el módulo variaciones). null si la fuente no trae nada.
  _normalizarVariaciones(v) {
    if (!v || typeof v !== 'object') return null;
    const out = {};
    if (Array.isArray(v.permite_quitar)) out.permite_quitar = v.permite_quitar;
    if (v.permite_anadir !== undefined) out.permite_anadir = !!v.permite_anadir;
    const max = (typeof v.max_ingredientes_extra === 'number') ? v.max_ingredientes_extra
      : (typeof v.max_extras === 'number' ? v.max_extras : undefined);
    if (max !== undefined) out.max_ingredientes_extra = max;
    return Object.keys(out).length ? out : null;
  }

  _familia(v) {
    const x = slug(v);
    if (FAMILIAS.has(x)) return x;
    return FAMILIA_ALIAS[x] || 'otro';
  }
}

module.exports = MenuGeneratorReflejo;
