/**
 * carta-design — REFLEJO JS (mitad determinista del estudio de diseño de cartas impresas).
 *
 * Las 6 ops son GESTIÓN DE ARCHIVOS (deterministas): cargar la carta a diseñar, guardar el
 * HTML del diseño, y CRUD de la biblioteca de profiles (estilos). Antes las ejecutaba el
 * turno LLM (blueprint puro); ahora JS de milisegundos. Mismo contrato de bus
 * (design.<op>.request) → la página no se entera.
 *
 * Lo FUZZY —la entrevista + el diseño creativo del HTML— se queda en el LLM de PÁGINA
 * (NO un agente: el "equipo creativo" R0-R8 del context.json está APARCADO). El LLM diseña
 * y llama a este reflejo para load_carta (LEER) y save (GUARDAR).
 *
 * Lee el contrato REAL de filesystem (éxito={...data} sin status / error={error}); normaliza
 * en _read/_write/_edit/_listJson. Los built-in profiles se leen LOCAL (ficheros del módulo).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const DESIGNS_DIR = '/pizzepos/carta-design/designs/';
const PROFILES_DIR = '/pizzepos/carta-design/profiles/';
const BUILT_IN_NAMES = ['elegant-minimal', 'modern-bold', 'rock-bold', 'rustic-italian', 'seasonal-fresh'];
const BUILT_IN_DIR = path.join(__dirname, 'design-profiles');
const nowISO = () => new Date().toISOString();
const tsSafe = () => nowISO().replace(/[:.]/g, '-');
const slug = (s) => String(s || '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

class CartaDesignReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'carta-design';
    this.version = 'reflejo-1.1.0';
  }

  // ── handlers RPC (una línea) ──
  onContextoDisenoRequest(e) { return this._atender(e, 'contexto_diseno', 'design.contexto_diseno.response', d => this._contextoDiseno(d)); }
  onLoadCartaRequest(e) { return this._atender(e, 'load_carta', 'design.load_carta.response', d => this._loadCarta(d)); }
  onSaveRequest(e) { return this._atender(e, 'save', 'design.save.response', d => this._save(d)); }
  onProfilesRequest(e) { return this._atender(e, 'profiles', 'design.profiles.response', d => this._profiles(d)); }
  onSaveProfileRequest(e) { return this._atender(e, 'save_profile', 'design.save_profile.response', d => this._saveProfile(d)); }
  onDeleteProfileRequest(e) { return this._atender(e, 'delete_profile', 'design.delete_profile.response', d => this._deleteProfile(d)); }
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
  async _edit(project_id, p, patches) {
    const r = await this._rpc('fs.edit.request', { project_id, path: p, patches });
    if (!r) return { status: 503 };
    if (r.error) return { status: r.error.code === 'RESOURCE_NOT_FOUND' ? 404 : 502, error: r.error };
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

  // Built-in profiles: ficheros del PROPIO módulo (no son data de proyecto) → lectura local.
  _readBuiltIn() {
    const out = [];
    for (const n of BUILT_IN_NAMES) {
      try {
        const p = JSON.parse(fs.readFileSync(path.join(BUILT_IN_DIR, n + '.json'), 'utf-8'));
        p.tipo = 'built-in';
        out.push(p);
      } catch (_) { /* si falta uno, lo omite */ }
    }
    return out;
  }

  // =============================================================
  // ops
  // =============================================================

  // LEER TODO para diseñar, en UNA RPC: la carta (carta-manager) + la marca (carta-marketing)
  // + los profiles. El REFLEJO HIDRATA; el LLM de página TRANSFORMA (compone el HTML). Mata la
  // redundancia: el diseño BEBE la identidad que el onboarding ya capturó (colores/logo/voz),
  // no la re-pregunta. La marca es best-effort: si carta-marketing no responde, se diseña igual
  // (marca:null) apoyándose solo en los profiles.
  async _contextoDiseno(input) {
    if (!input.project_id || !input.carta_id) return this._invalid('carta_id');
    const cartaResp = await this._rpc('carta.get.request',
      { project_id: input.project_id, carta_id: input.carta_id, correlation_id: input.correlation_id }, { timeout_ms: 8000 });
    if (!cartaResp) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'carta-manager no responde');
    if (cartaResp.status >= 400) return cartaResp;   // propaga 404 carta inexistente, etc.
    // marca: por la PUERTA del dueño (carta-marketing.get_perfil), no fs directo a marca.json.
    const marcaResp = await this._rpc('carta-marketing.get_perfil.request',
      { project_id: input.project_id, correlation_id: input.correlation_id }, { timeout_ms: 6000 });
    const marca = (marcaResp && marcaResp.status === 200) ? marcaResp.data : null;
    const profilesResp = await this._profiles({ project_id: input.project_id });
    return { status: 200, data: {
      carta: cartaResp.data,
      marca,                                       // {esencia, voz, publico, visual:{colores,tipografias,estilo,logo}, negocio} | null
      profiles: (profilesResp && profilesResp.data) || []
    } };
  }

  // LEER: la carta a diseñar, por la PUERTA de carta-manager (RPC, no fs directo).
  async _loadCarta(input) {
    if (!input.project_id || !input.carta_id) return this._invalid('carta_id');
    const r = await this._rpc('carta.get.request',
      { project_id: input.project_id, carta_id: input.carta_id, correlation_id: input.correlation_id }, { timeout_ms: 8000 });
    if (!r) return this._errorResponse(503, 'UPSTREAM_UNREACHABLE', 'carta-manager no responde');
    return r;   // propaga {status, data|error} de carta-manager tal cual
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
      carta_id: input.carta_id, profile_id: input.profile_id || null,
      generado_at: nowISO(), generado_por: input.generado_por || 'unknown',
      filename, size_bytes: input.html.length
    };
    const w2 = await this._write(input.project_id, pathMeta, JSON.stringify(meta, null, 2));
    if (w2.status >= 400) return w2;

    this.eventBus.publish('carta.html.generada', {
      project_id: input.project_id, carta_id: input.carta_id, filename, profile_id: input.profile_id || null,
      correlation_id: input.correlation_id || crypto.randomUUID(), timestamp: nowISO()
    });
    return { status: 201, data: meta };
  }

  // Lista profiles: built-in (locales) + custom (proyecto, soft-deleted fuera).
  async _profiles(input) {
    if (!input.project_id) return this._invalid('project_id');
    const builtIn = this._readBuiltIn();
    const custom = [];
    const files = await this._listJson(input.project_id, PROFILES_DIR);
    if (files) {
      for (const f of files) {
        const raw = await this._read(input.project_id, PROFILES_DIR + f);
        if (raw.status !== 200) continue;
        let p; try { p = JSON.parse(raw.content); } catch (_) { continue; }
        if (p.activo === false) continue;   // soft-deleted: fuera
        p.tipo = 'custom';
        custom.push(p);
      }
    }
    return { status: 200, data: [...builtIn, ...custom] };
  }

  async _saveProfile(input) {
    if (!input.project_id || !input.nombre) return this._invalid('nombre');
    const id = slug(input.nombre);
    if (!id) return this._invalid('nombre');
    if (BUILT_IN_NAMES.includes(id)) return this._errorResponse(409, 'CONFLICT_STATE', 'id colisiona con built-in protegido', { id });
    const profile = {
      id, nombre: String(input.nombre).trim(), descripcion: input.descripcion || '', tipo: 'custom',
      tipografia: input.tipografia || {}, colores: input.colores || {}, estructura: input.estructura || {},
      activo: true, created_at: nowISO(), updated_at: nowISO()   // activo:true → el soft-delete (replace /activo) funciona
    };
    const w = await this._write(input.project_id, PROFILES_DIR + id + '.json', JSON.stringify(profile, null, 2));
    if (w.status >= 400) return w;
    return { status: 201, data: profile };
  }

  async _deleteProfile(input) {
    if (!input.project_id || !input.profile_id) return this._invalid('profile_id');
    if (BUILT_IN_NAMES.includes(input.profile_id)) return this._errorResponse(403, 'PERMISSION_DENIED', 'built-in protegido', { id: input.profile_id });
    const raw = await this._read(input.project_id, PROFILES_DIR + input.profile_id + '.json');
    if (raw.status === 404) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'profile no existe', { entity_type: 'profile', id: input.profile_id });
    if (raw.status >= 400) return raw;
    // soft-delete: marca activo:false + deleted_at (fs.edit RFC 6902, no recompone el fichero)
    const ed = await this._edit(input.project_id, PROFILES_DIR + input.profile_id + '.json', [
      { op: 'test', path: '/id', value: input.profile_id },
      { op: 'replace', path: '/activo', value: false },
      { op: 'add', path: '/deleted_at', value: nowISO() }
    ]);
    if (ed.status >= 400) return ed;
    return { status: 200, data: { profile_id: input.profile_id, activo: false } };
  }

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
