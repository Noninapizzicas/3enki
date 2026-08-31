# PASADA 2 — DISECCIÓN del módulo `mise-en-place` (reflejo-1.0.0)

> Verificación estricta en código: cada claim contra la línea real del index.js
> y el module.json. Confirmar los `ui.roles` existentes y dejar la composición
> del panel del jefe sólida. Fuente: modules/mise-en-place/index.js (1175
> líneas, leídas enteras) + module.json (10 ui_handlers).

## Lente de ROLES — veredicto del árbitro sobre las ops

| Op (ui_handlers) | Línea index.js | ¿Qué hace? | Rol del árbitro |
|---|---|---|---|
| `escalado.calcular` | L234 `onCalcularEscalado` | Escala la receta a porciones_destino (factor), persiste histórico `escalados[]`, NO toca la receta | **JEFE** |
| `plan.publicar` | L291 `onPublicarPlan` | Publica el plan (líneas receta×porciones×franja, horizonte), persiste `planes[]`, nace `propuesto` | **JEFE** |
| `compra.calcular` | L350 `onCalcularCompra` | Consolida la lista de compra agregando por (ingrediente,unidad) con merma, persiste `compras[]` | **JEFE** |
| `plan.obtener` | L401 `onObtenerPlan` | Lee un plan por id (404 si no existe) | neutro |
| `planes.listar` | L419 `onListarPlanes` | Lista los planes del proyecto | neutro |
| `retroplanning.calcular` | L444 `onCalcularRetroplanning` | Conversor puro: ventana de producción (no persiste) | neutro (motor) |
| `plan.aprobar` | L515/`_transicionarPlanRequest` | Transición propuesto→aprobado | jefe (dispara la máquina) |
| `plan.ejecutar` | L519 | Transición aprobado→en_ejecucion | jefe (dispara la máquina) |
| `plan.cerrar` | L523 | Transición en_ejecucion→cerrado | jefe (dispara la máquina) |
| `agrupar_tandas` | L483 `onAgruparTandas` | Conversor puro: agrupa líneas en tandas de masa (no persiste) | neutro (motor) |

**Veredicto del árbitro (sobre la DECLARACIÓN que decide el futuro de la
producción):**
- **jefe (3)**: `escalado.calcular` (cuánto de cada ingrediente para el día),
  `plan.publicar` (LA DECLARACIÓN del plan), `compra.calcular` (la lista de
  compra).
- **neutro (lecturas/motor)**: `plan.obtener`, `planes.listar`, `recetas.*`
  (listar/obtener para el ref-select). `retroplanning.calcular`, `agrupar_tandas`
  son conversores puros del motor (cálculo, no declaración) — rol jefe en
  contrato, pero no son la hoja primaria del panel de este ciclo.
- **transiciones de estado** (plan.aprobar/ejecutar/cerrar): el jefe las dispara;
  avanzan un plan ya publicado. Son secundarias aquí (el plan nace propuesto y la
  producción lo avanza).

## Confirmación de los roles existentes

El blueprint (v2.0.0 heredado) traía:

```
ui.roles { escalado.calcular: jefe, plan.publicar: jefe, compra.calcular: jefe,
plan.obtener: neutro, planes.listar: neutro, retroplanning.calcular: jefe,
plan.aprobar: jefe, plan.ejecutar: jefe, plan.cerrar: jefe, agrupar_tandas: jefe }
```

**Se CONFIRMAN correctos** contra el código. El bloque de "transiciones/motor"
(aprobar/ejecutar/cerrar/retroplanning/agrupar) es jefe/neutro según contrato,
pero la hoja de DECLARACIÓN primaria del panel es la tríada
`escalado.calcular → plan.publicar → compra.calcular`. Falta el andamiaje v2
(`_lente_roles`, `formas_jefe`, `_verificado_en_codigo`, `_doc_historico`).

## Señales (verificadas en index.js)

| Declaración | Señal (publish real `_publicarEvento`) | Línea |
|---|---|---|
| `escalado.calcular` | `produccion.escalado.calculado` | L272 → `_publicarEvento` L587 |
| `plan.publicar` | `produccion.plan.publicado` | L332 |
| `compra.calcular` | `produccion.compra.calculada` | L382 |
| plan.aprobar/ejecutar/cerrar | `produccion.plan.estado.avanzado` | L570 |

Las lecturas (`plan.obtener`, `planes.listar`, `recetas.*`) NO emiten señal —
neutras. El dictamen del escalado/compra viene EN LA RESPUESTA RPC (201 con los
datos calculados); la señal confirma y re-lee (`planes.listar`).

## Formas del panel del jefe (3 capas)

1. **SELECCIONAR** — ref-select de servicio/día (franja) y de receta (desde
   `recetas.listar`).
2. **CALCULAR / INFORMARSE** — editor de escalado: receta + porciones_origen +
   porciones_destino → `escalado.calcular { receta_id, porciones_origen,
   porciones_destino, ingredientes }` (ingredientes traídos de la receta por
   `recetas.obtener`). Tabla de escalado: cada ingrediente × factor para el
   volumen objetivo.
3. **DECLARAR** — plan.publicar (confirmador-nombrado: qué recetas, franjas,
   horizonte) y compra.calcular (dictamen de lista de la compra agregando los
   escalados).

**Confirmador-nombrado para `plan.publicar`**: como publica un plan que la
producción lee, el gesto NOMBRA qué recetas y en qué franjas/publicará y a quién
afecta (la producción del servicio), antes de disparar. **`compra.calcular`** es
dictamen: agrega los ingredientes escalados elegidos y muestra la lista de la
compra resultante (items por ingrediente+unidad con cantidad_neta).

## Ref-select de recetas (materia del escalado)

`recetas.listar` (neutro, módulo recetas/pizzepos) → `{ recetas[]{ receta_id,
nombre, rinde, lineas[] } }`. La UI usa `recetas.obtener { receta_id }` para
traer `lineas[]` (los `ingredientes` que `escalado.calcular` pide). El rinde de
la receta alimenta `porciones_origen`.

## Multi-tenant (lección bug escandallo)

TODO RPC lleva `project_id` (leído de `get(activeProjectId)` y pasado en cada
llamada — `escalado.calcular`, `plan.publicar`, `compra.calcular`,
`recetas.listar/obtener`, `planes.listar`). Guard si no hay proyecto activo.
