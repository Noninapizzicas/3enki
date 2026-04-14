# API Recetas v2 - Referencia Completa

## Base URL

```
POST /api/projects/{projectId}/recetas/*
```

## Autenticación

Todos los endpoints requieren token en header:

```
Authorization: Bearer {token}
```

## Endpoints

### 1. Ingestar Receta

**POST** `/api/projects/{projectId}/recetas/ingest`

Inicia pipeline de ingestion desde PDF, imagen o URL.

**Request:**
```json
{
  "fuente": "pdf" | "imagen" | "url" | "json",
  "archivo": "/path/to/file o URL string",
  "fuente_referencia": "https://example.com/recipe (opcional)"
}
```

**Response (202 Accepted):**
```json
{
  "ingestion_id": "ing_abc123_def456",
  "status": "iniciada",
  "projectId": "proj_123",
  "mensaje": "Pipeline iniciado"
}
```

**Estados posibles:**
- `iniciada` → Descargando/preparando archivo
- `procesando` → OCR en progreso
- `completada` → Listo para structurer
- `fallida` → Error en pipeline

**Ejemplo CURL:**
```bash
curl -X POST "http://localhost:3000/api/projects/proj_123/recetas/ingest" \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "fuente": "url",
    "archivo": "https://example.com/recipe.pdf"
  }'
```

---

### 2. Buscar Recetas

**POST** `/api/projects/{projectId}/recetas/search`

Busca recetas con criterios avanzados + ranking.

**Request:**
```json
{
  "nombre": "pasta",
  "ingredientes": ["tomate", "ajo"],
  "ingredientes_excluir": ["carne"],
  
  "dificultad_min": 3,
  "dificultad_max": 8,
  
  "tiempo_min": 15,
  "tiempo_max": 45,
  
  "coste_min": 5,
  "coste_max": 15,
  
  "viabilidad": "alta",
  "caracteristicas": ["vegetariano"],
  "alerge nos_excluir": ["gluten"],
  
  "limit": 20,
  "offset": 0,
  "sortBy": "relevancia",
  "sortOrder": "desc"
}
```

**Response (200 OK):**
```json
{
  "recetas": [
    {
      "id": "rec_pasta-carbonara_1713090000",
      "nombre": "Pasta a la Carbonara",
      "_score": 38,
      "porciones": 4,
      "tiempo_preparacion": 20,
      "dificultad": 6,
      "coste_porcion": 4.62,
      "viabilidad": "alta",
      "estado": "activa",
      "updated_at": 1713090000000
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

**Score (_score):**
- 85-100+: Excelente match
- 60-84: Muy bueno
- 40-59: Bueno
- 20-39: Aceptable
- 0-19: Pobre

**Ejemplo:**
```bash
curl -X POST "http://localhost:3000/api/projects/proj_123/recetas/search" \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "pasta",
    "dificultad_max": 7,
    "coste_max": 10,
    "limit": 10
  }'
```

---

### 3. Obtener Receta

**GET** `/api/projects/{projectId}/recetas/{recetaId}`

Obtiene receta completa con análisis y metadata.

**Response (200 OK):**
```json
{
  "id": "rec_pasta-carbonara_1713090000",
  "nombre": "Pasta a la Carbonara",
  "descripcion": "Pasta clásica italiana",
  "proyecto_id": "proj_123",
  "porciones": 4,
  "tiempo_preparacion": 20,
  "dificultad": 6,
  "estado": "activa",
  "version_actual": 2,
  
  "ingredientes": [
    {
      "nombre": "Pasta",
      "cantidad": 400,
      "unidad": "g",
      "precio_mercado": 1.20
    }
  ],
  
  "elaboracion": [
    "Hierve agua con sal",
    "Calienta jamón en sartén",
    "Mezcla huevos con queso",
    "Cocina pasta",
    "Mezcla todo rápido"
  ],
  
  "analisis": {
    "viabilidad": "alta",
    "costes": {
      "coste_total": 18.50,
      "coste_porcion": 4.62
    },
    "alerge nos": ["gluten", "huevo", "lactosa"],
    "dificultad": {
      "estimado_original": 6,
      "estimado_analizado": 6
    },
    "flags": [],
    "recomendaciones": ["Tener todo preparado (mise en place)"]
  },
  
  "created_at": 1713090000000,
  "updated_at": 1713090025000,
  "created_by": "user@example.com",
  "updated_by": "recipe-curator-agent"
}
```

**Ejemplo:**
```bash
curl -X GET "http://localhost:3000/api/projects/proj_123/recetas/rec_pasta-carbonara_1713090000" \
  -H "Authorization: Bearer token"
```

---

### 4. Historial de Versiones

**GET** `/api/projects/{projectId}/recetas/{recetaId}/history`

Obtiene todas las versiones con changeset.

**Query Params:**
- `limit` (default: 10)
- `offset` (default: 0)

**Response (200 OK):**
```json
{
  "receta_id": "rec_pasta-carbonara_1713090000",
  "current_version": 2,
  "versions": [
    {
      "version": 2,
      "nombre": "Pasta a la Carbonara",
      "cambios_descripcion": "Actualizado: precios reales de mercado",
      "cambiado_por": "recipe-curator-agent",
      "cambiado_at": 1713090025000,
      "snapshot": { /* receta completa */ },
      "cambios": [
        {
          "campo": "coste_porcion",
          "anterior": 4.50,
          "nuevo": 4.62
        }
      ]
    },
    {
      "version": 1,
      "nombre": "Pasta a la Carbonara",
      "cambios_descripcion": "Receta nueva creada desde OCR",
      "cambiado_por": "recipe-curator-agent",
      "cambiado_at": 1713090000000,
      "snapshot": { /* receta completa */ }
    }
  ]
}
```

**Ejemplo:**
```bash
curl -X GET "http://localhost:3000/api/projects/proj_123/recetas/rec_pasta-carbonara_1713090000/history?limit=5" \
  -H "Authorization: Bearer token"
```

---

### 5. Revertir a Versión Anterior

**POST** `/api/projects/{projectId}/recetas/{recetaId}/revert`

Revierte a una versión anterior (crea nueva versión con snapshot de anterior).

**Request:**
```json
{
  "target_version": 1
}
```

**Response (200 OK):**
```json
{
  "receta_id": "rec_pasta-carbonara_1713090000",
  "version_anterior": 2,
  "version_nueva": 3,
  "estado": "activa",
  "mensaje": "Revertido a versión 1 (snapshot guardado como versión 3)",
  "timestamp": 1713090050000
}
```

**Ejemplo:**
```bash
curl -X POST "http://localhost:3000/api/projects/proj_123/recetas/rec_pasta-carbonara_1713090000/revert" \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{"target_version": 1}'
```

---

### 6. Listar Recetas

**GET** `/api/projects/{projectId}/recetas`

Lista todas las recetas del proyecto con filtros básicos.

**Query Params:**
- `estado` (activa, borrador, archivada)
- `limit` (default: 50, max: 200)
- `offset` (default: 0)
- `sortBy` (nombre, updated_at, created_at)
- `sortOrder` (asc, desc)

**Response (200 OK):**
```json
{
  "recetas": [
    {
      "id": "rec_pasta-carbonara_1713090000",
      "nombre": "Pasta a la Carbonara",
      "estado": "activa",
      "porciones": 4,
      "coste_porcion": 4.62,
      "viabilidad": "alta",
      "updated_at": 1713090025000
    }
  ],
  "total": 42,
  "limit": 50,
  "offset": 0
}
```

**Ejemplo:**
```bash
curl -X GET "http://localhost:3000/api/projects/proj_123/recetas?estado=activa&limit=10" \
  -H "Authorization: Bearer token"
```

---

### 7. Ingredientes - Catálogo

**GET** `/api/projects/{projectId}/recetas/ingredientes`

Consulta catálogo de ingredientes por proyecto.

**Query Params:**
- `q` (búsqueda por nombre)
- `limit` (default: 50)

**Response (200 OK):**
```json
{
  "ingredientes": [
    {
      "id": "ing_pasta_xyz",
      "nombre": "Pasta",
      "categoria": "granos",
      "precio_mercado_kg": 1.50,
      "alerge nos": ["gluten"],
      "estacional": false
    }
  ],
  "total": 142
}
```

**Ejemplo:**
```bash
curl -X GET "http://localhost:3000/api/projects/proj_123/recetas/ingredientes?q=pasta&limit=20" \
  -H "Authorization: Bearer token"
```

---

### 8. Estadísticas

**GET** `/api/projects/{projectId}/recetas/stats`

Obtiene estadísticas del proyecto.

**Response (200 OK):**
```json
{
  "proyecto_id": "proj_123",
  "total_recetas": 42,
  "recetas_activas": 38,
  "recetas_borradores": 3,
  "recetas_archivadas": 1,
  
  "total_ingredientes": 142,
  
  "coste_promedio_porcion": 7.85,
  "coste_minimo": 2.50,
  "coste_maximo": 45.00,
  
  "dificultad_promedio": 5.2,
  
  "viabilidad_distribucion": {
    "alta": 28,
    "media": 10,
    "baja": 4
  },
  
  "alerge nos_frecuentes": [
    { "alerge no": "gluten", "count": 15 },
    { "alerge no": "lactosa", "count": 8 },
    { "alerge no": "huevo", "count": 6 }
  ],
  
  "caracteristicas_frecuentes": [
    { "caracteristica": "vegetariano", "count": 12 },
    { "caracteristica": "sin_gluten", "count": 8 }
  ]
}
```

**Ejemplo:**
```bash
curl -X GET "http://localhost:3000/api/projects/proj_123/recetas/stats" \
  -H "Authorization: Bearer token"
```

---

## Códigos de Error

| Código | Significado | Acción |
|--------|-------------|--------|
| 200 | OK | Request exitoso |
| 202 | Accepted | Ingestion iniciada (async) |
| 400 | Bad Request | Criterios inválidos o malformados |
| 401 | Unauthorized | Token inválido o expirado |
| 403 | Forbidden | Sin permisos para proyecto |
| 404 | Not Found | Receta no existe |
| 409 | Conflict | Receta ya existe (duplicado) |
| 422 | Unprocessable | Datos inválidos (schema validation) |
| 429 | Too Many Requests | Rate limit excedido |
| 500 | Server Error | Error interno |

**Ejemplo Error:**
```json
{
  "error": "Criterios de búsqueda inválidos",
  "details": [
    "dificultad_min debe estar entre 1-10",
    "coste_min no puede ser mayor a coste_max"
  ],
  "timestamp": 1713090000000
}
```

---

## Rate Limiting

- **Search:** 100 req/min por proyecto
- **Ingest:** 10 req/min por proyecto
- **Write:** 50 req/min por proyecto
- **Read:** 500 req/min por proyecto

Headers de respuesta:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1713090060
```

---

## Webhooks (Eventos)

Subscribe a eventos MQTT con patrón:

```
recetas/{projectId}/#
```

**Tópicos publicados:**
- `recetas/{projectId}/ingestion/started`
- `recetas/{projectId}/ingestion/completed`
- `recetas/{projectId}/ingestion/failed`
- `recetas/{projectId}/receta/creada`
- `recetas/{projectId}/receta/actualizada`
- `recetas/{projectId}/receta/archivada`

**Payload ejemplo:**
```json
{
  "event": "receta.creada",
  "receta_id": "rec_pasta-carbonara_1713090000",
  "projectId": "proj_123",
  "version": 1,
  "estado": "activa",
  "nombre": "Pasta a la Carbonara",
  "timestamp": 1713090025000
}
```

---

## Ejemplos Completos

### Flujo: Ingestar → Buscar → Obtener

```bash
# 1. Ingestar PDF
INGESTION_ID=$(curl -s -X POST "http://localhost:3000/api/projects/proj_123/recetas/ingest" \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{"fuente":"pdf","archivo":"https://example.com/recipe.pdf"}' \
  | jq -r '.ingestion_id')

# Esperar webhook: recetas/proj_123/ingestion/completed
# (o hacer polling a GET /ingestions/{id})

# 2. Buscar las recetas similares
curl -X POST "http://localhost:3000/api/projects/proj_123/recetas/search" \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{"nombre":"pasta","limit":10}'

# 3. Obtener detalle de una receta
curl -X GET "http://localhost:3000/api/projects/proj_123/recetas/rec_pasta-carbonara_1713090000" \
  -H "Authorization: Bearer token"
```

### Flujo: Comparar Versiones

```bash
# 1. Obtener historial
curl -X GET "http://localhost:3000/api/projects/proj_123/recetas/rec_pasta-carbonara_1713090000/history?limit=5" \
  -H "Authorization: Bearer token"

# 2. Revertir si es necesario
curl -X POST "http://localhost:3000/api/projects/proj_123/recetas/rec_pasta-carbonara_1713090000/revert" \
  -H "Authorization: Bearer token" \
  -H "Content-Type: application/json" \
  -d '{"target_version":1}'
```

---

## SDKs

### Node.js
```javascript
const { RecetasClient } = require('@2enki/recetas-sdk');

const client = new RecetasClient({
  projectId: 'proj_123',
  token: 'your-token'
});

// Buscar
const results = await client.search({
  nombre: 'pasta',
  dificultad_max: 7
});

// Obtener
const receta = await client.get('rec_pasta-carbonara_1713090000');

// Historial
const history = await client.getHistory('rec_pasta-carbonara_1713090000');
```

### TypeScript
Tipos completos en `@2enki/recetas-sdk/types`

---

## Changelog API

**v2.0.0** (2026-04-14)
- Search ranking multi-factor
- Versionado inmutable
- 40+ criterios de filtrado
- Análisis automático

**v1.0.0** (2026-03-01)
- API base
- CRUD simple
- Búsqueda básica
