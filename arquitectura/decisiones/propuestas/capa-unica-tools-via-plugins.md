# Capa única de tools via plugins — apuntes de retomar

> **⚠️ Documento superseded (mayo 2026).** El enfoque "plugin layer" descrito
> aquí (resucitar calling-generator, crear plugins JSON declarativos) se
> evaluó en la rama `claude/review-tools-architecture-Xm3bZ` y se descartó
> a favor de una solución MÁS SIMPLE: el frontend lee directamente via
> `mqttRequest('fs','read',{path})` la primitiva que `filesystem` ya expone,
> habilitado por el auto-wire de `tools[]` al `uiHandler` que añade
> `tools.contract` v1.2.
>
> **Patrón canónico documentado en**:
> [`lecturas-frontend-via-fs-read.md`](./lecturas-frontend-via-fs-read.md).
>
> Lo que SÍ se conservó de esta propuesta original: el bump de
> `tools.contract` a v1.2 (una declaración → tres destinos), el cambio en
> `core/modules/loader.js::registerToolsForAI` para auto-wire al uiHandler,
> y los 4 cross-checks nuevos del validator. Lo que SE DESCARTÓ: crear
> módulos bridge (`-api`, `-plugin-runtime`) o resucitar calling-generator.
> El backend canónico ya tenía suficiente — solo faltaba el atajo correcto
> entre frontend y filesystem.
>
> Este documento queda aquí como **registro histórico** del diagnóstico
> del problema operativo y el camino seguido. La solución final es más
> conservadora de lo que el cuerpo de este doc anticipaba.

---

> **Documento de retomar.** Escrito al final de una sesión larga para que la
> próxima conversación arranque con todo el contexto sin tener que reconstruirlo.
> Si lees esto: las decisiones aquí NO están implementadas todavía — son
> diagnóstico + dirección + camino. El cuerpo de la idea está completo;
> el código no.
>
> **Estado del repo cuando se escribió:** rama `claude/read-claude-md-74wst`
> mergeada a `main` via PR #171 (commit `48b9d6d`). Subsistema-recetario y
> subsistema-carta migrados a blueprint-driven. Contrato `llm-runtime-discipline`
> v1.0.0 en main. mercadona-api v1.0.0 vivo como JS determinista.

Fecha: 2026-05-19.

---

## 1 · Por qué existe este documento

El usuario detectó un problema operativo persistente: cuando añade tools/handlers
nuevos al sistema, **funcionan durante unos días y luego dejan de funcionar**.
Sospecha intermitencia, pero al hacer ronda diagnóstica en esta sesión se vio que
el patrón es estructural — no intermitente.

La conversación llegó a un punto donde el diagnóstico está claro y la
dirección decidida, pero el desarrollo de la solución es trabajo grande. En vez
de empujar al final de la sesión cansados, se decide capturar todo aquí y
retomar fresco en otra sesión.

**Cómo usar este documento en la próxima sesión:**
1. Léelo de arriba a abajo (10-15 min).
2. Verifica el estado del repo (sección 2) — si cambió, ajusta.
3. Sigue el camino propuesto (sección 8).
4. Cuando termines el camino principal, vuelve al apartado de los **cajones**
   (sección 7) — es la siguiente capa de perfeccionamiento.

---

## 2 · Estado del sistema HOY

### Lo que está vivo en main

- **Subsistema-recetario** — 4/7 módulos blueprint-driven: `recetas`,
  `escandallo`, `viabilidad`, `tecnicas`. Pendientes en deuda: `recetario-creativo`,
  `pase-cocina`, `mise-en-place` (legacy JS aún).
- **Subsistema-carta** — 6/6 módulos blueprint-driven: `carta-manager`,
  `carta-scheduler`, `carta-digital`, `carta-design`, `carta-impresion`,
  `carta-marketing`.
- **mercadona-api** — JS determinista v1.0.0. Cliente HTTP no oficial de
  tienda.mercadona.es. Postcode default 30840 (Murcia), cache 48h. **Caso
  de prueba real**: este patrón (módulo JS limpio que envuelve API externa)
  encaja exactamente con lo que el usuario quiere generalizar via plugins.
- **menu-generator** — sigue en JS legacy. Inicialmente lo clasifiqué como
  bloqueado por OCR, pero **el diagnóstico estaba mal**: usa `ServiceExecutor`
  que invoca `local.pdfjs/sharp/google-vision` via bus interno. Es candidato
  a blueprint perfectamente — pero NO va a migrarse por ahora porque el
  usuario decidió aparcar más migraciones blueprint mientras se resuelve
  el problema de tools.
- **30 agentes legacy** en `modules/conversacion/ai-agent-framework/agents/`.
  Aparcados en deuda documentada (`agentes-roadmap.md`).
- **Contratos transversales nuevos en main**:
  `agente-blueprint.contract.json` (sin validator todavía).
  `llm-runtime-discipline.contract.json` v1.0.0 con 10 principios canónicos.
- **Blueprint padre único** en `arquitectura/decisiones/_blueprints/subsistema-recetario.modulo-base.blueprint.json`
  (los 10 módulos blueprint apuntan ahí). Ai-gateway extendido para resolver
  paths `arquitectura/` y `modules/` desde repo root.

### Lo que está archivado pero existe en el repo

- **`_archived/2026-05-08_calling-generator-y-plugins-externos/`** —
  Contiene `calling-generator/` (811 LOC, v2.0.0) + 5 plugins de ejemplo
  (`weather`, `slack`, `github`, `http-utils`, `ocr`).
  Archivado el 2026-05-08 por "ningún módulo canónico lo usa en runtime".
  **Este es el material base para la próxima sesión.** El README del
  archivado dice: *"recuperar si en el futuro hay marketplace de plugins"*.

### Decisión que NO se debe revertir

El usuario fue claro: **los módulos blueprint que ya están migrados se
quedan blueprint**. No se vuelven a tools normales. Los blueprints son
correctos para módulos conversacionales verticales con relación directa al
chat. El problema NO es de paradigma — es de **registro de tools y handlers
que se rompen al añadir**.

---

## 3 · El problema raíz operativo (lo que se diagnosticó)

El frontend hace `mqttRequest('recetas', 'list', data)` y esa llamada **falla
con timeout silencioso** o no devuelve datos. Lo mismo con escandallo,
viabilidad, carta-digital, carta-impresion, carta-marketing, carta-design,
pdf-viewer (cuando frontend pide `pdfjs.*`).

**Pero solo `fs.read.request` y `fs.write.request` son fiables 100% del
tiempo.** Esa es la pista clave.

### El sistema tiene 3 capas paralelas (sin reconciliar)

```
Frontend                                          (Capa 1)
  mqttRequest('recetas', 'list')
       │
       ▼ publica: ui/request/recetas/list
┌────────────────────────────────────────────┐
│  core/ui/UIRequestHandler.js                │
│  Suscribe: ui/request/#                     │
│  Map<'domain.action', handlerFn>            │
│  Si NO está registrado → HANDLER_NOT_FOUND  │
└────────────────────────────────────────────┘

Camino A para registrarse:
  module.json.ui_handlers[]
  → auto-wired por core/modules/loader.js::wireUIHandlers()
  → SI el método existe en la instance, hace uiHandler.register()
  Usado por: pdf-viewer, comandero, categorias, ...

Camino B para registrarse:
  this.uiHandler.register('domain', 'action', fn) en onLoad
  Usado por: productos, variaciones, cobros, cocina, pedidos,
             cuentas-canales, security-p2p


LLM via ai-gateway                                (Capa 2)
  ai-gateway escucha ui/request del LLM
  Lee moduleLoader.toolsRegistry
  Cuando LLM invoca tool X → publica X.request, espera X.response
  Tools registradas via module.json.tools[] + handler


Bus interno (lo que funciona siempre)             (Capa 3)
  Módulo A publica 'fs.read.request'
  filesystem está suscrito directo a 'fs.read.request'
  filesystem publica 'fs.read.response'
  Módulo A recibe response
  CERO INTERMEDIARIOS
```

### Por qué fs.read/write son fiables

**No pasan por UIRequestHandler ni por ai-gateway**. Son bus puro: módulo
publica → filesystem escucha → filesystem responde. Auto-wired desde
`module.json.events.subscribes[]` del módulo filesystem. Cero capas
intermedias. **Es la única capa robusta del sistema.**

### Por qué TODO lo demás falla

Cuando el frontend hace `mqttRequest('recetas', 'list')`:
1. Publica a `ui/request/recetas/list`.
2. UIRequestHandler lo recibe.
3. Busca `'recetas.list'` en su Map de handlers.
4. **Para los dominios rotos, ese handler nunca se registró.**
   - Ningún módulo declaró `ui_handlers: [{domain:'recetas', action:'list',...}]` en su `module.json`.
   - Ningún módulo llamó `uiHandler.register('recetas', 'list', fn)` en `onLoad`.
5. UIRequestHandler responde `HANDLER_NOT_FOUND 404`.
6. Frontend timeout / no muestra datos.

### Lista de páginas frontend rotas hoy (auditoría confirmada)

| Página del frontend | Tools que invoca | Estado |
|---|---|---|
| `[project_id]/recetas/` | `recetas.list/get/ingredientes/stats` | ❌ Sin handlers UI registrados |
| `[project_id]/escandallo/` | `escandallo.global/receta` | ❌ Sin handlers |
| `[project_id]/viabilidad/` | `viabilidad.estudio/config` | ❌ Sin handlers |
| `[project_id]/carta-digital/` | `carta-digital.carta-completa/config/create-session` | ❌ Sin handlers |
| `[project_id]/carta-impresion/` | `carta-impresion.generar` | ❌ Sin handlers |
| `[project_id]/carta-marketing/` | `carta-marketing.update-perfil` | ❌ Sin handlers |
| `[project_id]/carta-design/` | `design.profiles/save-profile/...` | ❌ Sin handlers |
| pdf-viewer (sin ruta) | `pdfjs.info/render` | ❌ Sin puente UI a servicios |

Los módulos `productos`, `comandero`, `cocina`, `cuentas-canales`,
`variaciones`, `cobros`, `pedidos`, `security-p2p`, `mesa`, `facturas`,
`llevadoo`, `staff` SÍ tienen handlers registrados manualmente — sus
páginas funcionan.

### Diagnóstico de fondo

El sistema tiene **3 sitios distintos** donde un módulo puede declarar cómo
se le invoca:
1. `module.json.tools[]` — visible al LLM.
2. `module.json.ui_handlers[]` — visible al frontend (auto-wired).
3. `this.uiHandler.register()` en `onLoad` — visible al frontend (manual).

Los tres se mantienen por separado. Cuando un módulo evoluciona y se
olvida de actualizar uno, las invocaciones por ese canal se rompen
silenciosamente (sin error claro, solo timeout). Es **fragilidad
estructural**, no bug.

---

## 4 · La dirección elegida: una capa única via plugins JSON

### La idea (formulación del usuario)

Sustituir las 3 capas por **UNA SOLA**: cada módulo declara sus operaciones
invocables como un **plugin JSON** (formato declarativo simple). Un
**intérprete único** (`calling-generator` redivivo o equivalente) lee
todos los plugins al arrancar y registra los handlers de forma que:

- El LLM ve esas operaciones como tools del catálogo (via toolsRegistry).
- El frontend las invoca via `mqttRequest('plugin', 'accion', data)` (via
  UIRequestHandler).
- Otros módulos las invocan via `bus.publishAndWait('plugin.accion.request')`.

**Una declaración, tres consumidores.**

### Lo que el calling-generator archivado YA hace (y por qué encaja)

Léelo: `_archived/2026-05-08_calling-generator-y-plugins-externos/calling-generator/`.
- 811 LOC, v2.0.0, idioma `en` (outlier — habría que canonizar al canon es).
- Reconoce plugins en `plugins/<name>/<name>.functions.json`.
- Cada función puede ser `method: GET|POST|PUT|DELETE|PATCH` (HTTP wrapper)
  o `method: "local_function"` (event-based).
- Genera **closures JavaScript dinámicamente** desde la declaración JSON.
- Las registra en `moduleLoader.toolsRegistry` para que ai-gateway las exponga
  al LLM.
- Resuelve 4 esquemas de autenticación: Bearer, API Key en header, API Key
  en query, Basic Auth (variables de entorno `{PLUGIN_NAME}_API_KEY`).
- Maneja path params (`/weather/{city}`), query params, body request.
- Cada invocación publica `function.generated`, `function.executed`,
  `function.failed` (eventos canónicos del sistema plugin).

**Tiene drift** (40 entries en baseline anterior), pre-POC2, métricas
comentadas. Pero la **arquitectura es correcta** y los **5 plugins de
ejemplo demuestran el patrón** (`weather`, `slack`, `github`, `http-utils`, `ocr`).

### Qué SÍ entra a la capa única

- Tools que el LLM invoca (`recetas.list`, `weather.get`, etc.).
- Handlers que el frontend invoca (`mqttRequest('recetas', 'list')`).
- Wrappers de APIs externas (`mercadona`, `slack`, `weather`, ...).
- Dispatch a eventos del bus interno (`local_function`).

### Qué NO entra (queda fuera por diseño)

**1. Primitivas del bus interno** (`fs.read.request`, `fs.write.request`,
`project.get.request`, etc.). Razón: latencia. Si `fs.read` (100 llamadas
por sesión) pasara por intérprete-plugin, sumaría ~100ms inaceptables.
**Las primitivas siguen siendo bus puro**, son la "API del kernel".

**2. Pseudocódigo de blueprints.** Los blueprints son ejecutados por el LLM
razonando, no por intérprete determinista. Cuando un blueprint dice
`publishAndWait('recetas.crear.request')`, ese evento ahora lo atiende un
PLUGIN (no el módulo legacy borrado). Compatibilidad transparente. Pero
el pseudocódigo del blueprint NO se vuelve plugin.

### Por qué esto resuelve el problema operativo

1. **Una sola declaración**: módulo declara su plugin → handler registrado
   automáticamente para los 3 consumidores. Imposible olvidar uno.
2. **Tipos comprobables**: parameters como JSON Schema, validado AJV.
   Errores estructurales detectados antes de runtime.
3. **Hot-reload natural**: añadir plugin JSON nuevo no requiere reiniciar
   nada — el intérprete detecta el archivo, lo carga, registra handlers
   nuevos. Calling-generator legacy ya lo hace via `onPluginLoaded`.
4. **Tests del plugin**: un solo intérprete con tests = los plugins heredan
   confiabilidad. No hay handlers de cada módulo con sus propios bugs.
5. **El frontend deja de romperse**: cuando se añade un plugin nuevo,
   automáticamente aparece para el frontend.

---

## 5 · Cuellos identificados (con mitigación)

| # | Cuello | Severidad | Mitigación |
|---|---|---|---|
| 1 | Plugins que requieren **estado en memoria** (cachés, conexiones DB) | Media | El intérprete gestiona `state_persistente` por plugin (Map<plugin_name, state>). O dos tipos: plugin puro (sin estado) + plugin con código JS adjunto (con estado). |
| 2 | Plugins que necesitan **librerías nativas** (pdfjs, sharp, google-vision) | Alta | Modo "plugin con código JS adjunto": el plugin JSON declara la interfaz, un `index.js` adjunto ejecuta la lógica. Es el modelo `local_function` de calling-generator legacy. |
| 3 | **Performance** del despacho con muchos plugins | Baja | Map<key, handler> es O(1). Para ~500 plugins, <1ms despacho. No es cuello mientras el handler en sí sea rápido. |
| 4 | **Hot-reload** sin reiniciar el sistema | Media | `fs.watch` sobre `plugins/` o evento `plugin.loaded` del plugin-manager. El intérprete carga, registra, desregistra. |
| 5 | **Single point of failure** | Alta | Intérprete extremadamente estable: cero lógica de dominio, solo dispatch + ejecución. Errores en handlers NO crashean intérprete (catch + responder error). |
| 6 | Plugins con **dependencias entre sí** (A llama a B que llama a C) | Media | Buena propagación de errores + timeouts por nivel. Mismo problema que cualquier sistema event-driven. |
| 7 | **Multi-tenant** | Baja | Plugins globales, llamadas llevan `project_id` en payload. Sin cuello. |
| 8 | **Versionado de plugins** | Baja | Cada plugin tiene `version`. Cambios mayores → bump + transición declarada. |

### Cuellos NO reales

- Credenciales (env vars con convención `{PLUGIN_NAME}_API_KEY` funciona).
- Schemas (AJV con JSON Schema 2020-12 ya en uso en el repo).
- Idioma (canonizar a `es` en migración).

---

## 6 · Lo que esto implica para los blueprints

Los blueprints NO se tocan. Pero su comportamiento cambia sutilmente:

- Cuando un blueprint dice
  `publishAndWait('recetas.crear.request', {ingredientes, ...})`, esa request
  ahora la atiende **un plugin** (el plugin recetas, vivo via intérprete),
  no el módulo legacy borrado.
- El blueprint del LLM sigue siendo pseudocódigo declarativo.
- El frontend, llamando `mqttRequest('recetas', 'list')`, también va al
  mismo plugin.

**Una sola fuente de verdad por dominio: el plugin.** Múltiples consumidores.

---

## 7 · El concepto de los CAJONES (aparcado para después de la capa única)

### La metáfora del usuario

> *"Una despensa con cajones. Cada cajón tiene una cosa específica. Cuando
> tengas que pensar en X, vete al cajón X, coge lo que necesitas, cierra
> el cajón, sigue. Si quita la sobrecarga de tokens. Extensible a distintas
> áreas."*

### Qué problema resuelve

Los blueprints actuales tienen 400-900 líneas de system prompt cargadas en
TODO turno del LLM (padre + hijo + todas las operaciones del módulo). El LLM
ve todo el catálogo aunque solo vaya a invocar una operación. Eso causa:
- Distracción (ve operaciones no pedidas).
- Sobrecarga de tokens.
- Confusión cuando hay muchas operaciones.

### Cómo se implementa (nombre técnico: lazy context loading / context partitioning)

- **El system prompt principal lleva solo el ÍNDICE**: "este módulo tiene
  un cajón X para listar, un cajón Y para crear, un cajón Z para analizar".
- **Cada cajón vive en archivo separado** — sub-prompt acotado a esa
  operación específica.
- **El LLM invoca una tool `context.fetch(cajón)`** cuando necesita un cajón.
- **El cajón se inyecta en el contexto del LLM** solo para ese turno.
- **Al siguiente turno**, el cajón se descarta (no permanece en el contexto
  activo) — equivale al "cerrar cajón".

### Por qué se aparca

La capa única de tools resuelve un problema operativo MÁS URGENTE (tools
que se rompen al añadir). Los cajones son **perfeccionamiento de blueprints**
— mejora cuando los blueprints estén siendo usados mucho y la sobrecarga
de tokens duela. Hoy duele menos que las tools rotas.

### Cuándo retomar

Tras la capa única, los blueprints existentes (10 módulos) seguirán
existiendo y se usarán más. Cuando se observe sobrecarga real en runtime
(latencia, tokens, LLM distraído), retomar los cajones. **Apuntar como
trabajo futuro en `arquitectura/decisiones/propuestas/cajones-context-partitioning.md`**
(no creado todavía).

---

## 8 · Camino propuesto para la próxima sesión

### Fase 0 — Preparación (30 min)

1. Leer este documento.
2. Verificar estado actual del repo: `git log --oneline -10` en
   `claude/read-claude-md-74wst` o nueva rama.
3. **Inspeccionar el código archivado**:
   - `_archived/2026-05-08_calling-generator-y-plugins-externos/calling-generator/index.js` (811 LOC)
   - `_archived/2026-05-08_calling-generator-y-plugins-externos/calling-generator/module.json`
   - Los 5 plugins de ejemplo en `_archived/2026-05-08_calling-generator-y-plugins-externos/plugins/`
4. Verificar el manifest de mercadona-api como referencia del shape
   actual de un módulo wrapper de API externa.

### Fase 1 — Contrato del intérprete-plugin (1-2h, sin código)

Antes de tirar código, escribir el contrato canónico siguiendo el patrón
del repo:

**Crear** `arquitectura/decisiones/_contratos/tools-plugin-layer.contract.json`
con secciones canónicas (`_doc`, `id`, `version`, `creada`, `objetivo`,
`inputs`, `filosofia`, `principios`, `decisiones_arquitectonicas`,
`prohibido`, `output_shape_resumen`, `validaciones_cross_realizadas_por_validator`,
`salida_validador`, `convenciones_complementarias`).

Decisiones que el contrato debe formalizar:
- Plugin como UN archivo JSON en `plugins/<name>/<name>.functions.json`.
- Plugin puede tener `index.js` adjunto si necesita código nativo
  (modo "plugin con código adjunto", distinto de "plugin declarativo puro").
- Idioma: `es` (canonizar; legacy era `en`).
- Cada función del plugin se registra en 3 sitios automáticamente:
  - `moduleLoader.toolsRegistry` (LLM).
  - `uiHandler.register()` (frontend).
  - Auto-suscripción al evento `<plugin>.<function>.request` (bus).
- Eventos canónicos del subsistema plugin: `plugin.loaded`,
  `plugin.unloaded`, `function.generated`, `function.executed`,
  `function.failed`, `function.generation.error`.
- 4 esquemas de auth: Bearer, API Key (header/query), Basic Auth, none.
- Auth via env vars: `{PLUGIN_NAME}_API_KEY`.
- Timeouts: HTTP 30s default, local_function 5s default, configurable
  por plugin.
- Validación AJV strict de parameters como JSON Schema 2020-12.

### Fase 2 — Recuperar calling-generator del archivo (30 min)

- `git mv _archived/2026-05-08_.../calling-generator/ modules/tools-plugin-runtime/`
  (renombrado canónico — el nombre `calling-generator` es del proyecto
  original; mejor un nombre del dominio actual).
- Verificar config.json para enabled.
- Renombrar archivos de auditoría `.archived-calling-generator.json`
  para que vuelvan a ser válidos.

### Fase 3 — Migrar a POC2 + canonizar (3-5h)

- Extender `BaseModule`.
- Idioma `en` → `es`.
- Helpers POC2 estándar (`_errorResponse`, `_classifyHandlerError`,
  `_handleHandlerError`, `_publicarEvento`).
- Resolver las 40 entradas de drift que tenía en baseline.
- Adaptar al patrón actual del repo (no `provides`, sí `events.publishes`
  + `events.subscribes`).
- Tests unitarios POC2 con 7 capas.

### Fase 4 — Integrar registro multi-canal (2-3h)

Lo nuevo respecto al calling-generator legacy: **registrar AUTOMÁTICAMENTE
en 3 destinos** cada función generada:
- `moduleLoader.toolsRegistry.set(fullName, {...})` — ya lo hacía.
- `uiHandler.register(plugin, function, handlerFn)` — **NUEVO**.
- Auto-suscripción al evento `<plugin>.<function>.request` — **NUEVO**
  (para que otros módulos del bus también lo invoquen).

### Fase 5 — Plugin de prueba: recetas (2-3h)

Para probar el modelo end-to-end:

Crear `plugins/recetas/recetas.functions.json` con las funciones que el
frontend espera:
- `list({project_id})` — lista recetas.
- `get({id, project_id})`.
- `ingredientes({project_id})`.
- `stats({project_id})`.

Cada función internamente publica `fs.read.request` para leer
`/recetas.json` y filtra/transforma. El plugin es **bridge entre el
frontend y el storage del módulo recetas (blueprint)**. El blueprint sigue
ahí para operaciones complejas via chat (crear con normalización, etc.).

Test: arrancar el sistema, abrir `[project_id]/recetas/` en frontend.
Debería mostrar recetas. **Eso valida la capa única**.

### Fase 6 — Migrar otros dominios rotos (cada uno ~1-2h)

Una vez recetas funciona, replicar:
- `plugins/escandallo/escandallo.functions.json` — `global`, `receta`.
- `plugins/viabilidad/viabilidad.functions.json` — `estudio`, `config`.
- `plugins/carta-digital/carta-digital.functions.json` — `carta-completa`,
  `config`, `create-session`.
- `plugins/carta-impresion/carta-impresion.functions.json` — `generar`.
- `plugins/carta-marketing/carta-marketing.functions.json` — `update-perfil`.
- `plugins/carta-design/carta-design.functions.json` — `profiles`,
  `save-profile`, `delete-profile`, `gallery`, `load-carta`.
- `plugins/pdfjs/pdfjs.functions.json` — puente al servicio `local.pdfjs`.

Cada plugin tiene parámetros sacados del frontend actual (ya conocemos
las firmas — están en `frontend/src/lib/stores/*`).

### Fase 7 — Plugin mercadona (1h)

Existe ya como módulo JS. Como segunda prueba de concepto, declararlo
también como plugin (puede coexistir mientras se migra; o reemplazarlo
directamente si los tests pasan).

### Fase 8 — Limpieza (1-2h)

- Eliminar `module.json.ui_handlers[]` de módulos que ahora son plugins.
- Eliminar llamadas `uiHandler.register()` manuales en `onLoad` de módulos
  migrados.
- Una sola forma de declarar handlers en todo el sistema.

### Fase 9 — Documentar y commitear

- Actualizar `CLAUDE.md` con el nuevo paradigma.
- Actualizar `modulos-blueprint-driven.contract.json` para clarificar
  separación: tools vs blueprints.
- Cerrar drifts del baseline.
- PR a main.

---

## 9 · Decisiones abiertas (no resueltas)

1. **¿El intérprete-plugin se llama `tools-plugin-runtime`, `calling-generator`,
   `plugin-runtime`, o algo más?** El usuario lo decide.
2. **¿Plugins viven en `plugins/<name>/` (raíz del repo) o en
   `modules/_plugins/<name>/`?** Original era en raíz; pero el repo usa
   `modules/_X-blueprint/` para artefactos similares. Decidir.
3. **¿Plugin con código adjunto (modo `local_function` legacy) sigue siendo
   válido, o todos los plugins son JSON puro?** Si todos son puros, los
   que necesitan código (sharp, pdfjs, google-vision) no encajan y siguen
   siendo módulos JS aparte. Si admitimos código adjunto, el modelo es más
   flexible pero menos puro.
4. **¿Cuántos plugins de ejemplo recuperar del archivado?** Los 5
   (`weather`, `slack`, `github`, `http-utils`, `ocr`) son de proyecto
   externo. Probablemente solo `ocr` tiene sentido (encaja con el bloqueo
   de menu-generator). Los demás se archivan o se borran.
5. **¿Validator nuevo para plugins?** Sí, debería existir
   `tools-plugin-layer.validate.js` que cruce los plugins con el catálogo de
   eventos, valide los schemas, detecte plugins fantasma.

---

## 10 · Cómo arrancar la próxima sesión

Mensaje sugerido para empezar la próxima conversación:

> *"Vamos a implementar la capa única de tools via plugins. He guardado
> todo el contexto en `arquitectura/decisiones/propuestas/capa-unica-tools-via-plugins.md`.
> Léelo y arranca por la Fase 0. Cuando termines, vuelve a mí con
> el contrato propuesto (Fase 1) antes de tirar código."*

Eso te lleva al punto donde se quedó esta sesión. Tu yo-futuro lee el doc,
inspecciona el código archivado, propone el contrato, lo discutimos, y
arranca.

---

## 11 · Referencias rápidas (archivos clave para inspeccionar)

| Qué | Dónde | Por qué |
|---|---|---|
| Calling-generator original | `_archived/2026-05-08_calling-generator-y-plugins-externos/calling-generator/` | Punto de partida del intérprete |
| 5 plugins de ejemplo | `_archived/2026-05-08_calling-generator-y-plugins-externos/plugins/` | Patrón JSON declarativo |
| README del archivado | `_archived/2026-05-08_calling-generator-y-plugins-externos/README.md` | Por qué se archivó, cómo recuperar |
| UIRequestHandler | `core/ui/UIRequestHandler.js` | La capa que recibe `ui/request/#` del frontend |
| Auto-wiring de ui_handlers | `core/modules/loader.js::wireUIHandlers()` (línea 897) | Cómo se registran handlers desde manifest |
| Frontend mqttRequest | `frontend/src/lib/ui-core/mqtt-request.ts` | Cómo el frontend invoca |
| ai-gateway blueprints | `modules/conversacion/ai-gateway/index.js::_loadBlueprints()` (línea 277) | Cómo se cargan los blueprints |
| mercadona-api manifest | `modules/mercadona-api/module.json` | Patrón actual de wrapper API externa |
| Blueprint padre único | `arquitectura/decisiones/_blueprints/subsistema-recetario.modulo-base.blueprint.json` | Padre de todos los blueprints |
| Contrato disciplina LLM | `arquitectura/decisiones/_contratos/llm-runtime-discipline.contract.json` | 10 principios de comportamiento LLM |
| Documento maestro paradigma | `arquitectura/decisiones/_contratos/modulos-blueprint-driven.contract.json` | Cuándo blueprint vs JS |

---

## 12 · Trabajo pendiente recordatorio (cosas en deuda no relacionadas)

Para que no se pierdan:
- `recetario-creativo`, `pase-cocina`, `mise-en-place` — 3 últimos módulos
  del subsistema-recetario sin migrar. NO urgente.
- 30 agentes legacy en `ai-agent-framework/agents/` — patrón
  `agente-blueprint` pendiente de implementar.
- Validators sin implementar: `agente-blueprint.validate.js`,
  `llm-runtime-discipline.validate.js`.
- Frontend con 80 drifts de paleta canónica (hex colors hardcoded).
  Limpieza visual pendiente.

Estos NO bloquean la capa única de tools — son ortogonales.

---

## 13 · Cómo no perder el hilo en sesiones futuras

Este documento ES el hilo. Mientras siga en `arquitectura/decisiones/propuestas/`,
cualquier Claude futuro puede leerlo y entender:
1. Qué problema operativo existe (sección 3).
2. Qué dirección se eligió (sección 4).
3. Qué cuellos hay (sección 5).
4. Cómo proceder (sección 8).
5. Qué queda en el aire (sección 9).

Cuando el camino se complete, este documento se actualiza con la fecha
de cierre, las decisiones tomadas, y se mueve a
`arquitectura/decisiones/_outputs/` como documentación histórica de la
decisión.

Mientras tanto: vive aquí. Es la red de seguridad de la siguiente sesión.
