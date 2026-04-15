# Viabilidad Receta API Documentation

## Overview

The Viabilidad Receta module provides endpoints for managing recipe viability analysis, including profitability assessment, risk detection, and improvement recommendations.

## Base URL

```
/api/viabilidad
```

## Core Concepts

- **Viabilidad**: Profitability assessment of a recipe
  - `coste_porcion`: Cost per serving (€)
  - `precio_venta`: Sale price (€)
  - `margen_bruto`: Gross profit per portion (€)
  - `margen_porcentaje`: Profit margin %
  - `food_cost_porcentaje`: Cost as % of price
  - `estado`: VIABLE | ACEPTABLE | CRÍTICO | INVIABLE

- **Recomendación**: Suggestions to improve viability
  - `tipo`: subir_precio | bajar_coste | reformular | eliminar
  - `prioridad`: CRÍTICA | ADVERTENCIA | INFO
  - `impacto_estimado`: Estimated improvement (€ or %)
  - `implementada`: Boolean flag

## Endpoints

### 1. Search Viabilities

**GET** `/api/viabilidad/search`

Search and filter recipe viabilities with ranking.

**Query Parameters:**
```
estado=VIABLE,ACEPTABLE              # Comma-separated or array
margen_min=20&margen_max=50          # Margin % range
food_cost_min=25&food_cost_max=40    # Food cost % range
tiene_riesgo=true                     # Only recipes with pending recommendations
sort=relevance|riesgo|margen|mejora  # Ranking strategy
limit=50&offset=0                     # Pagination
proyecto_id=proj_123                  # Required (safety check)
```

**Ranking Strategies:**
- `relevance`: Combined score (risk + improvement + stability)
- `riesgo`: By estado (INVIABLE → CRÍTICO → ACEPTABLE → VIABLE)
- `margen`: Highest margin first
- `margen_asc`: Lowest margin first (to fix)
- `mejora`: Highest improvement potential first
- `viable_first`: Viable recipes first (business focus)

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "id": "vr_abc123",
      "receta_id": "rec_pasta",
      "receta_nombre": "Pasta Carbonara",
      "coste_porcion": 4.62,
      "precio_venta": 12.00,
      "margen_bruto": 7.38,
      "margen_porcentaje": 61.5,
      "food_cost_porcentaje": 38.5,
      "estado": "VIABLE",
      "evaluado_at": 1713090020000,
      "recomendaciones_pendientes": 0,
      "riesgos_criticos": 0,
      "_scoring": {
        "score": 95,
        "breakdown": {
          "base": 50,
          "riesgo": 40,
          "mejora_potencial": 5,
          "estabilidad": 0
        }
      }
    }
  ],
  "summary": {
    "total": 45,
    "viable": 28,
    "aceptable": 12,
    "critico": 4,
    "inviable": 1,
    "margen_promedio": 38.5,
    "food_cost_promedio": 32.1,
    "margen_min": 5.2,
    "margen_max": 75.3,
    "porcentaje_viable": 62.2,
    "porcentaje_riesgo": 11.1
  }
}
```

**Example Requests:**
```bash
# Get all viable recipes
curl "/api/viabilidad/search?estado=VIABLE&proyecto_id=proj_123"

# Get risky recipes with low margin (< 15%)
curl "/api/viabilidad/search?margen_max=15&tiene_riesgo=true&sort=riesgo&proyecto_id=proj_123"

# Get improvement opportunities
curl "/api/viabilidad/search?sort=mejora&limit=25&proyecto_id=proj_123"
```

---

### 2. Get Recipe Viability Detail

**GET** `/api/viabilidad/:receta_id`

Get full details for a specific recipe's viability.

**Response:**
```json
{
  "success": true,
  "viabilidad": {
    "id": "vr_abc123",
    "receta_id": "rec_pasta",
    "proyecto_id": "proj_123",
    "coste_porcion": 4.62,
    "precio_venta": 12.00,
    "margen_bruto": 7.38,
    "margen_porcentaje": 61.5,
    "food_cost_porcentaje": 38.5,
    "estado": "VIABLE",
    "evaluado_at": 1713090020000,
    "markup": 1.60
  },
  "recomendaciones": [
    {
      "id": "rec_001",
      "receta_id": "rec_pasta",
      "tipo": "subir_precio",
      "prioridad": "INFO",
      "accion": "Subir de €12.00 a €14.50",
      "razon": "Aumentar margen en 5%",
      "impacto_estimado": "+€2.50 por plato",
      "implementada": false,
      "creada_at": 1713090020000
    }
  ],
  "historico": [
    {
      "id": "vr_old1",
      "margen_bruto": 7.25,
      "margen_porcentaje": 60.5,
      "food_cost_porcentaje": 39.5,
      "estado": "VIABLE",
      "evaluado_at": 1712831420000
    }
  ]
}
```

---

### 3. Get All Viabilities for Project

**GET** `/api/viabilidad/project/:project_id`

Get all recipe viabilities for a project.

**Query Parameters:**
```
estado=VIABLE                    # Filter by estado
sort=relevance                   # Ranking strategy
limit=100&offset=0               # Pagination
```

**Response:**
```json
{
  "success": true,
  "recipes": [
    { /* viabilidad object */ }
  ],
  "summary": { /* summary stats */ }
}
```

---

### 4. Calculate Viability

**POST** `/api/viabilidad/calculate`

Calculate viability for a recipe given cost and price.

**Request Body:**
```json
{
  "proyecto_id": "proj_123",
  "receta_id": "rec_pasta",
  "coste_porcion": 4.62,
  "precio_venta": 12.00
}
```

**Response:**
```json
{
  "success": true,
  "viabilidad": {
    "receta_id": "rec_pasta",
    "coste_porcion": 4.62,
    "precio_venta": 12.00,
    "margen_bruto": 7.38,
    "margen_porcentaje": 61.5,
    "food_cost_porcentaje": 38.5,
    "estado": "VIABLE",
    "markup": 1.60
  },
  "recomendaciones": [ /* basic recommendations */ ]
}
```

---

### 5. Get Recommendations

**GET** `/api/viabilidad/:receta_id/recomendaciones`

Get all recommendations for a recipe.

**Query Parameters:**
```
implementada=false    # Filter by status
prioridad=CRÍTICA     # Filter by priority
```

**Response:**
```json
{
  "success": true,
  "recomendaciones": [
    {
      "id": "rec_001",
      "receta_id": "rec_pasta",
      "tipo": "subir_precio",
      "prioridad": "INFO",
      "accion": "Subir de €12.00 a €14.50",
      "impacto_estimado": "+€2.50 margen",
      "implementada": false
    }
  ]
}
```

---

### 6. Mark Recommendation as Implemented

**POST** `/api/viabilidad/recomendacion/:rec_id/implement`

Mark a recommendation as implemented.

**Response:**
```json
{
  "success": true,
  "recomendacion": {
    "id": "rec_001",
    "implementada": true,
    "implementada_at": 1713090020000
  }
}
```

---

### 7. Get Recipes by Estado

**GET** `/api/viabilidad/estado/:estado`

Get all recipes with a specific estado.

**Query Parameters:**
```
proyecto_id=proj_123    # Required
sort=margen             # Optional
limit=50                # Optional
```

**Response:**
```json
{
  "success": true,
  "estado": "VIABLE",
  "recipes": [ /* viabilidad objects */ ],
  "count": 28
}
```

---

### 8. Get Summary Statistics

**GET** `/api/viabilidad/summary/:proyecto_id`

Get aggregated statistics for all recipes in a project.

**Response:**
```json
{
  "success": true,
  "summary": {
    "total": 45,
    "viable": 28,
    "aceptable": 12,
    "critico": 4,
    "inviable": 1,
    "margen_promedio": 38.5,
    "food_cost_promedio": 32.1,
    "margen_min": 5.2,
    "margen_max": 75.3,
    "porcentaje_viable": 62.2,
    "porcentaje_riesgo": 11.1
  }
}
```

---

## Estado Thresholds

### Viability States

| Estado | Margin | Food Cost | Meaning |
|--------|--------|-----------|---------|
| VIABLE | > 25% | < 30% | Healthy, profitable recipe |
| ACEPTABLE | 15-25% | 30-35% | Acceptable, some optimization possible |
| CRÍTICO | < 15% | > 35% | High risk, urgent action needed |
| INVIABLE | ≤ 0% | > 40% | Loss-making, eliminate or reformulate |

### Food Cost Ranges

- **< 30%**: Optimal (maximum profitability)
- **30-35%**: Good (acceptable margins)
- **35-40%**: Warning (limited flexibility)
- **> 40%**: Critical (unsustainable)

### Margin Ranges

- **> 25%**: Excellent (high profitability)
- **20-25%**: Good (solid margins)
- **15-20%**: Fair (adequate but limited)
- **5-15%**: Poor (vulnerable to cost changes)
- **≤ 0%**: Critical (losing money)

---

## Recommendation Types

### subir_precio (Increase Price)

Action: Raise selling price to achieve target food cost (typically 30%).

**Example:**
```
Acción: Subir de €12.00 a €15.40
Razon: Conseguir 30% FC objetivo
Impacto: +€3.40 margen por plato
```

### bajar_coste (Reduce Cost)

Action: Find cheaper ingredients or suppliers while maintaining quality.

**Example:**
```
Acción: Reducir jamón de €4.62 a €3.20
Razon: Es 46% del coste. Buscar alternativa más barata
Impacto: +€1.42 margen por plato
```

### reformular (Reformulate)

Action: Change recipe to use cheaper ingredients or smaller portions.

**Example:**
```
Acción: Reformular con ingredientes más baratos
Razon: Margen insuficiente incluso con precio subido
Impacto: +€2-5 margen potencial
```

### eliminar (Remove)

Action: Remove from menu or eliminate permanently.

**Example:**
```
Acción: Eliminar del menú
Razon: Margen negativo, poco interés de clientes
Impacto: Mejora rentabilidad general
```

---

## Priority Levels

| Prioridad | When | Action Timeline |
|-----------|------|-----------------|
| CRÍTICA | Negative margin or unsustainable | Immediate (days) |
| ADVERTENCIA | High risk (FC > 35%, margin < 15%) | Urgent (weeks) |
| INFO | Improvement opportunity | Optional (ongoing) |

---

## Error Responses

### 400 Bad Request

```json
{
  "success": false,
  "error": "margen_min debe ser menor que margen_max"
}
```

### 404 Not Found

```json
{
  "success": false,
  "error": "Receta no encontrada"
}
```

### 500 Server Error

```json
{
  "success": false,
  "error": "Error interno del servidor"
}
```

---

## Rate Limiting

No rate limiting currently implemented. Recommended limits:
- Search: 100 requests/min per project
- Detail views: Unlimited
- Modifications: 10 requests/min per project

---

## Examples

### Get Viable Recipes with Best Margins

```bash
curl -X GET "/api/viabilidad/search" \
  -d "estado=VIABLE" \
  -d "sort=margen" \
  -d "limit=10" \
  -d "proyecto_id=proj_123"
```

### Find Recipes Needing Immediate Action

```bash
curl -X GET "/api/viabilidad/search" \
  -d "estado=CRÍTICO,INVIABLE" \
  -d "sort=riesgo" \
  -d "proyecto_id=proj_123"
```

### Get Improvement Opportunities

```bash
curl -X GET "/api/viabilidad/search" \
  -d "sort=mejora" \
  -d "limit=25" \
  -d "proyecto_id=proj_123"
```

### Mark Recommendation as Done

```bash
curl -X POST "/api/viabilidad/recomendacion/rec_001/implement" \
  -H "Content-Type: application/json"
```

---

## Changelog

### v2.0.0 (Current)
- Recipe-specific viability analysis
- Margin and food cost calculations
- Risk-based recommendation generation
- Search with multiple ranking strategies
- Historical comparison tracking
- Summary statistics per project

### v1.0.0
- Business-level viability studies (deprecated)
