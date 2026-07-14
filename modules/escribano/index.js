'use strict';

/**
 * escribano — LA PUERTA DE ESCRITURA de la biblioteca (repo Conocimiento).
 *
 * Hermano escritor del bibliotecario (que es el LECTOR, read-only por invariante):
 *   - bibliotecario  SIRVE los libros (lee un mirror, nunca escribe)
 *   - escribano      ESCRIBE los libros (deja notas en una copia de trabajo)
 *
 * Separados por responsabilidad: el mirror de lectura (auto-pulled, se sobreescribe) no debe
 * mezclarse con la obra de escritura (cambios locales sin commitear). Cada uno su checkout.
 *
 * Opción A (elegida por el dueño): el escribano escribe la nota en la obra y PARA. NO commitea
 * ni empuja — eso lo hace el HUMANO. Razón: escribir en el árbol de git es local y reversible;
 * empujar al repo externo es acción outward con credencial de ESCRITURA, y queda en manos del
 * dueño. El escribano solo deja las notas listas y sabe decir cuáles esperan subida (pendientes).
 *
 * Llamador natural: el agente acumulador-sectorial en su fase GUARDAR (una llamada por nota).
 *
 * Puertas (RPC del bus):
 *   escribano.escribir.request   { sector, nombre, contenido, sobrescribir? } → { ruta, escrita, sobrescrita }
 *   escribano.pendientes.request {}                                           → { pendientes:[{ruta,estado}], total }
 *
 * Degradación honesta: si la obra no existe la clona (read-only, para tener dónde escribir); si el
 * clone falla (sin red) → 503 {degradado}. Nunca cuelga.
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const OBRA_DIR = path.join(process.cwd(), 'data', 'escribano', 'obra');
const CLONE_TIMEOUT_MS = 120000;
const STATUS_TIMEOUT_MS = 30000;

class EscribanoModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'escribano';
    this.version = '0.1.0';

    this.repoUrl     = null;
    this.ref         = 'main';
    this.vaultSubdir = 'boveda';
    this.obraPath    = OBRA_DIR;
  }

  // =============================================================
  // Lifecycle
  // =============================================================

  async onLoad(context) {
    await super.onLoad(context);
    const cfg = (context.moduleConfig && context.moduleConfig.biblioteca) || {};
    this.repoUrl     = cfg.repo_url || 'https://github.com/Noninapizzicas/Conocimiento.git';
    this.ref         = cfg.ref || 'main';
    this.vaultSubdir = cfg.vault_subdir || 'boveda';
    this.obraPath    = cfg.obra_path || OBRA_DIR;
    this.logger?.info('escribano.loaded', {
      module: this.name, version: this.version, obra: this.obraPath
    });
  }

  async onUnload() {
    await super.onUnload();
  }

  // =============================================================
  // Bus API
  // =============================================================

  async onEscribirRequest(event)   { return this._atender(event, 'escribir',   'escribano.escribir.response',   (d) => this._escribir(d)); }
  async onPendientesRequest(event) { return this._atender(event, 'pendientes', 'escribano.pendientes.response', ()  => this._pendientes()); }

  // =============================================================
  // Tools del LLM
  // =============================================================

  async handleEscribirTool(args) {
    try {
      return await this._escribir(args || {});
    } catch (err) {
      return this._handleHandlerError('escribano.escribir.tool.failed', err, 'tool_escribir');
    }
  }

  async handlePendientesTool() {
    try {
      return await this._pendientes();
    } catch (err) {
      return this._handleHandlerError('escribano.pendientes.tool.failed', err, 'tool_pendientes');
    }
  }

  // =============================================================
  // Dominio (protegido)
  // =============================================================

  /** Escribe una nota en la obra. Create-only salvo sobrescribir. NO commitea. */
  async _escribir(d) {
    const start = Date.now();
    this.metrics?.increment('escribano.escribir.total');

    // 1. Validación defensiva
    const sector = typeof d.sector === 'string' ? d.sector.trim() : '';
    const nombre = typeof d.nombre === 'string' ? d.nombre.trim() : '';
    const contenido = typeof d.contenido === 'string' ? d.contenido : '';
    if (!sector)                 return this._errorResponse(400, 'INVALID_INPUT', 'sector requerido', { field: 'sector' });
    if (!nombre)                 return this._errorResponse(400, 'INVALID_INPUT', 'nombre requerido', { field: 'nombre' });
    if (!contenido.trim())       return this._errorResponse(400, 'INVALID_INPUT', 'contenido requerido (no vacío)', { field: 'contenido' });
    if (nombre.includes('/'))    return this._errorResponse(400, 'INVALID_INPUT', "el nombre de nota no lleva '/' (usa el sector para subcarpetas)", { field: 'nombre' });
    if (/(^|\/)\.\.(\/|$)/.test(sector) || /(^|\/)\.\.(\/|$)/.test(nombre)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'ruta inválida (traversal)', { field: 'sector|nombre' });
    }

    // 2. Asegurar la obra (clona read-only si falta; para tener dónde escribir)
    try {
      await this._ensureObra();
    } catch (err) {
      err._code = err._code || 'UPSTREAM_UNREACHABLE';
      return this._handleHandlerError('escribano.obra.no_disponible', err, 'ensure_obra');
    }

    // 3. Resolver ruta destino, con guard de traversal contra el vault
    const vaultDir = path.join(this.obraPath, this.vaultSubdir);
    const fileName = nombre.endsWith('.md') ? nombre : `${nombre}.md`;
    const destino = path.resolve(vaultDir, sector, fileName);
    if (!destino.startsWith(path.resolve(vaultDir) + path.sep)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'ruta fuera del vault', { field: 'sector' });
    }

    // 4. Create-only anti-wipe salvo sobrescribir
    const existe = fs.existsSync(destino);
    if (existe && d.sobrescribir !== true) {
      return this._errorResponse(409, 'ALREADY_EXISTS', `la nota ya existe: ${sector}/${fileName} (pasa sobrescribir=true para reemplazar)`, {
        entity_type: 'nota', entity_id: `${sector}/${fileName}`
      });
    }

    // 5. Escribir (crea carpetas del sector si faltan). NO commit.
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, contenido, 'utf-8');

    const rutaRel = path.join(this.vaultSubdir, path.relative(vaultDir, destino));
    await this._publicarEvento('escribano.nota.escrita', { sector, nombre: fileName, ruta: rutaRel });
    this.metrics?.increment('escribano.nota.escrita');
    this.metrics?.timing('escribano.escribir.duration_ms', Date.now() - start);
    this.logger?.info('escribano.nota.escrita', { ruta: rutaRel, sobrescrita: existe });

    return { status: 200, data: { ruta: rutaRel, escrita: true, sobrescrita: existe } };
  }

  /** git status --porcelain de la obra bajo el vault → qué notas esperan commit+push del humano. */
  async _pendientes() {
    try {
      await this._ensureObra();
    } catch (err) {
      err._code = err._code || 'UPSTREAM_UNREACHABLE';
      return this._handleHandlerError('escribano.obra.no_disponible', err, 'ensure_obra');
    }
    // -uall: lista los ficheros untracked uno a uno en vez de colapsar el directorio nuevo
    const salida = await this._git(['-C', this.obraPath, 'status', '--porcelain', '-uall', '--', this.vaultSubdir], STATUS_TIMEOUT_MS);
    const pendientes = salida.split('\n')
      .map(l => l.replace(/\r$/, ''))
      .filter(Boolean)
      .map(l => ({ estado: l.slice(0, 2).trim(), ruta: l.slice(3).trim() }));
    this.metrics?.gauge?.('escribano.pendientes', pendientes.length);
    return { status: 200, data: { pendientes, total: pendientes.length } };
  }

  // =============================================================
  // Privados — obra (copia de trabajo) + git
  // =============================================================

  /** Si la obra no existe, la clona (read-only) para tener dónde escribir. Best-effort. */
  async _ensureObra() {
    const vaultDir = path.join(this.obraPath, this.vaultSubdir);
    if (fs.existsSync(vaultDir)) return;
    // Si el dir de la obra existe pero sin vault (checkout a medias), no re-clonamos encima.
    if (fs.existsSync(this.obraPath) && fs.readdirSync(this.obraPath).length > 0) {
      throw new Error(`la obra existe pero no contiene ${this.vaultSubdir}/ (checkout incompleto)`);
    }
    fs.mkdirSync(path.dirname(this.obraPath), { recursive: true });
    await this._git(['clone', '--branch', this.ref, this.repoUrl, this.obraPath], CLONE_TIMEOUT_MS);
    if (!fs.existsSync(vaultDir)) {
      // el repo no trae vault todavía: lo creamos para poder escribir el primer sector
      fs.mkdirSync(vaultDir, { recursive: true });
    }
  }

  /** git como promesa, con timeout. Resuelve stdout; rechaza con stderr clasificado. */
  _git(args, timeout_ms) {
    return new Promise((resolve, reject) => {
      execFile('git', args, { timeout: timeout_ms, maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          const e = new Error((stderr || err.message || 'git error').toString().trim());
          e._code = /could not read|authentication|permission|denied|403|not found/i.test(stderr || '')
            ? 'AUTHENTICATION_REQUIRED' : 'UPSTREAM_UNREACHABLE';
          return reject(e);
        }
        resolve((stdout || '').toString());
      });
    });
  }
}

module.exports = EscribanoModule;
