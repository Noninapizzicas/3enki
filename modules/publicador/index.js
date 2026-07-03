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
    this.activos = new Map();          // project_id → { slug, base_path }
    this.ultimoActivo = null;          // el fs escribe en el último activado
    this.freno = true;                 // verificador-visual best-effort
  }

  async onLoad(context) {
    await super.onLoad(context);
    const cfg = (context && context.moduleConfig) || {};
    this.freno = cfg.freno_render !== false;
  }

  async onUnload() { this.activos.clear(); await super.onUnload(); }

  _slugify(name) {
    return String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63) || 'proyecto';
  }

  onProjectActivated(event) {
    const d = (event && event.data) || event || {};
    if (!d.project_id) return;
    const slug = d.name ? this._slugify(d.name) : String(d.project_id).slice(0, 8);
    this.activos.set(d.project_id, { slug, base_path: d.base_path || null });
    this.ultimoActivo = d.project_id;
  }

  onProjectDeactivated(event) {
    const d = (event && event.data) || event || {};
    if (!d.project_id) return;
    this.activos.delete(d.project_id);
    if (this.ultimoActivo === d.project_id) this.ultimoActivo = null;
  }

  onPublicarRequest(event) { return this._atender(event, 'publicar', 'publicar.html.response', d => this._publicar(d)); }

  async _publicar({ project_id, dir, html, nombre } = {}) {
    if (!dir || typeof dir !== 'string' || !SLUG_DIR.test(dir)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'dir inválido (slug: a-z0-9 _-)', { field: 'dir' });
    }
    if (!html || typeof html !== 'string') return this._invalid('html');

    // El fs y el symlink cuelgan del proyecto ACTIVO (el filesystem escribe en el último
    // activado). No publicar a ciegas en otro proyecto (no_silent_failures).
    const activeId = this.ultimoActivo;
    if (!activeId) return this._errorResponse(409, 'CONFLICT_STATE', 'no hay proyecto activo; actívalo antes de publicar');
    if (project_id && project_id !== activeId) {
      return this._errorResponse(412, 'PRECONDITION_FAILED', `el activo es ${activeId}, no ${project_id}; activa el objetivo antes de publicar`);
    }
    const act = this.activos.get(activeId);
    if (!act || !act.base_path) return this._errorResponse(409, 'CONFLICT_STATE', 'proyecto activo sin base_path conocido');
    const { slug, base_path } = act;

    const archivo = (nombre && SLUG_FILE.test(nombre))
      ? (nombre.endsWith('.html') ? nombre : `${nombre}.html`)
      : 'index.html';

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
      await this._rpc('project.ensure-feature.request', { id: activeId, features: ['www'] }, { timeout_ms: 12000 });
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
      this.eventBus.publish('publicador.publicado', { project_id: activeId, dir, slug, archivo, url_path, timestamp: new Date().toISOString() });
      this.metrics?.increment('publicador.publicado.total');
    } catch (_) { /* best-effort */ }

    return { status: 200, data: { publicado: true, project_id: activeId, slug, dir, archivo, url_path } };
  }
}

module.exports = PublicadorModule;
