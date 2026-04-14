# Módulo Recetas v2

Sistema de gestión de recetas con ingestion OCR, análisis automático, y búsqueda avanzada.

## Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│ Ingestion Pipeline (recipe-ingestion-pipeline.js)        │
│ intake → download → prepare → ocr → normalize            │
└────────────────┬────────────────────────────────────────┘
                 │ receta.ingestion.completed
                 ▼
┌─────────────────────────────────────────────────────────┐
│ Agent 1: Recipe Structurer (ai-agent-framework)          │
│ Valida y estructura JSON, genera ID único               │
└────────────────┬────────────────────────────────────────┘
                 │ receta.structuring.completed
                 ▼
┌─────────────────────────────────────────────────────────┐
│ Agent 2: Recipe Analyzer (ai-agent-framework)            │
│ Calcula costes, alérgenos, tiempos, dificultad, viabilidad│
└────────────────┬────────────────────────────────────────┘
                 │ receta.analysis.completed
                 ▼
┌─────────────────────────────────────────────────────────┐
│ Agent 3: Recipe Curator (ai-agent-framework)             │
│ Validación final, persistencia, versionado, índices     │
└────────────────┬────────────────────────────────────────┘
                 │ receta.creada
                 ▼
┌─────────────────────────────────────────────────────────┐
│ SQLite DB (per-project)                                  │
│ - recetas (main records)                                │
│ - receta_versiones (full history)                       │
│ - ingredientes (catalog)                                │
│ - receta_ingredientes (many-to-many)                   │
│ - receta_search_index (denormalized for search)         │
│ - receta_feedback (user ratings)                        │
└─────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Inicializar módulo

```javascript
const RecetasModule = require('./modules/recetas');

const recetas = new RecetasModule(logger);
await recetas.init({
  basePath: '/home/user/2enki',
  serviceExecutor: executor
});
```

### 2. Ingestar receta

```javascript
// Vía API handler
await recetas.handleIngestar({
  projectId: 'proj_123',
  fuente: 'pdf',
  archivo: '/path/to/recipe.pdf',
  fuente_referencia: 'https://example.com/recipe'
});

// Resultado: evento receta.ingestion.started publicado
// Pipeline continúa automáticamente → agentes procesan
```

### 3. Buscar recetas

```javascript
const results = await recetas.handleBuscar({
  projectId: 'proj_123',
  criteria: {
    nombre: 'pasta',
    ingredientes: ['tomate', 'ajo'],
    dificultad_max: 6,
    coste_max: 10,
    alerge nos_excluir: ['gluten'],
    limit: 20,
    sortBy: 'relevancia'
  }
});

// Retorna: array de recetas ordenadas por relevancia (0-100+ score)
```

## API Reference

### Handlers (llamables vía eventos o API)

#### `handleIngestar(payload)`
Inicia pipeline de ingestion desde archivo o URL

**Params:**
- `projectId`: string (requerido)
- `fuente`: 'pdf' | 'imagen' | 'json' | 'url' (requerido)
- `archivo`?: string (ruta local o URL)
- `fuente_referencia`?: string (URL de origen)

**Returns:** `{ingestion_id, status}`

#### `handleBuscar(payload)`
Busca recetas por criterios avanzados

**Params:**
- `projectId`: string (requerido)
- `criteria`: objeto con 40+ campos opcionales

**Returns:** array de recetas ordenadas por relevancia

#### `handleObtener(payload)`
Obtiene receta completa con historial de versiones

**Params:**
- `projectId`: string
- `receta_id`: string

**Returns:** receta con metadata completa

#### `handleHistorial(payload)`
Lista versiones de una receta

**Params:**
- `projectId`: string
- `receta_id`: string
- `limit`?: number (default 10)

**Returns:** array de versiones con changeset

#### `handleRevertir(payload)`
Revierte a una versión anterior

**Params:**
- `projectId`: string
- `receta_id`: string
- `version`: number

**Returns:** receta actualizada

#### `handleIngredientes(payload)`
Lista ingredientes del catálogo

**Params:**
- `projectId`: string
- `query`?: string (búsqueda)
- `limit`?: number

**Returns:** array de ingredientes con precios

## Versionado

Cada guardado crea una **nueva versión inmutable** con snapshot completo:

```json
{
  "receta": {...},
  "version": 2,
  "cambios": ["precio_actualizado", "alerge nos_validados"],
  "cambios_descripcion": "Actualizado: precios reales de mercado",
  "cambiado_por": "recipe-curator-agent",
  "cambiado_at": 1713090001000
}
```

**Audit trail:** Todos los cambios se registran con timestamp + usuario.

**Rollback:** `handleRevertir()` puede restaurar cualquier versión anterior.

## Búsqueda

Ver `SEARCH_STRATEGY.md` para algoritmo de ranking y ejemplos.

Criterios soportados: nombre, ingredientes, dificultad, tiempo, coste, viabilidad, características, alérgenos, etiquetas, fechas, porciones, métodos de cocción, tipos de plato.

## Per-Project Isolation

Cada proyecto tiene su propia BD SQLite:
- **Ruta:** `data/projects/{projectId}/recetas.db`
- **Tamaño estimado:** 50-100 recetas / 1MB
- **Indices:** Optimizados para búsqueda + versionado
- **Concurrencia:** WAL mode + transacciones

## Eventos

### Publicados por pipeline:
- `receta.ingestion.started` → Comienza descarga/OCR
- `receta.ingestion.completed` → Listo para structurer
- `receta.structuring.completed` → Listo para analyzer
- `receta.analysis.completed` → Listo para curator
- `receta.creada` → Guardada y indexada

### Publicados en error:
- `receta.ingestion.failed` → Problema en pipeline
- `receta.structuring.failed` → Problema en structurer
- `receta.analysis.failed` → Problema en analyzer
- `receta.curation.failed` → Problema en curator (guardada como borrador)

## Herramientas para Agentes

Tools disponibles en ai-agent-framework:

- `recetas.obtener` → Busca ingrediente o receta existente
- `recetas.ingredientes` → Consulta catálogo con precios/alérgenos
- `recetas.calcular_costes` → Calcula coste total y por porción
- `recetas.validar_schema` → Valida JSON contra schema
- `recetas.actualizar` → CREATE/UPDATE con versionado
- `recetas.actualizar_indices` → Actualiza search index

## Development Notes

- **Phase 1:** SQLite schema + manager ✓
- **Phase 2:** Ingestion pipeline (OCR con facturas) ✓
- **Phase 3:** 3 agentes (structurer, analyzer, curator) ✓
- **Phase 4:** Búsqueda mejorada con ranking ✓
- **Phase 5:** Versionado UI + comparador visual
- **Phase 6:** Metrics, tests, full docs

## Files

- `db/schema.sql` → DDL + indices
- `core/sqlite-manager.js` → CRUD + search con ranking
- `core/search-ranker.js` → Algoritmo scoring multi-factor
- `core/search-filters.js` → Builder de filtros SQL
- `pipeline/recipe-ingestion-pipeline.js` → intake→download→prepare→ocr→normalize
- `index.js` → RecetasModule class con handlers
- `module.json` → Declaración de handlers + tools + eventos

## See Also

- `SCHEMA.md` → Modelo de datos detallado
- `PIPELINE.md` → Flow eventos-driven
- `SEARCH_STRATEGY.md` → Ejemplos de búsqueda
