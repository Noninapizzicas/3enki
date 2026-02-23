# Reference: Mapeo contexto/ ↔ código fuente

Cada archivo de `contexto/` documenta una parte específica del código. Este archivo define **qué leer en el código** para verificar cada archivo de contexto, y **qué verificar**.

---

## 1. index.json

**Código fuente:** Todo el repositorio (meta-índice)

**Qué verificar:**
- `context_files[]` — ¿lista los 28 archivos? ¿las descripciones son correctas?
- `quick_reference.stack` — ¿coincide con package.json dependencies?
- `quick_reference.ports` — ¿coincide con config.json?
- `project.modules_count` — ¿coincide con conteo real de modules/?

**Cómo verificar:**
```
Glob: contexto/*.json, contexto/*.md → contar archivos
Read: config.json → puertos
Read: package.json → stack
Glob: modules/**/module.json → contar módulos
```

---

## 2. SYSTEM-ANALYSIS.md

**Código fuente:** Análisis global del sistema

**Qué verificar:**
- Version en título — ¿coincide con README.md?
- Scope — ¿"All N context files" coincide con archivos reales?
- System Stats — conteos de módulos, providers, APIs, tools, events, UI handlers
- Architecture Weaknesses — ¿siguen siendo válidas o ya se resolvieron?
- Pending Improvements — ¿items marcados DONE realmente están hechos?
- Key Patterns — ¿se siguen aplicando en el código?

**Cómo verificar:**
```
Glob: modules/**/module.json → contar módulos
Glob: services/providers/local/*/index.js → contar providers
Grep: "apis" en modules/**/module.json → contar APIs
Grep: "tools" en modules/**/module.json → contar tools
Grep: events.subscribes/publishes en module.json → estimar eventos
Read: modules/project-manager/index.js → verificar si sigue siendo monolito
```

---

## 3. system.json

**Código fuente:** `index.js` (entry point), `core/`, `config.json`

**Qué verificar:**
- `startup_sequence` — ¿coincide con el orden en index.js?
- `module_load_order.tiers` — ¿coincide con config.modules.enabled?
- `module_load_order.disabled` — ¿coincide con config.modules.disabled?
- `directories` — ¿los directorios listados existen? ¿los conteos son correctos?
- `conventions.naming` — ¿se respetan en el código?
- `conventions.logging.api` — ¿se usa logger.info('event', {data}) y NO logger.info({data}, 'event')?
- `patrones_recientes` — ¿los patrones documentados existen en el código?

**Cómo verificar:**
```
Read: index.js → startup sequence
Read: config.json → modules.enabled, modules.disabled
Bash: ls para verificar directorios
Read: core/modules/loader.js → verificar wiring order
Grep: logger.info en modules/ → verificar API de logging
```

---

## 4. modules.json

**Código fuente:** `modules/**/module.json`, `core/modules/loader.js`

**Qué verificar:**
- `active_modules[]` — ¿coincide con módulos habilitados en config.json?
- `disabled_modules[]` — ¿coincide con config.modules.disabled?
- `module_count` — ¿core, pizzepos, total, active, disabled son correctos?
- `module_json_schema` — ¿refleja la estructura real de los module.json?
- `lifecycle_hooks.loader_wiring_order` — ¿coincide con loader.js?
- `module_categories` — ¿todos los módulos están en alguna categoría?
- `key_modules` — ¿versiones y APIs coinciden con module.json reales?
- `database_event_pattern` — ¿se usa project_id y no database?

**Cómo verificar:**
```
Read: config.json → modules.enabled, modules.disabled
Glob: modules/**/module.json → listar todos
Read: core/modules/loader.js → wiring order
Read: cada modules/{name}/module.json → version, apis
Grep: "database:" en modules/ → verificar que NO se usa (debe ser project_id)
```

---

## 5. catalogo-servicios.json

**Código fuente:** `modules/**/module.json`, `services/providers/local/*/index.js`

**Qué verificar:**
- `resumen` — conteos totales (módulos, providers, APIs, eventos, tools)
- `modulos` — cada módulo documentado debe existir en modules/
- Cada módulo en modules/ debe estar documentado aquí
- `modulos.{categoria}.{modulo}.apis` — ¿coinciden con module.json real?
- `modulos.{categoria}.{modulo}.eventos_publica/suscribe` — ¿coinciden?
- `modulos.{categoria}.{modulo}.tools` — ¿coinciden?
- `service_providers.local` — cada provider documentado debe existir
- Cada provider en services/providers/local/ debe estar documentado

**Cómo verificar:**
```
Glob: modules/**/module.json → listar módulos reales
Read: cada module.json → apis, events, tools
Glob: services/providers/local/*/index.js → listar providers reales
Read: cada provider index.js → functions
```

**NOTA:** Este es el archivo MÁS CRÍTICO. El provider `local.context-sync` ya hace esta verificación programáticamente.

---

## 6. services.json

**Código fuente:** `services/providers/local/*/`, `modules/ai-gateway/providers/`

**Qué verificar:**
- Lista de providers locales — ¿coincide con directorios reales?
- Funciones de cada provider — ¿coinciden con el código?
- LLM providers — ¿lista correcta?
- Credential resolution pattern — ¿se respeta?

**Cómo verificar:**
```
Bash: ls services/providers/local/ → providers reales
Read: services/providers/local/{name}/index.js → funciones
Bash: ls modules/ai-gateway/providers/ → LLM providers
```

---

## 7. providers.json

**Código fuente:** `services/providers/`, `core/providers/loader.js`

**Qué verificar:**
- Patrones de providers — ¿se siguen en el código?
- Regla de credenciales — ¿ningún provider resuelve credenciales internamente?
- Event pattern `{provider}.{function}.request → response` — ¿se respeta?

**Cómo verificar:**
```
Grep: "credential" en services/providers/local/*/index.js → verificar que NO resuelven creds
Grep: ".request" en services/providers/local/*/index.js → verificar patrón de eventos
```

---

## 8. credentials.json

**Código fuente:** `core/providers/`, `modules/credential-manager/`, `.env` (si existe)

**Qué verificar:**
- Cascade levels (CUSTOM > CLIENT > PROJECT > GLOBAL) — ¿implementado?
- Provider credential keys — ¿documentados correctamente?
- .env format patterns — ¿se respetan?

**Cómo verificar:**
```
Read: modules/credential-manager/index.js → cascade logic
Grep: "PROVIDER_" en modules/ → credential key patterns
```

---

## 9. handlers.json

**Código fuente:** `handlers/global/*.js`, `data/projects/*/handlers/`, `core/handler-loader/`

**Qué verificar:**
- Handler structure (trigger, filter, handle) — ¿se respeta?
- Envelope pattern `const data = event.data || event` — ¿presente en todos?
- services.call pattern — ¿se usa correctamente?
- Global vs project handlers — ¿ubicación correcta?

**Cómo verificar:**
```
Glob: handlers/global/*.js → listar handlers activos
Glob: handlers/global/archived/*.js → listar archivados
Grep: "event.data || event" en handlers/ → verificar envelope pattern
Read: core/handler-loader/ → estructura
```

---

## 10. ai-gateway.json

**Código fuente:** `modules/ai-gateway/`, `modules/ai-gateway/providers/`

**Qué verificar:**
- Lista de LLM providers — ¿coincide con archivos *-provider.js?
- Modelos por provider — ¿actualizados?
- Tool calling support — ¿correctamente documentado?
- APIs del módulo — ¿coinciden con module.json?

**Cómo verificar:**
```
Bash: ls modules/ai-gateway/providers/*-provider.js → listar providers
Read: modules/ai-gateway/module.json → apis, tools
Read: cada *-provider.js → modelos soportados
```

---

## 11. bot-agent-architecture.json

**Código fuente:** `modules/bot-manager/`, `modules/agent-manager/`, `modules/ai-agent-framework/`

**Qué verificar:**
- Tool unification — ¿ToolManager v2 importa de moduleLoader.toolsRegistry?
- Agent builtins — ¿lista correcta?
- Backward aliases — ¿siguen funcionando?

**Cómo verificar:**
```
Read: modules/ai-agent-framework/tool-manager.js → verificar unificación
Read: modules/agent-manager/module.json → apis, tools
Read: modules/bot-manager/module.json → apis, tools
```

---

## 12. chat-refactoring.json

**Código fuente:** `modules/chat-session/`, `modules/chat-ai-bridge/`, `modules/conversation-manager/`

**Qué verificar:**
- conversation-manager está deshabilitado — ¿confirmado en config.json?
- chat-session y chat-ai-bridge son los módulos activos — ¿module.json correctos?
- No hay imports/referencias a conversation-manager en código activo

**Cómo verificar:**
```
Read: config.json → modules.disabled incluye conversation-manager
Grep: "conversation-manager" en modules/ (excluir el propio) → no debería haber refs activas
```

---

## 13. scheduler.json

**Código fuente:** `modules/scheduler/`

**Qué verificar:**
- Trigger types — ¿todos implementados?
- Action types — ¿todos implementados?
- Project scoping — ¿jobs tienen project_id?
- APIs y tools — ¿coinciden con module.json?

**Cómo verificar:**
```
Read: modules/scheduler/module.json → apis, tools, events
Read: modules/scheduler/index.js → trigger types implementados
```

---

## 14. flow-engine.json

**Código fuente:** `core/flow/`

**Qué verificar:**
- Step types — ¿todos implementados en step-handlers?
- Variable resolver functions — ¿coinciden?
- Integrations — ¿scheduler, ai-gateway, ai-agent-framework?
- NOTA: flow-engine NO es un módulo, vive en core/flow/

**Cómo verificar:**
```
Bash: ls core/flow/ → componentes
Read: core/flow/ → step types, variable resolver
```

---

## 15. facturas.json

**Código fuente:** `handlers/global/` (handlers go*), `data/projects/*/handlers/`

**Qué verificar:**
- Handlers documentados — ¿existen?
- Pipeline stages — ¿implementados?
- Storage structure — ¿paths correctos?

**Cómo verificar:**
```
Glob: handlers/global/go*.js → handlers de facturas
Grep: "facturas" en handlers/ → verificar pipeline
```

---

## 16. document-processor.json

**Código fuente:** `services/providers/local/` (pdf, pdf-parse, tesseract, sharp, etc.)

**Qué verificar:**
- Processors documentados — ¿providers existen?
- Formatos soportados — ¿coinciden con código?

**Cómo verificar:**
```
Read: services/providers/local/pdf/index.js
Read: services/providers/local/pdf-parse/index.js
Read: services/providers/local/tesseract/index.js
```

---

## 17. project-composition.json

**Código fuente:** `modules/project-manager/lib/`

**Qué verificar:**
- 5 fases de composición — ¿implementadas en lib/?
- Links, dependencies, systems, shared context, inherited context

**Cómo verificar:**
```
Read: modules/project-manager/lib/composition.js
Read: modules/project-manager/lib/systems.js
Read: modules/project-manager/lib/context.js
```

---

## 18. arquitectura-proyectos.json

**Código fuente:** `frontend/src/routes/[project_id]/`, `modules/project-manager/`

**Qué verificar:**
- Project-scoped routes — ¿existen en frontend?
- Multi-tenancy pattern — ¿implementado?

**Cómo verificar:**
```
Glob: frontend/src/routes/[project_id]/**/*.svelte → rutas project-scoped
```

---

## 19. blueprints-features.json

**Código fuente:** `blueprints/`, `plopfile.js`

**Qué verificar:**
- Blueprints documentados — ¿existen archivos .yaml?
- Generators — ¿coinciden con plopfile.js?

**Cómo verificar:**
```
Glob: blueprints/*.yaml → blueprints reales
Read: plopfile.js → generators definidos
```

---

## 20. skills.json

**Código fuente:** `services/providers/local/skills/`

**Qué verificar:**
- Skills documentados en `skills_creados` — ¿todos existen como providers?
- Funciones de cada skill — ¿coinciden?
- Servicios protegidos — ¿lista actualizada?

**Cómo verificar:**
```
Bash: ls services/providers/local/ → todos los providers
Read: services/providers/local/skills/index.js → protectedServices array
```

---

## 21. templates.json

**Código fuente:** `plopfile.js`, `blueprints/`

**Qué verificar:**
- Generators documentados — ¿existen en plopfile.js?
- Templates path — ¿archivos .hbs existen?

**Cómo verificar:**
```
Read: plopfile.js → setGenerator calls
Glob: blueprints/**/*.hbs → templates
```

---

## 22. ui-generator.json

**Código fuente:** `prompts/`, `frontend/src/lib/`

**Qué verificar:**
- Prompt references — ¿archivos de prompts existen?
- Module schema reference — ¿actualizado?

---

## 23. pizzepos.json

**Código fuente:** `modules/pizzepos/*/module.json`

**Qué verificar:**
- 12 módulos listados — ¿todos existen?
- Versiones — ¿coinciden con module.json reales?
- Canales de venta — ¿5 canales en cuentas-canales?
- APIs y eventos — ¿coinciden?

**Cómo verificar:**
```
Glob: modules/pizzepos/*/module.json → listar 12 módulos
Read: cada module.json → version, apis, events
Read: modules/pizzepos/cuentas-canales/index.js → canales
```

---

## 24. learning.json

**Código fuente:** `services/providers/local/learning/`

**Qué verificar:**
- Funciones documentadas — ¿implementadas?
- Storage — ¿paths correctos?

**Cómo verificar:**
```
Read: services/providers/local/learning/index.js → funciones
Read: services/providers/local/learning/manifest.json → schema
```

---

## 25. ui.json

**Código fuente:** `frontend/src/lib/`, `frontend/src/routes/`

**Qué verificar:**
- Stores documentados — ¿existen en frontend/src/lib/stores/?
- Componentes — ¿existen?
- Rutas — ¿coinciden con routes/?

**Cómo verificar:**
```
Glob: frontend/src/lib/stores/*.ts → stores reales
Glob: frontend/src/routes/**/*.svelte → rutas reales
```

---

## 26. mejoras-pendientes.json

**Código fuente:** Todo el repositorio

**Qué verificar:**
- Items marcados como completados — ¿realmente están hechos en el código?
- Items pendientes — ¿siguen siendo relevantes?
- No mezclar completados con pendientes

**Cómo verificar:**
- Para cada item completado: verificar en el código que existe
- Para cada item pendiente: verificar que no se haya implementado ya

---

## 27. analisis-project-manager.json

**Código fuente:** `modules/project-manager/`

**Qué verificar:**
- Estructura split — ¿12 archivos en lib/?
- Líneas — ¿index.js sigue siendo < 150 líneas?
- Archivos lib/ — ¿coinciden con los documentados?

**Cómo verificar:**
```
Bash: wc -l modules/project-manager/index.js → líneas
Bash: ls modules/project-manager/lib/ → archivos
Bash: wc -l modules/project-manager/lib/*.js → líneas por archivo
```

---

## 28. mqtt.json

**Código fuente:** `core/mqtt/`, `core/broker/`, `core/ui/`

**Qué verificar:**
- Topic patterns — ¿coinciden con el código?
- QoS levels — ¿correctos?
- UI request/response pattern — ¿implementado?

**Cómo verificar:**
```
Read: core/ui/request-handler.js → UI pattern
Read: core/mqtt/ → client patterns
Read: core/broker/ → broker config
```
