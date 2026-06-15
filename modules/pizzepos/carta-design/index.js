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
    this.version = 'reflejo-2.0.0';
  }

  // ── handlers RPC (una línea) ──
  onContextoDisenoRequest(e) { return this._atender(e, 'contexto_diseno', 'design.contexto_diseno.response', d => this._contextoDiseno(d)); }
  onLoadCartaRequest(e) { return this._atender(e, 'load_carta', 'design.load_carta.response', d => this._loadCarta(d)); }
  onSaveRequest(e) { return this._atender(e, 'save', 'design.save.response', d => this._save(d)); }
  onGalleryRequest(e) { return this._atender(e, 'gallery', 'design.gallery.response', d => this._gallery(d)); }

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

  // GUARDAR: el HTML que el LLM de página diseñó + meta companion. Emite carta.html.generada.
  async _save(input) {
    if (!input.project_id || !input.carta_id) return this._invalid('carta_id');
    if (!input.html || typeof input.html !== 'string') return this._invalid('html');
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
