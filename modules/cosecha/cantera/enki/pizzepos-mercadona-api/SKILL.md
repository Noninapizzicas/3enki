---
name: mercadona-api
description: >-
  Cliente HTTP no oficial de la API de tienda.mercadona.es. Provee precios
  y catálogo de productos del supermercado para que escandallo pueda estimar
  coste de recetas. Caché en memoria TTL 48h. Throttle 2 req/s + backoff.
  Sin credenciales. 2 tools: producto.obtener, categorias.listar.
fuente: enki
dominio: infraestructura
tags: [mercadona, api, precios, catalogo, escandallo, food-cost, cache]
---

# Mercadona API

> **Qué es.** Cliente HTTP para la API pública (no oficial) de Mercadona.
> Proporciona precios de productos y navegación del catálogo para que
> `escandallo` pueda estimar el coste de una receta sin tener catálogo
> de precios propio.
>
> **Infraestructura JS determinista:** IO HTTP externa, latencia <1s,
> sin razonamiento del dominio. Caché en memoria TTL 48h.
>
> Código: `modules/pizzepos/mercadona-api/index.js` · v`1.0.0`

---

## 1 · LÓGICA

### Cómo funciona

```
LLM / escandallo              mercadona-api                Mercadona API
─────────────────             ────────────                 ────────────
mercadona.categorias.listar
  → { parent_id } ──────────→ onCategoriasListar()
                                ├─ ¿en caché? → sí → respuesta
                                └─ no → GET /api/categories/{id} ──→
                                       ← { categories, products } ←─
                                       → guarda en caché 48h
                                       → respuesta

mercadona.producto.obtener
  → { producto_id } ────────→ onProductoObtener()
                                ├─ ¿en caché? → sí → respuesta
                                └─ no → GET /api/products/{id} ────→
                                       ← { name, price, ... } ←────
                                       → guarda en caché 48h
                                       → respuesta
```

### Cache

| Aspecto | Valor |
|---------|-------|
| TTL | 48h (configurable: `cache_ttl_hours`) |
| Persistencia | En memoria (se pierde al reiniciar) |
| Estrategia | LRU por clave (project_slug + producto_id) |

### Throttle

| Aspecto | Valor |
|---------|-------|
| Máximo | 2 req/s |
| Backoff | Exponencial sobre HTTP 429 |
| Timeout | 10s por request |
| Reintentos | 2 máximos |

### Postcode

Default: `30840` (Murcia). Configurable por proyecto en su metadata.

---

## 2 · TOOLS (invocables por LLM)

### `mercadona.producto.obtener`

```jsonc
{ "producto_id": "34180", "postcode": "28001", "project_id": "uuid" }
// → 200
{
  "id": "34180",
  "nombre": "Mozzarella Pizza Lasemana Entera",
  "marca": "Lasemana",
  "formato": "200 g",
  "precio_unidad": 2.30,
  "precio_kg": 11.50,
  "alergenos": ["lacteos"],
  "imagen_url": "https://...",
  "categoria": "Quesos"
}
```

Errores: `404 RESOURCE_NOT_FOUND`, `429 RATE_LIMITED`, `503 UPSTREAM_UNREACHABLE`.

### `mercadona.categorias.listar`

```jsonc
// Sin argumentos → top-level
{}
// → 200 { "categorias": [{ "id": "1", "name": "Aceite y especias" }, ...] }

// Con parent_id → subcategorías + productos
{ "parent_id": "1" }
// → 200 {
//     "categorias": [{ "id": "101", "name": "Aceite de oliva" }],
//     "productos": [{ "id": "12345", "name": "Aceite de Oliva Virgen Extra", "slug": "..." }]
//   }
```

Usado por el LLM para navegar el catálogo cuando busca un ingrediente
por nombre (no hay endpoint de búsqueda directa).

---

## 3 · EVENTOS

### Publica

| Evento | Cuándo |
|--------|--------|
| `mercadona.precio.obtenido` | Precio resuelto desde la API (otros módulos pueden cachearlo) |

### Escucha

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `project.activated` | `onProjectActivated` | Cachea proyecto + postcode |
| `project.deactivated` | `onProjectDeactivated` | No-op (preserva caché) |
| `mercadona.producto.obtener.request` | `onProductoObtener` | Detalle de producto por id |
| `mercadona.categorias.listar.request` | `onCategoriasListar` | Árbol de categorías |

---

## 4 · FLUJO TÍPICO

### Escandallo busca precio de mozzarella

```
1. ESCANDALLO necesita    → precio de "mozzarella" no está en catálogo local
2. LLM Navega             → mercadona.categorias.listar → "Quesos" (id: XXX)
3. LLM Busca              → mercadona.categorias.listar { parent_id: XXX }
                           → encuentra "Mozzarella Pizza Lasemana" (id: 34180)
4. LLM Obtiene precio     → mercadona.producto.obtener { producto_id: "34180" }
                           → { precio: 2.30€, precio_kg: 11.50€ }
5. ESCANDALLO usa precio  → para costear la receta
```

---

## 5 · INTEGRACIÓN

> **Tools:** `mercadona.producto.obtener` (precio por id), `mercadona.categorias.listar`
> (navegar catálogo). Usadas por escandallo para completar precios faltantes.

> **Sin credenciales:** la API de Mercadona es pública de facto (no oficial).

> **Caché en memoria:** TTL 48h. Al reiniciar se rehidrata desde Mercadona.

> **Trabajo pendiente:** (1) integrar Algolia para búsqueda por nombre,
> (2) resolver warehouse desde postcode, (3) persistir caché a disco si los
> precios fueran críticos para auditoría.
