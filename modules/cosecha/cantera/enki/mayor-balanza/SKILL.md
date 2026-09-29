---
name: mayor-balanza
description: >
  Skill FULL del módulo REFLEJO `mayor-balanza` de la vertical contabilidad de Enki.
  Deriva el MAYOR (saldos por cuenta) y la BALANZA (sumas y saldos) del diario sin
  mutar nada: cálculo puro y determinista, con la FUENTE declarada (`diario` vs
  `espejo`) y el descuadre EXPUESTO, no escondido. Úsala para operar, depurar o
  extender el reflejo, o para entender su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites los saldos por cuenta (RPC mayor-balanza.saldos.request) o la
    balanza de sumas y saldos (RPC mayor-balanza.balanza.request).
  - Cuando depures por qué la balanza no cuadra (`cuadra:false` con `aviso` no nulo) o
    por qué falta `project_id` (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes de derivación (cálculo puro, una fuente declarada, descuadre = error).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo mayor-balanza.
tags: [enki, modulo, reflejo, contabilidad, mayor-balanza]
---

# mayor-balanza — REFLEJO STATELESS de los derivados del diario

## Qué hace el módulo

`mayor-balanza` es un **REFLEJO STATELESS** (B3, hoja del plan, hoja del libro): deriva
el **MAYOR** (saldos por cuenta) y la **BALANZA** (sumas y saldos) del diario. **NO
muta nada**: es **cálculo puro** desde los asientos. El almacén de los asientos es
`escritor-diario` (B2); aquí solo se **proyecta**.

El diario llega por **DOS vías**, ninguna es un `require` cruzado:

- **`contabilidad.asiento_registrado`** (fire-and-forget B2 → B3): se **ACUMULA** la
  muestra del asiento en un **espejo en memoria** (idempotente por `clave_natural` o
  `numero`; un hecho = un asiento). **No** muta el libro.
- **`mayor-balanza.saldos.request` / `.balanza.request`**: se **PIDE** el diario a
  `escritor-diario` **POR EVENTO** (RPC `escritor-diario.asientos.request`) y, si no
  responde en timeout, se deriva del espejo. Se declara de dónde salió (`fuente`).

Invariantes:
- **Cálculo puro**: el mayor **no reescribe** asientos; solo suma debe/haber por cuenta
  (invariante 2: el asiento original no se borra).
- **Determinista**: mismo diario → **mismo mayor**. Orden estable por código de cuenta
  (`localeCompare`).
- **La partida doble cuadra**: si **Σ debe ≠ Σ haber** la balanza **declara** el
  descuadre (`cuadra:false`, `aviso`), **no lo matiza** (invariante 1: un descuadre es
  **ERROR**, no estado).
- **La balanza no es un estado del libro**: es una **proyección del mayor**.

Sin `PosPersistencia` y sin `project.activated`: **no es custodio** (REFLEJO puro).
Proyecciones `_saldos` y `_balanza`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `mayor-balanza.saldos.request` | `onSaldosRequest` | RPC reflejo (cálculo puro): {project_id, ejercicio?} → {project_id, ejercicio, fuente:'diario'\|'espejo', total_cuentas, suma_debe, suma_haber, mayor:[{cuenta, debe, haber, saldo, saldo_deudor, saldo_acreedor, movimientos}]}. Pide el diario a escritor-diario POR EVENTO; si no responde, deriva del espejo de asientos registrados. No muta nada. Responde por mayor-balanza.saldos.response; fallo (project_id ausente) → mayor-balanza.saldos.failed. |
| `mayor-balanza.balanza.request` | `onBalanzaRequest` | RPC reflejo (cálculo puro): {project_id, ejercicio?} → {suma_debe, suma_haber, total_saldo_deudor, total_saldo_acreedor, descuadre_sumas, descuadre_saldos, cuadra, aviso, lineas}. Invariante 1: si Σ debe != Σ haber la balanza declara el descuadre (`cuadra:false`, `aviso`), no lo matiza. Deriva del mayor. Responde por mayor-balanza.balanza.response; fallo → mayor-balanza.balanza.failed. |
| `contabilidad.asiento_registrado` | `onAsientoRegistrado` | Fire-and-forget (B2 → B3): el diario registró un asiento → se acumula la muestra en el espejo en memoria (idempotente por clave natural o numero; un hecho = un asiento). No muta el libro. Devuelve los saldos derivados como acuse (no publica evento de dominio). |

### Publishes

| Evento | Descripción |
|---|---|
| `mayor-balanza.saldos.response` | Respuesta RPC correlada de mayor-balanza.saldos.request → {request_id, status:200, data:{fuente, total_cuentas, suma_debe, suma_haber, mayor:[...]}}. Emitida por el helper _atender. |
| `mayor-balanza.saldos.failed` | Par de fallo determinista (B3): project_id ausente → {status, error:{code, message, details?}}. Cierra el círculo de mayor-balanza.saldos.request. |
| `mayor-balanza.balanza.response` | Respuesta RPC correlada de mayor-balanza.balanza.request → {request_id, status:200, data:{suma_debe, suma_haber, cuadra, descuadre_sumas, descuadre_saldos, aviso, lineas}}. Emitida por el helper _atender. |
| `mayor-balanza.balanza.failed` | Par de fallo determinista (B3): project_id ausente → {status, error:{code, message, details?}}. Cierra el círculo de mayor-balanza.balanza.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `mayor-balanza.saldos.failed` cierra `mayor-balanza.saldos.request` y
> `mayor-balanza.balanza.failed` cierra `mayor-balanza.balanza.request`, cada uno
> cuando su proyección (`_saldos` / `_balanza`) devuelve `status !== 200`.

> Nota de honestidad (cruce con `index.js`): `onAsientoRegistrado` (fire-and-forget)
> **no publica ningún evento** — llama a `_saldos({project_id: pid})` y **devuelve el
> resultado como acuse**. Un hecho = un asiento (el espejo es idempotente por
> `clave_natural`/`numero`), y si el payload no trae `project_id`/`asiento`/clave,
> devuelve `null` sin tocar el espejo.

> Nota: no está en `module.json` pero sí lo **pide** `index.js` en `_diario`: la RPC
> saliente `escritor-diario.asientos.request` con `{project_id, ejercicio}` y
> `timeout_ms:4000`. Es una dependencia (DEP) por evento, no un evento emitido.

## Reglas de negocio

1. **Fallo determinista**: `_saldos` y `_balanza` toman `input.project_id ||
   this.project_id`; ausente → `400 INVALID_INPUT` (`field:'project_id'`). `_balanza`
   delega en `_saldos`, así que comparte el mismo guard.
2. **La fuente se declara, no se esconde**: `_diario(pid, input)` pide
   `escritor-diario.asientos.request`; si la respuesta trae `data.asientos` (array) →
   `fuente:'diario'`; si no responde o no trae asientos → se usa el **espejo** y
   `fuente:'espejo'`. Nunca se finge una fuente.
3. **El asiento se proyecta sin mutar**: por cada apunte con `cuenta` no nula y
   `debe`/`haber` numéricos válidos, se acumula `debe` y `haber` por cuenta
   (`_round(s + x, 2)`) y se cuenta `movimientos`. Un apunte sin cuenta o con importe
   no numérico se **salta** (no se estima).
4. **`_num(v)`**: `undefined`/`null`/`''` → `0`; si `Number(v)` no es finito → `null`
   (inválido, el apunte se salta).
5. **Saldo de cada cuenta**: `saldo = round(debe - haber, 2)`;
   `saldo_deudor = saldo > 0 ? saldo : 0`; `saldo_acreedor = saldo < 0 ? round(-saldo, 2)
   : 0`.
6. **Orden determinista**: el mayor se ordena por `cuenta` con `localeCompare` — mismo
   diario → **mismo mayor**, siempre.
7. **Agregados del mayor**: `total_cuentas`, `suma_debe = round(Σ debe, 2)`,
   `suma_haber = round(Σ haber, 2)`. `ejercicio` se propaga de `input.ejercicio` o
   queda `null` (etiqueta, no filtro cableado).
8. **La balanza deriva del mayor** (`_balanza` = `_saldos` + descuadres): si `_saldos`
   no devuelve `200`, `_balanza` propaga el mismo error. `num_cuentas` = `total_cuentas`.
   `lineas` = las líneas del mayor.
9. **Descuadre declarado (invariante 1)**:
   `descuadre_sumas = round(suma_debe - suma_haber, 2)`,
   `total_saldo_deudor = round(Σ saldo_deudor, 2)`,
   `total_saldo_acreedor = round(Σ saldo_acreedor, 2)`,
   `descuadre_saldos = round(total_deudor - total_acreedor, 2)`,
   `cuadra = |descuadre_sumas| < 0.01 && |descuadre_saldos| < 0.01`.
   `aviso = cuadra ? null : 'la balanza no cuadra: se declara el descuadre, no se
   matiza'`. **Un descuadre nunca se corrige aquí**: se declara.
10. **Idempotencia del espejo**: la clave es `asiento.clave_natural` o, en su defecto,
    `asiento.numero` (String). La misma clave **no se duplica** en el espejo
    (`m.set(clave, asiento)`); sin clave, el asiento no se refleja.
11. **Sin estado persistente**: no hay `PosPersistencia`, no hay `onProjectActivated`.
    El espejo es en memoria (`Map<project_id, Map<clave, asiento>>`) y se pierde al
    recargar; por eso la vía RPC a `escritor-diario` es la preferente.
12. **HTTP exacto**: éxito `200`; `project_id` ausente → `400`; excepción en `_atender`
    → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `mayor-balanza.saldos.response` y `mayor-balanza.balanza.response`.

### 1. `saldos` — el mayor (saldos por cuenta)

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "correlation_id": "abc-123"
}
```

Respuesta `200` (derivada del diario vía `escritor-diario`):

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "fuente": "diario",
  "total_cuentas": 2,
  "suma_debe": 121,
  "suma_haber": 121,
  "mayor": [
    { "cuenta": "430", "debe": 121, "haber": 0, "saldo": 121, "saldo_deudor": 121, "saldo_acreedor": 0, "movimientos": 1 },
    { "cuenta": "700", "debe": 0, "haber": 121, "saldo": -121, "saldo_deudor": 0, "saldo_acreedor": 121, "movimientos": 1 }
  ]
}
```

Si `escritor-diario` no responde en `4000 ms`, la misma respuesta sale con
`fuente:'espejo'` (derivada de los `contabilidad.asiento_registrado` reflejados).

### 2. `balanza` — sumas y saldos (la proyección que declara el descuadre)

```json
{ "project_id": "e57a318a-...", "ejercicio": "2026" }
```

Respuesta `200` (cuando cuadra):

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "fuente": "diario",
  "num_cuentas": 2,
  "suma_debe": 121,
  "suma_haber": 121,
  "total_saldo_deudor": 121,
  "total_saldo_acreedor": 121,
  "descuadre_sumas": 0,
  "descuadre_saldos": 0,
  "cuadra": true,
  "aviso": null,
  "lineas": [ { "cuenta": "430", "...": "..." }, { "cuenta": "700", "...": "..." } ]
}
```

Cuando **no** cuadra, `cuadra:false` y `aviso` con el texto declarado; los campos
`descuadre_sumas`/`descuadre_saldos` llevan el descuadre exacto. **No se esconde**.

### 3. Fire-and-forget — reacción a `contabilidad.asiento_registrado`

`onAsientoRegistrado` toma `e.data || e`, exige `project_id` + `asiento` objeto y una
clave (`clave_natural` o `numero`), guarda la muestra en el espejo bajo esa clave y
**devuelve** `this._saldos({project_id: pid})` como **acuse**. No publica evento de
dominio.

### 4. Fallo — falta `project_id`

```json
{ "ejercicio": "2026" }
```

Respuesta `400` + `mayor-balanza.saldos.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/mayor-balanza.test.js`. Cubre:

- `saldos` con el diario servido por `escritor-diario` → `200 fuente:'diario'`, mayor
  ordenado por cuenta con `saldo`/`saldo_deudor`/`saldo_acreedor`/`movimientos`.
- `saldos` cuando `escritor-diario` **no** responde → `fuente:'espejo'` derivada de
  `contabilidad.asiento_registrado`.
- `balanza` que cuadra → `cuadra:true`, `aviso:null`, `descuadre_sumas:0`,
  `descuadre_saldos:0`.
- `balanza` con descuadre (Σ debe ≠ Σ haber) → `cuadra:false` y `aviso` declarado (no
  se matiza).
- `saldos`/`balanza` sin `project_id` → `400 INVALID_INPUT` +
  `mayor-balanza.saldos.failed` / `mayor-balanza.balanza.failed`.
- Espejo idempotente: reproducir el mismo asiento por su clave no duplica el mayor.
- `onAsientoRegistrado` devuelve los saldos como acuse y **no** publica evento.
- `toolSaldos` / `toolBalanza` devuelven la misma proyección que `_saldos` / `_balanza`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `MayorBalanza extends ModuloHibridoReflejo`; `name = 'mayor-balanza'`,
  `version = 'reflejo-0.1.0'`. Espejo en memoria `this._espejo`
  (`Map<project_id, Map<clave, asiento>>`). Sin `PosPersistencia`.
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/mayor-balanza/`).
- `onSaldosRequest` usa `this._atender(e, 'saldos', 'mayor-balanza.saldos.response',
  async (d) => {...})`; dentro publica `mayor-balanza.saldos.failed` si `status !== 200`.
  `onBalanzaRequest` hace lo propio con `balanza`.
- Proyecciones `_saldos(input)` (`async`, pide el diario por evento) y `_balanza(input)`
  (`async`, deriva del mayor); helpers `_diario`, `_espejoDe`, `_num`. Tools
  `toolSaldos` / `toolBalanza`.
- `_invalid` / `_errorResponse` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide `escritor-diario.asientos.request` (B2) por evento; lo alimenta
  `contabilidad.asiento_registrado` (B2). Lo LEEN `balance-situacion` (C1) y
  `cuenta-resultados` (C2) vía `mayor-balanza.saldos.request`.
