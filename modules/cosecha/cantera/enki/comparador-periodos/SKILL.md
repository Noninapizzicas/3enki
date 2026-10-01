---
name: comparador-periodos
description: >-
  Skill FULL del módulo REFLEJO STATELESS `comparador-periodos` de la vertical contabilidad
  (Enki). Compara dos lados (periodo vs periodo, ejercicio vs ejercicio, mes vs mes o real vs
  presupuesto) y REUTILIZA J3/J4 — no recalcula. Si falta un lado, la comparación queda abierta
  (no se rellena con cero). Dependencias best-effort por RPC a `presupuesto.objetivo.request` y
  `desviacion.calcular.request`. Escucha `contabilidad.presupuesto_fijado` (ventana acotada).
  Sin store propio. La op `comparar` es PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites comparar dos periodos o el real contra el presupuesto
    (RPC comparador-periodos.comparar.request).
  - Cuando depures por qué la comparación sale `comparable:false` (falta el importe de un lado →
    `abierto`) o de dónde salió cada lado (`origen`).
  - Cuando quieras entender su contrato de eventos y su reutilización de presupuesto (J3) y
    desviación (J4).
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, analitica, comparacion, periodos, presupuesto]
---

# comparador-periodos — REFLEJO STATELESS que compara dos lados

## Qué hace el módulo

`comparador-periodos` es un **REFLEJO STATELESS** (J9, hoja del plan) de la vertical
**contabilidad**, eje **analítica**. Compara **dos lados** (A = base, B = contraste) y calcula
la **diferencia** y la **variación porcentual**. Modos: `periodo_vs_periodo`,
`ejercicio_vs_ejercicio`, `mes_vs_mes`, `real_vs_presupuesto`.

**Reutiliza, no recalcula**: para el modo `real_vs_presupuesto` pide a `desviacion` (J4) que haga
el cálculo, y los importes los toma de lo declarado o de `presupuesto.objetivo.request` (J3).

**Honestidad (invariante 13):** si falta el importe de un lado, la comparación queda **abierta**
(`comparable:false`) y **no se rellena con cero**; cada hueco se declara en `abierto.a` / `abierto.b`.

**No persiste**: una ventana acotada `this._objetivos` (tope 1000) alimentada por
`contabilidad.presupuesto_fijado`. La op `comparar` es **PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `comparador-periodos.comparar.request` | `onCompararRequest` | RPC reflejo (PREGUNTA): `{project_id, a?, b?, objetivos?, modo?, dimension?, periodo_a?, periodo_b?, periodo?}` → `{a, b, comparable, diferencia, variacion_pct, desviacion, …}`. Delega en `_atender` → `_comparar`. Si `status ≠ 200` publica `.failed`. Responde por `comparador-periodos.comparar.response`. |
| `contabilidad.presupuesto_fijado` | `onPresupuestoFijado` | Fire-and-forget (presupuesto J3): un objetivo quedó fijado → se observa `{project_id, dimension, periodo, importe, estado}` en la ventana acotada (tope 1000). Observar no es escribir. |

### Publishes

| Evento | Cuándo |
|---|---|
| `comparador-periodos.comparar.response` | Respuesta RPC correlada de la op `comparar`. |
| `comparador-periodos.comparar.failed` | Par de fallo determinista: falta `project_id` o entrada inválida. |

> **NO publica un hecho de dominio**: reflejo de comparación. No escribe estado.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `comparar` | **PREGUNTA** | `{project_id, a?:{periodo,importe,origen?,etiqueta?}, b?:{…}, objetivos?:{a?,b?}, modo?, dimension?, periodo_a?, periodo_b?, periodo?}` | `{project_id, tipo, modo, dimension, a, b, comparable, diferencia, variacion_pct, desviacion, reutiliza, abierto}` | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Modo**: `_modo` normaliza a `real_vs_presupuesto` (`real_vs_presupuesto`/`presupuesto`),
   `ejercicio_vs_ejercicio` (`ejercicio`/`ejercicio_vs_ejercicio`), `mes_vs_mes` (`mes`/`mes_vs_mes`)
   o, **por defecto, `periodo_vs_periodo`** (se declara; no se asume presupuesto).
2. **Diferencia**: `diferencia = round(b.importe - a.importe, 2)`. Solo si ambos importes existen.
3. **Variación**: `variacion_pct = round((b - a) / |a|, 4)` (o `null` si `a === 0`).
4. **Resolución de un lado** (`_lado`): `input[cual]` → `input.objetivos[cual]` → RPC
   `presupuesto.objetivo.request` (timeout 800 ms; `origen:'presupuesto'`). `_norm` fuerza
   `{lado, periodo, importe, origen, etiqueta}` con `importe` numérico o `null`.
5. **Reutiliza J4 para real-vs-presupuesto**: si `modo === 'real_vs_presupuesto'` y hay ambos
   importes, pide `desviacion.calcular.request` con `{objetivo: ia, real: ib}` (timeout 800 ms)
   y devuelve su resultado en `desviacion`. **No lo calcula aquí.**
6. **Sin un lado no se compara**: `comparable:false`, `diferencia:null`, `variacion_pct:null` y
   `abierto.comparacion`. Los huecos por lado se declaran en `abierto.a` / `abierto.b`.
7. **`reutiliza`**: el payload declara `['presupuesto.objetivo (J3)', 'desviacion.calcular (J4)']`.
8. **`_num` estricto**: `undefined/null/''` → `null`.

## Cómo se usa (RPC)

### Comparar dos periodos declarados

```json
{
  "project_id": "e57a318a-...",
  "modo": "mes_vs_mes",
  "a": { "periodo": "2026-08", "importe": 10000, "etiqueta": "agosto" },
  "b": { "periodo": "2026-09", "importe": 12400, "etiqueta": "septiembre" },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "comparador-periodos",
  "modo": "mes_vs_mes",
  "dimension": null,
  "a": { "lado": "a", "periodo": "2026-08", "importe": 10000, "origen": null, "etiqueta": "agosto" },
  "b": { "lado": "b", "periodo": "2026-09", "importe": 12400, "origen": null, "etiqueta": "septiembre" },
  "comparable": true,
  "diferencia": 2400,
  "variacion_pct": 0.24,
  "desviacion": null,
  "reutiliza": ["presupuesto.objetivo (J3)", "desviacion.calcular (J4)"],
  "abierto": { "a": null, "b": null, "comparacion": null }
}
```

### Real vs presupuesto (reutiliza J4)

```json
{ "project_id": "e57a318a-...", "modo": "real_vs_presupuesto", "a": { "importe": 11000 }, "b": { "importe": 12400 } }
```
→ `diferencia:1400`, `variacion_pct:0.1273` y `desviacion` con el resultado de J4.

### Falta un lado — comparación abierta

```json
{ "project_id": "e57a318a-...", "a": { "importe": 10000 } }
```
→ `comparable:false`, `diferencia:null`, `abierto.comparacion = "faltan datos de un lado: la comparacion queda abierta (no se inventa)"`.

### Fallo — falta project_id

→ `400 INVALID_INPUT` + `comparador-periodos.comparar.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_comparar`. |
| (no es error) | 200 | Falta un lado → `comparable:false` (honesto). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.presupuesto_fijado` (presupuesto J3).
- **Llama por RPC (best-effort, 800 ms)**: `presupuesto.objetivo.request`, `desviacion.calcular.request`.

## Verificación

1. Fichero: `modules/contabilidad-analitica/comparador-periodos/`.
2. Eventos reales: subscribes `comparador-periodos.comparar.request`, `contabilidad.presupuesto_fijado`;
   publishes `comparador-periodos.comparar.response`, `.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'|_rpc\('[^']*'" modules/contabilidad-analitica/comparador-periodos/index.js
   # → comparador-periodos.comparar.failed → presupuesto.objetivo.request / desviacion.calcular.request
   ```
4. Test unitario (si existe): comparar dos lados → diferencia y variación; falta un lado → abierta;
   modo real_vs_presupuesto → reutiliza J4; sin `project_id` → 400 + failed.
