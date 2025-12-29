# Plan de Implementación: UIHandler Unificado

**Fecha:** 2025-12-29
**Estado:** Planificación
**Objetivo:** Unificar el acceso a funciones del sistema (UI, IA, Módulos) a través de UIHandler

---

## Resumen Ejecutivo

Simplificar la arquitectura eliminando capas innecesarias:

| Antes | Después |
|-------|---------|
| Tool Orchestrator + Calling Generator + UIHandler | **UIHandler único** |
| file-browser + storage-manager | **filesystem único** |
| Múltiples patrones de ejecución | **Un solo patrón** |

---

## Arquitectura Objetivo

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ARQUITECTURA FINAL                           │
└─────────────────────────────────────────────────────────────────────┘

     Módulos Locales              Plugins Externos
     (filesystem, db)             (github, slack)
            │                            │
            │ module.json                │ plugin.json
            │ + handlers                 │
            ▼                            ▼
     ┌─────────────┐            ┌─────────────────┐
     │   Module    │            │ Plugin Manager  │
     │   Loader    │            └────────┬────────┘
     └──────┬──────┘                     │
            │                            ▼
            │                   ┌─────────────────┐
            │                   │    Calling      │
            │                   │   Generator     │
            │                   │ (traduce HTTP)  │
            │                   └────────┬────────┘
            │                            │
            └────────────┬───────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │     UIHandler       │
              │   (dispatcher)      │
              │                     │
              │  registry: Map<     │
              │    'domain.action', │
              │    handler          │
              │  >                  │
              └──────────┬──────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
        UI              IA           Módulos
   (mqttRequest)   (AI Gateway)   (eventBus)
```

---

## Fases de Implementación

### FASE 1: Módulo Filesystem (Nuevo)
**Duración estimada:** Core del cambio
**Riesgo:** Bajo (módulo nuevo, no rompe nada existente)

#### 1.1 Crear estructura
```
modules/filesystem/
├── module.json
├── index.js
└── README.md
```

#### 1.2 module.json
```json
{
  "name": "filesystem",
  "version": "1.0.0",
  "description": "Core filesystem operations",
  "main": "index.js",

  "handlers": [
    { "domain": "fs", "action": "list", "method": "handleList" },
    { "domain": "fs", "action": "read", "method": "handleRead" },
    { "domain": "fs", "action": "write", "method": "handleWrite" },
    { "domain": "fs", "action": "delete", "method": "handleDelete" },
    { "domain": "fs", "action": "mkdir", "method": "handleMkdir" },
    { "domain": "fs", "action": "move", "method": "handleMove" },
    { "domain": "fs", "action": "copy", "method": "handleCopy" },
    { "domain": "fs", "action": "search", "method": "handleSearch" },
    { "domain": "fs", "action": "info", "method": "handleInfo" }
  ],

  "tools": [
    {
      "name": "fs.list",
      "description": "Lista archivos y carpetas de un directorio",
      "handler": "handleList",
      "parameters": {
        "type": "object",
        "properties": {
          "path": { "type": "string", "description": "Ruta del directorio", "default": "/" }
        }
      }
    },
    {
      "name": "fs.read",
      "description": "Lee el contenido de un archivo",
      "handler": "handleRead",
      "parameters": {
        "type": "object",
        "properties": {
          "path": { "type": "string", "description": "Ruta del archivo" }
        },
        "required": ["path"]
      }
    },
    {
      "name": "fs.write",
      "description": "Escribe contenido a un archivo (crea si no existe)",
      "handler": "handleWrite",
      "confirmation": true,
      "parameters": {
        "type": "object",
        "properties": {
          "path": { "type": "string", "description": "Ruta del archivo" },
          "content": { "type": "string", "description": "Contenido a escribir" }
        },
        "required": ["path", "content"]
      }
    },
    {
      "name": "fs.delete",
      "description": "Elimina un archivo o carpeta",
      "handler": "handleDelete",
      "confirmation": true,
      "parameters": {
        "type": "object",
        "properties": {
          "path": { "type": "string", "description": "Ruta a eliminar" }
        },
        "required": ["path"]
      }
    },
    {
      "name": "fs.mkdir",
      "description": "Crea un directorio",
      "handler": "handleMkdir",
      "parameters": {
        "type": "object",
        "properties": {
          "path": { "type": "string", "description": "Ruta del directorio a crear" }
        },
        "required": ["path"]
      }
    },
    {
      "name": "fs.search",
      "description": "Busca archivos por nombre o contenido",
      "handler": "handleSearch",
      "parameters": {
        "type": "object",
        "properties": {
          "query": { "type": "string", "description": "Texto a buscar" },
          "path": { "type": "string", "description": "Directorio base", "default": "/" },
          "content": { "type": "boolean", "description": "Buscar en contenido", "default": false }
        },
        "required": ["query"]
      }
    }
  ],

  "events": {
    "publishes": [
      "fs.file.created",
      "fs.file.updated",
      "fs.file.deleted",
      "fs.directory.created"
    ]
  },

  "ui": {
    "zone": "work-bar",
    "icon": "📁"
  }
}
```

#### 1.3 index.js (handlers)
```javascript
const fs = require('fs').promises;
const path = require('path');

class FilesystemModule {
  constructor() {
    this.name = 'filesystem';
    this.basePath = path.join(process.cwd(), 'data');
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.uiHandler = context.uiHandler;

    // Registrar handlers
    this.uiHandler.register('fs', 'list', this.handleList.bind(this));
    this.uiHandler.register('fs', 'read', this.handleRead.bind(this));
    this.uiHandler.register('fs', 'write', this.handleWrite.bind(this));
    this.uiHandler.register('fs', 'delete', this.handleDelete.bind(this));
    this.uiHandler.register('fs', 'mkdir', this.handleMkdir.bind(this));
    this.uiHandler.register('fs', 'move', this.handleMove.bind(this));
    this.uiHandler.register('fs', 'copy', this.handleCopy.bind(this));
    this.uiHandler.register('fs', 'search', this.handleSearch.bind(this));
    this.uiHandler.register('fs', 'info', this.handleInfo.bind(this));

    this.logger.info('filesystem.loaded');
  }

  // Seguridad: validar paths
  validatePath(userPath) {
    const normalized = path.normalize(userPath || '/').replace(/^\/+/, '');
    const resolved = path.resolve(this.basePath, normalized);

    if (!resolved.startsWith(this.basePath)) {
      throw { status: 403, error: 'Access denied: path outside data directory' };
    }
    return resolved;
  }

  async handleList(data) {
    const dirPath = data?.path || '/';
    const safePath = this.validatePath(dirPath);

    const entries = await fs.readdir(safePath, { withFileTypes: true });
    const items = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(safePath, entry.name);
      const stats = await fs.stat(fullPath);
      return {
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        modified: stats.mtime,
        path: path.join(dirPath, entry.name).replace(/\\/g, '/')
      };
    }));

    // Ordenar: directorios primero, luego alfabético
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return { status: 200, data: { path: dirPath, items } };
  }

  async handleRead(data) {
    if (!data?.path) {
      return { status: 400, error: 'path is required' };
    }

    const safePath = this.validatePath(data.path);
    const stats = await fs.stat(safePath);

    if (stats.isDirectory()) {
      return { status: 400, error: 'Cannot read directory as file' };
    }

    const content = await fs.readFile(safePath, 'utf-8');

    return {
      status: 200,
      data: {
        path: data.path,
        content,
        size: stats.size,
        modified: stats.mtime
      }
    };
  }

  async handleWrite(data) {
    if (!data?.path || data.content === undefined) {
      return { status: 400, error: 'path and content are required' };
    }

    const safePath = this.validatePath(data.path);

    // Crear directorio padre si no existe
    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, data.content, 'utf-8');

    await this.eventBus.publish('fs.file.created', {
      path: data.path,
      size: data.content.length,
      timestamp: new Date().toISOString()
    });

    return { status: 201, data: { path: data.path, created: true } };
  }

  async handleDelete(data) {
    if (!data?.path) {
      return { status: 400, error: 'path is required' };
    }

    const safePath = this.validatePath(data.path);
    const stats = await fs.stat(safePath);

    if (stats.isDirectory()) {
      await fs.rm(safePath, { recursive: true });
    } else {
      await fs.unlink(safePath);
    }

    await this.eventBus.publish('fs.file.deleted', {
      path: data.path,
      type: stats.isDirectory() ? 'directory' : 'file',
      timestamp: new Date().toISOString()
    });

    return { status: 200, data: { path: data.path, deleted: true } };
  }

  async handleMkdir(data) {
    if (!data?.path) {
      return { status: 400, error: 'path is required' };
    }

    const safePath = this.validatePath(data.path);
    await fs.mkdir(safePath, { recursive: true });

    await this.eventBus.publish('fs.directory.created', {
      path: data.path,
      timestamp: new Date().toISOString()
    });

    return { status: 201, data: { path: data.path, created: true } };
  }

  async handleMove(data) {
    if (!data?.from || !data?.to) {
      return { status: 400, error: 'from and to are required' };
    }

    const safeFrom = this.validatePath(data.from);
    const safeTo = this.validatePath(data.to);

    await fs.mkdir(path.dirname(safeTo), { recursive: true });
    await fs.rename(safeFrom, safeTo);

    return { status: 200, data: { from: data.from, to: data.to, moved: true } };
  }

  async handleCopy(data) {
    if (!data?.from || !data?.to) {
      return { status: 400, error: 'from and to are required' };
    }

    const safeFrom = this.validatePath(data.from);
    const safeTo = this.validatePath(data.to);

    await fs.mkdir(path.dirname(safeTo), { recursive: true });
    await fs.copyFile(safeFrom, safeTo);

    return { status: 200, data: { from: data.from, to: data.to, copied: true } };
  }

  async handleSearch(data) {
    if (!data?.query) {
      return { status: 400, error: 'query is required' };
    }

    const basePath = this.validatePath(data.path || '/');
    const searchContent = data.content === true;
    const results = [];

    await this.searchRecursive(basePath, data.query.toLowerCase(), searchContent, results, data.path || '/');

    return { status: 200, data: { query: data.query, results, count: results.length } };
  }

  async searchRecursive(dirPath, query, searchContent, results, relativePath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const entryRelative = path.join(relativePath, entry.name).replace(/\\/g, '/');

        // Buscar en nombre
        if (entry.name.toLowerCase().includes(query)) {
          const stats = await fs.stat(fullPath);
          results.push({
            name: entry.name,
            path: entryRelative,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            match: 'filename'
          });
        }

        // Buscar en contenido (solo archivos de texto)
        if (searchContent && entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          const textExts = ['.txt', '.md', '.json', '.js', '.ts', '.html', '.css', '.yaml', '.yml', '.xml'];

          if (textExts.includes(ext)) {
            try {
              const content = await fs.readFile(fullPath, 'utf-8');
              if (content.toLowerCase().includes(query)) {
                const stats = await fs.stat(fullPath);
                results.push({
                  name: entry.name,
                  path: entryRelative,
                  type: 'file',
                  size: stats.size,
                  match: 'content'
                });
              }
            } catch (e) {
              // Ignorar archivos que no se pueden leer
            }
          }
        }

        // Recursivo en directorios
        if (entry.isDirectory()) {
          await this.searchRecursive(fullPath, query, searchContent, results, entryRelative);
        }
      }
    } catch (e) {
      // Ignorar directorios sin acceso
    }
  }

  async handleInfo(data) {
    if (!data?.path) {
      return { status: 400, error: 'path is required' };
    }

    const safePath = this.validatePath(data.path);
    const stats = await fs.stat(safePath);

    return {
      status: 200,
      data: {
        path: data.path,
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        accessed: stats.atime
      }
    };
  }
}

module.exports = FilesystemModule;
```

---

### FASE 2: Modificar Module Loader
**Riesgo:** Medio (afecta carga de todos los módulos)

#### 2.1 Leer `tools` de module.json
```javascript
// core/modules/loader.js

async loadModule(modulePath) {
  const manifest = require(path.join(modulePath, 'module.json'));
  const ModuleClass = require(path.join(modulePath, 'index.js'));

  const instance = new ModuleClass();
  await instance.onLoad(this.context);

  // Registrar tools para AI Gateway
  if (manifest.tools) {
    this.registerToolsForAI(manifest.name, manifest.tools, instance);
  }

  return instance;
}

registerToolsForAI(moduleName, tools, instance) {
  for (const tool of tools) {
    const handlerName = tool.handler || tool.name.split('.')[1];
    const handler = instance[handlerName]?.bind(instance);

    if (handler) {
      this.toolsRegistry.set(tool.name, {
        ...tool,
        module: moduleName,
        handler
      });
    }
  }
}

getToolsForAI() {
  // Retorna tools en formato para AI providers
  return Array.from(this.toolsRegistry.values()).map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    confirmation: t.confirmation || false
  }));
}

async executeTool(toolName, args) {
  const tool = this.toolsRegistry.get(toolName);
  if (!tool) {
    throw new Error(`Tool not found: ${toolName}`);
  }
  return await tool.handler(args);
}
```

---

### FASE 3: Modificar Calling Generator
**Riesgo:** Bajo

#### 3.1 Registrar plugins como handlers en UIHandler
```javascript
// modules/calling-generator/index.js

async onPluginLoaded(plugin) {
  const { name: pluginName, metadata, functions } = plugin;

  for (const [funcName, funcDef] of Object.entries(functions)) {
    // Crear handler HTTP
    const handler = this.createHttpHandler(metadata, funcDef);

    // Registrar en UIHandler
    this.uiHandler.register(pluginName, funcName, handler);

    // Registrar como tool para IA
    this.registerToolForAI(pluginName, funcName, funcDef, handler);
  }
}

createHttpHandler(metadata, funcDef) {
  return async (data) => {
    const url = this.buildUrl(metadata.base_url, funcDef.endpoint, data);
    const headers = this.buildHeaders(metadata);
    const method = funcDef.method || 'GET';

    const response = await this.httpRequest(url, method, headers, data);

    return {
      status: response.ok ? 200 : response.status,
      data: response.data,
      error: response.error
    };
  };
}
```

---

### FASE 4: Modificar AI Gateway
**Riesgo:** Medio

#### 4.1 Usar UIHandler para ejecutar tools
```javascript
// modules/ai-gateway/index.js

async processChat(message, context) {
  // 1. Obtener tools disponibles
  const tools = this.moduleLoader.getToolsForAI();

  // 2. Traducir al formato del proveedor
  const providerTools = this.toolTranslator.toProviderFormat(tools, context.provider);

  // 3. Enviar a IA
  const response = await this.callProvider(message, providerTools, context);

  // 4. Si hay tool_calls, ejecutar
  if (response.tool_calls) {
    const results = await this.executeToolCalls(response.tool_calls, context);
    // Continuar conversación con resultados...
  }

  return response;
}

async executeToolCalls(toolCalls, context) {
  const results = [];

  for (const call of toolCalls) {
    const { name, arguments: args } = call;

    // Parsear domain.action
    const [domain, action] = name.split('.');

    // Ejecutar via UIHandler
    const result = await this.uiHandler.handle(domain, action, args, context);

    results.push({
      tool_call_id: call.id,
      result
    });
  }

  return results;
}
```

---

### FASE 5: Limpieza
**Riesgo:** Bajo (solo eliminar código obsoleto)

#### 5.1 Eliminar módulos obsoletos
```bash
rm -rf modules/file-browser/
rm -rf modules/storage-manager/
rm -rf modules/tool-orchestrator/
```

#### 5.2 Actualizar contexto/modules.json
```json
{
  "active_modules": [
    "admin-panel",
    "ai-gateway",
    "calling-generator",
    "conversation-manager",
    "credential-manager",
    "dashboard",
    "database-manager",
    "filesystem",           // NUEVO
    "log-manager",
    "menu-generator",
    "metricas",
    "notas",
    "plugin-manager",
    "project-manager",
    "prompt-manager",
    "system-inspector",
    "ui-designer"
  ]
}
```

---

## Orden de Implementación

| # | Tarea | Dependencias | Riesgo |
|---|-------|--------------|--------|
| 1 | Crear módulo `filesystem` | Ninguna | Bajo |
| 2 | Testear filesystem standalone | #1 | Bajo |
| 3 | Modificar Module Loader (tools registry) | #1 | Medio |
| 4 | Modificar Calling Generator (registrar en UIHandler) | #3 | Bajo |
| 5 | Modificar AI Gateway (usar UIHandler) | #3, #4 | Medio |
| 6 | Testing integración completa | #1-5 | - |
| 7 | Eliminar módulos obsoletos | #6 OK | Bajo |
| 8 | Actualizar documentación | #7 | Bajo |

---

## Testing

### Test 1: Filesystem via UI
```typescript
// Frontend
const result = await mqttRequest('fs', 'list', { path: '/' });
console.log(result.data.items);
```

### Test 2: Filesystem via IA
```
Usuario: "Lista los archivos del directorio raíz"
IA: tool_call { name: "fs.list", args: { path: "/" } }
Sistema: ejecuta → retorna items
IA: "Los archivos son: ..."
```

### Test 3: Plugin via UI
```typescript
const result = await mqttRequest('github', 'list_issues', {
  owner: 'user',
  repo: 'repo'
});
```

### Test 4: Plugin via IA
```
Usuario: "Crea un issue en GitHub"
IA: tool_call { name: "github.create_issue", args: {...} }
Sistema: ejecuta HTTP → retorna resultado
IA: "Issue creado: #123"
```

---

## Rollback Plan

Si algo falla:
1. Los módulos file-browser y storage-manager siguen en git
2. Revertir cambios en Module Loader
3. Revertir cambios en AI Gateway

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2025-12-29 | Documento inicial |
