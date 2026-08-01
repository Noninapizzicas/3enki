---
name: recipe-scrapers
fuente: hhursev
url: https://github.com/hhursev/recipe-scrapers
version: 2025-07
tipo: referencia
dominio: cocina
tags: [scraper, recetas, python, schema-org, parser, extraccion]
---

# recipe-scrapers — Extractor de recetas de 400+ sitios web

Librería Python (2.2k+ estrellas) que extrae datos estructurados de recetas desde cualquier sitio web popular. El estándar de facto para scraping de recetas.

## Instalación y uso básico

```python
pip install recipe-scrapers

from recipe_scrapers import scrape_html
import requests

url = "https://www.allrecipes.com/recipe/158968/spinach-and-feta-turkey-burgers/"
html = requests.get(url).text
scraper = scrape_html(html, org_url=url)

scraper.title()          # → "Spinach and Feta Turkey Burgers"
scraper.total_time()     # → 35
scraper.yields()         # → "4 servings"
scraper.ingredients()    # → ["1 lb ground turkey", "4 oz feta cheese", ...]
scraper.instructions()   # → "Step 1: Combine turkey..."
scraper.nutrients()      # → {"calories": "300", "fatContent": "12g", ...}
scraper.image()          # → URL de la imagen
```

## Sitios soportados (400+)

| Categoría | Ejemplos |
|---|---|
| **Grandes** | AllRecipes, Food Network, BBC Good Food, Epicurious |
| **Especializados** | KingArthurBaking, SeriousEats, BudgetBytes |
| **Internacionales** | Kochbar.de, Marmiton.org, Giallozafferano.it |
| **Blogs** | PinchOfYum, SallysBakingAddiction, MinimalistBaker |
| **Health** | EatingWell, Yummly, MyRecipes |

## Datos extraídos

| Campo | Método | Tipo |
|---|---|---|
| **Título** | `title()` | str |
| **Tiempo total** | `total_time()` | int (minutos) |
| **Tiempo preparación** | `prep_time()` | int |
| **Tiempo cocción** | `cook_time()` | int |
| **Raciones** | `yields()` | str |
| **Ingredientes** | `ingredients()` | list[str] |
| **Instrucciones** | `instructions()` | str |
| **Nutrición** | `nutrients()` | dict |
| **Imagen** | `image()` | str (URL) |
| **Categoría** | `category()` | str |
| **Cocina** | `cuisine()` | str |

## Uso con schema.org

La librería parsea automáticamente JSON-LD `schema.org/Recipe` cuando está disponible en la página. Fallback a scraping HTML directo para sitios sin schema.

## Valor para referencia

- Lista canónica de sitios de recetas internacionales con sus URLs
- Modelo de datos estándar para representar recetas (campos, tipos, validación)
- Patrón de extracción: JSON-LD → microdata → HTML scraping
- Base para importar recetas a cualquier sistema de gestión
