# Plan: Completar el trabajo del Loader

## La regla que gobierna todo este plan

> **El módulo NO sabe cómo se conecta al sistema. Solo sabe hacer su trabajo.**
>
> Si un módulo llama a `eventBus.subscribe()`, `uiHandler.register()`,
> o guarda `unsubscribes[]` — algo está mal. Eso es trabajo del loader.
>
> El módulo exporta métodos. El module.json declara qué se conecta a qué.
> El loader lee el manifiesto y hace el cableado. Fin.

### Trampa a vigilar

Mi impulso natural es crear abstracciones que los módulos "usen" (BaseModule,
mixins, helpers). Eso sigue poniendo la responsabilidad en el módulo.
Cada vez que una solución requiera que el módulo "haga algo nuevo", es señal
de que estoy derivando. La pregunta correcta siempre es:
**"¿puede el loader hacer esto sin que el módulo lo sepa?"**

---

## Estado actual: qué hace el loader con module.json

| Campo manifest     | ¿El loader lo auto-conecta? | ¿El loader lo auto-limpia en unload? |
|--------------------|-----------------------------|--------------------------------------|
| `apis`             | SI — buildAPIsFromManifest() | SI — registry.unregister()          |
| `tools`            | SI — registerToolsForAI()    | SI — unregisterToolsForAI()         |
| `subscribes`       | NO — solo guarda metadata    | NO — depende del módulo             |
| `handlers`/`uiActions` | NO — ignorado            | NO — depende del módulo             |

**Resultado:** apis y tools funcionan perfecto. Events y UI están rotos.
Los 15 bugs del sistema son todos en events y UI — exactamente lo que el
loader no gestiona.

---

## Paso 1: Estandarizar el schema de module.json

**Archivo a modificar:** ninguno de core todavía — esto es definir la convención.

### Schema actual (caótico)

```
subscribes aparece en:
  - raíz:    "subscribes": [...]              (17 módulos)
  - anidado: "events": {"subscribes": [...]}  (2 módulos)
  - ambos:   (1 módulo: prompt-manager)

Formato de cada entrada — 3 variantes:
  a) String simple:  "db.query.response"
  b) Objeto:         {"event": "db.query.response", "handler": "onDbResponse"}
  c) Objeto con desc: {"event": "...", "handler": "...", "description": "..."}

UI handlers aparece como:
  - "handlers":  [{domain, action, handler}]   (filesystem)
  - "uiActions": [{domain, action, handler}]   (scheduler)
  - No existe en los otros 9 módulos que usan uiHandler
```

### Schema estandarizado (propuesta)

```jsonc
{
  "name": "chat-session",
  "version": "1.0.0",
  "description": "...",

  // --- LO QUE YA FUNCIONA (no tocar) ---
  "apis": [...],
  "tools": [...],

  // --- LO QUE HAY QUE ESTANDARIZAR ---

  // Event subscriptions: el loader hace subscribe() y guarda el unsubscribe
  "subscribes": [
    {
      "event": "session.create.request",
      "handler": "handleCreateSession"
      // handler es nombre de método en la instancia del módulo
    },
    {
      "event": "db.query.response",
      "handler": "onDbQueryResponse"
    }
  ],

  // UI request handlers: el loader hace uiHandler.register() y unregister()
  "ui_handlers": [
    {
      "domain": "conversation",
      "action": "send",
      "handler": "handleUISendMessage"
    },
    {
      "domain": "session",
      "action": "list",
      "handler": "handleUIListSessions"
    }
  ],

  // Documentación (no genera cableado, pero sirve para introspección)
  "publishes": ["session.created", "session.message.saved"]
}
```

**Principio:** si tiene `handler`, el loader lo conecta. Si no tiene `handler`,
es solo documentación.

### Trabajo concreto

- Definir un `validateManifest()` ampliado que acepte y normalice los 3
  formatos legacy de `subscribes` al formato estándar `[{event, handler}]`.
- Normalizar `handlers`/`uiActions` al campo unificado `ui_handlers`.
- NO romper manifiestos existentes — el normalizador acepta lo viejo y lo
  transforma internamente.

---

## Paso 2: Extender el loader — wireEventSubscriptions()

**Archivo a modificar:** `core/modules/loader.js`

### Nuevo método: wireEventSubscriptions(manifest, instance, eventBus)

```js
wireEventSubscriptions(manifest, instance, eventBus) {
  const unsubs = [];

  // Normalizar: aceptar subscribes en raíz o en events.subscribes
  const subscriptions = this.normalizeSubscriptions(manifest);

  for (const sub of subscriptions) {
    // sub = { event: "session.create.request", handler: "handleCreateSession" }

    // Si no tiene handler, es solo documentación — saltar
    if (!sub.handler) continue;

    const handlerFn = instance[sub.handler];
    if (typeof handlerFn !== 'function') {
      this.logger?.warn('module.subscribe.handler.missing', {
        module: manifest.name,
        event: sub.event,
        expected: sub.handler
      });
      continue;
    }

    const unsub = eventBus.subscribe(sub.event, handlerFn.bind(instance));
    unsubs.push(unsub);
  }

  return unsubs;  // array de funciones unsubscribe
}
```

### Nuevo método: normalizeSubscriptions(manifest)

Acepta los 3 formatos legacy y devuelve siempre `[{event, handler}]`:

```js
normalizeSubscriptions(manifest) {
  const raw = manifest.subscribes
    || manifest.events?.subscribes
    || [];

  return raw.map(entry => {
    if (typeof entry === 'string') {
      // "db.query.response" → sin handler, solo documentación
      return { event: entry, handler: null };
    }
    // { event: "...", handler: "..." } → ya está bien
    return entry;
  });
}
```

### Integrar en load()

```js
async load(moduleName, modulePath, manifest) {
  // ... existing code hasta instance.onLoad(moduleContext) ...

  // YA EXISTE:
  const apis = this.buildAPIsFromManifest(manifest, instance);
  this.registerToolsForAI(moduleName, manifest.tools, instance);

  // NUEVO — misma lógica, mismo patrón que apis y tools:
  const unsubs = this.wireEventSubscriptions(manifest, instance, this.core.eventBus);

  this.loadedModules.set(moduleName, {
    manifest, instance, path: modulePath, loadedAt: Date.now(),
    _eventUnsubs: unsubs          // ← NUEVO
  });

  // ... rest of existing code ...
}
```

### Integrar en unload()

```js
async unload(moduleName) {
  const moduleData = this.loadedModules.get(moduleName);

  // NUEVO — cleanup automático de events:
  if (moduleData._eventUnsubs) {
    for (const unsub of moduleData._eventUnsubs) {
      unsub();
    }
  }

  // ... rest of existing unload code (onUnload, registry, tools, watcher) ...
}
```

---

## Paso 3: Extender el loader — wireUIHandlers()

**Archivo a modificar:** `core/modules/loader.js`

### Nuevo método: wireUIHandlers(manifest, instance, uiHandler)

```js
wireUIHandlers(manifest, instance, uiHandler) {
  const registrations = [];

  if (!uiHandler) return registrations;

  // Normalizar: aceptar handlers, uiActions, o ui_handlers
  const handlers = this.normalizeUIHandlers(manifest);

  for (const h of handlers) {
    // h = { domain: "conversation", action: "send", handler: "handleUISend" }
    const handlerFn = instance[h.handler];
    if (typeof handlerFn !== 'function') {
      this.logger?.warn('module.ui_handler.missing', {
        module: manifest.name,
        domain: h.domain,
        action: h.action,
        expected: h.handler
      });
      continue;
    }

    uiHandler.register(h.domain, h.action, handlerFn.bind(instance));
    registrations.push({ domain: h.domain, action: h.action });
  }

  return registrations;
}
```

### Nuevo método: normalizeUIHandlers(manifest)

```js
normalizeUIHandlers(manifest) {
  // Aceptar los 3 formatos legacy
  return manifest.ui_handlers
    || manifest.uiActions
    || manifest.handlers
    || [];
}
```

### Integrar en load() y unload()

En `load()`: añadir después de wireEventSubscriptions:
```js
const uiRegs = this.wireUIHandlers(manifest, instance, this.core.uiHandler);
// guardar en _uiRegistrations
```

En `unload()`: añadir antes de onUnload:
```js
if (moduleData._uiRegistrations) {
  for (const {domain, action} of moduleData._uiRegistrations) {
    this.core.uiHandler?.unregister(domain, action);
  }
}
```

---

## Paso 4: Validar con un módulo piloto (sin romper nada)

**Estrategia de migración no-destructiva:**

El loader pasa a auto-conectar lo declarado en module.json. Pero los módulos
existentes TAMBIÉN conectan imperativamente en onLoad(). Resultado: doble
subscripción.

### Solución: flag `autoWire` en module.json

NO. Eso es poner responsabilidad en el módulo. Trampa detectada.

### Solución correcta: el loader detecta conflicto

Cuando el loader va a hacer `eventBus.subscribe("session.create.request", ...)`:
- Si el handler existe en la instancia → el loader lo conecta
- Si el módulo TAMBIÉN lo conecta en onLoad() → hay doble subscripción

Para evitarlo sin flag, la migración es:

1. **Primero**: deploy el loader actualizado. Los módulos que NO tienen
   `handler` en sus subscribes (formato string simple) no cambian.
2. **Segundo**: migrar un módulo piloto (`metricas` — tiene bugs, es simple):
   - Añadir `handler` a cada entry en subscribes de su module.json
   - ELIMINAR el `subscribeToEvents()` y `unsubscribes[]` de su index.js
   - Eliminar el cleanup de onUnload()
3. **Tercero**: validar que metricas funciona igual.
4. **Cuarto**: migrar módulo por módulo, priorizando los 13 con bugs.

### Módulo piloto: metricas

**Antes (module.json subscribes):**
```json
"subscribes": [
  "*.creado", "*.actualizado", "*.eliminado",
  "*.error", "*.completado"
]
```

**Después (module.json subscribes):**
```json
"subscribes": [
  {"event": "*.creado",      "handler": "onEventoCreado"},
  {"event": "*.actualizado", "handler": "onEventoActualizado"},
  {"event": "*.eliminado",   "handler": "onEventoEliminado"},
  {"event": "*.error",       "handler": "onEventoError"},
  {"event": "*.completado",  "handler": "onEventoCompletado"}
]
```

**Antes (index.js onLoad) — ~30 líneas de boilerplate:**
```js
subscribeToEvents() {
  this.eventBus.subscribe('*.creado', (data) => { this.contadores.creados++; ... });
  this.eventBus.subscribe('*.actualizado', (data) => { this.contadores.actualizados++; ... });
  // ... 5 subscripciones, sin guardar unsubscribe, sin cleanup
}
```

**Después (index.js) — 0 líneas de boilerplate:**
```js
// Los métodos existen en la clase, el loader los conecta:
onEventoCreado(data)      { this.contadores.creados++; ... }
onEventoActualizado(data) { this.contadores.actualizados++; ... }
onEventoEliminado(data)   { this.contadores.eliminados++; ... }
onEventoError(data)       { this.contadores.errores++; ... }
onEventoCompletado(data)  { this.contadores.completados++; ... }
```

El onLoad() se reduce a inicializar contadores. El onUnload() queda vacío
(o se elimina). El loader se encarga de subscribe y unsubscribe.

---

## Paso 5: Migración del resto de módulos

### Orden de prioridad

**Grupo A — Módulos con bugs (13 módulos, impacto inmediato):**

| # | Módulo | Bug | subscribes to add handler | ui_handlers to declare |
|---|--------|-----|--------------------------|----------------------|
| 1 | metricas | B06: 5 event leaks | 5 | 0 |
| 2 | plugin-manager | B07: 2 event leaks | 2 | 0 |
| 3 | admin-panel | B01: 1 event leak | 1 | 0 |
| 4 | calling-generator | B03: event leaks | 4 | 0 |
| 5 | database-manager | B05: 2 event leaks | 2 | 0 |
| 6 | ai-gateway | B02: event leaks | 3 | 0 |
| 7 | credential-manager | B04: 6 event leaks | 6 | 11 |
| 8 | prompt-manager | B08+B11: events + UI | 2 | 13 |
| 9 | filesystem | B09: 13 UI leaks | 15 | 13 |
| 10 | pdf-viewer | B10: 3 UI leaks | 4 | 3 |
| 11 | scheduler | B12: 11 UI leaks | 1+ | 11 |
| 12 | text-editor | B13: 4 UI leaks | 4 | 4 |
| 13 | telegram-service | B14: divergent events | 14 | 0 |

**Grupo B — Módulos sin bugs pero con boilerplate (que ya funcionan):**

Estos se migran después, sin urgencia. La migración de cada uno es:
1. Añadir `handler` a subscribes en module.json
2. Añadir `ui_handlers` a module.json (si aplica)
3. Eliminar subscripciones imperativas de onLoad()
4. Eliminar cleanup de onUnload() (lo que el loader ahora gestiona)

---

## Resumen de archivos a tocar

### Core (el cambio real — 1 archivo):
- `core/modules/loader.js` — añadir 4 métodos (~80 líneas):
  - `wireEventSubscriptions()`
  - `wireUIHandlers()`
  - `normalizeSubscriptions()`
  - `normalizeUIHandlers()`
  - Modificar `load()` y `unload()` (~15 líneas cada uno)

### Manifiestos (declarativo — module.json de cada módulo):
- Añadir campo `handler` a entries de `subscribes` que sean strings
- Añadir campo `ui_handlers` donde se usen uiHandler.register()

### Módulos (eliminar boilerplate — index.js de cada módulo):
- Eliminar subscripciones imperativas de onLoad()
- Eliminar arrays unsubscribes[] y su cleanup en onUnload()
- Eliminar llamadas a uiHandler.register/unregister
- Los métodos handler QUEDAN — solo se elimina el cableado

---

## Lo que NO hace este plan (y por qué)

| Tentación | Por qué NO |
|-----------|-----------|
| Crear BaseModule | Pone responsabilidad en el módulo. El loader ya puede hacerlo. |
| Crear EventRequestBroker | ServiceExecutor ya existe. Los módulos que necesiten RPC usarán ServiceExecutor directamente — eso es lógica de negocio, no boilerplate. |
| Refactorizar ServiceExecutor | Funciona bien. Los módulos que lo necesiten pueden recibirlo en el context. No es urgente. |
| Migrar los 28 módulos de golpe | Riesgo innecesario. El cambio en el loader es aditivo. La migración es módulo por módulo. |
| Crear tests unitarios del loader | Sí hay que hacerlo, pero después del paso 2, no antes. Primero el cambio funcional, luego los tests. |
