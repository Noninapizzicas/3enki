# Pasada 2 — Prisma sobre los elementos de la carta

Cada SPAWN de pasada 1 se descompone hasta suelo.

---

## A. Cabecera (SPAWN → descomponer)

**Sujeto:** Lo primero que ve el cliente al abrir la carta.

Piezas:
- **Logo** — el sello de la marca (imagen, posición fija)
- **Nombre** — "THE PIRATE" en font display
- **Lema** — "Abierto ante la ley · Saqueado con gusto"
- **Ambiente** — el fondo/textura que establece el tono (oscuro, oro)

> La cabecera NO es un hero de marketing (85vh, gigante). Es un sello
> compacto que dice "estás en el sitio correcto" y deja paso a la carta.
> Mobile-first: ocupa lo justo para marcar identidad, no una pantalla entera.

**Productos:**
- Logo (imagen + posición) → ATÓMICO
- Nombre (texto + font display) → ATÓMICO
- Lema (texto + font body + caps) → ATÓMICO
- Ambiente (fondo + piel aplicada) → ATÓMICO

---

## B. Navegación de categorías (SPAWN → descomponer)

**Sujeto:** Cómo el cliente salta entre secciones de la carta.

El patrón clásico en carta digital: **barra horizontal scrollable con chips**
(cada chip = una categoría). Fija en top al hacer scroll (sticky).

Piezas:
- **Chip de categoría** — botón con nombre de la categoría, activo/inactivo
- **Barra contenedora** — horizontal, scroll, sticky top
- **Estado activo** — el chip de la categoría visible se destaca
- **Scroll-into-view** — tocar un chip scrollea a esa sección

**Productos:**
- Chip de categoría (texto + estados) → ATÓMICO
- Barra (horizontal scroll + sticky) → ATÓMICO
- Estado activo (chip destacado) → ATÓMICO
- Scroll-to-section (comportamiento) → ATÓMICO

---

## C. Producto — la pieza central (SPAWN → descomponer)

**Sujeto:** Lo que el cliente mira para decidir qué come.

> ⚠ DIMENSIONES INTERDEPENDIENTES: imagen × texto × precio × acción
> no son independientes — en mobile la composición cambia radicalmente
> respecto a desktop. Convergen en el layout del producto.

Piezas:
- **Imagen** — foto del plato (opcional, lazy load, aspect-ratio fijo)
- **Nombre** — el nombre del producto (font display, peso)
- **Descripción** — ingredientes principales o frase corta (1-2 líneas)
- **Precio** — cuánto cuesta (font display, color acento, alineado a la derecha)
- **Badges de alérgenos** — emojis/iconos de los alérgenos (compacto, tooltip con nombre)
- **Detalle expandible** — al tocar: descripción completa, ingredientes, alérgenos con nombre

Layout del producto (el convergente):
- **Compacto (default)**: fila → [thumb mini | nombre + desc corta | precio]
- **Expandido (on tap)**: el detalle se despliega debajo

**Productos:**
- Imagen (lazy, aspect-ratio, fallback) → ATÓMICO
- Nombre (font-display, peso) → ATÓMICO
- Descripción corta (1-2 líneas, truncada) → ATÓMICO
- Precio (font-display, color acento) → ATÓMICO
- Badges alérgenos (emoji compact) → ATÓMICO
- Detalle expandible → REF → §E (Detalle bajo demanda)
- Layout convergente (fila compacta + expand) → ATÓMICO

---

## D. Pie (SPAWN → descomponer)

**Sujeto:** Lo que hay al final de la carta.

Piezas:
- **Horario** — "Martes a domingo, 19:30 — 23:30"
- **Dirección** — "Juan Carlos I, 49 · Lorca" (link a Maps)
- **Teléfono** — "643 283 034" (link tel:)
- **Redes** — Instagram (icono + link)
- **Legal** — "Precios con IVA incluido" + link alérgenos

**Productos:**
- Horario (texto) → ATÓMICO
- Dirección (texto + link maps) → ATÓMICO
- Teléfono (link tel:) → ATÓMICO
- Redes (iconos + links) → ATÓMICO
- Legal (texto normativo) → ATÓMICO

---

## E. Detalle bajo demanda (SPAWN → descomponer)

**Sujeto:** El patrón de expandir info al tocar un producto.

Piezas:
- **Trigger** — toda la fila del producto es tocable
- **Panel de detalle** — se despliega con animación suave
- **Contenido del detalle**: descripción completa, lista de ingredientes (chips), alérgenos con nombre y emoji
- **Cierre** — tocar otra vez colapsa, o tocar otro producto lo reemplaza

**Productos:**
- Trigger (toda la fila, min 44px) → ATÓMICO
- Panel animado (expand/collapse) → ATÓMICO
- Ingredientes como chips → ATÓMICO
- Alérgenos con nombre → ATÓMICO
- Accordion (solo 1 abierto a la vez) → ATÓMICO

---

## F. Acción de pedido (SPAWN → descomponer)

**Sujeto:** El momento de convertir mirar en pedir.

Dos posibilidades según el modelo del restaurante:
- **WhatsApp** — botón flotante que abre WhatsApp con mensaje pre-rellenado
- **En mesa** — el pedido se hace de viva voz (la carta solo informa)

Para The Pirate (modelo actual): WhatsApp.

Piezas:
- **FAB (Floating Action Button)** — botón flotante "Pedir por WhatsApp" fijo en bottom-right
- **Link directo** — `https://wa.me/34643283034?text=...`
- **Visibilidad** — aparece después de scrollear la primera categoría (no en la cabecera)

**Productos:**
- FAB (botón flotante, posición fija) → ATÓMICO
- Link WhatsApp (url pre-rellenada) → ATÓMICO
- Visibilidad condicional (scroll threshold) → ATÓMICO

---

**Resumen de pasada 2:**

| Producto | Estado |
|---|---|
| Logo | ATÓMICO |
| Nombre marca | ATÓMICO |
| Lema | ATÓMICO |
| Ambiente (fondo) | ATÓMICO |
| Chip de categoría | ATÓMICO |
| Barra navegación (sticky scroll) | ATÓMICO |
| Estado activo chip | ATÓMICO |
| Scroll-to-section | ATÓMICO |
| Imagen producto | ATÓMICO |
| Nombre producto | ATÓMICO |
| Descripción corta | ATÓMICO |
| Precio | ATÓMICO |
| Badges alérgenos | ATÓMICO |
| Layout producto (convergente) | ATÓMICO |
| Horario | ATÓMICO |
| Dirección | ATÓMICO |
| Teléfono | ATÓMICO |
| Redes | ATÓMICO |
| Legal | ATÓMICO |
| Trigger expandir | ATÓMICO |
| Panel animado | ATÓMICO |
| Ingredientes chips | ATÓMICO |
| Alérgenos con nombre | ATÓMICO |
| Accordion | ATÓMICO |
| FAB pedido | ATÓMICO |
| Link WhatsApp | ATÓMICO |
| Visibilidad FAB | ATÓMICO |

**27 átomos. 0 SPAWN. Suelo tocado.**
