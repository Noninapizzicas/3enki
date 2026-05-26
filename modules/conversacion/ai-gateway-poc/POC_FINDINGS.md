# POC ai-gateway — hallazgos sobre los contratos

Rewrite parcial del módulo `conversacion/ai-gateway` (deepseek-only) aplicando los **8 contratos arquitectónicos** (`naming`, `glossary`, `events`, `lifecycle`, `observability`, `errors`, `persistence`, `http`).

Es el segundo POC del repo, después de `notas-poc`. Sirve para validar los contratos sobre un caso real de **HTTP-client** con **credenciales event-driven** — la cara del sistema que `notas-poc` no tocó.

---

## ✅ Lo que funcionó sin fricción

### 1. Helper `_publicarEvento` propaga `correlation_id` automáticamente

```js
await this._publicarEvento('llm.complete.response', { request_id, status, data }, sourcePayload);
```

El helper extrae `correlation_id` del `sourcePayload` original y lo añade al outgoing si existe. El handler no piensa en ello — la regla del contrato `events` (propagación en cadenas) se cumple sin disciplina del programador. Validado por el test `Success: correlation_id se propaga en la response`.

### 2. Helpers `_buildErrorResponse` / `_buildSuccessResponse` separan shape canónico de la lógica

Los handlers solo deciden el código y el mensaje; el shape `{ status, data | error }` lo construye el helper. Mutual exclusión data/error garantizada por construcción, no por disciplina. Mismo patrón que en `notas-poc`.

### 3. Constructor de `DeepSeekClient` lanza si falta `timeout_ms`

```js
if (!config.timeout_ms) throw new Error('config.timeout_ms is required (mandatory_timeout_in_http_client)');
```

La regla "timeout obligatorio" del contrato `http` se enforce **al construir el cliente**, no al llamar. Es físicamente imposible olvidar un timeout. Patrón replicable: cualquier regla "X obligatorio" debería validarse en el constructor del cliente correspondiente.

### 4. Cache `in-memory` declarada en `module.json` es introspectable

```json
"persistence": {
  "pattern":            "in-memory",
  "restart_resilient":  false,
  "lost_on_restart":    ["credentialCache", "pendingCredentials"],
  "eviction_strategy":  { "ttl_ms": 300000, "max_entries": 100, "policy": "lru" }
}
```

El validador `persistence` puede leer esto sin abrir el código. Cierra el drift `drift_unbounded_growth_no_eviction` que el original tenía.

### 5. Mapeo `upstream_status → UPSTREAM_*` funciona limpiamente con switch

```js
if (s === 401 || s === 403) return 'UPSTREAM_INVALID_RESPONSE';
if (s === 429)              return 'UPSTREAM_INVALID_RESPONSE';
if (s >= 500)               return 'UPSTREAM_INVALID_RESPONSE';
```

Centralizado en `_mapUpstreamStatus`. El handler superior nunca ve "OpenAI dijo 429" — solo ve `code: 'UPSTREAM_INVALID_RESPONSE'`. La regla `external_errors_mapped_to_canonical_codes` del contrato `http` se cumple por construcción.

### 6. Redacción de `Authorization` en logs es trivial con regex case-insensitive

```js
if (/^(authorization|x-api-key|cookie|set-cookie)$/i.test(k)) out[k] = '[REDACTED]';
```

Aplicado solo en los puntos donde se loguean headers (request.failed, errores). El test `Authorization header se redacta en logs` confirma que no se filtra.

### 7. `onUnload` con `clearTimeout` cierra el drift original

El audit del módulo original anotaba que `onUnload` estaba vacío y `pendingCredentials` no se limpiaban. El POC itera sobre todos los pending, llama `clearTimeout`, rechaza promises, vacía caches. El drift `lifecycle.estado_no_limpiado` desaparece.

---

## ⚠️ Fricciones y decisiones de POC

### F1 — Eventos request/response no encajan con la forma canónica del contrato `events`

**Regla del contrato `events`**: `<module>.<entity>.<verb-pasado>` (ej: `notas.creado`, `pedido.confirmado`).

**Eventos del POC**:
- `llm.complete.request`     — `request` no es verbo en pasado
- `credential.resolve.request` — `request` tampoco
- `credential.resolve.response` — `response` tampoco

**Decisión del POC**: mantener los nombres existentes para no romper la integración con `credential-manager` y el resto del sistema.

**Razón estructural**: estos NO son eventos de hecho consumado (`pedido.confirmado` = "ya pasó algo"). Son **eventos de protocolo** request/response sobre el bus, simulando RPC. La gramática es distinta — no hay un "verbo en pasado" porque no hay un hecho cerrado, hay una intención (request) y su contraparte (response).

**Refinamiento propuesto al contrato `events`**: distinguir explícitamente dos sub-formas:
1. **Evento de hecho** (`<module>.<entity>.<verb-pasado>`): notas.creado, pedido.confirmado, gateway.started
2. **Evento de protocolo** (`<module>.<entity>.request|response|<protocol-state>`): llm.complete.request, credential.resolve.response

Sin esta distinción, el validador `events` marcará drift en módulos legítimos que usan request/response sobre bus.

### F2 — Helpers canónicos se duplican entre POCs

`_publicarEvento`, `_buildErrorResponse`, `_buildSuccessResponse`, `_emitMetric` viven duplicados en `notas-poc/index.js` y `ai-gateway-poc/index.js`. Las versiones son casi idénticas pero divergen sutilmente (en `ai-gateway-poc`, `_emitMetric` es defensivo ante varias APIs de metrics; en `notas-poc` no).

**Refinamiento propuesto**: extraer a un módulo compartido (`core/_shared/module-helpers.js` o similar) y que cada módulo lo `require`. Alternativa más ligera: incluir snippets canónicos OFICIALES en `events.contract.recommended_helpers` y `errors.contract.recommended_helpers`, marcados como "copiar tal cual" (no `require`, para mantener autocontención del módulo).

Recomiendo la segunda: la regla event-core de "un módulo no llama a otro" sugiere evitar dependencias compartidas; los helpers canónicos como **plantillas** copiadas mantienen autocontención.

### F3 — `RESOURCE_NOT_FOUND` no está en el catálogo de `errors`

El POC usa el código `RESOURCE_NOT_FOUND` (status 503) cuando credential-manager no responde o rechaza. Pero `errors.json.codes_infrastructure` no lo lista — sí tiene `UPSTREAM_INVALID_RESPONSE`, `UPSTREAM_TIMEOUT`, etc., pero ese caso específico de credencial faltante no.

**Refinamiento propuesto**: añadir a `errors.json.codes_infrastructure`:
```json
{
  "code": "RESOURCE_NOT_FOUND",
  "status_typical": 503,
  "descripcion": "Credencial requerida para llamar a un upstream no disponible (credential-manager caido, credencial no configurada, o rechazada).",
  "ejemplo_uso": "ai-gateway no obtuvo api_key de deepseek desde credential-manager"
}
```

### F4 — La API de `metrics` no está cerrada → helpers defensivos

El POC tiene `_emitMetric` que detecta si `this.metrics` tiene `histogram`, `increment` u `observe`:

```js
if (/duration$/.test(name) && typeof this.metrics.histogram === 'function') { ... }
else if (typeof this.metrics.increment === 'function') { ... }
else if (typeof this.metrics.observe === 'function') { ... }
```

Esto es porque `observability.contract` no especifica una API estricta para `metrics`. Cada módulo del repo usa lo que asume.

**Refinamiento propuesto al contrato `observability`**: cerrar la API:
- `histogram(name, value, labels)` — distribuciones (duración, tamaño)
- `increment(name, value, labels)` — counters monotónicos (errores, requests)
- `gauge(name, value, labels)` — observación puntual (queue size, cache size)

Y deprecar `observe` como genérico. Esto elimina los helpers defensivos en cada módulo.

### F5 — Validación de payload de eventos de bus es manual

`_validateRequest` valida el payload de `llm.complete.request` a mano (request_id string, messages array no vacío, longitudes máximas). Si llega malformado, devuelve `INVALID_INPUT`.

Pero `subscribes` en `module.json` NO admite `request_schema_ref` — no hay forma declarativa de pedir al bus que valide ANTES de invocar el handler.

**Refinamiento propuesto al contrato `events`**: añadir opcional a `subscribes[*].request_schema_ref`, paralelo a `apis[*].request_schema_ref` del contrato `http`. El bus (o un middleware) validaría el payload contra el schema antes de invocar el handler, devolviendo el error estructurado al publisher si falla. Reduciría la disciplina manual.

### F6 — Shape interno del cliente vs shape canónico del bus

`DeepSeekClient` devuelve `{ ok: true, data }` o `{ ok: false, error: { code, status, message, details } }` — un shape **interno** rico para que el handler decida.

El handler `onLlmCompleteRequest` convierte ese shape a `{ status, data | error }` antes de publicar al bus.

**Decisión consciente**: separar el shape interno (rico, con `ok` boolean para flujo) del shape canónico del bus (estricto, mutual exclusión). El cliente puede evolucionar internamente sin romper el contrato del bus.

**Refinamiento propuesto al contrato `errors`** (sección recomendaciones): documentar este patrón explícitamente:
> Los clientes internos (HTTP-clients, helpers de persistencia, etc.) pueden usar shapes ricos como `{ ok, ... }` en su API privada. Pero la salida al bus o al HTTP-server SIEMPRE es canónica `{ status, data | error }`. La traducción ocurre en el handler que cruza la frontera.

Sin esta nota, el patrón parece drift cuando es disciplina sana.

### F7 — Tests requieren mockear `global.fetch`

Los tests del POC sobrescriben `global.fetch` para inyectar respuestas. Funciona pero contamina el global y dos tests en paralelo se pisarían.

**Refinamiento propuesto al cliente**: aceptar `fetch` como inyección opcional en el constructor:
```js
new DeepSeekClient({ config, logger, metrics, resolveCredential, fetch: customFetch });
```

Por defecto usa el global. En tests inyectas el mock. Más limpio, sin contaminar global. Aplicable a TODOS los HTTP-clients del sistema → recomendación general en el contrato `http`.

---

## 📋 Drift cerrado por el POC vs el original

| Drift en `ai-gateway` original | Cerrado por POC |
|---|---|
| onUnload vacío (timeouts no clearados) | ✓ onUnload itera pendingCredentials con clearTimeout |
| `metricas_emitidas: []` (cero metrics) | ✓ histogram(duration), increment(errors) en cada operación |
| Errores upstream propagados como `'Error: <msg>'` | ✓ Mapeo a UPSTREAM_INVALID_RESPONSE / UPSTREAM_INVALID_RESPONSE / UPSTREAM_INVALID_RESPONSE / ... |
| No declara `config.persistence` | ✓ Declaración completa con eviction_strategy TTL+LRU |
| No declara `config.http_clients` | ✓ deepseek con host, base_url, timeout, retry, tls_verify, auth_method, credential_ref |
| `correlation_id` no se propaga | ✓ `_publicarEvento(event, payload, sourcePayload)` lo propaga |
| Response shape no canónico | ✓ `{ request_id, status, data | error }` mutual exclusivos |
| Headers Authorization sin redactar en logs | ✓ `_redactHeaders` aplicado |

---

## 🔮 Lo que queda fuera del POC (por diseño)

- **Streaming** (`chatCompletionStream`) — el POC valida solo POST/JSON unitario.
- **Vision/imagen** (`hasVisionContent`, base64) — funcionalidad multimodal no relevante para validar contratos.
- **Reasoning chain-of-thought** (`deepseek-reasoner`) — campo `reasoning_content` lo añadiríamos en v2.
- **Tool calling / agentic loop** — el original tiene un loop complejo con `_executeToolCall` y publish dinámico de `toolName`. Drift potencial (publish con nombre variable es caso único en el repo). Vale como POC posterior aparte.
- **Otros providers** (openai, anthropic, gemini, groq, ollama, claude-cli) — la lógica del cliente es portable; v2 portaría la disciplina a los siete providers.
- **Filesystem reads** (`fs.read.request` para attachments) — no aplica sin chat con attachments.

---

## ✍️ Próximos pasos recomendados

1. **Aplicar F3** (añadir `RESOURCE_NOT_FOUND` al catálogo de `errors`) — cambio chico de output, alta utilidad.
2. **Aplicar F1** (formalizar eventos request/response como sub-forma legítima en `events`) — desbloquea otros módulos request/response del repo (credential-manager, filesystem, etc.).
3. **Aplicar F4** (cerrar la API de `metrics`) — elimina helpers defensivos en todo el repo.
4. **Aplicar F2** (snippets canónicos en `recommended_helpers` de los contratos) — reduce duplicación al portar a más módulos.
5. **Aplicar F6** (documentar shape interno vs canónico) — clarifica el patrón antes del próximo POC.
6. **F5 y F7** (schema_ref en subscribes, fetch inyectable) — refinamientos pequeños, vale para cuando se haga la siguiente tanda.

Tras aplicar F1+F3+F4 al menos, este POC se promueve a `ai-gateway` real con los siete providers.
