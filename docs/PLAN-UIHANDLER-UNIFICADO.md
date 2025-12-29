# Arquitectura UIHandler Unificado

**Fecha:** 2025-12-29
**Estado:** ✅ IMPLEMENTADO

---

## Resumen

| Antes | Después |
|-------|---------|
| tool-orchestrator + calling-generator + uiHandler | **Module Loader toolsRegistry** |
| file-browser + storage-manager | **filesystem** |
| Múltiples patrones de ejecución | **Un solo patrón** |

**Commits:**
- `fcff1e3` - filesystem module
- `b21ff2a` - Module Loader tools registry
- `4edff7c` - Calling Generator integration
- `3164259` - AI Gateway integration
- `450eb92` - Remove obsolete modules

---

## Flujo de Tools

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FLUJO DE TOOLS                                    │
└─────────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────┐                    ┌─────────────────────┐
  │   MÓDULOS LOCALES   │                    │   PLUGINS EXTERNOS  │
  │   (filesystem, db)  │                    │   (github, slack)   │
  └──────────┬──────────┘                    └──────────┬──────────┘
             │                                          │
             │ module.json                              │ plugin.json
             │ + tools[]                                │
             ▼                                          ▼
  ┌─────────────────────┐                    ┌─────────────────────┐
  │    Module Loader    │                    │   Plugin Manager    │
  │  registerToolsForAI │                    │                     │
  └──────────┬──────────┘                    └──────────┬──────────┘
             │                                          │
             │                                          ▼
             │                               ┌─────────────────────┐
             │                               │  Calling Generator  │
             │                               │  registerToolForAI  │
             │                               │  (crea HTTP handler)│
             │                               └──────────┬──────────┘
             │                                          │
             └─────────────────┬────────────────────────┘
                               │
                               ▼
                ┌───────────────────────────┐
                │  moduleLoader.toolsRegistry│
                │                           │
                │  Map<toolName, {          │
                │    name,                  │
                │    description,           │
                │    parameters,            │
                │    handler,               │
                │    module,                │
                │    confirmation           │
                │  }>                       │
                └─────────────┬─────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
    ┌───────────┐      ┌───────────┐      ┌───────────┐
    │    UI     │      │    AI     │      │  Módulos  │
    │ (MQTT)    │      │ (Gateway) │      │ (eventBus)│
    └─────┬─────┘      └─────┬─────┘      └─────┬─────┘
          │                  │                  │
          │ mqttRequest      │ tool_calls       │ eventBus
          │ (domain.action)  │                  │
          │                  ▼                  │
          │           ┌─────────────┐           │
          │           │executeToolCalls()│      │
          │           └──────┬──────┘           │
          │                  │                  │
          └─────────────────►├◄─────────────────┘
                             │
                             ▼
                ┌───────────────────────────┐
                │ moduleLoader.executeTool  │
                │                           │
                │ 1. Get tool from registry │
                │ 2. Check confirmation     │
                │ 3. Execute handler        │
                │ 4. Return result          │
                └───────────────────────────┘
```

---

## Flujo Detallado

### 1. UI → Tool (via MQTT)
```
UI                  UIHandler           Module Loader        Tool Handler
│                       │                    │                    │
│ mqttRequest           │                    │                    │
│ ('fs', 'list', {})    │                    │                    │
│──────────────────────►│                    │                    │
│                       │ executeTool        │                    │
│                       │ ('fs.list', args)  │                    │
│                       │───────────────────►│                    │
│                       │                    │ handler(args)      │
│                       │                    │───────────────────►│
│                       │                    │◄───────────────────│
│                       │◄───────────────────│    {status, data}  │
│◄──────────────────────│     response       │                    │
```

### 2. AI → Tool (via Gateway)
```
AI Provider         AI Gateway          Module Loader        Tool Handler
│                       │                    │                    │
│ tool_calls: [{        │                    │                    │
│   name: 'fs.list',    │                    │                    │
│   arguments: {}       │                    │                    │
│ }]                    │                    │                    │
│──────────────────────►│                    │                    │
│                       │ executeToolCalls   │                    │
│                       │ (toolCalls)        │                    │
│                       │───────────────────►│                    │
│                       │                    │ executeTool        │
│                       │                    │───────────────────►│
│                       │                    │◄───────────────────│
│                       │◄───────────────────│    {status, data}  │
│◄──────────────────────│  tool_results      │                    │
```

### 3. Módulo → Tool (via Module Loader)
```
Módulo A            Module Loader        Tool Handler
│                       │                    │
│ executeTool           │                    │
│ ('fs.read', {path})   │                    │
│──────────────────────►│                    │
│                       │ handler(args)      │
│                       │───────────────────►│
│                       │◄───────────────────│
│◄──────────────────────│    {status, data}  │
```

---

## Definición de Tools

### module.json (módulos locales)
```json
{
  "name": "filesystem",
  "tools": [
    {
      "name": "fs.list",
      "description": "Lista archivos de un directorio",
      "handler": "handleList",
      "parameters": {
        "type": "object",
        "properties": {
          "path": { "type": "string", "default": "/" }
        }
      }
    },
    {
      "name": "fs.write",
      "description": "Escribe contenido a archivo",
      "handler": "handleWrite",
      "confirmation": true,
      "parameters": {
        "type": "object",
        "properties": {
          "path": { "type": "string" },
          "content": { "type": "string" }
        },
        "required": ["path", "content"]
      }
    }
  ]
}
```

### plugin.json (plugins HTTP)
```json
{
  "metadata": {
    "name": "github",
    "base_url": "https://api.github.com",
    "auth_type": "bearer"
  },
  "functions": {
    "list_repos": {
      "method": "GET",
      "endpoint": "/user/repos",
      "description": "Lista repositorios del usuario"
    }
  }
}
```

---

## APIs

### AI Gateway
| Método | Path | Descripción |
|--------|------|-------------|
| GET | /tools | Lista tools disponibles |
| POST | /tools/:name/execute | Ejecuta una tool |

### Module Loader (interno)
| Método | Descripción |
|--------|-------------|
| `getToolsForAI()` | Retorna tools en formato AI |
| `getTool(name)` | Obtiene tool por nombre |
| `executeTool(name, args)` | Ejecuta tool |
| `toolRequiresConfirmation(name)` | Verifica si requiere confirmación |

---

## Archivos Clave

| Archivo | Descripción |
|---------|-------------|
| `core/modules/loader.js` | toolsRegistry, executeTool() |
| `modules/filesystem/index.js` | Handlers fs.* |
| `modules/calling-generator/index.js` | registerToolForAI() |
| `modules/ai-gateway/index.js` | executeToolCalls(), getAvailableTools() |

---

## Módulos Eliminados

| Módulo | Reemplazado por |
|--------|-----------------|
| file-browser | filesystem |
| storage-manager | filesystem |
| tool-orchestrator | Module Loader toolsRegistry |

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2025-12-29 | Implementación completa |
