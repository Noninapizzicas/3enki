# AI Tools Reference

**Versión:** 1.0.0
**Fecha:** 2025-12-30
**Estado:** Implementado

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
| **Total** | | **18** | |

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

**Última actualización:** 2025-12-30
