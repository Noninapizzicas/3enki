# Plan de Refactorización: Event-Driven Filesystem

## Objetivo
Todos los módulos que manejen datos de usuario deben usar el módulo `filesystem` via eventos, no `fs.writeFile` directamente.

## Principio
```
cualquier-modulo → fs.write.request → filesystem → fs.writeFile
                                          ↓
                              (único punto de escritura)
```

## Estado Actual

### Ya Refactorizado
- [x] tool-manager → usa eventos `fs.read.request`, `fs.write.request`, `fs.copy.request`
- [x] filesystem → escucha y responde a eventos
- [x] telegram-service → escucha `telegram.send_message.request`, `telegram.get_file.request`

### Pendiente de Refactorizar

#### 1. text-editor (PRIORIDAD ALTA)
| Función | Operación | Línea | Cambiar a |
|---------|-----------|-------|-----------|
| handleOpen | `fs.readFile` | 99 | `fs.read.request` |
| handleSave | `fs.writeFile` | 161 | `fs.write.request` |
| handleReload | `fs.readFile` | 257 | `fs.read.request` |
| handleSaveAs | `fs.writeFile` | 290 | `fs.write.request` |
| validateSyntax | `fs.readFile` | 522 | `fs.read.request` |
| handleAutoSave | `fs.writeFile` | 562 | `fs.write.request` |

#### 2. pdf-viewer (PRIORIDAD ALTA)
| Función | Operación | Línea | Cambiar a |
|---------|-----------|-------|-----------|
| handleRead | `fs.readFile` | 112 | `fs.read.request` |
| handleGetPage | `fs.readFile` | 269 | `fs.read.request` |
| getDocumentFromPath | `fs.readFile` | 589 | `fs.read.request` |
| handleExtractImages | `fs.readFile` | 857 | `fs.read.request` |

#### 3. database-manager (PRIORIDAD ALTA)
| Función | Operación | Línea | Cambiar a |
|---------|-----------|-------|-----------|
| handleBackupDatabase | `fs.readFile` | 1336 | `fs.read.request` |
| handleRestoreDatabase | `fs.writeFile` | 1387 | `fs.write.request` |

#### 4. ai-agent-framework (PRIORIDAD MEDIA)
| Función | Operación | Línea | Cambiar a |
|---------|-----------|-------|-----------|
| loadAgents | `fs.readFile` | 171 | `fs.read.request` |
| saveAgent | `fs.writeFile` | 205 | `fs.write.request` |
| agent.js loadPrompt | `fs.readFile` | 196 | `fs.read.request` |
| agent.js loadKnowledge | `fs.readFile` | 201 | `fs.read.request` |

## NO Tocar (Excepciones)

| Módulo | Razón |
|--------|-------|
| log-manager | Rendimiento crítico (sync writes para logs) |
| credential-manager | Seguridad del sistema (.env) |
| metricas | Datos internos del módulo |
| ui-designer | Snapshots internos |
| Lecturas de module.json | Config de arranque del módulo |
| prompt-manager (schema) | Config interna |
| admin-panel | HTML estático + config |

## Patrón de Implementación

```javascript
// ANTES (directo)
async handleSave(data) {
  await fs.writeFile(fullPath, content, 'utf-8');
  return { success: true };
}

// DESPUÉS (event-driven)
async handleSave(data) {
  const crypto = require('crypto');
  const request_id = crypto.randomUUID();

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ success: false, error: 'Timeout' });
    }, 10000);

    const handler = (event) => {
      const result = event?.data || event;
      if (result.request_id === request_id) {
        clearTimeout(timeout);
        this.eventBus.off('fs.write.response', handler);
        resolve(result);
      }
    };

    this.eventBus.on('fs.write.response', handler);
    this.eventBus.publish('fs.write.request', {
      request_id,
      path: data.path,
      content: data.content
    });
  });
}
```

## Eventos Disponibles

| Request | Response | Descripción |
|---------|----------|-------------|
| `fs.read.request` | `fs.read.response` | Leer archivo |
| `fs.write.request` | `fs.write.response` | Escribir archivo |
| `fs.copy.request` | `fs.copy.response` | Copiar archivo |

## Estimación

| Módulo | Operaciones | Tiempo estimado |
|--------|-------------|-----------------|
| text-editor | 6 | ~20 min |
| pdf-viewer | 4 | ~15 min |
| database-manager | 2 | ~10 min |
| ai-agent-framework | 4 | ~15 min |
| **Total** | **16** | **~1 hora** |

## Fecha de Creación
2026-01-06
