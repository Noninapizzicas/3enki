# Pseudocódigo OOP Completo — Módulos Analizados

## 1. CREDENTIAL-MANAGER

```
INTERFAZ CredentialManagerContract {
  onLoad(core: Object): Promise<Void>
  onUnload(): Promise<Void>
  onStateRequest(event: Object): Promise<Void>
  onCreateCredential(event: Object): Promise<Void>
  onUpdateCredential(event: Object): Promise<Void>
  onDeleteCredential(event: Object): Promise<Void>
  onResolveRequest(event: Object): Promise<Void>
  handleSaveCredential(req: Object): Promise<{status: Number, data|error}>
  handleResolveCredential(req: Object): Promise<{status: Number, data|error}>
  handleListCredentials(): Promise<{status: Number, data}>
  handleUpdateCredential(req: Object): Promise<{status: Number, data|error}>
  handleDeleteCredential(req: Object): Promise<{status: Number, data|error}>
  handleHealthCheck(): Promise<Object>
  handleGetMetrics(): Promise<{status: Number, data}>
  handleGetLevels(): Promise<{status: Number, data}>
  handleUIList(): Promise<{status: Number, data|error}>
  handleUIGet(data: Object): Promise<{status: Number, data|error}>
  handleUICreate(data: Object): Promise<{status: Number, data|error}>
  handleUIUpdate(data: Object): Promise<{status: Number, data|error}>
  handleUIDelete(data: Object): Promise<{status: Number, data|error}>
  handleToolCredentialList(): Promise<{status: Number, data|error}>
}

CLASE CredentialManagerModule HEREDA BaseModule IMPLEMENTA CredentialManagerContract {
  ATRIBUTOS {
    name: String = 'credential-manager'
    version: String = '2.0.0'
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    uiHandler: UIRequestHandler
    config: Object
    envFilePath: String
    credentials: Map<key: String, value: String>
  }

  CONSTRUCTOR() {
    this.name = 'credential-manager'
    this.version = '2.0.0'
    this.credentials = new Map()
  }

  METODOS_PRIVADOS {
    async _loadEnvFile(): Promise<Void>
      LEE envFilePath desde FS
      PARSEA lineas KEY=VALUE
      CARGA credenciales EN this.credentials si KEY incluye '_API_KEY_'
      LOG info/error segun resultado

    async _saveEnvFile(): Promise<Void>
      AGRUPA credenciales por level (GLOBAL, PROJECT, CLIENT, CUSTOM, BOT)
      ESCRIBE en tempfile
      RENOMBRA atomicamente a envFilePath
      ACTUALIZA process.env

    _updateCredentialMetrics(): Void
      ACTUALIZA gauge para total + por level
      INCREMENTA counters segun operacion

    async _publishState(correlation_id?: String): Promise<Void>
      PUBLICA credential.state con snapshot actual
      INCLUYE correlation_id si proporcionado

    _resolveCredential(provider: String, {customId?, clientId?, projectId?}): {found, apiKey?, resolvedFrom?, attempts}
      CASCADA: CUSTOM → CLIENT → PROJECT → GLOBAL
      RETORNA {found: true, apiKey, key, resolvedFrom, identifier, attempts}
      SI no encuentra, RETORNA {found: false, attempts}

    async _publishResolveResponse(request_id: String, payload: Object, correlation_id?: String): Promise<Void>
      PUBLICA credential.resolve.response con request_id + payload

    _buildKey(provider: String, level: String, identifier?: String): String
      FORMATO: {PROVIDER}_API_KEY_{LEVEL}_{identifier}
      GLOBAL → {PROVIDER}_API_KEY_GLOBAL

    _parseKey(key: String): {provider, level, identifier} | Null
      PARSEA key segun regex PROVIDER_API_KEY_LEVEL_identifier
      RETORNA {provider, level, identifier} o legacy {provider, level}

    _extractLevel(key: String): String
      EXTRAE level de key

    _validateLevel(level: String, identifier?: String): {valid: Boolean, message?, details?}
      VALIDA que level sea en VALID_LEVELS
      VALIDA que identifier required SI level != GLOBAL

    _validateProviderLevelKey(provider: String, level: String, api_key: String): Void
      LANZA si alguno undefined/null

    _maskApiKey(apiKey: String): String
      RETORNA **** + ultimos 4 caracteres

    _getUIState(): {credentials: Array, total: Number, env_file: String}
      MAPEA credenciales a {key, provider, level, identifier, preview}

    async _fetchWithTimeout(url: String, options?: Object, timeoutMs?: Number): Promise<Response>
      PREPARADO para credential-tester (no usado actualmente)
      IMPLEMENTA AbortController + timeout
      REGISTRA timing/error metrics

    async _publicarEvento(name: String, payload: Object, sourcePayload?: Object): Promise<Void>
      CANONIZA correlation_id + timestamp
      PUBLICA en eventBus
  }

  EVENTOS_PUBLICADOS {
    credential.saved: {provider, level, identifier, key, correlation_id, timestamp}
    credential.updated: {key, correlation_id, timestamp}
    credential.deleted: {key, correlation_id, timestamp}
    credential.resolve.response: {request_id, success, provider, api_key?, resolved_from?, error?, correlation_id, timestamp}
    credential.state: {credentials, total, env_file, correlation_id, timestamp}
  }

  RELACIONES {
    DEPENDE_DE: EventBus, Logger, Metrics, UIRequestHandler
    CONSUMIDO_POR: ai-gateway (credential.resolve.request), project-manager, chat-io
    PROPORCIONA_TOOLS: credential.list (para LLM)
  }
}
```

---

## 2. PROJECT-MANAGER

```
INTERFAZ ProjectManagerContract {
  onLoad(core: Object): Promise<Void>
  onUnload(): Promise<Void>
  onProjectCreate(event: Object): Promise<Void>
  onProjectUpdate(event: Object): Promise<Void>
  onProjectDelete(event: Object): Promise<Void>
  onProjectActivate(event: Object): Promise<Void>
  onProjectStateRequest(event: Object): Promise<Void>
  onGetProjectRequest(event: Object): Promise<Void>
  onListProjectsRequest(event: Object): Promise<Void>
  onGetActiveProjectRequest(event: Object): Promise<Void>
  onDbQueryResponse(event: Object): Void
  onCompositionResponse(event: Object): Void
  handleCreateProject(req: Object): Promise<{status: Number, data|error}>
  handleListProjects(req: Object): Promise<{status: Number, data|error}>
  handleGetProject(req: Object): Promise<{status: Number, data|error}>
  handleUpdateProject(req: Object): Promise<{status: Number, data|error}>
  handleDeleteProject(req: Object): Promise<{status: Number, data|error}>
  handleActivateProject(req: Object): Promise<{status: Number, data|error}>
  handleGetActiveProject(req: Object): Promise<{status: Number, data|error}>
  handleSaveSession(req: Object): Promise<{status: Number, data|error}>
  handleRestoreSession(req: Object): Promise<{status: Number, data|error}>
  handleSetAIConfig(req: Object): Promise<{status: Number, data|error}>
  handleSetLastConversation(req: Object): Promise<{status: Number, data|error}>
  handleHealthCheck(): Promise<{status: 'ok', module, version, projects_count, active_count}>
  handleGetMetrics(): Promise<{status: Number, data}>
  handleUIList(): Promise<{status: Number, data|error}>
  handleUIGet(data: Object): Promise<{status: Number, data|error}>
  handleUICreate(data: Object): Promise<{status: Number, data|error}>
  handleUIUpdate(data: Object): Promise<{status: Number, data|error}>
  handleUIDelete(data: Object): Promise<{status: Number, data|error}>
  handleUIActivate(data: Object): Promise<{status: Number, data|error}>
  handleUIDeactivate(data: Object): Promise<{status: Number, data|error}>
  handleUISaveSession(data: Object): Promise<{status: Number, data|error}>
  handleUIRestoreSession(data: Object): Promise<{status: Number, data|error}>
  handleUISetAIConfig(data: Object): Promise<{status: Number, data|error}>
  handleUISetLastConversation(data: Object): Promise<{status: Number, data|error}>
  handleUIGetDefaultConversation(data: Object): Promise<{status: Number, data|error}>
  handleUIGetUnassigned(data: Object): Promise<{status: Number, data|error}>
  handleUIListFeatures(data: Object): Promise<{status: Number, data|error}>
  handleUIAddFeatures(data: Object): Promise<{status: Number, data|error}>
}

CLASE ProjectManagerModule HEREDA BaseModule IMPLEMENTA ProjectManagerContract {
  ATRIBUTOS {
    name: String = 'project-manager'
    version: String = '4.0.0'
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    uiHandler: UIRequestHandler
    config: Object
    projects: Map<projectId: String, Project>
    activeProjectIds: Set<String>
    pendingDbRequests: Map<requestId: String, {resolve: Function, reject: Function, timeout: Number}>
    pendingCompositionRequests: Map<requestId: String, {resolve: Function, reject: Function, timeout: Number}>
    pendingDefaultConversations: Map<conversationId: String, {timestamp: Number}>
    projectsBasePath: String
  }

  TIPO_Project {
    id: String
    name: String
    description: String
    created_at: String
    updated_at: String
    is_active: Boolean
    metadata: Object
    last_conversation_id: String | Null
    provider: String | Null
    model: String | Null
    prompt_id: String | Null
    base_path: String
    session_state: Object
    parent_project_id: String | Null
    system_id: String | Null
    system_role: String | Null
  }

  CONSTRUCTOR() {
    this.name = 'project-manager'
    this.version = '4.0.0'
    this.projects = new Map()
    this.activeProjectIds = new Set()
    this.pendingDbRequests = new Map()
    this.pendingCompositionRequests = new Map()
    this.pendingDefaultConversations = new Map()
  }

  METODOS_PRIVADOS {
    async _queryDb(query: String, params?: Array, readOnly?: Boolean, correlation_id?: String): Promise<Array>
      PUBLICA db.query.request
      ESPERA db.query.response o timeout
      RETORNA rows

    async _requestComposition(action: String, data: Object): Promise<Object>
      PUBLICA composition.request
      ESPERA composition.response o timeout
      RETORNA data

    async _initializeSystemSchema(): Promise<Void>
      CREA tabla projects si no existe
      COLUMNAS: id, name, description, created_at, updated_at, is_active, metadata,
                last_conversation_id, provider, model, prompt_id, base_path,
                session_state, system_id, system_role, parent_project_id

    async _loadExistingProjects(): Promise<Void>
      LEE SELECT * FROM projects
      CARGA en this.projects Map
      ACTUALIZA activeProjectIds segun is_active

    async _reactivateExistingProjects(): Promise<Void>
      PUBLICA project.activated para cada proyecto activo al arranque

    async _ensureSystemProject(): Promise<Project>
      BUSCA proyecto con is_system = true
      SI no existe, CREA:
        - INSERT INTO projects
        - INVOCA composition.request system.create
        - INVOCA composition.request entity.join
      RETORNA proyecto

    async _ensureDefaultProject(): Promise<Project>
      BUSCA primer proyecto no-system sin parent
      SI no existe, CREA 'Mi Proyecto' con bootstrap flag

    async _createProject({name, description?, metadata?, correlation_id?, options?}): Promise<Project>
      VALIDA name no vacio
      VALIDA no existe otro proyecto con ese name
      CREA directorio en disco
      INSERT INTO projects
      RETORNA objeto Project creado

    async _updateProject(projectId: String, updates: Object, correlation_id?: String): Promise<Project>
      BUSCA proyecto en this.projects
      ACTUALIZA campos permitidos
      UPDATE projects WHERE id = ?
      PUBLICA project.updated

    async _deleteProject(projectId: String, correlation_id?: String): Promise<Void>
      BUSCA proyecto
      DELETE FROM projects WHERE id = ?
      LIMPIA directorio de disco
      PUBLICA project.deleted

    async _activateProject(projectId: String, correlation_id?: String): Promise<Project>
      BUSCA proyecto
      UPDATE projects SET is_active = 1
      AGREGA a activeProjectIds
      PUBLICA project.activated

    async _deactivateProject(projectId: String, correlation_id?: String): Promise<Project>
      BUSCA proyecto
      UPDATE projects SET is_active = 0
      ELIMINA de activeProjectIds
      PUBLICA project.deactivated

    _projectNameExists(name: String): Promise<Boolean>
      BUSCA en this.projects si existe nombre duplicado

    async _createProjectDirectories(projectId: String, name: String): Promise<String>
      CREA directorio en {projectsBasePath}/{projectId}
      RETORNA base_path

    _rowToProject(row: Object): Project
      MAPEA fila SQL a objeto Project

    async _publishState(correlation_id?: String): Promise<Void>
      PUBLICA project.state con snapshot de todos los proyectos + activeIds

    async _publicarEvento(name: String, payload: Object, sourcePayload?: Object): Promise<Void>
      CANONIZA correlation_id + project_id + timestamp
      PUBLICA en eventBus
  }

  EVENTOS_PUBLICADOS {
    project.created: {project_id, name, description, created_at, correlation_id, timestamp}
    project.updated: {project_id, updated_fields, correlation_id, timestamp}
    project.deleted: {project_id, correlation_id, timestamp}
    project.activated: {project_id, name, base_path, metadata, correlation_id, timestamp}
    project.deactivated: {project_id, correlation_id, timestamp}
    project.state: {projects: Array<Project>, active_ids: Set, timestamp}
  }

  RELACIONES {
    DEPENDE_DE: EventBus, Logger, Metrics, UIRequestHandler, database-manager (via db.query.request), composition-manager (via composition.request)
    CONSUMIDO_POR: chat-io, project-based-modules
    BOOTSTRAP: Crea 'Sistema' + 'Mi Proyecto' en onLoad
  }
}
```

---

## 3. PROMPT-BUILDER

```
INTERFAZ PromptBuilderContract {
  onLoad(context: Object): Promise<Void>
  onUnload(): Promise<Void>
  onMessageSaved(event: Object): Promise<Void>
  onContextEnriched(event: Object): Promise<Void>
  onPromptListResponse(event: Object): Promise<Void>
  onPromptUpserted(event: Object): Promise<Void>
  onPromptDeleted(event: Object): Promise<Void>
  onDbQueryResponse(event: Object): Void
}

CLASE PromptBuilderModule HEREDA BaseModule IMPLEMENTA PromptBuilderContract {
  ATRIBUTOS {
    name: String = 'prompt-builder'
    version: String = '2.0.0'
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    _modulesDir: String
    _base: Object | Null
    _modulePrompts: Map<moduleName: String, promptJson: Object>
    _moduleContexts: Map<moduleName: String, contextJson: Object>
    _userPrompts: Map<promptId: String, {id, name, content, ...}>
    pendingDb: Map<requestId: String, {resolve, reject, timeout}>
    _pendingEnrichments: Map<messageId: String, {enrichment, priority, timeout}>
    _listRequestId: String | Null
  }

  CONSTRUCTOR() {
    this.name = 'prompt-builder'
    this.version = '2.0.0'
    this._modulePrompts = new Map()
    this._moduleContexts = new Map()
    this._userPrompts = new Map()
    this.pendingDb = new Map()
    this._pendingEnrichments = new Map()
  }

  METODOS_PRIVADOS {
    _loadBase(): Void
      LEE {modulesDir}/conversacion/_shared/base.prompt.json
      GUARDA en this._base

    _scanModules(dir: String, prefix: String): Void
      RECURSIVO: LEE directorios en modules/
      BUSCA {moduleName}/prompt.json + context.json + base.prompt.json
      GUARDA en _modulePrompts + _moduleContexts
      SOPORTA anidamiento

    _requestUserPrompts(): Void
      PUBLICA prompt.list.request
      ESPERA prompt.list.response

    async _resolvePrompt(promptId?: String): Promise<String>
      SI promptId uuid → busca en _userPrompts
      SI null → retorna module prompt
      RETORNA el contenido del prompt

    async _buildSystemPrompt(chat: Object, basePrompt?: String): Promise<String>
      CONSTRUYE: base + context.json + user_prompt + chat_context
      AGREGA enriquecimientos por priority
      RETORNA string completo

    async _loadChatContext(conversationId: String, contextWindow?: Number): Promise<String>
      PUBLICA db.query.request para obtener messages activos
      ORDENA por created_at
      LIMITA a context_window
      RETORNA historial en formato chat

    async _ensureSchema(projectId: String): Promise<Void>
      PUBLICA db.query.request para CREATE TABLE conversations + messages

    _resolveModule(slug: String): String | Null
      MAPEA slug a moduleName si existe en _modulePrompts

    async _publicarEvento(name: String, payload: Object, sourcePayload?: Object): Promise<Void>
      CANONIZA correlation_id + timestamp
      PUBLICA en eventBus
  }

  EVENTOS_PUBLICADOS {
    chat.prompt.ready: {
      project_id, conversation_id, message_id, system_prompt, context_window,
      correlation_id, timestamp
    }
    prompt.list.request: {}
    db.query.request: {request_id, query, params, project_id, correlation_id}
  }

  RELACIONES {
    DEPENDE_DE: EventBus, Logger, Metrics, database-manager, prompt-manager
    CONSUMIDO_POR: ai-gateway (recibe chat.prompt.ready)
    REQUIERE: _shared/base.prompt.json, modules/{*/prompt.json, context.json}
  }
}
```

---

## 4. CHAT-IO

```
INTERFAZ ChatIoContract {
  onLoad(context: Object): Promise<Void>
  onUnload(): Promise<Void>
  onAiResponse(event: Object): Promise<Void>
  onAiFailed(event: Object): Promise<Void>
  onDbQueryResponse(event: Object): Void
  onProjectActivated(event: Object): Promise<Void>
  onChatAssistantSavedFromAgent(event: Object): Promise<Void>
  handleSend(data: Object): Promise<{status: Number, data|error}>
  handleCreate(data: Object): Promise<{status: Number, data|error}>
  handleList(data: Object): Promise<{status: Number, data|error}>
  handleLoad(data: Object): Promise<{status: Number, data|error}>
  handleDelete(data: Object): Promise<{status: Number, data|error}>
  handleUpdateSettings(data: Object): Promise<{status: Number, data|error}>
  handleToggleContext(data: Object): Promise<{status: Number, data|error}>
  handleContextStats(data: Object): Promise<{status: Number, data|error}>
}

CLASE ChatIoModule HEREDA BaseModule IMPLEMENTA ChatIoContract {
  ATRIBUTOS {
    name: String = 'chat-io'
    version: String = '2.0.0'
    logger: Logger
    metrics: Metrics
    eventBus: EventBus
    mqtt: MQTTClient | Null
    pendingDb: Map<requestId: String, {resolve, reject, timeout}>
    schemaReady: Set<projectId: String>
    knownConversations: Map<conversationId: String, {projectId, title, updated_at}>
  }

  TIPO_Conversation {
    id: String
    project_id: String
    title: String | Null
    context_window: Number = 20
    temperature: Number = 0.7
    max_tokens: Number = 2000
    prompt_id: String | Null
    created_at: Number
    updated_at: Number
  }

  TIPO_Message {
    id: String
    conversation_id: String
    role: 'user' | 'assistant' | 'system' | 'tool'
    content: String
    in_context: Boolean = true
    manually_toggled: Boolean = false
    tokens: Number | Null
    cost: Number | Null
    metadata: Object | Null
    created_at: Number
  }

  CONSTRUCTOR() {
    this.name = 'chat-io'
    this.version = '2.0.0'
    this.pendingDb = new Map()
    this.schemaReady = new Set()
    this.knownConversations = new Map()
  }

  METODOS_PRIVADOS {
    async _ensureSchema(projectId: String): Promise<Void>
      SI projectId en schemaReady: RETORNA
      PUBLICA db.query.request para CREATE TABLE conversations + messages
      AGREGA projectId a schemaReady

    async _queryDb(projectId: String, query: String, params?: Array, readOnly?: Boolean, correlation_id?: String): Promise<Array>
      PUBLICA db.query.request
      ESPERA db.query.response o timeout
      RETORNA rows

    async _createConversation(projectId: String, title?: String): Promise<Conversation>
      INSERT INTO conversations
      RETORNA objeto creado

    async _loadConversation(conversationId: String): Promise<Conversation>
      SELECT FROM conversations WHERE id = ?
      RETORNA objeto

    async _listConversations(projectId: String): Promise<Array<Conversation>>
      SELECT FROM conversations WHERE project_id = ? ORDER BY updated_at DESC
      RETORNA array

    async _deleteConversation(conversationId: String): Promise<Void>
      DELETE FROM conversations + messages WHERE conversation_id = ?

    async _saveMessage(conversationId: String, role: String, content: String, metadata?: Object): Promise<Message>
      INSERT INTO messages
      RETORNA objeto creado

    async _loadMessages(conversationId: String, limit?: Number): Promise<Array<Message>>
      SELECT FROM messages WHERE conversation_id = ? ORDER BY created_at

    async _applyContextFIFO(conversationId: String, contextWindow: Number): Promise<Void>
      CALCULA cuantos mensajes caben en context_window
      UPDATE messages SET in_context = 0 para los antiguos
      UPDATE messages SET in_context = 1 para los recientes

    async _getContextStats(conversationId: String): Promise<{in_context: Number, total: Number, tokens: Number}>
      CALCULA estadisticas del contexto activo

    async _toggleMessageContext(messageId: String, inContext: Boolean): Promise<Void>
      UPDATE messages SET in_context = ?, manually_toggled = 1

    _userMessageForErrorCode(errorCode: String): String
      MAPEA error codes a mensajes legibles para el usuario

    async _publishToChannel(channelContext: Object, message: String): Promise<Void>
      PUBLICA respuesta al canal de origen (MQTT conversation/{id}/message)

    async _publicarEvento(name: String, payload: Object, sourcePayload?: Object): Promise<Void>
      CANONIZA correlation_id + project_id + timestamp
      PUBLICA en eventBus
  }

  EVENTOS_PUBLICADOS {
    chat.message.saved: {
      project_id, conversation_id, message_id, user_message, correlation_id, timestamp
    }
    chat.assistant.saved: {
      project_id, conversation_id, message_id, assistant_message, correlation_id, timestamp
    }
    db.query.request: {request_id, query, params, project_id, correlation_id}
  }

  RELACIONES {
    DEPENDE_DE: EventBus, Logger, Metrics, UIRequestHandler, MQTTClient, database-manager
    CONSUMIDO_POR: prompt-builder, ai-gateway, memory-* modules
    PUBLICA_PARA: chat.message.saved (trigger del flujo chat), chat.assistant.saved (enriquecimiento)
  }
}
```

---

## 5. MEMORY-CONVERSATION-SUMMARY

```
INTERFAZ MemoryConversationSummaryContract {
  onLoad(context: Object): Promise<Void>
  onUnload(): Promise<Void>
  onMessageSaved(event: Object): Promise<Void>
  onDbQueryResponse(event: Object): Void
  onLlmResponse(event: Object): Void
  onLlmFailed(event: Object): Void
}

CLASE MemoryConversationSummaryModule HEREDA BaseModule IMPLEMENTA MemoryConversationSummaryContract {
  ATRIBUTOS {
    name: String = 'memory-conversation-summary'
    version: String = '2.0.0'
    logger: Logger
    eventBus: EventBus
    metrics: Metrics | Null
    config: Object
    pendingDb: Map<requestId: String, {resolve, reject, timeout}>
    pendingLlm: Map<requestId: String, {resolve, reject, timeout}>
    schemaReady: Set<projectId: String>
    messageCounters: Map<conversationId: String, Number>
    summaryInFlight: Set<conversationId: String>
  }

  TIPO_Summary {
    conversation_id: String
    user_id: String
    summary: String
    last_message_id: String
    message_count_at_summary: Number
    updated_at: Number
  }

  CONSTRUCTOR() {
    this.name = 'memory-conversation-summary'
    this.version = '2.0.0'
    this.pendingDb = new Map()
    this.pendingLlm = new Map()
    this.schemaReady = new Set()
    this.messageCounters = new Map()
    this.summaryInFlight = new Set()
  }

  METODOS_PRIVADOS {
    async _ensureSchema(projectId: String): Promise<Void>
      PUBLICA db.query.request para CREATE TABLE conversation_summaries

    async _queryDb(projectId: String, query: String, params?: Array, correlation_id?: String): Promise<Array>
      PUBLICA db.query.request
      ESPERA db.query.response o timeout

    async _getCurrentSummary(projectId: String, conversationId: String): Promise<Summary | Null>
      SELECT FROM conversation_summaries WHERE conversation_id = ?

    async _saveSummary(projectId: String, summary: Summary): Promise<Void>
      INSERT OR REPLACE INTO conversation_summaries

    async _requestLlmSummary(projectId: String, conversationId: String, messageIds: Array<String>, messages: Array<Object>, correlation_id?: String): Promise<String>
      PUBLICA llm.complete.request con prompt de resumen
      ESPERA llm.complete.response o timeout
      RETORNA resumen generado

    _shouldSummarize(messageCount: Number): Boolean
      RETORNA true SI messageCount >= config.summarize_after_messages

    async _publicarEvento(name: String, payload: Object, sourcePayload?: Object): Promise<Void>
      CANONIZA correlation_id + project_id + priority + timestamp
      PUBLICA en eventBus
  }

  EVENTOS_PUBLICADOS {
    chat.context.enriched: {
      project_id, conversation_id, message_id, context_type: 'conversation_summary',
      summary, priority: 200, correlation_id, timestamp
    }
    db.query.request: {request_id, query, params, project_id, correlation_id}
    llm.complete.request: {request_id, project_id, system_prompt, messages, model, correlation_id}
  }

  RELACIONES {
    DEPENDE_DE: EventBus, Logger, Metrics, database-manager, ai-gateway
    CONSUMIDO_POR: prompt-builder (via chat.context.enriched)
    ESCUCHA: chat.message.saved, llm.complete.response
    PRIORITY_IN_PROMPT: 200 (narrativa, antes de perfil 100, despues de RAG 500)
  }
}
```

---

## 6. AGENT-OBSERVER

```
INTERFAZ AgentObserverContract {
  onLoad(context: Object): Promise<Void>
  onUnload(): Promise<Void>
  onAgentExecuteRequest(event: Object): Promise<Void>
  onAgentExecuteProgress(event: Object): Promise<Void>
  onAgentExecuteResponse(event: Object): Promise<Void>
  onAgentExecuteFailed(event: Object): Promise<Void>
}

CLASE AgentObserverModule HEREDA BaseModule IMPLEMENTA AgentObserverContract {
  ATRIBUTOS {
    name: String = 'agent-observer'
    version: String = '2.0.0'
    logger: Logger
    eventBus: EventBus
    metrics: Metrics | Null
    config: Object
    openCards: Map<requestId: String, {
      status: 'open' | 'closed' | 'failed',
      steps: Array<{step, label, timestamp}>,
      result?: String,
      error?: {code, message}
    }>
  }

  CONSTRUCTOR() {
    this.name = 'agent-observer'
    this.version = '2.0.0'
    this.openCards = new Map()
  }

  METODOS_PRIVADOS {
    async _publishCard(
      requestId: String,
      agentName: String,
      conversationId: String,
      status: 'open' | 'progress' | 'closed' | 'failed',
      stepOrResult?: String,
      error?: Object,
      sourcePayload?: Object
    ): Promise<Void>
      CONSTRUYE chat.assistant.saved CON metadata.block.type='agent_intervention'
      PUBLICA en eventBus

    _truncate(text: String, maxChars: Number): String
      RETORNA texto truncado si excede maxChars

    _stepLabel(step: String): String
      MAPEA step a etiqueta legible (thinking → 'pensando', etc.)

    async _publicarEvento(name: String, payload: Object, sourcePayload?: Object): Promise<Void>
      CANONIZA correlation_id + project_id + timestamp
      PUBLICA en eventBus
  }

  EVENTOS_PUBLICADOS {
    chat.assistant.saved: {
      project_id, conversation_id, message_id, assistant_message, metadata: {
        author: {kind: 'agent', name: agentName},
        block: {type: 'agent_intervention', status: 'open|closed|failed', steps}
      },
      correlation_id, timestamp
    }
  }

  RELACIONES {
    DEPENDE_DE: EventBus, Logger, Metrics
    CONSUMIDO_POR: chat-io (via chat.assistant.saved)
    ESCUCHA: agent.execute.request|progress|response|failed (agent-flow canonico)
    POLITICA: fail-silent si no hay conversation_id (agentes silenciosos en bg)
  }
}
```

---

## 7. MEMORY-USER-PROFILE

```
INTERFAZ MemoryUserProfileContract {
  onLoad(context: Object): Promise<Void>
  onUnload(): Promise<Void>
  onMessageSaved(event: Object): Promise<Void>
  onDbQueryResponse(event: Object): Void
}

CLASE MemoryUserProfileModule HEREDA BaseModule IMPLEMENTA MemoryUserProfileContract {
  ATRIBUTOS {
    name: String = 'memory-user-profile'
    version: String = '2.0.0'
    logger: Logger
    eventBus: EventBus
    metrics: Metrics | Null
    config: Object
    pendingDb: Map<requestId: String, {resolve, reject, timeout}>
    schemaReady: Set<projectId: String>
  }

  TIPO_Fact {
    id: String (UUID)
    user_id: String
    fact: String (ej. "el usuario se llama Juan")
    source_message_id: String
    conversation_id: String
    created_at: Number
  }

  CONSTANTE PATTERNS: Array<{rx: RegExp, fmt: Function}>
    REGEX para extraer: nombre, ubicacion, trabajo, gustos, alergias, edad, etc.
    FORMATOS: "el usuario se llama {nombre}", "el usuario trabaja en {empresa}", etc.

  CONSTRUCTOR() {
    this.name = 'memory-user-profile'
    this.version = '2.0.0'
    this.pendingDb = new Map()
    this.schemaReady = new Set()
  }

  METODOS_PRIVADOS {
    async _ensureSchema(projectId: String): Promise<Void>
      PUBLICA db.query.request para CREATE TABLE user_profile_facts

    async _queryDb(projectId: String, query: String, params?: Array, correlation_id?: String): Promise<Array>
      PUBLICA db.query.request
      ESPERA db.query.response o timeout

    _extractFacts(text: String): Array<String>
      APLICA PATTERNS al texto
      RETORNA array de hechos extraidos

    async _saveFacts(projectId: String, userId: String, facts: Array<String>): Promise<Void>
      PARA cada fact:
        INSERT INTO user_profile_facts (deduplicado por UNIQUE(user_id, fact))

    async _getAllFacts(projectId: String, userId: String): Promise<Array<Fact>>
      SELECT FROM user_profile_facts WHERE user_id = ? ORDER BY created_at

    async _publicarEvento(name: String, payload: Object, sourcePayload?: Object): Promise<Void>
      CANONIZA correlation_id + project_id + priority + timestamp
      PUBLICA en eventBus
  }

  EVENTOS_PUBLICADOS {
    chat.context.enriched: {
      project_id, conversation_id, message_id, context_type: 'user_profile',
      facts: Array<String>, priority: 100, correlation_id, timestamp
    }
    db.query.request: {request_id, query, params, project_id, correlation_id}
  }

  RELACIONES {
    DEPENDE_DE: EventBus, Logger, Metrics, database-manager
    CONSUMIDO_POR: prompt-builder (via chat.context.enriched)
    ESCUCHA: chat.message.saved
    PRIORITY_IN_PROMPT: 100 (perfil, antes de summary 200, despues de RAG 500)
  }
}
```

---

## 8. MEMORY-RAG

```
INTERFAZ MemoryRagContract {
  onLoad(context: Object): Promise<Void>
  onUnload(): Promise<Void>
  onMessageSaved(event: Object): Promise<Void>
  onAiChatResponse(event: Object): Promise<Void>
  onEmbeddingResponse(event: Object): Void
  onEmbeddingFailed(event: Object): Void
  onDbQueryResponse(event: Object): Void
}

CLASE MemoryRagModule HEREDA BaseModule IMPLEMENTA MemoryRagContract {
  ATRIBUTOS {
    name: String = 'memory-rag'
    version: String = '2.0.0'
    logger: Logger
    eventBus: EventBus
    metrics: Metrics | Null
    config: Object
    pendingDb: Map<requestId: String, {resolve, reject, timeout}>
    pendingEmbeddings: Map<requestId: String, {resolve, reject, timeout}>
    schemaReady: Set<projectId: String>
    vectorCache: Map<key: String, Array<Number>>
  }

  TIPO_RagMessage {
    id: String (UUID)
    conversation_id: String
    user_id: String
    role: 'user' | 'assistant'
    content: String
    vector: BLOB (binario)
    dimensions: Number
    model: String
    provider: String
    created_at: Number
  }

  CONSTRUCTOR() {
    this.name = 'memory-rag'
    this.version = '2.0.0'
    this.pendingDb = new Map()
    this.pendingEmbeddings = new Map()
    this.schemaReady = new Set()
    this.vectorCache = new Map()
  }

  METODOS_PRIVADOS {
    async _ensureSchema(projectId: String): Promise<Void>
      PUBLICA db.query.request para CREATE TABLE rag_messages

    async _queryDb(projectId: String, query: String, params?: Array, correlation_id?: String): Promise<Array>
      PUBLICA db.query.request
      ESPERA db.query.response o timeout

    async _requestEmbedding(projectId: String, text: String, provider?: String, model?: String): Promise<Array<Number>>
      PUBLICA embedding.generate.request
      ESPERA embedding.generate.response o timeout
      RETORNA vector como Array<Number>

    async _indexMessage(projectId: String, userId: String, conversationId: String, role: String, content: String, messageId: String, correlation_id?: String): Promise<Void>
      VALIDA content.length > min_length
      SOLICITA embedding del contenido
      INSERT INTO rag_messages CON vector como BLOB
      CARGA vector en vectorCache[key]

    async _searchSimilar(projectId: String, userId: String, queryVector: Array<Number>, topK: Number, minSimilarity: Number): Promise<Array<{content, similarity}>>
      CALCULA cosine similarity contra todos los vectores en cache
      RETORNA top-K resultados con similarity >= minSimilarity

    _cosineSimilarity(a: Array<Number>, b: Array<Number>): Number
      CALCULA dot(a, b) / (norm(a) * norm(b))

    async _publicarEvento(name: String, payload: Object, sourcePayload?: Object): Promise<Void>
      CANONIZA correlation_id + project_id + priority + timestamp
      PUBLICA en eventBus
  }

  EVENTOS_PUBLICADOS {
    chat.context.enriched: {
      project_id, conversation_id, message_id, context_type: 'rag',
      snippets: Array<{content, similarity, role}>, priority: 500,
      correlation_id, timestamp
    }
    embedding.generate.request: {request_id, text, provider, model, project_id, correlation_id}
    db.query.request: {request_id, query, params, project_id, correlation_id}
  }

  RELACIONES {
    DEPENDE_DE: EventBus, Logger, Metrics, database-manager, ai-gateway (embeddings)
    CONSUMIDO_POR: prompt-builder (via chat.context.enriched)
    ESCUCHA: chat.message.saved, ai.chat.response, embedding.generate.response
    PRIORITY_IN_PROMPT: 500 (RAG semantico, mayor que profile 100/summary 200)
    AISLAMIENTO: (project_id, user_id) obligatorio
  }
}
```

---

## 9. AI-AGENT-FRAMEWORK

```
INTERFAZ AiAgentFrameworkContract {
  onLoad(context: Object): Promise<Void>
  onUnload(): Promise<Void>
  onInvokeAgent(event: Object): Promise<Void>
  onAgentExecuteRequest(event: Object): Promise<Void>
  onLlmCompleteResponse(event: Object): Void
  onLlmCompleteFailed(event: Object): Void
}

CLASE AiAgentFrameworkModule HEREDA BaseModule IMPLEMENTA AiAgentFrameworkContract {
  ATRIBUTOS {
    name: String = 'ai-agent-framework'
    version: String = '2.0.0'
    logger: Logger
    eventBus: EventBus
    metrics: Metrics | Null
    moduleLoader: ModuleLoader | Null
    config: Object
    agents: Map<agentName: String, {
      name, description, system_prompt, tools, model, provider, temperature, max_tokens
    }>
    basePromptText: String | Null
    pendingLlm: Map<requestId: String, {
      resolve, reject, timeout, shape: 'agent_flow' | 'invoke_agent'
    }>
    _conversationCache: Map<conversationId: String, {timestamp, context}>
    _conversationCacheTTL: Number
  }

  TIPO_Agent {
    name: String
    description: String
    system_prompt: String
    tools: Array<String>
    model: String
    provider: String
    temperature: Number = 0.7
    max_tokens: Number = 2000
  }

  CONSTRUCTOR() {
    this.name = 'ai-agent-framework'
    this.version = '2.0.0'
    this.agents = new Map()
    this.pendingLlm = new Map()
    this._conversationCache = new Map()
  }

  METODOS_PRIVADOS {
    _loadBasePrompt(): Void
      LEE {modulesDir}/conversacion/_shared/base.prompt.json
      GUARDA en this.basePromptText

    _loadAgents(): Void
      ESCANEA {modulesDir}/conversacion/ai-agent-framework/agents/*.json
      CARGA cada agente en this.agents Map

    _registerInvokeAgentTool(): Void
      REGISTRA tool 'invoke_agent' en moduleLoader.toolsRegistry
      INVOCA onInvokeAgent cuando se llama desde el LLM

    async _executeAgent(agentName: String, input: Object, conversationId?: String, correlation_id?: String): Promise<Object>
      BUSCA agent en this.agents
      CONSTRUYE system_prompt del agente
      PUBLICA llm.complete.request
      ESPERA llm.complete.response o timeout
      RETORNA result o rechaza

    _cacheConversationContext(conversationId: String, context: Object): Void
      GUARDA en _conversationCache con timestamp
      LIMPIA entradas expiradas (> TTL)

    async _publicarEvento(name: String, payload: Object, sourcePayload?: Object): Promise<Void>
      CANONIZA correlation_id + project_id + timestamp
      PUBLICA en eventBus
  }

  EVENTOS_PUBLICADOS {
    agent.execute.response: {
      project_id, request_id, agent_name, result, correlation_id, timestamp
    }
    agent.execute.failed: {
      project_id, request_id, agent_name, error: {code, message},
      correlation_id, timestamp
    }
    agent.execute.progress: {
      project_id, request_id, agent_name, step, correlation_id, timestamp
    }
    invoke_agent.response: {
      request_id, result | error, correlation_id, timestamp
    }
    llm.complete.request: {
      request_id, system_prompt, messages, model, provider, tools,
      correlation_id, timestamp
    }
  }

  RELACIONES {
    DEPENDE_DE: EventBus, Logger, Metrics, ModuleLoader, ai-gateway
    CONSUMIDO_POR: agent-observer (adapta a chat-flow), chat-io
    ESCUCHA: invoke_agent (LLM tool flow legacy), agent.execute.request (canonical)
    CARGA: {modulesDir}/agents/*.json + prompts/*.{json,md}
  }
}
```

---

## 10. AI-GATEWAY

```
INTERFAZ AiGatewayContract {
  onLoad(context: Object): Promise<Void>
  onUnload(): Promise<Void>
  onChatPromptReady(event: Object): Promise<Void>
  onLlmCompleteRequest(event: Object): Promise<Void>
  onEmbeddingGenerateRequest(event: Object): Promise<Void>
  onCredentialResponse(event: Object): Void
  onCredentialSaved(event: Object): Void
  onCredentialDeleted(event: Object): Void
  onFsReadResponse(event: Object): Void
  handlePageRelated(params: Object): Promise<{status: Number, data|error}>
  handleChatCambiarFoco(params: Object): Promise<{status: Number, data|error}>
}

CLASE AiGatewayModule HEREDA BaseModule IMPLEMENTA AiGatewayContract {
  ATRIBUTOS {
    name: String = 'ai-gateway'
    version: String = '2.0.0'
    logger: Logger
    eventBus: EventBus
    metrics: Metrics | Null
    moduleLoader: ModuleLoader | Null
    config: Object
    providers: Map<providerName: String, ProviderInstance>
    credentialCache: Map<key: String, {apiKey, resolvedAt, projectId}>
    pendingCredentials: Map<requestId: String, {resolve, reject, timeout}>
    pendingFsReads: Map<requestId: String, {resolve, reject, timeout}>
    pagePrefixes: Map<pageId: String, Set<prefix: String>> | Null
    blueprintModules: Map<pageId: String, {
      manifest, parentBlueprint, childBlueprint, systemPrompt
    }>
    cajonesCatalog: Map<pageId: String, Array<{nombre, descripcion}>>
    conversationCajones: Map<conversationId: String, Array<{nombre, turn}>>
    pageGraph: Map<pageId: String, {consumes: Set<String>, consumed_by: Set<String>}>
    conversationPageFoco: Map<conversationId: String, pageId: String>
    asyncSubscriptions: Map<eventName: String, Array<{pageId, handlerName, unsub}>>
    _modulesLoadedAllUnsub: Function | Null
  }

  TIPO_Provider {
    name: String
    priority: Number
    enabled: Boolean
    apiBase: String
    defaultModel: String
    models: Array<String>
    complete(options: Object): Promise<Object>
    embedding(options: Object): Promise<Array<Number>>
  }

  CONSTRUCTOR() {
    this.name = 'ai-gateway'
    this.version = '2.0.0'
    this.providers = new Map()
    this.credentialCache = new Map()
    this.pendingCredentials = new Map()
    this.pendingFsReads = new Map()
    this.blueprintModules = new Map()
    this.cajonesCatalog = new Map()
    this.conversationCajones = new Map()
    this.pageGraph = new Map()
    this.conversationPageFoco = new Map()
    this.asyncSubscriptions = new Map()
  }

  METODOS_PRIVADOS {
    async _initializeProviders(): Promise<Void>
      CARGA providers desde config (DeepSeek, Anthropic, OpenAI, Groq, Gemini, Ollama, Claude-CLI, Kimi)
      CREA instancias segun enabled + priority order

    _loadBlueprints(): Void
      ESCANEA loadedModules del moduleLoader
      BUSCA modulos con blueprint_driven = true
      EXTRAE manifest + system_prompt
      CARGA en blueprintModules Map
      RECONSTRUYE pageGraph

    _wireBlueprintAsyncSubscribers(): Void
      PARA cada blueprint: ESCANEA eventos_que_escucho en manifest
      REGISTRA subscribers asincronos en asyncSubscriptions

    async _executeLLM(
      systemPrompt: String,
      messages: Array<{role, content}>,
      tools?: Array<Object>,
      options?: {provider, model, temperature, maxTokens}
    ): Promise<{message, toolCalls}>
      SELECCIONA provider segun config + fallback order
      RESUELVE credential de provider
      INVOCA provider.complete() CON agentic loop
      EJECUTA tool calls via eventos {tool_name}
      RETORNA respuesta final

    async _resolveCredential(provider: String, projectId?: String): Promise<String>
      BUSCA en credentialCache
      SI no existe o expirado: PUBLICA credential.resolve.request
      ESPERA credential.resolve.response o timeout
      RETORNA api_key

    async _readAttachments(attachmentIds: Array<String>): Promise<Array<{id, content, mimeType}>>
      PUBLICA fs.read.request para cada attachment
      ESPERA fs.read.response o timeout
      RETORNA contenidos

    _selectProvider(provider?: String): ProviderInstance
      SI provider especificado: BUSCA en providers
      SINO: RETORNA provider de mayor priority habilitado

    _buildPagePrefixes(): Map<pageId: String, Set<String>>
      ESCANEA tools del moduleLoader
      AGRUPA por pageId (prefijo antes de punto)
      RETORNA mapa de prefijos

    _getPageRelated(pageId: String): Array<{pageId, manifest}>
      BUSCA en pageGraph pageId
      RETORNA {consumes, consumed_by}

    async _publicarEvento(name: String, payload: Object, sourcePayload?: Object): Promise<Void>
      CANONIZA correlation_id + project_id + timestamp
      PUBLICA en eventBus
  }

  EVENTOS_PUBLICADOS {
    ai.chat.response: {
      project_id, conversation_id, message_id, assistant_message, metadata,
      correlation_id, timestamp
    }
    ai.chat.failed: {
      project_id, conversation_id, message_id, error: {code, message},
      correlation_id, timestamp
    }
    llm.complete.response: {
      request_id, message, toolCalls, model, provider,
      correlation_id, timestamp
    }
    llm.complete.failed: {
      request_id, error: {code, message, details},
      correlation_id, timestamp
    }
    embedding.generate.response: {
      request_id, embedding: Array<Number>, dimensions, model, provider,
      correlation_id, timestamp
    }
    embedding.generate.failed: {
      request_id, error: {code, message},
      correlation_id, timestamp
    }
    credential.resolve.request: {request_id, provider, projectId}
    fs.read.request: {request_id, file_id}
  }

  RELACIONES {
    DEPENDE_DE: EventBus, Logger, Metrics, ModuleLoader, credential-manager (credenciales), database-manager
    CONSUMIDO_POR: chat-io, ai-agent-framework, memory-rag, memory-conversation-summary
    CARGA: 8 providers (DeepSeek, Anthropic, OpenAI, Groq, Gemini, Ollama, Claude-CLI, Kimi)
    TOOLS: page.related, chat.cambiar_foco
    PATTERN: agentic loop con retry + fallback
  }
}
```

---

## DIAGRAMA DE RELACIONES

```
credential-manager
  ├─ PROPORCIONA: credenciales en cascada (CUSTOM → CLIENT → PROJECT → GLOBAL)
  └─ CONSUMIDO_POR: ai-gateway (llama credential.resolve.request)

project-manager
  ├─ GESTIONA: ciclo de vida de proyectos (CRUD + activate/deactivate + session)
  ├─ PERSISTE: via database-manager (db.query.request)
  ├─ COORDINA: via composition-manager (composition.request)
  └─ BOOTSTRAP: 'Sistema' + 'Mi Proyecto' al arranque

prompt-builder
  ├─ ENTRADA: chat.message.saved (trigger del usuario)
  ├─ SALIDA: chat.prompt.ready (para ai-gateway)
  ├─ CACHE: prompts (usuario + módulos), contextos, base.prompt.json
  └─ ENRIQUECE_CON: chat.context.enriched (memorias módulares)

chat-io
  ├─ ENTRADA: ui_handlers (send, create, list, load, delete, update_settings, toggle_context)
  ├─ SALIDA: chat.message.saved, chat.assistant.saved
  ├─ PERSISTE: via database-manager (conversations + messages)
  ├─ APLICA: FIFO context window
  └─ RECIBE: ai.chat.response, ai.chat.failed

memory-conversation-summary (modular)
  ├─ ESCUCHA: chat.message.saved
  ├─ GENERA: resumen LLM al alcanzar threshold
  ├─ PUBLICA: chat.context.enriched (priority 200)
  └─ PERSISTE: conversation_summaries via database-manager

agent-observer (modular, adaptador agent-flow → chat-flow)
  ├─ ESCUCHA: agent.execute.request|progress|response|failed (agent-flow)
  ├─ PUBLICA: chat.assistant.saved (chat-flow) si conversation_id presente
  └─ POLITICA: fail-silent sin conversation_id

memory-user-profile (modular)
  ├─ ESCUCHA: chat.message.saved
  ├─ EXTRAE: facts via regex (nombre, ubicacion, trabajo, gustos)
  ├─ PUBLICA: chat.context.enriched (priority 100)
  └─ PERSISTE: user_profile_facts via database-manager

memory-rag (modular)
  ├─ ESCUCHA: chat.message.saved (user), ai.chat.response (assistant)
  ├─ INDEXA: genera embedding → persiste vector
  ├─ BUSCA: cosine similarity top-K en cada turno del usuario
  ├─ PUBLICA: chat.context.enriched (priority 500)
  └─ AISLAMIENTO: (project_id, user_id) obligatorio

ai-agent-framework
  ├─ CARGA: agents/*.json + prompts/*.{json,md}
  ├─ ENTRADA: agent.execute.request (canonical), invoke_agent (legacy LLM tool)
  ├─ SALIDA: agent.execute.response|failed|progress (agent-flow)
  ├─ EJECUTA: agentic loop via ai-gateway (llm.complete.request)
  └─ OPTIONAL: chat.assistant.saved si conversation_id (adaptado por agent-observer)

ai-gateway (ejecutor central del LLM)
  ├─ ENTRADA: chat.prompt.ready (flujo chat), llm.complete.request (genérico), embedding.generate.request (RAG)
  ├─ SALIDA: ai.chat.response|failed, llm.complete.response|failed, embedding.generate.response|failed
  ├─ PROVIDERS: DeepSeek, Anthropic, OpenAI, Groq, Gemini, Ollama, Claude-CLI, Kimi (con fallback)
  ├─ AGENTIC_LOOP: con retry + backoff, max_tool_iterations
  ├─ TOOLS: page.related (grafo de páginas), chat.cambiar_foco (foco dinámico)
  ├─ BLUEPRINTS: carga blueprint_driven modules, inyecta system_prompt + tools
  └─ CAJONES: particionamiento de contexto por dominio (Fase 5)

FLUJO_TIPICO {
  1. Usuario envía mensaje: ui/request/conversation/send
  2. chat-io.handleSend():
       - INSERT INTO messages (user)
       - PUBLICA chat.message.saved
  3. prompt-builder.onMessageSaved():
       - RESUELVE prompt (user | module)
       - CARGA historico activo (FIFO context_window)
       - RECOPILA chat.context.enriched (memory-user-profile 100 + summary 200 + rag 500)
       - PUBLICA chat.prompt.ready
  4. ai-gateway.onChatPromptReady():
       - CARGA tools (filtered por page_id si blueprint)
       - RESUELVE credencial LLM provider
       - EJECUTA agentic loop (LLM + tool calls)
       - PUBLICA ai.chat.response
  5. chat-io.onAiResponse():
       - INSERT INTO messages (assistant)
       - PUBLICA chat.assistant.saved
       - APLICA FIFO si necesario
  6. memory-rag.onAiChatResponse():
       - GENERA embedding del assistant_message
       - INDEXA en vector store
  7. Agent-observer + agent-observer.onChatAssistantSavedFromAgent():
       - SI metadata.author.kind='agent': persiste tarjeta colapsable
  8. Frontend recibe via MQTT conversation/{id}/message
}

PRIORITAS_EN_PROMPT {
  100   - memory-user-profile (perfil del usuario)
  200   - memory-conversation-summary (narrativa de la sesión)
  500   - memory-rag (snippets semánticos del historial)
  1000+ - especulativas / domain-specific
}

AISLAMIENTO_MULTI_TENANCY {
  project_id:   top-level en events, aislamiento de BD
  user_id:      aislamiento de perfil + cache RAG
  conversation_id: aislamiento de sesión
  correlation_id: trazabilidad de causalidad
}

NO_SILENT_FAILURES {
  credential-manager.resolve.response: error field explícito
  ai.chat.failed: error field + error_code canónico
  agent.execute.failed: error field + error_code canónico
  embedding.generate.failed: error field explícito
  llm.complete.failed: error field (par separado del success)
}
```
