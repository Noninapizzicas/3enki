# Escandallo Module - Troubleshooting Guide

## Common Issues

### 1. Escandallo not calculating automatically

**Symptoms**: Recipe updated but no escandallo.calculado event published

**Root Causes**:
- Pipeline not subscribed to recipe events
- EventBus not connected
- Module not initialized

**Solutions**:

Check 1: Is the module loaded?
```javascript
const isLoaded = await escandalloModule.onLoad(context);
if (!isLoaded) console.log('Module init failed');
```

Check 2: Is the pipeline initialized?
```javascript
const pipeline = new EscandalloCalculationPipeline(...);
await pipeline.init();
// Should log: "escandallo_pipeline.initialized"
```

Check 3: Are events being published?
```javascript
// Manual trigger for testing
eventBus.emit('receta.actualizada', {
  receta_id: 'test_recipe',
  projectId: 'proj_123',
  receta: { ... }
});
```

### 2. "Project not registered" error

**Symptoms**: 
```
Error: Project {projectId} not registered. Path unknown.
```

**Root Cause**: `onProjectActivated` event not received or project paths not set

**Solutions**:

Ensure project activation event is published:
```javascript
eventBus.emit('project.activated', {
  project_id: 'proj_123',
  base_path: '/path/to/project',
  metadata: { is_system: false }
});
```

Check stored paths:
```javascript
const paths = module.projectPaths.get('proj_123');
console.log(paths); // Should show { storagePath: '/path/to/project/storage' }
```

### 3. Prices not found (precios_no_encontrados)

**Symptoms**: Many ingredients in the `precios_no_encontrados` array

**Root Causes**:
- Network connectivity issues
- API endpoints down
- Ingredient names not matching Mercadona catalog

**Solutions**:

Check 1: Mercadona API availability
```bash
curl "https://tienda.mercadona.es/api/search/?q=tomate"
# Should return JSON with products
```

Check 2: Carrefour website accessibility
```bash
curl "https://www.carrefour.es/search?q=tomate"
# Should return HTML page
```

Check 3: Google Cloud Vision credentials (if using OCR)
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/credentials.json"
# Test with: gcloud vision detect-text /path/to/image.jpg
```

Check 4: Cache status
```javascript
const stats = await precioCache.getStats();
console.log(`Cache: ${stats.total} entries, ${stats.válido} valid, ${stats.expirado} expired`);
```

Check 5: Ingredient name matching
- Mercadona database may use different names
- Try fuzzy matching: "tomate" might be "tomate cherry", "tomate pera", etc.
- Check cache for similar ingredients:
```javascript
const average = await precioCache.getAverage('tomate cherry');
console.log(average); // Should return a number or null
```

### 4. "Database is locked" errors

**Symptoms**:
```
Error: database is locked
```

**Root Causes**:
- Concurrent write operations
- Long-running transaction not completing
- WAL file corruption

**Solutions**:

Check 1: Are there other connections?
```javascript
// Close unused manager instances
await manager.close();
this.managers.delete(projectId);
```

Check 2: Increase busy timeout
```javascript
// In escandallo-manager.js, constructor:
this.db.configure('busyTimeout', 5000); // Wait up to 5 seconds
```

Check 3: Check WAL file status
```bash
ls -la {project_path}/storage/escandallo.db*
# Should show: escandallo.db, escandallo.db-shm, escandallo.db-wal
```

Check 4: Reset WAL mode
```bash
sqlite3 {project_path}/storage/escandallo.db
sqlite> PRAGMA journal_mode=WAL;
sqlite> PRAGMA journal_mode;
# Should show: wal
```

### 5. High memory usage from price cache

**Symptoms**: Memory keeps increasing, especially with many projects

**Root Causes**:
- Cache not being cleaned up
- Expired entries not deleted
- Memory leak in price finder

**Solutions**:

Run cache cleanup immediately:
```javascript
const deleted = await pipeline.cleanupCache();
console.log(`Deleted ${deleted} expired entries`);
```

Schedule daily cleanup (if not already scheduled):
```javascript
setInterval(async () => {
  await pipeline.cleanupCache();
}, 24 * 60 * 60 * 1000); // Every 24 hours
```

Reduce cache validity period (edit precio-cache-manager.js):
```javascript
// From 24h to 6h:
const validoHasta = now + (6 * 60 * 60 * 1000);
```

### 6. Analyzer agent not running

**Symptoms**: `escandallo.calculado` published but no `escandallo.analysis.completed` event

**Root Causes**:
- Agent not enabled
- Tool definitions missing
- Agent event subscription not working

**Solutions**:

Check 1: Agent is enabled?
```javascript
const agents = await agentManager.list();
const analyzer = agents.find(a => a.id === 'escandallo-analyzer');
console.log(analyzer?.enabled); // Should be true
```

Check 2: Tools are registered?
```javascript
const tools = await toolManager.list();
const escandalloTools = tools.filter(t => t.name.startsWith('escandallo.'));
console.log(escandalloTools.length); // Should be >= 3
```

Check 3: Agent received the event?
```javascript
// Check logs for:
// "agent.event.received" with event_type "escandallo.calculado"
```

Check 4: Tool execution errors?
```javascript
// Check logs for:
// "tool.execution.failed" with tool name and error
```

### 7. Slow price discovery

**Symptoms**: First recipe calculation takes 10+ seconds

**Root Causes**:
- All fallback sources being tried (normal first time)
- Network latency to external APIs
- Google OCR waiting for Vision API response

**Solutions**:

This is expected behavior on first calculation. Subsequent calculations are faster due to caching.

To speed up:
1. Ensure Mercadona API is responding (usually < 500ms)
2. Add common ingredients to cache manually
3. Use batch processing for initial setup

### 8. Anomaly detection not working

**Symptoms**: Anomalies array is empty even for high-cost recipes

**Root Causes**:
- Analyzer agent not running (see #6)
- Precio mercado snapshot not captured
- Precio_venta not provided for viability check

**Solutions**:

Check 1: Snapshot is populated?
```javascript
const esc = await manager.getEscandallo(escandallo_id);
console.log(esc.precio_mercado_snapshot);
// Should have ingredient prices
```

Check 2: Run analyzer manually (for testing)
```javascript
// Manually call analyzer on specific escandallo
const params = {
  escandallo_id: 'esc_xxx',
  project_id: 'proj_123'
};
const result = await escandallo.toolObtenerEscandallo(params);
// Then feed to analyzer agent
```

Check 3: Verify thresholds in prompt
- Ingrediente >30% should trigger anomaly
- Food cost >45% should trigger anomaly
- Check `escandallo-analyzer-system.md` for thresholds

### 9. Search returning empty results

**Symptoms**: `escandallo.buscar` or `escandallo.buscar_y_ordenar` returns 0 results

**Root Causes**:
- No escandallos calculated yet
- Filters too restrictive
- Invalid project_id

**Solutions**:

Check 1: Are there any escandallos?
```javascript
const all = await manager.search({ limit: 1000 });
console.log(`Total escandallos: ${all.length}`);
```

Check 2: Try looser filters
```javascript
// Instead of coste_min: 5, coste_max: 6
// Try: coste_min: 3, coste_max: 10 (wider range)
```

Check 3: Project ID correct?
```javascript
const results = await manager.search({
  proyecto_id: 'proj_123',
  limit: 100
});
```

### 10. Alert detection not triggering

**Symptoms**: Price changed but no alert generated

**Root Causes**:
- Change < 10% (below detection threshold)
- No previous calculation to compare against
- Alert already marked as read

**Solutions**:

Check 1: Is threshold triggered?
```javascript
// Threshold is 10% change
const change = Math.abs((newPrice - oldPrice) / oldPrice) * 100;
console.log(change); // Must be > 10 to trigger
```

Check 2: Is there a previous version?
```javascript
const history = await manager.getHistory(receta_id, 2);
console.log(history.length); // Must be > 1 to compare
```

Check 3: Check unread alerts
```javascript
const unread = await manager.getUnreadAlerts();
console.log(unread); // Should show all unread alerts
```

## Performance Issues

### Slow database queries

**Diagnosis**:
```javascript
// Time a query
const start = Date.now();
const results = await manager.search({ limit: 100 });
console.log(`Query took ${Date.now() - start}ms`);
```

**Solutions**:
- Check indices: `PRAGMA index_list(escandallo);`
- Run VACUUM: `VACUUM;`
- Analyze: `ANALYZE;`
- Limit results size

### High CPU usage during ranking

**Symptoms**: `searchAndRank` uses 100% CPU on large result sets

**Solutions**:
```javascript
// Limit results before ranking
const results = await manager.search({ limit: 500 });
// Then rank (ranking is O(n log n))
```

## Logs and Debugging

### Enable debug logging

```javascript
logger.setLevel('debug');
// Now logs detailed execution traces
```

### Check specific logs

```bash
# Find all price discovery attempts
grep "precio_encontrado\|precio_no_encontrado" app.log

# Find all alerts
grep "alerta_detectada" app.log

# Find analyzer executions
grep "agent.event.received.*escandallo.calculado" app.log
```

### Generate debug report

```javascript
async function debugReport(projectId) {
  const manager = await this.getManager(projectId);
  
  console.log('=== Escandallo Debug Report ===');
  console.log(`Project: ${projectId}`);
  
  const escandalls = await manager.search({ limit: 100 });
  console.log(`Escandallos: ${escandalls.length}`);
  
  const stats = await precioCache.getStats();
  console.log(`Cache stats:`, stats);
  
  const unread = await manager.getUnreadAlerts();
  console.log(`Unread alerts: ${unread.length}`);
  
  console.log('=== End Report ===');
}
```

## Contact Support

If issue persists:
1. Gather debug logs (set level to 'debug')
2. Export database: `sqlite3 escandallo.db ".dump" > dump.sql`
3. Note error message and exact steps to reproduce
4. Check system.log for related errors from other modules
