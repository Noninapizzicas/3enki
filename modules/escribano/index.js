'use strict';

/**
 * escribano — LA PUERTA DE ESCRITURA de la bóveda de conocimiento (boveda/ en el repo).
 *
 * Hermano escritor del bibliotecario (que es el LECTOR, read-only por invariante):
 *   - bibliotecario  SIRVE los libros (lee boveda/, nunca escribe)
 *   - escribano      ESCRIBE los libros (deja notas en boveda/)
 *
 * La bóveda vive DENTRO del repo (boveda/). El escribano escribe directamente ahí
 * — sin copia de trabajo externa, sin clone. Las notas escritas quedan en el árbol de
 * git del repo; el humano commitea y empuja cuando quiera.
 *
 * Llamador natural: el agente acumulador-sectorial en su fase GUARDAR (una llamada por nota).
 *
 * Puertas (RPC del bus):
 *   escribano.escribir.request   { sector, nombre, contenido, sobrescribir? } → { ruta, escrita, sobrescrita }
 *   escribano.pendientes.request {}                                           → { pendientes:[{ruta,estado}], total }
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const VAULT_DIR = path.join(process.cwd(), 'boveda');

class EscribanoModule extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'escribano';
    this.version = '0.1.0';

    this.vaultPath = VAULT_DIR;
  }

  // =============================================================
  // Lifecycle
  // =============================================================

  async onLoad(context) {
    await super.onLoad(context);
    const cfg = (context.moduleConfig && context.moduleConfig.biblioteca) || {};
    this.vaultPath = cfg.vault_path || VAULT_DIR;
    this.logger?.info('escribano.loaded', {
      module: this.name, version: this.version, vault: this.vaultPath
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

  /** Escribe una nota en boveda/. Create-only salvo sobrescribir. */
  async _escribir(d) {
    const start = Date.now();
    this.metrics?.increment('escribano.escribir.total');

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

    const vaultDir = this.vaultPath;
    const fileName = nombre.endsWith('.md') ? nombre : `${nombre}.md`;
    const destino = path.resolve(vaultDir, sector, fileName);
    if (!destino.startsWith(path.resolve(vaultDir) + path.sep)) {
      return this._errorResponse(400, 'INVALID_INPUT', 'ruta fuera del vault', { field: 'sector' });
    }

    const existe = fs.existsSync(destino);
    if (existe && d.sobrescribir !== true) {
      return this._errorResponse(409, 'ALREADY_EXISTS', `la nota ya existe: ${sector}/${fileName} (pasa sobrescribir=true para reemplazar)`, {
        entity_type: 'nota', entity_id: `${sector}/${fileName}`
      });
    }

    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, contenido, 'utf-8');

    const rutaRel = path.join('boveda', path.relative(vaultDir, destino));
    await this._publicarEvento('escribano.nota.escrita', { sector, nombre: fileName, ruta: rutaRel });
    this.metrics?.increment('escribano.nota.escrita');
    this.metrics?.timing('escribano.escribir.duration_ms', Date.now() - start);
    this.logger?.info('escribano.nota.escrita', { ruta: rutaRel, sobrescrita: existe });

    return { status: 200, data: { ruta: rutaRel, escrita: true, sobrescrita: existe } };
  }

  /** git status --porcelain de boveda/ → qué notas del vault esperan commit del humano. */
  async _pendientes() {
    const salida = await new Promise((resolve, reject) => {
      execFile('git', ['status', '--porcelain', '-uall', '--', 'boveda'], {
        cwd: process.cwd(), timeout: 30000, maxBuffer: 16 * 1024 * 1024
      }, (err, stdout) => {
        if (err) return reject(err);
        resolve((stdout || '').toString());
      });
    });
    const pendientes = salida.split('\n')
      .map(l => l.replace(/\r$/, ''))
      .filter(Boolean)
      .map(l => ({ estado: l.slice(0, 2).trim(), ruta: l.slice(3).trim() }));
    this.metrics?.gauge?.('escribano.pendientes', pendientes.length);
    return { status: 200, data: { pendientes, total: pendientes.length } };
  }
}

module.exports = EscribanoModule;
