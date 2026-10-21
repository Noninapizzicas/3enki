---
name: desviacion
description: >-
  Skill FULL del módulo REFLEJO STATELESS `desviacion` de la vertical contabilidad
  (Enki). Compara el REAL contra el PRESUPUESTO y dispara aviso SOLO si se sale del
  umbral DECLARADO. Determinista: `desviacion = real - presupuesto`; se sale si
  `|desviacion| > |umbral|`. No calcula el real (eso es margen-analitico) ni fija el
  objetivo (eso es presupuesto): los recibe por input o por RPC best-effort. Escucha
  `contabilidad.presupuesto_fijado` y `contabilidad.asiento_asentado`. Honestidad
  (invariante 13): sin AMBAS cifras la desviación no se inventa; sin umbral declarado se
  calcula pero no se decide. Sin store propio. La op `calcular` es PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites calcular la desviación real vs presupuesto de un concepto/periodo
    (RPC desviacion.calcular.request).
  - Cuando depures por qué no se dispara el aviso (sin umbral declarado → `fuera_umbral:null`)
    o por qué la desviación sale `null` (falta real o presupuesto → `abierto`).
  - Cuando quieras entender su contrato de eventos y las dependencias best-effort a
    margen-analitico (J-real) y presupuesto (J3).
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, analitica, desviacion, presupuesto, avisos]
---

# desviacion — REFLEJO STATELESS real vs presupuesto

## Qué hace el módulo

`desviacion` es un **REFLEJO STATELESS** (J4, hoja del plan) de la vertical **contabilidad**,
eje **analítica**. Compara dos cifras que **no produce**:

- el **real** → lo calcula `margen-analitico` (J);
- el **presupuesto/objetivo** → lo fija `presupuesto` (J3).

Este módulo **recibe** ambas (declaradas en el input, o pedidas por RPC best-effort),
las **compara** y **avisa si el umbral declarado se rebasa**. La fórmula es
`desviacion = real - presupuesto` (redondeada a 2 decimales) y la decisión es
`fuera_umbral = |desviacion| > |umbral|`.

**Honestidad (invariante 13):**
- Sin **AMBAS** cifras → `desviacion:null`, `senal_presente:false` y `abierto` con qué faltó.
- Sin **umbral** declarado → la desviación **se calcula** igual, pero `fuera_umbral:null`
  (nadie ha dicho que sea inaceptable). **No hay umbral por defecto.**

**No persiste**: mantiene una **memoria acotada** (`this._senales: Map<pid, {objetivo, umbral, concepto}>`)
alimentada por `contabilidad.presupuesto_fijado`, y una ventana `this._vistos` con los
asientos observados (tope 1000). La op `calcular` es **PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `desviacion.calcular.request` | `onCalcularRequest` | RPC reflejo (PREGUNTA): `{project_id, real?, presupuesto?\|objetivo?, umbral?\|tolerancia?, concepto?, periodo?}` → resultado determinista. Delega en `_atender` → `_calcular`. Si `status ≠ 200` publica `desviacion.calcular.failed`. Responde por `desviacion.calcular.response`. |
| `contabilidad.presupuesto_fijado` | `onPresupuestoFijado` | Fire-and-forget (presupuesto J3): se fijó el presupuesto. Se observa `objetivo = importe ?? objetivo ?? total ?? presupuesto.importe`, `umbral = umbral ?? tolerancia ?? presupuesto.umbral` y `concepto` en la memoria acotada. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (escritor-diario B2): el libro cambió → se observa el asiento en la ventana (tope 1000). El reflejo **no reescribe** el libro; solo mira. |

### Publishes

| Evento | Cuándo |
|---|---|
| `desviacion.calcular.response` | Respuesta RPC correlada de la op `calcular` (una sola cara: el bus). |
| `desviacion.calcular.failed` | Par de fallo determinista: falta `project_id` o entrada inválida → `{status, code, message}`. Cierra el círculo de `calcular.request`. |
| `motor-avisos.producir.request` | **Solo si `fuera_umbral === true`**: `{tipo:'presupuesto', severidad:'warn', titulo:'Desviacion fuera de umbral: <d>', detalle:'real=… vs presupuesto=… (umbral …)', origen:'desviacion', ref, correlation_id}`. |

> **NO publica un hecho de dominio** (`contabilidad.*`): es un reflejo de cálculo, no escribe
> estado. Su salida es la respuesta RPC y — cuando procede — la subida al motor de avisos.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `calcular` | **PREGUNTA** | `{project_id, real?, importe_real?, total?, presupuesto?, objetivo?, importe_presupuestado?, umbral?, tolerancia?, concepto?, periodo?}` | `{project_id, tipo, concepto, real, presupuesto, desviacion, desviacion_abs, desviacion_relativa, umbral, fuera_umbral, dentro_umbral, fuente:{real,presupuesto}, senal_presente, formula, abierto}` o variante ABIERTO | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Fórmula determinista**: `desviacion = round(real - presupuesto, 2)`;
   `desviacion_relativa = round(desviacion / |presupuesto|, 4)` (o `null` si `presupuesto === 0`).
2. **Se sale si supera el umbral declarado**: `fuera_umbral = |desviacion| > |umbral|`.
   Sin umbral → `fuera_umbral:null` y `abierto.umbral` lo declara.
3. **Resolución del real** (`_calcular`): input (`real`/`importe_real`/`total`) → si no,
   RPC `margen-analitico.calcular.request` con timeout 800 ms. Se registra `fuente.real`
   como `'declarado'` o `'margen-analitico'`.
4. **Resolución del presupuesto**: input (`presupuesto`/`objetivo`/`importe_presupuestado`)
   → RPC `presupuesto.objetivo.request` (timeout 800 ms) → **observado** del evento
   `contabilidad.presupuesto_fijado`. `fuente.presupuesto` ∈ `{'declarado','presupuesto','observado'}`.
5. **Sin ambas cifras no se inventa**: devuelve ABIERTO con `real`/`presupuesto` a lo que sí
   llegó (o `null`) y `abierto.real` / `abierto.presupuesto` detallando el hueco.
6. **Aviso solo con umbral**: `motor-avisos.producir.request` se publica **únicamente**
   cuando `fuera_umbral === true`. Nunca se avisa "por si acaso".
7. **`_num` estricto**: `undefined/null/''` → `null`; no numérico → `null`. Un valor que no
   llega es ausencia, no cero.

## Cómo se usa (RPC)

### Calcular con cifras y umbral declarados

```json
{
  "project_id": "e57a318a-...",
  "concepto": "compras",
  "real": 12400,
  "presupuesto": 11000,
  "umbral": 1000,
  "correlation_id": "abc-123"
}
```
Respuesta `200` (y emite aviso porque `|1400| > |1000|`):
```json
{
  "project_id": "e57a318a-...",
  "tipo": "desviacion",
  "concepto": "compras",
  "real": 12400,
  "presupuesto": 11000,
  "desviacion": 1400,
  "desviacion_abs": 1400,
  "desviacion_relativa": 0.1273,
  "umbral": 1000,
  "fuera_umbral": true,
  "dentro_umbral": false,
  "fuente": { "real": "declarado", "presupuesto": "declarado" },
  "senal_presente": true,
  "formula": "desviacion = real - presupuesto; se sale si |desviacion| > |umbral| declarado",
  "abierto": { "umbral": null }
}
```

### Sin umbral — se calcula pero no se decide

```json
{ "project_id": "e57a318a-...", "real": 100, "presupuesto": 90 }
```
→ `desviacion:10`, `fuera_umbral:null`, `dentro_umbral:null`,
`abierto.umbral = "no se declaró umbral: se calcula la desviacion pero no se decide si es inaceptable"`.

### Sin una cifra — ABIERTO

```json
{ "project_id": "e57a318a-...", "real": 100 }
```
→ `desviacion:null`, `senal_presente:false`, `abierto.presupuesto` explicando el hueco.

### Fallo — falta project_id

→ `400 INVALID_INPUT` + `desviacion.calcular.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. Publica `desviacion.calcular.failed`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_calcular`. |
| (no es error) | 200 | Falta real o presupuesto → ABIERTO; falta umbral → se calcula sin decidir. |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.presupuesto_fijado` (presupuesto J3), `contabilidad.asiento_asentado` (escritor-diario B2).
- **Llama por RPC (best-effort, timeout 800 ms)**: `margen-analitico.calcular.request` (para el real),
  `presupuesto.objetivo.request` (para el objetivo).
- **Habla con**: `motor-avisos.producir.request` (K2) cuando se sale del umbral.
- **Le consume**: `comparador-periodos` (J9) reutiliza esta desviación por RPC.

## Verificación

1. Fichero: `modules/contabilidad-analitica/desviacion/`.
2. Eventos reales en `module.json`: subscribes `desviacion.calcular.request`,
   `contabilidad.presupuesto_fijado`, `contabilidad.asiento_asentado`; publishes
   `desviacion.calcular.response`, `desviacion.calcular.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'|_rpc\('[^']*'" modules/contabilidad-analitica/desviacion/index.js
   # → desviacion.calcular.failed, motor-avisos.producir.request
   # → margen-analitico.calcular.request, presupuesto.objetivo.request
   ```
4. Test unitario (si existe): `calcular` con ambas cifras + umbral → 200 + aviso si se sale;
   sin umbral → `fuera_umbral:null`; sin una cifra → ABIERTO; sin `project_id` → 400 + failed;
   `onPresupuestoFijado` alimenta `objetivo`/`umbral`.
