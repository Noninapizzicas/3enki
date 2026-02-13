/**
 * Módulo AI Gateway v2.0
 * Gateway unificado para múltiples proveedores LLM - 100% Event-Driven
 */

const DeepSeekProvider = require('./providers/deepseek-provider');
const AnthropicProvider = require('./providers/anthropic-provider');
const OpenAIProvider = require('./providers/openai-provider');
const OllamaProvider = require('./providers/ollama-provider');

class AIGatewayModule {
  constructor() {
    this.name = 'ai-gateway';
    this.version = '2.0.0';

    // Estado
    this.providers = new Map(); // provider_name -> provider_instance
    this.usage = new Map(); // provider_name -> usage_stats
    this.requestsInProgress = new Map(); // request_id -> start_time

    // Dependencias (inyectadas)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.config = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.config = core.moduleConfig || {};

    this.logger.info('modulo.loading', { module: this.name });

    // Inicializar proveedores
    await this.initializeProviders();

    // Suscribirse a eventos
    await this.subscribeToEvents();

    this.logger.info('modulo.loaded', {
      module: this.name,
      providers: Array.from(this.providers.keys())
    });
  }

  async onUnload() {
    const totalRequests = Array.from(this.usage.values())
      .reduce((sum, u) => sum + u.requests, 0);
    const totalCost = Array.from(this.usage.values())
      .reduce((sum, u) => sum + u.cost, 0);

    this.logger.info('modulo.unloading', {
      module: this.name,
      total_requests: totalRequests,
      total_cost: totalCost.toFixed(4)
    });
  }

  // ==========================================
  // Provider Initialization
  // ==========================================

  async initializeProviders() {
    const providerClasses = {
      deepseek: DeepSeekProvider,
      anthropic: AnthropicProvider,
      openai: OpenAIProvider,
      ollama: OllamaProvider
    };

    const providersConfig = this.config.providers || {};

    for (const [name, ProviderClass] of Object.entries(providerClasses)) {
      const providerConfig = providersConfig[name];

      if (providerConfig && providerConfig.enabled) {
        try {
          // Inject eventBus for credential resolution
          const provider = new ProviderClass(providerConfig, this.logger, this.eventBus);
          await provider.initialize();

          this.providers.set(name, provider);

          // Inicializar tracking de uso
          this.usage.set(name, {
            requests: 0,
            tokens: 0,
            cost: 0,
            errors: 0
          });

          this.logger.info('provider.initialized', {
            provider: name,
            models: providerConfig.models,
            credential_source: 'credential-manager'
          });

        } catch (error) {
          this.logger.error('provider.init_failed', {
            provider: name,
            error: error.message
          });
        }
      }
    }

    this.metrics.gauge('ai.providers.active', this.providers.size);
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    await this.eventBus.subscribe('ai.request', this.onAIRequest.bind(this));

    // Subscribe to credential events for hot-reload
    await this.eventBus.subscribe('credential.saved', this.onCredentialSaved.bind(this));
    await this.eventBus.subscribe('credential.updated', this.onCredentialUpdated.bind(this));
    await this.eventBus.subscribe('credential.deleted', this.onCredentialDeleted.bind(this));
  }

  async onAIRequest(event) {
    const start_time = Date.now();
    const { request_id, type, prompt_id, data, options } = event.payload;

    this.logger.info('ai.request.received', {
      request_id,
      type,
      correlation_id: event.correlation_id
    });

    this.requestsInProgress.set(request_id, start_time);
    this.metrics.increment('ai.request.total');

    try {
      // Procesar solicitud según tipo
      let result;

      if (type === 'menu_parse') {
        result = await this.processMenuParse(data, options);
      } else {
        throw new Error(`Tipo de request no soportado: ${type}`);
      }

      const duration = Date.now() - start_time;
      this.requestsInProgress.delete(request_id);

      // Actualizar métricas
      this.metrics.increment('ai.response.total');
      this.metrics.timing('ai.request.duration', duration);

      if (result.usage) {
        this.metrics.increment('ai.tokens.total', result.usage.total_tokens || 0);
        this.updateUsageStats(result.provider, result.usage);
      }

      // Publicar respuesta exitosa
      await this.publishAIResponse(
        request_id,
        'success',
        result.data,
        result.provider,
        result.model,
        result.usage,
        duration,
        event.correlation_id
      );

      this.logger.info('ai.request.completed', {
        request_id,
        provider: result.provider,
        duration,
        correlation_id: event.correlation_id
      });

    } catch (error) {
      const duration = Date.now() - start_time;
      this.requestsInProgress.delete(request_id);

      this.metrics.increment('ai.error.total');

      // Publicar error
      await this.publishAIError(
        request_id,
        'processing_failed',
        error.message,
        null,
        { stack: error.stack },
        event.correlation_id
      );

      this.logger.error('ai.request.failed', {
        request_id,
        error: error.message,
        duration,
        correlation_id: event.correlation_id
      });
    }
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleChatCompletion(req) {
    const start_time = Date.now();

    this.logger.info('ai.chat.start', {
      correlation_id: req.correlationId || req.request_id
    });

    try {
      const { messages, provider, model, temperature, max_tokens } = req.body;

      if (!messages || messages.length === 0) {
        return {
          status: 400,
          data: { error: 'messages requeridos' }
        };
      }

      // Seleccionar proveedor
      const selectedProvider = provider && provider !== 'auto'
        ? provider
        : await this.selectProviderByPriority();

      if (!selectedProvider) {
        return {
          status: 503,
          data: { error: 'No hay proveedores disponibles' }
        };
      }

      const providerInstance = this.providers.get(selectedProvider);

      // Ejecutar chat completion
      const result = await providerInstance.chatCompletion({
        messages,
        model: model || providerInstance.config.default_model,
        temperature: temperature !== undefined ? temperature : 0.7,
        max_tokens: max_tokens || 1000
      });

      const duration = Date.now() - start_time;

      // Actualizar métricas
      this.metrics.increment('ai.response.total');
      this.metrics.timing('ai.request.duration', duration);
      this.updateUsageStats(selectedProvider, result.usage);

      // Publicar evento ai.response
      await this.publishAIResponse(
        req.correlationId || req.request_id,
        'success',
        { message: result.message },
        selectedProvider,
        result.model,
        result.usage,
        duration,
        req.correlationId || req.request_id
      );

      this.logger.info('ai.chat.completed', {
        provider: selectedProvider,
        model: result.model,
        duration,
        correlation_id: req.correlationId || req.request_id
      });

      return {
        status: 200,
        data: {
          id: result.id,
          provider: selectedProvider,
          model: result.model,
          message: result.message,
          usage: result.usage,
          duration_ms: duration
        }
      };

    } catch (error) {
      this.metrics.increment('ai.error.total');

      this.logger.error('ai.chat.error', {
        error: error.message,
        stack: error.stack,
        correlation_id: req.correlationId || req.request_id
      });

      return {
        status: 500,
        data: { error: error.message }
      };
    }
  }

  async handleListProviders(req) {
    const providers = [];

    for (const [name, provider] of this.providers.entries()) {
      const available = await provider.isAvailable();
      providers.push({
        name,
        enabled: true,
        available,
        priority: provider.config.priority,
        models: provider.config.models,
        default_model: provider.config.default_model
      });
    }

    // Ordenar por prioridad
    providers.sort((a, b) => a.priority - b.priority);

    return {
      status: 200,
      data: {
        providers,
        total: providers.length
      }
    };
  }

  async handleListModels(req) {
    const modelsByProvider = {};

    for (const [name, provider] of this.providers.entries()) {
      modelsByProvider[name] = {
        models: provider.config.models,
        default_model: provider.config.default_model
      };
    }

    return {
      status: 200,
      data: modelsByProvider
    };
  }

  async handleGetUsage(req) {
    const by_provider = {};
    let total_requests = 0;
    let total_tokens = 0;
    let total_cost = 0;

    for (const [name, usage] of this.usage.entries()) {
      by_provider[name] = usage;
      total_requests += usage.requests;
      total_tokens += usage.tokens;
      total_cost += usage.cost;
    }

    return {
      status: 200,
      data: {
        total_requests,
        total_tokens,
        total_cost: parseFloat(total_cost.toFixed(4)),
        by_provider
      }
    };
  }

  async handleHealthCheck(req) {
    const providers_status = {};

    for (const [name, provider] of this.providers.entries()) {
      providers_status[name] = await provider.isAvailable();
    }

    const all_healthy = Object.values(providers_status).some(s => s === true);

    return {
      status: all_healthy ? 200 : 503,
      data: {
        status: all_healthy ? 'healthy' : 'degraded',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: this.version,
        providers: providers_status,
        requests_in_progress: this.requestsInProgress.size
      }
    };
  }

  async handleGetMetrics(req) {
    return {
      status: 200,
      data: {
        counters: {
          'ai.request.total': this.metrics.getCounter('ai.request.total') || 0,
          'ai.response.total': this.metrics.getCounter('ai.response.total') || 0,
          'ai.error.total': this.metrics.getCounter('ai.error.total') || 0,
          'ai.tokens.total': this.metrics.getCounter('ai.tokens.total') || 0
        },
        gauges: {
          'ai.providers.active': this.providers.size,
          'ai.cost.total': Array.from(this.usage.values())
            .reduce((sum, u) => sum + u.cost, 0)
        }
      }
    };
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishAIResponse(request_id, status, data, provider, model, usage, duration_ms, correlation_id) {
    await this.eventBus.publish('ai.response', {
      request_id,
      status,
      data,
      provider,
      model,
      usage,
      duration_ms
    }, {
      correlationId: correlation_id
    });
  }

  async publishAIError(request_id, error_type, message, provider, details, correlation_id) {
    await this.eventBus.publish('ai.error', {
      request_id,
      error_type,
      message,
      provider,
      details
    }, {
      correlationId: correlation_id
    });
  }

  // ==========================================
  // Helper Methods
  // ==========================================

  async processMenuParse(data, options) {
    const { file_base64, file_name, file_type, context } = data;

    // Construir prompt para parseo de menú
    const systemPrompt = `Eres un asistente especializado en parsear cartas de menú de restaurantes.
Analiza la imagen o PDF del menú y extrae:
1. Productos con nombre y precio
2. Categorías de productos
3. Ingredientes por producto
4. Alérgenos detectados
5. Variaciones posibles (tamaños, extras)

Devuelve un JSON con esta estructura:
{
  "productos": [
    {
      "id": "prod_nombre_slug",
      "nombre": "Nombre del producto",
      "emoji": "emoji apropiado",
      "categoria": "Categoría",
      "categoria_emoji": "emoji de categoría",
      "precio": 12.50,
      "ingredientes_base": [
        {
          "id": "ing_nombre",
          "nombre": "Ingrediente",
          "emoji": "emoji",
          "tipo": "base|proteina|vegetal|condimento",
          "es_alergeno": false,
          "alergenos": []
        }
      ],
      "alergenos": ["gluten", "lactosa"],
      "variaciones": {
        "permite_quitar": ["ing_id"],
        "permite_anadir": true
      }
    }
  ],
  "categorias": [
    {
      "id": "cat_nombre",
      "nombre": "Categoría",
      "emoji": "emoji",
      "orden": 0
    }
  ]
}`;

    const userPrompt = `Analiza esta carta de menú: ${file_name}

Contenido (base64): ${file_base64.substring(0, 100)}...`;

    // Seleccionar proveedor con vision capabilities (anthropic preferido)
    const provider = await this.selectProviderForVision();
    const providerInstance = this.providers.get(provider);

    // Ejecutar chat completion
    const result = await providerInstance.chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: providerInstance.config.default_model,
      temperature: options?.temperature || 0.3,
      max_tokens: options?.max_tokens || 4000
    });

    // Parsear respuesta JSON
    const menuData = JSON.parse(result.message.content);

    return {
      data: menuData,
      provider,
      model: result.model,
      usage: result.usage
    };
  }

  async selectProviderByPriority() {
    const available = [];

    for (const [name, provider] of this.providers.entries()) {
      if (await provider.isAvailable()) {
        available.push({
          name,
          priority: provider.config.priority
        });
      }
    }

    if (available.length === 0) return null;

    available.sort((a, b) => a.priority - b.priority);
    return available[0].name;
  }

  async selectProviderForVision() {
    // Preferir anthropic para visión
    if (this.providers.has('anthropic')) {
      const anthropic = this.providers.get('anthropic');
      if (await anthropic.isAvailable()) {
        return 'anthropic';
      }
    }

    // Fallback a prioridad
    return await this.selectProviderByPriority();
  }

  updateUsageStats(provider, usage) {
    if (!this.usage.has(provider)) return;

    const stats = this.usage.get(provider);
    stats.requests += 1;
    stats.tokens += usage.total_tokens || 0;
    stats.cost += usage.cost || 0;

    this.usage.set(provider, stats);
    this.metrics.gauge('ai.cost.total',
      Array.from(this.usage.values()).reduce((sum, u) => sum + u.cost, 0)
    );
  }

  // ==========================================
  // Credential Event Handlers (Hot-Reload)
  // ==========================================

  async onCredentialSaved(event) {
    const { key, provider, level } = event.payload;

    this.logger.info('credential.saved.detected', {
      key,
      provider,
      level,
      correlation_id: event.correlation_id
    });

    await this.refreshProviderCredentials(provider);
  }

  async onCredentialUpdated(event) {
    const { key, provider, level } = event.payload;

    this.logger.info('credential.updated.detected', {
      key,
      provider,
      level,
      correlation_id: event.correlation_id
    });

    await this.refreshProviderCredentials(provider);
  }

  async onCredentialDeleted(event) {
    const { key, provider, level } = event.payload;

    this.logger.warn('credential.deleted.detected', {
      key,
      provider,
      level,
      correlation_id: event.correlation_id
    });

    await this.refreshProviderCredentials(provider);
  }

  async refreshProviderCredentials(providerName) {
    // Map credential provider names to ai-gateway provider names
    const providerMap = {
      'OPENAI': 'openai',
      'DEEPSEEK': 'deepseek',
      'ANTHROPIC': 'anthropic',
      'OLLAMA': 'ollama'
    };

    const mappedName = providerMap[providerName];

    if (!mappedName) {
      this.logger.debug('credential.refresh.skip', {
        reason: 'provider not mapped',
        provider: providerName
      });
      return;
    }

    const provider = this.providers.get(mappedName);

    if (!provider) {
      this.logger.debug('credential.refresh.skip', {
        reason: 'provider not loaded',
        provider: mappedName
      });
      return;
    }

    try {
      await provider.refreshCredential();

      this.logger.info('credential.refreshed', {
        provider: mappedName,
        available: await provider.isAvailable()
      });

    } catch (error) {
      this.logger.error('credential.refresh.failed', {
        provider: mappedName,
        error: error.message
      });
    }
  }
}

module.exports = AIGatewayModule;
