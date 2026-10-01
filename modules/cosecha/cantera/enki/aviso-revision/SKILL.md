---
name: aviso-revision
description: >-
  Skill FULL del módulo PUENTE (stateless) `aviso-revision` de la vertical
  contabilidad (Enki). El EMPUJÓN al canal de avisos: 'esto necesita revisión'. Una
  EXCEPCIÓN SIEMPRE genera aviso: una pieza dudosa no se queda muda — se pide
  revisión del asesor. Da forma al empujón, anuncia el HECHO
  contabilidad.revision_solicitada y sube best-effort motor-avisos.producir.request.
  Sin excepción declarada no se inventa una revisión. No persiste.
when-to-use: >-
  - Cuando necesites empujar una petición de revisión al canal de avisos (RPC
    aviso-revision.empujar.request).
  - Cuando depures un 400 INVALID_INPUT por falta de project_id o excepción.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y la
    cadena hacia motor-avisos K2.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, puente, stateless, contabilidad, entrada, revision, avisos, asesor]
---

# aviso-revision — PUENTE stateless del empujón de revisión

## Qué hace el módulo

`aviso-revision` es un **PUENTE (stateless)** (A8.2, hoja del plan): el **EMPUJÓN**
al canal de avisos: *"esto necesita revisión"*. **Una EXCEPCIÓN SIEMPRE genera
aviso**: una pieza dudosa **no se queda muda** — se pide **revisión del asesor**.

Da forma al empujón, anuncia el **HECHO** `contabilidad.revision_solicitada` y
**SUBE best-effort** `motor-avisos.producir.request` (K2, que produce el aviso).
**PUENTE STATELESS**: sin PosPersistencia. **Invariante**: sin excepción declarada
**no se inventa una revisión**. Su op es **CLASE ORDEN** → **SÍ lleva `ui_handler`**
(`system_panel`, `lateral_derecha`). Dep por EVENTO de `motor-avisos` K2.

> **Nota R3**: el plan declara escucha de `contabilidad.excepcion_encolada`
> (`encolado-excepcion` A8.1), pero **ese módulo AÚN NO EXISTE** en el repo (grupo
> posterior) → **NO se declara** (cadena colgada). El handler `onExcepcionEncolada`
> existe en el `index.js` pero el evento no está en el manifest.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `aviso-revision.empujar.request` | `onEmpujarRequest` | RPC puente (ORDEN, panel): `{project_id, excepcion?/excepcion_id?, motivo?, dudoso?}` → `{project_id, excepcion_id, motivo, dudoso, empujado, abierto}`. Da forma al empujón de revisión; anuncia `contabilidad.revision_solicitada` y sube `motor-avisos.producir.request`. Responde por `aviso-revision.empujar.response`; falta `project_id`/`excepcion` → `aviso-revision.empujar.failed`. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.revision_solicitada` | Fire-and-forget (A8.2): una excepción pide revisión del asesor → `{project_id, excepcion_id, motivo, dudoso}`. Lo ESCUCHA `motor-avisos` (K2) para producir el aviso. |
| `motor-avisos.producir.request` | Subida (REQUEST por EVENTO, best-effort) a K2: produce el aviso de revisión. |
| `aviso-revision.empujar.response` | Respuesta RPC correlada de la op `empujar` (una sola cara: el bus). |
| `aviso-revision.empujar.failed` | Par de fallo determinista: falta `project_id` o `excepcion` → `{status, code, message}`. Cierra el círculo de `empujar.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `empujar` | **ORDEN** (panel) | `{project_id, excepcion?/excepcion_id?, motivo?, dudoso?}` | `{project_id, excepcion_id, motivo, dudoso, empujado, abierto}` | `400 INVALID_INPUT` (`project_id`, `excepcion`) |

Tool expuesta: `aviso-revision.empujar` (`toolEmpujar` → `_empujar`).

## Reglas de negocio

1. **Una excepción SIEMPRE genera aviso**: si hay excepción (id o motivo), se anuncia
   `contabilidad.revision_solicitada` y se sube `motor-avisos.producir.request` (K2).
   La pieza dudosa **no se queda muda**.
2. **Sin excepción no se inventa revisión**: si faltan `excepcion_id`, `excepcion` y
   `motivo` → `400 INVALID_INPUT excepcion`.
3. **Puente stateless**: no persiste; solo da forma al empujón y anuncia.
4. **`dudoso`**: marca si la pieza se considera dudosa (informativo).
5. **Sin `project_id`** → `400 INVALID_INPUT` + `.failed`.
6. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `empujar` — pedir revisión del asesor

```json
{
  "project_id": "e57a318a-...",
  "excepcion_id": "EXC-7",
  "motivo": "importe alto sin documento",
  "dudoso": true,
  "correlation_id": "abc-123"
}
```
Respuesta `200` (y se publica `contabilidad.revision_solicitada` + sube a K2):
```json
{ "project_id": "e57a318a-...", "excepcion_id": "EXC-7", "motivo": "importe alto sin documento", "dudoso": true, "empujado": true, "abierto": { "excepcion": null } }
```

### Fallo — sin excepción

```json
{ "project_id": "e57a318a-..." }
```
Respuesta `400` + `aviso-revision.empujar.failed`:
```json
{ "status": 400, "code": "INVALID_INPUT", "message": "excepcion requerido", "details": { "field": "excepcion" } }
```

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `excepcion` — falta el campo; sin excepción no se
  inventa revisión.
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia delante (publica el hecho)**: `contabilidad.revision_solicitada` lo escucha
  `motor-avisos` (K2), que produce el aviso. Sube `motor-avisos.producir.request`
  (K2).
- **Hacia atrás**: `control-calidad-muestreo` (L8) produce las excepciones que se
  empujan. *`encolado-excepcion` (A8.1) aún no existe (R3).*
- No importa a nadie.

## Verificación

- **Fichero**: `modules/contabilidad-entrada/aviso-revision/` (clase `AvisoRevision
  extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "revision_solicitada" module.json index.js` y confirmar
  `motor-avisos.producir.request` en `index.js`. `grep -F "excepcion_encolada"
  module.json` → NO debe aparecer (R3).
- **Test unitario**: con excepción → `empujado:true` + `revision_solicitada`; sin
  excepción → `400 INVALID_INPUT`; sube a K2.

## Notas de implementación

- PUENTE stateless: sin `PosPersistencia`.
- Helpers: `_empujar`, `toolEmpujar`. Existe un `onExcepcionEncolada` en el `index.js`
  que **NO está declarado** en `module.json` (cadena colgada, R3).
