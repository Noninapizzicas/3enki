# System Analysis: event-core v1.5.0

**Date:** 2026-02-11
**Scope:** All 27 context files in `contexto/`
**Approach:** Honest, methodical, analytical

---

## What It Is

A meta-core event-driven framework built on Node.js + MQTT (Aedes) + SvelteKit 2 / Svelte 5 + SQLite (sql.js). Functions as a general-purpose platform for building event-driven applications, with two concrete verticals: **PizzePOS** (point-of-sale for pizzerias) and a **fiscal invoice pipeline** (OCR + AI + CSV).

## Architecture - Strengths

1. **Consistent event-driven pattern throughout.** The `{provider}.{function}.request → response` and `ui/request/{domain}/{action} → ui/response/{request_id}` patterns are well-defined, documented, and uniformly applied.

2. **Clean credential isolation.** The 4-level cascade (CUSTOM > CLIENT > PROJECT > GLOBAL) with automatic injection via provider-loader keeps providers "dumb" and credential logic centralized.

3. **Module auto-discovery and auto-wiring.** Both backend (40 modules from `modules/`) and frontend (via `import.meta.glob` + `manifest.json`) self-register without manual wiring. The loader also auto-wires event subscriptions and UI handlers declared in `module.json` — modules no longer contain imperative subscribe/register/unregister boilerplate (28/28 core modules migrated).

4. **Project-scoped operations.** Handlers in `data/projects/{id}/handlers/` automatically get `project_id` and corresponding credentials, making multi-tenancy implicit.

5. **Progressive composition system (5 phases).** Links → dependencies → systems → shared context → inherited context. Avoids premature coupling.

6. **Good code generation infrastructure.** 10 Plop generators covering modules, providers, handlers, components, and selector panels.

## Architecture - Weaknesses & Risks

1. **project-manager is a 3731-line monolith.** Handles CRUD + HTTP + UI + Events + 5 composition phases in a single file. Proposed split hasn't happened.

2. **Dual envelope problem in handlers.** The `const data = event.data || event` pattern is a workaround for inconsistent event wrapping. Root cause should be fixed at the source.

3. **Post-hoc streaming is a UX debt.** `simulateStreaming()` waits for full response then delivers progressively — cosmetic, not real streaming.

4. **conversation-manager is a zombie module.** Facade eliminated but module still exists. Creates confusion.

5. **Frontend-backend sync is fragile.** No automatic mechanism to keep frontend constants in sync with backend definitions.

6. **Legacy Plop generators still present.** `chat-module` (outdated patterns) and `from-blueprint` (deprecated) can mislead developers.

## Documentation Quality

The `contexto/` directory with 27 JSON files is unusually thorough. Issues:
- Some files document completed work (useful as history, adds noise for current reference)
- Spanish/English mix adds cognitive load
- `mejoras-pendientes.json` mixes completed and pending items

## Pending Improvements (Actual)

| Priority | Item | Impact |
|----------|------|--------|
| Alta | OCR.space provider | Better OCR for real photos |
| Alta | Anthropic prompt caching | 90% cost + 85% latency reduction |
| Media | Anthropic extended thinking | Better complex analysis |
| Media | Anthropic code execution sandbox | Safe server-side computation |
| Media | Split project-manager monolith | Maintainability |
| Media | Optimize listSystems N+1 queries | Performance |
| Media | Refactor estructurar-deepseek | Consistency via ai-gateway |
| ~~Media~~ | ~~Loader auto-wiring for subscribes + UI handlers~~ | **DONE** (28/28 modules, -700+ lines) |
| Baja | Eliminate conversation-manager | Cleanup |
| Baja | Native SSE streaming | Real-time UX |
| Baja | OpenAI Responses API migration | Future-proofing |
| Baja | Gemini File Search RAG | Document search |
| Baja | Groq Compound models | Web search + code execution |

## System Stats

- **40 modules** (28 core + 12 pizzepos)
- **32+ service providers**
- **6 LLM providers** (DeepSeek, Anthropic, OpenAI, Groq, Gemini, Ollama)
- **250+ events**, **200+ APIs**, **110+ AI tools**
- **20+ auto-generated skills**

## Key Patterns (Mandatory)

1. `const data = event.data || event` — envelope unwrapping in all handlers
2. Never resolve credentials inside providers — receive `_credentials` injected
3. `services.call('ai', 'chat')` for AI, **not** `'ai-gateway'`
4. Declare UI handlers and event subscribes in `module.json` — the loader auto-wires them. No imperative register/subscribe in onLoad (exception: wildcard or dynamic subscriptions)
5. Cache active project via `project.activated`/`project.deactivated` events
6. Naming: kebab-case (modules/handlers), dot.notation (events), slash/notation (MQTT topics)
7. onUnload only cleans module-specific state (pending requests, timers, caches) — the loader handles unsubscribe/unregister automatically

## Honest Summary

event-core is a well-architected system with strong conventions and unusually good self-documentation. The event-driven pattern is applied consistently, the credential system is clean, and module auto-discovery works well. Main risks: project-manager monolith, legacy dead code, and the envelope inconsistency. The system is production-capable for its two verticals and extensible for new ones.
