# Plan: bot-manager Module

## Resumen

Módulo de orquestación que centraliza el routing de mensajes de bots a agentes, gestión de descargas, pipelines multi-agente y respuestas automáticas.

---

## Problema que Resuelve

**Antes (routing implícito):**
```
telegram.text.received { botName: "ventas" }
        │
        ├──▶ Agente A (recibe todo, filtra internamente)
        ├──▶ Agente B (recibe todo, filtra internamente)
        └──▶ Agente C (recibe todo, filtra internamente)
```

**Después (routing centralizado):**
```
telegram.text.received { botName: "ventas" }
        │
        ▼
   bot-manager (decide según config)
        │
        ▼
   agent.ventas.invoke → Solo Agente A
```

---

## Estructura de Archivos

```
modules/bot-manager/
├── index.js                      # Módulo principal (lifecycle, suscripciones)
├── module.json                   # Manifest del módulo
│
├── services/
│   ├── bot-registry.js           # CRUD de bots registrados
│   ├── router.js                 # Lógica de routing evento→agente
│   ├── pipeline-executor.js      # Orquestación de pipelines multi-agente
│   ├── download-manager.js       # Gestión de descargas de archivos
│   └── auto-responder.js         # Respuestas automáticas sin AI
│
├── config/
│   └── defaults.json             # Configuración por defecto
│
└── storage/                      # (runtime, no en repo)
    └── bots/
        └── {botName}.json        # Config persistida por bot
```

---

## Modelo de Datos

### Configuración de Bot (BotConfig)

```javascript
{
  "botName": "facturas",
  "platform": "telegram",
  "enabled": true,
  "credentialKey": "TELEGRAM_API_KEY_BOT_facturas",

  "storage": {
    "basePath": "/storage/bots/{botName}",
    "received": "{basePath}/received/{date}/",
    "processed": "{basePath}/processed/{year}/{month}/",
    "failed": "{basePath}/failed/"
  },

  "behaviors": {
    "document.received": {
      "action": "pipeline",
      "download": true,
      "downloadTo": "received",
      "allowedTypes": ["application/pdf", "image/jpeg", "image/png"],
      "maxSize": "10MB",
      "pipeline": {
        "agents": ["validador-facturas", "extractor-datos", "archivador"],
        "onError": "notify_and_stop",
        "timeout": 60000
      }
    },
    "text.received": {
      "action": "reply",
      "message": "📄 Solo proceso facturas. Envíame una foto o PDF."
    },
    "command.received": {
      "/start": { "action": "reply", "message": "👋 Soy el bot de facturas..." },
      "/help": { "action": "reply", "message": "📌 Comandos disponibles..." }
    }
  },

  "createdAt": "2024-01-08T10:00:00Z",
  "updatedAt": "2024-01-08T10:00:00Z"
}
```

### Tipos de Acción (Behavior Actions)

| Acción | Descripción |
|--------|-------------|
| `process` | Enviar a un agente para procesamiento AI |
| `pipeline` | Pipeline multi-agente secuencial |
| `reply` | Respuesta automática sin AI |
| `route` | Agente decide a quién pasar (triage) |
| `forward` | Reenviar a otro chat/bot |
| `store` | Solo guardar, no responder |
| `ignore` | Descartar silenciosamente |

### Pipeline Context (datos compartidos entre agentes)

```javascript
{
  "pipelineId": "uuid",
  "botName": "facturas",
  "chatId": 123456,
  "startedAt": "...",

  "file": {
    "localPath": "/storage/...",
    "originalName": "factura.pdf",
    "mimeType": "application/pdf"
  },

  "stages": {
    "validador": { "status": "completed", "result": { "valid": true } },
    "extractor": { "status": "running", "result": null },
    "archivador": { "status": "pending", "result": null }
  },

  "sharedData": {
    "emisor": "Empresa ABC",
    "rfc": "ABC123456",
    "total": 1500.00
  }
}
```

---

## Eventos

### Eventos que CONSUME (se suscribe)

```javascript
// De telegram-service
"telegram.text.received"
"telegram.photo.received"
"telegram.document.received"
"telegram.video.received"
"telegram.audio.received"
"telegram.voice.received"
"telegram.location.received"
"telegram.contact.received"
"telegram.command.received"
"telegram.callback.received"

// De credential-manager
"credential.saved"
"credential.deleted"

// De agentes (para continuar pipelines)
"agent.*.completed"
"agent.*.failed"
```

### Eventos que PUBLICA

```javascript
// Ciclo de vida de bots
"bot.registered"
"bot.unregistered"
"bot.enabled"
"bot.disabled"
"bot.config.updated"

// Routing de mensajes
"bot.message.routed"
"bot.message.replied"
"bot.message.ignored"
"bot.message.downloaded"

// Pipelines
"bot.pipeline.started"
"bot.pipeline.stage.started"
"bot.pipeline.stage.completed"
"bot.pipeline.stage.failed"
"bot.pipeline.completed"
"bot.pipeline.failed"

// Invocación de agentes
"agent.{agentName}.invoke"
```

---

## Tools que Expone

### Gestión de Bots
- `bot.register` - Registrar nuevo bot
- `bot.unregister` - Eliminar bot
- `bot.enable` - Activar bot
- `bot.disable` - Desactivar bot
- `bot.list` - Listar bots
- `bot.get` - Obtener config de un bot

### Configuración de Comportamientos
- `bot.set_behavior` - Configurar acción por tipo de evento
- `bot.set_command` - Configurar respuesta a comando
- `bot.set_agent` - Asignar agente por defecto
- `bot.set_pipeline` - Configurar pipeline multi-agente
- `bot.set_storage` - Configurar rutas de almacenamiento

### Pipelines
- `bot.pipeline.status` - Ver estado de pipeline
- `bot.pipeline.cancel` - Cancelar pipeline
- `bot.pipeline.list` - Listar pipelines activos

---

## Flujo de Ejecución

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Usuario envía documento al bot "facturas"                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. telegram-service publica:                                    │
│    telegram.document.received { botName, chatId, fileId, ... }  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. bot-manager recibe evento                                    │
│    ├─ Busca config: bots["facturas"]                           │
│    ├─ Busca behavior: behaviors["document.received"]           │
│    ├─ Si download=true → Descarga archivo                      │
│    └─ Activa pipeline de agentes                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. Pipeline: validador → extractor → archivador                 │
│    Cada agente recibe: agent.{name}.invoke                     │
│    Cada agente responde: agent.{name}.completed                │
│    bot-manager coordina la secuencia                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Pipeline completo → Respuesta al usuario                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Responsabilidades

| Componente | Responsabilidad |
|------------|-----------------|
| **telegram-service** | Solo comunicación con Telegram API |
| **bot-manager** | Routing, descarga, storage, pipelines, respuestas auto |
| **Agentes** | Lógica de negocio, procesamiento AI |

---

## Fases de Implementación

### FASE 1: Fundación
- Crear módulo bot-manager
- Implementar bot-registry.js
- Implementar router.js básico
- Probar flujo: Bot → bot-manager → Agente

### FASE 2: Descarga y Storage
- Implementar download-manager.js
- Integrar descarga en router
- Probar flujo con archivos

### FASE 3: Pipelines Multi-Agente
- Implementar pipeline-executor.js
- Implementar sharedData entre agentes
- Probar pipeline completo

### FASE 4: Respuestas Automáticas
- Implementar auto-responder.js
- Comandos (/start, /help)

### FASE 5: Tools y API
- Registrar tools en tool-manager

---

## Limpieza Previa

Antes de implementar:
- [ ] Borrar `agents/receptor-facturas.json`
- [ ] Desactivar `agents/architect.json` (mantener como referencia)

---

## Notas

- bot-manager es un módulo NUEVO, no requiere cambios en módulos existentes
- telegram-service sigue funcionando igual
- ai-agent-framework sigue funcionando igual
- Migración gradual: cada bot se configura en bot-manager cuando convenga
