# Pasada 1 — Prisma de "Interfaz de operación de pedidos"

**Sujeto:** La interfaz que permite a un operador gestionar pedidos de un negocio — crear, componer, enviar, completar, cancelar, consultar. Universal, sin sistema.

---

## 1. IDENTIDAD — ¿Qué es esta interfaz?

Es la **superficie de control** de un ciclo de vida de pedidos. No es el motor que procesa pedidos — es la ventana por la que un operador humano observa el estado de los pedidos y actúa sobre ellos. Le permite ver qué hay, decidir qué hacer, y ejecutar la decisión.

Sub-productos:
- **Ciclo de vida del pedido** — los estados por los que pasa un pedido y las transiciones válidas
- **Operaciones** — las acciones que el operador puede ejecutar
- **Visibilidad** — lo que el operador puede ver en cada momento
- **Contexto operativo** — de quién son estos pedidos, en qué ámbito se trabaja

## 2. RESTRICCIONES — ¿Qué limita esta interfaz?

- **Estado actual** — no toda operación es válida en todo momento (no se envía a cocina un pedido vacío)
- **Composición progresiva** — un pedido se arma por pasos, no de una sola vez (primero existe, luego se le añaden items)
- **Dependencia de entidades externas** — los items referencian productos, el pedido referencia una cuenta o un cliente
- **Irreversibilidad parcial** — algunas transiciones no se deshacen (un pedido enviado a cocina no vuelve a borrador)
- **Concurrencia** — otros operadores o sistemas pueden estar actuando sobre los mismos pedidos

Sub-productos:
- **Grafo de estados** — qué transiciones son válidas desde cada estado
- **Dependencias entre operaciones** — qué operación necesita el resultado de otra
- **Entidades referenciadas** — productos, cuentas, clientes que el pedido toca
- **Guardas de transición** — precondiciones para que una operación sea válida

## 3. CONTRATO — ¿Qué promete esta interfaz?

- **Toda operación válida es ejecutable** — si el estado lo permite, el operador la puede hacer
- **Toda operación inválida está impedida o señalada** — el operador no se equivoca por falta de información
- **El estado se refleja en tiempo real** — lo que el operador ve es lo que hay
- **El resultado de cada acción es visible** — el operador sabe qué pasó

Sub-productos:
- **Feedback de operación** — cómo sabe el operador que la acción se ejecutó (o falló)
- **Reflejo de estado en vivo** — la interfaz se actualiza cuando el mundo cambia (otro operador, otro sistema)
- **Guía de flujo** — la interfaz sugiere o habilita el siguiente paso natural

## 4. NO-OBJETIVOS — ¿Qué NO es esta interfaz?

- No es el **motor de negocio** — no decide precios, no valida stock, no calcula impuestos
- No es la **interfaz del cliente** — no es el carrito de compra ni la PWA de autoservicio
- No es un **editor de catálogo** — no gestiona productos ni categorías
- No es un **dashboard analítico** — no muestra métricas históricas ni tendencias
- No es un **sistema de notificaciones** — puede reflejar eventos, pero no es su canal primario

Sub-productos:
- **Operador vs Cliente** — la frontera entre quien gestiona y quien consume
- **Control vs Análisis** — operar en tiempo real vs analizar después

## 5. PREGUNTAS ABIERTAS

- ¿El operador trabaja con un pedido a la vez o con una lista en paralelo?
- ¿Hasta qué punto la interfaz debe guiar el flujo vs dejar libertad total?
- ¿Los pedidos de distintos tipos (POS vs tienda) se operan con la misma interfaz o con vistas separadas?
- ¿Qué pasa con un pedido que lleva mucho tiempo en un estado intermedio?

---

**Productos que salen de aquí:**
- Ciclo de vida del pedido, Operaciones, Visibilidad, Contexto operativo → **SPAWN**
- Grafo de estados, Dependencias entre operaciones, Entidades referenciadas, Guardas de transición → **SPAWN**
- Feedback de operación, Reflejo de estado en vivo, Guía de flujo → **SPAWN**
- Operador vs Cliente, Control vs Análisis → **SPAWN**
- PREGUNTAS_ABIERTAS → **[ABIERTO]**
