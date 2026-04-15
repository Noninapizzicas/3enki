# Viabilidad Receta Deployment Guide

## Overview

The Viabilidad Receta v2.0.0 module is a recipe-specific profitability analyzer. This guide covers setup, initialization, testing, and production deployment.

## Prerequisites

- Node.js 18+ (for node:test framework)
- SQLite3 available
- 2enki system running with:
  - Event bus (for MQTT-style events)
  - Module loader framework
  - Recipe module (for recipe names and basic info)
  - Escandallo module (for cost data)

## Directory Structure

```
modules/viabilidad/
├── core/
│   ├── viabilidad-manager.js        # Core calculations & persistence
│   ├── viability-filters.js         # SQL filtering logic
│   └── viability-ranker.js          # Ranking & scoring
├── pipeline/
│   └── viabilidad-calculation-pipeline.js  # Event-driven pipeline
├── __tests__/
│   ├── viabilidad-manager.test.js
│   ├── viability-filters.test.js
│   └── viability-ranker.test.js
├── frontend/src/lib/modules/viabilidad/
│   ├── ViabilidadBrowser.svelte    # Search interface
│   ├── ViabilidadCard.svelte       # Result cards
│   ├── ViabilidadDetail.svelte     # Detail view
│   ├── ViabilidadRecomendaciones.svelte
│   ├── ViabilidadPanel.svelte      # Main panel
│   └── index.ts                     # Module export
├── db/
│   └── schema-viabilidad-receta.sql # Database schema
├── API.md                           # API documentation
├── DEPLOYMENT.md                    # This file
└── TROUBLESHOOTING.md              # Troubleshooting guide
```

## Phase 1: Database Setup

### 1.1 Initialize Database

The database is automatically created on first use. To initialize manually:

```javascript
const ViabilidadManager = require('./core/viabilidad-manager');

const manager = new ViabilidadManager(dbPath, logger);
await manager.initialize();  // Creates schema
await manager.close();
```

### 1.2 Database Location

By default, each project gets a separate SQLite database:

```
/projects/{project_id}/viabilidad.db    # Per-project
/tmp/viabilidad-test.db                 # For testing
```

### 1.3 WAL Mode

The database uses WAL (Write-Ahead Logging) for better concurrency:

```sql
-- Enabled automatically in schema
PRAGMA journal_mode=WAL;
```

This creates additional files:
- `viabilidad.db` - Main database
- `viabilidad.db-wal` - Write-ahead log
- `viabilidad.db-shm` - Shared memory

## Phase 2: Module Registration

### 2.1 Register with Module Loader

```javascript
// In your module initialization code
const viabilidadModule = require('./modules/viabilidad');
const ViabilidadManager = require('./modules/viabilidad/core/viabilidad-manager');
const ViabilidadCalculationPipeline = require('./modules/viabilidad/pipeline/viabilidad-calculation-pipeline');

// Register manager
const manager = new ViabilidadManager(dbPath, logger);
await manager.initialize();

// Register pipeline
const pipeline = new ViabilidadCalculationPipeline(logger, eventBus, recipesModule);
pipeline.setManager(manager);
await pipeline.init();

// Register with module loader
moduleLoader.register('viabilidad', {
  manager,
  pipeline,
  schema: viabilidadModule.schema
});
```

### 2.2 Register Agent Tools

```javascript
// Register analyzer agent tools with tool registry
const agentToolRegistry = require('./ai-agent-framework/tool-registry');

agentToolRegistry.register('viabilidad.obtener', {
  handler: async (receta_id, projectId) => {
    return manager.getViability(projectId, receta_id);
  },
  schema: {
    type: 'object',
    properties: {
      receta_id: { type: 'string' },
      projectId: { type: 'string' }
    }
  }
});

agentToolRegistry.register('viabilidad.obtener_recomendaciones', {
  handler: async (receta_id, projectId) => {
    return manager.getRecommendations(projectId, receta_id);
  }
});

agentToolRegistry.register('viabilidad.obtener_historico', {
  handler: async (receta_id, projectId, limit = 5) => {
    return manager.getHistory(projectId, receta_id, limit);
  }
});
```

## Phase 3: Pipeline Integration

### 3.1 Subscribe to Events

The pipeline automatically subscribes to:

- `escandallo.calculado` - When cost calculation completes
- `receta.precio.actualizado` - When recipe price changes

No additional setup needed if EventBus is properly configured.

### 3.2 Published Events

Pipeline publishes:

- `receta.viabilidad.evaluada` - After viability calculation
- `receta.viabilidad.analysis.completed` - After AI analysis (analyzer agent)
- `receta.viabilidad.failed` - On error

### 3.3 Event Flow

```
escandallo.calculado
    ↓
[Viabilidad Pipeline]
    ├─→ Get recipe price
    ├─→ Calculate viability
    ├─→ Generate recommendations
    ├─→ Save to database
    └─→ Publish receta.viabilidad.evaluada
    ↓
[Analyzer Agent] (if configured)
    ├─→ Validate numbers
    ├─→ Detect risks
    ├─→ Analyze profitability
    ├─→ Generate expanded recommendations
    └─→ Publish receta.viabilidad.analysis.completed
```

## Phase 4: Testing

### 4.1 Run Unit Tests

```bash
# Run all tests
node --test modules/viabilidad/__tests__/**/*.test.js

# Run specific test file
node --test modules/viabilidad/__tests__/viabilidad-manager.test.js

# Run with verbose output
node --test --verbose modules/viabilidad/__tests__/viabilidad-manager.test.js
```

### 4.2 Test Coverage

Tests verify:
- ✅ Viability calculations (margin, food cost, estado)
- ✅ Recommendation generation by type and priority
- ✅ Database persistence and retrieval
- ✅ Filter building and query generation
- ✅ Ranking strategies and scoring
- ✅ Summary statistics
- ✅ Historical tracking

**Target Coverage:** > 80% of core logic

### 4.3 Integration Testing

```javascript
// Test full pipeline
test('Pipeline: escandallo → viability → analyzer', async () => {
  // 1. Create recipe cost
  eventBus.emit('escandallo.calculado', {
    receta_id: 'rec_test',
    projectId: 'proj_test',
    coste_porcion: 4.62
  });

  // Wait for pipeline completion
  await waitForEvent('receta.viabilidad.evaluada', 1000);

  // 2. Verify viability was saved
  const viability = await manager.getViability('proj_test', 'rec_test');
  assert.ok(viability);

  // 3. Verify recommendations were generated
  const recs = await manager.getRecommendations('proj_test', 'rec_test');
  assert.ok(recs.length > 0);
});
```

## Phase 5: API Endpoints

### 5.1 Implement REST API

```javascript
// Express example
const app = require('express')();

// Search/filter
app.get('/api/viabilidad/search', async (req, res) => {
  const criteria = {
    estado: req.query.estado?.split(','),
    margen_min: parseFloat(req.query.margen_min),
    margen_max: parseFloat(req.query.margen_max),
    food_cost_min: parseFloat(req.query.food_cost_min),
    food_cost_max: parseFloat(req.query.food_cost_max),
    tiene_riesgo: req.query.tiene_riesgo === 'true',
    proyecto_id: req.query.proyecto_id
  };

  const options = {
    sort: req.query.sort || 'relevance',
    limit: parseInt(req.query.limit) || 50,
    offset: parseInt(req.query.offset) || 0
  };

  // Call search implementation
  res.json(await search(criteria, options));
});

// Get detail
app.get('/api/viabilidad/:receta_id', async (req, res) => {
  const projectId = req.query.proyecto_id;
  const viability = await manager.getViability(projectId, req.params.receta_id);
  const recommendations = await manager.getRecommendations(projectId, req.params.receta_id);
  
  res.json({ viability, recommendations });
});
```

### 5.2 API Response Handling

All endpoints follow this pattern:

```json
{
  "success": true,
  "data": { /* response data */ },
  "timestamp": 1713090020000
}
```

Error responses:

```json
{
  "success": false,
  "error": "Error message",
  "statusCode": 400
}
```

## Phase 6: Frontend Integration

### 6.1 Register UI Module

```javascript
// In UI module loader
import { viabilidadModule } from '$lib/modules/viabilidad';

moduleRegistry.register('viabilidad', viabilidadModule);
```

### 6.2 Initialize Stores (if needed)

```javascript
// Create Svelte store for viabilidad state
export const viabilidadStore = writable({
  browser: null,      // ViabilidadBrowser state
  detail: null,       // ViabilidadDetail state
  loading: false,
  error: null
});
```

### 6.3 Hook UI to API

```javascript
// ViabilidadPanel.svelte
async function loadViabilidades(criteria) {
  loading = true;
  try {
    const response = await fetch('/api/viabilidad/search', {
      method: 'POST',
      body: JSON.stringify(criteria)
    });
    results = await response.json();
  } catch (err) {
    error = err.message;
  }
  loading = false;
}
```

## Phase 7: Production Deployment

### 7.1 Environment Configuration

```env
# Database
VIABILIDAD_DB_PATH=/data/viabilidad.db
VIABILIDAD_WAL_MODE=true

# Pipeline
VIABILIDAD_PIPELINE_ENABLED=true
VIABILIDAD_BATCH_SIZE=10

# Agent
VIABILIDAD_ANALYZER_ENABLED=true
VIABILIDAD_ANALYZER_TEMPERATURE=0.3
VIABILIDAD_ANALYZER_TIMEOUT=60000

# API
VIABILIDAD_API_PORT=3000
VIABILIDAD_API_PREFIX=/api/viabilidad
```

### 7.2 Database Backup

```bash
# Backup database
sqlite3 viabilidad.db ".backup '/backups/viabilidad-$(date +%Y%m%d).db'"

# Restore from backup
sqlite3 viabilidad.db ".restore '/backups/viabilidad-20260415.db'"
```

### 7.3 Monitoring

Monitor these metrics:

- **Pipeline latency**: Time from escandallo.calculado to receta.viabilidad.evaluada
  - Target: < 500ms median
  - Alert: > 2000ms

- **Calculation accuracy**: Verify margin and food cost calculations
  - Run validation query: `SELECT COUNT(*) WHERE margen_porcentaje != (margen_bruto / precio_venta * 100)`

- **Agent execution**: Time for analyzer agent to complete
  - Target: < 10s per recipe
  - Alert: > 30s

- **Database size**: Monitor WAL file growth
  - Alert: -wal file > 100MB (do checkpoint)

### 7.4 Health Check

```bash
# Simple health check
curl -X GET "/api/viabilidad/summary/proj_123"

# Should return 200 with summary stats
```

## Phase 8: Troubleshooting

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues.

## Rollback Procedure

If issues occur after deployment:

1. **Stop pipeline**
   ```javascript
   await pipeline.cleanup();
   ```

2. **Revert to previous code**
   ```bash
   git revert <commit-hash>
   npm install
   ```

3. **Restore database backup**
   ```bash
   sqlite3 viabilidad.db ".restore '/backups/viabilidad-previous.db'"
   ```

4. **Restart services**
   ```bash
   systemctl restart 2enki
   ```

## Performance Optimization

### 8.1 Database Indexing

Indexes are created automatically by schema. Key indexes:
- `idx_viabilidad_proyecto_estado` - For estado filtering
- `idx_viabilidad_evaluado_at` - For date-based queries
- `idx_recomendacion_implementada` - For pending recommendations

### 8.2 Query Optimization

```sql
-- Fast: Use indexes
SELECT * FROM viabilidad_receta 
WHERE proyecto_id = 'proj_1' AND estado = 'VIABLE'
ORDER BY evaluado_at DESC;

-- Slow: Full table scan
SELECT * FROM viabilidad_receta 
WHERE margen_porcentaje > 20;  -- No index on this column alone
```

### 8.3 Caching

Consider caching:
- Summary statistics (5 min TTL)
- Project-level aggregates (5 min TTL)
- Individual recipe viabilities (until recalculated)

## Capacity Planning

### 8.4 Storage

```
Database size ≈ 5KB per recipe per year
100 recipes × 1 year = ~500KB
1000 recipes × 1 year = ~5MB
10000 recipes × 1 year = ~50MB
```

### 8.5 Concurrency

SQLite supports:
- Multiple concurrent reads (unlimited)
- Single concurrent write (with WAL mode, limited queuing)

For high-concurrency use cases, consider PostgreSQL migration.

## Upgrade Path

### v2.0 → v3.0 (Future)

Planned improvements:
- PostgreSQL support for high concurrency
- API rate limiting
- Historical trend analysis
- ML-based improvement recommendations
- Multi-project analytics

## Support & Escalation

For issues:
1. Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
2. Review logs in `/var/log/2enki/viabilidad.log`
3. Run test suite to verify functionality
4. Contact development team with:
   - Error logs
   - Test results
   - Project ID and affected recipes
