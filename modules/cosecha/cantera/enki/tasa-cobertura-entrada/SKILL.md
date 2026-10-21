---
name: tasa-cobertura-entrada
description: >-
  Skill FULL del módulo REFLEJO STATELESS `tasa-cobertura-entrada` de la vertical contabilidad
  (Enki). Mide la PROPORCIÓN de hechos que entran SIN intervención frente a los que caen a cola:
  `tasa = entrados_sin_intervencion / total`. LEE la métrica única de `completitud-cobertura`
  (A12) — no la recalcula. Escucha `contabilidad.hecho_recibido` y `contabilidad.excepcion_encolada`.
  Honestidad (invariante 13): sin métrica o sin total > 0 la tasa queda `INDETERMINADA` (no se
  inventa). Sin store propio. La op `calcular` es PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites medir qué fracción de la entrada se procesa sin intervención humana
    (RPC tasa-cobertura-entrada.calcular.request).
  - Cuando depures por qué la tasa sale `INDETERMINADA` (sin métrica o sin total > 0).
  - Cuando quieras entender su contrato de eventos y su relación con completitud-cobertura (A12)
    y encolado-excepcion (A8.1).
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, entrada, cobertura, tasa, metricas]
---

# tasa-cobertura-entrada — REFLEJO STATELESS de la tasa de entrada automática

## Qué hace el módulo

`tasa-cobertura-entrada` es un **REFLEJO STATELESS** (P4, hoja del plan) de la vertical
**contabilidad**, eje **entrada**. Mide **la proporción de hechos que entran sin intervención
humana** frente a los que **caen a la cola** de excepciones:

```
tasa = entrados_sin_intervencion / total            (total = entrados + encolados)
tasa_intervencion = encolados / total
```

**Lee la métrica única** de `completitud-cobertura` (A12) — **no la recalcula** ni cuenta hechos
por su cuenta (`recalcula_metrica:false`). Solo observa en memoria para contrastar.

**Honestidad (invariante 13):** sin métrica (ni declarada ni de `completitud-cobertura`) o sin un
`total > 0` la tasa queda **`INDETERMINADA`** (no se finge una proporción).

**No persiste**: una ventana acotada `this._obs` (tope 2000). La op `calcular` es **PREGUNTA** →
**sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `tasa-cobertura-entrada.calcular.request` | `onCalcularRequest` | RPC reflejo (PREGUNTA): `{project_id, metrica?\|cobertura?, ejercicio?, desde?, hasta?}` → `{project_id, tasa, tasa_intervencion, entrados, encolados, total, metrica, recalcula_metrica:false, abierto}`. Delega en `_atender` → `_calcular`. Si `status ≠ 200` publica `.failed`. Responde por `tasa-cobertura-entrada.calcular.response`. |
| `contabilidad.hecho_recibido` | `onHechoRecibido` | Fire-and-forget (puerto-evento-vertical A1): se anota `tipo:'entrado'` en la ventana (tope 2000). Observar no es escribir. |
| `contabilidad.excepcion_encolada` | `onExcepcionEncolada` | Fire-and-forget (encolado-excepcion A8.1): se anota `tipo:'encolado'` (con motivo) en la ventana. Los dos sucesos de la tasa. |

### Publishes

| Evento | Cuándo |
|---|---|
| `tasa-cobertura-entrada.calcular.response` | Respuesta RPC correlada de la op `calcular`. |
| `tasa-cobertura-entrada.calcular.failed` | Par de fallo determinista: falta `project_id` o entrada inválida. |

> **NO publica un hecho de dominio**: reflejo de métrica. No escribe estado → no hay hecho.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `calcular` | **PREGUNTA** | `{project_id, metrica?:\{entrados\|llegados, encolados\|excepciones, total?\}\|cobertura?, ejercicio?, desde?, hasta?}` | `{project_id, tipo, fuente, metrica, tasa, tasa_intervencion, entrados, encolados, total, recalcula_metrica:false, observados_en_memoria, abierto}` | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Ejes de la métrica**: `entrados` se lee de `metrica.entrados` o `metrica.llegados`;
   `encolados` de `metrica.encolados` o `metrica.excepciones`.
2. **Total**: `entrados + encolados` si ambos existen; si no, `metrica.total`. Sin total → `null`.
3. **Tasa de entrada automática**: `tasa = entrados / total` solo si `total > 0` y `entrados !== null`
   (redondeada a 4 decimales). Si no → `'INDETERMINADA'`.
4. **Tasa de intervención**: `encolados / total` (o `null`).
5. **No recalcula la métrica**: `recalcula_metrica:false`; `observados_en_memoria` refleja solo lo
   que se observó por evento (sin valor de cálculo).
6. **Origen de la métrica** (`_metricaDe`): input `metrica`/`cobertura` → si no, RPC
   `completitud-cobertura.medir.request` (timeout 800 ms). `fuente` ∈ `{'declarado','completitud-cobertura',null}`.
7. **Honestidad doble**: si no llega métrica → `INDETERMINADA` + `abierto.metrica`; si llega pero no
   declara `total > 0` → `abierto.total`.
8. **`_num` estricto**: `undefined/null/''` → `null`.

## Cómo se usa (RPC)

### Calcular con métrica declarada

```json
{
  "project_id": "e57a318a-...",
  "metrica": { "entrados": 95, "encolados": 5 },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "tasa-cobertura-entrada",
  "fuente": "declarado",
  "metrica": { "entrados": 95, "encolados": 5, "total": 100, "esperados": null, "llegados": null },
  "tasa": 0.95,
  "tasa_intervencion": 0.05,
  "entrados": 95,
  "encolados": 5,
  "total": 100,
  "recalcula_metrica": false,
  "observados_en_memoria": 0,
  "abierto": { "metrica": null, "total": null }
}
```

### Sin métrica — INDETERMINADA

```json
{ "project_id": "e57a318a-..." }
```
→ `tasa:'INDETERMINADA'`, `abierto.metrica = "no llego la metrica de cobertura (ni declarada ni de completitud-cobertura): la tasa queda INDETERMINADA (no se inventa)"`.

### Métrica sin total > 0

→ `tasa:'INDETERMINADA'`, `abierto.total = "la metrica no declara un total > 0: la tasa no es calculable (no se finge)"`.

### Fallo — falta project_id

→ `400 INVALID_INPUT` + `tasa-cobertura-entrada.calcular.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_calcular`. |
| (no es error) | 200 | Sin métrica o sin total → `INDETERMINADA` (honesto). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.hecho_recibido` (A1), `contabilidad.excepcion_encolada` (A8.1).
- **Lee por RPC (800 ms)**: `completitud-cobertura.medir.request` (A12).
- **Le consume**: `panel-proceso-contable` (P1) pide `tasa-cobertura-entrada.calcular.request`
  para su latido.

## Verificación

1. Fichero: `modules/contabilidad-entrada/tasa-cobertura-entrada/`.
2. Eventos reales: subscribes `tasa-cobertura-entrada.calcular.request`, `contabilidad.hecho_recibido`,
   `contabilidad.excepcion_encolada`; publishes `tasa-cobertura-entrada.calcular.response`, `.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'|_rpc\('[^']*'" modules/contabilidad-entrada/tasa-cobertura-entrada/index.js
   # → tasa-cobertura-entrada.calcular.failed  → completitud-cobertura.medir.request
   ```
4. Test unitario (si existe): con métrica → tasa correcta; sin métrica → INDETERMINADA;
   sin total → INDETERMINADA; sin `project_id` → 400 + failed; observa los dos sucesos.
