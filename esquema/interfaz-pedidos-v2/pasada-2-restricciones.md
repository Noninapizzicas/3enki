# Pasada 2 — Restricciones (guardas, superficie, concurrencia)

**Sujeto:** Lo que limita la interfaz — las restricciones que condicionan ambas vías.

---

## 1. Guardas de transición (ATÓMICO — reflejo)

Cada estado del pedido permite un subconjunto de operaciones. Las guardas son un reflejo del grafo de estados: dada la posición actual del pedido, ciertas operaciones se habilitan y otras se bloquean.

- `borrador` → permite: add-item, update-item, delete-item, confirmar, cancelar
- `creado` → permite: send-kitchen, cancelar
- `enviado_cocina` → permite: complete, cancelar
- `completado` / `cancelado` → terminales, no permiten nada

La interfaz deshabilita los controles bloqueados — no esconde, deshabilita (el actor entiende qué existe pero qué no puede hacer ahora).

## 2. Superficie por actor (SPAWN)

Cada actor ve una superficie distinta de la misma interfaz:

- **Cliente** — solo su pedido. Vía operativa reducida (crear, componer, confirmar). Sin vía de consulta global.
- **Trabajador** — todos los pedidos del turno. Ambas vías completas. Puede operar cualquier pedido en estado permitido.
- **Jefe** — todos los pedidos, todos los filtros. Vía de consulta completa. Vía operativa limitada (puede cancelar, no suele crear).

Sub-productos:
- **Vista cliente** — la mínima: un pedido, sus items, confirmar (ATÓMICO — reflejo)
- **Vista trabajador** — la completa: lista + detalle + todas las operaciones (ATÓMICO — reflejo)
- **Vista jefe** — consulta enriquecida: filtros extra, sin composición de pedidos (ATÓMICO — reflejo)

## 3. Conflicto de edición concurrente (ATÓMICO — micro-agente fuzzy)

Dos actores pueden tocar el mismo pedido en fase borrador (cliente añade un item desde la tienda mientras el trabajador corrige otro desde el POS). El conflicto no se resuelve a nivel de interfaz — es el módulo quien garantiza la consistencia (operaciones atómicas por item, no por pedido). La interfaz refleja el estado resultante.

---

**Productos que salen:**
- Guardas de transición → **ATÓMICO** (reflejo)
- Superficie por actor → **SPAWN**
  - Vista cliente, Vista trabajador, Vista jefe → **ATÓMICO** (reflejo cada una)
- Conflicto de edición → **ATÓMICO** (micro-agente fuzzy — la resolución no es determinista)
