# telegram-service - Diseño Completo

**Fecha:** 2026-01-03
**Estado:** Pendiente de implementación

---

## Visión

Servicio genérico de Telegram que:
- Múltiples bots (uno por proyecto/contexto)
- Recibe y reenvía mensajes como eventos
- Permite a la AI enviar mensajes/fotos/docs
- Almacena tokens en credential-manager
- Extensible para cualquier proyecto futuro

---

## Arquitectura

```
┌──────────────────────────────────────────────────────────────┐
│                    telegram-service                           │
├──────────────────────────────────────────────────────────────┤
│  BOTS (Map: botId → TelegramClient)                          │
│    - bot-facturas  → polling activo                          │
│    - bot-soporte   → polling activo                          │
│    - bot-notif     → polling activo                          │
├──────────────────────────────────────────────────────────────┤
│  EVENTOS (eventBus)                                          │
│    telegram.*.received  ← contenido entrante                 │
│    telegram.*.sent      → contenido enviado                  │
│    telegram.bot.*       → lifecycle del bot                  │
│    telegram.error       → errores                            │
├──────────────────────────────────────────────────────────────┤
│  UI HANDLERS (frontend)                                      │
│    telegram/state   → lista bots y estado                    │
│    telegram/register → registrar bot nuevo                   │
│    telegram/send    → enviar mensaje                         │
├──────────────────────────────────────────────────────────────┤
│  AI TOOLS                                                    │
│    telegram.send_*    → enviar contenido                     │
│    telegram.get_*     → obtener info                         │
│    telegram.list_bots → listar bots                          │
└──────────────────────────────────────────────────────────────┘
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

## Keyboards/Botones

```javascript
// Inline keyboard (botones bajo mensaje)
await telegram.send_message({
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

## Token Storage

Patrón credential-manager:
```
TELEGRAM_API_KEY_PROJECT_{projectId} = bot_token
```

Ejemplo:
```
TELEGRAM_API_KEY_PROJECT_facturas = 8575070471:AAGA...
TELEGRAM_API_KEY_PROJECT_soporte = 1234567890:BBBB...
```

---

## Payload de Eventos

Todos los eventos incluyen `projectId` para routing:

```javascript
{
  projectId: 'facturas',
  botId: 'bot-facturas',
  chatId: 123456789,
  messageId: 987,
  from: {
    id: 111222333,
    username: 'usuario',
    firstName: 'Juan'
  },
  // ... datos específicos del tipo
  timestamp: '2026-01-03T12:00:00.000Z'
}
```

---

## Flujo Ejemplo: Factura

```
Usuario envía foto de factura
        ↓
telegram.photo.received
  { projectId: 'facturas', chatId, fileId, caption }
        ↓
invoice-processor escucha evento
        ↓
Descarga foto: telegram.get_file(fileId)
        ↓
Procesa (OCR, AI, storage)
        ↓
Responde: telegram.send_message({
  botId: 'bot-facturas',
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

## Pendiente Definir

1. **Contrato module.json** - Ver estructura exacta
2. **Credenciales** - Confirmar patrón con credential-manager
3. **UI Panel** - Diseño del panel en frontend

---

*Guardado para referencia durante implementación*
