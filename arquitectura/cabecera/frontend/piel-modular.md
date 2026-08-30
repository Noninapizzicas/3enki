---
id: frontend/piel-modular
dominio: frontend
resumen: "Sistema de UI modular en 10 capas: tokens atómicos → semánticos → reset → layout → tipografía → componentes-esqueleto → piel/tema → movimiento → responsive → estados. Cada capa se cambia sin tocar las demás."
fuentes:
  - frontend/src/lib/ui-skin/**
  - frontend/src/lib/stores/theme.ts
  - frontend/src/lib/stores/prisma-skin.ts
verificado: 2026-08-30
estado: DISEÑO — no implementado
---

# PIEL MODULAR — Sistema de UI en 10 capas

> **Fase: DISEÑO.** Este documento es la arquitectura. No hay código aún.
> El objetivo es un esqueleto que soporte pieles, fuentes, transiciones,
> tamaños para cualquier dispositivo — todo fraccionado en capas independientes.

## Diagnóstico del estado actual

```json
{
  "tiene": {
    "colores": "~21 CSS custom properties (--color-*) en theme.ts",
    "pieles": "1 piel alternativa (prisma-skin.ts) que sobreescribe las mismas vars",
    "aplicacion": "JS inline en :root (root.style.setProperty)",
    "componentes": "estilos scoped Svelte con var(--color-*) + fallbacks hardcoded"
  },
  "no_tiene": [
    "tokens de spacing (padding/margin/gap clavados en cada componente)",
    "escala tipográfica (font-size clavado: 0.75em, 0.875rem, 1rem...)",
    "tokens de border-radius (clavado: 0.375rem, 0.5rem...)",
    "tokens de sombra",
    "sistema de motion/transiciones (clavado: 0.15s, 0.1s...)",
    "breakpoints / container queries (no hay responsive formal)",
    "layout primitives (cada componente monta su propio grid/flex)",
    "sistema de estados unificado (hover/focus/active ad-hoc por componente)"
  ]
}
```

## Las 10 capas — contrato

```
ENUM CapaUI {
  L0_RESET           // normalizar navegadores
  L1_TOKENS_ATOMICOS // valores brutos: paleta, escala spacing, escala tipo, duraciones, easings, radii
  L2_TOKENS_SEMANTICOS // mapeo átomos → significado: --surface, --text-body, --space-section
  L3_LAYOUT          // primitivas de composición: Stack, Cluster, Grid, Sidebar, Center, Cover
  L4_TIPOGRAFIA      // familias, pesos, line-height, letter-spacing por rol
  L5_ESQUELETO       // componentes estructura: forma sin piel (padding+radius+flex, sin color)
  L6_PIEL            // color, sombras, bordes, gradientes — aplicados vía tokens semánticos
  L7_MOVIMIENTO      // transiciones, animaciones, prefers-reduced-motion
  L8_RESPONSIVE      // fluid type, container queries, breakpoints
  L9_ESTADOS         // hover, focus-visible, active, disabled, loading, error, skeleton
}
```

### Contrato de dependencia entre capas

```
L0_RESET ← (sin dependencias — base pura)
L1_TOKENS_ATOMICOS ← L0
L2_TOKENS_SEMANTICOS ← L1 (mapea átomos a roles)
L3_LAYOUT ← L1 (usa spacing atómico)
L4_TIPOGRAFIA ← L1 (usa escala tipográfica atómica)
L5_ESQUELETO ← L1, L3 (usa spacing + layout primitives)
L6_PIEL ← L2 (aplica tokens semánticos de color/sombra/borde)
L7_MOVIMIENTO ← L1 (usa duraciones y easings atómicos)
L8_RESPONSIVE ← L1, L3, L4 (modifica spacing, layout y tipo por viewport/container)
L9_ESTADOS ← L2, L6, L7 (combina color semántico + piel + transición)
```

```
REGLA: cada capa depende SOLO de las capas listadas arriba.
        Cambiar L6 (piel) NO toca L3 (layout) ni L5 (esqueleto).
        Cambiar L4 (tipografía) NO toca L6 (piel).
        → independencia real, no teórica.
```

---

## L0 — Reset

```
ARCHIVO: ui-skin/reset.css

PROPOSITO: eliminar diferencias entre navegadores.
CONTENIDO:
  - box-sizing: border-box en todo (*, *::before, *::after)
  - margin: 0 en body, h1-h6, p, figure, blockquote, dl, dd
  - line-height: 1.5 en body (accesibilidad)
  - -webkit-font-smoothing: antialiased
  - img, picture, video, canvas, svg: display block, max-width 100%
  - input, button, textarea, select: heredan font
  - overflow-wrap: break-word en body
  - #root, #__next: isolation isolate (stacking context)

FUENTE_RECOMENDADA: modern-css-reset de Andy Bell (adaptado)
```

## L1 — Tokens atómicos

```json
{
  "esquema": "tokens-atomicos-v1",
  "archivo": "ui-skin/tokens/atomicos.css",
  "descripcion": "los VALORES BRUTOS — sin semántica, solo la escala",

  "color": {
    "nota": "paleta completa en hue steps, no colores con nombre",
    "estructura": {
      "neutral":  ["--c-neutral-0 (blanco)", "...", "--c-neutral-950 (casi negro)"],
      "primary":  ["--c-primary-50", "--c-primary-100", "...", "--c-primary-900"],
      "accent":   ["--c-accent-50", "...", "--c-accent-900"],
      "success":  ["--c-success-50", "...", "--c-success-900"],
      "warning":  ["--c-warning-50", "...", "--c-warning-900"],
      "error":    ["--c-error-50", "...", "--c-error-900"]
    },
    "formato": "oklch(L C H) — perceptualmente uniforme, gamut p3"
  },

  "spacing": {
    "nota": "escala geométrica base 4px",
    "valores": {
      "--sp-0": "0",
      "--sp-px": "1px",
      "--sp-0.5": "0.125rem",
      "--sp-1": "0.25rem",
      "--sp-2": "0.5rem",
      "--sp-3": "0.75rem",
      "--sp-4": "1rem",
      "--sp-5": "1.25rem",
      "--sp-6": "1.5rem",
      "--sp-8": "2rem",
      "--sp-10": "2.5rem",
      "--sp-12": "3rem",
      "--sp-16": "4rem",
      "--sp-20": "5rem",
      "--sp-24": "6rem"
    }
  },

  "tipografia": {
    "nota": "escala modular ratio 1.25 (Major Third)",
    "valores": {
      "--fs-xs": "0.64rem",
      "--fs-sm": "0.8rem",
      "--fs-base": "1rem",
      "--fs-md": "1.25rem",
      "--fs-lg": "1.563rem",
      "--fs-xl": "1.953rem",
      "--fs-2xl": "2.441rem",
      "--fs-3xl": "3.052rem"
    },
    "line_heights": {
      "--lh-tight": "1.2",
      "--lh-normal": "1.5",
      "--lh-relaxed": "1.75"
    },
    "font_weights": {
      "--fw-normal": "400",
      "--fw-medium": "500",
      "--fw-semibold": "600",
      "--fw-bold": "700"
    }
  },

  "radii": {
    "--radius-none": "0",
    "--radius-sm": "0.25rem",
    "--radius-md": "0.375rem",
    "--radius-lg": "0.5rem",
    "--radius-xl": "0.75rem",
    "--radius-2xl": "1rem",
    "--radius-full": "9999px"
  },

  "sombras": {
    "--shadow-xs": "0 1px 2px oklch(0 0 0 / 0.05)",
    "--shadow-sm": "0 1px 3px oklch(0 0 0 / 0.1), 0 1px 2px oklch(0 0 0 / 0.06)",
    "--shadow-md": "0 4px 6px oklch(0 0 0 / 0.1), 0 2px 4px oklch(0 0 0 / 0.06)",
    "--shadow-lg": "0 10px 15px oklch(0 0 0 / 0.1), 0 4px 6px oklch(0 0 0 / 0.05)",
    "--shadow-xl": "0 20px 25px oklch(0 0 0 / 0.1), 0 8px 10px oklch(0 0 0 / 0.04)"
  },

  "motion": {
    "duraciones": {
      "--dur-instant": "50ms",
      "--dur-fast": "100ms",
      "--dur-normal": "200ms",
      "--dur-slow": "300ms",
      "--dur-slower": "500ms"
    },
    "easings": {
      "--ease-default": "cubic-bezier(0.4, 0, 0.2, 1)",
      "--ease-in": "cubic-bezier(0.4, 0, 1, 1)",
      "--ease-out": "cubic-bezier(0, 0, 0.2, 1)",
      "--ease-in-out": "cubic-bezier(0.4, 0, 0.2, 1)",
      "--ease-spring": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      "--ease-bounce": "cubic-bezier(0.34, 1.3, 0.64, 1)"
    }
  },

  "z_index": {
    "--z-base": "0",
    "--z-dropdown": "10",
    "--z-sticky": "20",
    "--z-overlay": "30",
    "--z-modal": "40",
    "--z-popover": "50",
    "--z-toast": "60"
  }
}
```

## L2 — Tokens semánticos

```json
{
  "esquema": "tokens-semanticos-v1",
  "archivo": "ui-skin/tokens/semanticos.css",
  "descripcion": "mapean átomos a SIGNIFICADO — lo que consumen los componentes",
  "nota": "ESTE es el archivo que cambia la PIEL. Un componente NUNCA usa un token atómico directamente para color.",

  "superficie": {
    "--surface-base": "var(--c-neutral-950)",
    "--surface-raised": "var(--c-neutral-900)",
    "--surface-overlay": "var(--c-neutral-800)",
    "--surface-sunken": "var(--c-neutral-980)",
    "--surface-interactive": "var(--c-neutral-850)",
    "--surface-interactive-hover": "var(--c-neutral-800)"
  },

  "texto": {
    "--text-primary": "var(--c-neutral-50)",
    "--text-secondary": "var(--c-neutral-400)",
    "--text-tertiary": "var(--c-neutral-500)",
    "--text-inverse": "var(--c-neutral-950)",
    "--text-on-primary": "var(--c-neutral-0)",
    "--text-link": "var(--c-primary-400)",
    "--text-link-hover": "var(--c-primary-300)"
  },

  "borde": {
    "--border-default": "var(--c-neutral-800)",
    "--border-subtle": "var(--c-neutral-850)",
    "--border-strong": "var(--c-neutral-600)",
    "--border-focus": "var(--c-primary-500)",
    "--border-error": "var(--c-error-500)"
  },

  "accion": {
    "--action-primary": "var(--c-primary-500)",
    "--action-primary-hover": "var(--c-primary-400)",
    "--action-primary-active": "var(--c-primary-600)",
    "--action-secondary": "var(--c-neutral-800)",
    "--action-secondary-hover": "var(--c-neutral-700)",
    "--action-destructive": "var(--c-error-500)",
    "--action-destructive-hover": "var(--c-error-400)"
  },

  "estado": {
    "--status-success": "var(--c-success-500)",
    "--status-success-bg": "var(--c-success-950)",
    "--status-warning": "var(--c-warning-500)",
    "--status-warning-bg": "var(--c-warning-950)",
    "--status-error": "var(--c-error-500)",
    "--status-error-bg": "var(--c-error-950)",
    "--status-info": "var(--c-primary-500)",
    "--status-info-bg": "var(--c-primary-950)"
  },

  "espaciado_semantico": {
    "--space-component-gap": "var(--sp-2)",
    "--space-section-gap": "var(--sp-8)",
    "--space-page-padding": "var(--sp-4)",
    "--space-card-padding": "var(--sp-4)",
    "--space-input-x": "var(--sp-3)",
    "--space-input-y": "var(--sp-2)"
  },

  "radio_semantico": {
    "--radius-component": "var(--radius-md)",
    "--radius-card": "var(--radius-lg)",
    "--radius-input": "var(--radius-md)",
    "--radius-button": "var(--radius-md)",
    "--radius-modal": "var(--radius-xl)"
  },

  "sombra_semantica": {
    "--shadow-card": "var(--shadow-sm)",
    "--shadow-dropdown": "var(--shadow-md)",
    "--shadow-modal": "var(--shadow-xl)",
    "--shadow-toast": "var(--shadow-lg)"
  }
}
```

## L3 — Layout primitives

```
PROPOSITO: componentes de COMPOSICION pura — solo distribución, sin piel.
ARCHIVO: ui-skin/layout/

PRIMITIVA Stack {
  proposito: "apilar hijos verticalmente con gap uniforme"
  props: { gap: SpacingToken = '--sp-4', recursive: Boolean = false }
  css: "display: flex; flex-direction: column; gap: var(gap)"
}

PRIMITIVA Cluster {
  proposito: "hijos en fila que hacen wrap natural"
  props: { gap: SpacingToken = '--sp-4', justify: String = 'flex-start', align: String = 'center' }
  css: "display: flex; flex-wrap: wrap; gap: var(gap); justify-content: justify; align-items: align"
}

PRIMITIVA Grid {
  proposito: "grid auto-fill con mínimo configurable"
  props: { min: String = '250px', gap: SpacingToken = '--sp-4' }
  css: "display: grid; grid-template-columns: repeat(auto-fill, minmax(min(min, 100%), 1fr)); gap: var(gap)"
}

PRIMITIVA Sidebar {
  proposito: "sidebar fija + contenido fluido, colapsa en estrecho"
  props: { side: 'left'|'right' = 'left', sideWidth: String, contentMin: String = '60%', gap: SpacingToken = '--sp-4' }
  css: "display: flex; flex-wrap: wrap; gap: var(gap); > :first-child { flex-basis: sideWidth } > :last-child { flex: 1; min-inline-size: contentMin }"
}

PRIMITIVA Center {
  proposito: "centrar contenido con ancho máximo"
  props: { max: String = '65ch', padding: SpacingToken = '--sp-4' }
  css: "max-inline-size: max; margin-inline: auto; padding-inline: var(padding)"
}

PRIMITIVA Cover {
  proposito: "cubrir viewport con hijo centrado verticalmente"
  props: { min: String = '100vh', padding: SpacingToken = '--sp-4' }
  css: "display: flex; flex-direction: column; min-block-size: min; padding: var(padding); > * { margin-block: auto }"
}

PRIMITIVA Frame {
  proposito: "ratio de aspecto fijo (imagen, video, embed)"
  props: { ratio: String = '16/9' }
  css: "aspect-ratio: ratio; overflow: hidden; > * { inline-size: 100%; block-size: 100%; object-fit: cover }"
}
```

## L4 — Tipografía

```json
{
  "esquema": "tipografia-v1",
  "archivo": "ui-skin/typography.css",

  "familias": {
    "--font-sans": "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    "--font-mono": "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    "--font-display": "var(--font-sans)"
  },

  "roles": {
    "heading-1": { "family": "var(--font-display)", "size": "var(--fs-3xl)", "weight": "var(--fw-bold)", "line-height": "var(--lh-tight)", "letter-spacing": "-0.02em" },
    "heading-2": { "family": "var(--font-display)", "size": "var(--fs-2xl)", "weight": "var(--fw-bold)", "line-height": "var(--lh-tight)", "letter-spacing": "-0.01em" },
    "heading-3": { "family": "var(--font-display)", "size": "var(--fs-xl)", "weight": "var(--fw-semibold)", "line-height": "var(--lh-tight)" },
    "heading-4": { "family": "var(--font-display)", "size": "var(--fs-lg)", "weight": "var(--fw-semibold)", "line-height": "var(--lh-normal)" },
    "body": { "family": "var(--font-sans)", "size": "var(--fs-base)", "weight": "var(--fw-normal)", "line-height": "var(--lh-normal)" },
    "body-sm": { "family": "var(--font-sans)", "size": "var(--fs-sm)", "weight": "var(--fw-normal)", "line-height": "var(--lh-normal)" },
    "caption": { "family": "var(--font-sans)", "size": "var(--fs-xs)", "weight": "var(--fw-normal)", "line-height": "var(--lh-normal)" },
    "code": { "family": "var(--font-mono)", "size": "var(--fs-sm)", "weight": "var(--fw-normal)", "line-height": "var(--lh-relaxed)" },
    "label": { "family": "var(--font-sans)", "size": "var(--fs-sm)", "weight": "var(--fw-medium)", "line-height": "var(--lh-tight)" },
    "button": { "family": "var(--font-sans)", "size": "var(--fs-sm)", "weight": "var(--fw-semibold)", "line-height": "1" }
  },

  "implementacion": "clases CSS (.text-h1, .text-body, .text-caption...) que agrupan las 4 propiedades"
}
```

## L5 — Componentes esqueleto

```
PROPOSITO: la FORMA del componente sin piel — padding, radius, flex, tamaños.
           Un componente esqueleto se ve "transparente" — solo ocupa espacio y responde a interacción.
NOTA: usa tokens atómicos de spacing y radii, NUNCA tokens semánticos de color.
ARCHIVO: cada componente en su .svelte, la parte <style> solo toca forma.

ESQUELETO Button {
  display: inline-flex
  align-items: center
  justify-content: center
  gap: var(--sp-2)
  border: 1px solid transparent
  cursor: pointer
  tamaños:
    sm: { padding: var(--sp-1) var(--sp-2), font: role(button), radius: var(--radius-component) }
    md: { padding: var(--sp-2) var(--sp-3), font: role(button), radius: var(--radius-component) }
    lg: { padding: var(--sp-3) var(--sp-4), font: role(button), radius: var(--radius-component) }
}

ESQUELETO Card {
  padding: var(--space-card-padding)
  border-radius: var(--radius-card)
  overflow: hidden
}

ESQUELETO Input {
  padding: var(--space-input-y) var(--space-input-x)
  border-radius: var(--radius-input)
  border: 1px solid transparent
  font: role(body)
  min-height: 2.5rem
}

ESQUELETO Modal {
  border-radius: var(--radius-modal)
  padding: var(--sp-6)
  max-width: min(90vw, 32rem)
  max-height: 85vh
  overflow-y: auto
}

ESQUELETO Badge {
  display: inline-flex
  align-items: center
  padding: var(--sp-0.5) var(--sp-2)
  border-radius: var(--radius-full)
  font: role(caption)
}

ESQUELETO Panel {
  border-radius: var(--radius-card)
  overflow: hidden
  display: flex
  flex-direction: column
}
```

## L6 — Piel (dato del proyecto, no código)

> **Decisión clave:** la piel NO se hardcodea en el frontend. Se define en cada proyecto
> y viaja con él. El código solo tiene el MOTOR que aplica cualquier piel; los VALORES
> viven en la config del proyecto. Así cada proyecto (pizzepos, prisma, un cliente nuevo)
> tiene su identidad visual sin tocar el repo del frontend.

```json
{
  "esquema": "piel-dinamica-v1",
  "principio": "la piel es DATO del proyecto, no código del frontend",

  "donde_vive": {
    "definicion": "en la config del proyecto (project-manager / marca.json / DB)",
    "transporte": "llega al frontend por MQTT al entrar al proyecto",
    "topic": "core/<project_id>/config/skin",
    "persistencia": "el proyecto persiste su piel; el frontend solo la CONSUME"
  },

  "contrato_piel": {
    "descripcion": "JSON que redefine tokens semánticos — solo los que cambia respecto al default",
    "estructura": {
      "id": "String — identificador único de la piel",
      "nombre": "String — nombre visible (ej: 'Pizzepos Cálido')",
      "variante": "'dark' | 'light' — familia base sobre la que se monta",
      "tokens": {
        "nota": "Map<TokenSemantico, valor> — SOLO los que difieren del default de la variante",
        "ejemplo": {
          "--surface-base": "#0d1512",
          "--action-primary": "#14b8a6",
          "--text-link": "#2dd4bf"
        }
      },
      "fuentes": {
        "nota": "opcional — override de familias tipográficas",
        "ejemplo": {
          "--font-sans": "'Poppins', system-ui, sans-serif",
          "--font-display": "'Playfair Display', serif"
        }
      },
      "motion": {
        "nota": "opcional — override de duraciones/easings",
        "ejemplo": {
          "--dur-normal": "250ms",
          "--ease-default": "cubic-bezier(0.22, 1, 0.36, 1)"
        }
      },
      "radii": {
        "nota": "opcional — override de border-radius",
        "ejemplo": {
          "--radius-component": "0.5rem",
          "--radius-card": "1rem"
        }
      }
    }
  },

  "motor_de_aplicacion": {
    "archivo": "ui-skin/skin-engine.ts",
    "responsabilidad": [
      "recibir el JSON de piel del proyecto por MQTT",
      "resolver la variante base (dark/light) como capa de defaults",
      "aplicar los overrides del proyecto como setProperty en :root",
      "restaurar al default del sistema al salir del proyecto",
      "emitir 'skin.applied' al bus para que los componentes que necesiten reaccionar lo hagan"
    ]
  },

  "flujo": [
    "1. Usuario entra al proyecto",
    "2. project-manager publica core/<id>/config/skin con el JSON de piel",
    "3. skin-engine recibe, resuelve variante base, aplica overrides en :root",
    "4. Todos los componentes ya consumen tokens semánticos → cambian solos",
    "5. Usuario sale del proyecto → skin-engine restaura defaults del sistema"
  ],

  "piel_default_del_sistema": {
    "nota": "el frontend SÍ trae una piel default (dark + light) como fallback",
    "vive_en": "ui-skin/tokens/semanticos.css — los valores por defecto",
    "cuando": "sin proyecto activo, o proyecto sin piel definida"
  },

  "donde_se_edita_la_piel": {
    "nota": "la piel se crea/edita desde el proyecto — admin-panel, blueprint, o herramienta de marca",
    "no_en": "archivos CSS del frontend — esos NUNCA contienen pieles específicas de proyecto"
  }
}
```

### Pseudocódigo del motor

```
CLASE SkinEngine {
  defaults : Map<Variante, Map<Token, Valor>>   // dark y light, del CSS estático
  activa   : Piel | null
  bus      : EventBus

  aplicar(piel: PielJSON): Void {
    PRECONDICION: piel.tokens es Map<String, String>
    base ← defaults.get(piel.variante ?? 'dark')

    root ← document.documentElement
    root.setAttribute('data-skin', piel.id)
    root.setAttribute('data-variant', piel.variante ?? 'dark')

    // aplica overrides del proyecto sobre la base
    PARA [token, valor] EN piel.tokens:
      root.style.setProperty(token, valor)

    SI piel.fuentes:
      PARA [token, valor] EN piel.fuentes:
        root.style.setProperty(token, valor)

    SI piel.motion:
      PARA [token, valor] EN piel.motion:
        root.style.setProperty(token, valor)

    SI piel.radii:
      PARA [token, valor] EN piel.radii:
        root.style.setProperty(token, valor)

    activa = piel
    bus.emit('skin.applied', { id: piel.id, variante: piel.variante })
  }

  restaurar(): Void {
    root ← document.documentElement
    root.removeAttribute('data-skin')
    // limpiar todos los inline styles que puso aplicar()
    SI activa:
      PARA token EN [...activa.tokens, ...activa.fuentes, ...activa.motion, ...activa.radii]:
        root.style.removeProperty(token)
    activa = null
    // el CSS estático (semanticos.css) retoma el control
    bus.emit('skin.cleared')
  }

  // suscripción MQTT — se engancha al conectar al proyecto
  onSkinMessage(payload: PielJSON): Void {
    aplicar(payload)
  }
}
```

### Ejemplo de piel de proyecto (JSON que viaja por MQTT)

```json
{
  "id": "pizzepos-calido",
  "nombre": "Pizzepos Cálido",
  "variante": "dark",
  "tokens": {
    "--surface-base": "#1a1210",
    "--surface-raised": "#231c18",
    "--action-primary": "#e67e22",
    "--action-primary-hover": "#d35400",
    "--text-link": "#f0a050",
    "--status-success": "#27ae60",
    "--border-focus": "#e67e22"
  },
  "fuentes": {
    "--font-display": "'Merriweather', serif"
  },
  "radii": {
    "--radius-component": "0.5rem",
    "--radius-card": "1rem"
  }
}
```

## L7 — Movimiento

```json
{
  "esquema": "movimiento-v1",
  "archivo": "ui-skin/motion.css",

  "utilidades": {
    ".transition-colors": "transition: color var(--dur-fast) var(--ease-default), background-color var(--dur-fast) var(--ease-default), border-color var(--dur-fast) var(--ease-default)",
    ".transition-transform": "transition: transform var(--dur-normal) var(--ease-spring)",
    ".transition-opacity": "transition: opacity var(--dur-normal) var(--ease-default)",
    ".transition-all": "transition: all var(--dur-normal) var(--ease-default)",
    ".transition-none": "transition: none"
  },

  "keyframes": {
    "fade-in": "from { opacity: 0 } to { opacity: 1 }",
    "fade-out": "from { opacity: 1 } to { opacity: 0 }",
    "slide-up": "from { transform: translateY(var(--sp-4)); opacity: 0 } to { transform: translateY(0); opacity: 1 }",
    "slide-down": "from { transform: translateY(calc(-1 * var(--sp-4))); opacity: 0 } to { transform: translateY(0); opacity: 1 }",
    "scale-in": "from { transform: scale(0.95); opacity: 0 } to { transform: scale(1); opacity: 1 }",
    "spin": "from { transform: rotate(0deg) } to { transform: rotate(360deg) }",
    "pulse": "0%,100% { opacity: 1 } 50% { opacity: 0.5 }",
    "shake": "0%,100% { transform: translateX(0) } 25% { transform: translateX(-4px) } 75% { transform: translateX(4px) }"
  },

  "reduced_motion": {
    "regla": "@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important } }",
    "nota": "obligatorio — accesibilidad no negociable"
  }
}
```

## L8 — Responsive

```json
{
  "esquema": "responsive-v1",
  "archivo": "ui-skin/responsive.css",

  "breakpoints": {
    "--bp-sm": "640px",
    "--bp-md": "768px",
    "--bp-lg": "1024px",
    "--bp-xl": "1280px",
    "--bp-2xl": "1536px"
  },

  "fluid_type": {
    "metodo": "clamp(min, preferred, max)",
    "ejemplo_body": "font-size: clamp(var(--fs-sm), 2.5vw, var(--fs-base))",
    "ejemplo_h1": "font-size: clamp(var(--fs-xl), 5vw, var(--fs-3xl))",
    "nota": "la escala de L1 define los extremos; el fluid interpola"
  },

  "container_queries": {
    "proposito": "componentes que responden a SU contenedor, no al viewport",
    "habilitacion": "el layout primitive que aloja el componente define container-type: inline-size",
    "ejemplo": "@container (min-width: 400px) { .card { flex-direction: row } }",
    "prioridad": "container queries > media queries para componentes; media queries para layout de página"
  },

  "spacing_fluid": {
    "proposito": "spacing que escala con viewport sin media queries",
    "ejemplo": "--space-page-padding: clamp(var(--sp-3), 4vw, var(--sp-8))"
  },

  "touch_targets": {
    "minimo": "44px × 44px (WCAG 2.5.5 AAA)",
    "metodo": "min-height: 44px; min-width: 44px en todos los interactivos",
    "nota": "el esqueleto (L5) ya lo garantiza en los tamaños md y lg"
  }
}
```

## L9 — Estados

```json
{
  "esquema": "estados-v1",
  "archivo": "ui-skin/states.css",

  "estados_interactivos": {
    "hover": {
      "visual": "superficie sube un step (--surface-interactive → --surface-interactive-hover)",
      "transition": "var(--dur-fast) var(--ease-default)"
    },
    "focus-visible": {
      "visual": "outline 2px solid var(--border-focus), offset 2px",
      "nota": "SOLO focus-visible, nunca focus genérico — teclado sí, click no"
    },
    "active": {
      "visual": "scale(0.97) + superficie baja un step",
      "transition": "var(--dur-instant) var(--ease-in)"
    },
    "disabled": {
      "visual": "opacity: 0.4, cursor: not-allowed, pointer-events: none",
      "nota": "pointer-events none impide tooltips — considerar aria-disabled si se necesita tooltip"
    }
  },

  "estados_de_carga": {
    "loading": {
      "visual": "spinner o pulse animation + opacity 0.7 en contenido",
      "aria": "aria-busy=true"
    },
    "skeleton": {
      "visual": "rectángulos con pulse animation en los huecos del contenido",
      "transition": "fade-in al cargar el contenido real"
    }
  },

  "estados_de_feedback": {
    "error": {
      "visual": "border-color: var(--border-error) + mensaje debajo",
      "animation": "shake para errores de validación inline",
      "aria": "aria-invalid=true + aria-describedby al mensaje"
    },
    "success": {
      "visual": "border-color: var(--status-success) temporal (2s), luego vuelve a default"
    }
  }
}
```

---

## Modelo OOP — cómo se compone

```
INTERFAZ Capa {
  id: CapaUI
  dependeDe: Array<CapaUI>
  archivos: Array<String>
  aplicar(target: HTMLElement): Void
}

CLASE SistemaUI {
  capas: Map<CapaUI, Capa>
  skinEngine: SkinEngine

  aplicarEstructura(root: HTMLElement): Void {
    // L0→L1→L2→L3→L4→L5→L7→L8→L9 vienen del CSS estático (importados en index.css)
    // L6 (piel) la aplica skinEngine cuando llega el dato del proyecto
  }
}

VALUE_OBJECT PielJSON {
  id       : String
  nombre   : String
  variante : 'dark' | 'light'
  tokens   : Map<String, String>         // solo los overrides semánticos
  fuentes? : Map<String, String>         // override de familias
  motion?  : Map<String, String>         // override de duraciones/easings
  radii?   : Map<String, String>         // override de radii

  ORIGEN: config del proyecto (project-manager / marca.json / DB)
  TRANSPORTE: MQTT → core/<project_id>/config/skin
  CICLO: llega al entrar al proyecto, se limpia al salir
}

CLASE SkinEngine {
  defaults : Map<Variante, Map<Token, Valor>>  // del CSS estático
  activa   : PielJSON | null
  bus      : EventBus

  aplicar(piel: PielJSON): Void       // overrides en :root
  restaurar(): Void                    // limpia inline, CSS estático retoma
  onSkinMessage(payload: PielJSON)     // suscripción MQTT
}
```

## Estructura de archivos propuesta

```
frontend/src/lib/ui-skin/
├── reset.css                     # L0
├── tokens/
│   ├── atomicos.css              # L1 — valores brutos (escalas, paleta neutral)
│   ├── semanticos.css            # L2 — mapeo a significado (defaults dark)
│   └── semanticos-light.css      # L2 — defaults light (se activa por data-variant="light")
├── layout/
│   ├── Stack.svelte              # L3
│   ├── Cluster.svelte
│   ├── Grid.svelte
│   ├── Sidebar.svelte
│   ├── Center.svelte
│   ├── Cover.svelte
│   └── Frame.svelte
├── typography.css                # L4
├── skin-engine.ts                # L6 — MOTOR: recibe PielJSON por MQTT, aplica/restaura
├── motion.css                    # L7
├── responsive.css                # L8
├── states.css                    # L9
└── index.css                     # importa L0→L1→L2→L4→L7→L8→L9 en orden
```

```
NOTA: NO hay carpeta skins/ con archivos CSS por proyecto.
      Cada proyecto define su piel en su propia config (marca.json o DB).
      El frontend solo tiene el MOTOR (skin-engine.ts) y los DEFAULTS (semanticos.css).
```

## Migración desde el estado actual

```
PLAN:
  1. Crear ui-skin/ con L0, L1, L2 (extraer los ~21 colores actuales a la escala atómica + defaults semánticos)
  2. Crear skin-engine.ts (L6 motor) — recibe PielJSON, aplica overrides, restaura
  3. Refactorizar theme.ts: de setProperty×21 a delegar en skin-engine
  4. Migrar prisma-skin.ts: de objeto JS hardcoded → PielJSON en la config del proyecto prisma
  5. Crear layout primitives (L3) como componentes Svelte
  6. Migrar componentes base (Button, Badge, Card...) a esqueleto+tokens semánticos
  7. Añadir L7 (motion) y L8 (responsive) como utilidades CSS
  8. Migrar componentes de dominio gradualmente (comandero, cocina, carta...)
  9. Cada proyecto existente define su PielJSON en su marca.json o config

RIESGO: los fallbacks hardcoded en ~80 componentes (var(--color-text, #e5e5e5)).
MITIGACION: se eliminan al migrar cada componente — no se rompe nada mientras tanto
            porque los nuevos tokens semánticos mapean a los mismos valores.

RIESGO: proyectos sin piel definida.
MITIGACION: el CSS estático (semanticos.css) es el fallback — funciona sin MQTT,
            sin proyecto, sin config. El skin-engine solo AÑADE; sin dato, hay default.
```
