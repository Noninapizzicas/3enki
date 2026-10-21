---
name: puente-humano
description: >-
  PUENTE del vertical NICHOS: bridge hacia el dueño humano. Traduce solicitudes
  de decisión del sistema al canal del dueño, formatea la pregunta con opciones
  y re-emite la respuesta por el bus para que el flujo original continúe.
  Sin estado propio. Carga este módulo cuando el vertical necesite alzar una
  decisión al dueño humano, cuando otro módulo quiera reaccionar al PULSO
  nichos.puente.humano.alzado, o cuando la respuesta del dueño
  (nichos.decision.solicitud.respondida) deba re-emitirse al flujo original.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: puente
tags: [nichos, puente, humano, decision, canal-dueno, bus, mqtt]
---

# nichos · puente-humano

> **Qué es.** PUENTE (bridge hacia el dueño humano) del vertical NICHOS.
> Traduce solicitudes de decisión del sistema al canal del dueño: formatea
> la pregunta con opciones y emite solicitud de decisión al bus. Cuando el
> dueño responde, re-emite por el bus para que el flujo original continúe.
>
> Código: `modules/nichos/puente-humano/index.js`. La verdad viva es
> el código; esta skill es la referencia de uso.

---

## Forma Enki

- Patrón: **PUENTE** (bridge entre bus y mundo externo — el canal del dueño).
- Base: `ModuloHibridoReflejo`.
- Sin estado propio.

## Eventos que atiende (request → response)

| Evento | Handler | Qué devuelve |
|---|---|---|
| `nichos.puente.humano.alzar.request` | `onAlzarRequest` | `{status:200, data:{solicitud_id}}` |

### Payload de `.alzar.request`

```json
{
  "request_id": "uuid",
  "id_nicho": "nicho_xxx",
  "contexto": "El candidato X tiene margen alto pero competencia fuerte",
  "pregunta": "¿Procedemos con la construcción del nicho?",
  "opciones": ["SI", "NO", "APLAZAR"]
}
```

## Señales que escucha (fire-and-forget)

- `nichos.decision.solicitud.respondida` → `onSolicitudRespondida` — re-emite
  por el bus para que el flujo original continúe.

## Pulsos que emite

| Evento | Cuándo | Payload |
|---|---|---|
| `nichos.puente.humano.alzado` | tras alzar la solicitud al canal del dueño | `{id_nicho, solicitud_id, pregunta, timestamp}` |
| `nichos.decision.solicitud.abierta` | al emitir la solicitud de decisión al bus | `{solicitud_id, tipo, contexto, opciones, pregunta, id_nicho, timestamp}` |

## Proyección

- `_alzar(input)` — formatea pregunta + opciones para el canal humano. Genera
  `solicitud_id`, emite `.solicitud.abierta` y pulsa `.alzado`.

## Invariantes

- **Sin estado**: no persiste nada. Cada solicitud es independiente.
- **Formato legible**: la pregunta se formatea con contexto y opciones numeradas
  para que el canal (Telegram, WhatsApp, etc.) la presente de forma clara.

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `id_nicho` o `pregunta` |

## Integración (patrón RPC del bus)

```javascript
// ALZAR decisión al dueño
const resp = await bus.publishAndWait('nichos.puente.humano.alzar.request', {
  id_nicho: 'nicho_xxx',
  contexto: 'Margen alto, competencia fuerte',
  pregunta: '¿Procedemos con la construcción?',
  opciones: ['SI', 'NO', 'APLAZAR']
});
const { solicitud_id } = resp.data;
```

## Dónde encaja en el vertical NICHOS

- **Bloque F — decisiones**: es el bridge entre las solicitudes de decisión
  internas y el canal del dueño humano. Lo invocan el jefe (K), el gate de
  arranque y cualquier módulo que necesite una decisión humana.
- Depende de `cola-decisiones` (F7a) que encola la solicitud, y de
  `puerto-canal` (G1) que la hace llegar al canal concreto.
