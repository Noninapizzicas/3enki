---
name: aviso-al-negocio
description: >-
  Skill FULL del módulo PUENTE CON PERSISTENCIA `aviso-al-negocio` de la vertical
  contabilidad (Enki). La CARA DE ENTREGA: el aviso ENTREGADO y CONFIRMADO al
  negocio cliente. COMPLETA el círculo que abre motor-avisos (K2), que solo PRODUCE.
  Escucha contabilidad.aviso_producido, apila la entrega (append-only) y, si el aviso
  pide enriquecimiento, sube a informe-accionable y narrador-estados. Sin
  destinatario queda ABIERTO. Anuncia contabilidad.aviso_entregado.
when-to-use: >-
  - Cuando necesites entregar un aviso al negocio cliente (RPC
    aviso-al-negocio.entregar.request).
  - Cuando depures una entrega abierta (sin destinatario → no se finge la entrega) o
    un 400 INVALID_INPUT.
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y por qué
    ENTREGA lo que K2 PRODUCE.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, puente, persistencia, contabilidad, analitica, avisos, entrega, append-only]
---

# aviso-al-negocio — PUENTE CON PERSISTENCIA de la entrega de avisos

## Qué hace el módulo

`aviso-al-negocio` es un **PUENTE CON PERSISTENCIA** (R1, hoja del plan): la **CARA
DE ENTREGA** — el aviso **ENTREGADO y CONFIRMADO** al negocio cliente. **COMPLETA
el círculo** que abre `motor-avisos` (K2), que solo **PRODUCE**: aquí se **ENTREGA**.

Escucha `contabilidad.aviso_producido` (K2, emisor de este mismo grupo → **sí se
declara**) y **ENTREGA** el aviso: lo apila (**append-only**) y, si el aviso **PIDE
enriquecimiento**, **SUBE best-effort** `informe-accionable.juzgar.request` (R2, qué
hacer) y `narrador-estados.narrar.request` (R3, narración). Publica el HECHO
`contabilidad.aviso_entregado`.

**Invariante**: un aviso se da por **ENTREGADO solo si declara destinatario**; sin él
queda **ABIERTO** (**no se finge la entrega**). Sin aviso no se inventa nada. Persiste
por proyecto vía **PosPersistencia** (`_shared/pos-persistencia`, storage
`/contabilidad/aviso-al-negocio`). Su op es **CLASE ORDEN** → **SÍ lleva `ui_handler`**
(`system_panel`, `lateral_derecha`).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `aviso-al-negocio.entregar.request` | `onEntregarRequest` | RPC puente (ORDEN, panel): `{project_id, aviso, destinatario?, enriquecer?}` → `{project_id, entrega, entregado, total, append_only, abierto}`. Apila la entrega (append-only); sin destinatario queda ABIERTO. Publica `contabilidad.aviso_entregado`. Responde por `aviso-al-negocio.entregar.response`; falta `project_id`/`aviso` → `aviso-al-negocio.entregar.failed`. |
| `contabilidad.aviso_producido` | `onAvisoProducido` | Señal (fire-and-forget) de `motor-avisos` K2: se produjo un aviso → se ENTREGA al negocio (apila la entrega y anuncia `contabilidad.aviso_entregado`). Cierra el círculo de los avisos. |
| `project.activated` | `onProjectActivated` | Restaura las entregas del proyecto activado desde el storage (PosPersistencia). |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.aviso_entregado` | Fire-and-forget (R1): el negocio quedó avisado → `{project_id, aviso_id, tipo, destinatario, entregado_en}`. Cierra el círculo del aviso (el negocio queda avisado). |
| `informe-accionable.juzgar.request` | Subida (REQUEST por EVENTO, best-effort) a R2: adjunta el qué-hacer al aviso. Solo si el aviso PIDE enriquecimiento. |
| `narrador-estados.narrar.request` | Subida (REQUEST por EVENTO, best-effort) a R3: narra el aviso. Solo si el aviso PIDE enriquecimiento. |
| `aviso-al-negocio.entregar.response` | Respuesta RPC correlada de la op `entregar` (una sola cara: el bus). |
| `aviso-al-negocio.entregar.failed` | Par de fallo determinista: falta `project_id` o `aviso` → `{status, code, message}`. Cierra el círculo de `entregar.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `entregar` | **ORDEN** (panel) | `{project_id, aviso, destinatario?, enriquecer?}` | `{project_id, entrega, entregado, total, append_only, abierto}` | `400 INVALID_INPUT` (`project_id`, `aviso`) |

Tool expuesta: `aviso-al-negocio.entregar` (`toolEntregar` → `_entregar`). Lectura de
proceso: `entregasDe(...)`.

## Reglas de negocio

1. **Solo ENTREGA lo que K2 PRODUCE**: escucha `contabilidad.aviso_producido` y apila
   la entrega. No produce avisos.
2. **APPEND-ONLY**: cada entrega se apila; nada se borra.
3. **Sin destinatario la entrega queda ABIERTO**: **no se finge la entrega** (un aviso
   entregado exige destinatario declarado).
4. **Enriquecimiento opcional**: si el aviso pide enriquecimiento, sube best-effort
   `informe-accionable.juzgar.request` (R2) y `narrador-estados.narrar.request` (R3)
   (`_enriquecer`).
5. **R2 — anuncia el hecho**: publica `contabilidad.aviso_entregado`.
6. **Sin `aviso`** → `400 INVALID_INPUT aviso`; sin `project_id` → `400`.
7. **HTTP exacto**: éxito `200`; campos inválidos → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `entregar` — entregar un aviso

```json
{
  "project_id": "e57a318a-...",
  "aviso": { "aviso_id": "AV-1", "tipo": "cuadre", "titulo": "El cuadre no cuadra" },
  "destinatario": "dueno@negocio.es",
  "enriquecer": true,
  "correlation_id": "abc-123"
}
```
Respuesta `200` (y se publica `contabilidad.aviso_entregado` + subidas de
enriquecimiento si procede):
```json
{ "project_id": "e57a318a-...", "entrega": { "aviso_id": "AV-1", "destinatario": "dueno@negocio.es", "entregado_en": "2026-09-25T..." }, "entregado": true, "total": 1, "append_only": true, "abierto": { "destinatario": null } }
```
Sin destinatario → `entregado:false` con `abierto.destinatario` (no se finge).

## Errores y qué significan

- `400 INVALID_INPUT project_id` / `aviso` — falta el campo.
- `200 {entregado:false, abierto.destinatario}` — sin destinatario no se finge la
  entrega.
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia atrás (escucha)**: `contabilidad.aviso_producido` (K2 `motor-avisos`).
- **Hacia delante (sube por evento)**: `informe-accionable.juzgar.request` (R2),
  `narrador-estados.narrar.request` (R3), solo si el aviso pide enriquecimiento.
- **Hacia delante (publica el hecho)**: `contabilidad.aviso_entregado` cierra el
  círculo del aviso.
- **Hacia atrás (restaura)**: `project.activated`.

## Verificación

- **Fichero**: `modules/contabilidad-analitica/aviso-al-negocio/` (clase
  `AvisoAlNegocio extends ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "aviso_producido" module.json index.js` y
  `grep -F "aviso_entregado" index.js`.
- **Test unitario**: con destinatario → `entregado:true` + `aviso_entregado`; sin
  destinatario → `abierto.destinatario`; `onAvisoProducido` entrega; `project.activated`
  restaura.

## Notas de implementación

- **PosPersistencia** (`file: 'aviso-al-negocio.json'`, `dir:
  '/contabilidad/aviso-al-negocio'`); restaura en `onProjectActivated`, vuelca en
  `onUnload`.
- Helpers: `_reaccionAResultado`, `_enriquecer`, `_entregar`, `_obtenerOCrear`,
  `entregasDe`, `toolEntregar`.
