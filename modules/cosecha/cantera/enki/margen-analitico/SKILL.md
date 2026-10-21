---
name: margen-analitico
description: >-
  Skill FULL del módulo REFLEJO STATELESS `margen-analitico` de la vertical
  contabilidad (Enki). Margen analítico = INGRESO − COSTE IMPUTADO, por DIMENSIÓN,
  determinista. No calcula las cifras por su cuenta: recibe los movimientos
  declarados o los agrega subiéndolos por EVENTO a mayor-balanza (ingresos),
  valoracion-existencia (coste de existencias) y coste-indirecto (indirectos). Un
  movimiento sin dimensión queda en sin_dimension; sin datos el margen es null, no
  0. No escribe, no persiste; su cara es el bus.
when-to-use: >-
  - Cuando necesites el margen analítico por dimensión (RPC
    margen-analitico.calcular.request).
  - Cuando depures un margen null (sin datos → no 0) o movimientos declarados en
    sin_dimension.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y las
    dimensiones declarables.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, contabilidad, analitica, margen, dimension, determinista, sin-dimension]
---

# margen-analitico — REFLEJO STATELESS del margen analítico por dimensión

## Qué hace el módulo

`margen-analitico` es un **REFLEJO STATELESS** (J2, hoja del plan): el **margen
analítico** = **INGRESO − COSTE IMPUTADO**, **por DIMENSIÓN**. **Determinista**.

**NO calcula las cifras por su cuenta**: **RECIBE** los movimientos declarados, o
los agrega **subiéndolos por EVENTO** a `mayor-balanza.saldos.request` (B6,
ingresos), `valoracion-existencia.valorar.request` (H1, coste de existencias) y
`coste-indirecto.repartir.request` (K1, indirectos).

**Honestidad (invariante 13)**: un movimiento **sin dimensión declarada NO se
reparte a ojo** — queda en `sin_dimension` y se declara; **sin datos el margen es
`null`, no 0**. No escribe, no persiste. Su op es **CLASE PREGUNTA** → va por el bus,
sin panel. Publica `margen-analitico.calcular.response` y su par `.failed`. Escucha
`contabilidad.asiento_asentado` (B2 `escritor-diario`).

> **Nota R3**: la escucha de `contabilidad.ejercicio_cerrado` del plan **NO se
> declara**: su emisor `cierre-ejercicio` (C4) aún no existe.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `margen-analitico.calcular.request` | `onCalcularRequest` | RPC reflejo (PREGUNTA, por el bus): `{project_id, movimientos?\|saldos?, existencias?, costes?, criterio?, fecha?, ejercicio?}` → `{project_id, ingreso, coste, margen, margen_pct, margenes[], abierto}`. Agrega ingreso − coste por dimensión; lo sin dimensión queda declarado. Responde por `margen-analitico.calcular.response`. Payload inválido → `margen-analitico.calcular.failed`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (B2 escritor-diario): un asiento quedó en el libro. Se observa (ventana acotada) como fuente alternativa; no se recalcula ni se escribe. |

### Publishes

| Evento | Descripción |
|---|---|
| `margen-analitico.calcular.response` | Respuesta RPC correlada de la op `calcular` (una sola cara: el bus). |
| `margen-analitico.calcular.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `calcular.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `calcular` | **PREGUNTA** (bus) | `{project_id, movimientos?\|saldos?, existencias?, costes?, criterio?, fecha?, ejercicio?}` | `{project_id, ingreso, coste, margen, margen_pct, margenes[], abierto}` | `400 INVALID_INPUT project_id` |

Tool expuesta: `margen-analitico.calcular` (`toolCalcular` → `_calcular`).

## Reglas de negocio

1. **Margen = ingreso − coste**, agregado **por dimensión** (`_dimension`).
2. **Sin dimensión no se reparte a ojo**: los movimientos sin dimensión van a
   `sin_dimension` y se declaran; **no se asignan a una dimensión inventada**.
3. **Sin datos el margen es `null`, no 0** (honestidad): si no hay movimientos ni
   fuentes, `margen:null` con `abierto`.
4. **No calcula por su cuenta**: agrega declarado o sube por EVENTO a
   `mayor-balanza.saldos.request` (B6), `valoracion-existencia.valorar.request`
   (H1) y `coste-indirecto.repartir.request` (K1).
5. **`margen_pct`** se deriva del margen sobre el ingreso (cuando procede).
6. **Sin `project_id`** → `400 INVALID_INPUT` + `.failed`.
7. **No escribe, no persiste**: reflejo derivador.
8. **HTTP exacto**: éxito `200`; falta `project_id` → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `calcular` — margen por dimensión

```json
{
  "project_id": "e57a318a-...",
  "movimientos": [ { "dimension": "centro-A", "tipo": "INGRESO", "importe": 5000 }, { "dimension": "centro-A", "tipo": "COSTE", "importe": 3000 }, { "tipo": "INGRESO", "importe": 1000 } ],
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "ingreso": 6000, "coste": 3000, "margen": 3000, "margen_pct": 0.5, "margenes": [ { "dimension": "centro-A", "ingreso": 5000, "coste": 3000, "margen": 2000 } ], "abierto": { "sin_dimension": [ { "importe": 1000 } ] } }
```
Sin movimientos ni fuentes → `margen:null` con `abierto`.

## Errores y qué significan

- `400 INVALID_INPUT project_id` — falta el proyecto.
- `200 {margen:null}` — sin datos: no es 0, es desconocido.
- `200 {abierto.sin_dimension}` — movimientos sin dimensión (declarados, no
  repartidos a ojo).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.asiento_asentado` (B2 `escritor-diario`).
  Sube best-effort `mayor-balanza.saldos.request` (B6),
  `valoracion-existencia.valorar.request` (H1), `coste-indirecto.repartir.request`
  (K1).
- **Hacia delante (lo consumen)**: `tablero-margen-dimension` (J10) sube
  `margen-analitico.calcular.request` y AGREGA su margen por dimensión.
- No escribe: derivador puro.

## Verificación

- **Fichero**: `modules/contabilidad-analitica/margen-analitico/` (clase
  `MargenAnalitico extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "asiento_asentado" module.json index.js`.
- **Test unitario**: ingreso 5000 − coste 3000 por dimensión → margen 2000; movimiento
  sin dimensión → `abierto.sin_dimension`; sin datos → `margen:null`.

## Notas de implementación

- Stateless: sin `PosPersistencia`; ventana observada en memoria.
- Helpers: `_calcular`, `_movimientosDe`, `_tipo`, `_dimension`, `_num`,
  `toolCalcular`.
