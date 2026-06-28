/**
 * carta-design — REFLEJO JS (mitad determinista del estudio de diseño de cartas impresas).
 *
 * 4 ops DETERMINISTAS de gestión de archivos (JS de milisegundos, mismo contrato de bus
 * design.<op>.request → la página no se entera):
 *   - contexto_diseno : HIDRATA en UNA RPC { carta (carta-manager), marca (carta-marketing) }.
 *   - load_carta      : trae solo la carta (carta-manager), por la puerta del custodio.
 *   - save            : guarda el HTML del diseño + meta companion; emite carta.html.generada.
 *   - gallery         : lista los diseños/eventos guardados (filtrable por carta_id).
 *
 * La IDENTIDAD del diseño sale de UN solo sitio: la MARCA (carta-marketing) — colores,
 * tipografías, logo, voz. No hay biblioteca de "profiles"/plantillas: el estilo lo siembra
 * la marca. Lo FUZZY —entrevista + composición del HTML— lo hace el LLM de PÁGINA (sin agente).
 *
 * Norma del reflejo (igual que recetas/escandallo): cada op devuelve un objeto FRESCO
 * { status, data }. Nunca se propaga la respuesta upstream verbatim (arrastraría su request_id
 * y rompería la correlación de la response).
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const { ALERGENOS, normalizar: normAlergenos } = require('../../_shared/alergenos');

const DESIGNS_DIR = '/pizzepos/carta-design/designs/';
const nowISO = () => new Date().toISOString();
const tsSafe = () => nowISO().replace(/[:.]/g, '-');

class CartaDesignReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'carta-design';
    this.version = 'reflejo-2.1.0';
  }

  // ── handlers RPC (una línea) ──
  onContextoDisenoRequest(e) { return this._atender(e, 'contexto_diseno', 'design.contexto_diseno.response', d => this._contextoDiseno(d)); }
  onLoadCartaRequest(e) { return this._atender(e, 'load_carta', 'design.load_carta.response', d => this._loadCarta(d)); }
  onSaveRequest(e) { return this._atender(e, 'save', 'design.save.response', d => this._save(d)); }
  onGalleryRequest(e) { return this._atender(e, 'gallery', 'design.gallery.response', d => this._gallery(d)); }
  onValidarRequest(e) { return this._atender(e, 'validar', 'design.validar.response', d => this._validar(d)); }

  // =============================================================
  // helpers de fs — contrato REAL (éxito={...data} sin status; error={error}). Normaliza.
  // =============================================================
  async _read(project_id, p) {
    const r = await this._rpc('fs.read.request', { project_id, path: p });
    if (!r) return { status: 503 };
    if (r.error) return { status: r.error.code === 'RESOURCE_NOT_FOUND' ? 404 : 502, error: r.error };
    if (typeof r.content === 'string') return { status: 200, content: r.content };
    return { status: 404 };
  }
  async _write(project_id, p, content) {
    const r = await this._rpc('fs.write.request', { project_id, path: p, content, encoding: 'utf-8', atomic: true });
    if (!r) return { status: 503 };
    if (r.error) return { status: 502, error: r.error };
    return { status: 200 };
  }
  async _listJson(project_id, dir) {
    const r = await this._rpc('fs.list.request', { project_id, path: dir });
    if (!r) return null;
    if (r.error) return r.error.code === 'RESOURCE_NOT_FOUND' ? [] : null;
    const entries = r.files || r.items || [];
    return entries
      .map(x => (typeof x === 'string' ? x : x && x.name))
      .filter(n => n && n.endsWith('.json') && !n.startsWith('.'));
  }

  // =============================================================
  // ops
  // =============================================================

  // LEER TODO para diseñar, en UNA RPC: la carta (carta-manager) + la marca (carta-marketing).
  // El REFLEJO HIDRATA; el LLM de página TRANSFORMA (compone el HTML). El diseño BEBE la
  // identidad que el onboarding ya capturó (colores/tipografías/logo/voz) en vez de re-preguntarla.
  // Marca best-effort: si carta-marketing no responde, marca:null y la página la rellena/pregunta.
  async _contextoDiseno(input) {
    if (!input.project_id || !input.carta_id) return this._invalid('carta_id');
    const cartaResp = await this._rpc('carta.get.request',
      { project_id: input.project_id, carta_id: input.carta_id, correlation_id: input.correlation_id }, { timeout_ms: 8000 });
    if (!cartaResp) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'carta-manager no responde');
    if (cartaResp.status >= 400) return { status: cartaResp.status, data: cartaResp.data, error: cartaResp.error };
    // marca: por la PUERTA del dueño (carta-marketing.get_perfil), no fs directo a marca.json.
    const marcaResp = await this._rpc('carta-marketing.get_perfil.request',
      { project_id: input.project_id, correlation_id: input.correlation_id }, { timeout_ms: 6000 });
    const marca = (marcaResp && marcaResp.status === 200) ? marcaResp.data : null;
    // Alérgenos (1169/2011): normaliza los códigos de cada producto al canon y adjunta
    // el catálogo (id→nombre→emoji) para que el diseño IMPRESO los declare por su nombre.
    const carta = cartaResp.data || {};
    if (Array.isArray(carta.productos)) {
      carta.productos = carta.productos.map(p => ({ ...p, alergenos: normAlergenos(p.alergenos) }));
    }
    return { status: 200, data: {
      carta,
      marca,              // {esencia, voz, publico, visual:{colores,tipografias,estilo,logo}, negocio} | null
      alergenos_catalogo: ALERGENOS   // los 14 del Anexo II (id, nombre, emoji) para declarar por nombre
    } };
  }

  // LEER: solo la carta a diseñar, por la PUERTA de carta-manager (RPC, no fs directo).
  async _loadCarta(input) {
    if (!input.project_id || !input.carta_id) return this._invalid('carta_id');
    const r = await this._rpc('carta.get.request',
      { project_id: input.project_id, carta_id: input.carta_id, correlation_id: input.correlation_id }, { timeout_ms: 8000 });
    if (!r) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'carta-manager no responde');
    return { status: r.status, data: r.data, error: r.error };   // objeto FRESCO (sin el request_id de carta.get)
  }

  // ── EL FRENO (skill blueprint-agentico). Un diseño de carta no se valida con un
  //    JSON Schema (es HTML freeform): su contrato es REPRESENTAR la carta. _checkDiseno
  //    compara el HTML contra la carta REAL (carta.get, la fuente) — no contra lo que el
  //    LLM afirme — y exige: (1) HTML no trivial, (2) COMPLETITUD/FIDELIDAD: cada producto
  //    de la carta aparece en el diseño, (3) ALÉRGENOS: si hay productos con alérgenos, el
  //    diseño los declara (Reg. UE 1169/2011). Mata el diseño que se deja productos fuera
  //    y lo canta como hecho. Léxico a propósito (substring): captura la omisión real. ──
  async _checkDiseno(project_id, carta_id, html) {
    const cartaResp = await this._rpc('carta.get.request', { project_id, carta_id }, { timeout_ms: 8000 });
    if (!cartaResp) return { upstream: true };
    if (cartaResp.status >= 400) return { notFound: true, status: cartaResp.status };
    const carta = cartaResp.data || {};
    const productos = Array.isArray(carta.productos) ? carta.productos : [];
    const h = String(html || '');
    const hLower = h.toLowerCase();
    const errors = [];
    if (h.trim().length < 200) {
      errors.push({ code: 'HTML_TRIVIAL', message: 'el HTML es demasiado corto para ser una carta' });
    }
    const faltan = productos
      .filter(p => p && p.nombre && !hLower.includes(String(p.nombre).toLowerCase()))
      .map(p => p.nombre);
    if (faltan.length) {
      errors.push({ code: 'PRODUCTOS_FALTAN', message: `${faltan.length}/${productos.length} productos del menú no aparecen en el diseño`, faltan: faltan.slice(0, 20) });
    }
    const conAlerg = productos.some(p => Array.isArray(p.alergenos) && p.alergenos.length > 0);
    if (conAlerg) {
      const declara = /al[eé]rgen/.test(hLower)
        || ALERGENOS.some(a => hLower.includes(String(a.nombre).toLowerCase()) || (a.emoji && h.includes(a.emoji)));
      if (!declara) errors.push({ code: 'ALERGENOS_SIN_DECLARAR', message: 'hay productos con alérgenos y el diseño no los declara (Reg. UE 1169/2011)' });
    }
    return { ok: errors.length === 0, errors, productos_total: productos.length, faltan };
  }

  async _validar(input) {
    if (!input.project_id || !input.carta_id) return this._invalid('carta_id');
    if (!input.html || typeof input.html !== 'string') return this._invalid('html');
    const c = await this._checkDiseno(input.project_id, input.carta_id, input.html);
    if (c.upstream) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'carta-manager no responde (no se pudo validar)');
    if (c.notFound) return this._errorResponse(c.status, 'RESOURCE_NOT_FOUND', 'carta no encontrada', { entity_type: 'carta', entity_ref: input.carta_id });
    this.metrics?.increment('carta-design.reflejo.served', { op: 'validar', veredicto: c.ok ? 'valido' : 'invalido' });
    return { status: 200, data: { valid: c.ok, errors: c.errors, productos_total: c.productos_total, productos_faltan: c.faltan.length } };
  }

  // GUARDAR: el HTML que el LLM de página diseñó + meta companion. Emite carta.html.generada.
  async _save(input) {
    if (!input.project_id || !input.carta_id) return this._invalid('carta_id');
    if (!input.html || typeof input.html !== 'string') return this._invalid('html');

    // FRENO inquebrantable: el diseño se guarda cuando REPRESENTA la carta, no por confianza.
    // save RE-VALIDA contra la carta real; si faltan productos o alérgenos → NO se persiste.
    const chk = await this._checkDiseno(input.project_id, input.carta_id, input.html);
    if (chk.upstream) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'carta-manager no responde (no se pudo validar antes de guardar)');
    if (chk.notFound) return this._errorResponse(chk.status, 'RESOURCE_NOT_FOUND', 'carta no encontrada', { entity_type: 'carta', entity_ref: input.carta_id });
    if (!chk.ok) return this._errorResponse(422, 'UPSTREAM_INVALID_RESPONSE', 'el diseño no representa la carta (faltan productos o alérgenos) — NO guardado', { errors: chk.errors });

    const filename = input.carta_id + '__' + tsSafe() + '.html';
    const pathHtml = DESIGNS_DIR + filename;
    const pathMeta = DESIGNS_DIR + filename.replace(/\.html$/, '.json');

    const w1 = await this._write(input.project_id, pathHtml, input.html);
    if (w1.status >= 400) return w1;
    const meta = {
      carta_id: input.carta_id, nombre: input.nombre || null,
      formato: input.formato || null,   // p.ej. 'A4 apaisado · doble cara · 3 col' — estructura, no estilo
      generado_at: nowISO(), generado_por: input.generado_por || 'unknown',
      filename, size_bytes: input.html.length
    };
    const w2 = await this._write(input.project_id, pathMeta, JSON.stringify(meta, null, 2));
    if (w2.status >= 400) return w2;

    this.eventBus.publish('carta.html.generada', {
      project_id: input.project_id, carta_id: input.carta_id, filename,
      correlation_id: input.correlation_id || crypto.randomUUID(), timestamp: nowISO()
    });
    return { status: 201, data: meta };
  }

  // Lista los diseños/eventos guardados (la galería: HTML generados + su meta).
  async _gallery(input) {
    if (!input.project_id) return this._invalid('project_id');
    const files = await this._listJson(input.project_id, DESIGNS_DIR);
    if (files === null) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'fs no responde');
    const galeria = [];
    for (const f of files) {
      const raw = await this._read(input.project_id, DESIGNS_DIR + f);
      if (raw.status !== 200) continue;
      let meta; try { meta = JSON.parse(raw.content); } catch (_) { continue; }
      if (input.carta_id && meta.carta_id !== input.carta_id) continue;
      galeria.push(meta);
    }
    galeria.sort((a, b) => String(b.generado_at || '').localeCompare(String(a.generado_at || '')));
    return { status: 200, data: galeria };
  }
}

module.exports = CartaDesignReflejo;
