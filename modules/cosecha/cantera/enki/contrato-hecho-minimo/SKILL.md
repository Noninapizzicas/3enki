---
name: contrato-hecho-minimo
description: >
  Skill FULL del módulo CUSTODIO `contrato-hecho-minimo` de la vertical
  contabilidad de Enki. La parcela del mínimo exigible por vertical — un mínimo
  DECLARADO por la fuente (no un formato impuesto); un solo escritor
  (DECLARANTE_CONTRATO), lo que el hecho no aporta se declara en `faltantes` y
  jamás se estima. Persiste por proyecto con PosPersistencia. Úsala para operar,
  depurar o extender el custodio, o para entender su contrato de eventos y sus
  reglas de negocio.
when-to-use: >
  - Cuando necesites verificar el mínimo de una vertical contra un hecho
    (RPC contrato-hecho-minimo.exigir.request) o declarar ese mínimo
    (RPC contrato-hecho-minimo.declarar.request).
  - Cuando depures por qué un hecho no cumple (400 INVALID_INPUT si falta
    project_id/vertical/campos, 403 PERMISSION_DENIED si el rol no es
    DECLARANTE_CONTRATO) o por qué `declarado:false`.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    reglas de negocio (mínimo declarado, no se estima, append-only, un solo
    escritor, persistencia por proyecto).
  - Cuando vayas a escribir/ampliar el test unitario del custodio
    contrato-hecho-minimo.
tags: [enki, modulo, custodio, contabilidad, contrato-hecho-minimo]
---

# contrato-hecho-minimo — CUSTODIO CON PERSISTENCIA del mínimo exigible

## Qué hace el módulo

`contrato-hecho-minimo` es un **CUSTODIO CON PERSISTENCIA** (A11, hoja del plan):
**la cara vista desde la fuente**. La parcela **declarable** del **mínimo
exigible** a cada vertical — no un formato impuesto, un mínimo declarado.
Contabilidad se adapta; no obliga a la fuente a emitir de una forma concreta.

**Invariante 13 — el mínimo se DECLARA, no se estima**: el contrato de una vertical
solo existe si la fuente (rol `DECLARANTE_CONTRATO`) lo declara. `exigir` es
**lectura determinista** (no muta): verifica el mínimo **declarado** contra el hecho
que llega y lista en `faltantes` los campos que el hecho no aporta — **jamás**
rellena un campo ausente con una estimación; sin contrato declarado devuelve
`declarado:false` y no exige nada cableado.

`declarar` es la escritura, **append-only**: re-declarar **NO** sobrescribe en
silencio, apila una versión nueva en el historial y el contrato vigente queda
fechado. **UN SOLO ESCRITOR**: el declarante (rol `DECLARANTE_CONTRATO`); cualquier
otro rol es rechazado (`403`).

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/contrato-hecho-minimo/contrato-hecho-minimo.json`), restaura en
`project.activated` y vuelca en `onUnload`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `contrato-hecho-minimo.exigir.request` | `onExigirRequest` | RPC custodio (lectura, NO muta): {project_id, vertical, hecho?} → {declarado, contrato, campos, faltantes, completo, evaluado} o {declarado:false, motivo} si la fuente no declaro minimo. Verifica el minimo declarado contra el hecho y lista en faltantes los campos ausentes (nada se rellena). Responde por contrato-hecho-minimo.exigir.response; project_id o vertical ausente → contrato-hecho-minimo.exigir.failed. |
| `contrato-hecho-minimo.declarar.request` | `onDeclararRequest` | RPC custodio (escritura, UN escritor): {project_id, rol:'DECLARANTE_CONTRATO', vertical, campos:[...]} → {contrato:{vertical, campos, version, declarado_por, declarado_en}, declarado, sobrescritura}. Guard Rol=DECLARANTE_CONTRATO (segundo escritor → 403). Append-only: re-declarar apila version nueva en el historial, no sobrescribe en silencio. Exito → publica contabilidad.contrato_declarado y responde por contrato-hecho-minimo.declarar.response; invalido → contrato-hecho-minimo.declarar.failed. |
| `project.activated` | `onProjectActivated` | Restaura los contratos de minimo del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `contrato-hecho-minimo.exigir.response` | Respuesta RPC correlada de contrato-hecho-minimo.exigir.request → {request_id, status:200, data:{declarado, contrato, campos, faltantes, completo, evaluado} \| {declarado:false, motivo}}. Emitida por el helper _atender. |
| `contrato-hecho-minimo.exigir.failed` | Par de fallo determinista (A11): project_id o vertical ausente → {status, error:{code, message, details?}}. Cierra el circulo de contrato-hecho-minimo.exigir.request. |
| `contrato-hecho-minimo.declarar.response` | Respuesta RPC correlada de contrato-hecho-minimo.declarar.request → {request_id, status:200, data:{contrato, declarado, sobrescritura}}. Emitida por el helper _atender. |
| `contrato-hecho-minimo.declarar.failed` | Par de fallo determinista (A11): rol != DECLARANTE_CONTRATO (segundo escritor), vertical ausente o campos vacios → {status, error:{code, message, details?}}. Cierra el circulo de contrato-hecho-minimo.declarar.request. |
| `contabilidad.contrato_declarado` | Fire-and-forget (A11): una fuente declaro su minimo exigible → {project_id, contrato, vertical, version, correlation_id}. Lo LEEN la verificacion de la entrada y completitud-cobertura (A12) para saber que esperar de cada vertical. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `contrato-hecho-minimo.exigir.failed` cierra `exigir.request` y
> `contrato-hecho-minimo.declarar.failed` cierra `declarar.request`, cada uno
> cuando su proyección devuelve status ≠ 200.

> Nota: el módulo expone `contratoDe(pid, vertical)` como **lectura directa** para
> otras hojas del mismo proceso (no muta) — no es un evento del bus, no figura en
> `module.json`.

## Reglas de negocio

1. **Un solo escritor (guard de rol)**: `_declarar` exige
   `input.rol === 'DECLARANTE_CONTRATO'` (constante `ROL_ESCRITOR`). Cualquier otro
   rol → `403 PERMISSION_DENIED` con
   `{rol_esperado:'DECLARANTE_CONTRATO', rol_recibido:<rol>}`. Second-writer
   rechazado. `_exigir` **no** pasa por el guard (es lectura).
2. **Sin contrato declarado no se exige**: si `parcela.contratos` no tiene la
   `vertical`, `_exigir` devuelve `200 {declarado:false, contrato:null, campos:[],
   faltantes:[], completo:false, motivo:'la fuente no ha declarado aun su minimo'}`.
   No hay mínimo cableado.
3. **Verificación honesta**: con `hecho` presente, `faltantes` son los
   `contrato.campos` cuyo valor en el hecho es `undefined`, `null` o `''`. Nada se
   rellena. `evaluado:true` solo si llegó un hecho (objeto no-array); sin hecho,
   `faltantes:[]`, `evaluado:false` y `completo:false`.
4. **Append-only, versionado**: `_declarar` calcula
   `version = previo ? previo.version + 1 : 1`, apila `{campos, version, por, en}`
   en `historial` y fecha `declarado_en`/`actualizado_en`. `sobrescritura` es
   `true` si ya existía un contrato para esa vertical.
5. **Campos normalizados y no vacíos**: `campos` debe ser array no vacío; cada
   campo se normaliza con `String(campos[i]).trim()` y se filtran los vacíos. Array
   ausente/vacío → `400 INVALID_INPUT` (`field:'campos'`).
6. **Clave del store**: `Map<vertical, Contrato>` por proyecto; la vertical se
   normaliza con `String(vertical).trim()`.
7. **La lectura no muta**: `_exigir` obtiene o crea la parcela (`_obtenerOCrear`) y
   devuelve el contrato vigente sin tocarlo.
8. **`project_id` con fallback**: `input.project_id || this.project_id`.
9. **Validaciones deterministas**: `project_id` ausente → `400 INVALID_INPUT`
   (`field:'project_id'`); `vertical` vacía → `400 INVALID_INPUT`
   (`field:'vertical'`).
10. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura;
    restaura en `project.activated`; `flush()` + `detener()` en `onUnload`.
11. **HTTP exacto**: éxito `200`; rol inválido → `403`; campos inválidos → `400`;
    excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `contrato-hecho-minimo.exigir.response` y
`contrato-hecho-minimo.declarar.response`.

### 1. `declarar` — la fuente declara su mínimo (solo DECLARANTE_CONTRATO)

```json
{
  "project_id": "e57a318a-...",
  "rol": "DECLARANTE_CONTRATO",
  "vertical": "pizzepos",
  "campos": ["fecha", "importe", "moneda"],
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "contrato": { "vertical": "pizzepos", "campos": ["fecha", "importe", "moneda"], "version": 2, "declarado_por": "DECLARANTE_CONTRATO", "declarado_en": "2026-09-25T..." },
  "declarado": true,
  "sobrescritura": true
}
```
Emite `contabilidad.contrato_declarado`:
```json
{ "project_id": "e57a318a-...", "contrato": { "...": "..." }, "vertical": "pizzepos", "version": 2, "correlation_id": "abc-123" }
```

### 2. `exigir` — verificar el mínimo contra un hecho (no muta)

```json
{
  "project_id": "e57a318a-...",
  "vertical": "pizzepos",
  "hecho": { "fecha": "2026-09-01", "importe": 121 }
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "vertical": "pizzepos",
  "declarado": true,
  "contrato": { "vertical": "pizzepos", "campos": ["fecha", "importe", "moneda"], "version": 2, "declarado_por": "DECLARANTE_CONTRATO", "declarado_en": "2026-09-25T..." },
  "campos": ["fecha", "importe", "moneda"],
  "faltantes": ["moneda"],
  "completo": false,
  "evaluado": true
}
```

### 3. `exigir` sin contrato declarado

```json
{ "project_id": "e57a318a-...", "vertical": "otra-vertical" }
```
Respuesta `200` con `declarado:false`, `contrato:null`, `faltantes:[]`.

### 4. Fallo — rol inválido (segundo escritor)

```json
{ "project_id": "e57a318a-...", "rol": "OTRO", "vertical": "pizzepos", "campos": ["fecha"] }
```
Respuesta `403` + `contrato-hecho-minimo.declarar.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el declarante (DECLARANTE_CONTRATO) puede declarar el minimo de una fuente", "details": { "rol_esperado": "DECLARANTE_CONTRATO", "rol_recibido": "OTRO" } } }
```

### 5. Fallo — campos vacíos

```json
{ "project_id": "e57a318a-...", "rol": "DECLARANTE_CONTRATO", "vertical": "pizzepos", "campos": [] }
```
Respuesta `400` + `contrato-hecho-minimo.declarar.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "campos requerido", "details": { "field": "campos" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/contrato-hecho-minimo.test.js`.
Cubre:

- `declarar` con rol `DECLARANTE_CONTRATO` y campos → `200 {declarado:true}` con
  `version`, historial y emite `contabilidad.contrato_declarado`.
- Re-declarar → `version` incrementa, `sobrescritura:true`, historial append-only.
- `declarar` con otro rol → `403 PERMISSION_DENIED` +
  `contrato-hecho-minimo.declarar.failed`.
- `declarar` sin `vertical` o sin `campos` → `400 INVALID_INPUT`.
- `exigir` con hecho incompleto → `faltantes` con los campos ausentes (nada se
  rellena), `completo:false`, `evaluado:true`.
- `exigir` sin contrato declarado → `200 {declarado:false, faltantes:[]}`.
- `exigir` sin `project_id`/`vertical` → `400 INVALID_INPUT` +
  `contrato-hecho-minimo.exigir.failed`.
- `project.activated` restaura los contratos via PosPersistencia;
  `contratoDe(pid, vertical)` lee sin mutar.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `ContratoHechoMinimo extends ModuloHibridoReflejo`; `name =
  'contrato-hecho-minimo'`, `version = 'reflejo-0.1.0'`. Store en memoria
  `this._parcelas` (`Map<project_id, {esquema, contratos: Map<vertical, Contrato>}>`).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'contrato-hecho-minimo.json', dir: '/contabilidad/contrato-hecho-minimo',
  snapshot, hidratar })` desde `modules/contabilidad-entrada/contrato-hecho-minimo/`
  (DOS niveles → `../../_shared/pos-persistencia`). `onProjectActivated` →
  `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`.
- `onExigirRequest` delega en `_atender(e, 'exigir',
  'contrato-hecho-minimo.exigir.response', async (d) => {...})`;
  `onDeclararRequest` en `_atender(e, 'declarar',
  'contrato-hecho-minimo.declarar.response', ...)` y publica
  `contabilidad.contrato_declarado` si status 200.
- Proyecciones `_exigir` (lectura, no muta) y `_declarar` (escritura + guard);
  helper `_obtenerOCrear(pid)`. Lectura directa `contratoDe(pid, vertical)`.
  Tools `toolExigir` / `toolDeclarar`.
- `_invalid` / `_errorResponse` vienen de `modulo-hibrido-reflejo`.
- DEP hacia delante: lo leen la verificación de la entrada y
  `completitud-cobertura` (A12) para saber qué esperar de cada vertical.
