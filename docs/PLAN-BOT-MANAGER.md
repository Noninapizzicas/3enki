# Plan: Arquitectura de Gestión de Bots y Agentes

## Resumen

Tres módulos con responsabilidades claras, comunicándose exclusivamente via eventos.

---

## Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   telegram-service          bot-manager           agent-manager             │
│   (ya existe)               (nuevo)               (nuevo)                   │
│                                                                             │
│   Comunicación              Gestión bots          Orquestación              │
│   Telegram API              + Storage             + Contexto                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                                            │
                                                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                          ai-agent-framework                                 │
│                          (ya existe)                                        │
│                                                                             │
│                          Motor de ejecución                                 │
│                          Agentes + Prompts + Tools                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Flujo Completo de Eventos

```
1. Usuario envía PDF a bot "facturas"
                │
                ▼
2. telegram-service
   └─ Publica: telegram.document.received { botName, fileId, ... }
                │
                ▼
3. bot-manager
   └─ Escucha: telegram.document.received
   └─ Descarga archivo
   └─ Guarda en: /storage/bots/facturas/received/2024-01-08/
   └─ Publica: bot.file.stored { botName, path, mimeType, chatId, ... }
                │
                ▼
4. agent-manager
   └─ Escucha: bot.file.stored
   └─ Decide: "¿Necesita agente?" → Sí
   └─ Decide: "¿Cuál?" → extractor-datos
   └─ Construye contexto: { origen, archivo, responder_a, tarea }
   └─ Publica: agent.execute.request { agentName, context, task }
                │
                ▼
5. ai-agent-framework
   └─ Escucha: agent.execute.request
   └─ Busca agente "extractor-datos"
   └─ Carga prompt
   └─ Ejecuta AI + tools
   └─ Publica: agent.extractor-datos.completed { result }
                │
                ▼
6. agent-manager (opcional)
   └─ Escucha: agent.extractor-datos.completed
   └─ Decide si lanzar siguiente agente (pipeline)
   └─ O finaliza
```

---

## Módulo 1: bot-manager

### Responsabilidad
Gestionar bots y almacenamiento. NO sabe de agentes.

### Escucha
```
telegram.document.received
telegram.photo.received
telegram.text.received
telegram.command.received
credential.saved
credential.deleted
```

### Publica
```
bot.file.stored {
  botName: "facturas",
  chatId: 123456,
  userId: 789,
  file: {
    path: "/storage/bots/facturas/received/2024-01-08/factura.pdf",
    originalName: "factura.pdf",
    mimeType: "application/pdf",
    size: 45678
  },
  timestamp: "2024-01-08T10:30:00Z"
}

bot.message.received {
  botName: "facturas",
  chatId: 123456,
  text: "Hola",
  timestamp: "..."
}

bot.command.received {
  botName: "facturas",
  command: "/start",
  chatId: 123456
}
```

### Hace
- Descarga archivos de Telegram
- Guarda en estructura de carpetas configurada
- Respuestas automáticas (/start, /help) sin AI
- CRUD de configuración de bots

### Estructura
```
modules/bot-manager/
├── index.js
├── module.json
└── services/
    ├── bot-registry.js      # Configuración de bots
    ├── download-manager.js  # Descarga y almacenamiento
    └── auto-responder.js    # Respuestas automáticas
```

### Configuración de Bot
```javascript
{
  "botName": "facturas",
  "platform": "telegram",
  "enabled": true,

  "storage": {
    "basePath": "/storage/bots/facturas",
    "received": "{basePath}/received/{date}/"
  },

  "autoResponses": {
    "/start": "Bienvenido al bot de facturas...",
    "/help": "Envíame fotos o PDFs de facturas..."
  }
}
```

---

## Módulo 2: agent-manager

### Responsabilidad
Decidir qué agente usar, construir contexto, orquestar.

### Escucha
```
bot.file.stored
bot.message.received
bot.command.received
agent.*.completed
agent.*.failed
```

### Publica
```
agent.execute.request {
  agentName: "extractor-datos",
  context: {
    origen: "bot facturas",
    chatId: 123456,
    archivo: "/storage/bots/facturas/received/2024-01-08/factura.pdf",
    mimeType: "application/pdf",
    responder_via: "telegram",
    responder_botName: "facturas"
  },
  task: "Extrae los datos de esta factura"
}
```

### Hace
- Escucha eventos del sistema
- Decide si necesita agente o no
- Decide QUÉ agente usar
- Construye el CONTEXTO (de dónde viene, a dónde va)
- Define la TAREA
- Orquesta pipelines (agente1 → agente2 → agente3)

### Estructura
```
modules/agent-manager/
├── index.js
├── module.json
└── services/
    ├── trigger-registry.js   # Qué evento activa qué agente
    ├── context-builder.js    # Construye contexto para agente
    └── pipeline-executor.js  # Orquesta secuencias de agentes
```

### Configuración de Triggers
```javascript
{
  "triggers": [
    {
      "event": "bot.file.stored",
      "filter": {
        "botName": ["facturas", "gastos"],
        "file.mimeType": ["application/pdf", "image/*"]
      },
      "agent": "extractor-datos",
      "contextTemplate": {
        "origen": "bot {{botName}}",
        "archivo": "{{file.path}}",
        "responder_via": "telegram",
        "responder_botName": "{{botName}}",
        "responder_chatId": "{{chatId}}"
      }
    }
  ]
}
```

---

## Módulo 3: ai-agent-framework (existente)

### Responsabilidad
Tener agentes listos y ejecutarlos cuando se lo piden.

### Escucha
```
agent.execute.request
```

### Publica
```
agent.{name}.completed { result, ... }
agent.{name}.failed { error, ... }
```

### Tiene
- Agentes creados y configurados
- Prompts de cada agente
- Tools disponibles
- Motor de ejecución (AI gateway)
- Context manager (memoria)

### Cambios Necesarios
```diff
- Agentes se suscriben directamente a telegram.*, bot.*, etc.
+ Agentes solo se ejecutan via agent.execute.request

- subscribes: ["telegram.photo.received"]
+ subscribes: ["agent.execute.request"] // O ninguno, solo espera requests
```

### Nuevo: Escuchar agent.execute.request
```javascript
// En index.js de ai-agent-framework
async onLoad() {
  this.eventBus.subscribe('agent.execute.request', this.onExecuteRequest.bind(this));
}

async onExecuteRequest(event) {
  const { agentName, context, task } = event;

  const agent = this.agents.get(agentName);
  if (!agent) {
    this.eventBus.publish(`agent.${agentName}.failed`, {
      error: 'Agent not found'
    });
    return;
  }

  // Ejecutar agente con contexto y tarea
  const result = await agent.execute({ context, task });

  this.eventBus.publish(`agent.${agentName}.completed`, { result });
}
```

---

## Comparación de Responsabilidades

```
┌─────────────────────────────────────┬─────────────────────────────────────┐
│         ai-agent-framework          │           agent-manager             │
├─────────────────────────────────────┼─────────────────────────────────────┤
│                                     │                                     │
│  📦 TIENE                           │  🧠 SABE                            │
│                                     │                                     │
│  • Los agentes creados              │  • Qué evento necesita agente       │
│  • Los prompts de cada uno          │  • Qué agente usar                  │
│  • Las tools disponibles            │  • Qué contexto pasarle             │
│  • La config de cada agente         │  • De dónde viene el evento         │
│  • El motor de ejecución (AI)       │  • A dónde tiene que ir resultado   │
│                                     │                                     │
├─────────────────────────────────────┼─────────────────────────────────────┤
│                                     │                                     │
│  🔧 HACE                            │  🎯 HACE                            │
│                                     │                                     │
│  • CRUD de agentes                  │  • Escucha eventos del sistema      │
│  • Mantener todo ordenado           │  • Decide si necesita agente        │
│  • Ejecutar cuando le mandan        │  • Construye contexto + tarea       │
│  • Llamar AI + tools                │  • Manda a ejecutar                 │
│                                     │  • Orquesta pipelines               │
│                                     │                                     │
├─────────────────────────────────────┼─────────────────────────────────────┤
│                                     │                                     │
│  🎧 ESCUCHA                         │  🎧 ESCUCHA                         │
│                                     │                                     │
│  • agent.execute.request            │  • bot.file.stored                  │
│                                     │  • bot.message.received             │
│                                     │  • agent.*.completed                │
│                                     │  • agent.*.failed                   │
│                                     │                                     │
├─────────────────────────────────────┼─────────────────────────────────────┤
│                                     │                                     │
│  📢 PUBLICA                         │  📢 PUBLICA                         │
│                                     │                                     │
│  • agent.{name}.completed           │  • agent.execute.request            │
│  • agent.{name}.failed              │                                     │
│                                     │                                     │
└─────────────────────────────────────┴─────────────────────────────────────┘
```

---

## Principio Fundamental

```
┌─────────────────────────────────────────────────────────────┐
│                    TODO SON EVENTOS                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Sistema              ───▶  eventos  ───▶  módulos          │
│  UI (botón probar)    ───▶  eventos  ───▶  módulos          │
│  Cualquier cosa       ───▶  eventos  ───▶  módulos          │
│                                                             │
│  No hay APIs especiales. No hay excepciones.                │
│  Un evento, una lógica, un resultado.                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Fases de Implementación

### FASE 1: bot-manager
- Crear módulo
- Escuchar telegram.*
- Descargar y almacenar archivos
- Publicar bot.file.stored
- Respuestas automáticas

### FASE 2: agent-manager
- Crear módulo
- Escuchar bot.file.stored
- Configurar triggers
- Construir contexto
- Publicar agent.execute.request

### FASE 3: Ajustar ai-agent-framework
- Escuchar agent.execute.request
- Ejecutar con contexto recibido
- Eliminar suscripciones directas de agentes

### FASE 4: UI
- Panel de bots (bot-manager)
- Panel de triggers (agent-manager)
- Panel de agentes (ai-agent-framework)
- Botón "Probar" que publica evento

---

## Limpieza Previa

- [ ] Borrar `agents/receptor-facturas.json`
- [ ] Desactivar `agents/architect.json` (mantener como referencia)

---

## Ejemplo Completo: Pipeline Multi-Agente

```
1. bot.file.stored { botName: "facturas", path: "x.pdf" }
                │
                ▼
2. agent-manager
   └─ Trigger: bot.file.stored + facturas → pipeline ["validador", "extractor", "archivador"]
   └─ Publica: agent.execute.request {
        agentName: "validador",
        context: { archivo: "x.pdf", pipeline: { step: 1, total: 3 } }
      }
                │
                ▼
3. ai-agent-framework ejecuta "validador"
   └─ Publica: agent.validador.completed { result: { valid: true } }
                │
                ▼
4. agent-manager escucha completed
   └─ Ve que es paso 1 de 3
   └─ Publica: agent.execute.request {
        agentName: "extractor",
        context: { archivo: "x.pdf", validacion: { valid: true }, pipeline: { step: 2 } }
      }
                │
                ▼
5. ai-agent-framework ejecuta "extractor"
   └─ Publica: agent.extractor.completed { result: { datos: {...} } }
                │
                ▼
6. agent-manager escucha completed
   └─ Ve que es paso 2 de 3
   └─ Publica: agent.execute.request {
        agentName: "archivador",
        context: { archivo: "x.pdf", datos: {...}, pipeline: { step: 3 } }
      }
                │
                ▼
7. ai-agent-framework ejecuta "archivador"
   └─ Publica: agent.archivador.completed { result: { guardado: true } }
                │
                ▼
8. agent-manager escucha completed
   └─ Ve que es paso 3 de 3 (último)
   └─ Pipeline terminado
```
