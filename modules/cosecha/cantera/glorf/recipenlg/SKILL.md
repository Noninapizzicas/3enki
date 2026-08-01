---
name: recipenlg
fuente: glorf
url: https://github.com/Glorf/recipenlg
version: 2025-07
tipo: referencia
dominio: cocina
tags: [dataset, nlp, recetas, machine-learning, generacion, corpus]
---

# RecipeNLG — Dataset de 2M+ recetas para NLP

El mayor dataset abierto de recetas para procesamiento de lenguaje natural (627+ estrellas). 2.2 millones de recetas extraídas y estructuradas para entrenar modelos de generación de recetas.

## Dataset

| Métrica | Valor |
|---|---|
| **Recetas** | 2,231,142 |
| **Fuente** | Recetas web (RecipeNow, GeniusKitchen, AllRecipes) |
| **Formato** | CSV (title, ingredients, directions, link, source, NER) |
| **Tamaño** | ~2 GB comprimido |
| **Licencia** | Uso académico / investigación |

## Estructura de cada entrada

```csv
title,ingredients,directions,link,source,NER
"Classic Guacamole","[""3 avocados"",""1 lime"",""1 tsp salt"",""1/2 cup cilantro""]","[""Mash avocados..."",""Stir in lime juice...""]","https://...","AllRecipes","[""avocados"",""lime"",""salt"",""cilantro""]"
```

## Campo NER (Named Entity Recognition)

Cada receta incluye entidades extraídas de ingredientes: solo el nombre del ingrediente sin cantidad ni unidad. Útil para:
- Búsqueda semántica por ingrediente
- Grafos de co-ocurrencia de ingredientes
- Sustitución de ingredientes
- Clustering de recetas por ingredientes compartidos

## Uso típico

```python
import pandas as pd

df = pd.read_csv("full_dataset.csv")

# Recetas con aguacate
aguacate = df[df["NER"].str.contains("avocado")]

# Ingredientes más comunes
from collections import Counter
all_ner = df["NER"].apply(eval).explode()
Counter(all_ner).most_common(20)
```

## Valor para referencia

- Corpus masivo para analizar patrones culinarios (combinaciones, frecuencias)
- NER pre-extraído — nombres de ingredientes normalizados
- Base para generar recetas con LLMs (fine-tuning o few-shot)
- Benchmark para tareas de NLP culinario
