# PASO 0 — mapa del refactor `escandallo` (v3.0.0 → v4.0.0, POC2 canon subsistema-recetario)

Modulo EXISTENTE con drift estructural acotado. La reescritura sigue `arquitectura/decisiones/_contratos/module-rewrite.contract.json` v1.1.0.

**Contexto historico**: existe un mapa anterior (`escandallo-mapa-v1-to-v3-historico.md`) que sirvio a la migracion v1.0.0 → v3.0.0 (de 2026-05-13). Esa migracion CERRO 96 drifts heredados (errors sin metric/log, error como string suelto, codes inventados, etc.) y dejo el modulo en una base parcialmente POC2.

**Este mapa cubre la segunda migracion**: v3.0.0 → v4.0.0, alineando con el sub-contrato `subsistema-recetario` v1.0.1 que aterrizo despues (commits 2026-05-17). El alcance es estrictamente: cerrar los drifts heredados que el sub-contrato dejo anotados como `trabajo_pendiente`, y alinear con el patron POC2 + json-per-project ya validado en los 4 modulos nuevos (`tecnicas`, `recetario-creativo`, `pase-cocina`, `mise-en-place`).

Mapa exhaustivo (`paso_0_mapeo_exhaustivo_obligatorio`) sintetizado de:
- `module.json` v3.0.0 (declarativo actual).
- `arquitectura/auditoria/_outputs/modulo-completo/escandallo.json` (audit v1.0.0 de 2026-04-29 — anterior a la migracion previa; usado solo para snippets ubicacion archivo:linea).
- los 3 schemas oficiales del subsistema-recetario.
- mapeo completo via Explore agent del `index.js` (1095 LOC), `core/` (6 archivos, 1656 LOC), `db/` (1 archivo, 150 LOC), `pipeline/` (1 archivo, 228 LOC), `__tests__/` (3 archivos, 673 LOC).
- el mapa historico v1→v3 para preservar contexto de decisiones del refactor anterior.

**LOC totales del monolito (codigo + scaffolding)**: 1095 + 1656 + 150 + 228 = **3129 LOC**.

## Identidad

- **Slug**: `escandallo`
- **Version actual**: v3.0.0 → bump a **v4.0.0** (regla `version_bump_mayor`).
- **Language**: `es`
- **Tier**: `tier_4_dominio`
- **Subsistema**: `subsistema-recetario` (v1.0.1)
- **Tipo canonico**: satelite de recetas, capa derivada `analisis_de_costes`.

## Estado actual real (post-Explore)

El monolito **YA cumple parte del canon POC2** desde la migracion v1→v3:

✓ **`class EscandalloModule extends BaseModule`** (`index.js:38`). Export en `index.js:1095`.
✓ **5 helpers POC2 canonicos presentes** (`index.js:1008-1090`):
  - `_errorResponse(status, code, message, details)` — `1012-1016`
  - `_handleHandlerError(logEvent, err, kind)` — `1023-1037`
  - `_classifyHandlerError(err)` — `1039-1046`
  - `_publicarEvento(name, payload, sourcePayload)` — `1048-1062`
  - `_validateMissing(field, kind)` — auxiliar de dominio en `1018-1021`
✓ **`onLoad`/`onUnload` canonicos** (`54-62` / `65-82`). `onUnload` limpia los 3 Maps (corregido en migracion previa).
✓ **Subscribes reactivos funcionales** a `receta.creada`, `receta.actualizada`, `ingrediente.precio.actualizado`.
✓ **error.code canonico** (`INVALID_INPUT`, `RESOURCE_NOT_FOUND`, `UNKNOWN_ERROR`).
✓ **`_publicarEvento` enriquece** con `correlation_id` y `timestamp` ISO 8601 automaticamente (`1048-1062`).

Esto significa que el refactor v3→v4 es **mas estrecho** que los refactors tipicos de POC2: no hay que reescribir la clase entera, solo cerrar drifts especificos. Reduccion esperada del baseline: ~30-50% (no el 70% tipico de un POC2 inicial — el modulo ya esta mayormente canonico).

## Drifts confirmados (alineacion con subsistema-recetario)

### A — Bugs de runtime

**A1**. **Bug critico** — `EscandalloManager` constructor mismatch:
- Constructor en `core/escandallo-manager.js:18`: `constructor(projectId, basePath, logger)` (3 args).
- Llamado en `index.js:91`: `new EscandalloManager(dbPath, logger)` (2 args).
- Consecuencia: `projectId` recibe la string del path; `basePath` recibe el objeto logger; `logger` queda undefined → crash en primer uso del manager.
- **Latente**: ningun test ni audit lo detecto. Posible que el flujo de tools nunca llegue a `_getManager` en runtime real (cache lo cortocircuita); o que se descubra al primer test de integracion.
- **Fix en el refactor**: irrelevante — `EscandalloManager` se elimina entero al migrar a json-per-project.

### B — Naming canonico de eventos

**B1**. `escandallo.alerta` → rename a **`escandallo.alerta.detectada`** (drift heredado anotado en `subsistema-recetario.contract` v1.0.1).
**B2**. `escandallo.comparativa` → rename a **`escandallo.comparativa.calculada`** (idem).

Coordinacion con schemas oficiales:
- Renombrar `escandallo.alerta.schema.json` → `escandallo.alerta.detectada.schema.json` (con `$id` y `title` actualizados en el JSON).
- Idem `escandallo.comparativa.schema.json` → `escandallo.comparativa.calculada.schema.json`.
- Anotar cierre del drift en `subsistema-recetario.contract.json` v1.0.2 (`supersedes_nota`).
- `grep -r "escandallo.alerta\|escandallo.comparativa" modules/` antes de renombrar para detectar consumers que se romperan.

### C — Shape de payloads vs schemas oficiales AJV strict

**C1**. `escandallo.calculado` publica payload con campos extra (`insights[]`, `desglose[]`, etc.) — el schema oficial es `additionalProperties:false`, NO pasaria AJV. Linea `index.js:315`.
- Schema oficial requiere: `correlation_id, project_id, user_id, receta_id, nombre, coste_total, coste_por_porcion, coste_es_real, timestamp`.
- Opcionales: `food_cost_pct, ingredientes_sin_precio`.
- Campo nuevo del schema: `coste_es_real` (boolean — true si todos los ingredientes tenian precio en catalogo). Implementarlo.
- **Action**: simplificar payload publicado a los campos canonicos. Los `insights`/`desglose` pueden ir en el retorno de la tool (no en el evento) o ser un evento aparte si se desea exposicion.

**C2**. **TODOS los 3 publishes carecen de `user_id`** — campo canonico obligatorio del subsistema-recetario. El override de `_publicarEvento` actual (`index.js:1048-1062`) NO incluye `user_id`. Los 4 modulos nuevos del horizontal SI lo anaden.
- **Action**: actualizar override a:
  ```javascript
  const enriched = {
    correlation_id: sourcePayload?.correlation_id || crypto.randomUUID(),
    project_id:     payload?.project_id || sourcePayload?.project_id || DEFAULT_PROJECT_ID,
    user_id:        payload?.user_id    || sourcePayload?.user_id    || DEFAULT_USER_ID,
    timestamp:      new Date().toISOString(),
    ...payload
  };
  ```

**C3**. `escandallo.alerta` payload tiene `{tipo, project_id, receta_id, nombre, food_cost, umbral, mensaje}` (`index.js:321-328`). Schema oficial canonico: `correlation_id, project_id, user_id, tipo, receta_id, nombre, timestamp` + opcionales `valor_observado, umbral, detalle`.
- Renames: `food_cost` → `valor_observado`; `mensaje` → `detalle`. Anadir `user_id`.

**C4**. `escandallo.comparativa` (`index.js:460`) payload `{project_id, con_precio_compra[], sin_precio_compra[], resumen}`. Schema oficial canonico: `correlation_id, project_id, user_id, lineas[{ingrediente, precio_catalogo, precio_compra, delta_pct}], timestamp` + opcional `ingredientes_sin_compra_real`. Shape completamente distinto — restructurar.

### D — Multi-tenancy

**D1**. **`proyecto_id` vs `project_id` compat hack** en `onRecetaCreada` (`index.js:131`) y `onRecetaActualizada` (`index.js:138`):
```javascript
const project_id = data?.project_id || data?.proyecto_id;
```
Drift heredado del legacy de `recetas` (que aun publica `proyecto_id`). Se cierra cuando se refactorice `recetas`.
- **Action**: mantener compat hack hasta que `recetas` pase a v4.0.0 canonico. Anotar como `trabajo_pendiente` en el `module.json` o en el commit.

**D2**. Fallback `DEFAULT_PROJECT_ID = 'default'` en `_publicarEvento` (`index.js:1054`). Los 4 modulos nuevos del horizontal hacen lo mismo (coherente). Mantener.

### E — Persistencia (drift mayor)

**E1**. **SQLite directo + `fs.readFile` directo**. `core/escandallo-manager.js` usa `sqlite3` para `data/projects/<projectId>/storage/escandallos.db`. `_loadRecetasData` usa `fs.promises.readFile` directo (`index.js:150-160`).
- Mis 4 modulos nuevos usan exclusivamente `fs.read.request`/`fs.write.request` por bus.
- **Decision recomendada**: migrar a json-per-project via bus. Path `data/projects/{slug}/escandallo.json` con shape `{ _version, _updated, snapshots: [...], alertas: [...], comparativas: [...] }`.
- **Implica eliminar**: `core/escandallo-manager.js`, `db/schema-escandallo.sql`, `pipeline/escandallo-calculation-pipeline.js`. Reescribir logica de calculo inline en handlers.
- **Costo estimado**: ~1100 LOC eliminadas, ~200 LOC re-anadidas inline. Drift count baja drasticamente.

**E2**. **Timestamps INTEGER epoch ms** en `db/schema-escandallo.sql:24, 204`. Tras migrar a JSON, todos los timestamps son ISO 8601 string (alineado con todo el subsistema).

**E3**. Lectura de `recetas.json` e `ingredientes.json` desde disco para alimentar el calculo. Coherencia: el caller pasa los datos como params, NO el modulo los lee. Igual decision que en tecnicas/recetario-creativo/pase-cocina/mise-en-place: el LLM (o el caller) ya tiene la receta y la pasa.
- **Action**: tool `escandallo.receta` recibe `{project_id, receta_id, receta: {nombre, ingredientes: [...]}, precios_catalogo?, ...}`. El modulo NO consulta `recetas.json` ni `ingredientes.json`. Es CONSISTENCIA estricta con la doctrina event-core que ya enforzo en los 4 modulos nuevos.

### F — Tools

**F1**. **12 tools en runtime, 7 declaradas en manifest**. El `_registerAnalyzerTools()` (`index.js:906-1006`) registra 5 tools adicionales DIRECTAMENTE en `moduleLoader.toolsRegistry`:
- `escandallo.obtener`, `escandallo.obtener_historico`, `escandallo.obtener_alertas`, `escandallo.buscar`, `escandallo.buscar_y_ordenar`.
- Todas dependen de SQL (queries directas al manager). Con la migracion a JSON pierden sentido como tools dedicadas (son operaciones triviales sobre arrays JS).
- **Decision**: declarar `escandallo.obtener` y `escandallo.obtener_alertas` en `module.json` (utiles desde JSON: leer un snapshot, leer una alerta por id). Eliminar las 3 restantes (`obtener_historico`, `buscar`, `buscar_y_ordenar`).
- **Riesgo**: si algun flujo del repo invoca las 3 a eliminar. Verificar con `grep -r "escandallo.obtener_historico\|escandallo.buscar\|escandallo.buscar_y_ordenar" modules/` antes de actuar.

**F2**. **`moduleLoader.toolsRegistry` directo** (`_registerAnalyzerTools` en `index.js:906-1006`). Drift `module-rewrite::drift_modulo_acceso_directo_inter_modulo` — un modulo NO debe conocer `moduleLoader`. **Eliminar `_registerAnalyzerTools()` entero**. Las tools se auto-suscriben al bus desde `module.json.events.subscribes` (el loader del repo lo hace).

**F3**. **`errores_conocidos` shape `{code, cuando}`** en manifest. Drift `tools.validate::drift_tool_declaration_no_cumple_schema` — debe ser array de strings UPPER_SNAKE_CASE. Mismo drift que cerre en `tecnicas` v1.0.0 inicial.

**F4**. **Handlers de tools `toolXxx`**. El Explore reporta que el modulo lo trata como POC2 canonico para LLM handlers. PERO `tecnicas` v1.0.0 me hizo renombrar a `onXxx` por el validator `modulo-clase-robusta::drift_metodo_bus_sin_naming_canonico`. Verificar si los `toolXxx` de escandallo estan congelados en baseline.
- Si **drift congelado en baseline**: dejar como esta (no es regresion).
- Si **drift nuevo tras refactor**: renombrar a `onXxx` para coherencia con los 4 modulos del horizontal.

### G — Cross-vertical access (handleComparativa)

**G1**. `handleComparativa` (`index.js:438`, publica en `:460`) lee datos de `facturas` (otra vertical) para cruzar `precio_mercado` vs `precio_compra` real.
- Misma doctrina de los 4 modulos nuevos: el caller pasa los datos cross-modulo como param.
- **Action**: tool `escandallo.comparar_precios` recibe `{project_id, precios_catalogo: {ingrediente: precio}, precios_compra: {ingrediente: precio}}`. El modulo solo cruza.

### H — UI handlers (legacy workspace_module)

**H1**. 5 `ui_handlers` en `module.json` (`receta`, `global`, `compare`, `stats`, `health`) — son MQTT workspace_module, drift estructural del subsistema-recetario (que dice "el frontend-recetario compone vistas, los modulos backend no tienen UI directa").
- **Decision**: eliminar los 5. `frontend-recetario` los reemplaza componiendo tools.
- **Riesgo**: verificar con `grep -r "domain.*escandallo.*action" modules/` consumers workspace activos. Si hay alguno, dejar wrapper temporal con deprecation log o postponer eliminacion hasta que frontend-recetario exista.

### I — Observabilidad

**I1**. Manifest declara 6 counters (`escandallo.receta.calculated, .global.calculated, .comparativa.generated, .simulacion.run, .ficha.generated, .errors`). El Explore confirma que `_logError()` y `_handleHandlerError` emiten `errors` — pero los counters de exito (`calculated`, `generated`, `run`) NO se emiten.
- **Fix**: anadir `metrics.increment` en la rama de exito de cada handler de tool (post-publicar evento).

### J — Lifecycle

**J1**. `onUnload` NO espera (`await`) en el loop de `manager.close()` (`index.js:65-82`). Riesgo de leak.
- **Fix**: `for (const m of this.managers.values()) { try { await m.close(); } catch (err) { ... } }`.
- **Irrelevante en v4**: si eliminamos `managers` Map (sin SQLite), `onUnload` no tiene managers que cerrar.

**J2**. `onProjectDeactivated` (`index.js:127`) no-op. Deberia liberar el manager del proyecto.
- **Irrelevante en v4**: sin managers SQLite, `onProjectDeactivated` simplemente puede eliminar `cache.get(project_id)` y `projectBasePaths.delete(project_id)`.

### K — Codigo legacy / scaffolding a eliminar

| Archivo | LOC | Decision |
|---|---|---|
| `index.js` (monolito) | 1095 | Reescribir entero (preservando `extends BaseModule` + 5 helpers; eliminando managers/pipeline) |
| `core/escandallo-manager.js` | 513 | **Eliminar** (sin SQLite) |
| `core/precio-finder.js` | 337 | **Decision a tomar**: extraer a modulo nuevo o eliminar (depende de F1 — si se mantienen `comparar_precios`/`simular_precio` con datos pasados por param, precio-finder ya no hace falta) |
| `core/precio-cache-manager.js` | 176 | Eliminar |
| `core/search-filters.js` | 176 | Eliminar (SQL filters; con JSON los filtros son JS in-memory de 10 LOC) |
| `core/search-ranker.js` | 262 | Eliminar (SQL ranking; ditto) |
| `core/tool-result-formatter.js` | 192 | Eliminar (el LLM consume JSON nativo) |
| `db/schema-escandallo.sql` | 150 | Eliminar |
| `pipeline/escandallo-calculation-pipeline.js` | 228 | Eliminar (logica inlined en handlers) |
| `__tests__/escandallo-manager.test.js` | 247 | Eliminar (tests del manager SQLite) |
| `__tests__/search-filters.test.js` | 164 | Eliminar |
| `__tests__/search-ranker.test.js` | 262 | Eliminar |
| `context.json` | 2 KB | Eliminar (legacy NLU pre-LLM) |
| `prompt.json` | 223 B | Eliminar |
| `API.md` | 11 KB | Decision: si tiene knowledge dominio, extraer a mapa.md; sino eliminar |
| `DEPLOYMENT.md` | 8.7 KB | Eliminar (legacy) |
| `TROUBLESHOOTING.md` | 9.8 KB | Decision: idem API.md |
| `intents` block (en module.json) | 8 lineas | Eliminar |

**Decision sobre `core/precio-finder.js` + `core/precio-cache-manager.js`** (drift estructural separado):
- Si se eliminan: simplificacion radical. Las tools `comparar_precios` y `simular_precio` reciben precios como param. Coherente con la doctrina event-core ya enforzada. **Recomendacion**: eliminar.
- Si se extraen a modulo nuevo `modules/precio-finder/`: util como subproducto pero anade trabajo (modulo nuevo + tests + canonizacion). **Diferir**: tras cerrar escandallo, evaluar si vale la pena crearlo.

### L — Hardcoded values

**L1**. `35` (umbral alerta food_cost) hardcoded en `index.js:495`. **YA declarado en `module.json.config.food_cost_umbral_alerta`** — el codigo no lo lee. Fix: `this.config.food_cost_umbral_alerta`.
**L2**. `25` (umbral bajo) hardcoded en `index.js:485`. Idem `this.config.food_cost_umbral_bajo`.

### M — Locale-specific logic

**M1**. `_classifyHandlerError` mapea `msg.includes('no encontrad')` (espanol) → `RESOURCE_NOT_FOUND` (`index.js:1042-1045`). BaseModule canonico hereda con keywords ingles + respeta `err._code` asignado en throws.
- **Fix**: eliminar el override entero (heredar de BaseModule); asignar `err._code` en throws.

## Decisiones clave del refactor (consolidadas)

### 1. Naming canonico (rename)
- `escandallo.alerta` → `escandallo.alerta.detectada`. Schema renombrado.
- `escandallo.comparativa` → `escandallo.comparativa.calculada`. Schema renombrado.
- `subsistema-recetario.contract.json` v1.0.2: cerrar drift en `supersedes_nota`.

### 2. Persistencia
**json-per-project via bus**. `data/projects/{slug}/escandallo.json`.

### 3. Cache de calculos
Mantener cache invalidado por eventos `receta.*` + `ingrediente.precio.actualizado`. Legitimo y performante. Patron canonico del satelite con consumo reactivo.

### 4. Sin acceso cross-modulo
El caller pasa los datos: receta (con ingredientes) + precios catalogo + precios compra. Coherente con los 4 modulos nuevos.

### 5. UI handlers
Eliminar los 5 (sujeto a verificacion de consumers).

### 6. Tools — superficie final
- 7 canonicas declaradas (las del manifest v3.0.0).
- 2 anadidas (las 2 utiles de las analyzer: `obtener`, `obtener_alertas`).
- 3 eliminadas (las 3 SQL-only: `obtener_historico`, `buscar`, `buscar_y_ordenar`).
- **Total: 9 tools** declaradas en `module.json` y wireadas via subscribes.

### 7. precio-finder
**Eliminar** (no extraer a modulo nuevo en este refactor). El caller pasa los precios. Si emerge necesidad real de scraping integrado, se crea como modulo nuevo separado en sesion posterior.

### 8. Compat `proyecto_id`
**Mantener** hasta que recetas pase a v4.0.0. Anotar como `trabajo_pendiente`.

### 9. Version
v3.0.0 → **v4.0.0** (bump mayor).

## Plan de pasos del refactor (sesion fresca)

1. **`/clear`** + leer este mapa.md como contexto principal.
2. **Verificar consumers** antes de eliminar superficie:
   - `grep -r "escandallo.alerta\|escandallo.comparativa" modules/` (consumers del naming viejo).
   - `grep -r "domain.*escandallo.*action" modules/` (ui_handlers workspace).
   - `grep -r "escandallo.obtener_historico\|escandallo.buscar\|escandallo.buscar_y_ordenar" modules/` (tools a eliminar).
3. **Archivar monolito completo**:
   ```
   cp -r modules/escandallo arquitectura/migracion/_legacy/escandallo-monolito-pre-v4-rewrite/
   ```
4. **Renombrar schemas oficiales**:
   - `escandallo.alerta.schema.json` → `escandallo.alerta.detectada.schema.json` (con `$id` y `title` actualizados en JSON).
   - `escandallo.comparativa.schema.json` → `escandallo.comparativa.calculada.schema.json` (idem).
5. **Actualizar sub-contrato** `subsistema-recetario.contract.json` v1.0.2: cerrar drift de naming en `supersedes_nota`.
6. **Reescribir `modules/escandallo/index.js`** (v4.0.0):
   - Mantener `class EscandalloModule extends BaseModule`.
   - Mantener 5 helpers POC2 + auxiliar de dominio (`_validateMissing`).
   - Override `_publicarEvento` que incluya `user_id` ademas de `project_id`, `correlation_id`, `timestamp`.
   - Quitar `_classifyHandlerError` override (heredar de BaseModule + asignar `err._code` en throws).
   - 9 tools como `onXxx` con shape canonico y publishes alineados a schemas.
   - Eliminar `this.moduleLoader`, `_registerAnalyzerTools`, `_getManager`, `managers` Map.
   - Persistencia via `_basePathForProject`/`_loadStore`/`_saveStore`/`_withStore` (patron del subsistema, identico a tecnicas).
   - Cache de calculos en memoria, invalidada por subscribes.
   - Logica de calculo (escandallo + comparativa + simulacion + impacto + optimizacion + ficha) inlined directamente en handlers — no mas pipeline/manager/formatter.
   - Usar `this.config.food_cost_umbral_alerta` y `this.config.food_cost_umbral_bajo` (no hardcoded).
7. **Reescribir `modules/escandallo/module.json`** (v4.0.0):
   - Bump version.
   - `errores_conocidos` como array de strings.
   - 9 tools con handler `onXxx`.
   - 3 publishes con `response_schema_ref` apuntando a schemas renombrados.
   - Eliminar `intents` y `ui_handlers`.
   - `config.persistence` = `json-per-project` (cambio desde `mixed`).
   - `tracing.propaga_correlation_id: true` (ya estaba).
8. **Eliminar legacy interno**:
   - `core/` (entero).
   - `db/` (entero).
   - `pipeline/` (entero).
   - `__tests__/` (entero — sera reemplazado).
   - `context.json`, `prompt.json`.
   - `API.md`, `DEPLOYMENT.md`, `TROUBLESHOOTING.md` (decision por archivo).
9. **Crear `tests/unit/escandallo.test.js`** con 7 grupos POC2 + validacion AJV de los 3 publishes contra los schemas renombrados. Cobertura: lifecycle, validacion canonica, success calcular escandallo, success comparativa, success simular_precio + ingrediente_impacto + optimizar + ficha_tecnica, bus handlers, helpers POC2.
10. **`npm run validate:ci`** + regenerar baseline si toca.
11. **Commit** con metricas antes/despues:
    - LOC index.js: 1095 → ~700 (-36%).
    - LOC totales: 3129 → ~700 (-78%).
    - Drift count en baseline: medir antes/despues (objetivo: -50% al menos).
    - Tests anadidos: 0 → ~30.
    - Version: 3.0.0 → 4.0.0.
    - Subdirs eliminados: core/, db/, pipeline/, __tests__/.
    - Tools: 12 → 9.
12. **Push**.

## Criterio de cierre

- `npm run test:escandallo` verde.
- `npm run validate:ci` verde, drift count del modulo baja ≥50% (mas conservador que el 70% tipico — base ya parcialmente POC2).
- `extends BaseModule` mantenido.
- 0 `this.moduleLoader` en codigo.
- 0 `fs.promises.*` directo, 0 SQLite — todo via bus.
- 9 tools con handler `onXxx` (si baseline lo exige; sino `toolXxx`).
- 3 publishes (con naming renombrado para alerta y comparativa) pasan AJV strict en tests Group 3/4/5.
- 6 counters del manifest emitidos al menos una vez (cubiertos por tests).
- `ui_handlers` eliminados (o documentados como trabajo_pendiente si hay consumers vivos).
- `intents` block + `context.json` + `prompt.json` eliminados.
- `core/`, `db/`, `pipeline/`, `__tests__/` eliminados.
- `supersedes_nota` del sub-contrato actualizado con cierre del drift de naming.

## Riesgos del refactor

1. **Rename de eventos** rompe consumers — mitigacion: grep antes, rama compat transitoria si hay legacy.
2. **UI handlers eliminados** rompen workspace — mitigacion: grep, postponer eliminacion si frontend-recetario aun no existe.
3. **Tools obsoletas eliminadas** pueden romper flujos LLM — mitigacion: grep, dejar wrappers que delegan a las canonicas.
4. **Eliminar `precio-finder`** rompe scraping de precios si algun flujo lo usa — mitigacion: si rompe, evaluar extraerlo a modulo nuevo o restaurar como helper privado (con `_fetchWithTimeout`).
5. **Bug A1 (constructor mismatch)** irrelevante en v4 (managers eliminados).

## Estado del horizontal subsistema-recetario tras este refactor

```
Backend:
  ✓ tecnicas              (modulo nuevo)
  ✓ recetario-creativo    (modulo nuevo)
  ✓ pase-cocina           (modulo nuevo)
  ✓ mise-en-place         (modulo nuevo)
  ☐ escandallo            (REFACTOR v3→v4 — este mapa lo prepara)
  ☐ recetas               (REFACTOR pendiente — aggregate root, mas complejo)

Frontend:
  ☐ frontend-recetario    (al final)
```

Cuando escandallo cierre a v4, queda solo el refactor de `recetas` (aggregate root, drift de `proyecto_id` vs `project_id`, drift de timestamp epoch, 4 publishes a alinear con schemas oficiales) + el frontend-recetario.
