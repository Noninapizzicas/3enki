---
id: modulos/grupo-7
dominio: modulos
resumen: filesystem (scopeado por proyecto), firmware-builder (PlatformIO), firmware-manager (catálogo + OTA via shadow).
fuentes:
  - modules/filesystem/**
  - modules/firmware-builder/**
  - modules/firmware-manager/**
verificado: 2026-07-16
---

# GRUPO 7 — PSEUDOCÓDIGO OOP

## FILESYSTEM (v2.0.0) — Operaciones Scopeadas por Proyecto

```
INTERFAZ FilesystemContract {
  listDir(path: String, recursive?: Boolean): Promise<Array<FileInfo>>
  readFile(path: String, encoding?: String): Promise<String|Buffer>
  writeFile(path: String, content: String|Buffer): Promise<Void>
  deleteFile(path: String): Promise<Void>
  mkdir(path: String): Promise<Void>
  exists(path: String): Promise<Boolean>
  moveFile(from: String, to: String): Promise<Void>
  copyFile(from: String, to: String): Promise<Void>
  appendFile(path: String, content: String): Promise<Void>
  searchFiles(query: String, path?: String): Promise<Array<SearchResult>>
  getStats(path: String): Promise<{size, modified, isDir}>
  setWorkDir(path: String): Promise<Void>
  getWorkDir(): Promise<String>
  cleanup(path: String): Promise<{deleted, errors}>
}

CLASE FilesystemModule HEREDA BaseModule IMPLEMENTA FilesystemContract {
  ATRIBUTOS {
    name: String = 'filesystem'
    version: String = '2.0.0'
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    uiHandler: UIRequestHandler
    basePath: String
    activeProjectId: String|Null
    activeProjectPath: String|Null
    workingDirectory: String|Null
    systemMode: Boolean
    _moduleManifests: Map<moduleName, {scope, data_path}>
    MAX_READ_SIZE: Integer (default 10MB)
    MAX_SEARCH_RESULTS: Integer (default 100)
  }

  METODOS {
    async onLoad(context: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus, uiHandler FROM context
      basePath = path.join(cwd(), 'data')
      ENSURA_DIR(basePath)
      await _loadModuleManifests()
      logger.info('filesystem.loaded', {basePath, manifests: _moduleManifests.size})

    async onUnload(): Promise<Void>
      activeProjectId = null
      activeProjectPath = null
      workingDirectory = null
      systemMode = false
      _moduleManifests.clear()
      logger.info('filesystem.unloaded')

    async onProjectActivated(event: Event): Promise<Void>
      data = event.data || event
      {project_id, base_path, name, metadata} = data
      activeProjectId = project_id
      SI metadata?.is_system == true:
        systemMode = true
        activeProjectPath = cwd()
        workingDirectory = cwd()
      SINO:
        systemMode = false
        activeProjectPath = base_path ? join(base_path, 'storage') : join(basePath, 'projects', project_id)
        workingDirectory = activeProjectPath
        await MKDIR_RECURSIVE(activeProjectPath)

    async onProjectDeactivated(event: Event): Promise<Void>
      activeProjectId = null
      activeProjectPath = null
      workingDirectory = basePath
      systemMode = false

    async handleListDir(data: {path?, recursive?}): Promise<Response>
      resolvePath = _resolvePath(data.path || '.')
      VALIDA_PERMISOS(resolvePath)
      entries = await fs.readdir(resolvePath, {withFileTypes: true})
      results = []
      PARA cada entry EN entries:
        info = _buildFileInfo(entry, resolvePath)
        results.push(info)
        SI data.recursive Y entry.isDirectory():
          subResults = await _recursiveListDir(join(resolvePath, entry.name), MAX_SEARCH_RESULTS - results.length)
          results.push(...subResults)
      metrics.increment('fs.list.total')
      EMITE fs.directory.listed CON path: resolvePath, count: results.length
      RETORNA {status: 200, data: {path: resolvePath, entries: results, count: results.length}}

    async handleReadFile(data: {path, encoding?}): Promise<Response>
      resolvePath = _resolvePath(data.path)
      VALIDA_PERMISOS(resolvePath)
      VALIDA_SIZE_LIMIT(resolvePath, MAX_READ_SIZE)
      encoding = data.encoding || 'utf-8'
      SI _isBinaryFile(resolvePath):
        content = await fs.readFile(resolvePath)
        encoded = content.toString('base64')
        metrics.increment('fs.read.total', {kind: 'binary'})
        EMITE fs.file.read CON path: resolvePath, size: content.length
        RETORNA {status: 200, data: {path: resolvePath, content: encoded, encoding: 'base64', size: content.length}}
      SINO:
        content = await fs.readFile(resolvePath, encoding)
        metrics.increment('fs.read.total', {kind: 'text'})
        EMITE fs.file.read CON path: resolvePath, size: content.length
        RETORNA {status: 200, data: {path: resolvePath, content, encoding, size: content.length}}

    async handleWriteFile(data: {path, content, encoding?}): Promise<Response>
      resolvePath = _resolvePath(data.path)
      VALIDA_PERMISOS(resolvePath)
      VALIDA_REQUERIDOS(content)
      encoding = data.encoding || 'utf-8'
      SI NOT _directoryExists(dirname(resolvePath)):
        await MKDIR_RECURSIVE(dirname(resolvePath))
      buffer = typeof data.content == 'string' ? Buffer.from(data.content, encoding) : data.content
      await fs.writeFile(resolvePath, buffer)
      metrics.increment('fs.write.total')
      EMITE fs.file.created O fs.file.updated CON path: resolvePath, size: buffer.length
      RETORNA {status: 201, data: {path: resolvePath, size: buffer.length}}

    async handleDeleteFile(data: {path}): Promise<Response>
      resolvePath = _resolvePath(data.path)
      VALIDA_PERMISOS(resolvePath)
      VALIDA_EXISTE(resolvePath)
      stat = await fs.stat(resolvePath)
      SI stat.isDirectory():
        await fs.rm(resolvePath, {recursive: true, force: true})
        metrics.increment('fs.delete.total', {kind: 'directory'})
        EMITE fs.directory.deleted CON path: resolvePath
      SINO:
        await fs.unlink(resolvePath)
        metrics.increment('fs.delete.total', {kind: 'file'})
        EMITE fs.file.deleted CON path: resolvePath
      RETORNA {status: 200, data: {path: resolvePath, deleted: true}}

    async handleMkdir(data: {path}): Promise<Response>
      resolvePath = _resolvePath(data.path)
      VALIDA_PERMISOS(resolvePath)
      SI EXISTS(resolvePath):
        RETORNA 409 CONFLICT_STATE
      await fs.mkdir(resolvePath, {recursive: true})
      metrics.increment('fs.mkdir.total')
      EMITE fs.directory.created CON path: resolvePath
      RETORNA {status: 201, data: {path: resolvePath, created: true}}

    async handleExists(data: {path}): Promise<Response>
      resolvePath = _resolvePath(data.path)
      VALIDA_PERMISOS(resolvePath)
      exists = EXISTS(resolvePath)
      RETORNA {status: 200, data: {path: resolvePath, exists}}

    async handleMoveFile(data: {from, to}): Promise<Response>
      fromPath = _resolvePath(data.from)
      toPath = _resolvePath(data.to)
      VALIDA_PERMISOS(fromPath)
      VALIDA_PERMISOS(toPath)
      VALIDA_EXISTE(fromPath)
      SI EXISTS(toPath):
        RETORNA 409 CONFLICT_STATE
      await fs.rename(fromPath, toPath)
      metrics.increment('fs.move.total')
      EMITE fs.file.moved CON from: fromPath, to: toPath
      RETORNA {status: 200, data: {from: fromPath, to: toPath}}

    async handleCopyFile(data: {from, to}): Promise<Response>
      fromPath = _resolvePath(data.from)
      toPath = _resolvePath(data.to)
      VALIDA_PERMISOS(fromPath)
      VALIDA_PERMISOS(toPath)
      VALIDA_EXISTE(fromPath)
      SI EXISTS(toPath):
        RETORNA 409 CONFLICT_STATE
      await fs.cp(fromPath, toPath, {recursive: true})
      metrics.increment('fs.copy.total')
      EMITE fs.file.copied CON from: fromPath, to: toPath
      RETORNA {status: 200, data: {from: fromPath, to: toPath}}

    async handleAppendFile(data: {path, content}): Promise<Response>
      resolvePath = _resolvePath(data.path)
      VALIDA_PERMISOS(resolvePath)
      VALIDA_REQUERIDOS(content)
      buffer = typeof data.content == 'string' ? Buffer.from(data.content, 'utf-8') : data.content
      await fs.appendFile(resolvePath, buffer)
      metrics.increment('fs.append.total')
      EMITE fs.file.updated CON path: resolvePath
      RETORNA {status: 200, data: {path: resolvePath, appended: true}}

    async handleSearchFiles(data: {query, path?, limit?}): Promise<Response>
      VALIDA_REQUERIDOS(query)
      searchPath = _resolvePath(data.path || '.')
      VALIDA_PERMISOS(searchPath)
      limit = parseInt(data.limit) || MAX_SEARCH_RESULTS
      results = []
      regex = new RegExp(query, 'i')
      await _recursiveSearch(searchPath, regex, results, limit)
      metrics.increment('fs.search.total', {query_length: query.length})
      RETORNA {status: 200, data: {path: searchPath, query, results, count: results.length}}

    async handleGetStats(data: {path}): Promise<Response>
      resolvePath = _resolvePath(data.path)
      VALIDA_PERMISOS(resolvePath)
      VALIDA_EXISTE(resolvePath)
      stat = await fs.stat(resolvePath)
      RETORNA {status: 200, data: {path: resolvePath, size: stat.size, modified: stat.mtime.toISOString(), isDir: stat.isDirectory()}}

    async handleSetWorkDir(data: {path}): Promise<Response>
      resolvePath = _resolvePath(data.path)
      VALIDA_PERMISOS(resolvePath)
      VALIDA_EXISTE(resolvePath)
      stat = await fs.stat(resolvePath)
      SI NOT stat.isDirectory():
        RETORNA 400 INVALID_INPUT
      workingDirectory = resolvePath
      metrics.increment('fs.workdir.changed')
      EMITE fs.workdir.changed CON path: resolvePath
      RETORNA {status: 200, data: {workDir: resolvePath}}

    async handleGetWorkDir(): Promise<Response>
      RETORNA {status: 200, data: {workDir: workingDirectory}}

    async handleCleanup(data: {path, pattern?}): Promise<Response>
      resolvePath = _resolvePath(data.path)
      VALIDA_PERMISOS(resolvePath)
      VALIDA_EXISTE(resolvePath)
      pattern = data.pattern || /\.tmp$|\.bak$|\.log$/
      deleted = 0
      errors = 0
      await _recursiveCleanup(resolvePath, pattern, deleted, errors)
      metrics.increment('fs.cleanup.total', {deleted})
      EMITE fs.cleanup.completed CON path: resolvePath, deleted, errors
      RETORNA {status: 200, data: {path: resolvePath, deleted, errors}}

    _resolvePath(inputPath: String): String
      SI inputPath == '@/':
        RETORNA basePath
      SI inputPath.startsWith('@/'):
        RETORNA join(basePath, inputPath.slice(2))
      SI inputPath == '~' O inputPath == '~/':
        RETORNA activeProjectPath || workingDirectory || basePath
      SI inputPath.startsWith('~/'):
        base = activeProjectPath || workingDirectory || basePath
        RETORNA join(base, inputPath.slice(2))
      normalized = normalize(inputPath)
      SI isAbsolute(normalized):
        RETORNA normalized
      RETORNA join(workingDirectory || activeProjectPath || basePath, normalized)

    _validatePath(resolved: String): Boolean
      SI NOT resolved.startsWith(activeProjectPath) Y NOT systemMode:
        logger.warn('fs.permission.denied', {path: resolved})
        metrics.increment('fs.errors', {kind: 'permission_denied'})
        RETORNA false
      relative = relative(activeProjectPath || basePath, resolved)
      SI relative.startsWith('..'):
        logger.warn('fs.path_traversal.detected', {path: resolved})
        metrics.increment('fs.errors', {kind: 'path_traversal'})
        RETORNA false
      RETORNA true

    async _loadModuleManifests(): Promise<Void>
      INTENTA leer modules/**/module.json Y cachear {scope, data_path}
      (implementación similar a filesystem module real)

    async _publicarEvento(name: String, payload: Object): Promise<Void>
      enriched = {...payload, project_id: activeProjectId, timestamp: now()}
      await eventBus.publish(name, enriched)

    EVENTOS_SUBSCRIBES {
      'project.activated': onProjectActivated
      'project.deactivated': onProjectDeactivated
    }

    EVENTOS_PUBLISHES {
      'fs.directory.listed': {path, count}
      'fs.file.read': {path, size}
      'fs.file.created': {path, size}
      'fs.file.updated': {path}
      'fs.file.deleted': {path}
      'fs.file.moved': {from, to}
      'fs.file.copied': {from, to}
      'fs.directory.created': {path}
      'fs.directory.deleted': {path}
      'fs.workdir.changed': {path}
      'fs.cleanup.completed': {path, deleted, errors}
    }
  }
}
```

## FIRMWARE-BUILDER (v2.0.0) — Compilación PlatformIO de Drivers ESP32

```
INTERFAZ FirmwareBuilderContract {
  listDrivers(): Promise<Array<DriverInfo>>
  build(driver: String, board?: String, clean?: Boolean): Promise<{buildId, status}>
  getBuildStatus(buildId?: String): Promise<{buildId?, driver?, status?, progress?, log?}|{active: Array}>
  listBoards(): Promise<Array<BoardInfo>>
  getLog(buildId: String): Promise<{buildId, log: Array<String>}>
}

CLASE FirmwareBuilderModule HEREDA BaseModule IMPLEMENTA FirmwareBuilderContract {
  ATRIBUTOS {
    name: String = 'firmware-builder'
    version: String = '2.0.0'
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    config: {firmware_path, platformio_path, build_timeout_ms, max_concurrent_builds}
    drivers: Map<driverId, DriverInfo>
    activeBuilds: Map<buildId, BuildSession>
    BOARDS: Map<boardId, {name, platform, mcu, flash, psram}>
    MAX_LOG_LINES: Integer (default 500)
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus FROM core
      CARGA config FROM core.config['firmware-builder']
      VALIDAR_CONFIG()
      await _scanDrivers()
      metrics.gauge('firmware.drivers.count', drivers.size)
      metrics.gauge('firmware.active_builds.count', 0)
      logger.info('firmware-builder.loaded', {drivers: drivers.size, firmware_path: config.firmware_path})

    async onUnload(): Promise<Void>
      killed = 0
      PARA cada [id, build] EN activeBuilds:
        SI build.process NO killed: KILL(SIGTERM), killed++
      activeBuilds.clear()
      drivers.clear()
      logger.info('firmware-builder.unloaded', {killed})

    async handleListDrivers(): Promise<Response>
      await _scanDrivers()
      list = []
      PARA cada [id, driver] EN drivers:
        list.push({id, name, description, board, capabilities, has_binary, last_build, is_building: activeBuilds.has(id)})
      RETORNA {status: 200, data: {drivers: list, total: list.length}}

    async handleBuild(data: {driver, board?, clean?}): Promise<Response>
      VALIDA driver obligatorio
      driverInfo = drivers.get(data.driver)
      SI !driverInfo: RETORNA 404 RESOURCE_NOT_FOUND
      SI activeBuilds.has(data.driver): RETORNA 409 CONFLICT_STATE
      SI activeBuilds.size >= config.max_concurrent_builds: RETORNA 429 RATE_LIMITED
      buildId = crypto.randomBytes(6).toString('hex')
      build = {buildId, driver: data.driver, board: data.board || driverInfo.board, clean: !!data.clean, started_at: now(), log: [], progress: 0, process: null}
      activeBuilds.set(buildId, build)
      metrics.gauge('firmware.active_builds.count', activeBuilds.size)
      EMITE firmware.build_started CON buildId, driver: data.driver
      _runBuild(buildId, driverInfo, data.board, !!data.clean)
      RETORNA {status: 202, data: {buildId, driver: data.driver, status: 'building'}}

    _runBuild(buildId: String, driver: DriverInfo, board: String, clean: Boolean): Void
      build = activeBuilds.get(buildId)
      args = ['run', '-d', driver.path]
      SI clean: args.push('-t', 'clean')
      process = spawn(config.platformio_path, args, {timeout: config.build_timeout_ms})
      build.process = process
      process.stdout.on('data'): build.log.push(data.toString()), _updateProgress(buildId, data.toString())
      process.on('close'): await _onBuildComplete(buildId, exitCode)
      process.on('error'): await _onBuildError(buildId, err)

    async _onBuildComplete(buildId: String, exitCode: Integer): Promise<Void>
      build = activeBuilds.get(buildId)
      duration = now() - build.started_at
      activeBuilds.delete(buildId)
      metrics.gauge('firmware.active_builds.count', activeBuilds.size)
      SI exitCode == 0:
        metrics.increment('firmware.build.success')
        driver = drivers.get(build.driver)
        driver.last_build = now()
        EMITE firmware.build_completed CON buildId, driver: build.driver, duration_ms: duration
      SINO:
        metrics.increment('firmware.build.failed')
        errorLog = build.log.slice(-20).join('\n')
        EMITE firmware.build_failed CON buildId, driver: build.driver, exit_code: exitCode, log: errorLog

    async _onBuildError(buildId: String, err: Error): Promise<Void>
      activeBuilds.delete(buildId)
      metrics.increment('firmware.build.error')
      EMITE firmware.build_failed CON buildId, error: err.message

    async handleGetBuildStatus(data: {buildId?}): Promise<Response>
      SI data.buildId:
        build = activeBuilds.get(data.buildId)
        SI !build: RETORNA 404 RESOURCE_NOT_FOUND
        RETORNA {status: 200, data: {buildId: data.buildId, driver: build.driver, status: 'building', progress: build.progress, log_lines: build.log.length}}
      SINO:
        active = Array.from(activeBuilds).map(([id, build]) => ({buildId: id, driver: build.driver, status: 'building', progress: build.progress}))
        RETORNA {status: 200, data: {active, count: active.length}}

    async handleListBoards(): Promise<Response>
      boards = Array.from(BOARDS.values()).map(b => ({id: b.name, name: b.name, platform: b.platform, mcu: b.mcu, flash: b.flash, psram: b.psram}))
      RETORNA {status: 200, data: {boards, total: boards.length}}

    _updateProgress(buildId: String, logLine: String): Void
      build = activeBuilds.get(buildId)
      SI logLine.includes('Building'):
        build.progress = 20
      SI logLine.includes('Compiling'):
        build.progress = 50
      SI logLine.includes('Linking'):
        build.progress = 80
      EMITE firmware.build_progress CON buildId, progress: build.progress

    async _scanDrivers(): Promise<Void>
      drivers.clear()
      PARA cada directorio EN config.firmware_path:
        SI exists(join(directorios, 'platformio.ini')):
          manifest = _parsePlatformioIni(...)
          driverId = basename(directorios)
          drivers.set(driverId, {id: driverId, name: manifest.name, description: manifest.description, board: manifest.board, path: directorios, last_build: null})

    EVENTOS_SUBSCRIBES {
    }

    EVENTOS_PUBLISHES {
      'firmware.build_started': {buildId, driver}
      'firmware.build_progress': {buildId, progress}
      'firmware.build_completed': {buildId, driver, duration_ms}
      'firmware.build_failed': {buildId, driver, exit_code?, error?, log?}
    }
  }
}

CLASE BuildSession {
  ATRIBUTOS {
    buildId: String
    driver: String
    board: String
    clean: Boolean
    started_at: String (ISO)
    log: Array<String> (max MAX_LOG_LINES)
    progress: Integer (0-100)
    process: ChildProcess|Null
  }
}

CLASE DriverInfo {
  ATRIBUTOS {
    id: String
    name: String
    description: String
    board: String
    path: String
    last_build: String|Null (ISO)
    capabilities: Array<String>
    has_binary: Boolean
  }
}
```

## FIRMWARE-MANAGER (v3.0.0) — Catálogo Versionado + OTA via Shadow

```
INTERFAZ FirmwareManagerContract {
  listCatalog(type?: String): Promise<Array<Release>>
  registerFirmware(data: {type, version, file, sha256, changelog?}): Promise<{registered, version}>
  triggerOta(device_id: String, type: String, version: String): Promise<{ota_id, device_id}>
  getOtaStatus(ota_id?: String): Promise<{ota_id?, device_id?, status?}|{active: Array}>
  rollback(device_id: String): Promise<Void>
  getDeviceVersions(device_id: String): Promise<{device_id, current, available}>
}

CLASE FirmwareManagerModule HEREDA BaseModule IMPLEMENTA FirmwareManagerContract {
  ATRIBUTOS {
    name: String = 'firmware-manager'
    version: String = '3.0.0'
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    config: {data_path, auto_check_on_register, ota_timeout_ms, ota_cleanup_interval_ms}
    catalog: Map<type, {latest, releases: Map<version, Release>, projects}>
    pendingOtas: Map<ota_id, OtaSession>
    otaLog: Array<OtaLogEntry>
    _catalogFile: String
    _cleanupTimer: NodeJS.Timeout|Null
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus FROM core
      CARGA config FROM core.config['firmware-manager']
      _catalogFile = join(config.data_path, 'firmware-catalog.json')
      ENSURA_DIR(config.data_path)
      await _loadCatalog()
      SUSCRIBE firmware.build_completed
      _cleanupTimer = setInterval(() => _cleanupStaleOtas(), config.ota_cleanup_interval_ms)
      logger.info('firmware-manager.loaded', {catalog_types: catalog.size})

    async onUnload(): Promise<Void>
      SI _cleanupTimer: clearInterval(_cleanupTimer)
      await _saveCatalog()
      pendingOtas.clear()
      catalog.clear()
      logger.info('firmware-manager.unloaded')

    async onBuildCompleted(event: Event): Promise<Void>
      {buildId, driver, duration_ms} = event.data || event
      buildArtifactPath = _resolveBuildPath(driver)
      SI NOT EXISTS(buildArtifactPath): RETORNA
      binary = readFile(buildArtifactPath)
      sha256 = SHA256(binary)
      type = driver
      version = _extractVersionFromManifest(driver) || '1.0.0'
      await handleRegisterFirmware({type, version, file: basename(buildArtifactPath), sha256, changelog: `Auto-registered from build ${buildId}`}, {auto: true})

    async handleListCatalog(data: {type?}): Promise<Response>
      list = []
      PARA cada [type, entry] EN catalog:
        SI data.type Y data.type != type: CONTINÚA
        PARA cada [version, release] EN entry.releases:
          list.push({type, version, file: release.file, sha256: release.sha256.slice(0, 8) + '...', size: release.size, changelog: release.changelog, created_at: release.created_at})
      RETORNA {status: 200, data: {releases: list, total: list.length}}

    async handleRegisterFirmware(data: {type, version, file, sha256, changelog?}, sourcePayload?: Object): Promise<Response>
      VALIDA type, version, file, sha256 obligatorios
      VALIDA_SEMVER(version)
      VALIDA_SHA256(sha256)
      SI NOT _fileExists(file):
        logger.warn('firmware-manager.register.file_not_found', {file})
        RETORNA 404 RESOURCE_NOT_FOUND
      fileSize = _getFileSize(file)
      release = {version, file, sha256, size: fileSize, changelog: data.changelog || '', created_at: now(), status: 'active'}
      SI NOT catalog.has(data.type):
        catalog.set(data.type, {latest: version, releases: new Map(), projects: {}})
      entry = catalog.get(data.type)
      entry.releases.set(version, release)
      SI _compareVersions(version, entry.latest) > 0:
        entry.latest = version
      await _saveCatalog()
      _addToLog({type: data.type, version, action: 'registered', timestamp: now()})
      metrics.increment('firmware.registered.total')
      EMITE firmware.registered CON type: data.type, version, file, sha256
      RETORNA {status: 201, data: {registered: true, version}}

    async handleTriggerOta(data: {device_id, type, version?}): Promise<Response>
      VALIDA device_id, type obligatorios
      targetVersion = data.version || _getLatestVersion(data.type)
      SI NOT targetVersion: RETORNA 404 RESOURCE_NOT_FOUND
      entry = catalog.get(data.type)
      release = entry.releases.get(targetVersion)
      SI NOT release: RETORNA 404
      ota_id = crypto.randomBytes(6).toString('hex')
      otaSession = {ota_id, device_id, type: data.type, target_version: targetVersion, status: 'initiating', started_at: now(), log: []}
      pendingOtas.set(ota_id, otaSession)
      metrics.increment('firmware.ota.initiated')
      EMITE firmware.ota_requested CON ota_id, device_id, type: data.type, version: targetVersion
      PUBLICA shadow.set_desired CON {device_id, desired: {firmware: {type: data.type, version: targetVersion}}}
      _addToLog({action: 'ota_initiated', device_id, ota_id, target_version: targetVersion, timestamp: now()})
      RETORNA {status: 202, data: {ota_id, device_id, status: 'initiating'}}

    async onShadowUpdated(event: Event): Promise<Void>
      {device_id, reported} = event.data || event
      SI NOT reported?.firmware?.version: RETORNA
      currentVersion = reported.firmware.version
      otaSession = Array.from(pendingOtas.values()).find(o => o.device_id == device_id)
      SI otaSession:
        SI currentVersion == otaSession.target_version:
          otaSession.status = 'completed'
          pendingOtas.delete(otaSession.ota_id)
          metrics.increment('firmware.ota.success')
          EMITE firmware.ota_completed CON ota_id: otaSession.ota_id, device_id, version: currentVersion
          _addToLog({action: 'ota_completed', device_id, ota_id: otaSession.ota_id, version: currentVersion, timestamp: now()})
        SINO SI now() - otaSession.started_at > config.ota_timeout_ms:
          otaSession.status = 'failed'
          pendingOtas.delete(otaSession.ota_id)
          metrics.increment('firmware.ota.timeout')
          EMITE firmware.ota_failed CON ota_id: otaSession.ota_id, device_id, reason: 'timeout'

    async handleGetOtaStatus(data: {ota_id?}): Promise<Response>
      SI data.ota_id:
        session = pendingOtas.get(data.ota_id)
        SI !session: RETORNA 404 RESOURCE_NOT_FOUND
        RETORNA {status: 200, data: {ota_id: data.ota_id, device_id: session.device_id, status: session.status, target_version: session.target_version}}
      SINO:
        active = Array.from(pendingOtas.values()).map(s => ({ota_id: s.ota_id, device_id: s.device_id, status: s.status}))
        RETORNA {status: 200, data: {active, count: active.length}}

    async handleRollback(data: {device_id}): Promise<Response>
      otaSession = Array.from(pendingOtas.values()).find(o => o.device_id == data.device_id)
      SI otaSession Y otaSession.status != 'completed':
        pendingOtas.delete(otaSession.ota_id)
      PUBLICA shadow.set_desired CON {device_id: data.device_id, desired: {firmware: {}}}
      EMITE firmware.ota_rollback_requested CON device_id: data.device_id
      RETORNA {status: 200, data: {device_id: data.device_id, rollback_requested: true}}

    async handleGetDeviceVersions(data: {device_id}): Promise<Response>
      RETORNA {status: 200, data: {device_id: data.device_id, current: 'unknown', available: Array.from(catalog.keys()).map(type => ({type, latest: _getLatestVersion(type)}))}}

    _getLatestVersion(type: String): String|Null
      entry = catalog.get(type)
      RETORNA entry?.latest || null

    _compareVersions(v1: String, v2: String): Integer
      p1 = v1.split('.').map(x => parseInt(x))
      p2 = v2.split('.').map(x => parseInt(x))
      PARA i = 0 HASTA max(p1.length, p2.length):
        cmp = (p1[i] || 0) - (p2[i] || 0)
        SI cmp != 0: RETORNA cmp
      RETORNA 0

    async _loadCatalog(): Promise<Void>
      SI EXISTS(_catalogFile):
        data = JSON.parse(readFile(_catalogFile, 'utf-8'))
        PARA cada [type, entry] EN data.catalog:
          releases = new Map(Object.entries(entry.releases))
          catalog.set(type, {latest: entry.latest, releases, projects: entry.projects || {}})

    async _saveCatalog(): Promise<Void>
      data = {_version: 1, _updated: now(), catalog: {}}
      PARA cada [type, entry] EN catalog:
        data.catalog[type] = {latest: entry.latest, releases: Object.fromEntries(entry.releases), projects: entry.projects}
      writeFile(_catalogFile, JSON.stringify(data, null, 2))

    _addToLog(entry: Object): Void
      otaLog.unshift({...entry, timestamp: now()})
      SI otaLog.length > 500: otaLog.length = 500

    async _cleanupStaleOtas(): Promise<Void>
      cutoff = now() - (24 * 60 * 60 * 1000)
      toDelete = []
      PARA cada [ota_id, session] EN pendingOtas:
        SI session.started_at < cutoff:
          toDelete.push(ota_id)
      PARA cada id EN toDelete:
        pendingOtas.delete(id)

    EVENTOS_SUBSCRIBES {
      'firmware.build_completed': onBuildCompleted
      'shadow.updated': onShadowUpdated
    }

    EVENTOS_PUBLISHES {
      'firmware.registered': {type, version, file, sha256}
      'firmware.ota_requested': {ota_id, device_id, type, version}
      'firmware.ota_completed': {ota_id, device_id, version}
      'firmware.ota_failed': {ota_id, device_id, reason}
      'firmware.ota_rollback_requested': {device_id}
      'shadow.set_desired': {device_id, desired}
    }
  }
}

CLASE OtaSession {
  ATRIBUTOS {
    ota_id: String
    device_id: String
    type: String
    target_version: String
    status: String (initiating|in_progress|completed|failed)
    started_at: String (ISO)
    log: Array<String>
  }
}

CLASE Release {
  ATRIBUTOS {
    version: String
    file: String
    sha256: String
    size: Integer
    changelog: String
    created_at: String (ISO)
    status: String (active|deprecated)
  }
}

CLASE OtaLogEntry {
  ATRIBUTOS {
    action: String
    device_id: String|Null
    ota_id: String|Null
    type: String|Null
    version: String|Null
    target_version: String|Null
    reason: String|Null
    timestamp: String (ISO)
  }
}
```
