# Plan de Integración del Chat

**Fecha:** 2025-12-28
**Estado:** En definición
**Objetivo:** Integrar todos los módulos en un flujo de chat unificado

---

## Visión General

Cada proyecto es un **mundo aislado** dentro del sistema, pero accede a **recursos compartidos** del sistema (credenciales, plugins, tools). El chat es el punto central de interacción.

```
┌─────────────────────────────────────────────────────────────┐
│                      SISTEMA GLOBAL                         │
│  • Config base (DeepSeek default)                          │
│  • Prompt base nuevos proyectos                            │
│  • Recursos compartidos (credenciales, plugins, tools)     │
└─────────────────────────────────────────────────────────────┘
           │              │              │
           ▼              ▼              ▼
    ┌───────────┐  ┌───────────┐  ┌───────────┐
    │ Proyecto A│  │ Proyecto B│  │ Proyecto C│
    │───────────│  │───────────│  │───────────│
    │• /data/A/ │  │• /data/B/ │  │• /data/C/ │
    │• Sus conv │  │• Sus conv │  │• Sus conv │
    │• Su estado│  │• Su estado│  │• Su estado│
    │• Hereda   │  │• Hereda   │  │• Hereda   │
    │  global   │  │  global   │  │  global   │
    └───────────┘  └───────────┘  └───────────┘
```

---

## Módulos Definidos

### 1. AI Gateway

| Decisión | Valor | Notas |
|----------|-------|-------|
| Cambio proveedor/modelo | Selector desde UI | No comandos, solo UI |
| Mostrar costos/tokens | No | Oculto al usuario |
| Streaming | No | Respuesta completa |
| Proveedor default | DeepSeek | Configurable por proyecto |

**Implementación:**
- Selector en header/sidebar del chat
- Dropdown con proveedores disponibles
- Modelos filtrados por proveedor seleccionado

---

### 2. Project Manager

| Decisión | Valor | Notas |
|----------|-------|-------|
| Config inicial | Global (DeepSeek) | Override opcional por proyecto |
| Prompt nuevos proyectos | Prompt base del sistema | Heredado, modificable |
| Directorio proyecto | `/data/projects/{nombre}/` | Aislado por proyecto |
| Conversaciones | Solo las del proyecto | Filtrado por project_id |
| Estado sesión | Persistir última sesión | Retomar donde quedó |
| Filosofía | Mundo aislado + acceso a recursos compartidos | |

**Campos a persistir en sesión:**
- `last_conversation_id` - Última conversación abierta
- `scroll_position` - Posición del scroll
- `context_config` - Configuración de contexto
- `ui_state` - Estado de paneles (abiertos/cerrados)

**Estructura de directorio:**
```
/data/projects/
  └── {nombre-proyecto}/
      ├── files/          # Archivos del proyecto
      ├── exports/        # Exportaciones
      └── cache/          # Cache temporal
```

---

### 3. Conversation Manager

| Decisión | Valor | Notas |
|----------|-------|-------|
| Context window | 20 mensajes (default) | Configurable dinámicamente |
| Attachments | Soportado | Archivos adjuntos en mensajes |
| Editar mensaje | No | Descartado |
| Checkbox contexto | Sí | Activar/desactivar por mensaje |
| Máximo contexto | 20 (configurable) | Límite fijo |
| Auto-gestión | FIFO | Antiguos se desactivan automáticamente |

#### Sistema de Contexto Auto-gestionado

**Lógica de funcionamiento:**

```
┌─────────────────────────────────────────────────────┐
│ Proyecto X  │  Conv: "Debug API"                    │
├─────────────────────────────────────────────────────┤
│                                    Contexto: [15]   │ ← contador visible
├─────────────────────────────────────────────────────┤
│ [ ] Msg 1  (auto-desactivado, superó límite)       │
│ [ ] Msg 2  (auto-desactivado)                      │
│ [✓] Msg 3  ← activo                                │
│ [ ] Msg 4  ← desactivado manualmente               │
│ [✓] Msg 5  ← activo                                │
│ [✓] ...                                            │
│ [✓] Msg 20 ← activo (más reciente)                 │
└─────────────────────────────────────────────────────┘
```

**Reglas:**

| Regla | Comportamiento |
|-------|----------------|
| Máximo | 20 activos (configurable por usuario) |
| Nuevos mensajes | Se activan automáticamente |
| Si supera máximo | El más antiguo ACTIVO se desactiva (FIFO) |
| Manual OFF | Usuario desactiva → queda OFF permanentemente |
| Manual ON | Usuario reactiva → si hay 20, desactiva otro antiguo |
| Contador | Siempre visible en UI |

**Campos en tabla `messages`:**
```sql
ALTER TABLE messages ADD COLUMN in_context BOOLEAN DEFAULT TRUE;
ALTER TABLE messages ADD COLUMN manually_toggled BOOLEAN DEFAULT FALSE;
```

**Algoritmo al enviar mensaje:**
```javascript
async function addMessageToContext(conversationId, newMessage) {
  const maxContext = conversation.max_context || 20;

  // 1. Contar mensajes activos actuales
  const activeCount = await countActiveMessages(conversationId);

  // 2. Si supera límite, desactivar el más antiguo NO manualmente fijado
  if (activeCount >= maxContext) {
    await deactivateOldestAutoMessage(conversationId);
  }

  // 3. Insertar nuevo mensaje como activo
  await insertMessage(newMessage, { in_context: true });

  // 4. Actualizar contador en UI
  emitContextCountUpdate(conversationId);
}
```

---

## Módulos Pendientes de Definir

| # | Módulo | Estado |
|---|--------|--------|
| 4 | Calling Generator | ⏳ Pendiente |
| 5 | Prompt Manager | ⏳ Pendiente |
| 6 | Plugin Manager | ⏳ Pendiente |
| 7 | Credential Manager | ⏳ Pendiente |
| 8 | Storage Manager | ⏳ Pendiente |
| 9 | Database Manager | ⏳ Pendiente |
| 10 | File Browser | ⏳ Pendiente |
| 11 | Text Editor | ⏳ Pendiente |
| 12 | PDF Viewer | ⏳ Pendiente |

---

## Flujo General del Chat (Borrador)

```
Usuario escribe mensaje
        │
        ▼
┌─────────────────────┐
│ Conversation Manager│
│ • Guarda mensaje    │
│ • Gestiona contexto │
│ • Carga attachments │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│   Prompt Manager    │
│ • Prompt del proyecto│
│ • System prompt     │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│    AI Gateway       │
│ • Selecciona modelo │
│ • Envía a proveedor │
│ • Recibe respuesta  │
└─────────┬───────────┘
          │
          ▼
    ¿Tool call?
     /        \
   Sí          No
   │            │
   ▼            │
┌─────────────┐ │
│Tool Orchest.│ │
│• Ejecuta    │ │
│• Retorna    │ │
└──────┬──────┘ │
       │        │
       ▼        ▼
┌─────────────────────┐
│ Conversation Manager│
│ • Guarda respuesta  │
│ • Actualiza contexto│
│ • Notifica UI       │
└─────────────────────┘
```

---

## Notas Adicionales

- **Tool Orchestrator:** Actualmente conectado pero sin tools registradas. Pendiente definir qué tools exponer.
- **System Inspector:** Módulo de observabilidad para que Claude pueda consultar estado del sistema en `/data/system-console.json`.

---

## Changelog

| Fecha | Cambio |
|-------|--------|
| 2025-12-28 | Documento inicial con AI Gateway, Project Manager, Conversation Manager |

