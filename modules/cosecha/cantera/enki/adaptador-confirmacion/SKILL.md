---
name: adaptador-confirmacion
description: Skill FULL del módulo PUENTE adaptador-confirmacion del proyecto 3D (taller personal de impresión 3D). Recibe la confirmación del dueño por Telegram (retirar pieza, cambiar filamento, reanudar ciclo, aprobar/rechazar modelo), la interpreta con el conversor interno _interpretarConfirmacion y la entrega al sistema publicando adaptador-confirmacion.confirmacion_recibida. Úsala para operar, depurar o extender el puente de confirmación del dueño.
when-to-use: Cuando necesites entender, invocar, depurar o extender el módulo adaptador-confirmacion del proyecto 3D — el puente que traduce la confirmación del dueño (por Telegram) en eventos de dominio para el ciclo de impresión.
tags: [enki, modulo, puente, 3d, impresion, confirmacion, telegram, reflejo, conversor]
---

# adaptador-confirmacion — PUENTE de confirmación del dueño (proyecto 3D)

## Qué hace el módulo

`adaptador-confirmacion` es un **PUENTE** del taller personal de impresión 3D
(proyecto `3d`, id `e57a318a-b93a-46d9-8ae6-fd5bd0384964`). Su único trabajo es
**recibir la confirmación del dueño por Telegram, interpretarla y entregarla al
sistema**. No decide, no persiste, no tiene store: transporta y delega.

El dueño confirma **5 tipos** de decisión humana (el sistema es 100%
determinista, 0 piezas fuzzy — el dueño aporta todo el juicio):

| Tipo | Significado | Cuándo se pide |
|---|---|---|
| `pieza_retirada` | El dueño retiró la pieza terminada | Tras `impresion.completada` (estado `ESPERANDO_RETIRADA`) |
| `filamento_cambiado` | El dueño cambió el filamento | Tras `filamento.falta` (estado `PAUSADO_FALTA_FILAMENTO`) |
| `reanudar_ciclo` | El dueño quiere reanudar tras un error | Tras `impresion.error` (estado `ERROR`) |
| `modelo_aprobado` | El dueño aprueba un modelo para la cola | Flujo B (aprobación → cola) |
| `modelo_rechazado` | El dueño rechaza un modelo | Flujo B (no entra a la cola) |

**Regla de cierre de círculo**: todo flujo cierra su círculo con un par de
resultado canónico. El ciclo **no encadena la siguiente pieza** hasta recibir
`ok:true` de la confirmación `pieza_retirada`. Nadie da por hecho un envío sin
`ok:true` explícito del canal (honestidad M11).

## Contrato de eventos (module.json real)

### Subscribes

| Evento | Handler | Descripción |
|---|---|---|
| `adaptador-confirmacion.confirmar.request` | `onConfirmarRequest` | RPC: pide al dueño la confirmación de un tipo por el canal; responde `adaptador-confirmacion.confirmar.response`. |
| `telegram.callback.received` | `onTelegramCallbackReceived` | Fire-and-forget del canal del dueño (telegram-bridge): interpreta el callback (botón inline o respuesta libre) y publica `adaptador-confirmacion.confirmacion_recibida`. |

### Publishes

| Evento | Descripción |
|---|---|
| `adaptador-confirmacion.confirmar.response` | Respuesta RPC: resultado de la petición de confirmación (`ok:true` solo si el canal confirmó el envío). |
| `adaptador-confirmacion.confirmacion_recibida` | Confirmación del dueño interpretada y entregada al sistema (tipo + contexto). |
| `adaptador-confirmacion.confirmar.failed` | Par de fallo: la confirmación no se pudo pedir/entregar o el tipo no se reconoció. |

### Dependencias

- `_shared/modulo-hibrido-reflejo` — base del reflejo (patrón `_atender`).
- `telegram-bridge` — canal del dueño. Se usa `telegram.send_message.request`
  (con `inline_keyboard`) y se escucha `telegram.callback.received`.

## Cómo se usa (RPCs)

### 1. Pedir una confirmación al dueño (lo llama `ciclo-impresion`)

Publica `adaptador-confirmacion.confirmar.request`:

```json
{
  "project_id": "e57a318a-b93a-46d9-8ae6-fd5bd0384964",
  "tipo": "pieza_retirada",
  "nombre": "Soporte",
  "detalle": "Pieza terminada, retírala de la cama",
  "canal": "telegram",
  "chatId": 123456789,
  "correlation_id": "abc-123"
}
```

Respuesta `adaptador-confirmacion.confirmar.response`:

- `status 200` + `data: { confirmacion_id, tipo, canal, pedida: true, timestamp }`
  → el canal **confirmó** el envío (`ok:true`).
- `status 502` + `error.code: 'CANAL_NO_CONFIRMO'` → el canal **no** confirmó
  (no se da por hecho el envío).
- `status 400` + `error.code: 'INVALID_INPUT'` → falta `project_id`, tipo no
  reconocido, o canal no soportado (`telegram` es el único soportado).

### 2. Recibir la confirmación del dueño (fire-and-forget)

`telegram-bridge` publica `telegram.callback.received` con el callback del
dueño (botón inline `callback_data` o respuesta libre `text`). El adaptador lo
interpreta y publica `adaptador-confirmacion.confirmacion_recibida`:

```json
{
  "confirmacion_id": "uuid",
  "tipo": "pieza_retirada",
  "contexto": { "confirmacion_id": null, "modelo_id": null, "pieza_id": "p-1", "rollo_id": null, "raw": "pieza_retirada" },
  "project_id": "e57a318a-b93a-46d9-8ae6-fd5bd0384964",
  "correlation_id": "abc-123",
  "timestamp": "2026-09-06T..."
}
```

Si el tipo no se reconoce, emite `adaptador-confirmacion.confirmar.failed` con
`tipo: 'no_reconocida'` (todo flujo cierra su círculo).

## Reglas de negocio

1. **Confirmar retirar pieza** (`pieza_retirada`): el ciclo está en
   `ESPERANDO_RETIRADA`. Solo con esta confirmación el ciclo encadena la
   siguiente pieza. Sin ella, no avanza (invariante 8: el ciclo no presiona al
   dueño, no reimprime ni manda recordatorios).
2. **Cambiar filamento** (`filamento_cambiado`): el ciclo está en
   `PAUSADO_FALTA_FILAMENTO`. Con esta confirmación vuelve a `IMPRIMIENDO`.
3. **Reanudar tras error** (`reanudar_ciclo`): el ciclo está en `ERROR`. La
   reanudación es **siempre manual** (nunca automática, pregunta abierta 9).
4. **Aprobar/rechazar modelo** (`modelo_aprobado` / `modelo_rechazado`): flujo
   B. `modelo_aprobado` → `cola-impresion.entrar` → `cola.entrada`.
   `modelo_rechazado` → no entra a la cola, fin.
5. **Interpretación de confirmación** (`_interpretarConfirmacion`, pieza 12.2,
   CONVERSOR interno): mapea el callback del dueño a un tipo. Acepta tanto el
   `callback_data` del botón como la respuesta libre (`text`/`respuesta`).
   **Dato ausente nombrado, nunca inventado** (invariante 5): si el texto no se
   reconoce → `400 CONFIRMACION_NO_RECONOCIDA` (pide aclaración, no inventa una
   confirmación).
6. **Cierre de círculo**: si la confirmación no se puede pedir/entregar o el
   tipo no se reconoce → `adaptador-confirmacion.confirmar.failed`. El ciclo
   no encadena la siguiente pieza sin `ok:true` de `pieza_retirada`.

### Mapeo botón → tipo (`_mapear`, case-insensitive)

| Entrada (callback_data / texto) | Tipo |
|---|---|
| `retirar`, `pieza_retirada`, `retirada` (o contiene "retirar") | `pieza_retirada` |
| `filamento`, `filamento_cambiado`, `cambiar_filamento` (o contiene "filamento") | `filamento_cambiado` |
| `reanudar`, `reanudar_ciclo` (o contiene "reanudar") | `reanudar_ciclo` |
| `aprobar`, `modelo_aprobado`, `aprobado` (o contiene "aprobar") | `modelo_aprobado` |
| `rechazar`, `modelo_rechazado`, `rechazado` (o contiene "rechazar") | `modelo_rechazado` |
| cualquier otra cosa | `null` → `CONFIRMACION_NO_RECONOCIDA` |

### Botones inline por tipo (`_botones`)

- `pieza_retirada` → `[[Retirar pieza]]`
- `filamento_cambiado` → `[[Filamento cambiado]]`
- `reanudar_ciclo` → `[[Reanudar ciclo]]`
- `modelo_aprobado` → `[[Aprobar][Rechazar]]` (dos botones en la misma fila)
- cualquier otro → `[]`

## Verificación (test unitario)

El test real está en
`/opt/enki/modules/adaptador-confirmacion/tests/unit/adaptador-confirmacion__confirmar.test.js`.
Fija el contrato del reflejo (proyecciones `_confirmar` + `_interpretarConfirmacion`):

- `confirmar` válido + canal confirma (`ok:true`) → `status 200`, `pedida:true`.
- `confirmar` válido + canal NO confirma → `502 CANAL_NO_CONFIRMO`.
- sin `project_id` → `400 INVALID_INPUT`.
- tipo no reconocido → `400 INVALID_INPUT`.
- canal no soportado (`discord`) → `400 INVALID_INPUT`.
- `_interpretarConfirmacion` mapea botón → tipo (los 5 tipos + respuesta libre).
- texto no reconocido → `400 CONFIRMACION_NO_RECONOCIDA`.
- `_tiposConfirmacion()` enumera los 5 tipos.
- `telegram.callback.received` válido → publica `confirmacion_recibida` con tipo + contexto.
- `telegram.callback.received` no reconocido → emite `confirmar.failed` con `tipo: 'no_reconocida'`.

Ejecutar (sin bus real; el test usa un `eventBus` fake que correlaciona
`telegram.send_message.request` → `response` por `request_id`):

```bash
node /opt/enki/modules/adaptador-confirmacion/tests/unit/adaptador-confirmacion__confirmar.test.js
# Salida esperada: [adaptador-confirmacion__confirmar] OK 11/11
```

## Notas de implementación

- Clase `AdaptadorConfirmacionReflejo extends ModuloHibridoReflejo`, `name =
  'adaptador-confirmacion'`, `version = 'reflejo-0.1.0'`.
- Sin store, sin persistencia: es PUENTE puro.
- `_confirmar` valida `project_id`, valida el tipo contra `_tiposConfirmacion()`,
  construye el mensaje (`_construirPeticion` + `_titulo`), pide por
  `telegram.send_message.request` con `inline_keyboard` y espera el ack
  (`telegram.send_message.response`, timeout 30s, best-effort).
- `_pedirTelegram` devuelve `true` solo si `resp.ok === true`.
- `onTelegramCallbackReceived` es fire-and-forget: interpreta y publica
  `confirmacion_recibida`, o `confirmar.failed` si `status >= 400`.
- Métricas: `adaptador-confirmacion.reflejo.pedida` (con `tipo` y `canal`).

## Referencias

- Plan de construcción: `/opt/enki/data/projects/3d/storage/esquemas/plan-construccion.md` (sección 6.11).
- Diseño OOP: `storage/esquemas/diseno-oop.md` (pieza 12.1 Recepción de confirmación, 12.2 Interpretación).
- Patrón de módulo: `arquitectura/cabecera/patron/modulo-real.md` y `modulo-hibrido.md`.
