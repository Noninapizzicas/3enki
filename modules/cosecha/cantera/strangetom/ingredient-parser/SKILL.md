---
name: ingredient-parser
fuente: strangetom
url: https://github.com/strangetom/ingredient-parser
version: 2025-07
tipo: referencia
dominio: cocina
tags: [parser, ingredientes, nlp, python, recetas, unidades]
---

# ingredient-parser — Parser NLP de ingredientes

Librería Python (160+ estrellas) que convierte texto libre de ingredientes en datos estructurados usando NLP. Resuelve el problema más difícil del parsing de recetas: entender "2 cucharadas de aceite de oliva virgen extra" como {amount: 2, unit: "cucharadas", name: "aceite de oliva virgen extra"}.

## Uso

```python
from ingredient_parser import parse_ingredient

result = parse_ingredient("2 tablespoons extra virgin olive oil")
# → ParsedIngredient(
#     name="extra virgin olive oil",
#     amount=[Amount(quantity=2, unit="tablespoons")],
#     comment=None,
#     preparation=None
# )

result = parse_ingredient("1 large onion, finely diced")
# → ParsedIngredient(
#     name="onion",
#     amount=[Amount(quantity=1, unit=None)],
#     comment=None,
#     preparation="finely diced",
#     size="large"
# )
```

## Campos extraídos

| Campo | Descripción | Ejemplo |
|---|---|---|
| **name** | Nombre del ingrediente | "olive oil" |
| **quantity** | Cantidad numérica | 2, 0.5, "1/3" |
| **unit** | Unidad de medida | "tablespoons", "cups", "g" |
| **preparation** | Forma de preparación | "finely diced", "minced" |
| **size** | Tamaño | "large", "medium" |
| **comment** | Nota adicional | "or to taste", "optional" |

## Casos difíciles que resuelve

| Input | Parsing |
|---|---|
| "salt and pepper to taste" | name: "salt and pepper", comment: "to taste" |
| "2-3 cloves garlic, minced" | quantity: "2-3", name: "garlic", prep: "minced" |
| "1 (14.5 oz) can diced tomatoes" | quantity: 1, unit: "can", size: "14.5 oz", name: "diced tomatoes" |
| "juice of 2 lemons" | quantity: 2, name: "lemons", prep: "juiced" |

## Valor para referencia

- Solución al parsing de ingredientes en lenguaje natural — el cuello de botella de toda app de recetas
- Modelo NLP entrenado específicamente para texto culinario
- Manejo de fracciones, rangos, unidades ambiguas, parentéticos
- Complementa recipe-scrapers: el scraper extrae, el parser estructura
