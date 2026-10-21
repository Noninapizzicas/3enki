---
name: composition-manager
version: 2.0.0
description: >-
  Servicio genérico de composición de entidades. Trabaja con entity_id abstracto
  sobre tres sub-áreas del mismo dominio: systems (contenedores lógicos con
  miembros y rol), links (relaciones direccionales tipadas) y dependencies
  (dependencias funcionales). Reusable por cualquier módulo vía
  composition.request/response o via UI handlers directos.
tags:
  - enki
  - composition
  - systems
  - links
  - dependencies
  - entity-management
  - generic-service
author: Event Core Team
language: en
main: index.js
events:
  publishes:
    - composition.response
    - system.created
    - system.updated
    - system.deleted
    - entity.joined_system
    - entity.left_system
    - entity.linked
    - entity.unlinked
    - entity.dependency.added
    - entity.dependency.removed
  subscribes:
    - composition.request
    - db.query.response
dependencies:
  - database-manager
config:
  dbTimeout: 10000
  persistence:
    pattern: owned-tables-via-database-manager
    restart_resilient: true
    concurrency: single-writer
    lost_on_restart:
      - pendingDbRequests
---

# composition-manager v2.0.0

Servicio genérico de composición de entidades para el ecosistema Enki. Trabaja con `entity_id` abstracto — NO conoce de proyectos, prompts ni dominios específicos. Cualquier módulo puede usarlo vía `composition.request`/`composition.response` o via UI handlers directos.

## Áreas de dominio

El módulo gestiona tres sub-áreas dentro del mismo dominio:

### 1. Systems
Contenedores lógicos que agrupan entidades (proyectos, agentes, etc.). Cada system tiene nombre, descripción, metadatos y un conjunto de miembros con rol opcional.

| Acción | Descripción |
|--------|-------------|
| `system.create` | Crea un nuevo sistema |
| `system.get` | Obtiene un sistema por ID |
| `system.list` | Lista todos los sistemas con conteo de miembros |
| `system.update` | Actualiza campos de un sistema |
| `system.delete` | Elimina un sistema (borrado en cascada de miembros) |
| `entity.join` | Asigna una entidad a un sistema con rol |
| `entity.leave` | Remueve una entidad de su sistema |
| `entity.system` | Obtiene el sistema al que pertenece una entidad |
| `entity.unassigned` | Filtra entidades no asignadas a ningún sistema |

**Tablas:** `systems`, `system_members`

### 2. Links
Relaciones direccionales tipadas entre dos entidades. Tipos válidos: `inspired_by`, `related_to`, `evolved_from`.

| Acción | Descripción |
|--------|-------------|
| `link` | Crea un enlace entre dos entidades |
| `unlink` | Elimina un enlace por ID |
| `links.get` | Obtiene todos los enlaces de una entidad |
| `related.get` | Obtiene entidades relacionadas con sus enlaces |

**Tabla:** `project_links`

### 3. Dependencies
Dependencias funcionales direccionales. Tipos válidos: `data`, `code`, `api`, `context`. Una entidad puede depender funcionalmente de otra.

| Acción | Descripción |
|--------|-------------|
| `dep.add` | Añade una dependencia funcional |
| `dep.remove` | Elimina una dependencia por ID |
| `deps.get` | Obtiene dependencias de una entidad |
| `dependents.get` | Obtiene entidades que dependen de una entidad |
| `dependents.has` | Verifica si una entidad tiene dependientes |

**Tabla:** `project_dependencies`

## Eventos

### Publica

| Evento | Descripción |
|--------|-------------|
| `composition.response` | Respuesta a `composition.request` correlacionada por `request_id` |
| `system.created` | Sistema creado |
| `system.updated` | Sistema actualizado (incluye `updated_fields`) |
| `system.deleted` | Sistema eliminado (cascade en members) |
| `entity.joined_system` | Entidad asignada a un sistema con rol |
| `entity.left_system` | Entidad removida de su sistema |
| `entity.linked` | Entidades enlazadas con tipo |
| `entity.unlinked` | Enlace entre entidades eliminado |
| `entity.dependency.added` | Dependencia funcional añadida |
| `entity.dependency.removed` | Dependencia funcional eliminada |

### Suscribe

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `composition.request` | `onCompositionRequest` | Entry point request/response. Rutea las 18 acciones entre systems, links y dependencies. Publica `composition.response`. |
| `db.query.response` | `onDbQueryResponse` | Respuestas de database-manager correlacionadas por `request_id`. Resuelve `pendingDbRequests`. |

## UI Handlers

El módulo expone 16 handlers UI organizados por dominio:

### System
- `system/create` → `handleUISystemCreate`
- `system/list` → `handleUISystemList`
- `system/get` → `handleUISystemGet`
- `system/update` → `handleUISystemUpdate`
- `system/delete` → `handleUISystemDelete`
- `system/addProject` → `handleUISystemAddEntity`
- `system/removeProject` → `handleUISystemRemoveEntity`
- `system/getUnassigned` → `handleUISystemGetUnassigned`

### Project (Links)
- `project/link` → `handleUILink`
- `project/unlink` → `handleUIUnlink`
- `project/getLinks` → `handleUIGetLinks`
- `project/getRelated` → `handleUIGetRelated`

### Project (Dependencies)
- `project/addDependency` → `handleUIAddDependency`
- `project/removeDependency` → `handleUIRemoveDependency`
- `project/getDependencies` → `handleUIGetDependencies`
- `project/getDependents` → `handleUIGetDependents`

## Dependencias

- **database-manager**: Acceso a base de datos vía `db.query.request`. El módulo es dueño de 4 tablas: `systems`, `system_members`, `project_links`, `project_dependencies`.

## Configuración

| Parámetro | Valor por defecto | Descripción |
|-----------|-------------------|-------------|
| `dbTimeout` | `10000` | Timeout en ms para queries a DB |

### Persistencia

- **Patrón:** owned-tables-via-database-manager
- **Restart-resilient:** Sí
- **Concurrencia:** single-writer
- **Perdido en reinicio:** `pendingDbRequests` (mapa de requests pendientes)

## Observabilidad

### Logging
- Nivel: `info`
- Estructurado: Sí
- Correlation ID propagado en todos los eventos

### Métricas

**Contadores:**
- `composition-manager.system.created`
- `composition-manager.system.updated`
- `composition-manager.system.deleted`
- `composition-manager.entity.joined`
- `composition-manager.entity.left`
- `composition-manager.link.created`
- `composition-manager.link.deleted`
- `composition-manager.dependency.added`
- `composition-manager.dependency.removed`
- `composition-manager.request.success`
- `composition-manager.errors`

**Gauges:**
- `composition-manager.pending_db_requests`

## Ciclo de vida

- **onLoad**: Inicializa schema (tablas e índices idempotentes), obtiene referencias a logger, metrics, eventBus, uiHandler y config del core.
- **onUnload**: Limpia `pendingDbRequests`, rechaza promesas pendientes, cancela timeouts.

## Manejo de errores

- Handlers UI devuelven `{ status, data | error: { code, message } }`
- Métodos privados lanzan error con `_code` canónico:
  - `INVALID_INPUT`: validación de dominio (name required, self-link, etc.)
  - `RESOURCE_NOT_FOUND`: system/link/dependency no encontrado
  - `CONFLICT_STATE`: entidad ya asignada, link/dependency duplicado
- Errores no clasificados se delegan a `BaseModule._classifyHandlerError`
- Todo error se loggea y se incrementa métrica `composition-manager.errors`

## Notas técnicas

- 996 líneas (reescrito al canon, POC2 #5 del horizontal)
- No expone tools de LLM — la operación cross-módulo va por bus, no por LLM
- Implementa los 24 contratos transversales: errors, observability, events, lifecycle, persistence, resilience, tools
- Monolito legacy preservado en `arquitectura/migracion/_legacy/composition-manager-monolito-pre-rewrite.js.bak`
- Mapa exhaustivo del rewrite en `arquitectura/migracion/notas/composition-manager-mapa.md`
