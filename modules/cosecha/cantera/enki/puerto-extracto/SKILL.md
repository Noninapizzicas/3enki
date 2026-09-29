---
name: puerto-extracto
description: >
  Skill FULL del módulo CONVERSOR `puerto-extracto` de la vertical contabilidad de Enki.
  FRONTERA DE CANAL/FORMATO DEL EXTRACTO BANCARIO: convierte el extracto EXTERNO (lo que
  cada banco entregue: CSV, JSON, salida de un conector) en el `Movimiento` canónico
  NORMALIZADO — un adaptador por banco con `mapeo` y `canal` declarables. Cruza formato, no
  decide contenido: no interpreta partidas ni concilia. Sin canal no convierte, sin importe
  no hay movimiento y lo ausente queda null + `abierto`. Úsala para operar, depurar o
  extender el conversor, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites normalizar el extracto de un banco a Flujo<Movimiento> (RPC
    puerto-extracto.entrar.request).
  - Cuando depures por qué la conversión falla (400 CANAL_NO_DECLARADO, 422
    FORMATO_NO_DECLARABLE, 400 INVALID_INPUT si falta el extracto o su lista de movimientos).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    de la frontera de canal (adaptador por banco declarable, sin plantilla cableada, el signo
    viaja aparte, nada se estima, no concilia).
  - Cuando vayas a escribir/ampliar el test unitario del conversor puerto-extracto.
tags: [enki, modulo, conversor, contabilidad, puerto-extracto]
---

# puerto-extracto — CONVERSOR STATELESS de la frontera bancaria

## Qué hace el módulo

`puerto-extracto` es un **CONVERSOR STATELESS** (E2, hoja del plan): **FRONTERA DE
CANAL/FORMATO DEL EXTRACTO BANCARIO**. Convierte el extracto **EXTERNO** (lo que cada banco
entregue: CSV, JSON, salida de un conector, un volcado del asesor) en el `Movimiento`
**canónico NORMALIZADO** del dominio.

**UN ADAPTADOR POR BANCO**: el adaptador lo declara el sitio con el `mapeo` (campo canónico →
clave externa del banco) y el `canal`; si falta, **se declara que hay que crearlo** — **NO
se adivina el formato de ningún banco**.

**LA LEY ENTRA COMO DATO** (invariante 5): el `canal`/`formato`, el `mapeo` y los
`canales_declarables` entran como **DATO**; **NO hay ninguna plantilla de banco cableada**
(ni cabeceras, ni separadores, ni signos de abono/cargo, ni formato de fecha). Sin canal
declarado **NO se convierte** (`CANAL_NO_DECLARADO`); un canal sin mapeo y sin ser canónico
se rechaza (`422 FORMATO_NO_DECLARABLE`).

Campos canónicos del `Movimiento`: `fecha, importe, signo, concepto, referencia, saldo,
cuenta, contraparte` (ausente → `null` + `abierto`, **jamás se estima**). El **importe se
normaliza sin signo** (`Math.abs`) y el **SIGNO viaja aparte y declarado**. **Sin importe no
hay movimiento** (no se inventa): la fila va a `abiertos`.

**Cruza FORMATO, no decide CONTENIDO**: no interpreta partidas ni cruza con el libro (eso es
`conciliacion-bancaria` E1); emite los movimientos normalizados con `conciliado:false`.

Es un **CONVERSOR stateless**: sin `PosPersistencia`, sin `onProjectActivated`. Proyección
`_entrar`. Publica `contabilidad.movimiento_bancario` (**uno por movimiento**; lo consume
`cuadre-cobro-pago` E3).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `puerto-extracto.entrar.request` | `onEntrarRequest` | RPC conversor: {project_id, canal\|formato, extracto\|externo, banco?, mapeo?, canales_declarables?} → {banco, canal, adaptador_declarado, total, abiertos:[{clave, faltantes}], movimientos:[{fecha, importe, signo, concepto, referencia, saldo, cuenta, contraparte, clave, metadatos, abierto}], conciliado:false}. Normaliza el extracto externo a Flujo<Movimiento> con el `mapeo` declarado (un adaptador por banco). Sin canal → CANAL_NO_DECLARADO; canal sin mapeo ni canonico → 422 FORMATO_NO_DECLARABLE. Sin importe → no es movimiento (va a abiertos). Exito → publica contabilidad.movimiento_bancario por cada movimiento y responde por puerto-extracto.entrar.response; fallo → puerto-extracto.entrar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `puerto-extracto.entrar.response` | Respuesta RPC correlada de puerto-extracto.entrar.request → {request_id, status:200, data:{banco, canal, total, abiertos, movimientos, conciliado:false}}. Emitida por el helper _atender. |
| `puerto-extracto.entrar.failed` | Par de fallo determinista (E2): canal no declarado (400), extracto invalido (400) o canal no declarable (422) → {status, error:{code, message, details?}}. Cierra el circulo de puerto-extracto.entrar.request. |
| `contabilidad.movimiento_bancario` | Fire-and-forget (E2): cada movimiento bancario normalizado entra al libro → {project_id, banco, canal, movimiento, clave, correlation_id}. Lo consume cuadre-cobro-pago (E3). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `puerto-extracto.entrar.failed` cierra el círculo de
> `puerto-extracto.entrar.request` cuando `_entrar` devuelve status ≠ 200 (`400`/`422`).

> Nota de honestidad (cruce con `index.js`): `onEntrarRequest` publica
> `contabilidad.movimiento_bancario` **solo si `status === 200`**, **una vez por cada
> movimiento** de `res.data.movimientos` (un evento por movimiento); la rama `else` publica
> `puerto-extracto.entrar.failed`. Un extracto válido **sin movimientos** devuelve `200`
> con `movimientos:[]` → **no emite ningún evento**.

## Reglas de negocio

1. **El canal/formato es DECLARABLE**: `input.canal` (o su alias `input.formato`), normalizado
   con `String(...).trim()`; vacío → `400 CANAL_NO_DECLARADO` con `{canales_declarables}`.
   **Sin canal no se adivina el formato de ningún banco.**
2. **El extracto es obligatorio**: `input.extracto` (o `input.externo`); `undefined`/`null` →
   `400 INVALID_INPUT` (`field:'extracto'`).
3. **`banco` declarable y opcional**: `String(input.banco)` o `null`; viaja en la respuesta y
   dentro de cada movimiento, pero no condiciona la conversión.
4. **Formato no declarable sin mapeo**: `_mapeoDe(input, canal)` devuelve el `input.mapeo` si
   es objeto; si no, construye la **identidad** (campo → su propio nombre) solo cuando
   `canal === 'canonico' || canal === 'enki'`; en cualquier otro caso → `null` → `422
   FORMATO_NO_DECLARABLE` con `{canal, banco, canales_declarables}`.
5. **Los canales declarables los declara el sitio**: `_canales(input)` devuelve
   `input.canales_declarables` (array, filtrado); sin declarar → `[]`. **El módulo no conoce
   ningún banco de memoria.**
6. **El extracto es una lista de movimientos**: acepta un **array**, `{movimientos:[...]}` o
   `{apuntes:[...]}`; si no hay lista → `400 INVALID_INPUT` (`field:'extracto.movimientos'`).
7. **Traducción por fila con mapeo**: `_aMovimiento(fila, mapeo, canal, banco)` recorre
   `CAMPOS_MOVIMIENTO` (`fecha, importe, signo, concepto, referencia, saldo, cuenta,
   contraparte`), lee `fila[mapeo[campo] ?? campo]`; si el valor es `undefined`/`null`/`''` →
   `null` y se apila en `faltantes`/`abierto`.
8. **El importe se normaliza sin signo**: `Math.abs(Number(value.importe))`; si no es finito
   → `null`. El `signo` declarado se respeta; si no viene, se deriva del signo del número
   (`cargo` si negativo, `abono` si no); sin número → `null`.
9. **Sin importe no hay movimiento**: la fila se aparta en `abiertos` con `{fila, faltantes}`
   y **no** entra en `movimientos`.
10. **Clave natural del movimiento**: `_clave(m)` = `fecha|importe|signo|(referencia ??
    concepto)`, con `'-'` para cada parte ausente.
11. **Movimientos con campos ausentes sí entran pero se declaran**: si el movimiento tiene
    importe pero le faltan otros campos, se incluye y se añade a `abiertos` con `{clave,
    faltantes}`.
12. **Metadatos**: los campos del banco no reconocidos se conservan bajo `value.metadatos`
    (no se pierde nada); cada movimiento lleva también `banco`, `canal`, `clave` y `abierto`.
13. **Cruza formato, no contenido**: la respuesta declara `conciliado:false` — no interpreta
    partidas ni cruza con el libro (eso es `conciliacion-bancaria` E1).
14. **`adaptador_declarado`**: `Boolean(input.mapeo)`.
15. **`project_id` con fallback**: `input.project_id || this.project_id || null`.
16. **HTTP exacto**: éxito `200`; canal no declarado / extracto inválido / lista ausente →
    `400`; canal no declarable → `422`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `puerto-extracto.entrar.response` y emite `contabilidad.movimiento_bancario`
(uno por movimiento).

### 1. `entrar` — extracto de un banco con mapeo declarado

```json
{
  "project_id": "e57a318a-...",
  "canal": "banco_x_csv",
  "banco": "banco_x",
  "extracto": { "movimientos": [ { "f_oper": "2026-09-01", "importe": -121.5, "concepto": "RECIBO PROV", "ref": "R-1" } ] },
  "mapeo": { "fecha": "f_oper", "importe": "importe", "concepto": "concepto", "referencia": "ref" },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "banco": "banco_x",
  "canal": "banco_x_csv",
  "adaptador_declarado": true,
  "total": 1,
  "abiertos": [ { "clave": "2026-09-01|121.5|cargo|R-1", "faltantes": ["signo", "saldo", "cuenta", "contraparte"] } ],
  "movimientos": [ { "banco": "banco_x", "canal": "banco_x_csv", "fecha": "2026-09-01", "importe": 121.5, "signo": "cargo", "concepto": "RECIBO PROV", "referencia": "R-1", "saldo": null, "cuenta": null, "contraparte": null, "metadatos": {}, "abierto": ["signo", "saldo", "cuenta", "contraparte"], "clave": "2026-09-01|121.5|cargo|R-1" } ],
  "conciliado": false
}
```

Emite **un** `contabilidad.movimiento_bancario` por movimiento:

```json
{ "project_id": "e57a318a-...", "banco": "banco_x", "canal": "banco_x_csv", "movimiento": { "...": "..." }, "clave": "2026-09-01|121.5|cargo|R-1", "correlation_id": "abc-123" }
```

Lo consume `cuadre-cobro-pago` (E3).

### 2. `entrar` — canal canónico sin mapeo (identidad)

```json
{ "canal": "canonico", "extracto": [ { "fecha": "2026-09-01", "importe": 121.5, "signo": "abono" } ] }
```

Respuesta `200` con `adaptador_declarado:false` y los movimientos en forma canónica.

### 3. `entrar` — fila sin importe se aparta (no es movimiento)

```json
{ "canal": "canonico", "extracto": [ { "fecha": "2026-09-01", "concepto": "sin importe" } ] }
```

Respuesta `200`: `total:0`, `movimientos:[]`,
`abiertos:[{ "fila": { "fecha": "2026-09-01", "concepto": "sin importe" }, "faltantes": ["importe","signo","referencia","saldo","cuenta","contraparte"] }]`.

### 4. Fallo — sin canal declarado

```json
{ "extracto": [ { "fecha": "2026-09-01", "importe": 10 } ] }
```

Respuesta `400` + `puerto-extracto.entrar.failed`:

```json
{ "status": 400, "error": { "code": "CANAL_NO_DECLARADO", "message": "hay que declarar el canal/formato del extracto (un adaptador por banco)", "details": { "canales_declarables": [] } } }
```

### 5. Fallo — canal no declarable sin mapeo

```json
{ "canal": "banco_x_csv", "extracto": [ { "f_oper": "2026-09-01", "importe": 10 } ] }
```

Respuesta `422` + `puerto-extracto.entrar.failed`:

```json
{ "status": 422, "error": { "code": "FORMATO_NO_DECLARABLE", "message": "canal no declarable: declara `mapeo` (campo canonico → clave del banco) — un adaptador por banco", "details": { "canal": "banco_x_csv", "banco": null, "canales_declarables": [] } } }
```

## Tests

El test unitario vive en `tests/unit/puerto-extracto.test.js`. Cubre:

- `entrar` con canal + mapeo → `200`, movimientos mapeados, `abiertos` con faltantes,
  `adaptador_declarado:true`, `conciliado:false`; emite **un** `contabilidad.movimiento_bancario`
  por movimiento.
- Canal `'canonico'`/`'enki'` sin mapeo → identidad por nombre canónico; `adaptador_declarado:false`.
- `entrar` sin `canal` → `400 CANAL_NO_DECLARADO` + `puerto-extracto.entrar.failed`.
- Canal no declarable sin mapeo → `422 FORMATO_NO_DECLARABLE`.
- `extracto` ausente o sin lista → `400 INVALID_INPUT` (`field:'extracto'`/`'extracto.movimientos'`).
- Fila **sin importe** → se aparta en `abiertos`, no entra en `movimientos` (`total:0`).
- Importe normalizado sin signo + signo declarado/derivado; `_clave` natural estable.
- Campos extra del banco → conservados en `metadatos`.
- `toolEntrar` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `PuertoExtracto extends ModuloHibridoReflejo`; `name = 'puerto-extracto'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (CONVERSOR stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/puerto-extracto/`).
- Constante `CAMPOS_MOVIMIENTO = ['fecha','importe','signo','concepto','referencia','saldo',
  'cuenta','contraparte']`.
- `onEntrarRequest` usa `this._atender(e, 'entrar', 'puerto-extracto.entrar.response',
  async (d) => {...})`; dentro hace el cierre de círculo y, en éxito, recorre
  `res.data.movimientos` publicando `contabilidad.movimiento_bancario` por cada uno.
- Proyección `_entrar(input)`; helpers `_aMovimiento(fila, mapeo, canal, banco)`, `_clave(m)`,
  `_mapeoDe(input, canal)`, `_canales(input)`. Tool `toolEntrar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: su salida la consume `cuadre-cobro-pago` (E3) vía `contabilidad.movimiento_bancario`;
  la conciliación (interpretar partidas y cruzar con el libro) es de `conciliacion-bancaria` (E1).
