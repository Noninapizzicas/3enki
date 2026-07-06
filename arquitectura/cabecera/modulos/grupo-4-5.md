---
id: modulos/grupo-4-5
dominio: modulos
resumen: dashboard (SSE), database-manager (SQLite por proyecto), device-health, device-registry, device-shadow, esp32-dev.
fuentes:
  - modules/dashboard/**
  - modules/database-manager/**
  - modules/device-health/**
  - modules/device-registry/**
  - modules/device-shadow/**
  - modules/esp32-dev/**
verificado: 2026-07-06
---

# GRUPOS 4-5 PSEUDOCÓDIGO OOP

## GRUPO 4

### DASHBOARD (v3.0.0)

```
INTERFAZ DashboardContract {
  handleCores(): Promise<Response>
  handleCoreDetail(input: Object): Promise<Response>
  handleLogs(req: Request): Promise<Response>
  handleEvents(req: Request): Promise<Response>
  handleMetrics(): Promise<Response>
  handleHealth(): Promise<Response>
}

CLASE DashboardModule HEREDA BaseModule IMPLEMENTA DashboardContract {
  ATRIBUTOS {
    name: String = 'dashboard'
    version: String = '3.0.0'
    core: EventCore
    discovery: DiscoveryManager
    logBuffer: Array<LogEntry> (max 1000)
    eventBuffer: Array<EventEntry> (max 1000)
    maxBufferSize: Integer
    sseClients: {logs: Set<Response>, events: Set<Response>}
    _busMessageHandler: Function
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA core, discovery = null
      CONFIGURA maxBufferSize FROM config
      SUSCRIBE a streams (logs, events)
      LOG module.loaded

    async onUnload(): Promise<Void>
      DESUSCRIBE _busMessageHandler
      CIERRA todos SSE clients (logs + events)
      LIMPIA buffers
      LOG module.unloaded

    async handleCores(): Promise<Response>
      SI !discovery: RETORNA 503 UPSTREAM_UNREACHABLE
      cores = discovery.getActiveCores()
      RETORNA {status: 200, data: {cores[], total, timestamp}}

    async handleCoreDetail(input): Promise<Response>
      coreId = input.params.id || input.id
      VALIDA coreId
      SI !discovery: RETORNA 503
      core = discovery.getActiveCores().get(coreId)
      SI !core: RETORNA 404 RESOURCE_NOT_FOUND
      RETORNA {status: 200, data: {core detail + uptime_human}}

    async handleLogs(req): Promise<Response>
      RETORNA {_responseType: 'sse', onConnect: (res) => {
        sseClients.logs.add(res)
        PARA cada log EN logBuffer.slice(-50):
          res.write(`data: ${JSON.stringify(log)}\n\n`)
        SI req.on: req.on('close', () => sseClients.logs.delete(res))
      }}

    async handleEvents(req): Promise<Response>
      RETORNA {_responseType: 'sse', onConnect: (res) => {
        sseClients.events.add(res)
        PARA cada event EN eventBuffer.slice(-20):
          res.write(`data: ${JSON.stringify(event)}\n\n`)
        SI req.on: req.on('close', () => sseClients.events.delete(res))
      }}

    async handleMetrics(): Promise<Response>
      result = {timestamp, cores: {}, aggregate: {total_cores, total_events, buffer_logs, buffer_events, sse_clients}}
      SI discovery:
        cores = discovery.getActiveCores()
        PARA cada core: result.cores[coreId] = {uptime_ms, heartbeat_count, is_alive}
      RETORNA {status: 200, data: result}

    async handleHealth(): Promise<Response>
      RETORNA {status: 200, data: {module, version, status: healthy|degraded, discovery_available, buffer_logs, buffer_events, sse_clients}}

    _subscribeToStreams(): Void
      SI !eventBus?.on: RETORNA
      _busMessageHandler = (topic, message) => {
        SI topic.includes('/logs/'): _addToBuffer('logs', {topic, message, timestamp})
        SI topic.includes('/events/'): _addToBuffer('events', {topic, message, timestamp})
      }
      eventBus.on('message', _busMessageHandler)

    _addToBuffer(bufferName: String, item: Object): Void
      buffer = bufferName == 'logs' ? logBuffer : eventBuffer
      buffer.push(item)
      SI buffer.length > maxBufferSize: buffer.shift()
      _broadcastToSSEClients(bufferName, item)

    _broadcastToSSEClients(stream: String, data: Object): Void
      clients = sseClients[stream]
      PARA cada client EN clients:
        INTENTA client.write(`data: ${JSON.stringify(data)}\n\n`)
        EN catch: clients.delete(client)

    setDiscovery(discovery: DiscoveryManager): Void
      this.discovery = discovery

    EVENTOS_PUBLISHES {
      (ninguno — solo SSE streaming)
    }

    EVENTOS_SUBSCRIBES {
      (implícito via _busMessageHandler: logs/+/# y events/+/#)
    }
  }
}
```

### DATABASE-MANAGER (v3.0.0)

```
INTERFAZ DatabaseManagerContract {
  executeQuery(projectId: String, query: String, params?: Array): Promise<Array>
  persist(projectId: String, table: String, operation: String, data: Object): Promise<Void>
  initSchema(projectId: String, schema: String): Promise<Void>
  listDatabases(): Promise<Array<DatabaseInfo>>
  deleteDatabase(projectId: String): Promise<Void>
}

CLASE DatabaseManagerModule HEREDA BaseModule IMPLEMENTA DatabaseManagerContract {
  ATRIBUTOS {
    name: String = 'database-manager'
    version: String = '3.0.0'
    config: Object
    databases: Map<projectId, sqlite3.Database>
    projectPaths: Map<projectId, {basePath, slug}>
    projectsPath: String
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus, config
      projectsPath = config.projectsPath || './data/projects'
      ENSURA directorio projects
      LOG database-manager.loaded

    async onUnload(): Promise<Void>
      PARA cada [projectId, db] EN databases:
        db.close() CON error handling
      databases.clear()
      projectPaths.clear()
      LOG database-manager.unloaded

    async onQueryRequest(event): Promise<Void>
      VALIDA project_id, query
      db = await _getDatabase(project_id)
      SI read_only: results = await _all(db, query, params)
      SINO: SI autoSave: await _saveDatabase(project_id)
      EMITE db.query.response CON success, results|error

    async onPersistRequest(event): Promise<Void>
      VALIDA project_id, table, operation, data
      db = await _getDatabase(project_id)
      SI operation == 'insert': INSERT OR REPLACE INTO table
      SINO SI operation == 'update': UPDATE table SET ... WHERE ...
      SINO SI operation == 'delete': DELETE FROM table WHERE ...
      SI autoSave: await _saveDatabase(project_id)
      EMITE db.persist.response CON success

    async onSchemaInitRequest(event): Promise<Void>
      VALIDA schema string
      db = await _getDatabase(project_id)
      statements = schema.split(';').filter(s => s.trim())
      PARA cada statement: _exec(db, stmt) (ignora 'already exists')
      await _saveDatabase(project_id)
      EMITE db.schema.init.response + db.schema_initialized event

    async handleListDatabases(): Promise<Response>
      databases = []
      SI projectsPath existe:
        PARA cada directorio EN projectsPath:
          BUSCA db.sqlite (legacy) o db/{dirName}.sqlite (nuevo)
          databases.push({project_id, loaded, exists, size?, last_modified?, path?})
      RETORNA {status: 200, data: {databases, total, projects_path}}

    async handleExecuteQuery(req, context): Promise<Response>
      projectId, query, params, read_only = context
      VALIDA projectId, query
      results = await _all(db, query, params)
      SI !read_only && autoSave: await _saveDatabase(projectId)
      RETORNA {status: 200, data: {project_id, results, count, duration}}

    async handleGetSchema(req, context): Promise<Response>
      VALIDA projectId
      tables = SELECT * FROM sqlite_master WHERE type='table'
      RETORNA {status: 200, data: {project_id, tables, table_count}}

    async handleInitSchema(req, context): Promise<Response>
      VALIDA projectId, schema
      _exec(db, schema)
      await _saveDatabase(projectId)
      EMITE db.schema.initialized
      RETORNA {status: 200}

    async handleDeleteDatabase(req, context): Promise<Response>
      VALIDA projectId
      SI databases[projectId]: db.close() + delete
      ELIMINA dbPath DEL filesystem
      EMITE db.deleted
      RETORNA {status: 200}

    async handleToolQuery(args): Promise<Response>
      VALIDA projectId, query (debe ser SELECT)
      results = await _all(db, query, params)
      RETORNA {status: 200, data: {projectId, results, count, duration}}

    async handleToolTables(args): Promise<Response>
      tables = SELECT name FROM sqlite_master WHERE type='table'
      RETORNA {status: 200, data: {projectId, tables, count}}

    async handleToolSchema(args): Promise<Response>
      VALIDA projectId, tableName
      columns = PRAGMA table_info(tableName)
      foreignKeys = PRAGMA foreign_key_list(tableName)
      indexes = PRAGMA index_list(tableName)
      createStatement = SELECT sql FROM sqlite_master WHERE type='table'
      RETORNA {status: 200, data: {projectId, tableName, columns, foreignKeys, indexes, createStatement}}

    async handleToolExecute(args): Promise<Response>
      VALIDA projectId, query (NO debe ser SELECT)
      result = await _run(db, query, params)
      SI autoSave: await _saveDatabase(projectId)
      RETORNA {status: 200, data: {projectId, affectedRows, lastInsertId, duration}}

    async _resolveDatabasePath(projectId): Promise<{projectDir, dbPath, isSystem}>
      SI projectId EN {system, _prompts}: RETORNA legacy path
      SI projectId EN cache: RETORNA cached path
      SI systemDb existe:
        result = SELECT base_path, name FROM projects WHERE id = projectId
        SI result: cache + RETORNA nuevo path
      SINO: Fallback a legacy path

    async _getDatabase(projectId): Promise<sqlite3.Database>
      SI databases[projectId]: RETORNA cached
      {dbPath, isSystem} = await _resolveDatabasePath(projectId)
      CREA dbDir SI NO existe
      ABRE sqlite3.Database(dbPath)
      CACHE + SI isNew: EMITE db.created
      RETORNA db

    async _saveDatabase(projectId): Promise<Boolean>
      (sqlite3 nativo escribe directo — no-op preservado por API symmetry)
      RETORNA true

    EVENTOS_PUBLISHES {
      'db.created': {project_id, created_at}
      'db.deleted': {project_id, deleted_at}
      'db.query.response': {request_id, project_id, success, data|error, timestamp, correlation_id?}
      'db.schema.init.response': {request_id, project_id, success, error?, timestamp}
      'db.query.executed': {project_id, result_count, read_only, duration, executed_at}
      'db.schema.initialized': {project_id, initialized_at}
    }

    EVENTOS_SUBSCRIBES {
      'db.query.request': onQueryRequest
      'db.persist.request': onPersistRequest
      'db.schema.init.request': onSchemaInitRequest
    }
  }
}
```

### DEVICE-HEALTH (v2.0.0)

```
INTERFAZ DeviceHealthContract {
  handleDashboard(data?: Object): Promise<Response>
  handleDeviceHistory(data: {device_id}): Promise<Response>
  handleAlerts(data?: {active_only?, device_id?, type?, limit?}): Promise<Response>
}

CLASE DeviceHealthModule HEREDA BaseModule IMPLEMENTA DeviceHealthContract {
  ATRIBUTOS {
    name: String = 'device-health'
    version: String = '2.0.0'
    config: {offline_threshold_min, reconnect_loop_threshold, reconnect_loop_window_min, report_interval_min, data_path}
    deviceStates: Map<deviceId, DeviceHealthState>
    alerts: Array<Alert> (ring buffer, max 200)
    maxAlerts: Integer = 200
    _offlineTimers: Map<deviceId, NodeJS.Timeout>
    _reportTimer: NodeJS.Timeout
    internalMetrics: {alerts_total, alerts_offline, alerts_reconnect_loop, alerts_ota_failed}
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus
      config = core.config['device-health'] || config defaults
      config.data_path = path.resolve(config.data_path)
      await _loadHistory()
      _reportTimer = setInterval(() => _publishReport(), config.report_interval_min * 60000)
      LOG module.loaded

    async onUnload(): Promise<Void>
      clearInterval(_reportTimer)
      _offlineTimers.forEach(timer => clearTimeout(timer))
      _offlineTimers.clear()
      await _saveHistory()
      deviceStates.clear()
      alerts.clear()
      LOG module.unloaded

    async onDeviceOnline(event): Promise<Void>
      device_id, project_id, correlation_id = event.data || event
      VALIDA device_id
      state = _getOrCreateState(device_id)
      SI state.is_offline && state.last_offline:
        CALCULA offlineDuration
        AGREGA a offline_periods
        SI size > 50: MANTÉN últimas 50
      state.is_offline = false
      state.last_online = now
      state.reconnections_24h.push(now)
      FILTRA reconnections > 24h cutoff
      _clearOfflineTimer(device_id)
      DETECTA reconnect_loop: SI recent >= threshold EN window:
        await _createAlert('reconnect_loop', device_id, project_id, {details}, {correlation_id})

    async onDeviceOffline(event): Promise<Void>
      device_id, project_id, reason, correlation_id = event.data || event
      VALIDA device_id
      state = _getOrCreateState(device_id)
      state.is_offline = true
      state.last_offline = now
      _clearOfflineTimer(device_id)
      thresholdMs = config.offline_threshold_min * 60000
      timer = setTimeout(() => {
        current = deviceStates.get(device_id)
        SI current?.is_offline:
          await _createAlert('offline', device_id, project_id, {details}, {correlation_id})
      }, thresholdMs)
      _offlineTimers.set(device_id, timer)

    async onOtaFailed(event): Promise<Void>
      device_id, project_id, type, from, to, correlation_id = event
      VALIDA device_id
      await _createAlert('ota_failed', device_id, project_id, {message, details}, {correlation_id})
      state = _getOrCreateState(device_id)
      state.ota_history.push({status: 'failed', from, to, type, timestamp})
      SI size > 20: MANTÉN últimos 20

    async onOtaCompleted(event): Promise<Void>
      device_id, type, from, to = event
      VALIDA device_id
      state = _getOrCreateState(device_id)
      state.ota_history.push({status: 'completed', from, to, type, timestamp})
      SI size > 20: MANTÉN últimos 20

    async handleDashboard(data?: Object): Promise<Response>
      devices = []
      now = new Date()
      cutoff24h = now - DAY_MS
      PARA cada [deviceId, state] EN deviceStates:
        CALCULA totalOfflineMs (últimas 24h)
        SI state.is_offline: AGREGA offline actual
        uptimePct = (DAY_MS - totalOfflineMs) / DAY_MS * 100
        reconnections = state.reconnections_24h.filter(t > cutoff24h).length
        devices.push({device_id, is_offline, uptime_pct_24h, reconnections_24h, last_online, last_offline, consecutive_offline_min})
      online = devices.filter(!is_offline).length
      offline = devices.filter(is_offline).length
      activeAlerts = alerts.filter(!resolved).length
      RETORNA {status: 200, data: {summary, devices, recent_alerts: alerts[0:10]}}

    async handleDeviceHistory(data: {device_id}): Promise<Response>
      VALIDA device_id
      state = deviceStates.get(device_id)
      SI !state: RETORNA 404 RESOURCE_NOT_FOUND
      RETORNA {status: 200, data: {device_id, is_offline, last_online, last_offline, reconnections_24h, offline_periods[-20:], ota_history, alerts[]}}

    async handleAlerts(data?: Object): Promise<Response>
      alerts = [...this.alerts]
      SI data.active_only: FILTRA !resolved
      SI data.device_id: FILTRA por device_id
      SI data.type: FILTRA por type
      limit = parseInt(data.limit) || 50
      RETORNA {status: 200, data: {alerts[0:limit], total, active}}

    async _createAlert(type: String, deviceId: String, projectId: String|Null, body: Object, sourcePayload?: Object): Promise<Void>
      VALIDA type EN KNOWN_ALERT_TYPES
      message, details, timestamp = body
      alert = {type, device_id, project_id, message, details, timestamp, resolved: false}
      alerts.unshift(alert)
      SI alerts.length > maxAlerts: alerts.pop()
      internalMetrics.alerts_total++
      internalMetrics[`alerts_${type}`]++
      LOG warn
      await _publicarEvento(`health.alert.${type}`, {device_id, project_id, message, details, timestamp}, sourcePayload)

    async _publishReport(): Promise<Void>
      now = new Date()
      online, offline = 0
      PARA cada state EN deviceStates.values():
        state.is_offline ? offline++ : online++
      activeAlerts = alerts.filter(!resolved).length
      metrics.gauge('health.flota.online', online)
      metrics.gauge('health.flota.offline', offline)
      await _publicarEvento('health.report', {total_devices, online, offline, active_alerts, timestamp})

    _getOrCreateState(deviceId): DeviceHealthState
      SI !deviceStates[deviceId]:
        deviceStates.set(deviceId, {is_offline, last_online, last_offline, reconnections_24h, offline_periods, ota_history})
      RETORNA deviceStates.get(deviceId)

    _clearOfflineTimer(deviceId): Void
      timer = _offlineTimers.get(deviceId)
      SI timer: clearTimeout(timer), _offlineTimers.delete(deviceId)

    async _loadHistory(): Promise<Void>
      filePath = config.data_path + '/health-history.json'
      INTENTA fs.readFile(filePath)
      data = JSON.parse(raw)
      SI data.states: PARA cada [deviceId, state]: deviceStates.set(deviceId, state)
      SI data.alerts: this.alerts = data.alerts
      LOG loaded_from_disk

    async _saveHistory(): Promise<Void>
      filePath = config.data_path + '/health-history.json'
      data = {_version, _updated, states: Map→Object, alerts}
      fs.writeFile(tmpPath, JSON.stringify(data))
      fs.rename(tmpPath, filePath) [atomic]

    EVENTOS_PUBLISHES {
      'health.alert.offline': {device_id, project_id, message, details, timestamp}
      'health.alert.reconnect_loop': {device_id, project_id, message, details, timestamp}
      'health.alert.ota_failed': {device_id, project_id, message, details, timestamp}
      'health.report': {total_devices, online, offline, active_alerts, timestamp}
    }

    EVENTOS_SUBSCRIBES {
      'device.online': onDeviceOnline
      'device.offline': onDeviceOffline
      'firmware.ota_failed': onOtaFailed
      'firmware.ota_completed': onOtaCompleted
    }
  }
}

CLASE DeviceHealthState {
  ATRIBUTOS {
    is_offline: Boolean
    last_online: String|Null (ISO)
    last_offline: String|Null (ISO)
    reconnections_24h: Array<String> (ISO timestamps)
    offline_periods: Array<{from, to, duration_ms}>
    ota_history: Array<{status, from, to, type, timestamp}>
  }
}

CLASE Alert {
  ATRIBUTOS {
    type: String (offline|reconnect_loop|ota_failed)
    device_id: String
    project_id: String|Null
    message: String
    details: Object
    timestamp: String (ISO)
    resolved: Boolean
  }
}
```

## GRUPO 5

### DEVICE-REGISTRY (v2.0.0)

```
INTERFAZ DeviceRegistryContract {
  listDevices(filters?: Object): Promise<Array<Device>>
  getDevice(deviceId: String): Promise<Device>
  registerDevice(data: {device_id, project_id, name, type, ...}): Promise<Device>
  unregisterDevice(deviceId: String): Promise<Void>
  updateDevice(deviceId: String, updates: Object): Promise<Device>
}

CLASE DeviceRegistryModule HEREDA BaseModule IMPLEMENTA DeviceRegistryContract {
  ATRIBUTOS {
    name: String = 'device-registry'
    version: String = '2.0.0'
    config: {heartbeat_timeout_ms, persist_interval_ms, data_path}
    devices: Map<deviceId, Device>
    _heartbeatTimers: Map<deviceId, NodeJS.Timeout>
    _persistTimer: NodeJS.Timeout
    _dirty: Boolean
    _onMqttMessage: Function
    internalMetrics: {registered_total, unregistered_total, births_total, lwts_total, online_current, offline_current}
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus
      config = core.config['device-registry'] || defaults
      config.data_path = path.resolve(config.data_path)
      await _loadFromDisk()
      MARCA todos EN offline (la realidad MQTT mandará)
      _recalcMetrics()
      await _startMqttListeners()
      _persistTimer = setInterval(() => _persistIfDirty(), config.persist_interval_ms)
      LOG module.loaded

    async onUnload(): Promise<Void>
      _stopMqttListeners()
      clearInterval(_persistTimer)
      _heartbeatTimers.forEach(timer => clearTimeout(timer))
      _heartbeatTimers.clear()
      await _persistToDisk()
      devices.clear()
      LOG module.unloaded

    async _startMqttListeners(): Promise<Void>
      mqtt = eventBus.mqtt
      SI !mqtt?.isConnected: LOG warn, RETORNA
      _onMqttMessage = _handleMqttMessage.bind(this)
      mqtt.on('message', _onMqttMessage)
      topics = ['devices/+/+/birth', 'devices/+/+/lwt', 'enki/+/status/+', 'impresion/+/status/+']
      PARA cada topic: await mqtt.subscribe(topic)
      LOG mqtt.subscribed

    _stopMqttListeners(): Void
      mqtt = eventBus.mqtt
      SI mqtt && _onMqttMessage: mqtt.removeListener('message', _onMqttMessage)
      _onMqttMessage = null

    _handleMqttMessage(topic: String, payload: Buffer): Void
      SI topic MATCH devices/{project}/{device}/birth:
        _handleBirth(project, device, payload)
      SINO SI topic MATCH devices/{project}/{device}/lwt:
        _handleLwt(project, device)
      SINO SI topic MATCH enki/{project}/status/{device}:
        _handleStatus(project, device, payload, 'mqtt-native')
      SINO SI topic MATCH impresion/{project}/status/{device}:
        _handleStatus(project, device, payload, 'mqtt-native')

    _handleBirth(projectId: String, deviceId: String, payload: Buffer): Void
      data = _parsePayload(payload, 'birth')
      SI !data: RETORNA
      internalMetrics.births_total++
      existing = devices.get(deviceId)
      now = new Date().toISOString()
      device = {device_id, project_id, name: data.name||deviceId, type: data.type||'unknown', driver, capabilities, protocol, gateway, state: 'online', firmware, metadata, last_seen: now, registered_at: existing?.registered_at || now}
      isNew = !existing
      devices.set(deviceId, device)
      _dirty = true
      _resetHeartbeat(deviceId)
      _recalcMetrics()
      SI isNew:
        internalMetrics.registered_total++
        LOG device.registered
        _publicarEvento('device.registered', {device_id, project_id, device: sanitized, source: 'birth'})
      _publicarEvento('device.online', {device_id, project_id, timestamp: now, source: 'birth'})

    _handleLwt(projectId: String, deviceId: String): Void
      internalMetrics.lwts_total++
      device = devices.get(deviceId)
      SI !device: RETORNA
      SI device.state == 'offline': RETORNA
      device.state = 'offline'
      _dirty = true
      _clearHeartbeat(deviceId)
      _recalcMetrics()
      LOG device.offline
      _publicarEvento('device.offline', {device_id, project_id, reason: 'lwt', timestamp: now})

    _handleStatus(projectId: String, deviceId: String, payload: Buffer, protocol: String): Void
      data = _parsePayload(payload, 'status')
      SI !data: RETORNA
      existing = devices.get(deviceId)
      now = new Date().toISOString()
      SI !existing:
        resolvedProject = projectId || data.project_id || 'default'
        device = {device_id, project_id: resolvedProject, name, type, driver, capabilities, protocol, gateway, state: 'online', firmware, metadata, last_seen: now, registered_at: now}
        devices.set(deviceId, device)
        internalMetrics.registered_total++
        _dirty = true
        _resetHeartbeat(deviceId)
        _recalcMetrics()
        LOG device.registered (auto-discovery)
        _publicarEvento('device.registered', {device_id, project_id, device: sanitized, source: 'status-autodiscovery'})
      SINO:
        _updateHeartbeat(deviceId)
        SI existing.state == 'offline':
          existing.state = 'online'
          _dirty = true
          _resetHeartbeat(deviceId)
          _recalcMetrics()
          _publicarEvento('device.online', {device_id, project_id, timestamp: now, source: 'status'})

    _resetHeartbeat(deviceId: String): Void
      _clearHeartbeat(deviceId)
      timer = setTimeout(() => {
        device = devices.get(deviceId)
        SI device && device.state == 'online':
          device.state = 'offline'
          _dirty = true
          _recalcMetrics()
          _publicarEvento('device.offline', {device_id, project_id, reason: 'heartbeat_timeout', timestamp: now})
      }, config.heartbeat_timeout_ms)
      _heartbeatTimers.set(deviceId, timer)

    _clearHeartbeat(deviceId: String): Void
      timer = _heartbeatTimers.get(deviceId)
      SI timer: clearTimeout(timer), _heartbeatTimers.delete(deviceId)

    _updateHeartbeat(deviceId: String): Void
      _resetHeartbeat(deviceId)

    _recalcMetrics(): Void
      online, offline = 0
      PARA cada device EN devices.values():
        device.state == 'online' ? online++ : offline++
      internalMetrics.online_current = online
      internalMetrics.offline_current = offline
      metrics.gauge('devices.online', online)
      metrics.gauge('devices.offline', offline)

    async _loadFromDisk(): Promise<Void>
      filePath = config.data_path + '/registry.json'
      INTENTA fs.readFile(filePath)
      data = JSON.parse(raw)
      SI data.devices: PARA cada [deviceId, device]: devices.set(deviceId, device)
      LOG loaded_from_disk

    async _persistIfDirty(): Promise<Void>
      SI !_dirty: RETORNA
      await _persistToDisk()
      _dirty = false

    async _persistToDisk(): Promise<Void>
      filePath = config.data_path + '/registry.json'
      data = {_version, _updated, devices: Map→Object}
      fs.writeFile(tmpPath, JSON.stringify(data))
      fs.rename(tmpPath, filePath) [atomic]

    EVENTOS_PUBLISHES {
      'device.registered': {device_id, project_id, device, source}
      'device.unregistered': {device_id, project_id}
      'device.online': {device_id, project_id, timestamp, source}
      'device.offline': {device_id, project_id, reason, timestamp}
      'device.updated': {device_id, project_id, updates}
    }

    EVENTOS_SUBSCRIBES {
      'device.register': onDeviceRegister (manual)
      'device.unregister': onDeviceUnregister
    }
  }
}

CLASE Device {
  ATRIBUTOS {
    device_id: String
    project_id: String
    name: String
    type: String (unknown|sensor|actuator|gateway|display)
    driver: String|Null
    capabilities: Array<String>
    protocol: String (mqtt-native|http|ble|zigbee)
    gateway: String|Null
    state: String (online|offline)
    firmware: Object|Null
    metadata: Object
    last_seen: String (ISO)
    registered_at: String (ISO)
  }
}
```

### DEVICE-SHADOW (v2.0.0)

```
INTERFAZ DeviceShadowContract {
  getReported(deviceId: String): Promise<Object>
  getDesired(deviceId: String): Promise<Object>
  getDelta(deviceId: String): Promise<Object>
  setDesired(deviceId: String, projectId: String, state: Object): Promise<Void>
}

CLASE DeviceShadowModule HEREDA BaseModule IMPLEMENTA DeviceShadowContract {
  ATRIBUTOS {
    name: String = 'device-shadow'
    version: String = '2.0.0'
    config: {persist_interval_ms, data_path}
    shadows: Map<deviceId, Shadow>
    _persistTimer: NodeJS.Timeout
    _dirty: Boolean
    _onMqttMessage: Function
    internalMetrics: {reported_updates_total, desired_updates_total, deltas_computed_total, synced_total}
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus
      config = core.config['device-shadow'] || defaults
      config.data_path = path.resolve(config.data_path)
      await _loadFromDisk()
      await _startMqttListeners()
      _persistTimer = setInterval(() => _persistIfDirty(), config.persist_interval_ms)
      LOG module.loaded

    async onUnload(): Promise<Void>
      _stopMqttListeners()
      clearInterval(_persistTimer)
      await _persistToDisk()
      shadows.clear()
      LOG module.unloaded

    async _startMqttListeners(): Promise<Void>
      mqtt = eventBus.mqtt
      SI !mqtt?.isConnected: LOG warn, RETORNA
      _onMqttMessage = _handleMqttMessage.bind(this)
      mqtt.on('message', _onMqttMessage)
      await mqtt.subscribe('devices/+/+/state/reported')
      LOG mqtt.subscribed

    _stopMqttListeners(): Void
      mqtt = eventBus.mqtt
      SI mqtt && _onMqttMessage: mqtt.removeListener('message', _onMqttMessage)
      _onMqttMessage = null

    _handleMqttMessage(topic: String, payload: Buffer): Void
      SI topic NO MATCH devices/{project}/{device}/state/reported: RETORNA
      [, projectId, deviceId] = match
      data = _parsePayload(payload, topic)
      SI !data: RETORNA
      _updateReported(deviceId, projectId, data)

    _updateReported(deviceId: String, projectId: String, reported: Object, correlationId?: String): Void
      internalMetrics.reported_updates_total++
      shadow = _getOrCreateShadow(deviceId)
      shadow.reported = {...shadow.reported, ...reported}
      shadow.last_reported_at = now
      _dirty = true
      LOG device-shadow.reported.updated
      _publicarEvento('shadow.updated', {device_id, project_id, reported: shadow.reported, timestamp}, {correlation_id})
      _computeAndPublishDelta(deviceId, projectId, correlationId)

    _updateDesired(deviceId: String, projectId: String, desired: Object, correlationId?: String): Void
      internalMetrics.desired_updates_total++
      shadow = _getOrCreateShadow(deviceId)
      shadow.desired = {...shadow.desired, ...desired}
      shadow.last_desired_at = now
      _dirty = true
      mqtt = eventBus.mqtt
      SI mqtt?.isConnected:
        topic = `devices/${projectId}/${deviceId}/state/desired`
        mqtt.publish(topic, JSON.stringify(shadow.desired), {qos: 1, retain: true})
      LOG device-shadow.desired.updated
      _computeAndPublishDelta(deviceId, projectId, correlationId)

    _computeAndPublishDelta(deviceId: String, projectId: String, correlationId?: String): Void
      shadow = shadows.get(deviceId)
      SI !shadow: RETORNA
      delta = _computeDelta(shadow.desired, shadow.reported)
      hadDelta = Object.keys(shadow.delta).length > 0
      shadow.delta = delta
      _dirty = true
      internalMetrics.deltas_computed_total++
      mqtt = eventBus.mqtt
      SI mqtt?.isConnected:
        topic = `devices/${projectId}/${deviceId}/state/delta`
        mqtt.publish(topic, JSON.stringify(delta), {qos: 1, retain: true})
      SI Object.keys(delta).length > 0:
        _publicarEvento('shadow.delta', {device_id, project_id, delta, timestamp}, {correlation_id})
      SINO SI hadDelta:
        internalMetrics.synced_total++
        LOG device-shadow.synced
        _publicarEvento('shadow.synced', {device_id, project_id, timestamp}, {correlation_id})

    _computeDelta(desired: Object, reported: Object): Object
      delta = {}
      PARA cada [key, desiredValue] EN desired:
        reportedValue = reported[key]
        SI typeof desiredValue == 'object' && typeof reportedValue == 'object':
          subDelta = {}
          PARA cada [subKey, subVal] EN desiredValue:
            SI JSON.stringify(subVal) != JSON.stringify(reportedValue[subKey]):
              subDelta[subKey] = subVal
          SI subDelta items: delta[key] = subDelta
        SINO SI JSON.stringify(desiredValue) != JSON.stringify(reportedValue):
          delta[key] = desiredValue
      RETORNA delta

    async onSetDesired(event): Promise<Void>
      device_id, project_id, state, correlation_id = event.data || event
      VALIDA device_id, state (object)
      _updateDesired(device_id, project_id || 'default', state, correlation_id)

    async handleGetReported(data): Promise<Response>
      VALIDA device_id
      shadow = shadows.get(device_id)
      SI !shadow: RETORNA 404
      RETORNA {status: 200, data: {device_id, reported, last_reported_at}}

    async handleGetDesired(data): Promise<Response>
      VALIDA device_id
      shadow = shadows.get(device_id)
      SI !shadow: RETORNA 404
      RETORNA {status: 200, data: {device_id, desired, last_desired_at}}

    async handleGetDelta(data): Promise<Response>
      VALIDA device_id
      shadow = shadows.get(device_id)
      SI !shadow: RETORNA 404
      RETORNA {status: 200, data: {device_id, delta, has_delta}}

    _getOrCreateShadow(deviceId: String): Shadow
      SI !shadows[deviceId]:
        shadows.set(deviceId, {reported: {}, desired: {}, delta: {}, last_reported_at, last_desired_at})
      RETORNA shadows.get(deviceId)

    async _loadFromDisk(): Promise<Void>
      filePath = config.data_path + '/shadows.json'
      INTENTA fs.readFile(filePath)
      data = JSON.parse(raw)
      SI data.shadows: PARA cada [deviceId, shadow]: shadows.set(deviceId, shadow)
      LOG loaded_from_disk

    async _persistIfDirty(): Promise<Void>
      SI !_dirty: RETORNA
      await _persistToDisk()
      _dirty = false

    async _persistToDisk(): Promise<Void>
      filePath = config.data_path + '/shadows.json'
      data = {_version, _updated, shadows: Map→Object}
      fs.writeFile(tmpPath, JSON.stringify(data))
      fs.rename(tmpPath, filePath) [atomic]

    EVENTOS_PUBLISHES {
      'shadow.updated': {device_id, project_id, reported, timestamp}
      'shadow.delta': {device_id, project_id, delta, timestamp}
      'shadow.synced': {device_id, project_id, timestamp}
    }

    EVENTOS_SUBSCRIBES {
      'shadow.set_desired': onSetDesired
      'devices/+/+/state/reported': (MQTT topic)
    }
  }
}

CLASE Shadow {
  ATRIBUTOS {
    reported: Object
    desired: Object
    delta: Object
    last_reported_at: String|Null (ISO)
    last_desired_at: String|Null (ISO)
  }
}
```

### ESP32-DEV (v2.0.0)

```
INTERFAZ ESP32DevContract {
  listTemplates(filters?: {framework?, board?}): Promise<Array<Template>>
  createProject(data: {project_name, template, board?, framework?, vars?}): Promise<Response>
  listProjects(): Promise<Array<ProjectInfo>>
  buildProject(projectName: String): Promise<Response>
  cleanProject(projectName: String): Promise<Response>
  getProjectLogs(projectName: String): Promise<String>
}

CLASE ESP32DevModule HEREDA BaseModule IMPLEMENTA ESP32DevContract {
  ATRIBUTOS {
    name: String = 'esp32-dev'
    version: String = '2.0.0'
    config: {data_path, platformio_path, build_timeout_ms, max_concurrent_builds}
    templates: Map<templateId, Template>
    activeBuilds: Map<projectName, {process, started_at, log}>
    projects: Map<projectName, ProjectMetadata>
    BOARDS: {esp32dev, esp32-s2, esp32-s3, esp32-c3, esp32-c6, esp32-p4}
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus
      config = core.config['esp32-dev'] || defaults
      config.data_path = path.resolve(config.data_path)
      await _ensureDir(config.data_path)
      await _ensureDir(config.data_path + '/projects')
      await _loadTemplates()
      await _loadProjects()
      metrics.gauge('esp32.projects.count', projects.size)
      metrics.gauge('esp32.active_builds.count', 0)
      LOG module.loaded

    async onUnload(): Promise<Void>
      PARA cada [name, build] EN activeBuilds:
        SI build.process && !killed: build.process.kill('SIGTERM')
        LOG esp32.build.killed_on_unload
      activeBuilds.clear()
      await _saveProjects()
      LOG module.unloaded

    async handleListTemplates(data?: {framework?, board?}): Promise<Response>
      list = []
      PARA cada [id, tpl] EN templates:
        SI data.framework && tpl.framework != data.framework: CONTINÚA
        SI data.board && !tpl.boards.includes(data.board): CONTINÚA
        list.push({id, name, description, framework, boards, category})
      RETORNA {status: 200, data: {templates: list, total}}

    async handleCreateProject(data: {project_name, template, board?, framework?, vars?}): Promise<Response>
      VALIDA project_name (required)
      VALIDA template (required)
      VALIDA project_name ES slug (lowercase, hyphens)
      SI projects[project_name]: RETORNA 409 ALREADY_EXISTS
      tpl = templates.get(template)
      SI !tpl: RETORNA 404 RESOURCE_NOT_FOUND (template)
      selectedBoard = board || tpl.defaultBoard || 'esp32dev'
      selectedFramework = framework || tpl.framework || 'arduino'
      SI !BOARDS[selectedBoard]: RETORNA 400 (board no soportado)
      projectDir = config.data_path + '/projects/' + project_name
      TRY:
        await _ensureDir(projectDir + '/src')
        await _ensureDir(projectDir + '/include')
        templateVars = {PROJECT_NAME, BOARD, FRAMEWORK, PLATFORM, MONITOR_SPEED, UPLOAD_SPEED, ...vars}
        PARA cada [filePath, content] EN tpl.files:
          rendered = _renderTemplate(content, templateVars)
          fullPath = projectDir + '/' + filePath
          await _ensureDir(dirname(fullPath))
          fs.writeFile(fullPath, rendered)
        projects[project_name] = {name, template, board: selectedBoard, framework: selectedFramework, created_at, last_build, last_build_status, path: projectDir}
        await _saveProjects()
        metrics.increment('esp32.project_created.total')
        metrics.gauge('esp32.projects.count', projects.size)
        LOG esp32.project.created
        await eventBus.publish('esp32.project_created', {project_name, template, board: selectedBoard, framework: selectedFramework})
        RETORNA {status: 201, data: {project_name, template, board, framework, path, files}}
      CATCH err:
        fs.rm(projectDir, {recursive, force}) [best-effort]
        RETORNA error

    async handleListProjects(): Promise<Response>
      list = projects.values().map(p => ({name, template, board, framework, created_at, last_build, last_build_status}))
      RETORNA {status: 200, data: {projects: list, total}}

    async handleBuildProject(data: {project_name}): Promise<Response>
      project_name = data.project_name
      VALIDA project_name
      project = projects[project_name]
      SI !project: RETORNA 404
      SI activeBuilds.get(project_name): RETORNA 409 (build ya en progreso)
      SI activeBuilds.size >= config.max_concurrent_builds: RETORNA 429 (queue llena)
      projectDir = project.path
      LOG esp32.build.started
      process = spawn(config.platformio_path, ['run', '-d', projectDir], {stdio: ['pipe', 'pipe', 'pipe']})
      log = ''
      process.stdout.on('data', (data) => { log += data })
      process.stderr.on('data', (data) => { log += data })
      timeout = setTimeout(() => {
        SI !process.killed: process.kill('SIGKILL')
        activeBuilds.delete(project_name)
        metrics.increment('esp32.build.timeout.total')
        LOG esp32.build.timeout
        eventBus.publish('esp32.build_failed', {project_name, reason: 'timeout'})
      }, config.build_timeout_ms)
      activeBuilds.set(project_name, {process, started_at: now, log: ''})
      process.on('exit', (code) => {
        clearTimeout(timeout)
        activeBuilds.delete(project_name)
        project.last_build = now
        project.last_build_status = code == 0 ? 'success' : 'failed'
        _saveProjects()
        metrics.increment('esp32.build.' + project.last_build_status + '.total')
        LOG esp32.build.completed
        SI code == 0:
          eventBus.publish('esp32.build_succeeded', {project_name, duration_ms, log})
        SINO:
          eventBus.publish('esp32.build_failed', {project_name, exit_code: code, log})
      })
      RETORNA {status: 202, data: {project_name, status: 'building', started_at: now}}

    async handleCleanProject(data: {project_name}): Promise<Response>
      project_name = data.project_name
      VALIDA project_name
      project = projects[project_name]
      SI !project: RETORNA 404
      projectDir = project.path
      buildDir = projectDir + '/.pio'
      TRY:
        SI buildDir existe: fs.rm(buildDir, {recursive, force})
        metrics.increment('esp32.project_cleaned.total')
        LOG esp32.project.cleaned
        RETORNA {status: 200, data: {project_name, message: 'Build artifacts cleaned'}}
      CATCH err:
        RETORNA error

    async handleGetProjectLogs(data: {project_name}): Promise<Response>
      project_name = data.project_name
      VALIDA project_name
      build = activeBuilds.get(project_name)
      SI !build: RETORNA {status: 200, data: {project_name, log: '', status: 'not_building'}}
      RETORNA {status: 200, data: {project_name, log: build.log, status: 'building'}}

    _renderTemplate(template: String, vars: Object): String
      SUSTITUYE {{VAR_NAME}} CON vars.VAR_NAME
      RETORNA rendered string

    async _loadTemplates(): Promise<Void>
      (built-in templates hardcoded: blink-led, mqtt-client, display, sensor, etc.)
      templates.set(id, {name, description, framework, boards, defaultBoard, category, files: {...}})

    async _loadProjects(): Promise<Void>
      filePath = config.data_path + '/projects.json'
      INTENTA fs.readFile(filePath)
      data = JSON.parse(raw)
      SI data.projects: PARA cada [name, project]: projects[name] = project
      LOG loaded_from_disk

    async _saveProjects(): Promise<Void>
      filePath = config.data_path + '/projects.json'
      data = {_version, _updated, projects: projects as object}
      fs.writeFile(tmpPath, JSON.stringify(data))
      fs.rename(tmpPath, filePath) [atomic]

    EVENTOS_PUBLISHES {
      'esp32.project_created': {project_name, template, board, framework}
      'esp32.build_started': {project_name}
      'esp32.build_succeeded': {project_name, duration_ms, log}
      'esp32.build_failed': {project_name, exit_code|reason, log}
    }

    EVENTOS_SUBSCRIBES {
      (ninguno — handlers síncronos solamente)
    }
  }
}

CLASE Template {
  ATRIBUTOS {
    id: String
    name: String
    description: String
    framework: String (arduino|platformio|idf)
    boards: Array<String>
    defaultBoard: String
    category: String (sensor|actuator|gateway|display)
    files: Map<filePath, content> (platformio.ini, src/main.cpp, src/config.h, ...)
  }
}

CLASE ProjectMetadata {
  ATRIBUTOS {
    name: String
    template: String
    board: String
    framework: String
    created_at: String (ISO)
    last_build: String|Null (ISO)
    last_build_status: String|Null (success|failed|timeout)
    path: String
  }
}
```
