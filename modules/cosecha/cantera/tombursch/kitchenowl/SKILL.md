---
name: kitchenowl
fuente: tombursch
url: https://github.com/TomBursch/kitchenowl
version: 2025-07
tipo: referencia
dominio: cocina
tags: [recetas, lista-compra, self-hosted, flutter, flask, meal-planning]
---

# KitchenOwl — Gestor de compras y recetas (Flutter)

Gestor self-hosted de lista de compra y recetas (3.5k+ estrellas). App nativa multiplataforma (Flutter) con backend Flask. Enfoque en la experiencia de compra y planificación de comidas familiar.

## Stack

| Componente | Tecnología |
|---|---|
| **App** | Flutter (Android, iOS, Web, Desktop) |
| **Backend** | Python (Flask) |
| **Base de datos** | SQLite |
| **Despliegue** | Docker |

## Funcionalidades

| Función | Descripción |
|---|---|
| **Lista de compra** | Colaborativa en tiempo real, categorizada por pasillo |
| **Recetas** | Editor con ingredientes, pasos, tags, imágenes |
| **Meal plan** | Planificación semanal con generación automática de lista |
| **Gastos** | Tracking de gastos por categoría |
| **Hogar** | Multi-usuario, hogares compartidos |
| **Importar** | Desde URL (recipe-scrapers) |
| **Sugerencias** | Aprende de compras frecuentes |

## Despliegue

```yaml
services:
  kitchenowl:
    image: tombursch/kitchenowl:latest
    ports:
      - "8080:8080"
    environment:
      JWT_SECRET_KEY: "..."
    volumes:
      - kitchenowl-data:/data
```

## Valor para referencia

- App Flutter multiplataforma con backend Python — patrón full-stack mobile
- Lista de compra inteligente con sugerencias basadas en historial
- Integración con recipe-scrapers para importar recetas
- Diseño mobile-first para uso en el supermercado
