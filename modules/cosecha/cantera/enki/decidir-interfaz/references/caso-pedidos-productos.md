# Caso testigo — pedidos vs productos (FASE 6 · decidir-interfaz)

> Dos módulos del MISMO tipo declarado (`workspace_module`, `zone=barra_modulos`)
> con forma interna distinta. Validan que el patrón de la FASE 6 clasifica por
> ROL, no por superficie: los dos son áreas de trabajo de negocio → los dos
> `workspace_module`, aunque uno es fuente de verdad y el otro proyector.

---

## 📦 pedidos — prisma sobre su interfaz

**1 · IDENTIDAD** — El panel de operación del ciclo de vida del pedido en el POS.
Trabajo que resuelve: el camarero/gestor ve y opera los pedidos de su cuenta
activa — crear, añadir items, enviar a cocina, completar, cancelar.

**2 · RESTRICCIONES (duras)** — Contrato frontend: 4 tipos canónicos, zone ∈ 5
zonas + lateral, sin modales bloqueantes, sin router propio. Panel **multi-tenant**
(project_id) y **vivo**: los 7 eventos que publica (pedido.creado, enviado_cocina,
completado…) son el estado; la interfaz debe reflejarlos sin cache manual.

**3 · CONTRATO** — 12 acciones de UI (create · add-item · send-kitchen · complete
· cancel · total · confirmar-recogida…). La interfaz = **lista de pedidos activos
+ flujo de operación** que llama a esos tools.

**4 · NO-OBJETIVOS** — No es la cocina (`cocina`), no es el catálogo
(`productos`), no es el cobro (`cobros`), no es la config de canales. No duplica
ninguna de esas superficies.

**5 · PREGUNTAS ABIERTAS** — ¿Historial/facturación dentro del panel o vive en
`facturas`? ¿El `health` va en el panel o es telemetría del sistema?

**Disección → 1 pieza `workspace_module`**: área de trabajo de negocio, operación
habitual, barra de módulos. Forma: vista de lista (reflejo: list/get/total) +
acciones que mutan vía tools + suscripción en vivo a `pedido.*`.

---

## 📦 productos — prisma sobre su interfaz

**1 · IDENTIDAD** — Panel de gestión del catálogo: el gestor ve, busca, edita y
elimina productos; consulta stats.

**2 · RESTRICCIONES (duras)** — **PROYECTOR SIN ESTADO** (no guarda copia,
proyecta la carta activa) → la interfaz no puede asumir catálogo cacheado: cada
vista pide al proyector. Multi-tenant. Mismo contrato frontend.

**3 · CONTRATO** — 13 acciones (list · get · search · update · delete · categorias
· ingredientes · pizzas · stats · load_carta · carta_completa…). **NO tiene
`create`** — el producto nace por carta/manifiesto, el panel solo gestiona lo
existente.

**4 · NO-OBJETIVOS** — No es el menú público (escaparate/carta-digital), no es el
costeo (escandallo), no es el generador desde texto (menu-generator).

**5 · PREGUNTAS ABIERTAS** — ¿El panel necesita `create` para cerrar el ciclo de
alta, o el alta queda en la carta? ¿stats va en el panel o en system_panel?

**Disección → 1 pieza `workspace_module`**: gestión habitual del negocio, barra de
módulos. Forma: catálogo (list/search) + edición (update/delete) + stats.

---

## La respuesta a la pregunta "¿qué interfaz nos beneficia?"

A ambos les beneficia un `workspace_module` — áreas de trabajo de negocio que el
humano opera a diario, no gestión de sistema (system_panel), no operaciones
puntuales desde el chat (chat_tool), no contenido en el flujo (inline_render).

**El hallazgo fino del prisma**: `productos` tiene un hueco de contrato — sin
`create`, su interfaz solo gestiona lo que otra vía crea. Pregunta abierta para
el dueño, no decisión del esquematizador.

## Datos crudos (module.json real)

- pedidos: 12 ui_handlers `workspace_module`/`barra_modulos` · 12 tools · 10
  subscribes · 7 publishes (pedido.*)
- productos: 13 ui_handlers `workspace_module`/`barra_modulos` · 13 tools · 6
  subscribes · 7 publishes (carta.*.request — consumidor, no dueño)
