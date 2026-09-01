# Las 10 capas de UI — de dónde bebe cada una

> Hallazgo: de las 10 capas, solo L5 (Esqueleto) bebe directamente del marketing.
> 5 capas beben de PielJSON (identidad visual del proyecto).
> 2 capas beben de módulos contextuales (audience, channels, funnel).
> 2 capas no beben de nada externo (infraestructura CSS pura).

---

## Mapa completo

```
CAPA          FUENTE PRINCIPAL                    FUENTE SECUNDARIA           ESTADO DE LA FUENTE
════          ════════════════                    ═════════════════           ═══════════════════

L0 Reset      NADIE                               —                          ✓ fijo (CSS universal)
              CSS normalization puro.
              No depende de ningún dato
              del proyecto.

L1 Átomos     PielJSON.marketing.tokens            sistema (escalas)          ⚠ PielJSON sin módulo
              Paleta bruta de marca,               Spacing scale, duration
              radii del proyecto.                  scale, easings son
                                                   universales (no de marca).

L2 Semánticos PielJSON.marketing.tokens            —                          ⚠ PielJSON sin módulo
              Qué color es "acción",
              qué es "superficie", qué
              es "peligro". El SIGNIFICADO
              de los átomos lo decide la
              marca.

L3 Layout     strategy.territorio.categoria        channels (qué presencias)  ✓ módulo existe
              El ARQUETIPO decide qué              Los canales activos
              páginas y en qué orden.              determinan qué presencias
              Restaurante → carta primero;         existen.
              SaaS → pricing+features.
              Los primitivos (Stack, Grid)
              son universales.

L4 Tipografía PielJSON.marketing.fuentes           sistema (escala)           ⚠ PielJSON sin módulo
              Familias display + body              Ratios de la escala
              son identidad de marca.              tipográfica son sistema.

L5 Esqueleto  content + strategy                   —                          ✓ módulos existen
              Los componentes-esqueleto                                       ✓ ya esquematizados
              se definen por lo que van
              a CONTENER:
              - hero ← strategy (headline,
                subheading, trust)
              - blog-card ← content (artículo)
              - faq-accordion ← content (FAQ)
              - testimonial ← content (caso_éxito)
              - feature-list ← strategy (atributos)

L6 Piel       PielJSON completo                    ruta (cara)                ⚠ PielJSON sin módulo
              Los tokens semánticos de L2           /carta → marketing
              reciben valores CONCRETOS             /comandero → trabajo
              aquí. Dos caras por proyecto:
              marketing (marca completa)
              trabajo (hue + contraste).

L7 Movimiento PielJSON.marketing.motion            prefers-reduced-motion     ⚠ PielJSON sin módulo
              Marketing = expresivo.               (navegador)
              Trabajo = rápido/nulo.
              P-PIEL-4: "la piel de
              trabajo puede ser austera".

L8 Responsive audience (dispositivos)              channels (plataformas)     ✓ módulos existen
              Qué dispositivos usa el              Qué canales están
              público objetivo:                    activos (web, app,
              móvil-first vs desktop-first.         kiosko).

L9 Estados    funnel (acciones posibles)           sistema (patrones)         ✓ módulo existe
              Las acciones del cliente             hover/focus/active son
              definen qué estados necesita:        universales; loading/
              loading (pedido en curso),           error/disabled dependen
              error (formulario), success          del tipo de acción.
              (reserva confirmada),
              disabled (opción no disponible).
```

---

## Resumen por fuente

| Fuente | Capas que alimenta | ¿Existe? |
|---|---|---|
| **PielJSON** | L1, L2, L4, L6, L7 (5 capas) | ⚠ DISEÑADO pero sin módulo que lo almacene |
| **content + strategy** | L5 (1 capa) | ✓ módulos existen, ya esquematizados |
| **strategy.categoria** | L3 (1 capa) | ✓ módulo existe |
| **audience + channels** | L8 (1 capa) | ✓ módulos existen |
| **funnel** | L9 (1 capa) | ✓ módulo existe |
| **nadie** | L0 (1 capa) | ✓ fijo |

---

## El hueco: PielJSON

PielJSON está diseñado en `piel-modular.md` con estructura clara:

```json
{
  "id": "String",
  "nombre": "String",
  "trabajo": {
    "variante": "dark | light",
    "tokens": "Map<String, String>",
    "fuentes": "hereda del sistema",
    "motion": "rápido o nulo"
  },
  "marketing": {
    "variante": "dark | light",
    "tokens": "Map<String, String> — paleta completa de marca",
    "fuentes": "display + body corporativas",
    "motion": "expresivo",
    "radii": "los de la marca"
  }
}
```

Pero **ningún módulo existente lo almacena**:
- `marca-cliente` guarda: voz (tono, valores), presencia (canales), clientes, fidelización → NO visual
- `project-profile` guarda: propósito, identidad del negocio (qué es, qué vende) → NO visual

**Opciones**:
1. Ampliar `marca-cliente` con una sección `identidad_visual` que contenga PielJSON
2. Crear un módulo nuevo `piel-proyecto` dedicado a la identidad visual
3. Que PielJSON viva como configuración del proyecto (no módulo, dato puro)

---

## Qué nos ayuda a determinar cada fuente

| Capa | ¿Cómo se determina lo que entra? |
|---|---|
| L0 | Nada — es fijo |
| L1 | El jefe/diseñador declara los colores de marca → PielJSON.marketing.tokens |
| L2 | El jefe asigna significado: "este rojo es acción", "este gris es superficie" |
| L3 | strategy.categoria → skill page-generator correspondiente al arquetipo |
| L4 | El jefe elige fuentes corporativas → PielJSON.marketing.fuentes |
| L5 | El ESQUEMATIZADOR lo clasifica: content (formato→componente) + strategy (campo→sección) |
| L6 | PielJSON ya determinado en L1+L2; L6 es el MOTOR que aplica los valores |
| L7 | PielJSON.motion + accesibilidad (prefers-reduced-motion del navegador) |
| L8 | audience.personas[].canales_preferidos → dispositivos dominantes |
| L9 | funnel.etapas[].acciones → estados necesarios por tipo de interacción |

---

## Lectura

**L5 es la capa-puente entre la piel (visual) y el marketing (datos).** Es la única que
necesita el esquematizador en runtime. Las demás beben de la identidad visual del proyecto
(PielJSON, 5 capas) o de módulos contextuales (audience, channels, funnel — 2 capas) o
de nada (L0).

**El cuello de botella no es el marketing — es PielJSON.** Cinco capas dependen de él y
todavía no tiene hogar en el sistema de módulos. Resolver dónde vive PielJSON desbloquea
la mitad de las capas.
