---
name: telegram-por-proyecto
description: >-
  Cada proyecto de Enki con su bot de Telegram = el MISMO chat que en la web
  (la visión del dueño: "cada proyecto tenga su bot con el chat del proyecto
  como si estuviera en enki-ai.online/proyecto/chat"). Cubre: alta de bots
  (token → .env → telegram-service), vinculación bot→proyecto (registro del
  telegram-bridge), la trampa del project_id UUID (slugs como 'nonina' NO
  valen), el hilo unificado (conversation.list → última activa → o create),
  y la verificación end-to-end de la cadena Telegram⇄chat. Úsala al activar
  un bot nuevo para un proyecto, diagnosticar por qué un bot no responde, o
  revisar el estado de los vínculos.
when-to-use: >-
  Paco pide "activar un bot de telegram para este proyecto", un bot no
  responde desde Telegram, se revisa el estado de los vínculos
  (data/telegram-bridge/registro.json), o se decide el hilo unificado
  web↔Telegram.
source: hermes
tags: [enki, telegram, bot, chat, proyecto, bridge, uuid, mqtt]
---

# Telegram por proyecto — cada bot es el chat de su proyecto

**La visión (del dueño, 15-ago-2026)**: cada proyecto de Enki tiene su bot de
Telegram que habla con el MISMO chat del proyecto que en la web. El bot es
"el chat del proyecto desde el móvil" — la misma mente (Hermes), los mismos
datos, los mismos eventos.

## ⚠️ DOS circuitos distintos — "conecté el proyecto con su bot" es ambiguo

Hay DOS sistemas de bots de Telegram independientes que NO se tocan. Antes de
diagnosticar, distinguir cuál quiso el dueño:

1. **Circuito Enki** (telegram-service + telegram-bridge): CADA proyecto tiene SU
   bot (la visión de este skill). Bots = credenciales `TELEGRAM_API_KEY_CUSTOM_<botName>`
   en `/opt/enki/data/.env` + vínculo botName→project_id en `registro.json`.
2. **Circuito Hermes** (este agente): UN SOLO bot global (`hermesenki_bot`,
   `TELEGRAM_BOT_TOKEN` en `~/.hermes/.env`) que atiende el chat de Hermes; no
   hace multi-proyecto por bot.

**Síntoma "bot huérfano"**: el dueño creó el bot en BotFather pero no está en
NINGUNO de los dos circuitos. No asumir que porque se llama parecido a edias ya
está en Enki. Comprobar ambos: `sudo grep -oE 'TELEGRAM_API_KEY_CUSTOM_[A-Za-z0-9_]+' /opt/enki/data/.env` (Enki) y el `getMe` del token (Hermes global = `hermesenki_bot`).

## Arquitectura (las 3 piezas)

```
Telegram (usuario → bot) 
  → telegram-service (multi-bot v3.1.0: polling, emite telegram.text.received)
  → telegram-bridge (isla: botName → project_id, reenvía al chat)
  → conversation.send.request (el MISMO circuito que la web)
  → Hermes responde → ai.chat.response { channel: 'telegram' }
  → telegram-bridge → telegram.send_message.request → vuelve al usuario
```

- **`modules/telegram-service/`** — gestiona N bots (credenciales en el .env,
  polling con getUpdates). Emite entrantes: `telegram.text.received`,
  `telegram.command.received`, `telegram.callback.received` (payload:
  botName, chatId, from, text).
- **`modules/telegram-bridge/`** — el puente: vincula botName → project_id,
  reenvía el texto al chat del proyecto, y la respuesta de Hermes vuelve al
  hilo de Telegram de origen. Reflejo puro determinista (sin blueprint).

## Alta de un bot nuevo (pasos exactos)

1. **El dueño crea el bot en @BotFather** (`/newbot`) y pasa el token.
2. **Verificar el token ANTES de nada** (evita el "arranca y falla"):
   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/getMe"
   # → {"ok":true,"result":{"username":"<nombre_bot>"}} = válido
   # → {"ok":false,"error_code":401} = token inválido/revocado → regenerar en BotFather
   ```
   **El username resultante es el `botName`** que se usa en todo lo demás.
3. **Guardar la credencial por el bus — NO editar el .env a mano (verificado 27-sep-2026)**.
   El canal correcto es el `credential-manager`, que persiste en `data/.env` y **avisa a
   `telegram-service` en caliente** (`onCredentialSaved` → `startBot`), así que **no hace falta
   restart**:

   ```bash
   TOKEN=$(cat /opt/enki/data/.hermes-bridge-token)
   curl -s http://localhost:8130/execute -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"tool_name":"bus.publishAndWait","args":{
     "event":"credential.create.request","payload":{
       "provider":"TELEGRAM","level":"CUSTOM","identifier":"<botName>","api_key":"<TOKEN>"},
     "timeout_ms":15000}}'
   # → credential.saved · .env queda con TELEGRAM_API_KEY_CUSTOM_<botName>=<token>
   #   y telegram-service arranca el polling solo.
   ```

   Dos cosas medidas en vivo: (a) `api_key` DEBE ser la clave de dentro del payload — la
   primera vez que se probó sin ella el `credential.create.request` se perdió (timeout 15s sin
   respuesta) y el `.env` quedó igual, `www-data:www-data 644`, con solo el `_updated_at`
   cambiado; (b) `bus.publishAndWait` con timeout a secas (sin `_publishState`) puede tardar —
   el evento del credential-manager igualmente llega; verificar el resultado en el `.env`, no
   en la respuesta del curl.

   Fallback a mano: `TELEGRAM_API_KEY_{BOT|CUSTOM}_<botName>=<token>` en `/opt/enki/data/.env`
   (patrón verificado en `telegram-service/index.js`, `CREDENTIAL_PATTERN`), y entonces sí
   restart (el `loadExistingBots()` solo corre en `onLoad`).
4. **Vincular por el evento del bus — SÍ tiene evento, solo NO tiene tool (corregido 27-sep-2026)**.
   No existe tool en el portal (`portal/call { tool: 'telegram-bridge.vincular' }` → 404). Pero el
   bridge **sí atiende su evento RPC en el bus**, y `bus.publishAndWait` sí lo alcanza
   (`_atender` → `telegram.bridge.vincular.response`):

   ```bash
   TOKEN=$(cat /opt/enki/data/.hermes-bridge-token)
   curl -s http://localhost:8130/execute -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" -d '{"tool_name":"bus.publishAndWait","args":{
     "event":"telegram.bridge.vincular.request","payload":{
       "request_id":"vinc-1","botName":"<botName>",
       "project_id":"<UUID_REAL>"},"timeout_ms":15000}}'
   # → {status:201, data:{botName, project_id, vinculado:true}}  y el registro escrito por www-data
   ```

   **NO hace falta sudo, ni escribir el registro a mano, ni reiniciar**: el bridge guarda el
   registro él mismo (tempfile+rename, `www-data`, 644) y queda vivo al instante —
   `_cargarRegistro()` solo corre en `onLoad`, pero `_vincular()` muta `this.registro` en memoria
   y persiste. El fichero se escribe con el vínculo nuevo y `_updated_at` al momento.
   Comprobar en `registro.json` (`total vinculos` +1) — es la evidencia real, no la respuesta del
   curl. Si se vinculó antes un `botName` a OTRO `project_id` la respuesta es `409 CONFLICT`
   (`ya está vinculado a otro proyecto`) — eso sí exige decisión del dueño.

   (Vía manual a mano, solo como fallback si el bus no responde: escribir
   `{ "_updated_at", "vinculos": { "<botName>": { "project_id": "<UUID>", "conversaciones": {} } } }`
   en `/opt/enki/data/telegram-bridge/registro.json` con `www-data:www-data` + restart, que es
   cuando `_cargarRegistro()` lo relee.)
   **NUNCA el slug**: ver el pitfall del UUID más abajo.
5. **Verificar el arranque**: journal → `telegram.bot.started { botName }`
   (o `telegram.bot.start_failed { error }`).
6. **Prueba end-to-end**: el dueño manda un mensaje al bot → cadena completa
   en el journal: `bot.message.received` → (bridge) → `conversation.send` →
   `ai.chat.response` → `telegram.send_message.request/response`.

## PITFALL CRÍTICO — el project_id DEBE ser UUID, nunca slug

**Pagado en vivo (15-ago, bot de nonina)**: el vínculo se hizo con
`project_id: 'nonina'` (slug) y TODO el flujo fallaba con
`chat-io.ui.list.failed: "project_id is required and must be a UUID"`.
`conversation.list/create` exigen UUID — un proyecto con id-slug (nonina,
the-pirate, motocom… los importados o antiguos) REVIENTA en la resolución de
conversación aunque el bot arranque bien.

**Cómo resolver slug → UUID** (sin preguntar): la BD del proyecto guarda el
project_id real en la tabla `conversations`:
```python
import sqlite3
conn = sqlite3.connect('/opt/enki/data/projects/<slug>/db/<slug>.sqlite')
conn.execute("SELECT DISTINCT project_id FROM conversations").fetchall()
```
(Ojo: puede haber dos BDs — `db.sqlite` vacía de 0 bytes y `db/<slug>.sqlite`
con las tablas reales; usar la que tenga la tabla `conversations`).
El proyecto B (buscador de nichos) ya usaba UUID (`f57dfb78...`), por eso
nunca dio el problema.

## Hilo unificado web↔Telegram (decisión del dueño, 15-ago)

**El bot debe hablar con la MISMA conversación que la web** — no crear una
conversación nueva por chatId (eso era el comportamiento inicial del bridge:
`_crearConversacion` con `conversation.create` → hilos paralelos).

**Decisión: "conversación lista y eliges"** — `_resolverConversacion`:
1. `conversation.list { project_id }` → si hay conversaciones, usar la
   **última activa** (`convs[0].id` si el backend ordena por updated_at).
2. Si no hay ninguna (o list falla) → `conversation.create` como fallback.
3. El registro guarda el conversation_id resuelto por chatId para futuros
   mensajes del mismo chat.

**Comandos**: `telegram.command.received` reenvía `/comando` al chat como
texto (el bridge lo hace así hoy); los comandos gestionados (`/nueva`,
`/limpiar`, `/ayuda`) son un paso pendiente — especificar que se gestionen en
el bridge con el mismo significado que en el frontend.

## PITFALL — "message is too long" (el bot SÍ responde pero Telegram lo rechaza)

**Pagado en vivo (16-ago, The_pirate_enki_bot)**: el usuario decía "no responde", pero el journal mostraba la cadena COMPLETA (bot.message.received → conversation.send → ai.chat.response → telegram.send_message.request emitido) y luego `telegram-bridge.fallo { etapa: telegram_send, detalle: "Bad Request: message is too long" }`. Telegram limita cada mensaje a **4096 chars** — las respuestas largas (dictámenes, esquemas) lo superan y el envío falla SILENCIOSO para el usuario.

**Síntoma a reconocer**: `telegram.send_message.request` se emite pero `telegram-bridge.fallo` con `etapa: telegram_send` + "too long". No es que el bot no responda — es que la respuesta no cabe.

**Fix**: el bridge trocea en chunks de ≤4000 chars (límite seguro) y envía en secuencia (un `telegram.send_message.request` por chunk). Verificado en prod (16-ago): 0 fallos tras el fix. Si un bot "no responde" y el journal muestra el envío emitido + fallo → revisar el `detalle` del fallo antes de tocar el circuito.

## Permisos del registro (pitfall EACCES)

`data/telegram-bridge/` debe ser **www-data:www-data con g+w** — si se crea
con sudo queda root:root y el bridge falla al guardar el registro con
`EACCES: permission denied, open './data/telegram-bridge/registro.json.tmp'`
(patrón tempfile+rename). El fallo es SILENCIOSO para el usuario: el mensaje
se recibe pero la respuesta nunca vuelve (el reenvío aborta al guardar).
Fix: `sudo chown -R www-data:www-data /opt/enki/data/telegram-bridge/`.

**Mismo patrón en los storages de proyecto** (16-ago-2026): el chat (usuario
`hermes`, grupo www-data) escribe en `<proyecto>/storage/` solo si tiene g+w.
Los subdirectorios que el propio chat crea DESPUÉS de un `chmod -R g+w` (ej.
`esquemas/modulos-produccion/`, `cupulas/`) NO heredan el permiso → su write
falla con `Permission denied` en `.hermes-tmp.xxx`. Barrido global que
arregla todo (verificado: 0 restantes):

```bash
sudo find /opt/enki/data/projects -type d ! -perm -g+w -exec chmod -R g+w {} +
```

**PITFALL FRONTEND (17-ago-2026, el que más rompe el build)**: el sandbox del
chat crea archivos en `frontend/` con permisos `600 hermes:hermes` — y el build
corre como **www-data** → `vite:load-fallback Could not load ... EACCES:
permission denied`. El build falla aunque el código sea perfecto, y el repo
puede tener los archivos (el Guardian los lee como admin y los versiona) —
el fallo es SOLO de permisos en prod. Fix (canal del dueño):

```bash
sudo chown -R www-data:www-data <ruta> && sudo chmod -R u+rw,g+r,o+r <ruta>
# directorios además: sudo chmod 755 <dir>
```

**Síntoma a reconocer**: "el build falla pero el código está bien" → buscar
`EACCES` en el error de vite y `-rw------- hermes` en la ruta. El culpable
típico es el archivo que el chat acaba de crear (blueprint, store, panel).
**Lección al chat**: al crear archivos en `frontend/` (o cualquier ruta que
lea www-data) → `chmod 644` archivos / `755` directorios (o `chown
www-data:www-data`); su sandbox crea 600 por defecto.

## Verificación end-to-end (qué mirar en el journal)

Nombres REALES de eventos observados en el journal de `enki` (19-ago, alta Impresionanate3d_bot):

```
telegram.bot.started { botName }                     ← el bot arrancó el polling
bot-registry.registered { botName, path }            ← se registró (data/bots/<botName>)
bot-manager.message.received { botName, chatId, textLength }  ← llegó el mensaje (NO "bot.message.received")
telegram-bridge.fallo { etapa: conversation_resolve } ← problema de conversación (UUID)
chat-io.ui.list.failed "must be a UUID"               ← slug en vez de UUID
conversation.send / ai.chat.response                  ← el chat procesó
telegram.send_message.request + response              ← la respuesta volvió
```

**Pitfall del restart**: `systemctl restart enki` arranca TODOS los bots a la vez.
Si en el journal ves `bot.start_failed { botName: facturas_asesoria_bot }` junto a
`bot.started { botName: <el tuyo> }`, el 401 es de OTRO bot zombie — NO confundir con
fallo del bot recién dado de alta. Filtrar por el botName del nuevo.

Nota: `SQLITE_CONSTRAINT: UNIQUE constraint failed: messages.id` al guardar
la respuesta de Hermes es un bug secundario (doble inserción del relay) que
NO impide el envío a Telegram — el usuario recibe la respuesta igualmente.

## DIAGNÓSTICO — "conecté el bot con el proyecto pero no responde"

Cuando el dueño cree un bot en BotFather, lo configure y luego diga "le pedí
que conectase el proyecto con su bot", el bot puede estar **a medio alta**: ya
existe en Telegram (por eso el usuario lo ve) pero Enki nunca lo arrancó. Los
3 sitios que hay que comprobar SIEMPRE (uno solo basta para diagnosticar):

```bash
# 1. ¿Tiene credencial? (si no aparece → nunca arrancará)
sudo grep -oE 'TELEGRAM_API_KEY_[A-Za-z0-9_]+' /opt/enki/data/.env | grep -i <botName>
# 2. ¿Está vinculado al proyecto? (botName → project_id)
grep -o '"<botName>"' /opt/enki/data/telegram-bridge/registro.json
# 3. ¿Ha arrancado alguna vez? (vacio = nunca se registró el polling)
sudo journalctl -u enki --since "<fecha>" --no-pager | grep -i <botName>
```

**Lectura:** si fallan los 3 → el bot se creó en BotFather pero NO se hizo el
alta en Enki (falta `.env` + registro + restart). No hay nada "roto": el bot
está a medio configurar. Completar los 2 pasos de alta (credencial `.env` +
vínculo en `registro.json` con el UUID real, nunca el slug) + restart.

**⚠️ Los logs del eventbus (`data/logs/current.jsonl`) NO sirven para este
diagnóstico**: solo registran `event.publish`/`event_flow` SIN payload, y no
nombran el proyecto por slug. El detalle real (qué bot, qué error) está en el
**journal del servicio**, no en los JSONL. Extraer el nombre del bot fallido:

```bash
sudo journalctl -u enki --no-pager | grep -oE '\{[^}]*\}' | grep -iE 'unauthor|401'
# → {"botName":"facturas_asesoria_bot","error":"Unauthorized"}
```

## PITFALL — bucle `telegram.bot.error` cada segundo = token 401 en polling

**Síntoma:** el log (journal o `data/logs/current.jsonl`) muestra
`telegram.bot.error` disparado **en bucle**, aprox. 1 por segundo. Es ruido que
contamina el diagnóstico de OTROS proyectos (cualquiera que esté revisando un
bot distinto lo ve y lo confunde con su problema).

**Causa:** un bot con token inválido/revocado sigue en el `.env` y el
telegram-service emite `telegram.bot.error` en cada intento de `getUpdates`
(`client.on('error')`, no solo al arrancar). Es el caso `facturas_asesoria_bot`
(401). El bucle NO es de otros proyectos — es de ese bot zombie.

**Fix:** regenerar el token en BotFather y actualizar el `.env`, o **quitar la
línea del `.env`** del bot roto + restart. No persigues otros proyectos mientras
ese bucle suene: identifica el bot por el journal y resuélvelo a él primero.

## PITFALL — `Bad Request: chat not found` al probar el envío (27-sep-2026)

Tras dar de alta y vincular, probar el envío con el `chatId` de otro proyecto (el `1934798567`
que comparten los 6 bots existentes) devuelve:

```
telegram.send_message.request → { status: 404, error: { code: RESOURCE_NOT_FOUND,
                                 message: "Bad Request: chat not found" } }
```

**No es un fallo del alta ni del bridge.** Telegram solo deja enviar a un chat que ya haya
iniciado conversación con ESE bot: el usuario (chatId 1934798567) aún no le ha escrito a este
bot concreto. El alta está bien (credencial + polling + vínculo); falta que el dueño abra el bot
en Telegram y mande un mensaje. El `chatId` no se puede copiar de otro proyecto — es por-bot
hasta que el chat existe.

Verificado en el mismo alta: `credential.resolve` → `resolved_from: CUSTOM` con la key correcta,
`telegram.list_bots` → `total: 7` con `Enki_nichos_bot` y `polling: true`, y `registro.json` con
`total vinculos 7`. La cadena está viva; lo único pendiente es el primer mensaje del dueño.

## PITFALL — el `.env` es del credential-manager: hermes NO lo escribe a mano

`/opt/enki/data/.env` está `www-data:www-data 644` **sin g+w** → el chat (usuario `hermes`,
grupo www-data) no puede editarlo con `write_file`/`patch`. Y no hace falta: el credential-manager
es su escritor legítimo (tempfile+rename). Usar `credential.create.request` por el bus (paso 3).
Leer sí se puede (644, world-readable): útil para confirmar que la línea quedó escrita.

## Estado conocido (15-ago-2026)

| Bot | Proyecto | project_id | Estado |
|---|---|---|---|
| Vapers_alhama_bot | B (buscador de nichos) | f57dfb78-... (UUID) | ✅ funcionando |
| Pro_nonina_bot | nonina | 5d6d28eb-... (UUID resuelto de la BD) | ✅ tras fix UUID |
| The_pirate_enki_bot | the-pirate | 5d09cb49-... (UUID) | ✅ funcionando (tras fix chunks 16-ago) |
| Impresionanate3d_bot | edias | 485cfbd8-... (UUID) | ✅ dado de alta 19-ago (bot arranca, bridge cargado) |
| facturas_asesoria_bot | — | — | ❌ token 401 (regenerar en BotFather) |
| Enki_nichos_bot | nichos (Radar de Nichos) | `4fe1fb71-df73-4d67-8fb7-ba6b0beff253` | ✅ OPERATIVO 27-sep — alta por el bus + `/start` del dueño; cadena completa verificada (bot.message.received → ai.chat.response → telegram.message.sent 200), conversación unificada `d1a609c6` |

## PITFALL — el chat NO existe hasta que el dueño escribe (y `/start` basta)

El alta por sí sola deja el vínculo así: `{"project_id": "<uuid>", "conversaciones": {}}` — sin
conversación. Dos consecuencias medibles:

1. Un envío de prueba con el `chatId` de OTRO proyecto da `chat not found` (ver pitfall anterior):
   el `chatId` es **por-bot** y no existe hasta que ese bot recibe su primer mensaje.
2. La conversación unificada NO se crea en el alta: el bridge la **resuelve (o crea) en el PRIMER
   mensaje** del chat y ahí la persiste (`_resolverConversacion` → `conversation.list` → última
   activa, con fallback a `conversation.create`).

Cualquier primer mensaje sirve — `/start` (el botón START de Telegram) es el caso normal, y viaja
como `telegram.command.received` + `bot.command.received` (NO como `telegram.text.received`).
Cadena verificada en vivo (27-sep, nichos): `/start` 12:21:28 → vínculo con conversación escrita
12:21:28 → `ai.chat.response` 12:21:42 → `telegram.message.sent` 12:21:42 → `0 fallos`.
Regla: para cerrar un alta, **pide al dueño que pulse START** y verifica en `registro.json` que
`conversaciones` ya tiene una entrada — esa es la evidencia de alta completa, no la respuesta del
`vincular`.
