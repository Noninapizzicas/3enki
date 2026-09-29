---
name: puerto-documento
description: >
  Skill FULL del módulo CONVERSOR `puerto-documento` de la vertical contabilidad
  de Enki. Frontera de las FORMAS DECLARABLES del documento: traduce una
  representacion EXTERNA (JSON de emisor, fila de CSV, salida de conector) al
  Documento canonico del dominio con `mapeo` declarable; sin forma declarada no
  adivina y lo ausente queda null y se lista en `abierto`. Úsala para operar,
  depurar o extender el conversor, o para entender su contrato de eventos y sus
  reglas de negocio.
when-to-use: >
  - Cuando necesites convertir un documento externo a la forma canonica
    (RPC puerto-documento.entrar.request).
  - Cuando depures por qué la conversion falla (400 FORMA_NO_DECLARADA o
    422 FORMA_NO_DECLARABLE, 400 INVALID_INPUT si falta el externo).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes de la frontera de formas (formato como DATO, nada se estima).
  - Cuando vayas a escribir/ampliar el test unitario del conversor puerto-documento.
tags: [enki, modulo, conversor, contabilidad, puerto-documento]
---

# puerto-documento — CONVERSOR STATELESS de la contabilidad

## Qué hace el módulo

`puerto-documento` es un **CONVERSOR STATELESS** (A4.2, hoja del plan): la frontera
de las **formas declarables** del documento. Convierte una representacion **EXTERNA**
(lo que el sitio tenga: JSON de un emisor, fila de un CSV, salida de un conector) en
el **Documento canonico** del dominio. El adaptador lo pone el sitio: `mapeo`
(campo canonico → clave externa) y `formas_declarables` entran como **DATO** en el
payload — no hay ninguna forma cableada en el codigo.

No asienta ni juzga: solo traduce forma. La conformacion a Hecho es competencia de
`normalizador-hecho` (A2) y la contrapartida se resuelve despues. Emite el fire-and-forget
`contabilidad.documento_normalizado` en exito (alimenta la admision `captura-documento`
A3 y el cuadre A4.3) y su par `puerto-documento.entrar.failed` en error. Sin
PosPersistencia y sin `project.activated`: no es custodio.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `puerto-documento.entrar.request` | `onEntrarRequest` | RPC conversor: {project_id, externo, forma, formas_declarables?, mapeo?} → {forma, documento, adaptador_declarado, abierto}. Convierte el documento externo a la forma canonica usando el mapeo declarado; los campos externos ausentes quedan null y se declaran en `abierto`. Sin `forma` → FORMA_NO_DECLARADA y par de fallo; forma fuera de las declarables → FORMA_NO_DECLARABLE. Exito → publica contabilidad.documento_normalizado y responde por puerto-documento.entrar.response. |

### Publishes

| Evento | Descripción |
|---|---|
| `puerto-documento.entrar.response` | Respuesta RPC correlada de puerto-documento.entrar.request → {request_id, status:200, data:{forma, documento, adaptador_declarado, abierto}}. Emitida por el helper _atender. |
| `puerto-documento.entrar.failed` | Par de fallo determinista (A4.2): forma no declarada/no declarable o externo ausente → {status, error:{code, message, details?}}. Cierra el circulo de puerto-documento.entrar.request. |
| `contabilidad.documento_normalizado` | Fire-and-forget (A4.2): un documento externo quedo convertido a la forma canonica → {project_id, forma, documento, abierto, correlation_id}. Alimenta la admision (captura-documento A3) y el cuadre (A4.3). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `puerto-documento.entrar.failed` cierra el círculo de
> `puerto-documento.entrar.request` cuando `_entrar` devuelve status ≠ 200.

> Nota: `contabilidad.documento_normalizado` se emite dentro de `onEntrarRequest`
> con el `correlation_id` del request; no es un `.response` sino fire-and-forget de dominio.

## Reglas de negocio

1. **La ley/formatos entran como DATO**: sin `forma` declarada NO se convierte nada.
   Constante `CAMPOS_DOCUMENTO = ['tipo','emisor','numero','fecha','base','impuestos','total','moneda']`.
   Si `forma` es null/vacia → `400 FORMA_NO_DECLARADA` con
   `details:{formas_declarables:<lista>}`.
2. **La forma debe estar entre las declarables**: si `formas_declarables` (array) no
   incluye `forma` → `422 FORMA_NO_DECLARABLE` con
   `details:{forma, formas_declarables}`. El sitio declara su frontera; el modulo no
   adivina ninguna.
3. **Adaptador declarable**: el `mapeo` asocia, por campo canonico, la clave externa
   que lo porta. Sin `mapeo`, la clave externa de cada campo es **el propio nombre
   canonico** (identidad por nombre). `adaptador_declarado` refleja si vino mapeo.
4. **Dato ausente = desconocido (cero estimacion)**: un campo cuyo valor externo es
   `undefined`, `null` o `''` queda `null` y se lista en `abierto`. Jamas se estima.
5. **Nada se pierde**: los campos del externo que no corresponden a ningun campo
   canonico se conservan bajo `documento.metadatos` (no se descartan).
6. **No asienta ni juzga**: solo traduce forma. No conforma Hecho (eso es A2), no
   resuelve contrapartida, no persiste.
7. **Validacion determinista de payload**: falta `externo` o no es objeto →
   `400 INVALID_INPUT` (`_invalid('externo')`).
8. **HTTP exacto**: éxito `200`; forma no declarada → `400`; forma no declarable →
   `422`; externo inválido → `400`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `puerto-documento.entrar.response` y emite `contabilidad.documento_normalizado`.

### 1. `entrar` — traducir un documento externo al canonico

```json
{
  "project_id": "e57a318a-...",
  "externo": { "invoice_type": "FT", "from": "Proveedor X", "n": "A-1", "date": "2026-09-01", "sub": 100, "vat": 21, "amount": 121, "cur": "EUR" },
  "forma": "json_emisor",
  "formas_declarables": ["json_emisor", "canonico"],
  "mapeo": { "tipo": "invoice_type", "emisor": "from", "numero": "n", "fecha": "date", "base": "sub", "impuestos": "vat", "total": "amount", "moneda": "cur" },
  "correlation_id": "abc-123"
}
```

Respuesta `200`:
```json
{
  "forma": "json_emisor",
  "documento": { "tipo": "FT", "emisor": "Proveedor X", "numero": "A-1", "fecha": "2026-09-01", "base": 100, "impuestos": 21, "total": 121, "moneda": "EUR", "metadatos": {} },
  "adaptador_declarado": true,
  "abierto": []
}
```
Emite `contabilidad.documento_normalizado`:
```json
{ "project_id": "e57a318a-...", "forma": "json_emisor", "documento": { "...": "..." }, "abierto": [], "correlation_id": "abc-123" }
```

### 2. Fallo — sin forma declarada

```json
{ "project_id": "e57a318a-...", "externo": { "n": "A-1" } }
```
Respuesta `400` + `puerto-documento.entrar.failed`:
```json
{ "status": 400, "error": { "code": "FORMA_NO_DECLARADA", "message": "hay que declarar la forma del documento externo", "details": { "formas_declarables": [] } } }
```

### 3. Fallo — forma no declarable

```json
{ "externo": { "n": "A-1" }, "forma": "xml_sage", "formas_declarables": ["json_emisor"] }
```
Respuesta `422` + `puerto-documento.entrar.failed`:
```json
{ "status": 422, "error": { "code": "FORMA_NO_DECLARABLE", "message": "la forma no esta entre las declarables del sitio", "details": { "forma": "xml_sage", "formas_declarables": ["json_emisor"] } } }
```

## Tests

El test vive en `tests/unit/puerto-documento.test.js`. Cubre:

- `entrar` con `forma` declarable y `mapeo` completo → `200` con `documento` canonico,
  `adaptador_declarado:true`, `abierto:[]` y emite `contabilidad.documento_normalizado`.
- `entrar` sin `forma` → `400 FORMA_NO_DECLARADA` + `puerto-documento.entrar.failed`.
- `entrar` con `forma` fuera de `formas_declarables` → `422 FORMA_NO_DECLARABLE`.
- campo externo ausente → queda `null` y aparece en `abierto` (cero estimacion).
- campos extra del externo → se conservan en `documento.metadatos`.
- `externo` ausente/no objeto → `400 INVALID_INPUT` (`field:'externo'`).
- `toolEntrar` devuelve la misma proyeccion que `_entrar`.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `PuertoDocumento extends ModuloHibridoReflejo`; `name = 'puerto-documento'`,
  `version = 'reflejo-0.1.0'`. Sin `PosPersistencia`, sin store, sin
  `onProjectActivated` (CONVERSOR stateless).
- Requiere `../../_shared/modulo-hibrido-reflejo` (DOS niveles desde
  `modules/contabilidad-entrada/puerto-documento/`).
- `onEntrarRequest` es de una linea: `this._atender(e, 'entrar',
  'puerto-documento.entrar.response', async (d) => {...})`. Dentro del handler hace
  el cierre de circulo: en `200` publica `contabilidad.documento_normalizado`, si no
  publica `puerto-documento.entrar.failed`.
- Proyeccion unica `_entrar(input)` → `{status, data}`; helper `_aDocumento(externo, mapeo)`
  recorre `CAMPOS_DOCUMENTO`, resuelve la clave externa por `mapeo`, y devuelve
  `{ok, value, faltantes}`. Tool directa `toolEntrar` → `_entrar` (sin bus).
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`; `_errorResponse`
  produce el sobre `{status, error:{code, message, details}}`.
- DEP hacia delante: lo consumen la admision (`captura-documento` A3) y el cuadre
  (`control-cuadre-documento` A4.3) via `contabilidad.documento_normalizado`.
