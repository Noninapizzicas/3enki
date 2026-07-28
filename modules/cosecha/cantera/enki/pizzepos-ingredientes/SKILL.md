---
name: ingredientes
description: >-
  Catálogo de ingredientes organizado por GRUPO (categoría de producto).
  Fuente única de precios (precio_extra) para el subsistema Opciones.
  Sincronizado desde carta.actualizada. Sin tools — los ingredientes
  se consultan desde variaciones, escandallo y comandero.
  Fuente de verdad: carta-manager (la carta).
fuente: enki
dominio: comercio
tags: [pizzepos, ingredientes, catalogo, precio, alergenos, grupo, carta]
---

# Pizzepos · ingredientes

> **Qué es.** El catálogo de ingredientes del POS. Organizado por GRUPO
> (categoría de producto: pizzas, pastas, bebidas...). Es la **fuente única**
> de `precio_extra` de cada ingrediente — variaciones, escandallo y comandero
> consultan aquí para tasar extras.
>
> **Sin tools:** no se invoca desde el LLM directamente. Los ingredientes
> se gestionan a través de la carta (carta-manager). Este módulo es un
> catálogo de consulta para el resto del sistema.
>
> Código: `modules/pizzepos/ingredientes/index.js` · v`5.0.0`

---

## 1 · LÓGICA

### Ciclo de sincronización

```
carta-manager                     ingredientes
─────────────                     ────────────
carta.actualizada ──────────────→ onCartaActualizada()
                                    │
                                    ├─ Extrae ingredientes de todos los productos
                                    ├─ Agrupa por categoría
                                    ├─ Persiste ingredientes.json
                                    └─ Emite ingrediente.creado/actualizado
                                    
producto.creado ────────────────→ onProductoCreado()
                                    └─ Registra ingredientes en su grupo
```

### Por qué es la fuente única de precios

Cuando el comandero añade un item con extras, necesita saber cuánto cuesta
cada extra. En lugar de preguntar a la carta (que puede tener precios por
canal), consulta a `ingredientes.get_precio` que devuelve el `precio_extra`
canónico del ingrediente.

### Grupos

Los ingredientes se organizan por GRUPO = categoría del producto al que
pertenecen. Una pizza Margarita tiene sus ingredientes en el grupo "pizzas".
Esto permite al frontend mostrar "Extras de pizzas" vs "Extras de pastas".

### Alérgenos

Cada ingrediente puede marcarse como alérgeno. El módulo expone
`handleListAlergenos` para que el frontend muestre la tabla de alérgenos
obligatoria.

---

## 2 · UI (frontend)

| Ruta | Handler | Zona |
|------|---------|------|
| `ingredientes.list` | `handleListIngredientes` | barra_modulos |
| `ingredientes.get` | `handleGetIngrediente` | barra_modulos |
| `ingredientes.get_precio` | `handleGetPrecio` | barra_modulos |
| `ingredientes.search` | `handleSearchIngredientes` | barra_modulos |
| `ingredientes.alergenos` | `handleListAlergenos` | barra_modulos |
| `ingredientes.update` | `handleUpdateIngrediente` | barra_modulos |
| `ingredientes.update_precios` | `handleUpdatePrecios` | barra_modulos |
| `ingredientes.health` | `handleHealthCheck` | barra_modulos |
| `ingredientes.metrics` | `handleGetMetrics` | barra_modulos |

---

## 3 · EVENTOS

### Publica

| Evento | Cuándo |
|--------|--------|
| `ingrediente.creado` | Nuevo ingrediente desde carta o producto |
| `ingrediente.actualizado` | Ingrediente modificado (nombre, precio, grupo, alérgeno) con diff |

### Escucha

| Evento | Handler | Procedencia |
|--------|---------|-------------|
| `project.activated` | `onProjectActivated` | Storage path + carga desde disco |
| `carta.actualizada` | `onCartaActualizada` | Sync ingredientes + extrae de productos |
| `producto.creado` | `onProductoCreado` | Registra ingredientes en su grupo |
| `ingrediente.actualizado` (externo) | `onIngredienteActualizadoExterno` | Sync desde menu-generator (loop-safe) |

---

## 4 · FLUJO TÍPICO

### Cuando un cliente pide una pizza con extra

```
1. COMANDERO recibe       → "Margarita con champiñón extra"
2. VARIACIONES valida      → ¿champiñón en permite_anadir? → ✅
3. VARIACIONES consulta    → ingredientes.get_precio("champinon") → 0.50€
4. COMANDERO tasa          → precio_final = precio_base + 0.50€
5. CUENTAS actualiza       → total con extra
```

### Sincronización desde carta

```
1. CARTA-MANAGER recibe    → carta.save (menú nuevo)
2. INGREDIENTES recibe     → carta.actualizada
3. Extrae ingredientes     → de todos los productos de la carta
4. Agrupa por categoría    → "pizzas": [mozzarella, tomate, champinón...]
5. Persiste                → ingredientes.json
6. VARIACIONES actualiza   → paletas ELEGIR_VARIOS disponibles
```

---

## 5 · INTEGRACIÓN

> **Este módulo NO tiene tools.** Los ingredientes se consultan desde otros
> módulos vía RPC: `variaciones.calcular_precio`, `escandallo.costear`.

> **Fuente de verdad:** carta-manager. Ingredientes se sincroniza desde la
> carta. No crear ingredientes sueltos — se crean al definir productos en
> la carta.

> **Precio extra:** es el coste de añadir ese ingrediente como extra.
> 0.50€ por defecto (lo pone menu-generator). Se puede cambiar vía
> `ingredientes.update_precios` o `carta-manager.update_extras`.

> **Persistencia:** `data/projects/<id>/storage/pizzepos/ingredientes.json`.
> Atómico, single-writer.
