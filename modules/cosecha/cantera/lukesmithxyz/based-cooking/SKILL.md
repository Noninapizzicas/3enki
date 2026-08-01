---
name: based-cooking
fuente: lukesmithxyz
url: https://github.com/LukeSmithxyz/based.cooking
version: 2025-07
tipo: referencia
dominio: cocina
tags: [recetas, markdown, minimalista, web, community, ssg]
---

# based.cooking — Recetas en Markdown puro

Sitio de recetas minimalista (2.3k+ estrellas) donde cada receta es un archivo Markdown. Sin JavaScript, sin tracking, sin anuncios. Community-driven via PRs.

## Formato de receta

```markdown
---
title: Gazpacho
tags: ['spanish', 'soup', 'cold', 'vegetarian', 'no-cook']
---

- 1 kg tomates maduros
- 1 pepino
- 1 pimiento verde
- 2 dientes de ajo
- 100 ml aceite de oliva virgen extra
- 30 ml vinagre de Jerez
- Sal al gusto
- Pan del día anterior (opcional)

Triturar todos los ingredientes en batidora hasta obtener textura
lisa. Colar si se prefiere sin pieles. Refrigerar mínimo 2 horas.
Servir con tropezones (pepino, pimiento, cebolla, huevo duro picados).
```

## Estructura

```
based.cooking/
├── src/          → recetas individuales en .md
├── index.html    → página principal (SSG)
├── Makefile      → genera el sitio estático
└── style.css     → CSS mínimo
```

## Tags como sistema de categorización

Las recetas se etiquetan con tags libres que funcionan como filtros:

| Tipo de tag | Ejemplos |
|---|---|
| **Cocina** | spanish, italian, mexican, chinese, indian |
| **Tipo** | soup, salad, main, dessert, breakfast, snack |
| **Dieta** | vegetarian, vegan, keto, no-cook, quick |
| **Ingrediente** | chicken, beef, fish, rice, pasta |
| **Técnica** | grilled, baked, fried, fermented, raw |

## Valor para referencia

- Formato de receta más simple posible — Markdown + frontmatter YAML
- Modelo de contribución community-driven via Git/PRs
- Tags como taxonomía emergente (no predefinida)
- Sin dependencias — pure static site generation con Make
