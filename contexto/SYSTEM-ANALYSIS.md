# System Analysis: event-core v1.5.0

**Date:** 2026-02-25
**Scope:** All 28 files in `contexto/` (27 JSON + this analysis)
**Approach:** Honest, methodical, analytical — full read of every file

---

## What It Is

A meta-core event-driven framework built on Node.js + MQTT (Aedes) + SvelteKit 2 / Svelte 5 + SQLite (sql.js). Functions as a general-purpose platform for building event-driven applications, with two concrete verticals: **PizzePOS** (point-of-sale for pizzerias) and a **fiscal invoice pipeline** (OCR + AI + CSV).

## Architecture - Strengths

1. **Consistent event-driven pattern throughout.** The `{provider}.{function}.request → response` and `ui/request/{domain}/{action} → ui/response/{request_id}` patterns are well-defined, documented, and uniformly applied.

2. **Clean credential isolation.** The 4-level cascade (CUSTOM > CLIENT > PROJECT > GLOBAL) with automatic injection via provider-loader keeps providers "dumb" and credential logic centralized.

3. **Module auto-discovery and auto-wiring.** Both backend (40 modules from `modules/`) and frontend (via `import.meta.glob` + `manifest.json`) self-register without manual wiring. The loader also auto-wires event subscriptions and UI handlers declared in `module.json` — modules no longer contain imperative subscribe/register/unregister boilerplate (28/28 core modules migrated).

4. **Project-scoped operations.** Handlers in `data/projects/{id}/handlers/` automatically get `project_id` and corresponding credentials, making multi-tenancy implicit.

5. **Progressive composition system (5 phases).** Links → dependencies → systems → shared context → inherited context. All 5 phases fully implemented in project-manager (lines 728-2452). Avoids premature coupling while supporting complex multi-project topologies.

6. **Good code generation infrastructure.** 10 Plop generators covering modules (`module`, `service-module`, `full-module`), providers (`local-provider`), handlers (`handler`), components (`svelte-component`), and selector panels (`selector-panel`).

7. **Multi-provider AI gateway with unified tool calling.** 6 LLM providers (DeepSeek, Anthropic, OpenAI, Ollama, Groq, Gemini) with normalized tool calling, auto-fallback by priority, and provider-specific message conversion. ToolManager v2.0.0 unifies tool registries between chat and agents.

8. **Blueprint-based feature composition.** Declarative JSON blueprints in `blueprints/project-types/` enable adding features (pizzepos, facturas) to a business as isolated subprojects with their own handlers, config, and storage — fully leveraging all 5 PM composition phases.

9. **Tiered document processing.** 6-tier OCR backend hierarchy (Google Document AI → Google Vision + AI → Anthropic Vision → OpenAI Vision → Tesseract → Scribe OCR) with automatic fallback based on availability and quality scores.

10. **Generic learning system.** Domain-agnostic experience-based learning with similarity matching (numeric, string, Jaccard for arrays), JSONL append-only storage, and best-action recommendation queries.

## Architecture - Weaknesses & Risks

1. **project-manager is a 3731-line monolith.** Handles CRUD + HTTP + UI + Events + 5 composition phases + blueprint features in a single file. 32 registered UI handlers, 16 DB columns, 8 indices. Proposed split into `core.js`, `composition.js`, `systems.js`, `context.js`, `handlers/` hasn't happened. `module.json` doesn't declare 12 composition events.

2. **Dual envelope problem in handlers.** The `const data = event.data || event` pattern is a workaround for inconsistent event wrapping. Root cause should be fixed at the source.

3. **Post-hoc streaming is a UX debt.** `simulateStreaming()` waits for full response then delivers progressively (~12 chars/10ms) — cosmetic, not real streaming. Native SSE streaming is listed as low priority.

4. **~~conversation-manager is a zombie module.~~** Now disabled via config.modules.disabled (commit 962ca7f). Handlers redistributed to chat-session and chat-ai-bridge.

5. **Frontend-backend sync is fragile.** No automatic mechanism to keep frontend constants in sync with backend definitions (e.g., provider lists, credential schemas). `credentials.ts` and `ProviderPanel.svelte` were manually aligned.

6. **Legacy Plop generators still present.** `chat-module` (outdated: doesn't use chat-ai-bridge or prompt-composer) and `from-blueprint` (deprecated: requires uninstalled `yaml` package) can mislead developers.

7. **ai-gateway slow initialization.** Each LLM provider resolves credentials via request/response with 5s timeout. 6 providers × 2 attempts = potential ~60s startup just for ai-gateway.

8. **Low event adoption.** project-manager emits 17+ events but only 2 modules actively consume them (filesystem, prompt-composer). chat-ai-bridge and chat-session cache project lifecycle but don't consume composition events.

9. **Chat refactoring increased total lines.** The chat module split (conversation-manager → 4 modules) was expected to reduce from 3992 to 3023 lines but actual is 6136 lines due to streaming, safety-nets, and advanced FIFO context. Net increase of ~2144 lines with better separation.

## Architecture - Completed Improvements

The following have been completed since the system was first documented:

- **Chat refactoring**: Monolithic conversation-manager (2469 lines) split into chat-session (1233), chat-ai-bridge (1023), prompt-composer (1296). Option B (tools in chat-ai-bridge) was chosen. 4 critical bugs fixed (BUG-001 through BUG-004).
- **Tool registry unification**: ToolManager v2.0.0 imports from `moduleLoader.toolsRegistry` (unified mode) + 13 agent-specific builtins + 7 backward-compatible aliases.
- **New AI providers**: Groq (LPU, ultra-low latency) and Gemini (1M context, RAG) added.
- **DeepSeek reasoning mode**: `deepseek-reasoner` with chain-of-thought visible.
- **Tool calling fixes**: All 6 providers now have functional complete tool calling cycles (Anthropic `tool_use` blocks, Gemini `functionCall` parts, etc.).
- **Frontend-provider alignment**: `DEFAULT_PROVIDERS` in `credentials.ts` and `ProviderPanel.svelte` now mirror backend sources.
- **Loader auto-wiring**: 28/28 core modules migrated — subscribes and UI handlers declared in `module.json`, -700+ lines of boilerplate removed.
- **Project lifecycle caching**: chat-ai-bridge, chat-session, scheduler, filesystem all react to `project.activated`/`project.deactivated`.

## Module Architecture Map

### Core Infrastructure (8 modules)
| Module | Lines | Role |
|--------|-------|------|
| project-manager | 3731 | CRUD + 5-phase composition + blueprints |
| ai-gateway | 1523 | Multi-provider LLM gateway + tool normalization |
| prompt-composer | 1296 | Multi-layer system prompt composition |
| chat-session | 1233 | Conversation/message persistence + context FIFO |
| chat-ai-bridge | 1023 | Chat orchestration (7-step flow) + agentic tool loop |
| credential-manager | ~800 | 4-level credential cascade + OAuth |
| filesystem | ~500 | Project-scoped file operations |
| scheduler | ~400 | Cron/interval/datetime/event triggers |

### AI & Agents (3 modules)
| Module | Role |
|--------|------|
| bot-manager | Telegram file download, auto-responses, command routing |
| agent-manager | Agent selection, context building, pipeline orchestration |
| ai-agent-framework | Agent execution with ToolManager, agentic loop |

### PizzePOS Vertical (13 modules)
| Module | Pattern |
|--------|---------|
| cuentas | Base account CRUD + state management |
| cuentas-canales | Strategy pattern: 5 channels (mesa/telefono/llevar/glovo/whatsapp) |
| pedidos | Order management with line items |
| cobros | Payment processing with channel routing |
| cocina | Kitchen display — real-time tracking item by item |
| comandero | POS interface (14 Svelte components) |
| productos | Product catalog from carta/ |
| categorias | Category management |
| ingredientes | Ingredient tracking |
| variaciones | Product variations |
| menu-generator | v4.0.0: 11 AI tools, 5 micro-module panels |
| persistencia-comandero | Event sourcing + nightly compaction |
| impresion | ESC/POS thermal printer — kitchen tickets via Bluetooth |

### Invoice Pipeline (handler-based)
- `procesar-facturas.js`: 8-step batch pipeline
- Steps: Gmail → PDF→PNG → Sharp → Google Vision OCR → DeepSeek structure → CSV (SII format) → Move processed
- Test commands: `/gogmail`, `/gopdf`, `/gosharp`, `/gocr`, `/gostructure`, `/goexport`, `/gofull`

## Documentation Quality

The `contexto/` directory with 28 files is unusually thorough for a project this size. It functions as a living knowledge base that enables AI assistants to work effectively with the codebase.

**Strengths:**
- Comprehensive coverage of architecture, patterns, gotchas, and rationale
- `index.json` serves as an effective routing table for context lookup
- Historical decisions documented with reasoning (e.g., chat-refactoring option B chosen for streaming control)
- Honest self-assessment (analisis-project-manager.json acknowledges tech debt)

**Issues:**
- Spanish/English mix adds cognitive load — architecture docs lean English, domain docs lean Spanish
- `mejoras-pendientes.json` mixes 7 completed and 9 pending items (should filter or archive)
- `chat-refactoring.json` is mostly historical — 661 lines of completed work that could be summarized
- Some version inconsistencies (project-manager: module.json says 2.0.0, constructor says 1.0.0)

## Pending Improvements (Actual)

| Priority | Item | Impact |
|----------|------|--------|
| Alta | **Pantallas cocina ESP32-P4** | **Digital kitchen display — backend ready, needs frontend (see pantallas-cocina.json)** |
| Alta | OCR.space provider | Better OCR for real photos (25k free/month) |
| Alta | Anthropic prompt caching | 90% cost + 85% latency reduction |
| Media | Anthropic extended thinking | Better complex analysis (adaptive mode) |
| Media | Anthropic code execution sandbox | Safe server-side computation |
| Media | Split project-manager monolith | Maintainability (5 files < 500 lines each) |
| Media | Optimize listSystems N+1 queries | Performance at scale |
| Media | Refactor estructurar-deepseek via ai-gateway | Provider-agnostic invoice structuring |
| Baja | Eliminate conversation-manager completely | Dead code cleanup |
| Baja | Native SSE streaming | Real-time UX (replace post-hoc) |
| Baja | OpenAI Responses API migration | Future-proofing (Assistants deprecated Aug 2026) |
| Baja | Gemini File Search RAG | Free storage, 150+ formats, semantic search |
| Baja | Groq Compound models | Server-side web search + code execution |

## System Stats

- **43 modules** (30 core + 13 pizzepos) — 34 enabled, 6 disabled
- **44 local service providers** (~198 functions)
- **6 LLM providers** (DeepSeek, Anthropic, OpenAI, Groq, Gemini, Ollama)
- **6 OCR backends** (Document AI, Vision, Anthropic Vision, OpenAI Vision, Tesseract, Scribe)
- **250+ events**, **250+ APIs**, **90+ AI tools**
- **14 UI handlers** in project-manager
- **10 Plop generators** (8 active, 1 needs-update, 1 deprecated)
- **5 PM composition phases** fully implemented
- **29 context documentation files**
- **18 frontend stores**, **12 UI modules**, **39 Svelte components**, **11 routes**
- **4 active handlers** (2 global + 2 project), **37 archived handlers**

## Key Patterns (Mandatory)

1. `const data = event.data || event` — envelope unwrapping in all handlers
2. Never resolve credentials inside providers — receive `_credentials` injected
3. `services.call('ai', 'chat')` for AI, **not** `'ai-gateway'`
4. Declare UI handlers and event subscribes in `module.json` — the loader auto-wires them. No imperative register/subscribe in onLoad (exception: wildcard or dynamic subscriptions)
5. Cache active project via `project.activated`/`project.deactivated` events
6. Naming: kebab-case (modules/handlers), dot.notation (events), slash/notation (MQTT topics)
7. onUnload only cleans module-specific state (pending requests, timers, caches) — the loader handles unsubscribe/unregister automatically
8. Logger API: `logger.info('event.name', { data })` — first arg string, second object. **Not** pino-style `logger.info({obj}, 'msg')`
9. Database queries: use `project_id: 'system'` in db.query.request events. **Never** `database: 'system'`
10. Load order: event subscriptions are wired BEFORE onLoad(). Modules can publish requests and receive responses during initialization.

## Cross-Cutting Concerns

### Event Flow Examples
```
User sends message in chat:
  Frontend → mqttRequest('conversation', 'send') → chat-ai-bridge
    → session.save.request → chat-session (save user msg)
    → session.getMessages.request → chat-session (load context)
    → prompt.compose.request → prompt-composer (build system prompt)
    → ai.chat.request → ai-gateway → LLM provider
    → [agentic tool loop if needed]
    → session.save.request → chat-session (save assistant msg)
    → MQTT QoS 1 safety-net → Frontend

PizzePOS order flow:
  cuenta.creada → pedido.creado → pedido.confirmado
    → cocina.pedido_listo → cobro.procesado → cuenta.cerrada
  cobro.procesado routes by prefix: mesa_ → MesaStrategy, tel_ → TelefonoStrategy

Invoice pipeline:
  /gofull → Gmail download → PDF→PNG → Sharp prepare → Google Vision OCR
    → DeepSeek structure (via ai-gateway) → CSV SII format → Move to procesados/
```

### Frontend Initialization Order (Critical)
```
LazyShell.svelte onMount:
  1. initWorkspaceSubscriptions()
  2. initChatSubscriptions()
  3. connect()
  4. initProjectsSubscriptions()  ← must be before conversations
  5. initConversations()
```

### Gotchas (From Production Experience)
- DeepSeek does NOT support images via API — use Google Vision for OCR
- `services.call('ai-gateway', 'chat')` silently fails — must use `services.call('ai', 'chat')`
- Frontend timeout must be >= backend timeout (was 60s vs 180s — BUG-004)
- `isStreaming` must be controlled ONLY by `sendMessage` completion, not by MQTT stream/end signals
- Gmail refresh token must be stored as `GMAIL_REFRESH_TOKEN_{account}` not `GMAIL_API_KEY_GLOBAL`
- credential-manager previously deleted .env keys it didn't recognize — fixed with `_unmanagedLines`

## Honest Summary

event-core is a well-architected system with strong conventions and unusually good self-documentation. The event-driven pattern is applied consistently, the credential system is clean, module auto-discovery works well, and the progressive composition system is genuinely sophisticated. The AI gateway with 6 providers and unified tool calling is production-ready. The two verticals (PizzePOS and invoice pipeline) demonstrate the framework's extensibility.

Main risks: project-manager monolith (3731 lines, hardest to change), post-hoc streaming debt, low adoption of composition events, and the dual envelope workaround that should be fixed at the source. The system is production-capable for its current verticals and has solid infrastructure for adding new ones via blueprints.
