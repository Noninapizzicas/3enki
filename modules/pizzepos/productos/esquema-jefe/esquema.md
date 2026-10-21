# Esquema maestro — productos · ROL JEFE

> Sujeto: la cara de gestión del catálogo para el dueño. Objetivo: **interfaz ágil y productiva**
> — el máximo de cobertura con el mínimo de gestos, sin recargas.
> Método: esquematizador (prisma recursivo + disección). Ley: agnosticismo (0 tecnologías nombradas).

## La lente JEFE aplicada a productos

El módulo es un **proyector sin estado** sobre la carta. Para el JEFE eso significa:

- Lo que ve SIEMPRE es la verdad del momento (no hay "datos viejos")
- Sus cambios escriben en el custodio (la carta) → el sistema entero se entera por señal
- Sus decisiones frecuentes: **precio** y **disponibilidad** — dominan el diseño

```
PRODUCTOS · ROL JEFE
│
├─ VISTA VIVA (catálogo) ─────────────────────────── el 90% del trabajo ocurre aquí
│   ├─ Mosaico de categorías (contador, siempre visible) · reflejo ✅ existe (categorias)
│   ├─ Tarjeta de producto (precio + toggle disponibles EN VISTA) · reflejo ✅ (get/list)
│   ├─ Búsqueda en vivo (filtrado local, sin RPC por tecla) · reflejo ✅ (search)
│   └─ Cinta mini-stats (total / categorías / alérgenos) · reflejo ✅ (stats)
│
├─ GESTOS INLINE (lo que hace ÁGIL al panel) ────── 1 toque, feedback inmediato
│   ├─ ⭐ Cambio de precio EN VISTA (toque→cifra→Enter) · puente al custodio
│   │      · update existe ✅ — falta la CAPTURA INLINE (el hueco nº1)
│   ├─ ⭐ Toggle disponible (interruptor en la tarjeta) · puente al custodio
│   │      · update existe ✅ — falta el INTERRUPTOR (el hueco nº2)
│   └─ Cambiar categoría (select en ficha; drag&drop = v2) · update existe ✅
│
├─ EDITOR DE FICHA (lo que excede el gesto) ─────── 1 modal, no formularios en fases
│   ├─ descripción · etiquetas · alérgenos · imagen · tipo · emoji
│   └─ REGLA: "guardar" delega al custodio; la señal refresca todas las vistas
│
├─ ALTA RÁPIDA ──────────────────────────────────── el custodio es el escritor
│   ├─ Botón "+ producto" (nombre + precio + categoría) < 30s
│   ├─ [ABIERTO] ¿alta aquí o en menu-generator? — decisión del dueño
│   └─ delega carta.add_product (existe ✅) — hueco nº3: el botón + mini-form
│
└─ RETIRADA ────────────────────────────────────── con confirmación nombrada
    ├─ Modal nombra producto/precio/impacto antes de ejecutar
    ├─ Default recomendado: desactivar (disponible=false) sobre borrar — retorno estacional
    └─ delete existe ✅ · update(disponible) existe ✅ — hueco nº4: la confirmación UI
```

## Los 3 principios de agilidad (lo que extrae el esquema)

1. **Frecuencia → jerarquía.** Precio y disponibilidad son gestos EN VISTA (inline/toggle).
   Lo que excede el gesto → modal único de ficha. Nada de formularios por fases.
2. **Ninguna operación recarga la vista.** El refresco lo hace la señal del bus
   (`carta.editada` / `catalogo.actualizado`) — todas las vistas sincronizadas sin re-render.
3. **El catálogo visible ES el formulario de lo frecuente.** No una tabla que abre formularios:
   la tarjeta es editable donde se toca.

## Recuento

- 3 pasadas · 9 órganos disecados
- ✅ existe (backend listo): mosaico (categorias) · tarjeta (get/list) · búsqueda (search) ·
  stats · update · delete · alta vía custodio (carta.add_product)
- **HUECOS REALES (todos de UI, todos del rol jefe):**
  1. **Captura inline de precio** — toque→cifra→Enter en la tarjeta
  2. **Toggle disponible** en la tarjeta — un toque, feedback óptico inmediato
  3. **Alta rápida** — botón "+ producto" + mini-form de 3 campos (delega al custodio)
  4. **Editor de ficha** (modal único para descripción/etiquetas/alérgenos/categoría)
  5. **Modal de retirada** con confirmación nombrada + default "desactivar"
- `[ABIERTO]`: (a) alta aquí vs menu-generator · (b) borrado lógico vs físico (default lógico)
- Bases de datos: TODAS ya existen — **los 5 huecos son de CAPTURA (UI)**, cero backend nuevo

## El deliverable hacia F7 (spec de construcción)

El panel del jefe para productos = `CatalogoJefePanel` compuesto por:
- Cinta stats (Órgano 9) + búsqueda (Órgano 3) + mosaico categorías (Órgano 1)
- Grid de tarjetas (Órgano 2) con **precio inline (4)** + **toggle disponible (5)** + visualize
  menú de ficha (5b/6/8)
- Botón "+ producto" (7) flotante
- Todas las mutaciones: emitir → señal refresca → la vista ES el feedback

## Puertos abiertos (cableables por el sitio)

- `fuente_del_catalogo` → hoy: carta-manager (proyección al vuelo, sin store)
- `precios_de_extras` → hoy: módulo ingredientes
- `escritor_del_catalogo` → hoy: carta.update_product / carta.add_product / carta.remove_product (custodio)
- `señal_de_refresco` → hoy: catalogo.actualizado + carta.editada

## Consolidación esquematizador-jefe (pasada 4)

Revisión contra el método (5 preguntas-jefe + lente-roles + formas canónicas):
las pasadas 1-3 se sostienen; esta pasada NOMBRA lo que faltaba — ver
`pasada-4-consolidacion-formas-ui.md` para la tabla completa. Resumen:

- **Veredicto del árbitro 13/13 ops**: `update` y `delete` = JEFE · las 11 restantes =
  neutro (ingredientes/health/metrics marcadas "sistema": fuera del flujo) ·
  **UTILIZACIÓN: nada** — productos no vende; el POS consume las lecturas.
- **Composición 3 capas**: SELECCIONAR (ref-select a `productos.carta_completa`:
  label nombre, value id; la vista viva ES el selector) → INFORMARSE (lecturas +
  cinta-estado de stats) → DECLARAR (update/delete, única escritura, vía custodio).
- **Formas UI canónicas mapeadas**: precio/toggle = `inline-gesture` · ficha =
  `editor-bloque` · retirada = `confirmador-nombrado` · stats = `cinta-estado` ·
  señal pareada en toda hoja de declaración: `carta.editada` + `catalogo.actualizado`.
- **[ABIERTO] adicional (c)**: eventos granulares de producto — `producto.creado/
  actualizado/disponibilidad` NO existen (solo `carta.editada` gruesa): sin señal de
  alta, sin rastro del apagón de disponibilidad, sin delta auditable. Decisión de
  dueño + sub-contrato de eventos de la carta; no de esta cara.