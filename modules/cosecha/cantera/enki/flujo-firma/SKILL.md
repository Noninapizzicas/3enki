---
name: flujo-firma
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `flujo-firma` de la vertical contabilidad (Enki).
  La PARCELA del estado revisado/firmado del asesor. UN solo escritor. 🔴 EL SISTEMA NO FIRMA:
  esta hoja NO firma nada, REGISTRA que el asesor firmó (acto declarado, `firmado_por` obligatorio)
  y deja constancia. Una firma VENCE: al pasar su vencimiento EXPIRA (estado VENCIDA) y el sistema
  RE-PREGUNTA; nunca renueva en silencio ni da por buena una firma caducada. Sin vencimiento
  declarado no se inventa vigencia. Publica contabilidad.revision_firmada y SUBE
  traza-asiento.registrar.request. Persiste por proyecto vía PosPersistencia.
when-to-use: >-
  - Cuando el asesor deba dejar constancia de firma/revisión, o cuando necesites el estado de firma
    (RPC flujo-firma.firmar.request / .estado.request).
  - Cuando depures por qué `re_pregunta:true` (firma vencida o inexistente) o `estado:'VENCIDA'`.
  - Cuando quieras entender su contrato de eventos, su hecho contabilidad.revision_firmada y su
    subida de traza.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, libro, firma, asesor, vencimiento]
---

# flujo-firma — CUSTODIO de la parcela de firma del asesor

## Qué hace el módulo

`flujo-firma` es un **CUSTODIO CON PERSISTENCIA** (L3, hoja del plan). Es la **PARCELA** del
estado revisado/firmado del asesor. **UN solo escritor.**

🔴 **EL SISTEMA NO FIRMA.** Esta hoja NO firma nada: **REGISTRA** que el asesor firmó (el acto es
del humano) y deja constancia del estado. Y una firma **VENCE**: al vencer **EXPIRA** y el sistema
**RE-PREGUNTA** — no renueva en silencio, no da por buena una firma caducada.

- **`firmar`** — ORDEN: el asesor deja constancia de que revisó/firmó. Si hay vencimiento, se
  guarda la fecha; sin vencimiento declarado, la firma **NO se inventa** vigencia.
- **`estado`** — PREGUNTA: ¿cuál es el estado de firma de esta revisión (vigente/vencida/sin firmar)?

Invariantes:
- El sistema NO firma: `firmar` registra un acto **DECLARADO** (`firmado_por` obligatorio).
- Una firma **VENCIDA** no se da por válida: estado → `'VENCIDA'` y el sistema re-pregunta.
- **Dato ausente = desconocido**: sin referencia de revisión NO se firma (no se firma el vacío).
- **No se borra**: re-firmar APPENDEA al historial.

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/flujo-firma`, archivo
`flujo-firma.json`), restaura en `project.activated` y vuelca en `onUnload`.

**Dos caras:** `firmar` es **ORDEN** (`system_panel`); `estado` es **PREGUNTA** (bus).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `flujo-firma.firmar.request` | `onFirmarRequest` | RPC custodio (**ORDEN**, panel): `{project_id, referencia, firmado_por, revisado?, vence_en?, rol?}` → `{project_id, clave, revision, firmada, estado, sistema_firma:false}`. Registra el acto del asesor (el sistema NO firma); sin `firmado_por` → `INVALID_INPUT`. Publica `contabilidad.revision_firmada`. Responde por `.firmar.response`. |
| `flujo-firma.estado.request` | `onEstadoRequest` | RPC custodio (**PREGUNTA**, por el bus): `{project_id, referencia}` → `{project_id, clave, estado, vigente, re_pregunta}`. Estado de firma (`SIN_FIRMAR`\|`VIGENTE`\|`VENCIDA`); una firma vencida o inexistente → `re_pregunta:true`. Responde por `.estado.response`. |
| `project.activated` | `onProjectActivated` | Restaura la parcela de firma del proyecto activado desde el storage. |

> R3: el plan **no declara** escucha de dominio para esta hoja y el código no añade ninguna.

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.revision_firmada` | Fire-and-forget (L3): el asesor dejó constancia de que firmó/revisó una revisión → `{project_id, clave, revision, firmada, estado}`. Lo consume `marca-borrador-validado` (Q4) para sellar el punto. |
| `flujo-firma.firmar.response` / `.firmar.failed` | RPC `firmar`. |
| `flujo-firma.estado.response` / `.estado.failed` | RPC `estado`. |

**Sube por evento:** `traza-asiento.registrar.request` (B4) — solo cuando `firmada===true`, con
`asiento_id = revision.referencia || revision.clave`, `accion:'firma'`, `actor:firmado_por`. Es
`_rpc(...)` con `timeout_ms:2000` (best-effort; nunca import).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `firmar` | **ORDEN** (panel) | `{project_id, referencia\|clave\|revision_id, firmado_por\|asesor, revisado?, vence_en?, rol?}` | `{project_id, clave, revision, firmada:true, sistema_firma:false, constancia_del_asesor:true, estado, abierto}` | 400 `INVALID_INPUT` (`project_id`/`referencia`/`firmado_por`) |
| `estado` | **PREGUNTA** (bus) | `{project_id, referencia}` | `{project_id, clave, revision?, estado, vigente, firmada, firmado_por?, firmado_en?, vence_en?, re_pregunta, abierto}` | 400 `INVALID_INPUT` |

## Reglas de negocio (lo que el código IMPONE)

1. **`_clave`**: de `referencia`/`clave`/`revision_id`. Sin ella → `_invalid('referencia')`.
2. **El sistema NO firma**: `firmado_por` (o `asesor`) obligatorio → si falta, `_invalid('firmado_por')`.
3. **`_firmar`**: `revisado` = `input.revisado === undefined ? true : input.revisado === true`;
   `firmada = true`; `firmado_en = ahora`; `vence_en` declarado o `null`.
4. **`abierto.vence_en`** declarado si no se declaró vencimiento (no se inventa vigencia).
5. **No se borra**: cada firma hace `push` a `historial` con `{revision, firmado_por, vence_en, en}`.
6. **`_estadoDe(revision, ahora)`**:
   - sin firma → `SIN_FIRMAR`;
   - **sin `vence_en`** → `VIGENTE` (no se inventa vencimiento);
   - `vence_en` ilegible → `VIGENTE` (no se declara vencida por un dato malo);
   - `vence_en` pasado → `VENCIDA`; futuro → `VIGENTE`.
7. **`_estado`**: sin revisión → `SIN_FIRMAR, vigente:false, re_pregunta:true`, `abierto.firma`
   declarado. Con revisión → `re_pregunta = estado !== 'VIGENTE'`.
8. **Subida de traza**: en `onFirmarRequest`, si `res.data.firmada === true`, hace `_rpc(
   'traza-asiento.registrar.request', {...}, {timeout_ms:2000})`.

## Cómo se usa (RPC)

### 1. Firmar (constancia del asesor)

```json
{ "project_id": "e57a318a-...", "referencia": "rev-2026-Q3", "firmado_por": "asesor@despacho", "vence_en": "2027-01-31", "revisado": true, "correlation_id": "abc-18" }
```
Respuesta `200` + `contabilidad.revision_firmada` (+ sube traza):
```json
{ "project_id": "e57a318a-...", "clave": "rev-2026-Q3", "revision": { "clave": "rev-2026-Q3", "referencia": "rev-2026-Q3", "revisado": true, "firmada": true, "firmado_por": "asesor@despacho", "rol": null, "firmado_en": "2026-10-01T...", "vence_en": "2027-01-31", "historial": [ { "revision": true, "firmado_por": "asesor@despacho", "vence_en": "2027-01-31", "en": "2026-10-01T..." } ] }, "firmada": true, "sistema_firma": false, "constancia_del_asesor": true, "estado": "VIGENTE", "abierto": { "vence_en": null } }
```

### 2. Firmar sin vencimiento

`vence_en` ausente → `abierto.vence_en` declarado; `estado:'VIGENTE'`.

### 3. Estado de una firma inexistente → re-pregunta

```json
{ "project_id": "e57a318a-...", "referencia": "rev-x" }
```
Respuesta `200`: `{estado:'SIN_FIRMAR', vigente:false, re_pregunta:true, abierto:{firma:'...'}}`.

### 4. Firma vencida

Con `vence_en` en el pasado → `estado:'VENCIDA', vigente:false, re_pregunta:true`.

### Fallo — sin firmante

Respuesta `400` + `flujo-firma.firmar.failed` (`INVALID_INPUT`, field `firmado_por`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`project_id`/`referencia`/`firmado_por`) | falta el campo. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** `traza-asiento` (B4) — **sube** `traza-asiento.registrar.request` por EVENTO.
- **Quién la consume por evento:** `marca-borrador-validado` (Q4) lee `contabilidad.revision_firmada`.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-libro/flujo-firma/module.json` + `index.js`.
2. Smoke: `firmar` → 200 + `contabilidad.revision_firmada`, `sistema_firma:false`, sube traza.
3. `estado` sin firma → `SIN_FIRMAR, re_pregunta:true`.
4. `vence_en` pasado → `VENCIDA`.
5. Re-firmar → historial apilado.
6. Gate `scripts/validate-hibridos.js`.

## Notas de implementación

- Clase `FlujoFirma extends ModuloHibridoReflejo`; `name = 'flujo-firma'`,
  `version = 'reflejo-0.1.0'`. Store `this._firmas` (Map `pid → {esquema, revisiones:
  Map<clave, RevisionFirma>}`).
- **PosPersistencia**: `file:'flujo-firma.json'`, `dir:'/contabilidad/flujo-firma'`.
- Proyecciones `_firmar`/`_estado`; helper `_estadoDe`, `_clave`; lectura `revisionesDe(pid)`;
  tools `toolFirmar`/`toolEstado`.
