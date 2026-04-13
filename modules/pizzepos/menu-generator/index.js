/**
 * Menu Generator v6.0.0 — Generador puro
 *
 * Responsabilidad única: generar una carta estructurada en JSON
 * a partir de cualquier input (foto, PDF, texto, audio, dictado, recetas, scraping).
 *
 * NO guarda. NO versiona. NO hace CRUD. NO busca. NO edita.
 * Genera y entrega. El resultado lo recoge carta-manager u otro consumidor.
 *
 * Flujo:
 *   1. Recibe input (cualquier formato)
 *   2. Pregunta el nombre si no lo tiene
 *   3. Delega a agentes (menu-extractor → menu-structurer) via pipeline
 *   4. Emite menu.generated con la carta estructurada
 *
 * Tools:
 *   menu.generate — Genera carta desde cualquier input
 */

class MenuGeneratorModule {
  constructor() {
    this.name = 'menu-generator';
    this.version = '6.0.0';
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
  }

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    this.metrics = context.metrics;
    this.logger.info('module.loaded', { module: this.name, version: this.version });
  }

  async onUnload() {
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Tool — el único: generar
  // ==========================================

  /**
   * Genera una carta estructurada desde cualquier input.
   *
   * Acepta texto crudo, resultados de OCR, listas dictadas, JSON parcial,
   * contenido de recetas — cualquier cosa que describa productos de un menú.
   *
   * Si recibe un filePath (PDF/imagen), dispara el pipeline completo
   * (menu-extractor → menu-structurer) via evento.
   *
   * Si recibe texto, dispara solo menu-structurer.
   *
   * @param {string} nombre - Nombre de la carta (OBLIGATORIO — siempre preguntar)
   * @param {string} texto - Contenido textual del menú
   * @param {string} filePath - Ruta a archivo PDF/imagen (alternativa a texto)
   * @param {string} project_id - ID del proyecto
   */
  async toolGenerate({ nombre, texto, filePath, project_id }) {
    if (!nombre) {
      return {
        status: 400,
        error: 'Se requiere "nombre" para la carta. Pregunta al usuario cómo quiere llamarla antes de generar.'
      };
    }

    if (!texto && !filePath) {
      return {
        status: 400,
        error: 'Se requiere "texto" (contenido del menú) o "filePath" (ruta a PDF/imagen)'
      };
    }

    if (!project_id) {
      return { status: 400, error: 'Se requiere "project_id"' };
    }

    const requestId = `menu_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

    if (filePath) {
      // Pipeline completo: extractor → structurer
      await this.eventBus.publish('menu.document.request', {
        requestId,
        filePath,
        projectId: project_id,
        nombre
      });

      this.logger.info('menu.generate.document_pipeline', {
        requestId, filePath, project_id, nombre
      });
      this.metrics?.increment('menu.generate.requested');

      return {
        status: 202,
        data: {
          requestId,
          pipeline: 'document',
          agents: ['menu-extractor', 'menu-structurer'],
          message: `Pipeline de extracción iniciado para "${nombre}". Los agentes procesarán el documento y generarán la carta.`
        }
      };
    }

    // Pipeline rápido: solo structurer
    await this.eventBus.publish('menu.text.request', {
      requestId,
      texto,
      projectId: project_id,
      nombre
    });

    this.logger.info('menu.generate.text_pipeline', {
      requestId, project_id, nombre, texto_length: texto.length
    });
    this.metrics?.increment('menu.generate.requested');

    return {
      status: 202,
      data: {
        requestId,
        pipeline: 'text',
        agents: ['menu-structurer'],
        message: `Generando carta "${nombre}" desde texto. El agente structurer la procesará.`
      }
    };
  }

  // ==========================================
  // UI Handler
  // ==========================================

  async handleGenerate(data) {
    const result = await this.toolGenerate(data);
    if (result.error) {
      throw { status: result.status || 400, code: 'GENERATE_ERROR', message: result.error };
    }
    return result.data;
  }

  async handleHealth() {
    return {
      status: 'healthy',
      module: this.name,
      version: this.version
    };
  }
}

module.exports = MenuGeneratorModule;
