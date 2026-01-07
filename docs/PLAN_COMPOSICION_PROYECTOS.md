# Plan de Implementación: Composición Progresiva de Proyectos

> **Objetivo**: Implementar el modelo de composición progresiva sin romper lo que funciona.
>
> **Fecha**: 2026-01-07
> **Versión**: 2.0.0 (COMPLETADO)
> **Estado**: ✅ TODAS LAS FASES IMPLEMENTADAS

## Commits de Implementación

| Fase | Commit | Descripción |
|------|--------|-------------|
| 1 | `5b5070d` | feat(project-manager): implement Phase 1 - project links |
| 2 | `94e486f` | feat(project-manager): implement Phase 2 - project dependencies |
| 3 | `f0ac6b7` | feat(project-manager): implement Phase 3 - systems as containers |
| 4 | `e271189` | feat(project-manager): implement Phase 4 - shared context between projects |
| 5 | `00e06b3` | feat: implement Phase 5 - automatic inherited context for prompts |

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

### FASE 0: Preparación (No rompe nada) ✅ COMPLETADA

**Objetivo**: Preparar el terreno sin cambiar comportamiento.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 0: PREPARACIÓN                                                         │
│  Estado: ✅ COMPLETADA (incluida en Fase 1)                                  │
│  Riesgo: NINGUNO                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TAREAS:                                                                     │
│                                                                              │
│  ✅ 0.1 Añadir columnas a tabla projects (con defaults null)                │
│        ALTER TABLE projects ADD COLUMN system_id TEXT;                       │
│        ALTER TABLE projects ADD COLUMN system_role TEXT;                     │
│        (parent_project_id no fue necesario - usamos project_links)          │
│                                                                              │
│  ✅ 0.2 Crear tablas nuevas (vacías, no usadas aún)                         │
│        CREATE TABLE systems (...)                                            │
│        CREATE TABLE project_links (...)                                      │
│        CREATE TABLE project_dependencies (...)                               │
│        CREATE TABLE shared_context (...)                                     │
│                                                                              │
│  ✅ 0.3 Actualizar schema de project-manager para leer nuevos campos        │
│        - Implementado con migraciones automáticas en onLoad()               │
│        - Mapeo de campos en loadExistingProjects()                          │
│                                                                              │
│  RESULTADO:                                                                  │
│  ──────────                                                                 │
│  • Sistema funciona EXACTAMENTE igual que antes                              │
│  • Proyectos existentes tienen campos nuevos = null                          │
│  • Tablas nuevas creadas automáticamente al iniciar                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### FASE 1: Relaciones entre Proyectos ✅ COMPLETADA

**Objetivo**: Poder decir "estos dos proyectos están relacionados".
**Commit**: `5b5070d`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 1: RELACIONES ENTRE PROYECTOS                                          │
│  Estado: ✅ COMPLETADA                                                       │
│  Riesgo: BAJO (añade funcionalidad, no cambia existente)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TAREAS:                                                                     │
│                                                                              │
│  ✅ 1.1 Implementar API de links en project-manager                         │
│        - linkProjects(sourceId, targetId, linkType, reason)                 │
│        - unlinkProjects(sourceId, targetId)                                 │
│        - getProjectLinks(projectId)                                         │
│        - getRelatedProjects(projectId)                                      │
│                                                                              │
│  ✅ 1.2 Añadir UI handlers                                                  │
│        this.uiHandler.register('project', 'link', ...)                      │
│        this.uiHandler.register('project', 'unlink', ...)                    │
│        this.uiHandler.register('project', 'getLinks', ...)                  │
│                                                                              │
│  ✅ 1.3 Evento nuevo: project.linked, project.unlinked                      │
│        - Publicado cuando se crea/elimina link                               │
│        - Otros módulos pueden escuchar para actualizar vistas               │
│                                                                              │
│  ✅ 1.4 Actualizar handleUIList para incluir relaciones                     │
│        - Campo 'links' incluido en respuesta de getLinks                     │
│        - Frontend puede mostrar conexiones                                   │
│                                                                              │
│  RESULTADO:                                                                  │
│  ──────────                                                                 │
│  • Puedo crear: "Compras está relacionado con Facturación"                  │
│  • Al listar proyectos, veo sus relaciones                                   │
│  • Sistema sigue funcionando igual para proyectos sin relaciones            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### FASE 2: Dependencias Explícitas ✅ COMPLETADA

**Objetivo**: Poder decir "Comandero NECESITA datos de Facturación".
**Commit**: `94e486f`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 2: DEPENDENCIAS                                                        │
│  Estado: ✅ COMPLETADA                                                       │
│  Riesgo: BAJO                                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TAREAS:                                                                     │
│                                                                              │
│  ✅ 2.1 Implementar API de dependencias                                      │
│        - addDependency(projectId, dependsOnId, type, description)           │
│        - removeDependency(projectId, dependsOnId)                           │
│        - getDependencies(projectId) - proyectos de los que depende          │
│        - getDependents(projectId) - proyectos que dependen de este          │
│        - hasDependents(projectId) - verificación rápida                     │
│                                                                              │
│  ✅ 2.2 UI handlers                                                          │
│        'project', 'addDependency'                                            │
│        'project', 'removeDependency'                                         │
│        'project', 'getDependencies'                                          │
│        'project', 'getDependents'                                            │
│                                                                              │
│  ✅ 2.3 Validación en delete                                                 │
│        - handleUIDelete verifica hasDependents() antes de borrar            │
│        - Bloquea borrado si otros proyectos dependen                         │
│        - Mensaje: "Cannot delete: X projects depend on this"                │
│                                                                              │
│  ✅ 2.4 Eventos                                                              │
│        - project.dependency.added                                            │
│        - project.dependency.removed                                          │
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

### FASE 3: Sistemas (Contenedores) ✅ COMPLETADA

**Objetivo**: Agrupar proyectos relacionados en un "sistema".
**Commit**: `f0ac6b7`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 3: SISTEMAS                                                            │
│  Estado: ✅ COMPLETADA                                                       │
│  Riesgo: BAJO-MEDIO                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TAREAS:                                                                     │
│                                                                              │
│  ✅ 3.1 CRUD de sistemas                                                     │
│        - createSystem(name, description)                                     │
│        - getSystem(systemId) - incluye proyectos asociados                  │
│        - listSystems() - todos los sistemas con sus proyectos               │
│        - updateSystem(systemId, updates)                                     │
│        - deleteSystem(systemId) - solo si no tiene proyectos                │
│                                                                              │
│  ✅ 3.2 Asociar/desasociar proyectos                                        │
│        - addProjectToSystem(systemId, projectId, role)                      │
│        - removeProjectFromSystem(projectId)                                  │
│        - getUnassignedProjects() - proyectos sin sistema                    │
│                                                                              │
│  ✅ 3.3 Vista de sistema                                                     │
│        - getSystem incluye array de proyectos con nombre y rol              │
│        - listSystems incluye conteo de proyectos por sistema                │
│                                                                              │
│  ✅ 3.4 UI handlers                                                          │
│        'system', 'create'                                                    │
│        'system', 'list'                                                      │
│        'system', 'get'                                                       │
│        'system', 'update'                                                    │
│        'system', 'delete'                                                    │
│        'system', 'addProject'                                                │
│        'system', 'removeProject'                                             │
│        'system', 'getUnassigned'                                             │
│                                                                              │
│  ✅ 3.5 Eventos                                                              │
│        - system.created, system.updated, system.deleted                      │
│        - project.joined_system, project.left_system                          │
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

### FASE 4: Contexto Compartido ✅ COMPLETADA

**Objetivo**: Acceder a conversaciones de proyectos relacionados.
**Commit**: `e271189`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 4: CONTEXTO COMPARTIDO                                                 │
│  Estado: ✅ COMPLETADA                                                       │
│  Riesgo: MEDIO (toca el stack de conversaciones)                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  TAREAS:                                                                     │
│                                                                              │
│  ✅ 4.1 Importar conversaciones entre proyectos                              │
│        - importContext(toProjectId, fromProjectId, conversationId, reason)  │
│        - Almacena referencia en tabla shared_context                         │
│        - Evento: context.imported                                            │
│                                                                              │
│  ✅ 4.2 Gestión de contexto compartido                                       │
│        - removeSharedContext(sharedContextId)                                │
│        - getSharedContext(toProjectId) - contexto importado a un proyecto   │
│        - getExportedContext(fromProjectId) - contexto exportado desde uno   │
│                                                                              │
│  ✅ 4.3 Fuentes de contexto disponibles                                      │
│        - getAvailableContextSources(projectId)                               │
│          Retorna conversaciones de proyectos relacionados/dependencias       │
│          que pueden ser importadas                                           │
│                                                                              │
│  ✅ 4.4 Contexto completo del proyecto                                       │
│        - getFullProjectContext(projectId, correlationId)                    │
│          Retorna: sistema, dependencias, proyectos relacionados,             │
│          contexto heredado (summaries de conversaciones importadas)          │
│                                                                              │
│  ✅ 4.5 UI handlers                                                          │
│        'context', 'import'                                                   │
│        'context', 'remove'                                                   │
│        'context', 'getShared'                                                │
│        'context', 'getExported'                                              │
│        'context', 'getAvailableSources'                                      │
│        'context', 'getFullProjectContext'                                    │
│                                                                              │
│  RESULTADO:                                                                  │
│  ──────────                                                                 │
│  • Al trabajar en Comandero, puedo importar conversaciones de Facturación   │
│  • El AI "sabe" cómo funcionan las facturas aunque estoy en otro proyecto   │
│  • getFullProjectContext prepara todo para Fase 5                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### FASE 5: Contexto Automático para Agentes ✅ COMPLETADA

**Objetivo**: Agentes reciben contexto de proyectos relacionados automáticamente.
**Commit**: `00e06b3`

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FASE 5: CONTEXTO AUTOMÁTICO                                                 │
│  Estado: ✅ COMPLETADA (Opción A - Integración en prompt-composer)          │
│  Riesgo: MEDIO-ALTO (toca flujo de agentes)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  IMPLEMENTACIÓN: Se eligió Opción A (modificar prompt-composer)              │
│  en lugar de crear módulo context-resolver separado.                         │
│                                                                              │
│  TAREAS:                                                                     │
│                                                                              │
│  ✅ 5.1 project-manager: Evento context.full.request/response               │
│        - onContextFullRequest() escucha peticiones de contexto               │
│        - Responde con getFullProjectContext() via context.full.response     │
│        - Patrón request/response asíncrono                                   │
│                                                                              │
│  ✅ 5.2 prompt-composer: Carga de contexto heredado                          │
│        - loadInheritedContext(projectId, timeout) - petición async          │
│        - pendingInheritedContextRequests Map para correlación                │
│        - onInheritedContextResponse() maneja respuestas                      │
│                                                                              │
│  ✅ 5.3 prompt-composer: Composición del prompt                              │
│        - composeSystemPrompt() acepta 4to parámetro: inheritedContext       │
│        - buildInheritedContextSection() formatea el contexto:                │
│          • ## System Context (sistema al que pertenece)                      │
│          • ## Dependencies (proyectos de los que depende)                    │
│          • ## Related Projects (proyectos relacionados)                      │
│          • ## Inherited Knowledge (summaries de conversaciones)              │
│                                                                              │
│  ✅ 5.4 prompt-composer: Integración en flujo                                │
│        - onComposeRequest soporta flag include_inherited_context            │
│        - Si true, carga contexto antes de componer                           │
│        - Configurable via this.config.includeInheritedContext               │
│                                                                              │
│  RESULTADO:                                                                  │
│  ──────────                                                                 │
│  • Agente de Telegram en proyecto Comandero                                  │
│  • Automáticamente "sabe" de Facturación y Compras                          │
│  • Puede responder: "Para generar factura, usa evento invoice.create"       │
│    aunque eso se aprendió en otro proyecto                                   │
│                                                                              │
│  USO:                                                                        │
│  ─────                                                                      │
│  // Petición con contexto heredado                                           │
│  await eventBus.publish('prompt.compose.request', {                         │
│    request_id: uuid,                                                         │
│    project_id: 'proj-comandero',                                             │
│    include_inherited_context: true,  // ← Activar contexto heredado         │
│    ...                                                                       │
│  });                                                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Matriz de Impacto por Módulo (Resultado Real)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    IMPACTO POR MÓDULO (IMPLEMENTADO)                         │
├───────────────────────┬────────┬────────┬────────┬────────┬────────────────┤
│ Módulo                │ Fase 0 │ Fase 1 │ Fase 2 │ Fase 3 │ Fase 4-5       │
├───────────────────────┼────────┼────────┼────────┼────────┼────────────────┤
│ project-manager       │ ✅ EXT │ ✅ EXT │ ✅ EXT │ ✅ EXT │ ✅ EXTEND      │
│ database-manager      │ -      │ -      │ -      │ -      │ -              │
│ filesystem            │ -      │ -      │ -      │ -      │ -              │
│ credential-manager    │ -      │ -      │ -      │ -      │ -              │
│ chat-session          │ -      │ -      │ -      │ -      │ -              │
│ prompt-composer       │ -      │ -      │ -      │ -      │ ✅ EXTEND      │
│ ai-agent-framework    │ -      │ -      │ -      │ -      │ -              │
│ conversation-manager  │ -      │ -      │ -      │ -      │ -              │
│ (nuevo) system-mgr    │ -      │ -      │ -      │ N/A    │ -              │
│ (nuevo) ctx-resolver  │ -      │ -      │ -      │ -      │ N/A            │
├───────────────────────┼────────┼────────┼────────┼────────┼────────────────┤
│ LEYENDA:              │        │        │        │        │                │
│ ✅ = implementado     │        │        │        │        │                │
│ EXT = extendido       │        │        │        │        │                │
│ N/A = no necesario    │        │        │        │        │                │
│ - = sin cambios       │        │        │        │        │                │
└───────────────────────┴────────┴────────┴────────┴────────┴────────────────┘

NOTAS:
- system-manager: Integrado dentro de project-manager (no módulo separado)
- context-resolver: Integrado en prompt-composer (Opción A)
- database-manager: Las migraciones se manejan dentro de project-manager
- ai-agent-framework: Puede usar contexto heredado sin modificaciones
  (el prompt ya incluye el contexto cuando se solicita)
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

## Orden de Implementación (Completado)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ROADMAP COMPLETADO                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ✅ FASE 0: Preparación                                                      │
│     - Schema de BD con migraciones automáticas                               │
│     - Tablas: systems, project_links, project_dependencies, shared_context  │
│                                                                              │
│  ✅ FASE 1: Links entre proyectos (5b5070d)                                  │
│     - linkProjects, unlinkProjects, getProjectLinks, getRelatedProjects     │
│     - Eventos: project.linked, project.unlinked                              │
│                                                                              │
│  ✅ FASE 2: Dependencias (94e486f)                                           │
│     - addDependency, removeDependency, getDependencies, getDependents       │
│     - Validación en delete: no borrar proyectos con dependientes            │
│                                                                              │
│  ✅ FASE 3: Sistemas (f0ac6b7)                                               │
│     - CRUD completo de sistemas                                              │
│     - addProjectToSystem, removeProjectFromSystem, getUnassignedProjects    │
│                                                                              │
│  ✅ FASE 4: Contexto Compartido (e271189)                                    │
│     - importContext, removeSharedContext, getSharedContext                   │
│     - getFullProjectContext para agregación de contexto                      │
│                                                                              │
│  ✅ FASE 5: Contexto Automático (00e06b3)                                    │
│     - Integración en prompt-composer                                         │
│     - buildInheritedContextSection para formatear contexto                   │
│     - Flag include_inherited_context en compose requests                     │
│                                                                              │
│  TIMELINE REAL:                                                              │
│  ──────────────                                                             │
│  Fase 0 ──→ Fase 1 ──→ Fase 2 ──→ Fase 3 ──→ Fase 4 ──→ Fase 5             │
│    ✅         ✅         ✅         ✅         ✅         ✅                 │
│                                                                              │
│  TODO COMPLETADO EN UNA SESIÓN (2026-01-07)                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementación Técnica

### Migraciones Automáticas (en project-manager onLoad)

Las migraciones se ejecutan automáticamente al cargar el módulo:

```javascript
// Implementado en project-manager/index.js onLoad()
// Las tablas se crean automáticamente si no existen

// Columnas añadidas a projects:
// - system_id TEXT
// - system_role TEXT

// Tablas creadas:
// - systems (id, name, description, created_at, updated_at)
// - project_links (id, source_project_id, target_project_id, link_type, reason, created_at)
// - project_dependencies (id, project_id, depends_on_project_id, dependency_type, description, created_at)
// - shared_context (id, from_project_id, to_project_id, conversation_id, reason, imported_at)

// Índices creados:
// - idx_projects_system, idx_links_source, idx_links_target
// - idx_deps_project, idx_deps_depends_on, idx_shared_to
```

---

## Resumen Final

| Pregunta | Respuesta |
|----------|-----------|
| ¿Lo que funciona sigue funcionando? | ✅ SÍ, 100% compatible |
| ¿Hay que refactorizar algo? | ✅ COMPLETADO - solo extensiones |
| ¿Es incremental? | ✅ SÍ, 6 fases implementadas |
| ¿Estado actual? | ✅ TODAS LAS FASES COMPLETADAS |
| ¿Qué módulos cambiaron? | project-manager, prompt-composer |
| ¿Qué módulos NO cambiaron? | filesystem, credential-manager, database-manager, ai-agent-framework |

### UI Handlers Añadidos

**project-manager:**
- `project.link`, `project.unlink`, `project.getLinks` (Fase 1)
- `project.addDependency`, `project.removeDependency`, `project.getDependencies`, `project.getDependents` (Fase 2)
- `system.create`, `system.list`, `system.get`, `system.update`, `system.delete` (Fase 3)
- `system.addProject`, `system.removeProject`, `system.getUnassigned` (Fase 3)
- `context.import`, `context.remove`, `context.getShared`, `context.getExported` (Fase 4)
- `context.getAvailableSources`, `context.getFullProjectContext` (Fase 4)

**prompt-composer:**
- `include_inherited_context` flag en compose request (Fase 5)

### Eventos Añadidos

- `project.linked`, `project.unlinked` (Fase 1)
- `project.dependency.added`, `project.dependency.removed` (Fase 2)
- `system.created`, `system.updated`, `system.deleted` (Fase 3)
- `project.joined_system`, `project.left_system` (Fase 3)
- `context.imported`, `context.removed` (Fase 4)
- `context.full.request`, `context.full.response` (Fase 5)
