---
name: flujo-firma
description: >
  Skill FULL del módulo CUSTODIO `flujo-firma` de la vertical contabilidad de Enki.
  LA PARCELA DE ESTADO REVISADO/FIRMADO DEL ASESOR: el sistema ARMA la solicitud de firma
  y la entrega por la capa de avisos, pero la FIRMA la pone EL ASESOR — el sistema NO firma
  y NO decide. Si la solicitud vence sin firma → EXPIRA y se RE-PREGUNTA, jamás asume el
  silencio. Append-only, un solo escritor por la parcela libro/firma. Persiste por proyecto
  con PosPersistencia. Úsala para operar, depurar o extender el custodio, o para entender su
  contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites armar una solicitud de firma o registrar la firma del asesor (RPC
    flujo-firma.firmar.request), o consultar el estado de un ámbito (RPC
    flujo-firma.estado.request).
  - Cuando depures por qué se rechaza una firma (403 PERMISSION_DENIED si el rol no es ASESOR
    —el sistema NO firma— o si el turno de libro/firma es de otro), por qué un ámbito queda
    EXPIRADA con `re_preguntada:true`, o por qué falta ámbito/project_id (400 INVALID_INPUT).
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las invariantes
    del custodio (append-only, no firma, vence → expira y re-pregunta, un solo escritor).
  - Cuando vayas a escribir/ampliar el test unitario del custodio flujo-firma.
tags: [enki, modulo, custodio, contabilidad, flujo-firma]
---

# flujo-firma — CUSTODIO CON PERSISTENCIA de la firma del asesor

## Qué hace el módulo

`flujo-firma` es un **CUSTODIO CON PERSISTENCIA** (L3, hoja del plan): **LA PARCELA DE
ESTADO REVISADO/FIRMADO DEL ASESOR**.

> 🔴 **EL SISTEMA NO FIRMA Y NO DECIDE.** Este custodio **ARMA** y (a través de la capa de
> avisos) **ENTREGA** la **SOLICITUD** de firma al asesor; la **FIRMA la pone EL ASESOR**. Un
> intento de firmar con un rol que **no sea el del asesor** (el del **SISTEMA** incluido) se
> **RECHAZA** (`403`): el sistema **jamás firma** en nombre de nadie.

> 🔴 **SI VENCE SIN FIRMA → EXPIRA Y SE RE-PREGUNTA, JAMÁS ASUME.** Una solicitud cuya
> validez declarada pasa sin firma **NO** se da por firmada ni por rechazada: se marca
> **EXPIRADA** y se **ARMA una solicitud NUEVA** (`re_preguntada:true`). La ausencia de firma
> **NUNCA** se interpreta como un sí. La validez es **DECLARABLE** (`vence_en` ISO o
> `validez_ms`): **sin validez declarada la solicitud NO vence** y se declara (cero plazos
> cableados).

**DOS CAMINOS en `firmar`, jamás confundidos**:

- **CON `asesor`** → **REGISTRA** la firma del asesor (guards de rol y de escritor).
- **SIN `asesor`** → el **SISTEMA ARMA** la solicitud (pregunta) y **NO firma**.

Invariantes:

- **APPEND-ONLY**: la firma se **AÑADE**; una firma previa **no se borra ni se muta**. Un
  ámbito puede tener **varias firmas** (revisiones sucesivas); la **VIGENTE es la última**.
- **UN SOLO ESCRITOR** por la parcela **`libro/firma`**: se pide el turno a `single-writer`
  (M2) **POR EVENTO** y se **RESPETA** su GUARD (`403` si el turno es de otro; si el guard no
  responde, se declara `turno_confirmado:false` y se sigue).
- El **ÁMBITO es DECLARABLE** (periodo/estado/documento — **[ABIERTO]**: no hay ámbitos
  cableados). El **DESTINATARIO** de la pregunta también es declarable (sin declarar →
  `null`).
- **Persiste** por proyecto con **PosPersistencia** (storage
  `/contabilidad/flujo-firma/flujo-firma.json`), **restaura** en `project.activated` y
  **vuelca** en `onUnload`.

Proyecciones `_firmar` y `_estado`. Publica `contabilidad.firma_registrada` (solo con firma
**REAL** del asesor).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `flujo-firma.firmar.request` | `onFirmarRequest` | RPC custodio (ARMAR o REGISTRAR, nunca confundidos): {project_id, ambito, asesor?, marca?, decision?, comentario?, rol?, id?, vence_en?, validez_ms?, asunto?, alcance?, motivo?, destinatario?}. CON `asesor` → REGISTRA la firma del asesor (append-only) con guard de rol (403 si `rol` != ASESOR: el sistema NO firma) y guard de escritor (single-writer, parcela libro/firma) → {firma, registrada:true, firmada:true, firma_del_sistema:false, turno_confirmado}. SIN `asesor` → el SISTEMA ARMA la solicitud de firma (validez declarable) → {solicitud, armada:true, registrada:false, firma_del_sistema:false}. Solo la firma REAL publica contabilidad.firma_registrada. Responde por flujo-firma.firmar.response; fallo (ambito/project_id ausente, rol no-asesor, turno ajeno) → flujo-firma.firmar.failed. |
| `flujo-firma.estado.request` | `onEstadoRequest` | RPC custodio (LECTURA, EXIGE estado): {project_id, ambito, ahora?} → {project_id, ambito, revisado, estado:'FIRMADA'\|'PENDIENTE'\|'EXPIRADA'\|'SIN_SOLICITUD', firma, firma_del_sistema:false, firma_por:'asesor', solicitud, vencida, re_preguntada, abierto}. SI LA SOLICITUD VENCIO SIN FIRMA → estado 'EXPIRADA' + re_preguntada:true y se ARMA una solicitud NUEVA (jamas se asume el silencio como firma). Responde por flujo-firma.estado.response; fallo → flujo-firma.estado.failed. |
| `project.activated` | `onProjectActivated` | Restaura las firmas (append-only) y las solicitudes del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `flujo-firma.firmar.response` | Respuesta RPC correlada de flujo-firma.firmar.request → {request_id, status:200, data:{firma, registrada, firmada, armada, firma_por:'asesor', firma_del_sistema:false, turno_confirmado} \| {solicitud, armada:true, registrada:false}}. Emitida por el helper _atender. |
| `flujo-firma.firmar.failed` | Par de fallo determinista (L3): ambito o project_id ausente (400), quien pretende firmar NO es el asesor (403 PERMISSION_DENIED — EL SISTEMA NO FIRMA) o el turno de la parcela libro/firma es de otro (403) → {status, error:{code, message, details?}}. Cierra el circulo de flujo-firma.firmar.request. |
| `flujo-firma.estado.response` | Respuesta RPC correlada de flujo-firma.estado.request → {request_id, status:200, data:{revisado, estado, firma, solicitud, vencida, re_preguntada, abierto}}. Emitida por el helper _atender. |
| `flujo-firma.estado.failed` | Par de fallo determinista (L3): ambito o project_id ausente → {status, error:{code, message, details?}}. Cierra el circulo de flujo-firma.estado.request. |
| `contabilidad.firma_registrada` | Fire-and-forget (L3): una firma REAL DEL ASESOR quedo registrada (append-only) → {project_id, ambito, firma, asesor, marca, correlation_id}. Solo se emite con firma puesta por el asesor; el sistema nunca lo emite por su cuenta. Lo LEEN marca-borrador-validado (Q4) y cambio-desde-ultima-revision (L9). |

> **Regla de cierre de círculo**: cada flujo responde su par `*.failed` canónico.
> Aquí `flujo-firma.firmar.failed` cierra el círculo de `flujo-firma.firmar.request` y
> `flujo-firma.estado.failed` el de `flujo-firma.estado.request`, cada uno cuando su
> proyección devuelve status ≠ 200 (`400`/`403`).

> Nota de honestidad (cruce con `index.js`): `onFirmarRequest` publica
> `contabilidad.firma_registrada` **solo si `res.data.registrada === true`** — es decir, **solo
> con firma REAL** del asesor. La rama de **armado** (sin `asesor`) devuelve `registrada:false`
> y **no** emite el evento de dominio (aunque sí responde por el par `response`). La rama
> `else` (`status` ≠ 200) publica `flujo-firma.firmar.failed`.

> Nota: el custodio expone `estadoDe(pid, ambito)` como **lectura directa** para otras hojas
> del mismo proceso (no muta) — no es un evento del bus, no figura en `module.json`.

## Reglas de negocio

1. **El ámbito es obligatorio**: `input.ambito` recortado (`String(...).trim()`); vacío →
   `400 INVALID_INPUT` (`field:'ambito'`). El ámbito es **declarable** (periodo/estado/
   documento, **[ABIERTO]**): **no hay ámbitos cableados**.
2. **Dos caminos por la presencia de `asesor`**: si `asesor` está ausente/`null`/vacío →
   `_armar`; si viene no vacío → `_registrarFirma`. **Jamás se confunden.**
3. **ARMAR (el sistema pregunta, NO firma)**: construye la solicitud
   `{id:'solicitud_<pid>_<ambito>_<iso>', ambito, asunto, alcance, motivo, destinatario,
   destinatario_declarado, vence_en, validez_ms, estado:'PENDIENTE', armada_en,
   correlation_id}`; la apila en `solicitudes` (append-only) y marca `dirty`. Devuelve
   `{solicitud, registrada:false, firmada:false, armada:true, firma_por:'asesor',
   firma_del_sistema:false, abierto:{destinatario, vence_en}}`. **El sistema solo arma; la
   ENTREGA la hace la capa de avisos (R1).**
4. **La validez es DATO** (`_validez`): `vence_en` ISO declarado, o `validez_ms` (número
   finito) que se convierte en `vence_en = armada_iso + validez_ms`. **Sin declarar → ambos
   `null` → la solicitud NO vence** (cero plazos cableados) y se declara en `abierto.vence_en`.
5. **El destinatario es declarable**: `input.destinatario` o `null`;
   `destinatario_declarado` es `true` solo si es no vacío. Sin declarar → se declara en
   `abierto.destinatario` (**[ABIERTO] quién firma**).
6. **GUARD 1 — EL SISTEMA NO FIRMA**: `rol = input.rol ? String(...).toUpperCase() :
   'ASESOR'`. Si `rol !== 'ASESOR'` → `403 PERMISSION_DENIED` con
   `{rol_esperado:'ASESOR', rol_recibido, ambito}` y mensaje «la firma es del asesor: el
   sistema NO firma ni decide».
7. **GUARD 2 — UN SOLO ESCRITOR de `libro/firma`**:
   `_rpc('single-writer.reclamar.request', {project_id, rol:'RECLAMANTE_ESCRITOR',
   parcela:'libro/firma', id:escritor_id}, {timeout_ms:4000})`, con
   `escritor_id = input.id ?? asesor`. Si `turno_data.concedido === false` → `403
   PERMISSION_DENIED` con `{parcela:'libro/firma', dueno, solicitante}`. Si el guard **no
   responde** (`null`) → `turno_confirmado:false` y se **sigue** (se declara, no se oculta).
8. **REGISTRAR la firma (APPEND-ONLY)**: la firma es
   `{n (número de firmas de ese ámbito +1), ambito, asesor, marca (declarada o null),
   decision, comentario, solicitud_id (la solicitud vigente que se responde, si la hay),
   revisado_en}`; se **apila** (`p.firmas.push`) y, si había solicitud PENDIENTE, pasa a
   `estado:'FIRMADA'`. **Una firma previa no se borra ni se muta.** Devuelve
   `{firma, registrada:true, firmada:true, armada:false, turno_confirmado, firma_por:'asesor',
   firma_del_sistema:false}`.
9. **La MARCA de la decisión es DECLARADA**: `marca`, `decision` y `comentario` se copian del
   input tal cual (o `null`). **Nada se interpreta por el asesor.**
10. **`estado`: cuatro valores, en orden de evaluación**: si hay **firma** → `'FIRMADA'`
    (`revisado:true`, `vencida:false`, `re_preguntada:false`). Sin firma y sin solicitud →
    `'SIN_SOLICITUD'` (`revisado:false`). Con solicitud PENDIENTE **vencida** → `'EXPIRADA'`
    (+ `re_preguntada:true`). Con solicitud PENDIENTE **vigente** → `'PENDIENTE'`.
11. **VENCE SIN FIRMA → EXPIRA Y RE-PREGUNTA (jamás asume)**: al detectar `vencida`, se marca
    la solicitud `'EXPIRADA'` (con `expirada_en`), se **ARMA una solicitud NUEVA**
    (`..._re`, con `re_de` = id de la anterior, `estado:'PENDIENTE'`, validez recalculada y
    motivo por defecto «la solicitud anterior venció sin firma») y se devuelve
    `{estado:'EXPIRADA', solicitud: nueva, solicitud_expirada, vencida:true,
    re_preguntada:true, firma:null, motivo, abierto:{firma}}`. **La ausencia de firma NUNCA
    se interpreta como un sí.**
12. **`_vencida`**: si `vence_en` (fecha válida) → `ahora > vence_en`; si no, si
    `validez_ms` es número → `ahora > armada_en + validez_ms`; si no → **`false`** (sin
    validez declarada la solicitud **no vence**).
13. **`_solicitudVigente`**: la **última** solicitud `PENDIENTE` del ámbito; las expiradas
    quedan como **historial**.
14. **La lectura exige estado**: `_estado` devuelve `firma_por:'asesor'`,
    `firma_del_sistema:false` **siempre**.
15. **`project_id` con fallback**: `input.project_id || this.project_id`; ausente →
    `400 INVALID_INPUT` (`field:'project_id'`).
16. **Persistencia**: `PosPersistencia` con `marcarDirty(pid)` en cada escritura;
    `project.activated` → `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`.
17. **HTTP exacto**: éxito `200`; `project_id`/`ambito` ausente → `400`; rol no-asesor o turno
    ajeno → `403`; excepción en `_atender` → `500 UNKNOWN_ERROR`.

## Cómo se usa (RPCs)

Responde en `flujo-firma.firmar.response` / `flujo-firma.estado.response` y emite
`contabilidad.firma_registrada` (solo con firma REAL).

### 1. `firmar` — el sistema ARMA la solicitud (sin `asesor`)

```json
{
  "project_id": "e57a318a-...",
  "ambito": "2026-09",
  "asunto": "revisar cierre de septiembre",
  "validez_ms": 604800000,
  "destinatario": "asesor-a",
  "correlation_id": "abc-123"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "ambito": "2026-09",
  "solicitud": {
    "id": "solicitud_e57a318a-..._2026-09_2026-09-30T...:00.000Z",
    "ambito": "2026-09",
    "asunto": "revisar cierre de septiembre",
    "alcance": null,
    "motivo": null,
    "destinatario": "asesor-a",
    "destinatario_declarado": true,
    "vence_en": "2026-10-07T...:00.000Z",
    "validez_ms": 604800000,
    "estado": "PENDIENTE",
    "armada_en": "2026-09-30T...:00.000Z",
    "correlation_id": "abc-123"
  },
  "registrada": false,
  "firmada": false,
  "armada": true,
  "firma_por": "asesor",
  "firma_del_sistema": false,
  "abierto": { "destinatario": null, "vence_en": null }
}
```

**No se emite `contabilidad.firma_registrada`**: el sistema solo armó la pregunta.

### 2. `firmar` — el ASESOR firma (con `asesor`)

```json
{
  "project_id": "e57a318a-...",
  "ambito": "2026-09",
  "asesor": "asesor-a",
  "rol": "ASESOR",
  "marca": "visto-bueno",
  "decision": "OK",
  "comentario": "cierro septiembre y presento IVA",
  "id": "asesor-a",
  "correlation_id": "abc-124"
}
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "ambito": "2026-09",
  "firma": { "n": 1, "ambito": "2026-09", "asesor": "asesor-a", "marca": "visto-bueno", "decision": "OK", "comentario": "cierro septiembre y presento IVA", "solicitud_id": "solicitud_...", "revisado_en": "2026-09-30T...:05.000Z" },
  "registrada": true,
  "firmada": true,
  "armada": false,
  "turno_confirmado": true,
  "firma_por": "asesor",
  "firma_del_sistema": false
}
```

Emite `contabilidad.firma_registrada`:

```json
{ "project_id": "e57a318a-...", "ambito": "2026-09", "firma": { "...": "..." }, "asesor": "asesor-a", "marca": "visto-bueno", "correlation_id": "abc-124" }
```

Lo LEEN `marca-borrador-validado` (Q4) y `cambio-desde-ultima-revision` (L9).

### 3. `estado` — la firma ya existe

```json
{ "project_id": "e57a318a-...", "ambito": "2026-09" }
```

Respuesta `200`: `revisado:true`, `estado:'FIRMADA'`, `firma` (la última), `vencida:false`,
`re_preguntada:false`.

### 4. `estado` — la solicitud venció sin firma → EXPIRA y RE-PREGUNTA

```json
{ "project_id": "e57a318a-...", "ambito": "2026-09", "ahora": "2026-11-01T00:00:00.000Z" }
```

Respuesta `200`:

```json
{
  "project_id": "e57a318a-...",
  "ambito": "2026-09",
  "revisado": false,
  "estado": "EXPIRADA",
  "firma": null,
  "firma_del_sistema": false,
  "firma_por": "asesor",
  "solicitud": { "id": "solicitud_..._re", "estado": "PENDIENTE", "re_de": "solicitud_...", "motivo": "la solicitud anterior vencio sin firma", "...": "..." },
  "solicitud_expirada": { "id": "solicitud_...", "estado": "EXPIRADA", "expirada_en": "2026-11-01T00:00:00.000Z", "...": "..." },
  "vencida": true,
  "re_preguntada": true,
  "motivo": "la solicitud de firma vencio sin firma: se expira y se RE-PREGUNTA, jamas se asume",
  "abierto": { "firma": "la firma del asesor sigue pendiente: el sistema no la suple" }
}
```

### 5. `estado` — sin solicitud armada

Respuesta `200`: `revisado:false`, `estado:'SIN_SOLICITUD'`, `firma:null`, `solicitud:null`,
`abierto.solicitud` declarado. **No se asume nada.**

### 6. Fallo — quien pretende firmar NO es el asesor (EL SISTEMA NO FIRMA)

```json
{ "project_id": "e57a318a-...", "ambito": "2026-09", "asesor": "motor", "rol": "SISTEMA" }
```

Respuesta `403` + `flujo-firma.firmar.failed`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "la firma es del asesor: el sistema NO firma ni decide", "details": { "rol_esperado": "ASESOR", "rol_recibido": "SISTEMA", "ambito": "2026-09" } } }
```

### 7. Fallo — el turno de la parcela es de otro

Si `single-writer.reclamar.request` responde `concedido:false`:

```json
{ "status": 403, "error": { "code": "PERMISSION_DENIED", "message": "solo el escritor con el turno de la parcela libro/firma puede registrar firmas", "details": { "parcela": "libro/firma", "dueno": "asesor-a", "solicitante": "asesor-b" } } }
```

### 8. Fallo — falta el ámbito

Respuesta `400` + `flujo-firma.firmar.failed`:

```json
{ "status": 400, "error": { "code": "INVALID_INPUT", "message": "ambito requerido", "details": { "field": "ambito" } } }
```

## Tests

El test unitario de la vertical vive en `tests/unit/flujo-firma.test.js`. Cubre:

- `firmar` **sin `asesor`** → `200 armada:true`, `registrada:false`, solicitud
  `PENDIENTE`, **no** emite `contabilidad.firma_registrada`.
- `firmar` **con `asesor` + `rol:'ASESOR'`** → `200 registrada:true`, firma append-only y
  emite `contabilidad.firma_registrada`.
- **EL SISTEMA NO FIRMA**: `rol:'SISTEMA'` → `403 PERMISSION_DENIED` +
  `flujo-firma.firmar.failed`.
- Guard de turno: `concedido:false` → `403`; sin respuesta (null) → `turno_confirmado:false` y
  se registra.
- Validez declarable: `vence_en`/`validez_ms` → `vence_en` calculado; **sin** validez →
  solicitud que **no vence**.
- `estado`: `FIRMADA` (con firma), `PENDIENTE` (vigente), `SIN_SOLICITUD` (sin solicitud) y
  **`EXPIRADA` + `re_preguntada:true`** (vencida sin firma → se arma una solicitud NUEVA).
- **Append-only**: dos firmas del mismo ámbito → `firmas` con 2 y la **vigente es la última**.
- `project.activated` restaura `firmas` + `solicitudes`; `estadoDe(pid, ambito)` lee sin
  mutar.
- `ambito` o `project_id` ausente → `400 INVALID_INPUT`; `toolFirmar`/`toolEstado` devuelven
  la misma proyección.

Para ejecutarlo:

```bash
cd /home/admin/3enki-contabilidad
PORT=3999 npm run test
```

## Notas de implementación

- Clase `FlujoFirma extends ModuloHibridoReflejo`; `name = 'flujo-firma'`,
  `version = 'reflejo-0.1.0'`. Store en memoria `this._parcelas`
  (`Map<project_id, {esquema, firmas:[append-only], solicitudes:[append-only]}>`).
- Constantes: `PARCELA = 'libro/firma'`, `ROL_RECLAMANTE = 'RECLAMANTE_ESCRITOR'`,
  `ROL_ASESOR = 'ASESOR'`.
- **PosPersistencia**: `_persist = new PosPersistencia({modulo, file:'flujo-firma.json',
  dir:'/contabilidad/flujo-firma', snapshot, hidratar})` desde
  `modules/contabilidad-libro/flujo-firma/` (DOS niveles → `../../_shared/pos-persistencia`).
  `onProjectActivated` → `restaurar(project_id)`; `onUnload` → `flush()` + `detener()`; cada
  escritura `marcarDirty(pid)`.
- `onFirmarRequest` / `onEstadoRequest` usan `this._atender(...)`; `onFirmarRequest` hace el
  cierre de círculo: en `200` con `registrada:true` publica `contabilidad.firma_registrada`,
  si no el par `failed`.
- Proyecciones `_firmar` (`async`: pide turno a M2 por evento) y `_estado`; helpers `_armar`,
  `_registrarFirma`, `_solicitudVigente`, `_vencida`, `_validez`, `_obtenerOCrear`. Lectura
  directa `estadoDe(pid, ambito)`. Tools `toolFirmar`, `toolEstado`.
- `_invalid` / `_errorResponse` / `_rpc` vienen de `modulo-hibrido-reflejo`.
- DEP: pide `single-writer.reclamar.request` (M2) por evento; lo LEEN
  `marca-borrador-validado` (Q4) y `cambio-desde-ultima-revision` (L9) vía
  `contabilidad.firma_registrada`; la entrega de la solicitud la hace la capa de avisos (R1).
- **EL SISTEMA NO FIRMA, NO DECIDE Y NO ASUME EL SILENCIO**: vence sin firma → **EXPIRA y
  RE-PREGUNTA**.
