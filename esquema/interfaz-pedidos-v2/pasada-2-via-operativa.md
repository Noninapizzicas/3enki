# Pasada 2 — Vía Operativa (crear y editar pedidos)

**Sujeto:** La vía que construye el pedido — usada en paralelo por el cliente (WhatsApp/tienda) y el trabajador (POS).

---

## 1. IDENTIDAD — ¿Qué es la vía operativa?

Es el **camino de construcción** de un pedido: desde la intención de pedir hasta el envío a cocina. Es un flujo lineal con bifurcaciones — el actor elige qué hacer en cada momento, pero el pedido avanza en una dirección.

Sub-productos:
- **Iniciar pedido** — crear el borrador (ATÓMICO — conversor: intención → borrador)
- **Componer pedido** — añadir/modificar/quitar items (SPAWN)
- **Confirmar pedido** — transición borrador → creado (ATÓMICO — conversor: borrador → confirmado)
- **Enviar a cocina** — transición creado → enviado_cocina (ATÓMICO — conversor: confirmado → en producción)
- **Cancelar** — abortar en cualquier punto permitido (ATÓMICO — conversor: estado actual → cancelado)

## 2. RESTRICCIONES

- El pedido necesita al menos un item para confirmarse.
- Cada item necesita un producto válido (puerto: `consultar(dominio, criterio)` — la carta).
- Después de `enviado_cocina`, no se puede editar (guarda de estado).
- El cliente y el trabajador pueden operar el mismo pedido simultáneamente en fase borrador.

Sub-productos:
- **Validación de composición** — mínimos para avanzar (ATÓMICO — reflejo)
- **Resolución de producto** — buscar en la carta para añadir al pedido (ATÓMICO — puente, puerto: `consultar(dominio, criterio)`)

## 3. CONTRATO

- Cada operación devuelve feedback inmediato (éxito/fallo).
- El total se recalcula con cada cambio de composición.
- El estado del pedido refleja la última operación.

Sub-productos:
- **Total en vivo** — recalculado tras cada cambio (ATÓMICO — reflejo)
- **Feedback de paso** — confirmar cada operación (REF → Feedback de operación, pasada-2-contrato)

## 4. NO-OBJETIVOS

- No gestiona el pago (el cobro viene después).
- No elige la hora de entrega (eso es logística, no composición).

## 5. PREGUNTAS ABIERTAS

- ¿El trabajador puede crear un pedido "para" un cliente, o siempre es a nombre propio?

---

**Productos que salen:**
- Componer pedido → **SPAWN**
- Iniciar, Confirmar, Enviar, Cancelar → **ATÓMICO**
- Validación, Resolución de producto, Total en vivo → **ATÓMICO**
- Feedback de paso → **REF**
- PREGUNTAS → **[ABIERTO]**
