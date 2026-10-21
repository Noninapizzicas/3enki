---
name: canal-distribucion
description: >-
  PUENTE del vertical NICHOS (bloque K): bridge hacia canales externos
  (telegram, whatsapp, email) via bus del core. Formatea contenido por
  canal_tipo y publica al canal correspondiente. Sin estado. Carga este
  módulo cuando el vertical NICHOS necesite enviar un mensaje por un canal
  externo sin acoplarse al proveedor concreto.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: puente
tags: [nichos, puente, canal, distribucion, telegram, whatsapp, email, bloque-k, bus, mqtt]
---

# nichos · canal-distribucion

> **Qué es.** PUENTE (bloque K, #49) del vertical NICHOS. Bridge hacia
> canales externos (telegram, whatsapp, email) que formatea contenido por
> canal_tipo y delega el envío al bridge correspondiente via bus.
>
> Código: `modules/nichos/canal-distribucion/index.js`. La verdad viva es
> el código; esta skill es la referencia de uso.

---

## Forma Enki

- Patrón: **PUENTE** (bridge de canales de comunicación).
- Base: `ModuloHibridoReflejo` (mitad REFLEJO, JS determinista).
- Sin estado. Bridge puro: transforma contenido y reenvía al canal.
- No hace HTTP directo: toda comunicación se delega al bus.

## Eventos

### Atiende (request -> response)

| Evento | Handler | Qué hace |
|---|---|---|
| `nichos.canal.mensaje.enviar.request` | `onEnviarRequest` | Formatea contenido por canal_tipo y publica al bridge. Payload: `{destinatario, canal_tipo, contenido}` |

### Payload de `.enviar.request`

```json
{
  "request_id": "uuid",
  "destinatario": "chat_123",
  "canal_tipo": "telegram",
  "contenido": { "cuerpo": "Novedades en tu nicho.", "asunto": "Avance" },
  "correlation_id": "corr_yyy"
}
```

### Pulsos que emite

| Evento | Cuándo | Payload |
|---|---|---|
| `nichos.canal.mensaje.enviado` | tras envío exitoso | `{mensaje_id, canal_tipo, destinatario}` |
| `nichos.canal.mensaje.enviar.failed` | fallo al enviar | `{mensaje_id, razon_codigo, detalle}` |

## Cuándo se usa

- Cualquier módulo del vertical que necesite enviar un mensaje por un canal
  externo sin acoplarse al proveedor.
- Complementa a G1 (puerto-canal) como puerta de salida del bloque K.

## Integración (patrón RPC del bus)

```javascript
// ENVIAR
const resp = await bus.publishAndWait('nichos.canal.mensaje.enviar.request', {
  destinatario: 'chat_123',
  canal_tipo: 'telegram',
  contenido: { cuerpo: 'Novedades en tu nicho.' }
});
const { mensaje_id, estado } = resp.data;
```

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `destinatario`, `canal_tipo` o `contenido` |
| 400 | `CANAL_NO_SOPORTADO` | canal_tipo fuera del catálogo (`telegram`, `whatsapp`, `email`) |
| 502 | `ENVIO_FALLIDO` | error al publicar al bridge del canal |
