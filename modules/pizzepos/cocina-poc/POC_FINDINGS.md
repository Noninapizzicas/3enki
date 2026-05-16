# POC cocina — hallazgos sobre los contratos

**Cuarto POC del repo**. Rewrite parcial del módulo `pizzepos/cocina` aplicando los 8 contratos arquitectónicos. Foco en el **patrón HTTP-server canónico** (`/modules/<slug>/<path>`) que ningún POC anterior tocó.

Subset reducido del original (1232 LOC → ~700 LOC + helpers). El POC mantiene la lógica esencial de agregador de eventos + HTTP-server + snapshot persistente, dejando fuera multi-device, sistema de pases, cuentaNombres, y demás.

---

## ✅ Lo que funcionó sin fricción

### 1. Routing canónico `/modules/cocina/<path>`

Cambio mínimo en `module.json`: pasar de `/cocina/activos` a `/modules/cocina/activos`. La regla del contrato `http` ya estaba escrita; aplicarla fue trivial. La auditoría va a saber a qué módulo pertenece cada endpoint sin abrir código.

### 2. `SnapshotStorage` con write atómico + debounce

Dos patrones que el original ya hacía pero entremezclados con la lógica de negocio. Aislarlos en un helper de ~180 LOC los convierte en API limpia:
- `read(default)` → graceful con ENOENT y JSON corrupto
- `saveDebounced(data)` → coalesce mutaciones rápidas en una sola escritura
- `flush()` → sincronico para `onUnload` (no perder mutaciones)
- `cancel()` → descarta pending sin escribir

El test "onUnload flushea snapshot pendiente sincronicamente" valida que mutaciones recién hechas (sin esperar al debounce de 1s) se persisten al cerrar el módulo. Es el bug más sutil de los snapshots debounced y aquí queda cubierto.

### 3. Códigos de error canónicos en handlers HTTP

`INVALID_INPUT`, `RESOURCE_NOT_FOUND` (con `entity_type` y `entity_id` en details), `CONFLICT_STATE`. El cliente del endpoint ve siempre el mismo lenguaje. Mismo patrón que ai-gateway-poc y carta-scheduler-poc — los códigos del catálogo de `errors v1.4.0` cubren todos los casos del módulo sin tener que inventar nuevos.

### 4. Telemetría obligatoria en cada handler

Pattern uniforme: cada handler emite `_emitMetric(...)` con sufijo canónico (`.total`, `.count`, `.duration`). El helper elige automáticamente entre `increment`/`gauge`/`timing` (API canónica de observability v1.1.0). Cero ambigüedad.

### 5. correlation_id se propaga al body de POST → publishes

`POST /modules/cocina/items/:id/preparar` con body `{ pedido_id, correlation_id }` propaga el correlation_id a los 3 eventos publicados (`item_preparando`, `item_preparado`, `pedido_listo` cuando aplica). Sin código adicional, gracias al helper `_publicarEvento(name, payload, sourcePayload=body)`.

### 6. Capacity limit declarado en config

`max_pedidos_activos: 500` en `module.json` — declaración explícita previene memory leak. Si la cocina recibe más pedidos de los que puede gestionar, el módulo emite warn + metric en lugar de crecer sin bound. El test "Capacity limit" lo valida.

---

## ⚠️ Fricciones y decisiones de POC

### F1 (POC4) — Cómo entran los handlers HTTP

El módulo declara `apis[*].handler: "handleGetActivos"` en `module.json`. **El gateway HTTP del core es responsable** de:
1. Recibir el request HTTP
2. Buscar el handler por nombre en la instancia del módulo
3. Llamarlo con `(req)` que tiene `params`, `body`, `query`, `headers`
4. Tomar el `{status, data | error}` que devuelve y escribirlo como response HTTP

El POC asume esa convención pero el contrato `http` no la formaliza. Cada módulo del repo podría inventarse otra firma (recibir `(req, res)` estilo express; recibir argumentos sueltos; etc.).

**Refinamiento propuesto al contrato `http`**: documentar explícitamente la firma del handler HTTP del módulo:
```
async handleX(req: { params, body, query, headers, project_id?, correlation_id? }): Promise<{ status, data } | { status, error }>
```
Sin esto, dos módulos pueden no ser interoperables con el mismo gateway.

### F2 (POC4) — `request_schema_ref` aún no aplicado

POC2 (F5) añadió `subscribes_declaration_shape` con `request_schema_ref` opcional. POC4 podría usarlo en cada `apis[*]` también — paralelo del contrato `http` ya tiene `apis_shape.campos` que mencionan `request_schema_ref`, pero ningún módulo del repo lo declara aún ni el gateway lo enforce.

El POC valida payloads manualmente con `_validate(payload, requiredFields)`. Funciona pero es duplicación: cada handler repite la validación.

**Refinamiento propuesto**: declarar request schemas por endpoint y que el gateway HTTP los enforce. Ejemplo en POC4:

```json
{
  "method": "POST",
  "path":   "/modules/cocina/items/:item_id/preparar",
  "request_schema_ref": "./schemas/preparar-item-request.json",
  "handler": "handlePrepararItem"
}
```

Si el body no valida → gateway responde 400 `INVALID_INPUT` automáticamente, el handler nunca se invoca.

Esto cierra el círculo: POC2-F5 (validación de eventos) + POC4-F2 (validación de HTTP requests) = misma disciplina aplicada a los dos canales de entrada.

### F3 (POC4) — `auth_required: "none"` declarado pero no enforce

El POC declara `auth_required: "none"` en cada endpoint. La auditoría lo ve. El validador `http` lo detecta. Pero **el gateway no actúa sobre ello** — es solo declarativo.

El siguiente paso es que el gateway HTTP central lea ese campo y aplique policies:
- `none` → público
- `mtls` → exige certificado de cliente válido (delegar a `certificate-authority`)
- `bearer` → exige header `Authorization: Bearer <token>`
- `basic` → exige header `Authorization: Basic <base64>`

**Refinamiento propuesto al contrato `http`**: añadir sección sobre cómo el gateway implementa cada `auth_required`. Hoy es declarativo sin acción. La declaración es media solución; falta la otra mitad (el gateway ejecutándola).

### F4 (POC4) — Snapshot `json-file` global vs proyecto

cocina es **single-tenant** (un solo restaurante por core). Su snapshot está en `./data/cocina/snapshot.json` global, no por proyecto. Esto es legítimo: cocina no necesita aislamiento por proyecto porque solo hay un proyecto activo a la vez en un dispositivo TPV.

Pero la convención no está escrita en ningún contrato. Comparado con carta-scheduler-poc (multi-tenant explícito con `json-file-per-project`), cocina-poc usa `json-file` simple. Las dos formas son válidas.

**Refinamiento propuesto al contrato `persistence`**: clarificar cuándo usar `json-file` vs `json-file-per-project`:
- `json-file`: módulo single-tenant (un único stream de datos para todo el core). Ej: cocina, log-manager.
- `json-file-per-project`: módulo multi-tenant (datos por proyecto/cliente). Ej: carta-scheduler, recetas, escandallo.

Decisión que el módulo declara explícitamente; el validador puede detectar mismatch (ej: módulo que recibe `project_id` en eventos pero declara `json-file` simple → posible drift).

### F5 (POC4) — `module_dependencies` con `interaction: "subscribe_only"`

Nuevo valor que apareció en POC4 que no estaba en POC3:
- POC3 usaba `interaction: "mqttRequest"` (cocina hace petición a otros)
- POC4 usa `interaction: "subscribe_only"` (cocina solo escucha; no llama)

Esto es información valiosa: la auditoría puede detectar si un módulo declara `subscribe_only` pero hace `mqttRequest` o `eventBus.publish` hacia ese módulo dependido — drift.

**Refinamiento propuesto al contrato `events`** (paralelo a F2 del POC3 que pedía `module_dependencies_shape`): formalizar los valores de `interaction`:
- `subscribe_only`: el módulo escucha eventos del dependido pero NO le habla
- `publish_only`: el módulo emite eventos que el dependido escucha (raro; usualmente `subscribe_only` invertido)
- `mqttRequest`: request/response sincronicos via bus
- `bidirectional`: subscribe + mqttRequest combinados

### F6 (POC4) — `historial` in-memory + persistido pero sin paginación

`GET /modules/cocina/historial` devuelve TODOS los items del array. Si `max_historial = 1000`, el response puede ser grande. No hay paginación.

Esto es deuda funcional aceptable para POC, pero el contrato `http` debería decir algo sobre listings:
- ¿Paginación obligatoria sobre cierto tamaño?
- ¿Forma canónica? (`?page=1&limit=50` o `?cursor=...`)
- ¿Header con totals (`X-Total-Count`)?

**Refinamiento propuesto al contrato `http`**: sección sobre listings (cuándo paginar, cómo nombrar params canónicos). Bajo prioridad — la mayoría de listings del repo son pequeños.

### F7 (POC4) — Validación de `req.params` vs `req.body` no estandarizada

El POC mezcla:
- `req.params.pedido_id` (URL path)
- `req.body.pedido_id` (POST body)
- `req.body.correlation_id` (POST body)

Funcionan pero la firma de `req` es contractual (cuando el gateway invoca al handler, ¿qué exactamente le pasa?). El contrato `http` no lo describe.

**Refinamiento propuesto al contrato `http`** (relacionado con F1): documentar el shape canónico de `req`:
```ts
{
  params:        Record<string, string>,    // del path: /:pedido_id
  body:          unknown,                    // body parseado (JSON)
  query:         Record<string, string>,    // querystring
  headers:       Record<string, string>,    // headers (Authorization redactado)
  project_id?:   string,                     // si aplica multi-tenant
  correlation_id?: string                    // si aplica
}
```

---

## 📋 Drift cerrado por el POC vs el original

| Drift en `cocina v3.1.0` | Cerrado por POC |
|---|---|
| Paths `/cocina/activos`, `/health`, `/metrics` (no canónicos) | ✓ `/modules/cocina/<path>` en todos |
| 4 publishes emitidos no declarados | ✓ Solo 3 publishes, todos declarados |
| Campo legacy `provides.events` y `provides.queries` en `module.json` | ✓ Eliminados |
| Snapshot path hardcoded `./data/current/cocina_snapshot.json` | ✓ Declarado en `config.persistence.data_path` |
| Sin `auth_required` en endpoints | ✓ `auth_required: "none"` explícito (válido para POC; producción usaría `mtls`) |
| Errores HTTP sin shape canónico | ✓ `{status, error: { code, message, details }}` con códigos del catálogo |
| Sin `max_pedidos_activos` declarado (memory leak posible) | ✓ Declarado en config + check en handler |
| Sin `module_dependencies` declarado | ✓ Declarado con `interaction: "subscribe_only"` (nuevo valor) |
| Sin telemetría en lifecycle | ✓ `lifecycle.loaded` / `.unloaded` + `pedidos_activos.count` (gauge) |
| `correlation_id` no propagado | ✓ Auto-extracted del body en publishes |

---

## 🔮 Lo que queda fuera del POC

- **Multi-device + paleta de colores**: cada cocinero con un color en items que ha tocado. Funcionalidad UX, no de contratos.
- **Sistema de pases multi-estación** (general / horno con `pase_minimo`): pipeline de items entre estaciones. Lógica de negocio compleja.
- **`cuentaNombres` cache** (subscribes a `cuenta.creada / actualizada / eliminada`): nombre canónico de la cuenta en el display.
- **`cocina.item_ticket`** (impresión de tickets de pieza individual al completar item): integración con perifericos.
- **`periferico.display`** (publish a pantallas externas TV/LED): lo mismo.
- **`/health`, `/metrics` endpoints**: cubiertos por contratos `lifecycle` y `observability` (el core central los expone a nivel sistema, no por módulo).

---

## ✍️ Próximos pasos recomendados

1. **F2** (request_schema_ref enforce en gateway HTTP) — alto impacto, cierra disciplina de validación de entrada.
2. **F1 + F7** (firma canónica de handler HTTP + shape de `req`) — chico pero crítico para interoperabilidad de módulos con el gateway.
3. **F3** (gateway implementa `auth_required` real) — crítico para producción.
4. **F4** (clarificar `json-file` vs `json-file-per-project`) — chico, alta utilidad para auditoría.
5. **F5** (formalizar valores de `interaction` en `module_dependencies`) — chico.
6. **F6** (listings con paginación canónica) — bajo prioridad.

Tras aplicar F1+F2+F3+F7, el patrón HTTP-server estaría completamente cerrado: routing canónico + validación declarativa + auth real + firma uniforme. Cocina-poc se podría promocionar a `cocina` real sin más cambios estructurales.

---

## 📊 Métricas del POC4

| Aspecto | Valor |
|---|---|
| Archivos creados | 5 (module.json, snapshot-storage.js, index.js, tests/cocina-poc.test.js, POC_FINDINGS.md) |
| Tests | 23 casos, 100% pasan |
| LOC totales | ~1500 (sin tests) |
| Drift cerrado vs original | 10 items |
| Findings detectados | 7 (F1-F7) |
| Patrones nuevos validados | HTTP-server canónico, snapshot single-tenant, agregador de eventos, capacity limit declarativo |
