'use strict';

/**
 * fastcrw — el PUENTE a fastCRW (motor crw-server, Rust, self-hosted nativo).
 *
 * El grueso del módulo es DECLARATIVO: las tools_http del module.json (scrape,
 * extract, search, map). El loader genera las closures (templating + fetch +
 * response_path); este index.js solo existe porque el loader exige un index.js
 * con onLoad() — no hay estado ni reflejo propio, el motor vive fuera (nativo,
 * localhost:3002). Degradable por construcción: si crw-server no está, las tools
 * devuelven UPSTREAM_UNREACHABLE sin reventar el sistema.
 *
 *   LLM de página / escandallo ──fastcrw.extract {url, schema}──► crw-server (Rust)
 *                                                                     │ scrape+parse
 *              { nombre, precio, cantidad, formato, precio_unitario } ◄┘
 *
 * Caso motivador: fuente de precio de ingredientes (soysuper) para escandallo,
 * reemplazo del API de Mercadona no oficial y frágil.
 */

const BaseModule = require('../_shared/base-module');

class FastcrwModule extends BaseModule {
  constructor() {
    super();
    this.name = 'fastcrw';
    this.version = '0.1.0';
  }

  async onLoad(core) {
    this.logger = core.logger;
    this.eventBus = core.eventBus;
    this.metrics = core.metrics;
    this.config = (core.config && core.config['fastcrw']) || core.moduleConfig || {};

    this.logger?.info('module.loaded', {
      module: this.name,
      version: this.version,
      base_url: this.config.base_url || 'http://localhost:3002/v1',
      tools: ['fastcrw.scrape', 'fastcrw.extract', 'fastcrw.search', 'fastcrw.map']
    });
  }

  async onUnload() {
    this.logger?.info('module.unloaded', { module: this.name });
  }
}

module.exports = FastcrwModule;
