# credential-manager — Plan de descomposición

Plan multi-sesión para descomponer el monolito de 2835 LOC en módulos canónicos. Esta nota es el **mapa operativo** para las sesiones siguientes — cuando arranques una de ellas, lee primero esto.

## Estado actual (2026-05-04)

- **Sesión 1** (este commit): `credential-manager` core reescrito al canon (~600 LOC).
- **Sesión 2** (pendiente): `credential-tester` (los 7 test methods).
- **Sesión 3** (pendiente): `credential-oauth` (OAuth flow + config CRUD).
- **Sesión 4** (pendiente): `credential-vendor-glovo` + `credential-vendor-telegram`.

Total estimado tras descomposición: ~1500-1700 LOC en 4 módulos, vs 2835 monolíticos.

## Lo que el core (sesión 1) cubre

`modules/credential-manager/index.js` (canon ~600 LOC) ofrece:

- **CRUD** de credenciales: `handleUI{List,Get,Create,Update,Delete}` + handlers HTTP equivalentes.
- **Resolución cascada** `CUSTOM → CLIENT → PROJECT → GLOBAL`: `onResolveRequest` (escucha `credential.resolve.request` y publica `credential.resolve.response`).
- **Eventos publicados** (canónicos, sin cambios): `credential.saved`, `credential.deleted`, `credential.updated`, `credential.resolve.response`.
- **Persistencia .env** atómica (tempfile + rename).
- **Tool del LLM**: `credential.list` (no expone keys, solo metadata + preview enmascarado).
- **5 helpers privados canónicos** (transferibles del POC2 scheduler): `_errorResponse`, `_handleHandlerError`, `_classifyHandlerError`, `_publicarEvento`, `_fetchWithTimeout` (este último heredado para uso futuro).

**Lo que ai-gateway necesita** (`credential.resolve.request`) **funciona sin cambios**. El LLM y agentes no se enteran de la descomposición.

## Lo que dejó de funcionar en runtime tras sesión 1

Los siguientes flujos **NO ESTÁN OPERATIVOS** hasta que se complete la descomposición:

1. **Test de credenciales** (`mqttRequest('credential', 'test', { provider, api_key })`) — el frontend que tenga botón "Validar API key" verá error.
2. **OAuth de Gmail** (`mqttRequest('credential', 'oauth.start')` y endpoint HTTP `/oauth/callback`) — flow de OAuth roto temporalmente. **Aviso**: si dependes de Gmail OAuth para algún flujo activo, restaurar el legacy parcialmente.
3. **Glovo config CRUD** (`mqttRequest('credential', 'glovo.save')`, `glovo.delete`) — UI de Glovo en frontend muestra error.
4. **Telegram notifications config** (`mqttRequest('credential', 'telegram_notif.save')`, `delete`) — UI de notifs Telegram muestra error.

**Si estas funcionalidades son críticas, restaurar antes de continuar:**
```bash
# Solución temporal: restaurar el monolito
cp arquitectura/migracion/_legacy/credential-manager-monolito-pre-descomposicion.js.bak modules/credential-manager/index.js
# Y volver al module.json antiguo (git checkout)
```

El monolito original está preservado en `_legacy/` para referencia y emergencia.

## Sesión 2 — `credential-tester`

**Objetivo**: módulo dedicado a validar API keys contra cada provider.

**Path**: `modules/credential-tester/`

**Eventos canónicos**:
- Subscribe: `credential.test.request { request_id, provider, api_key }` (nuevo evento).
- Publish: `credential.test.response { request_id, provider, valid, message?, latency_ms }`.
- Publish: `credential.test.failed { request_id, provider, error: { code, message } }`.

**Métodos a migrar del legacy** (`_legacy/monolito-pre-descomposicion.js.bak`):
- `testDeepSeek` (línea ~2463)
- `testOpenAI` (~2478)
- `testAnthropic` (~2493)
- `testGroq` (~2516)
- `testGemini` (~2531)
- `testGmail` (~2547) — caso especial: usa GMAIL_CLIENT_ID/SECRET de env, refresh token en lugar de API key.
- `testCloudflare` (~2593) — caso especial: verifica permissions del token.

**Helpers canónicos**:
- `_fetchWithTimeout(url, options, timeout_ms)`: AbortController + log + metric.
- Cada testProvider envuelve fetch en este helper. Cierra los 7 drifts de `fetch_without_timeout` + 7 de `no_telemetry_on_http_client_call`.

**Dispatcher**: `onCredentialTestRequest` que rutea a `testProvider` correcto según `provider`.

**Tests**: `tests/unit/credential-tester.test.js` con mocks de fetch para cada provider.

**Wire**: package.json + workflow.yml + el frontend cambia su mqttRequest de `('credential', 'test')` a `('credential-tester', 'test')` o publica `credential.test.request` directamente.

**Estimación**: 1 sesión, ~250 LOC.

## Sesión 3 — `credential-oauth`

**Objetivo**: gestionar el flujo OAuth completo (start, callback, status) y la persistencia de configs OAuth (client_id, client_secret, redirect_uri por provider).

**Path**: `modules/credential-oauth/`

**Eventos canónicos**:
- Subscribe: `credential.oauth.start.request { request_id, provider, project_id }`.
- Publish: `credential.oauth.start.response { request_id, auth_url, state }`.
- Subscribe: `credential.oauth.status.request { state }`.
- Publish: `credential.oauth.status.response { status, refresh_token?, error? }`.
- HTTP endpoint: `GET /oauth/callback?code=...&state=...` (handler único).

**CRUD config**:
- `credential.oauth_config.create.request` con shape canónico.
- `credential.oauth_config.list.request`.
- `credential.oauth_config.delete.request`.

**Métodos a migrar del legacy**:
- `onOAuthResolveRequest` (~593): handler del bus para refresh token → access token.
- `handleUIOAuthStart` (~1541): inicia flow.
- `handleUIOAuthStatus` (~1683): polling status.
- `handleUIOAuthConfigList/Save/Delete` (~1722-1812): CRUD de OAuth configs.
- `handleOAuthCallback` (~2142): callback HTTP.
- `renderOAuthResultPage` (~2279): página HTML de éxito/error.
- `cleanupPendingOAuth` (~2353): housekeeping de pending states.

**Storage**: `oauth-configs.json` por proyecto. El monolito ya tiene la estructura — copiar.

**Dependencia**: `credential-manager` (publica `credential.saved` cuando obtiene refresh_token tras callback exitoso).

**Tests**: tests/unit/credential-oauth.test.js cubriendo start (genera URL + state), callback (intercambia code por refresh_token), status (poll), CRUD configs.

**Estimación**: 1 sesión, ~500 LOC.

## Sesión 4 — `credential-vendor-glovo` + `credential-vendor-telegram`

**Objetivo**: dos módulos pequeños de adapters para credenciales multi-campo (NO simples API keys).

### `credential-vendor-glovo`

**Path**: `modules/credential-vendor-glovo/`

**Caso especial**: Glovo usa credenciales con shape `{ client_id, api_key, glovo_username }` por proyecto. NO encaja en el shape canónico simple `apiKey: string` de credential-manager.

**Eventos canónicos**:
- Subscribe: `credential.glovo.save.request { request_id, project_id, client_id, api_key, glovo_username }`.
- Publish: `credential.glovo.saved { project_id }`.
- Subscribe: `credential.glovo.delete.request { request_id, project_id }`.
- Publish: `credential.glovo.deleted { project_id }`.
- Subscribe: `credential.glovo.list.request` → response con configs (sin api_key, solo client_id + username).

**Storage**: `data/credential-vendor-glovo/configs.json` por proyecto.

**Métodos a migrar**:
- `handleUIGlovoSave` (~1860)
- `handleUIGlovoDelete` (~1918)
- `getGlovoConfigs` (~1958)

**Estimación**: ~150 LOC.

### `credential-vendor-telegram` (notifications config)

**Path**: `modules/credential-vendor-telegram/`

**Caso especial**: configs de notificaciones (chat_id + bot_name + template) por proyecto. Distinto de las credenciales del bot mismo (que viven en credential-manager core como Telegram bot token).

**Eventos canónicos**:
- `credential.telegram_notif.save.request`
- `credential.telegram_notif.delete.request`
- `credential.telegram_notif.list.request`

**Métodos a migrar**:
- `handleUITelegramNotifSave` (~2008)
- `handleUITelegramNotifDelete` (~2060)
- `getTelegramNotifConfigs` (~2097)

**Estimación**: ~150 LOC.

**Nota**: ambos módulos pueden hacerse en una sola sesión si se reusa el patrón.

## Criterios de cierre de la descomposición

La descomposición se considera **completa** cuando:

- [ ] Sesión 1: `credential-manager` core canónico — drifts del módulo bajan ≥70%, tests verdes.
- [ ] Sesión 2: `credential-tester` operativo, frontend test panel funciona.
- [ ] Sesión 3: `credential-oauth` operativo, Gmail OAuth flow funciona, configs OAuth se guardan.
- [ ] Sesión 4: Glovo + Telegram operativos.
- [ ] `_legacy/monolito-pre-descomposicion.js.bak` se elimina (tras verificar que cada feature funciona en su nuevo módulo).
- [ ] Roadmap regenerado: 4 entradas nuevas (credential-manager, credential-tester, credential-oauth, credential-vendor-glovo, credential-vendor-telegram) reemplazan la única entrada del monolito.
- [ ] `companero-viaje.contract.mapa_al_sistema_actual` actualizado para reflejar los 4 módulos.

## Llamadas a la acción para la próxima sesión

Si arrancas la sesión 2 (`credential-tester`):

1. Leer este documento entero.
2. Leer `_legacy/monolito-pre-descomposicion.js.bak` líneas 2463-2640 (los 7 test methods).
3. Crear `modules/credential-tester/` desde plantilla `modules/_template/`.
4. Implementar `_fetchWithTimeout` en el index.
5. Migrar los 7 testProvider con timeouts + telemetría.
6. Tests con mocks de fetch.
7. Cambiar el `handleUITest` del frontend para apuntar a `credential.test.request`.
8. Eliminar las referencias a test* del legacy en este punto.
9. Regenerar PROGRESO.md.

Si arrancas la sesión 3 (`credential-oauth`): igual, leer las líneas indicadas del legacy y seguir el mismo patrón.
