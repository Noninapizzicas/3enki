---
id: modulos/grupo-c
dominio: modulos
resumen: perifericos (hardware con state machine y reconexión), plugin-manager (plugins npm), project-manager (CRUD + contexto de proyectos).
fuentes:
  - modules/perifericos/**
  - modules/plugin-manager/**
  - modules/project-manager/**
verificado: 2026-07-12
---

# GRUPO C — PERIFERICOS, PLUGIN-MANAGER, PROJECT-MANAGER

## PERIFERICOS (v2.0.0) — Dispositivos Hardware con State Machine

```
INTERFAZ PerifericosContract {
  registerPeripheral(data: {peripheral_id, type, project_id, address?, config?}): Promise<{registered, peripheral_id}>
  unregisterPeripheral(peripheral_id: String): Promise<Void>
  sendCommand(peripheral_id: String, command: String, params?: Object): Promise<{status, result?}>
  getStatus(peripheral_id?: String): Promise<{status, online_count, offline_count, peripherals?}>
  listPeripherals(filters?: {type?, project_id?, status?}): Promise<Array<PeripheralInfo>>
  configurePeripheral(peripheral_id: String, config: Object): Promise<{status, config}>
  startMonitoring(peripheral_id: String): Promise<Void>
  stopMonitoring(peripheral_id: String): Promise<Void>
}

CLASE PerifericosModule HEREDA BaseModule IMPLEMENTA PerifericosContract {
  ATRIBUTOS {
    name: String = 'perifericos'
    version: String = '2.0.0'
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    uiHandler: UIRequestHandler
    peripherals: Map<peripheral_id, PeripheralState>
    connections: Map<peripheral_id, PeripheralConnection>
    _pollTimers: Map<peripheral_id, NodeJS.Timeout>
    _reconnectTimers: Map<peripheral_id, NodeJS.Timeout>
    config: {
      poll_interval_ms: Integer,
      reconnect_interval_ms: Integer,
      reconnect_max_attempts: Integer,
      command_timeout_ms: Integer,
      supported_types: Array<String>
    }
    internalMetrics: {
      registered_total, unregistered_total, commands_sent, commands_failed, reconnects_total, online_current
    }
  }

  METODOS {
    async onLoad(context: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus, uiHandler FROM context
      CARGA config FROM context.config['perifericos']
      config.supported_types = ['printer', 'cash_drawer', 'display', 'scale', 'card_reader', 'barcode_scanner']
      SUSCRIBE periferico.comando.requerido, periferico.reconectarse
      LOG module.loaded

    async onUnload(): Promise<Void>
      _pollTimers.forEach(timer => clearTimeout(timer))
      _reconnectTimers.forEach(timer => clearTimeout(timer))
      PARA CADA [, conn] EN connections:
        SI conn.device: await conn.device.disconnect()
      _pollTimers.clear()
      _reconnectTimers.clear()
      peripherals.clear()
      connections.clear()
      LOG module.unloaded

    async handleRegisterPeripheral(data: {peripheral_id, type, project_id, address?, config?}): Promise<Response>
      VALIDA peripheral_id, type, project_id obligatorios
      VALIDA type EN config.supported_types
      SI peripherals.has(peripheral_id): RETORNA 409 CONFLICT_STATE
      state = {peripheral_id, type, project_id, address: data.address || null, config: data.config || {}, status: 'offline', last_seen: null, last_error: null, reconnect_attempts: 0, created_at: now()}
      peripherals.set(peripheral_id, state)
      conn = {device: null, connected: false, lastConnectAttempt: null, commandQueue: []}
      connections.set(peripheral_id, conn)
      internalMetrics.registered_total++
      metrics.increment('perifericos.registered.total')
      await _attemptConnect(peripheral_id)
      EMITE periferico.registrado {peripheral_id, type, project_id}
      RETORNA {status: 201, data: {registered: true, peripheral_id}}

    async handleUnregisterPeripheral(data: {peripheral_id}): Promise<Response>
      VALIDA peripheral_id obligatorio
      VALIDA peripherals.has(peripheral_id)
      state = peripherals.get(peripheral_id)
      conn = connections.get(peripheral_id)
      SI conn.device: await conn.device.disconnect()
      _clearPollTimer(peripheral_id)
      _clearReconnectTimer(peripheral_id)
      peripherals.delete(peripheral_id)
      connections.delete(peripheral_id)
      internalMetrics.unregistered_total++
      EMITE periferico.desregistrado {peripheral_id}
      RETORNA {status: 200, data: {unregistered: true}}

    async handleSendCommand(data: {peripheral_id, command, params?, project_id?}): Promise<Response>
      VALIDA peripheral_id, command obligatorios
      state = peripherals.get(peripheral_id)
      SI !state: RETORNA 404 RESOURCE_NOT_FOUND
      conn = connections.get(peripheral_id)
      SI !conn.connected:
        conn.commandQueue.push({command, params, created_at: now()})
        RETORNA {status: 503, error: {code: 'DEVICE_OFFLINE', message: 'Dispositivo desconectado, comando encolado'}}
      TRY:
        result = await _executeCommand(conn.device, command, data.params, config.command_timeout_ms)
        internalMetrics.commands_sent++
        metrics.increment('perifericos.command.success', {type: state.type, command})
        EMITE periferico.comando.ejecutado {peripheral_id, command, result}
        RETORNA {status: 200, data: {status: 'executed', result}}
      CATCH err:
        internalMetrics.commands_failed++
        metrics.increment('perifericos.command.failed', {type: state.type, command})
        EMITE periferico.comando.error {peripheral_id, command, error: err.message}
        RETORNA {status: 500, error: {code: 'COMMAND_FAILED', message: err.message}}

    async handleGetStatus(data?: {peripheral_id?}): Promise<Response>
      SI data?.peripheral_id:
        state = peripherals.get(data.peripheral_id)
        SI !state: RETORNA 404 RESOURCE_NOT_FOUND
        RETORNA {status: 200, data: {peripheral_id: data.peripheral_id, type: state.type, status: state.status, last_seen: state.last_seen, last_error: state.last_error, connected: connections.get(data.peripheral_id).connected}}
      SINO:
        online = Array.from(peripherals.values()).filter(s => s.status == 'online').length
        offline = Array.from(peripherals.values()).filter(s => s.status == 'offline').length
        RETORNA {status: 200, data: {total: peripherals.size, online_count: online, offline_count: offline, status: 'operational'}}

    async handleListPeripherals(data?: {type?, project_id?, status?}): Promise<Response>
      list = []
      PARA CADA [id, state] EN peripherals:
        SI data?.type Y state.type != data.type: CONTINÚA
        SI data?.project_id Y state.project_id != data.project_id: CONTINÚA
        SI data?.status Y state.status != data.status: CONTINÚA
        conn = connections.get(id)
        list.push({peripheral_id: id, type: state.type, project_id: state.project_id, status: state.status, connected: conn.connected, last_seen: state.last_seen})
      RETORNA {status: 200, data: {peripherals: list, total: list.length}}

    async handleConfigurePeripheral(data: {peripheral_id, config}): Promise<Response>
      VALIDA peripheral_id, config obligatorios
      state = peripherals.get(peripheral_id)
      SI !state: RETORNA 404 RESOURCE_NOT_FOUND
      state.config = {...state.config, ...data.config}
      EMITE periferico.configurado {peripheral_id, config: state.config}
      RETORNA {status: 200, data: {status: 'configured', config: state.config}}

    async handleStartMonitoring(data: {peripheral_id}): Promise<Response>
      VALIDA peripheral_id obligatorio
      VALIDA peripherals.has(peripheral_id)
      _startPollTimer(data.peripheral_id)
      RETORNA {status: 200, data: {monitoring: true}}

    async handleStopMonitoring(data: {peripheral_id}): Promise<Response>
      VALIDA peripheral_id obligatorio
      _clearPollTimer(data.peripheral_id)
      RETORNA {status: 200, data: {monitoring: false}}

    async _attemptConnect(peripheral_id: String): Promise<Boolean>
      state = peripherals.get(peripheral_id)
      conn = connections.get(peripheral_id)
      SI !state: RETORNA false
      SI conn.connected: RETORNA true
      conn.lastConnectAttempt = now()
      TRY:
        device = await _createDeviceConnection(state.type, state.address, state.config, config.command_timeout_ms)
        conn.device = device
        conn.connected = true
        state.status = 'online'
        state.reconnect_attempts = 0
        _clearReconnectTimer(peripheral_id)
        _startPollTimer(peripheral_id)
        metrics.increment('perifericos.connected.total', {type: state.type})
        EMITE periferico.conectado {peripheral_id, type: state.type}
        await _flushCommandQueue(peripheral_id)
        RETORNA true
      CATCH err:
        state.status = 'offline'
        state.last_error = err.message
        state.reconnect_attempts++
        metrics.increment('perifericos.connection.failed', {type: state.type})
        _scheduleReconnect(peripheral_id)
        RETORNA false

    _scheduleReconnect(peripheral_id: String): Void
      state = peripherals.get(peripheral_id)
      SI !state: RETORNA
      _clearReconnectTimer(peripheral_id)
      SI state.reconnect_attempts >= config.reconnect_max_attempts:
        state.status = 'error'
        EMITE periferico.error {peripheral_id, reason: 'max_reconnect_attempts'}
        RETORNA
      delay = config.reconnect_interval_ms * Math.pow(2, state.reconnect_attempts - 1)
      timer = setTimeout(() => {
        _attemptConnect(peripheral_id)
        internalMetrics.reconnects_total++
      }, min(delay, 60000))
      _reconnectTimers.set(peripheral_id, timer)

    _startPollTimer(peripheral_id: String): Void
      _clearPollTimer(peripheral_id)
      timer = setInterval(async () => {
        state = peripherals.get(peripheral_id)
        conn = connections.get(peripheral_id)
        SI !conn.connected: RETORNA
        TRY:
          status = await _pollDevice(conn.device)
          state.last_seen = now()
          state.last_error = null
        CATCH err:
          state.last_error = err.message
          SI err.message.includes('disconnect'):
            conn.connected = false
            state.status = 'offline'
            _clearPollTimer(peripheral_id)
            _scheduleReconnect(peripheral_id)
      }, config.poll_interval_ms)
      _pollTimers.set(peripheral_id, timer)

    _clearPollTimer(peripheral_id: String): Void
      timer = _pollTimers.get(peripheral_id)
      SI timer: clearInterval(timer)
      _pollTimers.delete(peripheral_id)

    _clearReconnectTimer(peripheral_id: String): Void
      timer = _reconnectTimers.get(peripheral_id)
      SI timer: clearTimeout(timer)
      _reconnectTimers.delete(peripheral_id)

    async _flushCommandQueue(peripheral_id: String): Promise<Void>
      conn = connections.get(peripheral_id)
      SI !conn: RETORNA
      MIENTRAS conn.commandQueue.length > 0:
        cmd = conn.commandQueue.shift()
        TRY:
          result = await _executeCommand(conn.device, cmd.command, cmd.params, config.command_timeout_ms)
          EMITE periferico.comando.ejecutado {peripheral_id, command: cmd.command, from_queue: true}
        CATCH err:
          LOG error 'Failed to execute queued command'

    EVENTOS_SUBSCRIBES {
      'periferico.comando.requerido': onComandoRequerido
      'periferico.reconectarse': onReconectarse
    }

    EVENTOS_PUBLISHES {
      'periferico.registrado': {peripheral_id, type, project_id}
      'periferico.desregistrado': {peripheral_id}
      'periferico.conectado': {peripheral_id, type}
      'periferico.comando.ejecutado': {peripheral_id, command, result?, from_queue?}
      'periferico.comando.error': {peripheral_id, command, error}
      'periferico.configurado': {peripheral_id, config}
      'periferico.error': {peripheral_id, reason}
    }
  }
}

CLASE PeripheralState {
  ATRIBUTOS {
    peripheral_id: String
    type: String (printer|cash_drawer|display|scale|card_reader|barcode_scanner)
    project_id: String
    address: String|Null
    config: Object
    status: String (online|offline|error)
    last_seen: String|Null (ISO)
    last_error: String|Null
    reconnect_attempts: Integer
    created_at: String (ISO)
  }
}

CLASE PeripheralConnection {
  ATRIBUTOS {
    device: Object|Null
    connected: Boolean
    lastConnectAttempt: String|Null (ISO)
    commandQueue: Array<{command, params, created_at}>
  }
}
```

## PLUGIN-MANAGER (v2.0.0) — Carga Dinámica de Plugins npm

```
INTERFAZ PluginManagerContract {
  listPlugins(filters?: {status?, type?}): Promise<Array<PluginInfo>>
  installPlugin(name: String, version?: String): Promise<{installed, plugin_id}>
  enablePlugin(plugin_id: String): Promise<{enabled}>
  disablePlugin(plugin_id: String): Promise<{disabled}>
  uninstallPlugin(plugin_id: String): Promise<Void>
  getPluginStatus(plugin_id: String): Promise<{status, enabled, version}>
  executePluginMethod(plugin_id: String, method: String, args?: Object): Promise<Any>
}

CLASE PluginManagerModule HEREDA BaseModule IMPLEMENTA PluginManagerContract {
  ATRIBUTOS {
    name: String = 'plugin-manager'
    version: String = '2.0.0'
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    uiHandler: UIRequestHandler
    plugins: Map<plugin_id, PluginInstance>
    pluginMetadata: Map<plugin_id, PluginMetadata>
    pluginsDir: String
    config: {
      plugins_dir: String,
      auto_load: Boolean,
      sandbox_mode: Boolean,
      max_plugin_memory_mb: Integer,
      require_signatures: Boolean
    }
    internalMetrics: {
      installed_total, enabled_total, disabled_total, execution_errors}
  }

  METODOS {
    async onLoad(context: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus, uiHandler FROM context
      CARGA config FROM context.config['plugin-manager']
      pluginsDir = config.plugins_dir || './plugins'
      ENSURA_DIR(pluginsDir)
      SI config.auto_load: await _discoverAndLoadPlugins()
      LOG module.loaded CON plugin_count: plugins.size

    async onUnload(): Promise<Void>
      PARA CADA [, instance] EN plugins:
        SI instance.enabled: await _disablePlugin(instance.plugin_id)
      plugins.clear()
      pluginMetadata.clear()
      LOG module.unloaded

    async handleListPlugins(data?: {status?, type?}): Promise<Response>
      list = []
      PARA CADA [id, metadata] EN pluginMetadata:
        SI data?.status Y metadata.status != data.status: CONTINÚA
        SI data?.type Y metadata.type != data.type: CONTINÚA
        instance = plugins.get(id)
        list.push({plugin_id: id, name: metadata.name, version: metadata.version, status: metadata.status, enabled: instance?.enabled || false, installed_at: metadata.installed_at})
      RETORNA {status: 200, data: {plugins: list, total: list.length}}

    async handleInstallPlugin(data: {name, version?}): Promise<Response>
      VALIDA data.name obligatorio
      TRY:
        result = await _npmInstall(data.name, data.version)
        plugin_id = _generatePluginId(data.name, data.version)
        SI pluginMetadata.has(plugin_id): RETORNA 409 CONFLICT_STATE
        metadata = {plugin_id, name: data.name, version: data.version || 'latest', type: 'npm', status: 'installed', installed_at: now(), entry_point: null}
        pluginMetadata.set(plugin_id, metadata)
        internalMetrics.installed_total++
        metrics.increment('plugin-manager.installed.total')
        EMITE plugin.instalado {plugin_id, name: data.name, version: data.version}
        RETORNA {status: 201, data: {installed: true, plugin_id}}
      CATCH err:
        metrics.increment('plugin-manager.install.failed')
        RETORNA {status: 500, error: {code: 'INSTALL_FAILED', message: err.message}}

    async handleEnablePlugin(data: {plugin_id}): Promise<Response>
      VALIDA data.plugin_id obligatorio
      metadata = pluginMetadata.get(data.plugin_id)
      SI !metadata: RETORNA 404 RESOURCE_NOT_FOUND
      SI metadata.status != 'installed': RETORNA 409 CONFLICT_STATE
      TRY:
        instance = await _loadPluginModule(data.plugin_id, metadata)
        plugins.set(data.plugin_id, instance)
        instance.enabled = true
        metadata.status = 'enabled'
        internalMetrics.enabled_total++
        metrics.increment('plugin-manager.enabled.total')
        EMITE plugin.habilitado {plugin_id: data.plugin_id, name: metadata.name}
        RETORNA {status: 200, data: {enabled: true}}
      CATCH err:
        logger.error('plugin.enable.failed', {plugin_id: data.plugin_id, error: err.message})
        metadata.status = 'error'
        metrics.increment('plugin-manager.enable.failed')
        RETORNA {status: 500, error: {code: 'ENABLE_FAILED', message: err.message}}

    async handleDisablePlugin(data: {plugin_id}): Promise<Response>
      VALIDA data.plugin_id obligatorio
      instance = plugins.get(data.plugin_id)
      SI !instance: RETORNA 404 RESOURCE_NOT_FOUND
      await _disablePlugin(data.plugin_id)
      internalMetrics.disabled_total++
      metrics.increment('plugin-manager.disabled.total')
      EMITE plugin.deshabilitado {plugin_id: data.plugin_id}
      RETORNA {status: 200, data: {disabled: true}}

    async handleUninstallPlugin(data: {plugin_id}): Promise<Response>
      VALIDA data.plugin_id obligatorio
      SI plugins.has(data.plugin_id): await _disablePlugin(data.plugin_id)
      metadata = pluginMetadata.get(data.plugin_id)
      SI metadata: await _npmUninstall(metadata.name)
      plugins.delete(data.plugin_id)
      pluginMetadata.delete(data.plugin_id)
      EMITE plugin.desinstalado {plugin_id: data.plugin_id}
      RETORNA {status: 200, data: {uninstalled: true}}

    async handleGetPluginStatus(data: {plugin_id}): Promise<Response>
      VALIDA data.plugin_id obligatorio
      metadata = pluginMetadata.get(data.plugin_id)
      SI !metadata: RETORNA 404 RESOURCE_NOT_FOUND
      instance = plugins.get(data.plugin_id)
      RETORNA {status: 200, data: {status: metadata.status, enabled: instance?.enabled || false, version: metadata.version}}

    async handleExecutePluginMethod(data: {plugin_id, method, args?}): Promise<Response>
      VALIDA plugin_id, method obligatorios
      instance = plugins.get(data.plugin_id)
      SI !instance: RETORNA 404 RESOURCE_NOT_FOUND
      SI !instance.enabled: RETORNA 409 CONFLICT_STATE
      TRY:
        result = await instance.execute(data.method, data.args || {})
        internalMetrics.execution_errors = 0
        RETORNA {status: 200, data: {result}}
      CATCH err:
        internalMetrics.execution_errors++
        metrics.increment('plugin-manager.execution.failed', {plugin_id: data.plugin_id, method: data.method})
        RETORNA {status: 500, error: {code: 'EXECUTION_FAILED', message: err.message}}

    async _discoverAndLoadPlugins(): Promise<Void>
      entries = readdir(pluginsDir)
      PARA CADA entry:
        manifest = _loadManifest(join(pluginsDir, entry))
        SI manifest:
          plugin_id = manifest.name
          pluginMetadata.set(plugin_id, manifest)

    async _loadPluginModule(plugin_id: String, metadata: PluginMetadata): Promise<PluginInstance>
      TRY:
        modulePath = join(pluginsDir, metadata.name, metadata.entry_point || 'index.js')
        Module = require(modulePath)
        instance = new Module({eventBus, logger, metrics})
        instance.plugin_id = plugin_id
        instance.enabled = false
        instance.execute = async (method, args) => {
          SI !instance[method]: LANZA Error(`Method ${method} not found`)
          RETORNA await instance[method](args)
        }
        RETORNA instance
      CATCH err:
        LANZA Error(`Failed to load plugin: ${err.message}`)

    async _disablePlugin(plugin_id: String): Promise<Void>
      instance = plugins.get(plugin_id)
      SI !instance: RETORNA
      instance.enabled = false
      SI instance.onDisable: await instance.onDisable()
      metadata = pluginMetadata.get(plugin_id)
      SI metadata: metadata.status = 'installed'
      plugins.delete(plugin_id)

    async _npmInstall(name: String, version?: String): Promise<{success}>
      cmd = `npm install ${name}${version ? '@' + version : ''} --prefix ${pluginsDir}`
      (execSync o similar)
      RETORNA {success: true}

    async _npmUninstall(name: String): Promise<{success}>
      cmd = `npm uninstall ${name} --prefix ${pluginsDir}`
      RETORNA {success: true}

    _loadManifest(pluginDir: String): Object|Null
      manifestPath = join(pluginDir, 'manifest.json')
      SI EXISTS(manifestPath):
        RETORNA JSON.parse(readFile(manifestPath))
      RETORNA null

    _generatePluginId(name: String, version: String): String
      RETORNA `${name}@${version || 'latest'}`.replace(/\//g, '--')

    EVENTOS_PUBLISHES {
      'plugin.instalado': {plugin_id, name, version}
      'plugin.habilitado': {plugin_id, name}
      'plugin.deshabilitado': {plugin_id}
      'plugin.desinstalado': {plugin_id}
    }

    EVENTOS_SUBSCRIBES {
    }
  }
}

CLASE PluginInstance {
  ATRIBUTOS {
    plugin_id: String
    enabled: Boolean
    eventBus: EventBus
    logger: Logger
    metrics: Metrics
    execute: Function (method, args) => Promise
    onDisable: Function|Null
  }
}

CLASE PluginMetadata {
  ATRIBUTOS {
    plugin_id: String
    name: String
    version: String
    type: String (npm|local|bundled)
    status: String (installed|enabled|disabled|error)
    installed_at: String (ISO)
    entry_point: String|Null
  }
}
```

## PROJECT-MANAGER (v2.0.0) — CRUD y Contexto de Proyectos

```
INTERFAZ ProjectManagerContract {
  createProject(data: {name, description, type?, metadata?}): Promise<{project_id, ...}>
  getProject(project_id: String): Promise<Project>
  listProjects(filters?: {type?, status?}): Promise<Array<Project>>
  updateProject(project_id: String, updates: Object): Promise<Project>
  deleteProject(project_id: String): Promise<{id, directories:{deleted[], failed[]}}>
    // borra BD + AMBOS candidatos de disco: base_path (slug, puede mentir tras un rename)
    // y data/projects/<uuid> (fallback de filesystem). El disco fallido se REPORTA en la
    // respuesta (warning + directories.failed), nunca se traga. Rechaza proyecto activo (409).
  activateProject(project_id: String): Promise<{active_project_id}>
  getActiveProject(): Promise<Project>
}

CLASE ProjectManagerModule HEREDA BaseModule IMPLEMENTA ProjectManagerContract {
  ATRIBUTOS {
    name: String = 'project-manager'
    version: String = '2.0.0'
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    uiHandler: UIRequestHandler
    projects: Map<project_id, Project>
    activeProjectId: String|Null
    projectsDir: String
    config: Object
    internalMetrics: {created_total, deleted_total, activated_total, activations}
  }

  METODOS {
    async onLoad(context: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus, uiHandler FROM context
      projectsDir = join(cwd(), 'data/projects')
      ENSURA_DIR(projectsDir)
      await _loadProjects()
      LOG module.loaded CON projects: projects.size

    async onUnload(): Promise<Void>
      await _saveProjects()
      projects.clear()
      activeProjectId = null
      LOG module.unloaded

    async handleCreateProject(data: {name, description, type?, metadata?}): Promise<Response>
      VALIDA name obligatorio
      SI projects.values().find(p => p.name == data.name): RETORNA 409 CONFLICT_STATE
      project_id = crypto.randomUUID()
      project = {project_id, name: data.name, description: data.description || '', type: data.type || 'general', metadata: data.metadata || {}, status: 'active', created_at: now(), updated_at: now()}
      projectDir = join(projectsDir, project_id)
      MKDIR(projectDir, {recursive: true})
      projects.set(project_id, project)
      await _saveProjects()
      internalMetrics.created_total++
      metrics.increment('project-manager.created.total')
      EMITE proyecto.creado {project_id, name: data.name}
      RETORNA {status: 201, data: project}

    async handleGetProject(data: {project_id}): Promise<Response>
      VALIDA project_id obligatorio
      project = projects.get(data.project_id)
      SI !project: RETORNA 404 RESOURCE_NOT_FOUND
      RETORNA {status: 200, data: project}

    async handleListProjects(data?: {type?, status?}): Promise<Response>
      list = []
      PARA CADA [, project] EN projects:
        SI data?.type Y project.type != data.type: CONTINÚA
        SI data?.status Y project.status != data.status: CONTINÚA
        list.push(project)
      ORDENA list POR updated_at DESC
      RETORNA {status: 200, data: {projects: list, total: list.length}}

    async handleUpdateProject(data: {project_id, updates}): Promise<Response>
      VALIDA project_id, updates obligatorios
      project = projects.get(data.project_id)
      SI !project: RETORNA 404 RESOURCE_NOT_FOUND
      MERGE(project, data.updates)
      project.updated_at = now()
      await _saveProjects()
      EMITE proyecto.actualizado {project_id: data.project_id, updates: data.updates}
      RETORNA {status: 200, data: project}

    async handleDeleteProject(data: {project_id}): Promise<Response>
      VALIDA project_id obligatorio
      project = projects.get(data.project_id)
      SI !project: RETORNA 404 RESOURCE_NOT_FOUND
      SI activeProjectId == data.project_id: activeProjectId = null
      projectDir = join(projectsDir, data.project_id)
      SI EXISTS(projectDir): rmdir(projectDir, {recursive: true})
      projects.delete(data.project_id)
      await _saveProjects()
      internalMetrics.deleted_total++
      metrics.increment('project-manager.deleted.total')
      EMITE proyecto.eliminado {project_id: data.project_id}
      RETORNA {status: 200, data: {deleted: true}}

    async handleActivateProject(data: {project_id}): Promise<Response>
      VALIDA project_id obligatorio
      project = projects.get(data.project_id)
      SI !project: RETORNA 404 RESOURCE_NOT_FOUND
      activeProjectId = data.project_id
      internalMetrics.activated_total++
      metrics.increment('project-manager.activated.total')
      EMITE proyecto.activado {project_id: data.project_id, name: project.name}
      RETORNA {status: 200, data: {active_project_id: data.project_id}}

    async handleGetActiveProject(): Promise<Response>
      SI !activeProjectId: RETORNA 404 RESOURCE_NOT_FOUND
      project = projects.get(activeProjectId)
      RETORNA {status: 200, data: project}

    async _loadProjects(): Promise<Void>
      SI NOT EXISTS(projectsDir): RETORNA
      entries = readdir(projectsDir)
      PARA CADA entry:
        configPath = join(projectsDir, entry, 'project.json')
        SI EXISTS(configPath):
          config = JSON.parse(readFile(configPath))
          projects.set(config.project_id, config)

    async _saveProjects(): Promise<Void>
      PARA CADA [project_id, project] EN projects:
        projectDir = join(projectsDir, project_id)
        MKDIR(projectDir, {recursive: true})
        configPath = join(projectDir, 'project.json')
        writeFile(configPath, JSON.stringify(project, null, 2))

    EVENTOS_PUBLISHES {
      'proyecto.creado': {project_id, name}
      'proyecto.actualizado': {project_id, updates}
      'proyecto.eliminado': {project_id}
      'proyecto.activado': {project_id, name}
    }

    EVENTOS_SUBSCRIBES {
    }
  }
}

CLASE Project {
  ATRIBUTOS {
    project_id: String
    name: String
    description: String
    type: String (general|pizzepos|tienda|otro)
    metadata: Object
    status: String (active|archived|deleted)
    created_at: String (ISO)
    updated_at: String (ISO)
  }
}
```
