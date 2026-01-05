# AI Tools Reference

**Versión:** 2.0.0
**Fecha:** 2026-01-04
**Estado:** Implementado + Planificado

---

## Resumen

Este documento describe todas las herramientas (tools) disponibles para el AI en el sistema Event Core. Cada módulo expone tools que el AI puede invocar para realizar operaciones.

---

## Tool Categories

| Categoría | Módulo | Tools | Estado |
|-----------|--------|-------|--------|
| Credenciales | credential-manager | 1 | ✅ |
| Prompts | prompt-manager | 3 | ✅ |
| Base de Datos | database-manager | 4 | ✅ |
| Archivos | filesystem | 2 | ✅ |
| PDF | pdf-viewer | 3 | ✅ |
| Ejecución | code-executor | 5 | ✅ |
| **Agentes** | **ai-agent-framework** | **7** | ✅ + 🔜 |
| **OCR** | **ocr-service** | **1** | 🔜 |
| **Telegram** | **telegram-service** | **3** | 🔜 |
| **Total** | | **29** | |

**Leyenda:** ✅ Implementado | 🔜 Planificado

---

## 1. Credential Manager

### credential.list

Lista credenciales disponibles (solo metadata, nunca valores).

```json
{
  "name": "credential.list",
  "parameters": {
    "level": "string (opcional) - global|project|client",
    "provider": "string (opcional) - filtrar por provider"
  }
}
```

**Seguridad:** Nunca retorna valores de API keys, solo metadata.

---

## 2. Prompt Manager

### prompt.list

Lista prompts disponibles en el catálogo.

```json
{
  "name": "prompt.list",
  "parameters": {
    "category": "string (opcional) - filtrar por categoría",
    "tag": "string (opcional) - filtrar por tag"
  }
}
```

### prompt.get

Obtiene el contenido de un prompt.

```json
{
  "name": "prompt.get",
  "parameters": {
    "promptId": "string (requerido) - ID del prompt"
  }
}
```

### prompt.render

Renderiza un prompt con variables.

```json
{
  "name": "prompt.render",
  "parameters": {
    "promptId": "string (requerido) - ID del prompt",
    "variables": "object (opcional) - variables a reemplazar"
  }
}
```

---

## 3. Database Manager

### db.query

Ejecuta consulta SQL de solo lectura (SELECT).

```json
{
  "name": "db.query",
  "parameters": {
    "projectId": "string (requerido)",
    "query": "string (requerido) - Solo SELECT",
    "params": "array (opcional) - parámetros"
  }
}
```

**Seguridad:** Solo permite SELECT. Usar db.execute para modificaciones.

### db.tables

Lista todas las tablas de la base de datos.

```json
{
  "name": "db.tables",
  "parameters": {
    "projectId": "string (requerido)"
  }
}
```

### db.schema

Obtiene el esquema de una tabla específica.

```json
{
  "name": "db.schema",
  "parameters": {
    "projectId": "string (requerido)",
    "tableName": "string (requerido)"
  }
}
```

**Retorna:** columnas, foreign keys, indexes, CREATE statement.

### db.execute

Ejecuta consulta modificadora (INSERT, UPDATE, DELETE, etc.)

```json
{
  "name": "db.execute",
  "requires_confirmation": true,
  "parameters": {
    "projectId": "string (requerido)",
    "query": "string (requerido) - INSERT/UPDATE/DELETE/CREATE/ALTER/DROP",
    "params": "array (opcional)"
  }
}
```

**Seguridad:** Requiere confirmación del usuario.

---

## 4. Filesystem

### fs.cleanup

Limpia archivos temporales antiguos.

```json
{
  "name": "fs.cleanup",
  "parameters": {
    "path": "string (default: /temp)",
    "max_age_hours": "number (default: 24)",
    "dry_run": "boolean (default: false)"
  }
}
```

### fs.stats

Obtiene estadísticas de uso del storage.

```json
{
  "name": "fs.stats",
  "parameters": {
    "projectId": "string (opcional)"
  }
}
```

**Retorna:** tamaño total, conteo de archivos, espacio disponible.

---

## 5. PDF Viewer

### pdf.list

Lista todos los archivos PDF en un proyecto.

```json
{
  "name": "pdf.list",
  "parameters": {
    "projectId": "string (requerido)"
  }
}
```

### pdf.metadata

Obtiene metadata de un archivo PDF.

```json
{
  "name": "pdf.metadata",
  "parameters": {
    "projectId": "string (requerido)",
    "filePath": "string (requerido)"
  }
}
```

**Retorna:** tamaño, fechas de creación/modificación, nombre.

### pdf.extract

Extrae texto de un PDF.

```json
{
  "name": "pdf.extract",
  "parameters": {
    "projectId": "string (requerido)",
    "filePath": "string (requerido)",
    "page": "number (opcional) - página específica (1-indexed)"
  }
}
```

**Prioridad de parsers:**
1. `pdftotext` (poppler-utils) - Sin dependencias npm
2. `pdf-parse` (npm) - Fallback

---

## 6. Code Executor

### shell.exec

Ejecuta un comando shell.

```json
{
  "name": "shell.exec",
  "requires_confirmation": true,
  "parameters": {
    "command": "string (requerido)",
    "cwd": "string (opcional) - directorio de trabajo",
    "timeout": "number (opcional, default: 30000ms)",
    "env": "object (opcional) - variables de entorno"
  }
}
```

**Retorna:** stdout, stderr, exitCode, duration.

**Seguridad:**
- Timeout máximo: 5 minutos
- Comandos bloqueados: rm -rf /, sudo, mkfs, etc.
- Patrones peligrosos bloqueados via regex

### shell.script

Ejecuta un archivo de script (bash, python, node).

```json
{
  "name": "shell.script",
  "requires_confirmation": true,
  "parameters": {
    "projectId": "string (requerido)",
    "scriptPath": "string (requerido) - ruta dentro del proyecto",
    "args": "array (opcional) - argumentos",
    "timeout": "number (opcional, default: 60000ms)"
  }
}
```

**Auto-detecta intérprete por extensión:** .sh→bash, .py→python3, .js→node, .rb→ruby

### shell.background

Inicia un proceso en segundo plano.

```json
{
  "name": "shell.background",
  "requires_confirmation": true,
  "parameters": {
    "command": "string (requerido)",
    "cwd": "string (opcional)",
    "name": "string (opcional) - nombre para identificar"
  }
}
```

**Retorna:** name, pid, command.

**Límite:** Máximo 10 procesos concurrentes.

### shell.kill

Detiene un proceso en segundo plano.

```json
{
  "name": "shell.kill",
  "parameters": {
    "pid": "number (opcional)",
    "name": "string (opcional)"
  }
}
```

**Nota:** Requiere pid O name.

### shell.list

Lista procesos en segundo plano activos.

```json
{
  "name": "shell.list",
  "parameters": {}
}
```

**Retorna:** lista de procesos con name, pid, command, startedAt, running.

---

## Tool Translation (ai-gateway)

El ai-gateway traduce automáticamente las tools al formato de cada provider:

### Anthropic (Claude)
```json
{
  "name": "tool_name",
  "description": "...",
  "input_schema": { "type": "object", "properties": {...} }
}
```

### OpenAI / DeepSeek
```json
{
  "type": "function",
  "function": {
    "name": "tool_name",
    "description": "...",
    "parameters": { "type": "object", "properties": {...} }
  }
}
```

### Respuestas

El ai-gateway normaliza las respuestas de tool calls a formato interno:

```json
{
  "id": "call_xxx",
  "name": "tool_name",
  "arguments": { ... }
}
```

---

## Tools que Requieren Confirmación

Las siguientes tools requieren confirmación explícita del usuario antes de ejecutarse:

| Tool | Razón |
|------|-------|
| `db.execute` | Modifica datos en base de datos |
| `shell.exec` | Ejecuta comandos del sistema |
| `shell.script` | Ejecuta scripts |
| `shell.background` | Inicia procesos persistentes |

---

## Ejemplo de Uso desde AI

```javascript
// 1. AI quiere ejecutar tests
const result = await toolOrchestrator.execute('shell.exec', {
  command: 'npm test',
  cwd: '/data/projects/mi-proyecto',
  timeout: 60000
});

// 2. AI quiere consultar la base de datos
const users = await toolOrchestrator.execute('db.query', {
  projectId: 'mi-proyecto',
  query: 'SELECT * FROM users WHERE active = ?',
  params: [true]
});

// 3. AI quiere leer un PDF
const texto = await toolOrchestrator.execute('pdf.extract', {
  projectId: 'mi-proyecto',
  filePath: 'docs/manual.pdf',
  page: 1
});
```

---

## Agregar Nuevas Tools

Para agregar tools a un módulo:

### 1. Definir en module.json

```json
{
  "tools": [
    {
      "name": "modulo.accion",
      "description": "Descripción clara para el AI",
      "handler": "handleToolAccion",
      "requires_confirmation": false,
      "parameters": {
        "type": "object",
        "properties": {
          "param1": { "type": "string", "description": "..." }
        },
        "required": ["param1"]
      }
    }
  ]
}
```

### 2. Implementar handler en index.js

```javascript
async handleToolAccion(args) {
  const { param1 } = args || {};

  if (!param1) {
    return { status: 400, data: { error: 'param1 is required' } };
  }

  try {
    // Lógica aquí
    return {
      status: 200,
      data: { success: true, result: ... }
    };
  } catch (error) {
    return {
      status: 500,
      data: { success: false, error: error.message }
    };
  }
}
```

---

## 7. AI Agent Framework

### agent.list ✅

Lista todos los agentes registrados.

```json
{
  "name": "agent.list",
  "parameters": {
    "enabled_only": "boolean (opcional) - solo agentes activos"
  }
}
```

### agent.get ✅

Obtiene detalles de un agente específico.

```json
{
  "name": "agent.get",
  "parameters": {
    "agent_id": "string (requerido) - ID del agente"
  }
}
```

### agent.trigger ✅

Ejecuta un agente manualmente con un payload.

```json
{
  "name": "agent.trigger",
  "parameters": {
    "agent_id": "string (requerido) - ID del agente",
    "payload": "object (requerido) - datos para el agente"
  }
}
```

### agent.stats ✅

Obtiene estadísticas de ejecución de un agente.

```json
{
  "name": "agent.stats",
  "parameters": {
    "agent_id": "string (requerido) - ID del agente"
  }
}
```

**Retorna:** executions, successes, failures, total_tokens, total_cost, avg_latency_ms.

### create_prompt 🔜

Crea un nuevo prompt en prompt-manager (para uso del Agente Arquitecto).

```json
{
  "name": "create_prompt",
  "parameters": {
    "name": "string (requerido) - nombre único kebab-case",
    "content": "string (requerido) - contenido del prompt",
    "slot_type": "string (default: system) - system|context|prefix|suffix|format",
    "description": "string (opcional)",
    "tags": "array (opcional) - tags para categorización"
  }
}
```

### create_agent 🔜

Crea un nuevo agente (para uso del Agente Arquitecto).

```json
{
  "name": "create_agent",
  "parameters": {
    "name": "string (requerido) - nombre único",
    "prompt_id": "string (requerido) - ID del prompt a usar",
    "subscribes": "array (requerido) - eventos a escuchar",
    "provider": "string (default: deepseek) - deepseek|openai|anthropic|ollama|auto",
    "model": "string (opcional) - modelo específico",
    "temperature": "number (default: 0.3) - 0.0 a 1.0",
    "tools": "array (default: [http_request]) - tools permitidas",
    "enabled": "boolean (default: true)"
  }
}
```

### list_agents 🔜

Alias simplificado de agent.list para el Agente Arquitecto.

```json
{
  "name": "list_agents",
  "parameters": {}
}
```

---

## 8. OCR Service 🔜

### ocr.extract

Extrae texto de una imagen o PDF.

```json
{
  "name": "ocr.extract",
  "parameters": {
    "input": "string (requerido) - imagen en base64",
    "engine": "string (default: auto) - auto|tesseract|openai-vision|claude-vision|google-vision",
    "language": "string (default: eng) - idioma para tesseract"
  }
}
```

**Retorna:** text, confidence, engine, duration, words, lines.

---

## 9. Telegram Service 🔜

### telegram.send_message

Envía un mensaje de texto a un chat.

```json
{
  "name": "telegram.send_message",
  "parameters": {
    "botName": "string (requerido) - nombre del bot",
    "chatId": "number (requerido) - ID del chat",
    "text": "string (requerido) - mensaje a enviar",
    "parseMode": "string (opcional) - HTML|Markdown"
  }
}
```

### telegram.get_file

Obtiene información de un archivo y opcionalmente lo descarga.

```json
{
  "name": "telegram.get_file",
  "parameters": {
    "botName": "string (requerido) - nombre del bot",
    "fileId": "string (requerido) - ID del archivo",
    "download": "boolean (default: false) - descargar contenido"
  }
}
```

**Retorna:** Si download=true, retorna el archivo en base64.

### telegram.list_bots

Lista los bots activos.

```json
{
  "name": "telegram.list_bots",
  "parameters": {}
}
```

**Retorna:** Array de bots con nombre, username, status.

---

## Arquitectura de Agentes

### Flujo de Creación de Agente

```
Usuario: "Crea agente para procesar fotos con OCR"
                    │
                    ▼
            Agente Arquitecto
                    │
    ┌───────────────┼───────────────┐
    ▼               ▼               ▼
create_prompt   create_agent    Confirma
    │               │               │
    ▼               ▼               ▼
prompt-manager  ai-agent       Usuario
                framework      informado
```

### Tools del Arquitecto

El Agente Arquitecto tiene acceso a:

| Tool | Uso |
|------|-----|
| `create_prompt` | Crear prompts para nuevos agentes |
| `create_agent` | Crear la definición del agente |
| `list_agents` | Ver agentes existentes |
| `http_request` | Consultar APIs de módulos |

### Ejemplo: Crear Agente via Arquitecto

```javascript
// 1. Arquitecto crea el prompt
[TOOL:create_prompt]({
  "name": "media-processor-system",
  "content": "Eres un agente que procesa imágenes...",
  "slot_type": "system"
})

// 2. Arquitecto crea el agente
[TOOL:create_agent]({
  "name": "media-processor",
  "prompt_id": "media-processor-system",
  "subscribes": ["telegram.photo.received"],
  "tools": ["http_request"],
  "provider": "deepseek"
})
```

---

## Referencias

- [AI_AGENTS_ARCHITECTURE.md](./AI_AGENTS_ARCHITECTURE.md) - Arquitectura completa de agentes
- [PLAN-AI-AGENTS.md](./PLAN-AI-AGENTS.md) - Plan de implementación

---

**Última actualización:** 2026-01-04
