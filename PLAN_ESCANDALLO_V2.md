# Plan de Análisis - Escandallo v2 Refactoring

## Estado Actual (v1.0.0)

**Estructura:**
- Cache en memoria (Map)
- Lee datos de recetas.json + ingredientes.json
- 7 tools: receta, global, comparar_precios, simular_precio, ingrediente_impacto, optimizar, ficha_tecnica
- Event listeners: project.{activated|deactivated}, receta.{creada|actualizada}, ingrediente.precio.actualizado

**Limitaciones:**
- Sin persistencia estructurada
- Sin historial de cambios
- Sin ranking de costos
- Sin análisis predictivo
- Sin índices para búsqueda rápida
- Sin versionado

**Casos de Uso:**
1. Chef calcula escandallo de receta → define precio venta
2. Manager ve todos los costos globales → optimiza compras
3. Analista compara precios mercado vs compra → negocia proveedores
4. Sistema alerta si margen cae bajo umbral

---

## Refactorización v2 - Fórmula Recetas

Aplicamos 6 fases idénticas:

### **FASE 1: Persistencia SQLite**

**Nuevas Tablas:**
```
escandallo (main)
├── id, receta_id, proyecto_id, fecha, version
├── coste_total, coste_porcion, precio_venta
├── margen, food_cost, estado

escandallo_versiones (audit trail)
├── version, snapshot, cambios, cambio_por, cambio_at

escandallo_items (desglose por ingrediente)
├── ingrediente_id, cantidad, unidad, precio_unitario
├── coste_item, porcentaje, cambio_at

escandallo_simulaciones (histórico de simulaciones)
├── escandallo_id, tipo_simulacion, precios_probados
├── resultados_json, guardado_at

escandallo_alertas (alertas generadas)
├── escandallo_id, tipo_alerta, valor_anterior, valor_nuevo
├── umbral, acción, leida_at

escandallo_search_index (búsqueda rápida)
├── receta_id, margen_min/max, food_cost, viabilidad_precio
├── ingredientes_caros, timestamp
```

**SQLiteManager:**
- init(), createEscandallo(), updateEscandallo()
- getVersionHistory(), revertVersion()
- searchEscandallo() con 30+ criterios
- calculateMargin(), calculateFoodCost()
- detectAlerts()

**Archivos:**
- `db/schema-escandallo.sql` (DDL + indices)
- `core/escandallo-manager.js` (~450 LOC)

---

### **FASE 2: Pipeline Análisis**

**Event Flow:**
```
receta.actualizada
    ↓
recalcular_escandallo_pipeline
├── Step 1: Load receta + ingredientes (precios actuales)
├── Step 2: Calculate costes (total, porción)
├── Step 3: Simulate food cost (si hay precio_venta)
├── Step 4: Compare vs versión anterior
├── Step 5: Detect alerts (margen bajo, coste alto)
├── Step 6: Persist con versionado
└── Publish: escandallo.recalculado
```

**Handlers:**
- onRecetaCreada() → crear escandallo inicial
- onRecetaActualizada() → recalcular escandallo
- onIngredientePrecioActualizado() → recalcular todos los escandallos que usen ese ingrediente
- onEscandalloCreado() → publicar evento

**Archivos:**
- `pipeline/escandallo-analysis-pipeline.js` (~300 LOC)
- Integración con eventos recetas

---

### **FASE 3: Multi-Agent Architecture (3 Agentes)**

#### **Agente 1: Escandallo Analyzer**
Escucha: `escandallo.calculado`

**Responsabilidades:**
- Validar cálculos (costes coherentes)
- Detectar anomalías (ingrediente muy caro)
- Evaluar viabilidad de precio (food cost realista)
- Generar recomendaciones de margen
- Marcar alertas automáticas

**Output:** `escandallo.analysis.completed`
Prompt: `escandallo-analyzer-system.md` (350 líneas)

#### **Agente 2: Precio Optimizer**
Escucha: `escandallo.analysis.completed`

**Responsabilidades:**
- Analizar historial de simul precios
- Evaluar competencia (si se proporciona)
- Sugerir precio óptimo (margen + viabilidad)
- Simular elasticidad (si sube precio, demanda)
- Recomendaciones por categoría/tipo

**Output:** `escandallo.optimization.completed`
Prompt: `precio-optimizer-system.md` (350 líneas)

#### **Agente 3: Escandallo Curator**
Escucha: `escandallo.optimization.completed`

**Responsabilidades:**
- Validación final (coherencia global)
- Aplicar cambios recomendados
- Persistir con versionado
- Generar ficha técnica profesional
- Publicar alertas si es necesario

**Output:** `escandallo.curado`
Prompt: `escandallo-curator-system.md` (350 líneas)

---

### **FASE 4: Advanced Search + Ranking**

**CostRanker:**
- Score márgenes: recetas con margen bajo vs alto
- Score food cost: alignment con objetivo (30%)
- Score elasticidad: precio flexible vs rígido
- Score riesgo ingrediente: qué pasaría si suben precios
- Score oportunidad: dónde optimizar gastos

**CostFilters:**
```
30+ criterios:
- Rango margen_min/max
- Rango food_cost_min/max
- Ingredientes (solo / excluir)
- Precio venta (rango)
- Recetas con alerta
- Recetas sin precio_venta
- Última actualización
- Viabilidad precio (sí/no)
- etc.
```

**Archivos:**
- `core/cost-ranker.js` (SearchRanker para costos)
- `core/cost-filters.js` (SearchFilters para escandallos)
- Modify `escandallo-manager.js` para ranking

**Documentación:**
- `README.md` - Overview
- `SCHEMA.md` - Modelo datos
- `PIPELINE.md` - Event flow
- `COST_STRATEGY.md` - Ranking + ejemplos

---

### **FASE 5: Frontend UI + Dashboard**

**Store:**
- `escandallo-dashboard.store.ts` - State management
- Derived stores: currentEscandallo, trendingCosts, alertList, optimizationSuggestions

**Componentes:**
1. **EscandalloDetail.svelte** - Desglose completo
   - Tabla ingredientes con costes
   - Totales (coste, margen, food cost %)
   - Comparación vs versión anterior
   - Timeline de cambios

2. **PrecingSimulator.svelte** - Simulador interactivo
   - Slider precio venta (8-25€)
   - Cálculo en vivo: margen, food cost, beneficio
   - Objetivo food cost (30%, 35%, etc.)
   - Gráfico food cost vs precio

3. **CostAlerts.svelte** - Alertas y recomendaciones
   - Ingredientes cuyo precio subió
   - Recetas con margen bajo
   - Oportunidades de sustitución
   - Impacto simulado

4. **CostDashboard.svelte** - Vista global
   - Resumen por proyecto (coste promedio, margen)
   - Top 10 ingredientes más caros
   - Distribución food cost
   - Trending: precios hacia arriba/abajo

---

### **FASE 6: Tests + Documentation**

**Tests:** 50+ casos
- `cost-ranker.test.js` (25 tests)
- `cost-filters.test.js` (25 tests)

**Documentación:** ~1500 líneas
- `API.md` - 10 endpoints (escandallo, simular, optimizar, etc.)
- `DEPLOYMENT.md` - Docker, K8s, backup
- `TROUBLESHOOTING.md` - OCR prices, margin calc, alerts

---

## Timeline Estimado

| Fase | Componentes | Estimado |
|------|-------------|----------|
| 1 | DB schema, manager, types | 1-2 días |
| 2 | Pipeline analysis, events | 1 día |
| 3 | 3 agentes + prompts | 2 días |
| 4 | Ranking, filters, docs | 1-2 días |
| 5 | Store + 4 componentes | 1-2 días |
| 6 | Tests + docs completa | 1 día |
| **TOTAL** | **Completo v2.0.0** | **~8 días** |

---

## Diferencias Escandallo vs Recetas

| Aspecto | Recetas | Escandallo |
|--------|---------|-----------|
| Datos entrada | OCR + manual | Recetas + precios |
| Pipeline | Ingestion → Structuring → Analysis → Curation | Analysis → Optimization → Curation |
| Análisis principal | Viabilidad/tiempos | Costos/márgenes |
| Ranking | Nombre + ingredientes + coste | Margen + food cost + riesgo |
| Agentes | Structurer, Analyzer, Curator | Analyzer, Optimizer, Curator |
| Frontend | History + Comparator | Detail + Simulator + Alerts + Dashboard |
| Caso uso | Catalogo recetas | Gestión precios |

---

## Próximos Pasos si Aprobamos

1. ✓ Crear PLAN_ESCANDALLO.md (este documento)
2. → Lanzar Fase 1 (DB schema + manager)
3. → Lanzar Fase 2 (Pipeline)
4. → Lanzar Fase 3 (3 agentes)
5. → Fase 4, 5, 6 (search, UI, tests, docs)

---

## Preguntas de Diseño

1. **Persistencia de simulaciones:** Guardar todas las simulaciones ejecutadas? Sí (para historial de decisiones)
2. **Alertas automáticas:** Qué umbrales? (margen < 15%, food cost > 35%, ingrediente +20% precio)
3. **Competencia:** Integrar datos competencia (restaurantes vecinos)? Fase 7 (out of scope v2)
4. **Predicción precios:** Modelar tendencia de precios? Fase 7 (out of scope v2)
5. **Multi-proveedores:** Un ingrediente con múltiples precios según proveedor? Sí, en v2

---

**Status:** ✓ **LISTO PARA IMPLEMENTAR**

¿Aprobamos Escandallo v2 con esta fórmula?
