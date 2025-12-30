# Análisis de Flujos MQTT Backend ↔ Frontend

**Fecha**: 2025-12-30
**Estado**: ✅ Gaps críticos corregidos

---

## Resumen Ejecutivo

Se verificaron los flujos de comunicación MQTT entre el backend (handlers registrados) y el frontend (llamadas mqttRequest). Se encontraron **3 gaps críticos** que fueron **corregidos** y **16 handlers del backend sin uso en UI**.

### Correcciones Aplicadas (2025-12-30)

| Gap | Corrección | Archivo |
|-----|------------|---------|
| Dominio `files` → `fs` | ✅ Corregido | `files.ts` líneas 157, 255, 419, 475 |
| Action `create` → `write`/`mkdir` | ✅ Corregido | `files.ts` función `createFile()` |
| Comentario `file-browser` → `filesystem` | ✅ Corregido | `files.ts` línea 247 |

### Estado por Módulo

| Módulo | Backend Handlers | UI Calls | Estado |
|--------|-----------------|----------|--------|
| project-manager | 10 | 6 | ⚠️ Parcial |
| credential-manager | 6 | 5 | ⚠️ Parcial |
| conversation-manager | 9 | 7 | ⚠️ Parcial |
| filesystem | 11 | 6 | ✅ Corregido |
| text-editor | 4 | 4 | ✅ Completo |
| prompt-manager | 13 | 12 | ⚠️ Parcial |
| pdf-viewer | 3 | 1 | ⚠️ Parcial |

---

## GAPS CRÍTICOS (CORREGIDOS)

### 1. ✅ Dominio Filesystem Inconsistente - CORREGIDO

**Problema original**: El frontend usaba dominio `files` pero el backend registra dominio `fs`.

**Corrección aplicada** en `frontend/src/lib/stores/files.ts`:
```typescript
// ANTES:
mqttRequest('files', 'list', ...)
mqttRequest('files', 'read', ...)
mqttRequest('files', 'delete', ...)
mqttRequest('files', 'search', ...)

// DESPUÉS (corregido):
mqttRequest('fs', 'list', ...)
mqttRequest('fs', 'read', ...)
mqttRequest('fs', 'delete', ...)
mqttRequest('fs', 'search', ...)
```

### 2. ✅ Action 'create' No Existe - CORREGIDO

**Problema original**: Frontend llamaba `files/create` pero backend solo tiene `fs/write` y `fs/mkdir`.

**Corrección aplicada** en función `createFile()`:
```typescript
// ANTES:
await mqttRequest('files', 'create', { type, ... });

// DESPUÉS (corregido):
if (type === 'directory') {
  await mqttRequest('fs', 'mkdir', { path });
} else {
  await mqttRequest('fs', 'write', { file_path, content });
}
```

### 3. ⚠️ Conversation Load Duplicado - Pendiente revisión

**Problema**: Existen dos formas de cargar conversaciones.

```typescript
// chat.ts:197
mqttRequest('conversation', 'load', { conversationId })

// conversations.ts:170
mqttRequest('conversation', 'get', { conversationId })
```

Ambos existen en backend pero tienen comportamiento similar. Considerar unificar.

---

## Tabla de Correspondencia Detallada

### project-manager

| Backend Handler | Frontend Store | Estado |
|-----------------|----------------|--------|
| `project/list` | `projects.ts:96` | ✅ |
| `project/get` | `projects.ts:237` | ✅ |
| `project/create` | `projects.ts:129` | ✅ |
| `project/update` | `projects.ts:167` | ✅ |
| `project/delete` | `projects.ts:192` | ✅ |
| `project/activate` | `projects.ts:213` | ✅ |
| `project/saveSession` | - | ❌ Sin uso |
| `project/restoreSession` | - | ❌ Sin uso |
| `project/setAIConfig` | - | ❌ Sin uso |
| `project/setLastConversation` | - | ❌ Sin uso |

### credential-manager

| Backend Handler | Frontend Store | Estado |
|-----------------|----------------|--------|
| `credential/list` | `credentials.ts:152` | ✅ |
| `credential/get` | - | ❌ Sin uso |
| `credential/create` | `credentials.ts:184` | ✅ |
| `credential/update` | `credentials.ts:211` | ✅ |
| `credential/delete` | `credentials.ts:235` | ✅ |
| `credential/test` | `credentials.ts:264` | ✅ |

### conversation-manager

| Backend Handler | Frontend Store | Estado |
|-----------------|----------------|--------|
| `conversation/list` | `conversations.ts:139` | ✅ |
| `conversation/get` | `conversations.ts:170` | ✅ |
| `conversation/create` | `conversations.ts:205` | ✅ |
| `conversation/update` | `conversations.ts:242` | ✅ |
| `conversation/delete` | `conversations.ts:276` | ✅ |
| `conversation/send` | `conversations.ts:336`, `chat.ts:95` | ✅ |
| `conversation/load` | `chat.ts:197` | ✅ |
| `conversation/toggleContext` | - | ❌ Sin uso |
| `conversation/contextStats` | - | ❌ Sin uso |

### filesystem (✅ CORREGIDO)

| Backend Handler | Frontend Store | Estado |
|-----------------|----------------|--------|
| `fs/list` | `files.ts:157` | ✅ |
| `fs/read` | `files.ts:255` | ✅ |
| `fs/write` | `files.ts:386` | ✅ |
| `fs/delete` | `files.ts:419` | ✅ |
| `fs/mkdir` | `files.ts:376` | ✅ |
| `fs/move` | - | ❌ Sin uso |
| `fs/copy` | - | ❌ Sin uso |
| `fs/search` | `files.ts:475` | ✅ |
| `fs/info` | - | ❌ Sin uso |
| `fs/cleanup` | - | ❌ Sin uso |
| `fs/stats` | - | ❌ Sin uso |

### text-editor

| Backend Handler | Frontend Store | Estado |
|-----------------|----------------|--------|
| `editor/open` | `files.ts:269` | ✅ |
| `editor/save` | `files.ts:325` | ✅ |
| `editor/validate` | `files.ts:526` | ✅ |
| `editor/format` | `files.ts:561` | ✅ |

### prompt-manager

| Backend Handler | Frontend Store | Estado |
|-----------------|----------------|--------|
| `prompt/list` | `prompts.ts:190` | ✅ |
| `prompt/get` | `prompts.ts:220` | ✅ |
| `prompt/create` | `prompts.ts:243` | ✅ |
| `prompt/update` | `prompts.ts:272` | ✅ |
| `prompt/delete` | `prompts.ts:294` | ✅ |
| `prompt/versions` | `prompts.ts:333` | ✅ |
| `prompt/analytics` | `prompts.ts:600` | ✅ |
| `preset/list` | `prompts.ts:360` | ✅ |
| `preset/get` | - | ❌ Sin uso |
| `preset/create` | `prompts.ts:390` | ✅ |
| `preset/delete` | `prompts.ts:436` | ✅ |
| `preset/apply` | `prompts.ts:412` | ✅ |
| `composer/render` | `prompts.ts:555` | ✅ |

### pdf-viewer

| Backend Handler | Frontend Store | Estado |
|-----------------|----------------|--------|
| `pdf/view` | `files.ts:227` | ✅ |
| `pdf/metadata` | - | ❌ Sin uso |
| `pdf/list` | - | ❌ Sin uso |

---

## Handlers Sin Uso en UI (15 total)

Estos handlers están implementados en el backend pero no tienen llamadas correspondientes en el frontend:

### Funcionalidad de Sesión (project-manager)
1. `project/saveSession` - Guardar estado de sesión
2. `project/restoreSession` - Restaurar estado de sesión
3. `project/setAIConfig` - Configurar AI del proyecto
4. `project/setLastConversation` - Marcar última conversación

### Gestión de Contexto (conversation-manager)
5. `conversation/toggleContext` - Activar/desactivar contexto
6. `conversation/contextStats` - Estadísticas de contexto

### Operaciones de Archivo Avanzadas (filesystem)
7. `fs/move` - Mover archivo/directorio
8. `fs/copy` - Copiar archivo/directorio
9. `fs/info` - Información detallada
10. `fs/cleanup` - Limpieza de archivos temporales
11. `fs/stats` - Estadísticas del sistema de archivos

### Otros
12. `credential/get` - Obtener credencial específica
13. `preset/get` - Obtener preset específico
14. `pdf/metadata` - Metadatos de PDF
15. `pdf/list` - Listar PDFs

---

## Recomendaciones

### ✅ Prioridad Alta (RESUELTO)

~~1. **Corregir dominio en files.ts**~~ - COMPLETADO
~~2. **Corregir action create**~~ - COMPLETADO

### Prioridad Media (Mejoras)

1. **Unificar load/get de conversaciones** - Decidir cuál usar
2. **Implementar UI para funciones faltantes** - sesión, contexto, etc.

### Prioridad Baja (Limpieza)

3. **Evaluar handlers sin uso** - ¿Son para futuras features o dead code?

---

## Archivos Modificados

Correcciones aplicadas en:

- `frontend/src/lib/stores/files.ts`:
  - Línea 157: `'fs', 'list'` (antes 'files')
  - Línea 255: `'fs', 'read'` (antes 'files')
  - Línea 376: `'fs', 'mkdir'` (nuevo)
  - Línea 386: `'fs', 'write'` (antes 'files', 'create')
  - Línea 419: `'fs', 'delete'` (antes 'files')
  - Línea 475: `'fs', 'search'` (antes 'files')
