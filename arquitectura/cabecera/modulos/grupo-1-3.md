---
id: modulos/grupo-1-3
dominio: modulos
resumen: admin-panel, bienvenida-tienda, bot-manager, channel-manager, code-executor, comandero-cliente-builder, composition-manager, credential-manager.
fuentes:
  - modules/admin-panel/**
  - modules/bot-manager/**
  - modules/channel-manager/**
  - modules/code-executor/**
  - modules/composition-manager/**
  - modules/credential-manager/**
  - modules/pizzepos/bienvenida-tienda/**
verificado: 2026-07-06
---

# MÓDULOS — GRUPOS 1-3 (9 MÓDULOS)

## ADMIN-PANEL (v2.0.0)

```
INTERFAZ AdminPanelContract {
  getDashboard(): Promise<{modules, plugins, agents, prompts, health}>
  getModules(): Promise<Array<ModuleInfo>>
  getPlugins(): Promise<Array<PluginInfo>>
  togglePlugin(name: String, enabled: Boolean): Promise<{toggled, status}>
  createAgent(data: {name, description, system_prompt}): Promise<Agent>
  deleteAgent(agent_id: String): Promise<Void>
  getAgents(): Promise<Array<Agent>>
  getPrompts(): Promise<Array<Prompt>>
  createPrompt(data: {name, template}): Promise<Prompt>
  updatePrompt(prompt_id: String, updates: Object): Promise<Prompt>
  getHealth(): Promise<{status, modules, uptime}>
}

CLASE AdminPanelModule HEREDA BaseModule IMPLEMENTA AdminPanelContract {
  ATRIBUTOS {
    name: String = 'admin-panel'
    version: String = '2.0.0'
    publicPath: String
    cache: {plugins, agents, prompts, modules}
    core: EventCore
    config: Object
    coreConfig: Object
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA core, eventBus, logger, metrics
      CARGA config del módulo
      REFRESCA todas las caches
      LOG module.loaded CON cache sizes

    async onUnload(): Promise<Void>
      LIMPIA caches
      LOG module.unloaded

    async handleGetDashboard(): Promise<Response>
      RETORNA {status: 200, data: {modules_count, plugins_count, agents_count, health}}

    async handleGetModules(): Promise<Response>
      RETORNA {status: 200, data: {modules: cache.modules}}

    async handleGetPlugins(): Promise<Response>
      RETORNA {status: 200, data: {plugins: cache.plugins}}

    async handleTogglePlugin(input: {body: {name, enabled}}): Promise<Response>
      VALIDA name
      INVOCA core.togglePlugin(name, enabled)
      REFRESCA cache.plugins
      EMITE admin.plugin.toggled
      RETORNA {status: 200, data: {toggled: true}}

    async handleCreateAgent(input: {body: {name, description, system_prompt}}): Promise<Response>
      VALIDA nombre, system_prompt
      agent = await _createAgentViaHttp(...)
      REFRESCA cache.agents
      EMITE admin.agent.creado
      RETORNA {status: 201, data: agent}

    async handleDeleteAgent(input: {body: {agent_id}}): Promise<Response>
      VALIDA agent_id
      await _deleteAgentViaHttp(agent_id)
      REFRESCA cache.agents
      EMITE admin.agent.eliminado
      RETORNA {status: 200}

    async handleGetHealth(): Promise<Response>
      caché = {modules_running, plugins_enabled, agents_total, uptime_ms}
      RETORNA {status: 200, data: caché}

    async refreshAllCaches(): Promise<Void>
      refreshPluginsCache()
      refreshAgentsCache()
      refreshPromptsCache()
      refreshModulesCache()

    EVENTOS_PUBLISHES {
      'admin.plugin.toggled': {name, enabled}
      'admin.agent.creado': {agent_id, name}
      'admin.agent.eliminado': {agent_id}
      'admin.prompt.creado': {prompt_id, name}
      'admin.prompt.actualizado': {prompt_id}
    }

    EVENTOS_SUBSCRIBES {
      'plugin.loaded': onPluginLoaded
      'plugin.unloaded': onPluginUnloaded
      'agent.created': onAgentCreated
      'agent.deleted': onAgentDeleted
    }
  }
}
```

## BIENVENIDA-TIENDA (v1.0.0)

```
INTERFAZ BienvenidaTiendaContract {
  handleTelegramText(data: {botName, chatId, text}): Promise<Void>
  handleTelegramCommand(data: {botName, chatId, command}): Promise<Void>
  registerBot(project_id: String, botName: String, config: Object): Promise<Void>
  unregisterBot(botName: String): Promise<Void>
}

CLASE BienvenidaTiendaModule HEREDA BaseModule IMPLEMENTA BienvenidaTiendaContract {
  ATRIBUTOS {
    name: String = 'bienvenida-tienda'
    version: String = '1.0.0'
    botsConfig: Map<botName, {project_id, pwa_url, mensaje_bienvenida, staff_chat_id}>
    projectToBotName: Map<project_id, botName>
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
  }

  METODOS {
    async onLoad(context: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus
      SUSCRIBE project.activated, telegram.text.received, telegram.command.received
      LOG module.loaded

    async onUnload(): Promise<Void>
      botsConfig.clear()
      projectToBotName.clear()

    async onProjectActivated(event: Event): Promise<Void>
      project_id = event.project_id
      CARGA project config
      RESUELVE telegram botName, pwa_url, staff_chat_id
      REGISTRA bot EN botsConfig
      MAPEA project_id → botName

    async onTelegramTextReceived(event: Event): Promise<Void>
      data = event.data
      await _handleIncoming(data, 'text')

    async onTelegramCommandReceived(event: Event): Promise<Void>
      command = extraer comando del mensaje
      await _handleIncoming(data, 'command_start' | 'command_otro')

    async _handleIncoming(data: Object, trigger: String): Promise<Void>
      botName, chatId = extraer datos
      cfg = botsConfig.get(botName)
      SI !cfg: RETORNA (bot no registrado)
      SI chatId == cfg.staff_chat_id: RETORNA (ignorar chat del staff)
      PUBLICA telegram.send_message.request CON mensaje de bienvenida
      INCREMENTA metricas

    EVENTOS_PUBLISHES {
      'telegram.send_message.request': {botName, chatId, text}
    }

    EVENTOS_SUBSCRIBES {
      'project.activated': onProjectActivated
      'telegram.text.received': onTelegramTextReceived
      'telegram.command.received': onTelegramCommandReceived
    }
  }
}
```

## BOT-MANAGER (v2.0.0)

```
INTERFAZ BotManagerContract {
  registerBot(botName: String, config: Object): Promise<{registered, status}>
  unregisterBot(botName: String): Promise<Void>
  enableBot(botName: String): Promise<Void>
  disableBot(botName: String): Promise<Void>
  getBot(botName: String): Promise<BotInfo>
  listBots(): Promise<Array<BotInfo>>
  handleFileReceived(data: Object): Promise<Response>
  handleMessageReceived(data: Object): Promise<Response>
}

CLASE BotManagerModule HEREDA BaseModule IMPLEMENTA BotManagerContract {
  ATRIBUTOS {
    name: String = 'bot-manager'
    version: String = '2.0.0'
    config: Object
    registry: BotRegistry
    downloadManager: DownloadManager
    autoResponder: AutoResponder
    logger: Logger
    eventBus: EventBus
    metrics: Metrics
  }

  METODOS {
    async onLoad(context: EventCore): Promise<Void>
      INICIALIZA logger, eventBus, metrics
      CARGA moduleConfig
      CREA BotRegistry instance
      CREA DownloadManager instance
      CREA AutoResponder instance
      LOG module.loaded CON bots_count

    async onUnload(): Promise<Void>
      registry = null
      downloadManager = null
      autoResponder = null
      LOG module.unloaded

    async handleRegisterBot(input: {body: {botName, config}}): Promise<Response>
      VALIDA botName
      registry.register(botName, config)
      EMITE bot.registered
      RETORNA {status: 201, data: {botName, registered: true}}

    async handleUnregisterBot(input: {body: {botName}}): Promise<Response>
      registry.unregister(botName)
      EMITE bot.unregistered
      RETORNA {status: 200}

    async handleFileReceived(event: Event): Promise<Void>
      botName, chatId, fileId, fileName = extraer datos
      SI !registry.has(botName): registry.register(botName)
      SI !registry.isEnabled(botName): RETORNA
      storagePath = registry.getStoragePath(botName)
      result = await downloadManager.downloadAndStore(...)
      SI !result.success: EMITE bot.file.error
      SINO: EMITE bot.file.stored

    async handleMessageReceived(event: Event): Promise<Void>
      botName, chatId, text = extraer datos
      PROCESA mensaje via autoResponder
      EMITE bot.message.received

    EVENTOS_PUBLISHES {
      'bot.registered': {botName, config}
      'bot.unregistered': {botName}
      'bot.file.stored': {botName, fileId, storagePath}
      'bot.file.error': {botName, fileId, error}
      'bot.message.received': {botName, chatId, text}
    }

    EVENTOS_SUBSCRIBES {
      'telegram.file.received': handleFileReceived
      'telegram.message.received': handleMessageReceived
      'telegram.command.received': onTelegramCommandReceived
    }
  }
}
```

## CHANNEL-MANAGER (v2.0.0)

```
INTERFAZ ChannelManagerContract {
  registerChannel(data: {channel_type, external_id, project_id, purpose, label}): Promise<Channel>
  unregisterChannel(channel_id: String): Promise<Void>
  getChannel(channel_id: String): Promise<Channel>
  listChannels(filters?: Object): Promise<Array<Channel>>
  resolveChannel(channel_type: String, external_id: String): Promise<Channel>
  updateChannel(channel_id: String, updates: Object): Promise<Channel>
}

CLASE ChannelManagerModule HEREDA BaseModule IMPLEMENTA ChannelManagerContract {
  ATRIBUTOS {
    name: String = 'channel-manager'
    version: String = '2.0.0'
    config: Object
    cache: Map<cacheKey, Channel>
    dbReady: Boolean
    pendingDbRequests: Map<correlationId, {resolve, reject, timeout}>
    logger: Logger
    eventBus: EventBus
    metrics: Metrics
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA logger, eventBus, metrics, config
      SUSCRIBE db.query.response, db.schema.init.response
      await _initSchema()
      await _loadCache()
      LOG module.loaded CON cache.size

    async onUnload(): Promise<Void>
      LIMPIA pendingDbRequests CON clearTimeout
      cache.clear()
      LOG module.unloaded

    async handleRegisterChannel(input: {body: {channel_type, external_id, project_id, purpose, label}}): Promise<Response>
      VALIDA channel_type EN VALID_CHANNEL_TYPES
      VALIDA external_id, project_id
      row = INSERT INTO channels (...)
      cache.set(_cacheKey(...), row)
      EMITE channel.registered
      RETORNA {status: 201, data: {channel_id, external_id}}

    async handleUnregisterChannel(input: {body: {channel_id}}): Promise<Response>
      DELETE FROM channels WHERE channel_id = ?
      cache.delete(_cacheKey(...))
      EMITE channel.removed
      RETORNA {status: 200}

    async handleResolveChannel(input: {query: {channel_type, external_id}}): Promise<Response>
      VALIDA channel_type, external_id
      cacheKey = _cacheKey(channel_type, external_id)
      SI EN cache: RETORNA cached row
      SINO: SELECT FROM channels, AGREGA a cache
      EMITE channel-manager.resolve.response
      RETORNA {status: 200, data: {channel_id, project_id, purpose}}

    async _initSchema(): Promise<Void>
      CREATE TABLE IF NOT EXISTS channels (...)
      dbReady = true

    async _loadCache(): Promise<Void>
      rows = SELECT ALL FROM channels
      PARA cada row: cache.set(_cacheKey(...), row)

    _publishDb(eventName: String, payload: Object): Promise<Any>
      correlation_id = UUID
      CREA promise CON timeout
      PUBLICA eventName CON correlation_id
      RETORNA promise

    EVENTOS_PUBLISHES {
      'channel.registered': {channel_id, channel_type, external_id, project_id, purpose}
      'channel.updated': {channel_id, updates}
      'channel.removed': {channel_id}
      'channel-manager.resolve.response': {channel_type, external_id, channel_id, project_id}
    }

    EVENTOS_SUBSCRIBES {
      'db.query.response': onDbResponse
      'db.schema.init.response': onDbResponse
    }
  }
}
```

## CODE-EXECUTOR (v2.0.0)

```
INTERFAZ CodeExecutorContract {
  execCommand(command: String, cwd?: String, timeout?: Integer, env?: Object): Promise<{exitCode, stdout, stderr, duration}>
  checkCommandSafe(command: String): Promise<{safe, reason?}>
}

CLASE CodeExecutorModule HEREDA BaseModule IMPLEMENTA CodeExecutorContract {
  ATRIBUTOS {
    name: String = 'code-executor'
    version: String = '2.0.0'
    config: Object
    blockedPatterns: Array<RegExp>
    blockedCommands: Array<String>
    processes: Map<processId, {process, startTime}>
    logger: Logger
    eventBus: EventBus
    metrics: Metrics
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA logger, eventBus, metrics, config
      COMPILA blockedPatterns FROM config.blockedPatterns
      blockedCommands = config.blockedCommands || []
      LOG module.loaded CON maxTimeout, maxProcesses, blockedPatterns.length

    async onUnload(): Promise<Void>
      PARA CADA proceso EN processes: ENVÍA SIGTERM
      processes.clear()
      LOG module.unloaded CON processes_killed

    async handleExecCommand(input: {command, cwd, timeout, env}): Promise<Response>
      VALIDA command NOT empty
      safety = _checkCommandSafe(command)
      SI !safety.safe: RETORNA {status: 403, error: PERMISSION_DENIED}
      execTimeout = min(timeout, config.maxTimeout)
      execCwd = cwd || process.cwd()
      EMITE shell.exec.start
      metrics.increment('code-executor.exec.total')
      startTime = now
      result = await exec(command, {cwd, timeout, env, shell, maxBuffer})
      duration = now - startTime
      SI timed out: EMITE shell.error, RETORNA 504 UPSTREAM_TIMEOUT
      SI nonzero: EMITE shell.error, RETORNA {status: 200, data: {exitCode, stdout, stderr, duration}}
      SINO: metrics.increment('code-executor.exec.success')
      RETORNA {status: 200, data: {exitCode: 0, stdout, stderr, duration}}

    _checkCommandSafe(command: String): {safe: Boolean, reason?: String}
      PARA CADA patrón EN blockedPatterns: SI match: RETORNA {safe: false, reason}
      SI command EN blockedCommands: RETORNA {safe: false, reason}
      RETORNA {safe: true}

    EVENTOS_PUBLISHES {
      'shell.exec.start': {command, cwd, timeout}
      'shell.exec.success': {command, exitCode, duration}
      'shell.error': {command, error_code, exitCode|timeout}
    }

    EVENTOS_SUBSCRIBES {
      (ninguno — solo handlers síncronos)
    }
  }
}
```

## COMANDERO-CLIENTE-BUILDER (v1.0.0)

```
INTERFAZ ComanderoClienteBuilderContract {
  buildPresentacion(project_id: String): Promise<{presentacion_id, categorias, productos}>
  uploadProductoImagen(project_id: String, producto_id: String, image: Buffer, type: String): Promise<{imagen_url}>
  generateBundle(project_id: String, bundle_id: String, config: Object): Promise<{html_url}>
  getPresentacion(project_id: String): Promise<Presentacion>
  listBundles(project_id: String): Promise<Array<Bundle>>
}

CLASE ComanderoClienteBuilderModule HEREDA BaseModule IMPLEMENTA ComanderoClienteBuilderContract {
  ATRIBUTOS {
    name: String = 'comandero-cliente-builder'
    version: String = '1.0.0'
    config: Object
    safeUpdate: SafeUpdate
    catalogoCachePerProject: Map<projectId, {productos, categorias}>
    tarifasCachePerProject: Map<projectId, Object>
    projectInfoCache: Map<projectId, {base_path}>
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA logger, eventBus, metrics
      CARGA moduleConfig
      CREA SafeUpdate instance
      SUSCRIBE catalogo.actualizado, tarifas.config.actualizada
      PUBLICA tarifas.config.solicitada
      LOG module.loaded

    async onUnload(): Promise<Void>
      catalogoCachePerProject.clear()
      tarifasCachePerProject.clear()
      projectInfoCache.clear()
      safeUpdate = null
      LOG module.unloaded

    async onCatalogoActualizado(event: Event): Promise<Void>
      project_id = event.project_id
      productos = event.productos
      categorias = event.categorias
      catalogoCachePerProject.set(project_id, {productos, categorias})

    async onTarifasConfigActualizada(event: Event): Promise<Void>
      project_id = event.project_id
      tarifasCachePerProject.set(project_id, event.config)

    async handleBuildPresentacion(input: {body: {project_id}}): Promise<Response>
      VALIDA project_id
      presentacion_id = UUID
      OBTIENE catalogo DEL cache
      ORDENA productos POR categorias
      presentacion = {_meta: {categorias_orden}, productos: {}}
      PERSISTE presentacion.json
      RETORNA {status: 201, data: {presentacion_id}}

    async handleUploadImagen(input: {body: {project_id, producto_id, image, type}}): Promise<Response>
      VALIDA project_id, producto_id, image, type EN VALID_IMAGE_TYPES
      VALIDA image size <= MAX_IMAGEN_BYTES
      ext = VALID_IMAGE_TYPES[type]
      imagenPath = _imagenPath(project_id, producto_id, ext)
      imagenBuffer = Buffer.from(image, 'base64')
      PERSISTE imagenBuffer A imagenPath
      RETORNA {status: 201, data: {imagen_url: `/storage/${project_id}/imagenes/${producto_id}.${ext}`}}

    async handleGenerateBundle(input: {body: {project_id, bundle_id, config}}): Promise<Response>
      VALIDA project_id, bundle_id
      html = generateStaticHTML(config)
      bundlePath = _bundleHtmlPath(project_id, bundle_id)
      PERSISTE html A bundlePath
      bundlesIndex = CARGA bundles.json
      bundlesIndex.bundles.push({bundle_id, created_at})
      PERSISTE bundlesIndex.json
      RETORNA {status: 201, data: {html_url, bundle_id}}

    EVENTOS_PUBLISHES {
      'tarifas.config.solicitada': {}
    }

    EVENTOS_SUBSCRIBES {
      'catalogo.actualizado': onCatalogoActualizado
      'tarifas.config.actualizada': onTarifasConfigActualizada
    }
  }
}
```

## COMPOSITION-MANAGER (v2.0.0)

```
INTERFAZ CompositionManagerContract {
  createSystem(data: {name, description, metadata?}): Promise<System>
  addSystemMember(system_id: String, entity_id: String): Promise<Void>
  createLink(data: {from_entity, to_entity, type, metadata?}): Promise<Link>
  createDependency(data: {entity_id, depends_on, type}): Promise<Dependency>
  listSystems(filters?: Object): Promise<Array<System>>
  getSystemMembers(system_id: String): Promise<Array<Entity>>
  removeSystemMember(system_id: String, entity_id: String): Promise<Void>
}

CLASE CompositionManagerModule HEREDA BaseModule IMPLEMENTA CompositionManagerContract {
  ATRIBUTOS {
    name: String = 'composition-manager'
    version: String = '2.0.0'
    uiHandler: UIRequestHandler
    config: Object
    pendingDbRequests: Map<requestId, {resolve, reject, timeout}>
    logger: Logger
    eventBus: EventBus
    metrics: Metrics
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA logger, eventBus, metrics, uiHandler, config
      SUSCRIBE db.query.response
      await _initializeSchema()
      LOG module.loaded

    async onUnload(): Promise<Void>
      LIMPIA pendingDbRequests CON clearTimeout
      LOG module.unloaded

    async handleCreateSystem(input: {body: {name, description, metadata}}): Promise<Response>
      VALIDA name
      id = UUID
      INSERT INTO systems (id, name, description, metadata, created_at, updated_at)
      EMITE composition.system.created
      RETORNA {status: 201, data: {id, name}}

    async handleAddSystemMember(input: {body: {system_id, entity_id}}): Promise<Response>
      VALIDA system_id, entity_id
      INSERT INTO system_members (system_id, entity_id)
      EMITE composition.member.added
      RETORNA {status: 201}

    async handleCreateLink(input: {body: {from_entity, to_entity, type, metadata}}): Promise<Response>
      VALIDA from_entity, to_entity, type EN VALID_LINK_TYPES
      id = UUID
      INSERT INTO project_links (id, from_entity, to_entity, type, metadata)
      EMITE composition.link.created
      RETORNA {status: 201, data: {id}}

    async handleCreateDependency(input: {body: {entity_id, depends_on, type}}): Promise<Response>
      VALIDA entity_id, depends_on, type EN VALID_DEP_TYPES
      id = UUID
      INSERT INTO project_dependencies (id, entity_id, depends_on, type)
      EMITE composition.dependency.created
      RETORNA {status: 201, data: {id}}

    async _queryDb(query: String, params: Array, readOnly: Boolean): Promise<Array>
      request_id = UUID
      CREA promise CON timeout
      PUBLICA db.query.request {request_id, query, params, read_only, project_id: 'system'}
      RETORNA promise

    async _initializeSchema(): Promise<Void>
      CREATE TABLE IF NOT EXISTS systems (...)
      CREATE TABLE IF NOT EXISTS system_members (...)
      CREATE TABLE IF NOT EXISTS project_links (...)
      CREATE TABLE IF NOT EXISTS project_dependencies (...)

    EVENTOS_PUBLISHES {
      'composition.system.created': {id, name, description}
      'composition.member.added': {system_id, entity_id}
      'composition.link.created': {id, from_entity, to_entity, type}
      'composition.dependency.created': {id, entity_id, depends_on, type}
    }

    EVENTOS_SUBSCRIBES {
      'db.query.response': onDbQueryResponse
    }
  }
}
```

## CREDENTIAL-MANAGER (v2.0.0)

```
INTERFAZ CredentialManagerContract {
  saveCredential(key: String, value: String, level?: String): Promise<Credential>
  getCredential(key: String): Promise<Credential|Null>
  listCredentials(filter?: String): Promise<Array<CredentialMetadata>>
  deleteCredential(key: String): Promise<Void>
  resolveCredential(key: String, context?: Object): Promise<String|Null>
  getProvider(key: String): Promise<String>
}

CLASE CredentialManagerModule HEREDA BaseModule IMPLEMENTA CredentialManagerContract {
  ATRIBUTOS {
    name: String = 'credential-manager'
    version: String = '2.0.0'
    uiHandler: UIRequestHandler
    config: Object
    envFilePath: String
    credentials: Map<key, value>
    logger: Logger
    eventBus: EventBus
    metrics: Metrics
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA logger, eventBus, metrics, uiHandler, config
      RESUELVE envFilePath FROM config.envFile OR default data/.env
      await _loadEnvFile()
      _updateCredentialMetrics()
      PUBLICA credential-manager.state (snapshot)
      LOG module.loaded CON credentials_count

    async onUnload(): Promise<Void>
      credentials.clear()
      LOG module.unloaded

    async handleSaveCredential(input: {body: {key, value, level}}): Promise<Response>
      VALIDA key, value
      level = level || 'GLOBAL'
      VALIDA level EN VALID_LEVELS
      credentials.set(key, value)
      process.env[key] = value
      await _saveEnvFile()
      EMITE credential.saved {key: (masked)}
      RETORNA {status: 201, data: {key, level, provider: _getProvider(key)}}

    async handleGetCredential(input: {query: {key}}): Promise<Response>
      VALIDA key
      value = credentials.get(key)
      SI !value: RETORNA 404
      RETORNA {status: 200, data: {key, masked: _maskValue(value)}}

    async handleListCredentials(input: {query: {filter}}): Promise<Response>
      filter = filter || ''
      lista = Array.from(credentials.keys()).filter(k => k.includes(filter))
      MAPEA a {key, provider, icon}
      RETORNA {status: 200, data: {credentials: lista, count: lista.length}}

    async handleDeleteCredential(input: {body: {key}}): Promise<Response>
      VALIDA key
      credentials.delete(key)
      DELETE FROM process.env[key]
      await _saveEnvFile()
      EMITE credential.deleted {key}
      RETORNA {status: 200}

    async handleResolveCredential(input: {body: {key, context}}): Promise<Response>
      VALIDA key
      value = credentials.get(key)
      SI !value: RETORNA 404
      RETORNA {status: 200, data: {value, resolved: true}}

    async _loadEnvFile(): Promise<Void>
      SI !exists: CREA con header
      SINO: CARGA líneas KEY=VALUE
      PARA CADA línea: SI key contiene _API_KEY_: AGREGA a credentials

    async _saveEnvFile(): Promise<Void>
      tmp = escribir a temp file
      PERSISTE ATOMICO: rename tmp → envFilePath

    _getProvider(key: String): String
      MAPEA key a provider (OPENAI, ANTHROPIC, GOOGLE, etc)

    _maskValue(value: String): String
      SI es API key: retorna primeros 4 + **** + últimos 4
      SINO: retorna ****

    _updateCredentialMetrics(): Void
      PARA CADA credencial: increment('credential-manager.credential', {provider})

    EVENTOS_PUBLISHES {
      'credential.saved': {key, level}
      'credential.deleted': {key}
      'credential-manager.state': {credentials_count, by_provider}
    }

    EVENTOS_SUBSCRIBES {
      (ninguno)
    }
  }
}
```
