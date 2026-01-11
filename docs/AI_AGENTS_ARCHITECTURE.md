# AI Agents Architecture - Sistema de Agentes Auto-Generativos

**Versión:** 1.0.0
**Fecha:** 2026-01-04
**Estado:** Planificado

---

## Resumen Ejecutivo

El sistema de agentes permite que la IA cree, configure y gestione agentes de forma autónoma, apoyándose en los módulos existentes del sistema. Esto habilita una arquitectura donde los agentes pueden:

1. **Descubrir** módulos y sus capacidades
2. **Diseñar** prompts y configuraciones
3. **Crear** nuevos agentes funcionales
4. **Orquestar** flujos entre módulos

---

## Arquitectura General

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AGENTE ARQUITECTO                                │
│                    (Meta-agente que crea agentes)                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  CONOCIMIENTO EMBEBIDO (Prompt)          TOOLS DISPONIBLES               │
│  ─────────────────────────────           ─────────────────               │
│  • Lista de módulos y APIs               • create_prompt                 │
│  • Eventos del sistema                   • create_agent                  │
│  • Patrones de integración               • list_agents                   │
│  • Mejores prácticas                     • http_request                  │
│                                          • publish_event                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         AGENTES CREADOS                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐       │
│  │ media-processor  │  │ invoice-handler  │  │ support-bot      │       │
│  ├──────────────────┤  ├──────────────────┤  ├──────────────────┤       │
│  │ Escucha:         │  │ Escucha:         │  │ Escucha:         │       │
│  │ telegram.photo   │  │ telegram.document│  │ telegram.text    │       │
│  │                  │  │                  │  │                  │       │
│  │ Usa:             │  │ Usa:             │  │ Usa:             │       │
│  │ tesseract (local)│  │ tesseract (local)│  │ ai-gateway       │       │
│  │ telegram-service │  │ database-manager │  │ telegram-service │       │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘       │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         MÓDULOS BASE                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  telegram-service    tesseract      ai-gateway    prompt-manager        │
│  database-manager    credential-manager    filesystem    ...            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Componentes Clave

### 1. AI Agent Framework

**Ubicación:** `modules/ai-agent-framework/`

El framework proporciona:

| Componente | Archivo | Función |
|------------|---------|---------|
| **Agent** | `agent.js` | Clase base para agentes |
| **ContextManager** | `context-manager.js` | Memoria/historial de conversación |
| **ToolManager** | `tool-manager.js` | Gestión y ejecución de tools |
| **Module** | `index.js` | Orquestador principal |

### 2. Tools del Sistema

#### Tools Built-in (Existentes)

| Tool | Descripción |
|------|-------------|
| `http_request` | Llamadas HTTP a cualquier API |
| `publish_event` | Publicar eventos MQTT |
| `read_file` | Leer archivos del sistema |
| `write_file` | Escribir archivos |

#### Tools Nuevas (A Implementar)

| Tool | Descripción | Prioridad |
|------|-------------|-----------|
| `create_prompt` | Crear prompt en prompt-manager | Alta |
| `create_agent` | Crear agente en ai-agent-framework | Alta |
| `list_agents` | Listar agentes existentes | Alta |
| `update_agent` | Modificar agente existente | Media |
| `delete_agent` | Eliminar agente | Media |
| `discover_modules` | Listar módulos y sus APIs | Media |

### 3. Prompt Manager

**Ubicación:** `modules/prompt-manager/`

Gestiona los prompts que definen el comportamiento de los agentes:

- **Almacenamiento:** SQLite con versionado
- **Slots:** system, context, prefix, suffix, format
- **Variables:** `{{variable}}` con auto-detección
- **UI:** Panel completo en frontend

### 4. Módulos de Integración

#### telegram-service
- **Eventos emitidos:** `telegram.text.received`, `telegram.photo.received`, `telegram.document.received`, etc.
- **Tools:** `telegram_send_message`, `telegram_get_file`
- **Uso:** Recibir y enviar mensajes de Telegram

#### OCR Providers (services/providers/)
- **Local:** `tesseractService.extract({ image, language })`
- **Remoto:** `google.vision.extract`, `anthropic.vision.extract`
- **Uso:** Extraer texto de imágenes y PDFs

#### ai-gateway
- **Providers:** deepseek, openai, anthropic, ollama
- **API:** `POST /modules/ai-gateway/chat`
- **Uso:** Llamadas a LLMs

---

## Flujo de Creación de Agentes

### Paso 1: Usuario Solicita Agente

```
Usuario: "Crea un agente que procese fotos de Telegram con OCR"
```

### Paso 2: Agente Arquitecto Diseña

```javascript
// El Arquitecto conoce los módulos y diseña:
{
  "name": "media-processor",
  "description": "Procesa fotos de Telegram con OCR",
  "subscribes": ["telegram.photo.received"],
  "tools": ["http_request"],
  "prompt": "Eres un agente que procesa imágenes..."
}
```

### Paso 3: Arquitecto Crea Prompt

```javascript
[TOOL:create_prompt]({
  "name": "media-processor-system",
  "slot_type": "system",
  "content": "Eres un agente de procesamiento de medios.\n\nCuando recibes una imagen:\n1. Descarga el archivo de Telegram\n2. Envía a OCR para extraer texto\n3. Responde al usuario con el resultado\n\nDatos del evento:\n- Bot: {{botName}}\n- Chat: {{chatId}}\n- File: {{fileId}}"
})
```

### Paso 4: Arquitecto Crea Agente

```javascript
[TOOL:create_agent]({
  "name": "media-processor",
  "prompt_id": "media-processor-system",
  "provider": "deepseek",
  "model": "deepseek-chat",
  "subscribes": ["telegram.photo.received", "telegram.document.received"],
  "tools": ["http_request", "publish_event"],
  "enabled": true
})
```

### Paso 5: Agente Operativo

```
Telegram → Foto → telegram.photo.received
                         │
                         ▼
                  media-processor
                         │
                         ├─→ [http_request] GET /telegram-service/file/{fileId}
                         │
                         ├─→ [local] tesseractService.extract({ image })
                         │
                         └─→ [http_request] POST /telegram-service/send
                                            "Texto extraído: ..."
```

---

## Conocimiento del Arquitecto

El prompt del Agente Arquitecto incluye conocimiento completo del sistema:

### Módulos Disponibles

```markdown
## telegram-service (v3.0.0)
Bot de Telegram multi-instancia con gestión de credenciales.

### Eventos Emitidos:
- telegram.text.received: Mensaje de texto recibido
- telegram.photo.received: Foto recibida
- telegram.document.received: Documento recibido
- telegram.command.received: Comando /xxx recibido

### APIs:
- POST /send: Enviar mensaje
- GET /file/:fileId: Obtener archivo
- GET /bots: Listar bots activos

---

## OCR Providers (services/providers/)
Servicios de OCR disponibles como providers.

### Local (Tesseract):
```javascript
const tesseract = require('services/providers/local/tesseract');
const result = await tesseract.extract({ image: base64, language: 'spa' });
// Output: { success, text, confidence, words, lines }
```

### Remoto (Google/Anthropic Vision):
- Evento: `google.vision.extract.request` / `anthropic.vision.extract.request`
- Requiere credencial: `GOOGLE_API_KEY` / `ANTHROPIC_API_KEY`

---

## ai-gateway (v1.0.0)
Gateway unificado para LLMs.

### Providers:
- deepseek (prioridad 1, más económico)
- anthropic (prioridad 2)
- openai (prioridad 3)
- ollama (prioridad 4, local)

### APIs:
- POST /chat: Chat completion
- GET /providers: Listar providers

---

## prompt-manager (v1.0.0)
Gestión de prompts con versionado.

### APIs:
- POST /prompts: Crear prompt
- GET /prompts: Listar prompts
- POST /prompts/:id/render: Renderizar con variables

---
```

### Patrones de Integración

```markdown
## Patrones Comunes

### 1. Telegram → Procesamiento → Respuesta
subscribes: ["telegram.{tipo}.received"]
tools: ["http_request"]
flow: recibir → procesar → responder

### 2. Evento → AI → Acción
subscribes: ["cualquier.evento"]
tools: ["http_request", "publish_event"]
flow: escuchar → analizar con AI → ejecutar acción

### 3. Scheduled → Reporte
subscribes: ["scheduler.tick"]
tools: ["http_request", "publish_event"]
flow: timer → recopilar datos → generar reporte
```

---

## Configuración de Providers

### Provider por Defecto

```json
{
  "provider": "deepseek",
  "model": "deepseek-chat",
  "temperature": 0.3,
  "max_tokens": 2000
}
```

### Selección de Provider

| Caso de Uso | Provider Recomendado |
|-------------|---------------------|
| Tareas simples de orquestación | deepseek |
| Análisis de imágenes | openai (gpt-4o) |
| Razonamiento complejo | anthropic (claude) |
| Sin coste (local) | ollama |

### Futura UI de Selección

Se planea UI para:
- Seleccionar provider por agente
- Configurar fallbacks
- Ver estadísticas de uso/coste

---

## Estructura de Archivos

```
modules/
├── ai-agent-framework/
│   ├── module.json              # Manifest del módulo
│   ├── index.js                 # Orquestador principal
│   ├── agent.js                 # Clase Agent
│   ├── context-manager.js       # Gestión de contexto
│   ├── tool-manager.js          # Gestión de tools
│   └── agents/                  # Agentes guardados
│       ├── architect.json       # Agente Arquitecto
│       └── media-processor.json # Agentes creados
│
├── telegram-service/
│   ├── module.json
│   ├── index.js
│   └── services/
│       └── telegram-client.js
│
├── services/providers/
│   ├── local/
│   │   └── tesseract/index.js   # OCR local
│   ├── google/
│   │   └── functions/vision.extract.json
│   └── anthropic/
│       └── functions/vision.extract.json
│
└── prompt-manager/
    ├── module.json
    ├── index.js
    └── schema.sql
```

---

## Métricas y Observabilidad

### Métricas de Agentes

| Métrica | Tipo | Descripción |
|---------|------|-------------|
| `agent.executions.total` | counter | Total de ejecuciones |
| `agent.executions.success` | counter | Ejecuciones exitosas |
| `agent.executions.failed` | counter | Ejecuciones fallidas |
| `agent.tokens.total` | counter | Tokens consumidos |
| `agent.cost.total` | counter | Coste acumulado |
| `agent.latency.avg` | gauge | Latencia promedio |

### Eventos de Ciclo de Vida

| Evento | Cuándo |
|--------|--------|
| `agent.{name}.started` | Agente iniciado |
| `agent.{name}.completed` | Ejecución exitosa |
| `agent.{name}.failed` | Ejecución fallida |
| `agent.created` | Nuevo agente creado |
| `agent.deleted` | Agente eliminado |

---

## Seguridad

### Permisos de Tools

Los agentes solo pueden usar tools explícitamente permitidas:

```json
{
  "name": "mi-agente",
  "tools": ["http_request", "publish_event"]  // Solo estas
}
```

### Validación de Eventos

Los agentes solo procesan eventos a los que están suscritos:

```json
{
  "subscribes": ["telegram.photo.received"]  // Solo este evento
}
```

### Timeouts

- Ejecución de agente: 60 segundos (configurable)
- Ejecución de tool: 10 segundos
- Llamada a AI: según provider

---

## Roadmap

### Fase 1: Fundamentos (Actual)
- [x] AI Agent Framework básico
- [x] Prompt Manager con UI
- [x] telegram-service
- [x] OCR providers (tesseract, google, anthropic)
- [ ] Tools: create_prompt, create_agent, list_agents

### Fase 2: Agente Arquitecto
- [ ] Generar conocimiento desde module.json
- [ ] Crear Agente Arquitecto
- [ ] Probar creación de media-processor

### Fase 3: UI y Gestión
- [ ] UI para listar/gestionar agentes
- [ ] UI para selección de provider
- [ ] Dashboard de métricas de agentes

### Fase 4: Avanzado
- [ ] Agentes con memoria persistente
- [ ] Workflows multi-agente
- [ ] Scheduling de agentes

---

## Referencias

- [AI_TOOLS_REFERENCE.md](./AI_TOOLS_REFERENCE.md) - Tools disponibles
- [GUIA_CREAR_MODULO.md](./GUIA_CREAR_MODULO.md) - Crear módulos
- [GUIA_EVENT_BUS.md](./GUIA_EVENT_BUS.md) - Sistema de eventos
- `modules/ai-agent-framework/README.md` - Documentación del framework

---

**Última actualización:** 2026-01-04
