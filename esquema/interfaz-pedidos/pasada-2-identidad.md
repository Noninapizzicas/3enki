# Pasada 2 — Prisma de los sub-productos de IDENTIDAD

---

## 2.1 Ciclo de vida del pedido

**IDENTIDAD:** La secuencia ordenada de estados por los que transita un pedido desde su creación hasta su cierre. No es lineal — tiene bifurcaciones (completar vs cancelar) y puede tener bucles (volver a editar).

**RESTRICCIONES:** Un pedido siempre está en exactamente un estado. Las transiciones son finitas y nombradas. Hay estados terminales de los que no se sale.

**CONTRATO:** Dado un estado actual, el conjunto de transiciones válidas es determinista y conocido.

**NO-OBJETIVOS:** No modela el porqué del cambio de estado (eso es lógica de negocio). No decide qué estado viene — solo declara cuáles son posibles.

**Sub-productos:**
- **Estado** — un punto nombrado del ciclo (borrador, en_cocina, completado, cancelado) → ATÓMICO
- **Transición** — un arco entre dos estados con nombre de acción → ATÓMICO
- **Estado terminal** — estado del que no se sale → ATÓMICO
- **Estado compuesto** — un estado que tiene sub-estados internos (ej: "borrador" puede ser "vacío" o "con items") → ATÓMICO

---

## 2.2 Operaciones

**IDENTIDAD:** Las acciones que el operador puede disparar sobre un pedido o sobre la colección de pedidos.

**RESTRICCIONES:** Cada operación tiene parámetros (algunos obligatorios), un estado requerido, y un efecto (cambia estado, añade dato, consulta).

**CONTRATO:** Toda operación tiene nombre, inputs tipados, output, y efecto declarado.

**NO-OBJETIVOS:** La operación no sabe cómo se ejecuta internamente — solo qué se pide y qué sale.

**Sub-productos:**
- **Operación de creación** — hace nacer un pedido → ATÓMICO
- **Operación de composición** — añade/modifica/elimina partes del pedido → ATÓMICO
- **Operación de transición** — mueve el pedido de un estado a otro → ATÓMICO
- **Operación de consulta** — lee sin modificar → ATÓMICO

---

## 2.3 Visibilidad

**IDENTIDAD:** Lo que la interfaz muestra al operador — el estado actual de los pedidos y los eventos que ocurren.

**RESTRICCIONES:** Lo que se muestra debe ser verdadero en el momento de mostrarse. La información caduca si el mundo cambia y la interfaz no se actualiza.

**CONTRATO:** El operador ve el estado actual y los cambios relevantes sin tener que preguntar.

**Sub-productos:**
- **Lista de pedidos** — la colección con filtros y orden → ATÓMICO
- **Detalle de pedido** — un pedido con todos sus datos e items → ATÓMICO
- **Eventos en vivo** — señales de que algo cambió (otro operador actuó, el sistema procesó algo) → ATÓMICO
- **Indicadores de estado** — marcas visuales del estado actual (color, icono, etiqueta) → ATÓMICO

---

## 2.4 Contexto operativo

**IDENTIDAD:** El ámbito en el que trabaja el operador — a qué negocio/proyecto pertenecen estos pedidos.

**RESTRICCIONES:** El operador pertenece a un proyecto; no elige cuál. El contexto es implícito.

**CONTRATO:** Toda operación hereda el contexto — el operador no lo repite en cada acción.

**Sub-productos:**
- **Proyecto implícito** — el operador pertenece a un proyecto, determinado por su ruta de acceso → ATÓMICO
- **Inyección de contexto** — el sistema añade el identificador del proyecto a cada operación sin que el operador lo vea → ATÓMICO
