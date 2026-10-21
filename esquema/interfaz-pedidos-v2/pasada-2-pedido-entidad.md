# Pasada 2 — Pedido como entidad (compartido entre las dos vías)

**Sujeto:** La estructura del pedido que ambas vías comparten.

---

## 1. IDENTIDAD — ¿Qué es un pedido?

Es una **intención de consumo con composición mutable y estado progresivo**. Nace vacío (borrador), se llena de items, se confirma y avanza por un ciclo de vida hasta completarse o cancelarse.

Sub-productos:
- **Ciclo de vida** — los estados y sus transiciones (ATÓMICO — reflejo)
- **Composición** — los items que forman el pedido (SPAWN)
- **Metadatos** — notas, canal de origen, cliente, timestamps (ATÓMICO — reflejo)

## 2. RESTRICCIONES

- Un pedido pertenece a un proyecto (la pizzería) — siempre implícito.
- Los items referencian productos del catálogo — dependencia cruzada de dominio.
- El total se deriva de la composición (no se almacena aparte, se calcula).

Sub-productos:
- **Contexto implícito** — el proyecto siempre está ahí (ATÓMICO — reflejo)
- **Referencia cruzada** — items apuntan a productos de otro dominio (ATÓMICO — puente, puerto: `consultar(dominio, id)`)

## 3. CONTRATO

- El pedido en cualquier momento tiene un estado, una composición y un total coherentes.
- Cada transición de estado emite una señal que las dos vías pueden observar.

Sub-productos:
- **Señal de transición** — el pedido anuncia cada cambio de estado (ATÓMICO — puente, puerto: `señalar(evento)`)

## 4. NO-OBJETIVOS

- No es un producto (no tiene precio propio, solo la suma de sus items).
- No es una factura (el documento fiscal viene después).

## 5. PREGUNTAS ABIERTAS

- ¿Un pedido puede reabrirse después de completado (devolución parcial)?

---

**Productos que salen:**
- Composición → **SPAWN**
- Ciclo de vida, Metadatos, Contexto, Referencia cruzada, Señal de transición → **ATÓMICO**
- PREGUNTAS → **[ABIERTO]**
