# Pasada 2 — Prisma sobre los sub-productos (lente JEFE)

Ronda 2: prisma sobre **Catálogo visible · Gesto de edición · Alta/retirada · Vista analítica**.

---

## 2.1 · CATÁLOGO VISIBLE — prisma

**IDENTIDAD**: la vista de trabajo del jefe: qué vendo hoy, organizado, con estados legibles
de un vistazo (activo/no disponible, por categoría, precio a la vista).

**RESTRICCIONES**: la vista SIEMPRE refleja la carta activa (cero stale); agrupada por
categoría con orden; el estado `disponible` es la afirmación del jefe, distinguible de
`activo` (estructura).

**CONTRATO**: entra proyecto → salen categorías (ordenadas) + productos proyectados con
la forma POS completa.

Sub-productos: **Mosaico por categorías** (navegación con contador) · **Ficha del producto**
(precio, disponible, alérgenos, composición, variaciones) · **Búsqueda** (hallar sin navegar).

**Ronda 3**: la ficha y la búsqueda son hojas ATÓMICAS de presentación; el mosaico también
(navegación). El catálogo visible se alimenta de UNA lectura del propio módulo — REF del
contrato existente.

## 2.2 · GESTO DE EDICIÓN — prisma

**IDENTIDAD**: la operación más frecuente del jefe. Su agilidad define la productividad
del panel entero. El patrón: **tocar → cambiar → confirmar**, sin recargar la vista.

**RESTRICCIONES**: delega al custodio (la versión nueva aparece por refresco de evento,
no por re-carga completa); precio y disponibilidad son las ediciones dominantes
(ley de Pareto de uso);星 texto y descripción son edición secundaria.

**CONTRATO**: identificador del producto + campo(s) a cambiar → dictamen con versión nueva
de la carta. La vista se refresca por señal (`catalogo.actualizado` / `carta.editada`).

Sub-productos (por frecuencia de uso — esto es LO QUE HACE ÁGIL AL PANEL):
1. **Cambio de precio** — el gesto rey. Idealmente EN VISTA (inline sobre la tarjeta/línea).
2. **Activar / desactivar (disponible)** — toggle de un toque, en vista, por producto.
3. **Editar descripción/etiquetas/alérgenos** — edición de ficha, menos frecuente.
4. **Cambiar categoría** — reubicar un producto.

**Ronda 3**: los 4 son ATÓMICOS. El 1 y el 2 dominan el rendimiento percibido (suceden
10-50× más que el resto). → van al diseccionador.

## 2.3 · ALTA / RETIRADA — prisma

**IDENTIDAD**: incorporar un producto nuevo al catálogo, o retirar uno existente.

**RESTRICCIONES**: el alta determinista (id = categoría_nombre) evita duplicados ============================================================================
{ fortuitos; la retadeira es LÓGICA (dejar de proyectar) si la política lo permite — retirar
no siempre es borrar.

**CONTRATO**: alta → producto con campos mínimos (nombre, precio, categoría). Retirada →
dictamen + catálogo refrescado.

**PREGUNTAS_ABIERTAS → ABIERTA** (se cierra con el dueño):
- El ALTA hoy no está expuesta como tool de productos (existe `carta.add_product` en el
  custodio). ¿El jefe da altas AQUÍ o en menu-generator? → la cara de alta AQUÍ sería la
  misión de la agilidad: altas rápidas sin salir del panel.
- Retirada: `delete` existe. ¿Borrado lógico (activo:false) + borrado físico?

**Ronda 3**: ATÓMICO 5 (alta rápida, delegando en el custodio) · ATÓMICO 6 (retirada con
confirmación).

## 2.4 · VISTA ANALÍTICA — prisma

**IDENTIDAD**: el jefe ve cifras de su catálogo: total productos, por categoría, con
alérgenos declarados.

**RESTRICCIONES**: la vista que acerca decisiones: "¿tengo hueco en bocados?" responde
stats; el resto es detalle.

**Ronda 3**: ATÓMICO 7 (mini-bandera de stats en el panel — panel de cobertura). Bajo.

**Ronda completa sin productos nuevos → SUELO alcanzado.**