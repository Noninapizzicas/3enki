---
name: factura-rectificativa
description: >
  Skill FULL del módulo REFLEJO `factura-rectificativa` de la vertical
  contabilidad de Enki. DERIVA la rectificativa de una factura YA emitida — la
  corrección comercial POSTERIOR (abono/devolución/descuento/anulación): el
  original NO se borra ni se muta y la corrección SUMA (append-only). Es un
  derivado en memoria; quien la asienta es el libro. Úsala para operar, depurar
  o extender el reflejo, o para entender su contrato de eventos y sus reglas de
  negocio.
when-to-use: >
  - Cuando necesites derivar la rectificativa de una factura emitida
    (RPC factura-rectificativa.calcular.request).
  - Cuando depures por qué la rectificativa sale `rectificativa:null` con
    `abierto:true` y `faltan:['original.importe|original.lineas']` (el original
    no declara base corregible) o por qué falta `original`/`project_id`, o una
    referencia al original (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del reflejo (el original no se borra, append-only, determinista,
    motivo declarable, no escribe ni persiste).
  - Cuando vayas a escribir/ampliar el test unitario del reflejo
    factura-rectificativa.
tags: [enki, modulo, reflejo, contabilidad, factura-rectificativa]
---

# factura-rectificativa — REFLEJO de la corrección comercial posterior

## Qué hace el módulo

`factura-rectificativa` es un **REFLEJO STATELESS** (O2, hoja del plan): **DERIVA la
RECTIFICATIVA** de una factura **YA EMITIDA** — la **corrección comercial POSTERIOR** a la
emisión (abono / devolución / descuento / anulación) que **NO BORRA NADA**.

Atributos del diseño: `original:FacturaEmitida`, `motivo:ParametroDeclarable`.
Método: `calcular(original, motivo):FacturaEmitida`.

> 🔴 **LA LEY DE HIERRO ES APPEND-ONLY: EL ORIGINAL NO SE BORRA NI SE MUTA.** Esta hoja **no
> toca** la factura emitida (`emision-factura-venta`, O1): solo produce el documento
> **RECTIFICATIVO** que **CORRIGE POR SUMA**. Un asiento original **no se reescribe**; la
> corrección entra como documento **NUEVO** que referencia al original por su clave natural o
> por `serie`+`numero`. El propio original viaja **intacto** en la respuesta (`original_intacta:true`).

> ℹ️ **No es un ajuste interno**: la corrección comercial posterior (`!=` el ajuste del asesor
> al libro, `asiento-ajuste` B5). Aquí el motivo es una **corrección de negocio** sobre lo ya
> emitido, no un asiento de regularización del asesor.

Invariantes:

- **EL ORIGINAL NO SE BORRA NI SE MUTA**: se devuelve **intacto** (`original_intacta:true`,
  `no_borra:true`) y la rectificativa **SUMA** (`signo:'CORRIGE_POR_SUMA'`, `importe` es el
  **espejo negativo** de la base corregible).
- **DETERMINISTA**: mismo original + mismo motivo → **misma** rectificativa (una sola respuesta;
  sin reloj en el cálculo salvo la marca `derivada_en`).
- **Dato ausente = desconocido**: **sin base corregible** (ni `importe`/`total`/`base` del
  original ni líneas sumables) **NO se fabrica una rectificativa con un `0`**; se declara
  `abierto` con lo que falta.
- **El MOTIVO y el TIPO de corrección son DECLARABLES**: sin declararlos, **se emite la
  rectificativa y se declara el hueco** (`motivo:null`, `tipo_correccion:null`, `abierto` y
  `faltan`) — **jamás se inventa la razón de la corrección**.
- **NO escribe, NO persiste**: la rectificativa es un **DERIVADO en memoria**; quien la asienta
  es el custodio del libro (`escritor-diario`, B2). `asienta:false`.

Proyección única `_calcular`. Publica `contabilidad.factura_rectificada`. Cierra el círculo con
`factura-rectificativa.calcular.failed`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `factura-rectificativa.calcular.request` | `onCalcularRequest` | RPC reflejo (determinista): {project_id, original:{serie,numero,clave_natural,importe\|lineas,tercero}, motivo?, tipo_correccion?} → {rectificativa:{id, tipo:'RECTIFICATIVA', serie, numero, tipo_correccion, motivo, referencia_original, base_corregida, importe (espejo negativo), signo:'CORRIGE_POR_SUMA', lineas, original_intacta:true, no_borra:true, asienta:false, asienta_por:'escritor-diario (B2)'}, original_intacta:true, corrige_por_suma:true, original, abierto, faltan}. Espeja el original con el signo cambiado; NO lo muta. Sin base corregible (importe/lineas) o sin referencia al original → se declara abierto y no se fabrica la rectificativa. Exito → publica contabilidad.factura_rectificada y responde por factura-rectificativa.calcular.response; original/project_id ausente → factura-rectificativa.calcular.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `factura-rectificativa.calcular.response` | Respuesta RPC correlada de factura-rectificativa.calcular.request → {request_id, status:200, data:{rectificativa, referencia_original, original_intacta, corrige_por_suma, original, abierto, faltan}}. Emitida por el helper _atender. |
| `factura-rectificativa.calcular.failed` | Par de fallo determinista (O2): original o project_id ausente, o original sin referencia (serie/numero/clave_natural) → {status, error:{code, message, details?}}. Cierra el circulo de factura-rectificativa.calcular.request. |
| `contabilidad.factura_rectificada` | Fire-and-forget (O2): quedo DERIVADA una rectificativa (correccion comercial posterior) → {project_id, rectificativa, referencia_original, original_intacta:true, corrige_por_suma:true, correlation_id}. El original NO se borra; lo consume el libro (escritor-diario B2) para asentar la correccion por SUMA. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `factura-rectificativa.calcular.failed` cierra el círculo de
> `factura-rectificativa.calcular.request` cuando `_calcular` devuelve status ≠ 200
> (`400 INVALID_INPUT` por `project_id`/`original`/referencia ausentes).

> Nota de honestidad (cruce con `index.js`): `onCalcularRequest` publica
> `contabilidad.factura_rectificada` **siempre que `_calcular` devuelve `200`** — lo que
> **incluye la vía abierta** (sin base corregible), en la que viaja con `rectificativa:null`. Es
> decir, el evento de dominio se emite también cuando **no hubo rectificativa que derivar**; el
> consumidor debe mirar si `rectificativa` es `null` y leer `abierto`/`faltan`.

> Nota: la respuesta puede llevar campos **no listados en el `description`** del module.json,
> emitidos por `_calcular`: `motivo_declarado` y `motivo_no_emitida` (en la vía abierta) y, en
> el `abierto` de la vía emitida, las claves `motivo` y `tipo_correccion`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
   `400 INVALID_INPUT` (`field:'project_id'`).
2. **El `original` es obligatorio**: `input.original || input.factura || input.factura_original`;
   ausente o no objeto → `400 INVALID_INPUT` (`field:'original'`).
3. **La REFERENCIA al original** (`_referencia`): `{serie, numero, clave_natural, nif}`, cada uno
   `String(...)` o `null`; el `nif` sale de `original.nif` o de `original.tercero.nif`. **Sin
   `serie` NI `numero` NI `clave_natural` NO se rectifica** → `400 INVALID_INPUT`
   (`field:'original.serie|numero|clave_natural'`). Una corrección que no dice **a qué corrige**
   no es una rectificativa.
4. **La BASE corregible** (`_base`): primero el importe directo declarado (`original.importe` ??
   `original.total` ?? `original.base`, vía `_num`); si no, la **suma de las líneas** con
   `importe` no nulo (redondeo a 2). Si no hay ninguna base computable → `null`.
5. **Sin base → vía ABIERTA (no se fabrica un `0`)**: `200 {rectificativa:null,
   referencia_original, original_intacta:true, corrige_por_suma:true, abierto:true,
   faltan:['original.importe|original.lineas'], motivo_declarado, motivo_no_emitida:<explica que
   el original no declara base corregible>}`.
6. **El MOTIVO es declarable**: `input.motivo` recortado (`String(...).trim()`) o `null`. **No
   se inventa la razón**: sin motivo se emite igual y se declara el hueco en `abierto.motivo` y
   en `faltan`.
7. **El TIPO de corrección es declarable** (`_tipo`): `input.tipo_correccion` ?? `input.tipo`,
   normalizado a MAYÚSCULAS; solo se reconoce lo declarado de la taxonomía
   `TIPOS_CORRECCION = {ABONO, DEVOLUCION, DESCUENTO, ANULACION}`. Cualquier otro valor (o
   vacío) → `null` (**la lista no decide, solo reconoce lo declarado**) y se declara en
   `abierto.tipo_correccion` y en `faltan`.
8. **La RECTIFICATIVA es el espejo negativo del original** (no lo muta):
   `{id, tipo:'RECTIFICATIVA', serie, numero, tipo_correccion, motivo, referencia_original,
   base_corregida, importe: round(-base, 2), signo:'CORRIGE_POR_SUMA', lineas, original_intacta:true,
   no_borra:true, asienta:false, asienta_por:'escritor-diario (B2, custodio del libro)',
   derivada_en:<ISO>}`.
   - `id = rect_<pid>_<clave_natural | (serie||'S')+'-'+(numero||'?')>` (determinista).
   - `serie` = la declarada en la petición (`input.serie`) o, si no, la del original con sufijo
     `-R` (`<serie>-R`) o `null`.
   - `numero` = `input.numero` o `null` (**no se inventa un número**).
   - `lineas` = las del original con el importe **negado** (o `null` si el original no las trae).
9. **Las LÍNEAS** (`_lineas`): `original.lineas || original.line_items || original.detalle`; si no
   es array → `null`; si lo es, cada línea se normaliza a `{concepto, cantidad, importe}`
   (`importe` sale de `l.importe` ?? `l.total` vía `_num`).
10. **La vía EMITIDA devuelve**: `{project_id, rectificativa, referencia_original,
    original_intacta:true, corrige_por_suma:true, original (SIN TOCAR), abierto:{motivo,
    tipo_correccion}, faltan:[motivo?, tipo_correccion?]}`.
11. **NO ESCRIBE, NO PERSISTE**: no hay ninguna escritura ni store en disco en todo el módulo.
    `asienta:false` y `no_borra:true` lo declaran explícitamente. Quien asienta la corrección por
    suma es el escritor del libro (B2).
12. **HTTP exacto**: éxito `200` (con rectificativa o con la vía abierta); `project_id`,
    `original` o referencia ausentes → `400 INVALID_INPUT`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `factura-rectificativa.calcular.response` y emite `contabilidad.factura_rectificada`.

### 1. `calcular` — derivar la rectificativa desde el importe del original

```json
{
  "project_id": "e57a318a-...",
  "original": { "serie": "FV", "numero": "1001", "importe": 121.5, "tercero": { "nif": "B12345678" }, "lineas": [ { "concepto": "servicio", "cantidad": 1, "importe": 121.5 } ] },
  "motivo": "devolucion parcial acordada con el cliente",
  "tipo_correccion": "devolucion",
  "correlation_id": "abc-123"
}
```

Respuesta `200` (vía emitida):

```json
{
  "project_id": "e57a318a-...",
  "rectificativa": {
    "id": "rect_e57a318a-..._FV-1001",
    "tipo": "RECTIFICATIVA",
    "serie": "FV-R",
    "numero": null,
    "tipo_correccion": "DEVOLUCION",
    "motivo": "devolucion parcial acordada con el cliente",
    "referencia_original": { "serie": "FV", "numero": "1001", "clave_natural": null, "nif": "B12345678" },
    "base_corregida": 121.5,
    "importe": -121.5,
    "signo": "CORRIGE_POR_SUMA",
    "lineas": [ { "concepto": "servicio", "cantidad": 1, "importe": -121.5 } ],
    "original_intacta": true,
    "no_borra": true,
    "asienta": false,
    "asienta_por": "escritor-diario (B2, custodio del libro)",
    "derivada_en": "2026-09-30T...:00.000Z"
  },
  "referencia_original": { "serie": "FV", "numero": "1001", "clave_natural": null, "nif": "B12345678" },
  "original_intacta": true,
  "corrige_por_suma": true,
  "original": { "serie": "FV", "numero": "1001", "importe": 121.5, "tercero": { "nif": "B12345678" }, "lineas": [ { "concepto": "servicio", "cantidad": 1, "importe": 121.5 } ] },
  "abierto": { "motivo": null, "tipo_correccion": null },
  "faltan": []
}
```

Emite `contabilidad.factura_rectificada` (lo consume el libro, B2, para asentar la corrección por
suma):

```json
{ "project_id": "e57a318a-...", "rectificativa": { "...": "..." }, "referencia_original": { "serie": "FV", "numero": "1001", "clave_natural": null, "nif": "B12345678" }, "original_intacta": true, "corrige_por_suma": true, "correlation_id": "abc-123" }
```

### 2. `calcular` — el original no declara base corregible → vía ABIERTA (no se fabrica un `0`)

```json
{ "project_id": "e57a318a-...", "original": { "serie": "FV", "numero": "1002" } }
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "rectificativa": null,
  "referencia_original": { "serie": "FV", "numero": "1002", "clave_natural": null, "nif": null },
  "original_intacta": true,
  "corrige_por_suma": true,
  "abierto": true,
  "faltan": ["original.importe|original.lineas"],
  "motivo_declarado": null,
  "motivo_no_emitida": "el original no declara base corregible (importe total o lineas): no se fabrica una rectificativa con un 0 que nadie emitio"
}
```

### 3. `calcular` — sin motivo declarado (se emite y se declara el hueco)

El motivo/`tipo_correccion` ausentes **no impiden** emitir la rectificativa: sale con
`motivo:null`, `tipo_correccion:null`, `abierto.motivo`/`abierto.tipo_correccion` con el porqué y
`faltan:["motivo","tipo_correccion"]`. **Jamás se inventa la razón de la corrección.**

### 4. Fallo — falta el original

```json
{ "project_id": "e57a318a-..." }
```

Respuesta `400` + `factura-rectificativa.calcular.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "original requerido", "details": { "field": "original" } } }
```

### 5. Fallo — el original no tiene referencia

```json
{ "project_id": "e57a318a-...", "original": { "importe": 121.5 } }
```

Respuesta `400` + `factura-rectificativa.calcular.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "original.serie|numero|clave_natural requerido", "details": { "field": "original.serie|numero|clave_natural" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/factura-rectificativa.test.js`. Cubre:

- `calcular` con base por `importe` + motivo + tipo → `200`, rectificativa con `importe` **espejo
  negativo** de la base, `signo:'CORRIGE_POR_SUMA'`, `original_intacta:true`, `no_borra:true`,
  `asienta:false`, y **emite** `contabilidad.factura_rectificada`.
- `calcular` con base por **suma de líneas** (sin `importe` directo) → misma derivación; las
  líneas salen con el importe negado.
- El **original viaja SIN TOCAR** en la respuesta (`original` intacto) y la rectificativa **no lo
  muta** (APPEND-ONLY).
- **DETERMINISTA**: mismo original + mismo motivo → misma rectificativa (mismo `id`).
- Sin base corregible → `200 rectificativa:null`, `abierto:true`,
  `faltan:['original.importe|original.lineas']` (**no se fabrica un `0`**).
- Sin `motivo`/`tipo_correccion` → se emite y se declaran los huecos en `abierto`/`faltan`.
- Un `tipo_correccion` fuera de la taxonomía (`ABONO|DEVOLUCION|DESCUENTO|ANULACION`) → `null` y
  se declara el hueco.
- Referencia por `clave_natural` (sin serie/numero) → rectifica; **sin ninguna referencia** →
  `400 INVALID_INPUT` + `factura-rectificativa.calcular.failed`.
- `project_id` o `original` ausentes → `400 INVALID_INPUT` + `.calcular.failed`.
- `toolCalcular` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `FacturaRectificativa extends ModuloHibridoReflejo`; `name = 'factura-rectificativa'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (REFLEJO stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/factura-rectificativa/`).
- Constante `TIPOS_CORRECCION = new Set(['ABONO','DEVOLUCION','DESCUENTO','ANULACION'])`.
- `onCalcularRequest` usa `this._atender(e, 'calcular', 'factura-rectificativa.calcular.response',
  async (d) => {...})` y dentro hace el cierre de círculo: en status 200 publica
  `contabilidad.factura_rectificada`, si no el par `factura-rectificativa.calcular.failed`.
- Proyección única `_calcular(input)` (**síncrona**: no pide nada por evento); helpers
  `_referencia`, `_base`, `_lineas`, `_tipo`, `_num`. Tool directa `toolCalcular`.
- `_invalid` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: **ninguna**. Esta hoja no consulta a nadie por evento. Lo consume el libro
  (`escritor-diario` B2) vía `contabilidad.factura_rectificada` para asentar la corrección por
  suma; el ajuste interno del asesor es otra pieza (`asiento-ajuste` B5).
- **APPEND-ONLY, SIEMPRE**: `original_intacta:true`, `no_borra:true`, `signo:'CORRIGE_POR_SUMA'`
  y `asienta:false` son constantes del contrato.
