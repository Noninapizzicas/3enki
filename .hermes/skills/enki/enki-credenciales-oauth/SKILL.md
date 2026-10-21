---
name: enki-credenciales-oauth
description: >-
  Gestionar credenciales y OAuth en Enki POR EVENTOS (credential-manager /
  credential-oauth) — la directiva del dueño: "eso lo gestionamos con
  credential-manager y sus eventos". Cubre el PITFALL CRÍTICO del .env reescrito
  por credential-manager (nunca parchear a mano), la cascada store→env, y el
  flujo completo para dejar un canal OAuth (Gmail/cartero) disponible:
  oauth_config.create → invalid_grant → reautorizar en navegador →
  redirect_uri_mismatch → BASE_URL + Google Cloud Console. Úsala cuando un
  canal autenticado (correo, Telegram, lo que sea) falle con error_autenticacion,
  invalid_grant, redirect_uri_mismatch o "No OAuth config found", o al dar de
  alta credenciales nuevas.
when-to-use: >-
  cartero.verificar → error_autenticacion / invalid_grant / No OAuth config
  found. Un canal autenticado deja de funcionar tras un deploy. Hay que dar de
  alta o rotar credenciales (clientId/clientSecret/refresh token). El dueño
  dice "gestionamos las credenciales con credential-manager y sus eventos".
source: hermes
tags: [enki, oauth, credenciales, credential-manager, gmail, cartero, eventos, .env]
---

# Credenciales y OAuth en Enki — por eventos, nunca parcheando el .env

## La directiva (del dueño, 17-ago-2026)

> "Eso lo gestionamos con credential-manager y sus eventos."

Cuando un canal autenticado falla por credenciales, la respuesta NO es editar
`/opt/enki/data/.env` a mano — es operar por los eventos del credential-manager /
credential-oauth. Los eventos hacen las acciones (filosofía Enki).

## PITFALL CRÍTICO — el .env es un REFLEJO del store, no un archivo libre

**Pagado en vivo (17-ago-2026)**: se añadieron `GMAIL_CLIENT_ID_noninapizzicas` +
`GMAIL_CLIENT_SECRET_noninapizzicas` al .env con `echo >>` (verificado en disco, líneas
24-25). Minutos después, el chat creó una config OAuth por evento → `credential-manager
.env.saved { credentials_count: 14 }` → **las líneas añadidas a mano DESAPARECIERON**.

**Mecanismo** (credential-manager/index.js `_loadEnvFile`): el credential-manager lee el
.env al arranque, guarda las `*_API_KEY_*` en su store, y en cada guardado
(`credential-manager.env.saved`) **REESCRIBE el .env desde su store** — todo lo que no
está en el store (variables añadidas a mano, comentarios) se pierde.

**Regla**: las credenciales viven en el STORE del módulo que las consume (ej.
`data/projects/<p>/storage/credential-oauth/oauth-configs.json`), no en el .env. El .env
solo es para lo que el credential-manager conoce (API keys globales). Añadir secretos al
.env a mano es trabajo perdido.

**MATIZ CRÍTICO — qué persiste y qué no en el .env** (verificado 17-ago): el
credential-manager guarda en su store SOLO las variables cuyo nombre contiene `_API_KEY_`
(o termina en `_API_KEY`). Por eso `TELEGRAM_API_KEY_CUSTOM_<botName>` SÍ persiste (los
bots de Telegram aguantan deploys), pero `GMAIL_CLIENT_ID_*` / `GMAIL_CLIENT_SECRET_*` /
refresh tokens sin sufijo `_API_KEY_` NO entran en el store → se pierden en el primer
`env.saved`. Para saber si una variable sobrevivirá: ¿su nombre matchea `_API_KEY_`? Si
no, gestionarla por el módulo que la consume (store propio), nunca en el .env.

## El modelo MULTI-TENANT de niveles (verificado 19-ago-2026)

El credential-manager (core) gestiona credenciales por **5 niveles** de alcance:
`GLOBAL` · `PROJECT` · `CLIENT` · `CUSTOM` · `BOT`. La clave canónica es
`<PROVIDER>_API_KEY_<LEVEL>[_<id>]`:
```
<PROVIDER>_API_KEY_GLOBAL              ← sin tenant (una key para todo)
<PROVIDER>_API_KEY_PROJECT_<slug>      ← por proyecto
<PROVIDER>_API_KEY_CLIENT_<id>          ← por cliente
<PROVIDER>_API_KEY_CUSTOM_<id>          ← por usuario/custom (ej. bots Telegram)
```
**Cascada de resolución** (`_resolveCredential`, credential-manager/index.js):
`CUSTOM` → `CLIENT` → `PROJECT` → `GLOBAL` → legacy `<PROVIDER>_API_KEY` (sin nivel).

**Qué nivel usar lo decide la NATURALEZA del secreto, no la preferencia**:
- **Credencial del DUEÑO que sirve a todos** (Ollama Cloud, DeepSeek, OpenAI,
  Gmail/cartero cuenta `default`) → nivel **GLOBAL** — una key, todos los proyectos.
- **Credencial POR NEGOCIO** (cada proyecto/cliente tiene la suya) → nivel
  `PROJECT`/`CUSTOM` (ej. bot de Telegram `CUSTOM_<botName>`, Glovo `PROJECT_<slug>`).
- **`PROJECT_ONLY_PROVIDERS`** (`META_WHATSAPP`, `META_WHATSAPP_VERIFY_TOKEN`,
  campos de Glovo): se exige nivel PROJECT y **NO caen a GLOBAL** — un token
  global mezclaría negocios (aislamiento real). Ollama NO está ahí → se resuelve GLOBAL.

**PITFALL — el credential-manager solo sirve a los módulos del CORE.** Verificado
19-ago: aunque des de alta `OLLAMA_API_KEY_GLOBAL` aquí (y el provider ollama del
ai-gateway lo resuelva como `credential-manager.resolved {provider:ollama,
resolvedFrom:GLOBAL}`), esto NO llega al **gateway Hermes** que responde los chats de
proyecto — ese es un proceso aparte que lee SU `config.yaml` + `.env` en
`/home/hermes/.hermes/`. Dos circuitos de credenciales separados (core vs chat):
para el chat la key va en el config del worker vía reconcile, NO en el
credential-manager. Ver skill `hermes-enki-integracion`.

**Verificación de qué hay dado de alta** (sin tocar valores):
`curl -s http://localhost:3000/modules/credential-manager/credentials` → lista
`{key, provider, level, identifier, preview}`. Es la ruta HTTP del credential-manager
(`module.json → apis[]` → `/modules/credential-manager/credentials`); el `/health` de
este módulo da 500 (devuelve `status:'ok'` inválido) — usar `/credentials`, no /health.

## La cascada de resolución de credential-oauth

`_resolve` (sirve a provider-loader local.gmail): **store del módulo primero**
(oauth-configs.json) → **.env después** (por accountId probados). Si el store tiene la
config (clientId+clientSecret) y el .env tiene el refresh token, el canal funciona.

## Flujo completo para dejar un canal OAuth disponible (verificado 17-ago)

1. **Crear la config OAuth por evento** (el chat lo hace por MCP — los reflejos sin tools
   solo se invocan desde dentro del core; el canal del dueño no tiene la tool):
   ```
   credential.oauth_config.create.request { accountId, accountName, clientId, clientSecret }
   → persiste en storage/<proyecto>/credential-oauth/oauth-configs.json (el deploy NO lo barre)
   ```
2. **Si el refresh token da `invalid_grant`**: el par clientId/secret no corresponde al
   token, o el secret se regeneró (regenerar un secret REVOCA los refresh tokens emitidos
   con el anterior). **No hay truco: hay que reautorizar una vez** en el navegador:
   `credential.oauth.start.request` → auth_url → el dueño autoriza → callback →
   refresh token NUEVO guardado vía credential-manager.
3. **Si da `redirect_uri_mismatch`**: el módulo genera la redirect_uri desde
   `process.env.BASE_URL` (fallback `http://localhost:3000`). Fix:
   - `BASE_URL=https://<dominio>` en el .env + restart
   - Registrar la URI pública EXACTA en Google Cloud Console → Credenciales → app OAuth →
     **"URIs de redireccionamiento autorizadas"** (NO "Orígenes autorizados de JavaScript",
     que solo acepta el origen sin ruta — error típico: "Los URI no deben contener una ruta").
   - El callback llega por el proxy: en el VPS, Caddy enruta `/modules/*` → localhost:3000
     (verificado: HTTP 400 en el callback = ruta viva esperando `code`).
4. **Verificar por eventos**: `cartero.verificar.request` → `disponible`, o envío de
   prueba por `cartero.enviar.request` — el circuito canónico, nunca scripts sueltos
   contra la API (directiva: "por eventos").

## Diagnóstico directo con Gmail API (SOLO para aislar, no para enviar)

Con client_id + client_secret + refresh token se puede pedir access token y llamar a la
API — útil para distinguir "credenciales rotas" de "módulo roto":
- POST `https://oauth2.googleapis.com/token` (grant_type=refresh_token) → access_token
  (400 invalid_grant = token no válido para ese par; 200 = credenciales OK)
- Send: POST `https://gmail.googleapis.com/gmail/v1/users/me/messages/send` con body
  **JSON** `{'raw': base64}` + Content-Type application/json — form-urlencoded da 400
  "'raw' RFC822 payload message string ... required" (pagado en vivo).

## Pitfalls acumulados

- **"No OAuth config found for account: default" con `configured:true` pero SIN refreshToken**
  (verificado 19-ago): un `oauth-configs.json` puede tener `clientId` + `clientSecret` +
  `configured:true` pero **sin `refreshToken`** → `getAccessToken` lanza
  `Missing OAuth credentials` y el envío (gmail_send / cartero) falla, aunque el journal
  muestre `gmail_send.status 200` (el evento se publica; la credencial no resuelve).
  **El store con los IDs/secrets NO basta** — el `refreshToken` es lo que falta y solo lo
  genera el paso de CONSENTIMIENTO/autenticación del usuario. Verificar en el
  `oauth-configs.json`: ¿tiene campo `refreshToken`? Si no, hay que completar la
  reautorización (navegador), no re-verificar el circuito.
- **Copiar `oauth-configs.json` entre proyectos NO añade el refreshToken** (pagado
  en vivo 19-ago, proyecto f copió el de b y solo cambió el `_updated`): los dos
  quedan con `clientId`+`clientSecret`+`configured:true` pero SIN `refreshToken`, así
  que el envío sigue fallando igual. Copiar una config incompleta no la completa; el
  dato que falta (refreshToken) solo lo produce la reautorización en navegador, y va
  al credential-manager (por evento), no a duplicar JSON. Reiniciar el core recarga la
  config pero no añade el token ausente — el fallo persiste. Regla: cuando una config
  copiada/duplicada no arregla el envío, el problema es el refreshToken, no el arranque.
- **Para añadir un provider LLM nuevo con sus modelos (p.ej. Ollama)**, la organización
  completa es de 3 capas (clase provider → config.providers en module.json del
  ai-gateway → credencial aquí) — ver skill `enki-ai-gateway-providers`.
- **El bot de Telegram** usa `TELEGRAM_API_KEY_CUSTOM_<botName>` — ver skill
  `telegram-por-proyecto` para el flujo completo de alta/vinculación.
- **Los eventos `credential.oauth.*` y `oauth_config.*` no son tools del portal** — el
  portal responde `404 RESOURCE_NOT_FOUND: tool no encontrada`. Los invoca el chat por
  MCP (dentro del core) o un módulo interno.
- **Al reautorizar**, el navegador debe poder llegar a la redirect_uri: con BASE_URL
  público + URI registrada en Google, cualquier equipo vale (el callback vuelve al VPS
  por el dominio). Sin BASE_URL, localhost apunta al equipo que autoriza → falla.
- **"Proveedor respondió sin messageId (sin ack)"** (bug del cartero cazado 18-ago):
  `cartero.enviar.request` puede devolver `{ ok:false, estado:FALLIDO, detalle:"Proveedor
  respondió sin messageId" }` **aunque el correo SÍ se haya enviado** (verificado: el
  dueño lo recibió). Es un bug de CONTRATO del circuito (el provider no devuelve el id),
  no del canal — no reenviar ni reautorizar; diagnosticar el contrato antes. El envío
  real por el circuito canónico (`cartero.enviar.request` vía MCP) es la verificación
  final del canal — el correo de prueba con chiste del 18-ago llegó a la bandeja.
