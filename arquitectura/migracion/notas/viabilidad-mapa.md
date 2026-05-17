# PASO 0 — mapa del modulo `viabilidad` (NUEVO, v1.0.0, POC2 canon subsistema-recetario)

Modulo NUEVO del horizontal del subsistema-recetario (septimo backend, anadido en v1.0.3 del sub-contrato). Reusa el patron POC2 ya validado seis veces: extends BaseModule + json-per-project via bus + 7 grupos de tests con validacion AJV strict.

**Contexto historico**: existe `viabilidad-mapa-prev-historico.md` de un intento anterior con scope distinto. Este mapa cubre la implementacion v1.0.0 que va al canon del subsistema-recetario.

**Por que existe**: hoy el flujo creativo arranca directo en `recetario-creativo` (creando un prototipo) sin filtro previo. Eso significa que se invierten iteraciones en ideas que despues se descartan por motivos economicos. `viabilidad` es la fase 0: dada una idea de producto (aun no receta), evalua economicamente si tiene sentido invertir tiempo en prototipar.

**Flujo del subsistema-recetario tras la incorporacion**:
```
IDEA  →  viabilidad evalua  →  recetario-creativo (prototipo)  →  iteraciones  →  recetas (canonico)  →  mise-en-place / pase-cocina
```

## Identidad

- **Slug**: `viabilidad`
- **Version**: v1.0.0 (NUEVO).
- **Language**: `es`.
- **Tier**: `tier_4_dominio`.
- **Subsistema**: `subsistema-recetario` v1.0.3 (este commit lo bumpea de v1.0.2 a v1.0.3).
- **Tipo canonico**: `evaluador_previo` (tipo nuevo del sub-contrato).
- **Dueno de**: expedientes de viabilidad por idea (audit trail antes de prototipar).

## Responsabilidad acotada

Evaluar economicamente una IDEA de producto antes de invertir tiempo en prototiparla. Calcula coste estimado a partir de ingredientes propuestos + food cost previsto si hay PVP objetivo. Veredicto deterministico (`viable` / `viable_con_advertencias` / `no_viable_economicamente` / `sin_pvp_objetivo`). Persiste expediente con audit trail; permite descartar explicitamente.

**Decision arquitectonica**: solo dimension ECONOMICA. Las dimensiones cualitativas (diferenciacion comercial, encaje en oferta, estilo) las decide el LLM principal que invoca la tool — el modulo no las toca. Las dimensiones operativas (tecnicas disponibles, estacionalidad) se delegan al caller que ya tiene esos catalogos. Esto mantiene el modulo determinista y aislado.

**No es**: un agente IA. Es una calculadora de viabilidad economica con audit trail.

## Publishes canonicos (2)

- `viabilidad.evaluacion.completada` tras evaluar una idea. Veredicto + coste estimado + food cost si aplica. Schema oficial: `arquitectura/decisiones/_schemas/subsistema-recetario/viabilidad.evaluacion.completada.schema.json`.
- `viabilidad.evaluacion.descartada` cuando el chef marca explicitamente un expediente como descartado (no es lo mismo que `veredicto='no_viable_economicamente'`; aquel es del modulo, este es decision humana). Schema oficial: `viabilidad.evaluacion.descartada.schema.json`.

Ambos cumplen shape AJV strict con campos canonicos del subsistema (`correlation_id`, `project_id`, `user_id`, `timestamp`).

## Subscribes

Solo lifecycle + tools — **NO consume eventos de dominio del subsistema** (decision arquitectonica: evaluacion a peticion, no reactiva).

- `project.activated` → `onProjectActivated`: cachea base_path.
- `project.get.response` → `onProjectGetResponse`.
- `fs.read.response` → `onFsReadResponse`.
- `fs.write.response` → `onFsWriteResponse`.

Tools invocadas por bus:
- `viabilidad.evaluar` → `onEvaluar`: evaluar una idea.
- `viabilidad.obtener` → `onObtener`: leer expediente por id.
- `viabilidad.listar` → `onListar`: listar expedientes (filtros opcionales).
- `viabilidad.descartar` → `onDescartar`: marcar como descartada.

## Persistencia

- **Patron**: `json-per-project`.
- **Path**: `data/projects/{slug}/viabilidad.json`.
- **Acceso**: via `fs.read.request` / `fs.write.request` por bus.
- **Concurrencia**: `writeQueues: Map<project_id, Promise>` (mismo patron que los 6 modulos previos).
- **Shape del archivo**:
  ```json
  {
    "_version": "1.0.0",
    "_updated_at": "ISO 8601",
    "expedientes": [
      {
        "id": "viab_<timestamp>_<rand>",
        "nombre_idea": "Postre con miso y chocolate",
        "ingredientes_estimados": [
          { "nombre": "miso", "cantidad": 0.02, "unidad": "kg" }
        ],
        "porciones": 4,
        "precio_venta_objetivo": 8.0,
        "coste_total": 1.50,
        "coste_por_porcion": 0.375,
        "coste_es_real": true,
        "food_cost_pct": 4.69,
        "veredicto": "viable",
        "advertencias": [],
        "ingredientes_sin_precio": [],
        "estado_expediente": "evaluada",
        "motivo_descarte": null,
        "created_at": "ISO 8601",
        "updated_at": "ISO 8601"
      }
    ]
  }
  ```

## Algoritmo de viabilidad (determinista, sin LLM)

```
coste_total = suma(ing.cantidad * precios_catalogo[ing.nombre]) si esta en catalogo
coste_es_real = todos los ingredientes propuestos tenian precio en catalogo
coste_por_porcion = coste_total / porciones

if precio_venta_objetivo > 0:
  food_cost_pct = coste_por_porcion / precio_venta_objetivo * 100
  if food_cost_pct > umbral_alerta (35%):     veredicto = 'no_viable_economicamente'
  elif food_cost_pct > umbral_advertencia (30%): veredicto = 'viable_con_advertencias'
  else:                                        veredicto = 'viable'
else:
  veredicto = 'sin_pvp_objetivo'  (informativo)

advertencias[] += "food cost al limite" si umbral_advertencia < food_cost_pct <= umbral_alerta
advertencias[] += "ingredientes sin precio: X, Y" si ingredientes_sin_precio.length > 0
```

Mismos umbrales por defecto que `escandallo` (coherencia cross-modulo del subsistema): `food_cost_umbral_alerta=35%`, `food_cost_umbral_advertencia=30%`. Ambos configurables.

## Estados del expediente

- `evaluada` — acaba de pasar `viabilidad.evaluar`.
- `descartada` — chef marco con `viabilidad.descartar`. NO se borra del archivo (audit trail).

Si en el futuro se quiere "promocionar" (idea pasa a `recetario-creativo` o `recetas`), seria un evento adicional `viabilidad.evaluacion.promocionada` no implementado en v1.0.0 — la promocion la hace el LLM invocando `creativo.prototipo.crear` directamente.

## Helpers POC2

5 heredados de BaseModule + override `_publicarEvento` con `project_id` + `user_id` canonicos.

Helpers de dominio:
- `_validarEvaluar`, `_validarDescartar`.
- `_generarId(prefix)` — `viab_<timestamp>_<hex6>`.
- `_calcularViabilidad(ingredientes, precios_catalogo, porciones, precio_venta_objetivo)`.

Helpers de persistencia: `_basePathForProject`, `_loadStore`, `_saveStore`, `_withStore`, `_readOnly`, `_readFile`, `_writeFile`.

## Validaciones canonicas

Evaluar:
- `project_id`, `nombre_idea`, `ingredientes_estimados`, `porciones`, `precios_catalogo` obligatorios.
- `nombre_idea` string 1-200 chars.
- `porciones` integer >= 1.
- `ingredientes_estimados` array no vacio.
- `precios_catalogo` plain object.
- `precio_venta_objetivo` opcional, number > 0 si presente.

Descartar:
- `project_id`, `expediente_id`, `motivo` obligatorios.

Errores canonicos:
- 400 `INVALID_INPUT` (con `details.field`).
- 404 `RESOURCE_NOT_FOUND` (con `details.entity_type: 'viability-record'`).
- 409 `CONFLICT_STATE` si ya esta descartada.

## Tests por capas (7 grupos)

1. **Lifecycle**: onLoad / onUnload.
2. **Validacion canonica**: cada tool con field invalido.
3. **Success evaluar con PVP**: 3 veredictos (viable / con advertencias / no viable) + publish AJV strict.
4. **Success evaluar sin PVP**: veredicto `sin_pvp_objetivo`.
5. **Success obtener / listar**: filtros por veredicto / estado.
6. **Success descartar**: transicion + publish `evaluacion.descartada` AJV strict.
7. **Helpers POC2**: `_publicarEvento` + `_calcularViabilidad` (umbrales exactos).

## Criterio de cierre

- `tests/unit/viabilidad.test.js` verde.
- `npm run validate:ci` verde.
- `module.json` con 2 `response_schema_ref`.
- subsistema-recetario.validate.js PASS sin findings.
- Sub-contrato v1.0.3 publicado.

## Estado del horizontal tras este modulo

```
Backend (7/7 ✓):
  ✓ tecnicas              v1.0.0
  ✓ recetario-creativo    v1.0.0
  ✓ pase-cocina           v1.0.0
  ✓ mise-en-place         v1.0.0
  ✓ escandallo            v4.0.0
  ✓ recetas               v4.0.0
  + viabilidad            v1.0.0  ← este modulo

Frontend (0/1):
  ☐ frontend-recetario
```
