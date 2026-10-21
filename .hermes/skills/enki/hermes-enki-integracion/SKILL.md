---
name: hermes-enki-integracion
description: >-
  La FUSIÓN Hermes↔Enki: Hermes como capa conversacional/mental (la Gente) y Enki
  como cuerpo event-driven (módulos, bus, stores). Arquitectura de las 3 piezas
  (hermes-bridge, enki_tools, hermes-relay), decisiones de diseño del dueño
  (sin Hermes como provider, sin medias tintas, máxima integración mínima
  fricción), fases de activación seguras (bridge primero, salto al final,
  reversible), y cómo verificar el estado real en prod. Úsala al continuar la
  integración, configurar el relay, activar la fusión, o diagnosticar por qué
  el chat no responde tras tocar estos módulos.
when-to-use: >-
  Trabajo sobre la integración Hermes↔Enki: configurar hermes-relay, registrar
  enki_tools, activar/desactivar la fusión en config.json, probar la cadena
  chat → relay → Hermes, o diagnosticar caídas del chat tras tocar estos
  módulos. Complementa a enki-bus-invocacion (cómo llamar a Enki desde fuera)
  con la arquitectura de la MENTE nueva.
tags: [enki, hermes, fusion, relay, bridge, api-server]
---

# Fusión Hermes ↔ Enki — Hermes como la mente, Enki como el cuerpo

## Decisiones de diseño del dueño (durables, 2026-08-11)

- **Máxima integración, mínima fricción.** Hermes ciudadano de pleno derecho
  del sistema, sin duplicar infraestructura: se reutilizan motor, registro,
  bitácora, JEFE y la vía de conexión existente.
- **Sin medias tintas.** Si el gateway desaparece, los módulos de conversación
  desaparecen con él. NO mantener `ai-gateway` vivo "solo para proveer al
  motor" — la separación es: cara → Hermes, proceso → se apaga con la cara.
- **NO Hermes como provider.** El intento v2.34 (Hermes como provider
  OpenAI-compat del ai-gateway) disparó el consumo por DOBLE SALTO: chat →
  Hermes → LLM, pagando el contexto de Hermes ENCIMA del del chat. La fusión
  correcta: relay = **tubería pura** hacia el AGENTE Hermes completo — un solo
  salto (Hermes → su LLM, el mismo consumo que ya tiene por Telegram).
  La diferencia "provider vs cerebro" ES el consumo.
- **La capa que pierde event-driven es la PIEL** (razonamiento de Hermes); el
  cuerpo (módulos-isla, bus, stores) lo mantiene intacto. Es la misma ley de
  PENSAR vs TRADUCIR: no forzar a la mente a pensar en eventos.

## Arquitectura (3 piezas, verificadas en el código)

```
FRONTEND ──► hermes-relay (pipe puro: SQLite + forward HTTP + push MQTT)
                │  POST {hermes_url}/v1/chat/completions   (un salto)
                ▼
         API server de Hermes (:8642) ──► AGENTE Hermes COMPLETO (skills, memoria,
                │                              tools nativas, humano al lado)
                │  tool calls vía enki_tools (Python)
                ▼
         hermes-bridge (Node, isla) ──dispatch──► tools de Enki (430+)
                │  3 rutas: bus.publish/publishAndWait universal ·
                │  ruta directa handler-en-módulo · fallback por bus
                ▼
         resultado → Hermes → ai.chat.response → frontend
```

- **`modules/hermes-bridge/`** — dispatcher de tools extraído de
  `ai-gateway._executeToolCall` (el wrapper `executeTool` del loader NO basta:
  no enriquece contexto ni tiene timeouts). 3 rutas: universal
  (bus.publish/publishAndWait correlado por request_id), directa
  (toolsRegistry + loadedModules → handler del módulo), fallback por bus
  (publish toolName + espera `${toolName}.response`) con timeouts graduados
  (15s default · 65s code.orquestar · 300s invoke_agent). **Auth**: Bearer
  token compartido generado al primer arranque (`data/.hermes-bridge-token`,
  mode 0600); el cliente Python lee el mismo fichero. Expone APIs HTTP vía
  `module.json → apis[]` (registry.js los monta en `/modules/<nombre><path>`):
  `/execute`, `/catalog` (formato OpenAI function-calling), `/health` (sin auth).
- **`hermes/enki_tools/`** (Python) — `EnkiBridge` llama al bridge por HTTP
  (NO MQTT raw: evita bus-guard y envelope), `load_tools()` genera una función
  Python por tool del catálogo. Se registran en el Hermes DESTINO (ver abajo).
- **`modules/hermes-relay/`** — pipe puro: escucha `chat.message.saved`, arma
  messages (historial SQLite vía `db.query.request` + contexto), hace POST al
  API server de Hermes, emite `ai.chat.response`/`ai.chat.failed`. **Cero
  lógica de agente**: ni system prompt construido, ni loop de tool_calls, ni
  selección de provider — eso es de Hermes.

## Hallazgos verificados en el código de Hermes (0.18.2)

- **`:8642` = API server del gateway de Hermes** (`gateway/platforms/api_server.py`),
  NO el proxy (el proxy usa 8645). Su `POST /v1/chat/completions` ejecuta un
  **AGENTE Hermes COMPLETO**: el system message de la request se apila "ON TOP
  of core" (encima del system prompt nativo), soporta `X-Hermes-Session-Id`
  (continuidad de sesión) y `X-Hermes-Session-Key` (memoria a largo plazo), y
  ejecuta agent runs con límites de concurrencia. → el relay → Hermes es
  tubería hacia la mente completa, **cumple "sin Hermes como provider"**.
- **Requiere `API_SERVER_KEY`** (env del usuario que corre el gateway; sin ella
  responde `{"error": "Invalid API key"}`). El relay la necesita en
  `modules_config.hermes-relay.hermes_api_key`.
- **HAY DOS gateways Hermes en el VPS**: usuario `hermes` (PID con
  `enki-mcp-server.js` conectado) y usuario `admin` (el Hermes de Telegram).
  El `:8642` lo sirve UNO solo — identificar cuál ANTES de configurar
  enki_tools y la key (el plan de otro agente copiaba al venv de admin, que
  puede ser el equivocado).
- **`enki-mcp-server.js`** (`/opt/enki/mcp/`) — camino MCP alternativo
  (stdio → módulo `portal` por bus, con GUARD 'portal-mcp'): sirve para
  agentes externos (Claude Code), distinto del bridge HTTP.

## Fases de activación (el orden evita el "primer mensaje = fallo")

1. **FASE 1 — bridge solo**: configurar `modules_config.hermes-relay`
   (hermes_url + api_key) + activar SOLO `hermes-bridge` (el relay sigue en
   disabled; el gateway viejo intacto — el chat NO se toca). Probar:
   `curl :3000/modules/hermes-bridge/health` → `/catalog` → una tool real.
   Script reutilizable: `configurar-relay.sh` (dir de backup 2026-08-11).
2. **FASE 2 — el salto**: activar `hermes-relay` + deshabilitar los 7
   conversacionales (`ai-gateway`, `prompt-builder`, `ai-agent-framework-v3`,
   `agent-observer`, `memory-conversation-summary`, `memory-rag`,
   `memory-user-profile`) + restart. **Coexistencia**: el relay y
   `prompt-builder` escuchan el MISMO evento (`chat.message.saved`) → NO
   pueden convivir sin doble respuesta. Reversible con `estabilizar-prod.sh`
   (restaura los 7 + para bridge/relay, idempotente).
3. **Regla**: el disable del sistema viejo SIEMPRE es el último paso, solo
   tras prueba end-to-end con un mensaje REAL (no el health del puente).
   Lección completa del fallo original: skill `enki-bus-invocacion`.

## Verificación del estado en prod (checklist)

- `python3 -c "import json; print(json.load(open('/opt/enki/config.json'))['modules']['disabled'])"` — los 7 re-habilitados, bridge/relay en disabled (o al revés, según fase).
- `systemctl show enki -p ActiveEnterTimestamp --value` — restart POSTERIOR al cambio (el config viejo en memoria = el chat "no existe").
- `curl -s :3000/modules/hermes-bridge/health` — 404 = el disable surtió efecto.
- Log `current.jsonl`: `ai.chat.response` presente = el chat responde.

## Pitfalls

- **`/opt/enki` NO es repo git** (`fatal: not a git repository`). El repo es
  `~/3enki`; `deployment/deploy.sh` corre DESDE el repo y sincroniza con
  `rsync -a --delete` hacia `/opt/enki`. Desplegar desde `main` SIN haber
  mergeado la rama de la fusión **BORRA de prod los módulos que solo existen
  en la rama**. Orden: merge (PR) → deploy. Nunca seguir un plan de deploy
  que haga `git pull` dentro de /opt/enki.
- **Verificar las afirmaciones de otro agente (Claude Code) contra el código
  REAL**: grep de la API que nombra antes de ejecutar su plan. Caso real:
  `executeTool` existe en loader.js:1910 pero es un wrapper simple (valida
  params, llama handler); el dispatcher real es `_executeToolCall`
  (ai-gateway:2434-2552, termina antes de `_executeLLM`). Y el HTTPGateway
  existe (`core/gateway/http.js`) y monta `/modules/<mod>/<path>` desde
  `module.json → apis[]`.
- **sudo en el VPS**: `sudo -S` con password por stdin está BLOQUEADO por el
  parser de Hermes (anti fuerza bruta) y el `.env` de Hermes está protegido
  contra escritura del agente. Patrón que funciona: preparar script
  idempotente en el dir de backup y que Paco lo ejecute con sudo.

## Referencias

- `references/arquitectura-verificada.md` — hechos verificados con archivos y
  líneas (api_server.py, registry.js, loader.js, dos gateways, mcp-enki).
