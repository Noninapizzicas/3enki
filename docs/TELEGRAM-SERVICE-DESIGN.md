# telegram-service - Diseño Completo

**Fecha:** 2026-01-04
**Estado:** Acordado, pendiente de implementación

---

## Visión

Servicio genérico de Telegram que:
- Gestiona múltiples bots de forma centralizada
- Módulos/proyectos se suscriben a eventos filtrando por `botName`
- Desacoplamiento total: telegram-service no sabe de proyectos
- Extensible para cualquier proyecto futuro

---

## Decisiones Acordadas

| Aspecto | Decisión |
|---------|----------|
| Arquitectura | Centralizada, suscripción por eventos |
| Tokens | `TELEGRAM_BOT_{botName}` vía credential-manager |
| Registro | Automático vía eventos `credentials.*` |
| UI | Sin panel propio (credential-manager suficiente) |
| Conexión | Polling (sin dominio público) |
| Librería | node-telegram-bot-api |
| Archivos | `/storage/telegram/{botName}/received\|sent/` (vía filesystem) |
| Persistencia | No (solo eventos efímeros) |
| Errores | Eventos específicos por tipo |
| Rate limit | Cola interna 25 msg/seg |

---

## Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                    telegram-service                          │
├─────────────────────────────────────────────────────────────┤
│  BOTS (Map: botName → TelegramClient)                       │
│    - facturas   → polling activo                            │
│    - ventas     → polling activo                            │
│    - alertas    → polling activo                            │
├─────────────────────────────────────────────────────────────┤
│  EVENTOS (eventBus)                                         │
│    telegram.*.received    ← contenido entrante              │
│    telegram.*.sent        → contenido enviado               │
│    telegram.bot.*         → lifecycle del bot               │
│    telegram.send.failed   → errores de envío                │
│    telegram.queue.overflow → cola saturada                  │
├─────────────────────────────────────────────────────────────┤
│  AI TOOLS                                                   │
│    telegram.send_*    → enviar contenido                    │
│    telegram.get_*     → obtener info                        │
│    telegram.list_bots → listar bots                         │
└─────────────────────────────────────────────────────────────┘
         ▲
         │ credentials.created / credentials.deleted
         │
┌────────┴────────────────────────────────────────────────────┐
│                  credential-manager                          │
│  TELEGRAM_BOT_facturas = 123:AAA...                         │
│  TELEGRAM_BOT_ventas = 456:BBB...                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Flujo de Registro de Bots

```
┌─────────────────┐         ┌─────────────────────┐         ┌─────────────────┐
│  Panel Creds    │         │  credential-manager │         │ telegram-service│
│                 │         │                     │         │                 │
│ + Nueva Cred    │────────▶│ Guarda en .env      │         │                 │
│   Provider:     │         │ TELEGRAM_BOT_ventas │         │                 │
│   TELEGRAM      │         │ = 123:AAA...        │         │                 │
│   Level: BOT    │         │                     │         │                 │
│   Id: ventas    │         │ emit('credentials.  │────────▶│ Escucha evento  │
│   Token: 123... │         │   created', {...})  │         │ startBot(ventas)│
│                 │         │                     │         │ ✅ Bot activo   │
└─────────────────┘         └─────────────────────┘         └─────────────────┘
```

**Automático:** Añadir/eliminar credencial → evento → arrancar/parar bot

---

## Token Storage

Patrón credential-manager:
```
TELEGRAM_BOT_{botName} = bot_token
```

Ejemplo:
```
TELEGRAM_BOT_facturas = 8575070471:AAGA...
TELEGRAM_BOT_ventas = 1234567890:BBBB...
```

---

## Almacenamiento de Archivos

Usando módulo filesystem:
```
/storage/telegram/{botName}/received/
/storage/telegram/{botName}/sent/
```

Ejemplo:
```
/storage/telegram/facturas/received/photo_123.jpg
/storage/telegram/facturas/sent/document_456.pdf
```

---

## Eventos - RECIBIR

| Tipo | Evento | Datos |
|------|--------|-------|
| Texto | `telegram.text.received` | message, chatId, from |
| Foto | `telegram.photo.received` | fileId, caption, sizes[] |
| Documento | `telegram.document.received` | fileId, fileName, mimeType |
| Video | `telegram.video.received` | fileId, duration, thumb |
| Audio | `telegram.audio.received` | fileId, duration, title |
| Voz | `telegram.voice.received` | fileId, duration |
| Video nota | `telegram.video_note.received` | fileId, duration |
| Sticker | `telegram.sticker.received` | fileId, emoji, setName |
| Ubicación | `telegram.location.received` | latitude, longitude |
| Contacto | `telegram.contact.received` | phoneNumber, firstName |
| Poll | `telegram.poll.received` | question, options[] |
| Callback | `telegram.callback.received` | data, messageId |
| Comando | `telegram.command.received` | command, args[] |

---

## Tools - ENVIAR

| Tool | Función |
|------|---------|
| `telegram.send_message` | Texto con markdown, botones inline |
| `telegram.send_photo` | Foto con caption |
| `telegram.send_document` | Cualquier archivo |
| `telegram.send_video` | Video con caption |
| `telegram.send_audio` | Audio/música |
| `telegram.send_voice` | Mensaje de voz |
| `telegram.send_location` | Ubicación GPS |
| `telegram.send_poll` | Encuesta |
| `telegram.send_sticker` | Sticker |
| `telegram.edit_message` | Editar mensaje enviado |
| `telegram.delete_message` | Eliminar mensaje |
| `telegram.answer_callback` | Responder a botón pulsado |

---

## Tools - UTILIDADES

| Tool | Función |
|------|---------|
| `telegram.get_file` | Descargar archivo por fileId |
| `telegram.get_chat` | Info del chat |
| `telegram.get_user` | Info del usuario |
| `telegram.set_commands` | Configurar menú de comandos |
| `telegram.pin_message` | Fijar mensaje |
| `telegram.list_bots` | Listar bots registrados |

---

## Manejo de Errores

| Error | Evento | Datos |
|-------|--------|-------|
| Token inválido | `telegram.bot.error` | `{ botName, reason: 'invalid_token' }` |
| Bot bloqueado | `telegram.send.failed` | `{ botName, chatId, reason: 'blocked' }` |
| Timeout | `telegram.send.failed` | `{ botName, chatId, reason: 'timeout' }` |
| Polling caído | `telegram.bot.disconnected` | `{ botName }` → reintento automático |
| Cola saturada | `telegram.queue.overflow` | `{ botName, queueSize }` |

---

## Rate Limiting

- Cola FIFO por bot
- Máximo 25 msg/seg (margen de seguridad vs límite 30)
- Si cola > 100 mensajes → evento `telegram.queue.overflow`
- Transparente para quien usa las tools

---

## Keyboards/Botones

```javascript
// Inline keyboard (botones bajo mensaje)
await telegram.send_message({
  botName: 'facturas',
  chatId: 123,
  text: '¿Confirmar pedido?',
  reply_markup: {
    inline_keyboard: [
      [{ text: '✅ Sí', callback_data: 'confirm' }],
      [{ text: '❌ No', callback_data: 'cancel' }]
    ]
  }
});

// Reply keyboard (teclado personalizado)
await telegram.send_message({
  botName: 'facturas',
  chatId: 123,
  text: 'Elige opción:',
  reply_markup: {
    keyboard: [
      ['📦 Ver pedidos', '🛒 Nuevo pedido'],
      ['❓ Ayuda']
    ],
    resize_keyboard: true
  }
});
```

---

## Payload de Eventos

Todos los eventos incluyen `botName` para filtrado:

```javascript
{
  botName: 'facturas',
  chatId: 123456789,
  messageId: 987,
  from: {
    id: 111222333,
    username: 'usuario',
    firstName: 'Juan'
  },
  // ... datos específicos del tipo
  timestamp: '2026-01-04T12:00:00.000Z'
}
```

---

## Flujo Ejemplo: Factura

```
Usuario envía foto de factura
        ↓
telegram.photo.received
  { botName: 'facturas', chatId, fileId, caption }
        ↓
invoice-processor escucha evento (filtra botName='facturas')
        ↓
Descarga foto: telegram.get_file({ botName, fileId })
        ↓
Procesa (OCR, AI, storage)
        ↓
Responde: telegram.send_message({
  botName: 'facturas',
  chatId,
  text: 'Factura procesada ✅\nTotal: 150.00€',
  reply_markup: {
    inline_keyboard: [
      [{ text: '📄 Ver detalle', callback_data: 'detail_123' }]
    ]
  }
})
```

---

## Dependencias

```json
{
  "node-telegram-bot-api": "^0.66.0"
}
```

---

*Documento acordado - Listo para implementación*
