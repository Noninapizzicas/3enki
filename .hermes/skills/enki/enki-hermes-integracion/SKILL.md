---
name: enki-hermes-integracion
description: >-
  Fusión Hermes↔Enki — Hermes como capa conversacional (cerebro/mente) de Enki
  (cuerpo event-driven). Arquitectura de 3 piezas (hermes-bridge, hermes-relay,
  enki_tools), mapa del código verificado (dispatcher, HTTPGateway, registry),
  reglas de diseño de Paco (NUNCA Hermes como provider LLM — consumo v2.34; sin
  medias tintas; el cimiento JEFE+bitácora sobrevive) y el pitfall de orden de
  despliegue (disable SOLO cuando la cadena nueva está configurada y probada).
when-to-use: >-
  Continuar la integración Hermes↔Enki (config pendiente, pruebas end-to-end,
  secuencia de disable), evaluar/cruzar propuestas de otro agente (Claude Code)
  sobre la fusión, tocar hermes-bridge / hermes-relay / enki_tools, diagnosticar
  un chat de Enki caído tras deshabilitar ai-gateway, o decidir qué módulos
  conversacionales se apagan.
source: hermes
tags: [enki, hermes, integracion, fusion, bridge, relay, dispatcher, httpgateway, tokens]
---

# Fusión Hermes ↔ Enki

## La visión (decisión de Paco, 2026-08-11)

- **Fusión TOTAL, sin medias tintas**: si el gateway desaparece, desaparecen los
  módulos de conversación (ai-gateway, prompt-builder, ai-agent-framework-v3,
  agent-observer, memory-*). NO proponer mantener el gateway "medio vivo como
  proveedor del motor" — Paco lo rechazó explícitamente ("Medias tintas no").
- **Hermes = la MENTE** (conversación, contexto, providers, memoria, skills).
  **Enki = el CUERPO** (bus MQTT, módulos de dominio, stores, credential-manager
  para credenciales de dominio: WhatsApp, Glovo…).
- La capa conversacional pierde event-driven — es la **piel**, y está bien. La
  filosofía de Enki gobierna el interior de las islas, no la mente que las opera.
  Todo lo trabajado (módulos, ADN, stores) mantiene la filosofía.
- **REGLA DEL CONSUMO (Paco, incidente v2.34)**: Hermes NUNCA como provider /
  intermediario de la generación LLM de Enki. El doble salto (chat de Enki →
  api_server de Hermes → LLM) disparó el consumo de tokens. **Un solo salto**:
  Hermes → su LLM, con sus credenciales. Si detrás de un endpoint "Hermes" hay un
  proxy LLM pelado al que Enki llama, es el doble salto rechazado — el endpoint
  debe ser un AGENTE Hermes completo con enki_tools registradas.
- **El CIMIENTO sobrevive**: success = entregable verificado (JEFE determinista +
  bitácora). El LLM no certifica su propio trabajo, ni Hermes ni ninguno. La
  verificación es del sistema (reflejo puro), nunca de la mente. Esta es la única
  regla contra el humo (22/22 success falsos del framework viejo).

## Las 3 piezas (verificadas en código, 2026-08-11)

### 1. hermes-bridge (Node, módulo Enki) — `modules/hermes-bridge/`
Dispatcher de tools **extraído** de `ai-gateway._executeToolCall` (si se apaga el
gateway, esa lógica muere — por eso se extrae ANTES del disable).
- API: `POST /modules/hermes-bridge/execute` `{tool_name, args, context?}` ·
  `GET /catalog` (formato OpenAI function-calling) · `GET /health` (sin auth)
- **Auth**: Bearer token compartido, generado al primer arranque en
  `data/.hermes-bridge-token` (0600, www-data); el cliente Python lee el mismo
  fichero (o `ENKI_BRIDGE_TOKEN`).
- 3 rutas de dispatch en orden: `bus.publish`/`bus.publishAndWait` (universal) →
  **ruta directa** (`toolsRegistry.get(name)` → `mod[handler](enrichedArgs)`) →
  **bus fallback** (publish + wait `${tool}.response` con request_id).
- Enriquecimiento de args con contexto: project_id / page_id / conversation_id /
  settings / attachments / prompt / intencion / `_chat_context`.

### 2. hermes-relay (Node, módulo Enki) — `modules/hermes-relay/`
**Tubería PURA**: `chat.message.saved` → `POST <hermes_url>/v1/chat/completions`
→ `ai.chat.response` / `ai.chat.failed`. Cero lógica de agente (ni system propio,
ni tools, ni loop de tool_calls — el agente es Hermes, no el relay).
- Hereda de chat-io: persistencia SQLite vía `db.query.request` (patrón `_db` con
  request_id + pendingDb), historial `in_context=1`, FIFO por context_window.
- Inyecta CLAUDE.md (cache TTL 60s) + CONTEXTO ACTIVO + vista_frontend como system.
- Config: `modules_config['hermes-relay'] = {hermes_url, hermes_model,
  hermes_api_key, context_window, request_timeout_ms, claude_md_path}`.
- **chat-io SE QUEDA enabled**: el relay se apoya en su contrato
  (chat.message.saved → ai.chat.response), no lo reemplaza.

### 3. hermes/enki_tools (Python)
- `bridge.py`: EnkiBridge — cliente HTTP hacia `/modules/hermes-bridge`, lee el
  token del fichero, `call(tool_name, context, **args)` con manejo de 401/errores.
- `loader.py`: genera una función Python por tool del catálogo (schema adjunto,
  `__name__`/`__doc__` = name/description) para registrar en el agente Hermes.
- El registro en la config del agente Hermes es trabajo PENDIENTE típico: el
  paquete en el repo no basta, hay que cargarlo en el Hermes que atiende el relay.

## Mapa del código verificado
Ver `references/verificado-code-map.md` — líneas exactas, rutas del repo,
comandos de verificación y estado de prod comprobado.

## PITFALLS

1. **ORDEN DE DESPLIEGUE — el disable es el ÚLTIMO paso.** Ocurrió en vivo
   (2026-08-11): la rama de la fusión se desplegó a prod con los 7 módulos
   deshabilitados pero `hermes-relay` SIN configurar (hermes_url vacío → default
   :8642, hermes_api_key vacía → 401 "Invalid API key" verificado con curl) → el
   chat queda en modo **"primer mensaje = fallo"** (ai-gateway ya no responde y el
   relay falla). Regla: verificar la cadena NUEVA configurada y probada end-to-end
   ANTES de deshabilitar la vieja. Ante un chat caído tras la fusión: comprobar
   `modules_config['hermes-relay']` y el health del bridge ANTES de tocar nada.
   Estabilización rápida: quitar ai-gateway de disabled + añadir hermes-relay a
   disabled + restart.
2. **HTTPGateway (core/gateway/http.js) NO tiene auth por defecto** — escucha en
   0.0.0.0 y las rutas no validan token. Exponer ejecución de tools sin auth es un
   agujero; el bridge añade su propio Bearer por eso. Al añadir una API de módulo
   que ejecuta tools: auth SIEMPRE (token compartido o bind 127.0.0.1).
3. **DOS Hermes en el VPS**: usuario `hermes` (gateway con enki-mcp-server) y
   usuario `admin` (el de las sesiones de Telegram). Apuntar hermes_url al que
   tenga el API server (127.0.0.1:8642, health responde "hermes-agent") y usar la
   key que ese endpoint acepta.
4. La ruta HTTP de un módulo se registra **declarando `apis` en module.json**
   (core/modules/registry.js → `/modules/{nombre}{api.path}`) — no hace falta
   tocar el core.
5. **`moduleLoader.executeTool()` existe (loader.js:1910) pero es un wrapper
   SIMPLE** (valida params + `tool.handler(args)`). El dispatcher real es
   `ai-gateway._executeToolCall` (2434-2552): universal bus, cajones, nav, ruta
   directa, fallback, timeouts graduados (15s / 65s code.orquestar / 300s
   invoke_agent / presupuesto dinámico por pipeline). `_selectProvider` NO está en
   el dispatcher (pertenece a `_executeLLM`, 2554+) — la extracción del dispatcher
   es limpia con moduleLoader + eventBus + config + helpers
   (`_executeUniversalBusTool`, `_executeCajonTool`, `_executeNavTool`; cajones/nav
   dependen de estado en memoria del gateway → se omiten si la UI de Hermes no los
   usa).

## Validar propuestas de OTRO agente (Claude Code) — workflow

Paco cruza propuestas entre Hermes y Claude Code; ambas trabajan el mismo repo.
Antes de aprobar o ejecutar la propuesta de otro agente:
1. `git fetch` + comparar la rama contra main (`git log --oneline`, `git diff
   --stat main...origin/<rama>`) — el "completado y pusheado" del auto-reporte NO
   es evidencia; los archivos en disco y el estado de prod sí lo son.
2. **grep de cada API afirmada** en el código real (executeTool, getToolsForAI,
   rutas HTTP, módulos que afirma "ya existen").
3. **Probar endpoints vivos con curl** (health, /v1/chat/completions) — el error
   real (401, 404) dice más que el plan.
4. **Verificar prod**: config.json enabled/disabled, modules_config, timestamps
   de proceso (`ps -o lstart` / `systemctl show enki -p ActiveEnterTimestamp`),
   token/archivos presentes — el deploy puede estar hecho con la config sin hacer.
5. En esta sesión se detectaron 3 fallos así: API fantasma (executeTool como
   dispatcher), topic MQTT plano que no pasa el bus-guard, y "relay con system
   prompt + tools + loop" = ai-gateway reconstruido con otro nombre.
