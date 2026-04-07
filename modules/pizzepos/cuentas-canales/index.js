/**
 * Módulo Cuentas Canales v3.0
 * Sistema unificado de canales de venta con patrón Strategy
 * Un solo módulo gestiona: mesa, teléfono, llevar, glovo, whatsapp
 *
 * Cada canal es un Strategy independiente que se registra en este módulo base.
 * El módulo base proporciona:
 *   - Lifecycle común (onLoad/onUnload)
 *   - Gestión de cobro.procesado → delega al canal correcto por prefijo
 *   - Reseteo diario de contadores
 *   - Contadores secuenciales por canal
 *   - Tracking de tiempos con promedios rolling
 *   - Publishers comunes: cuenta.creada, cuenta.cerrada
 *   - Health y métricas agregadas
 *
 * Emite: cuenta.creada, cuenta.cerrada (+ eventos específicos de cada canal)
 * Consume: cobro.procesado (+ eventos específicos de cada canal)
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const MesaStrategy = require('./strategies/mesa');
const TelefonoStrategy = require('./strategies/telefono');
const LlevarStrategy = require('./strategies/llevar');
const GlovoStrategy = require('./strategies/glovo');
const WhatsAppStrategy = require('./strategies/whatsapp');
const LlevadooStrategy = require('./strategies/llevadoo');

class CuentasCanalesModule {
  constructor() {
    this.name = 'cuentas-canales';
    this.version = '4.0.0';

    // Dependencias (inyectadas en onLoad)
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;
    this.uiHandler = null;
    this.config = {};

    // AJV compartido — una sola instancia para todas las strategies
    this.ajv = new Ajv({ allErrors: true, useDefaults: true });
    addFormats(this.ajv);

    // Tracking de fecha (para reseteos diarios de metricas internas de strategies)
    this.fechaActual = this.getFechaActual();
    this._resetInterval = null;

    // Tracking de tiempos (utilidad compartida)
    this._timeArrays = {};

    // Strategies registradas
    this.strategies = {};
    this.registerStrategy(new MesaStrategy());
    this.registerStrategy(new TelefonoStrategy());
    this.registerStrategy(new LlevarStrategy());
    this.registerStrategy(new GlovoStrategy());
    this.registerStrategy(new WhatsAppStrategy());
    this.registerStrategy(new LlevadooStrategy());
  }

  registerStrategy(strategy) {
    this.strategies[strategy.tipo] = strategy;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;
    this.moduleRegistry = core.moduleRegistry;
    this.config = core.config || {};

    this.logger.info('module.loading', {
      module: this.name,
      version: this.version,
      canales: Object.keys(this.strategies)
    });

    // Inicializar cada strategy (carga schemas, config)
    for (const strategy of Object.values(this.strategies)) {
      await strategy.init(this);
    }

    // Suscripción COMÚN: cobro procesado → detectar canal → cerrar
    await this.eventBus.subscribe('cobro.procesado', this.onCobroProcesado.bind(this));

    // Suscripciones específicas por canal
    for (const strategy of Object.values(this.strategies)) {
      await strategy.subscribeToEvents(this.eventBus);
    }

    // UI Handlers específicos por canal + agregados
    if (this.uiHandler) {
      for (const strategy of Object.values(this.strategies)) {
        strategy.registerUIHandlers(this.uiHandler);
      }
      this.uiHandler.register('canales', 'health', this.handleHealthCheck.bind(this));
      this.uiHandler.register('canales', 'metrics', this.handleGetMetrics.bind(this));
      this.uiHandler.register('canales', 'list', this.handleGetCanales.bind(this));
    }

    this.iniciarReseoDiario();

    this.logger.info('module.loaded', {
      module: this.name,
      canales_activos: Object.keys(this.strategies).length
    });
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    if (this._resetInterval) {
      clearInterval(this._resetInterval);
      this._resetInterval = null;
    }

    if (this.uiHandler) {
      for (const strategy of Object.values(this.strategies)) {
        strategy.unregisterUIHandlers(this.uiHandler);
      }
      this.uiHandler.unregister('canales', 'health');
      this.uiHandler.unregister('canales', 'metrics');
      this.uiHandler.unregister('canales', 'list');
    }

    for (const strategy of Object.values(this.strategies)) {
      strategy.cleanup();
    }

    this._timeArrays = {};

    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Evento Común: cobro.procesado
  // ==========================================

  async onCobroProcesado(event) {
    const eventData = event?.data || event?.payload || event;
    const correlationId = event?.metadata?.correlationId;
    const { cuenta_id, project_id } = eventData;

    if (!cuenta_id) return;

    const strategy = this.detectarCanal(cuenta_id);
    if (!strategy) return;

    try {
      await strategy.onCobroProcesado(cuenta_id, correlationId, project_id);

      this.logger.info('canales.cobro_procesado', {
        correlation_id: correlationId,
        canal: strategy.tipo,
        cuenta_id
      });
    } catch (error) {
      this.logger.error('canales.cobro.error', {
        correlation_id: correlationId,
        canal: strategy.tipo,
        cuenta_id,
        error: error.message
      });
    }
  }

  /**
   * Identifica la strategy a la que pertenece un cuenta_id por prefijo.
   * Soporta el formato nuevo `{LETRA}_{uuid8}` (prefijo) y los formatos
   * legacy heredados (mesa_, llevar_, tel_, wa_, glovo_, llevadoo_) para
   * que las cuentas creadas antes de la migración sigan resolviéndose.
   */
  detectarCanal(cuenta_id) {
    for (const strategy of Object.values(this.strategies)) {
      if (cuenta_id.startsWith(strategy.prefijo)) return strategy;
      if (strategy.prefijoLegacy && cuenta_id.startsWith(strategy.prefijoLegacy)) {
        return strategy;
      }
    }
    return null;
  }

  // ==========================================
  // UI Handlers Agregados
  // ==========================================

  async handleHealthCheck() {
    const canalHealth = {};
    for (const [tipo, strategy] of Object.entries(this.strategies)) {
      canalHealth[tipo] = strategy.getHealth();
    }

    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        canales: canalHealth
      }
    };
  }

  async handleGetMetrics() {
    const canalMetrics = {};
    for (const [tipo, strategy] of Object.entries(this.strategies)) {
      canalMetrics[tipo] = strategy.getMetrics();
    }

    return {
      status: 200,
      data: {
        module: this.name,
        canales: canalMetrics
      }
    };
  }

  async handleGetCanales() {
    return {
      status: 200,
      data: {
        canales: Object.entries(this.strategies).map(([tipo, s]) => ({
          tipo,
          prefijo: s.prefijo,
          version: s.version,
          cuentas_activas: s.getCuentasActivas()
        }))
      }
    };
  }

  // ==========================================
  // Delegacion a cuentas (owner unico)
  // ==========================================
  //
  // Llamada directa a la instancia de `cuentas` via moduleRegistry. cuentas
  // carga antes que cuentas-canales en config.modules.enabled, asi que la
  // instancia esta disponible cuando cada strategy ejecuta su init/handler.

  /** @private */
  _cuentasInstance() {
    const instance = this.moduleRegistry?.get('cuentas')?.instance;
    if (!instance) {
      throw new Error('Modulo cuentas no disponible');
    }
    return instance;
  }

  /**
   * Crea una cuenta delegando a cuentas.handleCreateCuenta.
   * Devuelve el objeto cuenta (no el envelope {status, data}).
   * Lanza si cuentas no esta disponible o el handler falla.
   *
   * @param {object} data - { project_id, tipo, nombre?, total?, metadata?, cuenta_id? }
   * @returns {Promise<object>} objeto cuenta con { id, turno, ref_display, ... }
   */
  async crearCuentaViaCuentas(data) {
    const result = await this._cuentasInstance().handleCreateCuenta(data);
    if (!result || result.status >= 400) {
      const err = new Error(result?.error || 'Error creando cuenta');
      err.status = result?.status || 500;
      throw err;
    }
    return result.data;
  }

  /**
   * Renombra una cuenta delegando a cuentas.handleRenameCuenta.
   * Simetrica a crearCuentaViaCuentas — unico camino de rename desde strategies.
   *
   * @param {object} data - { project_id, id, nombre }
   * @returns {Promise<object>} { status, data: { nombre_anterior, nombre_nuevo } }
   */
  async renombrarCuentaViaCuentas(data) {
    return await this._cuentasInstance().handleRenameCuenta(data);
  }

  async publishCuentaCerrada(data, correlationId) {
    await this.eventBus.publish('cuenta.cerrada', {
      cuenta_id: data.cuenta_id,
      tipo: data.tipo,
      project_id: data.project_id,
      total: data.total || 0,
      metadata: data.metadata || {}
    }, { correlationId });
  }

  // ==========================================
  // Helpers Comunes
  // ==========================================
  //
  // El ref_display canónico lo genera el módulo `cuentas` usando su contador
  // global de turnos. Este módulo no construye ref_display — solo publica
  // cuenta.creada sin ese campo y deja que `cuentas` lo complete vía
  // cuenta.actualizada. Ver cuentas/index.js:generateRefDisplay().

  getFechaActual() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  verificarReseoDiario() {
    const fechaActual = this.getFechaActual();
    if (fechaActual !== this.fechaActual) {
      this.logger.info('canales.cambio_dia', {
        fecha_anterior: this.fechaActual,
        fecha_nueva: fechaActual
      });
      this.fechaActual = fechaActual;
    }
  }

  iniciarReseoDiario() {
    this._resetInterval = setInterval(() => {
      this.verificarReseoDiario();
    }, 60 * 60 * 1000);
  }

  calcularTiempoMinutos(desde) {
    const ahora = new Date();
    const inicio = new Date(desde);
    return Math.floor((ahora - inicio) / 1000 / 60);
  }

  trackTiempo(nombre, valor) {
    if (!this._timeArrays[nombre]) {
      this._timeArrays[nombre] = { values: [], avg: 0 };
    }
    const tracker = this._timeArrays[nombre];
    tracker.values.push(valor);
    if (tracker.values.length > 100) {
      tracker.values.shift();
    }
    tracker.avg = tracker.values.reduce((a, b) => a + b, 0) / tracker.values.length;
    return tracker.avg;
  }

  getPromedioTiempo(nombre) {
    return this._timeArrays[nombre]?.avg || 0;
  }

  /**
   * Carga un schema AJV de forma segura (ignora si ya está registrado)
   */
  safeAddSchema(schema) {
    try {
      if (!this.ajv.getSchema(schema.$id)) {
        this.ajv.addSchema(schema);
      }
    } catch (err) {
      this.logger?.warn('canales.schema.error', { id: schema.$id, error: err.message });
    }
  }

}

module.exports = CuentasCanalesModule;
