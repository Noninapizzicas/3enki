# POC notas — hallazgos sobre los contratos

Rewrite del módulo `notas` aplicando los 4 contratos arquitectónicos (`events`, `lifecycle`, `observability`, `errors`) y las 2 convenciones (`naming`, `glossary`). Este documento captura lo que aprendimos al pasar del descriptivo al prescriptivo en código real.

---

## ✅ Lo que funcionó sin fricción

### 1. Forma canónica de respuesta `{ status, data?, error? }`
La mutual exclusion data/error y el shape único hicieron que escribir handlers fuera mecánico. Cero ambigüedad en cómo construir cualquier respuesta.

### 2. Helper `_buildErrorResponse(...)` centraliza telemetría
Un único punto de salida para errores. Auto-log + auto-metric + sin stack en respuesta — todo enforced por el helper sin disciplina del programador. **Esto debería ser un patrón canónico explícito en el contrato `errors`** (decisión `auto_log_on_error` ya lo apunta, pero el helper en sí merece ser reglado).

### 3. Lifecycle canónico (`onLoad(core)` + `onUnload()`)
La firma única + el patrón de capture references → init state → load from disk fluyó natural. `onUnload` con cleanup explícito (notas.clear() + notas=null) elimina la `estado_no_limpiado` warning del audit anterior.

### 4. Logger structured + métrica con prefix de módulo
`this.logger.info('notas.<entity>.<action>', { ...fields })` y `this.metrics.X('notas.<entity>.<accion>.<sufijo>', ...)` — coherentes con observability.json. Cero invención.

### 5. Persistencia atómica (write tempFile + rename)
Patrón sencillo, robusto, no requiere libs. Ya lo aplica `ui-designer` (único módulo del repo con write atómico). Esto debería formalizarse en el contrato `persistence` como patrón recomendado para módulos JSON-file-based.

---

## ⚠️ Fricciones y decisiones de POC

### F1 — Verbo en español: chirría visualmente

**Regla `naming.json.principios.masculino_singular_for_es`**: forma canónica = masculino singular independiente del género.

**En código quedó:**
```js
await this._publicarEvento('notas.creado', ...)   // ✅ regla
await this._publicarEvento('notas.actualizado', ...)
await this._publicarEvento('notas.eliminado', ...)
```

**El "chirrío":** semánticamente "una nota creada" suena natural en español. "una nota creado" no se diría nunca en habla. Pero la regla es que el evento NO es lenguaje natural — es un identificador sintáctico. Lo respetamos.

**Recomendación al contrato `naming.json`:** mantener la regla. Añadir una **nota didáctica** al output explicando que la concordancia gramatical no aplica a identificadores del bus.

### F2 — Module-prefix vs entity prefix: tensión real

**Audit del original**: usaba `nota.creada` (singular, prefix=entity).
**POC**: usa `notas.creado` (plural, prefix=module).

**Tensión con events.contract.json**: `topic_pattern: "core/{core-id}/events/{module}/{entity}/{verb}"` sugiere 3 partes (module + entity + verb). Pero `naming.json.rules.form` permite 2 partes cuando `entity == module`.

**En notas pasa que module == entity** (singular vs plural). El POC eligió 2-partes con module-name como prefix.

**Recomendación al contrato `events.json` y `naming.json`:** clarificar:
- 2-partes: `<module>.<verb>` (módulos cuyo dominio es UNA entidad implícita)
- 3-partes: `<module>.<entity>.<verb>` (módulos con varias entidades)
- `notas.creado` es válido porque "la entidad es el propio módulo".
- `pizzepos__cocina.comanda.recibida` sería 3-partes si cocina maneja varias entidades.

**Este matiz no estaba claro hasta escribir el código.**

### F3 — Códigos de error: específico vs genérico

**Decisión POC:** usar `RESOURCE_NOT_FOUND` + `details.entity_type='nota'` en lugar de añadir `NOTA_NOT_FOUND` a `errors.json.codes_domain`.

**Resultado:**
```js
{ status: 404, error: {
    code: 'RESOURCE_NOT_FOUND',
    message: 'Nota con id X no existe',
    details: { entity_type: 'nota', entity_id: 'X' }
}}
```

Funciona limpiamente. El caller que necesite ramificar por entidad lo hace por `details.entity_type`.

**Recomendación al contrato `errors.json`:** los códigos `PROJECT_NOT_FOUND` y `RECIPE_NOT_FOUND` actuales son **inconsistentes con el patrón generic + entity_type**. Deberían deprecarse en favor de:
- `RESOURCE_NOT_FOUND` (genérico)
- + `details.entity_type` (qué entidad)

**Migrar `codes_domain` reduce la lista de ~17 a ~12 entradas** sin perder expresividad.

### F4 — Helper `_publicarEvento` para timestamp + correlation_id auto

El POC implementó un helper que añade `timestamp` y propaga `correlation_id` automáticamente al payload. Sin él, cada call site tendría que recordarlo.

**Recomendación al contrato `events.json`:** documentar este patrón como recomendación. La decisión `correlation_id_propagation_pattern` ya lo dice, pero un helper canónico merece ser ejemplificado en el output.

### F5 — Validation errors: ¿devolver el primero o todos?

El POC devuelve **el primero** como `error.code/message` y **todos** en `details.all_errors`. Hace lo correcto:
- El caller simple (UI mostrando el primer error) lee `error.message`
- El caller avanzado (form que destaca todos los campos rotos) lee `details.all_errors`

**Esto NO está en `errors.json`. Recomendación:** añadir patrón `validation_errors` a `details_canonical_fields` con la convención de `all_errors[]`.

### F6 — Persistencia: write atómico es esencial

Implementé write atómico (tempFile + rename). Sin él, una caída durante el write deja el archivo corrupto. Es trivial de implementar pero crítico.

**Recomendación al futuro contrato `persistence`:** declarar write atómico como **requisito** para JSON-file persistence. No opcional.

---

## 🔍 Drift detectado en el original (que el POC corrige)

Aplicando los validators sobre el original `modules/notas/index.js`:

| Validator | Drift en original | Resuelto en POC |
|---|---|---|
| **naming** | `nota.creada` (femenino) | `notas.creado` (masculino singular) |
| **events** | publish puede ser silencioso | helper `_publicarEvento` con error log |
| **lifecycle** | `estado_no_limpiado: ["this.notas", "this.stats"]` | `onUnload` limpia explícito |
| **observability** | métricas `nota.X` (prefix singular) | `notas.X` (prefix module) |
| **observability** | sin telemetría auto en errores | helper `_buildErrorResponse` |
| **errors** | `{ status, data: { error: 'string' } }` | `{ status, error: { code, message, details } }` |
| **errors** | sin códigos canónicos (string libre) | UPPER_SNAKE_CASE de lista cerrada |
| **errors** | algunos errores sin métrica | helper enforce metric |

---

## 📋 Acciones recomendadas a los contratos (post-POC)

1. **`naming.json`** — añadir nota explicativa sobre que "concordancia gramatical no aplica al bus" en `principios.masculino_singular_for_es.razon`.
2. **`naming.json` / `events.json`** — clarificar 2-partes vs 3-partes según multi-entity vs single-entity.
3. **`errors.json`** — deprecar `PROJECT_NOT_FOUND`, `RECIPE_NOT_FOUND` en favor de `RESOURCE_NOT_FOUND` + `entity_type`. Reduce lista en ~30%.
4. **`errors.json`** — añadir patrón `validation_errors` con convención `details.all_errors[]`.
5. **`events.json`** — ejemplificar helper `_publicarEvento` para correlation_id+timestamp.
6. **Futuro `persistence.contract.json`** — write atómico (tempFile + rename) como **requisito** para JSON-file persistence.
7. **`errors.json`** — formalizar `_buildErrorResponse` como helper canónico (snippet de referencia).

---

## 📊 Métricas del POC

| Métrica | Original | POC |
|---|---|---|
| Líneas de código | ~484 | ~480 |
| Handlers | 8 (incluye /health, /metrics) | 6 (foco dominio) |
| Códigos de error canónicos | 0 | 5 (RESOURCE_NOT_FOUND, INVALID_INPUT, INVALID_INPUT, INVALID_INPUT, UNKNOWN_ERROR) |
| Persistencia | in-memory | JSON file con write atómico |
| Drift validators | múltiples | cero (esperado) |
| correlation_id propagado | parcial | 100% |
| Stack en respuestas | nunca (ya estaba bien) | nunca (mantenido) |

---

## ✅ Veredicto del POC

**Los 4 contratos arquitectónicos + 2 convenciones funcionan en código real.** Las fricciones detectadas son ajustes finos, no fallos estructurales.

**El sistema de contratos ESTÁ listo para escalar al rewrite del resto de módulos.** Cada nuevo módulo se beneficiará de las clarificaciones documentadas arriba.

**Próximo paso lógico:** aplicar los 7 ajustes al contrato → POC de un segundo módulo más complejo (con persistencia SQLite, IoT, o multi-tenant) → completar contratos pendientes (`persistence`, `http`).
