# Guía de Troubleshooting - Recetas v2

## Índice Rápido

- [Problemas de Ingestion](#ingestion)
- [Problemas de Búsqueda](#búsqueda)
- [Problemas de Análisis](#análisis)
- [Problemas de BD](#base-de-datos)
- [Problemas de Performance](#performance)
- [Problemas de Frontend](#frontend)

---

## <a name="ingestion"></a>Problemas de Ingestion

### OCR falla: "Google Vision API not configured"

**Síntomas:** Error al procesar PDF/imágenes

**Diagnóstico:**
```bash
# Verificar env var
echo $GOOGLE_VISION_API_KEY

# Verificar credenciales
gcloud auth list
gcloud auth application-default print-access-token
```

**Solución:**
```bash
# 1. Setear credenciales
export GOOGLE_VISION_API_KEY="your-key"
export GOOGLE_CLOUD_PROJECT_ID="your-project"

# 2. O usar service account
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json

# 3. Reiniciar servicio
systemctl restart recetas
```

---

### OCR confidence too low (< 0.5)

**Síntomas:**
```json
{
  "error": "OCR confidence 0.23 < threshold 0.5"
}
```

**Causa:** Imagen de baja calidad, texto pequeño, idioma no detectado

**Solución:**

**Opción 1: Reducir threshold**
```bash
RECETAS_OCR_CONFIDENCE_THRESHOLD=0.3
```

**Opción 2: Mejorar imagen**
```javascript
// En pipeline, antes de OCR:
const enhanced = await sharp(image)
  .sharpen()
  .normalise()
  .modulate({ brightness: 1.1 })
  .toBuffer();
```

**Opción 3: Reintentar con configs diferentes**
```javascript
const configs = [
  { threshold: 0.5, languages: ['es', 'en'] },
  { threshold: 0.3, languages: ['es', 'en'] },
  { threshold: 0.2, languages: ['any'] }
];

for (const config of configs) {
  const result = await googleVision.analyzeImage(image, config);
  if (result.confidence >= config.threshold) return result;
}
```

---

### Timeout en pipeline: "OCR processing exceeded 120s"

**Síntomas:** PDF/imágenes grandes no procesan

**Causa:** Archivos > 100MB, muchas páginas, OCR lento

**Diagnóstico:**
```bash
# Tamaño del archivo
ls -lh /path/to/file.pdf

# Número de páginas (PDF)
pdfinfo /path/to/file.pdf | grep Pages

# Logs
tail -f logs/error.log | grep "timeout"
```

**Solución:**

**Opción 1: Aumentar timeout**
```javascript
// En recipe-ingestion-pipeline.js
timeout_ms: 300000 // 5 minutos
```

**Opción 2: Procesar por chunks**
```javascript
const pages = await pdf.getPages(); // [1, 2, 3, ...]

for (const page of pages) {
  const image = await pdf.renderPage(page);
  const ocr = await googleVision.analyze(image);
  results.push(ocr);
  // Commit periódicamente para liberar memoria
}
```

**Opción 3: Reducir tamaño**
```bash
# Comprimir PDF antes de subir
gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 \
   -dPDFSETTINGS=/ebook \
   -o compressed.pdf original.pdf
```

---

### Ingestion stuck: "Status iniciada por 2 horas"

**Síntomas:** Ingestion nunca termina, se queda en "downloading" o "ocr_processing"

**Diagnóstico:**
```bash
# Verificar estado en BD
sqlite3 data/projects/proj_123/recetas.db \
  "SELECT ingestion_id, status, updated_at FROM ingestions WHERE status != 'completada';"

# Verificar logs del agente
docker logs -f recetas-agent | grep "ing_abc123"

# Ver procesos OCR
ps aux | grep vision
ps aux | grep sharp
```

**Solución:**

**Opción 1: Force-kill y retry**
```bash
# Marcar como fallida
sqlite3 data/projects/proj_123/recetas.db \
  "UPDATE ingestions SET status='fallida', error='manual_timeout' WHERE ingestion_id='ing_abc123';"

# Reintentar
curl -X POST "http://localhost:3000/api/projects/proj_123/recetas/ingest" \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{"fuente":"pdf","archivo":"https://example.com/recipe.pdf"}'
```

**Opción 2: Aumentar memoria**
```bash
# Node.js
export NODE_OPTIONS="--max-old-space-size=4096"
npm start
```

**Opción 3: Escalar workers**
```javascript
// En module.json
"ingestion_workers": 4 // aumentar de 1 a 4
```

---

## <a name="búsqueda"></a>Problemas de Búsqueda

### "No results found" pero la receta existe

**Síntomas:** Search con criterios específicos retorna 0 resultados

**Diagnóstico:**
```bash
# 1. Verificar que receta existe
curl http://localhost:3000/api/projects/proj_123/recetas/rec_pasta_xyz \
  -H "Authorization: Bearer token"

# 2. Verificar en índice
sqlite3 data/projects/proj_123/recetas.db \
  "SELECT nombre, viabilidad FROM receta_search_index WHERE id='rec_pasta_xyz';"

# 3. Test criteria manualmente
sqlite3 data/projects/proj_123/recetas.db \
  "SELECT COUNT(*) FROM receta_search_index WHERE proyecto_id='proj_123' AND nombre_lower LIKE '%pasta%';"
```

**Causa común:** Receta no indexada (falló indexing en curator)

**Solución:**
```bash
# Reindexar
curl -X POST "http://localhost:3000/api/projects/proj_123/recetas/reindex" \
  -H "Authorization: Bearer token"

# O manualmente
const manager = new SQLiteManager('proj_123', basePath, logger);
await manager.updateSearchIndex('rec_pasta_xyz', receta);
```

---

### Search muy lento (> 5 segundos)

**Síntomas:** POST /search toma mucho tiempo con muchos criterios

**Diagnóstico:**
```sql
-- Ver plan de query
EXPLAIN QUERY PLAN 
SELECT * FROM receta_search_index 
WHERE proyecto_id = 'proj_123' 
  AND nombre_lower LIKE '%pasta%'
  AND viabilidad = 'alta'
  AND dificultad_max >= 5;

-- Analizar tabla
ANALYZE;

-- Ver estadísticas
SELECT * FROM sqlite_stat1 WHERE tbl='receta_search_index';
```

**Causa:** Índices faltantes o no optimizados

**Solución:**

**Opción 1: Reconstruir índices**
```sql
-- En schema.sql, estos ya existen, pero recrear si falta:
CREATE INDEX idx_receta_search_proyecto_nombre 
  ON receta_search_index(proyecto_id, nombre_lower);

CREATE INDEX idx_receta_search_proyecto_viabilidad 
  ON receta_search_index(proyecto_id, viabilidad);

ANALYZE;
```

**Opción 2: Limitar criteria complexity**
```javascript
// Frontend: máximo 3 criterios activos por búsqueda
if (criteriaCount > 3) {
  console.warn('Too many search criteria, performance may suffer');
}
```

**Opción 3: Paginar resultados**
```javascript
// En lugar de limit=1000, usar limit=50 + offset
const page1 = await search({limit: 50, offset: 0});
const page2 = await search({limit: 50, offset: 50});
```

---

### Ranking score incorrecto

**Síntomas:** Resultado con nombre exacto no está primero

**Diagnóstico:**
```javascript
// En SearchRanker test
const results = ranker.rankResults([
  { id: 1, nombre: 'Pasta Carbonara', ... },
  { id: 2, nombre: 'Pasta Fresca', ... }
], { nombre: 'Pasta Carbonara' });

console.log(results.map(r => ({id: r.id, score: r._score})));
// Espera: [{id:1, score:40}, {id:2, score:...}]
```

**Solución:**

**Opción 1: Debug en componente**
```javascript
// RecipeSearch.svelte
const ranked = ranker.rankResults(results, criteria);
console.log('Ranked results:', ranked.map(r => ({
  nombre: r.nombre,
  _score: r._score,
  scoreBreakdown: {
    nombre: ranker._scoreNombreMatch(r.nombre, criteria.nombre),
    ingredientes: ranker._scoreIngredientes(r, criteria.ingredientes)
  }
})));
```

**Opción 2: Ajustar pesos de scoring**
```javascript
// SearchRanker._calculateScore
// Cambiar weights si es necesario:
score += this._scoreNombreMatch(...) * 1.5; // Aumentar peso nombre
score += this._scoreIngredientes(...) * 0.8; // Bajar peso ingredientes
```

---

## <a name="análisis"></a>Problemas de Análisis

### Analyzer falla: "Ingredient not found in catalog"

**Síntomas:** Agente Analyzer no puede calcular costes

**Diagnóstico:**
```bash
# Verificar ingredientes en catálogo
sqlite3 data/projects/proj_123/recetas.db \
  "SELECT COUNT(*) FROM ingredientes WHERE proyecto_id='proj_123';"

# Buscar ingrediente específico
sqlite3 data/projects/proj_123/recetas.db \
  "SELECT * FROM ingredientes WHERE nombre LIKE '%pasta%';"
```

**Causa:** Ingrediente no existe en catálogo

**Solución:**

**Opción 1: Agregar al catálogo**
```bash
curl -X POST "http://localhost:3000/api/projects/proj_123/recetas/ingredientes" \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Pasta Fresca",
    "categoria": "granos",
    "precio_mercado_kg": 2.50,
    "alerge nos": ["gluten"]
  }'
```

**Opción 2: Usar fuzzy matching**
```javascript
// En analyzer, si no encontrado exactamente:
const candidates = catalog.filter(ing =>
  ing.nombre.toLowerCase().includes(search.toLowerCase())
);

if (candidates.length === 1) {
  return candidates[0]; // Usar la coincidencia más probable
}
```

---

### Viabilidad incorrecta (marcada como "baja" siendo viable)

**Síntomas:** Receta viable guardada como "borrador"

**Diagnóstico:**
```bash
# Verificar análisis en receta
curl http://localhost:3000/api/projects/proj_123/recetas/rec_pasta_xyz \
  -H "Authorization: Bearer token" | jq '.analisis | {viabilidad, costes, flags}'
```

**Causa:** Múltiples flags de riesgo hacen viabilidad='baja'

**Solución en curator:**
```javascript
// En recipe-curator system prompt
// Threshold de viabilidad:
if (viabilidad === 'baja' && flags.length > 3) {
  estado = 'borrador'; // Requiere validación manual
} else if (viabilidad === 'baja' && flags.length <= 2) {
  estado = 'activa'; // Aceptar aunque baja, pocos flags
}
```

---

## <a name="base-de-datos"></a>Problemas de BD

### "Database is locked" durante writes

**Síntomas:** Errores frequent de "database is locked"

**Diagnóstico:**
```bash
# Ver procesos abiertos
lsof | grep "recetas.db"

# Ver transactions activas
sqlite3 data/projects/proj_123/recetas.db \
  "PRAGMA transaction_list;"
```

**Causa:** Múltiples procesos escribiendo simultáneamente

**Solución:**

**Opción 1: WAL mode (ya activado, pero verificar)**
```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
```

**Opción 2: Aumentar timeout**
```javascript
// En sqlite-manager.js
db.configure('busyTimeout', 30000); // 30s
```

**Opción 3: Usar queue para writes**
```javascript
const PQueue = require('p-queue');
const writeQueue = new PQueue({ concurrency: 1 });

// Para cada write
await writeQueue.add(() => manager.createReceta(...));
await writeQueue.add(() => manager.updateReceta(...));
```

---

### BD corrupta: "Error: database disk image is malformed"

**Síntomas:** Errores en queries aleatorios, DB inutilizable

**Diagnóstico:**
```bash
# Verificar integridad
sqlite3 data/projects/proj_123/recetas.db "PRAGMA integrity_check;"

# Resultado esperado: "ok"
# Si no: base de datos corrupta
```

**Solución:**

**Opción 1: Restaurar desde backup**
```bash
# Verificar último backup
ls -lh /backups/recetas_*.tar.gz

# Restaurar
tar -xzf /backups/recetas_proj_123_20260413.tar.gz -C /
```

**Opción 2: Intentar repair**
```sql
-- Exportar datos intactos
sqlite3 corrupted.db ".dump" | sqlite3 recovered.db

-- Verificar
sqlite3 recovered.db "PRAGMA integrity_check;"
```

**Opción 3: Si imposible recuperar**
```bash
# Crear nueva BD vacía
rm data/projects/proj_123/recetas.db
# Re-ingestar recetas

# O restaurar punto anterior en tiempo
```

---

### BD crece indefinidamente: "50GB pero solo 100 recetas"

**Síntomas:** Archivo .db-wal muy grande

**Causa:** WAL (Write-Ahead Logging) no hace checkpoint

**Solución:**

**Opción 1: Force checkpoint**
```sql
PRAGMA wal_autocheckpoint = 1000; -- Default
PRAGMA wal_autocheckpoint = 100; -- Más agresivo
PRAGMA wal_checkpoint(TRUNCATE);
```

**Opción 2: Ver tamaño de archivos**
```bash
ls -lh data/projects/proj_123/recetas.db*

# Típico:
# recetas.db = 1MB (main)
# recetas.db-wal = 10MB (write-ahead log)
# recetas.db-shm = 32KB (shared memory)
```

**Opción 3: Vacuum periódicamente**
```bash
# Trigger nightly
0 3 * * * sqlite3 /app/data/projects/proj_123/recetas.db "VACUUM;"
```

---

## <a name="performance"></a>Problemas de Performance

### API endpoint lento: "p95 latency > 1s"

**Diagnóstico:**
```javascript
// Agregar timing en logs
const start = Date.now();
const result = await search(criteria);
const duration = Date.now() - start;

logger.info('search.completed', {
  criteria_count: Object.keys(criteria).length,
  result_count: result.length,
  duration_ms: duration
});
```

**Bottlenecks comunes:**

1. **OCR muy lento**
   ```bash
   # Verificar Google Vision quotas
   gcloud quota describe google.vision --service-name=vision.googleapis.com
   ```

2. **Search sin índices**
   - Ver sección "Search muy lento"

3. **Memoria agotada**
   ```bash
   free -h
   ps aux | grep node
   # Si > 2GB, problema
   ```

---

### Memory leak: "proceso crece a 4GB en 1 hora"

**Diagnóstico:**
```bash
# Heap snapshot
node --inspect app.js
# Ir a chrome://inspect

# O usar clinic.js
npm install clinic
clinic doctor --collect-only -- npm start
```

**Soluciones:**

1. **Limpiar caches periódicamente**
   ```javascript
   // Si hay caches en memoria
   setInterval(() => {
     cache.clear();
   }, 3600000); // Cada hora
   ```

2. **Usar streaming para archivos grandes**
   ```javascript
   // Malo:
   const pdf = await fs.readFile(huge_file);
   
   // Bueno:
   const stream = fs.createReadStream(huge_file);
   stream.on('data', chunk => processChunk(chunk));
   ```

---

## <a name="frontend"></a>Problemas de Frontend

### RecipeVersionHistory no carga

**Síntomas:** Componente muestra loading infinito

**Diagnóstico:**
```javascript
// Console
console.log($versioningStore); // Check store state
// Buscar errores en Network tab (F12 DevTools)
```

**Causa:** API no retorna, token inválido, proyecto no existe

**Solución:**

**Opción 1: Verificar API**
```bash
curl http://localhost:3000/api/projects/proj_123/recetas/rec_xyz/history \
  -H "Authorization: Bearer token"
```

**Opción 2: Verificar token**
```javascript
// En .env.local
VITE_API_TOKEN=your-token

// Verificar en Network request headers
```

**Opción 3: Debugger Svelte**
```javascript
// En RecipeVersionHistory.svelte
$: console.log('versioningStore:', $versioningStore);
$: console.log('versionTimeline:', $versionTimeline);
```

---

### Comparador no muestra diffs

**Síntomas:** Botón "Comparar" clickeable pero no muestra diferencias

**Diagnóstico:**
```javascript
// Console
console.log($selectedVersionsDiff);
// Si null, no se cargaron versiones correctamente
```

**Causa:** Versiones no tienen campo `cambios`

**Solución:**

**Opción 1: Verificar backend**
```bash
# GET /history debe retornar cambios en cada versión
curl http://localhost:3000/api/projects/proj_123/recetas/rec_xyz/history

# Buscar en respuesta: "cambios": [...]
```

**Opción 2: Componente fallback**
```svelte
{#if !$selectedVersionsDiff}
  <p>Error: no se pudieron cargar los diffs</p>
{/if}
```

---

## Checklist de Diagnóstico Rápido

1. ✓ Verificar logs: `tail -f logs/error.log`
2. ✓ Health endpoint: `curl http://localhost:3000/health`
3. ✓ BD integridad: `sqlite3 ... "PRAGMA integrity_check;"`
4. ✓ API accesible: `curl -H "Authorization: Bearer token" http://localhost:3000/...`
5. ✓ Memoria: `free -h` y `ps aux | grep node`
6. ✓ Índices: `ANALYZE; PRAGMA table_info(...);`
7. ✓ Token válido: verificar en Authorization header
8. ✓ Datos existen: verificar en BD antes de buscar

---

## Contacto & Escalación

Si el problema persiste después de revisar esta guía:

1. Recopilar **logs completos**
   ```bash
   tail -n 1000 logs/error.log > diagnostic.log
   ```

2. Recopilar **estado de BD**
   ```bash
   sqlite3 data/projects/proj_123/recetas.db ".dump" > db_dump.sql
   ```

3. Recopilar **configuración**
   ```bash
   env | grep RECETAS > env_vars.txt
   ```

4. Abrir issue en GitHub con archivos zip del diagnóstico
