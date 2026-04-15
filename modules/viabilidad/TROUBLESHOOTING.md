# Viabilidad Receta Troubleshooting Guide

## Common Issues & Solutions

### Issue 1: Pipeline Not Triggering

**Symptoms:**
- No viabilidad records created after escandallo calculation
- Events not being published
- Manual tests of ViabilidadManager work fine

**Cause:**
- Event subscription not initialized
- EventBus not properly connected
- Project ID mismatch

**Solution:**

1. Check event subscription initialization:
```javascript
const pipeline = new ViabilidadCalculationPipeline(logger, eventBus, recipesModule);
await pipeline.init();  // MUST call init()
```

2. Verify EventBus is working:
```javascript
// Test event emission
eventBus.on('escandallo.calculado', (event) => {
  console.log('Event received:', event);
});

eventBus.emit('escandallo.calculado', {
  escandallo_id: 'test',
  receta_id: 'rec_test',
  projectId: 'proj_test',
  coste_porcion: 5.00
});
```

3. Check project IDs match:
```javascript
// escandallo event
{ projectId: 'proj_123', receta_id: 'rec_pasta' }

// viabilidad should save with same project ID
await manager.saveViability('proj_123', viability);
```

---

### Issue 2: Incorrect Viability Calculations

**Symptoms:**
- Margin or food cost percentages seem wrong
- Estado classification incorrect
- Calculations don't match manual math

**Example Problem:**
```
Coste: €5, Precio: €12
Expected margin: (12-5)/12 = 58.3%
Actual: 41.7%
```

**Cause:**
- Confusion between `margen_porcentaje` (profit %) and food cost %
  - `margen_porcentaje` = (price - cost) / price × 100
  - `food_cost_porcentaje` = cost / price × 100
  - Note: margen% + food_cost% ≈ 100%

**Solution:**

Check the calculation method:

```javascript
// CORRECT
const margen_bruto = precio_venta - coste_porcion;           // €7
const margen_porcentaje = (margen_bruto / precio_venta) * 100;  // 58.3%
const food_cost_porcentaje = (coste_porcion / precio_venta) * 100;  // 41.7%

// WRONG - Common mistake
const margen_porcentaje = (margen_bruto / coste_porcion) * 100;  // 140% - MARKUP, not margin!
```

Verify in `viabilidad-manager.js`:

```javascript
const margen_porcentaje = (margen_bruto / precio_venta) * 100;
const food_cost_porcentaje = (coste_porcion / precio_venta) * 100;
assert.strictEqual(margen_porcentaje + food_cost_porcentaje, 100, 'Must sum to 100%');
```

---

### Issue 3: Database File Not Found

**Symptoms:**
```
Error: ENOENT: no such file or directory, open '/projects/proj_123/viabilidad.db'
```

**Cause:**
- Project directory doesn't exist
- Database not initialized
- Wrong path in configuration

**Solution:**

1. Ensure project directory exists:
```javascript
const fs = require('fs');
const path = require('path');

const projectDir = path.join('/projects', projectId);
if (!fs.existsSync(projectDir)) {
  fs.mkdirSync(projectDir, { recursive: true });
}
```

2. Initialize database:
```javascript
const manager = new ViabilidadManager(dbPath, logger);
await manager.initialize();  // Creates DB automatically
```

3. Check configuration path:
```javascript
// Should resolve to absolute path
const dbPath = path.resolve(process.env.VIABILIDAD_DB_PATH || './viabilidad.db');
console.log('Using database at:', dbPath);
```

---

### Issue 4: Recommendations Not Generated

**Symptoms:**
- No recommendations returned
- `getRecommendations()` returns empty array
- UI shows "Sin recomendaciones" even for risky recipes

**Cause:**
- Recommendations not saved after generation
- Wrong filter criteria
- Data not being fetched from database

**Solution:**

1. Check pipeline saves recommendations:
```javascript
// In viabilidad-calculation-pipeline.js
const recomendaciones = manager.generateRecommendations(recetaId, viability);
await manager.saveRecommendations(projectId, receta_id, recomendaciones);  // Don't forget!
```

2. Verify recommendations generated for estado:
```javascript
const viability = { estado: 'CRÍTICO', margen_porcentaje: 10, ... };
const recs = manager.generateRecommendations('rec_1', viability);
console.log('Generated recommendations:', recs);

// Should have recommendations for CRÍTICO
assert.ok(recs.length > 0);
```

3. Check database query:
```javascript
// Verify table has data
const recs = await manager.db.all(
  `SELECT * FROM viabilidad_recomendacion WHERE receta_id = ?`,
  ['rec_test']
);
console.log('DB records:', recs);
```

---

### Issue 5: API Search Returns No Results

**Symptoms:**
- `/api/viabilidad/search?estado=VIABLE` returns empty results
- No error message
- Manual database queries show recipes exist

**Cause:**
- Missing `proyecto_id` parameter (required for safety)
- Filter criteria too restrictive
- Records in wrong project

**Solution:**

1. Always include `proyecto_id`:
```javascript
// WRONG
GET /api/viabilidad/search?estado=VIABLE

// CORRECT
GET /api/viabilidad/search?estado=VIABLE&proyecto_id=proj_123
```

2. Check project_id in database:
```sql
SELECT proyecto_id, COUNT(*) FROM viabilidad_receta GROUP BY proyecto_id;
```

3. Verify filters aren't too strict:
```bash
# Start with no filters
curl "/api/viabilidad/search?proyecto_id=proj_123"

# Then add one filter at a time
curl "/api/viabilidad/search?estado=VIABLE&proyecto_id=proj_123"
```

---

### Issue 6: Analyzer Agent Not Running

**Symptoms:**
- `receta.viabilidad.analysis.completed` event never fires
- Analyzer suggestions missing from UI
- No errors in logs

**Cause:**
- Agent not registered or enabled
- Tools not available to agent
- Event subscription misconfigured

**Solution:**

1. Verify agent is enabled:
```json
{
  "id": "viabilidad-receta-analyzer",
  "enabled": true,  // Check this
  "event_listener": {
    "event": "receta.viabilidad.evaluada"  // Correct event
  }
}
```

2. Register tools:
```javascript
// In moduleLoader or agent setup
const toolRegistry = require('./ai-agent-framework/tool-registry');

toolRegistry.register('viabilidad.obtener', {
  handler: async (receta_id, projectId) => {
    return await manager.getViability(projectId, receta_id);
  }
});

// Repeat for other tools:
// - viabilidad.obtener_recomendaciones
// - viabilidad.obtener_historico
```

3. Test agent directly:
```javascript
const agent = require('./ai-agent-framework/agent');
const result = await agent.execute('viabilidad-receta-analyzer', {
  receta_id: 'rec_test',
  projectId: 'proj_test',
  viabilidad: { /* viability data */ }
});

console.log('Agent result:', result);
```

---

### Issue 7: Frontend Components Not Displaying

**Symptoms:**
- Svelte components show as blank
- API calls not working
- Console errors about undefined props

**Cause:**
- Components expecting different data structure
- API endpoint not matching
- Missing imports

**Solution:**

1. Check component prop interfaces:
```svelte
// ViabilidadCard expects
export let viabilidad: any = null;
// Must have: id, estado, margen_porcentaje, food_cost_porcentaje, receta_nombre

// Verify API response matches
const response = await fetch(`/api/viabilidad/search?...`);
const { results } = await response.json();
results[0]  // Must have all required properties
```

2. Verify API endpoint exists:
```javascript
// Check if GET /api/viabilidad/search is implemented
// Check if POST /api/viabilidad/calculate is implemented
```

3. Check browser console:
```javascript
// Open DevTools → Console
// Look for fetch errors or 404s
// Check Network tab for API responses
```

---

### Issue 8: Database Growing Too Large

**Symptoms:**
- `viabilidad.db-wal` file is > 100MB
- Slow queries
- Disk space warnings

**Cause:**
- WAL (Write-Ahead Log) not being checkpointed
- Too many historical records
- Missing database maintenance

**Solution:**

1. Force checkpoint:
```javascript
// In code
await manager.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');

// Or via CLI
sqlite3 viabilidad.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

2. Archive old data:
```sql
-- Archive records older than 1 year
INSERT INTO viabilidad_receta_archive
SELECT * FROM viabilidad_receta
WHERE evaluado_at < datetime('now', '-1 year');

DELETE FROM viabilidad_receta
WHERE evaluado_at < datetime('now', '-1 year');
```

3. Vacuum database:
```javascript
await manager.db.exec('VACUUM');
```

---

### Issue 9: Performance Issues / Slow Queries

**Symptoms:**
- Search takes > 5 seconds
- UI is unresponsive
- Database queries timeout

**Cause:**
- Missing indexes
- N+1 query problems
- No pagination

**Solution:**

1. Check indexes exist:
```sql
.indices viabilidad_receta
-- Should show:
-- idx_viabilidad_proyecto_estado
-- idx_viabilidad_evaluado_at
-- idx_recomendacion_implementada
```

2. Use EXPLAIN QUERY PLAN:
```sql
EXPLAIN QUERY PLAN
SELECT * FROM viabilidad_receta
WHERE proyecto_id = 'proj_1' AND estado = 'VIABLE'
ORDER BY margen_porcentaje DESC;

-- Should use indexes, not full scan
```

3. Always use pagination:
```javascript
// Slow
const all = await manager.db.all('SELECT * FROM viabilidad_receta WHERE proyecto_id = ?', ['proj_1']);

// Fast
const page = await manager.db.all(
  'SELECT * FROM viabilidad_receta WHERE proyecto_id = ? LIMIT ? OFFSET ?',
  ['proj_1', 50, 0]
);
```

---

### Issue 10: Tests Failing with "Database Locked"

**Symptoms:**
```
Error: database is locked
```

**Cause:**
- Test cleanup not removing old connections
- Multiple tests running in parallel with same database
- WAL file locked by another process

**Solution:**

1. Ensure cleanup in tests:
```javascript
test('...', async (t) => {
  const manager = new ViabilidadManager(testDbPath, mockLogger);
  await manager.initialize();

  // ... test code ...

  await manager.close();  // MUST close connection
  cleanupDb();            // MUST remove files
});
```

2. Use separate databases per test:
```javascript
const testDbPath = path.join(__dirname, `test-${Date.now()}.db`);
```

3. Run tests serially (not parallel):
```bash
# Good - runs tests sequentially
node --test modules/viabilidad/__tests__/viabilidad-manager.test.js

# Bad - runs in parallel (may conflict)
npm test -- --parallel
```

---

### Issue 11: Estado Classification Changing Unexpectedly

**Symptoms:**
- Recipe shows as VIABLE, then CRÍTICO with same data
- Estado changes after recalculation with same cost/price
- Threshold values seem inconsistent

**Cause:**
- Floating point rounding errors
- Different threshold interpretation
- Data type conversion issues

**Example:**
```
Food cost = 30.0000001%  → ACEPTABLE
Food cost = 29.9999999%  → VIABLE
(Both should be same estado!)
```

**Solution:**

1. Review threshold definitions:
```javascript
// In viabilidad-manager.js - be explicit
const THRESHOLDS = {
  FC_INVIABLE: 45,      // > 45%
  FC_CRÍTICO: 40,       // > 40%
  FC_ACEPTABLE: 35,     // > 35%
  MARGEN_CRÍTICO: 15,   // < 15%
  MARGEN_ACEPTABLE: 20  // < 20%
};

// Use clear logic
if (food_cost > THRESHOLDS.FC_INVIABLE) return 'INVIABLE';
if (food_cost > THRESHOLDS.FC_CRÍTICO) return 'CRÍTICO';
// etc...
```

2. Add rounding:
```javascript
const food_cost_porcentaje = Math.round((coste_porcion / precio_venta) * 10000) / 100;
// Rounds to 2 decimal places
```

3. Test edge cases:
```javascript
test('should handle edge case: FC exactly at 30%', () => {
  const viability = manager.calculateViability('rec_edge', 3.00, 10.00);
  // Coste = 3, Precio = 10, FC = 30%
  assert.strictEqual(viability.food_cost_porcentaje, 30.0);
  assert.ok(['VIABLE', 'ACEPTABLE'].includes(viability.estado));
});
```

---

### Issue 12: Recommendations Not Actionable

**Symptoms:**
- Recommendations vague (e.g., "improve the recipe")
- No specific numbers
- Users can't act on recommendations

**Cause:**
- Using template text instead of calculated values
- Missing price/cost context
- Not calculating target prices

**Solution:**

Use specific, calculated recommendations:

```javascript
// WRONG - Not actionable
{ 
  tipo: 'subir_precio',
  accion: 'Increase the price'  // Too vague
}

// CORRECT - Specific and actionable
{
  tipo: 'subir_precio',
  accion: 'Subir de €12.00 a €15.40',  // Exact price
  razon: 'Conseguir 30% FC objetivo',
  impacto_estimado: '+€3.40 margen por plato'
}
```

Ensure recommendations always include:
- Current value
- Target value
- Specific action
- Expected impact in €

---

## Quick Diagnostic Checklist

```
□ Pipeline initialized with eventBus
□ Manager initialized with database path
□ Project directories exist
□ Database file created and readable
□ escandallo events being emitted
□ viabilidad.evaluada events fired
□ Recommendations saved in database
□ API endpoints implemented
□ Frontend components receiving data
□ Tests passing locally
□ No database locking issues
□ indexes present in database
□ No floating point precision issues
```

## Debugging Commands

```bash
# Check database exists and is readable
sqlite3 /projects/proj_123/viabilidad.db ".tables"

# Count records
sqlite3 /projects/proj_123/viabilidad.db "SELECT COUNT(*) FROM viabilidad_receta;"

# Verify calculations
sqlite3 /projects/proj_123/viabilidad.db \
  "SELECT id, margen_porcentaje, food_cost_porcentaje, 
          (margen_porcentaje + food_cost_porcentaje) as sum 
   FROM viabilidad_receta LIMIT 5;"

# Check recommendations
sqlite3 /projects/proj_123/viabilidad.db \
  "SELECT COUNT(*), COUNT(CASE WHEN implementada=0 THEN 1 END) as pending 
   FROM viabilidad_recomendacion;"

# Monitor WAL size
ls -lh /projects/proj_123/viabilidad.db*

# Kill locks
lsof | grep viabilidad.db  # Find process holding lock
kill -9 <pid>               # Force close
```

## Getting Help

If issue persists:

1. **Collect diagnostics:**
   - Full error message with stack trace
   - Database query that fails
   - Test output
   - Relevant code snippet

2. **Check logs:**
   ```bash
   tail -f /var/log/2enki/viabilidad.log
   ```

3. **Run full test suite:**
   ```bash
   node --test modules/viabilidad/__tests__/**/*.test.js
   ```

4. **Contact development team with:**
   - Issue description
   - Steps to reproduce
   - Diagnostic output
   - Relevant logs
