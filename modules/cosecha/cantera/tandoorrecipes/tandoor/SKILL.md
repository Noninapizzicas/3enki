---
name: tandoor
fuente: tandoorrecipes
url: https://github.com/TandoorRecipes/recipes
version: 2025-07
tipo: referencia
dominio: cocina
tags: [recetas, self-hosted, django, meal-planning, shopping-list, docker]
---

# Tandoor Recipes — Gestor de recetas Django

Gestor de recetas self-hosted (8.5k+ estrellas) con enfoque en familias y cocina real. Django + PostgreSQL, planificación de comidas, listas de compra y libros de cocina.

## Funcionalidades destacadas

| Función | Descripción |
|---|---|
| **Editor de recetas** | Editor visual con pasos, ingredientes, tiempos |
| **Importación** | Desde URL (schema.org), PDF, imagen (OCR), manual |
| **Meal plan** | Calendario de comidas con drag-and-drop |
| **Shopping list** | Automática desde meal plan, compartible en tiempo real |
| **Libros de cocina** | Agrupa recetas en colecciones |
| **Conversión unidades** | Sistema integrado de conversión |
| **Multi-usuario** | Espacios por familia/grupo, invitaciones |
| **Compartir** | Links públicos de receta sin login |

## Despliegue

```yaml
services:
  tandoor:
    image: vabene1111/recipes:latest
    ports:
      - "8080:8080"
    environment:
      DB_ENGINE: django.db.backends.postgresql
      POSTGRES_HOST: db
      SECRET_KEY: "..."
      TIMEZONE: Europe/Madrid
    volumes:
      - staticfiles:/opt/recipes/staticfiles
      - mediafiles:/opt/recipes/mediafiles
```

## Modelo de datos

| Entidad | Campos clave |
|---|---|
| **Recipe** | name, description, servings, working_time, waiting_time, source_url |
| **Step** | instruction, time, order, ingredients[] |
| **Ingredient** | food (ref), unit (ref), amount, note |
| **Food** | name, plural_name, supermarket_category, recipe (sub-receta) |
| **Unit** | name, plural_name, base_unit, conversiones |
| **MealPlan** | recipe, date, meal_type (breakfast/lunch/dinner), servings |
| **ShoppingList** | entries[], created_by, shared[] |

## Clientes

| App | Plataforma | Repo |
|---|---|---|
| **kitshn** | Android/iOS/Desktop (KMP) | aimok04/kitshn (707 stars) |
| **Web** | Incluida en Tandoor | — |

## Valor para referencia

- Modelo de datos maduro para recetas con sub-recetas (receta como ingrediente)
- Sistema de conversión de unidades extensible
- Categorización de ingredientes por pasillo de supermercado
- API REST completa con autenticación por token
