# Pasada 3 — Componer pedido (el corazón de la vía operativa)

**Sujeto:** Las operaciones de composición — añadir, modificar y quitar items de un pedido.

---

## 1. IDENTIDAD

Componer es **mutar la lista de items** del pedido. Cada mutación es atómica (afecta un item a la vez) y recalcula el total.

Sub-productos:
- **Añadir item** — elegir producto, cantidad, variaciones, notas → crear línea (ATÓMICO — conversor, puerto: `ejecutar(comando)`)
- **Modificar item** — cambiar cantidad o variaciones de un item existente (ATÓMICO — conversor, puerto: `ejecutar(comando)`)
- **Quitar item** — eliminar una línea del pedido (ATÓMICO — conversor, puerto: `ejecutar(comando)`)

## 2. RESTRICCIONES

- Solo en estado `borrador` (guarda de estado — REF → Guardas de transición).
- Añadir item necesita seleccionar un producto válido de la carta (REF → Resolución de producto).
- Las variaciones dependen del producto seleccionado (la carta define qué variaciones tiene cada producto).

Sub-productos:
- **Selector de producto** — buscar/elegir de la carta para añadir (ATÓMICO — puente, puerto: `consultar(dominio, criterio)`)
- **Selector de variaciones** — elegir variaciones válidas del producto seleccionado (ATÓMICO — puente, puerto: `consultar(dominio, id)`)

## 3. CONTRATO

- Cada mutación devuelve el item actualizado y el total recalculado.
- La lista de items refleja el estado real tras cada operación.

---

**Productos que salen:**
- Añadir, Modificar, Quitar item → **ATÓMICO** (conversor cada uno)
- Selector de producto, Selector de variaciones → **ATÓMICO** (puente cada uno)
- Guardas, Resolución → **REF**
