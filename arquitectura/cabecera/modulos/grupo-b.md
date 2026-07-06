---
id: modulos/grupo-b
dominio: modulos
resumen: notificador-pedidos (multicanal con retry), pase-cocina (flujo pedidos→cocina), pdf-viewer.
fuentes:
  - modules/pizzepos/notificador-pedidos/**
  - modules/pase-cocina/**
  - modules/pdf-viewer/**
verificado: 2026-07-06
---

# GRUPO B — notificador-pedidos, pase-cocina, pdf-viewer

```
INTERFAZ NotificadorPedidosContract {
  enviarNotificacion(data: {cuenta_id, tipo, canal?, mensaje?, metadata?}): Promise<{notification_id, status}>
  getNotificacionesCuenta(cuenta_id: String, limit?: Integer): Promise<Array<Notificacion>>
  marcarComoLeida(notification_id: String): Promise<Void>
  configurarCanal(data: {cuenta_id, canal, habilitado, preferencias?}): Promise<Void>
}

CLASE NotificadorPedidosModule HEREDA BaseModule IMPLEMENTA NotificadorPedidosContract {
  ATRIBUTOS {
    name: String = 'notificador-pedidos'
    version: String = '3.0.0'
    config: {canales: {telegram, whatsapp, sms, email}, retry_max, retry_backoff_ms, notification_ttl_hours}
    notificaciones: Map<notification_id, Notificacion>
    cuentaCanales: Map<cuenta_id, {telegram?, whatsapp?, sms?, email?}>
    colasReintento: Map<canal, Array<{notification_id, retries_left, proxima_tentativa}>>
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    _retryTimers: Map<notification_id, NodeJS.Timeout>
    internalMetrics: {enviadas_total, exitosas_total, fallidas_total, reintentos_total}
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus FROM core
      CARGA config FROM core.config['notificador-pedidos'] || DEFAULT_CONFIG
      SUSCRIBE pedido.listo, pedido.cancelado, cuenta.estado_cambiado
      logger.info('notificador-pedidos.loaded', {canales: Object.keys(config.canales)})

    async onUnload(): Promise<Void>
      _retryTimers.values().forEach(t => clearTimeout(t))
      _retryTimers.clear()
      notificaciones.clear()
      cuentaCanales.clear()
      colasReintento.clear()

    async onPedidoListo(event: Event): Promise<Void>
      {cuenta_id, pedido_id, duracion_minutos} = event.data || event
      await handleEnviarNotificacion({cuenta_id, tipo: 'pedido_listo', metadata: {pedido_id, duracion_minutos}})

    async onPedidoCancelado(event: Event): Promise<Void>
      {cuenta_id, pedido_id, motivo} = event.data || event
      await handleEnviarNotificacion({cuenta_id, tipo: 'pedido_cancelado', metadata: {pedido_id, motivo}})

    async onCuentaEstadoCambiado(event: Event): Promise<Void>
      {cuenta_id, estado_anterior, estado_nuevo} = event.data || event
      SI estado_nuevo == 'en_preparacion':
        await handleEnviarNotificacion({cuenta_id, tipo: 'pedido_preparacion', metadata: {estado_nuevo}})

    async handleEnviarNotificacion(data: {cuenta_id, tipo, canal?, mensaje?, metadata?}): Promise<Response>
      TRY:
        VALIDA cuenta_id, tipo
        notification_id = crypto.randomUUID()
        canalesConfigurables = cuentaCanales.get(data.cuenta_id) || {}
        canalesActivos = data.canal ? [data.canal] : Object.keys(config.canales).filter(c => canalesConfigurables[c]?.habilitado)
        SI canalesActivos.length == 0:
          RETORNA {status: 400, error: {code: 'NO_CHANNELS_ENABLED', message: 'No active notification channels for account'}}
        notificacion = {
          notification_id,
          cuenta_id: data.cuenta_id,
          tipo: data.tipo,
          mensaje: data.mensaje || _buildMensajeDefault(data.tipo, data.metadata),
          canales: canalesActivos,
          metadata: data.metadata,
          estado: 'enviando',
          created_at: now().toISOString(),
          intentos: {}
        }
        notificaciones.set(notification_id, notificacion)
        internalMetrics.enviadas_total++
        EMITE notificador.notificacion_iniciada {notification_id, cuenta_id, tipo: data.tipo, canales: canalesActivos}
        PARA cada canal EN canalesActivos:
          await _enviarPorCanal(notification_id, canal)
        RETORNA {status: 202, data: {notification_id, status: 'enviando', canales: canalesActivos}}
      CATCH err:
        RETORNA _handleHandlerError('notificador-pedidos.enviar.failed', err, 'enviar_notificacion')

    async _enviarPorCanal(notification_id: String, canal: String): Promise<Void>
      notif = notificaciones.get(notification_id)
      SI !notif: RETORNA
      TRY:
        config_canal = config.canales[canal]
        SI !config_canal: RETORNA
        EMITE notificador.{canal}.enviar_solicitud {notification_id, cuenta_id: notif.cuenta_id, mensaje: notif.mensaje, metadata: notif.metadata}
        _setRetryTimer(notification_id, canal, 0)
      CATCH err:
        logger.error('notificador-pedidos.{canal}.error', {notification_id, error: err.message})
        notif.intentos[canal] = {status: 'error', error: err.message}
        _checkNotificacionCompleta(notification_id)

    async onCanalRespuesta(event: Event): Promise<Void>
      {notification_id, canal, success, error} = event.data || event
      notif = notificaciones.get(notification_id)
      SI !notif: RETORNA
      clearTimeout(_retryTimers.get(`{notification_id}_{canal}`))
      _retryTimers.delete(`{notification_id}_{canal}`)
      SI success:
        notif.intentos[canal] = {status: 'exitoso', timestamp: now()}
        internalMetrics.exitosas_total++
      SINO:
        SI !notif.intentos[canal]: notif.intentos[canal] = {retries: 0}
        notif.intentos[canal].retries = (notif.intentos[canal].retries || 0) + 1
        SI notif.intentos[canal].retries < config.retry_max:
          backoff = Math.pow(2, notif.intentos[canal].retries) * config.retry_backoff_ms
          _setRetryTimer(notification_id, canal, notif.intentos[canal].retries)
          internalMetrics.reintentos_total++
        SINO:
          notif.intentos[canal] = {status: 'falló', error, intentos: config.retry_max}
          internalMetrics.fallidas_total++
      _checkNotificacionCompleta(notification_id)

    _setRetryTimer(notification_id: String, canal: String, intento: Integer): Void
      backoff = Math.pow(2, intento) * config.retry_backoff_ms
      timerId = `{notification_id}_{canal}`
      timer = setTimeout(async () => {
        await _enviarPorCanal(notification_id, canal)
      }, backoff)
      _retryTimers.set(timerId, timer)

    _checkNotificacionCompleta(notification_id: String): Void
      notif = notificaciones.get(notification_id)
      SI !notif: RETORNA
      completada = notif.canales.every(c => notif.intentos[c])
      SI completada:
        exitosos = notif.canales.filter(c => notif.intentos[c].status == 'exitoso').length
        notif.estado = exitosos > 0 ? 'enviada' : 'fallida'
        EMITE notificador.notificacion_completada {notification_id, estado: notif.estado, exitosos, totales: notif.canales.length}

    async handleGetNotificacionesCuenta(data: {cuenta_id, limit?}): Promise<Response>
      TRY:
        VALIDA cuenta_id
        limit = parseInt(data.limit) || 20
        notifs = Array.from(notificaciones.values()).filter(n => n.cuenta_id == data.cuenta_id).slice(0, limit)
        RETORNA {status: 200, data: {cuenta_id: data.cuenta_id, notificaciones: notifs, count: notifs.length}}
      CATCH err:
        RETORNA _handleHandlerError('notificador-pedidos.get.failed', err, 'get_notificaciones')

    async handleMarcarComoLeida(data: {notification_id}): Promise<Response>
      TRY:
        VALIDA notification_id
        notif = notificaciones.get(data.notification_id)
        SI !notif: RETORNA 404 RESOURCE_NOT_FOUND
        notif.leida = true
        notif.leida_at = now().toISOString()
        EMITE notificador.notificacion_leida {notification_id: data.notification_id}
        RETORNA {status: 200, data: {notification_id: data.notification_id, leida: true}}
      CATCH err:
        RETORNA _handleHandlerError('notificador-pedidos.marcar.failed', err, 'marcar_leida')

    async handleConfigurarCanal(data: {cuenta_id, canal, habilitado, preferencias?}): Promise<Response>
      TRY:
        VALIDA cuenta_id, canal, habilitado
        SI !config.canales[data.canal]: RETORNA 400 INVALID_INPUT
        SI !cuentaCanales.has(data.cuenta_id):
          cuentaCanales.set(data.cuenta_id, {})
        config_actual = cuentaCanales.get(data.cuenta_id)
        config_actual[data.canal] = {habilitado: data.habilitado, preferencias: data.preferencias || {}}
        EMITE notificador.canal_configurado {cuenta_id: data.cuenta_id, canal: data.canal, habilitado: data.habilitado}
        RETORNA {status: 200, data: {cuenta_id: data.cuenta_id, canal: data.canal, configurado: true}}
      CATCH err:
        RETORNA _handleHandlerError('notificador-pedidos.config.failed', err, 'configurar_canal')

    _buildMensajeDefault(tipo: String, metadata?: Object): String
      SI tipo == 'pedido_listo': RETORNA `Tu pedido está listo${metadata?.duracion_minutos ? ` ({metadata.duracion_minutos} min)` : ''}`
      SI tipo == 'pedido_cancelado': RETORNA `Tu pedido ha sido cancelado${metadata?.motivo ? `: {metadata.motivo}` : ''}`
      SI tipo == 'pedido_preparacion': RETORNA `Tu pedido está en preparación`
      RETORNA `Nueva notificación`

    _handleHandlerError(logEvent: String, err: Error, kind: String): Object
      code = err._code || 'UNKNOWN_ERROR'
      status = code == 'INVALID_INPUT' ? 400 : code == 'RESOURCE_NOT_FOUND' ? 404 : code == 'NO_CHANNELS_ENABLED' ? 400 : 500
      logger.error(logEvent, {error: err.message, code, kind})
      metrics?.increment('notificador-pedidos.errors', {kind, code})
      RETORNA {status, error: {code, message: err.message}}

    EVENTOS_PUBLISHES {
      'notificador.notificacion_iniciada': {notification_id, cuenta_id, tipo, canales}
      'notificador.{canal}.enviar_solicitud': {notification_id, cuenta_id, mensaje, metadata}
      'notificador.notificacion_completada': {notification_id, estado, exitosos, totales}
      'notificador.notificacion_leida': {notification_id}
      'notificador.canal_configurado': {cuenta_id, canal, habilitado}
    }

    EVENTOS_SUBSCRIBES {
      'pedido.listo': onPedidoListo
      'pedido.cancelado': onPedidoCancelado
      'cuenta.estado_cambiado': onCuentaEstadoCambiado
      'notificador.{canal}.respuesta': onCanalRespuesta
    }
  }
}

CLASE Notificacion {
  ATRIBUTOS {
    notification_id: String
    cuenta_id: String
    tipo: String
    mensaje: String
    canales: Array<String>
    metadata: Object|Null
    estado: String (enviando|enviada|fallida)
    leida: Boolean
    leida_at: String|Null (ISO)
    intentos: Map<canal, {status, error?, retries?, timestamp?}>
    created_at: String (ISO)
  }
}
```

## PASE-COCINA (v2.0.0) — Control de Flujo Pedidos → Cocina

```
INTERFAZ PaseCocinaContract {
  registrarPase(data: {pedido_id, numero_pase, seccion?, prioridad?}): Promise<{pase_id, numero}>
  actualizarEstado(pase_id: String, estado: String): Promise<Void>
  listarPasesActivos(filtro?: {seccion?, prioridad?}): Promise<Array<Pase>>
  completarPase(pase_id: String): Promise<Void>
  getPasesPorPedido(pedido_id: String): Promise<Array<Pase>>
}

CLASE PaseCocinaModule HEREDA BaseModule IMPLEMENTA PaseCocinaContract {
  ATRIBUTOS {
    name: String = 'pase-cocina'
    version: String = '2.0.0'
    config: {secciones: Array<String>, prioridades: Array<String>, auto_complete_timeout_ms}
    pases: Map<pase_id, Pase>
    pasesPorPedido: Map<pedido_id, Array<pase_id>>
    contadorSeccion: Map<seccion, Integer>
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    _autoCompleteTimers: Map<pase_id, NodeJS.Timeout>
    internalMetrics: {registrados_total, completados_total, cancelados_total, tiempo_promedio_ms}
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus FROM core
      CARGA config FROM core.config['pase-cocina'] || DEFAULT_CONFIG
      config.secciones = config.secciones || ['preparacion', 'horno', 'finalizado']
      SUSCRIBE comandero.enviar_cocina, pedido.cancelado, cocina.item_preparado
      logger.info('pase-cocina.loaded', {secciones: config.secciones.length})

    async onUnload(): Promise<Void>
      _autoCompleteTimers.values().forEach(t => clearTimeout(t))
      _autoCompleteTimers.clear()
      pases.clear()
      pasesPorPedido.clear()
      contadorSeccion.clear()

    async onComanderoEnviarCocina(event: Event): Promise<Void>
      {pedido_id, items, total, cuenta_id} = event.data || event
      PARA cada item EN items:
        await handleRegistrarPase({pedido_id, numero_pase: item.id, seccion: 'preparacion', prioridad: _determinePrioridad(total)})

    async onCocinaItemPreparado(event: Event): Promise<Void>
      {item_id, pedido_id} = event.data || event
      pase = Array.from(pases.values()).find(p => p.pedido_id == pedido_id Y p.item_id == item_id)
      SI pase: await handleActualizarEstado({pase_id: pase.pase_id, estado: 'preparado'})

    async onPedidoCancelado(event: Event): Promise<Void>
      {pedido_id} = event.data || event
      pase_ids = pasesPorPedido.get(pedido_id) || []
      PARA cada pase_id EN pase_ids:
        pase = pases.get(pase_id)
        SI pase Y pase.estado != 'completado':
          pase.estado = 'cancelado'
          clearTimeout(_autoCompleteTimers.get(pase_id))
          _autoCompleteTimers.delete(pase_id)
          EMITE pase_cocina.cancelado {pase_id, pedido_id}
          internalMetrics.cancelados_total++

    async handleRegistrarPase(data: {pedido_id, numero_pase, seccion?, prioridad?}): Promise<Response>
      TRY:
        VALIDA pedido_id, numero_pase
        pase_id = crypto.randomUUID()
        seccion = data.seccion || 'preparacion'
        prioridad = data.prioridad || 'normal'
        VALIDA seccion EN config.secciones
        numero_pase_final = _generarNumeroPase(seccion)
        pase = {
          pase_id,
          pedido_id: data.pedido_id,
          numero_pase: numero_pase_final,
          seccion,
          prioridad,
          estado: 'pendiente',
          item_id: data.numero_pase,
          created_at: now().toISOString(),
          started_at: Null,
          completed_at: Null
        }
        pases.set(pase_id, pase)
        SI !pasesPorPedido.has(data.pedido_id):
          pasesPorPedido.set(data.pedido_id, [])
        pasesPorPedido.get(data.pedido_id).push(pase_id)
        internalMetrics.registrados_total++
        metrics?.increment('pase_cocina.registrado', {seccion, prioridad})
        EMITE pase_cocina.registrado {pase_id, pedido_id: data.pedido_id, numero_pase: numero_pase_final, seccion}
        _setAutoCompleteTimer(pase_id, config.auto_complete_timeout_ms)
        RETORNA {status: 201, data: {pase_id, numero: numero_pase_final, seccion}}
      CATCH err:
        RETORNA _handleHandlerError('pase-cocina.registrar.failed', err, 'registrar')

    async handleActualizarEstado(data: {pase_id, estado}): Promise<Response>
      TRY:
        VALIDA pase_id, estado
        pase = pases.get(data.pase_id)
        SI !pase: RETORNA 404 RESOURCE_NOT_FOUND
        estado_anterior = pase.estado
        pase.estado = data.estado
        SI data.estado == 'en_preparacion': pase.started_at = now().toISOString()
        SI data.estado == 'completado':
          pase.completed_at = now().toISOString()
          duracion = pase.completed_at - pase.created_at
          internalMetrics.completados_total++
          internalMetrics.tiempo_promedio_ms = (internalMetrics.tiempo_promedio_ms + duracion) / 2
          clearTimeout(_autoCompleteTimers.get(data.pase_id))
          _autoCompleteTimers.delete(data.pase_id)
        EMITE pase_cocina.estado_actualizado {pase_id: data.pase_id, estado: data.estado, estado_anterior}
        RETORNA {status: 200, data: {pase_id: data.pase_id, estado: data.estado}}
      CATCH err:
        RETORNA _handleHandlerError('pase-cocina.actualizar.failed', err, 'actualizar')

    async handleListarPasesActivos(data: {seccion?, prioridad?}): Promise<Response>
      TRY:
        pases_lista = Array.from(pases.values()).filter(p => p.estado != 'completado' Y p.estado != 'cancelado')
        SI data.seccion: FILTRA pases_lista POR seccion
        SI data.prioridad: FILTRA pases_lista POR prioridad
        ORDENA POR prioridad Y created_at
        RETORNA {status: 200, data: {pases: pases_lista, total: pases_lista.length}}
      CATCH err:
        RETORNA _handleHandlerError('pase-cocina.listar.failed', err, 'listar')

    async handleCompletarPase(data: {pase_id}): Promise<Response>
      TRY:
        VALIDA pase_id
        RETORNA handleActualizarEstado({pase_id: data.pase_id, estado: 'completado'})
      CATCH err:
        RETORNA _handleHandlerError('pase-cocina.completar.failed', err, 'completar')

    async handleGetPasesPorPedido(data: {pedido_id}): Promise<Response>
      TRY:
        VALIDA pedido_id
        pase_ids = pasesPorPedido.get(data.pedido_id) || []
        pases_lista = pase_ids.map(id => pases.get(id))
        RETORNA {status: 200, data: {pedido_id: data.pedido_id, pases: pases_lista, total: pases_lista.length}}
      CATCH err:
        RETORNA _handleHandlerError('pase-cocina.get_by_pedido.failed', err, 'get_by_pedido')

    _determinePrioridad(total: Number): String
      SI total > 50: RETORNA 'alta'
      SI total > 30: RETORNA 'media'
      RETORNA 'normal'

    _generarNumeroPase(seccion: String): String
      SI !contadorSeccion.has(seccion): contadorSeccion.set(seccion, 0)
      numero = contadorSeccion.get(seccion) + 1
      contadorSeccion.set(seccion, numero)
      prefijo = seccion.charAt(0).toUpperCase()
      RETORNA `{prefijo}{String(numero).padStart(3, '0')}`

    _setAutoCompleteTimer(pase_id: String, timeout_ms: Integer): Void
      timer = setTimeout(() => {
        pase = pases.get(pase_id)
        SI pase Y pase.estado == 'en_preparacion':
          pase.estado = 'completado'
          pase.completed_at = now().toISOString()
          EMITE pase_cocina.auto_completado {pase_id}
      }, timeout_ms)
      _autoCompleteTimers.set(pase_id, timer)

    _handleHandlerError(logEvent: String, err: Error, kind: String): Object
      code = err._code || 'UNKNOWN_ERROR'
      status = code == 'INVALID_INPUT' ? 400 : code == 'RESOURCE_NOT_FOUND' ? 404 : 500
      logger.error(logEvent, {error: err.message, kind})
      metrics?.increment('pase-cocina.errors', {kind})
      RETORNA {status, error: {code, message: err.message}}

    EVENTOS_PUBLISHES {
      'pase_cocina.registrado': {pase_id, pedido_id, numero_pase, seccion}
      'pase_cocina.estado_actualizado': {pase_id, estado, estado_anterior}
      'pase_cocina.cancelado': {pase_id, pedido_id}
      'pase_cocina.auto_completado': {pase_id}
    }

    EVENTOS_SUBSCRIBES {
      'comandero.enviar_cocina': onComanderoEnviarCocina
      'pedido.cancelado': onPedidoCancelado
      'cocina.item_preparado': onCocinaItemPreparado
    }
  }
}

CLASE Pase {
  ATRIBUTOS {
    pase_id: String
    pedido_id: String
    numero_pase: String
    seccion: String
    prioridad: String
    estado: String (pendiente|en_preparacion|preparado|completado|cancelado)
    item_id: String
    created_at: String (ISO)
    started_at: String|Null (ISO)
    completed_at: String|Null (ISO)
  }
}
```

## PDF-VIEWER (v2.0.0) — Renderizado de PDFs Interactivo

```
INTERFAZ PDFViewerContract {
  uploadPDF(data: {archivo, nombre?, metadata?}): Promise<{pdf_id, pages, size}>
  renderPage(pdf_id: String, page: Integer, opciones?: {zoom?, formato?}): Promise<{image, metadatos}>
  extractText(pdf_id: String, page?: Integer): Promise<{texto, paginas}>
  getMetadata(pdf_id: String): Promise<Object>
  deletePDF(pdf_id: String): Promise<Void>
  listPDFs(limit?: Integer): Promise<Array<PDFMetadata>>
}

CLASE PDFViewerModule HEREDA BaseModule IMPLEMENTA PDFViewerContract {
  ATRIBUTOS {
    name: String = 'pdf-viewer'
    version: String = '2.0.0'
    config: {storage_path, max_file_size_mb, supported_formats, render_timeout_ms, cache_enabled, cache_ttl_hours}
    pdfs: Map<pdf_id, PDFMetadata>
    renderCache: Map<cacheKey, {image, expiresAt}>
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    _pdfEngine: PDFEngine
    internalMetrics: {uploaded_total, rendered_total, extracted_total, errors_total}
  }

  METODOS {
    async onLoad(core: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus FROM core
      CARGA config FROM core.config['pdf-viewer'] || DEFAULT_CONFIG
      config.storage_path = path.resolve(config.storage_path || './data/pdfs')
      ENSURA_DIR(config.storage_path)
      _pdfEngine = new PDFEngine({logger, timeout_ms: config.render_timeout_ms})
      logger.info('pdf-viewer.loaded', {storage_path: config.storage_path})

    async onUnload(): Promise<Void>
      await _pdfEngine?.shutdown()
      pdfs.clear()
      renderCache.clear()

    async handleUploadPDF(data: {archivo, nombre?, metadata?}): Promise<Response>
      TRY:
        VALIDA archivo obligatorio
        VALIDA archivo.size <= config.max_file_size_mb * 1024 * 1024
        extension = path.extname(archivo.name).toLowerCase().slice(1)
        SI !config.supported_formats.includes(extension):
          RETORNA 400 INVALID_INPUT
        pdf_id = crypto.randomUUID()
        filename = `{pdf_id}.{extension}`
        filepath = path.join(config.storage_path, filename)
        ESCRIBE archivo.data A filepath
        metadata_pdf = await _pdfEngine.getMetadata(filepath)
        pdfData = {
          pdf_id,
          nombre: data.nombre || archivo.name,
          filepath,
          tamaño_bytes: archivo.size,
          paginas: metadata_pdf.pages,
          titulo: metadata_pdf.title || Null,
          autor: metadata_pdf.author || Null,
          created_at: now().toISOString(),
          metadata: data.metadata || {}
        }
        pdfs.set(pdf_id, pdfData)
        internalMetrics.uploaded_total++
        metrics?.increment('pdf-viewer.uploaded')
        EMITE pdf_viewer.pdf_subido {pdf_id, nombre: data.nombre, paginas: metadata_pdf.pages}
        RETORNA {status: 201, data: {pdf_id, pages: metadata_pdf.pages, size: archivo.size}}
      CATCH err:
        RETORNA _handleHandlerError('pdf-viewer.upload.failed', err, 'upload')

    async handleRenderPage(data: {pdf_id, page, zoom?, formato?}): Promise<Response>
      TRY:
        VALIDA pdf_id, page
        page = parseInt(data.page)
        SI page < 1: RETORNA 400 INVALID_INPUT
        pdfData = pdfs.get(data.pdf_id)
        SI !pdfData: RETORNA 404 RESOURCE_NOT_FOUND
        SI page > pdfData.paginas: RETORNA 400 INVALID_INPUT
        zoom = parseFloat(data.zoom) || 100
        formato = data.formato || 'png'
        cacheKey = `{data.pdf_id}_{page}_{zoom}_{formato}`
        cached = _getCacheEntry(cacheKey)
        SI cached: RETORNA {status: 200, data: {image: cached, formato, page}}
        image = await _pdfEngine.renderPage(pdfData.filepath, page, {zoom, formato})
        SI config.cache_enabled:
          _setCacheEntry(cacheKey, image, config.cache_ttl_hours * 60 * 60 * 1000)
        internalMetrics.rendered_total++
        metrics?.increment('pdf-viewer.rendered', {formato})
        EMITE pdf_viewer.pagina_renderizada {pdf_id: data.pdf_id, page, formato}
        RETORNA {status: 200, data: {image: image.toString('base64'), formato, page}}
      CATCH err:
        RETORNA _handleHandlerError('pdf-viewer.render.failed', err, 'render')

    async handleExtractText(data: {pdf_id, page?}): Promise<Response>
      TRY:
        VALIDA pdf_id
        pdfData = pdfs.get(data.pdf_id)
        SI !pdfData: RETORNA 404 RESOURCE_NOT_FOUND
        text = await _pdfEngine.extractText(pdfData.filepath, data.page)
        internalMetrics.extracted_total++
        metrics?.increment('pdf-viewer.extracted')
        EMITE pdf_viewer.texto_extraido {pdf_id: data.pdf_id, paginas: data.page ? 1 : pdfData.paginas}
        RETORNA {status: 200, data: {texto: text, paginas: data.page ? 1 : pdfData.paginas}}
      CATCH err:
        RETORNA _handleHandlerError('pdf-viewer.extract.failed', err, 'extract')

    async handleGetMetadata(data: {pdf_id}): Promise<Response>
      TRY:
        VALIDA pdf_id
        pdfData = pdfs.get(data.pdf_id)
        SI !pdfData: RETORNA 404 RESOURCE_NOT_FOUND
        RETORNA {status: 200, data: {pdf_id: data.pdf_id, nombre: pdfData.nombre, paginas: pdfData.paginas, tamaño: pdfData.tamaño_bytes, created_at: pdfData.created_at, titulo: pdfData.titulo, autor: pdfData.autor}}
      CATCH err:
        RETORNA _handleHandlerError('pdf-viewer.metadata.failed', err, 'metadata')

    async handleDeletePDF(data: {pdf_id}): Promise<Response>
      TRY:
        VALIDA pdf_id
        pdfData = pdfs.get(data.pdf_id)
        SI !pdfData: RETORNA 404 RESOURCE_NOT_FOUND
        ELIMINA pdfData.filepath SI EXISTS
        pdfs.delete(data.pdf_id)
        LIMPIA renderCache PARA pdf_id
        metrics?.increment('pdf-viewer.deleted')
        EMITE pdf_viewer.pdf_eliminado {pdf_id: data.pdf_id}
        RETORNA {status: 200, data: {pdf_id: data.pdf_id, eliminado: true}}
      CATCH err:
        RETORNA _handleHandlerError('pdf-viewer.delete.failed', err, 'delete')

    async handleListPDFs(data: {limit?}): Promise<Response>
      TRY:
        limit = parseInt(data.limit) || 50
        lista = Array.from(pdfs.values()).slice(0, limit)
        RETORNA {status: 200, data: {pdfs: lista, total: lista.length}}
      CATCH err:
        RETORNA _handleHandlerError('pdf-viewer.list.failed', err, 'list')

    _getCacheEntry(key: String): Buffer|Null
      entry = renderCache.get(key)
      SI !entry: RETORNA null
      SI now() > entry.expiresAt:
        renderCache.delete(key)
        RETORNA null
      RETORNA entry.image

    _setCacheEntry(key: String, image: Buffer, ttl_ms: Integer): Void
      expiresAt = now() + ttl_ms
      renderCache.set(key, {image, expiresAt})
      SI renderCache.size > 100:
        oldestKey = Array.from(renderCache.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0][0]
        renderCache.delete(oldestKey)

    _handleHandlerError(logEvent: String, err: Error, kind: String): Object
      code = err._code || _classifyError(err)
      status = code == 'INVALID_INPUT' ? 400 : code == 'RESOURCE_NOT_FOUND' ? 404 : code == 'UPSTREAM_TIMEOUT' ? 504 : 500
      logger.error(logEvent, {error: err.message, kind, code})
      metrics?.increment('pdf-viewer.errors', {kind, code})
      internalMetrics.errors_total++
      RETORNA {status, error: {code, message: err.message}}

    _classifyError(err: Error): String
      msg = (err.message || '').toLowerCase()
      SI msg.includes('timeout'): RETORNA 'UPSTREAM_TIMEOUT'
      SI msg.includes('invalid') O msg.includes('corrupt'): RETORNA 'INVALID_INPUT'
      SI msg.includes('not found'): RETORNA 'RESOURCE_NOT_FOUND'
      RETORNA 'UNKNOWN_ERROR'

    EVENTOS_PUBLISHES {
      'pdf_viewer.pdf_subido': {pdf_id, nombre, paginas}
      'pdf_viewer.pagina_renderizada': {pdf_id, page, formato}
      'pdf_viewer.texto_extraido': {pdf_id, paginas}
      'pdf_viewer.pdf_eliminado': {pdf_id}
    }

    EVENTOS_SUBSCRIBES {
      (ninguno)
    }
  }
}

CLASE PDFMetadata {
  ATRIBUTOS {
    pdf_id: String
    nombre: String
    filepath: String
    tamaño_bytes: Integer
    paginas: Integer
    titulo: String|Null
    autor: String|Null
    created_at: String (ISO)
    metadata: Object
  }
}

CLASE PDFEngine {
  ATRIBUTOS {
    logger: Logger
    timeout_ms: Integer
  }

  METODOS {
    async getMetadata(filepath: String): Promise<{pages, title?, author?}>
      UTILIZA library pdf-parse O pdfjs-dist
      EXTRAE metadatos
      RETORNA {pages, title, author}

    async renderPage(filepath: String, page: Integer, opciones: {zoom, formato}): Promise<Buffer>
      UTILIZA pdf-render (Sharp + pdftoppm o similar)
      RENDERIZA página CON zoom
      RETORNA imagen EN formato PNG/JPG

    async extractText(filepath: String, page?: Integer): Promise<String>
      UTILIZA pdfjs-dist o pdf-text-extract
      EXTRAE texto
      RETORNA string combinado

    async shutdown(): Promise<Void>
      LIMPIA resources
  }
}
```

https://claude.ai/code/session_019C4pks5RDdscuKPqVdTWRF
