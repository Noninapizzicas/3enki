# PASO 0 — mapa del refactor `recetas` (v3.0.0 → v4.0.0, POC2 canon subsistema-recetario)

Aggregate root del subsistema-recetario. Reescritura sigue `arquitectura/decisiones/_contratos/module-rewrite.contract.json` v1.1.0.

**Contexto historico**: existe `recetas-mapa-v2-to-v3-historico.md` del refactor v2.0.0 → v3.0.0. Ese refactor convirtio el modulo a json-per-project via bus (la referencia que usaron los 4 modulos nuevos del horizontal). Este mapa cubre la segunda migracion v3.0.0 → v4.0.0, alineando con el sub-contrato subsistema-recetario v1.0.2.

**El modulo YA esta parcialmente POC2** (corregido vs analisis preliminar):

✓ `class RecetasModule extends BaseModule` (`index.js:53`).
✓ 5 helpers POC2 presentes (`_errorResponse, _classifyHandlerError, _statusFromCode, _handleHandlerError, _publicarEvento`).
✓ Persistencia json-per-project via bus (`fs.read.request`, `fs.write.request`).
✓ Override `_publicarEvento` enriquece con `correlation_id` + `timestamp` ISO 8601 automaticamente.
✓ 13 tools declaradas con `errores_conocidos` como array de strings UPPER_SNAKE_CASE (canon `tools.contract`).
✓ Write queue por proyecto (`writeQueues: Map<project_id, Promise>`).
✓ Sin `moduleLoader.toolsRegistry` directo, sin cross-vertical access (recetas es aggregate root — no depende de otros del subsistema).

Esto significa que el refactor v3→v4 es **estrecho** — cierre de drifts especificos, no reescritura desde cero. Mismo perfil que el de escandallo.

**LOC**: 927 (index.js, sin subdirs).

## Identidad

- **Slug**: `recetas`
- **Version actual**: v3.0.0 → bump a **v4.0.0** (regla `version_bump_mayor`).
- **Language**: `es`
- **Tier**: `tier_4_dominio`
- **Subsistema**: `subsistema-recetario` (v1.0.2)
- **Tipo canonico**: **aggregate root** del subsistema. Dueno del dato canonico de receta + catalogo de ingredientes.

## Drifts confirmados (alineacion con subsistema-recetario)

### A — Naming interno `proyecto_id` → `project_id` (77 occurrencias)

Drift PERVASIVE. El modulo tiene un patron de "borde" donde `_toolDispatch` y `_uiAdapt` traducen entrada `project_id` → `proyecto_id` interno. Esto fue una decision linguistica (espanol) que hoy es drift del canon.

- `index.js:192`, `:251`, `:255`, etc.: handlers usan `const { proyecto_id, ... } = params;`.
- `index.js:848`: `const params = { ...rest, proyecto_id: project_id ?? rest.proyecto_id };` (traduccion borde).
- `index.js:878`: `_uiAdapt` hace lo mismo.

**Action**: Renombrar TODAS las ocurrencias internas a `project_id`. Eliminar `_toolDispatch` y `_uiAdapt` (no mas ui_handlers — ver drift H).

**Side effect importante**: tras el rename, `escandallo.onRecetaCreada`/`onRecetaActualizada` ya no necesita compat hack `data.project_id || data.proyecto_id`. Lo limpio en el commit de recetas (cambio en escandallo coordinado).

### B — Timestamps internos como epoch ms (drift de tipo)

- `index.js:216, 229, 348, 366, 435, 440, 471, 540`: `const now = Date.now();` (epoch ms).
- Storage usa epoch ms para `created_at`, `updated_at`, `_archived_at`.
- El override `_publicarEvento` (`index.js:687`) emite `new Date().toISOString()` — los publishes salen bien.
- `_emptyStore` en `index.js:764` ya usa ISO 8601 para `_updated_at` (inconsistente con resto).

**Action**: Cambiar TODOS los timestamps de storage a ISO 8601 string. Coherencia interna y consumibilidad humana. No afecta consumers (publishes ya son ISO).

### C — Publishes con shape incompleto

El override `_publicarEvento` ya anade `correlation_id` y `timestamp`. PERO faltan campos canonicos en los payloads especificos:

#### C1. `receta.creada` (`index.js:235`)
- **Publicado**: `{ project_id: proyecto_id, id, nombre: receta.nombre }`.
- **Schema canonico requiere**: `correlation_id, project_id, user_id, receta_id, nombre, version, estado_operativo, timestamp`. Opcionales: `incompleta, campos_pendientes`.
- **Drift**: falta `user_id`, `receta_id` (publicado como `id`), `version`, `estado_operativo`.

#### C2. `receta.actualizada` (`index.js:369` y `:443`)
- **Publicado**: `{ project_id: proyecto_id, id, nombre, version }`. En `:443` (revertir) se anade `motivo`.
- **Schema canonico requiere**: `correlation_id, project_id, user_id, receta_id, nombre, version, timestamp`. Opcionales: `campos_actualizados, motivo, incompleta, campos_pendientes`.
- **Drift**: falta `user_id`. `id` debe ser `receta_id`. Util anadir `campos_actualizados`.

#### C3. `receta.eliminada` (`index.js:472`)
- **Publicado**: `{ project_id: proyecto_id, id, nombre }`.
- **Schema canonico requiere**: `correlation_id, project_id, user_id, receta_id, nombre, timestamp`. Opcional: `motivo`.
- **Drift**: falta `user_id`, `id` debe ser `receta_id`.

#### C4. `receta.estado.actualizada` — **NO IMPLEMENTADO**
- **Estado actual**: cuando `eliminar` archiva (`r.estado = 'archivada'`), solo publica `receta.eliminada`. **No emite el evento canonico de transicion de estado**.
- **Schema canonico requiere**: `correlation_id, project_id, user_id, receta_id, nombre, estado_anterior, estado_nuevo, version, timestamp`. Opcional: `motivo`.
- **Decision canonica**: archivar es un caso de transicion. Emitir AMBOS eventos cuando archive (`receta.estado.actualizada` con `estado_nuevo='archivada'` + `receta.eliminada` especializado). Cuando solo se cambia estado (sin archivar — ej. `borrador → en_servicio`), emitir solo `receta.estado.actualizada`.
- **Tool nueva necesaria**: `recetas.cambiar_estado(receta_id, target_estado)` que valida transiciones.

#### C5. `ingrediente.precio.actualizado` (`index.js:552`)
- **Publicado**: `{ project_id: proyecto_id, nombre, precio_mercado }`.
- **Schema canonico requiere**: `correlation_id, project_id, user_id, nombre, precio_mercado, timestamp`. Opcionales: `unidad, categoria, fuente`.
- **Drift**: falta `user_id`. Schema usa `nombre` (no `ingrediente_nombre`) — verificar (el reporte preliminar lo decia mal; el schema oficial usa `nombre` con $ref a `ingrediente_nombre`). `unidad` se publica en el response pero NO en el payload del evento — anadirlo. Util tracking de `precio_anterior` para audit aunque no sea canonico (no incluido en el schema oficial, asi que NO se anade).

### D — Estado `'activa'` legacy vs canonico `'en_servicio'`

El sub-contrato (via `_common.schema.json#/$defs/receta_estado_operativo`) define los estados canonicos como `borrador, en_servicio, archivada`. El modulo usa `'activa'` en:
- `index.js:226`: nueva receta se crea con `estado: 'activa'`.
- `module.json:213-215`: enum del filtro de `recetas.listar` incluye `["activa", "archivada", "borrador"]`.
- Constants/strings en 40+ lugares.

**Action**: 
- Migrar `'activa'` → `'en_servicio'` en codigo + module.json.
- En `_loadStore`, normalizar `'activa'` legacy del storage existente a `'en_servicio'` (compat lectura, escrituras ya canonicas).
- Constants `const ESTADOS = { BORRADOR: 'borrador', EN_SERVICIO: 'en_servicio', ARCHIVADA: 'archivada' }` al top del modulo.

### E — Validacion de transiciones de estado

Actualmente sin validacion:
- `index.js:226`: nueva receta arranca en `'activa'` (deberia ser `'borrador'` segun la convencion canonica o `'en_servicio'`? Decision: arrancar en `'en_servicio'` cuando la creacion es del LLM/usuario con datos validos; en `'borrador'` cuando es incompleta).
- `index.js:470`: `eliminar` siempre archiva sin verificar estado previo.

**Action**: 
- Una receta NUEVA arranca en `'en_servicio'` si tiene los `campos_para_completa`; en `'borrador'` si esta incompleta.
- Transiciones canonicas validas: `borrador → en_servicio`, `en_servicio → borrador`, `borrador → archivada`, `en_servicio → archivada`. NO permitidas: `archivada → *` (irreversible salvo via revertir explicito que reactiva una version anterior).
- Nueva tool `recetas.cambiar_estado` valida.
- Hardcoded strings → `ESTADOS` constants.

### F — Falta `user_id` en publishes

Ningun handler captura `user_id` de `params`. El override `_publicarEvento` no lo anade. Es campo OBLIGATORIO en los 5 schemas canonicos.

**Action**: 
- En el override `_publicarEvento`, anadir `user_id` igual que en los 4 modulos nuevos (`payload?.user_id || sourcePayload?.user_id || DEFAULT_USER_ID`).
- Tools que reciben `user_id` lo pasan al publish.

### G — `_classifyHandlerError` override con keywords espanol

- `index.js:659-665`: override que detecta `'no encontrad'`, `'requerido'`, `'invalid'`, `'corrupto'` (espanol).
- BaseModule.`_classifyHandlerError` es locale-neutral con keywords ingles.

**Action**: eliminar el override. Heredar de BaseModule. Asignar `err._code` explicito en `throw`.

### H — UI handlers (13 workspace_module) — drift estructural del subsistema

13 `ui_handlers` en `module.json:114-128`, cada uno con su `handleXxx` en `index.js:720-738`. Cada `handleXxx` delega a la tool via `_uiAdapt`.

**Drift critico**: el sub-contrato dice "el modulo backend NO expone HTTP/UI directo; el frontend-recetario compone vistas via las tools del bus".

**Verificacion previa**: greppear consumers de `domain: 'recetas'` antes de eliminar (igual que hice con escandallo).

**Action**: eliminar `ui_handlers` del module.json + `handleXxx` + `_uiAdapt` de index.js. Frontend-recetario los reemplazara cuando se cree.

### I — Tools

- 13 tools canonicas declaradas. Naming: `recetas.<verb>` (crear, listar, obtener, buscar, actualizar, historial, revertir, eliminar, estadisticas, ingredientes, actualizar_precio, analizar, investigar_receta).
- Handlers `onToolXxx` (`onToolCrear`, etc.).
- Naming canonical de tool entries: ✓
- `errores_conocidos` como array de strings: ✓ (ya canonico).

**Hipotesis de drift de naming de handlers**: en escandallo v4 renombre los handlers a `onXxx` (sin `Tool` infix). En recetas estan como `onToolXxx`. Es drift sutil pero residual — el validator `modulo-clase-robusta::drift_metodo_bus_sin_naming_canonico` exige `on*` prefix, no especifica si `Tool` infix es valido. Decision: dejar `onToolXxx` (es legitimo, el validator no flagged en baseline anterior). Si genera drift nuevo en validate:ci tras el refactor, renombrar.

**Tool nueva**: `recetas.cambiar_estado(project_id, receta_id, target_estado, motivo?)`. Valida transicion + publica `receta.estado.actualizada` + (si archivada) `receta.eliminada`.

### J — Catalogo de ingredientes — decision arquitectonica

El modulo es dueno tanto de recetas como del catalogo de ingredientes. Ambos viven en `data/projects/{slug}/recetas.json` con estructura:
```json
{
  "_version": "...",
  "_updated_at": "...",
  "recetas": [...],
  "ingredientes_catalogo": [...]
}
```

**Decision para v4**: mantener. El sub-contrato dice "recetas es CRUD de recetas + catalogo de ingredientes". No descomponer en este refactor. Si en el futuro emerge necesidad, sera un refactor separado (v5).

### K — Otros drifts menores

- **Hardcoded timeouts** (`5000`, `8000`) — mover a `config` (ya existe pattern).
- **History de versiones**: actualmente cada receta tiene `r.history: []` con snapshots completos. Patron OK. No cambia.
- **Test framework**: `__tests__/smoke.js` con `assert` nativo + 13 smoke tests. Reusable parcialmente. Decision: eliminar y rehacer con 7 grupos POC2 + AJV validation (mismo patron que los 5 modulos previos).
- **Audit obsoleto** (`arquitectura/auditoria/_outputs/modulo-completo/recetas.json` de 2026-04-29): congelado en v1.0.0, miente sobre v3. Eliminar (mismo patron que escandallo).
- **README.md, context.json, prompt.json**: legacy de la era NLU. Eliminar.

## Acuerdos clave del refactor (consolidados)

### 1. Rename interno `proyecto_id` → `project_id`
77 ocurrencias. Sin compat hack en el modulo (los entrypoint son tools del bus + ui_handlers que se eliminan; ambos reciben `project_id` canonico).

### 2. Timestamps internos a ISO 8601
Storage entero a strings ISO 8601. Migracion de lectura: si encuentra epoch ms, convertir. Escrituras siempre canonicas.

### 3. `user_id` en publishes
Override `_publicarEvento` anade `user_id` como en los 4 modulos nuevos.

### 4. Eventos canonicos completos
- `receta.creada` con `version, estado_operativo, incompleta?, campos_pendientes?`.
- `receta.actualizada` con `campos_actualizados, motivo?, incompleta?, campos_pendientes?`.
- `receta.eliminada` con `motivo?`.
- `receta.estado.actualizada` NUEVO (cuando archive emite ambos).
- `ingrediente.precio.actualizado` con `unidad, categoria?, fuente?`.

### 5. Estados canonicos
- Constants `ESTADOS = { BORRADOR, EN_SERVICIO, ARCHIVADA }`.
- Migracion lectura: `'activa'` legacy → `'en_servicio'`.
- Validacion de transiciones.

### 6. Tool nueva `recetas.cambiar_estado`
Para cambios explicitos de estado distintos a "archivar via eliminar".

### 7. Eliminar `ui_handlers` (13)
Coherente con subsistema-recetario. Frontend-recetario reemplaza.

### 8. Eliminar `_classifyHandlerError` override
Heredar de BaseModule + `err._code` en throws.

### 9. Catalogo de ingredientes
Permanece como sub-entidad del modulo `recetas` (decision arquitectonica). No descomponer.

### 10. Coordinacion con escandallo
Tras el refactor, el compat hack en escandallo (`data.project_id || data.proyecto_id`) ya no es necesario. Limpiar en el mismo commit.

## Plan de pasos del refactor

1. **Verificar consumers** antes de eliminar superficie:
   - `grep -r "domain.*recetas.*action" modules/ core/` (ui_handlers workspace).
   - `grep -r "recetas\." modules/conversacion/` (agentes IA que usan tools).
   - Verificar que ningun modulo escucha `receta.*` con shape antiguo (ya verifique antes — solo escandallo, con compat hack).

2. **Archivar monolito**: `cp -r modules/recetas arquitectura/migracion/_legacy/recetas-monolito-pre-v4-rewrite/`.

3. **Reescribir `modules/recetas/index.js`** (v4.0.0):
   - Mantener `class RecetasModule extends BaseModule`.
   - Constants `ESTADOS` al top.
   - Renombrar `proyecto_id` → `project_id` en todo el codigo.
   - Cambiar timestamps de storage a ISO 8601 + helper de migracion en lectura.
   - Override `_publicarEvento` con `user_id`.
   - Publishes con shape canonico completo (5 eventos).
   - Implementar `receta.estado.actualizada` (en `eliminar` + en `cambiar_estado`).
   - Capturar `precio_anterior` en `actualizarPrecio` (aunque no se publique — util en logs).
   - Eliminar `_toolDispatch`, `_uiAdapt`, `handleXxx` (13).
   - Eliminar override `_classifyHandlerError` y `_handleHandlerError` si pueden ser heredados.
   - Validacion de transiciones de estado.
   - Tool nueva `recetas.cambiar_estado`.

4. **Reescribir `modules/recetas/module.json`** (v4.0.0):
   - Bump version.
   - 3 publishes oficiales con `response_schema_ref` a los 5 schemas (receta.creada, .actualizada, .eliminada, .estado.actualizada, ingrediente.precio.actualizado). Eliminar publishes infra (fs.* y project.* — declarados como publish es drift).
   - 14 tools (13 + nueva `cambiar_estado`).
   - Eliminar `ui_handlers`, `intents`.
   - Subscribes: lifecycle + 14 tools.

5. **Eliminar legacy interno**:
   - `__tests__/` (smoke tests viejos).
   - `context.json`, `prompt.json` (NLU pre-LLM).
   - `README.md` (legacy).

6. **Eliminar audits obsoletos**:
   - `arquitectura/auditoria/_outputs/modulo-completo/recetas.json`.
   - `arquitectura/auditoria/_outputs/manifest-completo/recetas.json` (si existe).

7. **Coordinar con escandallo**: eliminar compat hack `data.proyecto_id` en `onRecetaCreada`/`onRecetaActualizada` (`modules/escandallo/index.js`).

8. **Crear `tests/unit/recetas.test.js`** con 7 grupos POC2:
   - Lifecycle.
   - Validacion canonica.
   - Success crear (publish `receta.creada` AJV).
   - Success actualizar / revertir (publish `receta.actualizada` AJV).
   - Success eliminar + cambiar_estado (publish `receta.estado.actualizada` + `receta.eliminada` AJV).
   - Success ingredientes / precios (publish `ingrediente.precio.actualizado` AJV) + analizar.
   - Helpers POC2 + algoritmos (_normalizeIngredientes, _calcIncompleta, validaciones de transicion, migracion timestamp).

9. **`npm run validate:ci`** + regenerar baseline si toca.

10. **Commit** con metricas antes/despues.

11. **Push**.

## Criterio de cierre

- `npm run test:recetas` verde.
- `npm run validate:ci` verde, drift count baja >=50%.
- 5 publishes pasan AJV strict en tests grupos 3/4/5.
- 0 ocurrencias de `proyecto_id` en codigo nuevo.
- 0 timestamps `Date.now()` en storage.
- 0 `_classifyHandlerError` override.
- `ui_handlers` eliminados de module.json.
- Tool `recetas.cambiar_estado` declarada y testada.
- `user_id` presente en todos los publishes.
- escandallo limpiado de compat hack `proyecto_id`.
- Audit obsoleto eliminado.

## Riesgos

1. **Rename masivo `proyecto_id` → `project_id`** introduce bugs si alguna ocurrencia se escapa. Mitigacion: tests cubren shape canonico.
2. **Cambio de estado `'activa'` → `'en_servicio'`** rompe lectura de storage existente sin migracion. Mitigacion: normalizar en `_loadStore`.
3. **Eliminar ui_handlers** rompe workspace si hay consumers. Mitigacion: grep antes de eliminar.
4. **Nueva tool `cambiar_estado`** + el shape de `receta.eliminada` ahora incluye archivar como caso de transicion — los consumers tienen que estar OK con recibir 2 eventos en archivar. Mitigacion: escandallo ya invalida cache en ambos (sin daño).
5. **Storage existente con timestamps epoch ms**: migracion en lectura. Mitigacion: helper `_normalizeTimestamps` que convierte.

## Estado del horizontal subsistema-recetario tras este refactor

```
Backend:
  ✓ tecnicas              v1.0.0 (modulo nuevo)
  ✓ recetario-creativo    v1.0.0 (modulo nuevo)
  ✓ pase-cocina           v1.0.0 (modulo nuevo)
  ✓ mise-en-place         v1.0.0 (modulo nuevo)
  ✓ escandallo            v4.0.0 (REFACTOR cerrado)
  ☐ recetas               v4.0.0 (REFACTOR este mapa)

Frontend:
  ☐ frontend-recetario    (al final)
```

Cuando recetas cierre a v4, **6/6 modulos backend** del subsistema estan al canon. Solo queda el frontend-recetario.
