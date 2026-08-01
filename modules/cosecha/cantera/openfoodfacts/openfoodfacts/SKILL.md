---
name: openfoodfacts
fuente: openfoodfacts
url: https://github.com/openfoodfacts
version: 2025-07
tipo: referencia
dominio: cocina
tags: [alimentos, nutricion, base-datos, ingredientes, open-data, api, barcode]
---

# Open Food Facts — Base de datos libre de alimentos

El mayor proyecto colaborativo de datos de alimentación (servidor 1k+, app 1.3k+ estrellas). Base de datos abierta con información nutricional, ingredientes, alérgenos y Nutri-Score de millones de productos.

## Alcance

| Métrica | Valor |
|---|---|
| **Productos** | 3M+ en la base de datos |
| **Países** | 180+ |
| **Contribuidores** | 30k+ |
| **Escaneos/día** | 100k+ |
| **Licencia** | Open Database License (ODbL) |

## Datos por producto

| Campo | Ejemplo |
|---|---|
| **Código de barras** | 3017620422003 |
| **Nombre** | Nutella |
| **Marcas** | Ferrero |
| **Ingredientes** | Azúcar, aceite de palma, avellanas 13%... |
| **Nutri-Score** | E |
| **NOVA** | 4 (ultra-procesado) |
| **Alérgenos** | Leche, frutos secos, soja |
| **Nutrición/100g** | Energía 2252kJ, grasas 30.9g, azúcares 56.3g... |
| **Eco-Score** | C |
| **Categorías** | Untables, Untables dulces, Cremas de chocolate |

## API

```bash
# Buscar producto por barcode
GET https://world.openfoodfacts.org/api/v2/product/3017620422003

# Buscar productos
GET https://world.openfoodfacts.org/cgi/search.pl?search_terms=paella&json=1

# Productos por categoría
GET https://world.openfoodfacts.org/category/olive-oils.json

# Productos por país
GET https://es.openfoodfacts.org/  (dominio por país)
```

## SDK Python

```python
from openfoodfacts import API

api = API(user_agent="MiApp/1.0")

product = api.product.get("3017620422003")
print(product["product"]["nutriscore_grade"])  # → "e"
print(product["product"]["ingredients_text"])
print(product["product"]["nutriments"]["energy-kcal_100g"])
```

## Taxonomías

Open Food Facts mantiene taxonomías multilingües abiertas:

| Taxonomía | Uso |
|---|---|
| **Categorías** | Clasificación de productos (jerarquía) |
| **Ingredientes** | Nombres normalizados en 40+ idiomas |
| **Alérgenos** | EU + FDA estándares |
| **Aditivos** | E-numbers con riesgo y función |
| **Países** | Donde se vende el producto |
| **Etiquetas** | Bio, comercio justo, vegano, halal, kosher |

## Valor para referencia

- Base de datos de ingredientes y nutrición más grande del mundo (abierta)
- Taxonomía de alérgenos estandarizada
- Nutri-Score y NOVA calculados — referencia para evaluación nutricional
- API gratuita sin limits agresivos — ideal para integrar en apps de cocina
