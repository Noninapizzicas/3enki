---
name: factura-electronica
description: >
  Skill FULL del módulo CONVERSOR `factura-electronica` de la vertical contabilidad de
  Enki (D9, hoja del plan). LA FRONTERA DEL FORMATO ESTRUCTURADO DE LA FACTURA: un SOLO
  cruce, en los dos sentidos. Emitir: emitirEstructurada(factura) → DocumentoEstructurado
  (sale en Facturae/UBL/CII con emisor, receptor, líneas y totales). Recibir:
  interpretarEstructurado(documento) → Factura — un documento YA estructurado ENTRA SIN
  EXTRACCIÓN (no pasa por A4.1: el formato ya trae la forma). El formato concreto es
  DECLARABLE ([ABIERTO]): Facturae (3.2.2) es el valor declarable por defecto en España,
  NO una constante cableada — el escritor puede declarar otro formato y el conversor lo
  respeta; si falta una forma SE CREA (invariante de puerto abierto; registrarFormato).
  Solo traduce forma: no emite (O1) ni registra (D8). Sin estado. Úsala para operar,
  depurar o extender el conversor, o para entender su contrato de eventos y sus reglas.
when-to-use: >
  - Cuando necesites traducir una factura a su forma estructurada (RPC
    contabilidad.factura.estructurar.request), interpretar un documento ya estructurado
    (contabilidad.factura.interpretar.request) o registrar un formato declarable
    (contabilidad.factura.registrar_formato.request).
  - Cuando depures por qué se rechaza (404 RESOURCE_NOT_FOUND si el formato no tiene
    adaptador, 422 PRECONDITION_FAILED si la factura no trae líneas ni total, 400
    INVALID_INPUT si falta project_id/factura/documento/formato).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes), por qué el
    documento estructurado entra SIN extracción y por qué el formato es declarable.
  - Cuando vayas a escribir/ampliar el test unitario del conversor factura-electronica.
tags: [enki, modulo, conversor, contabilidad, factura-electronica, formato, declarable]
---

# factura-electronica — CONVERSOR y frontera única del formato estructurado

## Qué hace el módulo

`factura-electronica` es un **CONVERSOR STATELESS** (D9, hoja del plan): **LA FRONTERA DEL
FORMATO ESTRUCTURADO DE LA FACTURA** — un **solo cruce, en los dos sentidos**:

- **Emitir**: `_emitirEstructurada(factura)` → `DocumentoEstructurado` (sale en
  **Facturae**/UBL/CII con **emisor, receptor, líneas y totales**);
- **Recibir**: `_interpretarEstructurado(documento)` → `Factura` — un documento **YA
  estructurado ENTRA SIN EXTRACCIÓN** (`sin_extraccion:true`, `no_pasa_por_A4_1:true`: el
  formato ya trae la forma).

El **formato concreto es DECLARABLE** (`[ABIERTO]`): **Facturae (3.2.2)** es el **valor
declarable por defecto en España**, **NO una constante cableada** — el escritor puede
declarar otro formato y el conversor lo **respeta**; si falta una forma **SE CREA**
(invariante de **puerto abierto**; `_registrarFormato`).

**Tres cosas distintas**: el conversor **TRADUCE forma** — **NO emite** el documento fiscal
(eso es `emision-factura-venta` O1) ni lo **registra** (`registro-verifactu` D8).

Es **stateless**: sin PosPersistencia ni `project.activated` — **entra objeto, sale
objeto**; el catálogo de formatos declarados vive en memoria del propio conversor (es
**configuración del adaptador de formato**, no parcela persistente). Emite
`contabilidad.factura_estructurada` y `contabilidad.factura_interpretada` en éxito, y sus
pares deterministas en fallo.

> **NO REUTILIZA**: la factura electrónica estructurada no existe en el inventario; el
> formato concreto es declarable.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contabilidad.factura.estructurar.request` | `onEstructurarRequest` | RPC conversor: {project_id, factura:{id_factura, serie?, numero?, fecha_emision?, nif?, lineas?:[{concepto, base, tipo}], total?}, formato?:'FACTURAE'\|'UBL'\|'CII'} → {project_id, documento:{formato, version, emisor, receptor, factura, lineas, totales}, formato}. Traduce la factura a su forma ESTRUCTURADA declarada (Facturae por defecto, declarable). 404 si el formato no tiene adaptador (accion REGISTRAR_FORMATO: la forma se crea, no se fuerza); 422 si no hay lineas ni total. Exito publica contabilidad.factura_estructurada y responde por contabilidad.factura.estructurar.response; error → contabilidad.factura.estructurar.failed. |
| `contabilidad.factura.interpretar.request` | `onInterpretarRequest` | RPC conversor: {project_id, documento:{formato, emisor, receptor, factura, lineas, totales}} → {project_id, factura:{id_factura, serie, numero, fecha_emision, nif, emisor_nombre, receptor_nif, lineas, total}, formato, sin_extraccion:true, no_pasa_por_A4_1:true}. Interpreta un documento YA estructurado: ENTRA SIN extraccion (no pasa por A4.1). Exito publica contabilidad.factura_interpretada y responde por contabilidad.factura.interpretar.response; error → contabilidad.factura.interpretar.failed. |
| `contabilidad.factura.registrar_formato.request` | `onRegistrarFormatoRequest` | RPC conversor: {project_id?, formato, version?, rol?} → {formato, estado, creado:true, formato_defecto:'FACTURAE'}. Catalogo DECLARABLE de formatos estructurados: si falta una forma, SE CREA (invariante de puerto abierto). Responde por contabilidad.factura.registrar_formato.response; si falta el formato → contabilidad.factura.registrar_formato.failed. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.factura_estructurada` | Fire-and-forget (D9): una factura quedo traducida a su forma estructurada declarada → {project_id, documento:{formato, version, emisor, receptor, lineas, totales}, formato}. Es la salida al formato de intercambio (Facturae); la entrega/presentacion es de otro puerto. |
| `contabilidad.factura_interpretada` | Fire-and-forget (D9): un documento estructurado entro en el sistema → {project_id, factura:{id_factura, nif, lineas, total}, formato, sin_extraccion:true, no_pasa_por_A4_1:true}. Un documento estructurado entra SIN extraccion: no pasa por A4.1. |
| `contabilidad.factura.estructurar.failed` | Par de fallo determinista: estructurar sin project_id/factura, sin lineas ni total (422), o con formato sin adaptador (404). Cierra el circulo de contabilidad.factura.estructurar.request. |
| `contabilidad.factura.interpretar.failed` | Par de fallo determinista: interpretar sin project_id/documento, o con formato desconocido (404). Cierra el circulo de contabilidad.factura.interpretar.request. |
| `contabilidad.factura.registrar_formato.failed` | Par de fallo determinista: registrar formato sin formato declarado. Cierra el circulo de contabilidad.factura.registrar_formato.request. |
| `contabilidad.factura_estructurada.failed` | Par de fallo del evento de dominio contabilidad.factura_estructurada: la emision del hecho de dominio no se completo. |
| `contabilidad.factura_interpretada.failed` | Par de fallo del evento de dominio contabilidad.factura_interpretada: la emision del hecho de dominio no se completo. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> `contabilidad.factura.estructurar.failed` cierra `contabilidad.factura.estructurar.request`;
> `contabilidad.factura.interpretar.failed` cierra
> `contabilidad.factura.interpretar.request`; `contabilidad.factura.registrar_formato.failed`
> cierra `contabilidad.factura.registrar_formato.request`.

> Nota: no está en module.json pero sí lo emite index.js — `_atender` publica
> `contabilidad.factura.estructurar.response`, `contabilidad.factura.interpretar.response`
> y `contabilidad.factura.registrar_formato.response` (los pares response de los RPC);
> **NO están declaradas en `publishes`**.

> Nota: declarado en module.json pero NO emitido por index.js (patrón de la vertical: el
> par de fallo real es `<op>.failed`) — `contabilidad.factura_estructurada.failed` y
> `contabilidad.factura_interpretada.failed` son los pares de fallo de los eventos de
> DOMINIO; el conversor solo publica los pares `*.failed` de sus RPC.

## Reglas de negocio

1. **Frontera única (un solo cruce)**: `_emitirEstructurada` y `_interpretarEstructurado`
   son las **dos únicas puertas** del formato estructurado. La respuesta lo declara
   (`un_solo_cruce:true` en emitir). **El conversor TRADUCE forma: no emite (O1) ni
   registra (D8).**
2. **El formato es DECLARABLE**: `_formatoDe(input)` toma `input.formato`/`input.estructura`
   (mayúsculas) o, si no, `FORMATO_DEFECTO = 'FACTURAE'`. `FORMATOS_BASE = {FACTURAE, UBL,
   CII, JSON_ESTRUCTURADO}` son los que sabe traducir **de fábrica**; un formato **nuevo se
   registra** con `_registrarFormato` (invariante de **puerto abierto**).
3. **Formato sin adaptador → 404**: `_formatoConocido(formato)` = está registrado en
   `this._formatos` o en `FORMATOS_BASE`. Si no → **`404 RESOURCE_NOT_FOUND`** con
   `{ formato, accion:'REGISTRAR_FORMATO', invariante:'puerto_abierto_se_crea' }` y el
   mensaje *«no hay adaptador de formato X: la forma se DECLARA, no se fuerza»*.
4. **El desglose se COMPONE de las líneas**: `_desgloseDe(factura)` usa `factura.desglose`
   si ya trae líneas; si no, mapea cada línea a
   `{ concepto, base, tipo, cuota = base*tipo/100, total = base+cuota }`, con
   `base = base ?? importe ?? precio` y `tipo = tipo_impuesto ?? tipo_iva ?? tipo`
   (redondeo a céntimos). Devuelve `{ lineas, suma_bases, suma_cuotas, total }`.
5. **Precondición de emitir**: si el desglose **no tiene líneas** y `factura.total` **no
   es finito** → **`422 PRECONDITION_FAILED`** con `{ formato }` — *no hay documento
   estructurado que emitir*.
6. **El documento estructurado de salida**: `{ formato, version (3.2.2 para FACTURAE, o la
   registrada, o '1.0'), estructura:'FACTURA_ELECTRONICA', emisor:{ nif, nombre },
   receptor:{ nif, nombre }, factura:{ id_factura, serie, numero, fecha_emision,
   clave_natural }, lineas, totales:{ suma_bases, suma_cuotas, total }, formateado_por:
   'factura-electronica (D9)', generado_en }`. El emisor toma `nif_emisor`/`nif` y
   `emisor`/`razon_social`; el receptor toma `nif_receptor`/`cliente_nif`/`cliente.nif` y
   `cliente`/`cliente.nombre`.
7. **El documento estructurado ENTRA SIN extracción**: `_interpretarEstructurado` acepta
   `input.documento`/`estructurado`/`objeto`, y si trae `formato` **desconocido** →
   `404 RESOURCE_NOT_FOUND` (`accion:'REGISTRAR_FORMATO'`). La respuesta declara
   `sin_extraccion:true`, `no_pasa_por_A4_1:true`: **el formato ya trae la forma**.
8. **La factura interpretada**: `{ id_factura, serie, numero, fecha_emision, clave_natural,
   nif (emisor), emisor_nombre, receptor_nif, receptor_nombre, lineas, total,
   origen:'DOCUMENTO_ESTRUCTURADO' }`. El `total` sale de `documento.totales.total` o, si
   no, de `Σ (base + cuota)` de las líneas.
9. **El catálogo de formatos es DECLARABLE y ampliable**: `_registrarFormato` normaliza el
   formato (mayúsculas) y guarda `{ formato, version, declarado_por, registrado_en }` en
   `this._formatos` (memoria del conversor); devuelve `{ formato, estado, creado:true,
   formato_defecto:'FACTURAE' }` y loguea `factura-electronica.formato_registrado`.
10. **Validaciones deterministas**: falta `project_id` → `400 INVALID_INPUT project_id`;
    sin `factura`/`objeto` → `400 INVALID_INPUT factura`; sin `documento`/`estructurado`/
    `objeto` → `400 INVALID_INPUT documento`; sin `formato` → `400 INVALID_INPUT formato`.
    Shape: `{ status:400, error:{ code:'INVALID_INPUT', message:'<campo> requerido',
    details:{ field:<campo> } } }`.
11. **HTTP exacto**: éxito `200`; payload inválido → `400`; formato sin adaptador → `404`;
    emitir sin líneas ni total → `422`; excepción en `_atender` → `500 UNKNOWN_ERROR`.
12. **Determinismo**: cada op es una proyección pura; `_emitirEstructurada` e
    `_interpretarEstructurado` son síncronas y no mutan nada salvo `_registrarFormato`, que
    solo añade al catálogo en memoria.

## Cómo se usa (RPCs)

RPCs que responden en `contabilidad.factura.estructurar.response`,
`contabilidad.factura.interpretar.response` y
`contabilidad.factura.registrar_formato.response`.

### 1. `estructurar` — factura → documento Facturae

```json
{
  "project_id": "e57a318a-...",
  "factura": {
    "id_factura": "UNICA-1", "serie": "UNICA", "numero": 1, "fecha_emision": "2026-09-12",
    "nif": "B12345678",
    "lineas": [ { "concepto": "Servicio", "base": 100, "tipo": 21 } ]
  },
  "formato": "FACTURAE",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "documento": {
    "formato": "FACTURAE", "version": "3.2.2", "estructura": "FACTURA_ELECTRONICA",
    "emisor": { "nif": "B12345678", "nombre": null },
    "receptor": { "nif": null, "nombre": null },
    "factura": { "id_factura": "UNICA-1", "serie": "UNICA", "numero": 1, "fecha_emision": "2026-09-12", "clave_natural": null },
    "lineas": [ { "concepto": "Servicio", "base": 100, "tipo": 21, "cuota": 21, "total": 121 } ],
    "totales": { "suma_bases": 100, "suma_cuotas": 21, "total": 121 },
    "formateado_por": "factura-electronica (D9)", "generado_en": "..."
  },
  "formato": "FACTURAE",
  "un_solo_cruce": true,
  "nota": "frontera unica del FORMATO estructurado: el conversor TRADUCE forma; no emite (O1) ni registra (D8)"
}
```

Emite `contabilidad.factura_estructurada` (res.data + `correlation_id`).

### 2. `interpretar` — documento estructurado → factura (SIN extracción)

```json
{
  "project_id": "e57a318a-...",
  "documento": {
    "formato": "FACTURAE",
    "emisor": { "nif": "B12345678", "nombre": "ACME SL" },
    "receptor": { "nif": "12345678Z", "nombre": "Cliente" },
    "factura": { "id_factura": "UNICA-1", "serie": "UNICA", "numero": 1, "fecha_emision": "2026-09-12", "clave_natural": "k1" },
    "lineas": [ { "concepto": "Servicio", "base": 100, "tipo": 21, "cuota": 21 } ],
    "totales": { "total": 121 }
  },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "factura": { "id_factura": "UNICA-1", "serie": "UNICA", "numero": 1, "fecha_emision": "2026-09-12", "clave_natural": "k1", "nif": "B12345678", "emisor_nombre": "ACME SL", "receptor_nif": "12345678Z", "receptor_nombre": "Cliente", "lineas": [ { "concepto": "Servicio", "base": 100, "tipo": 21, "cuota": 21 } ], "total": 121, "origen": "DOCUMENTO_ESTRUCTURADO" },
  "formato": "FACTURAE",
  "sin_extraccion": true,
  "no_pasa_por_A4_1": true,
  "determinista": true,
  "nota": "un documento estructurado entra SIN extraccion (no pasa por A4.1): el formato ya trae la forma"
}
```

Emite `contabilidad.factura_interpretada` (res.data + `correlation_id`).

### 3. `registrar_formato` — crear una forma que falta

```json
{ "formato": "FACTURAE_EXT", "version": "1.0", "rol": "DUENO" }
```

Respuesta `200`:

```json
{ "project_id": null, "formato": "FACTURAE_EXT", "estado": { "formato": "FACTURAE_EXT", "version": "1.0", "declarado_por": "DUENO", "registrado_en": "..." }, "creado": true, "formato_defecto": "FACTURAE" }
```

### 4. Fallo — formato sin adaptador → 404

```json
{ "project_id": "e57a318a-...", "factura": { "lineas": [ { "base": 10 } ] }, "formato": "EDIFACT" }
```

Respuesta `404` + `contabilidad.factura.estructurar.failed`:

```json
{ "status": 404, "error": { "code": "RESOURCE_NOT_FOUND", "message": "no hay adaptador de formato EDIFACT: la forma se DECLARA, no se fuerza", "details": { "formato": "EDIFACT", "accion": "REGISTRAR_FORMATO", "invariante": "puerto_abierto_se_crea" } } }
```

### 5. Fallo — factura sin líneas ni total → 422

```json
{ "project_id": "e57a318a-...", "factura": { "id_factura": "X" } }
```

Respuesta `422` + `contabilidad.factura.estructurar.failed`:

```json
{ "status": 422, "error": { "code": "PRECONDITION_FAILED", "message": "la factura no trae lineas ni total: no hay documento estructurado que emitir", "details": { "formato": "FACTURAE" } } }
```

### 6. Fallo — payload inválido

```json
{ "formato": "FACTURAE" }
```

Respuesta `400` + `contabilidad.factura.estructurar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "project_id requerido", "details": { "field": "project_id" } } }
```

### 7. Tools (sin RPC en module.json)

`toolEmitirEstructurada` → `_emitirEstructurada`; `toolInterpretarEstructurado` →
`_interpretarEstructurado`; `toolRegistrarFormato` → `_registrarFormato`.

## Tests

El test viviría en `tests/unit/factura-electronica.test.js`. Cubre:

- `estructurar` con líneas → `200`, `documento.totales` coherente (`suma_bases`,
  `suma_cuotas`, `total`), `un_solo_cruce:true`; emite `contabilidad.factura_estructurada`.
- **Formato DECLARABLE**: `formato:'UBL'` → se respeta (no se fuerza Facturae); sin
  `formato` → `FACTURAE` por defecto.
- Formato sin adaptador → `404 RESOURCE_NOT_FOUND` (`accion:'REGISTRAR_FORMATO'`); tras
  `registrar_formato`, el mismo formato ya traduce.
- `estructurar` sin líneas ni total → `422 PRECONDITION_FAILED`.
- `interpretar` de un documento estructurado → `200` con `sin_extraccion:true`,
  `no_pasa_por_A4_1:true`; formato desconocido → `404`; emite
  `contabilidad.factura_interpretada`.
- Sin `project_id`/`factura`/`documento`/`formato` → `400 INVALID_INPUT` + par `*.failed`.
- El conversor es **stateless**: sin `project.activated` ni persistencia (el catálogo de
  formatos vive solo en memoria).

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad/modules/contabilidad/factura-electronica
node --test tests/unit/factura-electronica.test.js
```

## Notas de implementación

- Clase `FacturaElectronica extends ModuloHibridoReflejo`; `name = 'factura-electronica'`,
  `version = 'reflejo-0.1.0'`. **Sin store persistente**; solo un catálogo en memoria
  `this._formatos = new Map()` (configuración del adaptador de formato, no parcela).
- Constantes: `FORMATOS_BASE = {FACTURAE, UBL, CII, JSON_ESTRUCTURADO}`,
  `FORMATO_DEFECTO = 'FACTURAE'`, `VERSION_FACTURAE = '3.2.2'`.
- `onEstructurarRequest`/`onInterpretarRequest` publican el evento de dominio si
  `status === 200` y el par `*.failed` si no; `onRegistrarFormatoRequest` publica solo el
  par de fallo si `status !== 200`. Todos delegan en `_atender(e, '<op>',
  'contabilidad.factura.<op>.response', fn)`.
- Proyecciones puras: `_emitirEstructurada`, `_interpretarEstructurado`, `_registrarFormato`,
  `_desgloseDe`, `_formatoDe`, `_formatoConocido`. `_invalid`, `_errorResponse`, `_round`
  vienen de la base.
- Tools: `toolEmitirEstructurada`, `toolInterpretarEstructurado`, `toolRegistrarFormato`.
- DEP hacia delante: `contabilidad.factura_estructurada` es la salida al formato de
  intercambio; la entrega/presentación es de **otro puerto** (no del conversor).
  `contabilidad.factura_interpretada` alimenta la cadena de admisión. **No emite ni
  registra**: eso es de `emision-factura-venta` (O1) y `registro-verifactu` (D8).
