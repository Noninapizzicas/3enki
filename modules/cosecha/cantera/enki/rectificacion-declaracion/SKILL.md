---
name: rectificacion-declaracion
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `rectificacion-declaracion` de la vertical
  contabilidad (Enki). El CAMINO DE CORRECCIÓN posterior a la presentación (complementaria /
  sustitutiva). Single-writer (rol `RECTIFICACION_DECLARACION`; otro → 403). Append-only: la
  declaración ORIGINAL nunca se edita (`original_intacta:true`); cada rectificación se APILA.
  Idempotente por clave (duplicado:true). Persiste vía PosPersistencia
  (`/contabilidad/rectificacion-declaracion`), restaura en `project.activated`. Al rectificar
  publica `contabilidad.declaracion_rectificada` y sube por EVENTO a `estado-presentacion-fiscal`
  (D12). Sin motivo no rectifica. La op `rectificar` es ORDEN → system_panel.
when-to-use: >-
  - Cuando necesites registrar una corrección (complementaria/sustitutiva) de una declaración ya
    presentada (RPC rectificacion-declaracion.rectificar.request).
  - Cuando depures un 403 (rol), un 400 (falta declaración o motivo) o por qué sale `duplicado:true`.
  - Cuando quieras entender su contrato de eventos y por qué la declaración original nunca se edita.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, fiscal, rectificacion, declaraciones, single-writer]
---

# rectificacion-declaracion — CUSTODIO del camino de corrección

## Qué hace el módulo

`rectificacion-declaracion` es un **CUSTODIO CON PERSISTENCIA** (D14, hoja del plan) de la vertical
**contabilidad**, eje **fiscal**. Es **el camino de corrección posterior a la presentación**:
registra **rectificaciones** de tipo **complementaria** (añade) o **sustitutiva** (reemplaza) sobre
una declaración ya presentada.

**La declaración ORIGINAL nunca se edita**: cada rectificación es un **registro NUEVO** con
`original_intacta:true` que se **apila** (append-only). Este módulo **no presenta**: presenta el
circuito fiscal; aquí solo se registra la corrección.

**Invariantes que impone el código:**
- **UN SOLO ESCRITOR**: guard de rol `RECTIFICACION_DECLARACION`; otro declarado → `403 PERMISSION_DENIED`.
- **Sin declaración original no se rectifica**: `400 INVALID_INPUT declaracion`.
- **Sin motivo no se rectifica**: una corrección sin causa es una corrección que miente
  (`400 INVALID_INPUT motivo`).
- **IDEMPOTENTE por clave**: la misma rectificación no se apila dos veces (`duplicado:true`),
  salvo `permitir_duplicado`.
- **APPEND-ONLY**: se apila; **nunca** se sobrescribe ni se borra.

Persiste con **PosPersistencia** (storage `/contabilidad/rectificacion-declaracion`), restaura en
`project.activated`. La op `rectificar` es **ORDEN** → `ui_handler` `system_panel`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `rectificacion-declaracion.rectificar.request` | `onRectificarRequest` | RPC custodio (ORDEN): `{project_id, rol, declaracion\|original\|modelo, motivo, tipo?, periodo?, correccion?\|nuevo?, base?, cuota?, clave?, permitir_duplicado?}` → `{rectificacion, rectificada, duplicado, total, append_only, abierto}`. Guard, validaciones, idempotencia y apilado. Al rectificar publica `contabilidad.declaracion_rectificada` y sube a `estado-presentacion-fiscal.avanzar.request`; si `status ≠ 200` publica `.failed`. Responde por `rectificacion-declaracion.rectificar.response`. |
| `project.activated` | `onProjectActivated` | Restaura la parcela de rectificaciones del proyecto activado desde el storage. |

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.declaracion_rectificada` | Fire-and-forget (D14): una declaración quedó rectificada → `{project_id, rectificacion_id, clave, tipo, declaracion, motivo, correlation_id}`. |
| `estado-presentacion-fiscal.avanzar.request` | Sube a D12: la declaración corregida vuelve al circuito de presentación (`{declaracion, tipo, rectificacion_id}`). Este módulo **NO presenta**. |
| `rectificacion-declaracion.rectificar.response` / `.rectificar.failed` | Respuesta + par de fallo de `rectificar`. |

> **SÍ publica un HECHO** (`contabilidad.declaracion_rectificada`): rectificar **es escribir** → R2
> obliga a anunciarlo. Además sube a D12 (best-effort).

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `rectificar` | **ORDEN** (ui_handler: system_panel) | `{project_id, rol?, declaracion?, original?, modelo?, motivo?, tipo?, periodo?, correccion?\|nuevo?, base?, cuota?, clave?, permitir_duplicado?}` | `{project_id, rectificacion:{rectificacion_id, secuencia, clave, tipo, declaracion, periodo, motivo, correccion, base, cuota, original_intacta:true, presentada:false, en}, rectificada, duplicado, total, append_only, abierto}` | `403 PERMISSION_DENIED`; `400 INVALID_INPUT` (falta `project_id`, `declaracion` o `motivo`); `500`. |

## Reglas de negocio

1. **Guard de un solo escritor**: si `rol` llega y `!== 'RECTIFICACION_DECLARACION'` → `403` con
   `{project_id, rol}`. Si `rol` es `null` no se bloquea.
2. **Declaración obligatoria**: `declaracion` → `original` → `modelo`; vacío → `400 INVALID_INPUT declaracion`.
3. **Motivo obligatorio**: `motivo` → `causa` → `razon`; vacío → `400 INVALID_INPUT motivo`.
4. **Tipo**: `complementaria` o `sustitutiva`; cualquier otro (o ausente) → `complementaria`.
5. **Clave**: declarada, o derivada por SHA-1 de `[declaracion, tipo, periodo, motivo]` (16 hex).
6. **Idempotencia**: si la clave ya está y no hay `permitir_duplicado` → `200 rectificada:false,
   duplicado:true`, sin apilar.
7. **Registro apilado**: `{rectificacion_id: '<pid>-r<n>', secuencia, clave, tipo, declaracion,
   periodo, motivo, correccion, base, cuota, original_intacta:true, presentada:false, en}`.
   `correccion` ausente → `null` (no se inventa la corrección).
8. **Original intacta**: la declaración original **nunca** se edita; la rectificación es un registro nuevo.
9. **`abierto.correccion`**: si no se declaró el detalle de la corrección, se anota el hueco.
10. **HTTP exacto**: éxito `200`; rol → `403`; input → `400`; excepción → `500`.

## Cómo se usa (RPC)

### Rectificar un 303 (complementaria)

```json
{
  "project_id": "e57a318a-...",
  "rol": "RECTIFICACION_DECLARACION",
  "declaracion": "303-2026-T1",
  "motivo": "se omitio una factura de IVA soportado",
  "tipo": "complementaria",
  "periodo": "T1",
  "correccion": { "casilla": "28", "antes": 500, "ahora": 620 },
  "base": 1000,
  "cuota": 210,
  "correlation_id": "abc-123"
}
```
Respuesta `200`:
```json
{
  "project_id": "e57a318a-...",
  "rectificacion": {
    "rectificacion_id": "e57a318a-...-r1",
    "secuencia": 1,
    "clave": "a1b2c3d4e5f6a7b8",
    "tipo": "complementaria",
    "declaracion": "303-2026-T1",
    "periodo": "T1",
    "motivo": "se omitio una factura de IVA soportado",
    "correccion": { "casilla": "28", "antes": 500, "ahora": 620 },
    "base": 1000,
    "cuota": 210,
    "original_intacta": true,
    "presentada": false,
    "en": "2026-10-05T..."
  },
  "rectificada": true,
  "duplicado": false,
  "total": 1,
  "append_only": true,
  "abierto": { "correccion": null }
}
```
Emite `contabilidad.declaracion_rectificada` + sube a D12.

### Duplicada — no se apila

Repetir con la misma clave → `200 rectificada:false, duplicado:true`.

### Rol inválido — 403

`{ "rol": "OTRO", "declaracion": "303-2026-T1", "motivo": "x" }` → `403 PERMISSION_DENIED`.

### Sin motivo — 400

`{ "declaracion": "303-2026-T1" }` → `400 INVALID_INPUT motivo`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `PERMISSION_DENIED` | 403 | `rol` declarado ≠ `RECTIFICACION_DECLARACION`. |
| `INVALID_INPUT` | 400 | Falta `project_id`, falta `declaracion`, o falta `motivo`. |
| `UNKNOWN_ERROR` | 500 | Excepción no controlada. |

## Relación con otras piezas (deps por EVENTO)

- **Restaura con**: `project.activated` (core).
- **Sube a**: `estado-presentacion-fiscal.avanzar.request` (D12).
- **Publica el hecho** `contabilidad.declaracion_rectificada`.

## Verificación

1. Fichero: `modules/contabilidad-fiscal/rectificacion-declaracion/`.
2. Eventos reales: subscribes `rectificacion-declaracion.rectificar.request`, `project.activated`;
   publishes `contabilidad.declaracion_rectificada`, `estado-presentacion-fiscal.avanzar.request`,
   `rectificacion-declaracion.rectificar.response`, `.rectificar.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'" modules/contabilidad-fiscal/rectificacion-declaracion/index.js
   # → contabilidad.declaracion_rectificada / estado-presentacion-fiscal.avanzar.request / rectificacion-declaracion.rectificar.failed
   ```
4. Persistencia: file `rectificacion-declaracion.json`, dir `/contabilidad/rectificacion-declaracion`,
   esquema `contabilidad-rectificacion-declaracion-v1`.
5. Test unitario (si existe): rectificar → 200 + hecho + D12; duplicada → `duplicado:true`; rol → 403;
   sin motivo/declaración → 400; `project.activated` restaura.
