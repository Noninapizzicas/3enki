# PASO 0 — mapa del modulo `pase-cocina`

Modulo NUEVO (no refactor). Tercer modulo nuevo del horizontal del subsistema-recetario (tras tecnicas y recetario-creativo). Reusa el patron POC2 ya validado dos veces: extends BaseModule + json-per-project + tests por capas.

## Identidad

- **Slug**: `pase-cocina`
- **Language**: `es`
- **Tier**: `tier_4_dominio`
- **Subsistema**: `subsistema-recetario` (v1.0.1)
- **Tipo canonico**: modulo del servicio (registro operativo en tiempo real).
- **Dueno de**: fichas de pase (snapshot operativo de la receta para el servicio), incidencias del servicio, sustituciones de emergencia.

## Responsabilidad acotada

Pase-cocina es el modulo cara-al-servicio. Materializa una ficha de pase a partir de una receta en_servicio (con `version_receta` snapshot al momento de creacion), registra incidencias durante el servicio (rotura, queja, falta de genero, etc.) y sustituciones de emergencia (sin albahaca → cilantro).

Filosofia del sub-contrato: "Pase-cocina NO toma decisiones reactivas — solo registra; el chef/jefe lo revisan post-servicio". El modulo NO modifica recetas canonicas; las sustituciones viven en la ficha de pase como anotaciones del servicio.

Tampoco accede a recetas via cross-modulo: el caller pasa `receta_id`, `version_receta` y `nombre` cuando crea la ficha (denormalizacion controlada documentada en el sub-contrato).

## Publishes canonicos

- `pase.ficha.creada` cuando se materializa una ficha de pase para una receta en_servicio. Schema oficial: `arquitectura/decisiones/_schemas/subsistema-recetario/pase.ficha.creada.schema.json`.
- `pase.incidencia.registrada` cuando el cocinero reporta una incidencia durante el servicio (8 tipos canonicos del enum). Schema oficial: `pase.incidencia.registrada.schema.json`.
- `pase.sustitucion.registrada` cuando se sustituye un ingrediente en una ficha activa. Schema oficial: `pase.sustitucion.registrada.schema.json`.

Todos cumplen shape AJV strict (`additionalProperties:false`) con campos canonicos del subsistema (`correlation_id`, `project_id`, `user_id`, `timestamp` + identificadores y datos especificos).

## Subscribes

Lifecycle del proyecto + persistencia (mismo patron que tecnicas y recetario-creativo):

- `project.activated` → `onProjectActivated`.
- `project.get.response` → `onProjectGetResponse`.
- `fs.read.response` → `onFsReadResponse`.
- `fs.write.response` → `onFsWriteResponse`.

Tools invocadas por bus:

- `pase.ficha.crear` → `onCrearFicha`: materializar ficha de pase.
- `pase.incidencia.registrar` → `onRegistrarIncidencia`: registrar incidencia.
- `pase.sustitucion.registrar` → `onRegistrarSustitucion`: registrar sustitucion en ficha.
- `pase.ficha.obtener` → `onObtenerFicha`: leer una ficha completa.
- `pase.fichas.listar` → `onListarFichas`: listar fichas del proyecto (filtro opcional por servicio o estado).

Decision: NO consume `receta.*` reactivamente. Coherente con tecnicas y recetario-creativo y con la filosofia del modulo "solo registra".

## Tools expuestas (5)

Todas con `project_id` obligatorio. Retorno canonico `{status, data | error: {code, message, details?}}`. Error codes solo del catalogo:
- 400 `INVALID_INPUT` (con `details.field`).
- 404 `RESOURCE_NOT_FOUND` (con `details.entity_type: 'pass-card'`).
- 422 `PRECONDITION_FAILED` para precondiciones del dominio (registrar incidencia/sustitucion sobre ficha cerrada — futuro).

## Persistencia

- **Patron**: `json-per-project`.
- **Path**: `data/projects/{slug}/pase-cocina.json`.
- **Acceso**: via `fs.read.request` / `fs.write.request` por bus.
- **Concurrencia**: `writeQueues: Map<project_id, Promise>` serializa escrituras por proyecto.
- **Shape del archivo**:
  ```json
  {
    "_version": "1.0.0",
    "_updated": "ISO 8601",
    "fichas": [
      {
        "id": "ficha_<timestamp>_<rand>",
        "receta_id": "rec_xxx",
        "version_receta": 3,
        "nombre": "Tomate de la huerta con esferas de mozzarella",
        "servicio": "2026-05-17-cena",
        "estado": "activa",
        "incidencias": [
          {
            "id": "inc_xxx",
            "tipo": "rotura_genero",
            "descripcion": "Lote de tomate roto",
            "severidad": "media",
            "timestamp": "ISO 8601"
          }
        ],
        "sustituciones": [
          {
            "id": "sust_xxx",
            "ingrediente_original": "albahaca",
            "ingrediente_sustituto": "cilantro",
            "cantidad": 0.05,
            "unidad": "kg",
            "motivo": "rotura_genero",
            "timestamp": "ISO 8601"
          }
        ],
        "created_at": "ISO 8601",
        "closed_at": null
      }
    ]
  }
  ```

## Estado interno

- `this.projectBasePaths: Map<project_id, basePath>`.
- `this.pendingProject: Map<request_id, {resolve, reject, timer}>`.
- `this.pendingFs: Map<request_id, {resolve, reject, timer}>`.
- `this.writeQueues: Map<project_id, Promise>`.

## Helpers POC2

5 heredados de BaseModule (`_errorResponse`, `_classifyHandlerError`, `_statusFromCode`, `_handleHandlerError`, `_enrich`) + override de `_publicarEvento` (anade `project_id` y `user_id` canonicos antes de publicar).

Helpers de dominio:
- `_validarCrearFicha`, `_validarIncidencia`, `_validarSustitucion`.
- `_generarId(prefix)` — genera `ficha_xxx`, `inc_xxx`, `sust_xxx`.

Helpers de persistencia (mismo patron que tecnicas/recetario-creativo):
- `_basePathForProject`, `_loadStore`, `_saveStore`, `_withStore`, `_readFile`, `_writeFile`.

## Lifecycle

- `onLoad(core)`: inyecta `logger`, `metrics`, `eventBus`; loguea `pase-cocina.loaded`.
- `onUnload()`: limpia timers, vacia caches.

## Validaciones canonicas

Crear ficha:
- `project_id`, `receta_id`, `version_receta` (entero >= 1), `nombre`, `servicio` obligatorios.
- `nombre` string max 200 chars.
- `servicio` string max 100 chars.

Registrar incidencia:
- `project_id`, `ficha_pase_id`, `tipo`, `descripcion` obligatorios.
- `tipo` enum de 8 valores canonicos del schema (rotura_genero, rotura_equipamiento, queja_cliente, falta_ingrediente, error_coccion, tiempo_excedido, alergia_no_declarada, otro).
- `descripcion` string max 1000 chars.
- `severidad` opcional, enum 4 valores (baja, media, alta, critica).

Registrar sustitucion:
- `project_id`, `ficha_pase_id`, `ingrediente_original`, `ingrediente_sustituto`, `motivo` obligatorios.
- `ingrediente_original`, `ingrediente_sustituto` string max 100 chars.
- `motivo` string max 500 chars.
- `cantidad` opcional, number >= 0.
- `unidad` opcional, string.

Errores:
- 400 `INVALID_INPUT` (con `details.field` o `details.allowed` para enums).
- 404 `RESOURCE_NOT_FOUND` (con `details.entity_type: 'pass-card'`, `details.entity_id`).

## Tests por capas (7 grupos)

1. **Lifecycle**: `onLoad` / `onUnload`.
2. **Validacion canonica**: ausencia de obligatorios, tipo invalido, severidad invalida, etc.
3. **Success crear ficha**: publica `pase.ficha.creada` con AJV strict.
4. **Success incidencia**: publica `pase.incidencia.registrada` con AJV strict; tipos del enum.
5. **Success sustitucion**: publica `pase.sustitucion.registrada` con AJV strict.
6. **Bus handlers + persistencia + obtener/listar**: project + fs + read tools.
7. **Helpers POC2**: `_publicarEvento` propaga correlation_id + project_id + user_id; canon de prefijos de id.

## Criterio de cierre

- `tests/unit/pase-cocina.test.js` verde.
- `npm run validate:ci` verde (sin drift NUEVO vs baseline).
- `module.json` con 3 `response_schema_ref` declarados.
- 3/5 modulos backend nuevos del horizontal cerrados (tecnicas + recetario-creativo + pase-cocina).
