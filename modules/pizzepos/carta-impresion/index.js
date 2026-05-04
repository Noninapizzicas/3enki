/**
 * Carta Impresión v2.0.0 — Generador de cartas impresas
 *
 * Genera versiones imprimibles de las cartas en HTML print-ready.
 * El trabajo creativo lo hacen los agentes:
 *   - impresion-architect: analiza la carta y decide layout (caras, columnas, formato)
 *   - impresion-builder: genera el HTML+CSS según el guión del architect
 *
 * Se apoya en carta-marketing para el perfil de marca (no duplica branding).
 *
 * Flujo:
 *   carta.actualizada → dispatch architect → architect decide layout
 *   → builder genera HTML → guarda en disco → emite carta.impresion.lista
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class CartaImpresionModule {
  constructor() {
    this.name = 'carta-impresion';
    this.version = '2.0.0';

    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    // Multi-tenant
    this.projectPaths = new Map();

    // Cache de HTML generados (project_id:carta_id → { filePath, metadata })
    this.htmlCache = new Map();

    // Debounce: evitar regenerar por cada pequeño cambio
    this.debounceTimers = new Map();
    this.DEBOUNCE_MS = 5000;
  }

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    this.projectPaths.clear();
    this.htmlCache.clear();
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Project Lifecycle
  // ==========================================

  async onProjectActivated(event) {
    const data = event.data || event;
    const { project_id, base_path, metadata } = data;
    if (!project_id) return;

    const resolvedBase = (metadata?.is_system === true) ? process.cwd() : base_path;
    if (resolvedBase) {
      this.projectPaths.set(project_id, path.join(resolvedBase, 'storage', 'pizzepos'));
    }
    this.logger.info('carta-impresion.project.activated', { project_id });
  }

  async onProjectDeactivated(event) {
    // Keep state
  }

  // ==========================================
  // Listener: carta.actualizada → regenerar (debounced)
  // ==========================================

  async onCartaActualizada(event) {
    const data = event?.data || event?.payload || event;
    const projectId = data?.project_id;
    const cartaId = data?.meta?.id;
    if (!projectId || !cartaId) return;

    const key = `${projectId}:${cartaId}`;
    const sourceCorrelationId = data?.correlation_id || null;

    // Cancelar timer previo
    if (this.debounceTimers.has(key)) {
      clearTimeout(this.debounceTimers.get(key));
    }

    // Programar regeneración tras DEBOUNCE_MS sin más cambios
    const timer = setTimeout(() => {
      this.debounceTimers.delete(key);
      this.dispatchGeneracion(projectId, cartaId, sourceCorrelationId);
    }, this.DEBOUNCE_MS);

    this.debounceTimers.set(key, timer);
    this.logger.debug('carta-impresion.regenerate.scheduled', {
      project_id: projectId, carta_id: cartaId, debounce_ms: this.DEBOUNCE_MS
    });
  }

  async dispatchGeneracion(projectId, cartaId, sourceCorrelationId = null) {
    this.logger.info('carta-impresion.generacion.iniciada', {
      project_id: projectId, carta_id: cartaId
    });

    await this.eventBus.publish('agent.execute.request', {
      correlation_id: sourceCorrelationId || crypto.randomUUID(),
      request_id: crypto.randomUUID(),
      user_id: 'system',
      agent_name: 'impresion-architect',
      project_id: projectId,
      timestamp: new Date().toISOString(),
      context: {
        carta_id: cartaId
      },
      task: `Analiza la carta "${cartaId}" del proyecto "${projectId}" y decide el layout óptimo para impresión. Luego dispara al builder pasándole tu guión.`
    });

    this.metrics?.increment('carta-impresion.generacion.requested');
  }

  // ==========================================
  // Persistence
  // ==========================================

  cartasImpresionDirFor(projectId) {
    const basePath = this.projectPaths.get(projectId);
    if (!basePath) return null;
    return path.join(basePath, 'cartas-impresion');
  }

  async saveHtml(projectId, cartaId, html, metadata = {}) {
    const dir = this.cartasImpresionDirFor(projectId);
    if (!dir) throw new Error('No path for project');

    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${cartaId}.html`);
    await fs.writeFile(filePath, html, 'utf-8');

    const metaPath = path.join(dir, `${cartaId}.meta.json`);
    const metaData = {
      carta_id: cartaId,
      project_id: projectId,
      generado_at: new Date().toISOString(),
      ...metadata
    };
    await fs.writeFile(metaPath, JSON.stringify(metaData, null, 2), 'utf-8');

    const key = `${projectId}:${cartaId}`;
    this.htmlCache.set(key, { filePath, metadata: metaData });

    await this.eventBus.publish('carta.impresion.lista', {
      project_id: projectId,
      carta_id: cartaId,
      path: filePath,
      metadata: metaData
    });

    this.metrics?.increment('carta-impresion.generacion.completada');
    this.logger.info('carta-impresion.html.saved', {
      project_id: projectId, carta_id: cartaId, path: filePath
    });

    return filePath;
  }

  async loadHtml(projectId, cartaId) {
    const dir = this.cartasImpresionDirFor(projectId);
    if (!dir) return null;

    const filePath = path.join(dir, `${cartaId}.html`);
    const metaPath = path.join(dir, `${cartaId}.meta.json`);

    try {
      const html = await fs.readFile(filePath, 'utf-8');
      let metadata = null;
      try {
        metadata = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
      } catch (_) {}
      return { html, filePath, metadata };
    } catch (_) {
      return null;
    }
  }

  // ==========================================
  // Tools
  // ==========================================

  async toolSaveHtml({ project_id, carta_id, html, layout, brand_applied }) {
    if (!project_id || !carta_id || !html) {
      return { status: 400, error: 'Se requiere project_id, carta_id y html' };
    }
    try {
      const filePath = await this.saveHtml(project_id, carta_id, html, {
        layout, brand_applied
      });
      return {
        status: 200,
        data: { path: filePath, message: `Carta imprimible guardada en ${filePath}` }
      };
    } catch (err) {
      return { status: 500, error: err.message };
    }
  }

  async toolGet({ project_id, carta_id }) {
    if (!project_id || !carta_id) {
      return { status: 400, error: 'Se requiere project_id y carta_id' };
    }
    const result = await this.loadHtml(project_id, carta_id);
    if (!result) {
      return {
        status: 404,
        error: 'No hay versión imprimible todavía. Usa carta.impresion.generar para crearla.'
      };
    }
    return { status: 200, data: result };
  }

  async toolGenerar({ project_id, carta_id, correlation_id }) {
    if (!project_id || !carta_id) {
      return { status: 400, error: 'Se requiere project_id y carta_id' };
    }
    await this.dispatchGeneracion(project_id, carta_id, correlation_id || null);
    return {
      status: 202,
      data: { message: `Generación iniciada para carta "${carta_id}". Los agentes están trabajando.` }
    };
  }

  // ==========================================
  // UI Handlers
  // ==========================================

  async handleGet(data) {
    return (await this.toolGet(data)).data;
  }

  async handleGenerar(data) {
    return (await this.toolGenerar(data)).data;
  }

  async handleHealth() {
    return {
      status: 'healthy', module: this.name, version: this.version,
      cartas_en_cache: this.htmlCache.size,
      proyectos: this.projectPaths.size
    };
  }
}

module.exports = CartaImpresionModule;
