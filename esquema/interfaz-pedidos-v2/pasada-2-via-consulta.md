# Pasada 2 — Vía de Consulta (ver y seguir pedidos)

**Sujeto:** La vía que observa los pedidos — usada por el jefe y el trabajador.

---

## 1. IDENTIDAD — ¿Qué es la vía de consulta?

Es el **ojo sobre los pedidos**: la superficie que muestra qué hay, en qué estado está, y qué pasó. No construye — observa. Tiene dos niveles de profundidad: la lista (muchos pedidos) y el detalle (un pedido con sus tripas).

Sub-productos:
- **Lista de pedidos** — ver todos los pedidos, filtrar por estado (ATÓMICO — reflejo, puerto: `consultar(criterio)`)
- **Detalle de pedido** — ver un pedido concreto con items, estado, historial (SPAWN)
- **Seguimiento en vivo** — el estado se actualiza sin pedir (ATÓMICO — puente, puerto: `observar(señal)`)

## 2. RESTRICCIONES

- El jefe ve todos los pedidos; el trabajador ve los del turno/proyecto.
- El detalle solo se abre sobre un pedido existente (la lista alimenta al detalle — cadena de ids).
- La frescura del dato depende del reflejo en vivo — si no hay señal, el dato puede estar stale.

Sub-productos:
- **Filtro por actor** — la superficie cambia según quién mira (ATÓMICO — reflejo)
- **Cadena lista→detalle** — la selección en la lista abre el detalle (ATÓMICO — reflejo)
- **Indicador de frescura** — cuánto tiempo hace que el dato se actualizó (ATÓMICO — reflejo)

## 3. CONTRATO

- La lista siempre refleja el estado real de los pedidos.
- El detalle muestra la composición completa: items, cantidades, variaciones, notas, estado, total.
- Toda actualización (de la vía operativa o de cocina) se refleja sin que el observador refresque.

Sub-productos:
- **Composición visible** — items + cantidades + variaciones + total (REF → Detalle de pedido)
- **Reconciliación** — cuando llega una señal, el dato se refresca (ATÓMICO — conversor)

## 4. NO-OBJETIVOS

- No edita pedidos (eso es la vía operativa).
- No genera reportes ni analítica (eso es otro dominio).

## 5. PREGUNTAS ABIERTAS

- ¿El jefe puede tomar acciones desde la consulta (cancelar, reasignar) o es lectura pura?

---

**Productos que salen:**
- Detalle de pedido → **SPAWN**
- Lista, Seguimiento en vivo, Filtro, Cadena, Frescura, Reconciliación → **ATÓMICO**
- Composición visible → **REF**
- PREGUNTAS → **[ABIERTO]**
