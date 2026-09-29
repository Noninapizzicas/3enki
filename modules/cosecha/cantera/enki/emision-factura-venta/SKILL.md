---
name: emision-factura-venta
description: >
  Skill FULL del módulo CUSTODIO `emision-factura-venta` de la vertical contabilidad de
  Enki. LA CARA EMITIDA de la factura de venta con SERIE y NUMERACIÓN gobernada — decisión
  del dueño: contabilidad SÍ emite la factura (es su documento) y la REGISTRA; NO la cobra.
  Un solo escritor (EMISOR_FACTURA_VENTA); número duplicado en la serie = CORRUPCIÓN (409)
  y la factura emitida jamás se reescribe (append-only). El desglose de impuestos entra
  como dato declarado. Úsala para operar, depurar o extender el custodio, o para entender
  su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites emitir la factura de venta con su serie/numeración (RPC
    emision-factura-venta.emitir.request).
  - Cuando depures por qué una emisión se rechaza (403 PERMISSION_DENIED si el rol no es
    EMISOR_FACTURA_VENTA, 400 INVALID_INPUT si falta serie/numero, 409 NUMERO_DUPLICADO) o
    por qué sale `emitida:false` (sin base declarada).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    del custodio (un solo escritor, secuencia gobernada, la ley entra como dato, append-only,
    se emite pero no se cobra).
  - Cuando vayas a escribir/ampliar el test unitario del custodio emision-factura-venta.
tags: [enki, modulo, custodio, contabilidad, emision-factura-venta]
---

# emision-factura-venta — CUSTODIO CON PERSISTENCIA de la cara emitida

## Qué hace el módulo

`emision-factura-venta` es un **CUSTODIO CON PERSISTENCIA** (O1, hoja del plan): **LA CARA
EMITIDA** de la factura de venta, con **SERIE y NUMERACIÓN**. **DECISIÓN DEL DUEÑO:
contabilidad SÍ emite la factura de venta** — es **su documento** (≠ D8 registro interno ≠
D9 formato estructurado). La emite y la **REGISTRA**; **NO la cobra**: el cobro es de la
**operación** (el flujo económico de la vertical), no del libro — por eso emite
`cobrada:false` y **no toca caja ni banco**.

Gobierna la **SECUENCIA** de numeración: **número duplicado = CORRUPCIÓN** → **UN SOLO
ESCRITOR**, el emisor (rol `EMISOR_FACTURA_VENTA`); cualquier otro rol es rechazado (`403`).
Un número ya emitido en la misma serie **NO se reutiliza** (`409 NUMERO_DUPLICADO`) y **la
factura emitida jamás se reescribe** (append-only).

**LA LEY ENTRA COMO DATO** (invariante 5): **NO se cablea el desglose de impuestos** (ni
tipos, ni porcentajes, ni regímenes), ni el formato de serie, ni plazos. El `impuestos`
llega **DECLARADO** en la petición o se pide **POR EVENTO** a `liquidacion-iva` (D1), y la
base/total se **COMPONEN** de lo declarado — nunca de una tabla legal. **Sin base declarada
NO se emite** (`emitida:false` + motivo, invariante 7).

El receptor se toma declarado o de `maestro-terceros` (N1) **POR EVENTO**; el formato
estructurado se delega a `factura-electronica` (D9) **POR EVENTO** — **nunca `require`
cruzado**.

Es un **CUSTODIO con estado**: **UN SOLO ESCRITOR**. Persiste por proyecto con
**PosPersistencia** (storage `/contabilidad/emision-factura-venta/emision-factura-venta.json`),
restaura en `project.activated` y vuelca en `onUnload`. Proyección `_emitir`. Publica
`contabilidad.factura_emitida` (lo consume `registro-verifactu` D8).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `emision-factura-venta.emitir.request` | `onEmitirRequest` | RPC custodio (escritura, UN escritor): {project_id, rol, serie, base, numero?, paso?, fecha?, emisor?, receptor?, receptor_nif?, impuestos?, total?, moneda?} → {emitida:true, factura:{clave, serie, numero, base, impuestos, desglose, total, moneda}, secuencia, cobrada:false}. GUARD de rol: solo EMISOR_FACTURA_VENTA (403 si otro). Numero duplicado en la serie → 409 NUMERO_DUPLICADO. Sin base declarada → emitida:false + motivo. El desglose de impuestos es declarado o pedido a liquidacion-iva POR EVENTO. Exito → publica contabilidad.factura_emitida y responde por emision-factura-venta.emitir.response; fallo → emision-factura-venta.emitir.failed. |
| `project.activated` | `onProjectActivated` | Ciclo de vida: restaura las emisiones persistidas del proyecto activado via PosPersistencia.restaurar(project_id). El custodio persiste, por eso se suscribe obligatoriamente a la activacion. |

### Publishes

| Evento | Descripción |
|---|---|
| `emision-factura-venta.emitir.response` | Respuesta RPC correlada de emision-factura-venta.emitir.request → {request_id, status:200, data:{emitida, factura, secuencia, cobrada:false, cobro_de}}. Emitida por el helper _atender. |
| `emision-factura-venta.emitir.failed` | Par de fallo determinista (O1): rol no autorizado (403), serie/numero/base ausente (400) o numero duplicado (409 NUMERO_DUPLICADO) → {status, error:{code, message, details?}}. Cierra el circulo de emision-factura-venta.emitir.request. |
| `contabilidad.factura_emitida` | Fire-and-forget (O1): la factura de venta quedo emitida y registrada (no cobrada) → {project_id, factura, serie, numero, clave, cobrada:false, correlation_id}. Lo consume registro-verifactu (D8) para encadenar su huella. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `emision-factura-venta.emitir.failed` cierra el círculo de
> `emision-factura-venta.emitir.request` cuando `_emitir` devuelve status ≠ 200
> (`400`/`403`/`409`).

> Nota de honestidad (cruce con `index.js`): `onEmitirRequest` publica
> `contabilidad.factura_emitida` **solo si `status === 200 && data.emitida`**; la rama
> `else if (res.status !== 200)` publica `emision-factura-venta.emitir.failed`. La rama
> **sin base declarada** devuelve **`200` con `emitida:false`** → **ni** evento de emisión
> **ni** failed: se declara el motivo (`sin base declarada…`) y se responde.

> Nota: el módulo expone `factura(pid, clave)` como **lectura directa** para otras hojas del
> mismo proceso (no muta) — no es un evento del bus, no figura en `module.json`.

## Reglas de negocio

1. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente → `400
   INVALID_INPUT` (`field:'project_id'`).
2. **GUARD de escritor**: `input.rol !== 'EMISOR_FACTURA_VENTA'` → `403 PERMISSION_DENIED`
   con `{rol_esperado, rol_recibido}`.
3. **La serie es obligatoria**: `String(input.serie).trim()`; vacía → `400 INVALID_INPUT`
   (`field:'serie'`). La numeración se gobierna **por serie**.
4. **El receptor: declarado o pedido POR EVENTO**: `_receptor(pid, input)` toma
   `input.receptor` si es objeto; si no, con `receptor_nif` hace
   `_rpc('maestro-terceros.ficha.request', {project_id, tercero:{nif}}, {timeout_ms:4000})`
   y usa `d.ficha` (o `{nif}` como mínimo); sin NIF → `null`.
5. **El desglose de impuestos es DATO declarado**: `_impuestos(pid, input)` toma
   `input.impuestos` (array) o pide `_rpc('liquidacion-iva.calcular.request', {project_id,
   base, impuestos}, {timeout_ms:4000})`; sin resultado → `[]`. **Ningún tipo ni porcentaje
   está cableado.**
6. **Sin base no se emite (invariante 7)**: `_num(input.base)` null → `200` con
   `{emitida:false, factura:null, motivo:'sin base declarada no se emite la factura (no se
   inventan importes)', cobrada:false}`.
7. **El total se COMPONE de lo declarado**: `_componerTotal(base, impuestos, input)` usa
   `input.total` si es numérico; si no, suma las cuotas declaradas por línea
   (`impuesto.cuota ?? impuesto.importe`) y redondea `base + Σcuotas` a 2 decimales.
8. **El desglose se COMPONE, no se cablea**: `_desglose(base, impuestos)` produce
   `{base, lineas:[{tipo, tipo_valor, cuota}], total_impuestos, total}` — todo desde lo declarado.
9. **El número: declarado o gobernado por la SECUENCIA**: `_numero(input, s)` toma
   `input.numero` si viene; si no, `ultimo + paso` (paso declarado o `1`), con
   `padStart(ultimo.length, '0')` para conservar ceros a la izquierda; `ultimo === null` →
   `'1'`. Sin número determinable → `400 INVALID_INPUT` (`field:'numero'`).
10. **NÚMERO DUPLICADO = CORRUPCIÓN (409)**: se comprueba contra `s.facturas` (números ya
    emitidos en la serie) y contra las claves `serie/numero` existentes → `409
    NUMERO_DUPLICADO` con `{serie, numero, ultimo}` o `{serie, numero, clave}`.
11. **La factura es un hecho completo**: `{clave, serie, numero, fecha, emisor, receptor,
    base, impuestos, total, moneda, desglose, emitida_por, emitida_en}`. `fecha` se sella
    con `now` si no viene; `moneda` puede ser `null`.
12. **APPEND-ONLY**: la factura se **apila** en `e.facturas`; se apila el número en
    `s.facturas` y se actualiza `s.ultimo`. **Nunca se reescribe** una factura emitida.
13. **Se emite, NO se cobra**: la respuesta declara `cobrada:false` y `cobro_de:'la operacion'`.
14. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura;
    `project.activated` → `restaurar(project_id)` (reconstruye el `Map` de series);
    `onUnload` → `flush()` + `detener()`.
15. **HTTP exacto**: éxito `200` (emitida o no); `project_id`/`serie`/`numero` inválidos →
    `400`; rol ajeno → `403`; número duplicado → `409`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `emision-factura-venta.emitir.response` y emite `contabilidad.factura_emitida`.

### 1. `emitir` — la factura con número gobernado por la secuencia

```json
{
  "project_id": "e57a318a-...",
  "rol": "EMISOR_FACTURA_VENTA",
  "serie": "A",
  "base": 1000,
  "impuestos": [ { "tipo": "IVA", "tipo_valor": 21, "cuota": 210 } ],
  "receptor_nif": "B12345678",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "emitida": true,
  "factura": {
    "clave": "A/1",
    "serie": "A",
    "numero": "1",
    "fecha": "2026-09-25T...",
    "emisor": null,
    "receptor": { "nif": "B12345678" },
    "base": 1000,
    "impuestos": [ { "tipo": "IVA", "tipo_valor": 21, "cuota": 210 } ],
    "total": 1210,
    "moneda": null,
    "desglose": { "base": 1000, "lineas": [ { "tipo": "IVA", "tipo_valor": 21, "cuota": 210 } ], "total_impuestos": 210, "total": 1210 },
    "emitida_por": "EMISOR_FACTURA_VENTA",
    "emitida_en": "2026-09-25T..."
  },
  "secuencia": { "serie": "A", "ultimo": "1" },
  "cobrada": false,
  "cobro_de": "la operacion"
}
```

Emite `contabilidad.factura_emitida`:

```json
{ "project_id": "e57a318a-...", "factura": { "...": "..." }, "serie": "A", "numero": "1", "clave": "A/1", "cobrada": false, "correlation_id": "abc-123" }
```

`registro-verifactu` (D8) lo consume para encadenar la huella.

### 2. `emitir` — sin base declarada (no se inventan importes)

```json
{ "project_id": "e57a318a-...", "rol": "EMISOR_FACTURA_VENTA", "serie": "A" }
```

Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "serie": "A", "emitida": false, "factura": null, "motivo": "sin base declarada no se emite la factura (no se inventan importes)", "cobrada": false }
```

### 3. Fallo — número duplicado (corrupción)

```json
{ "project_id": "e57a318a-...", "rol": "EMISOR_FACTURA_VENTA", "serie": "A", "base": 100, "numero": "1" }
```

Con `"1"` ya emitido en la serie `A`, Respuesta `409` + `emision-factura-venta.emitir.failed`:

```json
{ "status": 409, "error": { "code": "NUMERO_DUPLICADO", "message": "el numero ya fue emitido en esta serie: numero duplicado = corrupcion", "details": { "serie": "A", "numero": "1", "ultimo": "1" } } }
```

### 4. Fallo — rol no autorizado

```json
{ "project_id": "e57a318a-...", "rol": "OTRO_ROL", "serie": "A", "base": 100 }
```

Respuesta `403` + `emision-factura-venta.emitir.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el emisor de factura (EMISOR_FACTURA_VENTA) emite la factura de venta", "details": { "rol_esperado": "EMISOR_FACTURA_VENTA", "rol_recibido": "OTRO_ROL" } } }
```

## Tests

El test unitario vive en `tests/unit/emision-factura-venta.test.js`. Cubre:

- `emitir` con serie + base + impuestos declarados → `200 {emitida:true}` con `desglose`
  compuesto y emite `contabilidad.factura_emitida`.
- Número gobernado por secuencia: dos emisiones en la serie → `A/1`, `A/2` (`ultimo`
  actualizado); `numero` declarado explícito se respeta.
- Número duplicado en la serie (o clave `serie/numero` existente) → `409 NUMERO_DUPLICADO`
  + `emision-factura-venta.emitir.failed`.
- Rol distinto de `EMISOR_FACTURA_VENTA` → `403 PERMISSION_DENIED`.
- Sin `base` → `200 {emitida:false, motivo}` (no emite el evento ni el par de fallo).
- `serie` vacía / `numero` no determinable → `400 INVALID_INPUT`.
- **Append-only**: la factura emitida no se reescribe; una segunda emisión añade, no sustituye.
- `receptor` declarado o pedido a `maestro-terceros` POR EVENTO; `_impuestos` pedido a
  `liquidacion-iva` cuando no vienen declarados.
- `project.activated` restaura series + facturas; `factura(pid, clave)` lee sin mutar.
- `toolEmitir` devuelve la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `EmisionFacturaVenta extends ModuloHibridoReflejo`; `name =
  'emision-factura-venta'`, `version = 'reflejo-0.1.0'`. Store en memoria `this._emisiones`
  (`Map<project_id, {esquema, series: Map<serie, {ultimo, facturas[]}>, facturas[]}>`).
- Constante `ROL_ESCRITOR = 'EMISOR_FACTURA_VENTA'`.
- **PosPersistencia**: `_persist = new PosPersistencia({modulo, file:
  'emision-factura-venta.json', dir: '/contabilidad/emision-factura-venta', snapshot,
  hidratar})` desde `modules/contabilidad-entrada/emision-factura-venta/` (DOS niveles →
  `../../_shared/pos-persistencia`). `onProjectActivated` → `restaurar(project_id)`;
  `onUnload` → `flush()` + `detener()`; cada escritura `marcarDirty(pid)`.
- `onEmitirRequest` usa `this._atender(e, 'emitir', 'emision-factura-venta.emitir.response',
  async (d) => {...})`; dentro hace el cierre de círculo: en `200 && emitida` publica
  `contabilidad.factura_emitida`, si `status !== 200` publica
  `emision-factura-venta.emitir.failed`.
- Proyección `async _emitir(input)` (pide receptor e impuestos por evento); helpers
  `_receptor`, `_impuestos`, `_componerTotal`, `_desglose`, `_numero`, `_num`,
  `_obtenerOCrear`; lectura directa `factura(pid, clave)`. Tool `toolEmitir`.
- `_invalid` / `_errorResponse` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide `maestro-terceros.ficha.request` (N1) y `liquidacion-iva.calcular.request` (D1)
  POR EVENTO; puede delegar el formato a `factura-electronica` (D9) POR EVENTO. Lo consume
  `registro-verifactu` (D8) vía `contabilidad.factura_emitida`.
