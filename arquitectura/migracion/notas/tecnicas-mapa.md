# PASO 0 — mapa del modulo `tecnicas`

Modulo NUEVO (no refactor): no hay monolito legacy que archivar. Este mapa cumple el `paso_0_mapeo_exhaustivo_obligatorio` de `module-rewrite.contract.json` documentando todos los eventos, tools, handlers y estado interno antes de tocar codigo.

## Identidad

- **Slug**: `tecnicas`
- **Language**: `es`
- **Tier**: `tier_4_dominio` (modulo de dominio, no infra ni core).
- **Subsistema**: `subsistema-recetario` (ver `arquitectura/decisiones/_contratos/subsistema-recetario.contract.json` v1.0.1).
- **Tipo canonico**: `libreria_reutilizable` (segun el sub-contrato).
- **Dueno de**: la libreria de tecnicas codificadas del proyecto.
- **Responsabilidad acotada**: mantener una libreria reusable de tecnicas culinarias (esferificacion, confitar, marinada de 24h) con parametros. Cada tecnica es referenciable desde recetas y prototipos por `tecnica_id`.

## Publishes canonicos

- `tecnica.creada` se publica tras persistir una tecnica nueva en `data/projects/{slug}/tecnicas.json`. Schema oficial: `arquitectura/decisiones/_schemas/subsistema-recetario/tecnica.creada.schema.json`.
- `tecnica.actualizada` se publica tras aplicar cambios sobre una tecnica existente. Schema oficial: `arquitectura/decisiones/_schemas/subsistema-recetario/tecnica.actualizada.schema.json`.

Ambos cumplen shape AJV strict (`additionalProperties:false`) con campos canonicos del subsistema (`correlation_id`, `project_id`, `user_id`, `tecnica_id`, `nombre`, `timestamp`).

## Subscribes

Lifecycle del proyecto + persistencia:

- `project.activated` → `onProjectActivated`: cachea `project_id -> base_path`.
- `project.get.response` → `onProjectGetResponse`: resuelve `project_id` lazy correlado por `request_id`.
- `fs.read.response` → `onFsReadResponse`: resuelve lectura de `tecnicas.json` correlada.
- `fs.write.response` → `onFsWriteResponse`: resuelve escritura correlada.

Tools invocadas por bus:

- `tecnicas.codificar` → `onCodificar`: crear tecnica nueva.
- `tecnicas.listar` → `onListar`: listar tecnicas (filtro opcional por categoria).
- `tecnicas.obtener` → `onObtener`: obtener una tecnica por id.
- `tecnicas.actualizar` → `onActualizar`: actualizar tecnica existente.
- `tecnicas.parametros` → `onParametros`: obtener solo la seccion `parametros` de una tecnica.

## Tools expuestos al LLM (5)

Todos siguen `tools.contract.json`: nombre `<module-prefix>.<entity>`, retorno canonico `{status, data | error: {code, message, details?}}`, invocacion via par `<toolName>` (request) / `<toolName>.response` (correlado por `request_id`). `project_id` obligatorio en parametros (multi-tenancy).

## Persistencia

- **Patron**: `json-per-project` (igual que `recetas`).
- **Path**: `data/projects/{slug}/tecnicas.json`.
- **Acceso**: exclusivamente via `fs.read.request` / `fs.write.request` por bus, NO via `fs.promises.*` directo.
- **Concurrencia**: `writeQueues: Map<project_id, Promise>` serializa escrituras al mismo archivo de proyecto. Lecturas paralelas permitidas.
- **Shape del archivo**:
  ```json
  {
    "_version": "1.0.0",
    "_updated": "ISO 8601",
    "tecnicas": [
      {
        "id": "tec_<timestamp>_<rand>",
        "nombre": "Esferificacion inversa",
        "categoria": "esferificaciones",
        "parametros": { "alginato_pct": 0.5, "tiempo_bano_min": 2 },
        "instrucciones": "...",
        "materiales": ["jeringa", "cuchara perforada"],
        "version": 1,
        "created_at": "ISO 8601",
        "updated_at": null
      }
    ]
  }
  ```

## Estado interno

- `this.projectBasePaths: Map<project_id, basePath>` — cache.
- `this.pendingProject: Map<request_id, {resolve, reject, timer}>` — `project.get.request` pendientes.
- `this.pendingFs: Map<request_id, {resolve, reject, timer}>` — `fs.read|write.request` pendientes.
- `this.writeQueues: Map<project_id, Promise>` — serializacion de escrituras por proyecto.

## Helpers POC2 (5 obligatorios + dominio)

Nombres exactos del canon (`module-rewrite.contract` v1.1.0 principio `5_helpers_poc2_obligatorios`):
1. `_errorResponse(status, code, message, details?)` → shape `{status, error: {...}}` con log + metric automaticos.
2. `_classifyHandlerError(err)` → mapea `err._code` o `err.code` canonico → `{status, code, message}`.
3. `_handleHandlerError(logEvent, err, kind)` → catch wrapper: log + metric + `_errorResponse`.
4. `_publicarEvento(name, payload, sourcePayload?)` → propaga `correlation_id`, anade `timestamp` y `project_id` antes de publicar.
5. Auxiliares de dominio: `_validarCodificar`, `_validarActualizar`, `_generarId`.

Helpers de persistencia (no del canon POC2, especificos del patron json-per-project, copiados de `recetas`):
- `_basePathForProject(project_id)` — cache + `project.get.request` lazy.
- `_loadStore(basePath)` / `_saveStore(basePath, store)` — via `fs.*.request`.
- `_withStore(project_id, mutator)` — combinacion + write queue.
- `_readFile(absPath)` / `_writeFile(absPath, content)` — request/response correlados con `request_id`.

## Lifecycle

- `onLoad(core)`: inyecta `logger`, `metrics`, `eventBus`; loguea `tecnicas.loaded`.
- `onUnload()`: limpia timers de pendings, vacia caches, evita leaks.

## Validaciones canonicas

Codificar:
- `project_id` obligatorio.
- `nombre` obligatorio, string, 1-100 chars.
- `categoria` obligatorio, string, 1-50 chars.
- `parametros` opcional, plain object.
- `instrucciones` opcional, string, max 5000 chars.
- `materiales` opcional, array de strings (cada uno max 100 chars).

Actualizar:
- `project_id`, `tecnica_id` obligatorios.
- `cambios` object con campos opcionales (mismo set, mismas reglas).

Errores canonicos (catalogo `errors.json` v1.5.0):
- 400 `INVALID_INPUT` (con `details.field`).
- 404 `RESOURCE_NOT_FOUND` (con `details.entity_type: 'culinary-technique'`, `details.entity_id`).
- 504 `UPSTREAM_TIMEOUT` (con `details.kind: 'dependency'`).
- 503 `UPSTREAM_UNREACHABLE` (con `details.kind: 'dependency'`).
- 500 `UNKNOWN_ERROR` (catch-all).

## Tests por capas (7 grupos)

1. **Lifecycle**: `onLoad` inicializa caches limpias; `onUnload` libera recursos.
2. **Validacion canonica**: codificar sin `project_id` → 400; sin `nombre` → 400; nombre > 100 chars → 400.
3. **Success paths codificar**: codifica + publica `tecnica.creada` con shape canonico (validado contra AJV schema oficial).
4. **Success paths actualizar**: actualiza + publica `tecnica.actualizada` con shape canonico.
5. **Bus handlers**: `onProjectActivated` puebla cache; `onFsReadResponse` resuelve pending; timeout dispara reject.
6. **Tools / listar / obtener / parametros**: retornos canonicos + 404 para id inexistente + filtros.
7. **Helpers POC2**: `_errorResponse` shape; `_classifyHandlerError` mapping; `_publicarEvento` propaga correlation_id + adjunta project_id/timestamp.

Aislamiento: tests usan `eventBus` mock (Map de publishes), `logger`/`metrics` stubs, sin filesystem real. El cache de `projectBasePaths` se pre-poblara para evitar pedir `project.get.request` en cada test.

## Criterio de cierre

- `tests/unit/tecnicas.test.js` verde.
- `npm run validate:ci` verde (subsistema-recetario.validate.js debe pasar sin drift NUEVO; reconoce el modulo con schema_ref declarado en module.json para los 2 publishes).
- `module.json` declara: events.publishes (2) con `response_schema_ref`, events.subscribes (4 lifecycle + 5 tools), tools (5) con shape canonico.
- Audit modulo-completo regenerado en el siguiente ciclo de auditoria (no bloquea este commit).
