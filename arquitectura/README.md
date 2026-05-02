# Arquitectura del repo — guía rápida

Este directorio contiene las **reglas formales** del sistema event-core: cómo se nombran las cosas, cómo se comunican los módulos, cómo se gestionan errores, persistencia, HTTP, etc. Son reglas escritas en JSON, validables mecánicamente y refinadas con 4 ciclos de POC.

## Estructura

```
arquitectura/
├── auditoria/                  Snapshot del estado real de los 66 módulos
│   ├── _outputs/manifest-completo/<modulo>.json    (lo declarado por el módulo)
│   └── _outputs/modulo-completo/<modulo>.json      (lo real, extraído del código)
│
├── convenciones/               2 contratos sobre naming/glossary
│   ├── _contratos/             el "porqué" arquitectónico
│   ├── _outputs/               valores concretos (verbos canónicos, etc.)
│   ├── _schemas/               forma estricta del output
│   └── _validators/            programa que valida un módulo
│
└── decisiones/                 6 contratos arquitectónicos
    ├── _contratos/             events, lifecycle, observability, errors, persistence, http
    ├── _outputs/               outputs canónicos (códigos, reglas, patrones)
    ├── _schemas/               forma estricta de cada output
    └── _validators/            8 programas que detectan drift
```

## Los 8 contratos

Cada contrato responde a una pregunta del sistema:

| Contrato | Pregunta | Versión actual |
|---|---|---|
| `naming` | ¿Cómo se nombran las cosas? (kebab-case, verbos canónicos por idioma) | v1.1.0 |
| `glossary` | ¿Cómo se llama cada concepto cross-módulo? | v1.0.0 |
| `events` | ¿Cómo se comunican los módulos? (MQTT, fire-and-forget) | v1.6.0 |
| `lifecycle` | ¿Cómo arranca y para un módulo? | v1.0.0 |
| `observability` | ¿Cómo loguea y mide? (API canónica `increment`/`gauge`/`timing`) | v1.1.0 |
| `errors` | ¿Cómo devuelve errores? (`{status, data \| error}`) | v1.4.0 |
| `persistence` | ¿Cómo guarda a disco? (write atómico, ENOENT graceful) | v1.0.0 |
| `http` | ¿Cuándo usar HTTP? (frontera externa; internamente MQTT) | v1.3.0 |

## Cómo se usa en el día a día

### Validar localmente

```bash
# Schema de los 8 outputs (rápido, ~1s)
npm run validate:all

# + cross-checks contra los 66 módulos del repo (lento, varios segundos)
npm run validate:all:system

# Modo CI: solo falla en drift NUEVO vs baseline aceptado
npm run validate:ci
```

Validators individuales (cuando quieres focalizar):

```bash
npm run validate:naming        npm run validate:naming:system
npm run validate:glossary      npm run validate:glossary:system
npm run validate:events        npm run validate:events:system
npm run validate:lifecycle     npm run validate:lifecycle:system
npm run validate:observability npm run validate:observability:system
npm run validate:errors        npm run validate:errors:system
npm run validate:persistence   npm run validate:persistence:system
npm run validate:http          npm run validate:http:system
```

### Baseline de drift (deuda aceptada)

`drift-baseline.json` (en la raíz del repo) captura los ~2865 drifts existentes en los 66 módulos como deuda aceptada. CI usa este archivo para fallar solo en drift nuevo:

```bash
npm run validate:ci             # PASS si no hay drift nuevo vs baseline
```

Cuando se cierra deuda real (refactor de un módulo), regenerar baseline:

```bash
npm run validate:baseline:update
```

### Integrar en CI

```yaml
# .github/workflows/validate.yml (ejemplo)
- run: npm install
- run: npm run validate:ci
```

Falla solo si el commit introduce drift NO presente en el baseline. La deuda histórica no bloquea desarrollo.

## POCs de referencia

4 módulos reescritos siguiendo los 8 contratos al pie de la letra. Sirven como ejemplos vivos del patrón canónico:

| POC | Módulo | Patrón principal validado |
|---|---|---|
| POC1 | `modules/notas-poc` | events + errors + lifecycle + observability básicos |
| POC2 | `modules/conversacion/ai-gateway-poc` | HTTP-client, timeouts, mapeo `UPSTREAM_*`, credentials event-driven |
| POC3 | `modules/pizzepos/carta-scheduler-poc` | json-file-per-project + timers + tools + mqttRequest cross-módulo |
| POC4 | `modules/pizzepos/cocina-poc` | HTTP-server canónico (`/modules/<slug>/<path>`) + agregador de eventos |

Cada POC tiene un `POC_FINDINGS.md` que documenta:
- Lo que funcionó bien (5-7 puntos)
- Las fricciones detectadas (5-7 findings) → refinamientos aplicados a los contratos

Cada POC tiene su test suite:

```bash
npm run test:ai-gateway-poc     # 18 tests
npm run test:carta-scheduler-poc # 19 tests
npm run test:cocina-poc          # 23 tests
```

60 tests automáticos en total.

## Cómo añadir reglas nuevas

1. **Identificar la fricción** — escribir un POC que la encuentre, no especular en abstracto.
2. **Refinar el contrato** correspondiente (`_contratos/X.contract.json` + `_outputs/X.json` + `_schemas/X.schema.json`). Bumpear versión.
3. **Validar**: `npm run validate:X` debe pasar.
4. **Si introduce nueva detección**: actualizar el validator y regenerar baseline (`npm run validate:baseline:update`).

## Cómo añadir un módulo nuevo

1. Crear `modules/<grupo>/<slug>/module.json` siguiendo:
   - `language`: `es` o `en`
   - `events.publishes` y `events.subscribes` declarados (no dinámicos)
   - `apis` solo si expone HTTP server (paths canónicos `/modules/<slug>/<path>`)
   - `config.persistence` declarando el patrón (in-memory, json-file, json-file-per-project, sqlite, append-only-log, external-delegation)
   - `config.module_dependencies` declarando peers + interaction (mqttRequest / subscribe_only / publish_only / bidirectional)
2. Implementar `index.js` siguiendo la firma canónica:
   - `async onLoad(context)` — recibe `{ logger, eventBus, metrics, moduleConfig, mqttRequest? }`
   - `async onUnload()` — limpia timers, vacía caches, libera recursos
   - Handlers HTTP devuelven siempre `{ status, data | error: { code, message, details? } }`
3. Usar los snippets canónicos de `_outputs/events.json#recommended_helpers` y `_outputs/errors.json#recommended_helpers` (no inventar tu propio `_publicarEvento` / `_buildErrorResponse`).
4. `npm run validate:ci` debe pasar.

## `mqttRequest` para comunicación cross-módulo

El loader inyecta `context.mqttRequest(domain, action, payload, options?)` en `onLoad` de cada módulo (events v1.5.0 `context_injection`). Es el patrón canónico para que un módulo llame a otro:

```js
async onLoad(context) {
  this.mqttRequest = context.mqttRequest;
}

async algo() {
  const resp = await this.mqttRequest('scheduler', 'addJob', { ... });
  if (resp.error) { /* manejar UPSTREAM_* canonico */ }
  return resp.data;
}
```

El módulo **destinatario** declara handlers en `module.json.ui_handlers`:

```json
"ui_handlers": [
  { "domain": "scheduler", "action": "addJob", "handler": "handleAddJob" }
]
```

El loader auto-wirea el handler. La implementación interna actual delega a `uiHandler.handle()` (single-process). Cuando se active multi-core, la misma firma se traduce a publish/subscribe MQTT real **sin tocar callers**.

Lo que **NO** se debe hacer (drift estructural, detectado por validator):

```js
// PROHIBIDO: acceso directo via moduleLoader
const sched = this.moduleLoader.getModule('scheduler');
await sched.instance.addJob(payload);
```

Tests que validan el flujo:
- `npm run test:mqtt-request` (5 casos unitarios del loader)
- `npm run test:integration:carta-scheduler` (carta-scheduler-poc + scheduler/tarifas mock end-to-end)

## Glosario rápido

- **drift**: incumplimiento de un contrato detectado por un validator
- **baseline**: snapshot del drift actual, capturado para que CI no falle por deuda histórica
- **POC**: módulo reescrito como ejemplo vivo del patrón canónico
- **finding**: una fricción concreta detectada al aplicar un contrato a código real, llamada F1, F2, etc. en los `POC_FINDINGS.md`
- **mqttRequest**: función inyectada al moduleContext que permite llamadas cross-módulo via `uiHandler.handle()` sin acceso directo a `moduleLoader.getModule(...)`
