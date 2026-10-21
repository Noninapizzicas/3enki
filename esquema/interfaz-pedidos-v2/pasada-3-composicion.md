# Pasada 3 — Composición del pedido (estructura de items)

**Sujeto:** La estructura interna del pedido — los items que lo forman.

---

## 1. IDENTIDAD

La composición es la **lista ordenada de items** que forman el pedido. Cada item es una línea con producto, cantidad, variaciones opcionales y notas.

Sub-productos:
- **Item** — la unidad: { producto, cantidad, variaciones, notas, subtotal } (ATÓMICO — reflejo)
- **Orden** — los items mantienen el orden de inserción (ATÓMICO — reflejo)

## 2. RESTRICCIONES

- Un item sin producto no existe (el producto es obligatorio).
- La cantidad es siempre ≥ 1.
- Las variaciones son opcionales y dependen de lo que el producto permita.
- El subtotal se calcula: precio_unitario × cantidad + variaciones.

## 3. CONTRATO

- La composición es consistente: la suma de subtotals = total del pedido.
- Cada item es independiente: modificar uno no afecta a los demás.

---

**Productos que salen:**
- Item, Orden → **ATÓMICO** (reflejo)
- Todo convergió — no hay más SPAWN.
