---
name: estado-cuenta-proveedor
description: >
  Skill FULL del módulo REFLEJO `estado-cuenta-proveedor` de la vertical contabilidad de Enki.
  EL EXTRACTO CONFRONTABLE CON EL PROVEEDOR: estado formal de la cuenta a una fecha (movimientos
  ordenados + saldo con su procedencia) listo para que el proveedor lo compare; las diferencias se
  declaran, jamás se ajustan solas. Compone desde `cuenta-proveedor` (N3), no recalcula. Sin estado.
  Úsala para operar, depurar o extender el reflejo, o para entender su contrato de eventos y sus
  reglas de negocio.
when-to-use: >
  - Cuando necesites componer el extracto del proveedor a una fecha de corte (RPC
    estado-cuenta-proveedor.extracto.request).
  - Cuando depures por qué `disponible:false` (no se declararon partidas y N3 no respondió), por
    qué `confrontacion.diferencia:null` (el proveedor no declaró su saldo) o por qué una partida va
    a `sin_fecha_o_sin_importe`.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    extracto (determinista, compone sin recalcular, las diferencias se declaran).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo estado-cuenta-proveedor.
tags: [enki, modulo, reflejo, contabilidad, estado-cuenta-proveedor]
---

# estado-cuenta-proveedor — REFLEJO STATELESS del extracto confrontable

## Qué hace el módulo

`estado-cuenta-proveedor` es un **REFLEJO STATELESS** (N4, hoja del plan): **EL EXTRACTO
CONFRONTABLE CON EL PROVEEDOR.** El **estado formal de la cuenta** a una fecha (movimientos
ordenados + saldo con su procedencia), **listo para que el proveedor lo compare** con su propia
contabilidad — la pieza de la **conciliación de saldos con el tercero**.

Atributos del diseño: `auxiliar:CuentaProveedor`. Métodos: `extracto(t:Tercero, hasta):Informe`.

**🔴 COMPONE, NO RECALCULA LA CUENTA.** El mayor auxiliar lo **DERIVA** `cuenta-proveedor` (N3);
aquí se **PIDE POR EVENTO** (`cuenta-proveedor.facturas_vivas.request` +
`cuenta-proveedor.saldo.request`) y se **COMPONE** el extracto. Si N3 no responde y no se declaran
las partidas → `disponible:false` (**jamás se inventa la cuenta**).

**🔴 LA CONFRONTACIÓN SE DECLARA, NO SE AJUSTA.** Si el proveedor declara su saldo
(`saldo_proveedor`), la **DIFERENCIA** con el saldo derivado se calcula y se **DECLARA**
(`diferencia`, `cuadra`) con las partidas que la explican si se declaran (`partidas_diferencia`); el
extracto **NO corrige nada**, **NO cuadra por su cuenta** y **NO decide quién tiene razón**
(`se_ajusta_automaticamente:false`; resuelve proveedor/asesor, `[ABIERTO]` quién confronta). **Sin
saldo del proveedor declarado no hay confrontación** (`diferencia:null`) — **no se simula**.

Invariantes:

- **DETERMINISTA**: mismas partidas + misma fecha de corte → mismo extracto (orden por fecha y, a
  igualdad, por orden de llegada).
- **Dato ausente = desconocido**: sin corte declarado `hasta:null` (todo lo conocido); una partida
  sin importe **NO se lee como 0** (va aparte en `sin_fecha_o_sin_importe`); sin partidas no se
  compone nada; una fecha de corte inválida se declara y se compone **sin corte**.
- **NO escribe, NO persiste, NO muta y NO decide**: el extracto es un **DERIVADO**; confrontarlo es
  del **proveedor/asesor**.
- **El SIGNO de una partida sale de su tipo DECLARADO** (`abono`/`pago`/`anticipo`/`descuento`/
  `rappel` restan) — **no hay convenio cableado**.
- **Sin `PosPersistencia` y sin `project.activated`**: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `estado-cuenta-proveedor.extracto.request` | `onExtractoRequest` | RPC reflejo (extracto puro, determinista): {project_id, tercero?\|tercero_id?\|nif?, cuenta?, convenio?, hasta?, partidas?\|movimientos?, saldo_derivado?, saldo_proveedor?, partidas_diferencia?, asientos?, periodo?} → {project_id, tipo:'estado-cuenta-proveedor', tercero, hasta, disponible, fuente_partidas, movimientos:[{fecha, clave, numero, concepto, importe, signo}], num_movimientos, sin_fecha_o_sin_importe, saldo_derivado, confrontable, confrontacion:{saldo_derivado, saldo_proveedor, diferencia, cuadra, partidas_diferencia, se_ajusta_automaticamente:false, resuelve}, abierto}. Las partidas se declaran o se PIDEN a cuenta-proveedor (N3) POR EVENTO; sin saldo del proveedor declarado no hay confrontacion (diferencia:null). Responde por estado-cuenta-proveedor.extracto.response; project_id ausente → estado-cuenta-proveedor.extracto.failed. OJO: si no hay partidas declaradas y N3 no responde, NO es un fallo — se responde 200 con disponible:false. |

### Publishes

| Evento | Descripción |
|---|---|
| `estado-cuenta-proveedor.extracto.response` | Respuesta RPC correlada de estado-cuenta-proveedor.extracto.request → {request_id, status:200, data:{tercero, hasta, disponible, movimientos, saldo_derivado, confrontable, confrontacion:{saldo_proveedor, diferencia, cuadra, se_ajusta_automaticamente:false}, abierto}}. Emitida por el helper _atender. |
| `estado-cuenta-proveedor.extracto.failed` | Par de fallo determinista (N4): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de estado-cuenta-proveedor.extracto.request. OJO: no hay datos para componer (disponible:false) NO es un fallo: es un no-disponible declarado en la response 200. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `estado-cuenta-proveedor.extracto.failed` cierra el círculo de
> `estado-cuenta-proveedor.extracto.request` cuando `_extracto` devuelve status ≠ 200
> (`400 INVALID_INPUT` por `project_id` ausente). **`disponible:false` NO es un fallo**: va en la
> response `200`.

> Nota: **no hay fire-and-forget** en este módulo. El único subscribe es la RPC
> `estado-cuenta-proveedor.extracto.request`; el resto de publishers son su response y su `failed`.
> La composición desde N3 se hace **pidiendo por EVENTO** dentro de `_extracto`, no por señal.

## Reglas de negocio

1. **El TERCERO**: `fuente.tercero` (de N3) o `input.tercero`; `null` si no hay.
2. **La FECHA DE CORTE (`hasta`) es DECLARABLE**: `_fecha(input.hasta)`; sin corte válido →
   `hasta:null` («todo lo conocido», declarado). `hasta_declarada` distingue «no se declaró» de «se
   declaró algo inválido».
3. **Las PARTIDAS** (`_partidas`): `input.partidas`/`input.movimientos` (array) → `fuente:
   'declaradas'`; si no, se pide a N3 por evento: `cuenta-proveedor.facturas_vivas.request`
   (partidas = `data.facturas`) y `cuenta-proveedor.saldo.request` (para el saldo, best-effort).
   Sin respuesta de N3 → `disponible:false`, `abierto.partidas` («el extracto NO se inventa»).
4. **Las PARTIDAS sin importe o sin fecha van APARTE**: importe `null` → a `sin_fecha_o_sin_importe`
   («la partida no declara importe: no se lee como 0»); sin fecha válida → también aparte («no se
   ordena contra el corte»). **No se estiman.**
5. **El corte filtra**: con `hasta` declarado, solo las partidas con `fecha <= hasta` entran en los
   movimientos; el resto queda fuera del extracto.
6. **El ORDEN es determinista**: por `fecha` ascendente y, a igualdad, por orden de llegada
   (`_orden`).
7. **El SIGNO** (`_firma`): `tipo ∈ {abono, pago, anticipo, descuento, rappel}` → `-1`; cualquier
   otro → `1`. **El tipo es DECLARADO; no hay convenio cableado.**
8. **El SALDO DERIVADO**: el de N3 si lo dio (`fuente.saldo`), o la suma de `signo × importe` de las
   partidas dentro del corte. Redondeado a 2.
9. **La CONFRONTACIÓN** (`confrontacion`): `saldo_proveedor` = `input.saldo_proveedor` o
   `input.confrontacion.saldo_proveedor`; `diferencia = saldo_derivado − saldo_proveedor`
   (redondeada a 2). **Si `saldo_proveedor` es `null` → `diferencia:null`, `cuadra:null`** (no se
   simula). `cuadra = diferencia === 0`. `se_ajusta_automaticamente:false`, `resuelve:'proveedor/
   asesor ([ABIERTO] quien confronta): las diferencias se declaran, no se ajustan solas'`.
10. **Las PARTIDAS DE DIFERENCIA** son **DECLARADAS** (`input.partidas_diferencia` o
    `input.confrontacion.partidas_diferencia`): **no se deducen solas**. Si hay diferencia sin
    partidas declaradas → `abierto.partidas_diferencia`.
11. **`confrontable:true`** siempre que haya partidas: el extracto está listo para que el proveedor
    lo compare (aunque no se haya confrontado aún).
12. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
    `400 INVALID_INPUT` (`field:'project_id'`).
13. **HTTP exacto**: éxito `200` (también con `disponible:false`); `project_id` ausente → `400`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `estado-cuenta-proveedor.extracto.response`. **No emite evento de dominio.**

### 1. `extracto` — partidas declaradas + saldo del proveedor declarado

```json
{
  "project_id": "e57a318a-...",
  "tercero": { "nif": "B123" },
  "hasta": "2026-09-30",
  "partidas": [
    { "clave": "F1", "fecha": "2026-09-01", "importe": 100, "tipo": "factura_compra" },
    { "clave": "P1", "fecha": "2026-09-15", "importe": 40, "tipo": "pago" }
  ],
  "saldo_proveedor": 55,
  "correlation_id": "abc-123"
}
```

Respuesta `200`: `hasta:'2026-09-30'`, `disponible:true`, `fuente_partidas:'declaradas'`,
`movimientos:[{fecha:'2026-09-01', clave:'F1', importe:100, signo:1}, {fecha:'2026-09-15',
clave:'P1', importe:40, signo:-1}]`, `saldo_derivado:60`, `confrontable:true`,
`confrontacion:{saldo_derivado:60, saldo_proveedor:55, diferencia:5, cuadra:false,
se_ajusta_automaticamente:false, resuelve:'proveedor/asesor (...)'}` y `abierto.partidas_diferencia`
(«hay diferencia … y no se declararon las partidas que la explican: no se deducen solas»).

### 2. `extracto` — sin saldo del proveedor → `diferencia:null` (no se simula)

Con partidas pero sin `saldo_proveedor` → `confrontacion.saldo_proveedor:null`, `diferencia:null`,
`cuadra:null` y `abierto.confrontacion` («el proveedor no declaro su saldo: el extracto es
confrontable pero no se ha confrontado ([ABIERTO] quien confronta)»).

### 3. `extracto` — sin partidas y N3 sin responder → `disponible:false`

`disponible:false`, `partidas:[]`, `saldo_derivado:null`, `confrontable:false` y
`abierto.partidas` («el extracto NO se inventa»). **No es un fallo: es 200.**

### 4. `extracto` — partidas sin importe → van aparte

Una partida sin importe → `sin_fecha_o_sin_importe:[{..., motivo:'la partida no declara importe:
no se lee como 0 (nada se estima)'}]`. **No se lee como 0.**

### 5. `extracto` — fecha de corte inválida → se compone sin corte

`hasta` inválido → `hasta:null`, `hasta_declarada:true` y `abierto.hasta` («la fecha de corte
declarada no es una fecha valida: se compone sin corte»).

### 6. Fallo — falta `project_id`

Respuesta `400` + `estado-cuenta-proveedor.extracto.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/estado-cuenta-proveedor.test.js`. Cubre:

- `extracto` con partidas declaradas + corte → `200 disponible:true`, movimientos **ordenados** por
  fecha (y por orden de llegada a igualdad), `saldo_derivado` correcto.
- Partidas pedidas **por evento** a `cuenta-proveedor` (N3) → `fuente_partidas:'cuenta-proveedor'`.
- **Sin partidas y N3 sin responder** → `disponible:false` (200, **no fallo**).
- **Saldo del proveedor declarado** → `diferencia = saldo_derivado − saldo_proveedor`, `cuadra`
  coherente; **sin saldo del proveedor** → `diferencia:null` (**no se simula**).
- **Las diferencias se declaran, no se ajustan**: `se_ajusta_automaticamente:false` siempre.
- Partida **sin importe** → `sin_fecha_o_sin_importe` (no se lee como 0); partida sin fecha →
  aparte (no se ordena contra el corte).
- Signo por **tipo declarado** (`pago`/`abono`/`anticipo`/`descuento`/`rappel` restan).
- Fecha de corte inválida → se declara y se compone sin corte.
- **Determinismo**: mismas partidas + mismo corte → mismo extracto.
- `project_id` ausente → `400 INVALID_INPUT` + `estado-cuenta-proveedor.extracto.failed`.
- `toolExtracto` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `EstadoCuentaProveedor extends ModuloHibridoReflejo`; `name = 'estado-cuenta-proveedor'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/estado-cuenta-proveedor/`; es de la vertical **entrada**).
- `onExtractoRequest` usa `this._atender(e, 'extracto', 'estado-cuenta-proveedor.extracto.response',
  async (d) => {...})` y publica `estado-cuenta-proveedor.extracto.failed` si `status !== 200`.
- Proyección `_extracto(input)` (`async`: pide partidas/saldo a N3 por evento si no vienen
  declaradas); helpers `_partidas`, `_firma`, `_fecha`, `_num`. Tool `toolExtracto`.
- `_invalid` / `_rpc` / `_round` vienen de `modulo-hibrido-reflejo`.
- **DEP**: **compone desde `cuenta-proveedor` (N3)** por evento
  (`cuenta-proveedor.facturas_vivas.request` + `cuenta-proveedor.saldo.request`) — **NO recalcula la
  cuenta**; la ficha del tercero es `maestro-terceros` (N1) y el libro `escritor-diario` (B2), a los
  que N3 acude por evento.
- **🔴 LAS DIFERENCIAS SE DECLARAN, NO SE AJUSTAN**: el extracto es **confrontable**; la
  confrontación la resuelven el proveedor/asesor (`se_ajusta_automaticamente:false`). **NO decide
  quién tiene razón.**
- **DATO AUSENTE = DESCONOCIDO**: sin corte → `hasta:null` (todo lo conocido); partida sin importe
  → aparte (**no 0**); sin saldo del proveedor → `diferencia:null` (no se simula la confrontación).
  **NO escribe, NO persiste, NO muta.**
