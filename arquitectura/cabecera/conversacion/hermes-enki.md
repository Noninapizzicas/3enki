---
dominio: conversacion
fuentes:
  - modules/hermes-bridge/index.js
  - modules/hermes-bridge/module.json
  - modules/hermes-relay/index.js
  - modules/hermes-relay/module.json
  - hermes/enki_tools/bridge.py
  - hermes/enki_tools/loader.py
  - hermes/enki_tools/__init__.py
verificado: 2026-08-11
---

# Integración Hermes ↔ Enki

Hermes (NousResearch/hermes-agent) es la capa conversacional. Enki aporta
434+ tools de dominio. La fusión es ADITIVA: Hermes conserva todo (CLI,
dashboard :9119, providers, terminal_tool, file tools, web browsing) y
gana las tools de Enki.

## Arquitectura (3 piezas)

```
Frontend (MQTT)
    │
    ▼
chat-io ──persist──▶ SQLite
    │
    │ chat.message.saved
    ▼
hermes-relay ──history──▶ SQLite
    │                      │
    │ POST /v1/chat/completions
    │ (system: CLAUDE.md + ctx activo + vista_frontend)
    ▼
  Hermes (OpenAI-compat API)
    │
    │ tool calls via enki_tools
    │ POST /modules/hermes-bridge/execute
    ▼
hermes-bridge ──dispatch──▶ Enki tools (434+)
    │
    │ (3 rutas: bus universal, ruta directa, bus fallback)
    ▼
  resultado → Hermes → respuesta
    │
    ▼
hermes-relay
    │ ai.chat.response
    ▼
chat-io ──persist──▶ SQLite
    │
    │ MQTT push conversation/{id}/message
    ▼
Frontend
```

## hermes-bridge (módulo Node.js)

Dispatcher de tools extraído de ai-gateway._executeToolCall. Expone 3
endpoints HTTP en el gateway de Enki (:3000):

| Método | Ruta | Auth | Función |
|--------|------|------|---------|
| POST | /modules/hermes-bridge/execute | Bearer | Ejecuta tool por nombre |
| GET | /modules/hermes-bridge/catalog | Bearer | Catálogo OpenAI format |
| GET | /modules/hermes-bridge/health | - | Health check |

Auth: token compartido 32 bytes hex, generado al primer arranque,
persistido en `data/.hermes-bridge-token` (mode 0600), validado con
`crypto.timingSafeEqual`.

3 rutas de dispatch (misma lógica que ai-gateway):
1. `bus.publish` / `bus.publishAndWait` — tools universales del bus
2. Ruta directa — handler en módulo vía toolsRegistry + loadedModules
3. Bus fallback — publish + wait correlado por request_id

## enki_tools (paquete Python)

Cliente HTTP que Hermes usa para llamar a hermes-bridge.

- `EnkiBridge(base_url, token, token_path, timeout)` — cliente HTTP
- `EnkiBridge.call(tool_name, context, **args)` — ejecuta tool
- `EnkiBridge.catalog()` — catálogo OpenAI format
- `load_tools(bridge)` — genera `dict[str, callable]` (434+ funciones Python)
- Token auto-discovery: `ENKI_BRIDGE_TOKEN` env o `data/.hermes-bridge-token`

## hermes-relay (módulo Node.js)

Pipe puro que reemplaza prompt-builder + ai-gateway en la cadena de eventos.

- Suscribe `chat.message.saved` (lo que antes atendía prompt-builder)
- Carga historial de SQLite vía `db.query.request` (mismo patrón que chat-io)
- Construye system message: CLAUDE.md (cache 60s) + CONTEXTO ACTIVO + vista_frontend
- POST a Hermes `/v1/chat/completions` (OpenAI-compat, sin stream)
- Emite `ai.chat.response` (lo que antes emitía ai-gateway)
- chat-io persiste y empuja al frontend sin cambios

Config: `hermes_url`, `hermes_model`, `hermes_api_key`, `context_window`,
`request_timeout_ms`, `claude_md_path`.

## Separación de credenciales

| Dueño | Qué gestiona |
|-------|-------------|
| Hermes | API keys de LLM providers (OpenAI, Anthropic, DeepSeek, modelos locales). Configuradas en Hermes internamente. |
| credential-manager | Credenciales de dominio: WhatsApp Cloud API, Telegram Bot, Glovo, Mercadona, y toda API key que un módulo operativo necesite. Sigue vivo, intacto. |

ai-gateway resolvía credenciales LLM vía `credential.resolve.request` →
credential-manager. Con Hermes, esa resolución desaparece: Hermes trae sus
propios providers. credential-manager pierde solo ese consumidor (ai-gateway),
pero conserva todos los demás (whatsapp-bot, telegram-service, tienda-api,
facturas, mercadona-api, etc.).

## Módulos deshabilitados

7 módulos conversacionales deshabilitados en `config.json`:

| Módulo | Reemplazado por |
|--------|----------------|
| ai-gateway | hermes-relay + Hermes |
| prompt-builder | hermes-relay (_buildSystemMessage) |
| ai-agent-framework-v3 | Hermes agentic loop |
| agent-observer | sin ai-gateway no hay pipeline que observar |
| memory-conversation-summary | sin emisores activos |
| memory-rag | sin emisores activos |
| memory-user-profile | sin emisores activos |

**chat-io se mantiene** — persistencia SQLite, CRUD de conversaciones,
push MQTT al frontend. Es la bisagra entre el relay y el frontend.
