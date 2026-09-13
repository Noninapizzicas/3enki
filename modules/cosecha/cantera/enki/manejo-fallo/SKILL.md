---
name: manejo-fallo
description: >
  Skill FULL del módulo REFLEJO `manejo-fallo` del proyecto 3D (taller de impresión 3D,
  una impresora SPARKX i7 que encadena piezas; moneda STL/3MF→GCODE). Al fallar una
  impresión avisa SIEMPRE (adaptador-avisos) y consulta la política al dueño
  (adaptador-confirmacion); reintentar/saltar/decisión abierta, NUNCA decide solo.
  Úsala para operar, depurar o extender el manejo de fallos, o para entender su
  contrato de eventos y sus reglas de negocio.
when-to-use: >
  - Cuando necesites manejar el fallo de una impresión 3D (avisar, reintentar, saltar o
    pedir decisión al dueño).
  - Cuando depures por qué no se avisa de un fallo, por qué no se aplica la política del
    dueño o por qué queda esperando decisión.
  - Cuando quieras entender el contrato de eventos (subscribes/publishes) y las reglas
    de negocio del manejo de fallos (CERO juicio automático).
  - Cuando vayas a escribir/ampliar el test unitario del manejo de fallos.
tags: [enki, modulo, reflejo, impresora-3d, manejo-fallo, fallos, reinicio, avisos, proyecto-3d]
---
# manejo-fallo — REFLEJO que maneja los fallos de impresión 3D

## Qué hace el módulo

`manejo-fallo` es un **REFLEJO puro** (sin store propio, sin persistencia): al fallar
una impresión:

1. **avisa SIEMPRE** (`adaptador-avisos`, fire-and-forget `aviso.solicitar` tipo `fallo`);
2. **consulta la POLÍTICA** del dueño (`adaptador-confirmacion`, SolicitudDecision);
3. **NUNCA decide por su cuenta** (cero juicio).

Política de fallo (configurada por el dueño, **ABIERTO**):
- política `reintentar` (`reintentos_max N`): si `reintentos < max` → **REINTENTAR**;
  si agotados → **SALTAR** (no detener el taller);
- política `saltar` → **SALTAR** siempre (no detener);
- política **ABIERTO** o sin política conocida → **SolicitudDecision** al dueño
  (`adaptador-confirmacion.confirmar.request`) y **ESPERA** (el sistema nunca la sustituye).

Reflejo puro: cada fallo cierra su círculo; si no puede avisar ni resolver, emite
`manejo-fallo.manejar.failed`. CERO juicio: ningún fallo se calla; ninguna acción sin
política conocida del dueño.

## Contrato de eventos (module.json real)

### Subscribes (RPCs request/response)

| Evento | Handler | Descripción |
|---|---|---|
| `manejo-fallo.manejar.request` | `onManejarRequest` | Maneja un fallo: avisa SIEMPRE y decide la acción según la política del dueño (reintentar/saltar); si exige juicio, pide decisión por adaptador-confirmacion. |

### Publishes

| Evento | Descripción |
|---|---|
| `manejo-fallo.manejar.response` | Respuesta correlada: acción de fallo decidida (reintentar/saltar/esperando_decision). |
| `manejo-fallo.manejar.failed` | Par de fallo: no se pudo manejar el fallo. |
| `aviso.solicitar` | (fire-and-forget a adaptador-avisos) notificación de fallo siempre enviada. |

> Nota: `aviso.solicitar` no está en el `module.json` de manejo-fallo pero sí lo publica
> el `index.js` en `_avisar` (fire-and-forget, canal del dueño).

> **Regla de cierre de círculo**: todo fallo cierra su círculo con su par de fallo
> canónico (`manejo-fallo.manejar.failed`) si no puede avisar/resolver.

## Reglas de negocio

1. **AVISAR SIEMPRE**: `_avisar` publica `aviso.solicitar` con `tipo: 'fallo'`,
   `aviso_id`, `nombre`, `detalle` y `correlation_id` (fire-and-forget; el ack lo
   verifica adaptador-avisos). Ningún fallo se calla.
2. **CERO juicio — la acción sale de la política del dueño**: `_manejar` lee
   `input.politica`/`politica_fallo` (o config); sin política conocida → SolicitudDecision.
3. **Política `reintentar`**: si `reintentosActuales < reintentosMax` → REINTENTAR
   (incrementa el contador en memoria); si agotados → SALTAR (no detener el taller).
4. **Política `saltar`**: → SALTAR siempre (no detener).
5. **Política ABIERTO / sin política**: → `_solicitarDecision` pide al dueño por
   `adaptador-confirmacion.confirmar.request` (`tipo: 'reanudar_ciclo'`) y responde
   `{ accion: 'ESPERAR_DECISION', esperando: true }`. El sistema espera, no sustituye.
6. **Reflejo puro**: reintentos en memoria por tarea (`this._reintentos`), sin
   PosPersistencia (es política operativa del día).

## Uso / cómo invocarlo

El consumidor típico es `ciclo-impresion` (`_manejarFallo`) y `panel-trabajador`
(control `reintentar`/`saltar`). RPC request/response:

### 1. `manejar` — manejar un fallo de impresión

```json
{
  "project_id": "e57a318a-...",
  "tarea_id": "tarea_abc",
  "modelo_nombre": "soporte",
  "motivo": "thermal_runaway",
  "politica": "reintentar",
  "reintentos_max": 2
}
```
Respuesta `200` (política del dueño): `{ "accion": "REINTENTAR"|"SALTAR", "reintentos": N, "reintentos_max": M }`
Respuesta `200` (espera al dueño): `{ "accion": "ESPERAR_DECISION", "confirmacion_id": "...", "esperando": true }`
· `400` sin `project_id`.

## Tests

El test vive en `tests/unit/manejo-fallo.test.js`. Cubre (del código real):

- `manejar` política `reintentar` dentro de límites → REINTENTAR e incrementa contador.
- `manejar` política `reintentar` agotado → SALTAR (no detener).
- `manejar` política `saltar` → SALTAR siempre.
- `manejar` sin política (ABIERTO) → SolicitudDecision por `adaptador-confirmacion` y
  responde `ESPERAR_DECISION`.
- `manejar` SIEMPRE emite `aviso.solicitar` (aviso de fallo).
- `manejar` sin `project_id` → `400 INVALID_INPUT`.

Para ejecutarlo:

```bash
cd /home/admin/3enki/modules/manejo-fallo
node tests/unit/manejo-fallo.test.js
# esperado: manejo-fallo: N/N OK
```

## Notas de implementación

- Clase `ManejoFalloReflejo extends ModuloHibridoReflejo`; `name = 'manejo-fallo'`,
  `version = 'reflejo-0.1.0'`; FASE 4 TANDA 4 (última).
- Sin store ni persistencia; `this._reintentos` es un `Map` en memoria por tarea
  (`${pid}:${tarea_id}` → n; `__global__` si no hay tarea).
- `_avisar` publica `aviso.solicitar` (fire-and-forget).
- `_solicitarDecision` llama `_rpc('adaptador-confirmacion.confirmar.request', ...)` con
  timeout 30s.
- Dependencias (module.json): `adaptador-avisos`, `adaptador-confirmacion`,
  `motor-encadenamiento`.
