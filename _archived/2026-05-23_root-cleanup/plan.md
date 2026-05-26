# Plan: Refactoring sistema de ingredientes — grupos por categoría

## Concepto

Cada ingrediente pertenece a un **grupo** = categoría de producto (Pizzas, Bocadillos, Entrantes...).

### Reglas
- Los ingredientes de "Pizzas" solo se ofrecen a productos de categoría Pizzas
- Los ingredientes de "Bocadillos" solo para bocadillos. No se mezclan.
- **Quitar**: solo ingredientes que lleva el producto (ingredientes_base)
- **Añadir**: solo ingredientes del mismo grupo (misma categoría)

### Precios
- El jefe decide la política de precios, no la IA
- La IA pregunta al jefe y registra lo que diga
- Se pueden cambiar después: por tipo, por grupo, individualmente, por porcentaje

### UI (VariacionesPanel)
1. **Arriba**: ingredientes del producto (tap = rojo para quitar)
2. **Abajo**: ingredientes del grupo organizados por tipo con colores:
   - 🧀 Queso → amarillo
   - 🥬 Verdura → verde
   - 🍖 Carne/Embutido → rojo
   - 🐟 Pescado/Marisco → azul
   - 🍅 Salsa → naranja
   - 📦 Otro → gris

---

## Cambios por archivo

### 1. `menu-generator/index.js` — `transformCartaToPOS()`
- Cada ingrediente en `ingredientes_catalogo` recibe campo `grupo` = categoría del producto donde aparece
- Si mozzarella aparece en Pizzas y Bocadillos, tiene `grupos: ["pizzas", "bocadillos"]`
- `ingredientes_base` de cada producto también lleva `grupo`

### 2. `ingredientes/index.js`
- Almacenar `grupos[]` por ingrediente
- `onMenuGenerado`: merge de grupos si ingrediente ya existe
- `handleListIngredientes({ grupo })`: filtrar por grupo
- Nuevo handler `update_precios`: cambiar precios por tipo, grupo, individual, o porcentaje

### 3. `productos/index.js`
- `buildIngredientesCatalogo()`: asignar `grupo` = categoría del producto al ingrediente
- `handleCartaCompleta()`: devolver ingredientes con `grupos[]`

### 4. `variaciones/index.js`
- Almacenar `grupo` del producto en la configuración
- Al validar variación: solo permitir añadir ingredientes del mismo grupo

### 5. `frontend/VariacionesPanel.svelte` — refactoring UI
- Recibir `categoriaProducto` como prop
- Filtrar `catalogoIngredientes` por grupo = categoría del producto
- Organizar ingredientes extras por tipo con colores distintos por sección
- Cada sección de tipo tiene header con emoji + nombre + color de borde

### 6. `contexto/` — documentar nuevo sistema

---

## Orden de implementación

1. menu-generator — añadir `grupo` a ingredientes
2. ingredientes — almacenar grupos, filtro, handler update_precios
3. productos — propagar grupo en catálogo
4. variaciones — filtrar por grupo
5. frontend/VariacionesPanel — UI con tipos coloreados y filtro por grupo
6. contexto — documentar
