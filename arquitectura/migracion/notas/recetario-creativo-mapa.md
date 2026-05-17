# PASO 0 — mapa del modulo `recetario-creativo`

Modulo NUEVO (no refactor). Segundo modulo nuevo del horizontal del subsistema-recetario (tecnicas fue el primero). Reusa el patron POC2 validado en tecnicas: extends BaseModule, persistencia json-per-project via bus, 5 helpers (los 5 de BaseModule + override `_publicarEvento`), tests por capas con validacion AJV.

## Identidad

- **Slug**: `recetario-creativo`
- **Language**: `es`
- **Tier**: `tier_4_dominio`
- **Subsistema**: `subsistema-recetario` (v1.0.1)
- **Tipo canonico**: `anotacion_creativa` (segun el sub-contrato)
- **Dueno de**: prototipos del chef, iteraciones anotadas por prototipo, manifiesto creativo del proyecto, scoring de alineacion entre receta/prototipo y manifiesto.

## Responsabilidad acotada

Soporte al proceso creativo del chef: explora ideas como prototipos (no son recetas todavia), anota iteraciones (lo que cambio, que funciono), valida alineacion con el manifiesto del proyecto. Promociona prototipos a recetas canonicas via la tool `recetas.crear` (cross-modulo) cuando el chef decide — el modulo NO modifica recetas canonicas, solo emite la decision.

## Publishes canonicos

- `creativo.prototipo.creado` se publica tras abrir un nuevo prototipo. Schema oficial: `arquitectura/decisiones/_schemas/subsistema-recetario/creativo.prototipo.creado.schema.json`.
- `creativo.iteracion.registrada` se publica tras anotar una iteracion sobre un prototipo. Schema oficial: `arquitectura/decisiones/_schemas/subsistema-recetario/creativo.iteracion.registrada.schema.json`.
- `creativo.alineacion.validada` se publica tras evaluar la alineacion de un prototipo o receta con el manifiesto del proyecto. Schema oficial: `arquitectura/decisiones/_schemas/subsistema-recetario/creativo.alineacion.validada.schema.json`.

Todos cumplen shape AJV strict (`additionalProperties:false`) con campos canonicos del subsistema (`correlation_id`, `project_id`, `user_id`, `timestamp` + identificadores y datos especificos de cada evento).

## Subscribes

Lifecycle del proyecto + persistencia (igual patron que tecnicas):

- `project.activated` → `onProjectActivated`: cachea `project_id -> base_path`.
- `project.get.response` → `onProjectGetResponse`: resuelve `project_id` lazy.
- `fs.read.response` → `onFsReadResponse`: resuelve lectura correlada.
- `fs.write.response` → `onFsWriteResponse`: resuelve escritura correlada.

Tools invocadas por bus:

- `creativo.prototipo.crear` → `onCrearPrototipo`: abrir nuevo prototipo.
- `creativo.prototipo.iterar` → `onIterar`: anotar iteracion sobre prototipo.
- `creativo.alineacion.evaluar` → `onEvaluarAlineacion`: cruzar prototipo o receta con manifiesto y publicar score.
- `creativo.manifiesto.actualizar` → `onActualizarManifiesto`: actualizar manifiesto del proyecto.

Decision deliberada: NO consumir `receta.creada` ni `receta.actualizada` reactivamente en v1.0.0 (aunque el sub-contrato los liste como posibles). Sin necesidad de comportamiento reactivo concreto en esta iteracion. La alineacion de una receta se evalua a peticion del caller (LLM o frontend), no como reaccion automatica.

## Tools expuestas (4)

Todas con `project_id` obligatorio (multi-tenancy) y retorno canonico `{status, data | error: {code, message, details?}}`. Invocacion via par `<toolName>` (request) / `<toolName>.response` (correlado por `request_id`).

## Persistencia

- **Patron**: `json-per-project` (canonico del subsistema).
- **Path**: `data/projects/{slug}/recetario-creativo.json`.
- **Acceso**: exclusivamente via `fs.read.request` / `fs.write.request` por bus.
- **Concurrencia**: `writeQueues: Map<project_id, Promise>` serializa escrituras por proyecto.
- **Shape del archivo**:
  ```json
  {
    "_version": "1.0.0",
    "_updated": "ISO 8601",
    "manifiesto": {
      "valores": ["estacionalidad", "kilometro-cero"],
      "prohibido": ["azucar-procesado"],
      "tradicion_referencia": "cocina mediterranea de temporada",
      "notas_libres": ""
    },
    "prototipos": [
      {
        "id": "proto_<timestamp>_<rand>",
        "nombre": "Esferas de tomate de la huerta",
        "tags_creativos": ["estacionalidad", "tecnica-esferificacion"],
        "descripcion": "...",
        "receta_id_origen": null,
        "estado": "en_desarrollo",
        "iteraciones": [
          {
            "id": "iter-1",
            "anotacion": "Probamos con tomate raf, perfil mejor que con kumato.",
            "resultado": "aceptada",
            "timestamp": "ISO 8601"
          }
        ],
        "version": 1,
        "created_at": "ISO 8601",
        "updated_at": null
      }
    ]
  }
  ```

## Algoritmo de alineacion (determinista, sin LLM)

```
score = 50  // base neutral
for v in manifiesto.valores:
  if v aparece en tags_creativos o en nombre (case-insensitive): score += 10
for p in manifiesto.prohibido:
  if p aparece en tags_creativos o en nombre (case-insensitive): score -= 25
score = clamp(0, 100, score)
resaltan = [v en valores que aparecen]
disuenan = [p en prohibido que aparecen]
```

Justificacion: una heuristica simple es suficiente para v1.0.0. Si en el futuro se necesita evaluacion semantica, sera un agente especialista (ai-agent-framework) que use la tool, no logica de este modulo. Manteniendo aqui solo lo determinista preservamos la doctrina "modulo de dominio sin acoplamiento al LLM".

## Estado interno

- `this.projectBasePaths: Map<project_id, basePath>` — cache.
- `this.pendingProject: Map<request_id, {resolve, reject, timer}>` — `project.get.request` pendientes.
- `this.pendingFs: Map<request_id, {resolve, reject, timer}>` — `fs.*.request` pendientes.
- `this.writeQueues: Map<project_id, Promise>` — serializacion de escrituras por proyecto.

## Helpers POC2

5 heredados de BaseModule (`_errorResponse`, `_classifyHandlerError`, `_statusFromCode`, `_handleHandlerError`, `_enrich`) + override de `_publicarEvento` (anade `project_id` y `user_id` canonicos del subsistema antes de publicar).

Helpers de dominio:
- `_validarCrearPrototipo`, `_validarIterar`, `_validarEvaluarAlineacion`, `_validarManifiesto`.
- `_generarId(prefix)` — genera `proto_xxx` o `iter-N`.
- `_calcularAlineacion(objeto, manifiesto)` — algoritmo determinista descrito arriba.

Helpers de persistencia json-per-project (mismo patron que tecnicas):
- `_basePathForProject`, `_loadStore`, `_saveStore`, `_withStore`, `_readFile`, `_writeFile`.

## Lifecycle

- `onLoad(core)`: inyecta `logger`, `metrics`, `eventBus`; loguea `recetario-creativo.loaded`.
- `onUnload()`: limpia timers, vacia caches, evita leaks.

## Validaciones canonicas

Crear prototipo:
- `project_id` obligatorio.
- `nombre` obligatorio, string, 1-100 chars.
- `tags_creativos` opcional, array de strings (cada uno max 50 chars).
- `descripcion` opcional, string max 1000 chars.
- `receta_id_origen` opcional, string.

Iterar:
- `project_id`, `prototipo_id`, `anotacion` obligatorios.
- `anotacion` string max 1000 chars.
- `resultado` opcional, enum ['aceptada', 'rechazada', 'indeterminada'].

Evaluar alineacion:
- `project_id`, `objeto_tipo` obligatorios.
- `objeto_tipo` enum ['prototipo', 'receta'].
- Si `objeto_tipo='prototipo'`: `prototipo_id` obligatorio (se busca en el store).
- Si `objeto_tipo='receta'`: `receta_id`, `nombre` y `tags` obligatorios (los datos vienen del caller; el modulo no llama a recetas.obtener).

Actualizar manifiesto:
- `project_id`, `manifiesto` obligatorios.
- `manifiesto.valores` array opcional.
- `manifiesto.prohibido` array opcional.
- `manifiesto.tradicion_referencia` string opcional max 200 chars.
- `manifiesto.notas_libres` string opcional max 2000 chars.

Errores canonicos (catalogo `errors.json` v1.5.0):
- 400 `INVALID_INPUT` (con `details.field`).
- 404 `RESOURCE_NOT_FOUND` (con `details.entity_type: 'recipe-prototype'`).
- 504/503 `UPSTREAM_*` para timeouts/unreachable.

## Tests por capas (7 grupos)

1. **Lifecycle**: `onLoad` / `onUnload`.
2. **Validacion canonica**: crear sin project_id, sin nombre, sin tags, iterar sin anotacion, evaluar con objeto_tipo invalido, etc.
3. **Success crear prototipo**: publica `creativo.prototipo.creado` validado AJV.
4. **Success iterar**: publica `creativo.iteracion.registrada` validado AJV; incrementa contador.
5. **Success evaluar alineacion + manifiesto**: cruza con manifiesto, calcula score, publica `creativo.alineacion.validada` validado AJV; tests con valores/prohibido distintos.
6. **Bus handlers**: project.activated, fs.*.response.
7. **Helpers POC2**: `_publicarEvento` propaga correlation_id + project_id; `_calcularAlineacion` clamp 0-100, suma valores, resta prohibido.

## Criterio de cierre

- `tests/unit/recetario-creativo.test.js` verde.
- `npm run validate:ci` verde (sin drift NUEVO vs baseline).
- `module.json` con 3 `response_schema_ref` declarados.
- Subsistema-recetario.validate.js sin warnings nuevos: 6 publishes del subsistema con schema_ref validos (tecnicas: 2; recetario-creativo: 3; recetas y escandallo siguen pendientes de refactor).
