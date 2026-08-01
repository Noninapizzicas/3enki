---
name: meanrecipe
fuente: schollz
url: https://github.com/schollz/meanrecipe
version: 2025-07
tipo: referencia
dominio: cocina
tags: [recetas, consenso, clustering, go, ingredientes, promedio]
---

# meanrecipe — Receta promedio por consenso

Herramienta (164+ estrellas) que busca múltiples versiones de una receta online, extrae ingredientes y calcula la receta "promedio" por clustering. Responde a: "¿cuál es la receta REAL de X?"

## Concepto

```
Input: "banana bread"
  → Busca 30+ recetas online
  → Extrae ingredientes de cada una
  → Normaliza unidades
  → Agrupa por ingrediente
  → Calcula mediana de cantidades
Output: LA receta consenso de banana bread
```

## Uso

```bash
# Instalar
go install github.com/schollz/meanrecipe@latest

# Obtener receta promedio
meanrecipe --recipe "paella"
meanrecipe --recipe "chocolate chip cookies"
meanrecipe --recipe "hummus"
```

## Ejemplo de salida

```
Banana Bread (consensus from 34 recipes)

3       cups    flour
1.5     cups    sugar
2       whole   eggs
3       whole   bananas
0.33    cups    butter
1       tsp     baking soda
1       tsp     vanilla extract
0.5     tsp     salt
```

## También: ingredients (134+ estrellas)

Del mismo autor: `schollz/ingredients` — extrae ingredientes de cualquier URL de receta (Go).

```go
import "github.com/schollz/ingredients"

recipe, _ := ingredients.NewFromURL("https://www.allrecipes.com/recipe/...")
for _, ing := range recipe.Ingredients {
    fmt.Printf("%s %s %s\n", ing.Measure.Amount, ing.Measure.Name, ing.Name)
}
```

## Valor para referencia

- Algoritmo de consenso para obtener la "verdad" de una receta
- Normalización de unidades de cocina (cups, tbsp, tsp ↔ ml, g)
- Clustering de ingredientes por nombre con variantes
- Patrón útil: cuando hay 100 versiones, la mediana es la receta canónica
