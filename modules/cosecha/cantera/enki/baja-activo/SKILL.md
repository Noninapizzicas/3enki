---
name: baja-activo
description: >
  Skill FULL del módulo REFLEJO `baja-activo` de la vertical contabilidad de Enki.
  LA BAJA DEL BIEN: retira el bien del inmovilizado y DERIVA el resultado comparando el valor
  neto contable (F4) con el importe de venta declarado — `resultado = importe_venta − vnc`, signo
  derivado. No decide la imputación (cuenta/asiento/periodo) y no inventa el importe de venta.
  Sin estado. Úsala para operar, depurar o extender el reflejo, o para entender su contrato de
  eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites el resultado (beneficio/pérdida) de dar de baja un bien (RPC
    baja-activo.calcular.request).
  - Cuando depures por qué el resultado sale `null` (falta `vnc` o falta `importe_venta`), por qué
    `tipo_resultado` es el que es, o por qué falta `project_id` (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes del
    reflejo (determinista, sin juicio, importe de venta no estimado, imputación delegada).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo baja-activo.
tags: [enki, modulo, reflejo, contabilidad, baja-activo]
---

# baja-activo — REFLEJO del resultado de la baja

## Qué hace el módulo

`baja-activo` es un **REFLEJO STATELESS** (F3, hoja del plan): **LA BAJA DEL BIEN**. Retira el
bien del inmovilizado y **DERIVA el RESULTADO** de la operación comparando el **VALOR NETO
CONTABLE** (`valor-neto-contable` F4) con el **IMPORTE DE VENTA declarado**.

Atributos del diseño: `activo:Activo` y `vnc:ValorNetoContable`.

- El **VNC** se **pide a F4 POR EVENTO** (o llega declarado en la petición).
- El **IMPORTE DE VENTA** es un **DATO declarado** por el negocio — **jamás se estima**. Un bien
  dado de baja **sin venta** no tiene un importe `0` inventado: si no se declara, se declara que no
  consta (`importe_venta:null`) y el resultado queda `[ABIERTO]`.

**DETERMINISTA y SIN JUICIO**: `resultado = importe_venta − vnc`. El **SIGNO** se **DERIVA**
(`>0` beneficio, `<0` pérdida, `=0` nulo); aquí **no** se valora si la baja es buena o mala, ni se
decide su **imputación contable** (cuenta, asiento, periodo) — eso lo fija el corte del
diario/ajuste.

Invariantes:

- **DETERMINISTA**: mismo VNC + mismo importe → mismo resultado (una sola respuesta correcta).
- **Dato ausente = desconocido**: sin VNC o sin importe declarado → `resultado:null` y
  `abierto:true` con lo que falta. Nada se estima; ningún importe se rellena con `0`.
- **NO escribe, NO persiste, NO muta, NO decide la imputación**: el bien es de F1 y la contrapartida
  la fija el asiento (B2/B5) con su propia regla declarada.

Sin `PosPersistencia` y sin `project.activated`: no es custodio. Proyección única `_calcular`.
Cierra el círculo de error con `baja-activo.calcular.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `baja-activo.calcular.request` | `onCalcularRequest` | RPC reflejo (calculo puro, determinista, sin juicio): {project_id, id_activo?, activo?, fecha_baja?, vnc?, importe_venta?, motivo_baja?} → {project_id, id_activo, fecha_baja, motivo_baja, vnc, importe_venta, resultado, fuente_vnc, tipo_resultado:'beneficio'\|'perdida'\|'nulo', retirado, abierto, faltan, motivo, imputacion_delegada_a:'escritor-diario'}. El VNC se pide a valor-neto-contable (F4) POR EVENTO o llega declarado; el importe de venta es DATO declarado y su ausencia NO se estima. Sin VNC o sin importe → resultado:null y abierto:true. Responde por baja-activo.calcular.response; project_id ausente → baja-activo.calcular.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `baja-activo.calcular.response` | Respuesta RPC correlada de baja-activo.calcular.request → {request_id, status:200, data:{vnc, importe_venta, resultado, tipo_resultado, retirado, faltan, abierto, imputacion_delegada_a}}. Emitida por el helper _atender. |
| `baja-activo.calcular.failed` | Par de fallo determinista (F3): project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de baja-activo.calcular.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `baja-activo.calcular.failed` cierra el círculo de `baja-activo.calcular.request` cuando
> `_calcular` devuelve status ≠ 200 (el único camino: `400 INVALID_INPUT` por `project_id`
> ausente).

> Nota de honestidad (cruce con `index.js`): `onCalcularRequest` publica el par `failed` **solo si
> `res.status !== 200`**; el camino de éxito lo cierra `_atender` con
> `baja-activo.calcular.response`. Un resultado `[ABIERTO]` sigue siendo un `200`.

> Nota de sub-declaración (cruce con `index.js`): **no está en `module.json` pero sí lo emite
> `index.js` en `_vnc`** la RPC saliente `valor-neto-contable.calcular.request`
> (`{project_id, id_activo, activo, fecha}`, `timeout_ms:4000`) — es una **DEP por evento**, no un
> evento emitido.

> Nota: el módulo expone `toolCalcular(params)` como **tool directa** — no es un evento del bus, no
> figura en `module.json`. Tampoco figuran `_vnc` ni `_num`/`_round` (utilidades internas).

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`). Único error duro.
2. **Etiquetas**: `id_activo` de `input.id_activo` o `input.activo.id_activo` (trim) o `null`;
   `fecha_baja` de `input.fecha_baja` o `input.fecha`; `motivo_baja` como string o `null`.
3. **El VNC se resuelve en `_vnc`**, declarando `fuente_vnc`:
   - `input.vnc` o `input.valor_neto_contable` numérico → `fuente_vnc:'declarado'`.
   - si no hay `id_activo` ni `input.activo` objeto → `{vnc:null, fuente_vnc:null}`.
   - si no, RPC `valor-neto-contable.calcular.request` **por evento**; si trae `data.vnc` numérico
     → `fuente_vnc:'valor-neto-contable'`; si no → `{vnc:null, fuente_vnc:null}`.
4. **El IMPORTE DE VENTA es DATO declarado**: `input.importe_venta` o `input.venta`, con `_num`;
   ausente o no numérico → `null` (**ni se asume `0`**).
5. **`faltan` nombra las piezas ausentes**: `'vnc'` si `vnc === null`; `'importe_venta'` si
   `importe_venta === null`.
6. **El resultado solo existe con las dos piezas**: `resultado = _round(importe_venta − vnc, 2)` si
   `faltan.length === 0`; si no, `resultado:null`, `abierto:true` y
   `motivo:'no se deriva el resultado de la baja: falta <piezas>'`.
7. **El SIGNO se DERIVA** (`tipo_resultado`): `resultado === null` → `null`; `>0` →
   `'beneficio'`; `<0` → `'perdida'`; `=0` → `'nulo'`. **No se juzga si la baja es buena o mala.**
8. **`retirado` = hay resultado**: `retirado = (faltan.length === 0)` — el bien queda retirado
   (hecho de la baja); su **imputación NO la decide** este reflejo.
9. **`imputacion_delegada_a:'escritor-diario'`**: la contrapartida la fija el asiento (B2/B5) con
   su propia regla declarada. **La imputación no vive aquí.**
10. **NO escribe, NO persiste, NO muta, NO decide la imputación**: stateless puro. Sin
    `PosPersistencia`, sin `onProjectActivated`.
11. **HTTP exacto**: éxito `200` (con `resultado` o `[ABIERTO]`); `project_id` ausente → `400`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `baja-activo.calcular.response`; el error cierra con `baja-activo.calcular.failed`.

### 1. `calcular` — venta con beneficio

```json
{
  "project_id": "e57a318a-...",
  "id_activo": "MAQ-01",
  "fecha_baja": "2026-09-30",
  "vnc": 38400,
  "importe_venta": 42000,
  "motivo_baja": "sustitucion",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...", "id_activo": "MAQ-01", "fecha_baja": "2026-09-30", "motivo_baja": "sustitucion",
  "vnc": 38400, "importe_venta": 42000, "resultado": 3600, "fuente_vnc": "declarado",
  "tipo_resultado": "beneficio", "retirado": true, "abierto": false, "faltan": [], "motivo": null,
  "imputacion_delegada_a": "escritor-diario"
}
```

### 2. `calcular` — el VNC se pide a F4 por evento

```json
{ "project_id": "e57a318a-...", "id_activo": "MAQ-01", "importe_venta": 42000 }
```

Con `valor-neto-contable` respondiendo `vnc:38400` → `200` con
`fuente_vnc:'valor-neto-contable'` y `resultado:3600`.

### 3. `calcular` — baja sin venta declarada → `[ABIERTO]`

Sin `importe_venta` → `200` con `importe_venta:null`, `resultado:null`, `faltan:["importe_venta"]`,
`abierto:true`, `tipo_resultado:null`, `retirado:false` y
`motivo:'no se deriva el resultado de la baja: falta importe_venta'`. **Nunca se asume `0`.**

### 4. Pérdida y baja nula

`importe_venta < vnc` → `resultado` negativo y `tipo_resultado:'perdida'`; `importe_venta === vnc` →
`resultado:0` y `tipo_resultado:'nulo'`. El signo **se deriva**, no se juzga.

### 5. Fallo — falta `project_id`

Respuesta `400` + `baja-activo.calcular.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/baja-activo.test.js`. Cubre:

- `calcular` con VNC + importe declarados → `resultado = importe_venta − vnc` y `tipo_resultado`
  derivado (`beneficio`/`perdida`/`nulo`).
- El VNC pedido a `valor-neto-contable` por evento → `fuente_vnc:'valor-neto-contable'`.
- Sin VNC o sin importe → `resultado:null`, `faltan` lo nombra, `motivo` declarado (**nada se
  estima**; ningún importe se rellena con `0`).
- `importe_venta` ausente → `retirado:false`; con resultado → `retirado:true`.
- `imputacion_delegada_a:'escritor-diario'` siempre presente (**el reflejo no decide la
  contrapartida**).
- `project_id` ausente → `400 INVALID_INPUT` + `.calcular.failed`.
- **NO ESCRIBE**: ninguna llamada persiste ni muta (stateless).
- `toolCalcular` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `BajaActivo extends ModuloHibridoReflejo`; `name = 'baja-activo'`, `version =
  'reflejo-0.1.0'`. Sin store, sin `PosPersistencia`, sin `onProjectActivated` (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-analitica/baja-activo/`).
- `onCalcularRequest` usa `this._atender(e, 'calcular', 'baja-activo.calcular.response',
  async (d) => {...})` con cierre de círculo (par `failed` si `status !== 200`).
- Proyección `_calcular(input)` (**async**: pide F4 por evento); helper `_vnc`, `_num`. Tool
  `toolCalcular`.
- `_invalid` / `_rpc` / `_round` vienen de `modulo-hibrido-reflejo`.
- DEP: **pide** `valor-neto-contable.calcular.request` (F4) por EVENTO. Lo consume el corte del
  diario/ajuste (`escritor-diario`) que fija la contrapartida.
- **DETERMINISTA Y SIN JUICIO**: el VNC viene de F4 o declarado; el importe de venta es **DATO
  declarado** (nunca estimado). El signo **se deriva**; la **imputación se delega** al
  `escritor-diario`. El reflejo calcula, no decide.
