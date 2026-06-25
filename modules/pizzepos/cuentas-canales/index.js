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

const crypto = require('crypto');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const MesaStrategy = require('./strategies/mesa');
const TelefonoStrategy = require('./strategies/telefono');
const LlevarStrategy = require('./strategies/llevar');
const GlovoStrategy = require('./strategies/glovo');
const WhatsAppStrategy = require('./strategies/whatsapp');
const LlevadooStrategy = require('./strategies/llevadoo');

const BaseModule = require('../../_shared/base-module');
class CuentasCanalesModule extends BaseModule {
  constructor() {
    super();
    this.name = 'cuentas-canales';
    this.version = '5.0.0';

    // Dependencias (inyectadas en onLoad)
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
  // Helpers POC2
  // ==========================================

  _errorResponse(status, code, message, details) {
    const error = { code, message };
    if (details !== undefined) error.details = details;
    return { status, error };
  }

  _classifyHandlerError(err) {
    const msg = err?.message || String(err);
    const code = err?.code;
    if (code === 'ENOENT') return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    if (/required|invalid|missing|requerido/i.test(msg)) return { status: 400, code: 'INVALID_INPUT' };
    if (/not found|no encontrado|no disponible/i.test(msg)) return { status: 404, code: 'RESOURCE_NOT_FOUND' };
    return { status: 500, code: 'UNKNOWN_ERROR' };
  }

  _handleHandlerError(logEvent, err, kind = 'handler') {
    const { status, code } = this._classifyHandlerError(err);
    this.logger?.error?.(logEvent, {
      kind,
      error_code: code,
      error_message: err?.message || String(err)
    });
    this.metrics?.increment?.('cuentas-canales.errors', { code, kind });
    return this._errorResponse(status, code, err?.message || 'Error interno');
  }

  async _publicarEvento(name, payload, sourcePayload) {
    const correlation_id =
      payload?.correlation_id ||
      sourcePayload?.correlation_id ||
      sourcePayload?.metadata?.correlationId ||
      null;
    const project_id =
      payload?.project_id ??
      sourcePayload?.project_id ??
      null;
    const enriched = {
      ...payload,
      correlation_id,
      timestamp: payload?.timestamp || new Date().toISOString()
    };
    if (project_id !== null && project_id !== undefined) enriched.project_id = project_id;
    await this.eventBus.publish(name, enriched);
    return enriched;
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

    // tools.contract v1.2: el loader auto-wirea TODAS las tools[] del module.json
    // (tanto las del padre 'canales.*' como las 60 de strategies/* con handlers
    // tipo 'strategies.<canal>.handleX') a uiHandler. No registro manual.

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

    // El loader desregistra todas las tools[] (incluidas las de strategies/*)
    // automaticamente via unregisterToolsForAI.

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
   * Cada strategy declara un solo prefijo de palabra completa
   * (mesa_, llevar_, telefono_, whatsapp_, glovo_, llevadoo_).
   */
  detectarCanal(cuenta_id) {
    if (!cuenta_id) return null;
    for (const strategy of Object.values(this.strategies)) {
      if (cuenta_id.startsWith(strategy.prefijo)) return strategy;
    }
    // Compat con cuenta_id legacy de telefono que usaba 'tel_'
    if (cuenta_id.startsWith('tel_')) return this.strategies['telefono'] || null;
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
  // Webhook HTTP de Glovo (push de pedidos en tiempo real)
  // ==========================================
  //
  // Ruta publica (Caddy reescribe /glovo/* → /modules/cuentas-canales/glovo/*):
  //   POST https://<dominio>/glovo/webhook/:project
  //
  // Auth: token estatico del Vendor Portal de Glovo, en cabecera. No requiere
  // raw body (el core no lo expone) → no HMAC. La firma RSA (Glovo-Signature)
  // queda para una fase 2 que añada captura de raw body al gateway.

  /**
   * Compara el token de la cabecera con el GLOVO_WEBHOOK_TOKEN configurado.
   * Cerrado por defecto: sin token configurado → rechaza. Timing-safe.
   * @private
   */
  _checkGlovoToken(headers = {}, projectId = null) {
    // Token POR PROYECTO primero (lo escribe credential-manager: Glovo nivel
    // PROJECT → GLOVO_WEBHOOK_TOKEN_API_KEY_PROJECT_<slug>); luego fallback plano.
    const perProject = projectId
      ? process.env[`GLOVO_WEBHOOK_TOKEN_API_KEY_PROJECT_${projectId}`]
      : undefined;
    const expected = perProject
      || process.env.GLOVO_WEBHOOK_TOKEN
      || process.env.GLOVO_WEBHOOK_TOKEN_GLOBAL
      || this.config?.glovo?.webhook_token
      || '';
    if (!expected) return false; // sin secreto → puerta cerrada

    const headerName = (this.config?.glovo?.webhook_token_header || 'authorization').toLowerCase();
    let provided = headers[headerName]
      || headers['glovo-token']
      || headers['x-glovo-token']
      || '';
    if (typeof provided !== 'string') provided = String(provided || '');
    if (provided.toLowerCase().startsWith('bearer ')) provided = provided.slice(7);
    if (!provided) return false;

    try {
      const a = Buffer.from(provided);
      const b = Buffer.from(String(expected));
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch (_) {
      return false;
    }
  }

  /** @private */
  _respondWebhook(res, status, body) {
    if (res && typeof res.status === 'function' && !res.headersSent) {
      try { return res.status(status).json({ status, ...body }); } catch (_) { /* fallthrough */ }
    }
    return { status, ...body };
  }

  /**
   * Webhook de Glovo. Valida el token, extrae el order_id y delega en la
   * strategy glovo (que trae el detalle via API y crea la cuenta).
   *
   * Codigos: 401 token invalido · 400 sin order_id · 200 aceptado (incluye
   * duplicado, idempotente) · 5xx error → Glovo reintenta con backoff.
   */
  async handleGlovoWebhook(req, res) {
    const headers = req?.headers || {};
    const project_id = req?.params?.project || null;
    const body = req?.body || {};

    if (!this._checkGlovoToken(headers, project_id)) {
      this.logger?.warn?.('glovo.webhook.token_invalido', { project_id });
      this.metrics?.increment?.('cuentas-canales.errors', { code: 'AUTHENTICATION_REQUIRED', kind: 'glovo_webhook' });
      return this._respondWebhook(res, 401, { error: { code: 'AUTHENTICATION_REQUIRED', message: 'token de webhook invalido' } });
    }

    const orderId = body.order_id || body.orderId || body.id || null;
    if (!orderId) {
      return this._respondWebhook(res, 400, { error: { code: 'INVALID_INPUT', message: 'order_id requerido' } });
    }

    try {
      const result = await this.strategies.glovo.handleWebhookEntrante({
        glovo_order_id: orderId,
        project_id,
        rawOrder: body
      });

      // Idempotencia: 409 (ya existe) cuenta como aceptado → 200 (Glovo no reintenta).
      const dup = result?.status === 409;
      const ok = dup || (result?.status >= 200 && result?.status < 300);

      this.logger?.info?.('glovo.webhook.recibido', {
        glovo_order_id: orderId, project_id, status: result?.status, duplicate: dup
      });
      this.metrics?.increment?.('glovo.webhook.recibido', { resultado: ok ? 'ok' : 'fail' });

      if (ok) return this._respondWebhook(res, 200, { received: true, duplicate: dup });

      // Error de mapeo/negocio → 502 para que Glovo reintente.
      return this._respondWebhook(res, 502, { error: result?.error || { code: 'UNKNOWN_ERROR', message: 'pedido no procesado' } });
    } catch (err) {
      this.logger?.error?.('glovo.webhook.error', { glovo_order_id: orderId, project_id, error: err.message });
      this.metrics?.increment?.('cuentas-canales.errors', { code: 'UNKNOWN_ERROR', kind: 'glovo_webhook' });
      return this._respondWebhook(res, 500, { error: { code: 'UNKNOWN_ERROR', message: 'error interno' } });
    }
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
    await this._publicarEvento('cuenta.cerrada', {
      cuenta_id: data.cuenta_id,
      tipo: data.tipo,
      project_id: data.project_id,
      total: data.total || 0,
      metadata: data.metadata || {}
    }, { correlation_id: correlationId, project_id: data.project_id });
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
