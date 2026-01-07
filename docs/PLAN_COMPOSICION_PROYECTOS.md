# Plan de Implementación: Composición Progresiva de Proyectos

> **Objetivo**: Implementar el modelo de composición progresiva sin romper lo que funciona.
>
> **Fecha**: 2026-01-07
> **Versión**: 1.0.0

---

## Análisis del Estado Actual

### Lo que Funciona (NO TOCAR)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FUNCIONA - MANTENER                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PROJECT-MANAGER                                                             │
│  ────────────────                                                           │
│  ✅ CRUD de proyectos (crear, listar, actualizar, eliminar)                 │
│  ✅ Activación de proyecto único (activeProjectId)                          │
│  ✅ Estructura: /data/projects/{slug}/db/ y /storage/                       │
│  ✅ Eventos: project.created, project.activated, project.updated            │
│  ✅ UI handlers para frontend                                                │
│                                                                              │
│  FILESYSTEM                                                                  │
│  ──────────                                                                 │
│  ✅ Escucha project.activated → actualiza activeProjectPath                 │
│  ✅ Resolución de rutas relativas al proyecto activo                        │
│  ✅ Prefijo @/ para rutas globales                                          │
│                                                                              │
│  DATABASE-MANAGER                                                            │
│  ────────────────                                                           │
│  ✅ Recibe project_id en cada request (ya multi-tenant)                     │
│  ✅ BD separada por proyecto: /data/projects/{slug}/db/                     │
│  ✅ BD de sistema: project_id = 'system'                                    │
│                                                                              │
│  CREDENTIAL-MANAGER                                                          │
│  ──────────────────                                                         │
│  ✅ Cascada: CUSTOM → CLIENT → PROJECT → GLOBAL                             │
│  ✅ Ya soporta project_id, client_id, custom_id                             │
│                                                                              │
│  CONVERSATION STACK (chat-session, prompt-composer, chat-ai-bridge)         │
│  ─────────────────                                                          │
│  ✅ conversation-manager como facade                                         │
│  ✅ Historial en BD del proyecto                                             │
│  ✅ Contexto FIFO para mensajes                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Lo que Hay que Extender

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXTENDER - Añadir campos                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TABLA projects (añadir columnas)                                           │
│  ─────────────────────────────────                                          │
│  + system_id TEXT         -- Sistema al que pertenece (nullable)            │
│  + system_role TEXT       -- Rol dentro del sistema                         │
│  + parent_project_id TEXT -- Proyecto "padre" o agrupador                   │
│                                                                              │
│  PROJECT-MANAGER (añadir métodos)                                            │
│  ────────────────────────────────                                           │
│  + linkProjects(source, target, type, reason)                               │
│  + getProjectLinks(projectId)                                               │
│  + getRelatedProjects(projectId)                                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Lo que Hay que Crear

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CREAR NUEVO                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TABLAS NUEVAS (en BD sistema)                                               │
│  ─────────────────────────────                                              │
│  • systems              -- Contenedor lógico de proyectos                   │
│  • project_links        -- Relaciones entre proyectos                        │
│  • project_dependencies -- Dependencias explícitas                           │
│  • shared_context       -- Conversaciones compartidas                        │
│                                                                              │
│  MÓDULO NUEVO: system-manager (opcional, puede ir en project-manager)       │
│  ──────────────────────────────────────────────────────────────────         │
│  • Gestión de "sistemas" (contenedores)                                      │
│  • Vista agregada de proyectos por sistema                                   │
│  • Métricas a nivel de sistema                                               │
│                                                                              │
│  EXTENSIÓN: context-resolver (para flujo de agentes)                        │
│  ────────────────────────────────────────────────                           │
│  • Resolver contexto de proyectos relacionados                               │
│  • Inyectar conversaciones compartidas                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Plan de Implementación por Fases

### FASE 0: Preparación (No rompe nada)

**Objetivo**: Preparar el terreno sin cambiar comportamiento.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 0: PREPARACIÓN                                                         │
│  Duración estimada: 1 sesión                                                 │
│  Riesgo: NINGUNO                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TAREAS:                                                                     │
│                                                                              │
│  □ 0.1 Añadir columnas a tabla projects (con defaults null)                 │
│        ALTER TABLE projects ADD COLUMN system_id TEXT;                       │
│        ALTER TABLE projects ADD COLUMN system_role TEXT;                     │
│        ALTER TABLE projects ADD COLUMN parent_project_id TEXT;               │
│                                                                              │
│  □ 0.2 Crear tablas nuevas (vacías, no usadas aún)                          │
│        CREATE TABLE systems (...)                                            │
│        CREATE TABLE project_links (...)                                      │
│        CREATE TABLE project_dependencies (...)                               │
│        CREATE TABLE shared_context (...)                                     │
│                                                                              │
│  □ 0.3 Actualizar schema de project-manager para leer nuevos campos         │
│        - Añadir campos al SELECT en loadExistingProjects()                  │
│        - Mapear a objeto project (con valores null por defecto)             │
│                                                                              │
│  RESULTADO:                                                                  │
│  ──────────                                                                 │
│  • Sistema funciona EXACTAMENTE igual que antes                              │
│  • Proyectos existentes tienen campos nuevos = null                          │
│  • Tablas nuevas existen pero están vacías                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### FASE 1: Relaciones entre Proyectos

**Objetivo**: Poder decir "estos dos proyectos están relacionados".

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 1: RELACIONES ENTRE PROYECTOS                                          │
│  Duración estimada: 2-3 sesiones                                             │
│  Riesgo: BAJO (añade funcionalidad, no cambia existente)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TAREAS:                                                                     │
│                                                                              │
│  □ 1.1 Implementar API de links en project-manager                          │
│                                                                              │
│        // Crear link entre proyectos                                         │
│        async linkProjects(sourceId, targetId, linkType, reason) {           │
│          // linkType: 'inspired_by' | 'related_to' | 'evolved_from'         │
│          await this.queryDatabase(`                                          │
│            INSERT INTO project_links (...)                                   │
│          `);                                                                 │
│          await this.eventBus.publish('project.linked', {...});              │
│        }                                                                     │
│                                                                              │
│        // Obtener proyectos relacionados                                     │
│        async getRelatedProjects(projectId) {                                │
│          return await this.queryDatabase(`                                   │
│            SELECT * FROM project_links                                       │
│            WHERE source_project_id = ? OR target_project_id = ?             │
│          `);                                                                 │
│        }                                                                     │
│                                                                              │
│  □ 1.2 Añadir UI handlers                                                   │
│        this.uiHandler.register('project', 'link', ...)                      │
│        this.uiHandler.register('project', 'unlink', ...)                    │
│        this.uiHandler.register('project', 'getLinks', ...)                  │
│                                                                              │
│  □ 1.3 Evento nuevo: project.linked                                         │
│        - Publicar cuando se crea link                                        │
│        - Otros módulos pueden escuchar para actualizar vistas               │
│                                                                              │
│  □ 1.4 Actualizar handleUIList para incluir relaciones                      │
│        - Añadir campo 'related_projects' al listar                           │
│        - Frontend puede mostrar conexiones                                   │
│                                                                              │
│  RESULTADO:                                                                  │
│  ──────────                                                                 │
│  • Puedo crear: "Compras está relacionado con Facturación"                  │
│  • Al listar proyectos, veo sus relaciones                                   │
│  • Sistema sigue funcionando igual para proyectos sin relaciones            │
│                                                                              │
│  EJEMPLO DE USO:                                                             │
│  ────────────────                                                           │
│  await mqttRequest('project', 'link', {                                      │
│    source: 'proj-compras',                                                   │
│    target: 'proj-facturacion',                                               │
│    type: 'inspired_by',                                                      │
│    reason: 'Compras reutiliza el modelo de clientes'                        │
│  });                                                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### FASE 2: Dependencias Explícitas

**Objetivo**: Poder decir "Comandero NECESITA datos de Facturación".

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 2: DEPENDENCIAS                                                        │
│  Duración estimada: 2 sesiones                                               │
│  Riesgo: BAJO                                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TAREAS:                                                                     │
│                                                                              │
│  □ 2.1 Implementar API de dependencias                                       │
│                                                                              │
│        async addDependency(projectId, dependsOnId, type, description) {     │
│          // type: 'data' | 'code' | 'api' | 'context'                       │
│          await this.queryDatabase(`                                          │
│            INSERT INTO project_dependencies (...)                            │
│          `);                                                                 │
│        }                                                                     │
│                                                                              │
│        async getDependencies(projectId) {                                   │
│          // Retorna proyectos de los que depende                             │
│        }                                                                     │
│                                                                              │
│        async getDependents(projectId) {                                     │
│          // Retorna proyectos que dependen de este                           │
│        }                                                                     │
│                                                                              │
│  □ 2.2 UI handlers                                                           │
│        'project', 'addDependency'                                            │
│        'project', 'removeDependency'                                         │
│        'project', 'getDependencies'                                          │
│                                                                              │
│  □ 2.3 Validación en delete                                                  │
│        - Al borrar proyecto, verificar si otros dependen de él              │
│        - Advertir o bloquear según configuración                             │
│                                                                              │
│  RESULTADO:                                                                  │
│  ──────────                                                                 │
│  • Comandero declara: "Dependo de Facturación para datos"                   │
│  • Si intento borrar Facturación: "¡Comandero depende de ti!"               │
│  • Grafo de dependencias visible                                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### FASE 3: Sistemas (Contenedores)

**Objetivo**: Agrupar proyectos relacionados en un "sistema".

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 3: SISTEMAS                                                            │
│  Duración estimada: 2-3 sesiones                                             │
│  Riesgo: BAJO-MEDIO                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TAREAS:                                                                     │
│                                                                              │
│  □ 3.1 CRUD de sistemas                                                      │
│                                                                              │
│        async createSystem(name, description, initialProjects = []) {        │
│          const systemId = crypto.randomUUID();                               │
│          await this.queryDatabase(`                                          │
│            INSERT INTO systems (id, name, description, created_at)           │
│          `);                                                                 │
│                                                                              │
│          // Asociar proyectos iniciales                                      │
│          for (const proj of initialProjects) {                               │
│            await this.addProjectToSystem(systemId, proj.id, proj.role);     │
│          }                                                                   │
│          return systemId;                                                    │
│        }                                                                     │
│                                                                              │
│  □ 3.2 Asociar/desasociar proyectos                                         │
│                                                                              │
│        async addProjectToSystem(systemId, projectId, role) {                │
│          await this.queryDatabase(`                                          │
│            UPDATE projects SET system_id = ?, system_role = ? WHERE id = ?  │
│          `);                                                                 │
│          await this.eventBus.publish('project.joined_system', {...});       │
│        }                                                                     │
│                                                                              │
│  □ 3.3 Vista de sistema                                                      │
│                                                                              │
│        async getSystem(systemId) {                                          │
│          const system = await this.queryDatabase(`SELECT * FROM systems`);  │
│          const projects = await this.queryDatabase(`                         │
│            SELECT * FROM projects WHERE system_id = ?                        │
│          `);                                                                 │
│          return { ...system, projects };                                     │
│        }                                                                     │
│                                                                              │
│  □ 3.4 UI handlers                                                           │
│        'system', 'create'                                                    │
│        'system', 'list'                                                      │
│        'system', 'get'                                                       │
│        'system', 'addProject'                                                │
│        'system', 'removeProject'                                             │
│                                                                              │
│  RESULTADO:                                                                  │
│  ──────────                                                                 │
│  • Creo "Sistema Gestión Hostelería"                                        │
│  • Añado Facturación (role: billing)                                        │
│  • Añado Compras (role: purchasing)                                         │
│  • Añado Comandero (role: order-entry)                                      │
│  • Vista unificada del sistema completo                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### FASE 4: Contexto Compartido

**Objetivo**: Acceder a conversaciones de proyectos relacionados.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 4: CONTEXTO COMPARTIDO                                                 │
│  Duración estimada: 3-4 sesiones                                             │
│  Riesgo: MEDIO (toca el stack de conversaciones)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TAREAS:                                                                     │
│                                                                              │
│  □ 4.1 Importar conversaciones entre proyectos                               │
│                                                                              │
│        async importContext(toProjectId, fromProjectId, conversationIds) {   │
│          for (const convId of conversationIds) {                             │
│            await this.queryDatabase(`                                        │
│              INSERT INTO shared_context (                                    │
│                from_project_id, to_project_id, conversation_id, ...         │
│              )                                                               │
│            `);                                                               │
│          }                                                                   │
│        }                                                                     │
│                                                                              │
│  □ 4.2 Listar contexto disponible                                           │
│                                                                              │
│        async getAvailableContext(projectId) {                               │
│          // Conversaciones propias                                           │
│          const own = await chat-session.list(projectId);                    │
│                                                                              │
│          // Conversaciones importadas de proyectos relacionados              │
│          const imported = await this.queryDatabase(`                         │
│            SELECT sc.*, c.title, c.summary                                   │
│            FROM shared_context sc                                            │
│            JOIN conversations c ON sc.conversation_id = c.id                │
│            WHERE sc.to_project_id = ?                                        │
│          `);                                                                 │
│                                                                              │
│          return { own, imported };                                           │
│        }                                                                     │
│                                                                              │
│  □ 4.3 Modificar prompt-composer para inyectar contexto heredado            │
│                                                                              │
│        // En composeSystemPrompt()                                           │
│        if (projectContext.imported_context?.length > 0) {                   │
│          sections.push('## Inherited Context');                              │
│          sections.push('From related projects:');                            │
│          for (const ctx of projectContext.imported_context) {               │
│            sections.push(`- [${ctx.project_name}]: ${ctx.summary}`);        │
│          }                                                                   │
│        }                                                                     │
│                                                                              │
│  □ 4.4 UI para gestionar contexto compartido                                │
│        'context', 'import'                                                   │
│        'context', 'list'                                                     │
│        'context', 'remove'                                                   │
│                                                                              │
│  RESULTADO:                                                                  │
│  ──────────                                                                 │
│  • Al trabajar en Comandero, puedo importar conversaciones de Facturación   │
│  • El AI "sabe" cómo funcionan las facturas aunque estoy en otro proyecto   │
│  • Contexto heredado aparece en el system prompt                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### FASE 5: Contexto Automático para Agentes

**Objetivo**: Agentes reciben contexto de proyectos relacionados automáticamente.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 5: CONTEXTO AUTOMÁTICO                                                 │
│  Duración estimada: 3-4 sesiones                                             │
│  Riesgo: MEDIO-ALTO (toca flujo de agentes)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TAREAS:                                                                     │
│                                                                              │
│  □ 5.1 Crear módulo context-resolver                                         │
│                                                                              │
│        // Resuelve contexto completo para un proyecto                        │
│        async resolveFullContext(projectId) {                                │
│          const project = await projectManager.get(projectId);               │
│                                                                              │
│          // Obtener dependencias                                             │
│          const dependencies = await projectManager.getDependencies(id);     │
│                                                                              │
│          // Obtener contexto compartido                                      │
│          const sharedContext = await this.getAvailableContext(id);          │
│                                                                              │
│          // Obtener sistema (si pertenece a uno)                             │
│          const system = project.system_id                                    │
│            ? await systemManager.get(project.system_id)                      │
│            : null;                                                           │
│                                                                              │
│          return {                                                            │
│            project,                                                          │
│            dependencies,                                                     │
│            sharedContext,                                                    │
│            system,                                                           │
│            relatedProjects: system?.projects || []                          │
│          };                                                                  │
│        }                                                                     │
│                                                                              │
│  □ 5.2 Integrar con ai-agent-framework                                       │
│                                                                              │
│        // Antes de ejecutar agente, resolver contexto                        │
│        async executeAgent(trigger, agentConfig) {                           │
│          const projectId = this.resolveProjectFromTrigger(trigger);         │
│          const fullContext = await contextResolver.resolve(projectId);      │
│                                                                              │
│          // Inyectar en el agente                                            │
│          agentConfig.context = fullContext;                                  │
│        }                                                                     │
│                                                                              │
│  □ 5.3 Actualizar prompts de agentes para usar contexto                     │
│                                                                              │
│        // El agente ahora "sabe" de proyectos relacionados                   │
│        "You are working on {{project.name}}.                                 │
│         This project is part of '{{system.name}}'.                           │
│         Related projects: {{relatedProjects}}                                │
│         Inherited knowledge: {{sharedContext}}"                              │
│                                                                              │
│  RESULTADO:                                                                  │
│  ──────────                                                                 │
│  • Agente de Telegram en proyecto Comandero                                  │
│  • Automáticamente "sabe" de Facturación y Compras                          │
│  • Puede responder: "Para generar factura, usa evento invoice.create"       │
│    aunque eso se aprendió en otro proyecto                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Matriz de Impacto por Módulo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    IMPACTO POR MÓDULO                                        │
├───────────────────────┬────────┬────────┬────────┬────────┬────────────────┤
│ Módulo                │ Fase 0 │ Fase 1 │ Fase 2 │ Fase 3 │ Fase 4-5       │
├───────────────────────┼────────┼────────┼────────┼────────┼────────────────┤
│ project-manager       │ EXTEND │ EXTEND │ EXTEND │ EXTEND │ -              │
│ database-manager      │ SCHEMA │ -      │ -      │ -      │ -              │
│ filesystem            │ -      │ -      │ -      │ -      │ -              │
│ credential-manager    │ -      │ -      │ -      │ -      │ -              │
│ chat-session          │ -      │ -      │ -      │ -      │ EXTEND (leer)  │
│ prompt-composer       │ -      │ -      │ -      │ -      │ EXTEND         │
│ ai-agent-framework    │ -      │ -      │ -      │ -      │ EXTEND         │
│ conversation-manager  │ -      │ -      │ -      │ -      │ -              │
│ (nuevo) system-mgr    │ -      │ -      │ -      │ CREATE │ -              │
│ (nuevo) ctx-resolver  │ -      │ -      │ -      │ -      │ CREATE         │
├───────────────────────┼────────┼────────┼────────┼────────┼────────────────┤
│ LEYENDA:              │        │        │        │        │                │
│ EXTEND = añadir       │        │        │        │        │                │
│ SCHEMA = solo BD      │        │        │        │        │                │
│ CREATE = módulo nuevo │        │        │        │        │                │
│ - = sin cambios       │        │        │        │        │                │
└───────────────────────┴────────┴────────┴────────┴────────┴────────────────┘
```

---

## Compatibilidad Hacia Atrás

### Garantías

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPATIBILIDAD GARANTIZADA                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. PROYECTOS EXISTENTES                                                     │
│     ─────────────────────                                                   │
│     • Siguen funcionando sin cambios                                         │
│     • Campos nuevos = null (no obligatorios)                                 │
│     • No necesitan migración de datos                                        │
│                                                                              │
│  2. API EXISTENTE                                                            │
│     ────────────                                                            │
│     • Todos los endpoints actuales siguen funcionando                        │
│     • mqttRequest('project', 'list') → mismo formato + campos extra         │
│     • mqttRequest('project', 'create') → igual, relaciones opcionales       │
│                                                                              │
│  3. EVENTOS EXISTENTES                                                       │
│     ─────────────────                                                       │
│     • project.created, project.activated → sin cambios                       │
│     • Eventos nuevos son ADICIONALES, no reemplazan                          │
│                                                                              │
│  4. FLUJO DE CHAT/AGENTES                                                    │
│     ─────────────────────                                                   │
│     • Funciona igual si no hay relaciones configuradas                       │
│     • Contexto extra es ADITIVO, no cambia el comportamiento base           │
│                                                                              │
│  5. FILESYSTEM                                                               │
│     ──────────                                                              │
│     • SIN CAMBIOS en ninguna fase                                            │
│     • activeProjectId sigue siendo la fuente de verdad                       │
│     • Los archivos siguen en /data/projects/{slug}/storage/                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Orden Recomendado de Implementación

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ROADMAP RECOMENDADO                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  INMEDIATO (Fase 0)                                                          │
│  ──────────────────                                                         │
│  → Preparar schema de BD                                                     │
│  → 0 riesgo, prepara el terreno                                              │
│                                                                              │
│  CORTO PLAZO (Fase 1-2)                                                      │
│  ──────────────────────                                                     │
│  → Links y dependencias entre proyectos                                      │
│  → Valor inmediato: ver qué proyectos están relacionados                    │
│  → Protección: no borrar proyectos con dependientes                         │
│                                                                              │
│  MEDIO PLAZO (Fase 3)                                                        │
│  ────────────────────                                                       │
│  → Sistemas como contenedores                                                │
│  → Valor: "Sistema Hostelería" agrupa 4 proyectos                           │
│  → Vista unificada en frontend                                               │
│                                                                              │
│  LARGO PLAZO (Fase 4-5)                                                      │
│  ─────────────────────                                                      │
│  → Contexto compartido y automático                                          │
│  → Valor: AI "hereda" conocimiento de proyectos relacionados                │
│  → Requiere más testing y refinamiento                                       │
│                                                                              │
│  TIMELINE SUGERIDO:                                                          │
│  ──────────────────                                                         │
│  Fase 0 ──→ Fase 1 ──→ Fase 2 ──→ Fase 3 ──→ Fase 4 ──→ Fase 5             │
│    │          │          │          │          │          │                 │
│    ▼          ▼          ▼          ▼          ▼          ▼                 │
│  [HOY]    [+1 sem]   [+2 sem]   [+3 sem]   [+5 sem]   [+7 sem]              │
│                                                                              │
│  Cada fase es DEPLOYABLE independientemente.                                 │
│  Puedes parar en cualquier fase y el sistema funciona.                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Siguiente Paso Concreto

### Fase 0: Script de Migración

```javascript
// scripts/migrate-project-composition.js
// Ejecutar una vez para preparar BD

const migrations = [
  // Añadir columnas a projects
  `ALTER TABLE projects ADD COLUMN system_id TEXT`,
  `ALTER TABLE projects ADD COLUMN system_role TEXT`,
  `ALTER TABLE projects ADD COLUMN parent_project_id TEXT`,

  // Crear tabla systems
  `CREATE TABLE IF NOT EXISTS systems (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  // Crear tabla project_links
  `CREATE TABLE IF NOT EXISTS project_links (
    id TEXT PRIMARY KEY,
    source_project_id TEXT NOT NULL,
    target_project_id TEXT NOT NULL,
    link_type TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (source_project_id) REFERENCES projects(id),
    FOREIGN KEY (target_project_id) REFERENCES projects(id)
  )`,

  // Crear tabla project_dependencies
  `CREATE TABLE IF NOT EXISTS project_dependencies (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    depends_on_project_id TEXT NOT NULL,
    dependency_type TEXT,
    description TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id),
    FOREIGN KEY (depends_on_project_id) REFERENCES projects(id)
  )`,

  // Crear tabla shared_context
  `CREATE TABLE IF NOT EXISTS shared_context (
    id TEXT PRIMARY KEY,
    from_project_id TEXT NOT NULL,
    to_project_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    reason TEXT,
    imported_at TEXT NOT NULL,
    FOREIGN KEY (from_project_id) REFERENCES projects(id),
    FOREIGN KEY (to_project_id) REFERENCES projects(id)
  )`,

  // Índices para performance
  `CREATE INDEX IF NOT EXISTS idx_projects_system ON projects(system_id)`,
  `CREATE INDEX IF NOT EXISTS idx_links_source ON project_links(source_project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_links_target ON project_links(target_project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deps_project ON project_dependencies(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_shared_to ON shared_context(to_project_id)`
];
```

---

## Resumen

| Pregunta | Respuesta |
|----------|-----------|
| ¿Lo que funciona sigue funcionando? | ✅ SÍ, 100% compatible |
| ¿Hay que refactorizar algo? | ❌ NO, solo EXTENDER |
| ¿Es incremental? | ✅ SÍ, 6 fases independientes |
| ¿Puedo parar en cualquier momento? | ✅ SÍ, cada fase es deployable |
| ¿Qué módulos cambian? | project-manager (extend), prompt-composer (fase 4-5) |
| ¿Qué módulos NO cambian? | filesystem, credential-manager, database-manager |
