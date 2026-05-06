# composition-manager — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato `module-rewrite.contract.json` antes de tocar código.

## Identidad

- **Path**: `modules/composition-manager/`
- **Versión actual**: 1.0.0 → bump a **2.0.0** post-rewrite.
- **LOC monolito**: 709 (index.js).
- **Drifts en baseline**: 40 distribuidos en 7 tipos.
- **Categoría**: core (#5 del roadmap, 0 deps upstream — solo `database-manager` via bus).

## Responsabilidad acotada (NO descomponer — servicio genérico unificado)

Servicio genérico de composición de entidades. Trabaja con `entity_id` abstracto — NO conoce de proyectos, prompts ni dominios específicos.

Tres sub-áreas dentro del mismo dominio:
- **Systems**: contenedores lógicos que agrupan entidades (CRUD + miembros con role).
- **Links**: relaciones direccionales entre entidades (`inspired_by`, `related_to`, `evolved_from`).
- **Dependencies**: dependencias funcionales (`data`, `code`, `api`, `context`).

Las 3 son sub-vistas del mismo concepto: relaciones cross-entidad. **NO se descomponen** — son la misma responsabilidad acotada con 3 modalidades.

## Tablas owned (en DB system)

- `systems` (id, name, description, created_at, updated_at, metadata).
- `system_members` (system_id, entity_id, role, joined_at) — composite PK.
- `project_links` (id, source_project_id, target_project_id, link_type, reason, created_at).
- `project_dependencies` (id, project_id, depends_on_project_id, dependency_type, description, created_at).

## Inventario completo de métodos (39 totales)

### Lifecycle (2)
- `onLoad(core)` — inyecta deps, inicializa schema (4 CREATE TABLE + 6 indexes).
- `onUnload()` — clear pendingDbRequests con reject (sin leak).

### DB access (2)
- `queryDatabase(query, params, readOnly, correlationId)` — Promise wrapper que publica `db.query.request` con timeout. Maneja `pendingDbRequests` Map.
- `onDbQueryResponse(event)` — handler del response, resuelve/rechaza pending.

### Schema (1)
- `initializeSchema()` — crea 4 tablas + 6 indexes (idempotente con `IF NOT EXISTS`).

### Systems (8 métodos)
- `createSystem(name, description, metadata, correlationId)` — inserta + publica `system.created`.
- `getSystem(systemId, correlationId)` — devuelve system con members[] expandido. Backward-compat: alias `projects` para uso legacy de project-manager.
- `listSystems(correlationId)` — todos con count de members.
- `updateSystem(systemId, updates, correlationId)` — UPDATE + publica `system.updated`.
- `deleteSystem(systemId, correlationId)` — DELETE cascade (members + system) + publica `system.deleted`.
- `addEntityToSystem(systemId, entityId, role, correlationId)` — inserta member, falla si entity ya en otro system. Publica `entity.joined_system`.
- `removeEntityFromSystem(entityId, correlationId)` — DELETE member + publica `entity.left_system`.
- `getEntitySystem(entityId, correlationId)` — devuelve system del entity con `entityRole`.
- `getUnassignedEntities(entityIds, correlationId)` — filtra los que NO están en ningún system.

### Links (5 métodos)
- `linkEntities(sourceId, targetId, linkType, reason, correlationId)` — inserta link, falla si self-link o ya existe. Publica `entity.linked`.
- `unlinkEntities(linkId, correlationId)` — DELETE + publica `entity.unlinked`.
- `getEntityLinks(entityId, correlationId)` — todos los links source/target del entity con `direction`.
- `getRelatedEntities(entityId, correlationId)` — entities relacionadas con sus links de conexión.

### Dependencies (5 métodos)
- `addDependency(entityId, dependsOnId, dependencyType, description, correlationId)` — inserta dep, falla si self-dep o ya existe. Publica `entity.dependency.added`.
- `removeDependency(dependencyId, correlationId)` — DELETE + publica `entity.dependency.removed`.
- `getDependencies(entityId, correlationId)` — todas las que el entity tiene.
- `getDependents(entityId, correlationId)` — todos los que dependen del entity.
- `hasDependents(entityId, correlationId)` — `{ hasDependents, count, dependents[] }`.

### Bus handler genérico (1)
- `onCompositionRequest(event)` — handler de `composition.request`. Rutea 18 actions distintas a los métodos de dominio. Publica `composition.response` con `{ request_id, success, data | error, correlation_id }`.

Las 18 actions ruteadas son:
`system.create`, `system.get`, `system.list`, `system.update`, `system.delete`,
`entity.join`, `entity.leave`, `entity.system`, `entity.unassigned`,
`link`, `unlink`, `links.get`, `related.get`,
`dep.add`, `dep.remove`, `deps.get`, `dependents.get`, `dependents.has`.

### UI handlers (16)
- Systems: `handleUISystemCreate/List/Get/Update/Delete/AddEntity/RemoveEntity/GetUnassigned`.
- Links: `handleUILink/Unlink/GetLinks/GetRelated`.
- Dependencies: `handleUIAddDependency/RemoveDependency/GetDependencies/GetDependents`.

Validan inputs canónicos, hacen `throw { status, code, message }` (drift — debería ser return canónico).

## Eventos

### Publishes (10 declarados)
1. `composition.response` — request/response correlacionado por `request_id`.
2. `system.created` / `system.updated` / `system.deleted`.
3. `entity.joined_system` / `entity.left_system`.
4. `entity.linked` / `entity.unlinked`.
5. `entity.dependency.added` / `entity.dependency.removed`.

### Subscribes (2)
1. `composition.request` → `onCompositionRequest` (rutea 18 actions).
2. `db.query.response` → `onDbQueryResponse`.

## Estado interno

- `pendingDbRequests` (Map): `request_id → { resolve, reject, timeout }`.

## Drifts conocidos en baseline (40)

| Tipo | Count | Naturaleza |
|---|---|---|
| `inventar_error_code` | 21 | Throws con `new Error('...')` sin `_code`. Drift real. |
| `publish_dominio_sin_project_id` | 8 | Falso positivo: módulo genérico opera con `entity_id`, no `project_id`. |
| `respuesta_no_canonica` | 3 | UI handlers que devuelven `{ ... }` sin shape `{status, data}`. Drift real. |
| `generic_verb` | 3 | Falso positivo: `composition.response` canónico. |
| `rpc_over_pubsub` | 3 | Falso positivo: ídem. |
| `swallow_error_silently` | 1 | Try/catch del index `_` sin log (línea 143 — `for index sql; try {} catch (_) {}`). Decisión consciente (idempotencia). |
| `log_spam_en_bucle` | 1 | Probablemente initializeSchema o un loop. |

**Patrón principal**: throws con error sin `_code` canónico (21 ocurrencias) + UI handlers con throw object en lugar de return canónico (drift real). Falsos positivos del validator: 8 publish sin project_id (legítimo en módulo genérico) + 6 generic_verb/rpc (composition.response es canónico).

## Cosas críticas a preservar (validación post-rewrite)

1. **10 eventos del bus invariantes** (todos los publishes).
2. **18 actions del onCompositionRequest preservadas** — cualquier caller que use las actions sigue funcionando.
3. **Backward-compat 'projects' alias en getSystem** — project-manager y context-manager usan ese alias.
4. **Schema idempotente** — `IF NOT EXISTS` + try/catch silencioso en indexes.
5. **Validación `entityId === entityId` en linkEntities y addDependency** — no permitir self-relations.
6. **Detección de duplicados** — link existente, dep existente, entity ya en system.
7. **Cascade en deleteSystem** — DELETE members antes de system.
8. **`projects: members.map` en getSystem** — backward-compat para project-manager.

## Plan del rewrite

1. Archivar monolito (709 LOC) en `_legacy/composition-manager-monolito-pre-rewrite.js.bak`.
2. Reescribir `index.js` v2.0.0 al canon:
   - Helpers POC2 (5).
   - Errors canónicos: throws con `_code` + `_details`.
   - UI handlers con shape canónico `{ status, data | error: { code, message, details? } }`.
   - Telemetría completa (counters por sub-área + errors).
   - `_publicarEvento` con correlation_id heredado o nuevo.
3. `module.json` v2.0.0 con observability completa + ui_handlers reorganizados.
4. Tests por capas:
   - Group 1: Lifecycle.
   - Group 2: Validación canónica (cada UI handler con error 400).
   - Group 3: Systems (CRUD + members).
   - Group 4: Links (link/unlink/getLinks/related).
   - Group 5: Dependencies (add/remove/get/has).
   - Group 6: Bus handler `onCompositionRequest` con 18 actions.
   - Group 7: Helpers POC2 internos.
5. Wire CI + verificar drift count ≤30%.
6. Commit con métricas + regenerar PROGRESO.
