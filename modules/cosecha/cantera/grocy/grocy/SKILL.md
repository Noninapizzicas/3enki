---
name: grocy
fuente: grocy
url: https://github.com/grocy/grocy
version: 2025-07
tipo: referencia
dominio: cocina
tags: [despensa, inventario, recetas, meal-planning, self-hosted, php, erp]
---

# grocy — ERP doméstico para cocina y despensa

Gestión de hogar más allá de la nevera (9.3k+ estrellas). Controla inventario de despensa, caducidades, recetas, planificación de comidas, lista de compra y tareas del hogar. PHP + SQLite, self-hosted.

## Funcionalidades de cocina

| Módulo | Descripción |
|---|---|
| **Inventario** | Stock de ingredientes con ubicación, caducidad, cantidad |
| **Recetas** | Con ingredientes vinculados al inventario |
| **Meal plan** | Planificación semanal, descuenta del inventario |
| **Shopping list** | Generada desde recetas faltantes en inventario |
| **Caducidades** | Alertas de productos próximos a caducar |
| **Barcode** | Escaneo de códigos de barras para entrada rápida |

## Flujo cocina-inventario

```
1. Añadir receta con ingredientes (linked a productos del inventario)
2. Planificar comida en el meal plan
3. grocy verifica stock disponible
4. Genera lista de compra con lo que falta
5. Comprar → escanear → entra al inventario
6. Cocinar → descuenta ingredientes automáticamente
```

## API REST

```bash
# Stock actual
GET /api/stock

# Productos por caducidad
GET /api/stock/volatile?due_soon_days=5

# Consumir producto (cocinar)
POST /api/stock/products/{id}/consume
{"amount": 2, "spoiled": false}

# Recetas
GET /api/objects/recipes
```

## Modelo de datos

| Entidad | Campos |
|---|---|
| **Product** | name, location, min_stock_amount, default_best_before_days, qu_id_purchase, qu_id_stock |
| **Recipe** | name, description, servings, type (normal/mealplan-day) |
| **RecipePos** | recipe_id, product_id, amount, qu_id, only_check_single_unit_in_stock |
| **StockEntry** | product_id, amount, best_before_date, purchased_date, location_id |
| **MealPlanEntry** | day, type (breakfast/lunch/dinner), recipe_id |

## Valor para referencia

- Modelo de gestión de inventario doméstico (FIFO, caducidades, ubicaciones)
- Integración recetas↔inventario (descuento automático al cocinar)
- Unidades de medida con conversión (compra en packs, stock en unidades)
- Barcode scanning con base de datos de productos
