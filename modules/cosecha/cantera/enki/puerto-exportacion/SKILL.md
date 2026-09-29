---
name: puerto-exportacion
description: >
  Skill FULL del módulo CONVERSOR `puerto-exportacion` de la vertical contabilidad de Enki.
  LA FRONTERA DE SALIDA HACIA EL ASESOR: serializa el libro/derivado canónico al formato
  declarado del programa del asesor (`salir`) y deserializa los ajustes que el asesor
  devuelve (`entrar`) a asientos PROPUESTOS. Cruza FORMATO, no decide CONTENIDO: no
  reinterpreta cifras ni recalcula saldos. Sin formato no convierte. Sin estado. Úsala para
  operar, depurar o extender el conversor, o para entender su contrato de eventos y sus
  reglas de negocio.
when-to-use: >
  - Cuando necesites exportar el libro al formato del asesor (RPC
    puerto-exportacion.salir.request) o importar sus ajustes (RPC
    puerto-exportacion.entrar.request).
  - Cuando depures por qué la conversión falla (400 FORMATO_NO_DECLARADO, 422
    FORMATO_NO_DECLARABLE, 400 INVALID_INPUT si falta el libro o los ajustes).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    de la frontera (formato declarable, campos ausentes → null + abiertos, no decide
    contenido).
  - Cuando vayas a escribir/ampliar el test unitario del conversor puerto-exportacion.
tags: [enki, modulo, conversor, contabilidad, puerto-exportacion]
---

# puerto-exportacion — CONVERSOR STATELESS de la frontera al asesor

## Qué hace el módulo

`puerto-exportacion` es un **CONVERSOR STATELESS** (L1, hoja del plan): **LA FRONTERA DE
SALIDA HACIA EL ASESOR**. Convierte el **libro/derivado canónico** al **FORMATO ESTÁNDAR**
que entiende el programa del asesor (`salir`) y convierte de vuelta los **AJUSTES** que el
asesor devuelve (`entrar`) a **asientos PROPUESTOS**.

**Cruza FORMATO, NO DECIDE CONTENIDO**: no reinterpreta cifras, no recalcula saldos, no juzga
si un ajuste es correcto ni valida su contrapartida (eso es del libro y de
`regla-contrapartida`). Solo **serializa** lo que le dan y **deserializa** lo que le llega;
la **DECISIÓN sigue siendo del asesor**.

**LA LEY ENTRA COMO DATO** (invariante 5): el `formato` (y su versión, encoding, separador
decimal y **mapeo** de campos) es **DECLARABLE**. **Sin formato declarado NO se convierte**
(`400 FORMATO_NO_DECLARADO`) y un formato **sin mapeo y sin ser canónico** se rechaza
(`422 FORMATO_NO_DECLARABLE`). **NO hay ningún formato de asesor cableado.**

**Dato ausente = desconocido**: un campo que no venga del origen queda `null` y se declara
en `abiertos`/`descartados`, **jamás se estima**.

**NOTA DE REUTILIZACIÓN** (documentada en el plan, §Reutilización): en el repo existe
`facturacion/asesoria` (v2.0.0) que empaqueta **facturas procesadas** en CSV+ZIP y publica
`asesoria.paquete.generado`. Su contrato **NO encaja** con L1 (no exporta el **libro** ni
cruza formatos contables estándar) por lo que L1 se **CONSTRUYE** reutilizando su **PATRÓN**
de paquete/mapeo declarable, **sin** adaptar ni tocar `facturacion/asesoria`.

Invariantes:

- **Los ajustes entran como asientos PROPUESTOS** (`propuestos:true`,
  `escritos_por_este_puerto:false`): quien **escribe** es el libro (`escritor-diario` B2 /
  `asiento-ajuste` B5).
- **NO escribe, NO persiste, NO muta**: el cruce de formato es puro.
- **Sin `PosPersistencia` y sin `project.activated`**: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `puerto-exportacion.salir.request` | `onSalirRequest` | RPC conversor (salida): {project_id, formato\|canal, libro\|derivado\|datos, mapeo?, cabecera?, separador?, decimal?, encoding?, formatos?, canonico?, origen?} → {project_id, tipo:'exportacion-contable', formato, formato_origen:'peticion'\|'formatos_declarables'\|'canonico', formato_canonico, adaptador_declarado, mapeo, cabecera, separador, decimal, encoding, total, filas:[{<clave externa>: valor}], abiertos:[{indice, faltantes}], recalculado:false, derivado_de}. Mapea cada fila con el `mapeo` declarado (campo canonico → clave externa) o con los nombres canonicos si el formato es canonico. Sin formato → 400 FORMATO_NO_DECLARADO; formato sin mapeo ni canonico → 422 FORMATO_NO_DECLARABLE; origen no serializable → 422. Responde por puerto-exportacion.salir.response; fallo → puerto-exportacion.salir.failed. |
| `puerto-exportacion.entrar.request` | `onEntrarRequest` | RPC conversor (entrada): {project_id, formato\|canal, ajustes\|entrante, mapeo?, formatos?} → {project_id, tipo:'importacion-ajustes', formato, adaptador_declarado, total, total_externas, asientos:[{clave_natural, fecha, sociedad, concepto, referencia, apuntes:[{cuenta, debe, haber}], origen:'asesor', propuesto:true}], propuestos:true, escritos_por_este_puerto:false, descartados:[{indice, motivo, faltantes}], recalculado:false}. Desmapea las filas del asesor a asientos PROPUESTOS (no los escribe: eso es del libro). Una fila sin cuenta o sin importe NO se inventa: se DESCARTA y se declara. Sin formato → 400; formato sin mapeo ni canonico → 422. Responde por puerto-exportacion.entrar.response; fallo → puerto-exportacion.entrar.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `puerto-exportacion.salir.response` | Respuesta RPC correlada de puerto-exportacion.salir.request → {request_id, status:200, data:{formato, filas, abiertos, recalculado:false, ...}}. Emitida por el helper _atender. |
| `puerto-exportacion.salir.failed` | Par de fallo determinista (L1): formato no declarado (400 FORMATO_NO_DECLARADO), formato no declarable (422 FORMATO_NO_DECLARABLE), libro ausente o no serializable (400/422) → {status, error:{code, message, details?}}. Cierra el circulo de puerto-exportacion.salir.request. |
| `puerto-exportacion.entrar.response` | Respuesta RPC correlada de puerto-exportacion.entrar.request → {request_id, status:200, data:{asientos, propuestos:true, descartados, recalculado:false, ...}}. Emitida por el helper _atender. |
| `puerto-exportacion.entrar.failed` | Par de fallo determinista (L1): formato no declarado (400), formato no declarable (422), ajustes ausentes o no serializables (400/422) → {status, error:{code, message, details?}}. Cierra el circulo de puerto-exportacion.entrar.request. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `puerto-exportacion.salir.failed` cierra el círculo de
> `puerto-exportacion.salir.request` y `puerto-exportacion.entrar.failed` el de
> `puerto-exportacion.entrar.request`, cada uno cuando su proyección devuelve status ≠ 200
> (`400`/`422`). **El puerto NO emite ningún evento de dominio** (ni salir ni entrar): solo
> responde su RPC.

> Nota de honestidad (cruce con `index.js`): el puerto **no publica ningún
> `contabilidad.*`**. Es una frontera pura: serializa/deserializa y devuelve por su par
> `response`/`failed`. Quien escribe los ajustes propuestos en el libro es `escritor-diario`
> (B2) / `asiento-ajuste` (B5), no este puerto.

## Reglas de negocio

1. **El formato es DECLARABLE**: `input.formato` (o su alias `input.canal`), normalizado con
   `String(...).trim()`; vacío → `400 FORMATO_NO_DECLARADO` con `{formatos_declarables}`.
   **Sin formato no se adivina el formato de ningún asesor.**
2. **Formato no declarable sin mapeo**: `_resolverFormato` acepta (a) el `mapeo` declarado en
   la petición; (b) el `mapeo` de `input.formatos[formato]`; si hay mapeo no vacío → formato
   declarable (`formato_origen:'peticion'` / `'formatos_declarables'`). Sin mapeo, **solo**
   vale un formato **canónico** (`input.canonico === true`, `input.formatos[formato] === true`
   o `_esCanonico(formato)`); si no → `422 FORMATO_NO_DECLARABLE`.
3. **Formatos canónicos**: `'canonico'`, `'canonical'` o `'json-contabilidad'` →
   `{mapeo:{}, formato_origen:'canonico', canonico:true}`.
4. **El mapeo declara la clave externa de cada campo**: `mapeo[campo_canónico]` es el nombre
   de la clave del programa del asesor. `CAMPOS_ASIENTO = [numero, fecha, clave_natural,
   sociedad, concepto, cuenta, debe, haber, importe, signo, descripcion, referencia]`. Sin
   mapeo (canónico) se usan los **nombres canónicos**.
5. **La salida aplana asientos → filas por APUNTE** (`_aplanar`): un asiento con `apuntes`
   produce **una fila por apunte** (los datos del asiento se repiten); los elementos que ya
   son filas simples pasan tal cual. **No se reinterpreta nada.**
6. **Campos ausentes → `null` y se declaran**: `_mapearFila` recorre `CAMPOS_ASIENTO`; si un
   campo es `undefined`/`null` → `fila[clave] = null` y su nombre se apila en `abiertos` con
   `{indice, faltantes}`. **Nada se estima.**
7. **`salir` devuelve el formato tal cual lo declara**: `formato_canonico`,
   `adaptador_declarado` (`Boolean(mapeo con claves)`), `mapeo`, `cabecera`, `separador`,
   `decimal`, `encoding`, `total`, `filas`, `abiertos`, `recalculado:false`, `derivado_de`.
8. **El origen de salida es flexible**: `input.libro`, o `input.derivado`, o `input.datos`;
   `undefined`/`null` → `400 INVALID_INPUT` (`field:'libro'`). `_filas` acepta un **array**, o
   `{asientos:[...]}`, `{filas:[...]}`, `{apuntes:[...]}`; si no → `422 FORMATO_NO_DECLARABLE`
   (`motivo:'origen_no_serializable'`).
9. **`entrar` desmapea a asiento PROPUESTO**: `_desmapearFila` lee `cuenta` (obligatoria) e
   `importe` (o `debe`/`haber`); **sin cuenta O sin importe la fila NO se inventa**: se apila
   en `descartados` con `{indice, motivo, faltantes}` y **no** entra en `asientos`.
10. **El importe se normaliza sin interpretar**: si vienen `debe`/`haber` se usan; si viene
    `importe`+`signo`, el signo `'HABER'` lo lleva al haber y el resto al debe (`Math.abs`).
    `_num` acepta coma decimal (`replace(',', '.')`).
11. **El asiento propuesto es honesto**: `{clave_natural, fecha, sociedad, concepto (o
    `descripcion`), referencia, apuntes:[{cuenta, debe, haber}], origen:'asesor',
    propuesto:true}`. **La decisión sigue siendo del asesor**: el puerto solo cruza formato.
12. **`escritos_por_este_puerto:false` SIEMPRE**: el puerto no escribe; quien escribe es el
    libro (B2/B5).
13. **`recalculado:false` SIEMPRE** en ambas direcciones: ni una cifra ni un saldo se
    recalculan aquí.
14. **Los ajustes entran como lista**: `input.ajustes` (o `input.entrante`); `undefined`/`null`
    → `400 INVALID_INPUT` (`field:'ajustes'`). `_filas` los aplana; si no → `422
    FORMATO_NO_DECLARABLE` (`motivo:'ajustes_no_serializables'`).
15. **`project_id` con fallback**: `input.project_id || this.project_id || null` (el puerto
    no exige project_id para el cruce puro de formato, pero lo propaga si viene).
16. **HTTP exacto**: éxito `200`; sin formato → `400 FORMATO_NO_DECLARADO`; sin libro/ajustes
    → `400 INVALID_INPUT`; formato no declarable u origen no serializable → `422
    FORMATO_NO_DECLARABLE`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `puerto-exportacion.salir.response` / `puerto-exportacion.entrar.response`. **No
emite evento de dominio.**

### 1. `salir` — exportar el libro con mapeo declarado

```json
{
  "project_id": "e57a318a-...",
  "formato": "asesor_x_csv",
  "libro": { "asientos": [ { "numero": 1, "fecha": "2026-09-01", "concepto": "venta", "apuntes": [ { "cuenta": "430", "debe": 121.5, "haber": 0 }, { "cuenta": "700", "debe": 0, "haber": 100 } ] } ] },
  "mapeo": { "numero": "N", "fecha": "FECHA", "cuenta": "CTA", "debe": "DEBE", "haber": "HABER" },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "tipo": "exportacion-contable",
  "formato": "asesor_x_csv",
  "formato_origen": "peticion",
  "formato_canonico": false,
  "adaptador_declarado": true,
  "mapeo": { "numero": "N", "fecha": "FECHA", "cuenta": "CTA", "debe": "DEBE", "haber": "HABER" },
  "cabecera": null,
  "separador": null,
  "decimal": null,
  "encoding": null,
  "total": 2,
  "filas": [
    { "N": 1, "FECHA": "2026-09-01", "CLA": null, "SOCIEDAD": null, "CONCEPTO": "venta", "CTA": "430", "DEBE": 121.5, "HABER": 0, "IMPORTE": null, "SIGNO": null, "DESCRIPCION": null, "REFERENCIA": null },
    { "N": 1, "FECHA": "2026-09-01", "CLA": null, "SOCIEDAD": null, "CONCEPTO": "venta", "CTA": "700", "DEBE": 0, "HABER": 100, "IMPORTE": null, "SIGNO": null, "DESCRIPCION": null, "REFERENCIA": null }
  ],
  "abiertos": [
    { "indice": 0, "faltantes": ["clave_natural", "sociedad", "importe", "signo", "descripcion", "referencia"] },
    { "indice": 1, "faltantes": ["clave_natural", "sociedad", "importe", "signo", "descripcion", "referencia"] }
  ],
  "recalculado": false,
  "derivado_de": null
}
```

### 2. `salir` — formato canónico sin mapeo

```json
{ "formato": "canonico", "libro": [ { "numero": 1, "fecha": "2026-09-01", "cuenta": "430", "debe": 121.5 } ] }
```

Respuesta `200`: `formato_origen:'canonico'`, `formato_canonico:true`,
`adaptador_declarado:false`, las filas con **nombres canónicos**.

### 3. `entrar` — ajustes del asesor con mapeo → asientos propuestos

```json
{
  "project_id": "e57a318a-...",
  "formato": "asesor_x_csv",
  "ajustes": [ { "CTA": "629", "DEBE": "55,50", "FECHA": "2026-09-30", "CONCEPTO": "ajuste asesor" } ],
  "mapeo": { "cuenta": "CTA", "debe": "DEBE", "fecha": "FECHA", "concepto": "CONCEPTO" },
  "correlation_id": "abc-124"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "tipo": "importacion-ajustes",
  "formato": "asesor_x_csv",
  "formato_origen": "peticion",
  "adaptador_declarado": true,
  "total": 1,
  "total_externas": 1,
  "asientos": [
    { "clave_natural": null, "fecha": "2026-09-30", "sociedad": null, "concepto": "ajuste asesor", "referencia": null, "apuntes": [ { "cuenta": "629", "debe": 55.5, "haber": 0 } ], "origen": "asesor", "propuesto": true }
  ],
  "propuestos": true,
  "escritos_por_este_puerto": false,
  "descartados": [],
  "recalculado": false
}
```

### 4. `entrar` — fila sin cuenta o sin importe se DESCARTA (no se inventa)

```json
{ "formato": "canonico", "ajustes": [ { "fecha": "2026-09-30", "concepto": "sin cuenta ni importe" } ] }
```

Respuesta `200`: `total:0`, `asientos:[]`,
`descartados:[{ "indice": 0, "motivo": "la fila no trae cuenta/importe: no se inventa un asiento", "faltantes": ["cuenta", "importe"] }]`.

### 5. Fallo — sin formato declarado

Respuesta `400` + `puerto-exportacion.salir.failed` (o `entrar.failed`):

```json
{ "status": 400, "error": { "code": "FORMATO_NO_DECLARADO", "message": "hay que declarar el formato de salida (el del programa del asesor)", "details": { "formatos_declarables": [] } } }
```

### 6. Fallo — formato sin mapeo ni canónico

Respuesta `422` + `puerto-exportacion.salir.failed` (o `entrar.failed`):

```json
{ "status": 422, "error": { "code": "FORMATO_NO_DECLARABLE", "message": "el formato declarado no tiene mapeo y no es un formato canonico", "details": { "formato": "asesor_x_csv", "motivo": "sin mapeo declarable" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/puerto-exportacion.test.js`. Cubre:

- `salir` con formato + mapeo → `200`, filas mapeadas, `abiertos` con faltantes,
  `adaptador_declarado:true`, `recalculado:false`; un asiento con 2 apuntes → **2 filas**
  (aplana por apunte).
- `salir` con formato `'canonico'` sin mapeo → nombres canónicos, `formato_origen:'canonico'`,
  `adaptador_declarado:false`.
- `salir` sin formato → `400 FORMATO_NO_DECLARADO` + `puerto-exportacion.salir.failed`.
- Formato sin mapeo ni canónico → `422 FORMATO_NO_DECLARABLE`.
- `libro` ausente → `400 INVALID_INPUT` (`field:'libro'`); origen no serializable → `422`.
- `entrar` con mapeo → asientos **PROPUESTOS** (`propuestos:true`,
  `escritos_por_este_puerto:false`), `origen:'asesor'`.
- `entrar` con fila sin cuenta/importe → se DESCARTA y se declara en `descartados`
  (`total:0`).
- Importe con coma decimal + `signo:'HABER'` → se normaliza al haber.
- `entrar` sin formato → `400 FORMATO_NO_DECLARADO`; `ajustes` ausente → `400 INVALID_INPUT`.
- `toolSalir` / `toolEntrar` devuelven la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `PuertoExportacion extends ModuloHibridoReflejo`; `name = 'puerto-exportacion'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin `onProjectActivated`
  (CONVERSOR stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-libro/puerto-exportacion/`; es de la vertical **libro**).
- Constante `CAMPOS_ASIENTO = ['numero','fecha','clave_natural','sociedad','concepto',
  'cuenta','debe','haber','importe','signo','descripcion','referencia']`.
- `onSalirRequest` / `onEntrarRequest` usan `this._atender(...)` con su `response` y publican
  su par `failed` si `status !== 200`. Las proyecciones `_salir` / `_entrar` son
  **síncronas** (no piden nada por evento).
- Helpers: `_resolverFormato`, `_esCanonico`, `_formatos`, `_filas`, `_aplanar`,
  `_mapearFila`, `_desmapearFila`, `_num`. Tools `toolSalir`, `toolEntrar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP: patrón reutilizado de `facturacion/asesoria` (v2.0.0) **sin** tocarlo; los asientos
  propuestos los escribe el libro (`escritor-diario` B2 / `asiento-ajuste` B5); la validez de
  la contrapartida es de `regla-contrapartida` (A6).
- **LA LEY COMO DATO**: el formato, su versión, encoding, separador decimal y mapeo son
  declarables; **cero** formatos cableados.
- **CRUZA FORMATO, NO DECIDE CONTENIDO**: `recalculado:false` y
  `escritos_por_este_puerto:false` **siempre**.
