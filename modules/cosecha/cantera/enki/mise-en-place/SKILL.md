---
name: mise-en-place
description: Planificación previa al servicio — escalado de recetas, planes de producción con ciclo de vida (propuesto→aprobado→en_ejecucion→cerrado), retroplanning (ventana de producción desde la señal de demanda), consolidación de lista de compra y agrupación de líneas en tandas de masa. Subsistema-recetario, prefijo de eventos produccion.*.
when_to_use: Cuando el jefe de cocina necesite planificar un servicio (qué recetas, en qué franja, con cuántas porciones), escalar una receta a N porciones, saber CUÁNDO producir para servir en X, consolidar la compra de un horizonte, aprobar/ejecutar/cerrar un plan, o agrupar la demanda en tandas de masa para el amasado.
tags: [produccion, planificacion, recetas, escalado, retroplanning, compra, tandas, masa, mise-en-place, subsistema-recetario]
dominio: subsistema-recetario
version: 1.0.0
---

# mise-en-place — Planificación previa al servicio

## Contrato (JSON)

```json
{
  "esquema": "modulo-mise-en-place-v1.0.0",
  "prefijo_eventos": "produccion.*",
  "persistencia": "json-per-project (data/projects/{slug}/mise-en-place.json)",
  "conversor_puro": ["retroplanning.calcular", "agrupar_tandas"],
  "sin_acceso_cross_module": "el caller pasa los datos de las recetas (escalado, compra); el módulo NO consulta recetas"
}
```

## RPCs (tools del módulo)

| RPC | Qué hace | Errores conocidos |
|---|---|---|
| `produccion.escalado.calcular` | Escalado lineal: factor = destino/origen, cada cantidad × factor. NO modifica la receta canónica. Persiste el escalado. | INVALID_INPUT, UPSTREAM_TIMEOUT, UPSTREAM_UNREACHABLE |
| `produccion.plan.publicar` | Crea plan (estado inicial `propuesto`) con líneas {receta_id, porciones, franja} + horizonte. plan_id opcional (si no, `plan_xxx`). | INVALID_INPUT, UPSTREAM_TIMEOUT |
| `produccion.compra.calcular` | Consolida lista de compra: agrega por (ingrediente, unidad), aplica merma_pct si viene (cantidad × (1 + merma/100)). Persiste la compra. | INVALID_INPUT, UPSTREAM_TIMEOUT |
| `produccion.plan.obtener` | Lee plan por id con su estado. | INVALID_INPUT, RESOURCE_NOT_FOUND |
| `produccion.planes.listar` | Lista planes (resumen: horizonte, total_lineas, created_at). | INVALID_INPUT, UPSTREAM_TIMEOUT |
| `produccion.retroplanning.calcular` | Ventana de producción por receta: servicio − ventana.max → servicio − ventana.min, recomendada = punto medio. Pide la ventana de maduración a masa (masa.reglas.leer); si no responde, defaults 24/72h y lo declara en `ventana.fuente`. Conversor puro: no persiste. | INVALID_INPUT, UPSTREAM_TIMEOUT |
| `produccion.plan.aprobar` | Transición propuesto → aprobado. Solo el dueño (quien invoca) aprueba. | INVALID_INPUT, RESOURCE_NOT_FOUND, CONFLICT_STATE |
| `produccion.plan.ejecutar` | Transición aprobado → en_ejecucion (hoy: se produce). | INVALID_INPUT, RESOURCE_NOT_FOUND, CONFLICT_STATE |
| `produccion.plan.cerrar` | Transición en_ejecucion → cerrado (producido; las tandas siguen vivas en lotes). | INVALID_INPUT, RESOURCE_NOT_FOUND, CONFLICT_STATE |
| `produccion.agrupar_tandas` | Agrupa líneas en tandas de masa: pide gramaje (masa.gramaje.calcular) y rendimiento (masa.rendimiento.calcular); si masa no responde, defaults config (33cm, 280 g, 10 kg) y declara `fuente: config_default`. Empaqueta por franja (first-fit decreasing). Conversor puro. | INVALID_INPUT, UPSTREAM_TIMEOUT |

## Ciclo de vida del plan (state machine cerrada)

```
propuesto → aprobado → en_ejecucion → cerrado
```

- Transición no permitida o ya-en-estado → `CONFLICT_STATE` (409) con `estado_actual` y `transiciones_permitidas`.
- Precondición M3: aprobar requiere `decision_pendiente` vacía (si hay decisiones sin confirmar → 409).
- Migración: planes previos al cambio de shape (sin `estado`) se leen como `propuesto` (`_normalizarPlan`).
- El evento `produccion.plan.estado.avanzado` lleva `desde` y `hacia`.

## Eventos que publica

| Evento | Cuándo |
|---|---|
| `produccion.escalado.calculado` | Se calculó el escalado de una receta. |
| `produccion.plan.publicado` | El jefe publicó un plan. |
| `produccion.compra.calculada` | Se consolidó la lista de compra. |
| `produccion.retroplanning.calculado` | Se calculó la ventana de producción. |
| `produccion.tandas.agrupadas` | Se agruparon líneas en tandas de masa. |
| `produccion.plan.estado.avanzado` | El plan cambió de estado (con desde/hacia). |

Todos los eventos llevan correlation_id (propagado del caller o UUID nuevo), project_id y user_id canónicos.

## Reglas vivas

- R1 — Franjas válidas: `desayuno (9h) · comida (14h) · merienda (17.5h) · cena (21h) · all_day (13h)`; la franja fija la hora del servicio para el retroplanning.
- R2 — Retroplanning con degradación honesta: si masa no responde, defaults 24-72h y `ventana.fuente: 'config_default'` — nunca se inventa una ventana sin declarar la fuente.
- R3 — Agrupación con degradación honesta: si masa no responde, defaults (280 g/pieza, tanda 10 kg → bolas_por_tanda = floor(kg×1000/gramaje)) y `fuente: 'config_default'`.
- R4 — Escalado y compra persisten (historial en el store); retroplanning y agrupación son conversores puros (no persisten).
- R5 — Escrituras serializadas por proyecto (write queue): dos mutaciones concurrentes al mismo store no se pisan.
- R6 — Sin acceso cross-module: para costear/escalar, el caller SIEMPRE pasa los ingredientes con cantidades (escalado) o los ya-escalados (compra).

## Errores canónicos

- `INVALID_INPUT` (400): validaciones tipadas — porciones entero ≥ 1, receta_id string no vacío, franja del enum, ingredientes array no vacío con nombre/cantidad/unidad.
- `RESOURCE_NOT_FOUND` (404): plan inexistente (entity_type `production-plan`).
- `CONFLICT_STATE` (409): transición no permitida, ya-en-estado, o decision_pendiente sin confirmar al aprobar.
- `UPSTREAM_TIMEOUT` / `UPSTREAM_UNREACHABLE`: project.get, fs.read/write o masa no responden.

## Detalle de algoritmos (pseudocódigo)

```
CLASE Retroplanning {
  METODO calcular(fecha_servicio, franja, lineas):
    servicio ← resolverInstante(fecha_servicio, franja)   // franja fija la hora (UTC)
    ventana  ← masa.reglas.leer() ?? defaults(24, 72)     // min_horas, max_horas
    PARA cada linea:
      desde       ← servicio − ventana.max_horas          // lo más pronto
      hasta       ← servicio − ventana.min_horas          // lo más tarde (margen mínimo)
      recomendada ← servicio − (min+max)/2                // punto medio
      dentro_de_plazo ← hasta > ahora
    ORDENAR por recomendada
}

CLASE AgrupacionTandas {
  METODO agrupar(lineas, formato?, tamano_tanda_kg?):
    gramaje ← masa.gramaje.calcular(formato) ?? 280 g     // por pieza
    bolas   ← masa.rendimiento.calcular(formato, kg) ?? floor(kg×1000/gramaje)
    fuente  ← masa respondió ? 'masa' : 'config_default'
    lineas → bolas (1 porción = 1 bola)
    ORDENAR por franja, luego porciones desc (first-fit decreasing)
    PARA cada linea: si cabe en la tanda abierta de su franja → añadir
    SINO: abrir tanda nueva {tanda_id, formato, franja, bolas, gramos_masa, capacidad_bolas, lineas}
    RETORNAR {formato, tamano_tanda_kg, gramaje_pieza_gramos, bolas_por_tanda, fuente, tandas, resumen}
}
```

## Observabilidad

- Counters: `mise-en-place.{escalado.calculado, plan.publicado, compra.calculada, retroplanning.calculado, tandas.agrupadas, plan.estado.avanzado}.total` + `mise-en-place.errors` + `mise-en-place.publish_error`.
- Gauge: `mise-en-place.planes.count`.
- Timing: `mise-en-place.compra.duration`.

## Pitfalls

- `produccion.plan.aprobar` NO salta estados: un plan `propuesto` no se puede cerrar; hay que pasarlo por aprobado → en_ejecucion → cerrado (o el 409 lo recuerda).
- Si el plan tiene `decision_pendiente` no vacía, aprobar falla — resolver/confirmar las decisiones primero.
- Retroplanning y agrupación dependen de masa: si el módulo masa no está cargado, responden con defaults y lo DECLARAN (fuente) — no lo ocultan.
- Un plan viejo (sin campo estado) se comporta como `propuesto` — no es un bug, es la migración.
- `all_day` no es "sin hora": sirve a las 13h para el retroplanning.
- Para compra: la merma se aplica por ingrediente al agregar (primer merma_pct visto por (nombre,unidad) se preserva); no dobles la merma al pasar los datos.
