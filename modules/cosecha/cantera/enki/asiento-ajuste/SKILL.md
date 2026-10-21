---
name: asiento-ajuste
description: >-
  Skill FULL del módulo PUENTE (stateless) `asiento-ajuste` de la vertical
  contabilidad (Enki). Es el CAMINO por el que la corrección del ASESOR entra al
  libro SIN BORRAR: da forma al ajuste y publica el HECHO
  `contabilidad.ajuste_entrado`; quien ESCRIBE es `escritor-diario` (B2) y quien
  apila la traza es `traza-asiento` (B4). El puente NO toca el libro (respeta el
  single-writer). Sin asiento no hay ajuste. No persiste.
when-to-use: >-
  - Cuando necesites que la corrección de un asesor entre al libro sin borrar el
    asiento equivocado (RPC asiento-ajuste.entrar.request).
  - Cuando depures un ajuste rechazado (400 INVALID_INPUT si falta project_id o
    asiento) o que no se emita contabilidad.ajuste_entrado.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y por
    qué NO sube asentar.request.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, puente, stateless, contabilidad, libro, ajuste, asesor, append-only, single-writer]
---

# asiento-ajuste — PUENTE stateless del ajuste del asesor

## Qué hace el módulo

`asiento-ajuste` es un **PUENTE (stateless)** (B5, hoja del plan): el **camino**
por el que la corrección del **ASESOR** entra al libro **SIN BORRAR**. Un ajuste
no edita el asiento equivocado: **AÑADE** el asiento de corrección y deja el
original intacto (`borra_original:false`; la traza queda intacta).

Es una **frontera**: da forma al ajuste y **ANUNCIA** `contabilidad.ajuste_entrado`.
Quien **ESCRIBE** el libro es `escritor-diario` (B2) y quien **apila la traza**
es `traza-asiento` (B4) — **ellos ESCUCHAN el hecho**. El puente **NO toca el
libro** (respeta el single-writer): expresamente **no sube `asentar.request`**
directo, porque B2 ya reacciona al hecho (subirlo duplicaría el asiento).

Su op es **CLASE ORDEN** → **SÍ lleva `ui_handler`** (`system_panel`,
`lateral_derecha`). Publica `asiento-ajuste.entrar.response`, su par `.failed` y,
además, el HECHO `contabilidad.ajuste_entrado`. No persiste.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `asiento-ajuste.entrar.request` | `onEntrarRequest` | RPC puente (ORDEN, panel): `{project_id, asiento{lineas,...}, referencia?, motivo?, por?}` → `{project_id, ajuste, asiento, referencia, por, escritores:[escritor-diario, traza-asiento], abierto}`. Da forma al ajuste (no lo asienta) y publica `contabilidad.ajuste_entrado`; sin asiento → `INVALID_INPUT`. Responde por `asiento-ajuste.entrar.response`. Payload inválido → `asiento-ajuste.entrar.failed`. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.ajuste_entrado` | Fire-and-forget (B5): la corrección del asesor entró al dominio → `{project_id, ajuste, asiento, por, referencia}`. Lo consumen `escritor-diario` (B2, lo asienta) y `traza-asiento` (B4, apila la traza). |
| `asiento-ajuste.entrar.response` | Respuesta RPC correlada de la op `entrar`. |
| `asiento-ajuste.entrar.failed` | Par de fallo determinista: falta `project_id` o `asiento` → `{status, code, message}`. Cierra el círculo de `entrar.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `entrar` | **ORDEN** (panel) | `{project_id, asiento{lineas,...}, referencia?, motivo?, por?}` | `{project_id, ajuste, asiento, referencia, por, escritores:[...], abierto}` | `400 INVALID_INPUT` (`project_id`, `asiento`) |

Tool expuesta: `asiento-ajuste.entrar` (`toolEntrar` → `_entrar`).

## Reglas de negocio

1. **No borra: añade**: `borra_original:false`. Un ajuste es un asiento NUEVO de
   corrección, nunca una edición del original.
2. **Frontera, no escritor**: el puente **no toca el libro** ni sube
   `escritor-diario.asentar.request` directo — B2 ya reacciona a
   `contabilidad.ajuste_entrado`. Subirlo duplicaría el asiento. El campo
   `escritores:[escritor-diario, traza-asiento]` documenta quiénes escuchan.
3. **Sin asiento no hay ajuste**: `asiento` ausente o no objeto →
   `400 INVALID_INPUT`.
4. **Sin project_id** → `400 INVALID_INPUT`.
5. **Estatteless**: no persiste, no muta; solo da forma al ajuste y anuncia.
6. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `entrar` — meter la corrección del asesor

```json
{
  "project_id": "e57a318a-...",
  "asiento": { "lineas": [ { "cuenta": "629", "debe": 50, "haber": 0 }, { "cuenta": "572", "debe": 0, "haber": 50 } ] },
  "referencia": "asiento-original-42",
  "motivo": "clasificacion incorrecta",
  "por": "asesor@gestoria.es",
  "correlation_id": "abc-123"
}
```
Respuesta `200` (y se publica `contabilidad.ajuste_entrado`):
```json
{ "project_id": "e57a318a-...", "ajuste": { "asiento": { "lineas": [...] } }, "asiento": { "lineas": [...] }, "referencia": "asiento-original-42", "por": "asesor@gestoria.es", "escritores": ["escritor-diario", "traza-asiento"], "abierto": { "motivo": null } }
```

## Errores y qué significan

- `400 INVALID_INPUT project_id` — falta el proyecto.
- `400 INVALID_INPUT asiento` — no hay asiento de corrección: sin él no hay ajuste.
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia delante (publica el hecho)**: `escritor-diario` (B2) lo asienta (marcado
  `ajuste:true`) y `traza-asiento` (B4) apila la traza. También lo observan
  `cambio-desde-ultima-revision` (L9) y otros derivados.
- **El asiento del asesor** viene declarado en el payload; el puente no lo
  inventa.
- No importa ni escribe a nadie: es puro puente de frontera.

## Verificación

- **Fichero**: `modules/contabilidad-libro/asiento-ajuste/` (clase `AsientoAjuste
  extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "ajuste_entrado" module.json index.js`.
- **Test unitario**: con asiento válido → `200` + `contabilidad.ajuste_entrado`;
  sin asiento o sin `project_id` → `400 INVALID_INPUT` + `asiento-ajuste.entrar.failed`.

## Notas de implementación

- PUENTE stateless: sin `PosPersistencia`.
- `onEntrarRequest` delega en `_atender(e, 'entrar',
  'asiento-ajuste.entrar.response', ...)` y en el handler, si status `200`,
  publica el hecho `contabilidad.ajuste_entrado`; si no, el par `.failed`.
- Helpers: `_entrar`, `toolEntrar`. `_invalid`/`_errorResponse` de
  `modulo-hibrido-reflejo`.
