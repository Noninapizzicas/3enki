# PASO 0 — mapa del modulo `mise-en-place`

Modulo NUEVO (no refactor). Cuarto y ultimo modulo nuevo del horizontal del subsistema-recetario. Cierra el bloque de modulos backend nuevos (tras tecnicas, recetario-creativo y pase-cocina). Mismo patron POC2 validado: extends BaseModule + json-per-project + 7 grupos de tests.

## Identidad

- **Slug**: `mise-en-place`
- **Language**: `es`
- **Tier**: `tier_4_dominio`
- **Subsistema**: `subsistema-recetario` (v1.0.1)
- **Tipo canonico**: planificacion de produccion (escalado, plan, compra).
- **Dueno de**: planes de produccion del proyecto, escalados calculados de recetas, listas de compra consolidadas.

## Responsabilidad acotada

Mise-en-place es el modulo de planificacion previa al servicio. Calcula escalados de recetas a porciones objetivo, materializa planes de produccion (que recetas en que franja/dia con cuantas porciones), consolida listas de compra agregando ingredientes a lo largo de un horizonte. Es donde "una receta para 4 porciones" se convierte en "tengo que producir 24 porciones esta semana y comprar X kilos de tomate".

Importante: el prefix canonico de los 3 eventos del modulo es `produccion.*` (no `mise.*`). Decision del sub-contrato — `produccion` es termino universal en cocina profesional. El slug del modulo es `mise-en-place` porque encapsula el concepto cross-modulo del glossary.

## Publishes canonicos

- `produccion.escalado.calculado` cuando se calcula el escalado de una receta a nuevas porciones. Schema oficial: `arquitectura/decisiones/_schemas/subsistema-recetario/produccion.escalado.calculado.schema.json`.
- `produccion.plan.publicado` cuando el jefe publica un plan de produccion. Schema oficial: `produccion.plan.publicado.schema.json`.
- `produccion.compra.calculada` cuando se consolida la lista de compra de un horizonte. Schema oficial: `produccion.compra.calculada.schema.json`.

Todos cumplen shape AJV strict (`additionalProperties:false`) con campos canonicos del subsistema.

## Subscribes

Lifecycle del proyecto + persistencia (mismo patron):

- `project.activated` → `onProjectActivated`.
- `project.get.response` → `onProjectGetResponse`.
- `fs.read.response` → `onFsReadResponse`.
- `fs.write.response` → `onFsWriteResponse`.

Tools invocadas por bus:

- `produccion.escalado.calcular` → `onCalcularEscalado`: calcular escalado de receta.
- `produccion.plan.publicar` → `onPublicarPlan`: materializar plan de produccion.
- `produccion.compra.calcular` → `onCalcularCompra`: consolidar lista de compra del horizonte.
- `produccion.plan.obtener` → `onObtenerPlan`: leer plan por id.
- `produccion.planes.listar` → `onListarPlanes`: listar planes del proyecto.

## Tools expuestas (5)

Todas con `project_id` obligatorio. Retorno canonico `{status, data | error: {code, message, details?}}`.

## Persistencia

- **Patron**: `json-per-project`.
- **Path**: `data/projects/{slug}/mise-en-place.json`.
- **Shape del archivo**:
  ```json
  {
    "_version": "1.0.0",
    "_updated": "ISO 8601",
    "planes": [
      {
        "id": "plan_<timestamp>_<rand>",
        "horizonte_desde": "2026-05-17T00:00:00.000Z",
        "horizonte_hasta": "2026-05-24T00:00:00.000Z",
        "lineas": [
          { "receta_id": "rec_xxx", "porciones": 24, "franja": "cena", "dia": "2026-05-18" }
        ],
        "created_at": "ISO 8601"
      }
    ],
    "escalados": [
      {
        "id": "esc_<timestamp>_<rand>",
        "receta_id": "rec_xxx",
        "porciones_origen": 4,
        "porciones_destino": 24,
        "factor": 6.0,
        "ingredientes_escalados": [
          { "nombre": "tomate", "cantidad": 12.0, "unidad": "kg" }
        ],
        "created_at": "ISO 8601"
      }
    ],
    "compras": [
      {
        "id": "compra_<timestamp>_<rand>",
        "horizonte": { "tipo": "semana", "desde": "...", "hasta": "...", "etiqueta": "..." },
        "recetas_consideradas": [...],
        "items": [
          { "ingrediente": "tomate", "cantidad_neta": 15.0, "cantidad_compra": 16.0, "unidad": "kg", "merma_pct": 5 }
        ],
        "created_at": "ISO 8601"
      }
    ]
  }
  ```

## Algoritmos

### Escalado lineal proporcional

```
factor = porciones_destino / porciones_origen
para cada ingrediente:
  cantidad_nueva = cantidad_original * factor
```

Simple y determinista. NO aplica redondeos automaticos — la receta canonica conoce su unidad y precision, el caller decidira si redondear.

### Consolidacion de compra

El caller pasa cada receta con `{receta_id, porciones, ingredientes: [{nombre, cantidad, unidad, merma_pct?}]}` donde `cantidad` ES la cantidad para ESAS porciones (el caller ya hizo el escalado o tiene los datos para esas porciones). El modulo:

```
para cada receta del horizonte:
  para cada ingrediente:
    clave = (nombre.toLowerCase(), unidad)
    cantidad_efectiva = cantidad * (1 + merma_pct/100) si merma_pct, sino cantidad
    acumular en items[clave].cantidad_neta
para cada item agregado:
  redondear hacia arriba a la unidad de compra del catalogo (futuro — v1.0.0 omite cantidad_compra)
```

`cantidad_compra` y `merma_pct` son opcionales en el schema → v1.0.0 publica `cantidad_neta` agregada; `cantidad_compra` queda fuera (extension futura cuando exista catalogo de unidades de compra).

## Estado interno

- `this.projectBasePaths`, `this.pendingProject`, `this.pendingFs`, `this.writeQueues` — igual patron que los modulos previos.

## Helpers POC2

5 heredados de BaseModule + override `_publicarEvento` para anadir `project_id` y `user_id` canonicos.

Helpers de dominio:
- `_validarEscalado`, `_validarPlan`, `_validarCompra`.
- `_generarId(prefix)` — genera `plan_xxx`, `esc_xxx`, `compra_xxx`.
- `_calcularEscalado(receta, porciones_destino)` — factor + ingredientes nuevos.
- `_agregarCompra(recetas)` — agregacion por (nombre, unidad) con merma opcional.

Helpers de persistencia: `_basePathForProject`, `_loadStore`, `_saveStore`, `_withStore`, `_readFile`, `_writeFile`.

## Validaciones canonicas

Escalado:
- `project_id`, `receta_id`, `porciones_origen` (int>=1), `porciones_destino` (int>=1) obligatorios.
- `ingredientes` array no vacio de `{nombre, cantidad, unidad}`.
- `cantidad` number > 0 en cada ingrediente.

Plan:
- `project_id`, `horizonte_desde`, `horizonte_hasta` (ISO 8601 date-time) obligatorios.
- `lineas` array no vacio.
- Cada linea: `receta_id`, `porciones` (int>=1), `franja` enum 5 valores.
- `dia` opcional (ISO 8601 date).

Compra:
- `project_id`, `horizonte.tipo` (enum 5 valores) obligatorios.
- `recetas` array no vacio.
- Cada receta: `receta_id`, `porciones` (int>=1), `ingredientes` array no vacio.
- Cada ingrediente: `nombre`, `cantidad` (number>=0), `unidad`. `merma_pct` opcional 0-100.

Errores canonicos:
- 400 `INVALID_INPUT` (con `details.field` o `details.allowed`).
- 404 `RESOURCE_NOT_FOUND` (con `details.entity_type: 'production-plan'`).

## Tests por capas (7 grupos)

1. **Lifecycle**.
2. **Validacion canonica**: cada tool con field invalido.
3. **Success escalado**: factor + cantidades + publish AJV.
4. **Success plan**: lineas + publish AJV.
5. **Success compra**: agregacion + merma + publish AJV.
6. **Bus handlers + obtener/listar planes**.
7. **Helpers POC2**: `_calcularEscalado` factor exacto, `_agregarCompra` suma + merma + agrupacion por (nombre, unidad).

## Criterio de cierre

- `tests/unit/mise-en-place.test.js` verde.
- `npm run validate:ci` verde.
- `module.json` con 3 `response_schema_ref`.
- **4/5 modulos backend nuevos del horizontal cerrados** (tecnicas + recetario-creativo + pase-cocina + mise-en-place). Solo quedan los 2 refactors (recetas + escandallo) y el frontend.
