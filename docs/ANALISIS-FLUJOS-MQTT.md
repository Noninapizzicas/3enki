# Análisis de Flujos MQTT Backend ↔ Frontend

**Fecha**: 2025-12-30
**Estado**: Análisis completado con gaps identificados

---

## Resumen Ejecutivo

Se verificaron los flujos de comunicación MQTT entre el backend (handlers registrados) y el frontend (llamadas mqttRequest). Se encontraron **3 gaps críticos** que impiden el funcionamiento de funcionalidades y **16 handlers del backend sin uso en UI**.

### Estado por Módulo

| Módulo | Backend Handlers | UI Calls | Estado |
|--------|-----------------|----------|--------|
| project-manager | 10 | 6 | ⚠️ Parcial |
| credential-manager | 6 | 5 | ⚠️ Parcial |
| conversation-manager | 9 | 7 | ⚠️ Parcial |
| filesystem | 11 | 0 | ❌ **GAP CRÍTICO** |
| text-editor | 4 | 4 | ✅ Completo |
| prompt-manager | 13 | 12 | ⚠️ Parcial |
| pdf-viewer | 3 | 1 | ⚠️ Parcial |

---

## GAPS CRÍTICOS

### 1. Dominio Filesystem Inconsistente

**Problema**: El frontend usa dominio `files` pero el backend registra dominio `fs`.

```
Frontend (files.ts):
- mqttRequest('files', 'list', ...)
- mqttRequest('files', 'read', ...)
- mqttRequest('files', 'create', ...)
- mqttRequest('files', 'delete', ...)
- mqttRequest('files', 'search', ...)

Backend (filesystem/index.js):
- uiHandler.register('fs', 'list', ...)
- uiHandler.register('fs', 'read', ...)
- uiHandler.register('fs', 'write', ...)  // NO 'create'
- uiHandler.register('fs', 'delete', ...)
- uiHandler.register('fs', 'search', ...)
```

**Impacto**: El panel de archivos NO funciona.

**Solución**: Cambiar en `frontend/src/lib/stores/files.ts`:
- `'files'` → `'fs'`
- `'create'` → `'write'`

### 2. Action 'create' No Existe en Filesystem

**Problema**: Frontend llama `files/create` pero backend solo tiene `fs/write`.

```typescript
// files.ts:371
await mqttRequest<{...}>('files', 'create', { ... });

// Backend no tiene fs/create, solo:
// - fs/write (para archivos)
// - fs/mkdir (para directorios)
```

### 3. Conversation Load Duplicado

**Problema**: Existen dos formas de cargar conversaciones.

```typescript
// chat.ts:197
mqttRequest('conversation', 'load', { conversationId })

// conversations.ts:170
mqttRequest('conversation', 'get', { conversationId })
```

Ambos existen en backend pero tienen comportamiento similar.

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

### filesystem (❌ GAP CRÍTICO)

| Backend Handler | Frontend Store | Estado |
|-----------------|----------------|--------|
| `fs/list` | `files.ts:152` usa 'files' | ❌ **DOMAIN MISMATCH** |
| `fs/read` | `files.ts:248` usa 'files' | ❌ **DOMAIN MISMATCH** |
| `fs/write` | - | ❌ UI usa 'create' |
| `fs/delete` | `files.ts:405` usa 'files' | ❌ **DOMAIN MISMATCH** |
| `fs/mkdir` | - | ❌ Sin uso |
| `fs/move` | - | ❌ Sin uso |
| `fs/copy` | - | ❌ Sin uso |
| `fs/search` | `files.ts:460` usa 'files' | ❌ **DOMAIN MISMATCH** |
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

## Handlers Sin Uso en UI (16 total)

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
7. `fs/mkdir` - Crear directorio
8. `fs/move` - Mover archivo/directorio
9. `fs/copy` - Copiar archivo/directorio
10. `fs/info` - Información detallada
11. `fs/cleanup` - Limpieza de archivos temporales
12. `fs/stats` - Estadísticas del sistema de archivos

### Otros
13. `credential/get` - Obtener credencial específica
14. `preset/get` - Obtener preset específico
15. `pdf/metadata` - Metadatos de PDF
16. `pdf/list` - Listar PDFs

---

## Recomendaciones

### Prioridad Alta (Bugs Críticos)

1. **Corregir dominio en files.ts**:
   ```typescript
   // Cambiar todas las ocurrencias de:
   mqttRequest('files', 'list', ...)
   // A:
   mqttRequest('fs', 'list', ...)
   ```

2. **Corregir action create**:
   ```typescript
   // Cambiar:
   mqttRequest('files', 'create', { type: 'file', ... })
   // A:
   mqttRequest('fs', 'write', { ... })

   // Y para directorios:
   mqttRequest('fs', 'mkdir', { ... })
   ```

### Prioridad Media (Mejoras)

3. **Unificar load/get de conversaciones** - Decidir cuál usar
4. **Implementar UI para funciones faltantes** - sesión, contexto, etc.

### Prioridad Baja (Limpieza)

5. **Evaluar handlers sin uso** - ¿Son para futuras features o dead code?

---

## Archivos Afectados

Para corregir los gaps críticos, modificar:

- `frontend/src/lib/stores/files.ts` - Líneas 152, 227, 248, 269, 325, 371, 405, 460, 526, 561
