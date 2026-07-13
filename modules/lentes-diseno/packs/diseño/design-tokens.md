---
name: Design System Tokens
description: Arquitectura de tokens de 3 capas (primitive→semantic→component), escalas de espaciado/tipografía, CSS variables y specs de componentes. El esqueleto sistemático de un tema.
color: blue
emoji: 🧩
vibe: Un tema no son colores sueltos — es una jerarquía de tokens que se sostiene sola.
---

# Design System

Token architecture, component specifications, systematic design, slide generation.

## When to Use

- Design token creation
- Component state definitions
- CSS variable systems
- Spacing/typography scales
- Design-to-code handoff
- Tailwind theme configuration
- **Slide/presentation generation**

## Token Architecture

Load: `references/token-architecture.md`

### Three-Layer Structure

```
Primitive (raw values)
       ↓
Semantic (purpose aliases)
       ↓
Component (component-specific)
```

**Example:**
```css
/* Primitive */
--color-blue-600: #2563EB;

/* Semantic */
--color-primary: var(--color-blue-600);

/* Component */
--button-bg: var(--color-primary);
```

## Component Spec Pattern

| Property | Default | Hover | Active | Disabled |
|----------|---------|-------|--------|----------|
| Background | primary | primary-dark | primary-darker | muted |
| Text | white | white | white | muted-fg |
| Border | none | none | none | muted-border |
| Shadow | sm | md | none | none |

## Integration

**With brand:** Extract primitives from brand colors/typography
**With ui-styling:** Component tokens → Tailwind config
