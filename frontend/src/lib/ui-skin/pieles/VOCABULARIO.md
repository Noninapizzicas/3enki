# Vocabulario de piel — tokens + elementos

El contrato lo imponen los componentes, no el engine.
Cada piel CSS llena estos tokens. Los que no llene, el componente resuelve con fallback.

---

## Tokens cromáticos (átomos de marca)

Nombres libres por marca. The Pirate usa `--escenario`, `--tesoro`, `--pergamino`.
Otra marca usará los suyos. Lo que importa son los **roles semánticos** de abajo.

## Tokens semánticos (lo que los componentes consumen)

### Superficie

| Token | Función |
|---|---|
| `--surface-base` | fondo principal de la página |
| `--surface-sunken` | fondo hundido (detrás del base) |
| `--surface-raised` | cards, bloques diferenciados |
| `--surface-elevated` | nav, modals, tooltips |
| `--surface-floating` | elementos por encima de todo |
| `--surface-glass` | translúcido con blur |
| `--surface-glass-blur` | radio del blur (px) |

### Texto

| Token | Función |
|---|---|
| `--text-primary` | texto principal — máximo contraste |
| `--text-secondary` | texto de apoyo — menor contraste |
| `--text-accent` | texto que llama la atención (color de marca) |
| `--text-muted` | texto decorativo — bajo contraste |
| `--text-on-accent` | texto sobre superficie de acento |
| `--text-on-dark` | texto sobre superficie oscura |

### Acción

| Token | Función |
|---|---|
| `--action-primary` | fondo del botón principal |
| `--action-primary-hover` | fondo en hover |
| `--action-primary-active` | fondo en active/press |
| `--action-primary-text` | texto del botón principal |
| `--action-secondary` | fondo del botón secundario (suele ser transparent) |
| `--action-secondary-border` | borde del botón secundario |
| `--action-secondary-text` | texto del botón secundario |
| `--action-secondary-hover` | fondo en hover |

### Borde

| Token | Función |
|---|---|
| `--border-subtle` | separación entre planos (casi invisible) |
| `--border-default` | borde estándar |
| `--border-accent` | borde de acento (color de marca) |
| `--border-focus` | borde de foco accesible |

---

## Tipografía

| Token | Función |
|---|---|
| `--font-display` | fuente de titulares/hero (la voz de impacto) |
| `--font-body` | fuente de cuerpo/lectura (la voz de lectura) |
| `--font-mono` | fuente monoespaciada (código, datos) |
| `--fw-display` | peso de titulares |
| `--fw-body` | peso de cuerpo |
| `--fw-strong` | peso de énfasis |
| `--type-scale` | ratio entre niveles (1.2 = menor third, 1.333 = perfect fourth, 1.618 = golden) |

### Escala de tamaños

| Token | Uso típico |
|---|---|
| `--fs-xs` | etiquetas, captions |
| `--fs-sm` | metadata, nav links |
| `--fs-base` | cuerpo de texto |
| `--fs-lg` | subtítulos, lead text |
| `--fs-xl` | card titles, h3 |
| `--fs-2xl` | section titles, h2 |
| `--fs-3xl` | page titles, h1 |
| `--fs-hero` | hero headline |

### Interlineado

| Token | Uso |
|---|---|
| `--lh-tight` | 1.15 — titulares grandes |
| `--lh-snug` | 1.3 — subtítulos |
| `--lh-normal` | 1.6 — cuerpo |
| `--lh-loose` | 1.8 — texto largo |

### Espaciado de letras

| Token | Uso |
|---|---|
| `--ls-tight` | -0.02em — titulares grandes |
| `--ls-normal` | 0 — cuerpo |
| `--ls-wide` | 0.05em — subtítulos |
| `--ls-caps` | 0.12em — texto en mayúsculas |

---

## Respiración (espaciado)

| Token | Función |
|---|---|
| `--breath` | factor global — multiplica todas las escalas |
| `--space-section` | aire entre secciones de página |
| `--space-card` | padding interno de cards |
| `--space-element` | gap entre elementos hermanos |
| `--space-micro` | gap mínimo (icono + texto) |
| `--space-page` | margen lateral de la página |
| `--space-gap` | gap de grid/flex |

---

## Forma

| Token | Función |
|---|---|
| `--radius` | radio de borde por defecto |
| `--radius-sm/md/lg` | escala de radios |
| `--radius-pill` | 99rem — botones pill |
| `--shadow` | sombra por defecto |
| `--shadow-sm/md` | escala de sombras |
| `--shadow-glow` | glow de acento |

---

## Movimiento

| Token | Función |
|---|---|
| `--duration-fast` | micro-interacciones (150ms) |
| `--duration-base` | transiciones estándar (280ms) |
| `--duration-slow` | transiciones expresivas (500ms) |
| `--duration-dramatic` | transiciones de escena (800ms) |
| `--ease-default` | curva estándar |
| `--ease-in` | entrada |
| `--ease-out` | salida |
| `--ease-bounce` | rebote |

---

## Elementos (clases que la piel puede estilizar)

| Clase | Estructura |
|---|---|
| `.nav` | contenedor de navegación |
| `.nav-brand` | nombre/logo de la marca |
| `.nav-links` + `a` | enlaces de navegación |
| `.hero` | sección hero |
| `.hero-title` | titular principal |
| `.hero-subtitle` | subtítulo/lema |
| `.hero-actions` | grupo de botones |
| `.section` | sección genérica |
| `.section-title` | título de sección |
| `.section-body` | cuerpo de sección |
| `.section-actions` | acciones de sección |
| `.card` | card genérica |
| `.card-title` | título de card |
| `.card-body` | cuerpo de card |
| `.card-price` | precio (e-commerce/carta) |
| `.card-grid` | grid de cards |
| `.btn-primary` | botón primario |
| `.btn-secondary` | botón secundario |
| `.divider` | separador decorativo |

---

## Cómo crear una piel nueva

1. Copia `the-pirate.css` como plantilla
2. Define tus átomos cromáticos (nombres propios de tu marca)
3. Llena los tokens semánticos desde tus átomos
4. Ajusta tipografía, respiración, forma, movimiento
5. Estiliza los elementos con tus tokens
6. El selector es `[data-piel="tu-marca"]`
7. En la página: `<div data-piel="tu-marca">` + importa el CSS
