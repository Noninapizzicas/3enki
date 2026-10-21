# Pasada 3 — Disección (FORMA de cada pieza con el rol JEFE)

El prisma tocó suelo en la pasada 2. Cada hoja atómica recibe su FORMA
(reflejo · micro-agente fuzzy · custodio · conversor · puente) + su FORMA UI para ser ágil.

> Objetivo de diseño: **máximo rendimiento del gesto del jefe**. La métrica es
> "toques por operación" y "nada de recargas de vista".

---

## Órgano 1 — Mosaico por categorías (navegación)

**FORMA: REFLEJO (proyección en vista).**
Ya existe (`productos.categorias` con contador). La forma ágil: **columna lateral o pestañas**
de categorías con contador de productos, SIEMPRE visible (no desplegable oculto). Un toque
= cambiar de categoría. Estado de selección persistente durante la sesión del jefe.

## Órgano 2 — Ficha del producto (vista)

**FORMA: REFLEJO (proyección).**
Contenido ya existe (`productos.get`). Forma ágil: **tarjeta expandida en la propia vista**
(lista↔tarjeta en el mismo panel — no un salto a otra pantalla). Toda la información del
producto sin perder el contexto de la lista.

## Órgano 3 — Búsqueda

**FORMA: REFLEJO PERO (existe `productos.search`).**
Forma ágil: caja SIEMPRE visible arriba, cuando se escribe filtra el mosaico en vivo
(local sobre la lista ya cargada — sin RPC por tecla). El RPC solo si el catálogo es enorme
(uso actual: catálogos < 200 productos → filtrado local instantáneo).

## Órgano 4 — Cambio de precio EN VISTA ⭐ (el gesto rey)

**Preguntas del diseccionador:**
- ¿Determinista? El CAMBIO sí (número + confirmación); quien decide el valor es el jefe.
- ¿Persistente? Sí — viaja al custodio.
- ¿Vigila? No. ¿Traduce? No.

**FORMA: RELEJO-colocador (puente al custodio) con captura INLINE.**
- Un toque sobre el precio → campo editable inline → Enter → `productos.update {precio}` →
  la tarjeta se actualiza por la señal de refresco (nunca re-render de todo).
- El precio VIEJO queda visible brevemente (eco de cambio) → el jefe ve qué cambió.
- Benchmark de agilidad: **1 toque + 1 cifra + Enter**. Sin modal, sin formulario, sin scroll.
- Validación inline (no negativo), rechazo nombrado en la tarjeta (nada de toasts perdidos).
- **Lote opcional**: selección de N productos + precio único (para substir materiales, ej.
  "todo sube un 5%" es OTRA pieza — escandallo/precios masivos, fuera de aquí).

## Órgano 5 — Toggle disponible ⭐

**FORMA: RELEJO (same) — captura de UN TOQUE.**
- El estado disponible es el gesto MÁS frecuente tras el precio: se pinta como **interruptor
  en la propia tarjeta** (visible, no menú).
- Un toque = `productos.update {disponible}` → señal → estado coherente en TODAS las vistas
  (POS, carta digital, comandero lo ven al instante porque leen el mismo evento).
- Feedback óptico del toque (media transición, sin spinner): el toggle cambia AHORA —
  el dictamen real (del custodio) lo confirma en ms.
- **Edición en lote** (2º nivel): modo "vista de listado" con checkboxes de disponibilidad.

## Órgano 5b — Editar ficha (descripción/etiquetas/alérgenos)

**FORMA: RELEJO-colocador con EDITOR DE FICHA (modal único).**
Menos frecuente → modal que recoge los campos de texto + tags. Del botón a la ficha.
Validación tipada inline. Sin form por fases.

## Órgano 6 — Cambiar categoría

**FORMA: RELEJO-colocador (select en el editor de ficha + DRAG en el mosaico).**
V1: select en la ficha. V2 ágil: arrastrar la tarjeta a otra categoría (drag&drop del
mosaico). El drag es el gesto natural de reubicar — cuando el flujo lo pida.

## Órgano 7 — Alta rápida

**FORMA: RELEJO-colocador (delega al custodio).**
- Botón "+ producto" en el mosaico → mini-alta: nombre + precio + categoría →
  `carta.add_product` (via el custodio, id determinista → sin duplicados).
- < 30 segundos para un alta correcta. Edición posterior en la ficha (el alta rápida
  crea el 80% de los datos; el resto se edita después).
- Validación requeridos EN MINI-FORM (3 campos) — feedback inline, cancelar sin coste.

## Órgano 8 — Retirada

**FORMA: RELEJO-colocador con CONFIRMACIÓN NOMBRADA.**
- Acción de la ficha: "retirar del catálogo" → modal de confirmación (nombrando el producto,
  el precio y desde cuándo no estará a la venta) → `productos.delete`.
- Opción "desactivar sin borrar" (disponible=false) recomendada por defecto — el 90% de
  retiradas son estacionales (la carta vuelve).

## Órgano 9 — Mini-stats

**FORMA: REFLEJO (proyección).**
Cinta superior resumen: "42 productos · 6 categorías · 2 sin alérgenos declarados".
Un dato que abre la vista analítica al toque, sin página nueva.

---

## El patrón de la agilidad (lo que el esquema dice)

El panel ágil del jefe respira un patrón de 3 capas:

```
VISTA VIVA   (mosaico categorías + tarjetas con precio+toggle visibles)
  │  el 90% de los gestos NO abre nada: inline o toggle, feedback inmediato
  │  refresco por SEÑAL del bus (carta.editada / catalogo.actualizado) — sync sin recarga
EDITOR DE FICHA  (para lo que excede el gesto: un modal que agrupa la edición secundaria)
ACCIONES MAYORES (alta rápida · retirada con confirmación nombrada)
```

**Principio 1**: frecuencia → jerarquía. Precio y disponibilidad son "en vista"; el resto
es modal.
**Principio 2**: ninguna operación recarga la vista — el bus refresca.
**Principio 3**: el catálogo visible ES el formulario de lo frecuente (inline), no una
tabla que abre formularios.