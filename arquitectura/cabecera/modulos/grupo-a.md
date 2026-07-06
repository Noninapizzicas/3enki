---
id: modulos/grupo-a
dominio: modulos
resumen: gateway-manager (gateways software), log-manager (sesiones/logs), mercadona-api (cliente HTTP con throttle+cache).
fuentes:
  - modules/gateway-manager/**
  - modules/log-manager/**
  - modules/pizzepos/mercadona-api/**
verificado: 2026-07-06
---

# GRUPO A — gateway-manager, log-manager, mercadona-api

## GATEWAY-MANAGER (v2.0.0) — Ciclo de Vida de Gateways Software

```
INTERFAZ GatewayManagerContract {
  handleList(): Promise<Response>
  handleStatus(data: {type}): Promise<Response>
  handleRestart(data: {type}): Promise<Response>
  handleDiscover(data: {type}): Promise<Response>
}

CLASE GatewayManagerModule HEREDA BaseModule IMPLEMENTA GatewayManagerContract {
  ATRIBUTOS {
    name: String = 'gateway-manager'
    version: String = '2.0.0'
    config: {gateways: {tcp: {enabled, autodiscovery, manual_devices}, ble: {...}, usb: {...}, cmd: {...}}}
    gateways: Map<type, Gateway>
    internalMetrics: {started_total, devices_found_total, commands_processed_total, errors_total}
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus FROM core
      CARGA config FROM core.config['gateway-manager'] || DEFAULT_CONFIG
      LLAMA _startEnabledGateways()
      logger.info('gateway-manager.loaded', {active_gateways: gateways.size, types: Array.from(gateways.keys()).toArray()})

    async onUnload(): Promise<Void>
      entries = Array.from(gateways.entries())
      gateways.clear()
      PARA cada [type, gateway] EN entries:
        await _stopGateway(type, gateway, crypto.randomUUID())
      RESETEA internalMetrics

    async _startEnabledGateways(correlation_id: String): Promise<Void>
      mqtt = eventBus?.mqtt
      SI !mqtt OR !mqtt.isConnected:
        logger.warn('gateway-manager.mqtt.not_available', {correlation_id})
        metrics?.increment('gateway-manager.errors', {kind: 'mqtt_not_available'})
        RETORNA
      PARA cada [type, gatewayConfig] EN Object.entries(config.gateways):
        SI !gatewayConfig.enabled: CONTINÚA
        await _tryStartGateway(type, gatewayConfig, mqtt, correlation_id)

    async _tryStartGateway(type: String, gatewayConfig: Object, mqtt: MQTTClient, correlation_id: String): Promise<Void>
      GatewayClass = GATEWAY_TYPES[type]
      SI !GatewayClass:
        logger.warn('gateway-manager.unknown_type', {type, correlation_id})
        RETORNA
      TRY:
        gateway = await _instantiateGateway(GatewayClass, gatewayConfig, mqtt)
        await gateway.start()
        gateways.set(type, gateway)
        internalMetrics.started_total++
        internalMetrics.devices_found_total += gateway.metrics.devices_found
        logger.info('gateway-manager.gateway.started', {type, devices: gateway.devices.size, correlation_id})
        metrics?.increment('gateway-manager.gateway.started', {type})
        await _publicarEvento('gateway.started', {type, devices_count: gateway.devices.size}, {correlation_id})
        await _publishDeviceFoundEvents(type, gateway, correlation_id)
      CATCH err:
        internalMetrics.errors_total++
        logger.error('gateway-manager.gateway.start.failed', {type, error: err.message, correlation_id})
        metrics?.increment('gateway-manager.errors', {kind: 'start', type})
        await _publicarEvento('gateway.error', {type, error: err.message}, {correlation_id})

    async _publishDeviceFoundEvents(type: String, gateway: Gateway, correlation_id: String): Promise<Void>
      PARA cada [deviceId, entry] EN gateway.devices:
        await _publicarEvento('gateway.device_found', {
          device_id: deviceId,
          gateway_type: type,
          device_type: entry.type,
          capabilities: entry.capabilities
        }, {correlation_id})

    async _stopGateway(type: String, gateway: Gateway, correlation_id: String): Promise<Void>
      TRY:
        await gateway.stop()
        await _publicarEvento('gateway.stopped', {type}, {correlation_id})
      CATCH err:
        logger.error('gateway-manager.stop.failed', {type, error: err.message, correlation_id})
        metrics?.increment('gateway-manager.errors', {kind: 'stop', type})
        internalMetrics.errors_total++

    async _restartGateway(type: String, correlation_id: String): Promise<Object>
      SI !VALID_TYPES.includes(type):
        LANZA Error CON _code: 'INVALID_INPUT', _details: {kind: 'domain', field: 'type', allowed: VALID_TYPES}
      gatewayConfig = config.gateways[type]
      SI !gatewayConfig:
        LANZA Error CON _code: 'RESOURCE_NOT_FOUND', _details: {entity_type: 'gateway_config', entity_id: type}
      mqtt = eventBus?.mqtt
      SI !mqtt?.isConnected:
        LANZA Error CON _code: 'UPSTREAM_UNREACHABLE', _details: {upstream: 'mqtt', state: 'disconnected'}
      existing = gateways.get(type)
      SI existing:
        gateways.delete(type)
        TRY:
          await existing.stop()
        CATCH err:
          logger.warn('gateway-manager.restart.stop_failed', {type, error: err.message, correlation_id})
      GatewayClass = GATEWAY_TYPES[type]
      gateway = await _instantiateGateway(GatewayClass, gatewayConfig, mqtt)
      await gateway.start()
      gateways.set(type, gateway)
      metrics?.increment('gateway-manager.gateway.restarted', {type})
      RETORNA {type, devices: gateway.devices.size}

    async _discoverGateway(type: String): Promise<Object>
      SI !VALID_TYPES.includes(type):
        LANZA Error CON _code: 'INVALID_INPUT'
      mqtt = eventBus?.mqtt
      SI !mqtt?.isConnected:
        LANZA Error CON _code: 'UPSTREAM_UNREACHABLE'
      GatewayClass = GATEWAY_TYPES[type]
      tempConfig = {autodiscovery: true, ...config.gateways[type]}
      tempGateway = await _instantiateGateway(GatewayClass, tempConfig, mqtt)
      devices = await tempGateway._discoverDevices()
      RETORNA {type, devices, count: devices.length}

    async handleList(): Promise<Response>
      TRY:
        gateways_list = []
        PARA cada [type, gwConfig] EN Object.entries(config.gateways):
          running = gateways.get(type)
          gateways_list.push({
            type,
            enabled: gwConfig.enabled || false,
            running: !!running,
            ...(running ? running.getInfo() : {devices_count: 0})
          })
        RETORNA {status: 200, data: {gateways: gateways_list, active: gateways.size, total_configured: Object.keys(config.gateways).length}}
      CATCH err:
        RETORNA _handleHandlerError('gateway-manager.ui.list.failed', err, 'ui_list')

    async handleStatus(data: {type}): Promise<Response>
      TRY:
        {type} = data || {}
        SI !type:
          RETORNA _errorResponse(400, 'INVALID_INPUT', 'Gateway type is required', {kind: 'domain', field: 'type', allowed: VALID_TYPES})
        SI !VALID_TYPES.includes(type):
          RETORNA _errorResponse(400, 'INVALID_INPUT', `Gateway type not supported: {type}`, {kind: 'domain', field: 'type', allowed: VALID_TYPES})
        gateway = gateways.get(type)
        SI !gateway:
          RETORNA {status: 200, data: {type, running: false, enabled: config.gateways[type]?.enabled || false}}
        RETORNA {status: 200, data: gateway.getInfo()}
      CATCH err:
        RETORNA _handleHandlerError('gateway-manager.ui.status.failed', err, 'ui_status')

    async handleRestart(data: {type}): Promise<Response>
      TRY:
        {type} = data || {}
        SI !type:
          RETORNA _errorResponse(400, 'INVALID_INPUT', 'Gateway type is required', {kind: 'domain', field: 'type', allowed: VALID_TYPES})
        result = await _restartGateway(type, crypto.randomUUID())
        RETORNA {status: 200, data: {type: result.type, restarted: true, devices: result.devices}}
      CATCH err:
        RETORNA _handleHandlerError('gateway-manager.ui.restart.failed', err, 'ui_restart')

    async handleDiscover(data: {type}): Promise<Response>
      TRY:
        {type} = data || {}
        SI !type:
          RETORNA _errorResponse(400, 'INVALID_INPUT', 'Gateway type is required', {kind: 'domain', field: 'type', allowed: VALID_TYPES})
        result = await _discoverGateway(type)
        RETORNA {status: 200, data: result}
      CATCH err:
        RETORNA _handleHandlerError('gateway-manager.ui.discover.failed', err, 'ui_discover')

    _handleHandlerError(logEvent: String, err: Error, kind: String): Object
      result = super._handleHandlerError(logEvent, err, kind)
      internalMetrics.errors_total++
      RETORNA result

    async _instantiateGateway(GatewayClass: Class, gatewayConfig: Object, mqtt: MQTTClient): Promise<Gateway>
      RETORNA new GatewayClass(gatewayConfig, {mqtt, eventBus, logger})

    async _publicarEvento(name: String, payload: Object, sourcePayload?: Object): Promise<Void>
      correlation_id = sourcePayload?.correlation_id || crypto.randomUUID()
      enriched = {correlation_id, timestamp: now().toISOString(), ...payload}
      await eventBus.publish(name, enriched)

    EVENTOS_PUBLISHES {
      'gateway.started': {type, devices_count}
      'gateway.stopped': {type}
      'gateway.error': {type, error}
      'gateway.device_found': {device_id, gateway_type, device_type, capabilities}
    }

    EVENTOS_SUBSCRIBES {
      (ninguno)
    }
  }
}

CLASE GatewayBase ABSTRACT {
  ATRIBUTOS {
    type: String
    devices: Map<deviceId, DeviceEntry>
    metrics: {devices_found: Integer}
  }

  METODOS ABSTRACT {
    async start(): Promise<Void>
    async stop(): Promise<Void>
    async _discoverDevices(): Promise<Array<Object>>
    getInfo(): Object
  }
}

CLASE Gateway HEREDA GatewayBase {
  ATRIBUTOS {
    logger: Logger
    eventBus: EventBus
    mqtt: MQTTClient
    config: Object
  }
}

CLASE DeviceEntry {
  ATRIBUTOS {
    type: String
    capabilities: Array<String>
  }
}
```

## LOG-MANAGER (v3.0.0) — Gestión de Sesiones y Logs por Módulo

```
INTERFAZ LogManagerContract {
  getSession(session_id: String): Promise<{session, modules}>
  getSessionModules(session_id: String): Promise<Array<String>>
  getSessionModuleLogs(session_id: String, module_name: String): Promise<Array<LogEntry>>
  setTrackedModules(session_id: String, modules: Array<String>): Promise<Void>
}

CLASE LogManagerModule HEREDA BaseModule IMPLEMENTA LogManagerContract {
  ATRIBUTOS {
    name: String = 'log-manager'
    version: String = '3.0.0'
    config: {logsPath, maxFileSize, retentionDays, rotateDaily, sessionsPath, coreId, trackedModules, excludedModules}
    logStorage: LogStorage
    logCollector: LogCollector
    sessionLogger: SessionLogger
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    _cleanupTimer: NodeJS.Timeout|Null
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus FROM core
      CARGA config FROM core.config['log-manager'] || DEFAULT_CONFIG
      logStorage = new LogStorage({logsPath: config.logsPath, maxFileSize: config.maxFileSize, rotateDaily: config.rotateDaily})
      logCollector = new LogCollector({logStorage, logger})
      sessionLogger = new SessionLogger({sessionsPath: config.sessionsPath, coreId: config.coreId, trackedModules: config.trackedModules, excludedModules: config.excludedModules})
      _cleanupTimer = setInterval(() => _cleanup(), 24 * 60 * 60 * 1000)
      SI eventBus?.on: eventBus.on('log', (entry) => _handleLogEntry(entry))
      logger.info('log-manager.loaded', {logsPath: config.logsPath, retentionDays: config.retentionDays})

    async onUnload(): Promise<Void>
      SI _cleanupTimer: clearInterval(_cleanupTimer)
      await logStorage?.shutdown()
      await sessionLogger?.cleanup()

    async onModuleLoaded(event: Event): Promise<Void>
      {module_name} = event.data || event
      SI sessionLogger: await sessionLogger.registerModule(module_name)

    async _handleLogEntry(entry: LogEntry): Promise<Void>
      SI sessionLogger:
        await sessionLogger.appendLog(entry.module, entry.level, entry.message, entry.context)
      await logStorage.write(entry)

    async _cleanup(): Promise<Void>
      cutoff = now() - (config.retentionDays * 24 * 60 * 60 * 1000)
      await logStorage.cleanup(cutoff)
      await sessionLogger.cleanupOldSessions(cutoff)

    async handleGetSession(data: {session_id}): Promise<Response>
      TRY:
        VALIDA session_id
        session = await sessionLogger.getSession(data.session_id)
        SI !session: RETORNA 404 RESOURCE_NOT_FOUND
        modules = await sessionLogger.getSessionModules(data.session_id)
        RETORNA {status: 200, data: {session, modules, count: modules.length}}
      CATCH err:
        RETORNA _handleHandlerError('log-manager.get_session.failed', err, 'get_session')

    async handleGetSessionModules(data: {session_id}): Promise<Response>
      TRY:
        VALIDA session_id
        modules = await sessionLogger.getSessionModules(data.session_id)
        RETORNA {status: 200, data: {session_id: data.session_id, modules, count: modules.length}}
      CATCH err:
        RETORNA _handleHandlerError('log-manager.get_modules.failed', err, 'get_modules')

    async handleGetSessionModuleLogs(data: {session_id, module_name, limit?}): Promise<Response>
      TRY:
        VALIDA session_id, module_name
        limit = parseInt(data.limit) || 100
        logs = await sessionLogger.getModuleLogs(data.session_id, data.module_name, limit)
        SI !logs: RETORNA 404 RESOURCE_NOT_FOUND
        RETORNA {status: 200, data: {session_id: data.session_id, module_name: data.module_name, logs, count: logs.length}}
      CATCH err:
        RETORNA _handleHandlerError('log-manager.get_module_logs.failed', err, 'get_module_logs')

    async handleSetTrackedModules(data: {session_id, modules: Array<String>}): Promise<Response>
      TRY:
        VALIDA session_id, modules
        await sessionLogger.setTrackedModules(data.session_id, data.modules)
        metrics?.increment('log-manager.tracked_modules.updated')
        EMITE log_manager.tracked_modules.updated {session_id, modules: data.modules}
        RETORNA {status: 200, data: {session_id: data.session_id, tracked: data.modules.length}}
      CATCH err:
        RETORNA _handleHandlerError('log-manager.set_tracked.failed', err, 'set_tracked')

    _handleHandlerError(logEvent: String, err: Error, kind: String): Object
      code = err._code || 'UNKNOWN_ERROR'
      status = code == 'INVALID_INPUT' ? 400 : code == 'RESOURCE_NOT_FOUND' ? 404 : 500
      logger.error(logEvent, {error: err.message, kind, code})
      metrics?.increment('log-manager.errors', {kind, code})
      RETORNA {status, error: {code, message: err.message}}

    EVENTOS_PUBLISHES {
      'log_manager.tracked_modules.updated': {session_id, modules}
    }

    EVENTOS_SUBSCRIBES {
      'module.loaded': onModuleLoaded
    }
  }
}

CLASE LogStorage {
  ATRIBUTOS {
    logsPath: String
    maxFileSize: Integer
    rotateDaily: Boolean
    currentFile: String|Null
    currentSize: Integer
  }

  METODOS {
    async write(entry: LogEntry): Promise<Void>
      SI rotateDaily Y _shouldRotate(): await _rotateFile()
      SI currentSize >= maxFileSize: await _rotateFile()
      AGREGA entry a currentFile
      currentSize += entry.sizeBytes()

    async cleanup(cutoff: Number): Promise<Void>
      LISTA archivos EN logsPath
      PARA cada archivo:
        SI mtime < cutoff: ELIMINA archivo

    async shutdown(): Promise<Void>
      CIERRA currentFile
      currentFile = null
  }
}

CLASE LogCollector {
  ATRIBUTOS {
    logStorage: LogStorage
    logger: Logger
  }

  METODOS {
    async collectLogs(module_name: String, limit?: Integer): Promise<Array<LogEntry>>
      BUSCA EN logStorage logs PARA module_name
      RETORNA logs limitado por limit
  }
}

CLASE SessionLogger {
  ATRIBUTOS {
    sessionsPath: String
    coreId: String
    trackedModules: Array<String>
    excludedModules: Array<String>
    sessions: Map<session_id, SessionData>
  }

  METODOS {
    async getSession(session_id: String): Promise<SessionData|Null>
      CARGA de sessionsPath/{session_id}/meta.json
      RETORNA SessionData O null

    async getSessionModules(session_id: String): Promise<Array<String>>
      session = await getSession(session_id)
      SI !session: RETORNA []
      RETORNA Object.keys(session.modules)

    async getModuleLogs(session_id: String, module_name: String, limit: Integer): Promise<Array<LogEntry>>
      CARGA sessionsPath/{session_id}/logs/{module_name}.jsonl
      PARSEA y RETORNA últimas limit líneas

    async setTrackedModules(session_id: String, modules: Array<String>): Promise<Void>
      session = await getSession(session_id)
      session.trackedModules = modules
      PERSISTE meta.json

    async appendLog(module: String, level: String, message: String, context?: Object): Promise<Void>
      SI excludedModules.includes(module): RETORNA
      entry = {timestamp: now(), level, message, context}
      APPEND a session.modules[module].log

    async registerModule(module_name: String): Promise<Void>
      SI NOT tracked: RETORNA
      CREA módulo entry EN session.modules

    async cleanupOldSessions(cutoff: Number): Promise<Void>
      LISTA sesiones EN sessionsPath
      PARA cada sesión:
        SI timestamp < cutoff: ELIMINA directorio
  }
}

CLASE LogEntry {
  ATRIBUTOS {
    timestamp: String (ISO)
    level: String (debug|info|warn|error)
    message: String
    module: String
    context?: Object
  }
}

CLASE SessionData {
  ATRIBUTOS {
    session_id: String
    coreId: String
    modules: Map<module_name, {logs: Array<LogEntry>}>
    trackedModules: Array<String>
    created_at: String (ISO)
    updated_at: String (ISO)
  }
}
```

## MERCADONA-API (v2.0.0) — Cliente HTTP de Tienda Mercadona

```
INTERFAZ MercadonaApiContract {
  getProducts(postcode?: String, categoria?: String): Promise<{productos, total}>
  getProductDetails(product_id: String, postcode?: String): Promise<Object>
  getCategories(postcode?: String): Promise<Array<Categoria>>
  searchProducts(query: String, postcode?: String): Promise<{resultados, total}>
  getStats(): Promise<{cache_size, requests_total, errors_total, throttle_queue}>
}

CLASE MercadonaApiModule HEREDA BaseModule IMPLEMENTA MercadonaApiContract {
  ATRIBUTOS {
    name: String = 'mercadona-api'
    version: String = '2.0.0'
    config: {postcode_default, cache_ttl_hours, throttle_rps, base_url, timeout_ms, max_retries}
    cache: Map<cacheKey, {data, expiresAt}>
    throttle: {queue: Array<{fn, resolve, reject}>, lastCall: Number, interval: Integer}
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    internalMetrics: {requests_total, cache_hits, cache_misses, errors_total, rate_limited, timeouts}
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus FROM core
      CARGA config FROM core.config['mercadona-api'] || DEFAULT_CONFIG
      config.postcode_default = config.postcode_default || '30840'
      config.throttle_rps = config.throttle_rps || 2
      CALCULA throttle.interval = 1000 / config.throttle_rps
      INICIA _throttleProcessor()
      logger.info('mercadona-api.loaded', {base_url: config.base_url, throttle_rps: config.throttle_rps})

    async onUnload(): Promise<Void>
      SI _throttleProcessor: CANCELA()
      cache.clear()
      throttle.queue = []
      logger.info('mercadona-api.unloaded')

    _throttleProcessor(): Void
      setInterval(() => {
        SI throttle.queue.length > 0 Y now() - throttle.lastCall >= throttle.interval:
          {fn, resolve, reject} = throttle.queue.shift()
          throttle.lastCall = now()
          fn().then(resolve).catch(reject)
      }, 10)

    async _enqueueRequest<T>(fn: () => Promise<T>): Promise<T>
      RETORNA new Promise((resolve, reject) => {
        throttle.queue.push({fn, resolve, reject})
      })

    async handleGetProducts(data: {postcode?, categoria?, limit?}): Promise<Response>
      TRY:
        postcode = data.postcode || config.postcode_default
        VALIDA postcode format
        categoria = data.categoria || ''
        limit = parseInt(data.limit) || 100
        result = await getProducts(postcode, categoria)
        RETORNA {status: 200, data: {postcode, productos: result.productos.slice(0, limit), total: result.total}}
      CATCH err:
        RETORNA _handleHandlerError('mercadona-api.get_products.failed', err, 'get_products')

    async handleGetProductDetails(data: {product_id, postcode?}): Promise<Response>
      TRY:
        VALIDA product_id
        postcode = data.postcode || config.postcode_default
        details = await getProductDetails(data.product_id, postcode)
        RETORNA {status: 200, data: details}
      CATCH err:
        RETORNA _handleHandlerError('mercadona-api.get_details.failed', err, 'get_details')

    async handleGetCategories(data: {postcode?}): Promise<Response>
      TRY:
        postcode = data.postcode || config.postcode_default
        categorias = await getCategories(postcode)
        RETORNA {status: 200, data: {postcode, categorias, total: categorias.length}}
      CATCH err:
        RETORNA _handleHandlerError('mercadona-api.get_categories.failed', err, 'get_categories')

    async handleSearchProducts(data: {q, postcode?, limit?}): Promise<Response>
      TRY:
        VALIDA q obligatorio
        postcode = data.postcode || config.postcode_default
        limit = parseInt(data.limit) || 50
        result = await searchProducts(data.q, postcode)
        RETORNA {status: 200, data: {query: data.q, postcode, resultados: result.slice(0, limit), total: result.length}}
      CATCH err:
        RETORNA _handleHandlerError('mercadona-api.search.failed', err, 'search')

    async handleGetStats(): Promise<Response>
      RETORNA {status: 200, data: {cache_size: cache.size, requests_total: internalMetrics.requests_total, cache_hits: internalMetrics.cache_hits, cache_misses: internalMetrics.cache_misses, errors_total: internalMetrics.errors_total, rate_limited: internalMetrics.rate_limited, throttle_queue: throttle.queue.length}}

    async getProducts(postcode: String, categoria: String): Promise<{productos, total}>
      cacheKey = `products_{postcode}_{categoria}`
      cached = _cacheGet(cacheKey)
      SI cached: internalMetrics.cache_hits++, RETORNA cached
      internalMetrics.cache_misses++
      url = `{config.base_url}/products`
      queryParams = {postcode, categoria: categoria || '*'}
      result = await _fetchJson(url, {queryParams})
      productos = result.data.map(p => _parseProducto(p))
      RETORNA _cacheSet(cacheKey, {productos, total: productos.length})

    async getProductDetails(product_id: String, postcode: String): Promise<Object>
      cacheKey = `product_{product_id}_{postcode}`
      cached = _cacheGet(cacheKey)
      SI cached: internalMetrics.cache_hits++, RETORNA cached
      internalMetrics.cache_misses++
      url = `{config.base_url}/products/{product_id}`
      result = await _fetchJson(url, {queryParams: {postcode}})
      details = _parseProducto(result.data)
      RETORNA _cacheSet(cacheKey, details)

    async getCategories(postcode: String): Promise<Array<Categoria>>
      cacheKey = `categories_{postcode}`
      cached = _cacheGet(cacheKey)
      SI cached: internalMetrics.cache_hits++, RETORNA cached
      internalMetrics.cache_misses++
      url = `{config.base_url}/categories`
      result = await _fetchJson(url, {queryParams: {postcode}})
      categorias = result.data.map(c => _parseCategoria(c))
      RETORNA _cacheSet(cacheKey, categorias)

    async searchProducts(query: String, postcode: String): Promise<Array<Object>>
      cacheKey = `search_{query}_{postcode}`
      cached = _cacheGet(cacheKey)
      SI cached: internalMetrics.cache_hits++, RETORNA cached
      internalMetrics.cache_misses++
      url = `{config.base_url}/search`
      result = await _fetchJson(url, {queryParams: {q: query, postcode}})
      productos = result.data.map(p => _parseProducto(p))
      RETORNA _cacheSet(cacheKey, productos)

    async _fetchJson(url: String, options?: {queryParams?, retries?: Integer}): Promise<Object>
      retries = options?.retries || 0
      maxRetries = config.max_retries
      timeout = config.timeout_ms
      queryParams = options?.queryParams || {}
      SI Object.keys(queryParams).length > 0:
        queryString = new URLSearchParams(queryParams).toString()
        url = `{url}?{queryString}`
      TRY:
        internalMetrics.requests_total++
        metrics?.increment('mercadona-api.request', {endpoint: url})
        response = await fetch(url, {timeout, signal: AbortSignal.timeout(timeout)})
        SI response.status == 429:
          internalMetrics.rate_limited++
          SI retries < maxRetries:
            backoffMs = (2 ** retries) * 1000
            await sleep(backoffMs)
            RETORNA _fetchJson(url, {queryParams, retries: retries + 1})
          LANZA Error CON _code: 'RATE_LIMITED', _details: {retries_exhausted: true}
        SI !response.ok:
          errorMsg = `HTTP {response.status}`
          LANZA Error CON _code: 'UPSTREAM_INVALID_RESPONSE', _details: {status: response.status}
        data = await response.json()
        RETORNA data
      CATCH err:
        internalMetrics.errors_total++
        SI err.code == 'ABORT_ERR' O err.message.includes('timeout'):
          metrics?.increment('mercadona-api.errors', {kind: 'timeout'})
          LANZA Error CON _code: 'UPSTREAM_TIMEOUT', _details: {timeout_ms: timeout}
        SI err._code:
          metrics?.increment('mercadona-api.errors', {kind: err._code})
          RELANZA err
        metrics?.increment('mercadona-api.errors', {kind: 'unknown'})
        LANZA Error CON _code: 'UPSTREAM_UNREACHABLE', _details: {original: err.message}

    _parseProducto(rawData: Object): Producto
      RETORNA {
        id: rawData.id || rawData.product_id,
        nombre: rawData.display_name || rawData.name,
        precio: parseFloat(rawData.price || rawData.current_price),
        precio_unitario: parseFloat(rawData.unit_price),
        referencia: rawData.reference,
        categoria: rawData.category || rawData.categories?.[0],
        disponible: rawData.available !== false,
        imagen: rawData.image_url,
        marcaBlanca: rawData.is_white_label || false,
        iva: parseFloat(rawData.tax_rate || 0.21),
        precioInstrucciones: _parsePriceInstructions(rawData.price_instructions),
        etiquetas: rawData.tags || []
      }

    _parseCategoria(rawData: Object): Categoria
      RETORNA {
        id: rawData.id,
        nombre: rawData.name || rawData.display_name,
        descripcion: rawData.description,
        ruta: rawData.path || [rawData.name]
      }

    _parsePriceInstructions(instructions: Any): Object|Null
      SI !instructions: RETORNA null
      SI typeof instructions == 'string': PARSEA JSON
      RETORNA {valor: instructions.value, formato: instructions.format}

    _cacheGet(key: String): Any|Null
      entry = cache.get(key)
      SI !entry: RETORNA null
      SI now() > entry.expiresAt:
        cache.delete(key)
        RETORNA null
      RETORNA entry.data

    _cacheSet<T>(key: String, data: T): T
      expiresAt = now() + (config.cache_ttl_hours * 60 * 60 * 1000)
      cache.set(key, {data, expiresAt})
      SI cache.size > 1000:
        oldestKey = Array.from(cache.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0][0]
        cache.delete(oldestKey)
      RETORNA data

    _handleHandlerError(logEvent: String, err: Error, kind: String): Object
      code = err._code || _classifyError(err)
      status = code == 'INVALID_INPUT' ? 400 : code == 'RATE_LIMITED' ? 429 : code == 'UPSTREAM_TIMEOUT' ? 504 : code == 'UPSTREAM_UNREACHABLE' ? 503 : code == 'UPSTREAM_INVALID_RESPONSE' ? 502 : 500
      logger.error(logEvent, {error: err.message, code, kind})
      metrics?.increment('mercadona-api.errors', {code, kind})
      RETORNA {status, error: {code, message: err.message, details: err._details}}

    _classifyError(err: Error): String
      msg = (err.message || '').toLowerCase()
      SI msg.includes('timeout'): RETORNA 'UPSTREAM_TIMEOUT'
      SI msg.includes('rate'): RETORNA 'RATE_LIMITED'
      SI msg.includes('network') O msg.includes('econnrefused'): RETORNA 'UPSTREAM_UNREACHABLE'
      SI msg.includes('json') O msg.includes('invalid response'): RETORNA 'UPSTREAM_INVALID_RESPONSE'
      SI msg.includes('invalid') O msg.includes('required'): RETORNA 'INVALID_INPUT'
      RETORNA 'UNKNOWN_ERROR'

    EVENTOS_PUBLISHES {
      (ninguno)
    }

    EVENTOS_SUBSCRIBES {
      (ninguno)
    }
  }
}

CLASE Producto {
  ATRIBUTOS {
    id: String
    nombre: String
    precio: Number
    precio_unitario: Number
    referencia: String|Null
    categoria: String|Null
    disponible: Boolean
    imagen: String|Null
    marcaBlanca: Boolean
    iva: Number
    precioInstrucciones: Object|Null
    etiquetas: Array<String>
  }
}

CLASE Categoria {
  ATRIBUTOS {
    id: String
    nombre: String
    descripcion: String|Null
    ruta: Array<String>
  }
}

CLASE CacheEntry {
  ATRIBUTOS {
    data: Any
    expiresAt: Number
  }
}
```
