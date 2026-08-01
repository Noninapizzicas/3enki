---
name: recipes-json
fuente: dpapathanasiou
url: https://github.com/dpapathanasiou/recipes
version: 2025-07
tipo: referencia
dominio: cocina
tags: [recetas, json, formato, schema, coleccion]
---

# recipes — Colección de recetas en JSON estructurado

Colección de recetas (139+ estrellas) almacenadas en JSON puro con un schema consistente. Modelo de datos limpio y simple para recetas versionadas en Git.

## Schema de receta

```json
{
  "name": "Hummus",
  "url": "https://...",
  "author": "...",
  "description": "Classic Middle Eastern hummus",
  "prepTime": "PT10M",
  "cookTime": "PT0M",
  "totalTime": "PT10M",
  "recipeYield": "2 cups",
  "recipeCategory": "Appetizer",
  "recipeCuisine": "Middle Eastern",
  "recipeIngredient": [
    "1 (15 oz) can chickpeas, drained",
    "1/4 cup tahini",
    "2 tablespoons olive oil",
    "2 tablespoons lemon juice",
    "1 clove garlic",
    "1/2 teaspoon cumin",
    "Salt to taste"
  ],
  "recipeInstructions": [
    "Combine all ingredients in food processor.",
    "Process until smooth, scraping down sides.",
    "Adjust seasoning and consistency with water."
  ]
}
```

## Alineación con schema.org/Recipe

Los campos siguen el estándar `schema.org/Recipe`:

| Campo | schema.org | Tipo |
|---|---|---|
| **name** | name | string |
| **prepTime** | prepTime | ISO 8601 duration |
| **cookTime** | cookTime | ISO 8601 duration |
| **recipeYield** | recipeYield | string |
| **recipeCategory** | recipeCategory | string |
| **recipeCuisine** | recipeCuisine | string |
| **recipeIngredient** | recipeIngredient | string[] |
| **recipeInstructions** | recipeInstructions | string[] |

## Valor para referencia

- Schema de receta mínimo alineado con schema.org — referencia para modelar recetas en JSON
- Colección versionada en Git — patrón recipe-as-code
- Tiempos en ISO 8601 duration (PT30M = 30 minutos)
- Separación limpia entre categoría y cocina (recipeCategory vs recipeCuisine)
