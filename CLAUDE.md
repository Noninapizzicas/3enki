# Paradigma del sistema — Event-Core

## La regla que no se rompe

**Emite evento. Quien sabe, hace. Tú no sabes cómo.**

Cada módulo conoce exactamente una cosa: su dominio. Nada más.

### Un módulo NO:
- Llama directamente a otro módulo
- Instancia servicios de persistencia propios
- Espera respuesta de lo que emitió
- Mezcla dominio con infraestructura (SQLite, HTTP, filesystem)
- Controla el flujo después de emitir

### Un módulo SÍ:
- Emite eventos con datos de dominio
- Escucha eventos que le corresponden
- Actúa dentro de su responsabilidad
- Devuelve resultados a quien le llamó

El emisor sabe **qué**. El receptor sabe **cómo**.

## Granularidad

**Un módulo = una responsabilidad acotada. El nombre del directorio describe exactamente qué hace.**

- `carta-design` diseña la apariencia visual
- `carta-impresion` genera la carta para imprimir
- `carta-scheduler` decide qué carta está activa por franja
- `device-registry` / `device-shadow` / `device-health` son 3 responsabilidades, no un mega `device-manager`

No fusionar en mega-módulos "manager". La claridad inmediata del nombre vale más que el ahorro de archivos. Si dos módulos comparten 80% de su lógica, se valora fusionar como excepción razonada, no como regla.

---

# Cómo trabajo en este repo

Este `CLAUDE.md` es un **índice**. La información estructurada vive en JSONs validados contra schemas. Antes de cualquier tarea, leo los archivos que apliquen.

## Convenciones (cómo se nombra y se estructura todo)

- **`arquitectura/convenciones/_outputs/naming.json`**
  Convención de naming: idioma por módulo (`module.json.language` ∈ {es, en}), forma de los eventos (`<module-prefix>.<entity>.<verb>`), verbos canónicos por idioma, restricciones léxicas (ASCII puro, kebab-case, sin tildes ni ñ).

- **`arquitectura/convenciones/_outputs/glossary.json`**
  Glosario cross-módulo: una sola forma canónica por concepto por idioma. Sinónimos prohibidos. Si un concepto aparece aquí, su nombre canónico es el único permitido. Solo entran términos que cruzan dos o más módulos.

- **`arquitectura/convenciones/_contratos/{naming,glossary}.contract.json`**
  El "por qué": principios, scope, criterios de inclusión, validaciones cruzadas. Lectura recomendada cuando hay dudas sobre la regla.

## Auditoría del sistema (estado real de cada módulo)

- **`arquitectura/auditoria/_outputs/manifest-completo/<modulo>.json`**
  Lo declarado por el módulo (extraído de su `module.json`).

- **`arquitectura/auditoria/_outputs/modulo-completo/<modulo>.json`**
  Lo real (extraído del código + cruzado con el manifest). Incluye eventos publicados con archivo:línea, subscribes, tools, ui_handlers, apis_http, estado, lifecycle, dependencias, modos de fallo, observabilidad, outliers y quirks. **Es el documento autoritativo del módulo: si tienes que reescribirlo, lees ESTO antes que el código viejo.**

- **`arquitectura/auditoria/_contratos/modulo-completo.contract.json`**
  Define qué campos tiene cada auditoría y por qué.

## Validators

Todos los outputs (convenciones y auditorías) son validables mecánicamente. Antes de proponer cambios estructurales:

```bash
node arquitectura/convenciones/_validators/naming.validate.js
node arquitectura/convenciones/_validators/naming.validate.js --check-system
node arquitectura/convenciones/_validators/glossary.validate.js
node arquitectura/convenciones/_validators/glossary.validate.js --check-system
node arquitectura/auditoria/_validators/modulo-completo.validate.js <slug>
```

Para correr los 9 validators juntos contra el sistema completo (lo que corre CI):

```bash
npm run validate:ci                  # falla si hay drift NUEVO vs drift-baseline.json
npm run validate:baseline:update     # regenera baseline tras cierre legítimo de drift
```

`drift-baseline.json` congela los warnings/info conocidos. CI bloquea cuando aparece drift nuevo, no cuando hay warnings. Si bajas warnings legítimamente (porque cerraste deuda) regeneras baseline.

## Decisiones cross-módulo (subsistemas y políticas)

Vive en `arquitectura/decisiones/` como contratos JSON con schemas + validators. Cada uno fija UNA política observable across-modules.

- **`_contratos/companero-viaje.contract.json`** — visión maestra del subsistema chat/LLM/agentes. Define las 4 capacidades del compañero (memoria sostenida, especialización por contexto, acceso al sistema, modularidad infinita), los 5 tipos canónicos de extensión (canal, tool, agente, memoria, integración), los 13 eventos canónicos del subsistema, los 8 campos canónicos del payload y las 10 garantías observables. Documento autoritativo: cualquier sub-contrato del subsistema (chat-flow, agent-flow, etc.) deriva de aquí.

- **`_contratos/chat-flow.contract.json`** + **`_schemas/chat-flow/*.json`** — sub-contrato derivado: 5 eventos canónicos del flujo del chat (`chat.message.saved`, `chat.context.enriched`, `chat.prompt.ready`, `ai.chat.response`, `ai.chat.failed`). Schemas estrictos AJV `additionalProperties:false`.

- **`_contratos/agent-flow.contract.json`** + **`_schemas/agent-flow/*.json`** — sub-contrato derivado: 4 eventos canónicos del flujo de agentes (`agent.execute.request`, `agent.execute.response`, `agent.execute.failed`, `agent.execute.progress`). Documenta también la sección `chat_inline_rendering` (cómo el agente vive en el chat como tarjeta `agent_intervention`) y la `resolucion_de_conversation_id_canonica` del modelo "una vía fija".

- **`_contratos/llm-flow.contract.json`** + **`_schemas/llm-flow/*.json`** — sub-contrato derivado: 3 eventos canónicos para invocar al LLM SIN contexto de chat (`llm.complete.request`, `llm.complete.response`, `llm.complete.failed`). Usado por agentes (ai-agent-framework), memorias modulares (memory-conversation-summary) y módulos del dominio que necesiten razonamiento del LLM. Par success/failure separados — NO existe shape mixto con flag `success`. Migración del shape legacy del ai-gateway documentada como `trabajo_pendiente`.

- **`_contratos/embedding-flow/_*.schema.json`** — schemas canónicos para `embedding.generate.{request,response,failed}` consumidos por ai-gateway. Lo usan memory-rag y memorias semánticas futuras.

- **`_contratos/tools.contract.json`** + **`_schemas/tools/*.json`** — contrato transversal puro: shape canónico de cada `module.json.tools[]` (tool.declaration) y del retorno del handler en runtime (tool.response). Reglas de naming (`<module-prefix>.<entity>` kebab-case), parameters como JSON Schema 2020-12 válido, handler como referencia a método, errores_conocidos del catálogo errors.contract, retorno canónico `{status, data | error: {code, message}}`. Aplicable a cualquier módulo del sistema que declare tools invocables por el LLM.

- **`_contratos/agents-config.contract.json`** + **`_schemas/agents-config/agent.config.schema.json`** — sub-contrato derivado de companero-viaje (tipo canónico "agente"): formaliza el shape de `agents/<name>.json` (id+name+filename coincidiendo, version semver, enabled boolean, prompt_file path relativo a `.md`, tools como subset acotado del catálogo del repo, provider del enum cerrado, temperature/max_tokens/timeout_ms/max_retries/context_enabled como parámetros del LLM). Reglas para `prompts/<name>-system.md`: markdown puro sin frontmatter YAML, h1 con nombre del agente, longitud mínima 200 chars. Stats runtime PROHIBIDOS en archivo declarativo.

- **`_contratos/module-rewrite.contract.json`** — contrato transversal puro que formaliza el patrón POC2 de reescritura canónica de módulos. Define las 14 reglas de filosofía, 13 principios validables, 11 decisiones arquitectónicas, 10 prohibiciones y 13 cross-checks ejecutables. Cualquiera de los 70 módulos del horizontal (ver `arquitectura/migracion/_outputs/modulos-roadmap.json`) cuando se reescribe sigue este contrato. Validable por `module-rewrite.validate.js`: monolito archivado en `_legacy/`, 5 helpers POC2 obligatorios (`_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento` + auxiliar), tests organizados por capas, error.code del catálogo `errors.contract`, sin returns con error string suelto, eventos canónicos del bus preservados invariantes, drift count ≤30% del valor previo.

- **`_contratos/modulo-clase-robusta.contract.json`** — contrato transversal que captura "cada módulo es UNA CLASE DISTINTA" bajo OOP adaptado a event-core. Define qué OOP aplica (encapsulación, herencia vertical de BaseModule, polimorfismo con `super()`) y qué OOP NO aplica (composición entre módulos, DI cross-módulo, herencia entre dominios, Singleton explícito). Estructura canónica: constructor declarativo (estado al constructor, no a onLoad), 5 secciones por visibilidad con banners (Lifecycle / Bus API / HTTP API / Dominio protegido / Privados), naming canónico de handlers (`onXxx` para bus, `handleXxx` para HTTP, `_xxx` para protegidos). Validable por `modulo-clase-robusta.validate.js` con 14 cross-checks: extends BaseModule, constructor con super() como primera instrucción, constructor sin I/O, campos declarados antes de uso, secciones canónicas presentes, handlers wireados al manifest, overrides que llaman super(), publish via `_publicarEvento`, onUnload limpia los recursos que onLoad abre, no publica estado interno crudo.

- **`_contratos/extensibilidad-modular.contract.json`** — documento maestro de la extensibilidad del sistema. Captura la garantía operativa del paradigma event-core: añadir, modificar o quitar un módulo no rompe el resto siempre que respete los 26 contratos. Lectura obligatoria antes de añadir un módulo nuevo. Contiene: las 4 afirmaciones de esencia (con `es` / `no_es` / `porque_importa`), núcleo invariante, modelo de extensión, los 6 tipos canónicos de módulo, las 8 garantías observables (con su enforcement por contrato), las 4 cosas que los contratos NO garantizan (logica del modulo, semantica vs spec, performance, coverage), el protocolo de 6 pasos para añadir un módulo (PASO 0 mapa eventos → declarar module.json → implementar index.js POC2 → tests por capas → persistencia si aplica → validate:ci → registrar en config), mapa de qué garantiza cada uno de los 26 contratos, las 10 prohibiciones absolutas y las 8 preguntas canónicas a hacerse antes de añadir el módulo. No tiene validator propio — su enforcement es colectivo via los 26 contratos transversales y derivados.

- **`_contratos/modulos-blueprint-driven.contract.json`** — documento maestro del paradigma blueprint. Captura la decisión de mover un subconjunto del sistema (~13 de ~70 módulos) de código JS procedural a blueprint JSON declarativo que el LLM ejecuta como runtime via 2 tools universales (`bus.publish`, `bus.publishAndWait`). Aplica SOLO donde se cumplen las 4 condiciones: (1) dominio razonable en lenguaje natural, (2) su trabajo es razonar con LLM/agentes, (3) latencia 5-25s tolerable, (4) coste de inferencia tolerable. Cualquier `no` → JS determinista. Lista cerrada de los 13 candidatos: subsistema-recetario (recetas, escandallo, viabilidad, tecnicas, recetario-creativo, pase-cocina, mise-en-place) + memorias modulares (memory-user-profile, memory-conversation-summary, memory-rag) + agentes (bot-manager, agent-observer) + prompt-manager. El resto (~57) se queda en JS determinista. Documenta las 5 piezas (contrato, blueprint, pseudocodigo, clase OOP filosófica, JSON), lo que aporta, lo que cuesta (latencia, $, indeterminismo del LLM, debugging, dependencia provider) y las 5 prohibiciones. No tiene validator propio — los contratos derivados por subsistema (ej: subsistema-recetario) sí lo tendrán.

- **`_contratos/agente-blueprint.contract.json`** + **`arquitectura/migracion/notas/agentes-roadmap.md`** — contrato transversal nuevo (derivado de `modulos-blueprint-driven`, categoría `agentes_especialistas`) que captura el patrón "agente como módulo blueprint independiente": cada agente vive en `modules/<agente>/` con `module.json` declarativo + `<agente>.blueprint.json` que extiende el padre `agente-base` + `<agente>-system.md` + contrato propio. Preserva la distinción ontológica con módulos del dominio: agente = razonamiento sobre el dominio (stateless, cardinalidad N, sin `estado_persistente`); módulo = operación del dominio (con persistencia, cardinalidad 1). Convivencia transitoria con `agents-config.contract.json` (modelo legacy en `ai-agent-framework/agents/`) durante la migración horizontal. El roadmap inventaria los 30 agentes actuales clasificados por subsistema/rol, drift detectado por agente (tools fantasma, `prompt_file` a `.json` legacy, disabled sin razón), y plan de migración en 5 fases. Trabajo pendiente: implementar `agente-blueprint.validate.js`, crear blueprint padre `agente-base.blueprint.json`, migrar los 30 agentes uno por uno, evaluar `ai-agent-framework` post-migración. Aparcado hasta que el horizontal arranque.

- **`_contratos/llm-runtime-discipline.contract.json`** + **`arquitectura/decisiones/_blueprints/subsistema-recetario.modulo-base.blueprint.json`** — contrato transversal nuevo (mayo 2026) que canoniza las 10 reglas operativas que el LLM-runtime cumple cuando ejecuta cualquier blueprint del sistema. Origen empírico: el LLM se desenfocaba, inventaba UUIDs/precios, ejecutaba operaciones no pedidas, publicaba eventos de dominio en lecturas puras, accedía a `fs.read` de archivos ajenos. Los 10 principios con `principio` + `anti_patron` explícito: enfoque_una_operacion, no_inventes_datos (salvo `uuid()`/`nowISO()`), marcador_de_fuente_por_dato (`usuario|archivo|modulo|mercadona|estimado_llm`), confirmacion_antes_de_mutar_destructivo, no_explorar_estado_ajeno, modo_silencioso_en_lecturas, pseudocodigo_es_ley, correlacion_request_id (nuevo por publishAndWait downstream; correlation_id se propaga), response_unico_por_invocacion, no_dejes_pending_huerfanos. El blueprint padre **único** del subsistema-recetario vive ahora en `arquitectura/decisiones/_blueprints/` (antes copiado x10 dentro de cada módulo) — los 10 módulos blueprint del sistema (4 subsistema-recetario + 6 subsistema-carta) referencian el padre via `blueprint_parent_path: "arquitectura/decisiones/_blueprints/..."`. ai-gateway resuelve paths que empiezan con `arquitectura/` o `modules/` desde repo root; paths sin ese prefijo siguen siendo relativos al módulo (compat). El padre conserva la sección `disciplina_del_llm_runtime` inline (copia operativa que ai-gateway lee al componer system prompt); el contrato es la fuente autoritativa para validación + revisión humana. Validador implementado en `arquitectura/decisiones/_validators/llm-runtime-discipline.validate.js` (mayo 2026): 3 cross-checks estructurales + 3 cross-system (padre con sección, principios coinciden literal contrato↔padre, hijos extienden padre con disciplina). Wireado a `npm run validate:ci`. PASS verde — los warnings cross-system actuales son divergencias literales sutiles entre voz del contrato (3ª persona "el LLM") y del padre (2ª persona "tú"), informativos.

- **`_contratos/blueprint-eventos-conscientes.contract.json`** + **`arquitectura/decisiones/_validators/blueprint-eventos-conscientes.validate.js`** — contrato transversal nuevo (mayo 2026) que canoniza el patrón "eventos conscientes en el diseño de blueprints". Origen: insight tras cerrar Críticas 1 (CAS read-modify-write, PR #208) y 2 (wiring async, PR #207) del audit cross-blueprint 2026-05-25 (handoff `carta.creada` huérfano + salmorejo perdido). Ambos bugs habrían sido detectables en revisión si los blueprints declaran al diseñarse qué eventos publican que requieren consumer y qué eventos pueden escuchar. El patrón añade el campo nuevo `eventos_publicados_que_requieren_consumer[]` en cada blueprint hijo (paralelo simétrico al ya canónico `eventos_que_escucho[]`). Validator con 3 cross-checks: **error** si publica con consumer declarado pero ningún módulo lo escucha; **warning** si escucha evento sin publisher en el repo; **info** si publica en pseudocódigo con verbo participio de dominio sin clasificar. Output curado auto-generado en `arquitectura/decisiones/_outputs/eventos-publish-subscribe.json` (405 eventos catalogados al cierre v1.0.0). **Opt-in en v1**: blueprints sin el campo NO se quejan — migración perezosa. Aplica SOLO a blueprints en v1; módulos JS POC2 cuentan como publishers/subscribers en el catálogo pero no declaran `requires_consumer` todavía. Acoplado a `modulos-blueprint-driven.contract.json` v1.3.0 (sección `proceso_de_diseno_de_blueprint`) y al blueprint padre `subsistema-recetario.modulo-base.blueprint.json` v0.6.0 (sección `checklist_eventos_al_disenar_blueprint` con 5 preguntas para el diseñador humano). Trabajo pendiente: migración perezosa de los 11 blueprints actuales (cada uno cuando se toque); tras 2-4 semanas de adopción estable, decisión para endurecer severidad del cross-check info → warning; extensión v2 a módulos JS POC2 si emerge bug similar.

- **`_contratos/cajones-context-partitioning.contract.json`** + **`arquitectura/decisiones/_validators/cajones-context-partitioning.validate.js`** — contrato transversal nuevo (mayo 2026) que canoniza el patrón "cajones": context partitioning + lazy loading estilo buscador aplicado al system prompt de los módulos blueprint-driven. Sustituye el modelo "blueprint hijo entero cargado en cada turno" (400-900 líneas) por "catálogo rankeado de 1 línea por operación + apertura explícita del cajón vía tool cuando el LLM lo necesita" — patrón Google search-style. Activación opt-in por blueprint: `manifest.cajones_enabled === true`. Las 8 decisiones del documento de propuesta (`arquitectura/decisiones/propuestas/cajones-context-partitioning.md`) están cerradas con las recomendaciones por defecto del propio doc: persistencia A (cierre auto al siguiente turno), aplicabilidad solo-blueprints en v1, decisión de apertura por LLM autónomo (vía tool call, no router externo), sin niveles de profundidad, detector de foco también LLM autónomo, banner en chat al cambiar foco, cajones planos sin archivadores anidados, almacenamiento inline en blueprint hijo (cero archivos nuevos). Cuatro tools canónicas declaradas: `cajon.listar({zona?})` + `cajon.abrir({nombre})` implementadas v1; `chat.cambiar_foco({nuevo_page_id, motivo?})` + `page.related({page_id})` pendientes Fase 5 bis (solo si piloto valida). Motor en `modules/conversacion/ai-gateway/index.js`: `_extractCajones` (auto-deriva descripciones de `op.input` u `op.descripcion`, override opcional `cajon_descripcion`), `_rankCajones` (page activo > recencia lookback 5 turnos > alfabético — cero embeddings prohibidos por contrato), `_buildCajonesSystemPrompt` por turno, `_executeCajonTool` interceptado en `_executeToolCall`. Padre `subsistema-recetario.modulo-base.blueprint.json` ampliado con sección `modelo_de_contexto` que explica al LLM-runtime los dos modos (legacy completo / cajones) — el LLM lo deduce de lo que ve en su contexto. **Piloto activo**: `pizzepos/recetas` con `cajones_enabled: true` — reducción medida del 68% en el system prompt (63 KB → 20 KB) sin pérdida de cobertura funcional. Tests POC2 en `tests/unit/ai-gateway-cajones.test.js` (33 casos verdes). Trabajo pendiente: Fase 5 medición runtime real (tokens/turno, tasa de cajón equivocado, distracción del LLM); Fase 5 bis foco dinámico + `RelatedPagesBar.svelte` (solo tras validar Fase 5); Fase 6 migrar otros 9 blueprints. El resto de prohibiciones y cross-checks ya están enforced por `cajones-context-partitioning.validate.js` (8 cross-checks).

- **`_contratos/manual-audit-module-y-helpers.contract.json`** — manual operativo de la skill `audit-module` v7 y de los 6 helpers MQTT/HTTP en `scripts/audit-helpers/` (`create-conversation`, `send-message`, `list-conversations`, `force-agent`, `fetch-export`, `list-orphan-projects`). Documenta: las 4 fases de la skill (comprender módulo → conversación natural 10-15 msgs → triage condicional → reporte narrativo en `audit/<modulo>-<provider>-<TS>/`), los flags exactos de cada helper (`--provider`, `--model`, `--thinking enabled|disabled`), el catálogo cerrado de providers/modelos disponibles (deepseek, anthropic, openai, groq, gemini, ollama, claude-cli, kimi con sus 4 modelos), cómo crear proyectos y conversaciones via bus, cómo propagar `page_id` para activar tools o blueprint del módulo, cómo sacar partido al `chat-export.json` (estructura conversation-export-v2 con `timeline`+`messages_raw`, análisis por turno cruzando con eventos del bus, verificación forense contra disco via `fs.read.request` inline). Documento de referencia operativa — sin valoraciones, solo procedimientos. Lectura obligatoria antes de lanzar una auditoría nueva o construir un helper adicional.

- **`_contratos/manual-mqtt-conexion-directa.contract.json`** — manual operativo de conexión MQTT directa al sistema Enki **sin scripts**. Para clientes MQTT genéricos (mqttx, MQTT Explorer, librerías en otros lenguajes) y también para bajar un nivel cuando los helpers de `audit-module` se quedan cortos. Contiene: datos de conexión (`wss://enki-ai.online/mqtt`, sin auth, MQTT v3.1.1 sobre WSS), las dos familias de topics (la eventbus canónica `core/*/events/<dot.path>` para publish vs `core/+/events/<dot.path>` para subscribe — el `*` es literal y el `+` es wildcard MQTT; y la familia UI directa `ui/request/conversation/{create,send}` + `ui/response/<request_id>`), envelope canónico del bus (`event_id` + `event_type` + `timestamp` + `source` + `data` + `metadata`) y envelope UI directo (más plano, `request_id` + `data`), secuencia 4-pasos para iniciar conversación (resolver project_id via `project.list.request` → crear conv via `ui/request/conversation/create` → enviar mensaje via `ui/request/conversation/send` → escuchar `chat.assistant.saved` o `ai.chat.failed`), shapes reales extraídos del código de los 5 eventos canónicos del chat-flow (`chat.message.saved`, `chat.context.enriched`, `chat.prompt.ready`, `ai.chat.response`, `ai.chat.failed`) + el evento auxiliar `chat.assistant.saved`, mecánica de correlación request/response por `request_id` y filtrado por `correlation_id` para aislar un turno, secuencias canónicas adicionales para operaciones de dominio, 5 probes de diagnóstico forense aplicados en audits reales (verificar persistencia tras timeout silencioso, aislar si filesystem es el culpable, inspeccionar tool_calls del LLM en `messages_raw[].metadata` para detectar payload vacío o alucinación, listening en vivo de un subsistema completo, verificar si un agente se invoca por `agent.execute.request`), catálogo de eventos read-only seguros para clientes externos vs mutaciones destructivas que NO deben publicar, errores comunes (client_id duplicado, topic mal construido por puntos vs slashes, subscribe después del publish, no filtrar `request_id`, JSON.parse sin try-catch, subscribir solo a `.response` ignorando `.failed` correlacionado, asumir que el timeline del export incluye payloads completos), implementación de referencia mínima pegable en Node.js (snippet con `mqtt.connect` + subscribe con callback antes del publish + filtrado por `request_id` + setTimeout), ejemplos copy-paste para mqttx CLI, y relación explícita con otros contratos del sistema. Sin validator — manual operativo. Caso testigo: auditoría recetas 2026-05-20 que descubrió el bug del payload vacío en `bus.publishAndWait → fs.write.request` cuando el contenido del store es largo.

- **Otros contratos transversales:** `events`, `lifecycle`, `observability`, `errors`, `persistence`, `http`, `security`. Cada uno con su validator en `_validators/<n>.validate.js` y su sección en `drift-baseline.json`. El de `security` define la disciplina del par `credential.resolve.request/response` y la prohibición de pasar API keys como `parameters` de tools (las credenciales se resuelven en runtime via `credential-manager`).

Todos los validators corren juntos via `npm run validate:ci`. Para añadir un sub-contrato nuevo: contrato JSON → schemas estrictos → validator → registrar en `scripts/validate-all.js` → npm script.

## Estructura de los contratos y para qué se redactan

Un contrato no es documentación general — es la **fuente autoritativa** de una decisión cross-módulo, escrita en un shape que el validator enforce mecánicamente. Si la regla no está en un contrato, no existe; si está, CI la aplica. La amplitud del contrato (las secciones que cubre) es parte de la disciplina: un contrato superficial deja decisiones implícitas que en sesiones futuras se redescubren mal.

Hay tres tipos. Cada uno tiene su shape canónico:

### Contrato transversal (errors, events, lifecycle, observability, persistence, http, naming, glossary)

Gobierna UN aspecto cross-cutting de TODOS los módulos. Autónomo (no deriva de otro). Su validator escanea todo el repo. Secciones canónicas:

- `_doc`, `id`, `version`, `creada`, `supersedes_nota` — metadatos.
- `objetivo` — qué se valida y cómo.
- `inputs` — qué archivos lee el validator (obligatorios, opcionales, prohibidos).
- `filosofia` — premisas en lenguaje natural (lista de afirmaciones-base).
- `principios` — reglas individuales con `id`, `regla`, `razon`.
- `decisiones_arquitectonicas` (o `modos`) — trade-offs concretos resueltos en un sentido (no son reglas, son elecciones).
- `prohibido` — anti-patrones que ningún módulo puede aplicar aunque el schema técnicamente lo permita.
- `output_shape_resumen` — qué shape produce el output (`_outputs/<id>.json`).
- `reglas_de_extraccion` — cómo se construye el output a partir de los inputs.
- `derivaciones` — qué otros contratos / outputs derivan de éste (efecto cascada documentado).
- `validaciones_cross_realizadas_por_validator` — cada check con `id`, `regla`, `como_detectar`, `severidad` (error/warning/info).
- `salida_validador` — descripción de PASS/FAIL y qué se imprime.
- `convenciones_complementarias` — cómo se relaciona con `naming`, `glossary`, otros transversales.

Ejemplos: `arquitectura/decisiones/_contratos/{errors,events,http,lifecycle,observability,persistence}.contract.json`.

### Sub-contrato derivado (chat-flow, agent-flow)

Concreta UN subsistema cuyo "padre" es un documento maestro. Hereda principios; añade los eventos canónicos del subsistema. **Misma amplitud que un transversal** (todas las secciones de arriba aplican igual), MÁS los campos específicos:

- `deriva_de` — ruta al documento maestro del que hereda.
- `eventos` — catálogo de los N eventos canónicos del subsistema (cada uno con `name`, `publicado_por`, `consumido_por`, `proposito`, `schema_ref`, `shape_resumen` con `obligatorios` / `opcionales`, `notas_de_drift_a_cerrar`).
- `campos_canonicos_compartidos` — campos del payload definidos UNA vez aquí, referenciados por los schemas individuales con `$ref` a `_common.schema.json`.
- `transiciones_de_significado_eliminadas` — drifts semánticos cerrados (campo polisémico anterior + significados anteriores + resolución canónica).

Ejemplos: `chat-flow.contract.json`, `agent-flow.contract.json`.

### Documento maestro (companero-viaje)

Captura la **visión arquitectónica** de un subsistema completo (chat/LLM/agentes). Es el "por qué" del que derivan los sub-contratos. No tiene validator propio — los sub-contratos derivados sí. Estructura libre adaptada a la naturaleza del subsistema, típicamente:

- `esencia`, `nucleo_invariante` — qué es y qué nunca debe romper.
- `modelo_de_extension`, `tipos_canonicos_de_extension` — cómo se amplía sin tocar el núcleo.
- `protocolos_canonicos` — el catálogo inmutable de eventos / categorías.
- `garantias` — propiedades observables del modelo.
- `prohibido` — anti-patrones absolutos del subsistema (lista cerrada).
- `mapa_al_sistema_actual` — qué módulos existentes implementan partes del modelo y cuáles faltan.

Ejemplo: `arquitectura/decisiones/_contratos/companero-viaje.contract.json`.

### Reglas que aplican siempre (los tres tipos)

- **Auto-referencia**: `_doc` describe en una frase qué captura el contrato. `id` igual al nombre del archivo sin `.contract.json`.
- **Versionado semver**: cualquier cambio que rompa shape requiere subir mayor; añadir secciones opcionales puede ser minor.
- **`supersedes_nota`** es el changelog del contrato. Si la nueva versión cierra drifts, lo dice aquí, con qué se cerró y por qué.
- **`prohibido` no es opcional**, ni siquiera cuando parece obvio. Listarlo evita que una sesión futura lo "redescubra" implementándolo. Si en una revisión te das cuenta que falta un anti-patrón, se añade al contrato — no se queda en la cabeza del que lo notó.
- **Las secciones que falten dejan rastro**: un contrato sin `derivaciones` sugiere que la decisión no tiene efecto cascada (probablemente miente — todo decisión cross-módulo lo tiene). Un contrato sin `convenciones_complementarias` sugiere que no se relaciona con otros (también probablemente miente).
- **Amplitud antes que profundidad**. Es preferible un contrato con todas las secciones aunque alguna sea "no aplica explicado" a uno que omite secciones porque "ahora no se me ocurre qué poner".

## Disciplina transversal vs horizontal

**Regla absoluta**: antes de empezar cualquier horizontal (sub-contratos derivados, módulos concretos, código de features, UIs), TODOS los contratos transversales del sistema deben estar cerrados y unificados. La fase es estricta — no se alterna.

**Por qué**: el "modo transversal" tiene un cargador mental específico (decisiones cross-cutting, secciones canónicas, patrones de validator, derivaciones cascada). Saltar a un horizontal en medio pierde ese contexto. Al regresar a un transversal nuevo, se redescubre mal — los transversales escritos después de horizontales salen más estrechos que los escritos en bloque seguido. Caso real: chat-flow y agent-flow se escribieron tras una pausa horizontal y les faltaban 6 secciones canónicas vs los transversales originales (errors, events, http, ...) — hubo que ampliarlos retroactivamente.

**Concreto**:

- Si entramos en fase transversal, completamos TODOS los transversales que el sistema necesita antes de tocar ningún horizontal. La "lista de transversales pendientes" se cierra primero, después se ejecuta entera.
- Si un horizontal en curso revela la necesidad de un transversal nuevo (caso real: `agent-flow` descubrió que faltaban códigos `AGENT_*` en `errors.json`), se **pausa el horizontal**, se completa el transversal en commit separado, y luego se retoma. Nunca se mete el transversal como "excepción" dentro del horizontal.
- Si un horizontal aparece como urgente operativamente y los transversales no están cerrados, la deuda del horizontal se documenta como `trabajo_pendiente` dentro de su propio contrato y se pospone hasta que la fase transversal termine. Pasos terminados de un horizontal no se cierran (paso 6 = legacy cleanup) si los transversales necesarios siguen abiertos.
- Identificar transversales pendientes es parte del protocolo: antes de declarar "ya están todos", se hace un inventario explícito (qué transversales existen, cuáles están al ancho canónico, cuáles faltan). Sin inventario, la afirmación es una inferencia.

**Anti-patrón**: "termino este sub-contrato y de paso añado un transversal nuevo que descubrí". Resulta en transversales con menos amplitud que los originales y en horizontales contaminados con decisiones que no son su responsabilidad.

## Patrón de migración cross-módulo

Cuando hay drift estructural en un subsistema (varios módulos hablan shapes inconsistentes para los mismos eventos), la disciplina es la misma que se aplicó en chat-flow:

1. **Contrato primero** — `<subsistema>.contract.json` lista los eventos canónicos, los principios, los drifts cerrados, las validaciones cross que el validator deberá hacer. Sin contrato no se toca código.
2. **Schemas estrictos** — un JSON Schema 2020-12 `additionalProperties:false` por evento + `_common.schema.json` con $defs compartidos. Validables con AJV strict.
3. **Validator** — script Node que detecta drifts estructurales en `module.json` y en código fuente (heurísticas regex sobre publishers conocidos). Registrar en `scripts/validate-all.js` y en npm scripts.
4. **Migrar handlers** — uno por uno, cada módulo del subsistema. Compat transitoria autorizada: aceptar shape legacy con `logger.warn('<modulo>.<handler>.shape_legacy', ...)` durante la migración. La compat NO se mezcla con código canónico — vive en una rama defensiva al inicio del handler que normaliza al shape canónico.
5. **Tests por handler** — uno por handler migrado. Cubre shape canónico + validación contra el JSON Schema oficial (cargado con AJV) + edge cases de error. Wirear a `package.json` (`test:<modulo>`) y `.github/workflows/validate.yml`.
6. **Cierre legacy** — eliminar las ramas `shape_legacy` cuando todos los emisores estén migrados. El warn era red de seguridad; sin emisores legacy, sobra y solo confunde. Borrar también los tests del shape legacy.

Después de los pasos 1-3 main puede mergear sin migración (validator solo añade warnings al baseline). Después del 4-5 el subsistema acepta ambos shapes. Después del 6 solo canónico — futuros publish con shape antiguo fallarán contra schema en lugar de pasar con warn.

## Migración POC2 con scripts (horizontal módulo a módulo)

Cada uno de los 70 módulos del horizontal se migra al canon usando dos scripts (no se hace todo a mano):

```
node arquitectura/migracion/scripts/scaffold-rewrite.js <slug>
# → archiva monolito en _legacy/, genera notas/<slug>-mapa.md pre-rellenado
#   (identidad, eventos del audit, drift breakdown, secciones <TODO>),
#   genera tests/unit/<slug>.test.js skeleton (Group 1 Lifecycle + Group 7
#   Helpers POC2 listos), wirea package.json y workflow.yml.

# (Claude completa: rewrite/patch del index.js, bump module.json, tests
#  Groups 2-6 con domain logic, cierra TODOs del mapa con decisiones de
#  dominio. PASO 0 obligatorio antes de tocar código.)

node arquitectura/migracion/scripts/finish-rewrite.js <slug> --commit
# → tests verde, baseline regenerado, validate:ci PASS, inventario+PROGRESO,
#   commit con mensaje templateado leído del mapa. NO hace push.
```

**Reglas de eficiencia (críticas para no quemar tokens)**:

- **Modelo**: Sonnet 4.6 para migraciones rutinarias (pattern-matching repetitivo). Reservar Opus 4.7 solo para módulos que requieren descomposición o decisiones arquitectónicas no obvias. Ahorro estimado: 3-4× en tokens.
- **`/clear` entre módulos**: el scaffold/finish trabajan sobre disco, no sobre el contexto del LLM. Resetear contexto entre módulos no pierde nada y reduce ~50% de tokens en el siguiente.
- **`Edit` quirúrgico vs `Write` total**: si el módulo ya está 70%+ canónico, los 4 cambios reales (añadir helpers POC2 + limpiar onUnload + métricas en error paths + tracing en module.json) caben en 4-5 `Edit` calls. Reescribir el archivo entero con `Write` envía 3000+ tokens innecesarios. Ahorro: 5-10× en ese módulo.
- **Si `finish-rewrite` falla en step `[4/8] validate:ci`**: el frontend validator tiene non-determinismo conocido. Reintentar el script directamente — 1 reintento suele estabilizarlo. No hace falta debuggear.

Detalle del workflow + reglas de cierre en `arquitectura/migracion/README.md`.
Patrón canónico formalizado en `arquitectura/decisiones/_contratos/module-rewrite.contract.json`.

**Estado del horizontal (2026-05-11)**: estructura POC2 cerrada al 100% (66/66 módulos con helpers, error shape, retornos canónicos y tests por capas) **Y paradigm isolation cerrado al 100%** — las 3 violaciones de event-core identificadas en la auditoría 2026-05-08 están cerradas: `staff-manager` (commit `485ada3`, refactor a `mqttRequest`), `pizzepos/comandero` (commit `dc77c0d`, cache local hidratado por `tarifas.config.actualizada` + pub `tarifas.config.solicitada` en `onLoad`), y `ai-gateway` (eliminación del PATH 1 — el loader auto-suscribe cada tool con handler al evento `<toolName>` en `registerToolsForAI`, ai-gateway solo invoca por bus). Los 3 restantes en `modules/` son POCs exploratorios (`*-poc`) excluidos del horizontal por diseño. La disciplina la enforce mecánicamente DOS validators: `module-rewrite.validate.js::drift_modulo_acceso_directo_inter_modulo` (warning sobre cualquier acceso a `moduleLoader.getModule`/`loadedModules.get`/`toolsRegistry.get` en módulos) y `tools.validate.js::drift_invocacion_directa_de_tool_fuera_del_framework` (ERROR que bloquea CI sobre `toolsRegistry.get().handler` o `moduleLoader.executeTool` en código bajo `modules/`). `tools.contract.json` v1.1 canoniza la decisión: invocación de tools es siempre par `<toolName>` (request) / `<toolName>.response` (response correlacionado por `request_id`). Ver `arquitectura/migracion/_outputs/PROGRESO.md` y la sección `estado_del_horizontal` de `extensibilidad-modular.contract.json` para el detalle.

## Garantías obligatorias en payloads

Estas reglas las enforce el conjunto de validators + schemas. Si las rompes en un publish nuevo, CI te corta.

- **`correlation_id`** se genera en el originador (canal, cron, webhook) y se propaga sin modificar por toda la cadena de eventos. Sin él no hay traza causal y el debugging multi-módulo es ciego.
- **`no_silent_failures`** — todo evento de "cierre" tiene par success/failure separado. No inyectar errores como texto en el evento de éxito. Ejemplo: `ai.chat.response` (éxito) + `ai.chat.failed` (error con `error.code` canónico de `errors.contract.json`).
- **No incluir `stack` ni datos sensibles en `error.details`** publicados en el bus. El validator de errors flaggea `drift_respuesta_con_stack_trace` como ERROR (no warning).
- **Campos polisémicos prohibidos.** Un mismo nombre de campo no significa cosas distintas en eventos distintos. Ejemplo cerrado: `message` en chat era ambiguo (mensaje del usuario o del asistente) → reemplazado por `user_message` / `assistant_message`.

## Puntos de extensión modulares

Algunos eventos están diseñados como contratos abiertos a múltiples emisores plug-and-play, para que añadir piezas nuevas no requiera tocar el módulo consumer:

- **`chat.context.enriched`** — cualquier módulo de memoria (`memory-user-profile`, `memory-rag`, `memory-long-term`, `memory-project-knowledge`...) publica este evento con `priority` (0-99 contexto base, 100-499 perfil, 500-999 RAG, 1000+ especulativa) y `prompt-builder` lo agrega al system prompt ordenado por priority. Añadir una memoria nueva no toca prompt-builder.
- **`agent.execute.request`** (pendiente de canonización en agent-flow) — cualquier módulo del dominio puede invocar a un agente especialista emitiendo este evento. El agente reacciona y devuelve `agent.execute.response`.
- **`channel-*`** — cada canal (`channel-telegram`, `channel-voice`, etc.) recibe del exterior y publica `chat.message.saved` con su `channel` correspondiente. chat-io no conoce los canales.

Cuando diseñes un evento nuevo, pregúntate: ¿debería ser un punto de extensión? Si más de un módulo plausiblemente querrá publicarlo o consumirlo, sí — define el shape en un contrato y deja que cada implementación sea pluggable.

---

# Protocolo de trabajo

1. **Antes de tocar un módulo:** leo su auditoría completa (`_outputs/modulo-completo/<modulo>.json`). Si tengo que escribir código nuevo, leo también `naming.json` y `glossary.json`.

2. **Antes de añadir/renombrar un evento:** consulto `naming.json` (forma + verbo canónico del idioma del módulo) y `glossary.json` (si la entidad está, uso la forma canónica del idioma).

3. **Si una decisión rompe la convención:** paro y pido confirmación antes de proceder. Las convenciones son la regla, el legacy es drift que se migra.

4. **Antes de escribir código, me pregunto:**
   - ¿Este módulo está haciendo algo que no es su dominio?
   - ¿Podría resolver esto emitiendo un evento en lugar de llamar directamente?
   - ¿Quién debería escuchar esto? ¿Ese módulo ya existe?
   - ¿Estoy mezclando dominio con infraestructura?

   Si la respuesta a la 1 o la 4 es sí, paro. Refactorizo el diseño antes de escribir.

5. **Mapa de eventos antes del código.** Para cualquier módulo nuevo o a reescribir, primero respondo:
   - ¿Qué eventos emite?
   - ¿Qué eventos escucha?
   - ¿A qué reacciona cada subscribe?

   El mapa va en la auditoría del módulo. Sin mapa, no se toca el módulo.

6. **Tests por handler con validación de schema.** Cada handler de un módulo del subsistema chat (y cualquier sub-contrato similar a futuro) tiene su test unitario en `tests/unit/<modulo>.test.js`. Cubre: shape canónico de los eventos publicados + carga del JSON Schema oficial con AJV y validación del payload + edge cases de error. Wirear el test a `package.json` como `test:<modulo>` y al workflow `.github/workflows/validate.yml`. Sin tests, el commit no entra: la suite verde es parte del cierre, no opcional.
