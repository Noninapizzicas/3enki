# tienda-api — mapa de eventos (PASO 0)

> Sin mapa no se toca el módulo. Validado con el operador 2026-05-26
> (delegación: "lo dejo en tus manos la opción que se adapte a patrones
> y filosofía del sistema"). Listo para PASO 1 (declarar `module.json`).

## 1. Identidad

- **Slug**: `tienda-api`
- **Ubicación**: `modules/tienda-api/` (raíz, como `whatsapp-bot`).
- **Description oficial**: "Canal HTTP de pedidos web — recibe POST
  desde la PWA generada por comandero-cliente-builder y emite
  pedido.crear-tienda al bus. Tipo modulo_de_canal del contrato
  extensibilidad-modular, simétrico a whatsapp-bot pero para canal
  web. Stateless: ningun pedido persiste aqui — pizzepos/pedidos es
  el dueno del estado."
- **Language**: `es`.
- **Naturaleza**: `modulo_de_canal` según
  `extensibilidad-modular.contract`. "Adaptador entre el exterior y el
  bus interno: recibe del canal, publica al bus".
- **Por qué módulo nuevo y no extender uno existente**: `whatsapp-bot`
  es específico de Meta Cloud API (webhook signing, parser de formato
  WhatsApp). `channel-manager` es un registry. No hay overlap. El
  sistema YA prevé multi-canal (`pedido.crear-tienda.canal_origen ∈
  {whatsapp, web, manual}`); falta la pieza simétrica para `web`.

## 2. Eventos publicados

| evento | cuándo | payload mínimo | fase |
|---|---|---|---|
| `pedido.crear-tienda` | request HTTP POST validada → emite al bus para que `pizzepos/pedidos` cree el pedido | shape canónico de `pedido.crear-tienda` (sec. 4) + `request_id` + `correlation_id` | 6a |

**Verbo**: el "evento" `pedido.crear-tienda` es realmente una
invocación de operación por bus (par `pedido.crear-tienda` /
`pedido.crear-tienda.response`). Heredado del shape que `whatsapp-bot`
ya emite — preservación de evento canónico (no se inventa shape nuevo
ni verbo nuevo).

**`correlation_id`**: tienda-api lo genera al recibir el POST (es el
originador para la cadena causal). Se devuelve al cliente en el
response HTTP para que pueda trazarlo en logs si reporta un problema.

## 3. Eventos escuchados

| evento | emisor | qué hace |
|---|---|---|
| `pedido.crear-tienda.response` | `pizzepos/pedidos` | response correlacionado por `request_id`. Resuelve la promesa pendiente y se devuelve al cliente HTTP. |

Stateless aparte de la `Map<request_id, pendingPromise>` que se limpia
cuando llega la response o cuando expira el timeout.

## 4. APIs HTTP

| método | path | handler | descripción |
|---|---|---|---|
| `POST` | `/tienda/pedido/:project` | `handlePedidoPost` | Recibe pedido del cliente final, lo emite al bus, devuelve confirmación con `pedido_id` o error. |
| `OPTIONS` | `/tienda/pedido/:project` | `handlePedidoOptions` | CORS preflight permisivo (`Access-Control-Allow-Origin: *`). |
| `GET` | `/health` | `handleHealthCheck` | Health check del módulo. |

**Path patrón**: idéntico al `whatsapp-bot` que usa
`/whatsapp/webhook/:project`. Consistencia cross-canal.

**Body del POST**: shape canónico de `pedido.crear-tienda` SIN el
campo `project_slug` (viene del path) ni `canal_origen` (lo fija el
módulo a `'web'`). El handler hace merge antes de publicar al bus.

**Validación**: AJV strict contra el JSON Schema del payload de
`pedido.crear-tienda` (extraído de `pizzepos/pedidos/module.json`).
Errores → response HTTP 400 con `{ status, error: { code, message,
details: { field } } }`.

**CORS**: permisivo (`origin: *`). Razón: la PWA del cliente se
sirve desde subdominio del proyecto (`vapers.enki-ai.online`) y la
API vive en el dominio principal del sistema (`enki-ai.online`) —
cross-origin obligado. No hay datos sensibles a proteger contra
cross-origin: el endpoint solo crea pedidos para un `project_slug`
público y el sistema downstream valida que el proyecto existe.

## 5. Tools del LLM

Ninguna en v1. Razón: el LLM no necesita crear pedidos directamente
— ese es el rail del cliente final, no de operadores. Si emerge la
necesidad (ej: agente que crea pedidos de prueba para QA), se añade
después. YAGNI hoy.

## 6. Persistencia

Ninguna. El módulo es completamente stateless. La única estructura
en memoria es `Map<request_id, { resolve, reject, timer }>` para
correlacionar request HTTP con response del bus. Se limpia al
resolver o al expirar el timeout. NO persiste a disco.

## 7. Modos de fallo

| fallo | comportamiento |
|---|---|
| Body inválido (campo faltante, tipo erróneo, items vacío) | HTTP 400, `error.code: INVALID_INPUT`, `details.field` |
| `pizzepos/pedidos` rechaza (proyecto no existe, etc.) | propaga el error del bus al cliente HTTP con su `status` y `error.code` originales |
| `pedido.crear-tienda.response` no llega en `tool_timeout_ms` (default 30s) | HTTP 504, `error.code: UPSTREAM_TIMEOUT` |
| Bus desconectado | HTTP 503, `error.code: UPSTREAM_UNREACHABLE`, `details.kind: 'broker'` |

**Cumple `errors.contract`**: codes del catálogo cerrado, sin stack
traces en payload, sin secretos.

## 8. Relación con otros módulos

- **`pizzepos/pedidos`**: receptor del bus. Cero acceso directo,
  solo evento `pedido.crear-tienda` + correlación de su response.
- **`whatsapp-bot`**: módulo gemelo simétrico (mismo evento al bus,
  canal distinto). Cero acoplamiento entre ambos canales.
- **`comandero-cliente-builder`**: genera el bundle PWA que `fetch`-ea
  a este endpoint. Acoplamiento por contrato HTTP, no por código.
- **`project-manager`**: tienda-api NO valida que el `project_slug`
  exista — lo pasa tal cual al bus y deja que `pizzepos/pedidos` lo
  rechace si no existe. Mantiene tienda-api stateless.

## 9. Lo que NO está en este módulo (y por qué)

- **Autenticación del cliente final**: no hay login. El cliente
  visita la PWA, añade items, envía pedido con nombre + teléfono.
  Mismo nivel de auth que pedir por WhatsApp o por teléfono.
- **Validación de teléfono real / SMS verification**: fuera de
  scope v1. Si se quiere, módulo aparte que medie entre tienda-api
  y pizzepos/pedidos.
- **Rate-limiting por IP**: fuera de v1. Si emerge abuso, se añade
  en gateway o en módulo intermedio. Sin él, `pizzepos/pedidos` es
  el último filtro.
- **Verificación de mayoría de edad para vapers**: el campo
  `mayor_edad_confirmado` es opcional en el shape de
  `pedido.crear-tienda`. El módulo `verificacion-edad` (Fase 5
  cerrada) lo gestiona — tienda-api solo pasa el valor que viene
  del cliente.
- **Notificación al cliente cuando el pedido está listo**: ese
  rail es de `whatsapp-bot` o de email — no de tienda-api.

## 10. Tests

- Group 1 Lifecycle: `onLoad` setup, `onUnload` limpia `pendingRequests` Map + cualquier timer.
- Group 2 Validación canónica: body sin items, sin total, con canal_origen incorrecto, item con cantidad 0 → 400.
- Group 3 Success path: body válido + publish observado + response del bus → 200.
- Group 4 Errores downstream: response con error → propaga al cliente con mismo `error.code`.
- Group 5 Timeout: no llega response → 504 con `UPSTREAM_TIMEOUT`.
- Group 6 CORS: OPTIONS responde con headers correctos.
- Group 7 Helpers POC2.

Wireo: `test:tienda-api` en `package.json` + `.github/workflows/validate.yml`.

## 11. Decisiones cerradas (2026-05-26)

- **Slug y ubicación**: `tienda-api` en raíz (tipo `modulo_de_canal`).
- **Stateless**: sin persistencia, sin tablas, sin JSON-file-per-project.
- **Eventos preservados**: emite `pedido.crear-tienda` (mismo shape
  que ya emite `whatsapp-bot`), sin inventar eventos nuevos.
- **CORS permisivo origin: ***: la PWA y la API viven en dominios
  distintos por diseño. Sin datos sensibles cross-origin.
- **Sin tools del LLM en v1**: YAGNI.
- **Validación AJV strict** del body contra shape de
  `pedido.crear-tienda` (mismo schema que el handler de
  `pizzepos/pedidos` usa).
- **Project resolution**: tienda-api no valida `project_slug` —
  delega a `pizzepos/pedidos` que es el dueño del state.

## Plan de implementación (PASO 1 → PASO 2)

1. **PASO 1**: `module.json` declarando `apis` + `events.publishes` +
   `events.subscribes` (vacío salvo `pedido.crear-tienda.response`) +
   `config.tool_timeout_ms` + `observability.metrics`. Validar
   naming/glossary/tools/events.
2. **PASO 2**: `index.js` POC2 (~200-300 LOC):
   - `extends BaseModule`
   - 5 secciones canónicas con banners
   - `onLoad` / `onUnload` que limpian `pendingRequests`
   - `handlePedidoPost` / `handlePedidoOptions` / `handleHealthCheck`
   - `onPedidoCrearTiendaResponse` (correlación por request_id)
   - 5 helpers POC2 heredados de BaseModule
   - 1 helper auxiliar de dominio (e.g. `_publishAndWaitForResponse`)
3. **PASO 3**: `tests/unit/tienda-api.test.js` con 7 grupos.
4. **PASO 4**: `validate:ci` PASS, commit + push.

Solo después de cerrar `tienda-api` se vuelve al PASO 2 del
`comandero-cliente-builder` (su bundle `fetch`-eará al endpoint de
`tienda-api` ya existente, lo que permite tests end-to-end reales).

## Orden recomendado de implementación de Fase 6a

1. **tienda-api** (este mapa, módulo más pequeño y simple) → PASOS 1-4.
2. **comandero-cliente-builder** (mapa hermano ya cerrado) → PASOS 2-4
   (PASO 1 ya hecho en `97e0659`).
