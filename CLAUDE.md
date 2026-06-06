Actúas como un **Ingeniero Técnico Senior Especialista en Arquitectura de Software**, con más de 15 años de experiencia diseñando sistemas distribuidos, embebidos y de alta concurrencia. Tu expertise combina cuatro pilares fundamentales:

### 1. Programación Orientada a Objetos (OOP) — Dominio Profundo
- Aplicas rigurosamente los **principios SOLID** y los **patrones de diseño GoF** (Factory, Observer, Strategy, Singleton, Command, etc.) en cada solución.
- Diseñas clases con **alta cohesión y bajo acoplamiento**, priorizando la inmutabilidad donde sea posible.
- Dominas la **composición sobre herencia**, inyección de dependencias y contratos bien definidos (interfaces/protocolos).
- Tu código es autodocumentado: nombres semánticos, responsabilidad única y separación clara entre dominio, infraestructura y aplicación.

### 2. Pseudocódigo — Especificación Precisa
- Antes de escribir código en cualquier lenguaje, **siempre presentas un pseudocódigo estructurado** que defina:
  - Entradas, salidas y precondiciones.
  - Flujo de control (secuencial, condicional, iterativo).
  - Manejo de errores y casos límite.
  - Interacción entre componentes (mensajes, callbacks, estados).
- Tu pseudocódigo es agnóstico al lenguaje, pero lo suficientemente detallado para ser traducido 1:1 a Python, C++, Java, Node.js o cualquier stack.

### 3. JSON — Modelado de Datos y Contratos
- Diseñas **schemas JSON robustos** que sirven como contratos de comunicación entre microservicios, dispositivos IoT y backends.
- Dominas estructuras anidadas, arrays tipados, validación de esquemas (JSON Schema) y serialización/deserialización eficiente.
- Optimizas payloads para minimizar ancho de banda sin perder semántica.
- Manejas JSON como **fuente de verdad** para configuraciones, eventos y estados de sistema.

### 4. Arquitectura Event-Driven Pura + MQTT
- Eres un arquitecto de **sistemas reactivos puros**: todo flujo de datos se modela como un grafo de eventos (Productor → Broker → Consumidor).
- Diseñas con **desacoplamiento total**: los componentes no se conocen entre sí, solo se suscriben a tópicos semánticos.
- **MQTT es tu protocolo principal de mensajería**:
  - Dominas los niveles de QoS (0, 1, 2) y sabes cuándo aplicar cada uno según criticidad y latencia.
  - Manejas `retain`, `last will`, `clean session`, `keep alive` y tópicos jerárquicos con wildcards (`+`, `#`).
  - Diseñas jerarquías de tópicos claras (ej: `edificio/piso/01/sensor/temperatura`, `fleet/vehicle/123/telemetry/gps`).
  - Implementas **bridges**, **broker clustering** (Mosquitto, HiveMQ, EMQX) y estrategias de alta disponibilidad.
- Integras OOP + Event-Driven: cada actor del sistema es un objeto autónomo que reacciona a eventos MQTT, mantiene estado interno y emite nuevos eventos sin bloqueos.

---

### 🧠 Tu Metodología de Trabajo
1. **Análisis**: Identificas entidades, eventos del dominio y contratos de comunicación.
2. **Diseño en Pseudocódigo**: Especificas el flujo de eventos, máquinas de estado y manejo de excepciones.
3. **Contrato JSON**: Defines los payloads de eventos (ej: `event_type`, `timestamp`, `payload`, `correlation_id`).
4. **Arquitectura MQTT**: Mapeas eventos a tópicos, defines QoS por criticidad y diseñas el esquema de suscripciones.
5. **Implementación OOP**: Traduces todo a clases con responsabilidad única, inyección de dependencias y manejo de callbacks/promesas según el lenguaje.

---

### ⚡ Reglas de Respuesta — Enfoque en Calidad y Valor Añadido
- **Incluye siempre** un bloque de pseudocódigo antes de mostrar código real. Esto aporta claridad arquitectónica y facilita la revisión por pares.
- **Incluye siempre** el schema JSON de los eventos involucrados. Esto garantiza contratos explícitos y validación estructural.
- **Incluye siempre** la jerarquía de tópicos MQTT con la justificación del QoS elegido. Esto demuestra criterio técnico en la selección de garantías de entrega.
- **Aplica siempre** patrones OOP (Observer, Command, State Machine) para modelar la lógica de eventos. Esto eleva la mantenibilidad y testabilidad del sistema.
- **Expande siempre** el manejo de errores con estrategias de retry, circuit breaker, dead letter queues y logging estructurado. Esto robustece el sistema ante fallos de red o procesamiento.
- **Añade siempre** casos edge-case: desconexiones del broker, payloads malformados, race conditions, saturación de tópicos y timeouts. Esto anticipa escenarios de producción.
- **Detalla siempre** la estrategia de reconexión y recuperación de estado ante caídas. Esto asegura resiliencia operativa.
- **Incluye siempre** métricas y observabilidad: contadores de eventos, latencia de procesamiento, tasa de errores y health checks. Esto habilita el monitoreo proactivo.
- Escribe en español técnico preciso. Sé conciso pero completo. Prioriza la profundidad técnica que sume valor real al diseño.
- Cuando sugieras código, prioriza Python o Node.js, pero mantén la lógica lo suficientemente abstracta

---

# 🏛️ Arquitectura del Core — Definición de Clases (Pseudocódigo)

> Esta sección es la **especificación viva** del núcleo de `event-core` como grafo de clases.
> Regla rectora: **el código es la fuente de verdad; esta spec es la guía de diseño.** Si una
> clase real diverge de aquí, se señala el desvío y se concilia (actualizar spec o corregir código),
> nunca se asume que la spec manda sobre lo implementado.
>
> Alcance actual: **solo el core (infraestructura pura, sin dominio)**. Pendiente: `ModuleLoader`
> en detalle, clase base `Module`, y las capas de módulos/dominio.

## Decisiones de arquitectura cerradas

Estas decisiones están **zanjadas** y gobiernan todo el pseudocódigo de abajo:

- **① Forma canónica del topic de eventos** → `core/<core_id>/events/<event/con/slashes>`
  (los puntos del `event_type` se convierten en slashes). El prefix `core/<id>/events/` identifica
  el core emisor y habilita multi-core (`core/+/events/#`). *El código tiene razón; el contrato
  `bus-transport` queda desactualizado y debe corregirse, no el código.*

- **② Request/Response unificado** — **una sola puerta** con cuatro sub-decisiones cerradas:
  - **2a = A** → namespace único `core/<core_id>/api/request/<dominio>/<accion>` →
    `core/<core_id>/api/response/<correlation_id>`. `ui/request/*` queda como **alias deprecado** (1 release).
  - **2b** → clave de correlación canónica única: **`correlation_id`** (`request_id` solo como alias de borde).
  - **2c** → el fast-path in-process (`mqttRequest`) **se mantiene como optimización transparente**
    que pasa por el **mismo pipeline** (validación + hooks + tracer) que la puerta MQTT. No es un bypass.
  - **2d** → **QoS 1** en request y response; **timeout** explícito por request → error `504 GATEWAY_TIMEOUT`;
    idempotencia por `correlation_id`.

- **④ QoS / retain / LWT** → **QoS 1** por defecto, **QoS 0** solo telemetría tolerante a pérdida,
  **QoS 2 prohibido** (overhead). `retain=false` salvo el último heartbeat de `Discovery`.
  Idempotencia siempre a nivel aplicación con `correlation_id`.

## Mapa de dependencias (composition root)

```
                          ┌─────────────┐
                          │    Core     │  (index.js — raíz de composición)
                          └──────┬──────┘
        inyecta (DI) en orden de arranque ▼
 Observability → Validation → Broker → MQTTClient → Hooks → EventBus
      → ApiRequestResolver → Providers → Registries → ModuleLoader
      → Discovery → HTTPGateway

Regla SOLID rectora:
  · El Core CONSTRUYE y CABLEA. Nadie se auto-instancia.
  · Toda dependencia entra por constructor (inversión de control / DIP).
  · Un módulo NUNCA toca MQTTClient ni Broker: solo ve eventBus + context.
  · Composición sobre herencia (salvo EventEmitter, contrato de eventos de Node).
```

**Notación:** `CLASS`, `→deps` (inyectadas), `state`, `interface` (público), `▸` pseudocódigo.
`emit`/`on` = EventEmitter.

## 1. `Core` — orquestador / raíz de composición

```
CLASS Core:
  →deps: config            # cargada por loadConfig() con prioridad CLI>env>file
  state: { coreId, components:Map, started:bool }

  interface:
    async start():
      ▸ obs        ← new Observability(config.logging)          # paso 1
      ▸ validation ← new ValidationManager(obs.logger)          # paso 2
      ▸ broker     ← new EmbeddedBroker(config.mqtt.broker)
        await broker.start()                                    # paso 3a
      ▸ mqtt       ← new MQTTClient({ ...config.mqtt.client, broker })
        await mqtt.connect()                                    # paso 3b (loopback)
      ▸ hooks      ← new HookManager()                          # paso 4
      ▸ bus        ← new EventBus({ mqtt, coreId, hooks, tracer:obs.tracer })
        await bus.init()                                        # paso 5  (sub core/+/events/#)
      ▸ api        ← new ApiRequestResolver({ mqtt, coreId, hooks, validation, tracer:obs.tracer })
        await api.start()                                       # paso 5.5 (sub core/<id>/api/request/#)
      ▸ providers  ← createProviderSystem({ config, obs })      # paso 6
      ▸ registry   ← new ModuleRegistry({ logger:obs.logger })
      ▸ intents    ← new IntentRegistry(obs.logger)
      ▸ loader     ← new ModuleLoader({ bus, api, hooks, validation,
                                        registry, intents, providers,
                                        core:this, obs })
        await loader.loadAll(config.modules.enabled)            # paso 6.5
      ▸ discovery  ← new Discovery({ mqtt, coreId, modules:loader.list() })
        await discovery.start()                                 # heartbeat + LWT
      ▸ gateway    ← new HTTPGateway({ config.http, registry, api, obs })
        await gateway.listen()                                  # paso 8
      registrar todo en components; started ← true
      hooks.execute('core.ready', { coreId })

    async stop():                                               # orden inverso, idempotente
      await gateway.close(); await discovery.stop()
      await loader.unloadAll(); await api.stop(); await bus.stop()
      await mqtt.disconnect(); await broker.stop()
      emit('core.stopped')

  # edge: si un paso falla → rollback de los ya iniciados (stop parcial) y throw
```

Patrón *Composition Root* + *Builder* implícito. Es el único que conoce el grafo completo.

## 2. Observabilidad — `Observability` / `Logger` / `Tracer` / `Metrics` / `ActivityLogger`

```
CLASS Observability:                       # fachada que agrupa las 4 (Facade pattern)
  →deps: config
  interface: logger, tracer, metrics, activity

CLASS Tracer:                              # contexto W3C que viaja en el envelope
  state: { current:AsyncLocalStorage<{traceId,spanId,parentSpanId}> }
  interface:
    startSpan(name) → span                 # genera spanId, hereda traceId
    getCurrentContext() → {traceId,spanId,parentSpanId} | null
    withContext(ctx, fn)                    # ejecuta fn dentro del scope de trace

CLASS Logger:
  interface: debug/info/warn/error(event:string, fields:object)   # log estructurado, NO strings
CLASS Metrics:
  interface: increment(k), gauge(k,v), timing(k,ms), snapshot()
CLASS ActivityLogger:
  interface: record(actor, action, target, outcome)               # auditoría de acciones
```

Contrato clave: **logs y métricas son estructurados** (clave→campos), nunca prosa.

## 3. `ValidationManager` — contratos JSON Schema

```
CLASS ValidationManager:
  →deps: logger
  state: { ajv, schemas:Map<id,compiledSchema>, stats:Map }
  interface:
    registerSchema(id, jsonSchema)                  # compila y cachea
    validate(id, data) → { valid:bool, errors:[] }  # por id registrado
    validateInline(schema, data) → { valid, errors } # ad-hoc
    formatErrors(ajvErrors) → [{ path, code, message }]
  ▸ validate:
      compiled ← schemas.get(id) ; if !compiled → throw 'schema not found'
      ok ← compiled(data) ; stats.bump(id, ok)
      return ok ? {valid:true} : {valid:false, errors:formatErrors(compiled.errors)}

CLASS ValidationError extends Error:
  state: { errors:[] } ; toJSON() → { message, errors }
```

Lo usa el `ApiRequestResolver` (paso *validar_schema* del pipeline ②) y el `EventBus`
(validación opcional del envelope).

## 4. `EmbeddedBroker` — Aedes en proceso (transporte)

```
CLASS EmbeddedBroker extends EventEmitter:
  →deps: { port:1883, wsPort:9001, host }
  state: { aedes, tcpServer, wsServer, clients:Map }
  interface:
    async start():
      ▸ aedes ← Aedes()
        setupAedesHandlers()                         # auth + lifecycle
        tcpServer ← net.createServer(aedes.handle).listen(port)
        await startWebSocketServer()                 # ws://:9001 para frontend
    setupAedesHandlers():
      aedes.authenticate = (client, user, pass, cb) →
          local(client) ? cb(null,true)              # localhost: abierto (bus-transport)
                        : verifyMTLS(client, cb)      # externo: mTLS (cluster)
      aedes.on('client',      c → emit('client.connected', c.id))
      aedes.on('clientError', (c,e) → emit('client.error', {c,e}))
    publish(packet)                                   # inyección directa (interno)
    getClients() → [ids] ;  getStats() ;  async stop()

  # edge: doble bind de puerto → error fatal en start (lo captura Core.start rollback)
  # edge: cliente con client_id duplicado → aedes cierra la conexión previa
```

QoS lo decide el publisher; el broker solo lo respeta. Retain=false salvo heartbeat de `Discovery`.

## 5. `MQTTClient` — cliente del core (mqtt.js sobre loopback)

```
CLASS MQTTClient extends EventEmitter:
  →deps: { reconnectPeriod, keepAlive:60, cleanSession:false, pool, broker }
  state: { client, connected:bool, pool?:ConnectionPool, subscriptions:Set }
  interface:
    async connect():
      ▸ if config.external → connectToExternalBroker()
        else            → startEmbeddedBrokerAndConnect()   # loopback al EmbeddedBroker
        setupMQTTHandlers()
    setupMQTTHandlers():
      client.on('connect',    → connected=true; resubscribe(subscriptions); emit('connect'))
      client.on('message',  (t,m) → emit('message', t, m))
      client.on('reconnect',  → emit('reconnect'))           # backoff propio de mqtt.js
      client.on('error',    e → emit('error', e))
    async publish(topic, message, opts={qos:1}):             # default QoS 1 (bus-transport)
        pool?.enabled ? _publishPooled(...) : _publishDirect(...)
    async subscribe(topics, opts={qos:1}) ; unsubscribe(topics)
    async disconnect() ; getStats()

  # RESILIENCIA (estrategia de reconexión):
  #  · cleanSession=false → el broker retiene subs/QoS1 pendientes durante caídas cortas
  #  · al reconnect → resubscribe() de todo subscriptions (idempotente)
  #  · keepAlive 60s → detección de cuelgue; LWT publicado por Discovery si el core muere
  #  · pool opcional (config.mqtt.pool) para alto throughput; default OFF (YAGNI)
```

**Nadie fuera del core habla con esta clase.** Es la única frontera con el transporte (DIP).

## 6. `HookManager` — lifecycle hooks (Chain of Responsibility)

```
CLASS HookManager:
  state: { hooks:Map<name, handler[]>, stats:Map }
  interface:
    register(name, handler) → unregisterFn
    async execute(name, context) → context        # encadena handlers; cada uno puede mutar/abortar
    clear(name) ; clearAll() ; listHooks() ; getStats(name)
  ▸ execute:
      for h in hooks.get(name) ?? []:
         context ← await h(context)                # si un handler lanza → corta cadena (o swallow segun policy)
         if context.__abort → break
      stats.bump(name) ; return context

  # hooks canónicos: 'beforeRequest', 'afterRequest', 'core.ready', 'module.loaded', 'module.unloaded'
```

Punto de extensión transversal: auth, rate-limit, enriquecido de contexto — sin tocar el núcleo.

## 7. `EventBus` — pub/sub fire-and-forget (decisión ①)

```
CLASS EventBus:
  →deps: { mqtt, coreId, hooks, tracer, validation? }
  state: { local:EventEmitter }                    # espejo in-process para listeners locales
  interface:
    async init():
      await mqtt.subscribe(`core/${coreId}/events/#`, {qos:1})   # propios
      await mqtt.subscribe(`core/+/events/#`,        {qos:1})    # de cualquier core (multi-core listo)
      mqtt.on('message', (topic,msg) → _onMessage(topic,msg))

    async publish(eventType, data, opts={}):
      envelope ← EventEnvelope.create(eventType, data, {coreId, tracer, ...opts})
      topic    ← Topics.event(opts.targetCoreId ?? '*', eventType)   # ① 'core/<id>/events/x/y/z'
      await mqtt.publish(topic, envelope, {qos:1})
      _logEvent(eventType, envelope, 'publish')

    subscribe(eventType, handler) → unsubscribeFn  # registra en local; el match real llega por MQTT
    emitLocal(eventType, envelope)                 # entrega a listeners locales

  ▸ _onMessage(topic, raw):
      if !topic.includes('/events/') → return
      envelope ← parse(raw) ; validar opcional via validation
      ctx ← hooks.execute('event.received', { topic, event:envelope })  # enriquecido
      emitLocal(ctx.event.event_type, ctx.event)
      _logEvent(envelope.event_type, envelope, 'receive')

  # CARDINALIDAD 0/1/N: publish nunca espera ack de negocio (emite y desentiende — events.contract)
  # edge: payload malformado → log 'event.parse.failed', se descarta, NO tumba el bus
```

**Topic == `core/<id>/events/<event/con/slashes>`** (decisión ①). `correlation_id` viaja en el
envelope para encadenar causalidad sin acoplar emisor/receptor.

### Envelope canónico del evento (JSON Schema de referencia)

```json
{
  "event_id": "uuid-v4",
  "event_type": "credential.resolve.response",
  "timestamp": "ISO-8601",
  "source": { "core_id": "core-a", "module_id": "credential-manager" },
  "data": { },
  "trace": { "trace_id": "...", "span_id": "...", "parent_span_id": "..." },
  "metadata": { "correlation_id": "uuid-v4" }
}
```

## 8. `ApiRequestResolver` — puerta única request/response (decisión ②)

> Evolución del `UIRequestHandler` real. **Una puerta, dos transportes** (MQTT + fast-path
> in-process), **un pipeline compartido**, `correlation_id` único.

```
CLASS ApiRequestResolver:
  →deps: { mqtt, coreId, hooks, validation, tracer, registry }
  state: { handlers:Map<"domain/action", fn>, pending:Map<corrId, {resolve,timer}> }

  interface:
    async start():
      await mqtt.subscribe(`core/${coreId}/api/request/#`, {qos:1})   # ② namespace canónico
      await mqtt.subscribe(`ui/request/#`, {qos:1})                   # alias deprecado (1 release)
      mqtt.on('message', (t,m) → if isRequest(t) → _onRequest(t,m))

    register(domain, action, handler):              # auto-wired por el loader desde manifest.ui_handlers
      handlers.set(`${domain}/${action}`, handler)

    # — Camino A: llamada inter-módulo (fast-path, modo "Casa") —
    async handle(domain, action, payload, meta={}):
      envelope ← buildRequest(domain, action, payload, meta)   # correlation_id, source, reply_to
      return await _pipeline(envelope)                         # MISMO middleware, sin saltar al broker

    # — Camino B: petición que llega por MQTT (frontend / otro core) —
    ▸ _onRequest(topic, raw):
        {domain, action} ← parseTopic(topic)
        envelope ← parse(raw) ; envelope.domain=domain ; envelope.action=action
        result   ← await _pipeline(envelope)
        await _respond(envelope, result)

    # — Pipeline ÚNICO (clave de 2c: ningún camino lo evita) —
    ▸ _pipeline(envelope):
        validation.validate('api.request', envelope)  → if !valid: return ERR(400,'VALIDATION_ERROR')
        envelope ← hooks.execute('beforeRequest', envelope)       # auth, rate-limit, enriquecido
        handler  ← handlers.get(`${envelope.domain}/${envelope.action}`)
        if !handler: return ERR(404,'NOT_FOUND')
        try:
          tracer.withContext(envelope.trace, async →
             data ← await handler(envelope.payload, envelope))
          result ← { correlation_id:envelope.correlation_id, status:'ok', data }
        catch e:
          result ← mapError(e)        # {status, error:{code,message,details?}}
        hooks.execute('afterRequest', { envelope, result })
        return result

    ▸ _respond(envelope, result):
        topic ← envelope.reply_to ?? `core/${envelope.source.core_id}/api/response/${envelope.correlation_id}`
        await mqtt.publish(topic, result, {qos:1})

    async stop()

  # EDGE CASES (cerrados en la decisión ②):
  #  · timeout: caller arma timer(timeout_ms); si vence → ERR(504,'GATEWAY_TIMEOUT'); respuesta tardía se descarta
  #  · doble response: pending.get(corrId) consume la 1ª, ignora resto
  #  · response sin listener: se publica igual, expira sola (retain=false)
  #  · multi-core: reply_to lleva core_id del emisor → la response cruza el bridge transparente
  #  · STATUS canónico: 200/201/400/404/409/500/504  (clase UIRequestError → {status,code})
```

### Jerarquía de topics + QoS (req/resp)

```
core/<core_id>/api/request/<dominio>/<accion>     QoS 1   # petición
core/<core_id>/api/response/<correlation_id>      QoS 1   # respuesta dirigida
ui/request/<dominio>/<accion>   → alias deprecado de api/request (1 release)
core/<core_id>/events/<event/con/slashes>         QoS 1   # P1 sigue intacto: fire-and-forget
```

*Justificación QoS 1:* req/resp exige entrega garantizada (perder una request cuelga al caller
hasta timeout); QoS 2 vetado por overhead; unicidad por `correlation_id` a nivel app.

### Envelope canónico request / response (JSON)

```json
// REQUEST
{
  "correlation_id": "uuid-v4",
  "source": { "core_id": "core-a", "module_id": "ai-gateway" },
  "domain": "project",
  "action": "list",
  "timestamp": "ISO-8601",
  "payload": { },
  "reply_to": "core/core-a/api/response/uuid-v4",
  "timeout_ms": 5000
}
// RESPONSE
{
  "correlation_id": "uuid-v4",
  "status": "ok",
  "data": { },
  "error": null,
  "served_by": { "core_id": "core-a", "module_id": "project-manager" },
  "timestamp": "ISO-8601"
}
```

## 9. Resto del core — interfaces compactas

```
CLASS ProviderSystem:                    # IA, OCR, PDF… como providers intercambiables (Strategy)
  →deps: { config, obs }
  interface: register(id, provider) ; get(id) ; execute(id, op, args)   # registry+loader+executor

CLASS ModuleRegistry:                    # catálogo de módulos cargados + sus APIs HTTP
  interface: register(name,data) ; get(name) ; findAPI(path,method) ; getAllAPIs() ; getStats()
  ▸ findAPI: matchPath(pattern,path) con params  → {handler, code}

CLASS IntentRegistry:                    # NL → módulo (para el compañero/LLM)
  interface: register(name,intents) ; match(msg)→best ; matchAll(msg)→ranked ; _score(msg,keywords)

CLASS Discovery extends EventEmitter:    # presencia multi-core (heartbeat + Last-Will)
  →deps: { mqtt, coreId, modules }
  interface:
    async start(): setupLastWill(); subscribeToDiscovery(); startHeartbeat(); startAliveCheck()
    setupLastWill():   LWT en `core/${coreId}/status` payload{offline} retain=true
    publishStatus():   `core/${coreId}/status` {coreId, modules, capabilities, ts} retain=true
    getActiveCores() ; isCoreActive(id) ; updateModules(list)
  # único uso legítimo de retain=true (bus-transport lo permite para presencia)

CLASS HTTPGateway:                       # borde REST + UI estática (NO lógica de negocio)
  →deps: { config.http, registry, api, obs }
  interface: async listen() ; close()
  ▸ ruta dinámica: GET/POST /:domain/:action → api.handle(domain, action, body)   # HTTP→bus
  # cache + compression como decorators opcionales (config.http.cache/compression)

CLASS ServiceRegistry:                   # asignación de puertos / descubrimiento de servicios locales
  interface: allocatePort() ; register(svc) ; resolve(name)
```

## 10. `ModuleLoader` — carga, auto-wiring y hot-reload (máquina de estados)

> Pieza más densa del core. Autodescubre módulos por `module.json`, los instancia, **cablea
> automáticamente** sus suscripciones a eventos / UI handlers / tools desde el manifiesto, e
> inyecta el `context` del core. Soporta hot-reload y módulos declarativos (`blueprint_driven`).

```
CLASS ModuleLoader:
  →deps: { bus, api, hooks, validation, registry, intents, providers, core, obs }
  state: { loadedModules:Map<name, ModuleRecord> }
  # ModuleRecord = { manifest, instance, path, loadedAt, _eventUnsubs, _uiRegistrations }

  interface:

    async loadAll(enabled[]):              # orden = config.modules.enabled (tiers)
      ▸ paths ← scan(config.modules.path)  # modules/*/module.json
        para name en [...enabled, ...resto_no_listado]:   # listados primero, resto al final
           try: await load(name, path, manifest)
           catch e: log('module.load.failed'); continue   # un módulo no tumba el arranque

    scan(root):                            # autodiscovery + agrupación por vertical
      para dir en root/*:
         si existe dir/module.json → yield {name, path, manifest}
         si NO → escanear dir/*/module.json   # soporta modules/pizzepos/* (vertical)

    # ── MÁQUINA DE ESTADOS DE CARGA ──
    async load(name, path, manifest):
      [VALIDATE]   if !validateManifest(manifest): throw 'Invalid manifest'
                   if loadedModules.has(name): throw 'already loaded'
      [BLUEPRINT]  if manifest.blueprint_driven:           # módulo declarativo puro
                     loadedModules.set(name, {manifest, instance:null, blueprint_driven:true})
                     return null   # ai-gateway lo ejecuta leyendo el blueprint como system-prompt
      [REQUIRE]    delete require.cache[index.js]          # clave del hot-reload
                   ModuleClass ← require(path/index.js)
                   assert typeof ModuleClass == 'function'
      [INSTANCE]   instance ← new ModuleClass()
                   assert typeof instance.onLoad == 'function'
      [WIRE-EVT]   eventUnsubs ← wireEventSubscriptions(manifest, instance)  # ANTES de onLoad
                   # (para que el módulo pueda emitir request y oír response durante su init)
      [CONTEXT]    ctx ← { ...core,                        # bus, logger, metrics, validation, providers…
                           moduleConfig: manifest.config,
                           mqttRequest: (d,a,p) → core.api.handle(d,a,p) }   # decisión ②: pipeline compartido
      [ONLOAD]     try: await instance.onLoad(ctx)
                   catch e: eventUnsubs.forEach(unsub); throw e    # rollback de subs si init falla
      [STORE]      loadedModules.set(name, {manifest, instance, path, loadedAt:now, _eventUnsubs})
      [REGISTER]   registry.register(name, {manifest, instance,
                       apis: buildAPIsFromManifest(manifest, instance),
                       hooks: manifest.provides?.hooks ?? [],
                       subscribes: manifest.subscribes ?? [] })
      [TOOLS]      if manifest.tools:      registerToolsForAI(name, tools, instance)        # LLM
                   if manifest.tools_http: registerToolsHttpForAI(name, tools_http)         # wrappers HTTP declarativos
                   if manifest.intents:    intents.register(name, manifest.intents)         # NL→módulo
      [WIRE-UI]    record._uiRegistrations ← wireUIHandlers(manifest, instance)
      log('module.loaded', {name, version}) ; metrics.increment('modules.loaded')
      return instance

    # ── AUTO-WIRING desde el manifiesto (declarativo, sin código pegamento) ──
    wireEventSubscriptions(manifest, instance):           # manifest.subscribes[]
      para {event, handler} en manifest.subscribes:
         fn ← instance[handler].bind(instance)
         unsub ← bus.subscribe(event, fn)                 # 'core/<id>/events/...'
         collect(unsub)
      return unsubs

    wireUIHandlers(manifest, instance):                   # manifest.ui_handlers[]
      para {domain, action, handler} en manifest.ui_handlers:
         api.register(domain, action, instance[handler].bind(instance))   # puerta req/resp ②
      return registrations

    buildAPIsFromManifest(manifest, instance):            # manifest.apis | provides.apis → rutas HTTP
      resuelve handler por nombre o convención handle<Action>; bind(instance)

    # ── DESCARGA / RECARGA ──
    async unload(name):                                   # cleanup simétrico al wiring
      rec ← loadedModules.get(name) ; if !rec: throw 'not loaded'
      rec._eventUnsubs?.forEach(unsub)                    # desuscribe eventos
      rec._uiRegistrations?.forEach(unreg)                # quita UI handlers
      unregisterToolsForAI(name) ; intents.unregister(name) ; registry.unregister(name)
      await rec.instance?.onUnload?.()                    # hook de limpieza del módulo
      loadedModules.delete(name) ; hooks.execute('module.unloaded', {name})

    async reload(name):  await unload(name); await load(name, ...)   # hot-reload (require.cache ya purgado)
    async unloadAll():   para name en loadedModules: await unload(name)   # orden inverso
    list() → [{name, version, status}]                    # para Discovery.updateModules

  # EDGE CASES:
  #  · módulo sin index.js ni module.json válido → se salta, log, sigue (resiliencia de arranque)
  #  · onLoad lanza → rollback de subscripciones ya cableadas (no deja basura en el bus)
  #  · reload con estado en vuelo → unsub antes de re-require evita doble entrega
  #  · dependencia de carga (credential-manager/database-manager primero) → la garantiza el ORDEN de enabled[]
```

## 11. Clase base `Module` — contrato de todo módulo de dominio

> No es herencia obligatoria (el loader solo exige `onLoad`), pero **define el contrato canónico**
> que todo módulo cumple. Los handlers devuelven SIEMPRE el shape `{ status, data | error }`.

```
CLASS Module (contrato base):
  state: { logger, metrics, eventBus, validation, mqttRequest, moduleConfig, ... }  # inyectados en onLoad

  # ── LIFECYCLE (lo único que el loader exige) ──
  async onLoad(context):
    this.{logger, metrics, eventBus, validation, mqttRequest} ← context
    this.moduleConfig ← context.moduleConfig
    ▸ inicializar estado propio (basePath, conexiones, caches efímeras…)
    # NO materializar estado redundante (paradigma-no-cabe): el bus es la fuente en vivo
  async onUnload():                          # opcional: cerrar recursos, flush, desconectar

  # ── TRES TIPOS DE HANDLER (auto-wired por el loader desde el manifest) ──
  # (1) UI handlers     ← manifest.ui_handlers  → api.register(domain, action, handleX)
  async handleX(payload, envelope) → { status:'ok', data } | { status, error:{code,message,details?} }

  # (2) Bus handlers    ← manifest.subscribes    → bus.subscribe(event, onEventY)
  async onEventY(envelope):
    cid ← envelope.metadata?.correlation_id
    ▸ procesar ; await _publicarEvento('dominio.cosa.response', resultado, { correlation_id: cid })

  # (3) Tools (LLM)     ← manifest.tools          → registradas en el tool-registry del ai-gateway
  #     mismo método que un ui_handler; el LLM las invoca vía ai-gateway

  # ── EMISIÓN CANÓNICA DE EVENTOS ──
  _publicarEvento(eventType, data, opts={}):
    envelope ← {
      ...data,
      correlation_id: opts.correlation_id ?? uuid(),     # propaga causalidad (decisión ②/④)
      timestamp: now_iso()
    }
    await this.eventBus.publish(eventType, envelope)     # → 'core/<id>/events/...'

  # ── SHAPE DE RESPUESTA CANÓNICO (errors.contract) ──
  #   éxito:  { status: 'ok',    data: { ... } }
  #   error:  { status: 'error', error: { code, message, details? } }
  #   códigos: INVALID_INPUT | RESOURCE_NOT_FOUND | PERMISSION_DENIED | CONFLICT_STATE | UNKNOWN_ERROR

  # ── REGLAS QUE TODO MÓDULO RESPETA ──
  #  · NUNCA importa mqtt.js ni toca el broker: solo eventBus + mqttRequest (DIP)
  #  · NUNCA llama a otro módulo por referencia directa: usa context.mqttRequest(domain, action, payload)
  #  · EMITE Y DESENTIENDE para eventos; REQUEST/RESPONSE con correlation_id cuando espera respuesta
  #  · NO materializa agregados/caches del estado global (paradigma-no-cabe)
```

### Ejemplo de manifiesto que el loader consume (`module.json`)

```json
{
  "name": "filesystem",
  "version": "2.0.0",
  "main": "index.js",
  "config": { },
  "subscribes": [
    { "event": "fs.read.request",  "handler": "onFsReadRequest" }
  ],
  "ui_handlers": [
    { "domain": "fs", "action": "read", "handler": "handleRead" }
  ],
  "tools": [
    { "name": "fs.read", "handler": "handleRead",
      "parameters": { "type": "object", "properties": { "path": { "type": "string" } }, "required": ["path"] },
      "errores_conocidos": ["INVALID_INPUT", "RESOURCE_NOT_FOUND", "PERMISSION_DENIED", "UNKNOWN_ERROR"] }
  ]
}
```

## Pendiente (siguiente capa, fuera del core)

- **Subsistema compañero de viaje** — `ai-gateway`, `conversacion`, `ai-agent-framework`,
  `agent-manager` como clases (motor LLM + especialización por proyecto/dominio + tools vía bus).
- **Vertical tienda/restaurante** — `pizzepos` (pedidos, cocina, comandero, cobros, productos…).
- **Capa IoT/ESP32** — `device-registry`, `device-shadow`, `firmware-*`, `esp32-*`.
