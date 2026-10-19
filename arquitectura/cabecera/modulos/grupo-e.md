---
id: modulos/grupo-e
dominio: modulos
resumen: telegram-service (bots polling/webhook), text-editor, tienda-api, whatsapp-bot (Cloud API).
fuentes:
  - modules/telegram-service/**
  - modules/text-editor/**
  - modules/pizzepos/tienda-api/**
verificado: 2026-07-06
---

# GRUPO E — TELEGRAM-SERVICE, TEXT-EDITOR, TIENDA-API, WHATSAPP-BOT

## TELEGRAM-SERVICE (v2.0.0) — Gestión de Bots Telegram

```
INTERFAZ TelegramServiceContract {
  registerBot(data: {botName, apiToken, webhook?, description?}): Promise<{registered, botId}>
  unregisterBot(botName: String): Promise<Void>
  sendMessage(data: {botName, chatId, text, parseMode?, replyToMessageId?}): Promise<{messageId, sent}>
  sendFile(data: {botName, chatId, fileType, fileName, content}): Promise<{fileId, sent}>
  getBotInfo(botName: String): Promise<BotInfo>
  listBots(): Promise<Array<BotInfo>>
  handleWebhook(data: {botName, update}): Promise<Void>
}

CLASE TelegramServiceModule HEREDA BaseModule IMPLEMENTA TelegramServiceContract {
  ATRIBUTOS {
    name: String = 'telegram-service'
    version: String = '2.0.0'
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    uiHandler: UIRequestHandler
    bots: Map<botName, BotConnection>
    botConfig: Map<botName, BotConfiguration>
    webhookUrl: String|Null
    config: Object
    internalMetrics: {messages_sent, messages_received, files_sent, errors, active_bots}
  }

  METODOS {
    async onLoad(context: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus, uiHandler FROM context
      config = context.config['telegram-service'] || {}
      webhookUrl = config.webhook_url || null
      await _loadBotConfig()
      metrics.gauge('telegram.bots.active', bots.size)
      LOG module.loaded CON bots: bots.size

    async onUnload(): Promise<Void>
      await _saveBotConfig()
      bots.forEach(bot => _disconnectBot(bot))
      bots.clear()
      botConfig.clear()
      LOG module.unloaded

    async handleRegisterBot(data: {botName, apiToken, webhook?, description?}): Promise<Response>
      VALIDA botName, apiToken obligatorios
      SI bots.has(data.botName): RETORNA 409 CONFLICT_STATE
      bot = {botName: data.botName, apiToken: data.apiToken, webhook: data.webhook || webhookUrl, description: data.description || '', created_at: now()}
      bots.set(data.botName, {connection: null, lastPoll: null, isConnected: false})
      botConfig.set(data.botName, bot)
      SI data.webhook: await _setWebhook(data.botName, data.webhook)
      SINO: await _startPolling(data.botName)
      await _saveBotConfig()
      internalMetrics.active_bots++
      metrics.increment('telegram.bot.registered')
      EMITE telegram.bot_registered {botName: data.botName}
      RETORNA {status: 201, data: {registered: true, botId: data.botName}}

    async handleUnregisterBot(data: {botName}): Promise<Response>
      VALIDA botName obligatorio
      SI NOT bots.has(data.botName): RETORNA 404 RESOURCE_NOT_FOUND
      bot = bots.get(data.botName)
      _disconnectBot(bot)
      bots.delete(data.botName)
      botConfig.delete(data.botName)
      await _saveBotConfig()
      internalMetrics.active_bots--
      metrics.increment('telegram.bot.unregistered')
      EMITE telegram.bot_unregistered {botName: data.botName}
      RETORNA {status: 200}

    async handleSendMessage(data: {botName, chatId, text, parseMode?, replyToMessageId?}): Promise<Response>
      VALIDA botName, chatId, text obligatorios
      bot = _getBotConnection(data.botName)
      SI NOT bot?.isConnected: RETORNA 503 UPSTREAM_UNREACHABLE
      response = await _apiCall(data.botName, 'sendMessage', {chat_id: data.chatId, text: data.text, parse_mode: data.parseMode || 'HTML', reply_to_message_id: data.replyToMessageId})
      SI response.ok:
        internalMetrics.messages_sent++
        metrics.increment('telegram.messages.sent')
        EMITE telegram.message_sent {botName: data.botName, chatId: data.chatId, messageId: response.result.message_id}
        RETORNA {status: 200, data: {messageId: response.result.message_id, sent: true}}
      SINO:
        metrics.increment('telegram.errors', {kind: 'send_failed'})
        RETORNA {status: 400, error: response.description}

    async handleSendFile(data: {botName, chatId, fileType, fileName, content}): Promise<Response>
      VALIDA botName, chatId, fileType, fileName, content obligatorios
      bot = _getBotConnection(data.botName)
      SI NOT bot?.isConnected: RETORNA 503 UPSTREAM_UNREACHABLE
      buffer = Buffer.from(data.content, 'base64')
      response = await _apiCallWithFile(data.botName, _methodFromFileType(data.fileType), {chat_id: data.chatId, file: buffer, filename: data.fileName})
      SI response.ok:
        internalMetrics.files_sent++
        metrics.increment('telegram.files.sent')
        fileId = response.result.file_id || (response.result.photo?.[0]?.file_id) || (response.result.document?.file_id)
        EMITE telegram.file_sent {botName: data.botName, chatId: data.chatId, fileId}
        RETORNA {status: 200, data: {fileId, sent: true}}
      SINO:
        metrics.increment('telegram.errors', {kind: 'file_failed'})
        RETORNA {status: 400, error: response.description}

    async handleGetBotInfo(data: {botName}): Promise<Response>
      VALIDA botName obligatorio
      cfg = botConfig.get(data.botName)
      SI NOT cfg: RETORNA 404 RESOURCE_NOT_FOUND
      bot = bots.get(data.botName)
      RETORNA {status: 200, data: {...cfg, isConnected: bot?.isConnected || false}}

    async handleListBots(): Promise<Response>
      list = Array.from(botConfig.values()).map(cfg => ({botName: cfg.botName, description: cfg.description, created_at: cfg.created_at, isConnected: bots.get(cfg.botName)?.isConnected}))
      RETORNA {status: 200, data: {bots: list, total: list.length}}

    async handleWebhook(data: {botName, update}): Promise<Response>
      VALIDA botName obligatorio
      SI NOT botConfig.has(data.botName): RETORNA 404 RESOURCE_NOT_FOUND
      {message, callback_query, edited_message} = data.update
      SI message:
        await _onMessageReceived(data.botName, message)
      SI callback_query:
        await _onCallbackQuery(data.botName, callback_query)
      SI edited_message:
        await _onMessageEdited(data.botName, edited_message)
      RETORNA {status: 200, data: {ok: true}}

    async _startPolling(botName: String): Promise<Void>
      bot = bots.get(botName)
      SI NOT bot: RETORNA
      pollLoop = async () => {
        MIENTRAS bot.isConnected:
          TRY:
            response = await _apiCall(botName, 'getUpdates', {offset: bot.lastPoll + 1, timeout: 30})
            SI response.ok Y response.result.length > 0:
              PARA CADA update EN response.result:
                bot.lastPoll = update.update_id
                await handleWebhook({botName, update})
          CATCH err:
            logger.error('telegram.poll_error', {botName, error: err.message})
            internalMetrics.errors++
            metrics.increment('telegram.errors', {kind: 'poll_error'})
          ESPERA 1000ms ANTES DE REINTENTAR
      }
      bot.isConnected = true
      bot.pollPromise = pollLoop()

    async _setWebhook(botName: String, webhookUrl: String): Promise<Boolean>
      response = await _apiCall(botName, 'setWebhook', {url: webhookUrl})
      bot = bots.get(botName)
      SI response.ok:
        bot.isConnected = true
        RETORNA true
      SINO:
        logger.warn('telegram.webhook_failed', {botName, error: response.description})
        RETORNA false

    _disconnectBot(bot: BotConnection): Void
      bot.isConnected = false
      SI bot.pollPromise: AWAIT bot.pollPromise CON timeout(2000)

    async _onMessageReceived(botName: String, message: Object): Promise<Void>
      internalMetrics.messages_received++
      metrics.increment('telegram.messages.received')
      {from, chat, text, file_id, caption} = message
      EMITE telegram.message_received {botName, chatId: chat.id, userId: from.id, firstName: from.first_name, username: from.username, text, fileId: file_id, caption}

    async _onCallbackQuery(botName: String, query: Object): Promise<Void>
      {from, data, id} = query
      EMITE telegram.callback_received {botName, userId: from.id, data, queryId: id}

    async _onMessageEdited(botName: String, message: Object): Promise<Void>
      {chat, message_id, text} = message
      EMITE telegram.message_edited {botName, chatId: chat.id, messageId: message_id, text}

    async _apiCall(botName: String, method: String, params: Object): Promise<Object>
      cfg = botConfig.get(botName)
      SI NOT cfg: RETORNA {ok: false, description: 'Bot not found'}
      url = `https://api.telegram.org/bot{cfg.apiToken}/{method}`
      response = await fetch(url, {method: 'POST', body: JSON.stringify(params)})
      RETORNA await response.json()

    async _apiCallWithFile(botName: String, method: String, params: Object): Promise<Object>
      cfg = botConfig.get(botName)
      SI NOT cfg: RETORNA {ok: false, description: 'Bot not found'}
      url = `https://api.telegram.org/bot{cfg.apiToken}/{method}`
      formData = new FormData()
      formData.append('chat_id', params.chat_id)
      formData.append(method == 'sendPhoto' ? 'photo' : 'document', params.file, params.filename)
      response = await fetch(url, {method: 'POST', body: formData})
      RETORNA await response.json()

    _methodFromFileType(type: String): String
      SWITCH type:
        'photo': RETORNA 'sendPhoto'
        'document': RETORNA 'sendDocument'
        'audio': RETORNA 'sendAudio'
        'video': RETORNA 'sendVideo'
        SINO: RETORNA 'sendDocument'

    async _loadBotConfig(): Promise<Void>
      filePath = join(cwd(), 'data/telegram-config.json')
      SI EXISTS(filePath):
        data = JSON.parse(readFile(filePath, 'utf-8'))
        PARA CADA [botName, cfg] EN data.bots:
          botConfig.set(botName, cfg)
          bots.set(botName, {connection: null, lastPoll: 0, isConnected: false})

    async _saveBotConfig(): Promise<Void>
      filePath = join(cwd(), 'data/telegram-config.json')
      data = {_version: 1, _updated: now(), bots: Object.fromEntries(botConfig)}
      writeFile(filePath, JSON.stringify(data, null, 2))

    EVENTOS_PUBLISHES {
      'telegram.bot_registered': {botName}
      'telegram.bot_unregistered': {botName}
      'telegram.message_sent': {botName, chatId, messageId}
      'telegram.file_sent': {botName, chatId, fileId}
      'telegram.message_received': {botName, chatId, userId, firstName, username, text, fileId?, caption?}
      'telegram.callback_received': {botName, userId, data, queryId}
      'telegram.message_edited': {botName, chatId, messageId, text}
      'telegram.send_message.request': {botName, chatId, text, parseMode?}
    }

    EVENTOS_SUBSCRIBES {
      'telegram.send_message.request': handleSendMessage
    }
  }
}

CLASE BotConnection {
  ATRIBUTOS {
    connection: Any|Null
    lastPoll: Integer
    isConnected: Boolean
    pollPromise: Promise|Null
  }
}

CLASE BotConfiguration {
  ATRIBUTOS {
    botName: String
    apiToken: String
    webhook: String|Null
    description: String
    created_at: String (ISO)
  }
}
```

## TEXT-EDITOR (v2.0.0) — Editor de Texto con Sintaxis

```
INTERFAZ TextEditorContract {
  openFile(filePath: String): Promise<{content, encoding, language, lineCount}>
  saveFile(data: {filePath, content, encoding?}): Promise<{saved, lineCount}>
  getLanguage(filePath: String): Promise<String>
  search(data: {filePath, query, caseSensitive?}): Promise<Array<SearchMatch>>
  replace(data: {filePath, query, replacement, replaceAll?}): Promise<{replaced, newContent}>
  getLineRange(data: {filePath, start, end}): Promise<Array<String>>
  insertText(data: {filePath, line, column, text}): Promise<{success, newContent}>
}

CLASE TextEditorModule HEREDA BaseModule IMPLEMENTA TextEditorContract {
  ATRIBUTOS {
    name: String = 'text-editor'
    version: String = '2.0.0'
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    uiHandler: UIRequestHandler
    openFiles: Map<filePath, FileSession>
    config: Object
    internalMetrics: {opens_total, saves_total, edits_total, errors}
    LANGUAGE_MAP: Map<extension, language>
  }

  METODOS {
    async onLoad(context: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus, uiHandler FROM context
      CARGA LANGUAGE_MAP: {js: 'javascript', ts: 'typescript', py: 'python', json: 'json', md: 'markdown', html: 'html', css: 'css', etc}
      LOG module.loaded

    async onUnload(): Promise<Void>
      PARA CADA [filePath, session] EN openFiles:
        SI session.modified: INTENTA saveFile({filePath, content: session.content})
      openFiles.clear()
      LOG module.unloaded

    async handleOpenFile(data: {filePath}): Promise<Response>
      VALIDA filePath obligatorio
      SI NOT EXISTS(data.filePath): RETORNA 404 RESOURCE_NOT_FOUND
      stat = fs.statSync(data.filePath)
      SI stat.size > 10 * 1024 * 1024: RETORNA 413 PAYLOAD_TOO_LARGE
      content = readFile(data.filePath, 'utf-8')
      encoding = 'utf-8'
      language = _getLanguage(data.filePath)
      lineCount = content.split('\n').length
      session = {filePath: data.filePath, content, encoding, language, modified: false, lastSaved: now(), openedAt: now()}
      openFiles.set(data.filePath, session)
      internalMetrics.opens_total++
      metrics.increment('text-editor.files.opened')
      EMITE editor.file_opened {filePath: data.filePath, language, lineCount}
      RETORNA {status: 200, data: {content, encoding, language, lineCount}}

    async handleSaveFile(data: {filePath, content, encoding?}): Promise<Response>
      VALIDA filePath, content obligatorios
      SI NOT openFiles.has(data.filePath): RETORNA 404 RESOURCE_NOT_FOUND
      encoding = data.encoding || 'utf-8'
      buffer = Buffer.from(data.content, encoding)
      writeFile(data.filePath, buffer)
      session = openFiles.get(data.filePath)
      session.content = data.content
      session.modified = false
      session.lastSaved = now()
      lineCount = data.content.split('\n').length
      internalMetrics.saves_total++
      metrics.increment('text-editor.files.saved')
      EMITE editor.file_saved {filePath: data.filePath, lineCount}
      RETORNA {status: 200, data: {saved: true, lineCount}}

    async handleGetLanguage(data: {filePath}): Promise<Response>
      VALIDA filePath obligatorio
      language = _getLanguage(data.filePath)
      RETORNA {status: 200, data: {filePath: data.filePath, language}}

    async handleSearch(data: {filePath, query, caseSensitive?}): Promise<Response>
      VALIDA filePath, query obligatorios
      SI NOT openFiles.has(data.filePath): RETORNA 404 RESOURCE_NOT_FOUND
      session = openFiles.get(data.filePath)
      flags = data.caseSensitive ? 'g' : 'gi'
      regex = new RegExp(query, flags)
      lines = session.content.split('\n')
      matches = []
      PARA i = 0 HASTA lines.length:
        line = lines[i]
        MIENTRAS match = regex.exec(line):
          matches.push({line: i + 1, column: match.index, text: match[0]})
      RETORNA {status: 200, data: {filePath: data.filePath, matches, count: matches.length}}

    async handleReplace(data: {filePath, query, replacement, replaceAll?}): Promise<Response>
      VALIDA filePath, query, replacement obligatorios
      SI NOT openFiles.has(data.filePath): RETORNA 404 RESOURCE_NOT_FOUND
      session = openFiles.get(data.filePath)
      flags = data.replaceAll ? 'g' : ''
      regex = new RegExp(query, flags)
      newContent = session.content.replace(regex, data.replacement)
      replaced = (session.content.match(regex) || []).length
      session.content = newContent
      session.modified = true
      internalMetrics.edits_total++
      metrics.increment('text-editor.replacements', {replaced})
      EMITE editor.text_replaced {filePath: data.filePath, replaced}
      RETORNA {status: 200, data: {replaced, newContent}}

    async handleGetLineRange(data: {filePath, start, end}): Promise<Response>
      VALIDA filePath, start, end obligatorios
      SI NOT openFiles.has(data.filePath): RETORNA 404 RESOURCE_NOT_FOUND
      session = openFiles.get(data.filePath)
      lines = session.content.split('\n')
      startLine = parseInt(data.start) - 1
      endLine = parseInt(data.end)
      SI startLine < 0 O endLine > lines.length: RETORNA 400 INVALID_INPUT
      result = lines.slice(startLine, endLine)
      RETORNA {status: 200, data: {filePath: data.filePath, lines: result, start: data.start, end: data.end}}

    async handleInsertText(data: {filePath, line, column, text}): Promise<Response>
      VALIDA filePath, line, column, text obligatorios
      SI NOT openFiles.has(data.filePath): RETORNA 404 RESOURCE_NOT_FOUND
      session = openFiles.get(data.filePath)
      lines = session.content.split('\n')
      lineIdx = parseInt(data.line) - 1
      col = parseInt(data.column)
      SI lineIdx < 0 O lineIdx >= lines.length: RETORNA 400 INVALID_INPUT
      lines[lineIdx] = lines[lineIdx].slice(0, col) + data.text + lines[lineIdx].slice(col)
      session.content = lines.join('\n')
      session.modified = true
      internalMetrics.edits_total++
      metrics.increment('text-editor.insertions')
      RETORNA {status: 200, data: {success: true, newContent: session.content}}

    _getLanguage(filePath: String): String
      ext = filePath.split('.').pop()?.toLowerCase()
      RETORNA LANGUAGE_MAP.get(ext) || 'plaintext'

    EVENTOS_PUBLISHES {
      'editor.file_opened': {filePath, language, lineCount}
      'editor.file_saved': {filePath, lineCount}
      'editor.text_replaced': {filePath, replaced}
    }

    EVENTOS_SUBSCRIBES {
    }
  }
}

CLASE FileSession {
  ATRIBUTOS {
    filePath: String
    content: String
    encoding: String
    language: String
    modified: Boolean
    lastSaved: String (ISO)
    openedAt: String (ISO)
  }
}
```

## TIENDA-API (v2.0.0) — API de Operaciones de Tienda

```
INTERFAZ TiendaApiContract {
  getStatus(project_id: String): Promise<{status, uptime, version, modules}>
  listItems(project_id: String, filters?: Object): Promise<Array<Item>>
  createItem(data: {project_id, name, description, price, sku, category}): Promise<Item>
  updateItem(data: {project_id, item_id, updates}): Promise<Item>
  deleteItem(data: {project_id, item_id}): Promise<Void>
  searchItems(data: {project_id, query}): Promise<Array<Item>>
  getCategories(project_id: String): Promise<Array<Category>>
  createCategory(data: {project_id, name, description}): Promise<Category>
}

CLASE TiendaApiModule HEREDA BaseModule IMPLEMENTA TiendaApiContract {
  ATRIBUTOS {
    name: String = 'tienda-api'
    version: String = '2.0.0'
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    uiHandler: UIRequestHandler
    itemsPerProject: Map<project_id, Map<item_id, Item>>
    categoriesPerProject: Map<project_id, Map<category_id, Category>>
    config: Object
    internalMetrics: {items_created, items_updated, items_deleted, searches, errors}
  }

  METODOS {
    async onLoad(context: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus, uiHandler FROM context
      SUSCRIBE project.activated, project.deactivated
      LOG module.loaded

    async onUnload(): Promise<Void>
      itemsPerProject.clear()
      categoriesPerProject.clear()
      LOG module.unloaded

    async handleGetStatus(data: {project_id}): Promise<Response>
      VALIDA project_id obligatorio
      items = itemsPerProject.get(data.project_id)
      categories = categoriesPerProject.get(data.project_id)
      RETORNA {status: 200, data: {project_id: data.project_id, items_count: items?.size || 0, categories_count: categories?.size || 0, status: 'operational'}}

    async handleListItems(data: {project_id, filters?}): Promise<Response>
      VALIDA project_id obligatorio
      items = itemsPerProject.get(data.project_id) || new Map()
      list = Array.from(items.values())
      SI data.filters?.category: FILTRA POR category
      SI data.filters?.active: FILTRA POR active == true
      RETORNA {status: 200, data: {project_id: data.project_id, items: list, total: list.length}}

    async handleCreateItem(data: {project_id, name, description, price, sku, category}): Promise<Response>
      VALIDA project_id, name, price, sku obligatorios
      VALIDA UNIQUE sku EN project
      item_id = crypto.randomUUID()
      item = {item_id, name: data.name, description: data.description || '', price: data.price, sku: data.sku, category: data.category || 'general', active: true, created_at: now()}
      SI NOT itemsPerProject.has(data.project_id):
        itemsPerProject.set(data.project_id, new Map())
      itemsPerProject.get(data.project_id).set(item_id, item)
      internalMetrics.items_created++
      metrics.increment('tienda.items.created')
      EMITE tienda.item_created {project_id: data.project_id, item_id, name: data.name}
      RETORNA {status: 201, data: item}

    async handleUpdateItem(data: {project_id, item_id, updates}): Promise<Response>
      VALIDA project_id, item_id, updates obligatorios
      items = itemsPerProject.get(data.project_id)
      SI NOT items?.has(data.item_id): RETORNA 404 RESOURCE_NOT_FOUND
      item = items.get(data.item_id)
      MERGES updates CON item
      item.updated_at = now()
      internalMetrics.items_updated++
      metrics.increment('tienda.items.updated')
      EMITE tienda.item_updated {project_id: data.project_id, item_id: data.item_id}
      RETORNA {status: 200, data: item}

    async handleDeleteItem(data: {project_id, item_id}): Promise<Response>
      VALIDA project_id, item_id obligatorios
      items = itemsPerProject.get(data.project_id)
      SI NOT items?.has(data.item_id): RETORNA 404 RESOURCE_NOT_FOUND
      items.delete(data.item_id)
      internalMetrics.items_deleted++
      metrics.increment('tienda.items.deleted')
      EMITE tienda.item_deleted {project_id: data.project_id, item_id: data.item_id}
      RETORNA {status: 200}

    async handleSearchItems(data: {project_id, query}): Promise<Response>
      VALIDA project_id, query obligatorios
      items = itemsPerProject.get(data.project_id) || new Map()
      list = Array.from(items.values())
      results = list.filter(i => i.name.toLowerCase().includes(data.query.toLowerCase()) OR i.description.toLowerCase().includes(data.query.toLowerCase()))
      internalMetrics.searches++
      metrics.increment('tienda.searches')
      RETORNA {status: 200, data: {project_id: data.project_id, results, count: results.length}}

    async handleGetCategories(data: {project_id}): Promise<Response>
      VALIDA project_id obligatorio
      categories = categoriesPerProject.get(data.project_id) || new Map()
      list = Array.from(categories.values())
      RETORNA {status: 200, data: {project_id: data.project_id, categories: list, total: list.length}}

    async handleCreateCategory(data: {project_id, name, description}): Promise<Response>
      VALIDA project_id, name obligatorios
      category_id = crypto.randomUUID()
      category = {category_id, name: data.name, description: data.description || '', created_at: now()}
      SI NOT categoriesPerProject.has(data.project_id):
        categoriesPerProject.set(data.project_id, new Map())
      categoriesPerProject.get(data.project_id).set(category_id, category)
      metrics.increment('tienda.categories.created')
      RETORNA {status: 201, data: category}

    EVENTOS_SUBSCRIBES {
      'project.activated': onProjectActivated
      'project.deactivated': onProjectDeactivated
    }

    EVENTOS_PUBLISHES {
      'tienda.item_created': {project_id, item_id, name}
      'tienda.item_updated': {project_id, item_id}
      'tienda.item_deleted': {project_id, item_id}
    }
  }
}

CLASE Item {
  ATRIBUTOS {
    item_id: String
    name: String
    description: String
    price: Number
    sku: String
    category: String
    active: Boolean
    created_at: String (ISO)
    updated_at: String|Null (ISO)
  }
}

CLASE Category {
  ATRIBUTOS {
    category_id: String
    name: String
    description: String
    created_at: String (ISO)
  }
}
```

## WHATSAPP-BOT (v2.0.0) — Integración WhatsApp

```
INTERFAZ WhatsappBotContract {
  registerBot(data: {botName, phoneNumberId, accessToken, webhookVerifyToken?, description?}): Promise<{registered, botId}>
  unregisterBot(botName: String): Promise<Void>
  sendMessage(data: {botName, phoneNumber, text}): Promise<{messageId, sent}>
  sendTemplate(data: {botName, phoneNumber, template, variables}): Promise<{messageId, sent}>
  getBotInfo(botName: String): Promise<BotInfo>
  listBots(): Promise<Array<BotInfo>>
  handleWebhook(data: {botName, event}): Promise<Void>
}

CLASE WhatsappBotModule HEREDA BaseModule IMPLEMENTA WhatsappBotContract {
  ATRIBUTOS {
    name: String = 'whatsapp-bot'
    version: String = '2.0.0'
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    uiHandler: UIRequestHandler
    bots: Map<botName, BotConnection>
    botConfig: Map<botName, BotConfiguration>
    templates: Map<botName, Map<templateId, Template>>
    config: Object
    internalMetrics: {messages_sent, messages_received, errors, active_bots}
  }

  METODOS {
    async onLoad(context: EventCore): Promise<Void>
      INICIALIZA logger, metrics, eventBus, uiHandler FROM context
      config = context.config['whatsapp-bot'] || {}
      await _loadBotConfig()
      metrics.gauge('whatsapp.bots.active', bots.size)
      LOG module.loaded CON bots: bots.size

    async onUnload(): Promise<Void>
      await _saveBotConfig()
      bots.forEach(bot => _disconnectBot(bot))
      bots.clear()
      botConfig.clear()
      templates.clear()
      LOG module.unloaded

    async handleRegisterBot(data: {botName, phoneNumberId, accessToken, webhookVerifyToken?, description?}): Promise<Response>
      VALIDA botName, phoneNumberId, accessToken obligatorios
      SI bots.has(data.botName): RETORNA 409 CONFLICT_STATE
      bot = {botName: data.botName, phoneNumberId: data.phoneNumberId, accessToken: data.accessToken, webhookVerifyToken: data.webhookVerifyToken || crypto.randomBytes(16).toString('hex'), description: data.description || '', created_at: now()}
      bots.set(data.botName, {isConnected: true, lastMessage: null})
      botConfig.set(data.botName, bot)
      templates.set(data.botName, new Map())
      await _saveBotConfig()
      internalMetrics.active_bots++
      metrics.increment('whatsapp.bot.registered')
      EMITE whatsapp.bot_registered {botName: data.botName}
      RETORNA {status: 201, data: {registered: true, botId: data.botName, webhookUrl: _buildWebhookUrl(data.botName)}}

    async handleUnregisterBot(data: {botName}): Promise<Response>
      VALIDA botName obligatorio
      SI NOT bots.has(data.botName): RETORNA 404 RESOURCE_NOT_FOUND
      _disconnectBot(bots.get(data.botName))
      bots.delete(data.botName)
      botConfig.delete(data.botName)
      templates.delete(data.botName)
      await _saveBotConfig()
      internalMetrics.active_bots--
      metrics.increment('whatsapp.bot.unregistered')
      EMITE whatsapp.bot_unregistered {botName: data.botName}
      RETORNA {status: 200}

    async handleSendMessage(data: {botName, phoneNumber, text}): Promise<Response>
      VALIDA botName, phoneNumber, text obligatorios
      bot = _getBotConnection(data.botName)
      SI NOT bot?.isConnected: RETORNA 503 UPSTREAM_UNREACHABLE
      cfg = botConfig.get(data.botName)
      response = await _apiCall(cfg, 'sendMessage', {messaging_product: 'whatsapp', recipient_type: 'individual', to: data.phoneNumber, type: 'text', text: {body: data.text}})
      SI response.messages:
        internalMetrics.messages_sent++
        metrics.increment('whatsapp.messages.sent')
        EMITE whatsapp.message_sent {botName: data.botName, phoneNumber: data.phoneNumber, messageId: response.messages[0].id}
        RETORNA {status: 200, data: {messageId: response.messages[0].id, sent: true}}
      SINO:
        metrics.increment('whatsapp.errors', {kind: 'send_failed'})
        RETORNA {status: 400, error: response.error?.message}

    async handleSendTemplate(data: {botName, phoneNumber, template, variables}): Promise<Response>
      VALIDA botName, phoneNumber, template obligatorios
      bot = _getBotConnection(data.botName)
      SI NOT bot?.isConnected: RETORNA 503 UPSTREAM_UNREACHABLE
      cfg = botConfig.get(data.botName)
      params = []
      SI data.variables:
        PARA CADA v EN data.variables:
          params.push({type: 'text', text: String(v)})
      response = await _apiCall(cfg, 'sendTemplate', {messaging_product: 'whatsapp', to: data.phoneNumber, type: 'template', template: {name: data.template, language: {code: 'es'}, parameters: {body: {parameters: params}}}})
      SI response.messages:
        internalMetrics.messages_sent++
        metrics.increment('whatsapp.templates.sent')
        EMITE whatsapp.template_sent {botName: data.botName, phoneNumber: data.phoneNumber, template: data.template}
        RETORNA {status: 200, data: {messageId: response.messages[0].id, sent: true}}
      SINO:
        metrics.increment('whatsapp.errors', {kind: 'template_failed'})
        RETORNA {status: 400, error: response.error?.message}

    async handleGetBotInfo(data: {botName}): Promise<Response>
      VALIDA botName obligatorio
      cfg = botConfig.get(data.botName)
      SI NOT cfg: RETORNA 404 RESOURCE_NOT_FOUND
      bot = bots.get(data.botName)
      RETORNA {status: 200, data: {...cfg, isConnected: bot?.isConnected || false}}

    async handleListBots(): Promise<Response>
      list = Array.from(botConfig.values()).map(cfg => ({botName: cfg.botName, phoneNumberId: cfg.phoneNumberId, description: cfg.description, created_at: cfg.created_at, isConnected: bots.get(cfg.botName)?.isConnected}))
      RETORNA {status: 200, data: {bots: list, total: list.length}}

    async handleWebhook(data: {botName, event}): Promise<Response>
      VALIDA botName obligatorio
      SI NOT botConfig.has(data.botName): RETORNA 404 RESOURCE_NOT_FOUND
      {entry} = data.event
      SI NOT entry OR entry.length == 0: RETORNA 200
      PARA CADA e EN entry:
        PARA CADA change EN e.changes:
          {value} = change
          SI value.messages:
            PARA CADA msg EN value.messages:
              await _onMessageReceived(data.botName, msg, value.contacts[0])
      RETORNA {status: 200, data: {ok: true}}

    async _onMessageReceived(botName: String, message: Object, contact: Object): Promise<Void>
      internalMetrics.messages_received++
      metrics.increment('whatsapp.messages.received')
      {from, text, type, media} = message
      bot = bots.get(botName)
      SI bot: bot.lastMessage = now()
      EMITE whatsapp.message_received {botName, phoneNumber: from, text: text?.body, type, media, contact: contact?.name}

    async _apiCall(cfg: BotConfiguration, method: String, params: Object): Promise<Object>
      url = `https://graph.instagram.com/v18.0/{cfg.phoneNumberId}/{method}`
      response = await fetch(url, {method: 'POST', headers: {Authorization: `Bearer {cfg.accessToken}`, 'Content-Type': 'application/json'}, body: JSON.stringify(params)})
      SI NOT response.ok:
        RETORNA {error: {message: response.statusText}}
      RETORNA await response.json()

    _buildWebhookUrl(botName: String): String
      baseUrl = config.webhook_base_url || 'https://your-domain.com'
      RETORNA `{baseUrl}/webhooks/whatsapp/{botName}`

    _disconnectBot(bot: BotConnection): Void
      bot.isConnected = false

    async _loadBotConfig(): Promise<Void>
      filePath = join(cwd(), 'data/whatsapp-config.json')
      SI EXISTS(filePath):
        data = JSON.parse(readFile(filePath, 'utf-8'))
        PARA CADA [botName, cfg] EN data.bots:
          botConfig.set(botName, cfg)
          bots.set(botName, {isConnected: true, lastMessage: null})
          templates.set(botName, new Map(Object.entries(data.templates?.[botName] || {})))

    async _saveBotConfig(): Promise<Void>
      filePath = join(cwd(), 'data/whatsapp-config.json')
      data = {_version: 1, _updated: now(), bots: Object.fromEntries(botConfig), templates: Object.fromEntries(templates)}
      writeFile(filePath, JSON.stringify(data, null, 2))

    EVENTOS_PUBLISHES {
      'whatsapp.bot_registered': {botName}
      'whatsapp.bot_unregistered': {botName}
      'whatsapp.message_sent': {botName, phoneNumber, messageId}
      'whatsapp.template_sent': {botName, phoneNumber, template}
      'whatsapp.message_received': {botName, phoneNumber, text, type, media, contact}
    }

    EVENTOS_SUBSCRIBES {
    }
  }
}

CLASE BotConnection {
  ATRIBUTOS {
    isConnected: Boolean
    lastMessage: String|Null (ISO)
  }
}

CLASE BotConfiguration {
  ATRIBUTOS {
    botName: String
    phoneNumberId: String
    accessToken: String
    webhookVerifyToken: String
    description: String
    created_at: String (ISO)
  }
}

CLASE Template {
  ATRIBUTOS {
    template_id: String
    name: String
    parameters: Array<String>
    created_at: String (ISO)
  }
}
```

https://claude.ai/code/session_019C4pks5RDdscuKPqVdTWRF
