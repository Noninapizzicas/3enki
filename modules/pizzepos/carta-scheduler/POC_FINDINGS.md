# POC carta-scheduler — hallazgos sobre los contratos

Tercer POC del repo. Rewrite parcial del módulo `pizzepos/carta-scheduler` aplicando los **8 contratos arquitectónicos**. Patrones validados que ningún POC anterior tocó:

- **`persistence: json-file-per-project`** (multi-tenant con write atómico) — NUEVO
- **`lifecycle: timers/cron`** (setInterval con start/stop limpios) — NUEVO
- **`tools` declarados en `module.json`** (con prefix correcto + parameters JSON Schema) — NUEVO
- **`mqttRequest` cross-módulo** (en lugar de `moduleLoader.getModule().instance.toolX()`) — NUEVO

---

## ✅ Lo que funcionó sin fricción

### 1. `ProjectStorage` aisla la disciplina de persistence

Helper de ~190 LOC que centraliza write atómico (tempFile + rename), ENOENT graceful, JSON corrupto graceful, telemetría obligatoria. El handler superior solo llama `await this.storage.writeJson(projectId, fileName, data)` y se olvida del resto. Cero casos de drift `non_atomic_write` posibles por construcción.

### 2. `PendientesTimer` con blindaje del callback

El timer envuelve el callback en try/catch: si el callback lanza, log warn + metric, **el timer sigue corriendo**. El original no lo tenía — una excepción mataba todos los tics futuros silenciosamente. Patrón replicable a cualquier timer del repo.

### 3. `_mqttRequestSafe` traduce timeouts a códigos canónicos

Wrapper canónico de `mqttRequest`: aplica timeout, emite log + metric, mapea network/timeout a `UPSTREAM_TIMEOUT` / `UPSTREAM_UNREACHABLE`. El handler que lo usa (toolConfirmar) recibe shape interno `{ ok, data | error }` limpio. Drift cerrado vs original que llamaba directamente y propagaba `err.message` al user.

### 4. Tools con prefix correcto = naming consistente

Original: `scheduler.crear_regla` (prefix `scheduler.*` confunde con el módulo `scheduler` real).
POC: `carta-scheduler.crear_regla`.

El cambio es trivial pero el efecto es enorme: la auditoría sabe a qué módulo pertenece cada tool sin abrir el código. Validador `naming` lo detecta.

### 5. Constructor enforce + lanzar en `onLoad` desbloquea fail-fast

`PendientesTimer` lanza si `intervalMs <= 0`. `ProjectStorage` lanza si falta `subdir`/`logger`. `onLoad` del módulo lanza si `pattern != 'json-file-per-project'` o si falta `mqttRequest`. Imposible cargar el módulo en estado inconsistente. Validado por los 2 primeros tests.

### 6. Shape canónico `{status, data | error}` con códigos reusables

Toda salida de tools es ahora `{status, data | error: { code, message, details }}`. Cierra el drift del original que mezclaba `error: 'string'` con `data` arbitrario. Con `errors v1.4.0` (POC2 F3) los códigos `RESOURCE_NOT_FOUND`, `INVALID_INPUT`, `CONFLICT_STATE`, `UPSTREAM_TIMEOUT`, `UPSTREAM_UNREACHABLE` ya son canónicos del catálogo.

---

## ⚠️ Fricciones y decisiones de POC

### F1 (POC3) — `tools` no están en el `subscribes_declaration_shape` (F5 del POC2)

El refinamiento F5 del POC2 (events v1.4.0) añadió `subscribes_declaration_shape` para validación declarativa de payloads de eventos. Pero los **tools** son parecidos: el agente externo invoca un tool con un payload, el módulo valida y devuelve respuesta canónica.

En este POC, `_validate({ project_id, regla }, ['project_id', 'regla'])` valida manualmente. Cada tool repite esta línea.

**Refinamiento propuesto al contrato `events` o nuevo `tools.contract`**: documentar que los `tools[*].parameters` (que ya son JSON Schema) deben ser usados por el framework para validar **antes** de invocar al handler, paralelo a `apis[*].request_schema_ref` y `subscribes[*].request_schema_ref`. Reduciría el código de validación manual.

### F2 (POC3) — `module_dependencies` declaradas pero no validables hoy

El POC declara en `module.json`:
```json
"module_dependencies": {
  "scheduler": { "interaction": "mqttRequest", "actions": ["addJob", "deleteJob"] },
  "tarifas":   { "interaction": "mqttRequest", "actions": ["assign"] }
}
```

Esta declaración es informativa: la auditoría puede leerla. Pero **no hay schema** para `module_dependencies` en ningún contrato vigente. El campo es free-form.

**Refinamiento propuesto al contrato `events`**: añadir `module_dependencies_shape` paralelo a `subscribes_declaration_shape` que documenta la forma canónica:
```json
{
  "<modulo_destino>": {
    "interaction": "mqttRequest|publish",
    "actions": ["..."],
    "descripcion": "..."
  }
}
```

Esto permitiría detectar drift: si el módulo llama `mqttRequest('foo', 'bar', ...)` sin que `foo` esté declarado en `module_dependencies`, drift.

### F3 (POC3) — `data_path_template` con placeholders es ad-hoc

`module.json`:
```json
"data_path_template": "<project.base_path>/storage/pizzepos/config"
```

El POC parsea `<project.base_path>` como placeholder con un regex. Pero el contrato `persistence` no define un sistema de templating — cada módulo inventa su sintaxis.

**Refinamiento propuesto al contrato `persistence`** (sub-shape para `json-file-per-project`): definir formalmente los placeholders:
- `<project.base_path>` — base del proyecto activo
- `<project.id>` — slug del proyecto
- `<core.data_path>` — fallback al data_path del core
- `<module.name>` — nombre del módulo (auto)

Sin esto, cada módulo resuelve paths a mano y la auditoría no puede saber dónde escribe sin abrir código.

### F4 (POC3) — Timer largo bloquea cierre del proceso en tests

El POC carga `PendientesTimer` con `intervalMs = 60_000_000` (efectivamente nunca) en los tests para no esperar 1h reales. Pero `setInterval` mantiene vivo el event loop de Node, bloqueando la salida del proceso de tests si no se llama `onUnload`.

Solución del POC: cada test llama `await m.onUnload()` al final. Pero olvidar esa línea hace que el test cuelgue 60_000_000 ms.

**Refinamiento propuesto al contrato `lifecycle`**: documentar que los timers que el módulo levanta deben llamar `.unref()` cuando son **soft cleanups** (no críticos para correctness). Permite que Node termine si el resto del programa terminó. El `PendientesTimer` actual no lo hace — el original tampoco. Decisión defendible: en producción quieres que el timer mantenga vivo el proceso; en tests, no.

Variante: `new PendientesTimer({ ..., unref: true })` opt-in.

### F5 (POC3) — `mqttRequest` no está estandarizado en context

El POC asume `context.mqttRequest` como función. Pero el contrato `events` tiene esta API en `request_response.api_signature: "mqttRequest(domain, action, payload, options?)"` — descriptiva, no normativa de cómo el core lo inyecta al módulo.

Dos módulos del repo podrían inyectarla de formas distintas (`context.mqttRequest`, `context.bus.request`, `core.requestModule`, etc.).

**Refinamiento propuesto al contrato `events`**: documentar explícitamente cómo se inyecta:
```
context.mqttRequest(domain, action, payload, { timeout_ms? }) → Promise<response>
```

Y añadir validador que detecte `this.moduleLoader.getModule(...).instance.tool*` como **drift** (acceso directo en lugar de via bus).

### F6 (POC3) — `correlation_id` se propaga sólo si el caller pasa `sourcePayload`

`_publicarEvento(name, payload, sourcePayload)` extrae `correlation_id` del `sourcePayload`. Pero los **tools** son llamados por el framework de agente, no por un handler de evento — no hay `sourcePayload` natural. El POC permite pasar un segundo argumento `sourcePayload = null` a cada tool, pero el agente externo tiene que recordar pasarlo.

**Refinamiento propuesto al contrato `events`**: cuando un tool del módulo se invoca, el framework debe pasar el `correlation_id` del request original (la conversación con el agente) automáticamente. Sin ese mecanismo, los tools rompen la cadena de causalidad de logs/métricas.

### F7 (POC3) — `agents` sub-key en `module.json` no tiene shape canónico

`module.json` declara:
```json
"agents": {
  "scheduler-planner":    "Conversa con el usuario...",
  "scheduler-dispatcher": "Cuando un cambio dispara..."
}
```

Esto es free-form. No hay validación de schema. Si otro módulo declara `agents` con un shape distinto, ambos pasan validation pero la auditoría no puede comparar.

**Refinamiento propuesto** (probablemente nuevo contrato `agents.contract` o sección en `events`): formalizar el shape de cada agent declarado: `{ name, description, prompt_ref?, tools_used: [...], protocol_events: [...] }`. Posiblemente fuera del scope de los 8 contratos actuales — sería un contrato adicional cuando los agentes maduren.

---

## 📋 Drift cerrado por el POC3 vs el original

| Drift en `carta-scheduler` original | Cerrado por POC3 |
|---|---|
| `moduleLoader.getModule('scheduler').instance.addJob(...)` (acceso directo) | ✓ `mqttRequest('scheduler', 'addJob', ...)` |
| `moduleLoader.getModule('tarifas').instance.toolAssign(...)` (acceso directo) | ✓ `mqttRequest('tarifas', 'assign', ...)` |
| `error: 'string'` (no canónico) | ✓ `error: { code, message, details }` con códigos canónicos |
| `fs.writeFile` directo sobre archivo final | ✓ ProjectStorage con tempFile + rename |
| Subscribe dinámico (`scheduler.job.triggered`) no en `module.json` | ✓ Declarado en `events.subscribes` |
| Publishes no declarados (`carta-scheduler.regla.triggered`) | ✓ 7 publishes documentados |
| `silent_io_failure` en saveReglas/savePendientes | ✓ logger + metric obligatorios en cada catch |
| Tools con prefix `scheduler.*` | ✓ `carta-scheduler.*` |
| Sin `config.persistence` declarado | ✓ `json-file-per-project` con files declarados |
| Sin `module_dependencies` declarado | ✓ Declarado con `interaction: mqttRequest` |
| Tick callback sin blindaje (excepción mata el timer) | ✓ try/catch en `_tick` con metric/log |
| Sin metrics en lifecycle | ✓ `lifecycle.loaded` / `.unloaded`, `timer.started` / `.stopped` |

---

## 🔮 Lo que queda fuera del POC

- **El `scheduler` central del core**: el POC asume que existe y responde a `mqttRequest('scheduler', 'addJob' | 'deleteJob', ...)`. No reescribe ese módulo.
- **El `tarifas` módulo**: idem, asumido como peer.
- **Conversaciones reales con los 2 agentes** (planner / dispatcher): el POC declara los agents en `module.json` pero el comportamiento conversacional vive en el `ai-agent-framework`.
- **Triggers complejos** (cron parsing avanzado, fechas relativas, intervalos): el POC pasa el `trigger` raw a `scheduler.addJob` y delega.
- **UI handlers reales**: implementados pero el dashboard/admin-panel que los consume no se ha tocado en este POC.

---

## ✍️ Próximos pasos recomendados

1. **Aplicar F1** (validación declarativa de `tools[*].parameters` por el framework) — chico, alto impacto.
2. **Aplicar F2** (`module_dependencies_shape` formal en contrato `events`) — chico, habilita validador cross-módulo.
3. **Aplicar F3** (placeholders canónicos en `data_path_template` del contrato `persistence`) — chico.
4. **Aplicar F5** (estandarizar `context.mqttRequest` + validador que detecta `moduleLoader.getModule(...).instance.*` como drift) — mediano, alto impacto sistémico.
5. **F4 y F6** — refinamientos pequeños, vale para la siguiente tanda.
6. **F7** — probablemente nuevo contrato `agents.contract` cuando los agentes maduren.

---

## 📊 Métricas del POC3

| Aspecto | Valor |
|---|---|
| Archivos creados | 5 (module.json, project-storage.js, pendientes-timer.js, index.js, POC_FINDINGS.md) |
| Tests | 19 casos, 100% pasan |
| LOC totales | ~1900 (sin tests) |
| Tiempo de carga (smoke) | <100ms con tmpdir |
| Drift cerrado vs original | 12 items |
| Findings detectados | 7 (F1-F7) |

Tras aplicar F1+F2+F5, el POC3 se promueve a `carta-scheduler` real y se eliminan los `moduleLoader.getModule(...).instance.*` del módulo original. Drift estructural cerrado en producción.
