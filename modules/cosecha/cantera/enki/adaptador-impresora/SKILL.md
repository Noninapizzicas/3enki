---
name: adaptador-impresora
description: >
  Skill FULL del módulo PUENTE `adaptador-impresora` del proyecto 3D (taller de
  impresión 3D, impresora SPARKX i7 vía Moonraker). Sube gcode, inicia la
  impresión y observa el estado por stream push (WebSocket, sin polling),
  interpretando el estado crudo a `estado_sistema`. Úsala para operar, depurar
  o extender el puente con la impresora, o para entender su contrato de eventos
  y sus reglas de negocio.
when-to-use: >
  - Cuando necesites subir gcode, iniciar una impresión u observar el estado de
    la impresora 3D desde el sistema Enki.
  - Cuando depures por qué no se sube un gcode, no arranca una impresión o el
    estado llega mal interpretado.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las
    reglas de negocio del puente con la impresora.
  - Cuando vayas a cablear el puerto de la impresora (thin PC del dueño) o a
    escribir/ampliar el test unitario.
tags: [enki, modulo, puente, impresora-3d, moonraker, gcode, websocket, proyecto-3d]
---

# adaptador-impresora — PUENTE con la impresora 3D

## Qué hace el módulo

`adaptador-impresora` es un **PUENTE** (frontera de transporte) hacia la
impresora 3D **SPARKX i7** (Moonraker). **Transporta, no decide, no persiste**:
no tiene store ni PosPersistencia. Es la pieza que conecta el sistema Enki con
el hardware físico.

El puerto de la impresora se **inyecta** desde fuera (el thin PC del dueño lo
cablea) vía `registrarImpresora()`:

```js
registrarImpresora({
  subirGcode(gcode)        -> Promise<{ ok, id }>,
  iniciarImpresion()       -> Promise<{ ok }>,
  observarEstado(onPush)   -> Promise<{ ok, unsubscribe }>
})
```

La impresora reporta por **PUSH (WebSocket, sin polling)**. El adaptador
interpreta el estado crudo → `estado_sistema` (CONVERSOR interno
`_interpretarEstado`, pieza 9.4 del diseño).

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `adaptador-impresora.subir_gcode.request` | `onSubirGcodeRequest` | Sube un gcode a la impresora y devuelve confirmación. |
| `adaptador-impresora.iniciar_impresion.request` | `onIniciarImpresionRequest` | Inicia la impresión del gcode ya subido y devuelve confirmación. |
| `adaptador-impresora.observar_estado.request` | `onObservarEstadoRequest` | Abre el stream de estado (push) y entrega `estado_crudo` interpretado. |

### Publishes

| Evento | Descripción |
|---|---|
| `adaptador-impresora.estado_crudo` | Estado crudo de la impresora + `estado_sistema` interpretado, emitido por cada push del stream. |
| `subir_gcode.failed` | Par de fallo: no se pudo subir el gcode. |
| `iniciar_impresion.failed` | Par de fallo: no se pudo iniciar la impresión (también se usa para fallos de apertura de stream). |

> **Regla de cierre de círculo**: todo flujo cierra su círculo con un par de
> fallo canónico (`*.failed`). Nadie da por hecho un envío sin `ok:true`
> explícito del proveedor (honestidad M11).

## Cómo se usa (RPCs)

El consumidor principal es `ciclo-impresion` (el orquestador). Los tres RPCs
se invocan como request/response y responden en `*.response`:

### 1. `subir_gcode` — subir gcode a la impresora

```json
{ "project_id": "e57a318a-...", "gcode": "G28\nG1 X0 Y0 Z0" }
```

Respuesta `200`:
```json
{ "ok": true, "id": "gcode-1", "confirmado": true }
```

### 2. `iniciar_impresion` — iniciar la impresión del gcode ya subido

```json
{ "project_id": "e57a318a-..." }
```

Respuesta `200`:
```json
{ "ok": true, "confirmado": true }
```

### 3. `observar_estado` — abrir el stream de estado (push, sin polling)

```json
{ "project_id": "e57a318a-..." }
```

Respuesta `200`:
```json
{ "ok": true, "stream": "abierto" }
```

A partir de aquí, cada push de la impresora emite
`adaptador-impresora.estado_crudo` con `{ project_id, crudo, estado_sistema }`.
Si el stream ya está abierto, responde `{ ok: true, stream: "ya_abierto" }`
(idempotente, no abre un segundo stream).

## Reglas de negocio

1. **El gcode no puede estar vacío** — si `gcode` falta, no es string o está en
   blanco → `400 INVALID_INPUT` + `subir_gcode.failed` con `motivo: 'gcode_vacio'`.
2. **La impresora debe estar configurada** — si no se inyectó el puerto →
   `503 UPSTREAM_UNREACHABLE` + `*.failed` con `motivo: 'impresora_no_configurada'`.
3. **Confirmación explícita** — si el puerto responde sin `ok:true` →
   `502 UPSTREAM_INVALID_RESPONSE` + `*.failed` con `motivo: 'impresora_rechazo'`
   (subida) o `'stream_rechazado'` (stream). Nunca se asume éxito sin `ok:true`.
4. **Observar estado es por PUSH, sin polling** — el adaptador abre el stream
   una vez y entrega `estado_crudo` en cada push. No hay sondeo periódico.
5. **Stream idempotente** — si `_streamAbierto` es true, no reabre; responde
   `stream: 'ya_abierto'`.
6. **Interpretación de estado crudo → `estado_sistema`** (CONVERSOR interno
   `_interpretarEstado`, pieza 9.4). Mapeo:
   - `print_stats.state === 'paused'` **o** `pause_resume.is_paused === true` → `pausado`
   - `print_stats.state === 'printing'` → `imprimiendo`
   - `print_stats.state === 'complete'` → `completado`
   - `print_stats.state === 'error'` → `fallo`
   - cualquier otro (`standby`, `idle`, `ready`, `desconocido`, crudo vacío) → `desconectado`
7. **Dato ausente nombrado, nunca inventado** — los campos que no llegan se
   entregan como `null` (no se inventan valores). Los números se redondean
   (progress a 4 decimales; filament_used, duraciones y temperaturas a 2).

### Campos crudos que interpreta (Moonraker)

| Fuente cruda | Campos |
|---|---|
| `print_stats` | `state`, `filament_used` (mm), `print_duration`, `total_duration`, `current_layer`, `total_layer` |
| `virtual_sdcard` | `progress` (0–1) |
| `filament_switch_sensor` | `filament_detected` |
| `idle_timeout` | `state` |
| `extruder` | `temperature`, `target` |
| `heater_bed` | `temperature`, `target` |
| `pause_resume` | `is_paused` |

### `estado_sistema` de salida

```json
{
  "estado": "imprimiendo | completado | fallo | pausado | desconectado",
  "progress": 0.3,
  "filament_used_mm": 123.46,
  "print_duration": 60.0,
  "total_duration": 120.0,
  "current_layer": 3,
  "total_layer": 10,
  "filament_detected": true,
  "extruder_temp": 200.5,
  "extruder_target": 210.0,
  "bed_temp": 55.0,
  "bed_target": 60.0,
  "idle_state": "Idle"
}
```

## Verificación (test unitario)

El test vive en `tests/unit/adaptador-impresora__puente.test.js`. Usa stubs
(eventBus, logger, metrics) y una impresora fake que reporta por push. Cubre:

- `subir_gcode` ok → `200` + confirmación + sin `subir_gcode.failed`.
- `subir_gcode` gcode vacío → `400` + `subir_gcode.failed` (`gcode_vacio`).
- `subir_gcode` sin impresora → `503` + `failed` (`impresora_no_configurada`).
- `subir_gcode` impresora rechaza → `502` + `failed` (`impresora_rechazo`).
- `iniciar_impresion` ok → confirmación; sin impresora → `503` + `failed`.
- `observar_estado` abre stream y emite `estado_crudo` interpretado por push
  (estado `imprimiendo`, progress, filament_used_mm, current_layer,
  filament_detected).
- `observar_estado` sin impresora → `503` + `failed`.
- `_interpretarEstado`: `complete`→`completado`, `error`→`fallo`,
  `paused`/`is_paused`→`pausado`, `standby`/`idle`/`ready`→`desconectado`,
  crudo vacío→`desconectado` con huecos `null`.
- Handlers delegan en `_atender` con 4 args y `name`/`version` correctos.

Para ejecutarlo:

```bash
cd /opt/enki/modules/adaptador-impresora
node tests/unit/adaptador-impresora__puente.test.js
# esperado: adaptador-impresora: N/N OK
```

## Notas de implementación

- Clase `AdaptadorImpresoraReflejo extends ModuloHibridoReflejo`; `name =
  'adaptador-impresora'`, `version = 'reflejo-0.1.0'`.
- Sin store ni persistencia: es frontera de transporte.
- Los handlers RPC son una línea y delegan en `_atender(e, accion, response,
  fn)`.
- El puerto de la impresora se inyecta con `registrarImpresora()` (valida que
  tenga `subirGcode`, `iniciarImpresion` y `observarEstado` como funciones).
- `_publicarEvento` añade `timestamp` ISO a cada evento publicado.
- El par de fallo `iniciar_impresion.failed` se reutiliza también para fallos
  de apertura del stream de estado (comportamiento real del módulo).
