---
name: estado-presentacion-fiscal
description: >-
  Skill FULL del módulo CUSTODIO CON PERSISTENCIA `estado-presentacion-fiscal` de la
  vertical contabilidad (Enki). Es EL CICLO DE VIDA DE CADA OBLIGACIÓN FISCAL, con un
  solo escritor: `pendiente → generada → presentada → justificada` (y `atrasada` por plazo).
  Guard de rol `ESTADO_PRESENTACION_FISCAL` (otro → 403). Transición válida: saltarse un
  paso → 422 `TRANSICION_INVALIDA`. Idempotente al mismo estado. Append-only de la historia.
  Persiste por proyecto vía PosPersistencia (`/contabilidad/estado-presentacion-fiscal`),
  restaura en `project.activated` y vuelca en `onUnload`. Al avanzar publica
  `contabilidad.obligacion_avanzada`; si queda `atrasada` sube `motor-avisos.producir.request`.
  La op `avanzar` es ORDEN → con ui_handler.
when-to-use: >-
  - Cuando necesites avanzar el estado de una obligación fiscal (RPC estado-presentacion-fiscal.avanzar.request).
  - Cuando depures un 403 (rol distinto), un 422 TRANSICION_INVALIDA (salto de ciclo) o por
    qué no avanza (ya estaba en ese estado → idempotente) o no llega el aviso de atraso.
  - Cuando quieras entender el contrato de eventos y el ciclo declarado del módulo.
  - Cuando vayas a escribir/ampliar su test unitario.
tags: [enki, modulo, custodio, persistencia, contabilidad, fiscal, obligaciones, ciclo-vida, single-writer]
---

# estado-presentacion-fiscal — CUSTODIO del ciclo de vida de las obligaciones fiscales

## Qué hace el módulo

`estado-presentacion-fiscal` es un **CUSTODIO CON PERSISTENCIA** (D12, hoja del plan) de la
vertical **contabilidad**, eje **fiscal**. Lleva **el estado de cada obligación fiscal**
(modelo 303, 390…) a lo largo de su ciclo de vida:

```
pendiente → generada → presentada → justificada        (+ atrasada por plazo)
```

No genera el modelo (eso es `generador-modelo`) ni recoge el acuse (eso es `acuse-presentacion`):
aquí **solo se AVANZA el estado** de la obligación y se anuncia el cambio.

**Invariantes que el código impone:**
- **UN escritor por parcela**: guard de rol `ESTADO_PRESENTACION_FISCAL`; otro rol → `403 PERMISSION_DENIED`.
- **TRANSICIÓN VÁLIDA**: solo se avanza por el orden del ciclo (o a `atrasada`); saltarse un paso
  → `422 TRANSICION_INVALIDA`. No se forcejea el estado.
- **IDEMPOTENTE**: avanzar al **mismo** estado → `avanzada:false, idempotente:true`.
- **APPEND-ONLY de la historia**: cada avance se apila en `historia`; **nada se borra**.
- **Dato ausente = desconocido**: sin clave/modelo se rechaza (no se inventa).

Persiste por proyecto con **PosPersistencia** (storage `/contabilidad/estado-presentacion-fiscal`),
restaura en `project.activated` y vuelca en `onUnload`. La op `avanzar` es **ORDEN** →
`ui_handler` `workspace_module` en `barra_modulos`.

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Qué hace |
|---|---|---|
| `estado-presentacion-fiscal.avanzar.request` | `onAvanzarRequest` | RPC custodio (ORDEN): `{project_id, rol, clave\|obligacion\|modelo, estado, ejercicio?, periodo?}` → `{project_id, obligacion, avanzada, estado_anterior, estado, ciclo}`. Guard de rol, transición válida, idempotencia y append. Al avanzar publica `contabilidad.obligacion_avanzada`; si queda `atrasada` sube `motor-avisos`. Si `status ≠ 200` publica `.failed`. Responde por `estado-presentacion-fiscal.avanzar.response`. |
| `project.activated` | `onProjectActivated` | Restaura el estado fiscal del proyecto activado desde el storage (PosPersistencia). Emitido por el core. |

### Publishes

| Evento | Cuándo |
|---|---|
| `contabilidad.obligacion_avanzada` | Fire-and-forget (D12): una obligación avanzó → `{project_id, clave, modelo, estado, estado_anterior, correlation_id}`. Lo escuchan `acuse-presentacion` (D13) y `rectificacion-declaracion`. |
| `motor-avisos.producir.request` | Solo cuando la obligación queda en estado `atrasada`: `{tipo:'plazo', severidad:'warn', titulo:'Obligacion atrasada: <modelo>', detalle, origen, ref, correlation_id}`. |
| `estado-presentacion-fiscal.avanzar.response` | Respuesta RPC correlada de la op `avanzar` (una sola cara: el bus). |
| `estado-presentacion-fiscal.avanzar.failed` | Par de fallo determinista: falta `project_id`/obligación/estado, estado fuera del ciclo, transición inválida (422) o falta el rol de escritor (403) → `{status, code, message}`. |

> **Sí publica un HECHO** (`contabilidad.obligacion_avanzada`) porque avanzar el estado **es escribir**:
> R2 (escribe → anuncia) obliga a anunciarlo. Además sube el aviso de atraso a motor-avisos.
>
> **NOTA R3 (cadena colgada evitada)**: el plan declara escucha de `contabilidad.modelo_exportado`
> (generador-modelo) y de `contabilidad.declaracion_justificada` (acuse-presentacion) /
> `contabilidad.declaracion_rectificada` (rectificacion-declaracion), pero **ninguno de esos emisores
> existe aún** en el repo → **NO se declaran** en subscribes (evita cadena colgada). Se anotará cuando nazcan.

## Operaciones (RPC)

| Op | Tipo | Entrada | Salida | Errores |
|---|---|---|---|---|
| `avanzar` | **ORDEN** (ui_handler: workspace_module) | `{project_id, rol?, clave?, obligacion?, modelo?, estado, ejercicio?, periodo?}` | `{project_id, obligacion, avanzada, estado_anterior, estado, ciclo, append_only, abierto}`; o idempotente | `403 PERMISSION_DENIED` (rol ≠ escritor); `400 INVALID_INPUT` (falta `project_id` o clave, o estado fuera del ciclo); `422 TRANSICION_INVALIDA` (salto); `500 UNKNOWN_ERROR`. |

## Reglas de negocio

1. **Ciclo declarado (no oculto)**: `CICLO = ['pendiente','generada','presentada','justificada','atrasada']`.
   Un estado fuera del ciclo → `400 INVALID_INPUT` con la lista del ciclo.
2. **Clave de la obligación** (`_clave`): `clave` → `obligacion` → o derivada de
   `modelo[-ejercicio][-periodo]`. Sin ninguna → `400 INVALID_INPUT obligacion|modelo`.
3. **Guard de un solo escritor**: si llega `rol` y no es `ESTADO_PRESENTACION_FISCAL`
   → `403 PERMISSION_DENIED` con `{rol_esperado, rol_recibido}`. Si `rol` es `null` no se
   bloquea (por construcción el canal es el único escritor).
4. **Idempotencia**: si el estado actual ya es el pedido → `200` con `avanzada:false, idempotente:true`,
   sin tocar el store, sin emitir hecho.
5. **Transición válida**: `hacia === desde + 1` o el estado nuevo es `atrasada`
   (alcanzable desde cualquier estado por plazo) o es la creación (obligación nueva a `pendiente`).
   Cualquier salto → `422 TRANSICION_INVALIDA` con `{estado_anterior, estado_nuevo, ciclo}`.
6. **Append-only**: cada avance apila `{clave, de, a, en, rol}` en `historia` y actualiza `updated_at`.
7. **Metadatos de la obligación**: se crea con `clave, modelo, ejercicio, periodo, estado, creada_en`;
   `modelo` ausente se anota en `abierto.modelo` (no se inventa).
8. **HTTP exacto**: éxito `200`; rol inválido → `403`; input inválido → `400`; transición → `422`;
   excepción → `500`.

## Cómo se usa (RPC)

### Avanzar una obligación (escritor válido)

```json
{
  "project_id": "e57a318a-...",
  "rol": "ESTADO_PRESENTACION_FISCAL",
  "modelo": "303",
  "ejercicio": "2026",
  "periodo": "T1",
  "estado": "presentada",
  "correlation_id": "abc-123"
}
```
Respuesta `200` (si venía de `generada`):
```json
{
  "project_id": "e57a318a-...",
  "obligacion": { "clave": "303-2026-T1", "modelo": "303", "ejercicio": "2026", "periodo": "T1", "estado": "presentada", "creada_en": "...", "actualizada_en": "..." },
  "avanzada": true,
  "estado_anterior": "generada",
  "estado": "presentada",
  "ciclo": ["pendiente","generada","presentada","justificada","atrasada"],
  "append_only": true,
  "abierto": { "modelo": null }
}
```
Emite `contabilidad.obligacion_avanzada`.

### Saltarse un paso — se rechaza

`{..., "estado": "justificada"}` viniendo de `pendiente` →
`422 TRANSICION_INVALIDA` + `.failed`:
```json
{ "status": 422, "code": "TRANSICION_INVALIDA", "mensaje": "no se puede saltar de 'pendiente' a 'justificada': el ciclo avanza de uno en uno (o a 'atrasada')", "estado_anterior": "pendiente", "estado_nuevo": "justificada", "ciclo": [...] }
```

### Marcar atrasada — sube aviso

`{..., "estado": "atrasada"}` → `200 avanzada:true` + `contabilidad.obligacion_avanzada`
+ `motor-avisos.producir.request` (`tipo:'plazo'`).

### Rol inválido — 403

```json
{ "project_id": "...", "rol": "OTRO", "clave": "303-2026-T1", "estado": "generada" }
```
→ `403 PERMISSION_DENIED` con `{rol_esperado:'ESTADO_PRESENTACION_FISCAL', rol_recibido:'OTRO'}`.

## Errores y qué significan

| Código | HTTP | Causa |
|---|---|---|
| `PERMISSION_DENIED` | 403 | `rol` declarado distinto de `ESTADO_PRESENTACION_FISCAL`. |
| `INVALID_INPUT` | 400 | Falta `project_id`, falta clave/obligación/modelo, o estado fuera del ciclo. |
| `TRANSICION_INVALIDA` | 422 | Salto de más de un paso del ciclo. |
| `UNKNOWN_ERROR` | 500 | Excepción no controlada. |

## Relación con otras piezas (deps por EVENTO)

- **Restaura con**: `project.activated` (core).
- **Le consumen el hecho** `contabilidad.obligacion_avanzada`: `acuse-presentacion` (D13),
  `rectificacion-declaracion`.
- **Le disparan (previsto)**: `generador-modelo`, `acuse-presentacion`, `rectificacion-declaracion`
  (hoy **no** declarados en subscribes; ver nota R3).
- **Habla con**: `motor-avisos.producir.request` (K2) en atrasos.

## Verificación

1. Fichero: `modules/contabilidad-fiscal/estado-presentacion-fiscal/`.
2. Eventos reales: subscribes `estado-presentacion-fiscal.avanzar.request`, `project.activated`;
   publishes `contabilidad.obligacion_avanzada`, `estado-presentacion-fiscal.avanzar.response`,
   `estado-presentacion-fiscal.avanzar.failed`.
3. Strings en código:
   ```bash
   grep -oE "publish\('[^']*'" modules/contabilidad-fiscal/estado-presentacion-fiscal/index.js
   # → contabilidad.obligacion_avanzada / estado-presentacion-fiscal.avanzar.failed / motor-avisos.producir.request
   ```
4. Persistencia: `PosPersistencia` file `estado-presentacion-fiscal.json`, dir
   `/contabilidad/estado-presentacion-fiscal`, esquema `contabilidad-estado-presentacion-fiscal-v1`.
5. Test unitario (si existe): avanzar válido → 200 + hecho; salto → 422; mismo estado → idempotente;
   rol inválido → 403; `project.activated` restaura; `atrasada` sube aviso.
