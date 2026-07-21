---
id: frontend/capa-ui
dominio: frontend
resumen: SvelteKit 2 + Svelte 5 sobre MQTT: MqttClient singleton, mqtt-request, lazy-registry, stores, módulos lazy, rutas multi-tenant, nervio vista-bridge, resiliencia.
fuentes:
  - frontend/src/**
verificado: 2026-07-21
---

# FRONTEND — Capa de UI (SvelteKit + Svelte 5 sobre MQTT)

> **Novedad (2026-07-14) — identidad del navegador en el bus (inerte hasta enrolar).**
> `ui-core/enki-identity.ts` genera un par RSA en WebCrypto (privada NO-extraíble en IndexedDB), enrola
> contra `certificate-authority.enroll` y mintea un token firmado; `client.ts` lo presenta como password
> del CONNECT. Sin cert enrolado → conecta anónimo (comportamiento de hoy). El detalle vive en
> `sistema-nervioso/bus-guardado.md` (paso 2c). Además el panel **Invitaciones**
> (`modules/invitaciones/`, autodescubierto) deja al admin del sistema emitir/listar/revocar
> invitaciones de proyecto — ver `sistema-nervioso/invitaciones.md`.

Stack: SvelteKit 2 · Svelte 5 · TypeScript · Vite 6 · adapter-node · mqtt · marked · highlight.js. SSR deshabilitado (`ssr=false`, `prerender=false`). El frontend es un core más conectado al broker MQTT.

Estructura: `src/lib/ui-core` (transporte+registro), `src/lib/stores` (40 stores), `src/lib/modules` (35 módulos lazy), `src/lib/components` (base+layout+10 grupos de dominio), `src/routes` (31 páginas, multi-tenant `[project_id]`).

## UI-CORE — Contratos

```
TYPE UIZone = 'work-bar' | 'chat-config' | 'chat-tools' | 'system-bar'

TYPE UIButtonAction =
  | {type: 'panel', panelId: String}
  | {type: 'publish', topic: String, payload?: Object}
  | {type: 'navigate', route: String}
  | {type: 'callback', handler: Function}

TYPE PanelPosition = 'top' | 'bottom' | 'left' | 'right' | 'center'
TYPE ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

INTERFAZ UIModuleManifest {
  id: String
  name: String
  version: String
  zone: UIZone
  button: UIModuleButton {id, icon, dynamicIcon?, label, action: UIButtonAction, order?}
  panels?: Array<UIModulePanel {id, title, size: 'sm'|'md'|'lg', position?, resizable?, draggable?}>
  mqtt?: {publishes: Array<String>, subscribes: Array<String>}
}

INTERFAZ ModuleContext {
  publish(topic: String, payload: Object): Void
  subscribe(pattern: String, handler: MessageHandler): () => Void
  subscribeGlobal?(pattern: String, handler: MessageHandler): () => Void
  openPanel(panelId: String): Void
  closePanel(): Void
  cleanup?(): Void
}

INTERFAZ UIModule {
  manifest: UIModuleManifest
  getIcon?(state: AppState): String
  getBadge?(state: AppState): String|Number|Null
  PanelComponent?: SvelteComponent<{panelId: String}>
  onMount?(ctx: ModuleContext): Void
  onUnmount?(): Void
  onMessage?: Record<topic, MessageHandler>
}

INTERFAZ AppState {
  project: Project|Null
  provider: Provider|Null
  model: String|Null
  prompt: Prompt|Null
  credentials: {valid: Boolean, providers: Array<String>}
  conversationCount: Number
}

INTERFAZ MqttClientContract {
  connect(config?: Partial<MqttConfig>): Promise<Void>
  disconnect(): Void
  publish(topic: String, payload: Any, retain?: Boolean): Void
  subscribe(pattern: String, handler: MessageHandler): () => Void
  onReconnect(callback: Function): () => Void
  isConnected(): Boolean
  setupVisibilityHandler(): Void
  removeVisibilityHandler(): Void
}
```

## UI-CORE — MqttClient (única frontera con el transporte)

```
CLASE MqttClient IMPLEMENTA MqttClientContract {
  ATRIBUTOS {
    #statusStore: Writable<ConnectionStatus>
    #errorStore: Writable<String|Null>
    #lastMessageStore: Writable<MqttMessage|Null>
    status: Readable<ConnectionStatus>
    error: Readable<String|Null>
    lastMessage: Readable<MqttMessage|Null>
    connected: Readable<Boolean> (derived: s === 'connected')
    #client: MqttClientLike|Null
    #connectionTimeout: Timeout|Null
    #handlers: Map<topic, Set<MessageHandler>>
    #topicSubscriptions: Map<topic, refcount: Number>
    #hasConnectedOnce: Boolean
    #reconnectCallbacks: Array<Function>
    #pendingMessages: Array<{topic, payload, retain}>
    #pendingLogs: Array<LogEntry>
    #logFlushTimeout: Timeout|Null
    #logCollectorEnabled: Boolean
    #visibilityHandlerRegistered: Boolean
    #lastVisibilityState: 'visible'|'hidden'
    #backgroundSince: Number|Null
    #defaultConfig: MqttConfig
    #registerRawPublisher: (p: RawPublisher|Null) => Void
    #logEndpoint: String
  }

  CONSTANTES {
    MAX_PENDING_MESSAGES = 100
    LOG_BATCH_DELAY = 500
    LOG_BATCH_MAX_SIZE = 50
    CONNECT_TIMEOUT_MS = 5000
    BACKGROUND_RECHECK_MS = 30000
  }

  CONSTRUCTOR(options: {registerRawPublisher?, defaultConfig?, logEndpoint?})
    #defaultConfig = buildDefaultConfig(options.defaultConfig)
    #registerRawPublisher = options.registerRawPublisher ?? noop
    #logEndpoint = options.logEndpoint ?? '/modules/log-manager/logs'

  METODOS {
    async connect(config): Promise<Void>
      SI #client: RETORNA (ya conectado/conectando)
      #statusStore.set('connecting')
      #initConnection(finalConfig) EN background
      RETORNA Promise.resolve() (no bloquea UI)

    disconnect(): Void
      #client.end(true)
      LIMPIA #client, handlers, topicSubscriptions, reconnectCallbacks
      #registerRawPublisher(null)

    isConnected(): Boolean
      RETORNA #client?.connected ?? false

    publish(topic, payload, retain=false): Void
      envelope = #createEnvelope(topic, payload)
      SI !conectado:
        SI #pendingMessages.length < MAX_PENDING_MESSAGES: ENCOLA {topic, envelope, retain}
        SINO: DROP
        RETORNA
      #client.publish(topic, JSON(envelope), {qos: 1, retain})
      #logInteraction('publish', topic, payload)

    subscribe(pattern, handler): () => Void
      {topic, isEvent} = #normalizeEventPattern(pattern)
      effectiveHandler = isEvent ? (_t, payload) => handler(payload, payload) : handler
      AGREGA a #handlers[topic]
      SI refcount==0 && conectado: #client.subscribe(topic)
      INCREMENTA refcount
      RETORNA unsubscribe: DECREMENTA refcount; SI llega a 0: #client.unsubscribe(topic)

    onReconnect(callback): () => Void
      #reconnectCallbacks.push(callback)
      RETORNA des-registro

    setupVisibilityHandler(): Void
      document.addEventListener('visibilitychange', #handleVisibilityChange)

    removeVisibilityHandler(): Void
      document.removeEventListener('visibilitychange', #handleVisibilityChange)
  }

  METODOS_INTERNOS {
    async #initConnection(config): Promise<Void>
      mqtt = await import('mqtt')  (lazy ~2MB)
      #client = mqtt.connect(config.url, {...config.options, clientId})
      #connectionTimeout = setTimeout(→ modo offline, CONNECT_TIMEOUT_MS)
      #client.on('connect', → #onConnect)
      #client.on('message', → #onMessage)
      #client.on('error', → #onError)
      #client.on('close', → status='disconnected')
      #client.on('reconnect', → status='connecting')

    #onConnect(config): Void
      clearTimeout(#connectionTimeout)
      #statusStore.set('connected')
      #registerRawPublisher({publish: (t,m,o) => #client.publish(t,m,{qos: o?.qos ?? 1})})
      RE-SUSCRIBE todos los #topicSubscriptions
      #flushPendingMessages()
      SI #hasConnectedOnce: EJECUTA #reconnectCallbacks
      #hasConnectedOnce = true

    #onMessage(topic, buffer): Void
      payload = #parsePayload(buffer)
      #lastMessageStore.set({topic, payload, timestamp})
      #notifyHandlers(topic, payload)
      #logInteraction('receive', topic, payload)

    #matchTopic(pattern, topic): Boolean  (wildcards MQTT: + un nivel, # resto)
    #notifyHandlers(topic, payload): Void  (itera handlers, match, try/catch por handler)

    #normalizeEventPattern(pattern): {topic, isEvent}
      SI pattern incluye '/': {topic: pattern, isEvent: false}
      SI pattern incluye '.': domain.action → {topic: 'core/*/events/{domain}/{action}', isEvent: true}

    #createEnvelope(topic, data): Object
      RETORNA {event_id: uuid_v4, event_type: #extractEventType(topic), timestamp: ISO, source: {core_id: 'ui-frontend'}, data, metadata: {}}

    #flushPendingMessages(): Void  (vacía cola pre-conexión con qos:1)
    #logInteraction(action, topic, payload?): Void  (batch debounced; skip topics log/*)
    async #flushLogs(): Promise<Void>  (POST batch a #logEndpoint; on fail: #logCollectorEnabled=false)

    #handleVisibilityChange = (): Void =>  (arrow field, preserva this)
      SI hidden: #backgroundSince = now
      SI visible tras background > BACKGROUND_RECHECK_MS: #checkAndReconnect()

    #checkAndReconnect(): Void
      SI #client desconectado: end(true), #client=null, setTimeout(→ connect(), 500)
  }
}
```

## UI-CORE — Fachada Singleton (mqtt.ts)

```
SINGLETON mqtt {
  _client = new MqttClient({registerRawPublisher: _setMqttClient})

  EXPORTA_STORES { status, error, lastMessage, connected }  (readonly del singleton)

  EXPORTA_API_FUNCIONAL (delega en _client) {
    connect(config) → _client.connect(config)
    disconnect() → _client.disconnect()
    publish(topic, payload, retain) → _client.publish(...)
    subscribe(pattern, handler) → _client.subscribe(...)
    onReconnect(cb) → _client.onReconnect(cb)
    isConnected() → _client.isConnected()
    setupVisibilityHandler() → _client.setupVisibilityHandler()
    removeVisibilityHandler() → _client.removeVisibilityHandler()
  }
}
```

## UI-CORE — Request/Response sobre MQTT (mqtt-request.ts)

```
INTERFAZ UIRequest {request_id, action, data, timestamp, source: {client_id}}
INTERFAZ UIResponse<T> {request_id, status: Number, success: Boolean, data: T, error?: {code, message}, timestamp}

CLASE MqttTimeoutError HEREDA Error {requestId, domain, action}
CLASE MqttRequestError HEREDA Error {requestId, status, code, response}
CLASE MqttNotConnectedError HEREDA Error {}

MODULO MqttRequest {
  ATRIBUTOS {
    DEFAULT_TIMEOUT = 10000
    CLIENT_ID = `ui-{base36}-{random}`
    pendingRequests: Map<request_id, {resolve, reject, timer, unsubscribe}>
    mqttClientRef: RawPublisher|Null
  }

  _setMqttClient(client: RawPublisher|Null): Void  (DIP: inyectado desde mqtt.ts en connect)
  publishRaw(topic, payload): Void  (sin envelope, qos:1; throws MqttNotConnectedError)

  async mqttRequest<T>(domain, action, data?, options?): Promise<UIResponse<T>>
    timeout = options.timeout ?? DEFAULT_TIMEOUT
    requestId = generateRequestId()
    SI status != 'connected': await waitForConnection(8000)
    RETORNA new Promise((resolve, reject) => {
      responseTopic = `ui/response/{requestId}`
      timer = setTimeout(→ reject(MqttTimeoutError), timeout)
      unsubscribe = subscribe(responseTopic, (_t, payload) => {
        SI payload.request_id != requestId: RETORNA
        cleanup()
        payload.success ? resolve(payload) : reject(MqttRequestError(payload))
      })
      pendingRequests.set(requestId, {...})
      requestTopic = `ui/request/{domain}/{action}`
      publishRaw(requestTopic, {request_id, action, data: data??{}, timestamp, source: {client_id}})
    })

  async waitForConnection(timeoutMs): Promise<Void>
    SI isConnected(): RETORNA
    SUSCRIBE status; resolve cuando 'connected'; reject en timeout

  cancelRequest(requestId): Boolean
  cancelAllRequests(): Void
  getPendingCount(): Number

  WRAPPERS {
    listRequest(domain, opts) → mqttRequest(domain, 'list')
    getRequest(domain, id, opts) → mqttRequest(domain, 'get', {id})
    createRequest(domain, data, opts) → mqttRequest(domain, 'create', data)
    updateRequest(domain, id, data, opts) → mqttRequest(domain, 'update', {id, ...data})
    deleteRequest(domain, id, opts) → mqttRequest(domain, 'delete', {id})
  }
}
```

## UI-CORE — Registry (legacy, registro eager)

```
MODULO Registry {
  ATRIBUTOS {
    modulesStore: Writable<Map<id, UIModule>>
    moduleSubscriptions: Map<id, Array<() => Void>>
    appStateStore: Writable<AppState>
    activePanelStore: Writable<String|Null>
  }

  createModuleContext(moduleId): ModuleContext
    publish → publish global
    subscribe → mqttSubscribe + registra unsub en moduleSubscriptions[moduleId]
    openPanel/closePanel → activePanelStore

  filterByZone(modules, zone): Array<UIModule>  (filtra zona, ordena por button.order)

  register(module): () => Void
    SI duplicado: WARN, RETORNA noop
    AGREGA a modulesStore
    ctx = createModuleContext(id); module.onMount?(ctx)
    SUSCRIBE topics de manifest.mqtt.subscribes con onMessage[topic]
    RETORNA () => unregister(id)

  unregister(moduleId): Void
    module.onUnmount?()
    EJECUTA moduleSubscriptions[moduleId]; LIMPIA
    REMUEVE de modulesStore

  unregisterZone(zone): Void
  getModule(moduleId): UIModule|undefined
  openPanel(panelId) / closePanel(): Void
  getPanelComponent(panelId) / getPanelConfig(panelId)  (busca en panels de manifests)
  updateAppState(partial) / getAppState(): AppState

  STORES_DERIVADOS {
    workBarModules, chatConfigModules, chatToolsModules, systemBarModules  (filterByZone)
    activePanel, appState, modules
  }
}
```

## UI-CORE — LazyRegistry (carga bajo demanda, sistema actual)

```
INTERFAZ LazyModuleDefinition {
  id: String
  zone: UIZone
  order?: Number
  loader: () => Promise<UIModule>
  icon: String
  label: String
  dependencies?: Array<String>
  routes?: Array<String>
}

INTERFAZ LoadedModule {definition, module: UIModule|Null, loading: Boolean, error: Error|Null, subscriptions: Array<() => Void>, mounted: Boolean}

MODULO LazyRegistry {
  ATRIBUTOS {
    definitionsStore: Writable<Map<id, LazyModuleDefinition>>
    loadedStore: Writable<Map<id, LoadedModule>>
    appStateStore: Writable<AppState>
    activePanelStore: Writable<String|Null>
    activeModuleStore: Writable<String|Null>
    currentRouteStore: Writable<String>
  }

  createScopedContext(moduleId): ModuleContext
    scopePrefix = `ui.{moduleId}`
    publish(topic) → prefija con scope salvo que empiece por 'ui.'
    subscribe(pattern) → prefija con scope salvo 'ui.'/'system.'; acumula unsubs
    subscribeGlobal(pattern) → sin scope
    cleanup() → ejecuta todos los unsubs

  defineModule(def): Void  (registra definición + entrada vacía en loadedStore)

  async loadModule(moduleId): Promise<UIModule|Null>
    SI ya cargado: RETORNA module
    SI loading: ESPERA a que termine (subscribe a loadedStore)
    CARGA dependencies primero (recursivo)
    MARCA loading; module = await def.loader(); GUARDA; mide duración
    EN error: GUARDA error, RETORNA null

  async mountModule(moduleId): Promise<Boolean>
    module = await loadModule(moduleId)
    ctx = createScopedContext(moduleId); module.onMount?(ctx)
    SUSCRIBE manifest.mqtt.subscribes; acumula en loaded.subscriptions
    MARCA mounted

  unmountModule(moduleId): Void
    EJECUTA loaded.subscriptions; module.onUnmount?(); MARCA mounted=false

  preloadModules(moduleIds): Void  (setTimeout → loadModule cada uno, sin montar)

  setCurrentRoute(route): Void
  routeMatches(currentRoute, manifestRoutes): Boolean  (soporta project-scoped: strip primer segmento)
  filterDefinitionsByZone(defs, zone, currentRoute?): Array  (filtra zona + routes + order)

  PANELES {
    openPanel(panelId) / closePanel() / setActiveModule(id)
    async getPanelComponent(panelId): carga módulos lazy con el panel; fallback loadPanelComponent(panels.ts)
    getPanelConfig(panelId): busca en cargados; fallback getPanel(panels.ts)
  }

  APP_STATE { updateAppState(partial) / getAppState() }

  STORES_DERIVADOS {
    workBarDefinitions  (filtra por zona + ruta actual)
    chatConfigDefinitions, chatToolsDefinitions, systemBarDefinitions  (compartidas)
    moduleLoadState  (estado loading/loaded/mounted/error por id)
    loadedModules, activePanel, activeModule, appState
  }

  HELPERS { getLoadedModule(id), isModuleLoaded(id), isModuleMounted(id) }
}
```

## UI-CORE — Resolución de carta por canal (carta-canal.ts)

```
async resolverCartaIdCanal(projectId, canal?): Promise<String|Null>
  SI !projectId || !canal || canal=='mesa': RETORNA null
  res = await mqttRequest('tarifas', 'get', {project_id: projectId})
  info = res.data.canales[canal]
  RETORNA (info.es_override && info.carta_id) ? info.carta_id : null
  EN catch: RETORNA null
```

## STORES — Patrón general

```
PATRON StoreReactivo {
  ESTADO: writable<T>() + derived<T>() para vistas computadas
  ACCIONES: funciones que mutan stores + publican/consultan via mqttRequest|publish
  SUSCRIPCIONES: initXSubscriptions(): () => Void  (subscribe a topics, retorna cleanup)
  GETTERS: getX() via get(store)
  TIPOS: stores MQTT-based exponen <Entity>State + init + acciones CRUD + derived
}

MODULO StoresIndex {
  REEXPORTA ui, workspace, chat, attachments, persistence, theme
  REEXPORTA credentials, projects, conversations, menu-generator
  REEXPORTA carta-manager, carta-design, carta-marketing
  REEXPORTA html-preview, facturas
  (40 stores totales)
}
```

## NERVIO DEL FRONTEND — lo que el usuario ESTÁ VIENDO (hermano de la propiocepción)

```
IDEA  propiocepción cuenta al LLM lo que PASÓ (eventos) · este le cuenta lo que SE VE (pantalla).
      El conducto ya existía VIVO (chat-io → prompt-builder → system prompt); el único corte
      era el origen: el frontend mandaba context:{} vacío. Se enchufó el origen, no se tendió nada.

stores/vista-actual.ts  : vistaActual (writable) + setVista/clearVista/getVista. La fuente.
stores/vista-bridge.ts  : PUENTE CENTRAL y aditivo (no toca paneles). derived([page, ...stores de
                          selección]) → setVista según la ruta. Extender una página = un `case`.
                          Cubre: recetas(selectedReceta) · facturas(selectedFactura) ·
                          dispositivos(selectedDevice) · carta-design(cartaDesignStore.cartaId) ·
                          comandero(cuenta_id de la URL) · carta(categoriaActiva) · llevadoo(vista).
                          Arranca/limpia en LazyShell.onMount (initVistaBridge).
chat.sendMessage        : manda getVista() en el campo `context` bajo { vista_frontend: ... }.
prompt-builder._buildSystemPrompt : saca vista_frontend del runtime y le da SECCIÓN con marco
                          "# LO QUE EL USUARIO ESTÁ VIENDO (contexto silencioso)" — el LLM no
                          pregunta lo que ya está en pantalla; NO lo recita salvo que pregunten.
GARANTÍA  best-effort: vista vacía si la página no tiene selección (el page_id ya viaja aparte).
          Nunca rompe el turno ni la UI.
```

## STORES — Persistence (localStorage)

```
INTERFAZ PersistedState {
  workspace: {projectId, providerId, modelId, promptId}
  ui: {workBarExpanded: Boolean, panelSizes: Record<id, {width?, height?}>, theme: 'dark'|'light'|'system'}
  chat: {conversationId: String|Null}
}

MODULO Persistence {
  ATRIBUTOS {STORAGE_KEY='event-core-state', DEBOUNCE_MS=500, currentState, saveTimeout}
  loadState(): PersistedState  (merge localStorage con defaults)
  saveState(partial?): Void  (merge + write debounced)
  getState(): PersistedState
  clearState(): Void
  saveWorkspace(workspace) / saveUI(ui) / savePanelSize(id, size) / getPanelSize(id) / saveConversation(id)
  INIT: SI browser → loadState() al importar
}
```

## STORES — Workspace

```
MODULO Workspace {
  STORES { activeProject, activeProvider, activeModel, activePrompt, credentialStatus }
  DERIVADOS { activeWorkspace, workspaceConfig, hasProject, hasProvider, hasValidCredentials }
  CONSTANTE WORKSPACES: {pos-pizzeria, desarrollo, general}

  ACCIONES {
    selectProject(project): set + updateAppState + saveWorkspace
    clearProject(): set null + mqttRequest('project','deactivate')
    selectProvider(provider, model): set + publish('provider/selected') + saveWorkspace
    clearProvider() / selectPrompt(prompt) [publish 'prompt/selected'] / clearPrompt()
    getPersistedWorkspace(): IDs desde persistence
  }

  initWorkspaceSubscriptions(): () => Void
    subscribe('project/activated') → activeProject
    subscribe('provider/state') → activeProvider+activeModel
    subscribe('credential/resolved') → credentialStatus

  GETTERS {getActiveProject, getActiveProvider, getActiveModel}
}
```

## STORES — UI (paneles, workbar, notificaciones)

```
MODULO UIStore {
  PANEL: activePanel = lazyActivePanel  (delega lazy-registry como fuente única)
    openPanel(id) / closePanel() / isPanelOpen (derived)
  WORKBAR: workBarExpanded (init persistencia); toggleWorkBar/expand/collapse (persiste)
  NOTIFICACIONES {
    INTERFAZ Notification {id, type: 'info'|'success'|'warning'|'error', message, timestamp}
    notifications: Writable<Array>; notificationCount (derived)
    addNotification(type, message): push + auto-remove 5s
    removeNotification(id) / clearNotifications()
    notifySuccess/Error/Warning/Info(message)
  }
}
```

## STORES — Chat (mensajería + streaming)

```
MODULO Chat {
  STORES { messages, conversationId, isStreaming, streamingMessageId, toolStatus, agentWorking, agentWorkingName, agentWorkingStep }
  DERIVADOS { messageCount, hasConversation, lastMessage, userMessages, assistantMessages }

  getPageRoute(): String  (deriva ruta sin /[project_id]; default 'chat')

  async sendMessage(content): Promise<Void>
    VALIDA content||attachments
    SI !activeProjectId: notifyInfo + openPanel('project'); RETORNA
    SI !conversationId: notifyInfo + openPanel('conversations'); RETORNA
    AGREGA userMessage (optimista); clearAttachments(); isStreaming=true
    settings = {provider?, model?} desde workspace
    response = await mqttRequest('conversation','send', {
      project_id, page_id, conversation_id, context:{}, settings, prompt:null,
      attachments: paths, intencion:null, message
    }, {timeout: 180000})
    SI data.conversation_id != convId: conversationId.set(nuevo) (lazy-create)
    FAILSAFE setTimeout(180s): SI isStreaming → cierra + notifyError
    EN catch: isStreaming=false; código PROJECT_REQUIRED→openPanel('project'); CONVERSATION_REQUIRED→clear+openPanel('conversations'); SINO notifyError

  addMessage(message): Void  (usado por push MQTT)
    SI assistant tras assistant:
      streaming → actualiza contenido del existente
      final → finaliza el existente con datos completos
    SINO: append
    actualiza streamingMessageId

  endStreaming(): Void  (isStreaming=false; marca último msg no-streaming)
  stopGeneration(): Void → endStreaming()
  async loadConversation(id): mqttRequest('conversation','load'); mapea created_at→timestamp, in_context, manually_toggled
  newConversation(): genera UUID local; limpia messages
  clearMessages() / clearConversation()
  async toggleMessageContext(messageId, inContext): update optimista + mqttRequest('conversation','toggle_context'); rollback en error

  initChatSubscriptions(): () => Void
    isActiveConversation(topic): filtra por conversationId
    subscribe('conversation/+/message') → addMessage; apaga isStreaming si assistant final
    subscribe('conversation/+/tool-status') → toolStatus
    subscribe('conversation/stream/end') → finaliza último msg streaming

  GETTERS {getMessages, getConversationId, getIsStreaming}
}
```

## STORES — Catálogo MQTT-based (forma común)

```
MODULO <Dominio>Store  (projects, credentials, conversations, facturas, carta-manager, carta-design, carta-marketing, menu-generator, html-preview, ...) {
  ATRIBUTOS { <entity>Store: Writable<<Entity>State> }
  init<Entity>Subscriptions(): () => Void  (subscribe a eventos del dominio)
  request<Entity>State() / load<Entity>()  (mqttRequest 'list'|'get'|'load')
  create/update/delete/activate<Entity>(...)  (mqttRequest CRUD; optimista donde aplica)
  DERIVADOS { <entity>List, active<Entity>Id, active<Entity>Data, <entity>Loading, <entity>Error, <entity>Count }
  TIPOS exportados: <Entity>, <Entity>State, + auxiliares
}

EJEMPLOS_DERIVADOS {
  projects: projectsList, activeProjectId, activeProjectData, projectsLoading, hasProjects
  conversations: conversationsList, conversationSections, activeConversation, conversationMessages,
                 messagesInContext, contextCount, contextWindow, contextStats
  facturas: filteredFacturas, selectedFactura, facturasActiveTab, facturasStats, facturasFilter
  carta-manager: sortedCartas, selectedCarta, cartaLoading, cartaCount
}
```

## MODULES — Loader (autodescubrimiento)

```
INTERFAZ ModuleManifest {id, name, version, zone: UIZone, order?, icon, label, dependencies?, critical?, heavy?, routes?}

MODULO Loader {
  ATRIBUTOS {
    manifests = import.meta.glob('./*/manifest.json', {eager: true, import: 'default'})
    moduleLoaders = import.meta.glob('./*/index.ts')  (lazy)
    _definitions: Array<LazyModuleDefinition>|Null  (cache)
  }

  buildDefinitions(): Array<LazyModuleDefinition>
    PARA cada manifest:
      moduleDir = path sin '/manifest.json'; loaderPath = `{dir}/index.ts`
      SI moduleLoaders[loaderPath]:
        push {id, zone, order??99, icon, label, dependencies, routes, loader: () => moduleLoaders[loaderPath]().default}
    ORDENA por zona, luego order

  getModuleDefinitions(): cache buildDefinitions()
  getDefinitionsByZone(zone) / getDefinition(id)
  async loadModule(id): def.loader()
  getCriticalModules(): manifests con critical=true
  getHeavyModules(): manifests con heavy=true
  getAllManifests() / debugListModules()
}

MODULO ModulesIndex {
  async registerAllModules(): carga cada def + register() (eager, AppShell)
  async registerModulesByZone(zone)
  unregisterAllModules()  (cleanup HMR)
  SI DEV: debugListModules()
}
```

## MODULES — Panels (componentes lazy)

```
INTERFAZ PanelDef {
  id: String
  title: String
  icon: String
  size: 'sm'|'md'|'lg'
  position?: PanelPosition
  zone: UIZone
  order: Number
  showInBar?: Boolean
  loader: () => Promise<{default: SvelteComponent}>
}

MODULO Panels {
  ATRIBUTOS { panels: Record<id, PanelDef>, componentCache: Map<id, SvelteComponent> }

  panels = {
    chat-config: project, provider, prompts, conversations, credentials-list
    work-bar: menu-pdf2img-panel, menu-prepare-panel, menu-ocr-panel, menu-generate-panel,
              carta-config-panel, carta-preview-panel, carta-export-panel, carta-stats-panel,
              recetas-panel, escandallo-panel, viabilidad-panel, facturas-panel, impresion-panel,
              html-preview (showInBar:false)
    chat-tools: files
    system-bar: related-pages-panel
  }

  getPanelsByZone(zone): Array<PanelDef>  (filtra zona + showInBar!=false, ordena)
  async loadPanelComponent(panelId): SvelteComponent|Null  (cache + loader())
  getPanel(panelId): PanelDef|undefined
  isPanelLoaded(panelId): Boolean
}
```

## MODULES — Patrón de módulo

```
MODULO <module>/manifest.json  (descubierto eager)
  {id, name, version, zone, order, icon, label, critical?, heavy?, routes?, dependencies?}

MODULO <module>/index.ts  (cargado lazy)
  export default const <name>Module: UIModule = {
    manifest: {id, name, version, zone, button: {...}, panels?: [...], mqtt?: {publishes, subscribes}}
    getIcon?(state): String  (icono dinámico según AppState)
    getBadge?(state): Number|String|Null
    PanelComponent: <Module>Panel.svelte
    onMount?(ctx) / onUnmount?()
    onMessage?: {topic → handler}
  }

MODULO <module>/<Module>Panel.svelte  (UI del panel)
```

## COMPONENTS — Base

```
GRUPO components/base {
  Button, Badge, Chip, LazyButton
  Message, MarkdownRenderer
  Toast, ToastContainer
  ConnectionStatus
  FilePicker, FileViewer
  CodeEditor, Terminal
}
```

## COMPONENTS — Layout

```
COMPONENTE AppShell  (layout base eager: registerAllModules en onMount)
  PROPS {showSystemBar, showWorkBar, showChatInput, showChatTools, onConnected?}
  onMount: registerAllModules() + init{Workspace,Projects,Chat,Conversations}Subscriptions() + connect() + setupVisibilityHandler()
  onDestroy: cleanups + disconnect() + unregisterAllModules() + removeVisibilityHandler()
  SLOTS {work-bar, content}; FIJOS {ChatConfig, ChatInput, ChatTools, SystemBar, LazyPanel}

COMPONENTE LazyShell  (bootstrap mínimo: Core+Router+Shell, módulos bajo demanda)
  REACTIVO: setCurrentRoute($page.url.pathname)
  onMount: defineModule(cada moduleDefinition) + init subscriptions + connect() + initProjects/Conversations/HtmlPreview + setupVisibilityHandler() + preloadModules(criticalModules) tras render
  onDestroy: cleanups + disconnect() + removeVisibilityHandler()
  REACTIVO: $activePanel → loadPanelComponent → render Panel

COMPONENTE Shell  (página chat: AppShell + ChatArea)
COMPONENTE ChatArea  (lista mensajes; auto-scroll; typing dots; toggle contexto)
COMPONENTE ChatConfig  (barra config: botones chat-config)
COMPONENTE ChatInput  (entrada + envío)
COMPONENTE ChatTools  (barra herramientas: chat-tools)
COMPONENTE LazyWorkBar  (íconos de workBarDefinitions; click → carga módulo)
COMPONENTE WorkBar  (variante eager)
COMPONENTE SystemBar  (getPanelsByZone('system-bar'); openPanel) — SUSTITUIDO por PageNavStrip en AppShell/LazyShell
COMPONENTE PageNavStrip  (rail derecho; lista FIJA de pages con icono propio; activa destacada; tap → goto(/{project}/{page}) directo; sustituye a SystemBar)
COMPONENTE Panel / LazyPanel  (contenedor: posiciones top/bottom/left/right/center; spring drag; resize; ESC/backdrop cierra; PANEL_SIZES)
}
```

## COMPONENTS — Grupos de dominio

```
GRUPOS components/<dominio> (pantallas + sub-componentes) {
  carta: CartaScreen, CarritoPanel, CategoriaScroll, ProductoCard, ProductoDetalle
  cocina: CocinaScreen, CocinaHeader, CocinaConfigPanel, PedidoCard, ItemLine
  comandero: ComanderoScreen, CuentasScreen, CuentaCard(Mesa), PedidoList, PedidoItem,
             ProductoBtn, CategoriaBtn, TipoButton, AccionBtn, BotonEspecial,
             CobroPanel, CierreCajaPanel, VariacionesPanel, MitadMitadPanel, AlGustoPanel
  dispositivos: DispositivosScreen, FleetTab, HealthTab, FirmwareTab, GatewaysTab,
                ShadowTab, ImpresorasTab, DeviceStatusButton, DeviceStatusPanel
  esp32: DevTab, FirmwareTab, FlashTab
  recipes: RecipeInvestigationResult, RecipeVersionComparator, RecipeVersionDetail, RecipeVersionHistory
  staff: StaffScreen, EmpleadosList, FichajeBoard, NfcCardModal
  llevadoo: LlevadooScreen
}
```

## ROUTES — SvelteKit (multi-tenant)

```
CONFIG +layout.ts { ssr=false, prerender=false }

RUTA / (+page.svelte)
  onMount: SI persistencia.workspace.projectId → goto(`/{id}/chat`); SINO LazyShell (selección)

RUTA /[project_id] (+layout.svelte)
  projectStore = writable({id, name, isPizzepos, loading, error}); setContext('project', projectStore)
  URL es fuente de verdad: $page.params.project_id
  REACTIVO: urlParam cambia → saveWorkspace({projectId}); SI conectado && difiere → activateProject(urlParam)
  onMount: render con defaults inmediato (no bloquea MQTT) + loadProject() no-bloqueante; retry al conectar

RUTA /[project_id]/<pantalla> (+page.svelte)  PATRON {
    projectId = $activeProjectId || $page.params.project_id  (UUID real, no alias)
    onNavigate(path) → goto(`/{urlProjectId}{path}`)
    RENDERIZA <DominioScreen onNavigate projectId>
  }

PANTALLAS_PROYECTO {
    chat, comandero (+[cuenta_id]), cocina, carta, carta-design, carta-digital,
    carta-manager, carta-marketing, carta-scheduler,
    dispositivos, escandallo, facturas, ingredientes, llevadoo,
    menu-generator, recetas, tarifas, viabilidad
  }

RUTAS_PLANAS (sin project_id): chat, comandero (+[cuenta_id]), facturas, menu-generator, staff
```

## UTILS

```
MODULO utils {
  generateUUID(): String  (crypto.randomUUID o fallback Math.random v4)
  perf: {
    timers: Map<label, Number>
    perfStart(label) / perfEnd(label): Number  (mide + logPerf)
    logPerf(label, durationMs): POST a /modules/log-manager/logs (level info, source frontend)
    logMsg(msg, ctx): POST telemetría; on fail → logEnabled=false
  }
}
```

## CONSTANTES UI

```
PROJECT_COLORS: [green, blue, purple, orange, red, yellow, cyan, pink] {id, hex, emoji}
PROVIDER_ICONS: {openai 🤖, anthropic 🧠, deepseek 🔮, ollama 🦙, kimi 🌙}
PANEL_SIZES: {sm '25vh', md '33vh', lg '50vh'}
TOPICS: {
  UI_PANEL_OPEN, UI_PANEL_CLOSE, UI_MODULE_REGISTERED
  CONVERSATION_SEND, CONVERSATION_MESSAGE, CONVERSATION_STREAM_END, CONVERSATION_LOAD, CONVERSATION_LOADED
  PROJECT_ACTIVATE, PROJECT_ACTIVATED, PROVIDER_SELECTED, PROVIDER_STATE, PROMPT_SELECTED, CREDENTIAL_RESOLVED
}
WORKSPACES: {pos-pizzeria {modules, icon 🍕}, desarrollo {💻}, general {📋}}
```

## PATRONES OOP — Frontend

```
PATRON Singleton  { USADO_EN: [mqtt.ts _client] PROPOSITO: una sola frontera de transporte }
PATRON DependencyInjection  { USADO_EN: [MqttClient.registerRawPublisher → mqtt-request] PROPOSITO: romper ciclo, DIP }
PATRON Observer  { USADO_EN: [stores Svelte writable/derived, #handlers por patrón] }
PATRON Strategy  { USADO_EN: [loader/panels: loader() por módulo] PROPOSITO: carga bajo demanda }
PATRON Factory  { USADO_EN: [createEnvelope, createModuleContext, createScopedContext] }
PATRON Registry  { USADO_EN: [registry, lazy-registry, panels componentCache] }
PATRON LazyLoading  { USADO_EN: [import('mqtt'), import.meta.glob index.ts, panel loaders] }
PATRON RequestResponse  { USADO_EN: [mqtt-request: ui/request/{domain}/{action} → ui/response/{request_id}] }
PATRON Facade  { USADO_EN: [mqtt.ts sobre MqttClient, stores/index.ts] }
PATRON Refcount  { USADO_EN: [MqttClient.#topicSubscriptions (de)suscribe en primer/último handler] }
PATRON ScopedEvents  { USADO_EN: [lazy-registry: ui.{module}.* por contexto] }
PATRON OptimisticUpdate  { USADO_EN: [chat.toggleMessageContext, stores CRUD] PROPOSITO: UX inmediata + rollback }
PATRON Debounce  { USADO_EN: [persistence.saveState 500ms, MqttClient batch-logging] }
PATRON URLAsSourceOfTruth  { USADO_EN: [[project_id]/+layout: URL → stores] }
```

## CICLO DE VIDA — Frontend

```
ARRANQUE {
  1. / (+page) → SI projectId persistido: goto(/{id}/chat); SINO LazyShell
  2. LazyShell.onMount:
       defineModule(cada definición)  (sin cargar)
       init{Workspace,Chat,Projects,Conversations,HtmlPreview}Subscriptions()
       connect()  (MqttClient importa mqtt lazy, conecta en background)
       setupVisibilityHandler()
       preloadModules(criticalModules) tras 100ms
  3. [project_id]/+layout: URL → saveWorkspace + activateProject
  4. Operación:
       navegación → setCurrentRoute → workBarDefinitions filtra por ruta
       GATE page-set: proyecto con pages:[] (p.ej. prisma recién nacido) → work-bar oculta sus
         botones de DOMINIO (módulos pizzepos que no le pertenecen) PERO conserva los UNIVERSALES
         (manifest.universal:true) — interruptores (on/off del dueño: kill-switches, features) es
         control SOBERANO, no página de dominio: se ve en CUALQUIER proyecto. LazyWorkBar filtra
         d.universal cuando emptyPageSet; con page-set no vacío o sin proyecto → comportamiento previo.
       click botón work-bar → loadModule → mountModule → onMount(scopedContext)
       click botón barra → openPanel → getPanelComponent → loadPanelComponent (lazy + cache)
       acción UI → mqttRequest(domain, action) → ui/request → ui/response
       push servidor → subscribe(topic) → store.update → render reactivo
}

ENVIO_MENSAJE_CHAT {
  1. sendMessage(content): valida proyecto+conversación → addMessage optimista → isStreaming=true
  2. mqttRequest('conversation','send', {9 campos}, timeout 180s) → ack {conversation_id, message_id}
  3. push MQTT conversation/{id}/message → addMessage (streaming chunk | final)
  4. assistant final → isStreaming=false; failsafe 180s cierra si no llega
}

DESCONEXION {
  onDestroy: cleanups subscriptions + disconnect() (end + limpia handlers/colas) + removeVisibilityHandler()
}

RESILIENCIA {
  connect timeout 5s → modo offline
  reconnect → re-suscribe topics + flushPendingMessages + reconnectCallbacks
  visibilitychange: background > 30s → checkAndReconnect
  cola pre-conexión hasta 100 mensajes (qos 1)
  batch-logging debounced; on fail HTTP → desactiva collector
}
```
