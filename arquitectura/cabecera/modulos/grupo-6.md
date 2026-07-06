---
id: modulos/grupo-6
dominio: modulos
resumen: esp32-flasher (flash/monitor/debug) y facturas (pipeline OCR+AI).
fuentes:
  - modules/esp32-flasher/**
  - modules/facturas/**
  - modules/facturacion/**
verificado: 2026-07-06
---

# GRUPO 6 — PSEUDOCÓDIGO OOP

## ESP32-FLASHER (v2.0.0) — Flash Firmware a ESP32

```
INTERFAZ ESP32FlasherContract {
  listPorts(): Promise<Array<PortInfo>>
  startFlash(data: {port, binary_path, method?, baud?, flash_mode?, flash_freq?, erase_before?, project_id?}): Promise<{flash_id, status}>
  getFlashStatus(flash_id?: String): Promise<{flash_id?, port?, progress?, elapsed_ms?}|{active: Array}>
  cancelFlash(flash_id: String): Promise<{status, duration_ms}>
  startMonitor(data: {port, baud?, project_id?}): Promise<{port, status}>
  stopMonitor(data: {port}): Promise<{port, status}>
  sendMonitorData(data: {port, data: String}): Promise<{port, sent}>
  getFlashHistory(limit?: Integer, port?: String): Promise<{history: Array, total}>
  debugControl(data: {device, project, enable}): Promise<{ok, device, project, enable}>
  debugStream(data: {device}): Promise<{lines: Array, device}>
  serialRelay(data: {port?, device?, project?, lines: Array, project_id?}): Promise<{ok, relayed}>
  healthCheck(): Promise<{status, module, version, active_flashes, active_monitors, history_entries}>
}

CLASE ESP32FlasherModule HEREDA BaseModule IMPLEMENTA ESP32FlasherContract {
  ATRIBUTOS {
    name: String = 'esp32-flasher'
    version: String = '2.0.0'
    config: {
      esptool_path: String,
      platformio_path: String,
      default_baud: Integer,
      flash_baud: Integer,
      monitor_baud: Integer,
      flash_timeout_ms: Integer,
      serial_patterns: Array<String>,
      max_monitor_buffer: Integer,
      max_history: Integer
    }
    activeFlashes: Map<flash_id, FlashSession>
    activeMonitors: Map<port, MonitorSession>
    flashHistory: Array<FlashHistoryEntry>
    lastBuild: {driver, board, binary_path, binary_size, timestamp}|Null
    debugBuffers: Map<device_id, DebugBuffer>
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA config FROM core.config['esp32-flasher']
      SETEA logger, metrics, eventBus FROM core
      INICIALIZA gauges: esp32-flasher.active.count=0, esp32-flasher.monitors.count=0
      INVOCA _startDebugListener()

    async onUnload(): Promise<Void>
      PARA cada [id, flash] EN activeFlashes:
        SI flash.process NO killed: KILL(SIGTERM)
      PARA cada [, monitor] EN activeMonitors:
        SI monitor.process NO killed: KILL(SIGTERM)
      LIMPIA _onDebugMessage listener FROM MQTT
      LIMPIA activeFlashes, activeMonitors, debugBuffers
      LIMPIA flashHistory, lastBuild

    async handleListPorts(): Promise<Response>
      ports = await _scanPorts()
      metrics.gauge('esp32-flasher.ports_detected.count', ports.length)
      RETORNA {status: 200, data: {ports, total: ports.length, last_build, active_flash[], active_monitors[]}}

    async handleStart(data: {port, binary_path, method?, baud?, flash_mode?, flash_freq?, erase_before?, project_id?}): Promise<Response>
      VALIDA port obligatorio
      VALIDA binary_path obligatorio
      VALIDA binary_path existe Y readable
      VALIDA puerto NO en uso por otra flash
      SI monitor activo EN puerto: PARA() monitor primero
      VALIDA flashMethod EN ['esptool', 'platformio']
      VALIDA herramienta disponible VIA _checkFlashTool()
      VALIDA puerto formato valido (regex)
      VALIDA puerto accesible (R+W)
      GENERA flashId
      flashInfo = {flash_id, port, method, binary_path, baud, project_id, started_at, log: [], progress, process}
      SI method == 'platformio': BUSCA platformio.ini ARRIBA DE binary_path
      AGREGA flashInfo A activeFlashes
      EMITE flash.started
      INVOCA _runEsptoolFlash() O _runPlatformioFlash() SEGUN method
      RETORNA {status: 202, data: {flash_id, port, method, baud, status: 'flashing'}}

    async handleStatus(data: {flash_id?}): Promise<Response>
      SI flash_id:
        flash = activeFlashes.get(flash_id)
        SI flash: RETORNA {status: 200, data: {flash_id, port, method, status: 'flashing', started_at, elapsed_ms, progress, log_lines, log_tail}}
        hist = flashHistory.find(h => h.flash_id == flash_id)
        SI hist: RETORNA {status: 200, data: hist}
        RETORNA 404 RESOURCE_NOT_FOUND
      SINO:
        active = Array.from(activeFlashes).map(([id, flash]) => {flash_id: id, port, method, status: 'flashing', started_at, progress, elapsed_ms})
        RETORNA {status: 200, data: {active, count: active.length}}

    async handleCancel(data: {flash_id}): Promise<Response>
      VALIDA flash_id obligatorio
      flash = activeFlashes.get(flash_id)
      SI !flash: RETORNA 404 RESOURCE_NOT_FOUND
      SI flash.process: KILL(SIGTERM)
      duration = now() - flash.started_at
      ELIMINA DE activeFlashes
      metrics.increment('esp32-flasher.cancelled.total')
      metrics.gauge('esp32-flasher.active.count', activeFlashes.size)
      _addHistory({flash_id, port: flash.port, method: flash.method, binary_path, status: 'cancelled', duration_ms, timestamp})
      EMITE flash.failed CON error: 'cancelled'
      RETORNA {status: 200, data: {flash_id, status: 'cancelled', duration_ms}}

    async handleMonitorStart(data: {port, baud?, project_id?}): Promise<Response>
      VALIDA port obligatorio
      VALIDA port NO activo como monitor YA
      VALIDA port NO en uso por flash
      monitorBaud = baud || config.monitor_baud
      await _startMonitor(port, monitorBaud, project_id)
      metrics.increment('esp32-flasher.monitor_started.total')
      metrics.gauge('esp32-flasher.monitors.count', activeMonitors.size)
      RETORNA {status: 200, data: {port, baud: monitorBaud, status: 'monitoring'}}

    async handleMonitorStop(data: {port}): Promise<Response>
      VALIDA port obligatorio
      VALIDA port EN activeMonitors
      await _stopMonitor(port)
      metrics.gauge('esp32-flasher.monitors.count', activeMonitors.size)
      RETORNA {status: 200, data: {port, status: 'stopped'}}

    async handleMonitorSend(data: {port, data}): Promise<Response>
      VALIDA port, data obligatorios
      monitor = activeMonitors.get(port)
      SI !monitor: RETORNA 404 RESOURCE_NOT_FOUND
      await fs.writeFile(port, text + '\n')
      RETORNA {status: 200, data: {port, sent: text}}

    async handleHistory(data: {limit?, port?}): Promise<Response>
      limit = parseInt(limit) || 50
      history = flashHistory
      SI port: FILTRA history POR port
      RETORNA {status: 200, data: {history: history.slice(0, limit), total: history.length}}

    async handleDebugControl(data: {device, project, enable}): Promise<Response>
      VALIDA device, project obligatorios
      VALIDA mqtt conectado
      topic = `enki/{project}/debug/{device}/control`
      mqtt.publish(topic, JSON.stringify({enable: !!enable}))
      RETORNA {status: 200, data: {ok: true, device, project, enable}}

    async handleDebugStream(data: {device}): Promise<Response>
      VALIDA device obligatorio
      buf = debugBuffers.get(device) || {lines: [], waiters: []}
      SI buf.lines.length > 0: RETORNA {status: 200, data: {lines: buf.lines.splice(0), device}}
      ESPERA hasta que haya lineas O timeout (30s)
      RETORNA {status: 200, data: {lines, device}}

    async handleSerialRelay(data: {port?, device?, project?, lines: Array, project_id?}): Promise<Response>
      VALIDA lines array obligatorio
      PARA cada line EN lines: EMITE flash.serial_output CON line, source: 'cli'
      RETORNA {status: 200, data: {ok: true, relayed: lines.length}}

    async handleHealth(): Promise<Response>
      RETORNA {status: 200, data: {status: 'healthy', module: name, version, active_flashes: size, active_monitors: size, history_entries: length}}

    _runEsptoolFlash(flashId: String, opts: {port, binary_path, baud, flash_mode, flash_freq, erase_before}): Void
      args = ['--chip', 'auto', '--port', port, '--baud', baud]
      SI erase_before: args.push('--before', 'default_reset', '--after', 'hard_reset')
      args.push('write_flash', '--flash_mode', flash_mode, '--flash_freq', flash_freq, '0x10000', binary_path)
      proc = spawn(config.esptool_path, args, {timeout: config.flash_timeout_ms})
      flash.process = proc
      proc.stdout.on('data'): PARSEA progress DESDE lineas, EMITE flash.progress
      proc.stderr.on('data'): LOG lineas
      proc.on('close'): await _onFlashComplete(flashId, exitCode, startTime)
      proc.on('error'): await _onFlashError(flashId, err, startTime)

    _runPlatformioFlash(flashId: String, opts: {port, project_dir}): Void
      args = ['run', '-t', 'upload', '--upload-port', port]
      proc = spawn(config.platformio_path, args, {cwd: project_dir, timeout: config.flash_timeout_ms})
      flash.process = proc
      proc.stdout.on('data'): PARSEA output, ACTUALIZA progress
      proc.on('close'): await _onFlashComplete(flashId, exitCode, startTime)
      proc.on('error'): await _onFlashError(flashId, err, startTime)

    async _onFlashComplete(flashId: String, exitCode: Integer, startTime: Number): Promise<Void>
      flash = activeFlashes.get(flashId)
      duration = now() - startTime
      ELIMINA DE activeFlashes
      metrics.gauge('esp32-flasher.active.count', activeFlashes.size)
      binarySize = fs.stat(flash.binary_path).size O 0
      SI exitCode == 0:
        metrics.increment('esp32-flasher.completed.total')
        metrics.timing('esp32-flasher.duration', duration)
        _addHistory({flash_id: flashId, port, method, binary_path, binary_size, status: 'completed', duration_ms, timestamp})
        EMITE flash.completed CON duration_ms, binary_size
      SINO:
        metrics.increment('esp32-flasher.failed.total')
        errorOutput = flash.log.slice(-20).join('\n')
        _addHistory({flash_id: flashId, port, method, binary_path, status: 'failed', error: errorOutput, exit_code: exitCode, duration_ms, timestamp})
        EMITE flash.failed CON error: errorOutput, exit_code, duration_ms

    async _onFlashError(flashId: String, err: Error, startTime: Number): Promise<Void>
      flash = activeFlashes.get(flashId)
      duration = now() - startTime
      ELIMINA DE activeFlashes
      metrics.increment('esp32-flasher.failed.total')
      metrics.gauge('esp32-flasher.active.count', activeFlashes.size)
      _addHistory({flash_id: flashId, port, method, binary_path, status: 'failed', error: err.message, exit_code: -1, duration_ms, timestamp})
      EMITE flash.failed CON error: err.message, exit_code: -1

    async _startMonitor(port: String, baud: Integer, project_id: String): Promise<Void>
      proc_stty = spawn('stty', ['-F', port, baud.toString(), 'raw', '-echo'], {timeout: 5000})
      ESPERA cierre DE proc_stty
      proc_cat = spawn('cat', [port])
      buffer = []
      monitor = {process: proc_cat, baud, project_id, buffer, started_at: now()}
      proc_cat.stdout.on('data'): PARA cada line: AGREGA A buffer, LIMPIA SI > max, EMITE flash.serial_output
      proc_cat.on('close'): LIMPIA DE activeMonitors
      proc_cat.on('error'): LIMPIA DE activeMonitors, LOG error
      activeMonitors.set(port, monitor)

    async _stopMonitor(port: String): Promise<Void>
      monitor = activeMonitors.get(port)
      SI monitor.process: KILL(SIGTERM)
      ELIMINA DE activeMonitors

    async _scanPorts(): Promise<Array<PortInfo>>
      ports = []
      PARA cada pattern EN config.serial_patterns:
        dir = dirname(pattern)
        prefix = basename(pattern).replace('*', '')
        PARA cada entry EN readdir(dir):
          SI entry.startsWith(prefix):
            portPath = join(dir, entry)
            info = {path: portPath, name: entry, type, in_use_by}
            SI en activeFlashes O activeMonitors: info.in_use_by = id
            ports.push(info)
      RETORNA ports

    async _checkFlashTool(method: String): Promise<{available, error?}>
      toolPath = method == 'platformio' ? config.platformio_path : config.esptool_path
      INTENTA execFileSync('which', [toolPath], {timeout: 3000})
      SI exito: RETORNA {available: true}
      RETORNA {available: false, error: 'Tool not found'}

    _findPlatformioRoot(binaryPath: String): String|Null
      dir = dirname(binaryPath)
      MIENTRAS dir != root:
        SI exists(join(dir, 'platformio.ini')): RETORNA dir
        dir = dirname(dir)
      RETORNA null

    _parseEsptoolProgress(flashId: String, lines: Array<String>): Void
      flash = activeFlashes.get(flashId)
      PARA cada line:
        SI line.includes('Connecting'): progress.stage = 'connecting', percent = 5
        SI line.includes('Chip is'): progress.stage = 'connected', percent = 10
        SI line.includes('Erasing flash'): progress.stage = 'erasing', percent = 20
        SI line.includes('Writing at'): progress.percent = 25 + (parsed_percent * 0.65)
        SI line.includes('Hash of data verified'): progress.stage = 'verifying', percent = 95
        SI line.includes('Hard resetting'): progress.stage = 'resetting', percent = 98
        EMITE flash.progress CON stage, percent, message: line.trim()

    _startDebugListener(): Void
      mqtt = eventBus.mqtt
      SI !mqtt: RETORNA
      _onDebugMessage = (topic, payload) => {
        match = topic.match(/^enki\/([^\/]+)\/debug\/([^\/]+)$/)
        SI !match: RETORNA
        deviceId = match[2]
        data = JSON.parse(payload)
        SI !data.lines: RETORNA
        buf = debugBuffers.get(deviceId) || {lines: [], waiters: []}
        buf.lines.push(...data.lines)
        SI buf.lines.length > DEBUG_BUFFER_MAX_LINES: buf.lines.slice(-DEBUG_BUFFER_MAX_LINES)
        PARA cada waiter EN buf.waiters: waiter(data.lines)
        buf.waiters = []
        EMITE flash.serial_output CON line: data.lines.join('\n'), device_id: deviceId
      }
      mqtt.on('message', _onDebugMessage)
      mqtt.subscribe('enki/+/debug/+')

    _addHistory(entry: FlashHistoryEntry): Void
      flashHistory.unshift(entry)
      SI flashHistory.length > config.max_history: flashHistory.length = config.max_history

    _generateId(): String
      RETORNA crypto.randomBytes(6).toString('hex')

    _errorResponse(status: Integer, code: String, message: String, details?: Object): Object
      error = {code, message}
      SI details: error.details = details
      RETORNA {status, error}

    _classifyHandlerError(err: Error): {status, code}
      msg = err.message.toLowerCase()
      code = err.code
      SI code == 'ENOENT': RETORNA {status: 404, code: 'RESOURCE_NOT_FOUND'}
      SI msg.includes('timeout'): RETORNA {status: 504, code: 'UPSTREAM_TIMEOUT'}
      SI msg.includes('invalid') O msg.includes('required'): RETORNA {status: 400, code: 'INVALID_INPUT'}
      SI msg.includes('conflict') O msg.includes('already'): RETORNA {status: 409, code: 'CONFLICT_STATE'}
      RETORNA {status: 500, code: 'UNKNOWN_ERROR'}

    _handleHandlerError(logEvent: String, err: Error, kind: String): Object
      {status, code} = _classifyHandlerError(err)
      logger.error(logEvent, {kind, error_code: code, error_message: err.message})
      metrics.increment('esp32-flasher.errors', {code, kind})
      RETORNA _errorResponse(status, code, err.message)

    async _publicarEvento(name: String, payload: Object, sourcePayload: Object): Promise<Object>
      correlation_id = payload.correlation_id || sourcePayload?.correlation_id || null
      project_id = payload.project_id || sourcePayload?.project_id || null
      enriched = {...payload, correlation_id, timestamp: now().toISOString()}
      SI project_id: enriched.project_id = project_id
      await eventBus.publish(name, enriched)
      RETORNA enriched

    EVENTOS_SUBSCRIBES {
      'firmware.build.completed': onBuildCompleted
    }

    EVENTOS_PUBLISHES {
      'flash.started': {flash_id, port, method, binary_path, baud}
      'flash.progress': {flash_id, stage, percent, message}
      'flash.completed': {flash_id, port, method, binary_path, binary_size, duration_ms}
      'flash.failed': {flash_id, port, method, error, exit_code, duration_ms}
      'flash.serial_output': {port, line, device_id?, source?}
    }
  }
}

CLASE FlashSession {
  ATRIBUTOS {
    flash_id: String
    port: String
    method: String ('esptool'|'platformio')
    binary_path: String
    baud: Integer
    project_id: String|Null
    started_at: String (ISO)
    log: Array<String>
    progress: {stage: String, percent: Integer, message?: String}
    process: ChildProcess|Null
    _pioDir: String|Null (platformio only)
  }
}

CLASE MonitorSession {
  ATRIBUTOS {
    process: ChildProcess
    baud: Integer
    project_id: String|Null
    buffer: Array<String>
    started_at: String (ISO)
  }
}

CLASE FlashHistoryEntry {
  ATRIBUTOS {
    flash_id: String
    port: String
    method: String
    binary_path: String
    binary_size: Integer
    status: String ('completed'|'failed'|'cancelled')
    error: String|Null
    exit_code: Integer|Null
    duration_ms: Integer
    timestamp: String (ISO)
  }
}

CLASE DebugBuffer {
  ATRIBUTOS {
    lines: Array<String> (max DEBUG_BUFFER_MAX_LINES=500)
    waiters: Array<Function> (callbacks waiting for new lines)
  }
}
```

## FACTURAS (v3.0.0) — Pipeline OCR + AI de Procesamiento de Facturas

```
INTERFAZ FacturasContract {
  procesarArchivo(filePath: String, projectId: String, options?: Object): Promise<{success, facturaId?, duplicate?, error?, estructura?, metrics?}>
  subirArchivo(data: {proyecto, archivo: {nombre, contenido}}): Promise<Response>
  reprocesarFactura(data: {proyecto, id}): Promise<Response>
  listarFacturas(data: {proyecto, estado?, desde?, hasta?, limit?}): Promise<Response>
  obtenerFactura(data: {proyecto, id}): Promise<Response>
  actualizarFactura(data: {proyecto, id, datos: Object}): Promise<Response>
  estadisticas(data: {proyecto}): Promise<Response>
  exportarCSV(data: {proyecto, semana?}): Promise<Response>
  getPipelineMetrics(): Promise<Response>
}

CLASE FacturasModule HEREDA BaseModule IMPLEMENTA FacturasContract {
  ATRIBUTOS {
    name: String = 'facturas'
    version: String = '3.0.0'
    logger: Logger
    eventBus: EventBus
    uiHandler: UIRequestHandler
    metrics: Metrics
    services: ServiceExecutor
    pipeline: InvoicePipeline
    pipelineMetrics: PipelineMetrics
    config: {
      ocr: {provider, hint, languages},
      ai: {providers: Array, temperature, maxTokens},
      processing: {dpi, maxWidth, maxHeight, sharp},
      timeouts: {pdfConvert, sharp, ocr, ai, db}
    }
  }

  METODOS {
    async onLoad(context: EventCore): Promise<Void>
      INICIALIZA logger, eventBus, uiHandler, metrics FROM context
      CARGA config FROM context.moduleConfig
      services = new ServiceExecutor(eventBus, logger)
      pipeline = new InvoicePipeline({services, eventBus, logger, config})
      pipelineMetrics = new PipelineMetrics(metrics, logger)
      SUSCRIBE 'factura.entrada'
      logger.info('module.loaded', {module: name, version, pipeline: 'v2'})

    async onUnload(): Promise<Void>
      LIMPIA services, pipeline, pipelineMetrics
      logger.info('module.unloaded', {module: name})

    async onFacturaEntrada(event: Event): Promise<Void>
      data = _unwrap(event)
      {projectId, filePath, source, origen} = data
      SI !projectId O !filePath: LOG error, RETORNA
      SI !fs.exists(filePath):
        EMITE factura.error CON code: 'RESOURCE_NOT_FOUND'
        RETORNA
      EMITE factura.recibida
      result = await _procesarArchivo(filePath, projectId, {source, origen})
      SI result.success:
        EMITE factura.procesada
        SI source == 'telegram': _notifyTelegramResult(origen.botName, origen.chatId, result)
      SINO:
        EMITE factura.error

    async handleProcesar(data: {proyecto, filePath, source?, origen?}): Promise<Response>
      VALIDA proyecto, filePath obligatorios
      VALIDA filePath existe
      result = await _procesarArchivo(filePath, proyecto, {source, origen})
      status = result.success ? 200 : (result.duplicate ? 409 : 500)
      RETORNA {status, data: result}

    async handleSubir(data: {proyecto, archivo: {nombre, contenido}, source?}): Promise<Response>
      VALIDA proyecto, archivo.nombre, archivo.contenido obligatorios
      storageDir = join(cwd(), 'data/projects', proyecto, 'storage', 'pendientes')
      mkdir(storageDir, {recursive: true})
      timestamp = now()
      safeName = archivo.nombre.replace(/[^a-zA-Z0-9._-]/g, '_')
      filePath = join(storageDir, `{timestamp}_{safeName}`)
      buffer = Buffer.from(archivo.contenido, 'base64')
      writeFile(filePath, buffer)
      metrics.increment('facturas.subidas.total', {project_id: proyecto})
      result = await _procesarArchivo(filePath, proyecto, {source, origen: {manual: true, nombreOriginal: archivo.nombre}})
      status = result.success ? 201 : (result.duplicate ? 409 : 500)
      RETORNA {status, data: result}

    async handleReprocesar(data: {proyecto, id}): Promise<Response>
      VALIDA proyecto, id obligatorios
      factura = await services.call('local.facturas-db', 'obtener', {proyecto, id}, {timeout: config.timeouts.db})
      SI !factura: RETORNA 404 RESOURCE_NOT_FOUND
      SI !factura.path_original O !fs.exists(factura.path_original): RETORNA 404
      result = await _procesarArchivo(factura.path_original, proyecto, {source: factura.source, facturaId: id})
      RETORNA {status: result.success ? 200 : 500, data: result}

    async handleListar(data: {proyecto, estado?, desde?, hasta?, limit?}): Promise<Response>
      VALIDA proyecto obligatorio
      result = await services.call('local.facturas-db', 'listar', {proyecto, estado, desde, hasta, limit: limit || 100}, {timeout: config.timeouts.db})
      RETORNA {status: 200, data: result.data || result}

    async handleObtener(data: {proyecto, id}): Promise<Response>
      VALIDA proyecto, id obligatorios
      result = await services.call('local.facturas-db', 'obtener', {proyecto, id}, {timeout: config.timeouts.db})
      factura = result.data || result
      SI !factura: RETORNA 404 RESOURCE_NOT_FOUND
      RETORNA {status: 200, data: {factura}}

    async handleActualizar(data: {proyecto, id, datos}): Promise<Response>
      VALIDA proyecto, id, datos obligatorios
      result = await services.call('local.facturas-db', 'actualizar', {proyecto, id, campos: datos}, {timeout: config.timeouts.db})
      RETORNA {status: 200, data: result.data || result}

    async handleEstadisticas(data: {proyecto}): Promise<Response>
      VALIDA proyecto obligatorio
      result = await services.call('local.facturas-db', 'estadisticas', {proyecto}, {timeout: config.timeouts.db})
      stats = result.data || result
      RETORNA {status: 200, data: {
        total: stats.general?.total,
        pendientes: stats.general?.pendientes,
        procesadas: stats.general?.procesadas,
        errores: stats.general?.errores,
        exportadas: stats.general?.exportadas,
        porSource: stats.porSource
      }}

    async handleExportar(data: {proyecto, semana?}): Promise<Response>
      VALIDA proyecto obligatorio
      result = await services.call('local.facturas-db', 'exportar', {proyecto, semana}, {timeout: config.timeouts.db})
      exportData = result.data || result
      csvPath = await _generarCSV(proyecto, exportData.facturas)
      SI exportData.ids.length > 0:
        semanaExport = exportData.semana || _calcularSemanaISO()
        await services.call('local.facturas-db', 'marcarExportadas', {proyecto, ids: exportData.ids, semana: semanaExport})
      contenido = readFile(csvPath, {encoding: 'base64'})
      nombre = basename(csvPath)
      EMITE factura.exportada
      RETORNA {status: 200, data: {path: csvPath, nombre, contenido, mimeType: 'text/csv', total: exportData.total}}

    async handlePipelineMetrics(): Promise<Response>
      RETORNA {status: 200, data: pipelineMetrics.getDashboard()}

    async handleToolProcesar(args: {projectId, filePath, source?}): Promise<Response>
      VALIDA projectId, filePath obligatorios
      result = await _procesarArchivo(filePath, projectId, {source: source || 'manual'})
      RETORNA {status: result.success ? 200 : 500, data: result}

    async handleToolListar(args: {projectId}): Promise<Response>
      RETORNA handleListar({proyecto: args.projectId, ...args})

    async handleToolEstadisticas(args: {projectId}): Promise<Response>
      RETORNA handleEstadisticas({proyecto: args.projectId})

    async _procesarArchivo(filePath: String, projectId: String, options?: Object): Promise<ProcessResult>
      result = await pipeline.process(filePath, projectId, options)
      pipelineMetrics.record(result)
      RETORNA result

    async _generarCSV(projectId: String, facturas: Array): Promise<String>
      exportDir = join(cwd(), 'data/projects', projectId, 'storage', 'export')
      mkdir(exportDir, {recursive: true})
      headers = ['Fecha', 'Num_Factura', 'NIF_Emisor', 'Nombre_Emisor', 'NIF_Receptor', 'Nombre_Receptor', 'Descripcion', 'Base_Imponible', 'Tipo_IVA', 'Cuota_IVA', 'Tipo_RE', 'Cuota_RE', 'Total_Factura', 'Forma_Pago', 'Clave_Operacion']
      BOM = '﻿'
      csv = BOM + headers.join(';') + '\n'
      PARA cada f EN facturas:
        nif = f['NIF Proveedor'] || ''
        total = parseFloat(f['Total'] || 0)
        claveOp = (!nif O (total < 400 Y !f['NIF Receptor'])) ? 'F2' : 'F1'
        row = [f['Fecha Factura'], f['Nº Factura'], nif, f['Proveedor'], '', '', f['Concepto'], f['Base Imponible'], f['% IVA'], f['Cuota IVA'], 0, 0, total, '', claveOp]
        csv += row.map(v => _escapeCsv(v)).join(';') + '\n'
      fecha = now().toISOString().slice(0, 10).replace(/-/g, '')
      csvPath = join(exportDir, `facturas_{fecha}.csv`)
      writeFile(csvPath, csv, 'utf-8')
      RETORNA csvPath

    _notifyTelegramResult(botName: String, chatId: String, result: Object): Void
      text = ''
      SI result.duplicate:
        text = '⚠️ <b>Factura duplicada</b>\nYa existe en el sistema.'
      SI result.success:
        e = result.estructura || {}
        proveedor = e.emisor?.nombre || 'Proveedor desconocido'
        total = e.totales?.total_factura
        numero = e.factura?.numero
        fecha = e.factura?.fecha
        text = `✅ <b>Factura procesada</b>\n\n📋 <b>{proveedor}</b>\n` + (numero ? `🔢 Nº: <code>{numero}</code>\n` : '') + (fecha ? `📅 {fecha}\n` : '') + (total ? `💰 {total} €\n` : '') + `\n⏱ {(result.metrics.totalDuration / 1000).toFixed(1)}s`
      SINO:
        text = `❌ <b>Error procesando factura</b>\n<code>{result.error || 'Error desconocido'}</code>`
      PUBLICA telegram.send_message.request CON {request_id, botName, chatId, text, parseMode: 'HTML'}

    async _publicarEvento(name: String, payload: Object, sourcePayload?: Object): Promise<Object>
      enriched = {
        correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
        project_id: sourcePayload?.project_id || sourcePayload?.projectId || payload.project_id || DEFAULT_PROJECT_ID,
        timestamp: now().toISOString(),
        ...payload
      }
      await eventBus.publish(name, enriched)
      RETORNA enriched

    _escapeCsv(value: Any): String
      str = String(value)
      SI str.includes(';') O str.includes('"') O str.includes('\n'):
        RETORNA '"' + str.replace(/"/g, '""') + '"'
      RETORNA str

    _calcularSemanaISO(fecha?: Date): String
      d = new Date(fecha || now())
      d.setHours(0, 0, 0, 0)
      d.setDate(d.getDate() + 4 - (d.getDay() || 7))
      yearStart = new Date(d.getFullYear(), 0, 1)
      weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
      RETORNA `{d.getFullYear()}-W{String(weekNo).padStart(2, '0')}`

    _errorResponse(status: Integer, code: String, message: String, details?: Object): Object
      error = {code, message}
      SI details: error.details = details
      RETORNA {status, error}

    _handleHandlerError(logEvent: String, err: Error, kind: String): Object
      code = err._code || _classifyHandlerError(err)
      status = code == 'INVALID_INPUT' ? 400 : code == 'RESOURCE_NOT_FOUND' ? 404 : code == 'PERMISSION_DENIED' ? 403 : code == 'AUTHENTICATION_REQUIRED' ? 401 : code == 'ALREADY_EXISTS' ? 409 : code == 'CONFLICT_STATE' ? 409 : code == 'UPSTREAM_TIMEOUT' ? 504 : code == 'UPSTREAM_INVALID_RESPONSE' ? 502 : code == 'UPSTREAM_UNREACHABLE' ? 503 : 500
      logger.error(logEvent, {error: err.message, code, kind})
      metrics.increment('facturas.errors', {kind, code})
      RETORNA _errorResponse(status, code, err.message, err._details)

    _classifyHandlerError(err: Error): String
      msg = (err.message || '').toLowerCase()
      ecod = err.code || ''
      SI ecod == 'ENOENT' O msg.includes('not found') O msg.includes('no encontrad'): RETORNA 'RESOURCE_NOT_FOUND'
      SI ecod == 'EACCES' O msg.includes('permission') O msg.includes('forbidden'): RETORNA 'PERMISSION_DENIED'
      SI ecod == 'EEXIST' O msg.includes('already exists'): RETORNA 'ALREADY_EXISTS'
      SI msg.includes('timeout'): RETORNA 'UPSTREAM_TIMEOUT'
      SI msg.includes('required') O msg.includes('invalid') O msg.includes('validation'): RETORNA 'INVALID_INPUT'
      SI ecod Y ecod.startsWith('E'): RETORNA 'UNKNOWN_ERROR'
      RETORNA 'UNKNOWN_ERROR'

    _unwrap(event: Event): Object
      RETORNA event.data || event.payload || event || {}

    _logError(logEvent: String, fields: Object, kind: String, code: String): Void
      logger.error(logEvent, {...fields, code, kind})
      metrics.increment('facturas.errors', {kind, code})

    EVENTOS_SUBSCRIBES {
      'factura.entrada': onFacturaEntrada
    }

    EVENTOS_PUBLISHES {
      'factura.recibida': {project_id, file_path, source}
      'factura.procesada': {project_id, file_path, factura_id, duplicate, source}
      'factura.error': {project_id, file_path, source, code, message}
      'factura.exportada': {project_id, total, archivo}
      'telegram.send_message.request': {request_id, botName, chatId, text, parseMode}
    }
  }
}

CLASE ProcessResult {
  ATRIBUTOS {
    success: Boolean
    facturaId: String|Null
    duplicate: Boolean
    error: String|Null
    estructura: Object|Null (formato canonico OCR+AI)
    metrics: {
      totalDuration: Integer,
      steps: {intake, convert, prepare, ocr, ai_structure, validate, store}
    }
  }
}
```
