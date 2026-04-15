# Viabilidad Receta v2.0.0 - Plan de Transformación

## Visión
Transformar el módulo `viabilidad` (análisis de negocio global) en **Viabilidad por Receta** (evaluación individual de cada plato).

## Ciclo Completo
```
1. receta.creada
   ↓
2. escandallo.calculado (tenemos coste_porcion)
   ↓
3. receta.viabilidad.evaluada (agent analiza rentabilidad)
   ↓
4. Sistema COMPLETO: Receta → Coste → Viabilidad → Negocio
```

---

## Fase 1: Database & Manager (1 día)
**Objetivo**: Persistencia de viabilidad por receta con SQLite

### Archivos a crear:
- `modules/viabilidad/db/schema-viabilidad-receta.sql`
- `modules/viabilidad/core/viabilidad-manager.js`

### Base de datos:
```sql
-- viabilidad_receta: Una por cada receta
CREATE TABLE viabilidad_receta (
  id TEXT PRIMARY KEY,
  receta_id TEXT NOT NULL,
  proyecto_id TEXT NOT NULL,
  
  -- Inputs
  escandallo_id TEXT,
  coste_porcion REAL NOT NULL,
  precio_venta REAL,
  
  -- Cálculos
  margen_bruto REAL,
  food_cost_porcentaje REAL,
  markup REAL,
  
  -- Estado
  estado TEXT,  -- VIABLE, ACEPTABLE, CRÍTICO, INVIABLE
  
  calculado_at INTEGER,
  created_at INTEGER,
  updated_at INTEGER,
  
  UNIQUE(proyecto_id, receta_id)
);

-- viabilidad_recomendacion: Acciones sugeridas
CREATE TABLE viabilidad_recomendacion (
  id TEXT PRIMARY KEY,
  receta_id TEXT NOT NULL,
  proyecto_id TEXT NOT NULL,
  
  tipo TEXT,  -- 'subir_precio', 'bajar_coste', 'eliminar'
  texto TEXT,
  prioridad TEXT,  -- CRÍTICA, ADVERTENCIA, INFO
  
  detectada_at INTEGER,
  created_at INTEGER
);
```

### Manager Features:
- `calculateViability(recetaId, coste_porcion, precio_venta)`
- `saveViability(recetaId, viabilidad)`
- `getViability(recetaId)` / `getViabilityByProject(projectId)`
- `getRecommendations(recetaId)`
- `getRecetasByEstado(estado)` - Filter viable/no viable

---

## Fase 2: Pipeline (1 día)
**Objetivo**: Cálculo automático cuando escandallo se genera

### Archivo a crear:
- `modules/viabilidad/pipeline/viabilidad-calculation-pipeline.js`

### Flujo:
```
escandallo.calculado 
  → [Pipeline] 
    → Get escandallo data (coste_porcion)
    → Get receta data (precio_venta si existe)
    → Calculate viability
    → Save to DB
    → Detectar recomendaciones
    → Publish receta.viabilidad.evaluada
```

### Event Handlers:
- `onEscandalloCalculado` - Trigger automático
- `onRecetaPrecioActualizado` - Recalcular si cambia precio

---

## Fase 3: Agent (1 día)
**Objetivo**: Análisis inteligente de viabilidad

### Archivo a crear:
- `modules/ai-agent-framework/agents/viabilidad-receta-analyzer.json`
- `modules/ai-agent-framework/prompts/viabilidad-receta-analyzer-system.md`

### Agent Responsibilities:
1. **Validar Viabilidad** - ¿Los números tienen sentido?
2. **Detectar Riesgos** - ¿Qué puede salir mal?
3. **Generar Recomendaciones**:
   - Si food_cost > 35% → "Subir precio a €X"
   - Si margen < 20% → "Reducir coste de ingrediente Y"
   - Si inviable → "Eliminar del menú o reformular"
4. **Alertas Automáticas** - CRÍTICA, ADVERTENCIA, INFO
5. **Insights de Negocio** - "Este plato es tu mejor margen"

### Tools (3):
- `viabilidad.obtener` - Get viability data
- `viabilidad.obtener_recomendaciones` - Get suggestions
- `viabilidad.obtener_historico` - See evolution

---

## Fase 4: Search & Ranker (1 día)
**Objetivo**: Filtrar y ordenar recetas por viabilidad

### Archivos a crear:
- `modules/viabilidad/core/viability-filters.js`
- `modules/viabilidad/core/viability-ranker.js`

### Filters:
- Por estado (VIABLE, ACEPTABLE, CRÍTICO, INVIABLE)
- Por rango de margen (20-40%, >40%, <20%)
- Por food cost (< 30%, 30-35%, > 35%)
- Por precio (min, max)

### Ranker:
- Por rentabilidad (margen bruto)
- Por riesgo (estado + recomendaciones)
- Por impacto (coste_porcion)
- Por mejora potencial (qué cambio daría mayor ganancia)

### Tools (2):
- `viabilidad.buscar` - Filter recipes
- `viabilidad.buscar_y_ordenar` - Ranked search

---

## Fase 5: Frontend (1 día)
**Objetivo**: UI para ver viabilidad de recetas

### Componentes (4):
1. **ViabilidadCard** - Compact status (verde/rojo/amarillo)
2. **ViabilidadDetail** - Full analysis (márgenes, food cost, histórico)
3. **ViabilidadRecomendaciones** - Sugerencias accionables
4. **ViabilidadBrowser** - Lista filtrada (viable/riesgo/no viable)

### Ubicación:
- `frontend/src/lib/modules/viabilidad/`

---

## Fase 6: Tests & Docs (1 día)
**Objetivo**: Calidad y documentación

### Documentación:
- `modules/viabilidad/API.md` - Tool reference
- `modules/viabilidad/DEPLOYMENT.md` - Setup guide
- `modules/viabilidad/TROUBLESHOOTING.md` - Common issues

### Tests:
- `__tests__/viability-manager.test.js`
- `__tests__/viability-filters.test.js`
- `__tests__/viability-ranker.test.js`

---

## Cambios al Módulo Existente

### ❌ Se elimina:
- Lógica de escenarios globales
- Análisis de negocio completo
- Punto de equilibrio del negocio
- Proyecciones multi-mes

### ✅ Se mantiene/refactoriza:
- Cálculos base (margen, food cost)
- Helpers (round, config management)
- Estructura de persistencia en storage/

### ✨ Se añade:
- Database manager (viabilidad-manager.js)
- Event pipeline (viabilidad-calculation-pipeline.js)
- AI analyzer agent
- Search + Ranking
- Frontend components
- Comprehensive tests & docs

---

## Timeline
- **Día 1**: Fases 1-2 (DB + Pipeline)
- **Día 2**: Fases 3-4 (Agent + Search)
- **Día 3**: Fases 5-6 (UI + Tests)

**Total: 3 días** (Escandallo fue 5 días porque fue el primero y necesitaba más refinamiento)

---

## Métricas de Éxito

✅ Cada receta tiene viabilidad automática
✅ Estado: VIABLE/ACEPTABLE/CRÍTICO/INVIABLE
✅ Recomendaciones accionables generadas
✅ UI muestra estado de viabilidad
✅ Historial de cambios en viabilidad
✅ Búsqueda: "Muestra mis recetas no viables"

---

## Relación con Otros Módulos

```
Recetas ────→ Escandallo ────→ Viabilidad ────→ Análisis Negocio
(Definición)  (Coste real)   (¿Rentable?)      (Panorama completo)
```

La Viabilidad **consu me** datos de Escandallo y **alimenta** análisis de negocio global.
