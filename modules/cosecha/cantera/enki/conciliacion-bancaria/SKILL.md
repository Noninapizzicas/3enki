---
name: conciliacion-bancaria
description: >-
  Skill FULL del módulo REFLEJO STATELESS `conciliacion-bancaria` de la vertical contabilidad
  (Enki). Cruza EXTRACTO ↔ LIBRO por CLAVE NATURAL compartida (importe|fecha|referencia).
  Empareja y DECLARA lo NO emparejado; el juicio queda en E7/E8 y el desfase se explica en E9
  (`partida-conciliatoria`). Sin contrapartida no se casa con una inventada. Escucha
  `contabilidad.asiento_asentado` y `contabilidad.movimiento_regla_declarada`. Sin store propio.
  La op `cruzar` es PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites cruzar los movimientos del extracto con el libro (RPC conciliacion-bancaria.cruzar.request).
  - Cuando depures por qué hay `sin_emparejar` o `cuadrado:null` (faltan saldos → desfase no se calcula).
  - Cuando quieras entender su contrato de eventos y su delegación del juicio a E7/E8/E9.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, libro, conciliacion, bancos, clave-natural]
---

# conciliacion-bancaria — REFLEJO STATELESS que cruza extracto y libro

## Qué hace el módulo

`conciliacion-bancaria` es un **REFLEJO STATELESS** (E1, hoja del plan) de la vertical
**contabilidad**, eje **libro**. **Cruza** los movimientos del **extracto bancario** con el **libro**
por **CLAVE NATURAL COMPARTIDA** (`importe|fecha|referencia`, canónica y determinista). Empareja lo
que casa y **DECLARA lo que no**.

**El juicio no es suyo**: lo que **no empareja** se sube a `partida-no-identificada` (E7) y el
**desfase** se explica en `partida-conciliatoria` (E9). Aquí solo se **empareja** y se **declara**.

**Honestidad (invariante 13):** sin extracto → `abierto.extracto` (no hay nada que cruzar); sin libro
→ `abierto.libro` (solo se declaran los del extracto); sin ambos saldos → `desfase:null`.

**No persiste** (STATELESS); observa el libro (tope 2000) y las reglas del banco (tope 500). La op
`cruzar` es **PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `conciliacion-bancaria.cruzar.request` | `onCruzarRequest` | RPC reflejo (PREGUNTA): `{project_id, extracto?\|movimientos?, libro?\|asientos?, saldo_banco?, saldo_contable?}` → `{emparejados, sin_emparejar, desfase, cuadrado, abierto}`. Delega en `_atender` → `_cruzar`. **Sube cada `sin_emparejar` a `partida-no-identificada.juzgar.request` (E7)** y el desfase a `partida-conciliatoria.desfase.request` (E9). Si `status ≠ 200` publica `.failed`. Responde por `conciliacion-bancaria.cruzar.response`. |
| `contabilidad.asiento_asentado` | `onAsientoAsentado` | Fire-and-forget (escritor-diario B2): el libro cambió → se observa el asiento (tope 2000). |
| `contabilidad.movimiento_regla_declarada` | `onMovimientoReglaDeclarada` | Fire-and-forget: una regla de movimiento quedó declarada → se observa (tope 500). |

### Publishes

| Evento | Cuándo |
|---|---|
| `conciliacion-bancaria.cruzar.response` | Respuesta RPC correlada de la op `cruzar`. |
| `conciliacion-bancaria.cruzar.failed` | Par de fallo determinista: falta `project_id` o entrada inválida. |
| `partida-no-identificada.juzgar.request` | **Por cada movimiento sin emparejar**: se sube al juicio (E7). |
| `partida-conciliatoria.desfase.request` | Con `saldo_banco`, `saldo_contable` y `desfase`: se explica el desfase (E9). |

> **NO publica un hecho de dominio**: es un cruce. Sus salidas externas son el juicio (E7) y el
> desfase (E9), por EVENTO.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `cruzar` | **PREGUNTA** | `{project_id, extracto?\|movimientos?:[{importe?\|cuota?, fecha?\|fecha_valor?, referencia?\|ref?\|concepto?}], libro?\|asientos?, saldo_banco?, saldo_contable?}` | `{project_id, tipo, emparejados, sin_emparejar, num_emparejados, num_sin_emparejar, saldo_banco, saldo_contable, desfase, cuadrado, juicio_delegado, determinista, abierto}` | `400 INVALID_INPUT` si falta `project_id`. Excepción → `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Clave natural compartida** (`_claveNatural`): `${round(importe,2)}|${fecha(10)}|${ref lower}`.
   Es canónica y determinista: **no se adivina**.
2. **Sin extracto no hay cruce**: `abierto.extracto`; `desfase:null`, `cuadrado:null`. **No se inventa.**
3. **Emparejamiento**: por cada movimiento del extracto se busca en el libro (no usado) la primera
   entrada con **misma clave natural**. Si casa → `emparejados` (`{clave, banco, libro}`); si no →
   `sin_emparejar` (`{clave, movimiento, motivo}`).
4. **El libro** (`_libroDe`): `libro` → `asientos` → el observado (ventana). Sin libro → `abierto.libro`.
5. **Saldos** (`_saldoFinal`): declarado (`saldo_banco`/`saldo_contable`) → o suma de importes/saldos
   de los movimientos.
6. **Desfase**: `desfase = saldo_banco − saldo_contable` (si los dos existen); si falta alguno →
   `abierto.desfase`.
7. **Cuadrado**: `null` si hay `sin_emparejar` o falta el desfase; si no, `|desfase| <= 0.005`.
8. **Juicio delegado**: `juicio_delegado:['partida-no-identificada','regla-movimiento-bancario']`.
9. **`_num`** devuelve `0` si no es finito.
10. **HTTP exacto**: éxito `200`; input → `400`; excepción → `500`.

## Cómo se usa (RPC)

### Cruzar extracto con libro

```json
{
  "project_id": "e57a318a-...",
  "extracto": [ { "importe": -1000, "fecha": "2026-09-15", "referencia": "F-001" } ],
  "libro": [ { "importe": -1000, "fecha": "2026-09-15", "referencia": "F-001" } ],
  "saldo_banco": 5000,
  "saldo_contable": 5000,
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "conciliacion-bancaria",
  "emparejados": [ { "clave": "-1000|2026-09-15|f-001", "banco": { … }, "libro": { … } } ],
  "sin_emparejar": [],
  "num_emparejados": 1,
  "num_sin_emparejar": 0,
  "saldo_banco": 5000,
  "saldo_contable": 5000,
  "desfase": 0,
  "cuadrado": true,
  "juicio_delegado": ["partida-no-identificada", "regla-movimiento-bancario"],
  "determinista": true,
  "abierto": { "libro": null, "desfase": null }
}
```
Emite `partida-conciliatoria.desfase.request`; por cada `sin_emparejar` emite
`partida-no-identificada.juzgar.request`.

### Sin extracto — ABIERTO

```json
{ "project_id": "e57a318a-..." }
```
→ `abierto.extracto = "no se recibieron movimientos del extracto: no hay nada que cruzar (no se inventa)"`.

### Faltan saldos — desfase no se calcula

→ `desfase:null`, `cuadrado:null`,
`abierto.desfase = "faltan saldos (banco y/o contable): el desfase no se calcula (dato ausente = desconocido)"`.

### Fallo — falta project_id

→ `400 INVALID_INPUT` + `conciliacion-bancaria.cruzar.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id`. |
| `UNKNOWN_ERROR` | 500 | Excepción en `_cruzar`. |
| (no es error) | 200 | Sin extracto/libro/saldos → `abierto` (honesto). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.asiento_asentado` (B2), `contabilidad.movimiento_regla_declarada`.
- **Sube a**: `partida-no-identificada.juzgar.request` (E7), `partida-conciliatoria.desfase.request` (E9).
- **Le alimentan**: `puerto-extracto` (E2) publica `conciliacion-bancaria.cruzar.request`;
  `informe-conciliacion` (E10) pide `conciliacion-bancaria.cruzar.request`.

## Verificación

1. Fichero: `modules/contabilidad-libro/conciliacion-bancaria/`.
2. Eventos reales: subscribes `conciliacion-bancaria.cruzar.request`, `contabilidad.asiento_asentado`,
   `contabilidad.movimiento_regla_declarada`; publishes `conciliacion-bancaria.cruzar.response`,
   `.failed`, `partida-no-identificada.juzgar.request`, `partida-conciliatoria.desfase.request`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'" modules/contabilidad-libro/conciliacion-bancaria/index.js
   # → conciliacion-bancaria.cruzar.failed / partida-no-identificada.juzgar.request / partida-conciliatoria.desfase.request
   ```
4. Test unitario (si existe): empareja por clave natural; declara sin emparejar; desfase; sin extracto → abierto;
   sin `project_id` → 400 + failed.
