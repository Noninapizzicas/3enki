# Arquitectura de Contexto para Agentes

> Análisis profundo de cómo los agentes deben conocer su contexto de ejecución en un sistema multi-tenant escalable.
>
> **Fecha**: 2026-01-07
> **Versión**: 1.0.0

---

## La Pregunta Fundamental

> **¿Cómo sabe el sistema PARA QUIÉN trabaja el agente?**

Esta pregunta tiene múltiples dimensiones:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DIMENSIONES DE IDENTIDAD                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. ¿QUIÉN invoca al agente?                                                 │
│     → Usuario de Telegram (chat_id, user_id)                                 │
│     → Usuario de UI web (session_id, user_id)                                │
│     → Otro agente (agent_id)                                                 │
│     → Sistema (cron, webhook)                                                │
│                                                                              │
│  2. ¿PARA QUÉ CLIENTE trabaja?                                               │
│     → Cliente A (empresa, organización)                                      │
│     → Cliente B                                                              │
│     → Uso personal (sin cliente específico)                                  │
│                                                                              │
│  3. ¿EN QUÉ PROYECTO trabaja?                                                │
│     → Proyecto X del Cliente A                                               │
│     → Proyecto Y del Cliente A                                               │
│     → Proyecto Z del Cliente B                                               │
│                                                                              │
│  4. ¿CON QUÉ CREDENCIALES?                                                   │
│     → API keys del proyecto                                                  │
│     → API keys del cliente                                                   │
│     → API keys globales (fallback)                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Estado Actual del Sistema

### Lo que YA existe

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SISTEMA ACTUAL                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CREDENTIAL-MANAGER                                                          │
│  ─────────────────                                                          │
│  Cascada de credenciales (ya implementada):                                  │
│                                                                              │
│    CUSTOM   →   {PROVIDER}_API_KEY_CUSTOM_{customId}                        │
│       ↓                                                                      │
│    CLIENT   →   {PROVIDER}_API_KEY_CLIENT_{clientId}                        │
│       ↓                                                                      │
│    PROJECT  →   {PROVIDER}_API_KEY_PROJECT_{projectId}                      │
│       ↓                                                                      │
│    GLOBAL   →   {PROVIDER}_API_KEY_GLOBAL                                   │
│                                                                              │
│  ✅ El sistema YA soporta multi-tenant a nivel de credenciales              │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PROJECT-MANAGER                                                             │
│  ───────────────                                                            │
│  - Mantiene lista de proyectos                                               │
│  - Tiene concepto de "proyecto activo" (uno solo)                            │
│  - Estructura: /data/projects/{slug}/storage/                               │
│                                                                              │
│  ⚠️ LIMITACIÓN: Solo un proyecto activo a la vez (global)                   │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TELEGRAM-SERVICE                                                            │
│  ────────────────                                                           │
│  - Emite eventos con chat_id y from.id                                       │
│  - Soporta múltiples bots                                                    │
│  - PERO: No mapea usuarios a proyectos/clientes                              │
│                                                                              │
│  ⚠️ LIMITACIÓN: No hay relación usuario_telegram → proyecto                 │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  AI-AGENT-FRAMEWORK                                                          │
│  ──────────────────                                                         │
│  - Ejecuta agentes basados en triggers                                       │
│  - Contexto en memoria (volátil)                                             │
│  - No conoce proyecto/cliente                                                │
│                                                                              │
│  ⚠️ LIMITACIÓN: Agentes "ciegos" a su contexto de ejecución                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Lo que FALTA

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LO QUE FALTA                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. MAPEO DE IDENTIDADES                                                     │
│     ────────────────────                                                    │
│     Necesitamos saber:                                                       │
│     - telegram_user_id: 123456 → client_id: "acme", project_id: "proj-1"    │
│     - telegram_chat_id: 789012 → client_id: "beta", project_id: "proj-2"    │
│                                                                              │
│  2. CONTEXTO POR INVOCACIÓN                                                  │
│     ───────────────────────                                                 │
│     Cada trigger debe llevar:                                                │
│     - ¿Quién lo invocó? (source_type, source_id)                            │
│     - ¿Para qué cliente? (client_id)                                        │
│     - ¿En qué proyecto? (project_id)                                        │
│                                                                              │
│  3. PROYECTO ACTIVO POR CONTEXTO                                             │
│     ───────────────────────────                                             │
│     En lugar de un solo "proyecto activo global":                            │
│     - Proyecto activo por sesión de usuario                                  │
│     - Proyecto activo por chat de Telegram                                   │
│     - Proyecto activo por cliente                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Arquitectura Propuesta: Contexto de Ejecución

### Concepto: Execution Context

Cada invocación de un agente debe tener un **Execution Context** que responda a todas las preguntas:

```javascript
// Execution Context completo
{
  // Identificación del contexto
  context_id: "ctx-uuid",
  timestamp: "2026-01-07T12:00:00Z",

  // ¿QUIÉN invoca?
  source: {
    type: "telegram",           // telegram | ui | agent | system | api
    id: "123456789",            // chat_id, session_id, agent_id, etc.
    user: {
      id: "user-456",           // ID interno del usuario
      external_id: "987654321", // telegram user_id, etc.
      name: "Juan Pérez"
    }
  },

  // ¿PARA QUÉ CLIENTE?
  client: {
    id: "acme-corp",
    name: "ACME Corporation",
    plan: "enterprise"
  },

  // ¿EN QUÉ PROYECTO?
  project: {
    id: "proj-startup-2024",
    name: "Mi Startup 2024",
    description: "Proyecto de lanzamiento",
    base_path: "/data/projects/mi-startup-2024"
  },

  // ¿CON QUÉ CREDENCIALES?
  credentials: {
    anthropic: "resolved_from_project",
    openai: "resolved_from_client",
    telegram: "resolved_from_custom"
  },

  // Metadata adicional
  metadata: {
    correlation_id: "trace-123",
    parent_context_id: null,     // Si fue invocado por otro agente
    environment: "production"
  }
}
```

### Flujo: Resolución de Contexto

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUJO DE RESOLUCIÓN DE CONTEXTO                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TRIGGER ENTRANTE (ej: telegram.photo.received)                              │
│  ──────────────────────────────────────────────                             │
│  {                                                                           │
│    chat_id: 123456789,                                                       │
│    from: { id: 987654321, first_name: "Juan" }                              │
│  }                                                                           │
│       │                                                                      │
│       ▼                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐          │
│  │                    CONTEXT RESOLVER                            │          │
│  │                                                                │          │
│  │  1. Buscar mapeo: telegram_user_id → user                     │          │
│  │     SELECT * FROM user_identities                              │          │
│  │     WHERE provider='telegram' AND external_id='987654321'     │          │
│  │                                                                │          │
│  │  2. Si existe usuario → obtener cliente y proyecto activo     │          │
│  │     user.client_id → "acme-corp"                               │          │
│  │     user.active_project_id → "proj-startup-2024"              │          │
│  │                                                                │          │
│  │  3. Si NO existe → crear usuario o usar defaults              │          │
│  │     - Crear usuario nuevo                                      │          │
│  │     - Asignar cliente default                                  │          │
│  │     - Crear/asignar proyecto default                          │          │
│  │                                                                │          │
│  │  4. Construir Execution Context                               │          │
│  │                                                                │          │
│  └───────────────────────────────────────────────────────────────┘          │
│       │                                                                      │
│       ▼                                                                      │
│  EVENTO ENRIQUECIDO                                                          │
│  ──────────────────                                                         │
│  {                                                                           │
│    event_type: "telegram.photo.received",                                    │
│    data: { chat_id, from, photo... },                                        │
│    context: {                          // ← NUEVO                            │
│      source: { type: "telegram", ... },                                      │
│      client: { id: "acme-corp", ... },                                       │
│      project: { id: "proj-startup-2024", ... }                              │
│    }                                                                         │
│  }                                                                           │
│       │                                                                      │
│       ▼                                                                      │
│  AGENTE EJECUTA CON CONTEXTO COMPLETO                                        │
│  ─────────────────────────────────────                                      │
│  - Sabe para quién trabaja                                                   │
│  - Puede personalizar respuestas                                             │
│  - Archivos van al proyecto correcto                                         │
│  - Credenciales correctas se resuelven                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Modelo de Datos: Identidades y Mapeos

### Tablas Necesarias

```sql
-- Clientes (tenants)
CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'free',      -- free, pro, enterprise
  settings JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Usuarios del sistema
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients(id),
  name TEXT,
  email TEXT,
  role TEXT DEFAULT 'user',       -- user, admin, owner
  active_project_id TEXT,         -- Proyecto activo para este usuario
  settings JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Identidades externas (Telegram, Google, etc.)
CREATE TABLE user_identities (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  provider TEXT NOT NULL,          -- telegram, google, github, etc.
  external_id TEXT NOT NULL,       -- ID en el sistema externo
  external_username TEXT,          -- Username en el sistema externo
  metadata JSON,                   -- Datos adicionales del provider
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, external_id)
);

-- Proyectos (ya existe, se extiende)
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  client_id TEXT REFERENCES clients(id),  -- ← NUEVO: pertenece a un cliente
  name TEXT NOT NULL,
  description TEXT,
  base_path TEXT,
  settings JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Acceso de usuarios a proyectos
CREATE TABLE project_members (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  user_id TEXT REFERENCES users(id),
  role TEXT DEFAULT 'member',      -- member, admin, owner
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, user_id)
);

-- Contextos activos por chat de Telegram
CREATE TABLE telegram_contexts (
  chat_id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  active_project_id TEXT REFERENCES projects(id),
  last_activity DATETIME,
  metadata JSON
);
```

### Ejemplo de Datos

```sql
-- Cliente
INSERT INTO clients (id, name, plan) VALUES
  ('acme-corp', 'ACME Corporation', 'enterprise');

-- Usuario
INSERT INTO users (id, client_id, name, active_project_id) VALUES
  ('user-juan', 'acme-corp', 'Juan Pérez', 'proj-startup');

-- Identidad de Telegram
INSERT INTO user_identities (id, user_id, provider, external_id, external_username) VALUES
  ('id-tg-juan', 'user-juan', 'telegram', '987654321', 'juanperez');

-- Proyectos del cliente
INSERT INTO projects (id, client_id, name, base_path) VALUES
  ('proj-startup', 'acme-corp', 'Mi Startup', '/data/projects/mi-startup'),
  ('proj-blog', 'acme-corp', 'Blog Personal', '/data/projects/blog-personal');

-- Acceso del usuario a proyectos
INSERT INTO project_members (id, project_id, user_id, role) VALUES
  ('pm-1', 'proj-startup', 'user-juan', 'owner'),
  ('pm-2', 'proj-blog', 'user-juan', 'owner');

-- Contexto de Telegram (proyecto activo en ese chat)
INSERT INTO telegram_contexts (chat_id, user_id, active_project_id) VALUES
  ('123456789', 'user-juan', 'proj-startup');
```

---

## Nuevo Módulo: Context Resolver

### Responsabilidad

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CONTEXT-RESOLVER MODULE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  RESPONSABILIDADES:                                                          │
│  ──────────────────                                                         │
│  1. Resolver identidad desde triggers externos                               │
│     - telegram.*.received → user + client + project                         │
│     - ui.*.request → user + client + project                                │
│                                                                              │
│  2. Crear usuarios/clientes automáticamente (onboarding)                     │
│     - Primer mensaje de Telegram → crear usuario + proyecto default         │
│                                                                              │
│  3. Mantener contextos activos                                               │
│     - Cada chat de Telegram puede tener un proyecto activo diferente        │
│     - Cada sesión UI puede tener un proyecto activo diferente               │
│                                                                              │
│  4. Enriquecer eventos con contexto                                          │
│     - Interceptar triggers                                                   │
│     - Añadir execution context                                               │
│     - Re-emitir evento enriquecido                                          │
│                                                                              │
│  EVENTOS QUE ESCUCHA:                                                        │
│  ─────────────────────                                                      │
│  - telegram.text.received                                                    │
│  - telegram.photo.received                                                   │
│  - telegram.command.received                                                 │
│  - ui.chat.send.request                                                      │
│  - api.request.received                                                      │
│                                                                              │
│  EVENTOS QUE EMITE:                                                          │
│  ──────────────────                                                         │
│  - context.resolved (para debugging/logging)                                 │
│  - {original_event}.contextualized                                          │
│    Ej: telegram.photo.received.contextualized                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Interfaz del Módulo

```javascript
// context-resolver/index.js

class ContextResolverModule {
  constructor() {
    this.name = 'context-resolver';
    this.version = '1.0.0';
  }

  /**
   * Resolver contexto desde un trigger de Telegram
   */
  async resolveFromTelegram(chatId, fromUser) {
    // 1. Buscar identidad existente
    let identity = await this.findIdentity('telegram', fromUser.id);

    // 2. Si no existe, crear nuevo usuario (onboarding automático)
    if (!identity) {
      identity = await this.onboardTelegramUser(chatId, fromUser);
    }

    // 3. Obtener contexto activo para este chat
    const telegramContext = await this.getTelegramContext(chatId);

    // 4. Construir execution context
    return {
      source: {
        type: 'telegram',
        id: chatId,
        user: {
          id: identity.user_id,
          external_id: fromUser.id,
          name: fromUser.first_name
        }
      },
      client: await this.getClient(identity.user.client_id),
      project: await this.getProject(telegramContext?.active_project_id || identity.user.active_project_id)
    };
  }

  /**
   * Onboarding automático de usuario de Telegram
   */
  async onboardTelegramUser(chatId, fromUser) {
    // 1. Crear cliente (o usar default)
    const clientId = await this.getOrCreateDefaultClient(fromUser);

    // 2. Crear usuario
    const userId = `user-tg-${fromUser.id}`;
    await this.createUser({
      id: userId,
      client_id: clientId,
      name: `${fromUser.first_name} ${fromUser.last_name || ''}`.trim()
    });

    // 3. Crear proyecto default
    const projectId = `proj-${fromUser.id}-default`;
    await this.createProject({
      id: projectId,
      client_id: clientId,
      name: `Proyecto de ${fromUser.first_name}`,
      base_path: `/data/projects/${projectId}`
    });

    // 4. Crear identidad
    await this.createIdentity({
      user_id: userId,
      provider: 'telegram',
      external_id: fromUser.id,
      external_username: fromUser.username
    });

    // 5. Establecer proyecto activo
    await this.setActiveProject(userId, projectId);
    await this.setTelegramContext(chatId, userId, projectId);

    return this.findIdentity('telegram', fromUser.id);
  }

  /**
   * Cambiar proyecto activo en un chat de Telegram
   * (Podría ser un comando: /proyecto mi-startup)
   */
  async switchProject(chatId, userId, projectId) {
    // Verificar que el usuario tiene acceso al proyecto
    const hasAccess = await this.checkProjectAccess(userId, projectId);
    if (!hasAccess) {
      throw new Error('No tienes acceso a este proyecto');
    }

    // Actualizar contexto del chat
    await this.setTelegramContext(chatId, userId, projectId);

    return this.getProject(projectId);
  }
}
```

---

## Flujo Completo con Context Resolver

### Ejemplo: Usuario de Telegram envía imagen

```
┌─────────────────────────────────────────────────────────────────────────────┐
│            FLUJO COMPLETO CON CONTEXTO (Telegram → Agente)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  t=0ms   TELEGRAM API                                                        │
│          │                                                                   │
│          │ Usuario Juan (@juanperez, id: 987654321)                          │
│          │ envía imagen al bot                                               │
│          │                                                                   │
│          ▼                                                                   │
│  t=50ms  TELEGRAM-SERVICE                                                    │
│          │                                                                   │
│          │ Recibe update, emite evento:                                      │
│          │ telegram.photo.received {                                         │
│          │   chat_id: 123456789,                                             │
│          │   from: { id: 987654321, first_name: "Juan" },                   │
│          │   photo: { file_id: "..." }                                       │
│          │ }                                                                 │
│          │                                                                   │
│          ▼                                                                   │
│  t=60ms  CONTEXT-RESOLVER (intercepta)                                       │
│          │                                                                   │
│          │ 1. Buscar: telegram user 987654321                                │
│          │    → Encontrado: user-juan (ACME Corp)                            │
│          │                                                                   │
│          │ 2. Obtener contexto del chat 123456789                            │
│          │    → Proyecto activo: proj-startup                                │
│          │                                                                   │
│          │ 3. Enriquecer evento:                                             │
│          │    telegram.photo.received.contextualized {                       │
│          │      ...original_data,                                            │
│          │      context: {                                                   │
│          │        source: { type: "telegram", user: "user-juan" },          │
│          │        client: { id: "acme-corp", name: "ACME" },                │
│          │        project: { id: "proj-startup", name: "Mi Startup" }       │
│          │      }                                                            │
│          │    }                                                              │
│          │                                                                   │
│          ▼                                                                   │
│  t=70ms  AI-AGENT-FRAMEWORK                                                  │
│          │                                                                   │
│          │ Trigger match: telegram.photo.received.contextualized             │
│          │ Agente: motivational-image-processor                              │
│          │                                                                   │
│          │ El agente AHORA SABE:                                             │
│          │ - Usuario: Juan de ACME Corp                                      │
│          │ - Proyecto: Mi Startup                                            │
│          │ - Puede personalizar: "Juan, he creado la frase para Mi Startup" │
│          │                                                                   │
│          ▼                                                                   │
│  t=80ms  AI-GATEWAY                                                          │
│          │                                                                   │
│          │ Resolver credenciales con contexto:                               │
│          │ - Buscar: ANTHROPIC_API_KEY_PROJECT_proj-startup                  │
│          │ - Si no: ANTHROPIC_API_KEY_CLIENT_acme-corp                       │
│          │ - Si no: ANTHROPIC_API_KEY_GLOBAL                                 │
│          │                                                                   │
│          ▼                                                                   │
│  t=1500ms FILESYSTEM                                                         │
│          │                                                                   │
│          │ fs_write({ path: "frase_motivadora.txt" })                        │
│          │ Contexto del proyecto: proj-startup                               │
│          │ → /data/projects/mi-startup/storage/frase_motivadora.txt         │
│          │                                                                   │
│          ▼                                                                   │
│  t=2000ms RESPUESTA A TELEGRAM                                               │
│          │                                                                   │
│          │ "¡Hola Juan! He creado una frase motivadora                       │
│          │  para tu proyecto 'Mi Startup'.                                   │
│          │  📁 Archivo: frase_motivadora.txt"                                │
│          │                                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Escenarios Multi-Tenant

### Escenario 1: Múltiples usuarios, mismo bot

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                MÚLTIPLES USUARIOS, MISMO BOT DE TELEGRAM                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  BOT: @MiAsistenteBot                                                        │
│                                                                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │ Juan            │  │ María           │  │ Pedro           │              │
│  │ @juanperez      │  │ @mariag         │  │ @pedrol         │              │
│  │ tg_id: 111      │  │ tg_id: 222      │  │ tg_id: 333      │              │
│  │                 │  │                 │  │                 │              │
│  │ Cliente: ACME   │  │ Cliente: ACME   │  │ Cliente: Beta   │              │
│  │ Proyecto:       │  │ Proyecto:       │  │ Proyecto:       │              │
│  │  startup-2024   │  │  marketing      │  │  beta-app       │              │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘              │
│           │                    │                    │                        │
│           ▼                    ▼                    ▼                        │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                     CONTEXT-RESOLVER                             │        │
│  │                                                                  │        │
│  │  tg:111 → user-juan → acme-corp → proj-startup-2024             │        │
│  │  tg:222 → user-maria → acme-corp → proj-marketing               │        │
│  │  tg:333 → user-pedro → beta-inc → proj-beta-app                 │        │
│  │                                                                  │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│           │                    │                    │                        │
│           ▼                    ▼                    ▼                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │ /data/projects/ │  │ /data/projects/ │  │ /data/projects/ │              │
│  │ startup-2024/   │  │ marketing/      │  │ beta-app/       │              │
│  │ storage/        │  │ storage/        │  │ storage/        │              │
│  │  frase.txt      │  │  frase.txt      │  │  frase.txt      │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
│                                                                              │
│  ✅ Cada usuario tiene su archivo en su proyecto                            │
│  ✅ Credenciales correctas por cliente                                       │
│  ✅ Aislamiento completo                                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Escenario 2: Usuario con múltiples proyectos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              USUARIO CON MÚLTIPLES PROYECTOS                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Juan (@juanperez) tiene 3 proyectos:                                        │
│  - startup-2024 (activo)                                                     │
│  - blog-personal                                                             │
│  - experimentos                                                              │
│                                                                              │
│  INTERACCIÓN EN TELEGRAM:                                                    │
│  ─────────────────────────                                                  │
│                                                                              │
│  Juan: /proyecto                                                             │
│  Bot:  📂 Tus proyectos:                                                     │
│        • startup-2024 ✓ (activo)                                             │
│        • blog-personal                                                       │
│        • experimentos                                                        │
│        Usa /proyecto <nombre> para cambiar                                   │
│                                                                              │
│  Juan: /proyecto blog-personal                                               │
│  Bot:  ✅ Proyecto cambiado a "blog-personal"                                │
│                                                                              │
│  Juan: [envía imagen]                                                        │
│  Bot:  (agente procesa con contexto de blog-personal)                        │
│        📁 Archivo creado en: blog-personal/frase_motivadora.txt              │
│                                                                              │
│  Juan: /proyecto startup-2024                                                │
│  Bot:  ✅ Proyecto cambiado a "startup-2024"                                 │
│                                                                              │
│  Juan: [envía imagen]                                                        │
│  Bot:  (agente procesa con contexto de startup-2024)                         │
│        📁 Archivo creado en: startup-2024/frase_motivadora.txt               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Escenario 3: Múltiples bots para diferentes clientes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              MÚLTIPLES BOTS PARA DIFERENTES CLIENTES                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  El sistema puede tener bots dedicados por cliente:                          │
│                                                                              │
│  ┌─────────────────────┐                                                     │
│  │ @AcmeAsistenteBot   │ → Solo usuarios de ACME Corp                        │
│  │ API Key: ACME       │   Credencial: TELEGRAM_API_KEY_CLIENT_acme          │
│  └─────────────────────┘                                                     │
│                                                                              │
│  ┌─────────────────────┐                                                     │
│  │ @BetaAsistenteBot   │ → Solo usuarios de Beta Inc                         │
│  │ API Key: BETA       │   Credencial: TELEGRAM_API_KEY_CLIENT_beta          │
│  └─────────────────────┘                                                     │
│                                                                              │
│  ┌─────────────────────┐                                                     │
│  │ @MiAsistenteBot     │ → Bot público/compartido                            │
│  │ API Key: GLOBAL     │   Credencial: TELEGRAM_API_KEY_GLOBAL               │
│  └─────────────────────┘                                                     │
│                                                                              │
│  RESOLUCIÓN DE CONTEXTO POR BOT:                                             │
│  ────────────────────────────────                                           │
│                                                                              │
│  @AcmeAsistenteBot recibe mensaje:                                           │
│    → El bot ya está asociado a client_id: "acme-corp"                        │
│    → Solo necesita resolver usuario y proyecto                               │
│                                                                              │
│  @MiAsistenteBot recibe mensaje:                                             │
│    → Debe resolver cliente desde el usuario                                  │
│    → O crear nuevo cliente si es usuario nuevo                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Resumen de Componentes Necesarios

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPONENTES PARA MULTI-TENANCY                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  NUEVOS MÓDULOS:                                                             │
│  ───────────────                                                            │
│  1. context-resolver     - Resolver identidad y contexto                     │
│  2. user-manager         - CRUD de usuarios e identidades                    │
│  3. client-manager       - CRUD de clientes/tenants                          │
│                                                                              │
│  MODIFICACIONES:                                                             │
│  ──────────────                                                             │
│  1. project-manager      - Añadir client_id a proyectos                      │
│  2. ai-agent-framework   - Usar contexto en ejecución                        │
│  3. filesystem           - Aceptar project_id explícito (no solo global)    │
│  4. credential-manager   - Ya soporta niveles, verificar integración        │
│  5. telegram-service     - Comandos /proyecto, /cliente                      │
│                                                                              │
│  NUEVAS TABLAS:                                                              │
│  ─────────────                                                              │
│  1. clients              - Tenants del sistema                               │
│  2. users                - Usuarios del sistema                              │
│  3. user_identities      - Mapeo a providers externos                        │
│  4. project_members      - Acceso a proyectos                                │
│  5. telegram_contexts    - Proyecto activo por chat                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Conclusión

El sistema está preparado para escalar a multi-tenancy real:

1. **Credential-manager** ya tiene la cascada GLOBAL → PROJECT → CLIENT → CUSTOM
2. **Project-manager** solo necesita añadir `client_id`
3. **El eslabón que falta** es el **Context Resolver** que mapea:
   - telegram_user → user → client → project
   - ui_session → user → client → project

Con este componente, el agente siempre sabrá:
- **QUIÉN** lo invocó
- **PARA QUIÉN** trabaja (cliente)
- **EN QUÉ PROYECTO** está
- **CON QUÉ CREDENCIALES** operar

Esto permite un sistema verdaderamente escalable donde:
- Múltiples clientes usan el mismo sistema
- Cada usuario tiene sus proyectos
- Los agentes son "conscientes" de su contexto
- Los archivos van al lugar correcto
- Las credenciales se resuelven por nivel
