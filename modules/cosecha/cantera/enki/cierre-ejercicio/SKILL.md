---
name: cierre-ejercicio
description: >
  Skill FULL del módulo CUSTODIO `cierre-ejercicio` de la vertical contabilidad de Enki.
  EL CIERRE del ejercicio — IRREVERSIBLE salvo ajuste (el ajuste SUMA, no borra), un
  cierre = un asiento y single-writer por la parcela libro/cierre. Persiste por proyecto
  con PosPersistencia. Úsala para operar, depurar o extender el custodio, o para entender
  su contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites cerrar un ejercicio (RPC cierre-ejercicio.cerrar.request) o reabrirlo
    con un ajuste (RPC cierre-ejercicio.reabrir.request).
  - Cuando depures por qué un cierre se rechaza (403 PERMISSION_DENIED si el turno de
    libro/cierre es de otro escritor, 400 INVALID_INPUT si falta ejercicio, 422 si se
    reabre sin ajuste o el ajuste no entró, 404 si no hay cierre previo).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    invariantes del cierre (un cierre = un asiento, irreversible salvo ajuste, un escrito
    por parcela, lo abierto se declara).
  - Cuando vayas a escribir/ampliar el test unitario del custodio cierre-ejercicio.
tags: [enki, modulo, custodio, contabilidad, cierre-ejercicio]
---

# cierre-ejercicio — CUSTODIO CON PERSISTENCIA del cierre

## Qué hace el módulo

`cierre-ejercicio` es un **CUSTODIO CON PERSISTENCIA** (C4, hoja del plan): **EL
CIERRE.** Cierra el periodo con ajustes. Es **IRREVERSIBLE salvo ajuste** (invariante
12): reabrir **SOLO** con un `AsientoAjuste` — y el ajuste **SUMA**, no borra. El cierre
original queda **PRESERVADO** (append-only); una reapertura se **AÑADE** como marca,
**jamás** muta ni borra el cierre.

**Un CIERRE = UN ASIENTO**: la clave natural del cierre (`CIERRE|<ejercicio>`) gobierna
la idempotencia. Volver a cerrar el mismo ejercicio **NO** duplica: se devuelve el cierre
ya registrado (`cerrado:false`, `ya_cerrado:true`).

Depende de (**POR EVENTO**, nunca por import):
- `balance-situacion` (C1) y `cuenta-resultados` (C2) — de los que **LEE** los estados.
- `asiento-ajuste` (B5) — por donde los ajustes del cierre **ENTRAN** al libro (la
  corrección SUMA).

Si un estado no responde, se **declara** en `abierto` (no se finge el cierre completo).

Es un **CUSTODIO con estado**: un **SINGLE-WRITER** por la parcela **`libro/cierre`**. El
segundo escritor **no cierra** (`403`). Persiste por proyecto con **PosPersistencia**
(storage `/contabilidad/cierre-ejercicio/cierre-ejercicio.json`), restaura en
`project.activated` y vuelca en `onUnload`. Proyecciones `_cerrar` y `_reabrir`. Publica
`contabilidad.ejercicio_cerrado`.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `cierre-ejercicio.cerrar.request` | `onCerrarRequest` | RPC custodio (escritura, EL CIERRE): {project_id, ejercicio, ajustes?:[Asiento], escritor_id?} → {project_id, ejercicio, cierre:{activo, pasivo, patrimonio, cuadra, resultado, signo, ajustes, abierto, completo}, cerrado, ya_cerrado, clave_natural, abierto, completo, irreversible, turno_confirmado} o idempotente {ya_cerrado:true, cerrado:false} si el ejercicio ya está cerrado (un cierre = un asiento). Los ajustes del cierre ENTRAN por asiento-ajuste POR EVENTO (la corrección SUMA); los estados se LEEN de balance-situacion y cuenta-resultados POR EVENTO. Rechaza (403) si el turno de la parcela libro/cierre es de otro escritor; (400) si falta project_id/ejercicio. Exito → publica contabilidad.ejercicio_cerrado y responde por cierre-ejercicio.cerrar.response; fallo → cierre-ejercicio.cerrar.failed. |
| `cierre-ejercicio.reabrir.request` | `onReabrirRequest` | RPC custodio (escritura, reapertura): {project_id, ejercicio, ajuste:AsientoAjuste, motivo?, escritor_id?} → {project_id, ejercicio, reapertura, reabierto:true, cierre_preservado:true, clave_ajuste, ajuste_suma:true, turno_confirmado}. IRREVERSIBLE SALVO AJUSTE: sin asiento-ajuste se rechaza (422, reabrir_sin_ajuste); el ajuste entra por asiento-ajuste POR EVENTO y SUMA; el cierre NO se borra ni muta (se AÑADE la marca de reapertura). 404 si no hay cierre de ese ejercicio; 403 si el turno es de otro escritor. Responde por cierre-ejercicio.reabrir.response; fallo → cierre-ejercicio.reabrir.failed. |
| `project.activated` | `onProjectActivated` | Restaura los cierres y reaperturas (append-only + índice por ejercicio) del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `cierre-ejercicio.cerrar.response` | Respuesta RPC correlada de cierre-ejercicio.cerrar.request → {request_id, status:200, data:{cierre, cerrado, ya_cerrado, clave_natural, abierto, completo}} \| {status, error}. Emitida por el helper _atender. |
| `cierre-ejercicio.cerrar.failed` | Par de fallo determinista (C4): turno de la parcela libro/cierre en otro escritor (403), project_id/ejercicio ausente (400) → {status, error:{code, message, details?}}. Cierra el círculo de cierre-ejercicio.cerrar.request. |
| `cierre-ejercicio.reabrir.response` | Respuesta RPC correlada de cierre-ejercicio.reabrir.request → {request_id, status:200, data:{reapertura, reabierto:true, cierre_preservado:true, clave_ajuste, ajuste_suma}}. Emitida por el helper _atender. |
| `cierre-ejercicio.reabrir.failed` | Par de fallo determinista (C4): reapertura sin ajuste (422, irreversible salvo ajuste), ajuste de reapertura que no entro al libro (422), sin cierre previo (404), turno en otro escritor (403), project_id/ejercicio ausente (400) → {status, error:{code, message, details?}}. Cierra el círculo de cierre-ejercicio.reabrir.request. |
| `contabilidad.ejercicio_cerrado` | Fire-and-forget (C4): el ejercicio quedó cerrado (o ya lo estaba, idempotente) → {project_id, ejercicio, cierre, clave_natural, cerrado, ya_cerrado, correlation_id}. Lo LEE apertura-ejercicio (C5) para arrastrar los saldos al ejercicio nuevo, y los estados/auditoría. |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `cierre-ejercicio.cerrar.failed` cierra `cerrar.request` y
> `cierre-ejercicio.reabrir.failed` cierra `reabrir.request`, cada uno cuando su
> proyección devuelve status ≠ 200.

> Nota de honestidad (cruce con `index.js`): `onCerrarRequest` publica
> `contabilidad.ejercicio_cerrado` **siempre que `_cerrar` devuelve `200`** — lo que
> incluye el camino **idempotente** (`cerrado:false`, `ya_cerrado:true`); el payload
> lleva `ya_cerrado` distinguiendo si se cerró ahora o ya lo estaba. `onReabrirRequest`
> **no** publica evento de dominio en éxito (`contabilidad.ejercicio_cerrado` es solo del
> cierre): el ajuste que habilita la reapertura ya emite su propio evento
> (`contabilidad.asiento_ajuste_recibido`, B5); en fallo publica
> `cierre-ejercicio.reabrir.failed`.

> Nota: no figura en `module.json` pero lo **pide** `index.js` por evento:
> `single-writer.reclamar.request` (M2, guard de la parcela `libro/cierre`),
> `asiento-ajuste.entrar.request` (B5, tanto en cierre como en reapertura),
> `balance-situacion.calcular.request` (C1) y `cuenta-resultados.calcular.request` (C2).
> Son dependencias (DEP) por evento, no eventos emitidos.

> Nota: el módulo expone `cierreDe(pid, ejercicio)` como **lectura directa** para otras
> hojas del mismo proceso (no muta) — no es un evento del bus, no figura en
> `module.json`.

## Reglas de negocio

1. **Fallo determinista de la forma**: `_cerrar` y `_reabrir` toman `input.project_id ||
   this.project_id`; ausente → `400 INVALID_INPUT` (`field:'project_id'`). `ejercicio`
   vacío → `400 INVALID_INPUT` (`field:'ejercicio'`).
2. **El turno se pide a `single-writer` (M2) por evento**: `_rpc(
   'single-writer.reclamar.request', {project_id, rol:'RECLAMANTE_ESCRITOR', parcela:
   'libro/cierre', id:escritor_id}, {timeout_ms:4000})`. Si `turno_data.concedido ===
   false` → `403 PERMISSION_DENIED` con `{parcela:'libro/cierre', dueno, solicitante}`. Si
   el guard **no responde** (`null`) → `turno_confirmado:false` y se **sigue**.
3. **Un cierre = un asiento (idempotencia)**: `clave = CIERRE|<ejercicio>`; si
   `libro.por_ejercicio.has(ejercicio)` → `200 {cierre:<existente>, cerrado:false,
   ya_cerrado:true, clave_natural, turno_confirmado, motivo:'el ejercicio ya esta
   cerrado: un cierre = un asiento'}`. Volver a cerrar **no** duplica.
4. **Los ajustes ENTRAN por `asiento-ajuste` (B5) por evento**: por cada ajuste del input
   se hace `_rpc('asiento-ajuste.entrar.request', {project_id, ajuste, motivo:
   input.motivo ?? 'cierre_ejercicio', correlation_id}, {timeout_ms:4000})`; se registra
   `{clave_correccion, encaminado}` y se cuenta `ajustes_encaminados`. **La corrección
   SUMA: el original no se toca.**
5. **Los estados se LEEN por evento (no se recalculan)**: `balance-situacion.
   calcular.request` (C1) y `cuenta-resultados.calcular.request` (C2) con
   `{project_id, ejercicio}`. Si un estado **no** responde, se empuja su nombre a
   `abierto` (`'balance'` / `'resultado'`). **No se finge el cierre completo.**
6. **El cierre queda registrado (append-only, irreversible salvo ajuste)**: se apila
   `{numero = cierres.length + 1, clave_natural, ejercicio, activo, pasivo, patrimonio,
   cuadra, resultado, signo, ajustes, ajustes_encaminados, abierto, completo (= abierto
   vacío), escritor_id, cerrado_en}`. `numero` es de secuencia; `por_ejercicio.set(
   ejercicio, cierre)` indexa el cierre vigente.
7. **La respuesta declara la irreversibilidad**: `cerrado:true`, `ya_cerrado:false`,
   `clave_natural`, `ajustes_encaminados`, `abierto`, `completo`, `irreversible:true`,
   `turno_confirmado`.
8. **IRREVERSIBLE SALVO AJUSTE (invariante 12)**: `_reabrir` exige
   `input.ajuste || input.asiento_ajuste || (input.solo_con && input.solo_con.ajuste)`.
   Sin ajuste objeto → `422 PRECONDITION_FAILED` con `{ejercicio, motivo:
   'reabrir_sin_ajuste'}`. **Un cierre no se reabre sin ajuste.**
9. **Sin cierre previo no hay reapertura**: si `por_ejercicio` no tiene el ejercicio →
   `404 RESOURCE_NOT_FOUND` con `{ejercicio}`.
10. **El ajuste de reapertura debe ENTRAR al libro**: se envía por
    `asiento-ajuste.entrar.request`; si `!encaminado` → `422 PRECONDITION_FAILED` con
    `{ejercicio, motivo:'ajuste_no_encaminado'}` — **la reapertura NO se registra** (no se
    finge).
11. **APPEND-ONLY en la reapertura**: el cierre **NO** se borra ni se muta; se **AÑADE**
    una marca de reapertura `{numero = reaperturas.length + 1, ejercicio, clave_ajuste,
    motivo, ajuste_suma:true, cierre_preservado:true, escritor_id, reabierto_en}`. La
    respuesta declara `reabierto:true`, `cierre_preservado:true`, `ajuste_suma:true`.
12. **Guard de un solo escritor también en reabrir**: mismo `403` si el turno es ajeno.
13. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura;
    `project.activated` → `restaurar(project_id)` (reconstruye `por_ejercicio` desde
    `cierres`); `onUnload` → `flush()` + `detener()`.
14. **La lectura no muta**: `cierreDe(pid, ejercicio)` devuelve el cierre vigente o
    `null`.
15. **HTTP exacto**: éxito `200` (con `cerrado`/`ya_cerrado` o `reabierto`); `project_id`/
    `ejercicio` inválidos → `400`; turno ajeno → `403`; sin cierre → `404`; sin ajuste /
    ajuste no encaminado → `422`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `cierre-ejercicio.cerrar.response` y `cierre-ejercicio.reabrir.response`;
emite `contabilidad.ejercicio_cerrado`.

### 1. `cerrar` — cerrar el ejercicio (con ajustes)

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "ajustes": [ { "apuntes": [ { "cuenta": "629", "debe": 50, "haber": 0 }, { "cuenta": "400", "debe": 0, "haber": 50 } ], "base": { "clave_natural": "pizzepos:compra:2026-08-01:0001" } } ],
  "escritor_id": "escritor-a",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "cierre": {
    "numero": 1,
    "clave_natural": "CIERRE|2026",
    "ejercicio": "2026",
    "activo": 121,
    "pasivo": 121,
    "patrimonio": 0,
    "cuadra": true,
    "resultado": 71,
    "signo": "BENEFICIO",
    "ajustes": [ { "clave_correccion": "AJUSTE|pizzepos:compra:2026-08-01:0001|cierre_ejercicio|629:50.00:0.00,400:0.00:50.00", "encaminado": true } ],
    "ajustes_encaminados": 1,
    "abierto": [],
    "completo": true,
    "escritor_id": "escritor-a",
    "cerrado_en": "2026-12-31T...:00.000Z"
  },
  "cerrado": true,
  "ya_cerrado": false,
  "clave_natural": "CIERRE|2026",
  "ajustes_encaminados": [ { "clave_correccion": "AJUSTE|...", "encaminado": true } ],
  "abierto": [],
  "completo": true,
  "irreversible": true,
  "turno_confirmado": true
}
```

Emite `contabilidad.ejercicio_cerrado` (lo LEE `apertura-ejercicio` C5):

```json
{ "project_id": "e57a318a-...", "ejercicio": "2026", "cierre": { "...": "..." }, "clave_natural": "CIERRE|2026", "cerrado": true, "ya_cerrado": false, "correlation_id": "abc-123" }
```

Si un estado no responde, su nombre va en `abierto` (p. ej. `["balance"]`) y
`completo:false` — **se declara, no se oculta**.

### 2. Volver a cerrar el mismo ejercicio — idempotente

Mismo `ejercicio` → Respuesta `200` con `cerrado:false`, `ya_cerrado:true` y el cierre ya
registrado. **Un cierre = un asiento**: no duplica.

### 3. `reabrir` — reabrir SOLO con ajuste

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "ajuste": { "apuntes": [ { "cuenta": "629", "debe": 30, "haber": 0 }, { "cuenta": "400", "debe": 0, "haber": 30 } ], "base": { "clave_natural": "pizzepos:compra:2026-08-01:0001" } },
  "motivo": "reapertura",
  "escritor_id": "escritor-a"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "ejercicio": "2026",
  "reapertura": { "numero": 1, "ejercicio": "2026", "clave_ajuste": "AJUSTE|...", "motivo": "reapertura", "ajuste_suma": true, "cierre_preservado": true, "escritor_id": "escritor-a", "reabierto_en": "2026-12-31T...:00.000Z" },
  "reabierto": true,
  "cierre_preservado": true,
  "clave_ajuste": "AJUSTE|...",
  "ajuste_suma": true,
  "turno_confirmado": true
}
```

El cierre **NO** se borra ni se muta: se **AÑADE** la marca de reapertura. En éxito, la
reapertura **no** publica evento de dominio (lo hace el ajuste por B5).

### 4. Fallo — reabrir sin ajuste (irreversible salvo ajuste)

```json
{ "project_id": "e57a318a-...", "ejercicio": "2026" }
```

Respuesta `422` + `cierre-ejercicio.reabrir.failed`:

```json
{ "status": 422, "error": { "code": "PRECONDITION_FAILED", "message": "un cierre no se reabre sin ajuste: el cierre es irreversible salvo ajuste (AsientoAjuste)", "details": { "ejercicio": "2026", "motivo": "reabrir_sin_ajuste" } } }
```

### 5. Fallo — no hay cierre previo

Respuesta `404 RESOURCE_NOT_FOUND` con `{ejercicio}`. Si el ajuste de reapertura no entró
al libro → `422` con `{motivo:'ajuste_no_encaminado'}`.

### 6. Fallo — el turno es de otro escritor

Si `single-writer.reclamar.request` responde `concedido:false`:
Respuesta `403` + el par `failed` correspondiente:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el escritor con el turno de la parcela del cierre puede cerrar el ejercicio", "details": { "parcela": "libro/cierre", "dueno": "escritor-a", "solicitante": "escritor-b" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/cierre-ejercicio.test.js`. Cubre:

- `cerrar` con rol/turno libre → `200 {cerrado:true}` con `cierre` (activo/pasivo/
  patrimonio/resultado/signo) leídos por evento de C1/C2 y emite
  `contabilidad.ejercicio_cerrado`.
- `cerrar` con ajustes → los ajustes entran por `asiento-ajuste.entrar.request`
  (`ajustes_encaminados`) sin tocar el original.
- Volver a cerrar el mismo ejercicio → `200 {cerrado:false, ya_cerrado:true}` (un cierre =
  un asiento, no duplica).
- Estado que no responde → su nombre en `abierto`, `completo:false` (se declara).
- Guard de turno: `concedido:false` → `403 PERMISSION_DENIED`; sin respuesta (null) →
  `turno_confirmado:false` y se cierra.
- `reabrir` con ajuste → `200 {reabierto:true, cierre_preservado:true, ajuste_suma:true}`
  y se **AÑADE** la marca (el cierre no se muta).
- `reabrir` sin ajuste → `422` (`motivo:'reabrir_sin_ajuste'`); ajuste no encaminado →
  `422` (`motivo:'ajuste_no_encaminado'`); sin cierre previo → `404`.
- `project_id`/`ejercicio` ausentes → `400 INVALID_INPUT`.
- `project.activated` restaura `cierres` + `reaperturas`; `cierreDe(pid, ejercicio)` lee
  sin mutar.
- `toolCerrar` / `toolReabrir` devuelven la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `CierreEjercicio extends ModuloHibridoReflejo`; `name = 'cierre-ejercicio'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._libros` (`Map<project_id,
  {esquema, cierres:[append-only], por_ejercicio: Map<ejercicio, cierre>,
  reaperturas:[append-only]}>`).
- Constantes: `PARCELA = 'libro/cierre'`, `ROL_RECLAMANTE = 'RECLAMANTE_ESCRITOR'`.
- **PosPersistencia**: `_persist = new PosPersistencia({ modulo, file:
  'cierre-ejercicio.json', dir: '/contabilidad/cierre-ejercicio', snapshot, hidratar })`
  desde `modules/contabilidad-libro/cierre-ejercicio/` (DOS niveles →
  `../../_shared/pos-persistencia`). `onProjectActivated` → `restaurar(project_id)`;
  `onUnload` → `flush()` + `detener()`; cada escritura `marcarDirty(pid)`.
- `onCerrarRequest` usa `this._atender(e, 'cerrar', 'cierre-ejercicio.cerrar.response',
  async (d) => {...})`; dentro publica `contabilidad.ejercicio_cerrado` en `200` (incluye
  el idempotente), si no `cierre-ejercicio.cerrar.failed`. `onReabrirRequest` usa
  `_atender(e, 'reabrir', 'cierre-ejercicio.reabrir.response', ...)` y solo publica
  `cierre-ejercicio.reabrir.failed` si status ≠ 200.
- Proyecciones `_cerrar(input)` y `_reabrir(input)` (`async`: piden turno a M2 y consultan
  B5/C1/C2 por evento); helper `_obtenerOCrear(pid)`. Lectura directa `cierreDe(pid,
  ejercicio)`. Tools `toolCerrar` / `toolReabrir`.
- `_invalid` / `_errorResponse` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide `single-writer.reclamar.request` (M2), `asiento-ajuste.entrar.request` (B5),
  `balance-situacion.calcular.request` (C1) y `cuenta-resultados.calcular.request` (C2)
  por evento. Lo LEE `apertura-ejercicio` (C5) vía `contabilidad.ejercicio_cerrado`.
