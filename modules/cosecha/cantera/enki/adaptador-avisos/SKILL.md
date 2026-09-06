---
name: adaptador-avisos
description: Skill FULL del módulo PUENTE adaptador-avisos del proyecto 3D (taller personal de impresión 3D). Recibe el evento de aviso, construye el mensaje (CONVERSOR interno _construirMensaje) y lo envía por el canal del dueño (telegram-bridge) con ack. Tipos de aviso: terminado, cambio_filamento, fallo, cola_vacia, filamento_bajo. Nadie da por hecho el envío sin ok:true explícito del proveedor.
when-to-use: Cuando necesites operar, depurar, extender o verificar el módulo adaptador-avisos del proyecto 3D — el puente que notifica al dueño por Telegram los avisos del taller (fin de impresión, cambio de filamento, fallo, cola vacía, filamento bajo). También para entender cómo un PUENTE transporta por un canal externo con ack y cierra su círculo con un par de fallo.
tags: [enki, modulo, puente, 3d, avisos, telegram, reflejo, proyecto-3d]
---

# adaptador-avisos — PUENTE de avisos del taller 3D

## Qué hace el módulo

`adaptador-avisos` es un **PUENTE** del proyecto 3D (taller personal de impresión 3D, impresora SPARKX i7). Su trabajo es **transportar avisos al dueño por Telegram**, no decidir ni persistir.

- Escucha el evento de aviso por dos vías:
  - **RPC** `adaptador-avisos.enviar.request` → responde `adaptador-avisos.enviar.response`.
  - **Fire-and-forget** `aviso.solicitar` (cualquier pieza del sistema pide un aviso) → lo construye y lo envía; si falla, emite `adaptador-avisos.enviar.failed`.
- Genera el mensaje con el **CONVERSOR interno** `_construirMensaje` (pieza 4.1, template por tipo).
- Lo envía por el canal del dueño (**telegram-bridge**: `telegram.send_message.request` con ack).
- Es **PUENTE**: sin store, no persiste, transporta y delega.

**Regla de cierre de círculo (honestidad M11):** nadie da por hecho el envío sin `ok:true` explícito del proveedor. Si el canal no confirma, emite `adaptador-avisos.enviar.failed`. Todo flujo cierra su círculo.

## Contrato de eventos (module.json real)

### Subscribes
| Evento | Handler | Descripción |
|---|---|---|
| `adaptador-avisos.enviar.request` | `onEnviarRequest` | Reflejo JS: envía un aviso por el canal del dueño (telegram-bridge) con ack; responde `adaptador-avisos.enviar.response`. |
| `aviso.solicitar` | `onAvisoSolicitar` | Reflejo JS: fire-and-forget de cualquier pieza que pide un aviso; lo construye y lo envía por el canal. |

### Publishes
| Evento | Descripción |
|---|---|
| `adaptador-avisos.enviar.response` | Respuesta RPC: resultado del envío (`ok:true` solo si el canal confirmó). |
| `adaptador-avisos.enviar.failed` | Par de fallo: el envío no se completó (canal no confirmó o aviso inválido). |

### Dependencias de canal (RPC saliente)
- `telegram.send_message.request` → espera `telegram.send_message.response` con `ok:true` (ack). Timeout 30s, best-effort: si no llega, `false`.

## Cómo se usa (RPCs)

### `adaptador-avisos.enviar.request`
Envía un aviso por el canal del dueño. Payload de entrada:
```json
{
  "project_id": "e57a318a-...",   // obligatorio
  "tipo": "terminado",            // uno de _tiposAviso()
  "nombre": "Soporte",            // opcional, nombre/modelo de la pieza
  "material": "PLA",              // opcional
  "detalle": "texto libre",       // opcional
  "canal": "telegram",            // opcional, por defecto "telegram"
  "botName": null,                // opcional, para telegram-bridge
  "chatId": 123456,               // opcional, para telegram-bridge
  "aviso_id": "uuid",             // opcional, se genera si no viene
  "correlation_id": "..."         // opcional
}
```
Respuesta `200`:
```json
{ "status": 200, "data": { "aviso_id": "...", "tipo": "terminado", "canal": "telegram", "enviado": true, "timestamp": "..." } }
```

### `aviso.solicitar` (fire-and-forget)
Cualquier pieza publica este evento con el mismo payload. El módulo lo construye y envía; si el envío falla (`status >= 400`), emite `adaptador-avisos.enviar.failed` con `{ aviso_id, tipo, project_id, error, correlation_id, timestamp }`.

## Reglas de negocio

### Tipos de aviso (pieza 4.3 — enum `_tiposAviso()`)
`['terminado', 'cambio_filamento', 'fallo', 'cola_vacia', 'filamento_bajo']`

Títulos por tipo (pieza 4.1 — `_titulo`):
| tipo | título |
|---|---|
| `terminado` | Impresion terminada |
| `cambio_filamento` | Cambia el filamento |
| `fallo` | Fallo en la impresion |
| `cola_vacia` | Cola de impresion vacia |
| `filamento_bajo` | Filamento bajo |
| (default) | Aviso |

### Generar mensaje (`_construirMensaje`)
Template determinista por tipo:
```
[Taller 3D] <título del tipo>
Pieza: <nombre>          // solo si nombre/modelo_nombre presente
Material: <material>     // solo si material presente
<detalle>                // solo si detalle/mensaje presente
```
**Invariante 5 — dato ausente nombrado, nunca inventado:** si no hay nombre, material o detalle, esas líneas se **omiten** del mensaje (no se inventa un valor). `desconocido` solo se usa como fallback del nombre/material cuando el input no trae valor.

### Enviar por canal con ack (`_enviar`)
1. Valida `project_id` → si falta, `INVALID_INPUT` (400).
2. Valida `tipo` contra `_tiposAviso()` → si no, `INVALID_INPUT` (400).
3. Genera `aviso_id` si no viene.
4. Construye el mensaje.
5. Envía por el canal:
   - `telegram` → `_enviarTelegram` (RPC `telegram.send_message.request`, espera ack `ok:true`). Si no confirma → `502 CANAL_NO_CONFIRMO`.
   - cualquier otro canal → `INVALID_INPUT` (400) "canal no soportado".
6. Si todo ok → `200` con `enviado:true` y métrica `adaptador-avisos.reflejo.enviado`.

### Panel de estado (`_verPanel`, pieza 13.1)
Lee cola + filamento + estado por RPC en paralelo:
- `cola.longitud.request`
- `filamento.listar.request`
- `adaptador-impresora.observar_estado.request`

**Best-effort:** si un proveedor no responde, el hueco es `'desconocido'` (nunca inventado). Requiere `project_id`.

## Verificación (test unitario)

Suite: `tests/unit/adaptador-avisos__enviar.test.js`. Sin bus real: `_enviar` se invoca directa con un `eventBus` fake que simula el ack de `telegram.send_message.response` correlado por `request_id`.

```bash
node /tmp/adaptador-avisos/tests/unit/adaptador-avisos__enviar.test.js
```

Casos que fija el contrato:
- aviso válido + canal confirma (`ok:true`) → `200`, `enviado:true`, genera `aviso_id`.
- aviso válido + canal NO confirma → `502 CANAL_NO_CONFIRMO`.
- sin `project_id` → `400 INVALID_INPUT`.
- tipo no reconocido → `400 INVALID_INPUT`.
- canal no soportado → `400 INVALID_INPUT`.
- `_construirMensaje` genera el template correcto por tipo; sin nombre/material **no** inventa esas líneas.
- `_tiposAviso` enumera exactamente los 5 tipos.
- `aviso.solicitar` con canal que no confirma → emite `adaptador-avisos.enviar.failed`.

## Pitfalls
- **Nunca dar por hecho el envío sin `ok:true`.** El ack del canal es la única prueba de entrega; si no llega, es `CANAL_NO_CONFIRMO` (502) y se emite `enviar.failed`.
- **No inventar datos ausentes.** El mensaje omite las líneas sin valor; `desconocido` es solo fallback del nombre/material.
- **Es PUENTE, no CUSTODIO.** No tiene store, no persiste, no decide. No añadir estado ni lógica de negocio de decisión aquí.
- **`_verPanel` es best-effort** — un proveedor caído devuelve `'desconocido'`, no rompe el panel.
- **Canal no soportado** (p. ej. `discord`) → `400`, no se intenta enviar.
