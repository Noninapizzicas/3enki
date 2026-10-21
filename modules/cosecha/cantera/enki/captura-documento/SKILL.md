---
name: captura-documento
description: >-
  Skill FULL del módulo REFLEJO STATELESS `captura-documento` de la vertical contabilidad (Enki).
  Admite y VALIDA el documento recibido (mecánico, CERO juicio): sin ningún anclaje (tipo/file_path/
  contenido/mime/url) no es admisible. Encadena la entrada por EVENTO a `puerto-documento` (si declara
  formato) o a `extraccion-dato` (si es canónico); **no escribe**. Escucha `contabilidad.documento_recibido`
  (canal digital). Sin store propio. La op `admitir` es PREGUNTA → sin ui_handler.
when-to-use: >-
  - Cuando necesites admitir/validar mecánicamente un documento (RPC captura-documento.admitir.request).
  - Cuando depures por qué `admitido:false` (sin anclajes) o a dónde se encadenó.
  - Cuando quieras entender su contrato de eventos y su papel de primera puerta de la entrada.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, reflejo, stateless, contabilidad, entrada, captura, validacion, documentos]
---

# captura-documento — REFLEJO STATELESS de admisión de documentos

## Qué hace el módulo

`captura-documento` es un **REFLEJO STATELESS** (A3, hoja del plan) de la vertical **contabilidad**,
eje **entrada**. **Admite y valida el documento recibido** de forma **mecánica, con CERO juicio**: la
validación es que el documento traiga **al menos un anclaje** (`tipo`, `file_path`, `contenido`,
`mime`, `url`). Sin anclaje **no es admisible** (`admitido:false`).

Encadena la entrada por EVENTO:
- si el documento **declara formato** → `puerto-documento.entrar.request` (A4.2, traduce la forma);
- si **ya es canónico** → `extraccion-dato.juzgar.request` (A4.1, lo vuelve dato).

**No escribe** el contenido (`contenido_interpretado:false`). Escucha el canal digital
(`contabilidad.documento_recibido`). La op `admitir` es **PREGUNTA** → **sin ui_handler**.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `captura-documento.admitir.request` | `onAdmitirRequest` | RPC reflejo (PREGUNTA): `{project_id, documento:{tipo?,file_path?,contenido?,mime?,url?}, formato?, origen?}` → `{admitido, documento, anclajes, contenido_interpretado:false, encadenado_a, abierto}`. Delega en `_atender` → `_admitir`. Si `status ≠ 200` publica `.failed`; **si OK y admisible**, `_encadenar`. Responde por `captura-documento.admitir.response`. |
| `contabilidad.documento_recibido` | `onDocumentoRecibido` | Fire-and-forget (puerto-documento-digital A5): llegó un documento por el canal digital → se **admite** y, si es admisible, se encadena. Sin documento **no se fabrica nada**. |

### Publishes

| Evento | Cuándo |
|---|---|
| `captura-documento.admitir.response` | Respuesta RPC correlada de la op `admitir`. |
| `captura-documento.admitir.failed` | Par de fallo determinista: falta `project_id` o `documento`. |
| `puerto-documento.entrar.request` | **Si el documento declara formato y es admisible**: se encadena a A4.2 (traduce la forma). |
| `extraccion-dato.juzgar.request` | **Si el documento es canónico (sin formato) y es admisible**: se encadena a A4.1 (lo vuelve dato). |

> **NO publica un hecho de dominio**: es la primera puerta de admisión (valida y encadena). No escribe.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `admitir` | **PREGUNTA** | `{project_id, documento?:{tipo?, content?, file_path?, mime?, url?, …}, formato?, origen?}` | `{project_id, tipo, admitido, documento, formato, origen, anclajes, contenido_interpretado:false, encadenado_a, abierto}` | `400 INVALID_INPUT` (falta `project_id` o `documento`); `500`. |

## Reglas de negocio

1. **Documento obligatorio**: `documento` ausente o no-objeto → `400 INVALID_INPUT documento`.
2. **Anclajes** (`ANCLAJES = ['tipo','file_path','contenido','mime','url']`): presentes y no vacíos.
   **Sin ningún anclaje** → `admitido:false` y `abierto.documento` («no se admite, no se inventa»).
3. **Cero juicio**: `contenido_interpretado:false`. La captura **no interpreta** el contenido.
4. **Destino del encadenado** (`encadenado_a`): `'puerto-documento'` si el input trae `formato`;
   `'extraccion-dato'` si no (canónico). `null` si no es admisible.
5. **Encadenado best-effort** (`_encadenar`): solo si `admitido`; publica el evento del destino con
   `origen` (input o `'captura-documento'`).
6. **Desde el canal digital** (`onDocumentoRecibido`): construye el input a partir del hecho y admite;
   solo encadena si `admitido:true`. Errores → se loguean (no propagan).
7. **HTTP exacto**: éxito `200`; input → `400`; excepción → `500`.

## Cómo se usa (RPC)

### Admitir un documento canónico

```json
{
  "project_id": "e57a318a-...",
  "documento": { "id": "4455", "contenido": "…", "mime": "application/pdf" },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "tipo": "captura-documento",
  "admitido": true,
  "documento": { "id": "4455", "contenido": "…", "mime": "application/pdf" },
  "formato": null,
  "origen": null,
  "anclajes": ["contenido", "mime"],
  "contenido_interpretado": false,
  "encadenado_a": "extraccion-dato",
  "abierto": { "documento": null }
}
```
Publica `extraccion-dato.juzgar.request`.

### Con formato → encadena a puerto-documento

```json
{ "project_id": "...", "documento": { "tipo": "factura", "file_path": "/inbox/f.pdf" }, "formato": "proveedor_x" }
```
→ `encadenado_a:'puerto-documento'`; publica `puerto-documento.entrar.request`.

### Sin anclajes — no admisible

```json
{ "project_id": "...", "documento": { "id": "9999" } }
```
→ `admitido:false`, `anclajes:[]`, `encadenado_a:null`,
`abierto.documento = "el documento no trae ningun anclaje (tipo/file_path/contenido/mime/url): no se admite, no se inventa"`.
**No encadena.**

### Fallo — falta documento

`{ "project_id": "..." }` → `400 INVALID_INPUT documento` + `.failed`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `INVALID_INPUT` | 400 | Falta `project_id` o falta `documento`. |
| `UNKNOWN_ERROR` | 500 | Excepción no controlada. |
| (no es error) | 200 | Sin anclajes → `admitido:false` (honesto, no se encadena). |

## Relación con otras piezas (deps por EVENTO)

- **Escucha**: `contabilidad.documento_recibido` (A5).
- **Sube a**: `puerto-documento.entrar.request` (A4.2) si hay formato; `extraccion-dato.juzgar.request`
  (A4.1) si es canónico.

## Verificación

1. Fichero: `modules/contabilidad-entrada/captura-documento/`.
2. Eventos reales: subscribes `captura-documento.admitir.request`, `contabilidad.documento_recibido`;
   publishes `captura-documento.admitir.response`, `.failed`, `puerto-documento.entrar.request`,
   `extraccion-dato.juzgar.request`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'" modules/contabilidad-entrada/captura-documento/index.js
   # → captura-documento.admitir.failed / puerto-documento.entrar.request / extraccion-dato.juzgar.request
   ```
4. Test unitario (si existe): admite con anclaje; sin anclaje → `admitido:false` sin encadenar;
   con formato → puerto-documento; canónico → extraccion-dato; sin `project_id`/`documento` → 400.
