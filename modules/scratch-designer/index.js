/**
 * Scratch Designer Module
 * Sistema de bloques tipo Scratch para diseño visual de UI
 *
 * @version 2.0.0
 * @author Event Core Team
 */

const path = require('path');
const BlockGenerator = require('./lib/blocks');
const DesignManager = require('./lib/designs');
const DesignExporter = require('./lib/export');

class ScratchDesigner {
  constructor() {
    this.name = 'scratch-designer';
    this.version = '2.0.0';

    // Dependencias (inyectadas por core)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;

    // Submódulos
    this.blockGenerator = null;
    this.designManager = new DesignManager();
    this.exporter = new DesignExporter();

    // Cache
    this.blocksCache = null;

    // Métricas internas
    this._metrics = {
      designs_created: 0,
      designs_exported: 0,
      api_calls: 0,
      errors: 0
    };
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;

    this.logger.info('modulo.loading', { module: this.name });

    // Cargar generador de bloques
    const inventoryPath = path.join(__dirname, '../../INVENTARIO-SISTEMA.json');
    this.blockGenerator = new BlockGenerator(inventoryPath);
    this.blocksCache = this.blockGenerator.generateAll();

    this.logger.info('modulo.loaded', {
      module: this.name,
      blocks_categories: Object.keys(this.blocksCache).length,
      inventory_loaded: !!this.blockGenerator.inventory
    });
  }

  async onUnload() {
    this.logger.info('modulo.unloading', { module: this.name });
    this.blocksCache = null;
  }

  // ==========================================
  // HTTP API Handlers - Blocks
  // ==========================================

  handleGetAllBlocks(req, res, context) {
    this._trackApiCall('blocks.all', context);
    res.json({ success: true, blocks: this.blocksCache });
  }

  handleGetModuleBlocks(req, res, context) {
    this._trackApiCall('blocks.modules', context);
    res.json({ success: true, blocks: this.blocksCache.modulo });
  }

  handleGetEventBlocks(req, res, context) {
    this._trackApiCall('blocks.events', context);
    res.json({ success: true, blocks: this.blocksCache.evento });
  }

  handleGetActionBlocks(req, res, context) {
    this._trackApiCall('blocks.actions', context);
    res.json({ success: true, blocks: this.blocksCache.accion });
  }

  handleGetComponentBlocks(req, res, context) {
    this._trackApiCall('blocks.components', context);
    res.json({ success: true, blocks: this.blocksCache.componente });
  }

  handleGetContainerBlocks(req, res, context) {
    this._trackApiCall('blocks.containers', context);
    res.json({ success: true, blocks: this.blocksCache.contenedor });
  }

  handleGetDataBlocks(req, res, context) {
    this._trackApiCall('blocks.data', context);
    res.json({ success: true, blocks: this.blocksCache.datos });
  }

  handleGetConditionBlocks(req, res, context) {
    this._trackApiCall('blocks.conditions', context);
    res.json({ success: true, blocks: this.blocksCache.condicion });
  }

  // ==========================================
  // HTTP API Handlers - Designs CRUD
  // ==========================================

  handleListDesigns(req, res, context) {
    this._trackApiCall('designs.list', context);
    const designs = this.designManager.list();
    res.json({ success: true, designs, total: designs.length });
  }

  handleCreateDesign(req, res, context) {
    const start = Date.now();
    this._trackApiCall('designs.create', context);

    try {
      const design = this.designManager.create(req.body);

      this._metrics.designs_created++;
      this._recordMetrics('design.created', start);

      this._publishEvent('scratch.design.created', {
        design_id: design.id,
        nombre: design.nombre
      }, context);

      this.logger.info('design.created', {
        design_id: design.id,
        correlation_id: context?.correlationId,
        duration: Date.now() - start
      });

      res.status(201).json({ success: true, design });
    } catch (error) {
      this._handleError('designs.create', error, context, res);
    }
  }

  handleGetDesign(req, res, context) {
    this._trackApiCall('designs.get', context);
    const design = this.designManager.get(req.params.id);

    if (!design) {
      return res.status(404).json({ success: false, error: 'Design not found' });
    }

    res.json({ success: true, design });
  }

  handleUpdateDesign(req, res, context) {
    const start = Date.now();
    this._trackApiCall('designs.update', context);

    try {
      const design = this.designManager.update(req.params.id, req.body);

      if (!design) {
        return res.status(404).json({ success: false, error: 'Design not found' });
      }

      this._recordMetrics('design.updated', start);

      this._publishEvent('scratch.design.updated', {
        design_id: design.id
      }, context);

      this.logger.info('design.updated', {
        design_id: design.id,
        correlation_id: context?.correlationId,
        duration: Date.now() - start
      });

      res.json({ success: true, design });
    } catch (error) {
      this._handleError('designs.update', error, context, res);
    }
  }

  handleDeleteDesign(req, res, context) {
    this._trackApiCall('designs.delete', context);
    const deleted = this.designManager.delete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Design not found' });
    }

    this._publishEvent('scratch.design.deleted', {
      design_id: req.params.id
    }, context);

    this.logger.info('design.deleted', {
      design_id: req.params.id,
      correlation_id: context?.correlationId
    });

    res.json({ success: true });
  }

  handleDuplicateDesign(req, res, context) {
    this._trackApiCall('designs.duplicate', context);
    const duplicate = this.designManager.duplicate(req.params.id);

    if (!duplicate) {
      return res.status(404).json({ success: false, error: 'Design not found' });
    }

    this._metrics.designs_created++;

    res.json({ success: true, design: duplicate });
  }

  // ==========================================
  // HTTP API Handlers - Validation
  // ==========================================

  handleValidateConnection(req, res, context) {
    this._trackApiCall('validate.connection', context);
    const { bloque_origen, bloque_destino, tipo_conexion } = req.body;

    const origen = this.blockGenerator.findBlockDefinition(bloque_origen?.tipo);
    const destino = this.blockGenerator.findBlockDefinition(bloque_destino?.tipo);

    if (!origen || !destino) {
      return res.json({ valid: false, error: 'Bloque no encontrado' });
    }

    let valid = false;
    let error = null;

    switch (tipo_conexion) {
      case 'abajo':
        valid = origen.conexiones?.abajo && destino.conexiones?.arriba;
        if (!valid) error = 'Los bloques no pueden conectarse verticalmente';
        break;
      case 'hijo':
        valid = origen.acepta_hijos === true;
        if (origen.acepta_tipos && !origen.acepta_tipos.includes(bloque_destino.tipo)) {
          valid = false;
          error = `Este contenedor solo acepta: ${origen.acepta_tipos.join(', ')}`;
        }
        break;
      default:
        error = 'Tipo de conexion no valido';
    }

    res.json({ valid, error });
  }

  handleValidateDesign(req, res, context) {
    this._trackApiCall('validate.design', context);
    const { bloques = [], conexiones = [] } = req.body;
    const errores = [];

    // Validar que hay al menos una pantalla
    const pantallas = bloques.filter(b => b.tipo === 'screen');
    if (pantallas.length === 0) {
      errores.push('El diseño debe tener al menos una pantalla');
    }

    // Validar props requeridos
    bloques.forEach(bloque => {
      const def = this.blockGenerator.findBlockDefinition(bloque.tipo);
      if (def?.props) {
        Object.entries(def.props).forEach(([prop, config]) => {
          if (config.requerido && !bloque.props?.[prop]) {
            errores.push(`Bloque "${bloque.tipo}": falta prop requerido "${prop}"`);
          }
        });
      }
    });

    res.json({ valid: errores.length === 0, errores, warnings: [] });
  }

  // ==========================================
  // HTTP API Handlers - Export
  // ==========================================

  handleExportJSON(req, res, context) {
    const start = Date.now();
    this._trackApiCall('export.json', context);

    const design = this.designManager.get(req.body.design_id);
    if (!design) {
      return res.status(404).json({ success: false, error: 'Design not found' });
    }

    const json = this.exporter.toJSON(design);

    this._metrics.designs_exported++;
    this._recordMetrics('design.exported', start);

    this._publishEvent('scratch.design.exported', {
      design_id: design.id,
      format: 'json'
    }, context);

    this.logger.info('design.exported', {
      design_id: design.id,
      format: 'json',
      correlation_id: context?.correlationId,
      duration: Date.now() - start
    });

    res.json({ success: true, format: 'json', output: json });
  }

  handleExportModuleUI(req, res, context) {
    this._trackApiCall('export.module-ui', context);

    const design = this.designManager.get(req.body.design_id);
    if (!design) {
      return res.status(404).json({ success: false, error: 'Design not found' });
    }

    const moduleUI = this.exporter.toModuleUI(design);
    this._metrics.designs_exported++;

    res.json({ success: true, format: 'module-ui', output: moduleUI });
  }

  // ==========================================
  // HTTP API Handlers - Observability
  // ==========================================

  handleHealthCheck(req, res, context) {
    res.json({
      status: 'healthy',
      module: this.name,
      version: this.version,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      stats: {
        blocks_loaded: Object.keys(this.blocksCache || {}).length,
        designs_count: this.designManager.count(),
        inventory_loaded: !!this.blockGenerator?.inventory
      }
    });
  }

  handleGetMetrics(req, res, context) {
    res.json({
      counters: {
        'design.created.total': this._metrics.designs_created,
        'design.exported.total': this._metrics.designs_exported,
        'api.calls.total': this._metrics.api_calls,
        'errors.total': this._metrics.errors
      },
      gauges: {
        'designs.active.count': this.designManager.count(),
        'blocks.categories.count': Object.keys(this.blocksCache || {}).length
      }
    });
  }

  // ==========================================
  // Internal Helpers
  // ==========================================

  _trackApiCall(operation, context) {
    this._metrics.api_calls++;
    if (this.metrics?.increment) {
      this.metrics.increment('scratch.api.calls', 1, { operation });
    }
  }

  _recordMetrics(event, startTime) {
    const duration = Date.now() - startTime;
    if (this.metrics?.timing) {
      this.metrics.timing(`scratch.${event}.duration`, duration);
    }
    if (this.metrics?.increment) {
      this.metrics.increment(`scratch.${event}.total`);
    }
  }

  _publishEvent(eventName, payload, context) {
    if (this.eventBus?.publish) {
      this.eventBus.publish(eventName, payload, {
        correlationId: context?.correlationId
      });
    }
  }

  _handleError(operation, error, context, res) {
    this._metrics.errors++;
    if (this.metrics?.increment) {
      this.metrics.increment('scratch.errors.total', 1, { operation });
    }

    this.logger.error(`scratch.${operation}.error`, {
      error: error.message,
      stack: error.stack,
      correlation_id: context?.correlationId
    });

    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = ScratchDesigner;
