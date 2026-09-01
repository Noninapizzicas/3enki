---
name: enki-ai-gateway-providers
description: >-
  Cómo se organizan y se añaden/reparan los PROVIDERS y MODELOS de LLM en el
  ai-gateway de Enki (modules/conversacion/ai-gateway). Las 3 capas: clase
  provider (providers/<nombre>-provider.js), config+modelos (module.json →
  config.providers.<nombre>), credencial (credential-manager → <PROVIDER>_API_KEY).
  Incluye el flujo de selección MANUAL por conversación (ConfigTab) que el dueño
  exige, el espejo hardcodeado del frontend (que se desincroniza), y la
  verificación determinista contra el endpoint real antes de cualquier PR.
  Úsala para añadir un provider nuevo, arreglar uno roto (p.ej. ollama), o cuando
  los modelos del desplegable no coinciden con la realidad.
when-to-use: >-
  Añadir o reparar un provider LLM en ai-gateway. Los modelos del desplegable
  (ConfigTab/ProviderPanel) están desincronizados con la config o con el catálogo
  real del proveedor. Un provider da 'sin credencial' o 404. El dueño quiere
  seleccionar provider/modelo por conversación.
source: hermes
tags: [enki, ai-gateway, providers, llm, modelos, credential-manager, ollama]
---

# Providers y modelos LLM en ai-gateway — las 3 capas

## ⚠️ DOS CAMINOS DE RESPUESTA — el ai-gateway NO sirve el chat de proyecto (verificado 19-ago)

Hay **dos caminos distintos** en Enki para responder, y cada uno saca la key de un sitio diferente. No confundirlos o se vende una solución que no arregla lo pedido:

| | Camino ai-gateway (blueprints, agentes, módulos internos) | Camino CHAT de proyecto (lo que falla) |
|---|---|---|
| Quién responde | ai-gateway con sus providers (ollama ya configurado) | `hermes-relay` → `:8642` → **gateway Hermes** |
| De dónde saca la key | **credential-manager** (por eventos `credential.resolve.request`) | **el `.env` / config del gateway Hermes** (usuario `hermes`) |
| ¿Le sirve un provider en credential-manager? | **SÍ** | **NO** |

**Consecuencia crítica**: añadir/arreglar un provider en el credential-manager (p.ej. Ollama Cloud) hace que esté disponible para el ai-gateway, **pero NO arregla los chats de proyecto** — esos van por `hermes-relay → :8642`, y el relay **ignora** el `settings.provider`/`model` de la conversación (verificado en `_callHermes`: siempre manda `model: this.config.hermes_model` fijo a `:8642`). Aunque la conversación declare `provider=ollama`, el relay no lo lee.

**Para arreglar los chats de proyecto hay que actuar sobre el gateway Hermes que escucha el `:8642`** (su provider/base_url/api_key), NO sobre el ai-gateway ni el credential-manager.

### El `:8642` lo sirve el gateway del usuario `hermes` (no el admin)
- `sudo lsof -i :8642` → PID del proceso `hermes` (usuario); config en `/home/hermes/.hermes/config.yaml` y `.env` (permisos: hay que usar sudo).
- En este VPS ese gateway estaba cableado a `deepseek`/`https://api.deepseek.com/v1` (sin saldo → `HTTP 402: Insufficient Balance`) mientras el canal admin (usuario `admin`) usa `custom`/`https://ollama.com/v1` (con saldo). **Mismo modelo `deepseek-v4-flash`, proveedor distinto** → el chat da 402 y el admin responde normal.
- Diagnóstico rápido: `hermes-relay.response {model:"hermes"}` en el journal = la respuesta vino de Hermes; mirar la config del gateway Hermes (usuario `hermes`), NO el provider de la conversación.
- Plantilla del gateway en `deployment/hermes-worker/config.yaml.tmpl` — si se toca, actualizar repo (rama `hermes/` + PR) y la config viva de `/home/hermes/.hermes/config.yaml`.
- El `OLLAMA_API_KEY` vive en `.env` de admin y de enki (no en el gateway hermes, que es por donde van los chats).

## Las 3 capas (fuente de verdad, verificada 18-ago-2026)

1. **Clase del provider** — `modules/conversacion/ai-gateway/providers/<nombre>-provider.js`
   - Extiende `BaseProvider`. Patrón de provider sano: `configure()` resuelve la
     key (`refreshApiKey()` → `credentialResolver` por eventos →
     `refreshApiKeyFromEnv()` → `process.env.<PROVIDER>_API_KEY`), `_authHeaders()`
     para el header (Bearer para OpenAI-compat/ollama; `x-api-key` para anthropic),
     y `_coerceModel()` para que conversaciones guardadas con modelos viejos caigan
     al `default_model` en vez de 404.
   - La clase se registra en `index.js` (mapa de clases ~línea 310). `_selectProvider`
     (~línea 336): nombre explícito → usa ESE provider SIN fallback (si no está
     disponible lanza error); `auto`/vacío → fallback por `priority`.

2. **Config + modelos** — `module.json` → `config.providers.<nombre>`
   - `{enabled, priority, api_base, headroom, default_model, models[]}`.
   - `default_model` DEBE existir en `models[]` (pitfall real: estaba
     `deepseek-v4-flash` que no existe en ollama).
   - Override en caliente por env: `AIGATEWAY_API_BASE__<NOMBRE>` (guiones→`_`,
     mayúsculas) redirige el api_base sin tocar config ni código (útil para
     proxies/headroom).

3. **Credencial** — credential-manager (resolución por eventos `credential.resolve.request`)
   - La key debe llamarse `<PROVIDER>_API_KEY` (o contener `_API_KEY_`): SOLO así
     persiste en el store y sobrevive al reescrito del `.env` (`env.saved`).
     Si no matchea el patrón, se pierde en el primer guardado — ver skill
     `enki-credenciales-oauth`.

## Modelo MULTI-TENANT de credenciales (cómo decidir el nivel — 19-ago)

El credential-manager es multi-tenant: **5 niveles** (`GLOBAL · PROJECT · CLIENT · CUSTOM · BOT`),
clave canónica `<PROVIDER>_API_KEY_<NIVEL>_<identifier>`, y **cascada de resolución**
`CUSTOM → CLIENT → PROJECT → GLOBAL → legacy <PROVIDER>_API_KEY`.

**Regla de decisión de nivel** (qué credencial dar de alta):
- **Del dueño y sirve a todos** (Ollama Cloud, DeepSeek, OpenAI, Gmail/cartero) → **GLOBAL**.
  Se da de alta UNA vez; cualquier proyecto sin la suya cae a GLOBAL por cascada.
- **Del negocio/cliente** (cada proyecto tiene la suya: Telegram bot, Glovo, WhatsApp)
  → **PROJECT / CUSTOM**, y está en `PROJECT_ONLY_PROVIDERS` = **sin caída a GLOBAL**
  (un token global mezclaría negocios; el aislamiento es el invariante).

Pitfall: `configured:true` en una config OAuth NO significa que sirva — si falta el
`refreshToken` el envío falla igual (ver enki-credenciales-oauth). Y para el **chat**
de proyecto el nivel del credential-manager es irrelevante (va por el gateway Hermes,
no por este módulo) — ver la sección "DOS CAMINOS DE RESPUESTA" arriba.

## Selección MANUAL por conversación (lo que exige el dueño)

Flujo: `ConfigTab.svelte` (conversación crear/editar) y `ProviderPanel.svelte`
(workspace) → `workspace.ts selectProvider()` → `chat.ts` mete
`settings.provider/model` en `conversation.send` → gateway
(`providerName ?? settings?.provider`) la usa explícita. Elegir provider =
SIN fallback automático. El dueño decide; el fallback solo aplica si no elige nada.

**PITFALL**: los dos desplegables del frontend son espejos HARDCODEADOS de
`module.json` (el comentario dice "fuente de verdad" pero son listas estáticas).
Al tocar `models[]` en la config hay que tocar LOS DOS `.svelte` o se desincronizan.

## PITFALL — `isAvailable()` NO comprueba SALDO, solo presencia de key (pagado 20-ago)

`base-provider.js isAvailable()` devuelve `true` si hay key y `enabled` — **aunque la
cuenta esté sin saldo**. En el fallback automático (`_selectProvider`, orden por
`priority`), un provider con key presente gana y luego en runtime da
`HTTP 402: Insufficient Balance`. Diagnóstico de un 402 en agentes/pipelines
internos del core: NO es credencial ausente ni OAuth — el fallback eligió un
provider con key pero sin saldo. `deepseek-anthropic` (priority 1, key en
credential-manager, cuenta sin crédito) atrapaba el fallback y los agentes fallaban
aunque `ollama` (cloud, priority 9, con saldo) estuviera disponible. Síntoma en
journal: `deepseek-anthropic.retry {HTTP 402 ...Insufficient Balance}` +
`ai-gateway.llm.failed`. Fix (config only): reordenar `config.providers` para que el
provider con saldo tenga priority ALTA (p.ej. `ollama` → 1, `deepseek-anthropic` →
9). El provider explícito por nombre sigue disponible aunque baje su priority — solo
cambia el fallback automático. Alternativa más robusta pero más cambio: validar
saldo dentro de `isAvailable` (llamada de prueba real).

**PITFALL del EMPATE de priority (pagado 20-ago): subir `ollama` a 1 NO basta si el
provider sin saldo se queda en el MISMO valor.** Tras subir `ollama` a 1, `deepseek-anthropic`
seguía en 1 → ambos `priority:1` → en el sort de `_selectProvider` (ordena por priority,
con el mismo valor gana por orden de entrada) deepseek seguía ganando y el agente interno
daba 402. El fix completo requiere **los dos**: `ollama → 1` (subir) Y `deepseek-anthropic → 9`
(bajar). Verificar en prod que NO quedan empatados:
`python3 -c "import json; d=json.load(open('/opt/enki/modules/conversacion/ai-gateway/module.json')); print({k:v['priority'] for k,v in d['config']['providers'].items() if k in ('ollama','deepseek-anthropic')})"` → debe dar `{'ollama': 1, 'deepseek-anthropic': 9}`. Un test de agente interno (`node scripts/audit-helpers/force-agent.js ...`) que antes daba `deepseek-anthropic.retry {HTTP 402}` es la confirmación de raíz.

## El provider `ollama` en prod es CLOUD, no local (verificado 20-ago)

`api_base: https://ollama.com`; la clase `ollama-provider.js` resuelve `OLLAMA_API_KEY`
(credential-manager → env → fallback `'local'` sin key), `mode: cloud` cuando hay key
real, `local` cuando `apiKey==='local'`. No "arreglar" las credenciales de Ollama si
ya están: `OLLAMA_API_KEY` + `OLLAMA_API_KEY_GLOBAL` (GLOBAL) + journal
`credential-manager.resolved {provider:ollama, resolvedFrom:GLOBAL}` = el provider
interno ya funciona. Verificar con
`curl localhost:3000/modules/credential-manager/credentials` (listado por nivel).

## Cómo crear un provider "Ollama Cloud" EXPLÍCITO en el credential-manager (20-ago)

Cuando el dueño quiere distinguir local de cloud en la UI, hay que tocar 4 piezas
(no solo la UI, y NO reinventar si ya está hecho):

1. **UI** (`frontend/src/lib/stores/credentials.ts` → `DEFAULT_PROVIDERS`): añadir
   `{ id: 'OLLAMA_CLOUD', name: 'Ollama Cloud', icon: '🦙' }` (y renombrar el `OLLAMA`
   a `Ollama (local)` si hace falta desambiguar). Es el desplegable del tab "Nuevo".
2. **Backend credential-manager** (`modules/credential-manager/index.js` → `PROVIDER_ICONS`):
   `OLLAMA_CLOUD: '🦙'` (sin esto el icono sale como 🔑 genérico).
3. **Provider ai-gateway** (`ollama-provider.js` → `refreshApiKeyFromEnv`): resuelve en
   orden `OLLAMA_CLOUD_API_KEY` / `OLLAMA_CLOUD_API_KEY_GLOBAL` → `OLLAMA_API_KEY(_GLOBAL)`
   → local. Así si el dueño pega la key como provider "Ollama Cloud", el ai-gateway la
   usa como cloud.
4. **Prioridad** (`module.json` → `config.providers.ollama.priority`): si además se quiere
   que el fallback elija Ollama, subirla (ver pitfall `isAvailable` arriba).

**Verificación de que la key quedó**: `curl localhost:3000/modules/credential-manager/credentials`
debe mostrar `OLLAMA_CLOUD_API_KEY_GLOBAL | level:GLOBAL` con preview. CUIDADO: el
preview de `OLLAMA` y `OLLAMA_CLOUD` puede ser el MISMO (`...GrGx`) si el dueño pegó la
misma key en ambos — no es un bug, es la misma cuenta de Ollama Cloud; no tocar.

**PITFALL re-aplicación**: el Guardian REVIERTE los cambios de config/provider que
prod aún no tiene (merge→[cron del Guardian]→deploy usa el repo revertido = cambio
perdido en silencio). Tras merge de estos 4 cambios, desplegar YA y verificar
`priority` en prod (ver skill hermes-enki-integracion, sección Guardian).

## Cómo trabajar con el dueño (pagado en vivo 18-ago)

- Si pide **REVISAR** cómo está organizado algo: entrega el MAPA corto y espera su
  decisión. NO instalar software, NO modificar, NO desplegar sin OK explícito
  (sesión liada: instalación de ollama bloqueada por el dueño + "Te as liado").
- El dueño decide con datos: tabla de opciones (modelo, tamaño, coste) y que
  elija. Preguntas de una en una, lenguaje llano.
- **CUANDO EL DUEÑO DA UNA ORDEN CLARA, EJECUTARLA — no volver a discutir (corrección
  20-ago)**: si Paco dice "haz lo que te digo" / "crea X" / "por qué no quieres
  trabajar", el problema es que repetí el mismo análisis (\"el credential manager ya
  está bien, no hace falta\") en vez de ejecutar. Regla: **una vez que el dueño ha
  decidido, ejecuto la instrucción literal sin volver a argumentar el porqué**.
  Si hay una discrepancia entre lo que pide y lo que existe (p.ej. él cree que falta
  crear el provider cuando ya está), lo ejecuto de todas formas (creo lo que pide,
  aunque duplique) y SOLO después, en una línea, anoto \"ya existía, he creado X
  explícito\". No convertir la discusión en un muro para no trabajar. El coste de
  hacer lo que pide es bajo; el coste de frenar al dueño con análisis repetido es
  frustración real (\"no te niegas a trabajar\").
- **No confundir \"REVISAR\" (analiza y espera) con \"CREA/HAZ\" (ejecuta)**. Si dice
  crea/mergea/despliega = ejecutar al momento, con rama+PR. Si solo pide revisar,
  entrega el mapa y espera.

## Verificación determinista ANTES del PR

Instanciar la clase del provider con la key real y llamar a `configure()` →
`chatCompletion()` → `chatCompletionStream()` contra el endpoint REAL (no mock).
Patrón de script en `references/ollama-cloud.md`. OJO providers de razonamiento:
el stream emite `thinking` antes que `content` — con `num_predict` pequeño (50)
el content llega vacío y parece roto; probar con presupuesto real (≥500) antes de
diagnosticar.

## Verificación en vivo tras el deploy (UI que "no cambia") — pagado 18-ago

**El frontend es un servicio APARTE**: `enki-frontend.service` (SvelteKit
adapter-node) en **:3001**; el core (`enki.service`) en :3000. Caddy: la raíz del
dominio → 3001; `/modules/*`, `/ui/*`, `/health` → 3000. El root del core devuelve
**404 (normal)** — no es señal de rotura.

- Deploy = `sudo ./deployment/vps-setup.sh <dominio>` — **lo ejecuta el dueño**
  (sudo pide password; el agente no puede). Rsync repo→/opt/enki excluyendo
  node_modules/.git/deployment/**data**/**public** (persisten .env, storage y
  PWAs); compila el frontend; **no reinicia** → restart manual de AMBOS servicios.
- El código en disco puede estar nuevo y la UI seguir vieja: adapter-node sirve el
  build desde memoria al arrancar → build nuevo + proceso sin reiniciar = UI vieja.

**Diagnóstico "no aparece X en la UI"** (orden):
1. `grep` disco: ¿código nuevo en /opt/enki/...?
2. `grep -rl "string" /opt/enki/frontend/build/` — ¿el build contiene el cambio?
   (los chunks van con hash; el HTML solo referencia nombres)
3. Comparar tiempos de arranque de **los DOS servicios** (`systemctl show enki
   -p ActiveEnterTimestamp`, idem enki-frontend) vs hora del build.
4. `curl` al puerto correcto (:3001) — no al root del core.
5. Todo ok en disco+servicios → **caché del navegador del dueño**: recarga
   forzada (Ctrl+Shift+R) / incógnito. No hay service worker en el build actual.

## Referencias

- `references/ollama-cloud.md` — contrato de la nube de Ollama (API nativa, auth
  Bearer, catálogo real vía /api/tags), el estado roto encontrado y el fix.
