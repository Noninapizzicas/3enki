---
id: conversacion/nucleo-conversacion
dominio: conversacion
resumen: project-manager, credential-manager y el grupo conversación: ai-gateway (+v2: cajones, RPC blueprints, nervios, foco), chat-io, memorias, prompt-builder, ai-agent-framework, agent-observer.
fuentes:
  - modules/conversacion/**
  - modules/project-manager/**
  - modules/credential-manager/**
verificado: 2026-07-06
---

# Módulos: Project-Manager, Credential-Manager y Conversación

## PROJECT-MANAGER

```
INTERFAZ ProjectManagerContract {
  createProject(data: {name, description, type?, tags?}): Promise<{project_id, ...}>
  getProject(project_id: String): Promise<Object>
  listProjects(filters?: Object): Promise<Array<Project>>
  updateProject(project_id: String, updates: Object): Promise<Object>
  deleteProject(project_id: String): Promise<Void>
  getProjectStats(project_id: String): Promise<Object>
  setActiveProject(project_id: String): Promise<Void>
  getActiveProject(): Promise<Project>
}

CLASE ProjectManager IMPLEMENTA ProjectManagerContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    metrics: Metrics
    uiHandler: UIRequestHandler
    moduleRegistry: ModuleRegistry
    projectsStore: Map<project_id, Project>
    activeProject: String
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async createProject(data: {name, description, type?, tags?}): Promise<{project_id, ...}>
      VALIDA nombre no vacío
      GENERA project_id (UUID)
      CREA Project {project_id, name, description, type, tags, created_at, updated_at, status: 'active'}
      GUARDA EN projectsStore
      PERSISTE EN persistencia module
      EMITE project.created {project_id, name}
      RETORNA project

    async getProject(project_id: String): Promise<Object>
      BUSCA project EN projectsStore
      SI no existe: LANZA ProjectNotFoundError
      RETORNA project

    async listProjects(filters?: Object): Promise<Array<Project>>
      FILTRA projectsStore CON filters (name, type, tags, status)
      RETORNA Array ordenado POR updated_at DESC

    async updateProject(project_id: String, updates: Object): Promise<Object>
      VALIDA project existe
      MERGES updates CON proyecto existente
      SETEA updated_at = now()
      GUARDA EN projectsStore
      PERSISTE cambios
      EMITE project.updated {project_id, updates}
      RETORNA proyecto actualizado

    async deleteProject(project_id: String): Promise<Void>
      VALIDA proyecto existe
      SI activeProject == project_id: SETEA activeProject = null
      ELIMINA DE projectsStore
      PERSISTE cambios
      EMITE project.deleted {project_id}

    async getProjectStats(project_id: String): Promise<Object>
      VALIDA proyecto existe
      CALCULA stats: {created_at, updated_at, modules_count, artifacts_count, tasks_count}
      RETORNA stats

    async setActiveProject(project_id: String): Promise<Void>
      VALIDA proyecto existe
      SETEA activeProject = project_id
      PERSISTE EN config
      EMITE project.activated {project_id}

    async getActiveProject(): Promise<Project>
      SI activeProject NO seteado: RETORNA null
      RETORNA getProject(activeProject)

    async onLoad(moduleContext: Object): Promise<Void>
      SUSCRIBE A project.* events
      REGISTRA UI handlers PARA create, list, update, delete, setActive
      LOG "project-manager.onLoad"

    async onUnload(): Promise<Void>
      UNSUSCRIBE todos los handlers
      PERSISTE projectsStore
      LOG "project-manager.onUnload"
  }

  EVENTO {
    project.created: {project_id, name, description, created_at}
    project.updated: {project_id, updates, updated_at}
    project.deleted: {project_id}
    project.activated: {project_id}
  }
}

CLASE Project {
  ATRIBUTOS {
    project_id: String
    name: String
    description: String
    type: String (default: 'general')
    tags: Array<String>
    created_at: Number
    updated_at: Number
    status: String ('active' | 'archived')
  }
}
```

## CREDENTIAL-MANAGER

```
INTERFAZ CredentialManagerContract {
  createCredential(data: {name, type, provider, secrets, scope?}): Promise<{credential_id, ...}>
  getCredential(credential_id: String): Promise<Credential>
  listCredentials(filters?: Object): Promise<Array<Credential>>
  updateCredential(credential_id: String, updates: Object): Promise<Object>
  deleteCredential(credential_id: String): Promise<Void>
  resolveCredential(credentialRef: String, context: Object): Promise<String|Object>
  validateCredential(credential_id: String): Promise<Boolean>
  testCredential(credential_id: String): Promise<{success: Boolean, message: String}>
  listCredentialTypes(): Promise<Array<CredentialType>>
}

CLASE CredentialManager IMPLEMENTA CredentialManagerContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    metrics: Metrics
    uiHandler: UIRequestHandler
    credentialsStore: Map<credential_id, Credential>
    credentialTypes: Map<type, CredentialType>
    resolutionCache: Map<key, value> (con TTL)
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async createCredential(data: {name, type, provider, secrets, scope?}): Promise<{credential_id, ...}>
      VALIDA type EN credentialTypes
      VALIDA provider existe
      VALIDA secrets estructura SEGÚN type schema
      GENERA credential_id (UUID)
      ENCRIPTA secrets CON core encryption key
      CREA Credential {credential_id, name, type, provider, secrets (encrypted), scope, created_at, status: 'unvalidated'}
      GUARDA EN credentialsStore
      PERSISTE cambios
      EMITE credential.created {credential_id, name, type, provider}
      RETORNA credential (secrets NO retornado)

    async getCredential(credential_id: String): Promise<Credential>
      BUSCA credential EN credentialsStore
      SI no existe: LANZA CredentialNotFoundError
      RETORNA credential (secrets NO incluido por seguridad)

    async listCredentials(filters?: Object): Promise<Array<Credential>>
      FILTRA credentialsStore CON filters (type, provider, scope, status)
      RETORNA Array SIN secrets

    async updateCredential(credential_id: String, updates: Object): Promise<Object>
      VALIDA credential existe
      SI updates.secrets: ENCRIPTA nuevos secrets
      MERGES updates CON credential existente
      SETEA updated_at = now()
      GUARDA EN credentialsStore
      PERSISTE cambios
      EMITE credential.updated {credential_id, fields_updated}
      RETORNA credential actualizado

    async deleteCredential(credential_id: String): Promise<Void>
      VALIDA credential existe
      ELIMINA DE credentialsStore
      LIMPIA resolutionCache PARA credential_id
      PERSISTE cambios
      EMITE credential.deleted {credential_id}

    async resolveCredential(credentialRef: String, context: Object): Promise<String|Object>
      SI credentialRef EN resolutionCache Y no expirado: RETORNA cached value
      SI credentialRef = credential_id: BUSCA credential, DESENCRIPTA secrets
      SI credentialRef = "{scope}:{provider}": BUSCA PRIMERA credential MATCHING
      SI context.project_id: FILTRA POR project scope SI aplica
      DESENCRIPTA secrets SI necesario
      GUARDA EN cache CON TTL=5min
      RETORNA desencriptado secrets

    async validateCredential(credential_id: String): Promise<Boolean>
      BUSCA credential
      EJECUTA test SEGÚN credential type
      SETEA status = 'validated' SI success
      EMITE credential.validated {credential_id, valid: true|false}
      RETORNA Boolean

    async testCredential(credential_id: String): Promise<{success: Boolean, message: String}>
      BUSCA credential
      SWITCH credential.type:
        'api_key': INTENTA HTTP request CON Authorization: "X-API-Key: {value}"
        'bearer_token': INTENTA HTTP request CON Authorization: "Bearer {value}"
        'basic_auth': INTENTA HTTP request CON Authorization: "Basic {b64(user:pass)}"
        'oauth2': INTENTA refresh token SI available
        'webhook_secret': MOCK test
        'certificate': VALIDA certificate expiry y formato
      RETORNA {success: true|false, message: String}

    async listCredentialTypes(): Promise<Array<CredentialType>>
      RETORNA credentialTypes.values()

    async onLoad(moduleContext: Object): Promise<Void>
      SUSCRIBE A credential.resolve request event
      REGISTRA UI handlers PARA create, list, update, delete, validate, test
      LOG "credential-manager.onLoad"

    async onUnload(): Promise<Void>
      UNSUSCRIBE todos handlers
      PERSISTE credentialsStore
      LIMPIA resolutionCache
      LOG "credential-manager.onUnload"
  }

  EVENTO {
    credential.created: {credential_id, name, type, provider}
    credential.updated: {credential_id, fields_updated}
    credential.deleted: {credential_id}
    credential.validated: {credential_id, valid: Boolean}
  }
}

CLASE Credential {
  ATRIBUTOS {
    credential_id: String
    name: String
    type: String ('api_key'|'bearer_token'|'basic_auth'|'oauth2'|'certificate'|'webhook_secret')
    provider: String
    secrets: Object (encrypted)
    scope: String ('global'|'project'|'team')
    created_at: Number
    updated_at: Number
    status: String ('unvalidated'|'validated'|'expired'|'revoked')
  }
}

CLASE CredentialType {
  ATRIBUTOS {
    name: String
    schema: JSONSchema
    testable: Boolean
    fields: Array<{name, type, required, sensitive}>
  }
}
```

## CONVERSACION - AI-GATEWAY

```
INTERFAZ AIGatewayContract {
  call(provider: String, model: String, messages: Array, options?: Object): Promise<Response>
  listProviders(): Promise<Array<ProviderInfo>>
  listModels(provider: String): Promise<Array<ModelInfo>>
  validateProvider(provider: String): Promise<Boolean>
  checkProviderStatus(provider: String): Promise<{available: Boolean, latency?: Number}>
}

CLASE AIGateway IMPLEMENTA AIGatewayContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    metrics: Metrics
    uiHandler: UIRequestHandler
    credentialManager: CredentialManager
    providers: Map<name, ProviderClient>
    supportedModels: Map<provider, Array<ModelInfo>>
    cache: CacheManager
    callStats: {total, by_provider, by_model, errors}
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async call(provider: String, model: String, messages: Array, options?: Object): Promise<Response>
      VALIDA provider existe Y disponible
      VALIDA model soportado EN provider
      BUSCA credential PARA provider (via credentialManager.resolveCredential)
      EMITE ai.call.start {provider, model, message_count}
      DELEGA a providerClient.call(model, messages, options)
      MANEJA response + errors
      EMITE ai.call.complete {provider, model, tokens_used, latency}
      INCREMENTA callStats
      RETORNA response

    async listProviders(): Promise<Array<ProviderInfo>>
      SI cache válido: RETORNA cached
      RETORNA [{name, available, latency?, models_count}]
      CACHE TTL=5min

    async listModels(provider: String): Promise<Array<ModelInfo>>
      SI cache válido: RETORNA cached
      VALIDA provider existe
      SI provider == 'ollama': BUSCA modelos DE ollama local
      SINO: RETORNA supportedModels[provider]
      CACHE TTL=1min

    async validateProvider(provider: String): Promise<Boolean>
      VALIDA credential existe PARA provider
      INTENTA test call
      RETORNA true SI success, false SI error

    async checkProviderStatus(provider: String): Promise<{available: Boolean, latency?: Number}>
      INTENTA ping/test call CON timeout 5s
      MIDE latencia
      RETORNA {available: true|false, latency?: Number}

    async onLoad(moduleContext: Object): Promise<Void>
      SUSCRIBE A ai.call events
      REGISTRA tools PARA AI agent
      REGISTRA UI handlers
      PARA cada provider: INICIALIZA client SI credential disponible
      LOG "ai-gateway.onLoad"

    async onUnload(): Promise<Void>
      UNSUSCRIBE handlers
      LIMPIA cache
      LOG "ai-gateway.onUnload"
  }

  EVENTO {
    ai.call.start: {provider, model, message_count, timestamp}
    ai.call.complete: {provider, model, tokens_used, latency, finish_reason}
    ai.call.error: {provider, model, error, context}
  }
}

ABSTRACT CLASE ProviderClient {
  ATRIBUTOS {
    name: String
    logger: Logger
    credentialManager: CredentialManager
  }

  ABSTRACT async call(model: String, messages: Array, options: Object): Promise<Response>
  ABSTRACT async listModels(): Promise<Array<ModelInfo>>
  ABSTRACT validateApiKey(): Promise<Boolean>
}
```

## CONVERSACION - AI-GATEWAY v2 — Cajones-internas · RPC blueprints · Nervio · Foco

> Métodos nuevos sobre la `CLASE AIGateway`.

```
CLASE AIGateway (ampliación) {
  ATRIBUTOS_NUEVOS {
    conversationPropioTs: Map<conversation_id, ts>    // nervio (ver Capa de Propiocepción)
  }

  METODOS_NUEVOS {

    // ── 1. CAJONES con INTERNAS (blueprint = clase: métodos públicos + privados)
    // El cajón público, al abrirse, trae adosados sus helpers privados. Sin esto
    // el LLM veía `_helper(...)` referenciado pero sin cuerpo → improvisaba.
    _bundleInternas(page_id, op): Array<{nombre, pseudocodigo, input, reglas_clave}>|Null
      declaradas ← op.usa_internas || []              // declaración EXPLÍCITA, sin regex
      RESUELVE transitivamente (guarda de ciclos) cada interna desde operaciones[]
      RETORNA out                                     // viajan SOLO adosadas a su op pública
    // cajon.abrir(nombre) ahora devuelve { pseudocodigo, reglas_clave, errores, input, internas }
    // Regla en el prompt: "las internas vienen incluidas; ejecútalas inline, NO las abras aparte".
    // Las internas (cajon:false / prefijo _) siguen FUERA del catálogo y no son abribles sueltas.

    // ── 2. RPC request/response ENTRE BLUEPRINTS (publishAndWait responde)
    // El mecanismo async-subscriber (turno sintético) extendido a request/response.
    // eventos_que_escucho acepta { evento, handler, responde: true }.
    async _handleBlueprintAsyncEvent({ page_id, handler_name, evento, event_payload,
                                        responde, response_event }):
      conv sintética (user_id='async-subscriber'); ejecuta el handler con el payload
      SI responde:
        el prompt sintético instruye: "publica <evento sin .request>.response con
        { request_id, status, data }" → el publishAndWait del caller resuelve
      SINO: fire-and-forget (notificación de un sentido)
    // Cada RPC = un turno LLM del módulo destino. Resuelto vía reflejo (ver Patrón Módulo Híbrido).

    // ── 3. NERVIO PROPIOCEPTIVO (ver sección Capa de Propiocepción)
    async _leerPropiocepcion(project_id, desde_ts): RPC a propiocepcion.leer (3s, best-effort)
    _composePropiocepcionSection(eventos): sección de contexto SILENCIOSO
    // _executeLLM inyecta la rebanada nueva en effectiveSystem SOLO en turno real con proyecto.

    // ── 4. chat.cambiar_foco CIERRA EL TURNO
    // El catálogo de cajones se construye al ARRANCAR el turno con la página anterior;
    // cambiar el foco no lo recarga en caliente. Por eso devuelve:
    //   { status, nuevo_page_id, cajones_activos_en: 'proximo_turno', instruccion }
    // instrucción: "NO abras cajones del page nuevo en este turno; cierra y ejecuta en el siguiente".
    // El catálogo de cajones del turno se fija al arrancar; el cambio de foco recarga en el siguiente.
    // El foco pegajoso se CONSUME tras un turno (el inmediato al cambio); después manda el page_id
    // del frontend → un foco viejo no secuestra la página cuando el usuario navega por la UI.

    // ── 5. max_tokens con SUELO
    chatOptions.max_tokens = Math.max(settings?.max_tokens || 0, 4096)   // floor, no default
    // Sube también las conversaciones existentes (que tienen 2000 guardado).
  }
}
```

```json
{
  "convenciones_blueprint_nuevas": {
    "usa_internas": "Array<nombre> en una op PÚBLICA: sus helpers privados (cajon:false/_) que cajon.abrir adosa. Resolución transitiva.",
    "eventos_que_escucho[].responde": "true → la op contesta el RPC de bus publicando <evento sin .request>.response con {request_id, status, data}.",
    "cajon:false": "op llamable por bus (RPC) pero NO expuesta como cajón al LLM de su página (frontera de módulo)."
  },
  "blueprints_actualizados": {
    "escandallo → CLASE EscandalloRecetas (blueprint-3.7.0)": {
      "cajones_publicos": ["calcular", "recalcular_siguiente"],
      "internos_cajon_false": ["_cargar_catalogo", "_cargar_receta", "_cargar_recetas", "_convertir", "_resolver_linea", "_costear", "_precio_de_mercadona", "_persistir"],
      "_costear": "núcleo DETERMINISTA (aritmética sobre catálogo+lineas, guarda de ciclos). El coste SIEMPRE sale de aquí, nunca de prosa.",
      "_precio_de_mercadona": "lo ÚNICO fuzzy; solo en calcular.",
      "recalcular_siguiente": "costea UNA receta pendiente por llamada (de una en una, orden topológico masa/salsa→pizza, reanudable hasta faltan=0). Reemplaza al viejo recalcular_todas (que reventaba el turno al intentar las N de golpe).",
      "_cargar_*": "publishAndWait('recetas.{ingredientes,listar,obtener}.request', {...}, {timeout_ms: 55000})  // el responder es un turno LLM"
    },
    "recetas (blueprint-2.4.0)": {
      "listar": "acepta incluir_lineas=true → devuelve lineas + coste_unidad.",
      "eventos_que_escucho": "+ {listar, ingredientes, obtener}.request con responde:true (RPC de bus)."
    }
  },
  "reflejo_determinista_lecturas_recetas": {
    "estado": "RESUELTO — ver Patrón Módulo Híbrido.",
    "resumen": "recetas (module 2.0.0/blueprint 2.6.0) y escandallo (2.0.0/3.8.0) son híbridos: lecturas+persist (recetas) y costeo (escandallo) los sirve el reflejo JS. Mismo contrato de bus. Medido: turno de escandallo 300K→42K tokens.",
    "siguiente": "mismo patrón a productos/categorias/ingredientes/tarifas."
  },
  "frontend_relacionado": "CLASE PageNavStrip (rail derecho de navegación entre páginas del recetario; tap → goto directo, sin chat.cambiar_foco) sustituye a SystemBar en AppShell/LazyShell. Ver sección Frontend."
}
```

---

## CONVERSACION - CHAT-IO

```
INTERFAZ ChatIOContract {
  createSession(data: {user_id, project_id?, system_prompt?}): Promise<{session_id, ...}>
  sendMessage(session_id: String, message: String, context?: Object): Promise<ChatMessage>
  getHistory(session_id: String, limit?: Number): Promise<Array<ChatMessage>>
  clearHistory(session_id: String): Promise<Void>
  getSession(session_id: String): Promise<ChatSession>
  listSessions(user_id: String): Promise<Array<ChatSession>>
  closeSession(session_id: String): Promise<Void>
}

CLASE ChatIO IMPLEMENTA ChatIOContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    metrics: Metrics
    uiHandler: UIRequestHandler
    aiGateway: AIGateway
    memoryManager: MemoryManager
    sessionsStore: Map<session_id, ChatSession>
    messagesStore: Map<session_id, Array<ChatMessage>>
    activeProviderConfig: {provider: String, model: String}
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async createSession(data: {user_id, project_id?, system_prompt?}): Promise<{session_id, ...}>
      GENERA session_id (UUID)
      CREA ChatSession {session_id, user_id, project_id, system_prompt, created_at, status: 'active'}
      GUARDA EN sessionsStore
      INICIALIZA messagesStore[session_id] = []
      PERSISTE
      EMITE chat.session.created {session_id, user_id, project_id}
      RETORNA session

    async sendMessage(session_id: String, message: String, context?: Object): Promise<ChatMessage>
      VALIDA session existe Y activa
      CREA user ChatMessage {id: UUID, role: 'user', content: message, created_at}
      AGREGA a messagesStore[session_id]
      EMITE chat.message.received {session_id, message_id}
      OBTIENE memory context
      CONSTRUYE messages array PARA AI
      EMITE chat.ai.call.start {session_id, message_id}
      INVOCA aiGateway.call(provider, model, messages, options)
      RECIBE response
      CREA assistant ChatMessage CON response
      AGREGA a messagesStore[session_id]
      ACTUALIZA memory
      PERSISTE messages
      EMITE chat.ai.call.complete {session_id, message_id, response_id}
      RETORNA assistant message

    async getHistory(session_id: String, limit?: Number): Promise<Array<ChatMessage>>
      VALIDA session existe
      RETORNA messagesStore[session_id].slice(-limit)

    async clearHistory(session_id: String): Promise<Void>
      VALIDA session existe
      BORRA messagesStore[session_id] = []
      PERSISTE
      EMITE chat.history.cleared {session_id}

    async getSession(session_id: String): Promise<ChatSession>
      VALIDA session existe
      RETORNA session CON {message_count: messagesStore[session_id].length}

    async listSessions(user_id: String): Promise<Array<ChatSession>>
      FILTRA sessionsStore POR user_id
      RETORNA Array ordenado POR updated_at DESC

    async closeSession(session_id: String): Promise<Void>
      VALIDA session existe
      SETEA session.status = 'closed'
      PERSISTE
      EMITE chat.session.closed {session_id}

    async onLoad(moduleContext: Object): Promise<Void>
      SUSCRIBE A chat.* events
      SUSCRIBE A memory.updated
      REGISTRA UI handlers
      CONECTA CON aiGateway Y memory modules
      LOG "chat-io.onLoad"
  }

  EVENTO {
    chat.session.created: {session_id, user_id, project_id, created_at}
    chat.session.closed: {session_id}
    chat.message.received: {session_id, message_id, content}
    chat.ai.call.start: {session_id, message_id}
    chat.ai.call.complete: {session_id, message_id, response_id, tokens}
    chat.history.cleared: {session_id}
  }
}

CLASE ChatSession {
  ATRIBUTOS {
    session_id: String
    user_id: String
    project_id: String (optional)
    system_prompt: String (optional)
    created_at: Number
    updated_at: Number
    status: String ('active'|'closed'|'archived')
    message_count: Number
  }
}

CLASE ChatMessage {
  ATRIBUTOS {
    id: String
    session_id: String
    role: String ('user'|'assistant'|'system')
    content: String
    tokens: {input?: Number, output?: Number}
    created_at: Number
    metadata: Object (provider, model, finish_reason)
  }
}
```

## CONVERSACION - MEMORY MODULES

### MEMORY-CONVERSATION-SUMMARY

```
INTERFAZ ConversationSummaryContract {
  summarize(session_id: String, messages: Array): Promise<String>
  getSummary(session_id: String): Promise<String>
  updateSummary(session_id: String, new_messages: Array): Promise<Void>
  clearSummary(session_id: String): Promise<Void>
}

CLASE ConversationSummary IMPLEMENTA ConversationSummaryContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    summariesStore: Map<session_id, {summary: String, last_updated: Number, message_count: Number}>
    aiGateway: AIGateway
    summarizePrompt: String (template)
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async summarize(session_id: String, messages: Array): Promise<String>
      FILTRA messages (últimas 10-20)
      CONSTRUYE prompt USANDO summarizePrompt template
      INVOCA aiGateway.call(provider, model, prompt)
      EXTRAE summary DEL response
      GUARDA EN summariesStore[session_id]
      PERSISTE
      EMITE conversation.summary.updated {session_id, summary_length}
      RETORNA summary

    async getSummary(session_id: String): Promise<String>
      BUSCA EN summariesStore
      RETORNA summary SI existe, SINO empty string

    async updateSummary(session_id: String, new_messages: Array): Promise<Void>
      OBTIENE current summary
      COMBINA current + new messages contexto
      INVOCA summarize() CON contexto combinado
      EMITE conversation.summary.regenerated {session_id}

    async clearSummary(session_id: String): Promise<Void>
      ELIMINA DE summariesStore
      EMITE conversation.summary.cleared {session_id}

    async onLoad(moduleContext: Object): Promise<Void>
      SUSCRIBE A chat.message.received
      SUSCRIBE A chat.session.closed
      REGISTRA tools
      LOG "memory-conversation-summary.onLoad"
  }

  EVENTO {
    conversation.summary.updated: {session_id, summary_length}
    conversation.summary.regenerated: {session_id}
    conversation.summary.cleared: {session_id}
  }
}
```

### MEMORY-USER-PROFILE

```
INTERFAZ UserProfileContract {
  createProfile(user_id: String, data: Object): Promise<UserProfile>
  getProfile(user_id: String): Promise<UserProfile>
  updateProfile(user_id: String, updates: Object): Promise<UserProfile>
  extractPreferences(session_id: String, messages: Array): Promise<Object>
}

CLASE UserProfile IMPLEMENTA UserProfileContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    profilesStore: Map<user_id, UserProfile>
    aiGateway: AIGateway
    preferencesPrompt: String (template)
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async createProfile(user_id: String, data: Object): Promise<UserProfile>
      CREA UserProfile {user_id, preferences: {}, metadata: {}, created_at, updated_at}
      MERGES data SI provided
      GUARDA EN profilesStore
      PERSISTE
      EMITE user.profile.created {user_id}
      RETORNA profile

    async getProfile(user_id: String): Promise<UserProfile>
      BUSCA EN profilesStore
      RETORNA profile SI existe, SINO empty profile

    async updateProfile(user_id: String, updates: Object): Promise<UserProfile>
      OBTIENE profile EXISTENTE O crea nuevo
      MERGES updates
      SETEA updated_at = now()
      GUARDA EN profilesStore
      PERSISTE
      EMITE user.profile.updated {user_id, fields_updated}
      RETORNA profile actualizado

    async extractPreferences(session_id: String, messages: Array): Promise<Object>
      CONSTRUYE prompt USANDO preferencesPrompt template
      INVOCA aiGateway.call()
      PARSEA JSON response
      RETORNA {tone: String, domain_interests: Array, style_preferences: Object}

    async onLoad(moduleContext: Object): Promise<Void>
      SUSCRIBE A chat.session.closed
      REGISTRA tools
      LOG "memory-user-profile.onLoad"
  }

  EVENTO {
    user.profile.created: {user_id}
    user.profile.updated: {user_id, fields_updated}
  }
}

CLASE UserProfile {
  ATRIBUTOS {
    user_id: String
    preferences: {tone: String, domain_interests: Array, language: String, expertise_level: String}
    metadata: Object
    created_at: Number
    updated_at: Number
  }
}
```

### MEMORY-RAG

```
INTERFAZ RAGContract {
  indexDocument(session_id: String, document: {title, content, metadata?}): Promise<{doc_id, ...}>
  search(query: String, limit?: Number): Promise<Array<SearchResult>>
  getContext(session_id: String, query: String, limit?: Number): Promise<String>
  deleteDocument(doc_id: String): Promise<Void>
}

CLASE MemoryRAG IMPLEMENTA RAGContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    documentsStore: Map<doc_id, Document>
    embeddings: Map<doc_id, Array<Number>>
    vectorDB: VectorDatabase
    embeddingModel: String
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async indexDocument(session_id: String, document: {title, content, metadata?}): Promise<{doc_id, ...}>
      GENERA doc_id (UUID)
      CHUNKING content (512 tokens, overlap 50)
      PARA cada chunk: CALCULA embedding USANDO embeddingModel
      GUARDA EN vectorDB
      CREA Document {doc_id, session_id, title, content, metadata, embedding_ids}
      GUARDA EN documentsStore
      PERSISTE
      EMITE rag.document.indexed {doc_id, session_id, chunk_count}
      RETORNA {doc_id, chunk_count}

    async search(query: String, limit?: Number): Promise<Array<SearchResult>>
      CALCULA embedding PARA query
      BUSCA EN vectorDB (cosine similarity)
      RETORNA top-K documents (default 5)
      PARA cada resultado: RETORNA {doc_id, title, excerpt, score}

    async getContext(session_id: String, query: String, limit?: Number): Promise<String>
      BUSCA documents PARA session_id CON search(query, limit)
      CONCATENA excerpts EN contexto
      RETORNA contexto COMO string

    async deleteDocument(doc_id: String): Promise<Void>
      BUSCA embeddings PARA doc_id EN vectorDB
      ELIMINA DEL vectorDB
      ELIMINA DE documentsStore
      EMITE rag.document.deleted {doc_id}

    async onLoad(moduleContext: Object): Promise<Void>
      SUSCRIBE A chat.message.received
      REGISTRA tools
      LOG "memory-rag.onLoad"
  }

  EVENTO {
    rag.document.indexed: {doc_id, session_id, chunk_count}
    rag.document.deleted: {doc_id}
  }
}

CLASE Document {
  ATRIBUTOS {
    doc_id: String
    session_id: String
    title: String
    content: String
    metadata: Object
    embedding_ids: Array<String>
    created_at: Number
  }
}
```

## CONVERSACION - PROMPT-BUILDER

```
INTERFAZ PromptBuilderContract {
  createPrompt(data: {name, template, variables, category?}): Promise<Prompt>
  getPrompt(prompt_id: String): Promise<Prompt>
  listPrompts(filters?: Object): Promise<Array<Prompt>>
  renderPrompt(prompt_id: String, variables: Object): Promise<String>
  updatePrompt(prompt_id: String, updates: Object): Promise<Prompt>
  deletePrompt(prompt_id: String): Promise<Void>
}

CLASE PromptBuilder IMPLEMENTA PromptBuilderContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    promptsStore: Map<prompt_id, Prompt>
    templateEngine: TemplateEngine
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async createPrompt(data: {name, template, variables, category?}): Promise<Prompt>
      VALIDA template syntax
      VALIDA variables estructura
      GENERA prompt_id (UUID)
      CREA Prompt {prompt_id, name, template, variables, category, created_at}
      GUARDA EN promptsStore
      PERSISTE
      EMITE prompt.created {prompt_id, name}
      RETORNA prompt

    async getPrompt(prompt_id: String): Promise<Prompt>
      BUSCA EN promptsStore
      RETORNA prompt

    async listPrompts(filters?: Object): Promise<Array<Prompt>>
      FILTRA POR category, name, etc.
      RETORNA Array

    async renderPrompt(prompt_id: String, variables: Object): Promise<String>
      OBTIENE prompt
      VALIDA variables CONTRA schema
      RENDERIZA template CON variables USANDO templateEngine
      RETORNA rendered string

    async updatePrompt(prompt_id: String, updates: Object): Promise<Prompt>
      OBTIENE prompt
      MERGES updates
      VALIDA template
      PERSISTE
      EMITE prompt.updated {prompt_id}
      RETORNA prompt

    async deletePrompt(prompt_id: String): Promise<Void>
      ELIMINA DE promptsStore
      EMITE prompt.deleted {prompt_id}

    async onLoad(moduleContext: Object): Promise<Void>
      REGISTRA UI handlers
      REGISTRA tools
      LOG "prompt-builder.onLoad"
  }

  EVENTO {
    prompt.created: {prompt_id, name}
    prompt.updated: {prompt_id}
    prompt.deleted: {prompt_id}
  }
}

CLASE Prompt {
  ATRIBUTOS {
    prompt_id: String
    name: String
    template: String (Handlebars syntax)
    variables: Array<{name: String, type: String, required: Boolean, default: Any}>
    category: String
    created_at: Number
    updated_at: Number
  }
}
```

## CONVERSACION - AI-AGENT-FRAMEWORK

```
INTERFAZ AgentFrameworkContract {
  createAgent(data: {name, description, system_prompt, tools?, memory_type?}): Promise<Agent>
  getAgent(agent_id: String): Promise<Agent>
  listAgents(filters?: Object): Promise<Array<Agent>>
  executeAgent(agent_id: String, input: String, context?: Object): Promise<AgentExecution>
  updateAgent(agent_id: String, updates: Object): Promise<Agent>
  deleteAgent(agent_id: String): Promise<Void>
  registerAgentTool(agent_id: String, tool_name: String): Promise<Void>
}

CLASE AgentFramework IMPLEMENTA AgentFrameworkContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    metrics: Metrics
    agentsStore: Map<agent_id, Agent>
    aiGateway: AIGateway
    toolRegistry: Map<tool_name, Tool>
    executionStats: {total, by_agent, errors}
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async createAgent(data: {name, description, system_prompt, tools?, memory_type?}): Promise<Agent>
      GENERA agent_id (UUID)
      VALIDA system_prompt
      VALIDA tools (SI provided)
      CREA Agent {agent_id, name, description, system_prompt, tools, memory_type: 'default', status: 'active'}
      GUARDA EN agentsStore
      PERSISTE
      EMITE agent.created {agent_id, name}
      RETORNA agent

    async getAgent(agent_id: String): Promise<Agent>
      BUSCA EN agentsStore
      RETORNA agent

    async listAgents(filters?: Object): Promise<Array<Agent>>
      FILTRA agentsStore
      RETORNA Array

    async executeAgent(agent_id: String, input: String, context?: Object): Promise<AgentExecution>
      VALIDA agent existe
      CREA execution {execution_id: UUID, agent_id, input, status: 'running', started_at: now()}
      EMITE agent.execution.start {execution_id, agent_id}
      INICIALIZA agent state: {messages: [], tool_results: {}, memory: {}}
      CREA initial message {role: 'user', content: input}
      AGREGA agent.system_prompt como system message
      LOOP (max iterations 10):
        INVOCA aiGateway.call(agent.model, messages, {tools: agent.tools})
        SI response.finish_reason == 'tool_use':
          PARA cada tool_use EN response.tool_uses:
            EJECUTA tool
            GUARDA result EN tool_results
            AGREGA assistant message CON tool_use
            AGREGA user message CON tool result
        SINO: BREAK loop
      EMITE agent.execution.complete {execution_id, agent_id, output}
      INCREMENTA executionStats
      SETEA execution.status = 'completed'
      RETORNA execution

    async updateAgent(agent_id: String, updates: Object): Promise<Agent>
      OBTIENE agent
      MERGES updates
      PERSISTE
      EMITE agent.updated {agent_id}
      RETORNA agent

    async deleteAgent(agent_id: String): Promise<Void>
      ELIMINA DE agentsStore
      EMITE agent.deleted {agent_id}

    async registerAgentTool(agent_id: String, tool_name: String): Promise<Void>
      VALIDA agent Y tool existen
      AGREGA tool_name AL agent.tools
      PERSISTE
      EMITE agent.tool.registered {agent_id, tool_name}

    async onLoad(moduleContext: Object): Promise<Void>
      CARGA ALL tools FROM moduleLoader.getToolsForAI()
      REGISTRA UI handlers
      REGISTRA agent execution como tool PARA otros agentes
      LOG "ai-agent-framework.onLoad"
  }

  EVENTO {
    agent.created: {agent_id, name}
    agent.updated: {agent_id}
    agent.deleted: {agent_id}
    agent.execution.start: {execution_id, agent_id, input}
    agent.execution.complete: {execution_id, agent_id, output, tokens_used}
    agent.tool.registered: {agent_id, tool_name}
  }
}

CLASE Agent {
  ATRIBUTOS {
    agent_id: String
    name: String
    description: String
    system_prompt: String
    model: String (default: claude-3-sonnet)
    tools: Array<String> (tool names)
    memory_type: String ('default'|'conversation'|'rag'|'none')
    status: String ('active'|'inactive')
    created_at: Number
    updated_at: Number
  }
}

CLASE AgentExecution {
  ATRIBUTOS {
    execution_id: String
    agent_id: String
    input: String
    status: String ('running'|'completed'|'failed')
    output: String
    tool_results: Map<tool_name, Any>
    iterations: Number
    tokens_used: {input: Number, output: Number}
    started_at: Number
    completed_at: Number
  }
}
```

## CONVERSACION - AGENT-OBSERVER

```
INTERFAZ AgentObserverContract {
  watchAgent(agent_id: String, callback: Function): Function
  getAgentState(agent_id: String): Promise<Object>
  getExecutionLog(execution_id: String): Promise<Array<LogEntry>>
  getMetrics(agent_id: String, timeframe?: String): Promise<Metrics>
}

CLASE AgentObserver IMPLEMENTA AgentObserverContract {
  ATRIBUTOS {
    coreId: String
    eventBus: EventBus
    logger: Logger
    agentStates: Map<agent_id, AgentState>
    executionLogs: Map<execution_id, Array<LogEntry>>
    metrics: Map<agent_id, MetricsData>
    watchers: Map<agent_id, Array<Function>>
  }

  CONSTRUCTOR(options: Object)

  METODOS {
    async watchAgent(agent_id: String, callback: Function): Function
      AGREGA callback A watchers[agent_id]
      SUSCRIBE A agent.execution.* events PARA agent_id
      on event: INVOCA callback(event, agentState)
      RETORNA unsub function

    async getAgentState(agent_id: String): Promise<Object>
      RETORNA agentStates[agent_id] O construye desde agent + metrics

    async getExecutionLog(execution_id: String): Promise<Array<LogEntry>>
      RETORNA executionLogs[execution_id]

    async getMetrics(agent_id: String, timeframe?: String): Promise<Metrics>
      RETORNA metrics[agent_id] filtrados POR timeframe (1h, 24h, 7d)
      CALCULA: {executions_count, avg_iterations, avg_tokens, error_rate, success_rate}

    async onLoad(moduleContext: Object): Promise<Void>
      SUSCRIBE A agent.execution.start | .complete | .error
      CONSTRUYE agentStates, executionLogs, metrics en tiempo real
      REGISTRA UI handlers
      LOG "agent-observer.onLoad"
  }

  EVENTO {
    agent.state.changed: {agent_id, state}
    agent.metrics.updated: {agent_id, metrics}
  }
}

CLASE AgentState {
  ATRIBUTOS {
    agent_id: String
    status: String
    last_execution: AgentExecution
    total_executions: Number
    last_error: {message, timestamp}
    uptime_percentage: Number
  }
}
```

## RELACIONES ENTRE MÓDULOS

```
project-manager
  ├─ EMITE: project.created, project.updated, project.deleted, project.activated
  ├─ USA: persistencia module
  └─ USADO_POR: chat-io, credential-manager

credential-manager
  ├─ EMITE: credential.created, credential.updated, credential.deleted, credential.validated
  ├─ USA: persistencia module, encryption (core)
  └─ USADO_POR: ai-gateway, chat-io

ai-gateway (conversacion)
  ├─ EMITE: ai.call.start, ai.call.complete, ai.call.error
  ├─ USA: credential-manager
  └─ USADO_POR: chat-io, ai-agent-framework, memory modules

chat-io (conversacion)
  ├─ EMITE: chat.session.created, chat.message.received, chat.ai.call.start, chat.ai.call.complete, chat.session.closed
  ├─ USA: ai-gateway, memory modules, project-manager
  └─ USADO_POR: frontend (UI), otros módulos

memory-conversation-summary (conversacion)
  ├─ EMITE: conversation.summary.updated, conversation.summary.regenerated
  ├─ USA: ai-gateway
  └─ USADO_POR: chat-io

memory-user-profile (conversacion)
  ├─ EMITE: user.profile.created, user.profile.updated
  ├─ USA: ai-gateway
  └─ USADO_POR: chat-io

memory-rag (conversacion)
  ├─ EMITE: rag.document.indexed, rag.document.deleted
  ├─ USA: vectorDB
  └─ USADO_POR: chat-io

prompt-builder (conversacion)
  ├─ EMITE: prompt.created, prompt.updated, prompt.deleted
  ├─ USA: template engine
  └─ USADO_POR: chat-io, ai-agent-framework

ai-agent-framework (conversacion)
  ├─ EMITE: agent.created, agent.execution.start, agent.execution.complete, agent.execution.error
  ├─ USA: ai-gateway, toolRegistry
  └─ USADO_POR: agent-observer, otros agentes

agent-observer (conversacion)
  ├─ EMITE: agent.state.changed, agent.metrics.updated
  ├─ USA: metrics (core)
  └─ USADO_POR: frontend (monitoring/dashboard)
```
