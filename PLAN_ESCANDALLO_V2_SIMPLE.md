# Plan Escandallo v2 - VERSIÓN CORRECTA (Simple)

## Qué Es Escandallo v2

**Entrada:** Receta con ingredientes + cantidades + precios mercado  
**Salida:** Coste total + coste porción (calculado HOY con precios mercado)  
**Propósito:** Saber rápidamente cuánto cuesta hacer esta receta hoy

**NO es:**
- Histórico de compras reales
- Múltiples proveedores
- Negociación de precios
- Margen/food cost para venta

---

## Fórmula Simplificada (6 Fases)

### **FASE 1 - BD Simple** (1 día)
**Tablas:**
```sql
escandallo
├── id (PK)
├── receta_id (FK)
├── proyecto_id
├── coste_total (€)
├── coste_porcion (€)
├── precio_mercado_snapshot (JSON: precios usados)
├── calculado_at (timestamp)
└── notas (si falta algún precio)

escandallo_alerts
├── id, escandallo_id, tipo_alerta
├── ingrediente_nombre, precio_anterior, precio_nuevo
├── porcentaje_cambio, fecha_alerta
└── leida (boolean)
```

**Manager:**
- `calculateEscandallo(recetaId, preciosMercado)` → coste_total, coste_porcion
- `getEscandallo(recetaId)` → último cálculo
- `getHistory(recetaId, limit=10)` → histórico
- `detectPriceChanges()` → qué ingredientes subieron
- `searchByPrice(min, max)` → recetas en rango de coste

**Archivos:**
- `db/schema-escandallo.sql` (simple: 2 tablas)
- `core/escandallo-manager.js` (~250 LOC)
- `frontend/src/lib/stores/escandallo.types.ts`

---

### **FASE 2 - Pipeline Básico** (1 día)
**Event Flow:**
```
receta.creada / receta.actualizada
    ↓
calcular_escandallo_pipeline
├── Load: receta + ingredientes actuales (con precios mercado)
├── Calculate: coste_total = Σ(cantidad * precio_mercado/unidad)
├── Calculate: coste_porcion = coste_total / porciones
├── Detect: qué ingredientes faltaban precio (notas)
├── Detect: qué ingredientes subieron vs última vez (alertas)
├── Persist: escandallo + snapshot de precios
└── Publish: escandallo.calculado
```

**Handlers:**
- `onRecetaCreada()` → crear escandallo
- `onRecetaActualizada()` → recalcular escandallo
- `onIngredientePrecioActualizado()` → recalcular escandallos que usen ese ingrediente

**Archivos:**
- `pipeline/escandallo-calculation-pipeline.js` (~200 LOC)

---

### **FASE 3 - 1 Agente Simple** (1 día)
**Escandallo Analyzer**  
Escucha: `escandallo.calculado`

**Responsabilidades:**
- Validar: precios coherentes (no 0€, no valores locos)
- Detectar: ingredientes que faltaban precio (notas)
- Detectar: si coste es muy alto/bajo vs histórico (alertas)
- Publicar: alertas si cambios > umbral

**Prompt:** `escandallo-analyzer-system.md` (~200 líneas)  
**Output:** `escandallo.analizado`

**Archivos:**
- `agents/escandallo-analyzer.json` (config)
- `prompts/escandallo-analyzer-system.md`

---

### **FASE 4 - Search + Ranking Simple** (1 día)
**EscandalloFilters:**
```
Criterios:
- coste_min, coste_max (rango euros)
- coste_porcion_min, coste_porcion_max
- recetas_sin_precio (boolean)
- recetas_con_alerta (boolean)
- última_semana (boolean)
```

**EscandalloRanker:**
```
Score por:
- Coste cercano a promedio = bueno (no extremos)
- Completitud precios = mejor
- Sin cambios bruscos = más estable
```

**Documentación:**
- `README.md` - Overview
- `SCHEMA.md` - 2 tablas
- `PIPELINE.md` - Event flow
- `SEARCH.md` - Criterios búsqueda

**Archivos:**
- `core/escandallo-filters.js` (~150 LOC)
- `core/escandallo-ranker.js` (~150 LOC)

---

### **FASE 5 - Frontend Simple** (1 día)
**Store:**
- `escandallo.store.ts` - State management básico

**Componentes Svelte:**

1. **EscandalloCard.svelte** - Card mínima
   - Receta nombre
   - Coste total | Coste/porción
   - Última fecha cálculo
   - Badge: "precios completos" o "falta X"

2. **EscandalloDetail.svelte** - Desglose
   - Tabla 3 columnas: Ingrediente | Cantidad | Coste
   - Total + Coste porción
   - Timestamp precios
   - Histórico: últimos 5 cálculos con coste

3. **EscandalloAlerts.svelte** - Alertas
   - "Azúcar subió 15% en la última semana"
   - "Receta subió 0.50€ por porción"
   - Link a ingrediente para actualizar precio

4. **EscandalloBrowser.svelte** - Búsqueda
   - Rango coste (slider 0-50€)
   - Filter: "sin precios", "con alertas", "esta semana"
   - Lista recetas con coste

---

### **FASE 6 - Tests + Docs** (1 día)
**Tests:** 30+ casos
- `escandallo-manager.test.js` (15 tests)
- `escandallo-filters.test.js` (10 tests)
- `escandallo-ranker.test.js` (5 tests)

**Documentación:**
- `API.md` - 4 endpoints simple
- `DEPLOYMENT.md` - Deploy básico
- `TROUBLESHOOTING.md` - Problemas comunes

---

## Timeline Total: **~5 días para v2.0.0 completo**

| Fase | Líneas Código | Días |
|------|---------------|------|
| 1 | 250 + 100 (types) | 1 |
| 2 | 200 | 1 |
| 3 | 200 (prompt + agent) | 1 |
| 4 | 300 + 400 docs | 1 |
| 5 | 300 (store + 4 components) | 1 |
| 6 | 600 (tests + docs) | 1 |
| **TOTAL** | **~2000** | **~5** |

---

## Estructura Final

```
modules/escandallo/
├── core/
│   ├── escandallo-manager.js (CRUD, calculate, search)
│   ├── escandallo-filters.js (SQL builder)
│   └── escandallo-ranker.js (scoring)
├── db/
│   └── schema-escandallo.sql (2 tablas simple)
├── pipeline/
│   └── escandallo-calculation-pipeline.js (event-driven)
├── agents/
│   └── escandallo-analyzer.json
├── prompts/
│   └── escandallo-analyzer-system.md
├── __tests__/
│   ├── escandallo-manager.test.js
│   ├── escandallo-filters.test.js
│   └── escandallo-ranker.test.js
├── README.md
├── SCHEMA.md
├── PIPELINE.md
├── SEARCH.md
├── API.md
├── DEPLOYMENT.md
├── TROUBLESHOOTING.md
├── module.json (v2.0.0)
└── index.js (refactored)

frontend/src/lib/
├── stores/
│   ├── escandallo.store.ts
│   └── escandallo.types.ts
└── components/recipes/
    ├── EscandalloCard.svelte
    ├── EscandalloDetail.svelte
    ├── EscandalloAlerts.svelte
    └── EscandalloBrowser.svelte
```

---

## Status: ✅ LISTO PARA FASE 1

**Simplicidad:** Sin proveedores, sin compras, sin versioning complejo  
**Propósito:** Receta + precios mercado = coste rápido HOY  
**Timeline:** 5 días  

**¿Comenzamos Fase 1 ahora?**
