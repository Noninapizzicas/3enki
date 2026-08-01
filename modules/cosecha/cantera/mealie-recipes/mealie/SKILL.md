---
name: mealie
fuente: mealie-recipes
url: https://github.com/mealie-recipes/mealie
version: 2025-07
tipo: referencia
dominio: cocina
tags: [recetas, self-hosted, meal-planning, api, python, vue, docker]
---

# Mealie — Gestor de recetas self-hosted

El gestor de recetas open-source más popular (12.8k+ estrellas). Self-hosted con API REST completa, importación desde URLs, planificación de comidas y listas de compra.

## Stack técnico

| Componente | Tecnología |
|---|---|
| **Backend** | Python (FastAPI) |
| **Frontend** | Vue.js (Nuxt) |
| **Base de datos** | SQLite / PostgreSQL |
| **Despliegue** | Docker (imagen oficial) |
| **API** | REST con OpenAPI/Swagger docs |

## Funcionalidades principales

| Función | Descripción |
|---|---|
| **Importar receta** | Pega una URL → extrae automáticamente (schema.org + scraping) |
| **Meal planner** | Planifica comidas por semana, genera lista de compra |
| **Shopping list** | Agrupada por categoría/pasillo, compartible |
| **Categorías y tags** | Organización flexible de recetas |
| **Multi-usuario** | Grupos, permisos, recetas compartidas |
| **Búsqueda** | Full-text search sobre ingredientes y pasos |
| **Nutrición** | Datos nutricionales automáticos |
| **Cookbook** | Agrupa recetas en libros temáticos |

## Despliegue Docker

```yaml
# docker-compose.yml
services:
  mealie:
    image: ghcr.io/mealie-recipes/mealie:latest
    ports:
      - "9925:9000"
    environment:
      PUID: 1000
      PGID: 1000
      TZ: Europe/Madrid
      BASE_URL: https://recetas.midominio.com
      DB_ENGINE: sqlite       # o postgres
    volumes:
      - mealie-data:/app/data/
```

## API REST

```bash
# Importar receta desde URL
POST /api/recipes/create-url
{"url": "https://www.seriouseats.com/..."}

# Listar recetas
GET /api/recipes?page=1&perPage=50

# Buscar
GET /api/recipes?search=paella

# Planificar comida
POST /api/meal-plans
{"date": "2025-07-20", "entryType": "dinner", "recipeId": "..."}

# Lista de compra
GET /api/groups/shopping/lists
```

## Modelo de datos de receta

```json
{
  "name": "Paella Valenciana",
  "description": "Receta tradicional...",
  "recipeYield": "4 porciones",
  "totalTime": "PT1H30M",
  "recipeIngredient": [
    {"note": "arroz bomba", "quantity": 400, "unit": {"name": "g"}},
    {"note": "judía verde", "quantity": 200, "unit": {"name": "g"}}
  ],
  "recipeInstructions": [
    {"text": "Sofreír la verdura en aceite de oliva..."}
  ],
  "recipeCategory": ["Arroces"],
  "tags": ["valenciana", "sin-gluten"],
  "nutrition": {"calories": "450 kcal"}
}
```

## Valor para referencia

- Modelo de datos de receta completo y bien diseñado
- API REST documentada — patrón para cualquier app de recetas
- Importación automática desde 400+ sitios web
- Integración con Home Assistant vía custom component
