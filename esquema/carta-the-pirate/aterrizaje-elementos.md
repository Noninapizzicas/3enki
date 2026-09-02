# Aterrizaje — Átomos de carta → Elementos Svelte

Cada átomo aterriza en HTML/CSS/JS concreto dentro de `+page.svelte`.
La piel viene de `the-pirate.css` (tokens semánticos). Los datos del backend.

---

## Contrato de datos (lo que el backend proyecta)

```ts
interface Categoria { id: string; nombre: string }
interface Alergeno  { id: string; nombre: string; emoji: string }
interface Producto  {
  id: string; nombre: string; descripcion: string;
  precio: number; imagen?: string;
  ingredientes: string[]; alergenos: string[];
  categoriaId: string;
}
interface Marca {
  nombre: string; lema: string; logo?: string;
  telefono: string; whatsapp: string;
  direccion: string; direccionMaps: string;
  horario: string; instagram?: string;
}
```

---

## Mapa átomo → elemento

### A. Cabecera (4 reflejos → HTML estático)

| # | Átomo | Aterriza en |
|---|---|---|
| 1 | Logo | `<img>` con class `carta-logo` |
| 2 | Nombre | `<h1>` con font-display |
| 3 | Lema | `<p>` con font-body + letter-spacing caps |
| 4 | Ambiente | `[data-piel]` wrapper + `--surface-base` |

### B. Navegación (2 reflejos + 1 custodio + 1 puente → JS interactivo)

| # | Átomo | Aterriza en |
|---|---|---|
| 5 | Chip | `<button>` por categoría en `{#each}` |
| 6 | Barra | `<nav>` con `overflow-x: auto` + `position: sticky` |
| 7 | Estado activo | `$state(activeCat)` + IntersectionObserver |
| 8 | Scroll-to | `element.scrollIntoView()` en onclick del chip |

### C. Producto (5 reflejos + 2 conversores → layout convergente)

| # | Átomo | Aterriza en |
|---|---|---|
| 9 | Imagen | `<img loading="lazy">` con aspect-ratio fijo + fallback |
| 10 | Nombre | `<span>` con font-display dentro de la fila |
| 11 | Descripción | `<span>` truncada con `-webkit-line-clamp: 2` |
| 12 | Precio | `<span>` con font-display + color acento |
| 13 | Badges | función `alergInfo(id) → emoji` en `{#each}` |
| 14 | Layout | `display: flex` en `.producto-fila` — convergente |

### D. Pie (5 reflejos → HTML estático)

| # | Átomo | Aterriza en |
|---|---|---|
| 15 | Horario | `<p>` texto |
| 16 | Dirección | `<a href={maps}>` texto + link |
| 17 | Teléfono | `<a href="tel:">` |
| 18 | Redes | `<a href={instagram}>` icono SVG |
| 19 | Legal | `<p>` con font-size xs |

### E. Detalle bajo demanda (1 reflejo + 1 conversor + 2 custodios + 1 puente)

| # | Átomo | Aterriza en |
|---|---|---|
| 20 | Trigger | `<button>` = toda la `.producto-fila`, `min-height: 44px` |
| 21 | Panel | `{#if expanded}` + CSS transition (max-height) |
| 22 | Ingredientes | `{#each ingredientes}` → `<span class="chip">` |
| 23 | Alérgenos | `alergInfo(id) → {nombre, emoji}` → chips enriquecidos |
| 24 | Accordion | `$state(expanded)` — set one, clear previous |

### F. Acción de pedido (1 reflejo + 1 conversor + 1 custodio)

| # | Átomo | Aterriza en |
|---|---|---|
| 25 | FAB | `<a>` con `position: fixed; bottom; right` |
| 26 | Link WA | `href="https://wa.me/{whatsapp}?text=..."` |
| 27 | Visibilidad | `$state(showFab)` + scroll listener con threshold |

---

## Estructura del archivo

```
frontend/src/routes/the-pirate/carta/+page.svelte
```

Una sola página. Los 27 átomos caben en un archivo porque:
- 17 reflejos son HTML directo (sin lógica)
- 4 conversores son funciones puras de 1-3 líneas
- 4 custodios son `$state` con handlers cortos
- 2 puentes son llamadas a API del DOM

La piel la da `the-pirate.css` (ya existe). La página solo consume tokens.
