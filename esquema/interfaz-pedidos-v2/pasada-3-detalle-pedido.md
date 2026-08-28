# Pasada 3 — Detalle de pedido (la pieza central de la vía de consulta)

**Sujeto:** La vista de un pedido concreto — todo lo que muestra cuando abres uno.

---

## 1. IDENTIDAD

El detalle es la **radiografía de un pedido**: muestra todo lo que tiene dentro y en qué momento de su vida está. Se abre desde la lista (cadena de ids: lista → detalle).

Sub-productos:
- **Cabecera** — id, estado actual (con indicador visual), canal de origen, timestamps (ATÓMICO — reflejo)
- **Lista de items** — cada item con producto, cantidad, variaciones, notas, subtotal (ATÓMICO — reflejo)
- **Total** — suma viva de los items (ATÓMICO — reflejo)
- **Barra de estado** — el ciclo de vida con el punto actual marcado (ATÓMICO — reflejo)
- **Acciones contextuales** — las operaciones disponibles según el estado actual (ATÓMICO — micro-agente fuzzy)

## 2. RESTRICCIONES

- El detalle se carga desde un id (puerto: `consultar(id)`) — necesita que la lista proporcione ese id.
- Los items muestran el nombre del producto resuelto, no solo el id crudo (puerto: `consultar(dominio, id)` para resolver la referencia).
- Las acciones contextuales dependen del estado — solo las válidas se muestran activas (REF → Guardas de transición).

Sub-productos:
- **Resolución de nombre** — el item muestra "Margarita" no "prod_abc123" (ATÓMICO — puente, puerto: `consultar(dominio, id)`)

## 3. CONTRATO

- El detalle se actualiza en vivo cuando el pedido cambia (REF → Reflejo en vivo).
- Las acciones contextuales ejecutan operaciones de la vía operativa desde dentro del detalle (puente: consulta → operativa).

---

**Productos que salen:**
- Cabecera, Lista de items, Total, Barra de estado → **ATÓMICO** (reflejo cada uno)
- Acciones contextuales → **ATÓMICO** (micro-agente fuzzy — depende del estado para decidir qué ofrecer)
- Resolución de nombre → **ATÓMICO** (puente)
- Guardas, Reflejo en vivo → **REF**
