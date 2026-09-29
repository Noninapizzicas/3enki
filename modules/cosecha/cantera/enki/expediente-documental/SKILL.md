---
name: expediente-documental
description: >
  Skill FULL del módulo CUSTODIO `expediente-documental` de la vertical contabilidad de
  Enki. LA PRUEBA PARA LA INSPECCIÓN: cada cifra del libro queda con su documento ORIGEN
  archivado y enlazado (cifra → documento) con su huella, su procedencia y su enlace.
  Registro INMUTABLE y APPEND-ONLY: un documento NO se borra jamás; la corrección SUMA. Un
  solo escritor por la parcela libro/expediente. Persiste por proyecto con PosPersistencia.
  Úsala para operar, depurar o extender el custodio, o para entender su contrato de eventos
  y sus reglas de negocio.
when-to-use: >
  - Cuando necesites archivar el documento origen de una cifra (RPC
    expediente-documental.archivar.request) o recuperarlo (RPC
    expediente-documental.recuperar.request).
  - Cuando depures por qué no se archiva (422 PRECONDITION_FAILED `sin_documento` — nada se
    inventa; 403 PERMISSION_DENIED si el turno de libro/expediente es de otro; 400
    INVALID_INPUT si falta cifra/project_id) o por qué no se duplica (`ya_existe`).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    del expediente (append-only, inmutable, idempotente por huella, un solo escritor).
  - Cuando vayas a escribir/ampliar el test unitario del custodio expediente-documental.
tags: [enki, modulo, custodio, contabilidad, expediente-documental]
---

# expediente-documental — CUSTODIO CON PERSISTENCIA del expediente

## Qué hace el módulo

`expediente-documental` es un **CUSTODIO CON PERSISTENCIA** (L7, hoja del plan): **LA PRUEBA
PARA LA INSPECCIÓN**. Cada cifra del libro queda con su **documento ORIGEN ARCHIVADO y
ENLAZADO** (`cifra → documento`) con su **huella**, su **procedencia** y su **enlace**. Es un
registro **INMUTABLE** y **APPEND-ONLY**: un documento **NO se borra jamás** (invariante 10:
los registros inmutables solo crecen). Si hay que sustituir un documento por uno mejor, se
**AÑADE** el nuevo y el anterior queda como **historial** — **la corrección SUMA**.

**L2 (`vista-revisable`) EXPLICA el asiento con su traza; EL EXPEDIENTE CONSERVA la prueba.**
No se solapan: L2 compone una vista, L7 archiva el documento origen.

Es un **CUSTODIO con estado**: un **SINGLE-WRITER** por la parcela **`libro/expediente`**.
Quien escribe **pide el turno** a `single-writer` (M2) **POR EVENTO** y **RESPETA su GUARD**;
si el turno es de otro, se **rechaza** (`403`).

Invariantes:

- **APPEND-ONLY e INMUTABLE**: un documento archivado **no se borra ni se muta**. Otra copia
  del **MISMO** documento (misma huella) para la **MISMA** cifra **NO** se re-archiva
  (idempotente, `archivado:false`, `ya_existe:true`); un documento **NUEVO** se **AÑADE**.
- **Dato ausente = desconocido**: sin documento **NO** se enlaza una cifra a un documento
  inventado; se declara (`422 PRECONDITION_FAILED`, `sin_documento`) y no se archiva.
- El documento se recibe **declarado** (`documento`/`doc`) o lo entrega `puerto-documento`
  **POR EVENTO** (best-effort).
- La **HUELLA** es la declarada o el **hash** del contenido declarado (**identidad, no
  juicio**).
- **Persiste** por proyecto con **PosPersistencia** (storage
  `/contabilidad/expediente-documental/expediente-documental.json`), **restaura** en
  `project.activated` y **vuelca** en `onUnload`.

Proyecciones `_archivar` y `_recuperar`. Publica `contabilidad.cifra_archivada` (solo con
archivo **REAL**).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `expediente-documental.archivar.request` | `onArchivarRequest` | RPC custodio (escritura, APPEND-ONLY): {project_id, cifra, documento\|doc?, huella?, referencia?, id?\|escritor_id?} → {project_id, cifra, documento:{id, cifra, referencia, tipo, procedencia, fecha, contenido, metadatos, huella, traza, inmutable:true, archivado_por, archivado_en}, archivado, aceptado, turno_confirmado} o idempotente {archivado:false, ya_existe:true} si el mismo documento (misma huella) ya estaba para esa cifra. El documento se recibe declarado o lo entrega puerto-documento POR EVENTO. Sin documento → 422 PRECONDITION_FAILED (nada se inventa); turno de la parcela libro/expediente en otro escritor → 403. Exito con archivo REAL → publica contabilidad.cifra_archivada y responde por expediente-documental.archivar.response; fallo → expediente-documental.archivar.failed. |
| `expediente-documental.recuperar.request` | `onRecuperarRequest` | RPC custodio (LECTURA, no muta): {project_id, cifra} → {project_id, cifra, archivado, documento (el VIGENTE = ultimo archivado), historial (append-only: todos los documentos de la cifra), total, abierto:{documento}}. Sin documento archivado se declara (archivado:false): el expediente conserva, no inventa. Responde por expediente-documental.recuperar.response; fallo → expediente-documental.recuperar.failed. |
| `project.activated` | `onProjectActivated` | Restaura el expediente (documentos append-only + indice por cifra) del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `expediente-documental.archivar.response` | Respuesta RPC correlada de expediente-documental.archivar.request → {request_id, status:200, data:{documento, archivado, aceptado, turno_confirmado} \| {archivado:false, ya_existe:true}}. Emitida por el helper _atender. |
| `expediente-documental.archivar.failed` | Par de fallo determinista (L7): cifra o project_id ausente (400), sin documento que archivar (422 PRECONDITION_FAILED) o turno de la parcela libro/expediente en otro escritor (403) → {status, error:{code, message, details?}}. Cierra el circulo de expediente-documental.archivar.request. |
| `expediente-documental.recuperar.response` | Respuesta RPC correlada de expediente-documental.recuperar.request → {request_id, status:200, data:{archivado, documento, historial, total, abierto}}. Emitida por el helper _atender. |
| `expediente-documental.recuperar.failed` | Par de fallo determinista (L7): cifra o project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de expediente-documental.recuperar.request. |
| `contabilidad.cifra_archivada` | Fire-and-forget (L7): una cifra quedo con su documento origen ARCHIVADO y ENLAZADO (append-only) → {project_id, cifra, documento, documento_id, huella, correlation_id}. Solo se emite con archivo REAL (no con el idempotente). Lo LEEN la vista revisable (L2) y la auditoria/inspeccion del libro. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `expediente-documental.archivar.failed` cierra el círculo de
> `expediente-documental.archivar.request` y `expediente-documental.recuperar.failed` el de
> `expediente-documental.recuperar.request`, cada uno cuando su proyección devuelve status ≠
> 200 (`400`/`403`/`422`).

> Nota de honestidad (cruce con `index.js`): `onArchivarRequest` publica
> `contabilidad.cifra_archivada` **solo si `res.data.archivado === true`** — la rama
> **idempotente** (`archivado:false`, `ya_existe:true`) responde por el par `response` pero
> **NO** emite el evento de dominio. La rama `else` (`status` ≠ 200) publica
> `expediente-documental.archivar.failed`.

> Nota: el custodio expone `documentosDe(pid, cifra)` como **lectura directa** para otras
> hojas del mismo proceso (no muta) — no es un evento del bus, no figura en `module.json`.

## Reglas de negocio

1. **La cifra es obligatoria**: `input.cifra` recortada (`String(...).trim()`); vacía →
   `400 INVALID_INPUT` (`field:'cifra'`). Es la **clave** del enlace cifra → documento.
2. **El DOCUMENTO viene declarado o de `puerto-documento`**: `_documento` acepta
   `input.documento` objeto → `fuente_documento:'declarado'`; o `input.doc` objeto →
   `'declarado'`; si no, se **PIDE POR EVENTO**
   (`_rpc('puerto-documento.entrar.request', {project_id, cifra, referencia, documento_id},
   {timeout_ms:4000})`) y se toma `data.documento` (o `data.documentos[0]`) →
   `'puerto-documento'`.
3. **Sin documento NO se archiva (nada se inventa)**: si no hay documento →
   `422 PRECONDITION_FAILED` con `{cifra, fuente_documento, motivo:'sin_documento'}`.
   **Dato ausente = desconocido: nada se estima.**
4. **GUARD — UN SOLO ESCRITOR de `libro/expediente`**:
   `_rpc('single-writer.reclamar.request', {project_id, rol:'RECLAMANTE_ESCRITOR',
   parcela:'libro/expediente', id:escritor_id}, {timeout_ms:4000})`, con
   `escritor_id = input.id ?? input.escritor_id ?? 'RECLAMANTE_ESCRITOR'`. Si
   `turno_data.concedido === false` → `403 PERMISSION_DENIED` con `{parcela:'libro/expediente',
   dueno, solicitante}`. Si el guard **no responde** (`null`) → `turno_confirmado:false` y se
   **sigue** (se declara, no se oculta).
5. **La HUELLA es identidad, no juicio** (`_huella`): (a) `input.huella` no vacía; (b)
   `documento.huella` no vacía; (c) sha1 (16 hex) del contenido declarado
   (`{referencia, tipo, fecha, contenido}` serializado).
6. **IDEMPOTENCIA por (cifra, huella)**: si ya hay un documento con la **misma cifra** y la
   **misma huella** → `200 {documento:<existente>, archivado:false, ya_existe:true,
   turno_confirmado, motivo}`. **El expediente no duplica.**
7. **APPEND-ONLY**: el archivo se **apila** (`e.documentos.push`) y se indexa en
   `por_cifra` (`Map<cifra, [doc_id]>`); el expediente **solo crece**. **Un documento mejor se
   AÑADE como archivo NUEVO**; el anterior queda como historial.
8. **El archivo inmutable es completo**: `{id:'doc_<pid>_<cifra>_<huella>', cifra, referencia,
   tipo, procedencia (declarada o la fuente), fecha, contenido, metadatos, huella, traza,
   inmutable:true, archivado_por:escritor_id, archivado_en}`. **`inmutable:true` SIEMPRE.**
9. **La PROCEDENCIA declara de dónde salió**: la del documento o la `fuente_documento`
   (`'declarado'`/`'puerto-documento'`).
10. **`recuperar` es LECTURA y no muta**: devuelve `documento` = el **VIGENTE** (último
    archivado), `historial` = **todos** los documentos de la cifra (append-only), `total`, y
    `archivado:Boolean(documento)`. Sin documento → `archivado:false` y `abierto.documento`
    declarado. **El expediente conserva, no inventa.**
11. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
    `400 INVALID_INPUT` (`field:'project_id'`).
12. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura;
    `project.activated` → `restaurar(project_id)` (reconstruye `por_cifra` desde
    `documentos`); `onUnload` → `flush()` + `detener()`.
13. **HTTP exacto**: éxito `200` (con `archivado` true o false); `project_id`/`cifra` ausente
    → `400`; turno ajeno → `403`; sin documento → `422 PRECONDITION_FAILED`; excepción en
    `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `expediente-documental.archivar.response` /
`expediente-documental.recuperar.response` y emite `contabilidad.cifra_archivada` (solo con
archivo REAL).

### 1. `archivar` — documento declarado

```json
{
  "project_id": "e57a318a-...",
  "cifra": "pizzepos:venta:2026-09-01:0001",
  "documento": {
    "referencia": "factura-0001.pdf",
    "tipo": "factura",
    "procedencia": "puerto-documento",
    "fecha": "2026-09-01",
    "contenido": { "base": 100, "iva": 21 },
    "metadatos": { "paginas": 1 }
  },
  "id": "escritor-a",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "cifra": "pizzepos:venta:2026-09-01:0001",
  "documento": {
    "id": "doc_e57a318a-..._pizzepos:venta:2026-09-01:0001_a1b2c3d4e5f6a7b8",
    "cifra": "pizzepos:venta:2026-09-01:0001",
    "referencia": "factura-0001.pdf",
    "tipo": "factura",
    "procedencia": "puerto-documento",
    "fecha": "2026-09-01",
    "contenido": { "base": 100, "iva": 21 },
    "metadatos": { "paginas": 1 },
    "huella": "a1b2c3d4e5f6a7b8",
    "traza": null,
    "inmutable": true,
    "archivado_por": "escritor-a",
    "archivado_en": "2026-09-30T...:00.000Z"
  },
  "archivado": true,
  "aceptado": true,
  "turno_confirmado": true
}
```

Emite `contabilidad.cifra_archivada`:

```json
{ "project_id": "e57a318a-...", "cifra": "pizzepos:venta:2026-09-01:0001", "documento": { "...": "..." }, "documento_id": "doc_...", "huella": "a1b2c3d4e5f6a7b8", "correlation_id": "abc-123" }
```

### 2. `archivar` — el mismo documento (misma huella) → idempotente

Misma `huella` para la misma `cifra` → Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "cifra": "pizzepos:venta:2026-09-01:0001", "documento": { "id": "doc_...", "...": "..." }, "archivado": false, "ya_existe": true, "turno_confirmado": true, "motivo": "el mismo documento ya estaba archivado para esta cifra (el expediente no duplica)" }
```

**No se emite `contabilidad.cifra_archivada`.** Para **añadir** un documento mejor sobre la
misma cifra basta con que cambie su **huella** (otro contenido/referencia) — la corrección
**SUMA**.

### 3. `recuperar` — el documento vigente y su historial

```json
{ "project_id": "e57a318a-...", "cifra": "pizzepos:venta:2026-09-01:0001" }
```

Respuesta `200`: `archivado:true`, `documento` (el **último** archivado, vigente),
`historial` (todos, append-only), `total`. Sin documento → `archivado:false`, `documento:null`,
`historial:[]`, `total:0`, `abierto.documento` declarado.

### 4. Fallo — sin documento que archivar (nada se inventa)

Respuesta `422` + `expediente-documental.archivar.failed`:

```json
{ "status": 422, "error": { "code": "PRECONDITION_FAILED", "message": "no hay documento que archivar para esta cifra (dato ausente = desconocido: nada se inventa)", "details": { "cifra": "pizzepos:venta:2026-09-01:0001", "fuente_documento": null, "motivo": "sin_documento" } } }
```

### 5. Fallo — el turno es de otro escritor

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el escritor con el turno de la parcela libro/expediente puede archivar documentos", "details": { "parcela": "libro/expediente", "dueno": "escritor-a", "solicitante": "escritor-b" } } }
```

### 6. Fallo — falta la cifra

Respuesta `400` + `expediente-documental.archivar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "cifra requerida", "details": { "field": "cifra" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/expediente-documental.test.js`. Cubre:

- `archivar` con documento declarado → `200 archivado:true`, documento con `inmutable:true` y
  **emite** `contabilidad.cifra_archivada`.
- **Idempotencia por huella**: mismo documento (misma cifra + huella) → `200
  {archivado:false, ya_existe:true}` y **no** emite el evento.
- Documento **nuevo** (huella distinta) sobre la misma cifra → se **AÑADE** (append-only, no
  sustituye).
- **Sin documento** → `422 PRECONDITION_FAILED` (`sin_documento`) +
  `expediente-documental.archivar.failed`.
- Guard de turno: `concedido:false` → `403`; sin respuesta (null) → `turno_confirmado:false` y
  se archiva.
- Documento entregado por `puerto-documento` **por evento** → `procedencia`/`fuente_documento`
  declarados.
- `_huella`: declarada, del documento o sha1 del contenido (16 hex).
- `recuperar` → `documento` **vigente** (último) + `historial` completo; sin documento →
  `archivado:false`.
- `project.activated` restaura `documentos` + `por_cifra`; `documentosDe(pid, cifra)` lee sin
  mutar.
- `cifra`/`project_id` ausente → `400 INVALID_INPUT`; `toolArchivar`/`toolRecuperar`
  devuelven la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `ExpedienteDocumental extends ModuloHibridoReflejo`; `name = 'expediente-documental'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._expedientes`
  (`Map<project_id, {esquema, documentos:[append-only], por_cifra: Map<cifra, [doc_id]>}>`).
- Constantes: `PARCELA = 'libro/expediente'`, `ROL_RECLAMANTE = 'RECLAMANTE_ESCRITOR'`.
- Requiere `crypto` (sha1 para la huella) y `../../_shared/pos-persistencia`.
- **PosPersistencia**: `_persist = new PosPersistencia({modulo, file:'expediente-documental.json',
  dir:'/contabilidad/expediente-documental', snapshot, hidratar})` desde
  `modules/contabilidad-libro/expediente-documental/` (DOS niveles →
  `../../_shared/pos-persistencia`). `onProjectActivated` → `restaurar(project_id)`;
  `onUnload` → `flush()` + `detener()`; cada escritura `marcarDirty(pid)`.
- `onArchivarRequest` / `onRecuperarRequest` usan `this._atender(...)`. `onArchivarRequest`
  hace el cierre de círculo: en `200` con `archivado:true` publica `contabilidad.cifra_archivada`,
  si no el par `failed`.
- Proyecciones `_archivar` (`async`: pide turno a M2 y puede pedir el documento a
  `puerto-documento` por evento) y `_recuperar`; helpers `_documento`, `_huella`,
  `_obtenerOCrear`. Lectura directa `documentosDe(pid, cifra)`. Tools `toolArchivar`,
  `toolRecuperar`.
- `_invalid` / `_errorResponse` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide `single-writer.reclamar.request` (M2) por evento y `puerto-documento.entrar.request`
  (best-effort) por evento; lo LEEN la vista revisable (L2) y la auditoría/inspección del
  libro vía `contabilidad.cifra_archivada`.
- **APPEND-ONLY E INMUTABLE**: un documento **no se borra jamás**; la corrección **SUMA** (se
  añade un documento nuevo y el anterior queda como historial).
