---
name: ratificacion-regla-aprendida
description: >-
  Skill FULL del módulo PUENTE STATELESS `ratificacion-regla-aprendida` de la vertical
  contabilidad (Enki). EL GATE HUMANO ÚNICO para A6.2 (contrapartida-asistida) y E8
  (regla-movimiento-bancario): una regla APRENDIDA no actúa sobre el volumen hasta que el ASESOR
  la ratifica o la bloquea. `ratificar` (ORDEN, panel) registra la decisión (RATIFICADA actúa /
  BLOQUEADA no actúa) con su autor y fecha, y ANUNCIA el hecho de dominio
  `contabilidad.regla_ratificada` para que los consumidores la apliquen o la dejen inerte. Sin
  decisión declarada NO se asume ratificación. No persiste el cuerpo de las reglas.
when-to-use: >-
  - Cuando el asesor deba ratificar o bloquear una regla aprendida antes de que opere
    (RPC ratificacion-regla-aprendida.ratificar.request).
  - Cuando depures por qué una regla no actúa (no se emitió contabilidad.regla_ratificada, o
    `actua:false`), o por qué se rechaza (400 INVALID_INPUT por `regla`/`decision` ausente).
  - Cuando quieras entender su contrato de eventos y su hecho contabilidad.regla_ratificada.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, puente, stateless, contabilidad, libro, gate, asesor, regla-aprendida]
---

# ratificacion-regla-aprendida — PUENTE del gate humano

## Qué hace el módulo

`ratificacion-regla-aprendida` es un **PUENTE** (L10, hoja del plan), stateless. Es **el gate
humano ÚNICO**: una regla APRENDIDA (por A6.2 `contrapartida-asistida` o por E8
`regla-movimiento-bancario`) **NO actúa** sobre el volumen hasta que el **ASESOR** la
**RATIFICA**. Esta pieza es el único punto donde el humano **ratifica** o **bloquea** una regla
antes de que empiece a operar: mientras no haya ratificación, la regla no actúa.

- **RATIFICADA** → puede actuar (`actua:true`).
- **BLOQUEADA** → no actúa (`actua:false`).

El acto queda con su autor (`por`) y su fecha (`en`), y se **ANUNCIA** el hecho de dominio
`contabilidad.regla_ratificada` para que los consumidores (`regla-contrapartida` E8,
`regla-movimiento-bancario`) la apliquen o la dejen inerte.

Es **PUENTE, no custodio**: **NO persiste el cuerpo de las reglas** (eso es de quien las
aprende); su cara es el acto de ratificación y el hecho que anuncia (el acto es efímero y
correlado). Invariante: **dato ausente = desconocido** — sin una DECISIÓN declarada no hay
pronunciamiento (no se asume ratificación). Su RPC es **CLASE ORDEN** → lleva panel.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `ratificacion-regla-aprendida.ratificar.request` | `onRatificarRequest` | RPC puente (**ORDEN**, panel): `{project_id, regla, decision:'RATIFICAR'\|'BLOQUEAR', rol?}` → `{project_id, regla, decision, actua, por, en, pendiente:false, abierto}`. El asesor se pronuncia sobre una regla aprendida; RATIFICADA opera, BLOQUEADA no. Publica `contabilidad.regla_ratificada`. Responde por `.ratificar.response`. |

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.regla_ratificada` | Fire-and-forget (L10): el asesor se pronunció sobre una regla aprendida → `{project_id, regla, decision, actua, por, en}`. Lo consumen `regla-contrapartida` (E8) y `regla-movimiento-bancario`: **solo la regla con `actua:true` opera** sobre el volumen. |
| `ratificacion-regla-aprendida.ratificar.response` | Respuesta RPC correlada de la op `ratificar`. |
| `ratificacion-regla-aprendida.ratificar.failed` | Fallo determinista: falta `project_id`, `regla` o `decision` (o decisión desconocida). |

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `ratificar` | **ORDEN** (panel) | `{project_id, regla\|regla_id, decision, rol?\|por?}` | `{project_id, tipo, regla, decision, actua, por, en, pendiente:false, abierto}` | 400 `INVALID_INPUT` (`project_id`/`regla`/`decision`) |

## Reglas de negocio (lo que el código IMPONE)

1. **Sin `project_id`** → `_invalid('project_id')`; **sin `regla`** (ni `regla_id`) →
   `_invalid('regla')`; **sin decisión válida** → `_invalid('decision')`.
2. **Normalización de la decisión** (`_decision`):
   - RATIFICAR → `RATIFICADA`: `RATIFICAR, RATIFICADA, RATIFICADO, APROBAR, APROBADA, ACTUA`.
   - BLOQUEAR → `BLOQUEADA`: `BLOQUEAR, BLOQUEADA, BLOQUEADO, RECHAZAR, RECHAZADA, NO_ACTUA`.
   - Cualquier otra / ausente → `null` → `400 INVALID_INPUT decision`.
3. **`actua = (decision === 'RATIFICADA')`**: solo la ratificada opera sobre el volumen.
4. **`por`**: de `input.rol` o `input.por`. Ausente → `null` y `abierto.por` declarado (`'el
   acto no declaro su autor (rol/por): se anota el hueco, no se inventa quien'`).
5. **`pendiente:false`**: el acto del asesor zanja la pendencia.
6. **NO persiste**: el puente no guarda las reglas; solo registra y anuncia el acto.

## Cómo se usa (RPC)

### Ratificar una regla

```json
{ "project_id": "e57a318a-...", "regla": "regla-cruce-4400-400", "decision": "RATIFICAR", "rol": "ASESOR", "correlation_id": "abc-6" }
```
Respuesta `200` + `contabilidad.regla_ratificada`:
```json
{ "project_id": "e57a318a-...", "tipo": "ratificacion-regla-aprendida", "regla": "regla-cruce-4400-400", "decision": "RATIFICADA", "actua": true, "por": "ASESOR", "en": "2026-10-01T...", "pendiente": false, "abierto": { "por": null } }
```

### Bloquear

```json
{ "project_id": "e57a318a-...", "regla": "r-7", "decision": "BLOQUEAR" }
```
Respuesta `200`: `decision:'BLOQUEADA'`, `actua:false`, `abierto.por` declarado (sin autor).

### Fallo — sin decisión

```json
{ "project_id": "e57a318a-...", "regla": "r-7" }
```
Respuesta `400` + `ratificacion-regla-aprendida.ratificar.failed` (`INVALID_INPUT`, field
`decision`).

## Errores y qué significan

| Código | Cuándo |
|---|---|
| `400 INVALID_INPUT` (`project_id`) | falta `project_id`. |
| `400 INVALID_INPUT` (`regla`) | falta `regla`/`regla_id`. |
| `400 INVALID_INPUT` (`decision`) | falta o es desconocida. |
| `500 UNKNOWN_ERROR` | excepción dentro de `_atender`. |

## Relación con otras piezas

- **Depende de:** — (raíz; nadie). Bases: `_shared/modulo-hibrido-reflejo` + `filesystem` +
  `project-manager`.
- **De quién depende:** quien APRENDE la regla (A6.2 `contrapartida-asistida`, E8
  `regla-movimiento-bancario`) la propone; este gate la ratifica.
- **Quién la consume por evento:** `regla-contrapartida` (E8) y `regla-movimiento-bancario`:
  solo `actua:true` opera.
- **Deps por EVENTO, nunca import.**

## Verificación

1. Ficheros en disco: `modules/contabilidad-libro/ratificacion-regla-aprendida/module.json` + `index.js`.
2. Smoke: `ratificar` con `decision:'RATIFICAR'` → 200, `actua:true` +
   `contabilidad.regla_ratificada`.
3. `decision:'BLOQUEAR'` → `actua:false`.
4. Decisión desconocida/ausente → 400 + `.ratificar.failed`.
5. `grep -E '"event"' module.json`.

## Notas de implementación

- Clase `RatificacionReglaAprendida extends ModuloHibridoReflejo`; `name =
  'ratificacion-regla-aprendida'`, `version = 'reflejo-0.1.0'`. **Sin store propio** (stateless).
- Set `RATIFICAR`/`BLOQUEAR` normalizan la decisión a `RATIFICADA`/`BLOQUEADA`.
- `onRatificarRequest` delega en `_atender`; publica `contabilidad.regla_ratificada` si 200, si
  no `.ratificar.failed`. Proyección `_ratificar`; helper `_decision`; tool `toolRatificar`.
