# Pasada 1 — Prisma de "Carta digital pública de The Pirate"

**Sujeto:** Lo que ve el cliente final cuando abre la carta en su móvil.
No el backoffice (eso existe). La CARA pública.

**Datos disponibles del sistema:** categorías, productos (nombre, descripción,
precio, imagen, ingredientes, alérgenos), leyenda de alérgenos, marca (logo,
colores, tipografía, lema, horario, dirección, teléfono).

---

## 1. IDENTIDAD — ¿Qué es la carta pública?

Es la **vitrina del restaurante en el bolsillo del cliente**. No es un menú
impreso digitalizado — es una experiencia que transmite la marca mientras el
cliente decide qué comer. Cumple dos funciones a la vez: INFORMAR (qué hay,
cuánto cuesta) y SEDUCIR (que se le haga la boca agua).

Sub-productos:
- **Cabecera** — la primera impresión: logo, nombre, lema, identidad
- **Navegación de categorías** — cómo el cliente se mueve entre secciones de la carta
- **Producto** — la pieza central: lo que se come, lo que se mira, lo que se pide
- **Pie** — contacto, horario, dirección, legal
- **Acción de pedido** — el momento de pedir (WhatsApp, mesa, takeaway)

## 2. RESTRICCIONES — ¿Qué limita la carta?

- **Mobile-first** — el 90%+ la abre en el móvil, de pie, con una mano
- **Velocidad** — si tarda más de 2s en cargar, el cliente levanta la mano y pide la carta física
- **Legibilidad en condiciones reales** — luz del restaurante (tenue), pantalla con brillo bajo, ojos cansados
- **Sin instalación** — es una URL que se abre en el navegador, no una app
- **Datos del sistema** — la carta muestra lo que el proyector le da (categorías, productos, precios)
- **Información obligatoria** — alérgenos (regulación), precios con IVA

Sub-productos:
- **Táctil generoso** — zonas de toque grandes (mínimo 44px), no links diminutos
- **Offline** — la carta debe funcionar sin conexión una vez cargada (PWA)
- **Carga progresiva** — texto primero, imágenes después

## 3. CONTRATO — ¿Qué promete la carta al cliente?

- **Sé lo que hay** — todas las categorías y productos visibles, con precio
- **Sé lo que lleva** — ingredientes y alérgenos accesibles (no escondidos)
- **Puedo pedir** — hay un camino claro para convertir la decisión en pedido
- **Es de este sitio** — la carta huele a The Pirate, no a un template genérico

Sub-productos:
- **Jerarquía visual** — categoría > producto > detalle (el ojo sabe dónde ir)
- **Detalle bajo demanda** — la descripción, ingredientes, alérgenos se expanden, no saturan
- **CTA de pedido** — el botón que convierte mirar en pedir

## 4. NO-OBJETIVOS — ¿Qué NO es la carta?

- No es un **e-commerce** con carrito complejo (el pedido se cierra por WhatsApp o en mesa)
- No es un **CMS** (el contenido viene del backend, no se edita aquí)
- No es una **app de delivery** (no hay tracking, ni pagos online, ni dirección de envío)
- No es una **web del restaurante** (eso es la homepage con hero, historia, etc.)

Sub-productos:
- **Carta vs Web** — la carta es una herramienta de decisión, no de marketing
- **Carta vs App** — la carta es una URL, no una instalación

## 5. PREGUNTAS ABIERTAS

- ¿El pedido se hace por WhatsApp (link directo) o hay un flujo de selección en la carta?
- ¿Las imágenes de producto son obligatorias o la carta funciona sin ellas?
- ¿Hay variaciones/opciones por producto (tamaño, extras) visibles en la carta?
- ¿El precio incluye variaciones (individual/familiar) o es único?

---

**Productos que salen de aquí:**

| Producto | Estado |
|---|---|
| Cabecera | SPAWN |
| Navegación de categorías | SPAWN |
| Producto (la pieza central) | SPAWN |
| Pie | SPAWN |
| Acción de pedido | SPAWN |
| Táctil generoso | ATÓMICO — regla: min 44px touch targets |
| Offline (PWA) | ATÓMICO — regla: service worker + cache |
| Carga progresiva | ATÓMICO — regla: text first, images lazy |
| Jerarquía visual | REF → converge en cada SPAWN |
| Detalle bajo demanda | SPAWN (patrón de interacción) |
| CTA de pedido | REF → Acción de pedido |
| Carta vs Web | ATÓMICO — frontera |
| Carta vs App | ATÓMICO — frontera |
| PREGUNTAS ABIERTAS | [ABIERTO] |
