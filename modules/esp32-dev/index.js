/**
 * esp32-dev — Desarrollo ESP32: templates, scaffolding y compilación
 *
 * Gestiona proyectos de firmware ESP32:
 * - Catálogo de templates por tipo de dispositivo
 * - Scaffolding desde template con variables
 * - Compilación via PlatformIO CLI
 * - Listado y gestión de proyectos
 */

'use strict';

const path = require('path');
const fs = require('fs');
const BaseModule = require('../_shared/base-module');
const { spawn } = require('child_process');

// Boards soportados con sus defaults
const BOARDS = {
  esp32dev: {
    name: 'ESP32 DevKit',
    platform: 'espressif32',
    mcu: 'esp32',
    flash: '4MB',
    psram: false
  },
  'esp32-s2': {
    name: 'ESP32-S2',
    platform: 'espressif32',
    mcu: 'esp32s2',
    flash: '4MB',
    psram: false
  },
  'esp32-s3': {
    name: 'ESP32-S3',
    platform: 'espressif32',
    mcu: 'esp32s3',
    flash: '8MB',
    psram: true
  },
  'esp32-c3': {
    name: 'ESP32-C3',
    platform: 'espressif32',
    mcu: 'esp32c3',
    flash: '4MB',
    psram: false
  },
  'esp32-c6': {
    name: 'ESP32-C6',
    platform: 'espressif32',
    mcu: 'esp32c6',
    flash: '4MB',
    psram: false
  },
  'esp32-p4': {
    name: 'ESP32-P4',
    platform: 'espressif32',
    mcu: 'esp32p4',
    flash: '16MB',
    psram: true
  }
};

class ESP32DevModule extends BaseModule {
  constructor() {
    super();
    this.name = 'esp32-dev';
    this.version = '2.0.0';

    // Dependencias inyectadas en onLoad
    // Config
    this.config = {
      data_path: './data/esp32-dev',
      platformio_path: 'platformio',
      build_timeout_ms: 5 * 60 * 1000,
      max_concurrent_builds: 2
    };

    // Templates built-in (se cargan en onLoad)
    this.templates = new Map();

    // Builds activos: project_name → { process, started_at, log }
    this.activeBuilds = new Map();

    // Proyectos registrados: project_name → metadata
    this.projects = {};
  }

  // ─── Lifecycle ────────────────────────────────────────────

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('module.loading', { module: this.name, version: this.version });

    if (core.config?.['esp32-dev']) {
      this.config = { ...this.config, ...core.config['esp32-dev'] };
    }

    this.config.data_path = path.resolve(this.config.data_path);

    // Crear directorios base
    await this._ensureDir(this.config.data_path);
    await this._ensureDir(path.join(this.config.data_path, 'projects'));

    // Cargar templates built-in
    await this._loadTemplates();

    // Cargar índice de proyectos existentes
    await this._loadProjects();

    // Métricas iniciales
    this.metrics.gauge('esp32.projects.count', Object.keys(this.projects).length);
    this.metrics.gauge('esp32.active_builds.count', 0);

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      templates: this.templates.size,
      projects: Object.keys(this.projects).length,
      data_path: this.config.data_path
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    // Matar builds activos
    for (const [name, build] of this.activeBuilds) {
      if (build.process && !build.process.killed) {
        build.process.kill('SIGTERM');
        this.logger.warn('esp32.build.killed_on_unload', { project_name: name });
      }
    }
    this.activeBuilds.clear();

    await this._saveProjects();

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ─── UI Handlers ──────────────────────────────────────────

  /**
   * Lista templates disponibles, opcionalmente filtrados por framework o board.
   */
  async handleListTemplates(data) {
    const list = [];

    for (const [id, tpl] of this.templates) {
      if (data?.framework && tpl.framework !== data.framework) continue;
      if (data?.board && !tpl.boards.includes(data.board)) continue;

      list.push({
        id,
        name: tpl.name,
        description: tpl.description,
        framework: tpl.framework,
        boards: tpl.boards,
        category: tpl.category
      });
    }

    return {
      status: 200,
      data: { templates: list, total: list.length }
    };
  }

  /**
   * Crea un nuevo proyecto de firmware desde un template.
   */
  async handleCreateProject(data) {
    const { project_name, template, board, framework, vars } = data;

    if (!project_name) return this._errorResponse(400, 'INVALID_INPUT', 'project_name es obligatorio', { field: 'project_name' });
    if (!template) return this._errorResponse(400, 'INVALID_INPUT', 'template es obligatorio', { field: 'template' });

    // Validar nombre
    if (!/^[a-z0-9][a-z0-9-]*$/.test(project_name)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'project_name debe ser slug: lowercase, hyphens, empieza con alfanumérico', { field: 'project_name' });
    }

    // Verificar que no existe
    if (this.projects[project_name]) {
      return this._errorResponse(409, 'ALREADY_EXISTS', `Proyecto '${project_name}' ya existe`, { entity_type: 'project', entity_id: project_name });
    }

    // Verificar template
    const tpl = this.templates.get(template);
    if (!tpl) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Template '${template}' no encontrado`, { entity_type: 'template', entity_id: template });
    }

    const selectedBoard = board || tpl.defaultBoard || 'esp32dev';
    const selectedFramework = framework || tpl.framework || 'arduino';

    // Verificar board
    if (!BOARDS[selectedBoard]) {
      return this._errorResponse(400, 'INVALID_INPUT', `Board '${selectedBoard}' no soportado`, { field: 'board' });
    }

    const projectDir = path.join(this.config.data_path, 'projects', project_name);

    try {
      // Crear estructura del proyecto
      await this._ensureDir(projectDir);
      await this._ensureDir(path.join(projectDir, 'src'));
      await this._ensureDir(path.join(projectDir, 'include'));

      // Variables para sustituir en templates
      const templateVars = {
        PROJECT_NAME: project_name,
        BOARD: selectedBoard,
        FRAMEWORK: selectedFramework,
        PLATFORM: BOARDS[selectedBoard].platform,
        MONITOR_SPEED: '115200',
        UPLOAD_SPEED: '921600',
        ...(vars || {})
      };

      // Generar platformio.ini
      const platformioIni = this._renderTemplate(tpl.files['platformio.ini'], templateVars);
      await fs.promises.writeFile(path.join(projectDir, 'platformio.ini'), platformioIni);

      // Generar src/main.cpp
      const mainCpp = this._renderTemplate(tpl.files['src/main.cpp'], templateVars);
      await fs.promises.writeFile(path.join(projectDir, 'src', 'main.cpp'), mainCpp);

      // Generar src/config.h
      if (tpl.files['src/config.h']) {
        const configH = this._renderTemplate(tpl.files['src/config.h'], templateVars);
        await fs.promises.writeFile(path.join(projectDir, 'src', 'config.h'), configH);
      }

      // Archivos adicionales del template
      for (const [filePath, content] of Object.entries(tpl.files)) {
        if (['platformio.ini', 'src/main.cpp', 'src/config.h'].includes(filePath)) continue;
        const fullPath = path.join(projectDir, filePath);
        await this._ensureDir(path.dirname(fullPath));
        await fs.promises.writeFile(fullPath, this._renderTemplate(content, templateVars));
      }

      // Registrar proyecto
      this.projects[project_name] = {
        name: project_name,
        template,
        board: selectedBoard,
        framework: selectedFramework,
        created_at: new Date().toISOString(),
        last_build: null,
        last_build_status: null,
        path: projectDir
      };

      await this._saveProjects();

      this.metrics.increment('esp32.project_created.total');
      this.metrics.gauge('esp32.projects.count', Object.keys(this.projects).length);

      this.logger.info('esp32.project.created', {
        project_name, template, board: selectedBoard, framework: selectedFramework
      });

      await this.eventBus.publish('esp32.project_created', {
        project_name, template, board: selectedBoard, framework: selectedFramework
      });

      return {
        status: 201,
        data: {
          project_name,
          template,
          board: selectedBoard,
          framework: selectedFramework,
          path: projectDir,
          files: Object.keys(tpl.files)
        }
      };
    } catch (err) {
      try { await fs.promises.rm(projectDir, { recursive: true, force: true }); } catch (_) {}
      return this._handleHandlerError('handleCreateProject', err);
    }
  }

  /**
   * Lista proyectos de firmware existentes.
   */
  async handleListProjects() {
    const list = Object.values(this.projects).map(p => ({
      name: p.name,
      template: p.template,
      board: p.board,
      framework: p.framework,
      created_at: p.created_at,
      last_build: p.last_build,
      last_build_status: p.last_build_status
    }));

    return {
      status: 200,
      data: { projects: list, total: list.length }
    };
  }

  /**
   * Detalle de un proyecto de firmware.
   */
  async handleGetProject(data) {
    const { project_name } = data;
    if (!project_name) return this._errorResponse(400, 'INVALID_INPUT', 'project_name es obligatorio', { field: 'project_name' });

    const project = this.projects[project_name];
    if (!project) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Proyecto '${project_name}' no encontrado`, { entity_type: 'project', entity_id: project_name });

    // Listar archivos del proyecto
    const projectDir = project.path;
    let files = [];
    try {
      files = await this._listFiles(projectDir);
    } catch (_) {}

    // Verificar si hay binario compilado
    let binary = null;
    const binPath = path.join(projectDir, '.pio', 'build', project.board, 'firmware.bin');
    try {
      const stat = await fs.promises.stat(binPath);
      binary = { path: binPath, size: stat.size, modified: stat.mtime.toISOString() };
    } catch (_) {}

    return {
      status: 200,
      data: {
        ...project,
        files,
        binary,
        is_building: this.activeBuilds.has(project_name)
      }
    };
  }

  /**
   * Compila un proyecto via PlatformIO CLI.
   */
  async handleBuild(data) {
    const { project_name, clean } = data;
    if (!project_name) return this._errorResponse(400, 'INVALID_INPUT', 'project_name es obligatorio', { field: 'project_name' });

    const project = this.projects[project_name];
    if (!project) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Proyecto '${project_name}' no encontrado`, { entity_type: 'project', entity_id: project_name });

    // Verificar build en curso
    if (this.activeBuilds.has(project_name)) {
      return this._errorResponse(409, 'CONFLICT_STATE', `Proyecto '${project_name}' ya está compilando`, { entity_type: 'project', entity_id: project_name });
    }

    // Verificar límite de builds concurrentes
    if (this.activeBuilds.size >= this.config.max_concurrent_builds) {
      return this._errorResponse(429, 'RATE_LIMITED', 'Máximo de builds concurrentes alcanzado', { limit: this.config.max_concurrent_builds });
    }

    const projectDir = project.path;
    const startTime = Date.now();

    // Construir comando
    const args = ['run'];
    if (clean) args.push('-t', 'clean');
    args.push('-d', projectDir);

    this.logger.info('esp32.build.starting', { project_name, board: project.board, clean: !!clean });

    this.metrics.increment('esp32.build_started.total');
    this.metrics.gauge('esp32.active_builds.count', this.activeBuilds.size + 1);

    await this.eventBus.publish('esp32.build_started', {
      project_name, board: project.board, timestamp: new Date().toISOString()
    });

    // Ejecutar build de forma asíncrona
    const buildPromise = this._runBuild(project_name, projectDir, args, startTime);

    // No esperamos — build corre en background
    buildPromise.catch(err => {
      this.logger.error('esp32.build.unhandled_error', { project_name, error: err.message });
    });

    return {
      status: 202,
      data: {
        project_name,
        board: project.board,
        status: 'building',
        message: 'Compilación iniciada. Usa esp32.build-status para ver progreso.'
      }
    };
  }

  /**
   * Estado de build en curso o último build.
   */
  async handleBuildStatus(data) {
    const projectName = data?.project_name;

    if (projectName) {
      const active = this.activeBuilds.get(projectName);
      if (active) {
        return {
          status: 200,
          data: {
            project_name: projectName,
            status: 'building',
            started_at: active.started_at,
            elapsed_ms: Date.now() - new Date(active.started_at).getTime(),
            log_lines: active.log.length,
            log_tail: active.log.slice(-20)
          }
        };
      }

      const project = this.projects[projectName];
      if (!project) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Proyecto '${projectName}' no encontrado`, { entity_type: 'project', entity_id: projectName });

      return {
        status: 200,
        data: {
          project_name: projectName,
          status: project.last_build_status || 'never',
          last_build: project.last_build
        }
      };
    }

    // Sin filtro: todos los builds activos
    const active = [];
    for (const [name, build] of this.activeBuilds) {
      active.push({
        project_name: name,
        status: 'building',
        started_at: build.started_at,
        elapsed_ms: Date.now() - new Date(build.started_at).getTime()
      });
    }

    return {
      status: 200,
      data: { active_builds: active, count: active.length }
    };
  }

  /**
   * Lista boards soportados.
   */
  async handleListBoards() {
    const boards = Object.entries(BOARDS).map(([id, info]) => ({
      id,
      ...info
    }));

    return {
      status: 200,
      data: { boards, total: boards.length }
    };
  }

  /**
   * Elimina un proyecto de firmware.
   */
  async handleDeleteProject(data) {
    const { project_name, confirm } = data;
    if (!project_name) return this._errorResponse(400, 'INVALID_INPUT', 'project_name es obligatorio', { field: 'project_name' });
    if (!confirm) return this._errorResponse(400, 'INVALID_INPUT', 'confirm: true requerido para eliminar', { field: 'confirm' });

    const project = this.projects[project_name];
    if (!project) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `Proyecto '${project_name}' no encontrado`, { entity_type: 'project', entity_id: project_name });

    if (this.activeBuilds.has(project_name)) {
      return this._errorResponse(409, 'CONFLICT_STATE', `Proyecto '${project_name}' está compilando`, { entity_type: 'project', entity_id: project_name });
    }

    try {
      await fs.promises.rm(project.path, { recursive: true, force: true });
    } catch (err) {
      this.logger.warn('esp32.project.delete_dir_failed', { project_name, error: err.message });
    }

    delete this.projects[project_name];
    await this._saveProjects();

    this.metrics.gauge('esp32.projects.count', Object.keys(this.projects).length);
    this.logger.info('esp32.project.deleted', { project_name });

    return {
      status: 200,
      data: { deleted: project_name }
    };
  }

  // ─── Build execution ─────────────────────────────────────

  async _runBuild(projectName, projectDir, args, startTime) {
    return new Promise((resolve) => {
      const buildLog = [];
      const buildInfo = {
        started_at: new Date(startTime).toISOString(),
        log: buildLog,
        process: null
      };

      this.activeBuilds.set(projectName, buildInfo);

      const proc = spawn(this.config.platformio_path, args, {
        cwd: projectDir,
        env: { ...process.env, PLATFORMIO_FORCE_COLOR: 'false' },
        timeout: this.config.build_timeout_ms
      });

      buildInfo.process = proc;

      proc.stdout.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(l => l.trim());
        buildLog.push(...lines);
      });

      proc.stderr.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(l => l.trim());
        buildLog.push(...lines);
      });

      proc.on('close', async (code) => {
        const duration = Date.now() - startTime;
        this.activeBuilds.delete(projectName);
        this.metrics.gauge('esp32.active_builds.count', this.activeBuilds.size);

        if (code === 0) {
          // Build exitoso — buscar binario
          const binPath = path.join(projectDir, '.pio', 'build',
            this.projects[projectName]?.board || 'esp32dev', 'firmware.bin');

          let binarySize = 0;
          try {
            const stat = await fs.promises.stat(binPath);
            binarySize = stat.size;
          } catch (_) {}

          if (this.projects[projectName]) {
            this.projects[projectName].last_build = new Date().toISOString();
            this.projects[projectName].last_build_status = 'success';
            await this._saveProjects();
          }

          this.metrics.increment('esp32.build_completed.total');
          this.metrics.timing('esp32.build.duration', duration);

          this.logger.info('esp32.build.completed', {
            project_name: projectName, duration_ms: duration, binary_size: binarySize
          });

          await this.eventBus.publish('esp32.build_completed', {
            project_name: projectName,
            board: this.projects[projectName]?.board || 'esp32dev',
            binary_path: binPath,
            binary_size: binarySize,
            duration_ms: duration
          });

          resolve({ success: true, binary_path: binPath, binary_size: binarySize, duration_ms: duration });
        } else {
          // Build falló
          const errorOutput = buildLog.slice(-30).join('\n');

          if (this.projects[projectName]) {
            this.projects[projectName].last_build = new Date().toISOString();
            this.projects[projectName].last_build_status = 'failed';
            await this._saveProjects();
          }

          this.metrics.increment('esp32.build_failed.total');
          this.metrics.timing('esp32.build.duration', duration);

          this.logger.error('esp32.build.failed', {
            project_name: projectName, exit_code: code, duration_ms: duration
          });

          await this.eventBus.publish('esp32.build_failed', {
            project_name: projectName,
            board: this.projects[projectName]?.board || 'esp32dev',
            error: errorOutput,
            exit_code: code,
            duration_ms: duration
          });

          resolve({ success: false, error: errorOutput, exit_code: code, duration_ms: duration });
        }
      });

      proc.on('error', async (err) => {
        const duration = Date.now() - startTime;
        this.activeBuilds.delete(projectName);
        this.metrics.gauge('esp32.active_builds.count', this.activeBuilds.size);
        this.metrics.increment('esp32.build_failed.total');

        if (this.projects[projectName]) {
          this.projects[projectName].last_build = new Date().toISOString();
          this.projects[projectName].last_build_status = 'failed';
          await this._saveProjects();
        }

        this.logger.error('esp32.build.spawn_error', {
          project_name: projectName, error: err.message
        });

        await this.eventBus.publish('esp32.build_failed', {
          project_name: projectName,
          board: this.projects[projectName]?.board || 'esp32dev',
          error: `No se pudo ejecutar '${this.config.platformio_path}': ${err.message}`,
          exit_code: -1,
          duration_ms: duration
        });

        resolve({ success: false, error: err.message, duration_ms: duration });
      });
    });
  }

  // ─── Template engine ──────────────────────────────────────

  /**
   * Sustituye {{VAR}} en texto con valores de templateVars.
   */
  _renderTemplate(text, vars) {
    if (!text) return '';
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return vars[key] !== undefined ? vars[key] : match;
    });
  }

  // ─── Templates loader ────────────────────────────────────

  async _loadTemplates() {
    const templatesDir = path.join(__dirname, 'templates');

    try {
      const entries = await fs.promises.readdir(templatesDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const tplDir = path.join(templatesDir, entry.name);
        const metaPath = path.join(tplDir, 'template.json');

        try {
          const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf-8'));
          const files = {};

          // Leer todos los archivos del template (excepto template.json)
          const tplFiles = await this._listFiles(tplDir);
          for (const relPath of tplFiles) {
            if (relPath === 'template.json') continue;
            const content = await fs.promises.readFile(path.join(tplDir, relPath), 'utf-8');
            files[relPath] = content;
          }

          this.templates.set(entry.name, {
            ...meta,
            files
          });

          this.logger.info('esp32.template.loaded', { id: entry.name, name: meta.name });
        } catch (err) {
          this.logger.warn('esp32.template.load_failed', { id: entry.name, error: err.message });
        }
      }
    } catch (err) {
      this.logger.warn('esp32.templates.dir_not_found', { path: templatesDir });
    }
  }

  // ─── Project persistence ─────────────────────────────────

  async _loadProjects() {
    const indexPath = path.join(this.config.data_path, 'projects.json');
    try {
      const content = await fs.promises.readFile(indexPath, 'utf-8');
      this.projects = JSON.parse(content);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        this.logger.warn('esp32.projects.load_failed', { error: err.message });
      }
      this.projects = {};
    }
  }

  async _saveProjects() {
    const indexPath = path.join(this.config.data_path, 'projects.json');
    await this._ensureDir(path.dirname(indexPath));
    await fs.promises.writeFile(indexPath, JSON.stringify(this.projects, null, 2));
  }

  // ─── Helpers ──────────────────────────────────────────────

  async _ensureDir(dirPath) {
    await fs.promises.mkdir(dirPath, { recursive: true });
  }

  // ─── POC2 Helpers ──────────────────────────────────────────

  _classifyDomainError(err) {
    return this._classifyHandlerError(err);
  }

  /**
   * Lista recursiva de archivos relativos a baseDir.
   */
  async _listFiles(baseDir, prefix = '') {
    const results = [];
    try {
      const entries = await fs.promises.readdir(path.join(baseDir, prefix), { withFileTypes: true });
      for (const entry of entries) {
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          // Saltar directorios de build
          if (entry.name === '.pio' || entry.name === 'node_modules' || entry.name === '.git') continue;
          const sub = await this._listFiles(baseDir, relPath);
          results.push(...sub);
        } else {
          results.push(relPath);
        }
      }
    } catch (_) {}
    return results;
  }
}

module.exports = ESP32DevModule;
