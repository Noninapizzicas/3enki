---
name: emision-factura-venta
description: >
  Skill FULL del módulo CUSTODIO `emision-factura-venta` de la vertical contabilidad
  de Enki (O1+O2, hoja del plan). DECISIÓN DEL DUEÑO: contabilidad SÍ emite la factura
  — es su DOCUMENTO. Cara EMITIDA con SERIE y NUMERACIÓN FISCAL: numeración
  CORRELATIVA SIN SALTOS; un número duplicado es CORRUPCIÓN del libro, por eso UN
  SOLO ESCRITOR (rol EMISION; otro rol → 403 PERMISSION_DENIED). Compone el desglose
  (bases + impuestos) desde las líneas y emite ticket o factura completa según el TIPO
  (dato del hecho). La RECTIFICATIVA comercial (ABONO|DEVOLUCION|DESCUENTO) SUMA sin
  borrar el original. Persiste las series por proyecto vía PosPersistencia. Úsala para
  operar, depurar o extender el custodio.
when-to-use: >
  - Cuando necesites emitir una factura/ticket con su número correlativo
    (RPC contabilidad.factura.emitir.request), rectificarla comercialmente
    (contabilidad.factura.rectificar.request) o listar las series
    (contabilidad.factura.series.request).
  - Cuando depures por qué se rechaza (403 si el rol no es EMISION, 404
    ERROR_FACTURA_ORIGINAL_NO_HALLADA, 422 ERROR_ORIGINAL_NO_DECLARADO / MOTIVO_NO_VALIDO /
    PRECONDITION_FAILED, 400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), el guard de
    escritor único y por qué la rectificativa suma sin borrar.
  - Cuando vayas a escribir/ampliar el test unitario del custodio emision-factura-venta.
tags: [enki, modulo, custodio, persistencia, contabilidad, emision-factura-venta, factura, serie]
---

# emision-factura-venta — CUSTODIO de la cara emitida de la factura de venta

## Qué hace el módulo

`emision-factura-venta` es un **CUSTODIO CON PERSISTENCIA** (O1+O2, hoja del plan):
**DECISIÓN DEL DUEÑO — contabilidad SÍ emite la factura: es su DOCUMENTO**. El asiento
original **NO se borra**; la rectificativa **SUMA**.

La cara **EMITIDA** del documento lleva **SERIE y NUMERACIÓN FISCAL**: la numeración es
**CORRELATIVA SIN SALTOS** (`numero = sec.ultimo + 1`); un número duplicado es
**CORRUPCIÓN del libro**, por eso hay **UN SOLO ESCRITOR** — guard de la parcela con rol
**`EMISION`** (otro rol → **`403 PERMISSION_DENIED`**). El número se asigna **por serie**
sin reiniciar (abrir serie nueva sí permite un contador nuevo). El **desglose** (bases +
impuestos) se **COMPONE** desde las líneas, y se emite **TICKET** o **FACTURA completa**
según el **TIPO**, que es **DATO del hecho**.

La **RECTIFICATIVA (O2)** es **COMERCIAL**: `ABONO` | `DEVOLUCION` | `DESCUENTO` — plano
**3** de los 4 planos de corrección (**≠** ajuste interno B5 y **≠** rectificación fiscal
D14). El **original queda INTACTO** (`original_intacto:true`, `no_borra:true`) y la
rectificativa asigna su **propio número correlativo** en una **serie propia** (por defecto
`<serieOriginal>R`). Si la factura original **no consta como emitida** → **`404
ERROR_FACTURA_ORIGINAL_NO_HALLADA`**; si **no se declara** el original → **`422
ERROR_ORIGINAL_NO_DECLARADO`** (*se DECLARA, no se asume*).

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/emision-factura-venta/emision-factura-venta.json`), restaura en
`project.activated` y vuelca en `onUnload`. Las dependencias (maestro-terceros N1,
catálogo de cuentas B1, escritor-diario B2) se leen **por EVENTO**, nunca por `require`
cruzado; la identificación del cliente en el maestro es **TOLERANTE** (si no responde,
`cliente_fuente:'NO_DISPONIBLE'` y **no se inventa la ficha** — la emisión sigue con el
NIF literal del hecho).

> **NO REUTILIZA**: no existe emisión de factura con serie fiscal en el inventario
> (fiscal en Enki = 0 módulos). `prisma/ticket` formatea texto, no emite documento
> fiscal (patrón de formato tomado).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.factura.emitir.request` | `onEmitirRequest` | RPC custodio (O1): {project_id, rol:'EMISION', factura:{tipo?, serie?, lineas:[{concepto,base,tipo_iva}], fecha?, nif?, id_tercero?, total?}, serie?} → {project_id, factura_emitida:{id_factura, serie, numero, tipo, fecha_emision, desglose:{lineas,suma_bases,suma_cuotas,total}, cliente_identificado, no_borra:true}, serie, numero, siguiente_numero, sin_saltos:true, un_solo_escritor:true}. Asigna el numero CORRELATIVO SIN SALTOS de la serie (un numero duplicado = corrupcion) y COMPONE el desglose de bases e impuestos. Ticket o factura completa segun el TIPO (dato del hecho). Guard de un solo escritor: rol != EMISION → 403. Publica contabilidad.factura_emitida y responde por contabilidad.factura.emitir.response; si faltan project_id/factura o el tipo no es valido → contabilidad.factura.emitir.failed. |
| `contabilidad.factura.rectificar.request` | `onRectificarRequest` | RPC custodio (O2): {project_id, rol:'EMISION', factura_original:'<serie>-<num>'\|{id_factura,total}, rectificativa:{motivo:'ABONO'\|'DEVOLUCION'\|'DESCUENTO', serie?}} → {project_id, factura_original, rectificativa:{id_factura, serie, numero, motivo, importe_ajuste, no_borra:true, suma:true, original_intacto:true}, ajuste, plano_correccion:'COMERCIAL_O2'}. Correccion COMERCIAL posterior a la emision: el asiento ORIGINAL NO SE BORRA, la rectificativa SUMA (asigna su propio numero correlativo en una serie propia). Motivo fuera del catalogo → 422 MOTIVO_NO_VALIDO; original no emitido → 404 ERROR_FACTURA_ORIGINAL_NO_HALLADA; original no declarado → 422 ERROR_ORIGINAL_NO_DECLARADO. Guard de escritor: rol != EMISION → 403. Publica contabilidad.factura_rectificada; error → contabilidad.factura.rectificar.failed. |
| `contabilidad.factura.series.request` | `onSeriesRequest` | RPC custodio (O1): {project_id} → {project_id, series:[{id_serie, ultimo_numero, siguiente_numero, n_emitidas}], n_series, serie_defecto:'UNICA', criterio_serie:'DECLARABLE', sin_saltos:true}. El criterio de serie (por negocio/canal/unica) es DECLARABLE ([ABIERTO]). Proyeccion PURA de lectura (no muta). Responde por contabilidad.factura.series.response; si falta project_id → contabilidad.factura.series.failed. |
| `project.activated` | `onProjectActivated` | Restaura las SERIES y los numeros ya emitidos del proyecto activado desde el storage (PosPersistencia): la numeracion fiscal es POR PROYECTO. Sin restaurar, la correlatividad sin saltos no se puede garantizar. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.factura_emitida` | Fire-and-forget (O1): una factura de venta quedo EMITIDA con numero correlativo de su serie → {project_id, factura_emitida, serie, numero, siguiente_numero, sin_saltos:true, decision_dueno}. Es un DOCUMENTO de contabilidad (decision del dueno), no un hecho de otra vertical. Lo consume el libro (escritor-diario B2) para trazar el asiento. |
| `contabilidad.factura_rectificada` | Fire-and-forget (O2): una rectificativa comercial quedo emitida → {project_id, factura_original, rectificativa, ajuste, no_borra:true, suma:true, original_intacto:true, plano_correccion:'COMERCIAL_O2'}. El original NO se borra: la rectificativa SUMA. Distinto del ajuste interno (B5) y de la rectificacion fiscal (D14). |
| `contabilidad.factura.emitir.failed` | Par de fallo determinista: emitir con rol != EMISION (403), sin project_id/factura (400), tipo de documento no valido (400) o sin lineas ni total para componer el desglose (422 PRECONDITION_FAILED). Cierra el circulo de contabilidad.factura.emitir.request. |
| `contabilidad.factura.rectificar.failed` | Par de fallo determinista: rectificar con rol != EMISION (403), sin rectificativa (400), motivo fuera de ABONO\|DEVOLUCION\|DESCUENTO (422 MOTIVO_NO_VALIDO), original no emitido (404 ERROR_FACTURA_ORIGINAL_NO_HALLADA) u original no declarado (422 ERROR_ORIGINAL_NO_DECLARADO). Cierra el circulo de contabilidad.factura.rectificar.request. |
| `contabilidad.factura.series.failed` | Par de fallo determinista: series sin project_id (400). Cierra el circulo de contabilidad.factura.series.request. |
| `contabilidad.factura_emitida.failed` | Par de fallo del evento de dominio contabilidad.factura_emitida: la emision del hecho de dominio no se completo. |
| `contabilidad.factura_rectificada.failed` | Par de fallo del evento de dominio contabilidad.factura_rectificada: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `contabilidad.factura.emitir.failed` cierra `contabilidad.factura.emitir.request`,
> `contabilidad.factura.rectificar.failed` cierra `...rectificar.request` y
> `contabilidad.factura.series.failed` cierra `...series.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.factura.emitir.response`, `contabilidad.factura.rectificar.response` y
> `contabilidad.factura.series.response` (los pares response de los RPC); **NO están
> declaradas en `publishes`**.

> **Nota de sub-declaración crítica**: `onSeriesRequest` publica
> `contabilidad.factura.series.failed` cuando `res.status !== 200`; en cambio
> **`emitir`/`rectificar` publican sus pares `*.failed` desde el propio handler** (por el
> `status` de la proyección). Además, **`contabilidad.factura_emitida.failed` y
> `contabilidad.factura_rectificada.failed` están declaradas en `publishes` pero no se
> emiten en `index.js`** — el custodio solo publica los pares de fallo de sus RPC.

> Nota: no está en module.json pero sí lo emite index.js en `_clienteEnMaestro` — el
> módulo publica por `_rpc` `contabilidad.tercero.identificar.request` (dependencia por
> EVENTO, no declarada como publisher).

## Reglas de negocio

1. **Un solo escritor de la parcela (O1)**: `_guardEscritor` exige
   `rol === ROL_EMISION` (`'EMISION'`). Cualquier otro → **`403 PERMISSION_DENIED`** con
   `{ message:'solo EMISION emite/rectifica la factura', details:{ rol_esperado:'EMISION',
   rol_recibido:<rol> } }`. *Dos escritores sobre la misma serie = números duplicados =
   corrupción (prohibido).*
2. **Numeración correlativa SIN SALTOS**: `numero = sec.ultimo + 1`;
   `id_factura = \`${serie}-${String(numero).padStart(6,'0')}\``. La serie se crea al
   primer uso (`_serieOCrear`). El criterio de serie (por negocio/canal/única) es
   **DECLARABLE** (pieza `[ABIERTO]`); por defecto `SERIE_DEFECTO = 'UNICA'`.
3. **El TIPO es DATO del hecho**: `TIPOS = {TICKET, FACTURA, SIMPLIFICADA, COMPLETA}`. Si
   no se declara, se infiere: `'FACTURA'` si hay `cliente`/`id_tercero`, si no `'TICKET'`.
   Un tipo fuera del conjunto → **`400 INVALID_INPUT factura.tipo`**.
4. **El desglose se COMPONE**: `_componerDesglose` calcula por línea
   `{ concepto, base, tipo, cuota: base*tipo/100, total: base+cuota }` y suma
   `suma_bases`, `suma_cuotas`, `total`. Sin líneas **ni** `factura.total` numérico →
   **`422 PRECONDITION_FAILED`** (`'la factura no trae lineas ni total: no hay desglose
   que emitir'`).
5. **Cliente tolerante (N1)**: `_clienteEnMaestro` pide la ficha por NIF; si no hay NIF →
   `{ identificado:false, fuente:'SIN_NIF' }`; si el maestro no responde →
   `{ identificado:false, fuente:'NO_DISPONIBLE' }` (**no se inventa la ficha**); la
   emisión **sigue** con el NIF literal del hecho.
6. **La rectificativa SUMA, no borra (O2)**: el original queda **INTACTO**
   (`original_intacto:true`, `no_borra:true`); la rectificativa es un documento **nuevo**
   con su **propio número correlativo** en serie propia (por defecto `<serieOriginal>R`).
   Plano `COMERCIAL_O2`.
7. **Motivo obligatorio de la rectificativa**: `MOTIVOS_RECTIFICATIVA =
   {ABONO, DEVOLUCION, DESCUENTO}`. Fuera → **`422 MOTIVO_NO_VALIDO`** con
   `{ motivo_recibido, motivos_validos }`. El **ajuste** es `signo:'SUMA_EN_NEGATIVO'`:
   `ABONO`/`DEVOLUCION` → `-total`; `DESCUENTO` → `-original.descuento` (0 si no hay).
8. **El original debe constar (o declararse)**: si no se declara el original → **`422
   ERROR_ORIGINAL_NO_DECLARADO`** (*se DECLARA, no se asume*); si se declara pero no
   consta entre las emitidas de la parcela → **`404 ERROR_FACTURA_ORIGINAL_NO_HALLADA`**
   (*no se rectifica a ciegas*).
9. **El original no trae total → no hay ajuste**: `_calcularAjuste` con original sin
   `total`/`importe` numérico → **`422 PRECONDITION_FAILED`**.
10. **Series es lectura PURA**: `_series` no muta (aunque crea la entrada del proyecto si
    no existe vía `_obtenerOCrear`); devuelve por serie
    `{ id_serie, ultimo_numero, siguiente_numero, n_emitidas }`.
11. **La numeración es POR PROYECTO**: `store[pid].series[<serie>]`; `project.activated`
    restaura el estado. Sin restaurar no se garantiza la correlatividad sin saltos.
12. **Validaciones deterministas**: en `emitir` falta `project_id` → `400 INVALID_INPUT
    project_id`; `factura` ausente/no objeto → `400 INVALID_INPUT factura`; tipo inválido
    → `400 INVALID_INPUT factura.tipo`. En `rectificar` faltan `project_id`/rectificativa
    → `400 INVALID_INPUT`. En `series` falta `project_id` → `400 INVALID_INPUT
    project_id`. Shape: `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo>
    requerido', details:{ field:<campo> } } }`.
13. **HTTP exacto**: éxito `200`; payload inválido → `400`; rol no-EMISION → `403`;
    original no emitido → `404`; motivo inválido / original no declarado / sin desglose
    → `422`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responden en `contabilidad.factura.emitir.response`,
`contabilidad.factura.rectificar.response` y `contabilidad.factura.series.response`.

### 1. `emitir` — factura completa (serie nueva, número 1)

```json
{
  "project_id": "e57a318a-...",
  "rol": "EMISION",
  "factura": { "tipo": "FACTURA", "serie": "2026", "nif": "B12345678", "fecha": "2026-09-12", "lineas": [{ "concepto": "Servicio", "base": 100, "tipo_iva": 21 }] },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "op": "emitir",
  "project_id": "e57a318a-...",
  "factura_emitida": { "id_factura": "2026-000001", "serie": "2026", "numero": 1, "correlativo_sin_saltos": true, "tipo": "FACTURA", "fecha_emision": "2026-09-12", "id_tercero": null, "nif": "B12345678", "cliente": null, "cliente_identificado": true, "cliente_fuente": "MAESTRO_TERCEROS", "desglose": { "lineas": [{ "concepto": "Servicio", "base": 100, "tipo": 21, "cuota": 21, "total": 121 }], "suma_bases": 100, "suma_cuotas": 21, "total": 121 }, "no_borra": true, "emitida_por": "EMISION", "emitida_en": "..." },
  "serie": "2026", "numero": 1, "siguiente_numero": 2, "sin_saltos": true, "un_solo_escritor": true,
  "decision_dueno": "contabilidad SI emite: la factura es su documento"
}
```
Emite `contabilidad.factura_emitida` (res.data + `correlation_id`).

### 2. `rectificar` — la rectificativa SUMA (original intacto)

```json
{
  "project_id": "e57a318a-...",
  "rol": "EMISION",
  "factura_original": "2026-000001",
  "rectificativa": { "motivo": "ABONO" },
  "correlation_id": "abc-124"
}
```
Respuesta `200`:
```json
{
  "op": "rectificar",
  "project_id": "e57a318a-...",
  "factura_original": "2026-000001",
  "rectificativa": { "id_factura": "2026R-000001", "serie": "2026R", "numero": 1, "correlativo_sin_saltos": true, "tipo": "RECTIFICATIVA", "id_factura_original": "2026-000001", "motivo": "ABONO", "importe_ajuste": -121, "total_original": 121, "no_borra": true, "suma": true, "original_intacto": true, "rectificada_por": "EMISION", "rectificada_en": "..." },
  "ajuste": { "motivo": "ABONO", "total_original": 121, "importe_ajuste": -121, "signo": "SUMA_EN_NEGATIVO", "no_borra": true, "plano_correccion": "COMERCIAL_O2" },
  "no_borra": true, "suma": true, "original_intacto": true, "plano_correccion": "COMERCIAL_O2"
}
```
Emite `contabilidad.factura_rectificada` (res.data + `correlation_id`).

### 3. `series` — listar las series (lectura pura)

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "series": [{ "id_serie": "2026", "ultimo_numero": 1, "siguiente_numero": 2, "n_emitidas": 1 }, { "id_serie": "2026R", "ultimo_numero": 1, "siguiente_numero": 2, "n_emitidas": 1 }], "n_series": 2, "serie_defecto": "UNICA", "criterio_serie": "DECLARABLE", "sin_saltos": true }
```

### 4. Fallo — rol no EMISION → 403

```json
{ "project_id": "e57a318a-...", "rol": "OPERADOR", "factura": { "lineas": [{ "base": 10 }] } }
```
Respuesta `403` + `contabilidad.factura.emitir.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo EMISION emite/rectifica la factura", "details": { "rol_esperado": "EMISION", "rol_recibido": "OPERADOR" } } }
```

### 5. Fallo — original no declarado / no hallado / motivo inválido

- Sin `factura_original` → `422 ERROR_ORIGINAL_NO_DECLARADO`.
- `factura_original:"2026-000099"` inexistente → `404 ERROR_FACTURA_ORIGINAL_NO_HALLADA`.
- `motivo:"QUIZA"` → `422 MOTIVO_NO_VALIDO` con `{ motivo_recibido, motivos_validos }`.

### 6. Tools (sin RPC en module.json)

`toolEmitir` → `_emitir`; `toolRectificar` → `_rectificar`; `toolSeries` → `_series`;
`toolCalcularAjuste` → `_calcularAjuste`.

## Tests

El test vive en `tests/unit/emision-factura-venta.test.js`. Cubre:

- `emitir` con `rol:'EMISION'` y líneas → `200`, número correlativo `1`, desglose
  compuesto (bases + cuotas), emite `contabilidad.factura_emitida`.
- **Correlatividad sin saltos**: dos emisiones consecutivas en la misma serie → números
  `1` y `2` (`siguiente_numero` coherente).
- `emitir` con `rol != EMISION` → `403 PERMISSION_DENIED` + `*.emitir.failed`.
- Tipo inválido → `400 INVALID_INPUT factura.tipo`; sin líneas ni total → `422
  PRECONDITION_FAILED`.
- **Rectificativa SUMA sin borrar**: `rectificar` con original emitido → rectificativa
  con su propio número, `original_intacto:true`, `no_borra:true`,
  `plano_correccion:'COMERCIAL_O2'`, emite `contabilidad.factura_rectificada`; el
  original sigue en la serie.
- `rectificar` sin original declarado → `422 ERROR_ORIGINAL_NO_DECLARADO`; con original
  no emitido → `404 ERROR_FACTURA_ORIGINAL_NO_HALLADA`; motivo inválido → `422
  MOTIVO_NO_VALIDO`; rol no-EMISION → `403`.
- `series` → `200` con las series y `sin_saltos:true`; sin `project_id` → `400` +
  `contabilidad.factura.series.failed`.
- **Cliente tolerante**: maestro no disponible → `cliente_fuente:'NO_DISPONIBLE'`, la
  emisión sigue.
- `project.activated` restaura las series vía PosPersistencia.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/emision-factura-venta
node --test tests/unit/emision-factura-venta.test.js
```

## Notas de implementación

- Clase `EmisionFacturaVenta extends ModuloHibridoReflejo`; `name =
  'emision-factura-venta'`, `version = 'reflejo-0.1.0'`. Store en memoria `this._store`
  (Map project_id → `{ esquema:'contabilidad-emision-factura-venta-v1', series:{ <idSerie>:{ ultimo, emitidas:[], creada_en } }, rectificativas:[], series_declaradas:[], updated_at }`).
- Constantes: `ROL_EMISION='EMISION'`, `TIPOS` (Set `TICKET`,`FACTURA`,`SIMPLIFICADA`,
  `COMPLETA`), `MOTIVOS_RECTIFICATIVA` (Set `ABONO`,`DEVOLUCION`,`DESCUENTO`),
  `SERIE_DEFECTO='UNICA'`.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'emision-factura-venta.json', dir: '/contabilidad/emision-factura-venta', snapshot,
  hidratar })`. `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` +
  `detener()`. Cada mutación marca `marcarDirty(pid)`.
- `onEmitirRequest`/`onRectificarRequest`/`onSeriesRequest` delegan en
  `_atender(e, '<op>', 'contabilidad.factura.<op>.response', fn)`; `emitir`/`rectificar`
  publican su evento de dominio o su par `*.failed` según el `status`; `series` publica
  sólo el par de fallo si `status !== 200`.
- Proyecciones puras: `_emitir`, `_componerDesglose`, `_series`, `_calcularAjuste`,
  `_rectificar`, `_clienteEnMaestro`, `_guardEscritor` + helpers `_obtenerOCrear(pid)`,
  `_serieOCrear`, `_serieDe`, `_buscarEmitida`. `_rpc`/`_invalid`/`_errorResponse` vienen
  de la base.
- Tools: `toolEmitir`, `toolRectificar`, `toolSeries`, `toolCalcularAjuste`.
- DEP hacia delante: `contabilidad.factura_emitida` lo consume `escritor-diario` (B2)
  para trazar el asiento. DEP hacia atrás por evento: N1 `maestro-terceros` (identificar
  cliente). Distinto del ajuste interno (B5) y de la rectificación fiscal (D14).
