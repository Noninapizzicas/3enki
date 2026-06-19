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

  // PROYECCIÓN determinista origen -> carta-pizzepos. Mapea drift de campos
  // (categoria->categoria_id, tipo/grupo->familia). NO inventa: omite lo inválido.
  _proyectar(fuente, nombre, carta_id) {
    const catsIn = Array.isArray(fuente.categorias) ? fuente.categorias : [];
    const prodsIn = Array.isArray(fuente.productos) ? fuente.productos : [];

    const categorias = catsIn
      .map((c, i) => ({
        id: slug(c && (c.id || c.nombre)),
        nombre: String((c && (c.nombre || c.id)) || ''),
        orden: (c && typeof c.orden === 'number') ? c.orden : i + 1,
      }))
      .filter(c => c.id);
    const idsCat = new Set(categorias.map(c => c.id));

    const productos = [];
    for (const p of prodsIn) {
      if (!p) continue;
      const catId = slug(p.categoria_id || p.categoria);
      if (!catId || !idsCat.has(catId)) continue;     // sin categoría válida -> se omite (no inventar)
      const nombreP = String(p.nombre || '').trim();
      if (!nombreP) continue;
      productos.push({
        id: catId + '_' + slug(nombreP),               // id determinista CON prefijo de categoría
        nombre: nombreP,
        precio: (typeof p.precio === 'number' && p.precio >= 0) ? p.precio : 0,
        categoria_id: catId,
        descripcion: String(p.descripcion || ''),
        disponible: p.disponible !== undefined ? !!p.disponible : true,
        ingredientes: this._normalizarIngredientes(p.ingredientes),
      });
    }

    return {
      meta: { id: carta_id, nombre: String(nombre).trim(), generado_desde: 'json' },
      categorias,
      productos,
    };
  }

  _normalizarIngredientes(lista) {
    if (!Array.isArray(lista)) return [];
    return lista.filter(i => i && i.nombre).map(i => {
      const out = {
        id: i.id || slug(i.nombre),
        nombre: String(i.nombre),
        familia: this._familia(i.familia || i.tipo || i.grupo),
      };
      if (i.emoji) out.emoji = i.emoji;
      return out;
    });
  }

  _familia(v) {
    const x = slug(v);
    if (FAMILIAS.has(x)) return x;
    return FAMILIA_ALIAS[x] || 'otro';
  }
}

module.exports = MenuGeneratorReflejo;
