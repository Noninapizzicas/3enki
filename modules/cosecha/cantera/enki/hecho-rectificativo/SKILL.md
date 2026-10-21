---
name: hecho-rectificativo
description: >-
  Skill FULL del módulo PUENTE `hecho-rectificativo` de la vertical contabilidad
  (Enki). Conecta el hecho POSTERIOR que corrige/anula uno ANTERIOR por CLAVE
  NATURAL: NO borra, AÑADE (borra_original:false). Empareja y anuncia el HECHO
  contabilidad.hecho_rectificado; quien ESCRIBE el libro es escritor-diario (B2),
  que escucha el hecho. Sin clave natural NO se empareja (no se adivina). No
  persiste.
when-to-use: >-
  - Cuando necesites emparejar un hecho rectificativo con el original por su clave
    natural (RPC hecho-rectificativo.emparejar.request).
  - Cuando depures un emparejado que sale emparejado:false (sin clave natural → no
    se adivina) o un 400 INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y las
    acciones CORRIGE/ANULA.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, puente, contabilidad, entrada, rectificativo, clave-natural, append-only]
---

# hecho-rectificativo — PUENTE del hecho que corrige/anula sin borrar

## Qué hace el módulo

`hecho-rectificativo` es un **PUENTE** (A13, hoja del plan): conecta el hecho
**POSTERIOR** que **corrige/anula** uno **ANTERIOR** por **CLAVE NATURAL**. Su
principio es **NO borra, AÑADE** (`borra_original:false`; el original se apunta,
**nunca se edita**).

Es una **frontera**: empareja y **ANUNCIA** `contabilidad.hecho_rectificado`.
Quien **ESCRIBE** el libro es `escritor-diario` (B2), que **ESCUCHA** el hecho.
Sube **best-effort** `clave-natural.calcular.request` para que el calculador
canónico confirme la clave. **Sin clave natural NO se empareja** (no se adivina
contra qué corrige).

Su op es **CLASE ORDEN** → **SÍ lleva `ui_handler`** (`system_panel`,
`lateral_derecha`). Escucha además `contabilidad.hecho_recibido` (A1/A2). Publica
`hecho-rectificativo.emparejar.response`, su par `.failed` y el HECHO
`contabilidad.hecho_rectificado`. No persiste.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `hecho-rectificativo.emparejar.request` | `onEmparejarRequest` | RPC puente (ORDEN, panel): `{project_id, hecho{clave_natural?,accion?,asiento?}, clave?, accion?}` → `{project_id, emparejado, clave, accion, rectificativo, escritor:'escritor-diario', abierto}`. Empareja por clave natural y publica `contabilidad.hecho_rectificado` (no borra el original). Sin hecho → `INVALID_INPUT`; sin clave → `emparejado:false` (no se adivina). Responde por `hecho-rectificativo.emparejar.response`. Payload inválido → `hecho-rectificativo.emparejar.failed`. |
| `contabilidad.hecho_recibido` | `onHechoRecibido` | Fire-and-forget (A1/A2): llegó un hecho de la operación. Si el hecho **SE DECLARA rectificativo** (`es_rectificativo`/`tipo='rectificativo'`/`corrige`), se empareja automáticamente por su clave natural y se anuncia `contabilidad.hecho_rectificado`; si no, se ignora. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.hecho_rectificado` | Fire-and-forget (A13): un hecho posterior corrige/anula uno anterior por clave natural → `{project_id, rectificativo, clave, accion, asiento}`. Lo consume `escritor-diario` (B2), que asienta lo que traiga el hecho rectificativo. |
| `hecho-rectificativo.emparejar.response` | Respuesta RPC correlada de la op `emparejar`. |
| `hecho-rectificativo.emparejar.failed` | Par de fallo determinista: falta `project_id` o `hecho` → `{status, code, message}`. Cierra el círculo de `emparejar.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `emparejar` | **ORDEN** (panel) | `{project_id, hecho{clave_natural?,accion?,asiento?}, clave?, accion?}` | `{project_id, emparejado, clave, accion, rectificativo, escritor:'escritor-diario', abierto}` | `400 INVALID_INPUT` (`project_id`, `hecho`) |

Tool expuesta: `hecho-rectificativo.emparejar` (`toolEmparejar` → `_emparejar`).

## Reglas de negocio

1. **Acciones cerradas (const `ACCIONES`)**: `CORRIGE` o `ANULA`. Cualquier otra no
   forma parte del contrato de acciones.
2. **No borra: añade**: `borra_original:false`; el original queda intacto
   (append-only). El rectificativo es un asiento NUEVO.
3. **Sin clave natural no se empareja**: `emparejado:false` con `abierto.clave =
   'el hecho no declara su clave natural: no se empareja (no se adivina contra que
   corrige)'`. **No se adivina.**
4. **Frontera, no escritor**: publica `contabilidad.hecho_rectificado`; B2
   (`escritor-diario`) lo asienta (marcado `rectificativo:true`). No escribe el
   libro.
5. **Sin `hecho`** → `400 INVALID_INPUT`; sin `project_id` → `400 INVALID_INPUT`.
6. **`onHechoRecibido` no inventa**: solo actúa si el hecho se declara
   rectificativo; si no, se ignora. No publica `.response` (no es RPC).
7. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `emparejar` — corregir por clave natural

```json
{
  "project_id": "e57a318a-...",
  "hecho": { "clave_natural": "F2026-1", "accion": "CORRIGE", "asiento": { "lineas": [ { "cuenta": "600", "debe": 0, "haber": 50 }, { "cuenta": "400", "debe": 50, "haber": 0 } ] } },
  "correlation_id": "abc-123"
}
```
Respuesta `200` (y se publica `contabilidad.hecho_rectificado`):
```json
{ "project_id": "e57a318a-...", "emparejado": true, "clave": "F2026-1", "accion": "CORRIGE", "rectificativo": { "clave": "F2026-1", "accion": "CORRIGE", "asiento": { "lineas": [...] } }, "escritor": "escritor-diario", "abierto": { "clave": null } }
```

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `hecho` — falta el campo.
- `200 {emparejado:false, abierto.clave}` — sin clave natural no se adivina
  (comportamiento honesto).
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.hecho_recibido` (A1/A2). Sube
  best-effort `clave-natural.calcular.request`.
- **Hacia delante (publica el hecho)**: `contabilidad.hecho_rectificado` lo
  consume `escritor-diario` (B2), que asienta lo que el hecho traiga. También lo
  observan `cambio-desde-ultima-revision` (L9) y `control-calidad-muestreo` (L8).
- No escribe: puro puente de frontera.

## Verificación

- **Fichero**: `modules/contabilidad-entrada/hecho-rectificativo/` (clase
  `HechoRectificativo extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "hecho_rectificado" module.json index.js` y
  `grep -F "ACCIONES" index.js`.
- **Test unitario**: hecho con clave→ `emparejado:true` + `hecho_rectificado`; sin
  clave → `emparejado:false` + `abierto.clave`; sin `hecho` → `400 INVALID_INPUT`;
  `onHechoRecibido` con `es_rectificativo:true` empareja solo.

## Notas de implementación

- PUENTE: sin `PosPersistencia` (no persiste estado propio).
- `onEmparejarRequest` delega en `_atender(e, 'emparejar',
  'hecho-rectificativo.emparejar.response', ...)` y publica el hecho si status
  `200`, o el par `.failed` si no.
- Helpers: `_emparejar`, `toolEmparejar`.
