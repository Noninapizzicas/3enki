/**
 * carta-design v4.0.0 — Estudio de diseño profesional de cartas impresas (POC2 rewrite).
 *
 * Sistema multi-rol cuya inteligencia vive en prompt.json (10 roles, 4 fases).
 * Este modulo provee 6 tools al LLM y persiste resultados:
 *
 *   design.load_carta     → carga datos + estadisticas de carta
 *   design.save           → escribe HTML+CSS y emite carta.html.generada
 *   design.profiles       → lista builtin + custom
 *   design.save_profile   → persiste perfil custom
 *   design.delete_profile → borra custom (rechaza builtin)
 *   design.gallery        → lista diseños previos por carta_id
 *
 * Cada tool tambien expone ui_handler bajo dominio "design" (mqttRequest cross-modulo).
 *
 * Subscribes preservados: project.activated, project.deactivated, carta.actualizada.
 * Publish preservado: carta.html.generada (ahora con correlation_id + project_id + timestamp).
 */

'use strict';

const path   = require('path');
const fs     = require('fs').promises;
const crypto = require('crypto');

const BaseModule = require('../../_shared/base-module');
const DEFAULT_PROJECT_ID = 'default';

class CartaDesignModule extends BaseModule {
  constructor() {
    super();
    this.name    = 'carta-design';
    this.version = '4.0.0';
    this.projectPaths    = new Map();
    this.builtinProfiles = new Map();
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger   = context.logger;
    this.metrics  = context.metrics;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    await this._loadBuiltinProfiles();

    this.logger.info('module.loaded', {
      module:           this.name,
      version:          this.version,
      builtin_profiles: this.builtinProfiles.size
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });
    this.projectPaths.clear();
    this.builtinProfiles.clear();
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Bus handlers (subscribes)
  // ==========================================

  async onProjectActivated(event) {
    const data = this._unwrap(event);
    const { project_id, base_path, metadata } = data || {};

    if (!project_id) {
      this._logError('carta-design.project.activated.invalid', { missing: 'project_id' }, 'project_activated', 'INVALID_INPUT');
      return;
    }

    const resolvedBase = (metadata?.is_system === true) ? process.cwd() : base_path;
    if (resolvedBase) {
      this.projectPaths.set(project_id, {
        featurePath: path.join(resolvedBase, 'storage', 'pizzepos'),
        storagePath: path.join(resolvedBase, 'storage')
      });
    }
    this.logger.info('carta-design.project.activated', { project_id, has_base: !!resolvedBase });
  }

  async onProjectDeactivated(event) {
    const data = this._unwrap(event);
    const { project_id } = data || {};
    if (project_id && this.projectPaths.has(project_id)) {
      this.projectPaths.delete(project_id);
      this.logger.info('carta-design.project.deactivated', { project_id });
    }
  }

  // Rename canonico vs monolito (handler antes era onCartaGenerada — mismatch documentado).
  async onCartaActualizada(event) {
    const data = this._unwrap(event);
    this.logger.info('carta-design.carta.updated', {
      project_id: data?.project_id,
      carta_id:   data?.meta?.id || data?.carta_id
    });
  }

  // ==========================================
  // Tool: design.load_carta
  // ==========================================

  async toolLoadCarta(args) {
    try {
      const { carta_id, project_id } = args || {};
      if (!carta_id) {
        this._logError('carta-design.load_carta.validation_failed', { missing: 'carta_id' }, 'tool_load_carta', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'carta_id es requerido', { field: 'carta_id' });
      }

      const carta = await this._loadCarta(carta_id, project_id);
      if (!carta) {
        this._logError('carta-design.load_carta.not_found', { carta_id, project_id }, 'tool_load_carta', 'RESOURCE_NOT_FOUND');
        return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Carta "${carta_id}" no encontrada`, {
          entity_type: 'carta', entity_id: carta_id
        });
      }

      const categorias = (carta.categorias || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0));
      const productos  = carta.productos || [];

      const catStats = categorias.map(cat => {
        const prods   = productos.filter(p => p.categoria === cat.id);
        const precios = prods.map(p => p.precio).filter(p => typeof p === 'number' && p > 0);
        return {
          id:              cat.id,
          nombre:          cat.nombre,
          productos_count: prods.length,
          precio_min:      precios.length > 0 ? Math.min(...precios) : 0,
          precio_max:      precios.length > 0 ? Math.max(...precios) : 0
        };
      });

      const todosPrecios = productos.map(p => p.precio).filter(p => typeof p === 'number' && p > 0);

      this.metrics?.increment('design.load_carta.total', { project_id: project_id || DEFAULT_PROJECT_ID });

      return {
        status: 200,
        data: {
          carta_id:  carta.meta?.id || carta_id,
          nombre:    carta.meta?.nombre || 'Carta',
          categorias,
          productos,
          resumen: {
            total_productos:   productos.length,
            total_categorias:  categorias.length,
            categorias_stats:  catStats,
            precio_min:        todosPrecios.length > 0 ? Math.min(...todosPrecios) : 0,
            precio_max:        todosPrecios.length > 0 ? Math.max(...todosPrecios) : 0
          }
        }
      };
    } catch (err) {
      return this._handleHandlerError('carta-design.load_carta.failed', err, 'tool_load_carta');
    }
  }

  // ==========================================
  // Tool: design.save
  // ==========================================

  async toolSave(args) {
    try {
      const { carta_id, html, nombre, project_id } = args || {};
      if (!carta_id) {
        this._logError('carta-design.save.validation_failed', { missing: 'carta_id' }, 'tool_save', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'carta_id es requerido', { field: 'carta_id' });
      }
      if (!html || html.length < 100) {
        this._logError('carta-design.save.validation_failed', { missing: 'html' }, 'tool_save', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'html completo es requerido (minimo 100 caracteres)', { field: 'html' });
      }

      const dir = this._outputDir(project_id) || this._defaultOutputDir();
      await fs.mkdir(dir, { recursive: true });

      const ts       = Date.now().toString(36);
      const slug     = (nombre || 'design').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
      const filename = `${carta_id}_${slug}_${ts}.html`;
      const absPath  = path.join(dir, filename);

      await this._atomicWriteFile(absPath, html);

      const meta = {
        carta_id,
        nombre:     nombre || 'Diseño sin nombre',
        filename,
        size_bytes: Buffer.byteLength(html, 'utf-8'),
        created_at: new Date().toISOString()
      };
      await this._atomicWriteFile(absPath + '.meta.json', JSON.stringify(meta, null, 2));

      const paths        = this._getPaths(project_id);
      const storagePath  = paths?.storagePath || path.join(process.cwd(), 'storage');
      const relativePath = '/' + path.relative(storagePath, absPath).replace(/\\/g, '/');

      this.metrics?.increment('design.save.total', { project_id: project_id || DEFAULT_PROJECT_ID });
      this.logger.info('carta-design.save.ok', { carta_id, filename, size: meta.size_bytes });

      await this._publicarEvento('carta.html.generada', {
        carta_id,
        html,
        title:    nombre || `Diseño ${carta_id}`,
        filename
      }, args);

      return {
        status: 200,
        data: {
          carta_id, filename,
          path:       relativePath,
          size_bytes: meta.size_bytes,
          user_hint:  'Diseño guardado y abierto en preview. Usa Imprimir para exportar a PDF.'
        }
      };
    } catch (err) {
      return this._handleHandlerError('carta-design.save.failed', err, 'tool_save');
    }
  }

  // ==========================================
  // Tool: design.profiles
  // ==========================================

  async toolProfiles(args) {
    try {
      const { project_id } = args || {};
      const builtin = Array.from(this.builtinProfiles.values());
      const custom  = await this._listProjectProfiles(project_id);
      this.metrics?.increment('design.profiles.total', { project_id: project_id || DEFAULT_PROJECT_ID });
      return {
        status: 200,
        data: { builtin, custom, total: builtin.length + custom.length }
      };
    } catch (err) {
      return this._handleHandlerError('carta-design.profiles.failed', err, 'tool_profiles');
    }
  }

  // ==========================================
  // Tool: design.save_profile
  // ==========================================

  async toolSaveProfile(args) {
    try {
      const a = args || {};
      if (!a.nombre) {
        this._logError('carta-design.save_profile.validation_failed', { missing: 'nombre' }, 'tool_save_profile', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'nombre es requerido', { field: 'nombre' });
      }

      const id = 'custom_' + a.nombre.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

      const profile = {
        id,
        nombre:        a.nombre,
        description:   a.description   || '',
        color_palette: a.color_palette || {},
        fonts:         a.fonts         || {},
        layout_type:   a.layout_type   || 'auto',
        style_notes:   a.style_notes   || '',
        builtin:       false,
        created_at:    new Date().toISOString()
      };

      const dir = this._profilesDir(a.project_id) || this._defaultProfilesDir();
      await fs.mkdir(dir, { recursive: true });
      await this._atomicWriteFile(path.join(dir, `${id}.json`), JSON.stringify(profile, null, 2));

      this.metrics?.increment('design.save_profile.total', { project_id: a.project_id || DEFAULT_PROJECT_ID });
      this.logger.info('carta-design.save_profile.ok', { id, nombre: a.nombre });

      return { status: 201, data: { ...profile, user_hint: `Perfil "${a.nombre}" guardado.` } };
    } catch (err) {
      return this._handleHandlerError('carta-design.save_profile.failed', err, 'tool_save_profile');
    }
  }

  // ==========================================
  // Tool: design.delete_profile
  // ==========================================

  async toolDeleteProfile(args) {
    try {
      const { profile_id, project_id } = args || {};
      if (!profile_id) {
        this._logError('carta-design.delete_profile.validation_failed', { missing: 'profile_id' }, 'tool_delete_profile', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'profile_id es requerido', { field: 'profile_id' });
      }
      if (this.builtinProfiles.has(profile_id)) {
        this._logError('carta-design.delete_profile.builtin_protected', { profile_id }, 'tool_delete_profile', 'PERMISSION_DENIED');
        return this._errorResponse(403, 'PERMISSION_DENIED', `Perfil "${profile_id}" es built-in y no se puede eliminar`, {
          entity_type: 'profile', entity_id: profile_id, builtin: true
        });
      }

      const dir = this._profilesDir(project_id) || this._defaultProfilesDir();
      try {
        await fs.unlink(path.join(dir, `${profile_id}.json`));
      } catch (err) {
        if (err.code === 'ENOENT') {
          this._logError('carta-design.delete_profile.not_found', { profile_id }, 'tool_delete_profile', 'RESOURCE_NOT_FOUND');
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Perfil "${profile_id}" no encontrado`, {
            entity_type: 'profile', entity_id: profile_id
          });
        }
        throw err;
      }

      this.metrics?.increment('design.delete_profile.total', { project_id: project_id || DEFAULT_PROJECT_ID });
      this.logger.info('carta-design.delete_profile.ok', { profile_id });
      return { status: 200, data: { profile_id, user_hint: 'Perfil eliminado.' } };
    } catch (err) {
      return this._handleHandlerError('carta-design.delete_profile.failed', err, 'tool_delete_profile');
    }
  }

  // ==========================================
  // Tool: design.gallery
  // ==========================================

  async toolGallery(args) {
    try {
      const { carta_id, project_id } = args || {};
      if (!carta_id) {
        this._logError('carta-design.gallery.validation_failed', { missing: 'carta_id' }, 'tool_gallery', 'INVALID_INPUT');
        return this._errorResponse(400, 'INVALID_INPUT', 'carta_id es requerido', { field: 'carta_id' });
      }

      const dir = this._outputDir(project_id) || this._defaultOutputDir();
      const designs = [];

      let files = [];
      try {
        files = await fs.readdir(dir);
      } catch (err) {
        if (err.code !== 'ENOENT') {
          this.logger.warn('carta-design.gallery.readdir_error', { dir, error: err.message });
          this.metrics?.increment('carta-design.errors', { kind: 'gallery_readdir', code: 'UNKNOWN_ERROR' });
        }
      }

      const metaFiles = files.filter(f => f.startsWith(carta_id + '_') && f.endsWith('.meta.json'));
      for (const file of metaFiles) {
        const meta = await this._readJsonSafe(path.join(dir, file), 'gallery_meta');
        if (meta) designs.push(meta);
      }
      designs.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

      this.metrics?.increment('design.gallery.total', { project_id: project_id || DEFAULT_PROJECT_ID });
      return { status: 200, data: { carta_id, designs, total: designs.length } };
    } catch (err) {
      return this._handleHandlerError('carta-design.gallery.failed', err, 'tool_gallery');
    }
  }

  // ==========================================
  // UI handlers (mqttRequest cross-modulo) — delegan a los tools
  // ==========================================

  async handleLoadCarta(data)     { return this.toolLoadCarta(data); }
  async handleSave(data)          { return this.toolSave(data); }
  async handleProfiles(data)      { return this.toolProfiles(data); }
  async handleSaveProfile(data)   { return this.toolSaveProfile(data); }
  async handleDeleteProfile(data) { return this.toolDeleteProfile(data); }
  async handleGallery(data)       { return this.toolGallery(data); }

  // ==========================================
  // Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details && typeof details === 'object') error.details = details;
    return { status, error };
  }

  _handleHandlerError(logEvent, err, kind) {
    const code   = err._code || this._classifyHandlerError(err);
    const status = code === 'INVALID_INPUT'           ? 400 :
                   code === 'RESOURCE_NOT_FOUND'      ? 404 :
                   code === 'PERMISSION_DENIED'       ? 403 :
                   code === 'AUTHENTICATION_REQUIRED' ? 401 :
                   code === 'ALREADY_EXISTS'          ? 409 :
                   code === 'CONFLICT_STATE'          ? 409 :
                   code === 'UNKNOWN_ERROR'        ? 500 :
                   code === 'UPSTREAM_INVALID_RESPONSE'     ? 502 :
                   code === 'UPSTREAM_UNREACHABLE'  ? 503 : 500;
    const message = err.message || String(err);
    this.logger.error(logEvent, { error: message, code, kind });
    this.metrics?.increment('carta-design.errors', { kind, code });
    return this._errorResponse(status, code, message, err._details);
  }

  _classifyHandlerError(err) {
    const msg  = (err?.message || '').toLowerCase();
    const ecod = err?.code || '';
    if (ecod === 'ENOENT' || msg.includes('not found') || msg.includes('no encontrado')) return 'RESOURCE_NOT_FOUND';
    if (ecod === 'EACCES' || msg.includes('permission') || msg.includes('forbidden'))    return 'PERMISSION_DENIED';
    if (ecod === 'EEXIST' || msg.includes('already exists'))                             return 'ALREADY_EXISTS';
    if (msg.includes('required') || msg.includes('invalid') || msg.includes('validation')) return 'INVALID_INPUT';
    if (ecod && ecod.startsWith('E'))                                                     return 'UNKNOWN_ERROR';
    return 'UNKNOWN_ERROR';
  }

  async _publicarEvento(name, payload, sourcePayload = null) {
    const enriched = {
      correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
      project_id:     sourcePayload?.project_id || payload?.project_id || DEFAULT_PROJECT_ID,
      timestamp:      new Date().toISOString(),
      ...payload
    };
    await this.eventBus.publish(name, enriched);
  }

  // 5o helper auxiliar: escritura atomica via .tmp + rename
  async _atomicWriteFile(absPath, contents) {
    const tmpPath = absPath + '.tmp';
    await fs.writeFile(tmpPath, contents, 'utf-8');
    await fs.rename(tmpPath, absPath);
  }

  // 6o helper auxiliar: lectura JSON con log + metric en error (no swallow silencioso)
  async _readJsonSafe(filePath, kind) {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('carta-design.read_error', { file: filePath, kind, error: err.message });
        this.metrics?.increment('carta-design.errors', { kind: kind || 'read_json', code: this._classifyHandlerError(err) });
      }
      return null;
    }
  }

  // ==========================================
  // Internals — paths + builtin profiles + carta loader
  // ==========================================

  _unwrap(event) {
    return event?.data || event?.payload || event || {};
  }

  _logError(logEvent, fields, kind, code) {
    this.logger.error(logEvent, { ...fields, code, kind });
    this.metrics?.increment('carta-design.errors', { kind, code });
  }

  _getPaths(projectId) { return this.projectPaths.get(projectId); }

  _cartasDir(projectId) {
    const p = this._getPaths(projectId);
    return p ? path.join(p.featurePath, 'cartas') : null;
  }

  _outputDir(projectId) {
    const p = this._getPaths(projectId);
    return p ? path.join(p.featurePath, 'carta-design', 'designs') : null;
  }

  _profilesDir(projectId) {
    const p = this._getPaths(projectId);
    return p ? path.join(p.featurePath, 'carta-design', 'profiles') : null;
  }

  _defaultCartasDir()   { return path.join(process.cwd(), 'storage', 'pizzepos', 'cartas'); }
  _defaultOutputDir()   { return path.join(process.cwd(), 'storage', 'pizzepos', 'carta-design', 'designs'); }
  _defaultProfilesDir() { return path.join(process.cwd(), 'storage', 'pizzepos', 'carta-design', 'profiles'); }

  async _loadBuiltinProfiles() {
    const dir = path.join(__dirname, 'design-profiles');
    let files = [];
    try {
      files = await fs.readdir(dir);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('carta-design.builtin_profiles.readdir_error', { dir, error: err.message });
        this.metrics?.increment('carta-design.errors', { kind: 'builtin_profiles_readdir', code: 'UNKNOWN_ERROR' });
      }
      this.logger.info('carta-design.profiles.loaded', { count: 0 });
      return;
    }

    for (const file of files.filter(f => f.endsWith('.json'))) {
      const profile = await this._readJsonSafe(path.join(dir, file), 'builtin_profile');
      if (profile?.id) {
        profile.builtin = true;
        this.builtinProfiles.set(profile.id, profile);
      }
    }
    this.logger.info('carta-design.profiles.loaded', { count: this.builtinProfiles.size });
  }

  async _loadCarta(cartaId, projectId) {
    const dir = this._cartasDir(projectId);
    if (dir) {
      const carta = await this._readJsonSafe(path.join(dir, `${cartaId}.json`), 'carta_active_project');
      if (carta) return carta;
    }
    for (const [pid, paths] of this.projectPaths) {
      if (pid === projectId) continue;
      const carta = await this._readJsonSafe(path.join(paths.featurePath, 'cartas', `${cartaId}.json`), 'carta_other_project');
      if (carta) return carta;
    }
    return await this._readJsonSafe(path.join(this._defaultCartasDir(), `${cartaId}.json`), 'carta_default');
  }

  async _listProjectProfiles(projectId) {
    const dir = this._profilesDir(projectId) || this._defaultProfilesDir();
    let files = [];
    try {
      files = await fs.readdir(dir);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('carta-design.profiles_custom.readdir_error', { dir, error: err.message });
        this.metrics?.increment('carta-design.errors', { kind: 'profiles_custom_readdir', code: 'UNKNOWN_ERROR' });
      }
      return [];
    }

    const profiles = [];
    for (const file of files.filter(f => f.endsWith('.json'))) {
      const profile = await this._readJsonSafe(path.join(dir, file), 'custom_profile');
      if (profile) profiles.push(profile);
    }
    return profiles;
  }
}

module.exports = CartaDesignModule;
