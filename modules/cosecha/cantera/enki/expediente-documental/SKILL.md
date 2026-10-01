---
name: expediente-documental
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `expediente-documental` de la vertical
  contabilidad (Enki). Archivo INMUTABLE y APPEND-ONLY que enlaza cada cifra del libro con su
  documento ORIGEN (cifra → documento) con su huella, procedencia y enlace: LA PRUEBA para la
  inspección. Idempotente por huella (la misma copia no se re-archiva); un documento mejor se
  AÑADE. Sin documento no se enlaza (dato ausente = desconocido). Persiste por proyecto.
when-to-use: >-
  - Cuando necesites archivar el documento origen de una cifra o recuperarlo
    (RPC expediente-documental.archivar.request / .recuperar.request).
  - Cuando depures por qué un archivado devuelve `422 PRECONDITION_FAILED` (sin documento) o
    por qué un documento no re-archiva (idempotencia por huella → `ya_existe:true`).
  - Cuando quieras entender su contrato de eventos y su hecho contabilidad.documento_archivado.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, libro, expediente, prueba, append-only]
---

# expediente-documental — CUSTODIO del archivo de la prueba

## Qué hace el módulo

`expediente-documental` es un **CUSTODIO CON PERSISTENCIA** (L7, hoja del plan). Es **la
prueba para la inspección**: cada cifra del libro queda con su documento **ORIGEN archivado
y enlazado** (`cifra → documento`) con su huella, procedencia y enlace.

Es un registro **INMUTABLE y APPEND-ONLY**: un documento **no se borra jamás**; si hay que
sustituirlo por uno mejor, se **AÑADE** el nuevo y el anterior queda como historial (la
corrección suma). Es **idempotente por huella**: la misma copia del mismo documento para la
misma cifra **no se re-archiva** (`archivado:false, ya_existe:true`).

**Dato ausente = desconocido:** sin documento no se enlaza una cifra a un documento
inventado → `422 PRECONDITION_FAILED` con `motivo:'sin_documento'`.

Se distingue de `vista-revisable` (L2): L2 **explica** el asiento con su traza; L7
**conserva** la prueba (el documento origen).

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/expediente-documental`,
archivo `expediente-documental.json`), restaura en `project.activated` y vuelca en `onUnload`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `expediente-documental.archivar.request` | `onArchivarRequest` | RPC custodio (**ORDEN**, panel): `{project_id, cifra, documento{referencia,tipo,procedencia,fecha,contenido,huella?,traza?}}` → `{project_id, cifra, documento, archivado, aceptado}`. Archiva el documento origen (append-only, idempotente por huella). Publica `contabilidad.documento_archivado` y responde por `.archivar.response`. Sin documento → `.archivar.failed`. |
| `expediente-documental.recuperar.request` | `onRecuperarRequest` | RPC custodio (**PREGUNTA**, por el bus): `{project_id, cifra}` → `{project_id, cifra, archivado, documento, historial, total}`. Devuelve el documento vigente y el historial de la cifra (append-only). La lectura no muta. Responde por `.recuperar.response`. |
| `project.activated` | `onProjectActivated` | Restaura el expediente del proyecto activado desde el storage. |

> Nota de deriva (R3): el plan declara escucha de `contabilidad.asiento_asentado`,
> `contabilidad.documento_recibido` y `contabilidad.declaracion_justificada`, pero el
> `module.json` real **solo** declara los dos RPC + `project.activated`. No escucha hechos:
> el documento llega *declarado* en la petición.

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.documento_archivado` | Fire-and-forget (L7): un documento origen quedó archivado y enlazado a su cifra → `{project_id, cifra, documento_id, huella, procedencia}`. **Solo se publica si `archivado===true`** (si fue idempotente/`ya_existe`, NO se emite). |
| `expediente-documental.archivar.response` | Respuesta RPC correlada de la op `archivar`. |
| `expediente-documental.archivar.failed` | Fallo determinista de `archivar.request`. |
| `expediente-documental.recuperar.response` | Respuesta RPC correlada de la op `recuperar`. |
| `expediente-documental.recuperar.failed` | Fallo determinista de `recuperar.request`. |

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `archivar` | **ORDEN** (panel) | `{project_id, cifra, documento\|doc, huella?, procedencia?}` | `{project_id, cifra, documento, archivado, aceptado}` | 422 `PRECONDITION_FAILED` (sin documento); 400 `INVALID_INPUT` (`project_id`/`cifra`) |
| `recuperar` | **PREGUNTA** (bus) | `{project_id, cifra}` | `{project_id, cifra, archivado, documento, historial, total, abierto}` | 400 `INVALID_INPUT` |

## Reglas de negocio (lo que el código IMPONE)

1. **Sin `project_id`** → `_invalid('project_id')`; **sin `cifra`** → `_invalid('cifra')`.
2. **Sin documento** → `422 PRECONDITION_FAILED` con `{cifra, motivo:'sin_documento'}`. Acepta
   `input.documento` u `input.doc`.
3. **Huella identitaria** (`_huella`): la declarada en `input.huella` o `documento.huella`; si
   no, un `sha1` (16 hex) del `JSON.stringify({referencia,tipo,fecha,contenido})`. Es identidad,
   no juicio.
4. **Idempotencia**: si ya hay un documento con la misma `cifra` **y** la misma `huella` →
   devuelve 200 con `archivado:false, ya_existe:true` (no duplica, no publica hecho).
5. **Append-only**: el nuevo archivo se `push` a `e.documentos` con
   `id = 'doc_${pid}_${cifra}_${huella}'`, `inmutable:true`, `archivado_en:ahora`. Nada se muta.
6. **Documento archivado**: `{id, cifra, referencia, tipo, procedencia, fecha, contenido,
   metadatos, huella, traza, inmutable, archivado_en}`. `procedencia` cae a `input.procedencia`.
7. **Recuperar devuelve el vigente** = último archivado de la cifra; `historial` = TODOS los
   documentos de la cifra; `total` = cuántos. Sin documento → `archivado:false, documento:null,
   abierto.documento` declarado.
8. **`por_cifra`**: índice `Map<cifra, [doc_id]>` reconstruido en `hidratar`.

## Cómo se usa (RPCs)

### 1. Archivar el documento origen de una cifra

```json
{
  "project_id": "e57a318a-...",
  "cifra": "asiento-2026-0007/430",
  "documento": { "referencia": "FAC-2026-0042", "tipo": "factura", "procedencia": "proveedor", "fecha": "2026-09-20", "contenido": { "base": 1000, "iva": 210 } },
  "correlation_id": "abc-2"
}
```
Respuesta `200` + `contabilidad.documento_archivado`:
```json
{ "project_id": "e57a318a-...", "cifra": "asiento-2026-0007/430", "documento": { "id": "doc_e57a318a-..._asiento-2026-0007/430_ab12cd34ef567890", "cifra": "asiento-2026-0007/430", "referencia": "FAC-2026-0042", "tipo": "factura", "procedencia": "proveedor", "fecha": "2026-09-20", "contenido": { "base": 1000, "iva": 210 }, "huella": "ab12cd34ef567890", "inmutable": true, "archivado_en": "2026-10-01T..." }, "archivado": true, "aceptado": true }
```

### 2. Re-archivar la misma copia → idempotente

Misma petición → `200` con `archivado:false, ya_existe:true` y `motivo:'el mismo documento ya estaba archivado para esta cifra (el expediente no duplica)'`. **No** emite hecho.

### 3. Recuperar la prueba de una cifra

```json
{ "project_id": "e57a318a-...", "cifra": "asiento-2026-0007/430" }
```
Respuesta `200`: `{archivado:true, documento:{...vigente}, historial:[...], total:1, abierto:{documento:null}}`.

### Fallo — sin documento

```json
{ "project_id": "e57a318a-...", "cifra": "x" }
```
Respuesta `422` + `expediente-documental.archivar.failed`:
```json
{ "status": 422, "code": "PRECONDITION_FAILED", "mensaje": "no hay documento que archivar para esta cifra (dato ausente = desconocido: nada se inventa)", "data": { "cifra": "x", "motivo": "sin_documento" } }
```

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `422 PRECONDITION_FAILED` | no hay `documento`/`doc` que archivar. |
| `400 INVALID_INPUT` (`project_id` / `cifra`) | falta el campo. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; nadie). Bases: `_shared/modulo-hibrido-reflejo` +
  `_shared/pos-persistencia` + `filesystem` + `project-manager` + `crypto`.
- **De quién depende por evento:** ninguno declarado (el documento llega en la petición).
- **Quién la consume:** la inspección recupera la prueba; los flujos de
  revisión/exportación consumen `contabilidad.documento_archivado`.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-libro/expediente-documental/module.json` + `index.js`.
2. Smoke: `archivar` con documento → 200 + `contabilidad.documento_archivado`.
3. Idempotencia: re-`archivar` la misma huella → `ya_existe:true` sin publicar hecho.
4. Sin documento → `422 PRECONDITION_FAILED` + `.archivar.failed`.
5. `recuperar` → vigente + historial, sin mutar.
6. Gate `scripts/validate-hibridos.js`.

## Notas de implementación

- Clase `ExpedienteDocumental extends ModuloHibridoReflejo`; `name = 'expediente-documental'`,
  `version = 'reflejo-0.1.0'`. Store `this._expedientes` (Map `pid → {esquema, documentos[],
  por_cifra:Map}`).
- **PosPersistencia**: `file:'expediente-documental.json'`,
  `dir:'/contabilidad/expediente-documental'`. `hidratar` reconstruye `por_cifra`.
- Proyecciones `_archivar`/`_recuperar`; tools `toolArchivar`/`toolRecuperar`; lectura directa
  `documentosDe(pid, cifra)`. `_invalid`/`_errorResponse` de `modulo-hibrido-reflejo`.
