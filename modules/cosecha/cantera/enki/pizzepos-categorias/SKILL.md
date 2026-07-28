---
name: categorias
description: >-
  Catálogo multi-tenant de categorías de productos. Sincronizado desde
  carta.actualizada (subgrafo de cartas) + CRUD manual. Sin tools — solo
  UI handlers. Fuente de verdad: carta-manager. En memoria, se repuebla
  desde carta-manager en cada arranque.
fuente: enki
dominio: comercio
tags: [pizzepos, categorias, catalogo, carta, sync, crud, memoria]
---

# Pizzepos · categorias

> **Qué es.** Catálogo de categorías de productos. Se sincroniza automáticamente
> desde `carta-manager` cada vez que una carta se actualiza. También permite
> CRUD manual y reordenación desde la UI.
>
> **Sin tools:** el LLM no invoca categorías directamente — gestiona categorías
> a través de `carta-manager` (carta.add_category, carta.update_product, etc.).
>
> **En memoria:** la fuente de verdad es carta-manager. En cada arranque se
> repuebla desde `carta.actualizada`. No tiene persistencia propia.
>
> Código: `modules/pizzepos/categorias/index.js` · v`3.0.0`

---

## 1 · LÓGICA

### Ciclo de vida

```
carta-manager                    categorias
─────────────                    ──────────
carta.add_category.request
       │
       ▼
carta.actualizada ──────────→ onCartaActualizada()
                                  │
                                  ▼
                            sync: repuebla catálogo desde carta-manager
                            (carta.get.request)
       │
       ▼
                            UI: CRUD manual (create, update, reorder)
                            Emite: categoria.creada / actualizada / orden_actualizado
```

### Persistencia

**Ninguna.** Catálogo en memoria. En cada arranque:
1. `project.activated` → escucha `carta.actualizada`
2. Llega una carta → `onCartaActualizada` → repuebla desde carta-manager

---

## 2 · EVENTOS

### Publica

| Evento | Cuándo |
|--------|--------|
| `categoria.creada` | Nueva categoría (sync o manual) |
| `categoria.actualizada` | Categoría modificada (con diff de cambios) |
| `categoria.orden_actualizado` | Orden de categorías cambiado tras reorder |

### Escucha

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `carta.actualizada` | `onCartaActualizada` | Carta creada/modificada — sincroniza categorías |

---

## 3 · UI (frontend)

| Ruta | Handler | Zona |
|------|---------|------|
| `categorias.list` | `handleListCategorias` | barra_modulos |
| `categorias.get` | `handleGetCategoria` | barra_modulos |
| `categorias.create` | `handleCreateCategoria` | barra_modulos |
| `categorias.update` | `handleUpdateCategoria` | barra_modulos |
| `categorias.reorder` | `handleReorderCategorias` | barra_modulos |
| `categorias.health` | `handleHealthCheck` | barra_modulos |
| `categorias.metrics` | `handleGetMetrics` | barra_modulos |

---

## 4 · INTEGRACIÓN

> **Este módulo NO tiene tools.** Para gestionar categorías desde el LLM, usa
> `carta-manager`: `carta.add_category.request`, `carta.update_product.request`
> (cambia `categoria_id` del producto), etc.

> **Fuente de verdad:** `carta-manager`. Categorias es una proyección en memoria.
> Los cambios manuales (create/update/reorder) se emiten como eventos pero la
> carta-manager es quien persiste.

> **Sync automático:** cada `carta.actualizada` repuebla el catálogo entero.
> No hay sync incremental — es full-replace sobre el project_id de la carta.
