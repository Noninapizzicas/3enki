---
name: enki-bus-invocacion
description: >-
  Invocar y VERIFICAR Enki desde fuera (Hermes): el envelope MQTT exacto del bus
  (event_id/event_type/source.core_id + anti-loop), topics de eventos y ui/request,
  el patrón request/response por MQTT, y la filosofía de verificación de entregables
  (success = entregable verificado — nunca fiar del auto-reporte del LLM/agente).
  Úsala cada vez que haya que llamar a un módulo de Enki por el bus desde Hermes,
  probar un módulo en vivo, o evaluar si un agente/módulo entregó trabajo real.
when-to-use: >-
  Invocar una tool/RPC de un módulo Enki por MQTT desde fuera del core.
  Probar un cambio desplegado en prod (smoke real, no config).
  Auditar si un agente "success" corresponde a trabajo real.
  Entender la separación respuesta-LLM vs respuesta-agente.
source: hermes
tags: [enki, mqtt, envelope, invocacion, verificacion, cimiento, agentes, smoke]
---

# Invocar y verificar Enki desde fuera

## Lección 2026-08-11: el deploy de una integración que apaga el sistema viejo NO se hace antes de configurar la nueva

Fusión Hermes↔Enki (rama `claude/hermes-enki-integration-kgwt96`): Claude Code
desplegó los 5 pasos de golpe — incluido `config.json modules.disabled +=
[ai-gateway, prompt-builder, ai-agent-framework-v3, agent-observer, memory-*]`
— ANTES de configurar el relay (`hermes_url` vacío → default `:8642` sin API
key → 401 "Invalid API key"). Prod quedó en modo **"primer mensaje = fallo"**:
chat-io persistía → emitía `chat.message.saved` → hermes-relay (único
suscriptor, ai-gateway ya disabled) → 401 → `ai.chat.failed`. Nadie lo notó
porque nadie escribió en el chat entre el reinicio y la verificación.
Estabilización: re-habilitar los 7 + añadir `hermes-bridge`/`hermes-relay` a
disabled + restart (script idempotente, backup en
`/home/admin/hermes-backups/2026-08-11-fusion-hermes/`).

Regla durable: **el disable del sistema viejo es SIEMPRE el último paso, y solo
después de probar la cadena nueva end-to-end con un mensaje real** — no con el
health del puente. Al verificar un deploy que incluye un disable: (1) config
aplicada en el proceso NUEVO (restart posterior), (2) el módulo viejo responde
como antes, (3) un mensaje real cruza la cadena nueva completa.

La fusión quedó OPERATIVA en prod ese día (bridge + relay + API server :8642).
Para OPERARLA y diagnosticarla (no solo invocarla): ver la skill
`enki-fusion-hermes` — arquitectura de las 3 piezas, fases de activación,
verificación rápida y pitfalls. Esta skill cubre la vía de INVOCACIÓN.

Cómo habla el bus con la mente nueva: Hermes (Python) NO usa MQTT raw para
tools (bus-guard bloquea clients anónimos; topic plano no pasa el envelope) —
usa HTTP autenticado contra el HTTPGateway del core
(`POST /modules/<mod>/<path>` con Bearer token compartido, rutas registradas
vía `apis` en module.json → `core/modules/registry.js` lo monta bajo
`/modules/<nombre><path>`). El dispatcher de tools REAL (`_executeToolCall` en
ai-gateway, con interceptación bus.publish, ruta directa handler-en-módulo y
fallback por bus con timeouts graduados) es extraíble como módulo propio; el
`executeTool` del loader (core/modules/loader.js:1910) es solo un wrapper sin
enriquecimiento de contexto.

## Lección 2026-08-11b: planes de deploy de OTRO agente (Claude Code) — verificar contra el terreno, no ejecutar

La rama `claude/hermes-enki-integration-kgwt96` traía además un "plan de deploy
en el VPS" que NO se podía ejecutar tal cual, y cada fallo era verificable:

1. **`cd /opt/enki && git pull origin main` FALLA**: `/opt/enki` NO es un repo
   git (`fatal: not a git repository`). El repo vive en `~/3enki` y
   `deployment/deploy.sh` corre DESDE el repo con `rsync -a --delete` hacia
   `/opt/enki`. Consecuencia grave: **desplegar desde `main` SIN haber mergeado
   la rama de la feature BORRA de prod los módulos que solo existen en la rama**
   (hermes-bridge/relay no estaban en main → un deploy estándar los habría
   eliminado). Orden correcto: merge (PR) → deploy, nunca al revés.
2. **El plan copiaba `enki_tools` a `/home/admin/.hermes/...`** — pero hay DOS
   gateways Hermes en el VPS (usuario `hermes` con `enki-mcp-server.js` vs
   `admin`), y el que sirve `:8642` puede ser el del usuario `hermes`.
   Identificar el dueño de cada servicio (ps/ss) antes de tocar venvs/configs.
3. **"auth resuelta" del HTTPGateway NO estaba resuelta**: escucha en `0.0.0.0`
   y sus rutas no validan token — el módulo que expone ejecución de tools DEBE
   añadir su propia auth (Bearer + token compartido en fichero 0600).

Regla durable al recibir un plan de otro agente: **verificar cada supuesto de
ruta/API/usuario contra el código y el terreno** (¿es repo? ¿existe la API?
¿es wrapper o dispatcher real? ¿quién escucha el puerto?) antes de ejecutar —
y mergear a main ANTES de desplegar o el `rsync --delete` se come el trabajo.
Arquitectura completa de la fusión: `references/fusion-hermes-enki.md`.

## El patrón de activación en FASES con salto reversible (fusión 2026-08)

Cuando una integración REEMPLAZA una capa viva (chat/gateway), no se activa de
golpe: se parte en fases verificables y reversibles, y la FASE 1 se hace SIN
tocar la capa viva:

- **FASE 1 — probar la pieza nueva AISLADA.** El hermes-bridge (HTTP
  autenticado) se activa solo: no interfiere con el chat. Verificar: `health`
  (434 tools), `catalog` con Bearer (200) y sin Bearer (401), y EJECUTAR una
  tool real de dominio (`project-profile.get` con un project_id real devuelve
  el perfil; un error de dominio como `project_id requerido` TAMBIÉN prueba que
  el dispatcher enruta). La key del API server de Hermes se localiza sin
  exponerla: `API_SERVER_KEY` en el `.env` del usuario dueño, o `api_server.key`
  en su `config.yaml` (script que la extrae y la escribe en modules_config).
- **FASE 2 — el SALTO: activar la nueva + apagar la vieja en UN restart.**
  El relay y prompt-builder escuchan el MISMO evento (`chat.message.saved`) —
  NO pueden convivir sin doble respuesta. La activación es atómica y reversible
  con un script idempotente de estabilización (re-habilita la cadena vieja +
  para los módulos nuevos en `disabled`). chat-io NO se toca (persistencia
  SQLite + push al frontend lo necesitan vivo).
- **Verificación del salto:** un mensaje real cruzando la cadena completa (no el
  health del bridge), y `ActiveEnterTimestamp` posterior al cambio.

**Regla: antes de cablear un cliente a un endpoint OpenAI-compat, verificar
QUÉ hay detrás.** El API server del gateway de Hermes (`:8642`,
`gateway/platforms/api_server.py`) ejecuta un AGENTE COMPLETO en
`/v1/chat/completions` (el system message se apila "ON TOP of core", soporta
continuación de sesión vía `X-Hermes-Session-Id` y memoria vía
`X-Hermes-Session-Key`) — NO es un proxy LLM pelado. Esa es la diferencia entre
**provider** (Enki → Hermes → LLM: doble salto, consumo disparado — el motivo
de la retirada v2.35) y **cerebro** (Hermes ejecuta el agente con SUS tools: un
salto). Distinguirlos: `POST /v1/chat/completions` con Bearer key y leer
`usage.prompt_tokens` (~15K = core de Hermes cargado = agente completo; ~1K =
proxy pelado).

Cómo hablar con el bus de Enki desde Hermes y cómo NO creerle al sistema cuando
reporta éxito. Dos aprendizajes de campo que costaron horas (y que el framework
de agentes pagó con 22/22 "success" falsos).

## 1 · El envelope MQTT (el error que se repite)

El bus de Enki (`core/events/bus.js`) **no acepta payloads crudos**: exige un
`EventEnvelope` (`core/events/envelope.js`) y **descarta silenciosamente** los
que no validan. Además **ignora los eventos cuyo `source.core_id` es el propio
core** (anti-loop) — si publicas con `source.core_id: 'core-a'`, el core lo
recibe y lo tira sin rastro en los logs de actividad.

```js
const envelope = {
  event_id: crypto.randomUUID(),
  event_type: 'agent.execute.request',          // el nombre del evento
  timestamp: new Date().toISOString(),
  source: { core_id: 'hermes-cli', module_id: 'hermes' },  // NUNCA core-a
  data: { ...payload del evento... },
  metadata: {}
};
client.publish(`core/${CORE}/events/agent/execute/request`, JSON.stringify(envelope), { qos: 1 });
```

Reglas:
- Topic: `core/<core_id>/events/<event_type con / en vez de .>` — el bus se
  suscribe a `core/<core_id>/events/#` y extrae `event_type` del ENVELOPE, no del topic.
- `source.core_id` DISTINTO del core (usar `hermes-cli`, `core-b`, lo que sea).
- Para ver si llegó: el log de actividad muestra
  `event_flow:receive:<event_type>` con outcome success.
- Los módulos tool* del productor NO escuchan `core/*/api/request/...` — ese
  topic api/request es de otro contrato; las tools de agente se ejecutan por el
  registry del LLM, no por bus.

PITFALL CRÍTICO (pagado en vivo): **un client MQTT anónimo puede PUBLICAR pero
NO recibir respuestas.** El broker de Enki (`core/broker/bus-guard.js`) bloquea
las SUSCRIPCIONES de clients anónimos (22 referencias a anonymous en el guard);
el frontend se autentica con un token firmado (`enki:token:` como password del
CONNECT, username `enki`). Consecuencia: el patrón "publica request + escucha
response" desde un script node anónimo SIEMPRE da timeout — el request llega
(lo ves como `receive:` en el log) y el módulo responde (`publish:` en el log),
pero la respuesta nunca llega a tu client. La vía de verificación fiable es el
**LOG del core** (`grep "receive:<evento>" current.jsonl` → la línea siguiente
`publish:<evento>.response` con `outcome:success` es la evidencia de que el
módulo respondió).

### Receta INTERACTIVA (recibir respuestas reales por MQTT — resuelta en vivo)

Dos descubrimientos que desbloquearon la verificación interactiva:

1. **El topic de las respuestas lleva un `*` LITERAL**: el core publica en
   `core/*/events/<evento>` (el asterisco es parte del topic, NO un comodín).
   Suscribirse a `core/core-a/events/#` NO recibe NADA. Para recibir hay que
   suscribirse a `core/#` (o `core/*/events/#`).
2. **Credencial de OBSERVE**: el guard acepta `enki:cert:<b64pem>` como
   password (username `enki`) — el cert de la CA es PÚBLICO y replayable
   (`/opt/enki/data/ca/ca-cert.pem` en base64). Un client observe **SÍ se
   suscribe y recibe TODO el tráfico**, pero sus publicaciones NO entran al
   core (el guard las bloquea). Passwords planos (ej. un token suelto) NO son
   credencial válida — solo `enki:token:<jws>` (firma) o `enki:cert:<b64pem>`.

**Patrón de 2 clients (el que funciona):** client A anónimo PUBLICAR (sus
publishes sí pasan el guard) + client B observe (cert) SUSCRIBIR a `core/#` y
filtrar por `request_id` del envelope. Así se recibe la respuesta real de
cualquier módulo. Script re-ejecutable: `scripts/verificar-modulo-enki.js`.

### El orden de conexión importa (script 2 clients)

Si el publish se dispara dentro del callback del subscribe del otro client,
puede perderse (el handler del pub se registra tarde). Patrón robusto: flags
`subListo`/`pubListo` y una función `disparar()` que publica solo cuando ambos
están listos.

## 1.5 · La vía HTTP ALTERNATIVA al MQTT raw: /modules/{slug}/{path} (fusión Hermes↔Enki)

Cuando un cliente externo (p.ej. Hermes) necesita ejecutar tools de Enki SIN
pasar por el bus-guard ni el envelope, existe la vía HTTP del core:
`core/gateway/http.js` monta `/modules/{moduleName}/{path}` para cualquier módulo
que declare `apis` en su module.json (registro en `core/modules/registry.js` —
`apiIndex` con key `METHOD:/modules/{nombre}{path}`). Verificado en vivo
(2026-08-11, integración Hermes↔Enki): `hermes-bridge` declara
`apis: [{method:'POST', path:'/execute', handler:'handleExecute'}]` → la ruta
`POST /modules/hermes-bridge/execute` existe sin tocar el core.

- El HTTPGateway escucha en `0.0.0.0` por defecto y **sus rutas NO tienen auth**
  (solo CORS menciona Authorization, no lo valida) → el módulo que expone
  ejecución de tools DEBE añadir su propia auth (p.ej. Bearer token compartido
  generado al primer arranque, persistido en `data/.hermes-bridge-token` 0600, que
  el cliente Python lee del mismo fichero).
- Ventaja sobre MQTT raw: el cliente solo necesita HTTP + el token del fichero —
  nada de patrón 2-client, nada de envelope, nada de bus-guard.
- Estructura del handler: recibe `req.body` y devuelve `{status, data}` (el
  HTTPGateway serializa; errores con `{error:{code, message}}` mapean a 400/404/504/500).
- Detalle: `moduleLoader.executeTool()` existe en loader.js:1910 pero es un wrapper
  SIMPLE (valida params + `tool.handler(args)`); el dispatcher real
  (ai-gateway._executeToolCall, con interceptación bus.*, cajones, nav, ruta
  directa y fallback por bus con timeouts graduados) vive en el ai-gateway — si se
  apaga el gateway, la extracción de esa lógica es prerrequisito. Detalle completo
  en `references/fusion-hermes-enki.md`.

## 2 · El frontend habla por ui/request (patrón mqttRequest)

El frontend SvelteKit NO usa HTTP endpoints (`+server.ts` casi no existen):
`mqttRequest(domain, action, payload)` (de `$lib/ui-core`) publica a
`ui/request/<domain>/<action>` y espera `ui/response/<requestId>` con shape
`{ status, data | error }`. El backend los registra en `module.json` →
`ui_handlers: [{ domain, action, handler }]` → método `handleX(data)` que
devuelve `{ status: 200, data: {...} }`. Para servir datos del servidor al
frontend (ej. rehidratar UI desde disco), añade un ui_handler, no un endpoint.

**Uso desde Hermes (sin permisos en /opt/enki/data):** `data/projects/` es de
`www-data` y Hermes no tiene sudo — los ui_handlers los ejecuta el core
(www-data), así que son la vía para ACTUAR sobre el sistema desde fuera:

```js
// Crear un proyecto (project-manager) — status 201 con data.project
ui/request/project/create { request_id, action:'create',
  data:{ name, description, color, icon, workspaceType } }

// Escribir en el storage de un proyecto (filesystem) — status 200
ui/request/fs/write { request_id, action:'write',
  data:{ project_id, path:'storage/<ruta>', content } }
```

### Crear proyecto + conversación + hablar con el LLM (la vía del onboarding)

Para CREAR un proyecto nuevo y ARRANCAR la F0 desde fuera (verificado en vivo
2026-08-07 creando "Panadería Artesana"): encadena 3 RPC en UNA conexión:

```js
// 1 · Crear el proyecto — status 201, data.project.id
ui/request/project/create { name, description, color, icon, workspaceType }

// 2 · Crear la conversación — status 201, data.conversation_id
ui/request/conversation/create { project_id, title }   // ej. 'F0 — Identidad del negocio'

// 3 · Enviar el mensaje al LLM — CONTRATO FIJO DE 9 CAMPOS (chat.ts, en este orden):
ui/request/conversation/send {
  project_id, page_id, conversation_id, context, settings,
  prompt: null, attachments: [], intencion: null, message
}
// timeout ≥ 180 s (respuesta de IA con tools); la respuesta llega con
// data.message_id + correlation_id, y el contenido del asistente se lee
// después con conversation/load (o enki-rpc.js reach <proyecto> latest).
```

El guión de identidad del negocio (qué vende, cómo lo elabora, objetivo,
preguntas_abiertas) va en el campo `message` y el LLM lo responde como consultor
(típicamente ofrece caminos y pregunta por dónde entrar — la F0 real la ejecuta
el chat con la skill identidad-negocio). Alternativa para sembrar la descripción:
el mismo guión como `description` del project/create (queda en la ficha del proyecto).

### La vía WSS desde fuera del VPS (helper del repo — la skill `conexion-mqtt`)

El MQTT crudo (1883) está bloqueado en entornos cloud; el camino vivo es
**WebSocket Secure** `wss://enki-ai.online/mqtt` (puerto 443). El repo 3enki
trae la skill `~/.claude/skills/conexion-mqtt/` con el helper `enki-rpc.js`
que hace RPC ui/request → ui/response SIN reconectar por paso (encadena
`project/list → conversation/list → conversation/load` en UNA conexión):

```bash
cd ~/3enki
export NODE_PATH="$PWD/node_modules"
node .claude/skills/conexion-mqtt/enki-rpc.js projects                 # lista proyectos
node .claude/skills/conexion-mqtt/enki-rpc.js convs <proyecto>         # conversaciones
node .claude/skills/conexion-mqtt/enki-rpc.js reach <proyecto> latest  # proyecto → conv → MENSAJES
node .claude/skills/conexion-mqtt/enki-rpc.js rpc <domain> <action> '{json}'  # RPC genérico
```

**Para REVISAR la conversación del chat de un proyecto: `reach <proyecto> latest`**
— es la vía canónica (resuelve el UUID, lista conversaciones y carga los
mensajes completos). No busques la DB local: las conversaciones viven en
SQLite vía `db.query`, pero el RPC `conversation/load` te da los mensajes
directamente. ENV: `ENKI_BROKER` (default wss) · `ENKI_RPC_TIMEOUT` (ms, 12000).

**PITFALL pagado en vivo: el filesystem NO resuelve proyectos recién creados en
su índice — con `project_id` de un proyecto recién creado escribió en el
storage del proyecto ACTIVO usando el id como subcarpeta
(`projects/c/storage/motor/...` en vez de `projects/motor/...`). Tras escribir,
VERIFICA el path real con `find /opt/enki/data/projects -name <archivo>`, no
confíes en el path que pediste. (Los eventos `fs.write` por el topic de eventos
tampoco responden; el canal ui/request es el fiable.)

### Consultar la DB del core por el bus (db.query)

El chat (chat-io) guarda conversaciones y mensajes en SQLite y las consultas
van por eventos: publica `db.query.request` con `{ project_id, query, params,
read_only: true, request_id }` y el módulo de DB responde `db.query.response`
con `{ rows }` (mismo request_id). Usa el patrón 2-client (anónimo publica +
observe recibe). Ojo: las DBs `projects/<pid>/db.sqlite` pueden no tener el
esquema `conversations` — el esquema depende del módulo; prueba `project_id:
'system'` o consulta el log de actividad antes de asumir dónde vive la tabla.

## 3 · Verificación de entregables (el JEFE)

**La lección que vale más que cualquier código:** el ai-agent-framework
certificaba "success" cuando el LLM terminaba su bucle — sin verificar nada.
Historial real: 22/22 "success" y la mayor parte del trabajo inexistente
(skills "escritas" que no estaban en ningún sitio del disco).

Regla: **success = entregable verificado**. El agente declara su entregable en
el manifest (`entregable: { tipo, path, reglas }`); el sistema verifica contra
el mundo real (disco, API, repo) ANTES de emitir success. Sin prueba → failed
honesto (`ENTREGABLE_NO_VERIFICADO` con el detalle de qué regla falló), o
success con `verificado:false` explícito (agente v1) — nunca "hecho" sin prueba.

Reglas de verificación usadas: `existe` · `api_real` (import `_shared` +
`_atender` 4 args + name/version) · `en_repo` (git ls-files — el deploy con
rsync --delete borra lo no commiteado) · `contenido_min`.

**Auditar por qué falló un agente — leer la BITÁCORA, no el veredicto solo:**
la bitácora (`storage/agentes/bitacoras/<request_id>.json`) guarda los pasos.
Si los pasos son SOLO `['started','final']` (sin `tool_call` intermedio), el
LLM del agente respondió texto SIN ejecutar NINGUNA herramienta — es el humo
estructural (verificado 3 veces en vivo con el esquematizador: recibió las
tools y decidió no usarlas). Si hay tool_calls pero el entregable no existe,
el problema es el trabajo del LLM (escribió mal o en otro sitio). El framework
ya trae "sin whitelist en el manifest → TODAS las tools" (comentario "LUZ"),
así que un agente sin tool_calls no es falta de herramientas: es el LLM.

Ver `references/cimiento-agentes-v3.md` para la arquitectura completa.

**Auditar el TRABAJO de un proyecto (verificado en vivo 2026-08-06):** las
bitácoras de cada ejecución viven en `data/projects/<UUID>/storage/agentes/bitacoras/`
— **¡el UUID del proyecto, NO su nombre!** El storage por nombre (ej.
`projects/c/`) puede tener solo la bitácora del cimiento; el del UUID tiene la
de cada ejecución. Resuelve el UUID con `enki-rpc.js project <nombre>` (o
`project list`). Para auditar: listar las bitácoras y leer `estado` +
`veredicto.verificado` + `veredicto.reglas` de cada una — el veredicto del
JEFE es la evidencia de qué se entregó de verdad (no el auto-reporte del chat).
PITFALL del patrón del agente viejo: ejecuciones que quedan en `estado:
"ejecutando"` sin sellar = timeout del LLM (el trabajo puede estar aplicado en
disco pero SIN veredicto — verificar el entregable directamente). Y ojo: el
chat marca hojas ✅ "de memoria" (su fs no ve `modules/`) — contrastar SIEMPRE
con el disco (`modules/<slug>/`, la cantera) antes de dar por bueno el avance.

### El contrato del CHAT: el evento lleva el NOMBRE DE LA TOOL (sin .request)

PITFALL pagado en vivo (00:05:09, diagnóstico de la "hoja 20 que falló"): el
chat (chat-io) invoca las tools por el **nombre de la tool** — publica
`invoke_agent`, NO `invoke_agent.request`. Si un módulo se suscribe solo a
`invoke_agent.request` (la convención canónica), el evento se publica y
**NADIE lo escucha**: silencio del bus → el chat, sin respuesta, verifica con
otra tool (`productor.validar`), ve que el entregable no existe y **narra "el
agente falló"** — cuando el agente nunca se ejecutó. Regla: un módulo que deba
atender al chat escucha AMBOS (`invoke_agent` + `invoke_agent.request`).

**Diagnóstico de "el agente falló" (veracidad de la causa):** el chat verifica
con tools reales (`productor.validar` + `productor.validar.response` SÍ
aparecen en el log) pero la CAUSA que narra puede ser inventada. Comprobar en
el log del core, en la franja temporal del mensaje:
1. `event_flow:publish:invoke_agent` — ¿el chat publicó el request?
2. `event_flow:receive:<evento>` — ¿ALGUIEN lo recibió? (publish sin receive →
   suscripción con nombre equivocado, NO fallo del agente)
3. `productor.validar` — ¿la verificación del chat fue real? (los eventos del
   bus NO mienten; la narrativa del LLM sí)
4. La bitácora del agente — ¿se abrió siquiera? (el v3 abre bitácora siempre;
   sin bitácora de la hoja → el pipeline no se ejecutó)

### PITFALL: la instrucción del pipeline debe enseñar el patrón REAL (lección generador-de-informe, fix #159)

Verificado en vivo (post-deploy F6/F6½/F7, 2026-08-07): el pipeline `construir-modulos`
pedía al fuzzy `_atender(evento, contexto, respuesta, siguiente)` — una firma INVENTADA
de memoria — pero el patrón REAL del bus (verificado en `modules/_shared/modulo-hibrido-reflejo.js`
y en módulos vivos como `pizzepos/recetas/index.js`) es `_atender(event, op, responseEvent, proyeccion)`
y los handlers RPC son `onXRequest(e) { return this._atender(e, 'accion', '<modulo>.<accion>.response', d => this._metodo(d)); }`.
Resultado: el fuzzy generaba código que el JEFE rechazaba (`api_real: false` → `usa _shared: false, _atender 4 args: false`).

Regla: **la instrucción del pipeline referencia el CÓDIGO REAL** (`modules/_shared/modulo-hibrido-reflejo.js`
+ un módulo vivo de ejemplo), nunca una firma escrita de memoria. Instrucción y verificación deben
coincidir — el productor-modulos valida contra `_validarDiseno`: `require('../_shared/modulo-hibrido-reflejo')`
o `_shared/base-module`, `_atender` 4 args, `this.name`/`this.version` en el constructor,
emisión con `this._publicarEvento` (NUNCA `_publicar`).

### PITFALL: el LLM puede devolver su PROPIO TRANSCRIPT como entregable (basura, no código)

El fallo real de `generador-de-informe` fue más sutil: el LLM del chat devolvió
**su razonamiento** (`<tool_thinking>` + `<tool_calls>` XML, 965 chars) como si
fuera el `index.js` — pasó `tamano_min: 200` y el reflejo lo escribió en disco.
El JEFE lo rechazó (bien), pero la basura quedó en `modules/<slug>/index.js`.

Fix (en main): regla **`sin_transcript: true`** en el validador P3
(`modules/_shared/motor/validador.js`) — rechaza cualquier salida que contenga
`<tool_thinking>`, `<tool_calls>`, `<invoke` o XML de agente ANTES de escribirla.
El pipeline `construir-modulos` la declara en su paso fuzzy (`valida: { tamano_min, sin_transcript }`).
Prueba rápida: `node -e "const {validar}=require('./modules/_shared/motor/validador'); console.log(validar({content:'<tool_calls>…'},{sin_transcript:true}))"`
→ `{ok:false, regla:'sin_transcript'}`.

PITFALL de permisos derivado: la basura escrita por el motor queda como
`www-data` en el repo — admin NO puede borrarla sin sudo (`chmod`/`rm` denegados,
archivos `-rw-r--r-- www-data`). No bloquea commits (untracked) pero ensucia el
working tree; limpiar con `sudo rm -rf modules/<slug>` en repo local Y `/opt/enki`.

### PITFALL: pipelines nuevos NO invocables desde el chat — la lista de invoke_agent estaba CLAVADA (fix #159)

Verificado en vivo (post-deploy F6/F6½/F7, 2026-08-07): el motor v3 `_registrarTools`
construía el tool `invoke_agent` con una lista de pipelines **hardcodeada** de 4
nombres (`construir-modulos, escribir-skills, esquematizador-negocio, planificar-construccion`).
Un pipeline NUEVO (decidir-interfaz, esquematizar-interfaz, construir-interfaz) existe
en el registro (`pipeline.listar` lo devuelve, y `buscar_agente` lo encuentra) pero
**el chat NO puede invocarlo** — el enum `agent_name` del tool lo excluye en silencio.

Fix (en main): la lista sale del **registro en vivo** (`pipeline.listar.request` →
`pipeline.listar.response`, el mismo canal que usar_agente/buscar_agente) con fallback
a la lista conocida si el registro no responde (arranque temprano, orden de carga de
módulos) + **reintento en background a los 8 s** que re-registra el tool (enum +
descripción) cuando el registro ya cargó — así un pipeline nuevo entra SIN tocar código.

Regla al añadir un pipeline nuevo: verifica que el chat puede invocarlo —
`grep pipelines /opt/enki/modules/conversacion/ai-agent-framework-v3/index.js`; si
aparece una lista literal, el motor en prod es ANTERIOR al fix #159.

### REGLA DEL REPO: antes de inventar un patrón nuevo, busca el existente (2 pagos en vivo)

Paco corrigió dos veces en una sesión (F6/F7): **(1) rutas de ARCHIVO** — el patrón es
"UN entregable = UN path" (como `storage/esquemas/esquema.md`, `plan-construccion.md`,
`cosecha/cantera/enki/<slug>/SKILL.md`). El multi-archivo (`dir` + `archivos[]` en el
entregable del pipeline) es SOLO la excepción documentada de la F7: el trío del frontend
(manifest.json + index.ts + `<Slug>Panel.svelte` + store) ES 3-4 archivos físicos que el
loader necesita — se justifica porque el artefacto es múltiple por naturaleza, no por
comodidad. **(2) rutas WEB** — cuando Paco dice "ruta" en contexto frontend se refiere a
**dirección web (URL)**, no a path de archivo. El patrón: `manifest.json.routes` =
deep-links REALES de `frontend/src/routes/` (scopeados `/[project_id]/<pagina>` o planos
`/chat`, `/facturas`) o páginas del `PAGE_CATALOG` (`frontend/src/lib/ui-core/project-pages.ts`);
NUNCA inventar una URL nueva dentro del manifest — si la página no existe, se crea aparte
siguiendo `/[project_id]/<pagina>/`. La pantalla única del frame (frontend.contract) prohíbe
rutas hermanas al frame: las URLs son deep-links a estado.

### El patrón request/response: escuchar el par `*.failed`

La garantía del bus de Enki: **todo flujo cierra su círculo con su par
`*.failed`** (`pipeline.obtener.request → pipeline.obtener.response |
pipeline.obtener.failed`). Un helper `_pedir` que solo escucha el `.response`
convierte el error real del custodio (ej. `pipeline no encontrado`) en un
TIMEOUT genérico de N segundos (fix #149, verificado en vivo: el registro
respondió `pipeline.obtener.failed` y el v3 dio timeout porque no escuchaba
el failed). Regla: el `_pedir` se suscribe al `.response` Y al `.failed`
derivado (`eventoResponse.replace(/\.response$/, '.failed')`), filtra por
`request_id`, y rechaza con `data.error.message` + `data.error.code`.

### El contrato del puerto fuzzy (ai-gateway): `request_id` OBLIGATORIO (fix #151)

El ai-gateway (Entry 2, `llm.complete.request → llm.complete.response`) **exige
`request_id` en el payload** — no `llm_request_id` (ese era el contrato del
framework viejo, ya borrado). Sin `request_id`: `warn('invalid_payload')` +
`return` **sin responder** → el llamante espera el timeout completo (4 min).
Síntoma en la bitácora del pipeline: `[generar_codigo] intento N error:
generación timeout` repetido, con `publish:llm.complete.request` en el log pero
0 `publish:llm.complete.response`. Regla: mandar `request_id` en el request y
filtrar la respuesta por `request_id || llm_request_id` (compat con smokes).

### El problema de los 2 árboles (deploy) y el reflejo COMMITAR

La raíz de "el deploy se come el trabajo" (visto 3 veces): el motor escribe en
`/opt/enki/modules/` (prod, www-data) pero el deploy sincroniza DESDE
`~/3enki` (el repo, admin) con `rsync --delete` — una sola dirección. Todo lo
generado en prod sin commit MUERE en el próximo deploy. La solución (fix #150):
el reflejo `commitar` del pipeline — copia el entregable de prod al repo
(`/opt/enki/modules/<slug>` → `~/3enki/modules/<slug>`), `git add + commit`
(`motor: <slug> generado por pipeline <pipeline> (verificado)`) + `push origin
HEAD` (best-effort: el commit local ya protege del rsync aunque el push falle).
`storage/` NO se commitea (data/ está excluida del rsync — sobrevive).
Requisito de permisos (una vez): `sudo chown -R admin:www-data ~/3enki` +
`sudo chmod -R g+w ~/3enki` + `git config user.name/email` para www-data (el
token del push ya vive en el remote del repo). Con el commit, la regla
`en_repo` del JEFE verifica de verdad (git ls-files encuentra el archivo).

**PITFALL de permisos LINUX — el PADRE bloquea (verificado en vivo):** el
repo bien (admin:www-data + g+w) NO basta si `/home/admin` es `750
admin:admin` — www-data (el core) **no puede atravesarlo** (otros = `---`) →
`EACCES: permission denied, mkdir '/home/admin/3enki/modules/<slug>'` en el
commit y, peor, el `git -C ~/3enki ls-files` del JEFE falla (catch →
`undefined` → **"repo no disponible → no bloquea" — un FALSO POSITIVO: el
veredicto da `entregable_verificado` con en_repo ok=True aunque el archivo NO
esté en git**). Fix: `sudo chmod o+x /home/admin` (solo el bit de atravesar —
sin dar lectura del contenido). Al auditar un veredicto con en_repo "no
disponible", comprueba que el git pudo correr (permisos del path completo,
`ps -o user= -p <pid del core>` + `ls -ld /home /home/admin /home/admin/3enki`).

### La cadena COMPLETA de permisos para que www-data haga git en el repo (3 fallos vistos en vivo)

El `chown -R admin:www-data + chmod -R g+w` del repo NO es suficiente — hay 3
capas más, cada una con su síntoma y su fix:

1. **El padre** (`/home/admin` 750) → `sudo chmod o+x /home/admin` (arriba).
2. **`.git/index` (y refs) los reescribe el git de ADMIN en cada merge/checkout**
   → vuelven a `admin:admin` sin g+w → el `git add` de www-data falla con
   `unable to write index` / permission denied (aunque el `git status` sí
   funcione: status lee, add escribe). Fix DURABLE:
   `sudo chown -R admin:www-data ~/3enki/.git && sudo chmod -R g+w ~/3enki/.git`
   + **`git -C ~/3enki config core.sharedRepository group`** — los archivos
   nuevos del .git heredan el grupo del repo (www-data) aunque git corra como
   admin, así los merges NO re-rompen el acceso. Verificar: `ls -la
   ~/3enki/.git/index` (owner debe ser admin:www-data) y `git config
   core.sharedRepository` (= group).
3. **`dubious ownership`** — git ≥2.35.3 (CVE-2022-24765) rechaza operar en un
   repo cuyo owner no es el usuario: `fatal: detected dubious ownership in
   repository at '/home/admin/3e...'` cuando www-data ejecuta git en el repo de
   admin. Fix: `sudo -u www-data git config --global --add safe.directory
   /home/admin/3enki` (config global de www-data — una vez). Afecta TAMBIÉN al
   `git ls-files` del JEFE (en_repo → `undefined` → "repo no disponible → no
   bloquea": el mismo falso positivo del punto 1).
   PITFALL del home: si el comando falla con `error: could not lock config
   file /var/www/.gitconfig: No such file or directory` — el home de www-data
   (`/var/www`) NO existe. Crearlo ANTES:
   `sudo mkdir -p /var/www && sudo chown www-data:www-data /var/www` y repetir
   el `git config --global`. (Alternativa sin home: `sudo git config --system
   --add safe.directory /home/admin/3enki`, pero verifica la lectura con
   `git config --system --get-all safe.directory` — el `--system --get-all`
   puede dar "invalid key" si la sintaxis del comando no es exacta.)

### Cierre pragmático del ciclo cuando el commit de www-data falla tras un add EXITOSO

Visto en vivo (el cierre de la prueba definitiva): el reflejo `commitar` del
motor hizo el `git add` (el archivo queda staged, `git status` = `A
modules/<slug>/`) pero el `git commit` de www-data falló con un stderr que el
propio reflejo OCULTA (`String(err.message).slice(0, 150)` — solo se ve
"Command failed: git -C ... commit ..."). Si el add pasó y el commit falla:
**el cierre lo completa un admin** con el MISMO comando del motor (el archivo
ya está staged):

```bash
cd ~/3enki && git commit -m "motor: <slug> generado por pipeline <pipeline> (verificado)" -- modules/<slug>/index.js && git push origin main
```

El `-- <path>` del commit con pathspec usa el contenido staged. Con eso el
ciclo cierra (archivo en git + GitHub, `en_repo` verifica de verdad) aunque el
stderr del commit de www-data quede por depurar. Para no cegarse la próxima
vez: el reflejo debería loguear el stderr COMPLETO (subir el slice de 150).

### PITFALL de paths: `__dirname` de un módulo en `modules/<area>/<mod>/` → `'../..'` = `modules/` (fix #152)

Diagnóstico en vivo (ENOENT tras la primera generación VÁLIDA del LLM real):
`path.resolve(__dirname, '../../..')` desde `modules/conversacion/ai-agent-framework-v3/`
resuelve a la **RAÍZ del sistema** (`/opt/enki`), NO a `modules/`. Un nivel menos:
`'../..'` = `/opt/enki/modules`. Síntoma: el `_resolver` escribe en
`/opt/enki/<slug>` (el dir padre no existe) → `ENOENT` justo después de un
paso fuzzy que SÍ validó. En el smoke local pasaba porque `modulesDir` se
inyectaba a mano — en prod se usa el default del constructor. Regla: verifica
los defaults de paths con `node -e "console.log(path.resolve(__dirname,'../..'))"`
o calcula desde `__dirname` del módulo, no de memoria.

Segundo bug del mismo fix: el `_commitar` copiaba a `~/3enki/<slug>` en vez de
`~/3enki/modules/<slug>` — el entregable del sistema (no-storage) vive en
`modules/` del repo (el rsync lo lleva a `/opt/enki/modules/` y el loader solo
carga de ahí). El `repoRel` = `path.join('modules', relPath)` y el `git add/commit`
con ese prefijo.

### El deploy NO reinicia el core (y el copy-paste de comas rompe systemctl)

El `deploy.sh` reporta "servicios systemd sin cambios (no reinicio)" — **los
cambios de MÓDULOS solo se activan al reiniciar**: `sudo systemctl restart enki`.
Un v3 viejo en memoria con fixes nuevos en disco se comporta EXACTO como el
viejo (el gateway rechaza el `llm_request_id` en silencio → timeouts idénticos
a los del bug sin arreglar). Verificar SIEMPRE:
`systemctl show enki -p ActiveEnterTimestamp --value` — el timestamp debe ser
NUEVO tras el deploy; si repite el anterior, el restart no ocurrió (o falló) y
cualquier prueba da falso negativo.

PITFALL del copy-paste: comandos con coma al final (del markdown) llegan como
`enki,.` → `systemctl` falla con "Invalid unit name" y el reinicio no ocurre.
Ejecutar el comando limpio (`sudo systemctl restart enki`) y verificar el
timestamp antes de probar.

Nota de tooling: los greps con escapes de comillas dentro de `bash -c` fallan
silenciosamente (`grep -oE "\\"(msg|event_type)\\":"`); usar patrones simples
(`grep "T00:07"`, `grep -oE "event_type.:.[a-z_.]+"`).

## Referencias

- `scripts/verificar-modulo-enki.js` — verificación INTERACTIVA de un módulo
  en vivo: 2 clients MQTT (anónimo publica + observe recibe con `enki:cert:`),
  suscripción a `core/#` (el topic real de las respuestas lleva `*` literal).
- `references/motor-agentes.md` — el MOTOR DE AGENTES (ai-agent-framework-v3):
  la visión (pipeline determinista + fuzzy acotado), las 10 piezas, eventos
  pipeline.*/bitacora.*, formato de pipeline, el flujo de ejecución y cómo
  verificar que está vivo en prod.
- `references/cimiento-agentes-v3.md` — arquitectura completa del cimiento
  (JEFE, BITÁCORA, REANUDADOR, separación LLM vs AGENTE, rehidratación del marco,
  manifests v2, schema).
- `references/git-workflow-3enki.md` — pitfalls de git/PR (squash-merge vs
  pendiente, cherry-pick de commits huérfanos, PRs superados, limpieza de ramas).
- `references/fases-interfaz-f6-f7.md` — las fases de interfaz del proceso
  (F6 decidir → F6½ esquematizar → F7 construir): el flujo del orquestador, los
  DOS patrones de rutas (archivo: UN entregable=UN path, F7 excepción; web:
  manifest.routes = deep-links del frame), la lección "nunca construir sin
  esquematizar", y el checklist de verificación del deploy en vivo.
- `references/fusion-hermes-enki.md` — la FUSIÓN Hermes↔Enki (2026-08): mapa del
  terreno (executeTool wrapper vs _executeToolCall, HTTPGateway/registry.js, el
  API server de Hermes como agente completo, los DOS Hermes del VPS, /opt/enki
  sin git), el patrón de activación en fases (FASE 1 aislada + FASE 2 salto
  atómico reversible), scripts de estabilización, y el estado de la fusión.
- `references/incidente-generador-de-informe.md` — el pipeline que generó
  basura de transcript de agente (tool_thinking XML como index.js): instrucción
  con firma inventada vs patrón real del bus, y la regla `sin_transcript` del
  validador P3 que la bloquea.

## 4 · Smoke real antes de creer (patrón de prueba)

1. Verifica el deploy por MARCADORES de código en prod (strings visibles), no
   por nombres: `grep` el archivo de /opt/enki buscando el identificador nuevo.
   ⚠️ **FALSO POSITIVO de marcador por substring (pagado en vivo, #155):** el
   marcador debe ser un string que NO exista en el código VIEJO. Grepeé
   `ejecucionActiva` y prod "lo tenía" — pero coincidía con `ejecucionActivaId`,
   el identificador VIEJO que el PR reemplazaba; prod iba un PR atrás y el grep
   decía lo contrario. El check fuerte es `diff repo↔prod` de los archivos
   clave (idénticos = deployado), no el grep. Y cruza el
   `ActiveEnterTimestamp` del servicio con la FECHA del merge
   (`git log --format="%ci"` — ojo husos: git en +0200, systemctl en UTC): si el
   restart es ANTERIOR al merge, prod no puede tener ese commit.
2. Prueba el flujo completo por MQTT con el envelope (sección 1), no una versión
   simplificada — el path completo rompe donde el smoke fácil pasa.
3. La BITÁCORA sellada del agente (`storage/agentes/bitacoras/<request_id>.json`)
   es la evidencia: estado verificada/fallida + veredicto + reglas. Y **los pasos
   de la bitácora LOCALIZAN el eslabón roto** del pipeline:
   - `[generar_codigo] intento N error: generación timeout` repetido → contrato
     del gateway (payload sin `request_id` → `invalid_payload` silencioso) o
     v3 viejo en memoria (core sin reiniciar).
   - `intento 1: válido` + veredicto `ENOENT` → bug de path del resolver/escribir
     (no es el LLM — la generación ya validó).
   - `[commitar_modulo] commit: {error: EACCES, mkdir '~/3enki/modules/<slug>'}` →
     permisos del PADRE del repo (`/home/admin` 750 → `sudo chmod o+x /home/admin`),
     no del repo (el repo ya es admin:www-data g+w).
   - `[commitar_modulo] commit: {error: "fatal: detected dubious ownership in
     repository at ..."}` → git ≥2.35.3 rechaza el repo de otro owner:
     `sudo -u www-data git config --global --add safe.directory /home/admin/3enki`.
   - `[commitar_modulo] commit: {error: git add ... permission denied}` (con el
     padre y el .git "bien") → el `.git/index` lo reescribió un git de admin
     (vuelve a admin:admin): re-chown del .git + `git config core.sharedRepository group`.
   - `[commitar_modulo] commit: {commit:true}` → 🎉 el ciclo cierra: el archivo
     está en git, `en_repo` verifica de verdad y el trabajo sobrevive al deploy.
   - `en_repo: ok=True — repo no disponible → no bloquea` → el git del JEFE no
     pudo correr (mismo problema de permisos): el veredicto verificado es un
     FALSO POSITIVO hasta que el git funcione.
   - Sin bitácora de la hoja → el pipeline ni se ejecutó (suscripción del evento
     con nombre equivocado, ej. `invoke_agent` vs `invoke_agent.request`).
4. El core reiniciado ≠ deploy completo: compara repo↔prod con `diff` de los
   archivos clave ANTES de declarar "desplegado", y comprueba
   `systemctl show enki -p ActiveEnterTimestamp --value` (timestamp NUEVO —
   el deploy.sh no reinicia servicios).

**Smoke LOCAL de un módulo sin el core (mini-bus síncrono):** para probar
módulos nuevos (custodios/ejecutor) sin desplegar, instancia los módulos con
un bus casero `{ publish, subscribe }` (Map de listeners por topic), cablea
los handlers manualmente (en prod los cablea el loader: `subscribe(ev, e =>
mod[handler](e))` por cada par del module.json), apunta stores a /tmp
(dataDir/storeDir inyectables) y usa un gateway mock para `llm.complete.request`
(responde con `request_id: e.data.request_id` — el CONTRATO del gateway real;
si respondes con un id fijo o con `llm_request_id`, el `_generar` espera el
timeout completo y el smoke se cuelga). Ojo: si el bus no reenvía a un
listener `*` para capturar eventos, los finds de verificación salen vacíos
(DEBUG: imprimir `Object.keys` de los eventos del request_id).
