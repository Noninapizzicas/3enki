# ESQUEMA — cara del JEFE del módulo `viabilidad` (pizzepos v2.0.0, el EVALUADOR ECONÓMICO)

> Árbol maestro consolidado (pasadas 1-2). Alimenta al agente de UI que
> escribe el panel del jefe. Ley de agnosticismo: cero tecnología de sistema
> ambiente. El análisis es de la CARA DEL JEFE — la utilización (POS, PWA,
> cocina) quedó fuera, anotada.
>
> Fuente: `modules/pizzepos/viabilidad/index.js` (reflejo-1.0.0, 4 ops) +
> `module.json` (v2.0.0, HÍBRIDO, SIN ui_handlers — RPC por evento) +
> `recetas/index.js` (ref-select L37-75) + blueprint v2.1.0.

## 1. Quién es el jefe y qué decide

El **FRENO ECONÓMICO del recetario**: dictamina si una receta o propuesta de
producto es viable en coste/margen ANTES de darla de alta. Dos decisiones:

- **D1 — EVALUAR la viabilidad** (`viabilidad.evaluar`): el jefe elige la
  receta (ref-select) + PVP objetivo opcional → el reflejo delega el coste a
  escandallo.costear, aplica las reglas de food cost y emite el DICTAMEN
  económico `{viable, coste_porcion, margen_porcion, food_cost_pct,
  veredicto, advertencias, caminos}`. Aprueba o frena un producto.
- **D2 — DESCARTAR un expediente** (`viabilidad.descartar`): soft-delete de
  una evaluación (estado='descartado', audit trail).

Frecuencia: media (cada alta de receta/producto pasa por aquí). El gesto
frecuente es EVALUAR (ref-select receta + PVP → dictamen visible).

Lo que NO decide: el coste real (escandallo), el contenido de la receta
(recetas), ni cómo se vende (POS/PWA — utilización).

## 2. Invariantes (verificadas en código, restricciones honestas)

- INV1 — **reflejo de 4 ops** (`reflejo-1.0.0`): `evaluar` (L47), `obtener`
  (L48), `listar` (L49), `descartar` (L50) — todas por `_atender` →
  `viabilidad.<op>.response` top-level `{request_id, status, data|error}`.
- INV2 — **el coste lo delega a escandallo.costear** (L109, REFLEJO
  determinista, catálogo cacheado, orientativo). NO usa escandallo.calcular
  (cajón fuzzy Mercadona, turno LLM).
- INV3 — **el nombre de la receta lo resuelve recetas** (L125,
  recetas.obtener) cuando se evalúa por receta_id sin nombre — NO se inventa.
- INV4 — **el módulo SÍ publica señal propia** (verificado en código, aunque
  module.json no declare publishes — lección carta-digital): `evaluacion.completada`
  (L208) + `evaluacion.descartada` (L295).
- INV4b — **doble confirmación, nunca optimismo**: dictamen en la respuesta
  RPC (la única verdad inmediata) + señal que re-confirma con debounce 60ms.
- INV5 — **umbrales de food cost del proyecto** (25/35/45) vía
  `/pizzepos/viabilidad/config.json` (patrón carta-digital), fallback a los
  DEFAULT (L37, L77-88). El jefe no los edita aquí.
- INV6 — **multi-tenant**: todo RPC lleva `project_id` (proyecto activo). Las
  señales se correelan por `project_id`; las de otro negocio no tocan la vista.

## 3. Composición de la vista del jefe (3 capas — gestos del evaluador)

```
1. SELECCIONAR  la receta/producto a evaluar (ref-select desde recetas.listar)
                + PVP objetivo opcional (inline-gesture).
2. INFORMARSE   el dictamen económico en claro (viable/coste/margen/food_cost)
                + el historial de expedientes (cinta-estado).
3. DECLARAR     EVALUAR (1 llamada viabilidad.evaluar, botón muerto en vuelo)
                → dictamen en la respuesta + señal re-confirmando.
                DESCARTAR (confirmador-nombrado) → señal descartada.
```

Frecuencia → jerarquía: el gesto frecuente es EVALUAR (ref-select + PVP +
botón, cinta arriba); el dictamen es banner de resultado; el descarte es
modal.

## 4. Formas UI (la disección reparte formas, la vista las compone)

| Hoja | Forma | RPC / señal |
|---|---|---|
| Elegir receta/producto | ref-select | `recetas.listar.request` → `{total, recetas:[{receta_id, nombre, tipo, rinde}]}` (neutro) |
| PVP objetivo (opcional) | inline-gesture | dato del request (si vacío → pvp_sugerido, veredicto 'sin_pvp_objetivo') |
| EVALUAR | transicion-un-llamado | `viabilidad.evaluar.request` → `.response` · señal `viabilidad.evaluacion.completada` |
| Dictamen económico | dictamen-visual | 201 `{viable, coste_porcion, margen_porcion, food_cost_pct, veredicto, advertencias, caminos}` |
| Historial de expedientes | cinta-estado | `viabilidad.listar.request` → expedientes (orden fecha desc) |
| DESCARTAR | confirmador-nombrado | `viabilidad.descartar.request` → `.response` · señal `viabilidad.evaluacion.descartada` |

## 5. Señales (hoja a hoja — cada declaración con su refresh)

- EVALUAR → dictamen en la respuesta + **viabilidad.evaluacion.completada**
  (L208) con debounce 60ms.
- DESCARTAR → **viabilidad.evaluacion.descartada** (L295) con debounce 60ms.
- El historial se re-lee con ambas señales (completada + descartada).

## 6. Huecos [ABIERTO] — decisiones del dueño pendientes

- **coste fresco vía escandallo.calcular** — el reflejo usa escandallo.costear
  (catálogo cacheado, orientativo). Si se quiere coste con precios Mercadona
  frescos, vía bajo demanda explícita. ABIERTO.
- **re-evaluación automática cuando suben los precios** — un expediente es
  snapshot del momento. ABIERTO.
- **umbrales de food cost editables desde el panel** — hoy viven en
  `/pizzepos/viabilidad/config.json` (config del proyecto). ¿Editor aquí?
  Decisión del dueño. ABIERTO.
