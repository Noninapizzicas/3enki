---
name: mayor-balanza
description: >
  Skill FULL del módulo REFLEJO `mayor-balanza` de la vertical contabilidad de Enki (B3,
  hoja del plan). LOS SALDOS SE DERIVAN DEL DIARIO — nunca un almacén paralelo. Este
  módulo NO muta nada: recibe el diario (en el payload o lo LEE de escritor-diario (B2)
  por EVENTO contabilidad.diario.leer.request) y calcula saldos por cuenta, balanza
  (sumas y saldos: suma_debe/suma_haber + saldo_deudor/saldo_acreedor y totales que
  cuadran) y movimientos por cuenta. DETERMINISTA: mismas entradas → mismo mayor. «El
  asiento original no se borra»: la balanza refleja la suma de TODO lo asentado. Sin
  estado. Si el diario no responde → 503 DEPENDENCIA_NO_DISPONIBLE y NUNCA se emite un
  mayor/balanza inventado. Úsala para operar, depurar o extender el reflejo, o para
  entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites derivar los saldos por cuenta (RPC contabilidad.mayor.saldo.request),
    la balanza de sumas y saldos (contabilidad.mayor.balanza.request) o los movimientos de
    una cuenta (contabilidad.mayor.movimientos.request).
  - Cuando depures por qué no se deriva nada (503 DEPENDENCIA_NO_DISPONIBLE si
    escritor-diario B2 no responde, 400 INVALID_INPUT si falta project_id/cuenta).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), la derivación
    determinista desde el diario y el invariante «los saldos se derivan, no se almacenan».
  - Cuando vayas a escribir/ampliar el test unitario del reflejo mayor-balanza.
tags: [enki, modulo, reflejo, contabilidad, mayor-balanza, saldos, determinista]
---

# mayor-balanza — REFLEJO que deriva el mayor y la balanza del diario

## Qué hace el módulo

`mayor-balanza` es un **REFLEJO STATELESS** (B3, hoja del plan): **LOS SALDOS SE DERIVAN
DEL DIARIO**. **Nunca un almacén paralelo**: este módulo **no muta nada** — recibe el
diario (en el payload o lo **LEE** de `escritor-diario` (B2) por **EVENTO**
`contabilidad.diario.leer.request`) y calcula:

- **saldos por cuenta** (`_saldoPorCuenta`);
- **balanza de sumas y saldos** (`_balanza`);
- **movimientos por cuenta** (`_movimientosDe`).

Es **DETERMINISTA**: *mismas entradas → mismo mayor* (un test unitario lo afirma). La
invariante **«el asiento original no se borra»** se cumple aquí: la balanza refleja la
**suma de TODO lo asentado**.

Es **stateless**: sin PosPersistencia ni `project.activated` — cada op **entra objeto,
sale objeto**. El contrato es **TOLERANTE**: si `escritor-diario` (B2) **no responde**, se
devuelve **`503 DEPENDENCIA_NO_DISPONIBLE`** y **NUNCA** se emite un mayor/balanza
inventado. Emite `contabilidad.balanza_calculada` en éxito y su par determinista en fallo.
La dependencia con el diario es **por EVENTO, nunca por `require` cruzado**.

> **NO REUTILIZA**: derivación del diario propia; ningún módulo del inventario lleva
> mayor/balanza.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.mayor.saldo.request` | `onSaldoRequest` | RPC reflejo: {project_id, periodo?, diario?} → {project_id, periodo, saldos:[{cuenta, debe, haber, saldo}], por_cuenta:{cuenta:importe}, n_cuentas}. Deriva los saldos del diario (payload o EVENTO contabilidad.diario.leer.request). Proyeccion PURA de lectura (no muta). Si no hay diario → 503 DEPENDENCIA_NO_DISPONIBLE. Responde por contabilidad.mayor.saldo.response; error → contabilidad.mayor.saldo.failed. |
| `contabilidad.mayor.balanza.request` | `onBalanzaRequest` | RPC reflejo: {project_id, periodo?, diario?} → {project_id, balanza:{lineas:[{cuenta, suma_debe, suma_haber, saldo_deudor, saldo_acreedor}], total_debe, total_haber, total_saldo_deudor, total_saldo_acreedor, cuadra}, n_cuentas}. Balanza de sumas y saldos DERIVADA del diario; determinista. Exito publica contabilidad.balanza_calculada y responde por contabilidad.mayor.balanza.response; sin diario → 503 → contabilidad.mayor.balanza.failed. |
| `contabilidad.mayor.movimientos.request` | `onMovimientosRequest` | RPC reflejo: {project_id, cuenta, periodo?, diario?} → {project_id, cuenta, periodo, movimientos:[{asiento_id, clave_natural, tipo, fecha_operacion, debe, haber}], n}. Proyeccion PURA de lectura (no muta). Responde por contabilidad.mayor.movimientos.response; si falta cuenta o no hay diario → contabilidad.mayor.movimientos.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.balanza_calculada` | Fire-and-forget (B3): la balanza de sumas y saldos quedo calculada desde el diario → {project_id, periodo, balanza:{lineas, total_debe, total_haber, cuadra}, n_cuentas}. Lo consume estados-contables (C1/C2) como base del balance y la cuenta de resultados. |
| `contabilidad.mayor.saldo.failed` | Par de fallo determinista: saldo sin project_id, o escritor-diario (B2) no respondio (503 DEPENDENCIA_NO_DISPONIBLE). Cierra el circulo de contabilidad.mayor.saldo.request. |
| `contabilidad.mayor.balanza.failed` | Par de fallo determinista: balanza sin project_id, o escritor-diario (B2) no respondio (503 DEPENDENCIA_NO_DISPONIBLE). Cierra el circulo de contabilidad.mayor.balanza.request. |
| `contabilidad.mayor.movimientos.failed` | Par de fallo determinista: movimientos sin project_id/cuenta, o escritor-diario (B2) no respondio (503 DEPENDENCIA_NO_DISPONIBLE). Cierra el circulo de contabilidad.mayor.movimientos.request. |
| `contabilidad.balanza_calculada.failed` | Par de fallo del evento de dominio contabilidad.balanza_calculada: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.mayor.saldo.failed` cierra `contabilidad.mayor.saldo.request`;
> `contabilidad.mayor.balanza.failed` cierra `contabilidad.mayor.balanza.request`;
> `contabilidad.mayor.movimientos.failed` cierra `contabilidad.mayor.movimientos.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.mayor.saldo.response`, `contabilidad.mayor.balanza.response` y
> `contabilidad.mayor.movimientos.response` (los pares response de los RPC); **NO están
> declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el par
> de fallo real es `<op>.failed`) — `contabilidad.balanza_calculada.failed` es el par de
> fallo del evento de DOMINIO; el reflejo solo publica los pares `*.failed` de sus RPC.

> Nota: no está en module.json pero sí lo emite index.js — el módulo publica por `_rpc`
> `contabilidad.diario.leer.request` (dependencia por EVENTO hacia escritor-diario B2, no
> declarada como publisher).

## Reglas de negocio

1. **Los saldos se DERIVAN, no se almacenan**: `_saldoPorCuenta` recorre el diario y acumula
   por cuenta `debe`, `haber` y `saldo = debe - haber` (redondeado a céntimos). **No existe
   un store de saldos**: el mayor es una proyección del diario.
2. **El diario se LEE por EVENTO (contrato TOLERANTE)**: `_diarioDe` acepta el diario del
   payload (`input.diario`/`input.asientos` en array o `{diario:[]}`); si no, pide
   `contabilidad.diario.leer.request` a `escritor-diario` (B2) (timeout 4000ms). Si **no
   responde** → `null` → **`503 DEPENDENCIA_NO_DISPONIBLE`** con
   `{ dependencia:'escritor-diario', accion:'NO_CALCULAR_PUBLICAR_FALLO' }`.
   **Nunca se inventa un mayor sin diario.**
3. **DETERMINISMO**: mismas entradas → mismo mayor, bit a bit. Toda op es una proyección
   pura de lectura; el `status 200` incluye `derivado_del_diario:true` y (saldo/balanza)
   `determinista:true`.
4. **Filtro de periodo**: `_enPeriodo` acepta un asiento si no se declara periodo, o si
   `asiento.periodo === periodo`, o si `asiento.fecha_operacion` empieza por el periodo
   (corte por `YYYY-MM`).
5. **Balanza de sumas y saldos**: por línea `{ cuenta, suma_debe, suma_haber, saldo_deudor =
   max(saldo,0), saldo_acreedor = max(-saldo,0) }`; totales `total_debe`, `total_haber`,
   `total_saldo_deudor`, `total_saldo_acreedor`, y `cuadra = |total_debe - total_haber| <
   0.005`. La balanza es la **prueba** de que el libro cuadra.
6. **«El asiento original no se borra»**: la balanza **refleja la suma de TODO lo
   asentado** (la `nota` del payload lo dice). Reprocesar no cambia nada: es derivación, no
   mutación.
7. **Movimientos por cuenta**: `_movimientosDe` devuelve por apunte de la cuenta
   `{ asiento_id, clave_natural, tipo, fecha_operacion, debe, haber }` (redondeado a
   céntimos). Es lectura pura.
8. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
   falta `cuenta` (en movimientos) → `400 INVALID_INPUT cuenta`. Shape: `{ status:400,
   error:{ code:'INVALID_INPUT', message:'<campo> requerido', details:{ field:<campo> } } }`.
9. **HTTP exacto**: éxito `200`; payload inválido → `400`; diario no disponible → `503`;
   excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.mayor.saldo.response`,
`contabilidad.mayor.balanza.response` y `contabilidad.mayor.movimientos.response`.

### 1. `saldo` — saldos por cuenta (derivados)

```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "diario": [
    { "id": "A1", "periodo": "2026-09", "apuntes": [ { "cuenta": "430", "debe": 121, "haber": 0 }, { "cuenta": "700", "debe": 0, "haber": 100 }, { "cuenta": "477", "debe": 0, "haber": 21 } ] }
  ]
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "saldos": [ { "cuenta": "430", "debe": 121, "haber": 0, "saldo": 121 }, { "cuenta": "700", "debe": 0, "haber": 100, "saldo": -100 }, { "cuenta": "477", "debe": 0, "haber": 21, "saldo": -21 } ],
  "por_cuenta": { "430": 121, "700": -100, "477": -21 },
  "n_cuentas": 3,
  "derivado_del_diario": true,
  "determinista": true
}
```

### 2. `balanza` — balanza de sumas y saldos (cuadra)

```json
{ "project_id": "e57a318a-...", "periodo": "2026-09" }
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "periodo": "2026-09",
  "balanza": {
    "lineas": [ { "cuenta": "430", "suma_debe": 121, "suma_haber": 0, "saldo_deudor": 121, "saldo_acreedor": 0 }, { "cuenta": "700", "suma_debe": 0, "suma_haber": 100, "saldo_deudor": 0, "saldo_acreedor": 100 }, { "cuenta": "477", "suma_debe": 0, "suma_haber": 21, "saldo_deudor": 0, "saldo_acreedor": 21 } ],
    "total_debe": 121, "total_haber": 121, "total_saldo_deudor": 121, "total_saldo_acreedor": 121, "cuadra": true
  },
  "n_cuentas": 3,
  "derivado_del_diario": true,
  "determinista": true,
  "nota": "la balanza refleja la suma de TODO lo asentado: el asiento original no se borra"
}
```
Emite `contabilidad.balanza_calculada` (res.data + `correlation_id`).

### 3. `movimientos` — movimientos de una cuenta (puros)

```json
{ "project_id": "e57a318a-...", "cuenta": "430", "periodo": "2026-09" }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "cuenta": "430", "periodo": "2026-09", "movimientos": [ { "asiento_id": "A1", "clave_natural": "...:VENTA:9f2c...", "tipo": "NORMAL", "fecha_operacion": "2026-09-12", "debe": 121, "haber": 0 } ], "n": 1, "derivado_del_diario": true }
```

### 4. Fallo — sin diario → 503

```json
{ "project_id": "e57a318a-..." }
```
(business: `escritor-diario` no responde) → Respuesta `503` +
`contabilidad.mayor.saldo.failed`:
```json
{ "status": 503, "error": { "code": "DEPENDENCIA_NO_DISPONIBLE", "message": "escritor-diario (B2) no respondio: no se deriva un mayor sin diario", "details": { "dependencia": "escritor-diario", "accion": "NO_CALCULAR_PUBLICAR_FALLO" } } }
```

### 5. Fallo — payload inválido

Sin `cuenta` en `movimientos` → `400 INVALID_INPUT cuenta` + `contabilidad.mayor.movimientos.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "cuenta requerido", "details": { "field": "cuenta" } } }
```

### 6. Tools (sin RPC en module.json)

`toolSaldoPorCuenta` → `_saldoPorCuenta`; `toolBalanza` → `_balanza`; `toolMovimientosDe`
→ `_movimientosDe`.

## Tests

El test vive en `tests/unit/mayor-balanza.test.js`. Cubre:

- `saldo` con diario en el payload → `200`, saldos y `por_cuenta` correctos; **no muta**.
- `balanza` → `200`, `cuadra:true` con un diario cuadrado, `cuadra:false` con uno que no;
  emite `contabilidad.balanza_calculada`.
- **Determinismo**: la MISMA entrada devuelve EXACTAMENTE el MISMO resultado (dos llamadas).
- Filtro por `periodo` (asiento por `periodo` o por prefijo de `fecha_operacion`).
- `movimientos` de una cuenta → lista de apuntes con `asiento_id`/`clave_natural`; sin
  `cuenta` → `400 INVALID_INPUT` + `contabilidad.mayor.movimientos.failed`.
- **Dependencia tolerante**: sin diario en el payload y `escritor-diario` (B2) no responde →
  `503 DEPENDENCIA_NO_DISPONIBLE` (`NO_CALCULAR_PUBLICAR_FALLO`), **nunca** un mayor
  inventado.
- El reflejo es **stateless**: sin `project.activated` ni persistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/mayor-balanza
node --test tests/unit/mayor-balanza.test.js
```

## Notas de implementación

- Clase `MayorBalanza extends ModuloHibridoReflejo`; `name = 'mayor-balanza'`,
  `version = 'reflejo-0.1.0'`. **Sin store** (reflejo stateless: nada que persistir).
- Constante implícita: tolerancia `EPS = 0.005` para el `cuadra` de la balanza.
- `onSaldoRequest`/`onMovimientosRequest` publican solo el par `*.failed` si `status !== 200`;
  `onBalanzaRequest` publica `contabilidad.balanza_calculada` en éxito y
  `contabilidad.mayor.balanza.failed` en fallo. Todos delegan en
  `_atender(e, '<op>', 'contabilidad.mayor.<op>.response', fn)`.
- Proyecciones puras: `_saldoPorCuenta` (async), `_balanza` (async, delega en
  `_saldoPorCuenta`), `_movimientosDe` (async), `_diarioDe` (async, EVENTO B2), `_enPeriodo`.
  `_rpc`/`_invalid`/`_errorResponse` vienen de la base.
- Tools: `toolSaldoPorCuenta`, `toolBalanza`, `toolMovimientosDe`.
- DEP hacia delante: `contabilidad.balanza_calculada` lo consume `estados-contables`
  (C1/C2) como base del balance y la cuenta de resultados. DEP hacia atrás por evento:
  `escritor-diario` (B2) provee el diario (`contabilidad.diario.leer.request`).
