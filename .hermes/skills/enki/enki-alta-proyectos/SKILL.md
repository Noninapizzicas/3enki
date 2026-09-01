---
name: enki-alta-proyectos
description: >-
  Alta de proyectos NUEVOS en Enki (cada cliente/negocio = un proyecto): la
  vía CANÓNICA es el evento project.create (project-manager.onProjectCreate),
  no crear la carpeta+BD a mano. Cubre el esquema COMPLETO de la BD (7 tablas,
  no 3), el registro del UUID, permisos, reinicio del core, y la verificación
  por RPC (conversation list, no send directo). Incluye el pitfall pagado en
  vivo: LISTAR los proyectos reales antes de crear (la lista corta a/b/c/...
  es incompleta — edias existía y no estaba en ella).
when-to-use: >-
  El dueño dice "manda el encargo al proyecto X" y X no aparece en la lista
  conocida; hay que crear un proyecto nuevo (un cliente, un negocio, un
  encargo dedicado); un RPC da RESOURCE_NOT_FOUND "Conversation not found in
  project" con un proyecto recién creado; o hay que decidir qué proyecto usa
  un encargo.
source: hermes
tags: [enki, proyectos, alta, project-manager, conversacion, uuid, encargo]
---
# Alta de proyectos en Enki

> El modelo de negocio de Enki = cada cliente/negocio es un PROYECTO con su
> chat. El alta correcta importa: un proyecto mal creado da `RESOURCE_NOT_FOUND`
> en el RPC aunque la carpeta exista. Pagado en vivo 18-ago-2026 (intento de
> crear el proyecto "impresion-3d" a mano → falló; "edias" existía y no estaba
> en la lista conocida).

## PASO 0 — LISTAR los proyectos REALES antes de crear (el pitfall crítico)

**NUNCA crear un proyecto nuevo basándose en la lista conocida** (a, b, c,
motocom, nonina, the-pirate) — esa lista es INCOMPLETA. `data/projects/`
tiene proyectos que no están en ella (edias, regalos, tres-vueltas, etc.).

```bash
ls /opt/enki/data/projects/          # los REALES (slugs y UUIDs mezclados)
```

**Caso real**: el dueño pidió "manda el encargo a edias" — edias EXISTÍA
(`/opt/enki/data/projects/edias`, project_id `485cfbd8-...`) pero no estaba en
mi lista corta; gasté tiempo creando uno a mano que además falló. **Ante un
nombre de proyecto desconocido: `ls` primero, preguntar después.**

## PASO 1 — La vía CANÓNICA: el evento project.create

`project-manager` escucha `onProjectCreate` (index.js:745) — el evento hace
carpeta + BD + registro:

```json
project.create { name, description?, color?, icon?, workspaceType? }
```

**Regla**: por eventos primero (filosofía Enki: los eventos hacen las acciones).
Solo si el evento no existe/no responde, ir a mano (paso 2).

## PASO 2 — Alta manual (solo si no hay evento disponible)

La carpeta+BD a mano FUNCIONA si se hace completa:

1. **Carpeta**: `/opt/enki/data/projects/<slug>/{db,storage,config}`
2. **BD**: `db/<slug>.sqlite` — necesita el **ESQUEMA COMPLETO** (el de `b`:
   `_template_entidades`, `conversations`, `messages`, `conversation_summaries`,
   `user_profile_facts`, `rag_messages`, `agent_executions` — **7 tablas**).
   Con solo 3 tablas (conversations/messages) el chat-io da
   `RESOURCE_NOT_FOUND: Conversation not found in project` aunque la fila
   exista. Fix determinista: copiar el esquema de un proyecto sano
   (`SELECT sql FROM sqlite_master` de b → CREATE en la nueva).
3. **La conversación** lleva `project_id` = **UUID nuevo** (no el slug — el RPC
   exige UUID: `INVALID_INPUT: project_id is required and must be a UUID`).
4. **Permisos**: `chown -R www-data:www-data` (el resto de proyectos son
   www-data).
5. **Reiniciar el core** (`sudo systemctl restart enki`) para que registre el
   proyecto (los proyectos se descubren al boot).
6. **Verificar con `conversation list`** (NO con `send` directo):
   ```bash
   node .claude/skills/conexion-mqtt/enki-rpc.js rpc conversation list '{"project_id":"<uuid>"}'
   # → conversations: [] count: 0 = NO registrado / esquema incompleto
   # → 1 conversación = listo para send
   ```

## El RPC de envío (conversation send)

```bash
node .claude/skills/conexion-mqtt/enki-rpc.js rpc conversation send \
  "$(cat /tmp/<msg>.json)"   # { project_id, conversation_id, message }
```

- Éxito → `success: true` + `message_id`.
- `RESOURCE_NOT_FOUND: Conversation not found in project` → proyecto no
  registrado o esquema incompleto (paso 2.2-2.5).
- `RESOURCE_NOT_FOUND` con proyecto EXISTENTE y conocido → el project_id no es
  el del proyecto (usar el de su BD, no el slug).

## Alta con bot de Telegram (20-ago-2026, pagado en vivo)

Cuando el dueño pide "proyecto nuevo + bot de Telegram adjunto", hay **4 piezas** (no 1). El alto ocurre porque el helper hace timeout en la respuesta pero la acción sí se ejecuta:

1. **Crear proyecto** por el evento `project.create` (PASO 1). El `ui/request/project/create` puede dar **timeout de respuesta** pero **la creación llega igual** — verificar en BD, no fiarse del timeout.
2. **Guardar la credencial del bot** en credential-manager — esquema correcto:
   ```json
   { "provider": "TELEGRAM", "level": "BOT", "identifier": "<botName>", "api_key": "<token>" }
   ```
   → genera `TELEGRAM_API_KEY_BOT_<botName>` en `data/.env`. El bot-manager se auto-registra en `data/bots/<botName>` desde `credential.saved`.
   (NO usar `provider: "TELEGRAM_API_KEY_BOT_<name>"` — eso no matchea el auto-registro.)
3. **Obtener el botName real** vía la API de Telegram (NO derivar del token):
   ```bash
   curl "https://api.telegram.org/bot<token>/getMe"   # → result.username = Despacho_pan_bot
   ```
   El `botName` es el **username** (p.ej. `Despacho_pan_bot`), no el id numérico del token.
4. **Vincular bot→proyecto**: `telegram-bridge` **NO tiene `ui_handler`** — solo evento de bus
   `telegram.bridge.vincular.request`. El carril `ui/request/...` da timeout. La vía fiable es
   escribir el vínculo **directo en `data/telegram-bridge/registro.json`** (la persistencia canónica
   del módulo, con backup previo):
   ```json
   "vinculos": { "<botName>": { "project_id": "<uuid>", "conversaciones": {} } }
   ```
   Igual de determinista que el evento, y evita el timeout.

**Verificación final** (no te fíes de timeouts): proyecto en BD (`projects`), credencial en
`data/.env`, bot en `data/bots/<botName>`, vínculo en `registro.json`, token válido (`getMe`).

## El chat de cualquier proyecto lee TODO el sistema


**Decisión del dueño (18-ago)**: el chat de un proyecto NO está limitado a su
proyecto — puede leer/explorar todos los módulos y skills del sistema. Un
proyecto "especial" para un encargo NO necesita privilegios extra. El encargo
abierto ("convierte esto en algo vendible, usa lo que consideres") se puede
lanzar al chat de cualquier proyecto existente.
