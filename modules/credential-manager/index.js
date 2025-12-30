/**
 * Credential Manager Module
 * Multi-level credential management with .env storage
 *
 * Levels (priority order):
 * 1. CUSTOM - highest priority, custom specific
 * 2. CLIENT - client-specific
 * 3. PROJECT - project-specific
 * 4. GLOBAL - fallback
 *
 * Follows event-driven architecture - NO HTTP internal calls
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const { EVENTS } = require('../../core/constants');

class CredentialManagerModule {
  constructor() {
    this.name = 'credential-manager';
    this.version = '2.0.0';

    // State
    this.credentials = new Map(); // key -> value
    this.envFilePath = null;

    // Dependencies (injected)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.uiHandler = null;  // UI Request/Response handler
    this.config = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.uiHandler = core.uiHandler;
    this.activity = core.activity?.forModule('credential-manager');

    this.activity?.action('module.loading', {});

    // Load module config from module.json
    const moduleJsonPath = path.join(__dirname, 'module.json');
    const moduleJson = JSON.parse(await fs.readFile(moduleJsonPath, 'utf-8'));
    this.config = moduleJson.config || {};

    this.logger.info('module.loading', {
      module: this.name,
      version: this.version
    });

    // Configure env file path - use project root (2 levels up from module)
    const projectRoot = path.resolve(__dirname, '..', '..');
    this.envFilePath = path.join(projectRoot, this.config.envFile || '.env');

    // Load existing credentials
    await this.loadEnvFile();

    // Subscribe to events
    await this.subscribeToEvents();

    // Register UI Request/Response handlers
    if (this.uiHandler) {
      this.uiHandler.register('credential', 'list', this.handleUIList.bind(this));
      this.uiHandler.register('credential', 'get', this.handleUIGet.bind(this));
      this.uiHandler.register('credential', 'create', this.handleUICreate.bind(this));
      this.uiHandler.register('credential', 'update', this.handleUIUpdate.bind(this));
      this.uiHandler.register('credential', 'delete', this.handleUIDelete.bind(this));
      this.uiHandler.register('credential', 'test', this.handleUITest.bind(this));

      this.logger.info('credential-manager.ui_handlers.registered', {
        handlers: ['list', 'get', 'create', 'update', 'delete', 'test']
      });
    }

    // Update metrics
    this.updateCredentialMetrics();

    this.logger.info('module.loaded', {
      module: this.name,
      version: this.version,
      env_file: this.envFilePath,
      credentials_count: this.credentials.size
    });

    // Publicar estado inicial via MQTT
    await this.publishState();
  }

  async onUnload() {
    this.logger.info('module.unloading', { module: this.name });

    // Unregister UI handlers
    if (this.uiHandler) {
      this.uiHandler.unregister('credential', 'list');
      this.uiHandler.unregister('credential', 'get');
      this.uiHandler.unregister('credential', 'create');
      this.uiHandler.unregister('credential', 'update');
      this.uiHandler.unregister('credential', 'delete');
      this.uiHandler.unregister('credential', 'test');
    }

    this.credentials.clear();
    this.logger.info('module.unloaded', { module: this.name });
  }

  // ==========================================
  // Initialization Helpers
  // ==========================================

  async loadEnvFile() {
    try {
      if (!fsSync.existsSync(this.envFilePath)) {
        await fs.writeFile(this.envFilePath, '# Credentials\n');
        this.logger.info('env.file.created', { path: this.envFilePath });
        return;
      }

      const content = await fs.readFile(this.envFilePath, 'utf-8');
      const lines = content.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [key, ...valueParts] = trimmed.split('=');
          const value = valueParts.join('=');
          if (key.includes('_API_KEY_')) {
            this.credentials.set(key, value);
            // Also set in process.env for other modules
            process.env[key] = value;
          }
        }
      }

      this.logger.info('env.file.loaded', {
        path: this.envFilePath,
        credentials_count: this.credentials.size
      });
    } catch (error) {
      this.logger.error('env.file.load.error', {
        path: this.envFilePath,
        error: error.message
      });
    }
  }

  async saveEnvFile() {
    const startTime = Date.now();

    try {
      let content = '# Credentials managed by credential-manager\n';
      content += `# Last updated: ${new Date().toISOString()}\n\n`;

      // Group by level
      const grouped = { GLOBAL: [], PROJECT: [], CLIENT: [], CUSTOM: [] };

      for (const [key, value] of this.credentials.entries()) {
        const level = this.extractLevel(key);
        if (grouped[level]) {
          grouped[level].push({ key, value });
        }
      }

      // Write in order
      for (const level of ['GLOBAL', 'PROJECT', 'CLIENT', 'CUSTOM']) {
        if (grouped[level].length > 0) {
          content += `# ${level} credentials\n`;
          for (const { key, value } of grouped[level]) {
            content += `${key}=${value}\n`;
          }
          content += '\n';
        }
      }

      await fs.writeFile(this.envFilePath, content);

      const duration = Date.now() - startTime;
      this.logger.info('env.file.saved', {
        path: this.envFilePath,
        credentials_count: this.credentials.size,
        duration
      });

      if (this.metrics && typeof this.metrics.timing === 'function') {
        this.metrics.timing('credential.save.duration', duration);
      }
    } catch (error) {
      this.logger.error('env.file.save.error', {
        path: this.envFilePath,
        error: error.message
      });
      throw error;
    }
  }

  updateCredentialMetrics() {
    // Guard: metrics might not have gauge method
    if (!this.metrics || typeof this.metrics.gauge !== 'function') {
      return;
    }

    this.metrics.gauge('credential.count.total', this.credentials.size);

    const byLevel = { GLOBAL: 0, PROJECT: 0, CLIENT: 0, CUSTOM: 0 };
    for (const key of this.credentials.keys()) {
      const level = this.extractLevel(key);
      if (byLevel[level] !== undefined) {
        byLevel[level]++;
      }
    }

    for (const [level, count] of Object.entries(byLevel)) {
      this.metrics.gauge(`credential.count.${level.toLowerCase()}`, count);
    }
  }

  // ==========================================
  // Event Subscriptions
  // ==========================================

  async subscribeToEvents() {
    // Internal event subscriptions
    await this.eventBus.subscribe(
      EVENTS.CREDENTIAL.RESOLVE_REQUEST,
      this.onResolveRequest.bind(this)
    );

    // UI event subscriptions via eventBus (topics transformados)
    // Frontend publica a core/*/events/credential/state/request, etc.
    await this.eventBus.subscribe(
      EVENTS.CREDENTIAL.STATE_REQUEST,
      this.onStateRequest.bind(this)
    );

    await this.eventBus.subscribe(
      EVENTS.CREDENTIAL.CREATE,
      this.onCreateCredential.bind(this)
    );

    await this.eventBus.subscribe(
      EVENTS.CREDENTIAL.UPDATE,
      this.onUpdateCredential.bind(this)
    );

    await this.eventBus.subscribe(
      EVENTS.CREDENTIAL.DELETE,
      this.onDeleteCredential.bind(this)
    );

    this.logger.info('credential-manager.eventbus.subscribed', {
      events: [
        EVENTS.CREDENTIAL.RESOLVE_REQUEST,
        EVENTS.CREDENTIAL.STATE_REQUEST,
        EVENTS.CREDENTIAL.CREATE,
        EVENTS.CREDENTIAL.UPDATE,
        EVENTS.CREDENTIAL.DELETE
      ]
    });
  }

  /**
   * Handler para solicitudes de estado desde el frontend
   * Recibe eventos via eventBus (frontend publica a core/{coreId}/events/credential/state/request)
   */
  async onStateRequest(event) {
    const correlationId = event?.correlation_id || event?.correlationId;
    this.logger.info('credential.state.request.received', { correlation_id: correlationId });
    await this.publishState(correlationId);
  }

  /**
   * Handler para crear credencial desde frontend
   * Recibe eventos via eventBus (frontend publica a core/{coreId}/events/credential/create)
   */
  async onCreateCredential(event) {
    // EventBus envía envelope con .data, MQTT directo envía .payload
    const payload = event?.data || event?.payload || event;
    const { provider, level, identifier, api_key } = payload;
    const correlationId = event?.correlation_id || event?.correlationId;

    this.logger.info('credential.create.mqtt.received', {
      provider,
      level,
      correlation_id: correlationId
    });

    try {
      // Validate
      const validation = this.validateLevel(level, identifier);
      if (!validation.valid) {
        this.logger.warn('credential.create.mqtt.validation_failed', {
          error: validation.error,
          correlation_id: correlationId
        });
        return;
      }

      // Build key and save
      const key = this.buildKey(provider, level, identifier);
      const isNew = !this.credentials.has(key);

      this.credentials.set(key, api_key);
      await this.saveEnvFile();
      process.env[key] = api_key;

      // Metrics
      if (isNew) {
        this.metrics.increment('credential.saved.total');
      } else {
        this.metrics.increment('credential.updated.total');
      }
      this.updateCredentialMetrics();

      // Publish notification event
      await this.eventBus.publish(EVENTS.CREDENTIAL.SAVED, {
        key,
        provider,
        level,
        identifier: identifier || null,
        created: isNew,
        updated: !isNew
      }, { correlationId });

      this.logger.info('credential.create.mqtt.success', {
        key,
        created: isNew,
        correlation_id: correlationId
      });

      // Publish updated state
      await this.publishState(correlationId);
    } catch (error) {
      this.logger.error('credential.create.mqtt.error', {
        error: error.message,
        correlation_id: correlationId
      });
      this.metrics.increment('credential.errors.total');
    }
  }

  /**
   * Handler para actualizar credencial desde frontend
   * Recibe eventos via eventBus (frontend publica a core/{coreId}/events/credential/update)
   */
  async onUpdateCredential(event) {
    // EventBus envía envelope con .data, MQTT directo envía .payload
    const payload = event?.data || event?.payload || event;
    const { key, api_key } = payload;
    const correlationId = event?.correlation_id || event?.correlationId;

    this.logger.info('credential.update.mqtt.received', {
      key,
      correlation_id: correlationId
    });

    if (!this.credentials.has(key)) {
      this.logger.warn('credential.update.mqtt.not_found', {
        key,
        correlation_id: correlationId
      });
      return;
    }

    try {
      this.credentials.set(key, api_key);
      await this.saveEnvFile();
      process.env[key] = api_key;

      this.metrics.increment('credential.updated.total');

      await this.eventBus.publish(EVENTS.CREDENTIAL.UPDATED, {
        key,
        updated_at: new Date().toISOString()
      }, { correlationId });

      this.logger.info('credential.update.mqtt.success', {
        key,
        correlation_id: correlationId
      });

      // Publish updated state
      await this.publishState(correlationId);
    } catch (error) {
      this.logger.error('credential.update.mqtt.error', {
        error: error.message,
        correlation_id: correlationId
      });
      this.metrics.increment('credential.errors.total');
    }
  }

  /**
   * Handler para eliminar credencial desde frontend
   * Recibe eventos via eventBus (frontend publica a core/{coreId}/events/credential/delete)
   */
  async onDeleteCredential(event) {
    // EventBus envía envelope con .data, MQTT directo envía .payload
    const payload = event?.data || event?.payload || event;
    const { key } = payload;
    const correlationId = event?.correlation_id || event?.correlationId;

    this.logger.info('credential.delete.mqtt.received', {
      key,
      correlation_id: correlationId
    });

    if (!this.credentials.has(key)) {
      this.logger.warn('credential.delete.mqtt.not_found', {
        key,
        correlation_id: correlationId
      });
      return;
    }

    try {
      this.credentials.delete(key);
      await this.saveEnvFile();
      delete process.env[key];

      this.metrics.increment('credential.deleted.total');
      this.updateCredentialMetrics();

      await this.eventBus.publish(EVENTS.CREDENTIAL.DELETED, {
        key,
        deleted_at: new Date().toISOString()
      }, { correlationId });

      this.logger.info('credential.delete.mqtt.success', {
        key,
        correlation_id: correlationId
      });

      // Publish updated state
      await this.publishState(correlationId);
    } catch (error) {
      this.logger.error('credential.delete.mqtt.error', {
        error: error.message,
        correlation_id: correlationId
      });
      this.metrics.increment('credential.errors.total');
    }
  }

  // ==========================================
  // Event Handlers (from other modules)
  // ==========================================

  async onResolveRequest(event) {
    const {
      provider,
      project_id,
      client_id,
      custom_id,
      request_id,
      correlation_id
    } = event.data || event.payload || event;

    this.logger.info('credential.resolve.request.received', {
      provider,
      project_id,
      client_id,
      custom_id,
      request_id,
      correlation_id
    });

    const startTime = Date.now();

    try {
      const result = this.resolveCredential(provider, {
        customId: custom_id,
        clientId: client_id,
        projectId: project_id
      });

      const duration = Date.now() - startTime;
      if (this.metrics && typeof this.metrics.timing === 'function') {
        this.metrics.timing('credential.resolve.duration', duration);
      }

      if (result.found) {
        this.metrics.increment('credential.resolved.total');

        this.logger.info('credential.resolve.request.success', {
          provider,
          resolved_from: result.resolvedFrom,
          duration,
          correlation_id
        });

        await this.publishResolveResponse(
          request_id,
          true,
          provider,
          result.apiKey,
          result.resolvedFrom,
          null,
          correlation_id
        );
      } else {
        this.metrics.increment('credential.resolve.failed.total');

        this.logger.warn('credential.resolve.request.not_found', {
          provider,
          attempts: result.attempts,
          correlation_id
        });

        await this.publishResolveResponse(
          request_id,
          false,
          provider,
          null,
          null,
          `No credential found for provider: ${provider}`,
          correlation_id
        );
      }
    } catch (error) {
      this.logger.error('credential.resolve.request.error', {
        provider,
        error: error.message,
        correlation_id
      });

      this.metrics.increment('credential.errors.total');

      await this.publishResolveResponse(
        request_id,
        false,
        provider,
        null,
        null,
        error.message,
        correlation_id
      );
    }
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleSaveCredential(req, context) {
    const startTime = Date.now();

    this.logger.info('credential.save.start', {
      correlation_id: context.correlationId
    });

    try {
      const { provider, level, identifier, api_key } = req.body || {};

      // Validate
      const validation = this.validateLevel(level, identifier);
      if (!validation.valid) {
        this.logger.warn('credential.save.validation_failed', {
          provider,
          level,
          error: validation.error,
          correlation_id: context.correlationId
        });

        return {
          status: 400,
          data: { success: false, error: validation.error }
        };
      }

      // Build key
      const key = this.buildKey(provider, level, identifier);
      const isNew = !this.credentials.has(key);

      // Save to memory and file
      this.credentials.set(key, api_key);
      await this.saveEnvFile();

      // Also update process.env for immediate availability to other modules
      process.env[key] = api_key;

      // Metrics
      if (isNew) {
        this.metrics.increment('credential.saved.total');
      } else {
        this.metrics.increment('credential.updated.total');
      }
      this.updateCredentialMetrics();

      // Publish event
      await this.eventBus.publish(EVENTS.CREDENTIAL.SAVED, {
        key,
        provider,
        level,
        identifier: identifier || null,
        created: isNew,
        updated: !isNew
      }, { correlationId: context.correlationId });

      this.logger.info('credential.saved', {
        key,
        created: isNew,
        duration: Date.now() - startTime,
        correlation_id: context.correlationId
      });

      // Publicar estado actualizado via MQTT
      await this.publishState(context.correlationId);

      return {
        status: isNew ? 201 : 200,
        data: {
          success: true,
          credential: {
            key,
            provider,
            level,
            identifier: identifier || null,
            created: isNew,
            updated: !isNew
          }
        }
      };
    } catch (error) {
      this.logger.error('credential.save.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      this.metrics.increment('credential.errors.total');

      return {
        status: 500,
        data: {
          success: false,
          error: 'Failed to save credential',
          message: error.message
        }
      };
    }
  }

  async handleResolveCredential(req, context) {
    const startTime = Date.now();
    const { provider, clientId, projectId, customId } = req.query || {};

    this.logger.info('credential.resolve.start', {
      provider,
      correlation_id: context.correlationId
    });

    if (!provider) {
      return {
        status: 400,
        data: { success: false, error: 'Provider is required' }
      };
    }

    try {
      const result = this.resolveCredential(provider, {
        customId,
        clientId,
        projectId
      });

      const duration = Date.now() - startTime;
      if (this.metrics && typeof this.metrics.timing === 'function') {
        this.metrics.timing('credential.resolve.duration', duration);
      }

      if (result.found) {
        this.metrics.increment('credential.resolved.total');

        await this.eventBus.publish(EVENTS.CREDENTIAL.RESOLVED, {
          provider,
          resolved_from: result.resolvedFrom,
          key: result.key
        }, { correlationId: context.correlationId });

        this.logger.info('credential.resolved', {
          provider,
          resolved_from: result.resolvedFrom,
          duration,
          correlation_id: context.correlationId
        });

        return {
          status: 200,
          data: {
            success: true,
            found: true,
            credential: {
              provider,
              level: result.resolvedFrom,
              identifier: result.identifier,
              api_key: result.apiKey,
              key: result.key
            },
            resolved_from: result.resolvedFrom
          }
        };
      } else {
        this.metrics.increment('credential.resolve.failed.total');

        await this.eventBus.publish(EVENTS.CREDENTIAL.RESOLVE_FAILED, {
          provider,
          attempts: result.attempts
        }, { correlationId: context.correlationId });

        this.logger.warn('credential.resolve.not_found', {
          provider,
          attempts: result.attempts,
          correlation_id: context.correlationId
        });

        return {
          status: 404,
          data: {
            success: false,
            found: false,
            message: `No credential found for provider: ${provider}`,
            attempts: result.attempts
          }
        };
      }
    } catch (error) {
      this.logger.error('credential.resolve.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      this.metrics.increment('credential.errors.total');

      return {
        status: 500,
        data: {
          success: false,
          error: 'Failed to resolve credential',
          message: error.message
        }
      };
    }
  }

  async handleListCredentials(req, context) {
    this.logger.info('credential.list.start', {
      correlation_id: context.correlationId
    });

    try {
      const { level, provider } = req.query || {};
      const masked = [];

      for (const [key, value] of this.credentials.entries()) {
        const parsed = this.parseKey(key);
        if (!parsed) continue;

        // Apply filters
        if (level && parsed.level !== level) continue;
        if (provider && parsed.provider !== provider) continue;

        masked.push({
          key,
          provider: parsed.provider,
          level: parsed.level,
          identifier: parsed.identifier,
          api_key_preview: this.maskApiKey(value)
        });
      }

      this.logger.info('credential.listed', {
        count: masked.length,
        filters: { level, provider },
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: {
          success: true,
          credentials: masked,
          total: masked.length,
          filters: { level, provider }
        }
      };
    } catch (error) {
      this.logger.error('credential.list.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 500,
        data: {
          success: false,
          error: 'Failed to list credentials',
          message: error.message
        }
      };
    }
  }

  async handleUpdateCredential(req, context) {
    const { key } = req.params || {};
    const { api_key } = req.body || {};

    this.logger.info('credential.update.start', {
      key,
      correlation_id: context.correlationId
    });

    if (!api_key) {
      return {
        status: 400,
        data: { success: false, error: 'api_key is required' }
      };
    }

    if (!this.credentials.has(key)) {
      this.logger.warn('credential.update.not_found', {
        key,
        correlation_id: context.correlationId
      });

      return {
        status: 404,
        data: { success: false, error: `Credential not found: ${key}` }
      };
    }

    try {
      this.credentials.set(key, api_key);
      await this.saveEnvFile();

      // Also update process.env for immediate availability
      process.env[key] = api_key;

      this.metrics.increment('credential.updated.total');

      await this.eventBus.publish(EVENTS.CREDENTIAL.UPDATED, {
        key,
        updated_at: new Date().toISOString()
      }, { correlationId: context.correlationId });

      this.logger.info('credential.updated', {
        key,
        correlation_id: context.correlationId
      });

      // Publicar estado actualizado via MQTT
      await this.publishState(context.correlationId);

      return {
        status: 200,
        data: { success: true, key, updated: true }
      };
    } catch (error) {
      this.logger.error('credential.update.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      this.metrics.increment('credential.errors.total');

      return {
        status: 500,
        data: {
          success: false,
          error: 'Failed to update credential',
          message: error.message
        }
      };
    }
  }

  async handleDeleteCredential(req, context) {
    const { key } = req.params || {};

    this.logger.info('credential.delete.start', {
      key,
      correlation_id: context.correlationId
    });

    if (!this.credentials.has(key)) {
      this.logger.warn('credential.delete.not_found', {
        key,
        correlation_id: context.correlationId
      });

      return {
        status: 404,
        data: { success: false, error: `Credential not found: ${key}` }
      };
    }

    try {
      this.credentials.delete(key);
      await this.saveEnvFile();

      // Also remove from process.env
      delete process.env[key];

      this.metrics.increment('credential.deleted.total');
      this.updateCredentialMetrics();

      await this.eventBus.publish(EVENTS.CREDENTIAL.DELETED, {
        key,
        deleted_at: new Date().toISOString()
      }, { correlationId: context.correlationId });

      this.logger.info('credential.deleted', {
        key,
        correlation_id: context.correlationId
      });

      // Publicar estado actualizado via MQTT
      await this.publishState(context.correlationId);

      return {
        status: 200,
        data: { success: true, key, deleted: true }
      };
    } catch (error) {
      this.logger.error('credential.delete.error', {
        error: error.message,
        correlation_id: context.correlationId
      });

      this.metrics.increment('credential.errors.total');

      return {
        status: 500,
        data: {
          success: false,
          error: 'Failed to delete credential',
          message: error.message
        }
      };
    }
  }

  async handleGetLevels(req, context) {
    const levels = Object.entries(this.config.levels || {}).map(([name, info]) => ({
      name,
      priority: info.priority,
      requires_identifier: info.requiresIdentifier,
      description: info.description
    }));

    levels.sort((a, b) => a.priority - b.priority);

    this.logger.info('credential.levels.retrieved', {
      count: levels.length,
      correlation_id: context.correlationId
    });

    return {
      status: 200,
      data: { success: true, levels, total: levels.length }
    };
  }

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        credentials_count: this.credentials.size,
        env_file: this.envFilePath
      }
    };
  }

  async handleGetMetrics(req, context) {
    const byLevel = { GLOBAL: 0, PROJECT: 0, CLIENT: 0, CUSTOM: 0 };
    for (const key of this.credentials.keys()) {
      const level = this.extractLevel(key);
      if (byLevel[level] !== undefined) {
        byLevel[level]++;
      }
    }

    return {
      status: 200,
      data: {
        counters: {
          'credential.saved.total': this.metrics.getCounter('credential.saved.total') || 0,
          'credential.updated.total': this.metrics.getCounter('credential.updated.total') || 0,
          'credential.deleted.total': this.metrics.getCounter('credential.deleted.total') || 0,
          'credential.resolved.total': this.metrics.getCounter('credential.resolved.total') || 0,
          'credential.resolve.failed.total': this.metrics.getCounter('credential.resolve.failed.total') || 0
        },
        gauges: {
          'credential.count.total': this.credentials.size,
          'credential.count.by_level': byLevel
        }
      }
    };
  }

  // ==========================================
  // MQTT State Publisher - Estado via eventos
  // ==========================================

  /**
   * Genera el estado UI completo para publicar via MQTT
   */
  getUIState() {
    // Proveedores disponibles con metadata UI
    const providers = [
      { id: 'DEEPSEEK', name: 'DeepSeek', icon: '🔮' },
      { id: 'ANTHROPIC', name: 'Anthropic', icon: '🧠' },
      { id: 'OPENAI', name: 'OpenAI', icon: '🤖' },
      { id: 'OLLAMA', name: 'Ollama', icon: '🦙' }
    ];

    // Niveles disponibles con metadata UI
    const levels = [
      { id: 'GLOBAL', name: 'Global', icon: '🟢', requiresIdentifier: false },
      { id: 'PROJECT', name: 'Proyecto', icon: '🔵', requiresIdentifier: true },
      { id: 'CLIENT', name: 'Cliente', icon: '🟡', requiresIdentifier: true },
      { id: 'CUSTOM', name: 'Custom', icon: '🔴', requiresIdentifier: true }
    ];

    // Credenciales agrupadas y enriquecidas
    const credentialsGrouped = {
      GLOBAL: [],
      PROJECT: [],
      CLIENT: [],
      CUSTOM: []
    };

    for (const [key, value] of this.credentials.entries()) {
      const parsed = this.parseKey(key);
      if (!parsed) continue;

      const provider = providers.find(p => p.id === parsed.provider);
      const credential = {
        key,
        provider: parsed.provider,
        providerName: provider?.name || parsed.provider,
        providerIcon: provider?.icon || '🔑',
        level: parsed.level,
        identifier: parsed.identifier,
        preview: this.maskApiKey(value)
      };

      // Group by level
      if (credentialsGrouped[parsed.level]) {
        credentialsGrouped[parsed.level].push(credential);
      }
    }

    // Estadísticas
    const stats = {
      total: this.credentials.size,
      byLevel: { GLOBAL: 0, PROJECT: 0, CLIENT: 0, CUSTOM: 0 }
    };
    for (const key of this.credentials.keys()) {
      const level = this.extractLevel(key);
      if (stats.byLevel[level] !== undefined) {
        stats.byLevel[level]++;
      }
    }

    return {
      providers,
      levels,
      credentials: credentialsGrouped,
      stats
    };
  }

  /**
   * Publica el estado actual via eventBus
   * EventBus transforma 'credential.state' → 'core/{coreId}/events/credential/state'
   * Frontend suscribe a 'core/{coreId}/events/credential/state'
   */
  async publishState(correlationId = null) {
    const state = this.getUIState();

    // Publicar via eventBus → MQTT topic: core/*/events/credential/state
    await this.eventBus.emit(EVENTS.CREDENTIAL.STATE, state);
    this.logger.info('credential.state.published', {
      total: state.stats.total,
      correlation_id: correlationId
    });
  }

  // ==========================================
  // UI Request/Response Handlers
  // Patrón Request/Response sobre MQTT
  // Frontend usa: await mqttRequest('credential', 'list')
  // ==========================================

  /**
   * UI Handler: Listar credenciales
   * Request: mqttRequest('credential', 'list')
   */
  async handleUIList(data, request) {
    return this.getUIState();
  }

  /**
   * UI Handler: Obtener credencial por key
   * Request: mqttRequest('credential', 'get', { key })
   */
  async handleUIGet(data, request) {
    const { key } = data;

    if (!key) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Credential key is required' };
    }

    const value = this.credentials.get(key);
    if (!value) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Credential not found' };
    }

    const parsed = this.parseKey(key);
    const provider = parsed?.provider || 'UNKNOWN';
    const level = parsed?.level || 'UNKNOWN';
    const identifier = parsed?.identifier || null;

    // Provider icons
    const providerIcons = {
      'OPENAI': '🤖',
      'DEEPSEEK': '🔮',
      'ANTHROPIC': '🧠',
      'OLLAMA': '🦙'
    };

    return {
      credential: {
        key,
        provider,
        providerName: provider,
        providerIcon: providerIcons[provider] || '🔑',
        level,
        identifier,
        preview: this.maskApiKey(value)
      }
    };
  }

  /**
   * UI Handler: Crear credencial
   * Request: mqttRequest('credential', 'create', { provider, level, identifier?, api_key })
   */
  async handleUICreate(data, request) {
    const { provider, level, identifier, api_key } = data;

    if (!provider) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Provider is required' };
    }
    if (!level) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Level is required' };
    }
    if (!api_key) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'API key is required' };
    }

    // Generar key
    const key = this.buildKey(provider, level, identifier);

    // Verificar si ya existe
    const existed = this.credentials.has(key);

    // Guardar
    this.credentials.set(key, api_key);
    process.env[key] = api_key;
    await this.saveEnvFile();
    this.updateCredentialMetrics();

    return {
      key,
      created: !existed,
      updated: existed
    };
  }

  /**
   * UI Handler: Actualizar credencial
   * Request: mqttRequest('credential', 'update', { key, api_key })
   */
  async handleUIUpdate(data, request) {
    const { key, api_key } = data;

    if (!key) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Credential key is required' };
    }
    if (!api_key) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'API key is required' };
    }

    if (!this.credentials.has(key)) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Credential not found' };
    }

    this.credentials.set(key, api_key);
    process.env[key] = api_key;
    await this.saveEnvFile();
    this.updateCredentialMetrics();

    return { key, updated: true };
  }

  /**
   * UI Handler: Eliminar credencial
   * Request: mqttRequest('credential', 'delete', { key })
   */
  async handleUIDelete(data, request) {
    const { key } = data;

    if (!key) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Credential key is required' };
    }

    if (!this.credentials.has(key)) {
      throw { status: 404, code: 'NOT_FOUND', message: 'Credential not found' };
    }

    this.credentials.delete(key);
    delete process.env[key];
    await this.saveEnvFile();
    this.updateCredentialMetrics();

    return { key, deleted: true };
  }

  /**
   * UI Handler: Testear API key
   * Request: mqttRequest('credential', 'test', { provider, api_key })
   */
  async handleUITest(data, request) {
    const { provider, api_key } = data;

    if (!provider) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'Provider is required' };
    }
    if (!api_key) {
      throw { status: 400, code: 'VALIDATION_ERROR', message: 'API key is required' };
    }

    let valid = false;
    let message = '';

    try {
      switch (provider.toUpperCase()) {
        case 'DEEPSEEK':
          valid = await this.testDeepSeek(api_key);
          message = valid ? 'API key válida' : 'API key inválida o sin créditos';
          break;

        case 'OPENAI':
          valid = await this.testOpenAI(api_key);
          message = valid ? 'API key válida' : 'API key inválida';
          break;

        case 'ANTHROPIC':
          valid = await this.testAnthropic(api_key);
          message = valid ? 'API key válida' : 'API key inválida';
          break;

        case 'OLLAMA':
          valid = api_key && api_key.length > 0;
          message = 'Ollama es local - no requiere validación';
          break;

        default:
          valid = api_key && api_key.length > 10;
          message = 'Provider no reconocido - validación básica';
      }
    } catch (error) {
      message = `Error al validar: ${error.message}`;
    }

    return { valid, provider, message };
  }

  // ==========================================
  // UI Test Endpoint (HTTP) - Validar API key antes de guardar
  // ==========================================

  async handleTestCredential(req, context) {
    const { provider, api_key } = req.body || {};

    this.logger.info('ui.test.request', {
      provider,
      correlation_id: context.correlationId
    });

    if (!provider || !api_key) {
      return {
        status: 400,
        data: {
          success: false,
          valid: false,
          error: 'Provider y api_key son requeridos'
        }
      };
    }

    try {
      let valid = false;
      let message = '';

      switch (provider.toUpperCase()) {
        case 'DEEPSEEK':
          valid = await this.testDeepSeek(api_key);
          message = valid ? 'API key válida' : 'API key inválida o sin créditos';
          break;

        case 'OPENAI':
          valid = await this.testOpenAI(api_key);
          message = valid ? 'API key válida' : 'API key inválida';
          break;

        case 'ANTHROPIC':
          valid = await this.testAnthropic(api_key);
          message = valid ? 'API key válida' : 'API key inválida';
          break;

        case 'OLLAMA':
          // Ollama es local, no necesita validación de API key
          valid = api_key && api_key.length > 0;
          message = 'Ollama es local - no requiere validación';
          break;

        default:
          valid = api_key && api_key.length > 10;
          message = 'Provider no reconocido - validación básica';
      }

      return {
        status: 200,
        data: {
          success: true,
          valid,
          provider,
          message
        }
      };
    } catch (error) {
      this.logger.error('ui.test.error', {
        provider,
        error: error.message,
        correlation_id: context.correlationId
      });

      return {
        status: 200,
        data: {
          success: true,
          valid: false,
          provider,
          message: `Error al validar: ${error.message}`
        }
      };
    }
  }

  // Test helpers para cada provider
  async testDeepSeek(apiKey) {
    try {
      const response = await fetch('https://api.deepseek.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async testOpenAI(apiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async testAnthropic(apiKey) {
    try {
      // Anthropic no tiene endpoint de listado, usamos un mensaje mínimo
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }]
        })
      });
      // 200 = válida, 401 = inválida, otros pueden ser rate limit pero key válida
      return response.status !== 401;
    } catch {
      return false;
    }
  }

  // ==========================================
  // AI Tool Handlers
  // ==========================================

  /**
   * Tool handler: Lista credenciales para AI
   * IMPORTANTE: Solo retorna metadata (provider, level, identifier)
   * NUNCA retorna valores de API keys
   *
   * @param {Object} args - Tool arguments
   * @param {string} [args.level] - Filter by level (GLOBAL, PROJECT, CLIENT, CUSTOM)
   * @param {string} [args.provider] - Filter by provider (OPENAI, DEEPSEEK, ANTHROPIC, OLLAMA)
   * @returns {Object} List of credential metadata
   */
  async handleToolCredentialList(args) {
    const { level, provider } = args || {};

    this.logger.info('credential.tool.list.called', {
      level,
      provider
    });

    const credentials = [];

    for (const [key, _value] of this.credentials.entries()) {
      const parsed = this.parseKey(key);
      if (!parsed) continue;

      // Apply filters if specified
      if (level && parsed.level !== level.toUpperCase()) continue;
      if (provider && parsed.provider !== provider.toUpperCase()) continue;

      // SECURITY: Never include api_key value - only metadata
      credentials.push({
        key,
        provider: parsed.provider,
        level: parsed.level,
        identifier: parsed.identifier || null
      });
    }

    // Sort by level priority (GLOBAL first, then PROJECT, CLIENT, CUSTOM)
    const levelOrder = { GLOBAL: 1, PROJECT: 2, CLIENT: 3, CUSTOM: 4 };
    credentials.sort((a, b) => (levelOrder[a.level] || 99) - (levelOrder[b.level] || 99));

    this.logger.info('credential.tool.list.result', {
      count: credentials.length,
      filters: { level, provider }
    });

    return {
      status: 200,
      data: {
        credentials,
        total: credentials.length,
        filters: { level: level || null, provider: provider || null },
        note: 'Only credential names and metadata are returned. API key values are never exposed.'
      }
    };
  }

  // ==========================================
  // Core Logic
  // ==========================================

  resolveCredential(provider, { customId, clientId, projectId } = {}) {
    const attempts = [];

    // Priority 1: CUSTOM
    if (customId) {
      const customKey = this.buildKey(provider, 'CUSTOM', customId);
      attempts.push(customKey);
      if (this.credentials.has(customKey)) {
        return {
          found: true,
          apiKey: this.credentials.get(customKey),
          key: customKey,
          resolvedFrom: 'CUSTOM',
          identifier: customId,
          attempts
        };
      }
    }

    // Priority 2: CLIENT
    if (clientId) {
      const clientKey = this.buildKey(provider, 'CLIENT', clientId);
      attempts.push(clientKey);
      if (this.credentials.has(clientKey)) {
        return {
          found: true,
          apiKey: this.credentials.get(clientKey),
          key: clientKey,
          resolvedFrom: 'CLIENT',
          identifier: clientId,
          attempts
        };
      }
    }

    // Priority 3: PROJECT
    if (projectId) {
      const projectKey = this.buildKey(provider, 'PROJECT', projectId);
      attempts.push(projectKey);
      if (this.credentials.has(projectKey)) {
        return {
          found: true,
          apiKey: this.credentials.get(projectKey),
          key: projectKey,
          resolvedFrom: 'PROJECT',
          identifier: projectId,
          attempts
        };
      }
    }

    // Priority 4: GLOBAL
    const globalKey = this.buildKey(provider, 'GLOBAL');
    attempts.push(globalKey);
    if (this.credentials.has(globalKey)) {
      return {
        found: true,
        apiKey: this.credentials.get(globalKey),
        key: globalKey,
        resolvedFrom: 'GLOBAL',
        identifier: null,
        attempts
      };
    }

    return { found: false, attempts };
  }

  buildKey(provider, level, identifier = null) {
    const providerUpper = provider.toUpperCase();
    if (level === 'GLOBAL') {
      return `${providerUpper}_API_KEY_GLOBAL`;
    }
    return `${providerUpper}_API_KEY_${level}_${identifier}`;
  }

  parseKey(key) {
    // Pattern: PROVIDER_API_KEY_LEVEL or PROVIDER_API_KEY_LEVEL_IDENTIFIER
    const match = key.match(/^([A-Z_]+)_API_KEY_(GLOBAL|PROJECT|CLIENT|CUSTOM)(?:_(.+))?$/);
    if (!match) return null;

    return {
      provider: match[1],
      level: match[2],
      identifier: match[3] || null
    };
  }

  extractLevel(key) {
    const parsed = this.parseKey(key);
    return parsed ? parsed.level : 'UNKNOWN';
  }

  validateLevel(level, identifier) {
    const levelConfig = this.config.levels?.[level];
    if (!levelConfig) {
      return { valid: false, error: `Unknown level: ${level}` };
    }

    if (levelConfig.requiresIdentifier && !identifier) {
      return { valid: false, error: `Level ${level} requires an identifier` };
    }

    if (!levelConfig.requiresIdentifier && identifier) {
      return { valid: false, error: `Level ${level} does not accept an identifier` };
    }

    return { valid: true };
  }

  maskApiKey(apiKey) {
    const maskLength = this.config.maskLength || 4;
    if (apiKey.length <= maskLength) {
      return '*'.repeat(apiKey.length);
    }
    const visible = apiKey.slice(-maskLength);
    const masked = '*'.repeat(apiKey.length - maskLength);
    return masked + visible;
  }

  // ==========================================
  // Event Publishers
  // ==========================================

  async publishResolveResponse(requestId, success, provider, apiKey, resolvedFrom, error, correlationId) {
    await this.eventBus.publish(EVENTS.CREDENTIAL.RESOLVE_RESPONSE, {
      request_id: requestId,
      success,
      provider,
      api_key: apiKey,
      resolved_from: resolvedFrom,
      error
    }, { correlationId });
  }
}

module.exports = CredentialManagerModule;
