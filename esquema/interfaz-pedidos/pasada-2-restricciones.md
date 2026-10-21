# Pasada 2 — Prisma de los sub-productos de RESTRICCIONES

---

## 2.5 Grafo de estados

**IDENTIDAD:** El mapa completo de estados y transiciones válidas. Es un grafo dirigido donde los nodos son estados y los arcos son operaciones.

**RESTRICCIONES:** Es finito. Tiene al menos un estado inicial y al menos un estado terminal. No tiene ciclos infinitos sin salida.

**CONTRATO:** Dado cualquier estado, puedes enumerar las transiciones posibles. Dado cualquier operación, puedes saber de qué estado parte y a cuál llega.

→ ATÓMICO (es un dato declarativo que se puede representar como tabla/mapa)

---

## 2.6 Dependencias entre operaciones

**IDENTIDAD:** El orden parcial entre operaciones — qué operación necesita el resultado de otra para poder ejecutarse.

**RESTRICCIONES:** Las dependencias forman un DAG (sin ciclos). Una operación puede depender de varias anteriores.

**CONTRATO:** Antes de habilitar una operación, sus dependencias están resueltas (el operador tiene los datos que necesita).

**Sub-productos:**
- **Cadena de ids** — una operación produce un id que la siguiente consume (crear → pedido_id → add-item) → ATÓMICO
- **Prerequisito de estado** — una operación solo se habilita si el pedido está en cierto estado → REF (→ Grafo de estados)
- **Datos requeridos de otra entidad** — una operación necesita elegir un producto, una cuenta, etc. → REF (→ Entidades referenciadas)

---

## 2.7 Entidades referenciadas

**IDENTIDAD:** Las entidades externas al pedido que la interfaz necesita presentar para que el operador las elija.

**RESTRICCIONES:** Son de solo lectura desde la perspectiva de la interfaz de pedidos. La interfaz las consulta, no las gestiona.

**CONTRATO:** La interfaz ofrece una forma de elegir la entidad (buscar, listar, seleccionar) y pasa su identificador a la operación.

**Sub-productos:**
- **Selector de entidad** — un control que consulta la fuente y presenta opciones → ATÓMICO
- **Resolución de referencia** — convertir un identificador opaco en un nombre legible → ATÓMICO

---

## 2.8 Guardas de transición

**IDENTIDAD:** Las precondiciones que deben cumplirse para que una operación sea ejecutable. Son reglas del dominio, no de la interfaz.

**RESTRICCIONES:** La interfaz no puede verificar todas (algunas son del motor de negocio). Pero sí puede verificar las obvias (estado actual, campos obligatorios llenos).

**CONTRATO:** La interfaz deshabilita o señala las operaciones cuyas guardas visibles no se cumplen.

→ ATÓMICO (es un predicado evaluable: estado + datos presentes → habilitado/deshabilitado)
