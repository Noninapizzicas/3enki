# Escandallo Module - Deployment Guide

## Installation

### Prerequisites

- Node.js 14+ with npm or yarn
- SQLite3 (usually bundled with npm sqlite3 package)
- EventBus/MQTT system for event publishing
- Google Cloud Vision API (optional, for OCR-based price discovery)

### Step 1: Module Registration

Add to your module loader configuration:

```javascript
{
  id: 'escandallo',
  name: 'Escandallo',
  path: './modules/escandallo',
  enabled: true,
  requires: ['recetas', 'ai-agent-framework']
}
```

### Step 2: Initialize Dependencies

The module automatically initializes these on load:

```javascript
// In your application startup:
const escandalloModule = new EscandalloModule();

await escandalloModule.onLoad({
  eventBus: yourEventBus,
  logger: yourLogger,
  metrics: yourMetricsCollector,
  moduleLoader: yourModuleLoader
});
```

### Step 3: Register Tools

Tools are auto-registered in `moduleLoader.toolsRegistry` during `onLoad`:

- `escandallo.obtener` - Get full calculation
- `escandallo.obtener_historico` - Get historical data
- `escandallo.obtener_alertas` - Get alerts
- `escandallo.buscar` - Simple search
- `escandallo.buscar_y_ordenar` - Ranked search

### Step 4: Initialize Analyzer Agent

The escandallo-analyzer agent should be automatically loaded from:
```
modules/ai-agent-framework/agents/escandallo-analyzer.json
```

Verify it's enabled in your agent framework configuration.

### Step 5: Start Event Pipeline

The pipeline subscribes to `receta.actualizada` and `receta.creada` events:

```javascript
// Automatically subscribed on module load
eventBus.on('receta.actualizada', pipeline.onRecetaActualizada);
eventBus.on('receta.creada', pipeline.onRecetaCreada);
```

## Configuration

### Database Location

By default, SQLite databases are created at:
```
{project_path}/storage/escandallo.db
```

The path is resolved when a project is activated:
```javascript
// Triggered by project.activated event
onProjectActivated({ project_id, base_path })
```

### Price Sources Configuration

All price sources are configured in `PrecioFinder`:

#### Mercadona API
- **URL**: `https://tienda.mercadona.es/api/search/`
- **Auth**: None required
- **Retry**: 3 attempts [1s, 3s, 5s]

#### Carrefour Scraping
- **URL**: `https://www.carrefour.es/search?q={ingredient}`
- **Method**: HTML cheerio parsing
- **Selectors**: `[data-price]`, `.price`, `.product-price`
- **Retry**: 3 attempts [1s, 3s, 5s]

#### Google Images OCR
- **API**: Google Cloud Vision (requires credentials)
- **Method**: TEXT_DETECTION on product images
- **Retry**: 3 attempts [1s, 3s, 5s]

#### Historical Average
- **Source**: SQLite cache table
- **Filters**: confidence IN ('alta', 'media')
- **Always available** (fallback)

### Cache Configuration

Edit `PrecioCacheManager`:

```javascript
// Cache validity (line 62)
const validoHasta = now + (24 * 60 * 60 * 1000); // 24 hours

// Change to different duration:
const validoHasta = now + (7 * 24 * 60 * 60 * 1000); // 7 days
```

### Analyzer Agent Temperature

Edit `escandallo-analyzer.json`:

```json
{
  "temperature": 0.3,  // Change for more/less deterministic analysis
  "max_tokens": 2000,
  "timeout_ms": 60000
}
```

Lower temperature = more deterministic (better for cost analysis)
Higher temperature = more creative (not recommended for this use case)

## Database Schema

### Creating Schema

Automatically applied on first manager initialization:

```javascript
await manager.initialize();
// Runs _applySchema() which executes schema-escandallo.sql
```

### Manual Schema Application

```bash
sqlite3 project_path/storage/escandallo.db < modules/escandallo/db/schema-escandallo.sql
```

### Schema Tables

1. **escandallo**: 175 bytes per record (no unlimited text fields)
2. **escandallo_alerts**: 120 bytes per record
3. **ingrediente_precios_cache**: 95 bytes per record
4. **v_escandallo_con_alerta**: View, no storage

## Monitoring

### Logging

All operations logged with context:

```javascript
logger.info('escandallo_pipeline.execute_completed', {
  receta_id: recetaId,
  duration_ms: 1234,
  coste_total: 18.50,
  coste_porcion: 4.62
});
```

### Metrics

Emitted to your metrics collector:

```javascript
metrics.increment('escandallo.receta.calculated');
metrics.increment('escandallo.pipeline.cache_hit');
metrics.increment('escandallo.price_found.mercadona');
metrics.increment('escandallo.price_found.carrefour');
metrics.increment('escandallo.price_found.google_ocr');
metrics.increment('escandallo.price_found.historical');
```

### Health Checks

Check module status:

```javascript
// Database connectivity
await manager.getEscandallo(escandallo_id);

// Price finder
const precio = await precioFinder.findPrecio('tomate');

// Cache stats
const stats = await precioCache.getStats();
console.log(`Cache: ${stats.total} entries, ${stats.válido} valid`);
```

## Maintenance

### Cache Cleanup

Run daily via cron job:

```javascript
// Daily cleanup (recommend: 02:00 AM)
cronJob('0 2 * * *', async () => {
  const deleted = await pipeline.cleanupCache();
  logger.info('escandallo.cache_cleanup', { deleted });
});
```

### Database Optimization

Rebuild indices periodically:

```bash
sqlite3 project_path/storage/escandallo.db "VACUUM; ANALYZE;"
```

### Backup Strategy

Backup these files daily:
- `{project_path}/storage/escandallo.db`
- `{project_path}/storage/escandallo.db-shm` (WAL journal)
- `{project_path}/storage/escandallo.db-wal` (WAL journal)

## Troubleshooting

### Issue: Prices not found

**Symptoms**: `precios_no_encontrados` array has many entries

**Solution**:
1. Check internet connectivity for Mercadona/Carrefour APIs
2. Verify Google Cloud Vision credentials if using OCR
3. Check cache with: `await precioCache.getStats()`
4. Clear cache entries older than 7 days

### Issue: High latency on first calculation

**Symptoms**: First recipe takes 5+ seconds to calculate

**Solution**:
- This is normal: price discovery can take 3-5 seconds
- Subsequent recipes are faster due to caching
- Use `rankBy: "recent"` to prioritize recent calculations

### Issue: Database locked errors

**Symptoms**: "database is locked" errors in logs

**Solution**:
1. Check for long-running transactions
2. Enable WAL mode (default in schema)
3. Increase timeout: `database.configure('busyTimeout', 5000);`
4. Reduce concurrent access

## Performance Tuning

### Query Optimization

Use indices for common filters:

```sql
-- Already created:
CREATE INDEX idx_escandallo_proyecto ON escandallo(proyecto_id);
CREATE INDEX idx_escandallo_fecha ON escandallo(proyecto_id, calculado_at DESC);
CREATE INDEX idx_precio_cache_valido ON ingrediente_precios_cache(valido_hasta);

-- Add custom indices if needed:
CREATE INDEX idx_escandallo_coste ON escandallo(proyecto_id, coste_porcion);
CREATE INDEX idx_alerts_proyecto ON escandallo_alerts(proyecto_id, leida);
```

### Price Finding Performance

Expected times per source (sequential fallback):
- Mercadona: 200-500ms
- Carrefour: 1-2s
- Google OCR: 2-3s
- Historical: <10ms (always instant)

To parallelize (advanced):
```javascript
// Not recommended for reliability, but possible:
const prices = await Promise.race([
  mercadona(),
  carrefour(),
  googleOCR()
]);
```

## Scaling Considerations

### Single Project
- Supports 10,000+ escandallos per project
- No optimization needed

### Multiple Projects
- Keep separate SQLite files per project
- Each manager instance manages one DB
- Use `moduleLoader.moduleLoader` for caching between projects

### High Volume
- For 100+ projects, consider:
  - PostgreSQL instead of SQLite (shared storage)
  - Redis cache for prices (shared across projects)
  - Async batch processing for initial calculations

## Integration with Recetas

The escandallo module depends on Recetas:

```javascript
// Module.requires includes 'recetas'
// Events used: receta.creada, receta.actualizada
// Data read: ingredientes, cantidades, unidades

// The pipeline:
receta.actualizada → escandallo calculation → escandallo.analysis.completed
```

## Integration with AI Agent Framework

The analyzer agent framework handles:
- Loading escandallo-analyzer.json configuration
- Subscribing to escandallo.calculado events
- Calling escandallo.obtener, obtener_historico, obtener_alertas tools
- Publishing escandallo.analysis.completed events

No manual integration needed; automatic on framework load.

## Rollback Procedure

To uninstall the module:

1. Stop event subscriptions
2. Close all manager DB connections
3. Optionally backup: `cp {project_path}/storage/escandallo.db backup.db`
4. Remove module from configuration
5. Restart application

The escandallo tables will remain in the database but won't be accessed.

## Support

For issues, check:
1. TROUBLESHOOTING.md (common problems)
2. API.md (tool reference)
3. Module logs with debug level: `logger.setLevel('debug')`
