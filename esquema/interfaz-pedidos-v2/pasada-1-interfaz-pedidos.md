# Pasada 1 — Prisma de "Interfaz de pedidos (dos vías)"

**Sujeto:** Interfaz de operación de pedidos en una pizzería — separada en dos vías paralelas por actor y propósito.

---

## 1. IDENTIDAD — ¿Qué es esta interfaz?

Son **dos vías distintas que comparten el mismo pedido** pero lo tocan desde ángulos opuestos:

- **Vía Operativa** (crear/editar) — quien construye el pedido, paso a paso, hasta enviarlo.
- **Vía de Consulta** (ver/seguir) — quien observa los pedidos para tomar decisiones o confirmar estado.

Las dos vías convergen en el **pedido como entidad viva** (ciclo de vida: borrador → creado → enviado_cocina → completado | cancelado), pero difieren en quién las usa, qué pueden hacer y cuándo.

Sub-productos:
- **Vía Operativa** — construir y modificar pedidos (SPAWN — es un subsistema)
- **Vía de Consulta** — observar y seguir pedidos (SPAWN — es un subsistema)
- **Pedido como entidad** — lo que las dos vías comparten: estructura, ciclo de vida, items
- **Actores** — cliente, trabajador, jefe: quién entra por dónde

## 2. RESTRICCIONES — ¿Qué limita esta interfaz?

- **Ciclo de vida** — un pedido en estado `enviado_cocina` ya no admite edición de items. El estado condiciona qué operaciones son válidas.
- **Actor ≠ capacidad** — el cliente ve una superficie reducida (su pedido), el trabajador ve más (todos los pedidos del turno), el jefe ve todo con filtros.
- **Concurrencia** — el mismo pedido puede tocarse desde WhatsApp y desde el POS al mismo tiempo (el trabajador añade mientras el cliente confirma).
- **Contexto implícito** — el proyecto (la pizzería) siempre está implícito, nunca se pide al usuario.

Sub-productos:
- **Guardas de transición** — qué operaciones permite cada estado
- **Superficie por actor** — qué ve y qué puede cada uno
- **Conflicto de edición concurrente** — dos actores tocando el mismo pedido

## 3. CONTRATO — ¿Qué promete esta interfaz?

- **Vía Operativa:** el actor construye un pedido completo y lo envía, con feedback inmediato de cada paso.
- **Vía de Consulta:** el actor ve el estado real del pedido en cualquier momento, sin retraso.
- **Coherencia entre vías:** lo que uno edita, el otro lo ve reflejado en vivo.

Sub-productos:
- **Feedback de operación** — confirmar éxito/fallo de cada acción
- **Reflejo en vivo** — el estado se actualiza sin refrescar
- **Coherencia cross-vía** — edición y consulta ven lo mismo

## 4. NO-OBJETIVOS — ¿Qué NO es esta interfaz?

- **No es el sistema de cocina** — la interfaz envía a cocina, no gestiona la producción.
- **No es analítica** — el jefe consulta pedidos individuales, no dashboards de ventas.
- **No es configuración** — no gestiona productos, precios ni variaciones (eso es otro dominio).
- **No es facturación** — el cobro es posterior al pedido.

Sub-productos:
- **Operación vs Producción** — la frontera con cocina
- **Consulta vs Analítica** — la frontera con reporting

## 5. PREGUNTAS ABIERTAS

- ¿El cliente puede cancelar un pedido que ya creó, o solo el trabajador?
- ¿El jefe puede editar pedidos ajenos o solo observar?
- ¿Hay pedidos "huérfanos" (sin trabajador asignado, solo del cliente)?

---

**Productos que salen de aquí:**
- Vía Operativa, Vía de Consulta → **SPAWN**
- Pedido como entidad → **SPAWN**
- Actores, Superficie por actor → **SPAWN**
- Guardas de transición, Conflicto de edición → **SPAWN**
- Feedback, Reflejo en vivo, Coherencia cross-vía → **SPAWN**
- Operación vs Producción, Consulta vs Analítica → **SPAWN**
- PREGUNTAS_ABIERTAS → **[ABIERTO]**
