# Análisis: Eventos con Contexto Embebido

## Índice
1. [El Problema Actual](#el-problema-actual)
2. [La Propuesta](#la-propuesta)
3. [Qué Ganamos](#qué-ganamos)
4. [Qué Perdemos](#qué-perdemos)
5. [Impacto por Módulo](#impacto-por-módulo)
6. [Matriz de Decisión](#matriz-de-decisión)
7. [Estrategias de Implementación](#estrategias-de-implementación)

---

## El Problema Actual

### Situación Real en el Código

```javascript
// modules/ai-agent-framework/tool-manager.js:516
this.eventBus.publish('fs.write.request', {
  request_id,
  path,
  content,
  encoding
  // ❌ SIN: client_id, project_id, user_id, conversation_id
});

// modules/filesystem/index.js:170
const { request_id, path, content, encoding } = data;
// ❓ ¿Para qué proyecto es esto?
// ❓ ¿De qué cliente?
// ❓ ¿Qué usuario lo solicitó?
```

### El Hack Actual

```javascript
// filesystem usa estado GLOBAL
this.activeProjectId = project_id;      // ← Se setea con project.activated
this.activeProjectPath = path;          // ← Estado compartido

// PROBLEMA: Si hay 2 requests simultáneos de diferentes proyectos...
// 💥 COLISIÓN
```

### Diagrama del Problema

```
         ┌─────────────────────────────────────────────────────────────────┐
         │                    SISTEMA ACTUAL                               │
         └─────────────────────────────────────────────────────────────────┘

    Usuario A (Proyecto X)              Usuario B (Proyecto Y)
           │                                   │
           ▼                                   ▼
    ┌─────────────┐                     ┌─────────────┐
    │  Telegram   │                     │    Chat     │
    │   Agente    │                     │     UI      │
    └──────┬──────┘                     └──────┬──────┘
           │                                   │
           │  fs.write.request                 │  fs.write.request
           │  { path: "nota.txt" }             │  { path: "nota.txt" }
           │                                   │
           └─────────────┬─────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │     filesystem      │
              │                     │
              │  activeProjectId: ? │  ← ¿CUÁL DE LOS DOS?
              │  activeProjectPath: │
              │    /storage/???/    │
              └─────────────────────┘
                         │
                         ▼
                   ¿DÓNDE ESCRIBO?
                 /storage/X/nota.txt
                        o
                 /storage/Y/nota.txt
                        ???
```

---

## La Propuesta

### Evento Enriquecido con Contexto

```javascript
// ANTES (actual)
{
  event_type: "fs.write.request",
  data: {
    path: "nota.txt",
    content: "..."
  }
}

// DESPUÉS (propuesta)
{
  event_type: "fs.write.request",
  data: {
    path: "nota.txt",
    content: "..."
  },
  context: {                    // ← NUEVO: Contexto embebido
    client_id: "client-123",
    project_id: "project-456",
    user_id: "user-789",
    conversation_id: "conv-abc",
    source: "telegram-agent",
    session_id: "sess-xyz"
  }
}
```

### Flujo Propuesto

```
         ┌─────────────────────────────────────────────────────────────────┐
         │                    SISTEMA PROPUESTO                            │
         └─────────────────────────────────────────────────────────────────┘

    Usuario A (Proyecto X)              Usuario B (Proyecto Y)
           │                                   │
           ▼                                   ▼
    ┌─────────────┐                     ┌─────────────┐
    │  Telegram   │                     │    Chat     │
    │   Agente    │                     │     UI      │
    └──────┬──────┘                     └──────┬──────┘
           │                                   │
           │ RESOLUCIÓN DE CONTEXTO            │ YA TIENE CONTEXTO
           │ (una sola vez)                    │ (del chat-session)
           ▼                                   ▼
    ┌─────────────┐                     ┌─────────────┐
    │  Context    │                     │   Context   │
    │  Resolver   │                     │   (inline)  │
    └──────┬──────┘                     └──────┬──────┘
           │                                   │
           │  fs.write.request                 │  fs.write.request
           │  {                                │  {
           │    path: "nota.txt",              │    path: "nota.txt",
           │    context: {                     │    context: {
           │      project_id: "X"              │      project_id: "Y"
           │    }                              │    }
           │  }                                │  }
           │                                   │
           └─────────────┬─────────────────────┘
                         │
                         ▼
              ┌─────────────────────┐
              │     filesystem      │
              │                     │
              │  Lee context del    │
              │  evento, NO estado  │
              │  global             │
              └─────────────────────┘
                    │         │
                    ▼         ▼
           /storage/X/    /storage/Y/
            nota.txt       nota.txt
               ✓              ✓
```

---

## Qué Ganamos

### 1. ✅ Concurrencia Real

```
ANTES:
┌────────────────────────────────────────────────────────┐
│  Request A ──────────────────────────────────────────► │
│            ↓ setea proyecto X                          │
│  Request B ──────────────────────────────────────────► │
│            ↓ SOBREESCRIBE con proyecto Y               │
│  Request A continúa... pero usa proyecto Y ❌          │
└────────────────────────────────────────────────────────┘

DESPUÉS:
┌────────────────────────────────────────────────────────┐
│  Request A { context: { project: X } } ──────────────► │
│  Request B { context: { project: Y } } ──────────────► │
│                                                        │
│  Cada request lleva su propio contexto ✅              │
│  No hay estado compartido que colisione               │
└────────────────────────────────────────────────────────┘
```

**Beneficio**: Multi-tenancy real sin race conditions.

### 2. ✅ Resolución Única (Performance)

```
ANTES (N resoluciones):
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Evento ──► Módulo A ──► "¿contexto?" ──► DB Query     │
│        └──► Módulo B ──► "¿contexto?" ──► DB Query     │
│        └──► Módulo C ──► "¿contexto?" ──► DB Query     │
│        └──► Módulo D ──► "¿contexto?" ──► DB Query     │
│                                                         │
│  = 4 queries a la base de datos                        │
│  = 4 × latencia de resolución                          │
└─────────────────────────────────────────────────────────┘

DESPUÉS (1 resolución):
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Origen ──► ContextResolver ──► 1 DB Query             │
│         │                                               │
│         └──► Evento + Contexto                         │
│                    │                                    │
│                    ├──► Módulo A (lee contexto) ✓      │
│                    ├──► Módulo B (lee contexto) ✓      │
│                    ├──► Módulo C (lee contexto) ✓      │
│                    └──► Módulo D (lee contexto) ✓      │
│                                                         │
│  = 1 query a la base de datos                          │
│  = Consistencia garantizada                            │
└─────────────────────────────────────────────────────────┘
```

**Beneficio**: Menos queries, mejor performance, consistencia.

### 3. ✅ Trazabilidad Completa

```javascript
// Cada evento en los logs tiene contexto completo
{
  timestamp: "2024-01-07T10:30:00Z",
  event_type: "fs.write.request",
  event_id: "evt-123",
  context: {
    client_id: "acme-corp",
    project_id: "website-redesign",
    user_id: "juan@acme.com",
    conversation_id: "conv-789",
    source: "telegram-agent",
    agent_id: "image-processor"
  },
  data: {
    path: "images/logo.png"
  }
}

// Debugging: "¿Por qué se creó este archivo?"
// → Fácil: fue el agente image-processor, para el proyecto website-redesign,
//   iniciado por juan@acme.com desde Telegram
```

**Beneficio**: Auditoría y debugging triviales.

### 4. ✅ Módulos Más Simples

```javascript
// ANTES: Módulo debe resolver contexto
class FilesystemModule {
  async onWriteRequest(event) {
    const { path, content } = event.data;

    // 😰 ¿De dónde saco el proyecto?
    const projectId = this.activeProjectId;  // ← Estado global, peligroso
    // O peor:
    const projectId = await this.resolveProjectFromSomewhere(???);

    const fullPath = `/storage/${projectId}/${path}`;
    // ...
  }
}

// DESPUÉS: Módulo recibe contexto
class FilesystemModule {
  async onWriteRequest(event) {
    const { path, content } = event.data;
    const { project_id } = event.context;  // ← Ya viene resuelto ✅

    const fullPath = `/storage/${project_id}/${path}`;
    // ...
  }
}
```

**Beneficio**: Menos código, menos errores, más fácil de testear.

### 5. ✅ Testing Simplificado

```javascript
// ANTES: Mockear estado global
beforeEach(() => {
  filesystem.activeProjectId = 'test-project';
  filesystem.activeProjectPath = '/tmp/test';
});

// DESPUÉS: Evento auto-contenido
test('should write file to correct project', async () => {
  const event = {
    data: { path: 'test.txt', content: 'hello' },
    context: { project_id: 'test-project' }  // ← Contexto explícito
  };

  await filesystem.onWriteRequest(event);
  // Verificar que escribió en /storage/test-project/test.txt
});
```

**Beneficio**: Tests determinísticos, sin estado compartido.

### 6. ✅ Replay de Eventos

```javascript
// Con contexto embebido, puedes hacer replay de eventos
const historicalEvents = await loadEventsFromLog('2024-01-01', '2024-01-07');

for (const event of historicalEvents) {
  // El evento tiene todo lo necesario para re-ejecutarse
  await eventBus.emit(event.event_type, event.data, {
    context: event.context  // ← Contexto original preservado
  });
}
```

**Beneficio**: Event sourcing, auditoría, recuperación de desastres.

---

## Qué Perdemos

### 1. ❌ Eventos Más Pesados

```javascript
// ANTES: ~100 bytes
{
  event_type: "fs.write.request",
  data: { path: "nota.txt", content: "hola" }
}

// DESPUÉS: ~300 bytes
{
  event_type: "fs.write.request",
  data: { path: "nota.txt", content: "hola" },
  context: {
    client_id: "client-123",
    project_id: "project-456",
    user_id: "user-789",
    conversation_id: "conv-abc",
    source: "telegram-agent",
    session_id: "sess-xyz",
    timestamp: "2024-01-07T10:30:00Z"
  }
}
```

**Impacto**: ~3x más tamaño por evento.

**Mitigación**:
```javascript
// Usar IDs cortos
context: {
  c: "c123",    // client_id
  p: "p456",    // project_id
  u: "u789",    // user_id
  s: "telegram" // source
}

// O comprimir en MQTT
mqttClient.publish(topic, compress(event));
```

### 2. ❌ Responsabilidad en el Origen

```
ANTES:
┌────────────────────────────────────────────────────────┐
│  Cualquier módulo puede emitir eventos                 │
│  El receptor se encarga de entender el contexto        │
└────────────────────────────────────────────────────────┘

DESPUÉS:
┌────────────────────────────────────────────────────────┐
│  El ORIGEN debe conocer/resolver el contexto           │
│  Si no lo tiene, debe obtenerlo ANTES de emitir        │
│                                                        │
│  ¿Qué pasa si el origen no sabe el contexto?          │
│  → Debe existir un mecanismo de resolución             │
└────────────────────────────────────────────────────────┘
```

**Problema**: ¿Qué pasa con webhooks externos que no tienen contexto?

**Mitigación**:
```javascript
// Gateway de entrada que enriquece eventos
class IngressGateway {
  async handleTelegramWebhook(payload) {
    const telegramUserId = payload.message.from.id;

    // Resolver contexto UNA VEZ
    const context = await this.contextResolver.resolve({
      identity_type: 'telegram',
      identity_id: telegramUserId
    });

    // Emitir evento ya enriquecido
    await this.eventBus.emit('telegram.message.received', payload, { context });
  }
}
```

### 3. ❌ Acoplamiento al Esquema de Contexto

```javascript
// Si cambias la estructura del contexto...
// v1
context: { project_id: "123" }

// v2
context: { project: { id: "123", name: "Mi Proyecto" } }

// ❌ Todos los módulos que lean context.project_id se rompen
```

**Mitigación**:
```javascript
// Usar helper functions
function getProjectId(event) {
  return event.context?.project_id
      || event.context?.project?.id
      || null;
}

// O versionado
context: {
  _version: 2,
  project: { id: "123" }
}
```

### 4. ❌ Posible Sobre-exposición de Datos

```javascript
// TODOS los suscriptores ven TODO el contexto
{
  context: {
    client_id: "acme-corp",
    user_id: "ceo@acme.com",      // ¿El módulo de métricas necesita esto?
    conversation_id: "...",       // ¿El filesystem necesita la conversación?
    api_key: "sk-..."             // ⚠️ ¡Cuidado con datos sensibles!
  }
}
```

**Mitigación**:
```javascript
// Nunca incluir secretos en contexto
// Usar referencias, no valores
context: {
  credential_ref: "cred-123"  // Referencia, no el valor
}

// El módulo que necesite la credencial la resuelve por separado
const credential = await credentialManager.get(context.credential_ref);
```

### 5. ❌ Migración de Código Existente

```
Módulos que necesitan cambios:
├── ai-agent-framework/tool-manager.js    → Debe pasar contexto
├── ai-agent-framework/agent.js           → Debe propagar contexto
├── telegram-service                       → Debe resolver contexto
├── filesystem                             → Debe leer contexto del evento
├── database-manager                       → Debe leer contexto del evento
├── ... y todos los que emiten/reciben eventos
```

**Mitigación**:
```javascript
// Backward compatibility
function getContext(event) {
  // Nuevo: contexto en evento
  if (event.context) return event.context;

  // Legacy: estado global (deprecated)
  return {
    project_id: this.activeProjectId,
    client_id: this.activeClientId
  };
}
```

---

## Impacto por Módulo

| Módulo | Cambio Requerido | Complejidad | Beneficio |
|--------|------------------|-------------|-----------|
| **filesystem** | Leer contexto del evento | Baja | Alto - elimina estado global |
| **database-manager** | Leer contexto del evento | Baja | Alto - multi-tenant |
| **ai-agent-framework** | Propagar contexto en tool calls | Media | Alto - agentes conscientes |
| **telegram-service** | Resolver contexto al recibir | Media | Crítico - punto de entrada |
| **chat-ai-bridge** | Ya tiene contexto, propagar | Baja | Medio - consistencia |
| **prompt-composer** | Leer contexto del evento | Baja | Medio - simplificación |
| **credential-manager** | Leer contexto para scope | Baja | Alto - multi-tenant |
| **EventEnvelope** | Agregar campo `context` | Baja | Fundacional |

---

## Matriz de Decisión

```
                           COMPLEJIDAD DE IMPLEMENTACIÓN
                    Baja              Media              Alta
                ┌─────────────────┬─────────────────┬─────────────────┐
         Alto   │                 │                 │                 │
                │  ★ HACER ★      │   PLANIFICAR    │    EVALUAR     │
                │                 │                 │                 │
BENEFICIO       ├─────────────────┼─────────────────┼─────────────────┤
                │                 │                 │                 │
         Medio  │   HACER         │   CONSIDERAR    │    EVITAR      │
                │                 │                 │                 │
                ├─────────────────┼─────────────────┼─────────────────┤
                │                 │                 │                 │
         Bajo   │   OPCIONAL      │    EVITAR       │   NO HACER     │
                │                 │                 │                 │
                └─────────────────┴─────────────────┴─────────────────┘

Ubicación del cambio propuesto:
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   Beneficio: ALTO (multi-tenancy, concurrencia, trazabilidad)      │
│   Complejidad: MEDIA (cambios en varios módulos, pero mecánicos)   │
│                                                                     │
│   → RECOMENDACIÓN: PLANIFICAR E IMPLEMENTAR POR FASES              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Estrategias de Implementación

### Estrategia 1: Big Bang (No Recomendada)

```
Semana 1-2: Modificar TODOS los módulos a la vez
Riesgo: ALTO - si algo falla, todo falla
```

### Estrategia 2: Incremental con Backward Compatibility (Recomendada)

```
Fase 1: Fundación
├── Modificar EventEnvelope para soportar context
├── Crear ContextResolver module
└── Tests unitarios

Fase 2: Puntos de Entrada
├── telegram-service: resolver contexto al recibir
├── chat-ai-bridge: propagar contexto existente
└── http-gateway: enriquecer requests con contexto

Fase 3: Consumidores
├── filesystem: leer contexto (con fallback a estado global)
├── database-manager: leer contexto
└── credential-manager: leer contexto

Fase 4: Propagación
├── ai-agent-framework: propagar contexto en tool calls
├── Eliminar fallbacks a estado global
└── Deprecar estado global
```

### Estrategia 3: Híbrida (Pragmática)

```javascript
// Middleware que enriquece eventos automáticamente
class ContextMiddleware {
  async beforePublish(event) {
    // Si ya tiene contexto, no hacer nada
    if (event.context) return event;

    // Intentar inferir contexto del estado actual
    const inferredContext = await this.inferContext(event);

    return {
      ...event,
      context: inferredContext
    };
  }
}
```

---

## Conclusión

### Resumen de Trade-offs

| Aspecto | Sin Contexto (Actual) | Con Contexto (Propuesta) |
|---------|----------------------|--------------------------|
| Tamaño de eventos | Pequeño | ~3x más grande |
| Multi-tenancy | Problemático | ✅ Nativo |
| Concurrencia | Race conditions | ✅ Sin colisiones |
| Trazabilidad | Difícil | ✅ Completa |
| Complejidad módulos | Alta (resolver ctx) | ✅ Baja (ctx dado) |
| Migración | N/A | Media |
| Testing | Complejo | ✅ Simple |

### Veredicto

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   El cambio VALE LA PENA si:                                       │
│                                                                     │
│   ✅ Necesitas multi-tenancy real (múltiples clientes/proyectos)   │
│   ✅ Tienes problemas de concurrencia actuales                     │
│   ✅ Necesitas trazabilidad/auditoría                              │
│   ✅ Quieres simplificar los módulos                               │
│                                                                     │
│   El cambio NO vale la pena si:                                    │
│                                                                     │
│   ❌ Sistema single-tenant para siempre                            │
│   ❌ No hay problemas de concurrencia                              │
│   ❌ No necesitas auditoría                                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Próximos Pasos Sugeridos

1. **Validar el problema**: ¿Realmente tenemos race conditions hoy?
2. **Prototipo**: Implementar en UN flujo (ej: telegram → filesystem)
3. **Medir**: Comparar complejidad antes/después
4. **Decidir**: ¿Extender a todo el sistema?
