# PASADA 2 — disección hoja a hoja con FORMA UI · cara del JEFE de `viabilidad`

> El árbol de la pasada-1 prisado hasta hojas atómicas (agente de UI puede
> DIBUJARLAS). Cada hoja-jefe lleva su forma de captura y su señal pareada.
> Ley: si una hoja aún describe "una experiencia", sigue prismando.

## Árbol bajado a hojas

```
EVALUADOR ECONÓMICO (el freno: ¿es viable en coste/margen antes de lanzar?)
├─ H1 · ELEGIR LA RECETA/PRODUCTO ......... ref-select (recetas.listar → receta_id)
├─ H2 · FIJAR EL PVP OBJETIVO (opcional) .. inline-gesture (cifra; si vacío → pvp_sugerido)
├─ H3 · EVALUAR (LA DECISIÓN) ............. transición (1 llamada viabilidad.evaluar)
│   └─ señal-refresh: viabilidad.evaluacion.completada
├─ H4 · LEER EL DICTAMEN .................. dictamen-visual (viable/coste/margen/food_cost)
│   └─ señal-refresh: viabilidad.evaluacion.completada (re-confirma)
├─ H5 · VER EXPEDIENTES (historial) ....... cinta-estado (viabilidad.listar → expedientes)
└─ H6 · DESCARTAR UN EXPEDIENTE ........... confirmador-nombrado (viabilidad.descartar)
    └─ señal-refresh: viabilidad.evaluacion.descartada
```

### H1 · ELEGIR LA RECETA/PRODUCTO — forma: `ref-select`

Qué: el jefe elige la entidad a evaluar desde el listado de recetas del
proyecto (`recetas.listar.request` → `{total, recetas:[{receta_id, nombre,
tipo, rinde, ...}]}`). El ref-select SIEMPRE desde el list (nunca teclear el
id). Alternativa: propuesta libre (nombre + ingredientes + porciones) — el
reflejo acepta `receta_id` O `{nombre, ingredientes, porciones}` (L97-99).

- RPC pareada: `recetas.listar.request` → `recetas.listar.response` (neutro,
  alimenta la decisión).
- señal: ninguna propia (es lectura).

### H2 · FIJAR EL PVP OBJETIVO — forma: `inline-gesture`

Input numérico opcional (>0). Si se deja vacío, el reflejo calcula
`pvp_sugerido` al food cost objetivo (default 30%) y el veredicto es
`sin_pvp_objetivo` (orientativo, L150-152). El food cost objetivo también es
opcional (`food_cost_objetivo_pct`, default 30, L103).

- señal: ninguna propia (es dato del request, no escritura).

### H3 · EVALUAR — forma: `transicion-un-llamado` (la decisión ÚNICA)

1 clic → 1 `viabilidad.evaluar.request` → espera (el reflejo anida
escandallo.costear interno, timeout 20s) → dictamen en la respuesta. Botón
deshabilitado durante el vuelo (no hay doble evaluación).

- RPC: `viabilidad.evaluar.request { project_id, receta_id?, nombre?,
  ingredientes?, porciones?, pvp_objetivo?, food_cost_objetivo_pct? }`.
- señal-refresh: `viabilidad.evaluacion.completada` (L208) — la vista NO
  recarga; el dictamen llega en la respuesta y la señal re-confirma.
- errores nombrados: 400 INVALID_INPUT (falta receta_id o propuesta) · 503
  UPSTREAM_UNREACHABLE (escandallo/recetas no responden) · 502 (status del
  upstream).

### H4 · LEER EL DICTAMEN — forma: `dictamen-visual` (la hoja grande)

La respuesta 201 nombra el veredicto económico: `{viable, coste_porcion,
margen_porcion, food_cost_pct, veredicto, advertencias, caminos}` (L168-189).
El dictamen se muestra EN CLARO: veredicto (viable | viable_con_advertencias |
no_viable_economicamente | sin_pvp_objetivo), coste/porción, margen/porción,
food cost %, advertencias y los caminos (0-3 tarjetas {titulo, prompt} que
prefillan el chat — la brújula del comerciante, L164-165).

- señal-refresh: `viabilidad.evaluacion.completada` (re-confirma con debounce
  60ms).

### H5 · VER EXPEDIENTES — forma: `cinta-estado`

El historial de evaluaciones (`viabilidad.listar.request` → expedientes,
orden por fecha desc, L256-268). El jefe ve el pulso de lo evaluado sin
navegar. Los caminos viven en el expediente (L164-165).

- RPC: `viabilidad.listar.request { project_id, estado?, veredicto? }`.
- señal-refresh: `viabilidad.evaluacion.completada` + `viabilidad.evaluacion.descartada`.

### H6 · DESCARTAR UN EXPEDIENTE — forma: `confirmador-nombrado`

Soft-delete de una evaluación (estado='descartado', audit trail, L271-305).
Nombra qué expediente y a quién afecta. Doble descarte → CONFLICT_STATE (409).

- RPC: `viabilidad.descartar.request { project_id, expediente_id, motivo? }`.
- señal-refresh: `viabilidad.evaluacion.descartada` (L295).

## Hojas de UTILIZACIÓN (FUERA del árbol del jefe — no se dibujan aquí)

- El consumo del producto evaluado por POS/PWA/cocina — el evaluador es
  PREVIO a la venta; no participa en ella.
- El flujo del CLIENTE — el evaluador no se vende; solo dictamina.

## Huecos [ABIERTO] — nombrados, NO cerrados

- [ABIERTO] **coste fresco vía escandallo.calcular**: el reflejo usa
  escandallo.costear (catálogo cacheado, orientativo). Si se quiere coste con
  precios Mercadona frescos, habría que ofrecer una vía que dispare
  escandallo.calcular (turno LLM) bajo demanda explícita (blueprint:
  coste_fresco_vs_cacheado).
- [ABIERTO] **re-evaluación automática cuando suben los precios**: un
  expediente es snapshot del momento (blueprint: no_garantiza).
- [ABIERTO] **umbrales de food cost editables desde el panel**: hoy viven en
  `/pizzepos/viabilidad/config.json` (config del proyecto, patrón
  carta-digital). ¿Editor aquí? Decisión del dueño.
