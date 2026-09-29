---
name: escritor-diario
description: >
  Skill FULL del módulo CUSTODIO `escritor-diario` de la vertical contabilidad de
  Enki. EL único escritor del diario — la partida doble cuadra (Σ debe = Σ haber) o
  el asiento se rechaza antes de escribir; un hecho = un asiento por clave natural
  y respeta el guard de single-writer. Persiste por proyecto con PosPersistencia.
  Úsala para operar, depurar o extender el custodio, o para entender su contrato de
  eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites asentar un Asiento en el diario
    (RPC escritor-diario.asentar.request).
  - Cuando depures por qué un asiento se rechaza (422 PRECONDITION_FAILED por
    descuadre de partida doble o apuntes vacíos/malformados, 403 PERMISSION_DENIED
    si el turno de la parcela libro/diario es de otro escritor, 400 INVALID_INPUT si
    falta project_id o asiento) o por qué no se duplica (ya_existe).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del libro (la partida doble cuadra, un hecho = un asiento,
    append-only, un solo escritor, la ley entra como dato).
  - Cuando vayas a escribir/ampliar el test unitario del custodio escritor-diario.
tags: [enki, modulo, custodio, contabilidad, escritor-diario]
---

# escritor-diario — CUSTODIO CON PERSISTENCIA del libro

## Qué hace el módulo

`escritor-diario` es un **CUSTODIO CON PERSISTENCIA** (B2, hoja del plan): **ES EL
CUSTODIO DEL LIBRO** — el **ÚNICO ESCRITOR DEL DIARIO**. Recibe un Asiento
`{apuntes, clave_natural, fecha, sociedad, ...}` y lo **asienta** — o lo **RECHAZA**.
Nada intermedio.

- **Invariante 1 — LA PARTIDA DOBLE CUADRA**: **Σ debe = Σ haber**. Un descuadre
  **NO** es un estado del libro: es un **ERROR**. El asiento se **RECHAZA ANTES DE
  ESCRIBIR** (no se matiza, no se apila un asiento torcido). Esta comprobación es la
  puerta: si no pasa, no hay escritura.
- **Invariante 2 — UN HECHO = UN ASIENTO**: la clave natural (`clave-natural` M3,
  consultada **por evento**) gobierna la idempotencia. Reproducir el mismo hecho
  **NO** duplica (se devuelve el asiento ya escrito: `registrado:false`,
  `ya_existe:true`).
- **Invariante 4 — UN SOLO ESCRITOR**: pide el turno de la parcela `libro/diario` a
  `single-writer` (M2) **por evento** y **RESPETA su GUARD**; si el turno es de otro
  → `403`. Si el guard no responde se declara `turno_confirmado:false` y se sigue (no
  se bloquea el libro por un timeout, no se oculta).
- **Invariante 3 — APPEND-ONLY**: el diario solo **CRECE**; no se borra ni reescribe
  un asiento (las correcciones SUMAN: `hecho-rectificativo` A13, `asiento-ajuste` B5).
- **Invariante 5 — LA LEY ENTRA COMO DATO**: no se cablea ninguna cuenta ni tipo
  legal; solo se valida la **FORMA** (cuadre + apuntes).

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/escritor-diario/escritor-diario.json`), restaura en `project.activated`
y vuelca en `onUnload`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `escritor-diario.asentar.request` | `onAsentarRequest` | RPC custodio (escritura, UNICO ESCRITOR del diario): {project_id, asiento:{apuntes:[{cuenta, debe, haber}], clave_natural?, fecha?, sociedad?, escritor_id?}} → {asiento:{numero, clave_natural, apuntes, suma_debe, suma_haber, cuadra:true, ...}, registrado, aceptado, turno_confirmado} o bien idempotente {ya_existe:true, registrado:false} si la clave natural ya esta en el diario. RECHAZA ANTES DE ESCRIBIR si Σ debe != Σ haber (422 PRECONDITION_FAILED, descuadre_partida_doble), si no hay apuntes/malformados (422), o si el turno de la parcela libro/diario es de otro escritor (403, guard single-writer). Exito → publica contabilidad.asiento_registrado y responde por escritor-diario.asentar.response; fallo → escritor-diario.asentar.failed. |
| `project.activated` | `onProjectActivated` | Restaura el diario (asientos append-only + indice por clave natural) del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `escritor-diario.asentar.response` | Respuesta RPC correlada de escritor-diario.asentar.request → {request_id, status:200, data:{asiento, registrado, aceptado, turno_confirmado} \| {ya_existe:true, registrado:false}}. Emitida por el helper _atender. |
| `escritor-diario.asentar.failed` | Par de fallo determinista (B2): descuadre de partida doble (Σ debe != Σ haber → 422, ES un error no un estado), asiento sin apuntes o apunte malformado (422), turno de la parcela en otro escritor (403) o project_id/asiento ausente (400) → {status, error:{code, message, details?}}. Cierra el circulo de escritor-diario.asentar.request. |
| `contabilidad.asiento_registrado` | Fire-and-forget (B2): un asiento quedo en el diario (registrado:true) o ya estaba por su clave natural (registrado:false, un hecho = un asiento) → {project_id, asiento, numero, clave_natural, registrado, correlation_id}. Lo LEEN los derivados del libro (mayor-balanza B3, estados, tesoreria) y traza-asiento (B4). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `escritor-diario.asentar.failed` cierra el círculo de
> `escritor-diario.asentar.request` cuando `_asentar` devuelve status ≠ 200
> (`400`/`403`/`422`).

> Nota de honestidad (cruce con `index.js`): `onAsentarRequest` publica
> `contabilidad.asiento_registrado` **siempre que `_asentar` devuelve `200`**,
> incluido el camino **idempotente** (`registrado:false`, `ya_existe:true`). El
> payload lleva `registrado` distinguiendo si se apiló o si ya estaba.

> Nota: `_asentar` acepta además el alias `input.a` como sinónimo de
> `input.asiento`, y toma el escritor como `asiento.escritor_id ||
> input.escritor_id || 'RECLAMANTE_ESCRITOR'` (no figura en `module.json`, lo
> implementa `index.js`).

> Nota: el módulo expone `asientosDe(pid)` como **lectura directa** para otras hojas
> del mismo proceso (no muta) — no es un evento del bus, no figura en `module.json`.

## Reglas de negocio

1. **La forma se valida primero**: `apuntes` debe ser array no vacío; cada apunte
   debe ser objeto con `cuenta` no vacía y `debe`/`haber` numéricos válidos. Un
   asiento sin apuntes → `422 PRECONDITION_FAILED`
   `{motivo:'apuntes_vacios'}`; un apunte malformado o sin cuenta → `422`; importe
   inválido (`_num` no finito) → `422`.
2. **`_num(v)`**: `undefined`/`null`/`''` → `0`; si `Number(v)` no es finito →
   `null` (inválido). Los apuntes normalizados guardan `{cuenta, debe, haber}`.
3. **La partida doble cuadra o es un error**: con `suma_debe = round(Σ debe, 2)` y
   `suma_haber = round(Σ haber, 2)`, si `|round(suma_debe - suma_haber, 2)| >
   TOLERANCIA(0.01)` → `422 PRECONDITION_FAILED` con
   `{suma_debe, suma_haber, descuadre, motivo:'descuadre_partida_doble'}`. **Se
   rechaza ANTES de escribir**.
4. **El turno se pide a `single-writer` (M2) por evento**: `_rpc(
   'single-writer.reclamar.request', {project_id, rol:'RECLAMANTE_ESCRITOR',
   parcela:'libro/diario', id:escritor_id}, {timeout_ms:4000})`. Si
   `turno_data.concedido === false` → `403 PERMISSION_DENIED` con
   `{parcela:'libro/diario', dueno, solicitante}`. Si el guard **no responde**
   (`null`) → `turno_confirmado:false` y se **sigue** (no se bloquea el libro por un
   timeout; se declara, no se oculta).
5. **Un hecho = un asiento (idempotencia)**: la clave natural se toma de
   `asiento.clave_natural` o se pide a `clave-natural.calcular.request`
   (`{project_id, hecho:a}`, `timeout_ms:4000`). Si la clave ya está en `por_clave`,
   devuelve `200 {asiento:<existente>, registrado:false, ya_existe:true,
   turno_confirmado, motivo:'la clave natural ya esta en el diario: un hecho = un
   asiento'}`. Sin clave no hay idempotencia ni índice.
6. **Append-only**: el asiento se apila con `numero = asientos.length + 1` y
   `descuadre:0`, `cuadra:true`. Con clave, se indexa `por_clave.set(clave, numero)`.
   El diario nunca muta asientos previos.
7. **La ley entra como DATO**: no se valida ninguna cuenta ni tipo legal, solo la
   forma. Los campos del asiento (`fecha`, `sociedad`, `concepto`, `traza`) se
   normalizan a String/objeto o quedan `null`.
8. **Orden estricto de comprobaciones**: forma (`422`) → cuadre (`422`) → turno
   (`403`) → clave/idempotencia → append. El descuadre se detecta **antes** de pedir
   el turno.
9. **`project_id` con fallback**: `input.project_id || this.project_id`.
10. **Validaciones deterministas**: `project_id` ausente → `400 INVALID_INPUT`
    (`field:'project_id'`); `asiento` ausente/no objeto → `400 INVALID_INPUT`
    (`field:'asiento'`).
11. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura;
    restaura en `project.activated` (reconstruye `por_clave` desde `asientos`);
    `flush()` + `detener()` en `onUnload`.
12. **HTTP exacto**: éxito `200`; `project_id`/`asiento` ausente → `400`; turno
    ajeno → `403`; descuadre/apuntes inválidos → `422`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `escritor-diario.asentar.response` y emite `contabilidad.asiento_registrado`.

### 1. `asentar` — asentar un asiento que cuadra

```json
{
  "project_id": "e57a318a-...",
  "asiento": {
    "clave_natural": "pizzepos:venta:2026-09-01:0001",
    "fecha": "2026-09-01",
    "sociedad": "S1",
    "concepto": "venta",
    "apuntes": [
      { "cuenta": "430", "debe": 121, "haber": 0 },
      { "cuenta": "700", "debe": 0, "haber": 121 }
    ],
    "escritor_id": "escritor-a"
  },
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "asiento": { "numero": 1, "clave_natural": "pizzepos:venta:2026-09-01:0001", "fecha": "2026-09-01", "sociedad": "S1", "concepto": "venta", "apuntes": [ { "cuenta": "430", "debe": 121, "haber": 0 }, { "cuenta": "700", "debe": 0, "haber": 121 } ], "suma_debe": 121, "suma_haber": 121, "descuadre": 0, "cuadra": true, "escritor_id": "escritor-a", "traza": null, "registrado_en": "2026-09-25T..." },
  "registrado": true,
  "aceptado": true,
  "turno_confirmado": true
}
```
Emite `contabilidad.asiento_registrado`:
```json
{ "project_id": "e57a318a-...", "asiento": { "...": "..." }, "numero": 1, "clave_natural": "pizzepos:venta:2026-09-01:0001", "registrado": true, "correlation_id": "abc-123" }
```

### 2. Reproducir el mismo hecho — idempotente

Mismo `clave_natural` → Respuesta `200`:
```json
{ "project_id": "e57a318a-...", "asiento": { "numero": 1, "...": "..." }, "registrado": false, "ya_existe": true, "turno_confirmado": true, "motivo": "la clave natural ya esta en el diario: un hecho = un asiento" }
```
El diario **no** duplica.

### 3. Fallo — el asiento no cuadra (descuadre = error)

```json
{ "project_id": "e57a318a-...", "asiento": { "apuntes": [ { "cuenta": "430", "debe": 121, "haber": 0 }, { "cuenta": "700", "debe": 0, "haber": 100 } ] } }
```
Respuesta `422` + `escritor-diario.asentar.failed` (RECHAZO ANTES DE ESCRIBIR):
```json
{ "status": 422, "error": { "code": "PRECONDITION_FAILED", "message": "el asiento no cuadra: suma debe != suma haber (la partida doble cuadra o es un error)", "details": { "suma_debe": 121, "suma_haber": 100, "descuadre": 21, "motivo": "descuadre_partida_doble" } } }
```

### 4. Fallo — asiento sin apuntes

```json
{ "project_id": "e57a318a-...", "asiento": { "apuntes": [] } }
```
Respuesta `422` + `escritor-diario.asentar.failed`:
```json
{ "status": 422, "error": { "code": "PRECONDITION_FAILED", "message": "un asiento sin apuntes no es un asiento", "details": { "motivo": "apuntes_vacios" } } }
```

### 5. Fallo — el turno es de otro escritor

Si `single-writer.reclamar.request` responde `concedido:false`:
Respuesta `403` + `escritor-diario.asentar.failed`:
```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el escritor con el turno de la parcela puede asentar en el diario", "details": { "parcela": "libro/diario", "dueno": "escritor-a", "solicitante": "escritor-b" } } }
```

### 6. Fallo — falta el asiento

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `400` + `escritor-diario.asentar.failed`:
```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "asiento requerido", "details": { "field": "asiento" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/escritor-diario.test.js`. Cubre:

- `asentar` con apuntes que cuadran → `200 {registrado:true}` con `cuadra:true`,
  `numero` de secuencia y emite `contabilidad.asiento_registrado`.
- `asentar` con descuadre (Σ debe != Σ haber) → `422 PRECONDITION_FAILED`
  (`motivo:'descuadre_partida_doble'`) y **no** escribe nada.
- `asentar` sin apuntes o con apunte malformado/sin cuenta/importe inválido → `422`.
- Reproducir la misma clave natural → `200 {registrado:false, ya_existe:true}` (un
  hecho = un asiento, no duplica).
- Guard de turno: `single-writer.reclamar.request` con `concedido:false` → `403`
  `PERMISSION_DENIED`; sin respuesta (null) → `turno_confirmado:false` y se asienta.
- `asiento` ausente/no objeto → `400 INVALID_INPUT`; `project_id` ausente → `400`.
- Clave natural calculada por M3 cuando no se declara.
- `project.activated` restaura asientos + índice `por_clave`; append-only verificado
  (los asientos previos no se mutan).

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `EscritorDiario extends ModuloHibridoReflejo`; `name = 'escritor-diario'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._libros`
  (`Map<project_id, {esquema, asientos:[append-only], por_clave: Map<clave, numero>}>`).
- Constantes: `PARCELA = 'libro/diario'`, `ROL_RECLAMANTE = 'RECLAMANTE_ESCRITOR'`,
  `TOLERANCIA = 0.01` (centimo).
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'escritor-diario.json', dir: '/contabilidad/escritor-diario', snapshot, hidratar })`
  desde `modules/contabilidad-libro/escritor-diario/` (DOS niveles →
  `../../_shared/pos-persistencia`). `onProjectActivated` → `restaurar(project_id)`
  (rehidrata `asientos` y reconstruye `por_clave`); `onUnload` → `flush()` +
  `detener()`.
- `onAsentarRequest` usa `this._atender(e, 'asentar',
  'escritor-diario.asentar.response', async (d) => {...})`; dentro publica
  `contabilidad.asiento_registrado` si status 200 (incluye el idempotente), si no
  `escritor-diario.asentar.failed`. `onProjectActivated` restaura.
- Proyección única `_asentar(input)` (`async`: pide turno a M2 y clave a M3 por
  evento) → `{status, data}`; helper `_num(v)`, `_round(x, 2)`,
  `_obtenerOCrear(pid)`. Lectura directa `asientosDe(pid)`. Tool `toolAsentar`.
- `_invalid` / `_errorResponse` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide `single-writer.reclamar.request` (M2) y `clave-natural.calcular.request`
  (M3) por evento; lo LEEN los derivados del libro (`mayor-balanza` B3, estados,
  tesorería) y `traza-asiento` (B4) vía `contabilidad.asiento_registrado`; las
  correcciones llegan por `hecho-rectificativo` (A13) / `asiento-ajuste` (B5).
