---
name: aviso-cuadre
description: >-
  Skill FULL del módulo PUENTE (stateless) `aviso-cuadre` de la vertical
  contabilidad (Enki). NO finge el cuadre: si falta cobertura, AVISA. LEE la métrica
  del cuadre (cuadra · cobertura · descuadre) que llega DECLARADA; NO la recalcula.
  Si el cuadre NO cuadra o FALTA cobertura, anuncia contabilidad.cuadre_no_cuadra y
  sube best-effort motor-avisos.producir.request. Si cuadra y hay cobertura →
  silencio legítimo. No persiste.
when-to-use: >-
  - Cuando necesites empujar el aviso de cuadre (RPC aviso-cuadre.avisar.request).
  - Cuando depures por qué no se emite el aviso (silencio legítimo: cuadra y hay
    cobertura) o por qué sale abierto (sin métrica).
  - Cuando quieras entender su contrato de eventos (subscribes/publishes) y que NO
    recalcula la métrica.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, puente, stateless, contabilidad, libro, cuadre, avisos, silencio-legitimo]
---

# aviso-cuadre — PUENTE stateless del aviso de cuadre

## Qué hace el módulo

`aviso-cuadre` es un **PUENTE (stateless)** (C6, hoja del plan): **NO finge el
cuadre**: si falta cobertura, **AVISA**. **LEE** la métrica unica del cuadre
(`cuadra · cobertura · descuadre`) que llega **DECLARADA**; **NO la recalcula** (el
juicio del cuadre vive en su dueño).

Si el cuadre **NO cuadra** o **FALTA cobertura**, anuncia el HECHO
`contabilidad.cuadre_no_cuadra` y **SUBE best-effort** `motor-avisos.producir.request`
(K2, que produce el aviso). Si **cuadra Y hay cobertura** → **silencio legítimo** (no
se inventa un aviso). **Sin métrica NO se finge: se declara ABIERTO.**

**PUENTE STATELESS**: sin PosPersistencia. Su op es **CLASE ORDEN** → **SÍ lleva
`ui_handler`** (`system_panel`, `lateral_derecha`). Dep por EVENTO de `motor-avisos`
K2.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `aviso-cuadre.avisar.request` | `onAvisarRequest` | RPC puente (ORDEN, panel): `{project_id, cuadre?/metrica?, cuadra?, cobertura?, descuadre?}` → `{project_id, cuadra, cobertura, descuadre, avisa, aviso, recalcula, abierto}`. LEE la métrica (no la recalcula); si no cuadra o falta cobertura anuncia `contabilidad.cuadre_no_cuadra` y sube `motor-avisos.producir.request`. Responde por `aviso-cuadre.avisar.response`; falta `project_id` → `aviso-cuadre.avisar.failed`. |

### Publishes

| Evento | Descripción |
|---|---|
| `contabilidad.cuadre_no_cuadra` | Fire-and-forget (C6): el cuadre no cuadra o falta cobertura → `{project_id, cuadra, cobertura, descuadre, motivo}`. Lo ESCUCHA `motor-avisos` (K2) para producir el aviso. |
| `motor-avisos.producir.request` | Subida (REQUEST por EVENTO, best-effort) a K2: produce el aviso del cuadre. Solo cuando avisa (no cuando hay silencio legítimo). |
| `aviso-cuadre.avisar.response` | Respuesta RPC correlada de la op `avisar` (una sola cara: el bus). |
| `aviso-cuadre.avisar.failed` | Par de fallo determinista: falta `project_id` → `{status, code, message}`. Cierra el círculo de `avisar.request`. |

## Operaciones (RPC)

| op | tipo | entrada | salida | errores |
|---|---|---|---|---|
| `avisar` | **ORDEN** (panel) | `{project_id, cuadre?/metrica?, cuadra?, cobertura?, descuadre?}` | `{project_id, cuadra, cobertura, descuadre, avisa, aviso, recalcula, abierto}` | `400 INVALID_INPUT project_id` |

Tool expuesta: `aviso-cuadre.avisar` (`toolAvisar` → `_avisar`).

## Reglas de negocio

1. **NO recalcula la métrica**: `recalcula:false` siempre. La métrica del cuadre
   (`cuadra`, `cobertura`, `descuadre`) llega declarada; el juicio vive en su dueño.
2. **Umbral de aviso**: si `cuadra === false` **o** falta cobertura → `avisa:true`,
   publica `contabilidad.cuadre_no_cuadra` y sube `motor-avisos.producir.request`
   (K2).
3. **Silencio legítimo**: si cuadra **y** hay cobertura → `avisa:false`, **no se
   inventa un aviso**.
4. **Sin métrica no se finge**: se declara **ABIERTO**.
5. **Puente stateless**: no persiste.
6. **Sin `project_id`** → `400 INVALID_INPUT` + `.failed`.
7. **HTTP exacto**: éxito `200`; falta `project_id` → `400`; excepción → `500`.

## Cómo se usa (RPC)

### `avisar` — decidir si hay que avisar del cuadre

```json
{
  "project_id": "e57a318a-...",
  "cuadra": false,
  "cobertura": 0.8,
  "descuadre": 250.0,
  "correlation_id": "abc-123"
}
```
Respuesta `200` (y se publica `contabilidad.cuadre_no_cuadra` + sube a K2):
```json
{ "project_id": "e57a318a-...", "cuadra": false, "cobertura": 0.8, "descuadre": 250.0, "avisa": true, "aviso": { "motivo": "no cuadra", "detalle": { "descuadre": 250.0 } }, "recalcula": false, "abierto": { "metrica": null } }
```
Si cuadra y hay cobertura → `avisa:false` (silencio legítimo). Sin métrica →
`abierto.metrica` declarado.

## Errores y qué significan

- `400 INVALID_INPUT project_id` — falta el proyecto.
- `avisa:false` — cuadra y hay cobertura: silencio legítimo (no es error).
- `200 {abierto.metrica}` — sin métrica no se finge.
- `500 UNKNOWN_ERROR` — excepción no prevista.

## Relación con otras piezas (por EVENTO, nunca import)

- **Hacia delante (publica el hecho)**: `contabilidad.cuadre_no_cuadra` lo escucha
  `motor-avisos` (K2), que produce el aviso. Sube `motor-avisos.producir.request`
  (K2).
- **Hacia atrás**: la métrica del cuadre la provee su dueño (`cuadre-cobro-pago`,
  `conciliacion-bancaria`).
- No importa a nadie.

## Verificación

- **Fichero**: `modules/contabilidad-libro/aviso-cuadre/` (clase `AvisoCuadre extends
  ModuloHibridoReflejo`, `version 'reflejo-0.1.0'`).
- **Eventos**: `grep -F "cuadre_no_cuadra" module.json index.js` y confirmar
  `motor-avisos.producir.request` en `index.js`.
- **Test unitario**: `cuadra:false` → `avisa:true` + `cuadre_no_cuadra`; `cuadra:true`
  con cobertura → `avisa:false`; sin métrica → `abierto.metrica`; sin `project_id` →
  `400`.

## Notas de implementación

- PUENTE stateless: sin `PosPersistencia`.
- Helpers: `_avisar`, `_motivo`, `_detalle`, `toolAvisar`.
