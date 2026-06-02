/**
 * filesystem v2.0.0 — Reescrito al canon (POC2 #12 del horizontal).
 *
 * Operaciones de filesystem para todo el sistema: UI (mqttRequest), AI
 * (tools), otros modulos (eventBus). Acceso scopeado por proyecto activo
 * con security check sobre el path resuelto.
 *
 * 14 ui_handlers (list/read/write/delete/mkdir/move/copy/search/info/cleanup/
 *   stats/setWorkDir/getWorkDir/append).
 * 14 tools del LLM (mismas operaciones, shape canonico { status, data }).
 * 14 bus handlers (fs.*.request → fs.*.response correlacionado por
 *   request_id + correlation_id propagado).
 * 3 spanish bus handlers (archivo.{listar,leer,borrar}.solicitado).
 * 2 lifecycle handlers (project.activated / project.deactivated) cambian el
 *   working directory al storage del proyecto activo (system project => root).
 *
 * Path security:
 *   - "/path" o relativo  → resuelve desde working directory.
 *   - "@/" prefix         → bypass project context, accede al data root.
 *   - "~"/"~/x"           → alias de project storage root (= "/").
 *   - systemMode (Sistema) → permite acceso al cwd completo.
 *   - Cualquier path resuelto fuera de allowedRoot → PERMISSION_DENIED.
 *
 * Cumple los 24 contratos transversales:
 *  - errors: handlers UI/tools/bus devuelven { status, data | error: { code, message, details? } }.
 *    Cierra los 24 drift_error_como_string_suelto + 9 respuesta_no_canonica.
 *    Codes canonicos: INVALID_INPUT, RESOURCE_NOT_FOUND,
 *    PERMISSION_DENIED (path traversal), CONFLICT, UNKNOWN_ERROR.
 *  - observability: log + metric en cada error path. Prefix filesystem.*.
 *    Cierra los 23 error_sin_metric + 22 error_sin_log + 14 silent_io_failure.
 *    correlation_id propagado en todos los publishes y responses.
 *  - events: 5 publishes de dominio (fs.file.created/updated/deleted,
 *    fs.directory.created, fs.workdir.changed) + 14 fs.*.response del
 *    request/response pattern.
 *  - lifecycle: onLoad inicializa basePath; onUnload cleanup.
 *  - persistence: filesystem real per-project (storage/ subdir).
 *
 * 5 helpers POC2 transferibles:
 *  _errorResponse, _handleHandlerError, _classifyHandlerError,
 *  _publicarEvento, + auxiliar _validatePath (alias de validatePath, mantiene
 *  validatePath publica para retrocompatibilidad con quien la haya usado).
 *
 * Monolito (1289 LOC) preservado en
 * arquitectura/migracion/_legacy/filesystem-monolito-pre-rewrite.js.bak
 *
 * Mapa exhaustivo (PASO 0 del rewrite) en
 * arquitectura/migracion/notas/filesystem-mapa.md
 */

'use strict';

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const BaseModule = require('../_shared/base-module');
const TEXT_EXTS = ['.txt', '.md', '.json', '.js', '.ts', '.html', '.css', '.yaml', '.yml', '.xml', '.csv', '.log'];
const BINARY_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.tar', '.gz'];
const MAX_READ_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_SEARCH_RESULTS = 100;

class FilesystemModule extends BaseModule {
  constructor() {
    super();
    this.name = 'filesystem';
    this.version = '2.0.0';
    this.basePath = path.join(process.cwd(), 'data');
    this.uiHandler = null;

    this.activeProjectId = null;
    this.activeProjectPath = null;
    this.workingDirectory = null;
    this.systemMode = false;

    // TP4 — cache de manifests de modulos persistentes. Indexado por module.name.
    // Cada entry: { scope: 'project'|'system', data_path: '<namespace>' }. Lo carga
    // _loadModuleManifests al onLoad escaneando modules/**/module.json. validatePath
    // lo usa para componer paths con scope=system contra data/_system/<data_path>/.
    // Sin sourceModule en el evento, fallback al comportamiento scope=project.
    // Cierra storage-layout.contract.json TP4 (capa 2 de la composicion canonica).
    this._moduleManifests = new Map();
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.logger    = context.logger;
    this.metrics   = context.metrics;
    this.eventBus  = context.eventBus;
    this.uiHandler = context.uiHandler;

    this.logger.info('filesystem.loading', {
      module: this.name, version: this.version, basePath: this.basePath
    });

    await this._ensureDataDirectory();
    this._loadModuleManifests();

    this.logger.info('filesystem.loaded', {
      basePath: this.basePath,
      manifests_loaded: this._moduleManifests.size
    });
  }

  // TP4 — escanea modules/**/module.json y cachea los que declaran
  // config.persistence.{scope, data_path}. Sincrono porque es boot one-shot
  // y la cantidad de modules es baja (~70). Tolerante a errores: un module.json
  // malformado no rompe el load — se loguea warn y se sigue.
  _loadModuleManifests() {
    const syncFs = require('fs');
    const modulesDir = path.join(process.cwd(), 'modules');
    if (!syncFs.existsSync(modulesDir)) return;
    const tryRegister = (mjPath) => {
      try {
        const m = JSON.parse(syncFs.readFileSync(mjPath, 'utf8'));
        const p = m.config?.persistence;
        if (m.name && p && p.scope && p.data_path) {
          this._moduleManifests.set(m.name, { scope: p.scope, data_path: p.data_path });
        }
      } catch (err) {
        this.logger?.warn('filesystem.manifest.parse.failed', { path: mjPath, error: err.message });
      }
    };
    for (const name of syncFs.readdirSync(modulesDir)) {
      if (name.startsWith('.') || name === 'node_modules' || name === '_archived' || name === '_legacy') continue;
      const lvl1 = path.join(modulesDir, name);
      try {
        if (!syncFs.statSync(lvl1).isDirectory()) continue;
        const mj1 = path.join(lvl1, 'module.json');
        if (syncFs.existsSync(mj1)) { tryRegister(mj1); continue; }
        // Nivel 2: vertical/modulo (ej: modules/conversacion/ai-gateway/, modules/pizzepos/carta-manager/)
        for (const child of syncFs.readdirSync(lvl1)) {
          if (child.startsWith('.') || child === 'node_modules' || child === '_archived' || child === '_legacy') continue;
          const childDir = path.join(lvl1, child);
          try {
            if (!syncFs.statSync(childDir).isDirectory()) continue;
            const mj2 = path.join(childDir, 'module.json');
            if (syncFs.existsSync(mj2)) tryRegister(mj2);
          } catch (_) {}
        }
      } catch (_) {}
    }
  }

  async onUnload() {
    this.logger.info('filesystem.unloading');
    this.activeProjectId = null;
    this.activeProjectPath = null;
    this.workingDirectory = null;
    this.systemMode = false;
  }

  async _ensureDataDirectory() {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
    } catch (err) {
      this.logger.error('filesystem.ensureDataDirectory.failed', { error: err.message });
      this.metrics?.increment('filesystem.errors', { kind: 'ensure_data_dir' });
    }
  }

  // ==========================================
  // Project context
  // ==========================================

  async onProjectActivated(event) {
    const data = event.data || event;
    const { project_id, base_path, name, metadata } = data;

    this.activeProjectId = project_id;

    if (metadata?.is_system === true) {
      this.systemMode = true;
      this.activeProjectPath = process.cwd();
      this.workingDirectory = process.cwd();
      this.logger.info('filesystem.project.activated.system_mode', {
        project_id, project_name: name, system_root: process.cwd()
      });
      return;
    }

    this.systemMode = false;
    if (base_path) {
      this.activeProjectPath = path.join(base_path, 'storage');
    } else {
      this.activeProjectPath = path.join(this.basePath, 'projects', project_id);
      this.logger.warn('filesystem.project.no_base_path', {
        project_id, fallback_path: this.activeProjectPath
      });
    }

    this.workingDirectory = this.activeProjectPath;
    try {
      await fs.mkdir(this.activeProjectPath, { recursive: true });
    } catch (err) {
      this.logger.warn('filesystem.project.mkdir_failed', {
        project_id, path: this.activeProjectPath, error: err.message
      });
      this.metrics?.increment('filesystem.errors', { kind: 'project_mkdir' });
    }

    this.logger.info('filesystem.project.activated', {
      project_id, project_name: name,
      active_project_path: this.activeProjectPath,
      working_directory: this.workingDirectory
    });
  }

  async onProjectDeactivated() {
    const previousProject = this.activeProjectId;
    this.activeProjectId = null;
    this.activeProjectPath = null;
    this.workingDirectory = null;
    this.systemMode = false;
    this.logger.info('filesystem.project.deactivated', { previous_project: previousProject });
  }

  // ==========================================
  // Bus handlers (fs.*.request → fs.*.response)
  // Patron: invoca handle*, propaga shape canonico al response.
  // ==========================================

  async onWriteRequest(event)  { return this._busDispatch(event, 'write',  'fs.write.response',  ['path', 'content', 'encoding', 'expected_hash']); }
  async onEditRequest(event)   { return this._busDispatch(event, 'edit',   'fs.edit.response',   ['path', 'patches', 'expected_hash']); }
  async onReadRequest(event)   { return this._busDispatch(event, 'read',   'fs.read.response',   ['path']); }
  async onDeleteRequest(event) { return this._busDispatch(event, 'delete', 'fs.delete.response', ['path']); }
  async onListRequest(event)   { return this._busDispatch(event, 'list',   'fs.list.response',   ['path']); }
  async onMkdirRequest(event)  { return this._busDispatch(event, 'mkdir',  'fs.mkdir.response',  ['path']); }
  async onInfoRequest(event)   { return this._busDispatch(event, 'info',   'fs.info.response',   ['path']); }
  async onSearchRequest(event) { return this._busDispatch(event, 'search', 'fs.search.response', ['query', 'path', 'content']); }
  async onStatsRequest(event)  { return this._busDispatch(event, 'stats',  'fs.stats.response',  ['path']); }

  async onCopyRequest(event) {
    const data = event?.data || event?.payload || event;
    const fromPath = data.from || data.source;
    const toPath   = data.to   || data.destination;
    return this._busDispatchWithData(event, 'copy', 'fs.copy.response', { from: fromPath, to: toPath });
  }

  async onMoveRequest(event) {
    const data = event?.data || event?.payload || event;
    const fromPath = data.from || data.source;
    const toPath   = data.to   || data.destination;
    const responseEvent = event?.event?.includes('rename') ? 'fs.rename.response' : 'fs.move.response';
    return this._busDispatchWithData(event, 'move', responseEvent, { from: fromPath, to: toPath });
  }

  async onAppendRequest(event) {
    const data = event?.data || event?.payload || event;
    return this._busDispatchWithData(event, 'append', 'fs.append.response',
      { path: data.path, content: data.content, encoding: data.encoding });
  }

  async onExistsRequest(event) {
    const data = event?.data || event?.payload || event;
    const { request_id, correlation_id, path: p } = data;
    const cid = correlation_id || crypto.randomUUID();
    try {
      const safePath = this.validatePath(p, { sourceModule: data?._source_module ?? args?._source_module });
      const stats = await fs.stat(safePath);
      await this._publicarEvento('fs.exists.response', {
        request_id, exists: true, path: p,
        type: stats.isDirectory() ? 'directory' : 'file'
      }, { correlation_id: cid });
    } catch (err) {
      if (err.code === 'ENOENT') {
        await this._publicarEvento('fs.exists.response', {
          request_id, exists: false, path: p
        }, { correlation_id: cid });
      } else {
        this.logger.error('filesystem.exists.failed', {
          path: p, error: err.message, correlation_id: cid
        });
        this.metrics?.increment('filesystem.errors', { kind: 'bus_exists', code: err._code || 'UNKNOWN_ERROR' });
        await this._publicarEvento('fs.exists.response', {
          request_id,
          error: { code: err._code || 'UNKNOWN_ERROR', message: err.message }
        }, { correlation_id: cid });
      }
    }
  }

  // Spanish bus handlers (archivo.*.solicitado → archivo.*ado / archivo.*.fallido)
  async onArchivoListarSolicitado(event) {
    const data = event.data || event.payload || event;
    const { path: p = '/', project_id, request_id, correlation_id } = data;
    const cid = correlation_id || crypto.randomUUID();
    try {
      const result = await this.handleList({ path: p });
      if (result.status && result.status >= 400) {
        await this._publicarEvento('archivo.listar.fallido', {
          request_id, project_id, path: p, error: result.error
        }, { correlation_id: cid });
        return;
      }
      await this._publicarEvento('archivo.listado', {
        request_id, project_id, path: p,
        files: result.data?.files || []
      }, { correlation_id: cid });
    } catch (err) {
      this.metrics?.increment('filesystem.errors', { kind: 'archivo_listar' });
      await this._publicarEvento('archivo.listar.fallido', {
        request_id, project_id, path: p,
        error: { code: 'UNKNOWN_ERROR', message: err.message }
      }, { correlation_id: cid });
    }
  }

  async onArchivoLeerSolicitado(event) {
    const data = event.data || event.payload || event;
    const { path: p, project_id, request_id, correlation_id } = data;
    const cid = correlation_id || crypto.randomUUID();
    try {
      const result = await this.handleRead({ path: p });
      if (result.status && result.status >= 400) {
        await this._publicarEvento('archivo.leer.fallido', {
          request_id, project_id, path: p, error: result.error
        }, { correlation_id: cid });
        return;
      }
      await this._publicarEvento('archivo.leido', {
        request_id, project_id, path: p,
        content: result.data?.content
      }, { correlation_id: cid });
    } catch (err) {
      this.metrics?.increment('filesystem.errors', { kind: 'archivo_leer' });
      await this._publicarEvento('archivo.leer.fallido', {
        request_id, project_id, path: p,
        error: { code: 'UNKNOWN_ERROR', message: err.message }
      }, { correlation_id: cid });
    }
  }

  async onArchivoBorrarSolicitado(event) {
    const data = event.data || event.payload || event;
    const { path: p, project_id, request_id, correlation_id } = data;
    const cid = correlation_id || crypto.randomUUID();
    try {
      const result = await this.handleDelete({ path: p });
      if (result.status && result.status >= 400) {
        await this._publicarEvento('archivo.borrar.fallido', {
          request_id, project_id, path: p, error: result.error
        }, { correlation_id: cid });
        return;
      }
      await this._publicarEvento('archivo.borrado', {
        request_id, project_id, path: p
      }, { correlation_id: cid });
    } catch (err) {
      this.metrics?.increment('filesystem.errors', { kind: 'archivo_borrar' });
      await this._publicarEvento('archivo.borrar.fallido', {
        request_id, project_id, path: p,
        error: { code: 'UNKNOWN_ERROR', message: err.message }
      }, { correlation_id: cid });
    }
  }

  // Despachadores genericos del bus pattern
  async _busDispatch(event, op, responseEvent, fields) {
    const data = event?.data || event?.payload || event;
    const args = {};
    for (const f of fields) args[f] = data[f];
    // TP4 — propagar identidad del emisor para que validatePath pueda resolver
    // scope=system. Si event.source.module esta y matchea un manifest cacheado,
    // validatePath usa data_path + scope declarados. Si no, fallback project.
    args._source_module = event?.source?.module;
    return this._busDispatchWithData(event, op, responseEvent, args);
  }

  async _busDispatchWithData(event, op, responseEvent, args) {
    const data = event?.data || event?.payload || event;
    const { request_id, correlation_id } = data;
    const cid = correlation_id || crypto.randomUUID();
    const handler = `handle${op[0].toUpperCase()}${op.slice(1)}`;
    try {
      const result = await this[handler](args);
      if (result.status && result.status >= 400) {
        await this._publicarEvento(responseEvent, {
          request_id, error: result.error
        }, { correlation_id: cid });
      } else {
        await this._publicarEvento(responseEvent, {
          request_id, ...(result.data || {})
        }, { correlation_id: cid });
      }
    } catch (err) {
      this.logger.error(`filesystem.bus.${op}.failed`, {
        error: err.message, code: err._code || 'UNKNOWN_ERROR', correlation_id: cid
      });
      this.metrics?.increment('filesystem.errors', { kind: `bus_${op}` });
      await this._publicarEvento(responseEvent, {
        request_id,
        error: { code: err._code || 'UNKNOWN_ERROR', message: err.message }
      }, { correlation_id: cid });
    }
  }

  // ==========================================
  // Path security (preserva validatePath publica para compat)
  // ==========================================

  validatePath(userPath, options = {}) {
    const inputPath = userPath || '/';
    let resolved;

    // Defensa contra paths absolutos del sistema. Antes de esta defensa, un caller
    // que construia path = base_path + '/archivo.json' (ej: '/opt/enki/data/projects/p1/recetas.json')
    // hacia que validatePath strip-eara el '/' inicial y resolviera el resto como
    // sub-path del activeProjectPath — produciendo paths duplicados tipo
    // /opt/enki/data/projects/p1/opt/enki/data/projects/p1/recetas.json.
    // Bug observado en la auditoria del piloto blueprint (2026-05-18).
    // Convencion canonica: paths con leading-slash son relativos al base_path
    // del proyecto. Si el caller pasa un path absoluto del sistema, es bug.
    const SYSTEM_PATH_PREFIXES = ['/opt/', '/home/', '/var/', '/usr/', '/etc/', '/tmp/', '/root/', '/srv/', '/mnt/', '/dev/', '/proc/', '/sys/'];
    if (SYSTEM_PATH_PREFIXES.some(p => inputPath === p.slice(0, -1) || inputPath.startsWith(p))) {
      const error = new Error(`Absolute system path rejected: '${inputPath}'. Use a project-relative path like '/recetas.json' — filesystem resuelve internamente con el project_id del payload.`);
      error._code = 'INVALID_INPUT';
      error._details = { kind: 'absolute_system_path', requested: inputPath };
      throw error;
    }

    // Defensa contra prefijos internos sinteticos. Bug observado en audit 2026-06-02
    // del flujo carta-manager: una carta termino en <proj>/storage/storage/pizzepos/
    // porque el caller paso path='/storage/pizzepos/cartas/X.json' y filesystem
    // (que ya tiene activeProjectPath terminado en 'storage/') concateno un segundo
    // 'storage/'. /storage/, /projects/, /data/ los compone filesystem desde
    // base_path internamente — pasarlos en el path duplica. Canonizado en
    // storage-layout.contract.json (P6, P7). Convencion: el path en fs.*.request
    // es relativo a storage/ del proyecto activo, empieza con el data_path del
    // modulo emisor (ej: 'pizzepos/cartas/X.json' para carta-manager).
    const RESERVED_INTERNAL_PREFIXES = ['/storage/', '/projects/', '/data/'];
    if (RESERVED_INTERNAL_PREFIXES.some(p => inputPath === p.slice(0, -1) || inputPath.startsWith(p))) {
      const error = new Error(`Path con prefijo reservado: '${inputPath}'. Los prefijos /storage/, /projects/, /data/ los compone filesystem desde base_path del proyecto activo. Pasa el path relativo al data_path declarado en module.json del modulo emisor (ej: 'pizzepos/cartas/<id>.json' o '<modulo>/<archivo>'). Ver storage-layout.contract.json.`);
      error._code = 'INVALID_INPUT';
      error._details = { kind: 'reserved_internal_prefix', requested: inputPath };
      throw error;
    }

    // TP4 — capa 2: composicion por scope declarado del modulo emisor.
    // Si el caller pasa sourceModule y ese modulo declara scope=system en su
    // module.json (cacheado en _moduleManifests al onLoad), resolvemos contra
    // data/_system/<data_path>/ en lugar de contra activeProjectPath. Esto
    // separa formalmente datos system-wide (credential-manager, ai-gateway,
    // system-coherence-analyzer) de datos por proyecto. Si sourceModule no
    // esta declarado, o no esta en el cache, comportamiento actual (capa 1).
    const sourceModule = options.sourceModule;
    if (sourceModule && this._moduleManifests.has(sourceModule)) {
      const manifest = this._moduleManifests.get(sourceModule);
      if (manifest.scope === 'system') {
        const systemRoot = path.join(this.basePath, '_system', manifest.data_path);
        const normalized = path.normalize(inputPath.replace(/^\/+/, ''));
        resolved = path.resolve(systemRoot, normalized);
        if (!resolved.startsWith(systemRoot)) {
          const error = new Error(`Access denied: path outside system scope of module '${sourceModule}'`);
          error._code = 'PERMISSION_DENIED';
          error._details = { kind: 'path_traversal_system_scope', requested: inputPath, root: systemRoot };
          throw error;
        }
        return resolved;
      }
    }

    if (inputPath.startsWith('@/') || inputPath === '@') {
      const relativePart = inputPath === '@' ? '' : inputPath.slice(2);
      const normalized = path.normalize(relativePart).replace(/^\/+/, '');
      resolved = path.resolve(this.basePath, normalized);
    } else if (this.activeProjectPath) {
      if (inputPath.startsWith('/')) {
        const normalized = path.normalize(inputPath).replace(/^\/+/, '');
        resolved = path.resolve(this.activeProjectPath, normalized);
      } else if (inputPath === '~' || inputPath.startsWith('~/')) {
        const relativePart = inputPath === '~' ? '' : inputPath.slice(2);
        resolved = path.resolve(this.activeProjectPath, relativePart);
      } else {
        const workDir = this.workingDirectory || this.basePath;
        resolved = path.resolve(workDir, inputPath);
      }
    } else {
      if (inputPath.startsWith('/')) {
        const normalized = path.normalize(inputPath).replace(/^\/+/, '');
        resolved = path.resolve(this.basePath, normalized);
      } else {
        resolved = path.resolve(this.basePath, inputPath);
      }
    }

    const allowedRoot = this.systemMode ? process.cwd() : this.basePath;
    if (!resolved.startsWith(allowedRoot)) {
      const error = new Error(`Access denied: path outside ${this.systemMode ? 'system' : 'data'} directory`);
      error._code = 'PERMISSION_DENIED';
      error._details = { kind: 'path_traversal', requested: inputPath, root: allowedRoot };
      throw error;
    }

    return resolved;
  }

  toRelativePath(absolutePath) {
    if (this.systemMode && absolutePath.startsWith(process.cwd())) {
      const relativePath = path.relative(process.cwd(), absolutePath).replace(/\\/g, '/');
      return '/' + relativePath;
    }
    if (this.activeProjectPath && absolutePath.startsWith(this.activeProjectPath)) {
      const relativePath = path.relative(this.activeProjectPath, absolutePath).replace(/\\/g, '/');
      return '/' + relativePath;
    }
    const relativePath = path.relative(this.basePath, absolutePath).replace(/\\/g, '/');
    return this.activeProjectPath ? '@/' + relativePath : '/' + relativePath;
  }

  // ==========================================
  // UI / Tool handlers (shape canonico)
  // ==========================================

  async handleList(data) {
    try {
      const dirPath = data?.path || '/';
      const safePath = this.validatePath(dirPath, { sourceModule: data?._source_module ?? args?._source_module });

      let stats;
      try { stats = await fs.stat(safePath); }
      catch (e) {
        if (e.code === 'ENOENT') {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Directory not found',
            { entity_type: 'directory', entity_id: dirPath });
        }
        throw e;
      }
      if (!stats.isDirectory()) {
        return this._errorResponse(400, 'INVALID_INPUT', 'Path is not a directory',
          { kind: 'domain', field: 'path', expected: 'directory', got: 'file' });
      }

      const entries = await fs.readdir(safePath, { withFileTypes: true });
      const items = await Promise.all(entries.map(async (entry) => {
        const fullPath = path.join(safePath, entry.name);
        try {
          const s = await fs.stat(fullPath);
          const ext = entry.isDirectory() ? null : path.extname(entry.name).toLowerCase();
          return {
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: s.size, modified: s.mtime,
            path: path.join(dirPath, entry.name).replace(/\\/g, '/'),
            extension: ext
          };
        } catch { return null; }
      }));

      const validItems = items.filter(it => it !== null);
      validItems.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      this.metrics?.increment('filesystem.list.success');
      return {
        status: 200,
        data: {
          path: dirPath,
          files: validItems,
          items: validItems,
          count: validItems.length,
          root_mode: !data?.project_id
        }
      };
    } catch (err) {
      return this._handleHandlerError('filesystem.list.failed', err, 'list');
    }
  }

  async handleRead(data) {
    try {
      if (!data?.path) {
        return this._errorResponse(400, 'INVALID_INPUT', 'path is required',
          { kind: 'domain', field: 'path' });
      }
      const safePath = this.validatePath(data.path, { sourceModule: data?._source_module ?? args?._source_module });

      let stats;
      try { stats = await fs.stat(safePath); }
      catch (e) {
        if (e.code === 'ENOENT') {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'File not found',
            { entity_type: 'file', entity_id: data.path });
        }
        throw e;
      }
      if (stats.isDirectory()) {
        return this._errorResponse(400, 'INVALID_INPUT', 'Cannot read directory as file',
          { kind: 'domain', field: 'path', expected: 'file', got: 'directory' });
      }
      if (stats.size > MAX_READ_SIZE) {
        return this._errorResponse(413, 'INVALID_INPUT',
          `File too large. Max size: ${MAX_READ_SIZE / (1024 * 1024)}MB`,
          { kind: 'limit', max_size: MAX_READ_SIZE, actual_size: stats.size });
      }

      const ext = path.extname(data.path).toLowerCase();
      if (BINARY_EXTS.includes(ext)) {
        const buffer = await fs.readFile(safePath);
        this.metrics?.increment('filesystem.read.success', { type: 'binary' });
        return {
          status: 200,
          data: {
            path: data.path, content: buffer.toString('base64'),
            encoding: 'base64', size: stats.size,
            modified: stats.mtime, type: 'binary',
            hash: this._computeHash(buffer)
          }
        };
      }

      const content = await fs.readFile(safePath, 'utf-8');
      this.metrics?.increment('filesystem.read.success', { type: 'text' });
      return {
        status: 200,
        data: {
          path: data.path, content,
          encoding: 'utf-8', size: stats.size,
          modified: stats.mtime, type: 'text',
          hash: this._computeHash(content)
        }
      };
    } catch (err) {
      return this._handleHandlerError('filesystem.read.failed', err, 'read');
    }
  }

  async handleWrite(data) {
    try {
      const filePath = data?.path || data?.file_path;
      if (!filePath) {
        return this._errorResponse(400, 'INVALID_INPUT', 'path is required',
          { kind: 'domain', field: 'path' });
      }
      if (data.content === undefined) {
        return this._errorResponse(400, 'INVALID_INPUT', 'content is required',
          { kind: 'domain', field: 'content' });
      }

      const safePath = this.validatePath(filePath, { sourceModule: data?._source_module ?? args?._source_module });
      await fs.mkdir(path.dirname(safePath), { recursive: true });

      let isNew = false;
      try { await fs.stat(safePath); }
      catch (e) { if (e.code === 'ENOENT') isNew = true; }

      // Versionado optimista (CAS): si llega expected_hash, verificar que
      // el contenido actual del disco lo cumple antes de escribir. Cierra
      // la clase de bugs read-modify-write fragiles (caso testigo:
      // salmorejo perdido en audit 2026-05-25). Opt-in: si no se pasa
      // expected_hash, comportamiento sin cambio (silent allow per
      // decision 2A de Critica 1).
      if (typeof data.expected_hash === 'string') {
        if (isNew) {
          // El caller esperaba que el archivo existiera con un hash
          // concreto pero no existe. Otro proceso lo borro entre el read
          // y el write -> conflicto.
          this.metrics?.increment('filesystem.write.cas_conflict', { reason: 'file_missing' });
          return this._errorResponse(409, 'CONFLICT_STATE',
            'File no longer exists; expected_hash cannot match',
            { kind: 'domain', path: filePath,
              expected_hash: data.expected_hash, current_hash: null });
        }
        const currentBuffer = await fs.readFile(safePath);
        const ext = path.extname(filePath).toLowerCase();
        const currentRepresentation = BINARY_EXTS.includes(ext)
          ? currentBuffer
          : currentBuffer.toString('utf-8');
        const currentHash = this._computeHash(currentRepresentation);
        if (currentHash !== data.expected_hash) {
          this.metrics?.increment('filesystem.write.cas_conflict', { reason: 'hash_mismatch' });
          return this._errorResponse(409, 'CONFLICT_STATE',
            'File hash changed since read; reload and retry',
            { kind: 'domain', path: filePath,
              expected_hash: data.expected_hash, current_hash: currentHash });
        }
      }

      let contentBuffer, fileSize;
      if (data.encoding === 'base64') {
        contentBuffer = Buffer.from(data.content, 'base64');
        fileSize = contentBuffer.length;
      } else {
        contentBuffer = data.content;
        fileSize = Buffer.byteLength(data.content, 'utf-8');
      }
      await this._atomicWriteFile(safePath, contentBuffer, data.encoding === 'base64' ? undefined : 'utf-8');

      const eventType = isNew ? 'fs.file.created' : 'fs.file.updated';
      await this._publicarEvento(eventType, {
        path: filePath, size: fileSize
      });
      this.metrics?.increment('filesystem.write.success', { kind: isNew ? 'created' : 'updated' });

      // Hash post-escritura: permite encadenar writes sin re-read.
      const newHashRepresentation = data.encoding === 'base64'
        ? contentBuffer
        : data.content;
      const newHash = this._computeHash(newHashRepresentation);

      return {
        status: isNew ? 201 : 200,
        data: {
          path: filePath, file_path: filePath,
          created: isNew, size: fileSize,
          hash: newHash
        }
      };
    } catch (err) {
      return this._handleHandlerError('filesystem.write.failed', err, 'write');
    }
  }

  // ==========================================
  // handleEdit — JSON Patch RFC 6902 sobre archivos JSON
  // ==========================================
  // v1: solo 'op:add' soportado. Cierra el caso testigo "salmorejo perdido"
  // (audit 2026-05-25) de raiz — el caller declara el patch declarativo en
  // lugar de componer el archivo entero. Imposible perder entradas viejas.
  // CAS opcional via expected_hash (reutiliza la mecanica de handleWrite).
  // Resto de operaciones (remove, replace, move, copy, test) se anyaden
  // cuando se necesiten, sin libs externas — RFC 6902 es algoritmo acotado.

  async handleEdit(data) {
    try {
      const filePath = data?.path || data?.file_path;
      if (!filePath) {
        return this._errorResponse(400, 'INVALID_INPUT', 'path is required',
          { kind: 'domain', field: 'path' });
      }
      if (!Array.isArray(data.patches) || data.patches.length === 0) {
        return this._errorResponse(400, 'INVALID_INPUT', 'patches (non-empty array) is required',
          { kind: 'domain', field: 'patches' });
      }

      const safePath = this.validatePath(filePath, { sourceModule: data?._source_module ?? args?._source_module });

      let currentContent;
      try { currentContent = await fs.readFile(safePath, 'utf-8'); }
      catch (e) {
        if (e.code === 'ENOENT') {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'File not found',
            { entity_type: 'file', entity_id: filePath });
        }
        throw e;
      }

      // CAS opt-in: si llega expected_hash, valida ANTES de modificar.
      if (typeof data.expected_hash === 'string') {
        const currentHash = this._computeHash(currentContent);
        if (currentHash !== data.expected_hash) {
          this.metrics?.increment('filesystem.edit.cas_conflict', { reason: 'hash_mismatch' });
          return this._errorResponse(409, 'CONFLICT_STATE',
            'File hash changed since read; reload and retry',
            { kind: 'domain', path: filePath,
              expected_hash: data.expected_hash, current_hash: currentHash });
        }
      }

      let doc;
      try { doc = JSON.parse(currentContent); }
      catch (e) {
        return this._errorResponse(400, 'INVALID_INPUT',
          `File is not valid JSON: ${e.message}`,
          { kind: 'domain', field: 'content', path: filePath });
      }

      try { doc = this._applyJsonPatchOperations(doc, data.patches); }
      catch (e) {
        return this._errorResponse(400, 'INVALID_INPUT',
          `patch failed: ${e.message}`,
          { kind: 'domain', field: 'patches' });
      }

      const newContent = JSON.stringify(doc, null, 2);
      await this._atomicWriteFile(safePath, newContent, 'utf-8');

      const fileSize = Buffer.byteLength(newContent, 'utf-8');
      await this._publicarEvento('fs.file.updated', { path: filePath, size: fileSize });
      this.metrics?.increment('filesystem.edit.success', { patches: data.patches.length });

      const newHash = this._computeHash(newContent);
      return {
        status: 200,
        data: {
          path: filePath, file_path: filePath,
          size: fileSize,
          hash: newHash,
          patches_applied: data.patches.length
        }
      };
    } catch (err) {
      return this._handleHandlerError('filesystem.edit.failed', err, 'edit');
    }
  }

  // JSON Patch RFC 6902 — v1 solo soporta 'op:add'.
  // JSON Patch RFC 6902 — v2 cubre las 6 operaciones canonicas:
  //   add, remove, replace, move, copy, test
  // Atomicidad transaccional: si CUALQUIER patch falla, NINGUNO se persiste
  // (porque doc se compone en memoria y solo se escribe a disco tras
  //  completar el bucle entero — la mutacion intermedia es solo en RAM).
  _applyJsonPatchOperations(doc, patches) {
    const VALID_OPS = new Set(['add', 'remove', 'replace', 'move', 'copy', 'test']);
    for (let i = 0; i < patches.length; i++) {
      const patch = patches[i];
      if (!patch || typeof patch !== 'object') {
        throw new Error(`patch[${i}] must be an object`);
      }
      const op = patch.op;
      if (!VALID_OPS.has(op)) {
        throw new Error(`patch[${i}].op "${op}" not supported (valid: ${[...VALID_OPS].join(', ')})`);
      }
      if (typeof patch.path !== 'string') {
        throw new Error(`patch[${i}].path must be a string`);
      }
      // Validacion de campos por op (RFC 6902):
      //   add, replace, test → require 'value'
      //   move, copy         → require 'from' (string path)
      //   remove             → solo 'path'
      if (op === 'add' || op === 'replace' || op === 'test') {
        if (!('value' in patch)) {
          throw new Error(`patch[${i}].value is required for op "${op}"`);
        }
      }
      if (op === 'move' || op === 'copy') {
        if (typeof patch.from !== 'string') {
          throw new Error(`patch[${i}].from must be a string for op "${op}"`);
        }
      }
      // Enrutar
      switch (op) {
        case 'add':     doc = this._jsonPatchAdd(doc, patch.path, patch.value); break;
        case 'replace': doc = this._jsonPatchReplace(doc, patch.path, patch.value); break;
        case 'remove':  doc = this._jsonPatchRemove(doc, patch.path); break;
        case 'test':    this._jsonPatchTest(doc, patch.path, patch.value); break;
        case 'move':    doc = this._jsonPatchMove(doc, patch.from, patch.path); break;
        case 'copy':    doc = this._jsonPatchCopy(doc, patch.from, patch.path); break;
      }
    }
    return doc;
  }

  // JSON Pointer RFC 6901 — escapes: ~1 -> /, ~0 -> ~ (orden importa).
  _parseJsonPointer(pointer) {
    if (pointer === '') return [];
    if (pointer[0] !== '/') {
      throw new Error(`Invalid JSON Pointer: "${pointer}" must start with "/" or be empty`);
    }
    return pointer.slice(1).split('/').map(seg =>
      seg.replace(/~1/g, '/').replace(/~0/g, '~')
    );
  }

  // RFC 6902 "add": inserta value en la posicion del pointer.
  // - Pointer vacio: reemplaza el documento entero.
  // - Pointer apunta a una posicion de array: inserta (no reemplaza).
  //   "/-" como ultimo token significa "append al final del array".
  // - Pointer apunta a una clave de objeto: la crea o reemplaza.
  _jsonPatchAdd(doc, pointer, value) {
    const tokens = this._parseJsonPointer(pointer);
    if (tokens.length === 0) {
      return value; // reemplazo de root
    }
    const lastToken = tokens[tokens.length - 1];
    const parentTokens = tokens.slice(0, -1);
    let parent = doc;
    for (const token of parentTokens) {
      if (Array.isArray(parent)) {
        const idx = parseInt(token, 10);
        if (Number.isNaN(idx) || idx < 0 || idx >= parent.length) {
          throw new Error(`Path not found: array index "${token}" out of range`);
        }
        parent = parent[idx];
      } else if (parent !== null && typeof parent === 'object') {
        if (!(token in parent)) {
          throw new Error(`Path not found: key "${token}" not in object`);
        }
        parent = parent[token];
      } else {
        throw new Error(`Cannot navigate into non-container at token "${token}"`);
      }
    }
    if (Array.isArray(parent)) {
      if (lastToken === '-') {
        parent.push(value);
      } else {
        const idx = parseInt(lastToken, 10);
        if (Number.isNaN(idx) || idx < 0 || idx > parent.length) {
          throw new Error(`Invalid array insertion index: "${lastToken}" (length is ${parent.length})`);
        }
        parent.splice(idx, 0, value);
      }
    } else if (parent !== null && typeof parent === 'object') {
      parent[lastToken] = value;
    } else {
      throw new Error(`Cannot add into non-container at "${pointer}"`);
    }
    return doc;
  }

  // RFC 6902 "replace": reemplaza el valor en la posicion del pointer.
  // - Pointer vacio: reemplaza el documento entero (igual que add).
  // - Pointer apunta a array: requiere indice numerico EXISTENTE (no "/-",
  //   no se puede reemplazar lo que no existe). Sustituye en posicion.
  // - Pointer apunta a objeto: requiere que la clave EXISTA (a diferencia
  //   de add que la crea). Si no existe, INVALID_INPUT.
  _jsonPatchReplace(doc, pointer, value) {
    const tokens = this._parseJsonPointer(pointer);
    if (tokens.length === 0) {
      return value; // reemplazo de root
    }
    const lastToken = tokens[tokens.length - 1];
    const parentTokens = tokens.slice(0, -1);
    let parent = doc;
    for (const token of parentTokens) {
      if (Array.isArray(parent)) {
        const idx = parseInt(token, 10);
        if (Number.isNaN(idx) || idx < 0 || idx >= parent.length) {
          throw new Error(`Path not found: array index "${token}" out of range`);
        }
        parent = parent[idx];
      } else if (parent !== null && typeof parent === 'object') {
        if (!(token in parent)) {
          throw new Error(`Path not found: key "${token}" not in object`);
        }
        parent = parent[token];
      } else {
        throw new Error(`Cannot navigate into non-container at token "${token}"`);
      }
    }
    if (Array.isArray(parent)) {
      if (lastToken === '-') {
        throw new Error(`Cannot replace at "/-" (would refer to non-existent position); use add instead`);
      }
      const idx = parseInt(lastToken, 10);
      if (Number.isNaN(idx) || idx < 0 || idx >= parent.length) {
        throw new Error(`Path not found: array index "${lastToken}" out of range for replace (length is ${parent.length})`);
      }
      parent[idx] = value;
    } else if (parent !== null && typeof parent === 'object') {
      if (!(lastToken in parent)) {
        throw new Error(`Path not found: key "${lastToken}" not in object (replace requires existing key; use add to create)`);
      }
      parent[lastToken] = value;
    } else {
      throw new Error(`Cannot replace into non-container at "${pointer}"`);
    }
    return doc;
  }

  // RFC 6902 "remove": elimina el valor en la posicion del pointer.
  // - Pointer vacio: no permitido (no se puede eliminar el documento entero).
  // - Pointer apunta a array: requiere indice numerico EXISTENTE; usa splice
  //   (los elementos posteriores se desplazan, longitud del array decrece).
  // - Pointer apunta a objeto: requiere que la clave EXISTA; usa delete.
  _jsonPatchRemove(doc, pointer) {
    const tokens = this._parseJsonPointer(pointer);
    if (tokens.length === 0) {
      throw new Error(`Cannot remove root document (empty pointer)`);
    }
    const lastToken = tokens[tokens.length - 1];
    const parentTokens = tokens.slice(0, -1);
    let parent = doc;
    for (const token of parentTokens) {
      if (Array.isArray(parent)) {
        const idx = parseInt(token, 10);
        if (Number.isNaN(idx) || idx < 0 || idx >= parent.length) {
          throw new Error(`Path not found: array index "${token}" out of range`);
        }
        parent = parent[idx];
      } else if (parent !== null && typeof parent === 'object') {
        if (!(token in parent)) {
          throw new Error(`Path not found: key "${token}" not in object`);
        }
        parent = parent[token];
      } else {
        throw new Error(`Cannot navigate into non-container at token "${token}"`);
      }
    }
    if (Array.isArray(parent)) {
      if (lastToken === '-') {
        throw new Error(`Cannot remove at "/-" (would refer to non-existent position)`);
      }
      const idx = parseInt(lastToken, 10);
      if (Number.isNaN(idx) || idx < 0 || idx >= parent.length) {
        throw new Error(`Path not found: array index "${lastToken}" out of range for remove (length is ${parent.length})`);
      }
      parent.splice(idx, 1);
    } else if (parent !== null && typeof parent === 'object') {
      if (!(lastToken in parent)) {
        throw new Error(`Path not found: key "${lastToken}" not in object`);
      }
      delete parent[lastToken];
    } else {
      throw new Error(`Cannot remove from non-container at "${pointer}"`);
    }
    return doc;
  }

  // RFC 6902 "test": verifica que el valor en pointer es DEEP-EQUAL al
  // value esperado. Si no, lanza error (el array de patches se aborta
  // completo, ningun cambio se persiste). NO modifica el documento.
  // Igualdad: deep equal por valor (no por referencia), arrays comparados
  // por orden, objetos por claves+valores.
  _jsonPatchTest(doc, pointer, expectedValue) {
    const tokens = this._parseJsonPointer(pointer);
    let cur = doc;
    if (tokens.length > 0) {
      for (const token of tokens) {
        if (Array.isArray(cur)) {
          const idx = parseInt(token, 10);
          if (Number.isNaN(idx) || idx < 0 || idx >= cur.length) {
            throw new Error(`Test failed: array index "${token}" out of range at "${pointer}"`);
          }
          cur = cur[idx];
        } else if (cur !== null && typeof cur === 'object') {
          if (!(token in cur)) {
            throw new Error(`Test failed: key "${token}" not in object at "${pointer}"`);
          }
          cur = cur[token];
        } else {
          throw new Error(`Test failed: cannot navigate into non-container at token "${token}"`);
        }
      }
    }
    if (!this._deepEqual(cur, expectedValue)) {
      throw new Error(`Test failed at "${pointer}": value does not match expected`);
    }
  }

  // Deep equal por valor para op:test. Soporta objetos, arrays, primitivos.
  // Orden de keys en objetos NO importa; orden de elementos en arrays SI.
  _deepEqual(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!this._deepEqual(a[i], b[i])) return false;
      }
      return true;
    }
    const aKeys = Object.keys(a), bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) {
      if (!(k in b)) return false;
      if (!this._deepEqual(a[k], b[k])) return false;
    }
    return true;
  }

  // RFC 6902 "move": equivalent to remove from `from` + add to `path`.
  // Caso especial: si `from` === `path`, no-op (RFC asks "functionally
  // equivalent" — implementacion concreta: skip).
  // Restriccion RFC: `path` no puede ser un descendiente de `from`
  // (movería un padre dentro de sí mismo). Validado.
  _jsonPatchMove(doc, fromPointer, toPointer) {
    if (fromPointer === toPointer) return doc;
    // path no puede ser descendiente estricto de from
    if (toPointer.startsWith(fromPointer + '/')) {
      throw new Error(`Cannot move "${fromPointer}" to descendant path "${toPointer}"`);
    }
    // Leer valor en from (sin mutar)
    const value = this._jsonPatchGet(doc, fromPointer);
    // Remove desde from
    doc = this._jsonPatchRemove(doc, fromPointer);
    // Add en path destino
    doc = this._jsonPatchAdd(doc, toPointer, value);
    return doc;
  }

  // RFC 6902 "copy": equivalent to read from `from` + add at `path`.
  // Se hace deep clone del valor leido para evitar aliasing.
  _jsonPatchCopy(doc, fromPointer, toPointer) {
    const value = this._jsonPatchGet(doc, fromPointer);
    const cloned = JSON.parse(JSON.stringify(value));
    doc = this._jsonPatchAdd(doc, toPointer, cloned);
    return doc;
  }

  // Helper interno: leer valor en un pointer sin mutar. Lanza error si no
  // existe (mismo shape que los demas helpers).
  _jsonPatchGet(doc, pointer) {
    const tokens = this._parseJsonPointer(pointer);
    if (tokens.length === 0) return doc;
    let cur = doc;
    for (const token of tokens) {
      if (Array.isArray(cur)) {
        const idx = parseInt(token, 10);
        if (Number.isNaN(idx) || idx < 0 || idx >= cur.length) {
          throw new Error(`Path not found: array index "${token}" out of range at "${pointer}"`);
        }
        cur = cur[idx];
      } else if (cur !== null && typeof cur === 'object') {
        if (!(token in cur)) {
          throw new Error(`Path not found: key "${token}" not in object at "${pointer}"`);
        }
        cur = cur[token];
      } else {
        throw new Error(`Cannot navigate into non-container at token "${token}"`);
      }
    }
    return cur;
  }

  // ==========================================
  // Atomicidad de fs.write y fs.edit
  // ==========================================
  // Helper compartido por handleWrite y handleEdit. Cierra el bug
  // documentado en persistence.contract.atomic_writes_mandatory que
  // ambos handlers heredaban al usar fs.writeFile directo. Patron
  // canonico: escribir a tempFile + fs.rename atomico. Si el proceso
  // muere durante el write, queda el tmp huerfano pero el archivo final
  // NO se corrompe.
  async _atomicWriteFile(safePath, content, encoding) {
    const tmpSuffix = '.tmp.' + crypto.randomBytes(6).toString('hex');
    const tmpPath = safePath + tmpSuffix;
    try {
      await fs.writeFile(tmpPath, content, encoding);
      await fs.rename(tmpPath, safePath);
    } catch (err) {
      // Cleanup best-effort del tmp si quedó por error en write o rename.
      try { await fs.unlink(tmpPath); } catch (_) { /* nothing */ }
      throw err;
    }
  }

  // ==========================================
  // Hash canonico para el versionado optimista CAS de fs.write.
  // ==========================================
  // SHA-256 hex del contenido raw (utf-8 para texto, buffer para binario).
  // Patron tipo ETag de HTTP. Cero normalizacion en v1 (per decision 2A):
  // si dos blueprints serializan el mismo JSON con orden de keys distinto
  // y emergen falsos conflictos, evolucionar a normalizado en v2.
  _computeHash(content) {
    const h = crypto.createHash('sha256');
    if (Buffer.isBuffer(content)) h.update(content);
    else h.update(content, 'utf-8');
    return h.digest('hex');
  }

  async handleDelete(data) {
    try {
      const filePath = data?.path || data?.file_path;
      if (!filePath) {
        return this._errorResponse(400, 'INVALID_INPUT', 'path is required',
          { kind: 'domain', field: 'path' });
      }
      if (filePath === '/' || filePath === '') {
        return this._errorResponse(403, 'PERMISSION_DENIED', 'Cannot delete root directory',
          { kind: 'protected_path' });
      }

      const safePath = this.validatePath(filePath, { sourceModule: data?._source_module ?? args?._source_module });
      let stats;
      try { stats = await fs.stat(safePath); }
      catch (e) {
        if (e.code === 'ENOENT') {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Path not found',
            { entity_type: 'path', entity_id: filePath });
        }
        throw e;
      }
      const isDirectory = stats.isDirectory();
      if (isDirectory) await fs.rm(safePath, { recursive: true });
      else await fs.unlink(safePath);

      await this._publicarEvento('fs.file.deleted', {
        path: filePath, type: isDirectory ? 'directory' : 'file'
      });
      this.metrics?.increment('filesystem.delete.success', { type: isDirectory ? 'directory' : 'file' });

      return {
        status: 200,
        data: {
          path: filePath, file_path: filePath,
          deleted: true, type: isDirectory ? 'directory' : 'file'
        }
      };
    } catch (err) {
      return this._handleHandlerError('filesystem.delete.failed', err, 'delete');
    }
  }

  async handleMkdir(data) {
    try {
      if (!data?.path) {
        return this._errorResponse(400, 'INVALID_INPUT', 'path is required',
          { kind: 'domain', field: 'path' });
      }
      const safePath = this.validatePath(data.path, { sourceModule: data?._source_module ?? args?._source_module });
      await fs.mkdir(safePath, { recursive: true });

      await this._publicarEvento('fs.directory.created', { path: data.path });
      this.metrics?.increment('filesystem.mkdir.success');

      return { status: 201, data: { path: data.path, created: true } };
    } catch (err) {
      return this._handleHandlerError('filesystem.mkdir.failed', err, 'mkdir');
    }
  }

  async handleMove(data) {
    try {
      if (!data?.from || !data?.to) {
        return this._errorResponse(400, 'INVALID_INPUT', 'from and to are required',
          { kind: 'domain', field: 'from|to' });
      }
      const safeFrom = this.validatePath(data.from, { sourceModule: data?._source_module ?? args?._source_module });
      const safeTo   = this.validatePath(data.to, { sourceModule: data?._source_module ?? args?._source_module });
      try { await fs.stat(safeFrom); }
      catch (e) {
        if (e.code === 'ENOENT') {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Source path not found',
            { entity_type: 'path', entity_id: data.from });
        }
        throw e;
      }
      await fs.mkdir(path.dirname(safeTo), { recursive: true });
      await fs.rename(safeFrom, safeTo);

      this.metrics?.increment('filesystem.move.success');
      return { status: 200, data: { from: data.from, to: data.to, moved: true } };
    } catch (err) {
      return this._handleHandlerError('filesystem.move.failed', err, 'move');
    }
  }

  async handleCopy(data) {
    try {
      if (!data?.from || !data?.to) {
        return this._errorResponse(400, 'INVALID_INPUT', 'from and to are required',
          { kind: 'domain', field: 'from|to' });
      }
      const safeFrom = this.validatePath(data.from, { sourceModule: data?._source_module ?? args?._source_module });
      const safeTo   = this.validatePath(data.to, { sourceModule: data?._source_module ?? args?._source_module });
      let stats;
      try { stats = await fs.stat(safeFrom); }
      catch (e) {
        if (e.code === 'ENOENT') {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Source file not found',
            { entity_type: 'file', entity_id: data.from });
        }
        throw e;
      }
      if (stats.isDirectory()) {
        return this._errorResponse(400, 'INVALID_INPUT', 'Cannot copy directories (use recursive copy)',
          { kind: 'domain', field: 'from', expected: 'file', got: 'directory' });
      }
      await fs.mkdir(path.dirname(safeTo), { recursive: true });
      await fs.copyFile(safeFrom, safeTo);

      this.metrics?.increment('filesystem.copy.success');
      return { status: 200, data: { from: data.from, to: data.to, copied: true } };
    } catch (err) {
      return this._handleHandlerError('filesystem.copy.failed', err, 'copy');
    }
  }

  async handleSearch(data) {
    try {
      if (!data?.query) {
        return this._errorResponse(400, 'INVALID_INPUT', 'query is required',
          { kind: 'domain', field: 'query' });
      }
      const basePath = this.validatePath(data.path || '/', { sourceModule: data?._source_module ?? args?._source_module });
      const searchContent = data.content === true;
      const query = data.query.toLowerCase();
      const results = [];
      await this._searchRecursive(basePath, query, searchContent, results, data.path || '/', MAX_SEARCH_RESULTS);

      this.metrics?.increment('filesystem.search.success');
      return {
        status: 200,
        data: {
          query: data.query,
          path: data.path || '/',
          searchContent, results,
          count: results.length,
          truncated: results.length >= MAX_SEARCH_RESULTS
        }
      };
    } catch (err) {
      return this._handleHandlerError('filesystem.search.failed', err, 'search');
    }
  }

  async handleInfo(data) {
    try {
      if (!data?.path) {
        return this._errorResponse(400, 'INVALID_INPUT', 'path is required',
          { kind: 'domain', field: 'path' });
      }
      const safePath = this.validatePath(data.path, { sourceModule: data?._source_module ?? args?._source_module });
      let stats;
      try { stats = await fs.stat(safePath); }
      catch (e) {
        if (e.code === 'ENOENT') {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Path not found',
            { entity_type: 'path', entity_id: data.path });
        }
        throw e;
      }
      return {
        status: 200,
        data: {
          path: data.path,
          type: stats.isDirectory() ? 'directory' : 'file',
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          accessed: stats.atime
        }
      };
    } catch (err) {
      return this._handleHandlerError('filesystem.info.failed', err, 'info');
    }
  }

  async handleAppend(data) {
    try {
      if (!data?.path) {
        return this._errorResponse(400, 'INVALID_INPUT', 'path is required',
          { kind: 'domain', field: 'path' });
      }
      if (data.content === undefined) {
        return this._errorResponse(400, 'INVALID_INPUT', 'content is required',
          { kind: 'domain', field: 'content' });
      }
      const safePath = this.validatePath(data.path, { sourceModule: data?._source_module ?? args?._source_module });
      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.appendFile(safePath, data.content, data.encoding || 'utf-8');
      const stats = await fs.stat(safePath);

      this.metrics?.increment('filesystem.append.success');
      return {
        status: 200,
        data: { path: data.path, size: stats.size, appended: true }
      };
    } catch (err) {
      return this._handleHandlerError('filesystem.append.failed', err, 'append');
    }
  }

  async handleCleanup(data) {
    try {
      const cleanupPath = data?.path || '/temp';
      const maxAgeHours = data?.max_age_hours || 24;
      const dryRun = data?.dry_run === true;

      const safePath = this.validatePath(cleanupPath, { sourceModule: data?._source_module ?? args?._source_module });
      try {
        const stats = await fs.stat(safePath);
        if (!stats.isDirectory()) {
          return this._errorResponse(400, 'INVALID_INPUT', 'Path is not a directory',
            { kind: 'domain', field: 'path', expected: 'directory', got: 'file' });
        }
      } catch (e) {
        if (e.code === 'ENOENT') {
          return {
            status: 200,
            data: { path: cleanupPath, deleted: [], count: 0, message: 'Directory does not exist, nothing to clean' }
          };
        }
        throw e;
      }

      const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000);
      const deleted = [];
      const errors = [];
      await this._cleanupRecursive(safePath, cleanupPath, cutoffTime, dryRun, deleted, errors);

      this.metrics?.increment('filesystem.cleanup.success', { dry_run: dryRun });
      return {
        status: 200,
        data: {
          path: cleanupPath, max_age_hours: maxAgeHours, dry_run: dryRun,
          deleted, count: deleted.length,
          errors: errors.length > 0 ? errors : undefined
        }
      };
    } catch (err) {
      return this._handleHandlerError('filesystem.cleanup.failed', err, 'cleanup');
    }
  }

  async handleStats(data) {
    try {
      const statsPath = data?.path || '/';
      const safePath = this.validatePath(statsPath, { sourceModule: data?._source_module ?? args?._source_module });

      try {
        const dirStats = await fs.stat(safePath);
        if (!dirStats.isDirectory()) {
          return this._errorResponse(400, 'INVALID_INPUT', 'Path is not a directory',
            { kind: 'domain', field: 'path', expected: 'directory', got: 'file' });
        }
      } catch (e) {
        if (e.code === 'ENOENT') {
          return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'Directory not found',
            { entity_type: 'directory', entity_id: statsPath });
        }
        throw e;
      }

      const stats = {
        totalFiles: 0, totalDirectories: 0, totalSize: 0,
        byExtension: {}, largestFiles: []
      };
      await this._calculateStats(safePath, statsPath, stats);

      stats.largestFiles.sort((a, b) => b.size - a.size);
      stats.largestFiles = stats.largestFiles.slice(0, 10);
      const byExtSorted = Object.entries(stats.byExtension)
        .sort((a, b) => b[1].size - a[1].size)
        .reduce((obj, [ext, d]) => { obj[ext] = d; return obj; }, {});
      stats.byExtension = byExtSorted;

      return {
        status: 200,
        data: {
          path: statsPath,
          total_files: stats.totalFiles,
          total_directories: stats.totalDirectories,
          total_size: stats.totalSize,
          total_size_human: this._formatBytes(stats.totalSize),
          by_extension: stats.byExtension,
          largest_files: stats.largestFiles
        }
      };
    } catch (err) {
      return this._handleHandlerError('filesystem.stats.failed', err, 'stats');
    }
  }

  async handleSetWorkDir(data) {
    try {
      const requestedPath = data?.path || '/';
      const safePath = this.validatePath(requestedPath, { sourceModule: data?._source_module ?? args?._source_module });
      const stats = await fs.stat(safePath);
      if (!stats.isDirectory()) {
        return this._errorResponse(400, 'INVALID_INPUT', 'Path is not a directory',
          { kind: 'domain', field: 'path', expected: 'directory', got: 'file' });
      }

      this.workingDirectory = safePath;
      const relPath = this.toRelativePath(safePath);
      this.logger.info('filesystem.workdir.changed', {
        new_workdir: safePath, relative: relPath
      });
      await this._publicarEvento('fs.workdir.changed', {
        working_directory: relPath, absolute_path: safePath
      });
      return {
        status: 200,
        data: { working_directory: relPath, absolute_path: safePath }
      };
    } catch (err) {
      return this._handleHandlerError('filesystem.set_work_dir.failed', err, 'set_work_dir');
    }
  }

  async handleGetWorkDir() {
    try {
      const workDir = this.workingDirectory || this.basePath;
      return {
        status: 200,
        data: {
          working_directory: this.toRelativePath(workDir),
          absolute_path: workDir,
          project_id: this.activeProjectId,
          is_project_context: !!this.activeProjectId
        }
      };
    } catch (err) {
      return this._handleHandlerError('filesystem.get_work_dir.failed', err, 'get_work_dir');
    }
  }

  // ==========================================
  // Helpers internos
  // ==========================================

  async _searchRecursive(dirPath, query, searchContent, results, relativePath, maxResults) {
    if (results.length >= maxResults) return;
    let entries;
    try { entries = await fs.readdir(dirPath, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      if (results.length >= maxResults) break;
      const fullPath = path.join(dirPath, entry.name);
      const entryRelative = path.join(relativePath, entry.name).replace(/\\/g, '/');

      if (entry.name.toLowerCase().includes(query)) {
        try {
          const s = await fs.stat(fullPath);
          results.push({
            name: entry.name, path: entryRelative,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: s.size, modified: s.mtime, match: 'filename'
          });
        } catch {}
      }
      if (searchContent && entry.isFile() && results.length < maxResults) {
        const ext = path.extname(entry.name).toLowerCase();
        if (TEXT_EXTS.includes(ext)) {
          try {
            const s = await fs.stat(fullPath);
            if (s.size < 1024 * 1024) {
              const content = await fs.readFile(fullPath, 'utf-8');
              if (content.toLowerCase().includes(query)) {
                if (!results.some(r => r.path === entryRelative)) {
                  results.push({
                    name: entry.name, path: entryRelative, type: 'file',
                    size: s.size, modified: s.mtime, match: 'content'
                  });
                }
              }
            }
          } catch {}
        }
      }
      if (entry.isDirectory() && results.length < maxResults) {
        await this._searchRecursive(fullPath, query, searchContent, results, entryRelative, maxResults);
      }
    }
  }

  async _cleanupRecursive(dirPath, relativePath, cutoffTime, dryRun, deleted, errors) {
    let entries;
    try { entries = await fs.readdir(dirPath, { withFileTypes: true }); }
    catch (e) {
      errors.push({ path: relativePath, error: e.message });
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const entryRelative = path.join(relativePath, entry.name).replace(/\\/g, '/');
      try {
        const stats = await fs.stat(fullPath);
        if (entry.isDirectory()) {
          await this._cleanupRecursive(fullPath, entryRelative, cutoffTime, dryRun, deleted, errors);
          const remaining = await fs.readdir(fullPath);
          if (remaining.length === 0) {
            if (!dryRun) await fs.rmdir(fullPath);
            deleted.push({ path: entryRelative, type: 'directory', reason: 'empty' });
          }
        } else if (stats.mtimeMs < cutoffTime) {
          if (!dryRun) await fs.unlink(fullPath);
          deleted.push({
            path: entryRelative, type: 'file', size: stats.size,
            age_hours: Math.round((Date.now() - stats.mtimeMs) / (1000 * 60 * 60))
          });
        }
      } catch (e) {
        errors.push({ path: entryRelative, error: e.message });
      }
    }
  }

  async _calculateStats(dirPath, relativePath, stats) {
    let entries;
    try { entries = await fs.readdir(dirPath, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const entryRelative = path.join(relativePath, entry.name).replace(/\\/g, '/');
      try {
        const fileStats = await fs.stat(fullPath);
        if (entry.isDirectory()) {
          stats.totalDirectories++;
          await this._calculateStats(fullPath, entryRelative, stats);
        } else {
          stats.totalFiles++;
          stats.totalSize += fileStats.size;
          const ext = path.extname(entry.name).toLowerCase() || '.noext';
          if (!stats.byExtension[ext]) stats.byExtension[ext] = { count: 0, size: 0 };
          stats.byExtension[ext].count++;
          stats.byExtension[ext].size += fileStats.size;
          if (stats.largestFiles.length < 20 || fileStats.size > stats.largestFiles[stats.largestFiles.length - 1]?.size) {
            stats.largestFiles.push({
              path: entryRelative, name: entry.name,
              size: fileStats.size, size_human: this._formatBytes(fileStats.size)
            });
          }
        }
      } catch {}
    }
  }

  _formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // ==========================================
  // Helpers POC2 (transferibles) + auxiliares
  // ==========================================

  // Auxiliar: alias privado de validatePath (compat con el contrato POC2 que
  // pide auxiliares con prefijo _, sin renombrar la api publica).
  _validatePath(userPath, options) { return this.validatePath(userPath, options); }

  // Reglas especificas del dominio del modulo. BaseModule cubre los keywords genericos.
  _classifyHandlerError(err) {
    const msg = (err?.message || '').toLowerCase();
    if (err.code === 'ENOENT') return 'RESOURCE_NOT_FOUND';
    if (err.code === 'EACCES' || err.code === 'EPERM') return 'PERMISSION_DENIED';
    if (err.code === 'EEXIST') return 'CONFLICT_STATE';
    if (err.code === 'EISDIR' || err.code === 'ENOTDIR') return 'INVALID_INPUT';
    if (err.code === 'ENOENT') return 'RESOURCE_NOT_FOUND';
    if (err.code === 'EACCES' || err.code === 'EPERM') return 'PERMISSION_DENIED';
    if (err.code === 'EEXIST') return 'CONFLICT_STATE';
    if (err.code === 'EISDIR' || err.code === 'ENOTDIR') return 'INVALID_INPUT';
    return super._classifyHandlerError(err);
  }
}

module.exports = FilesystemModule;
