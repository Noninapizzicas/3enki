'use strict';

/**
 * publicador — publica HTML arbitrario en el namespace público /<ns>/<dir>/<proyecto>.
 *
 * REPARTO (blueprint-coherente): el LLM de página (skill 'publicar-html') decide el `dir`
 * y da el HTML (fuzzy); este REFLEJO hace lo DETERMINISTA — escribe el HTML en el storage
 * del proyecto y crea el symlink a la superficie que Caddy sirve. Cero cambios de Caddy: el
 * bloque /<ns>/* ya sirve cualquier subcarpeta de /opt/enki/public/<ns>/.
 *
 * Esquema de URL (pedido): /<ns>/<dir>/<proyecto>/  (ns fijo del VPS; dir = el nombre que
 * eliges al publicar; proyecto = el slug). p.ej. https://dominio/a/catalogo/regalos/.
 *
 * DATA en el storage del proyecto (se respalda/borra con él); el público es solo un symlink
 * — misma frontera que la tienda (infra = terreno, app = symlink).
 */

const path = require('path');
const fs = require('fs');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

let publicNsLib;
try { publicNsLib = require('../../lib/public-ns.js'); }
catch (_) { publicNsLib = { publicNs: () => 'a' }; }

const SLUG_DIR = /^[a-z0-9][a-z0-9_-]{0,63}$/i;         // superficie
const SLUG_FILE = /^[a-z0-9][a-z0-9_.-]{0,63}$/i;      // fichero opcional

class PublicadorModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'publicador';
    this.version = '0.1.0';
    // CARA (UUID · slug · nombre del directorio) → { id, name, slug, base_path }.
    // Indexar por TODAS las caras es la doctrina del filesystem: así da igual cómo lo
    // llame el caller (el chat manda el slug, el frontend el UUID).
    this.activos = new Map();
    this.ultimoActivo = null;          // retrocompat: a quién ir si no se dice objetivo
    this._hidrataRequestId = null;     // id de la petición de hidratación en curso
    this.freno = true;                 // verificador-visual best-effort
  }

  async onLoad(context) {
    await super.onLoad(context);
    const cfg = (context && context.moduleConfig) || {};
    this.freno = cfg.freno_render !== false;
    // Nace con TODAS las caras. Sin esto el mapa arranca VACÍO (tras un hot-reload no
    // llega ningún project.activated) y un id objetivo caería al activo en silencio.
    this._hidratarCarriles();
  }

  // ── IDENTIDAD DE CARRIL (doctrina del filesystem) ──────────────────────────
  _carasDe(project_id, name, base_path) {
    const caras = [project_id];
    if (name) caras.push(this._slugify(name));
    if (base_path) { try { caras.push(path.basename(base_path)); } catch (_) {} }
    return caras.filter((c, i) => c && caras.indexOf(c) === i);
  }
  _indexarCarril(project_id, name, base_path) {
    if (!project_id) return null;
    const entrada = {
      id: project_id,                                   // el UUID canónico (para los RPC)
      name: name || '',
      slug: name ? this._slugify(name) : String(project_id).slice(0, 8),
      base_path: base_path || null
    };
    for (const cara of this._carasDe(project_id, name, base_path)) this.activos.set(cara, entrada);
    return entrada;
  }
  _hidratarCarriles() {
    if (!this.eventBus || !this.eventBus.publish) return;
    const request_id = `publicador-hidrata-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this._hidrataRequestId = request_id;
    try { this.eventBus.publish('project.list.request', { request_id }); } catch (_) {}
  }
  onProjectListResponse(event) {
    const data = (event && (event.data || event.payload)) || event || {};
    if (!data || data.request_id !== this._hidrataRequestId) return;   // respuestas ajenas
    const proyectos = Array.isArray(data.projects) ? data.projects : [];
    for (const p of proyectos) {
      if (!p || !p.id) continue;
      // El proyecto sistema no tiene carril de proyecto: se salta.
      if (p.metadata && p.metadata.is_system === true) continue;
      this._indexarCarril(p.id, p.name, p.base_path);
    }
    this.logger?.info?.('publicador.carriles.hidratados', { caras: this.activos.size, proyectos: proyectos.length });
  }

  async onUnload() { this.activos.clear(); await super.onUnload(); }

  _slugify(name) {
    return String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63) || 'proyecto';
  }

  onProjectActivated(event) {
    const d = (event && event.data) || event || {};
    if (!d.project_id) return;
    this._indexarCarril(d.project_id, d.name, d.base_path);
    this.ultimoActivo = d.project_id;
  }

  onProjectDeactivated(event) {
    const d = (event && event.data) || event || {};
    if (!d.project_id) return;
    const e = this.activos.get(d.project_id);
    for (const cara of this._carasDe(d.project_id, e && e.name, e && e.base_path)) {
      if (this.activos.get(cara) === e) this.activos.delete(cara);   // no pisar a otro
    }
    if (this.ultimoActivo === d.project_id) this.ultimoActivo = null;
  }

  onPublicarRequest(event) { return this._atender(event, 'publicar', 'publicar.html.response', d => this._publicar(d)); }

  async _publicar({ project_id, dir, html, nombre } = {}) {
    if (!dir || typeof dir !== 'string' || !SLUG_DIR.test(dir)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'dir inválido (slug: a-z0-9 _-)', { field: 'dir' });
    }
    if (!html || typeof html !== 'string') return this._invalid('html');

    // ¿A QUÉ PROYECTO VA? — doctrina del filesystem: el project_id de la PETICIÓN manda
    // sobre el activo global, y vale UUID **o** slug (el nombre del directorio). Antes esto
    // escribía SIEMPRE en el activo y rechazaba el slug con 412, aunque el proyecto fuera
    // conocido y su carpeta existiera.
    // Solo se frena un id DESCONOCIDO que además no sea el activo: ahí sí el destino sería
    // otro proyecto, y fallar claro es mejor que escribir en el sitio equivocado.
    const conocido = !!project_id && this.activos.has(project_id);
    if (project_id && !conocido && this.ultimoActivo && project_id !== this.ultimoActivo) {
      const nomActivo = (this.activos.get(this.ultimoActivo) || {}).name || this.ultimoActivo;
      return this._errorResponse(412, 'PRECONDITION_FAILED',
        `el id «${project_id}» no es un proyecto conocido (el activo es «${nomActivo}»). Usa el UUID o el slug del objetivo.`);
    }
    const objetivoId = conocido ? project_id : this.ultimoActivo;
    if (!objetivoId) return this._errorResponse(409, 'CONFLICT_STATE', 'no hay proyecto activo; actívalo antes de publicar');
    const act = this.activos.get(objetivoId);
    if (!act || !act.base_path) return this._errorResponse(409, 'CONFLICT_STATE', 'proyecto objetivo sin base_path conocido');
    const { slug, base_path } = act;
    const destinoId = act.id || objetivoId;      // el UUID canónico, para los RPC

    // Caddy sirve case-sensitive y su try_files busca 'index.html' en MINÚSCULA: el índice
    // servible SIEMPRE en minúscula. Normalizamos el nombre (SLUG_FILE lleva flag /i → dejaría
    // pasar 'Index'); si no, el fichero existe pero /<ns>/<slug>/<dir>/ da 404 (visto en vivo).
    const archivo = ((nombre && SLUG_FILE.test(nombre))
      ? (nombre.endsWith('.html') ? nombre : `${nombre}.html`)
      : 'index.html').toLowerCase();

    // FRENO best-effort (verificador-visual): no publica un HTML que renderiza roto. Solo
    // bloquea si el órgano MIRÓ de verdad (verificado && !ok); sin navegador → se publica.
    if (this.freno) {
      try {
        const v = await this._rpc('render.verificar.request', { html, etiqueta: `publicar:${dir}/${slug}` }, { timeout_ms: 12000 });
        const data = (v && v.data) || v;
        if (data && data.verificado === true && data.ok === false) {
          return this._errorResponse(422, 'UPSTREAM_INVALID_RESPONSE', 'el HTML renderiza roto', { motivos: data.motivos });
        }
      } catch (_) { /* sin órgano/navegador → se publica igual */ }
    }

    // 1. asegurar la feature `www` (crea storage/www + symlink /opt/enki/public/<ns>/<slug>
    //    → storage/www). Idempotente; el ÚNICO dueño del symlink es project-manager. Así el
    //    árbol de www/ se espeja tal cual en /<ns>/<slug>/… (ver blueprints/project-types/www.json).
    try {
      await this._rpc('project.ensure-feature.request', { id: destinoId, features: ['www'] }, { timeout_ms: 12000 });
    } catch (_) { /* best-effort: si ya está activa, el symlink existe y seguimos */ }

    // 2. escribir en el ÁRBOL www del proyecto, bajo el subdir <dir> (para no pisar la home/
    //    carta que vive en la RAÍZ del www). El árbol se espeja 1:1 en /<ns>/<slug>/<dir>/…
    const wwwDir = path.join(base_path, 'storage', 'www', dir);
    try {
      await fs.promises.mkdir(wwwDir, { recursive: true });
      await fs.promises.writeFile(path.join(wwwDir, archivo), html, 'utf-8');
    } catch (err) {
      return this._errorResponse(500, 'UNKNOWN_ERROR', `no se pudo escribir el HTML: ${err.message}`);
    }

    const ns = publicNsLib.publicNs();
    const url_path = `/${ns}/${slug}/${dir}/` + (archivo === 'index.html' ? '' : archivo);
    try {
      this.eventBus.publish('publicador.publicado', { project_id: destinoId, dir, slug, archivo, url_path, timestamp: new Date().toISOString() });
      this.metrics?.increment('publicador.publicado.total');
    } catch (_) { /* best-effort */ }

    return { status: 200, data: { publicado: true, project_id: destinoId, slug, dir, archivo, url_path } };
  }
}

module.exports = PublicadorModule;
