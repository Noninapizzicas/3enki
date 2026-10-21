---
name: puerto-canal
description: >-
  PUENTE del vertical NICHOS (bloque G · comunicación — G1): fachada de canales
  de comunicación (Telegram, WhatsApp, email) que desacopla al vertical del
  proveedor concreto. Envía mensajes por canal resuelto, registra asociaciones
  canal↔proyecto↔propósito, y recibe mensajes entrantes para el clasificador.
  Carga este módulo cuando el vertical NICHOS necesite enviar o recibir mensajes
  por un canal de comunicación sin acoplarse al proveedor.
fuente: enki
dominio: nichos
lente_dominio: nichos
lente_tarea: puente
tags: [nichos, puente, canal, telegram, whatsapp, email, bloque-g, bus, mqtt, comunicacion]
---

# nichos · puerto-canal

> **Qué es.** PUENTE (bloque G, G1) del vertical NICHOS. Fachada única de
> canales de comunicación que desacopla al vertical del proveedor concreto
> (Telegram, WhatsApp, email).
>
> Código: `modules/nichos/puerto-canal/index.js`. La verdad viva es
> el código; esta skill es la referencia de uso.

---

## Forma Enki

- Patrón: **PUENTE** (fachada de orquestación sobre canales de comunicación).
- Base: `ModuloHibridoReflejo` (mitad REFLEJO, JS determinista).
- Store en memoria: mapa de registros canal↔propósito↔proyecto.
- No hace HTTP directo: toda comunicación se delega al bus (telegram-bridge,
  channel-manager vía bus).

## Eventos

### Atiende (request -> response)

| Evento | Handler | Qué hace |
|---|---|---|
| `nichos.canal.enviar.request` | `onEnviarRequest` | Resuelve canal, delega al bridge y confirma. Payload: `{canal?, destino, mensaje, correlation_id}` |
| `nichos.canal.registrar.request` | `onRegistrarRequest` | Registra canal↔proyecto↔propósito. Payload: `{canal, external_id, project_id, purpose}` |

### Escucha (fire-and-forget entrante)

| Evento | Handler | Qué hace |
|---|---|---|
| `telegram.text.received` | `onTelegramText` | Republica como `nichos.canal.mensaje.recibido` |

### Payload de `.enviar.request`

```json
{
  "request_id": "uuid",
  "canal": "telegram",
  "destino": "chat_123",
  "mensaje": { "cuerpo": "Hola, hay novedades en tu nicho.", "escalon": "ALERTA" },
  "correlation_id": "corr_yyy"
}
```

### Payload de `.registrar.request`

```json
{
  "request_id": "uuid",
  "canal": "telegram",
  "external_id": "chat_123",
  "project_id": "prj_xxx",
  "purpose": "soporte"
}
```

### Pulsos que emite

| Evento | Cuándo | Payload |
|---|---|---|
| `nichos.canal.mensaje.recibido` | al recibir mensaje de un bridge | `{canal, autor, cuerpo, meta}` |
| `nichos.canal.mensaje.enviado` | tras envío exitoso | `{canal, destino, escalon, confirmacion_ref}` |
| `nichos.canal.registrado` | tras registrar canal↔proyecto | `{canal, external_id, project_id}` |

## Cuándo se usa

- **G3 (clasificador-intencion)** escucha `nichos.canal.mensaje.recibido` para
  clasificar la intención del mensaje entrante.
- **H1 (paquetador-decision)** invoca `.enviar` para mandar paquetes de decisión
  al dueño.
- **E4 (canal-distribucion)** invoca `.enviar` para distribuir la solución al
  mercado.
- Cualquier módulo del vertical que necesite enviar o recibir por canal.

## Integración (patrón RPC del bus)

```javascript
// ENVIAR
const resp = await bus.publishAndWait('nichos.canal.enviar.request', {
  destino: 'chat_123',
  mensaje: { cuerpo: 'Novedades en tu nicho.', escalon: 'PULSO' }
});
const { confirmacion } = resp.data;

// REGISTRAR
await bus.publishAndWait('nichos.canal.registrar.request', {
  canal: 'telegram',
  external_id: 'chat_123',
  project_id: 'prj_xxx',
  purpose: 'soporte'
});
```

## Errores conocidos

| Status | Code | Causa |
|---|---|---|
| 400 | `INVALID_INPUT` | falta `destino`, `mensaje`, `canal`, `external_id`, `project_id` o `purpose` |
| 400 | `CANAL_NO_RESUELTO` | no se pudo resolver canal para el destino |
| 400 | `CANAL_DESCONOCIDO` | canal fuera del catálogo (`telegram`, `whatsapp`, `email`) |
