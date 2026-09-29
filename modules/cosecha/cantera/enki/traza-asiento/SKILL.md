---
name: traza-asiento
description: >
  Skill FULL del módulo CUSTODIO `traza-asiento` de la vertical contabilidad de Enki.
  EL REGISTRO INMUTABLE DE LA TRAZA — quién/cuándo creó cada asiento, APPEND-ONLY: el
  asiento original NUNCA se borra ni se muta y la corrección SUMA, con single-writer
  por la parcela libro/traza. Persiste por proyecto con PosPersistencia. Úsala para
  operar, depurar o extender el custodio, o para entender su contrato de eventos y sus
  reglas de negocio.
when-to-use: >
  - Cuando necesites registrar la marca de autoría de un asiento (RPC
    traza-asiento.registrar.request).
  - Cuando depures por qué no se registra la marca (403 PERMISSION_DENIED si el turno
    de libro/traza es de otro escritor, 400 INVALID_INPUT si falta project_id, asiento,
    numero o quien) o por qué no se duplica (`ya_existe`).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes de la traza (marca inmutable, append-only, un escrito por parcela).
  - Cuando vayas a escribir/ampliar el test unitario del custodio traza-asiento.
tags: [enki, modulo, custodio, contabilidad, traza-asiento]
---

# traza-asiento — CUSTODIO CON PERSISTENCIA de la traza

## Qué hace el módulo

`traza-asiento` es un **CUSTODIO CON PERSISTENCIA** (B4, hoja del plan): **EL REGISTRO
INMUTABLE DE LA TRAZA** — **quién/cuándo creó cada asiento**, **append-only**. El
asiento original **NUNCA** se borra ni se muta: si algo hay que corregir, se **AÑADE**
— **la corrección SUMA** (invariante 3: el asiento original no se borra; invariante 10:
los registros inmutables solo crecen). Esta marca es el rastro de **autoría** del
libro; **jamás un borrado**.

Es un **CUSTODIO con estado**: un **SINGLE-WRITER** por la parcela **`libro/traza`**.
Quien escribe **pide el turno** a `single-writer` (M2) **POR EVENTO** y **RESPETA su
GUARD**; si el turno es de otro, se **rechaza** (`403`): el segundo escritor **no
escribe**.

Invariantes:
- **La marca es INMUTABLE**: registrar **no edita** ninguna marca previa.
- **Un asiento puede tener varias marcas** (se **AÑADEN**: creaciones, correcciones,
  reaperturas). Un solo escritor por parcela.
- **Idempotencia por clave natural**: la misma marca (mismo asiento + mismo autor +
  mismo momento + mismo motivo) **NO** se duplica → `registrado:false`, `ya_existe:true`.

Persiste por proyecto con **PosPersistencia** (storage
`/contabilidad/traza-asiento/traza-asiento.json`), restaura en `project.activated` y
vuelca en `onUnload`. Proyección `_registrar`. Publica `contabilidad.traza_registrada`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `traza-asiento.registrar.request` | `onRegistrarRequest` | RPC custodio (escritura, APPEND-ONLY): {project_id, asiento:{numero\|clave_natural, ...}, quien, cuando?, motivo?='creacion', id?} → {project_id, marca:{id, numero_asiento, quien, cuando, motivo, ...}, registrado, aceptado, turno_confirmado} o idempotente {ya_existe:true, registrado:false} si la misma marca ya está. Rechaza (403) si el turno de la parcela libro/traza es de otro escritor; (400) si falta asiento/quien/numero. Exito → publica contabilidad.traza_registrada y responde por traza-asiento.registrar.response; fallo → traza-asiento.registrar.failed. |
| `contabilidad.asiento_registrado` | `onAsientoRegistrado` | Fire-and-forget (B2 → B4): el diario registró un asiento → se AÑADE su marca de creación (quien/cuando) de forma idempotente. La marca es un hecho NUEVO: no edita ninguna marca previa. Se ignora si el asiento ya existía (registrado:false). |
| `project.activated` | `onProjectActivated` | Restaura la traza (marcas append-only + índice por clave) del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `traza-asiento.registrar.response` | Respuesta RPC correlada de traza-asiento.registrar.request → {request_id, status:200, data:{marca, registrado, aceptado, turno_confirmado} \| {ya_existe:true, registrado:false}}. Emitida por el helper _atender. |
| `traza-asiento.registrar.failed` | Par de fallo determinista (B4): turno de la parcela libro/traza en otro escritor (403), asiento/quien/numero ausente (400), project_id ausente → {status, error:{code, message, details?}}. Cierra el círculo de traza-asiento.registrar.request. |
| `contabilidad.traza_registrada` | Fire-and-forget (B4): una marca de traza quedó registrada (append-only) → {project_id, marca, numero_asiento, quien, registrado, correlation_id}. Lo LEEN marca-borrador-validado (Q4) y la auditoría del libro. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `traza-asiento.registrar.failed` cierra el círculo de
> `traza-asiento.registrar.request` cuando `_registrar` devuelve status ≠ 200
> (`400`/`403`).

> Nota de honestidad (cruce con `index.js`): `onRegistrarRequest` publica
> `contabilidad.traza_registrada` **solo si `_registrar` devuelve `200`** — lo que
> incluye la rama **idempotente** (`registrado:false`, `ya_existe:true`); el payload
> lleva `registrado` distinguiendo si se apiló la marca o si ya estaba. La rama `else`
> publica `traza-asiento.registrar.failed`.

> Nota: el fire-and-forget `onAsientoRegistrado` **no** usa `_atender`: llama
> directamente a `_registrar({...})` construyendo la marca desde el asiento
> (`quien = asiento.escritor_id || d.escritor_id`, `cuando = asiento.registrado_en`,
> `motivo:'creacion'`) y devuelve el resultado como acuse. Si no hay `project_id`/`asiento`
> o llega `registrado:false`, devuelve `null` sin escribir.

> Nota: el módulo expone `marcasDe(pid)` como **lectura directa** para otras hojas del
> mismo proceso (no muta) — no es un evento del bus, no figura en `module.json`.

## Reglas de negocio

1. **La forma se valida primero**: `asiento` (`input.asiento || input.a`) debe ser
   objeto; su clave se toma de `clave_natural` o, en su defecto, de `numero`; sin
   ninguno de los dos → `400 INVALID_INPUT` (`field:'asiento.numero'`).
2. **El autor es obligatorio**: `quien` se normaliza con `String(...).trim()`; vacío →
   `400 INVALID_INPUT` (`field:'quien'`). Una marca sin autor no dice nada.
3. **Sellos de la marca**: `cuando = input.cuando ?? new Date().toISOString()`;
   `motivo = input.motivo ?? 'creacion'`; `registrado_en` se sella siempre con
   `new Date().toISOString()`.
4. **El turno se pide a `single-writer` (M2) por evento**: `_rpc(
   'single-writer.reclamar.request', {project_id, rol:'RECLAMANTE_ESCRITOR',
   parcela:'libro/traza', id:escritor_id}, {timeout_ms:4000})`. Si
   `turno_data.concedido === false` → `403 PERMISSION_DENIED` con
   `{parcela:'libro/traza', dueno, solicitante}`. Si el guard **no responde** (`null`)
   → `turno_confirmado:false` y se **sigue** (se declara, no se oculta).
   `escritor_id = input.id ?? 'RECLAMANTE_ESCRITOR'`.
5. **Idempotencia por clave natural de la marca**:
   `clave = ${clave_asiento}#${quien}#${cuando}#${motivo}`. Si ya está en `por_clave`
   → `200 {marca:<existente>, registrado:false, ya_existe:true, turno_confirmado}`.
   Reproducir una traza idéntica **no** duplica.
6. **APPEND-ONLY (invariante 10)**: la marca se **apila** con `id = marcas.length + 1`;
   se indexa `por_clave.set(clave, marca)`; la traza **solo crece**. Nunca se edita ni
   se borra una marca previa.
7. **La marca es un hecho NUEVO y completo**: `{id, clave, numero_asiento, clave_asiento,
   quien, cuando, rol:motivo, motivo, huella:clave_natural, registrado_en}`. `rol` se
   sella igual que `motivo` (compatibilidad).
8. **Un asiento puede acumular varias marcas**: como la clave incluye autor, momento y
   motivo, la misma base con distinto `motivo` (creación, corrección, reapertura) es una
   marca **distinta** que se **AÑADE**.
9. **`project_id` con fallback**: `input.project_id || this.project_id`.
10. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura;
    `project.activated` → `restaurar(project_id)` (reconstruye `por_clave` desde
    `marcas`); `onUnload` → `flush()` + `detener()`.
11. **La lectura no muta**: `marcasDe(pid)` devuelve las marcas del proyecto (o `[]`).
12. **HTTP exacto**: éxito `200` (con `registrado` true o false); `project_id`/`asiento`/
    `quien`/`numero` inválidos → `400`; turno ajeno → `403`; excepción en `_atender` →
    `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `traza-asiento.registrar.response` y emite `contabilidad.traza_registrada`.

### 1. `registrar` — añadir la marca de autoría (append-only)

```json
{
  "project_id": "e57a318a-...",
  "asiento": { "clave_natural": "pizzepos:venta:2026-09-01:0001", "numero": 1 },
  "quien": "asesor-a",
  "motivo": "creacion",
  "id": "escritor-a",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "marca": {
    "id": 1,
    "clave": "pizzepos:venta:2026-09-01:0001#asesor-a#2026-09-25T...:00.000Z#creacion",
    "numero_asiento": 1,
    "clave_asiento": "pizzepos:venta:2026-09-01:0001",
    "quien": "asesor-a",
    "cuando": "2026-09-25T...:00.000Z",
    "rol": "creacion",
    "motivo": "creacion",
    "huella": "pizzepos:venta:2026-09-01:0001",
    "registrado_en": "2026-09-25T...:01.000Z"
  },
  "registrado": true,
  "aceptado": true,
  "turno_confirmado": true
}
```

Emite `contabilidad.traza_registrada`:

```json
{ "project_id": "e57a318a-...", "marca": { "...": "..." }, "numero_asiento": 1, "quien": "asesor-a", "registrado": true, "correlation_id": "abc-123" }
```

### 2. Reproducir la misma marca — idempotente

Misma `clave` (mismo asiento + autor + momento + motivo) → Respuesta `200`:

```json
{ "project_id": "e57a318a-...", "marca": { "id": 1, "...": "..." }, "registrado": false, "ya_existe": true, "turno_confirmado": true }
```

La traza **no** duplica. Para **añadir** una marca nueva sobre el mismo asiento basta
con cambiar el `motivo` (p. ej. `'correccion'`) — la corrección **SUMA**.

### 3. Fire-and-forget — reacción a `contabilidad.asiento_registrado`

`onAsientoRegistrado` toma `d.asiento` y `d.project_id`; si el payload trae
`registrado:false` o falta el asiento, devuelve `null`. Si no, **AÑADE** la marca de
creación (`motivo:'creacion'`, `quien` desde el asiento, `cuando` desde
`registrado_en`) de forma idempotente y devuelve el resultado como acuse.

### 4. Fallo — el turno es de otro escritor

Si `single-writer.reclamar.request` responde `concedido:false`:
Respuesta `403` + `traza-asiento.registrar.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el escritor con el turno de la parcela de la traza puede registrar marcas", "details": { "parcela": "libro/traza", "dueno": "escritor-a", "solicitante": "escritor-b" } } }
```

### 5. Fallo — falta el autor

```json
{ "project_id": "e57a318a-...", "asiento": { "numero": 1 } }
```

Respuesta `400` + `traza-asiento.registrar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "quien requerido", "details": { "field": "quien" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/traza-asiento.test.js`. Cubre:

- `registrar` con asiento + autor → `200 {registrado:true}` con `marca` completa y
  emite `contabilidad.traza_registrada`.
- Reproducir la misma marca → `200 {registrado:false, ya_existe:true}` (no duplica).
- **Append-only**: dos marcas de motivos distintos sobre el mismo asiento → la traza
  tiene 2 marcas y la primera no se muta.
- Guard de turno: `concedido:false` → `403 PERMISSION_DENIED`; sin respuesta (null) →
  `turno_confirmado:false` y se registra.
- `asiento` sin `numero`/`clave_natural` → `400 INVALID_INPUT` (`field:'asiento.numero'`);
  `quien` vacío → `400` (`field:'quien'`); `project_id` ausente → `400`.
- `onAsientoRegistrado` añade la marca de creación idempotentemente; con
  `registrado:false` o sin asiento → `null`.
- `project.activated` restaura `marcas` + índice `por_clave`; `marcasDe(pid)` lee sin
  mutar.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `TrazaAsiento extends ModuloHibridoReflejo`; `name = 'traza-asiento'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._trazas`
  (`Map<project_id, {esquema, marcas:[append-only], por_clave: Map<clave, marca>}>`).
- Constantes: `PARCELA = 'libro/traza'`, `ROL_RECLAMANTE = 'RECLAMANTE_ESCRITOR'`.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'traza-asiento.json', dir: '/contabilidad/traza-asiento', snapshot, hidratar })` desde
  `modules/contabilidad-libro/traza-asiento/` (DOS niveles →
  `../../_shared/pos-persistencia`). `onProjectActivated` → `restaurar(project_id)`;
  `onUnload` → `flush()` + `detener()`; cada escritura `marcarDirty(pid)`.
- `onRegistrarRequest` usa `this._atender(e, 'registrar',
  'traza-asiento.registrar.response', async (d) => {...})`; dentro hace el cierre de
  círculo: en `200` publica `contabilidad.traza_registrada`, si no
  `traza-asiento.registrar.failed`. `onAsientoRegistrado` **no** usa `_atender`.
- Proyección única `_registrar(input)` (`async`: pide turno a M2 por evento) →
  `{status, data}`; helper `_obtenerOCrear(pid)`. Lectura directa `marcasDe(pid)`.
  Tool `toolRegistrar`.
- `_invalid` / `_errorResponse` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide `single-writer.reclamar.request` (M2) por evento; lo alimenta
  `contabilidad.asiento_registrado` (B2). Lo LEEN `marca-borrador-validado` (Q4) y la
  auditoría del libro vía `contabilidad.traza_registrada`.
