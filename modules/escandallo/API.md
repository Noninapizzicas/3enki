# Escandallo Module API Documentation

## Overview

The Escandallo module calculates and analyzes recipe costs based on market prices. It provides:

- **Cost Calculation**: Recipe + ingredients + market prices = total cost + cost per portion
- **Price Discovery**: Multi-tier fallback strategy (Mercadona API → Carrefour scraping → Google Images OCR → Historical average)
- **Automatic Alerts**: Price change detection and notifications
- **Intelligent Analysis**: Anomaly detection and cost viability assessment via AI agent
- **Smart Search**: Cost-based filtering and relevance-based ranking

## Architecture

### Components

```
modules/escandallo/
├── core/
│   ├── escandallo-manager.js      # Main manager (DB, calculations, alerts)
│   ├── precio-finder.js            # Multi-source price discovery
│   ├── precio-cache-manager.js     # 24h cache with fallback
│   ├── search-filters.js           # Query filtering logic
│   └── search-ranker.js            # Result ranking algorithm
├── db/
│   └── schema-escandallo.sql       # SQLite schema
├── pipeline/
│   └── escandallo-calculation-pipeline.js  # Event-driven orchestration
└── index.js                        # Module interface + tools
```

### Database

Two main tables:
- **escandallo**: Cost calculations (id, receta_id, coste_total, coste_porcion, precio_mercado_snapshot, calculado_at)
- **escandallo_alerts**: Price change alerts (id, escandallo_id, ingrediente_nombre, porcentaje_cambio, detectada_at, leida)

Plus cache table:
- **ingrediente_precios_cache**: Market prices with 24h validity window

### Event Flow

```
receta.actualizada
    ↓
[Pipeline: executeForReceta]
    ├─ Step 1: Validate recipe
    ├─ Step 2: Find prices (Mercadona → Carrefour → Google → Historical)
    ├─ Step 3: Calculate escandallo
    ├─ Step 4: Persist to DB
    ├─ Step 5: Detect price changes → Alerts
    └─ Step 6: Publish escandallo.calculado
                    ↓
        [Analyzer Agent: escandallo-analyzer]
            ├─ Validate calculations
            ├─ Detect anomalies
            ├─ Evaluate price viability
            ├─ Generate recommendations
            └─ Publish escandallo.analysis.completed
```

## Tools

### Analyzer Tools (3)

#### 1. escandallo.obtener
Get complete escandallo calculation with full details.

**Parameters:**
- `escandallo_id` (string, required): Escandallo ID (e.g., "esc_rec_pasta_1713090000")
- `project_id` (string, required): Project ID for database access

**Response:**
```json
{
  "status": 200,
  "data": {
    "id": "esc_rec_pasta_1713090000",
    "receta_id": "rec_pasta_xyz",
    "coste_total": 18.50,
    "coste_porcion": 4.62,
    "precio_mercado_snapshot": {
      "pasta": 1.20,
      "jamón": 8.50,
      "huevo": 0.80,
      "queso": 6.40
    },
    "calculado_at": 1713090020000
  }
}
```

#### 2. escandallo.obtener_historico
Get historical calculations for trend analysis and anomaly detection.

**Parameters:**
- `receta_id` (string, required): Recipe ID
- `project_id` (string, required): Project ID
- `limit` (integer, optional): Number of records (default: 5)

**Response:**
```json
{
  "status": 200,
  "data": {
    "receta_id": "rec_pasta_xyz",
    "historico": [
      { "coste_porcion": 4.50, "calculado_at": 1713000000000 },
      { "coste_porcion": 4.60, "calculado_at": 1713086400000 }
    ],
    "total_records": 2
  }
}
```

#### 3. escandallo.obtener_alertas
Get price change alerts for an escandallo.

**Parameters:**
- `escandallo_id` (string, required): Escandallo ID
- `project_id` (string, required): Project ID

**Response:**
```json
{
  "status": 200,
  "data": {
    "escandallo_id": "esc_rec_pasta_1713090000",
    "alertas": [
      {
        "id": "alerta_1",
        "ingrediente_nombre": "jamón",
        "tipo_alerta": "precio_subio",
        "precio_anterior": 8.20,
        "precio_nuevo": 8.50,
        "porcentaje_cambio": 3.66,
        "detectada_at": 1713089000000
      }
    ],
    "total_alertas": 1
  }
}
```

### Search Tools (2)

#### 4. escandallo.buscar
Simple filtering without ranking.

**Parameters:**
- `project_id` (string, required): Project ID
- `coste_min` (number, optional): Minimum cost per portion
- `coste_max` (number, optional): Maximum cost per portion
- `tiene_alerta` (boolean, optional): Filter by alert presence
- `tiene_alerta_sin_leer` (boolean, optional): Filter by unread alerts
- `desde_fecha` (integer, optional): Start date timestamp
- `hasta_fecha` (integer, optional): End date timestamp
- `sin_precio` (boolean, optional): Filter with missing prices
- `limit` (integer, optional): Max results (default: 50, max: 100)

**Response:**
```json
{
  "status": 200,
  "data": {
    "results": [
      {
        "id": "esc_1",
        "receta_id": "rec_1",
        "coste_porcion": 5.50,
        "alertas_sin_leer": 0
      }
    ],
    "count": 1,
    "filters_applied": { "coste_min": 5, "coste_max": 6 }
  }
}
```

#### 5. escandallo.buscar_y_ordenar
Search with intelligent ranking.

**Parameters:**
- `project_id` (string, required): Project ID
- `coste_min` (number, optional): Minimum cost
- `coste_max` (number, optional): Maximum cost
- `rankBy` (string, optional): Ranking strategy
  - `relevance` (default): By anomaly score (ingredients >30%, price changes >20%)
  - `cost`: Low to high
  - `cost_desc`: High to low
  - `alerts`: Most unread alerts first
  - `recent`: Newest first
  - `old`: Oldest first
- `limit` (integer, optional): Max results (default: 50, max: 100)

**Response:**
```json
{
  "status": 200,
  "data": {
    "results": [
      {
        "id": "esc_1",
        "coste_porcion": 5.50,
        "alertas_sin_leer": 2,
        "_scoring": {
          "score": 85,
          "breakdown": {
            "base": 50,
            "anomalies": 20,
            "recency": 10,
            "alerts": 5
          }
        }
      }
    ],
    "summary": {
      "total": 15,
      "coste_medio": 5.25,
      "coste_min": 3.50,
      "coste_max": 8.00,
      "con_alertas": 3,
      "porcentaje_con_alertas": 20.0
    },
    "count": 15,
    "rankBy": "relevance"
  }
}
```

## Frontend Components

### EscandalloCard
Compact summary card for a single escandallo.

```svelte
<EscandalloCard
  escandallo={data}
  onSelect={(id) => console.log(id)}
  compact={false}
/>
```

**Props:**
- `escandallo`: Full escandallo object
- `onSelect`: Callback on click
- `compact`: Boolean for size variant

### EscandalloDetail
Full details view with breakdown and history.

```svelte
<EscandalloDetail
  escandallo={data}
  historico={[]}
/>
```

### EscandalloAlerts
Display price change alerts and anomalies.

```svelte
<EscandalloAlerts
  escandallo={data}
  alertas={[]}
  anomalias={[]}
  onMarkAsRead={(id) => {}}
/>
```

### EscandalloBrowser
Search/filter interface with rankings.

```svelte
<EscandalloBrowser
  results={[]}
  summary={{}}
  loading={false}
  onSearch={(criteria) => {}}
  onSelect={(id) => {}}
/>
```

## Configuration

### Environment Variables
None required. Uses project-specific SQLite databases in `project_path/storage/escandallo.db`.

### Price Fallback Strategy

1. **Mercadona API** (fastest, most reliable)
   - Endpoint: `https://tienda.mercadona.es/api/search/`
   - Retry: 3 attempts with backoff [1s, 3s, 5s]

2. **Carrefour Web Scraping** (flexible, slower)
   - URL: `https://www.carrefour.es/search?q={ingredient}`
   - HTML parsing: `[data-price], .price, .product-price` selectors

3. **Google Images + OCR** (comprehensive, slowest)
   - Search: Google Images API
   - OCR: Google Cloud Vision (TEXT_DETECTION)
   - Price extraction: Regex patterns

4. **Historical Average** (fallback)
   - Query: Average of cached prices for ingredient
   - Filters: Only "alta" and "media" confidence entries

### Cache Configuration

- **Validity**: 24 hours
- **Storage**: SQLite table `ingrediente_precios_cache`
- **Fields**: ingrediente_nombre, precio, fuente, confianza, buscado_at, valido_hasta
- **Cleanup**: Daily via `cleanupCache()` cron job

### Thresholds

Defined in `escandallo-analyzer-system.md`:

- **Ingrediente muy caro**: > 30% of total cost
- **Coste irreal bajo**: < 1€ per portion
- **Coste irreal alto**: > 50€ per portion
- **Food cost crítico**: > 45%
- **Food cost aceptable**: 30-40%
- **Cambio precio alerta**: > 20%

## Usage Examples

### 1. Calculate Escandallo (Automatic)
Recipe modification triggers pipeline automatically:
```javascript
// User edits recipe → receta.actualizada event → pipeline runs
// Results in:
// - escandallo.calculado event published
// - escandallo.analysis.completed event published (from agent)
```

### 2. Search by Cost Range
```javascript
const results = await toolBuscar({
  project_id: "proj_123",
  coste_min: 3.50,
  coste_max: 8.00,
  limit: 20
});
```

### 3. Find Anomalies
```javascript
const anomalies = await toolBuscarYOrdenar({
  project_id: "proj_123",
  rankBy: "relevance",  // Sort by anomaly score
  limit: 10
});
```

### 4. Analyze Specific Escandallo
```javascript
const data = await toolObtenerEscandallo({
  escandallo_id: "esc_rec_pasta_1713090000",
  project_id: "proj_123"
});

const history = await toolObtenerHistorico({
  receta_id: "rec_pasta_xyz",
  project_id: "proj_123"
});

const alerts = await toolObtenerAlertas({
  escandallo_id: "esc_rec_pasta_1713090000",
  project_id: "proj_123"
});
```

## Analyzer Agent

The `escandallo-analyzer` agent automatically analyzes each calculated escandallo:

**Responsibilities:**
1. **Validate Calculations**: Verify coste_total and coste_porcion are logically correct
2. **Detect Anomalies**: Identify expensive ingredients, unrealistic costs, price trends
3. **Evaluate Viability**: Calculate food cost % and margen, assess profitability
4. **Generate Recommendations**: Actionable suggestions (find cheaper alternatives, adjust pricing)
5. **Mark Alerts**: Create CRÍTICA/ADVERTENCIA/INFO severity alerts

**Output Structure:**
```json
{
  "success": true,
  "analisis": {
    "coherencia": { "valido": true, "validaciones": [] },
    "anomalias": [],
    "viabilidad_precio": {},
    "historico": {}
  },
  "anomalias": [],
  "recomendaciones": [],
  "alertas_generadas": [],
  "confianza": "alta",
  "timestamp": 1713090020000
}
```

## Performance Considerations

- **Price Discovery**: ~3-5 seconds per recipe (depending on source)
- **Cache Hit Rate**: ~80% for ingredients in active use
- **Database Queries**: Indexed on proyecto_id, receta_id, calculado_at
- **Ranking**: O(n log n) with scoring phase, efficient for < 1000 results

## Error Handling

All tools return `{ status: 400/404/500, error: "message" }` on failure.

Common errors:
- 400: Missing parameters
- 404: Resource not found (escandallo_id, receta_id)
- 500: Database error or service unavailable

## Security

- All queries parameterized (SQL injection protection)
- Project isolation via proyecto_id in all queries
- No sensitive data in logs
- Price data cache is project-scoped
