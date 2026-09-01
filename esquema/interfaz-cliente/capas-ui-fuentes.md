# Las 10 capas de UI — de dónde bebe cada una

> Hallazgo corregido: PielJSON NO es un dato que el jefe rellena a mano.
> Es la SALIDA de un conversor que lee datos de marketing y genera tokens visuales.
> Igual que L5 genera componentes desde content+strategy, las capas visuales
> (L1,L2,L4,L6,L7) generan tokens desde strategy+marca-cliente+audience.
>
> Resultado: 8 de 10 capas beben del marketing (directa o indirectamente).
> Solo L0 (reset fijo) y L3 (primitivos universales) son independientes.

---

## Mapa completo

```
CAPA          FUENTE PRINCIPAL                    FUENTE SECUNDARIA           ESTADO DE LA FUENTE
════          ════════════════                    ═════════════════           ═══════════════════

L0 Reset      NADIE                               —                          ✓ fijo (CSS universal)
              CSS normalization puro.
              No depende de ningún dato
              del proyecto.

L1 Átomos     PielJSON.marketing.tokens            sistema (escalas)          ✓ conversor visual (lee marketing)
              Paleta bruta de marca,               Spacing scale, duration
              radii del proyecto.                  scale, easings son
                                                   universales (no de marca).

L2 Semánticos PielJSON.marketing.tokens            —                          ✓ conversor visual (lee marketing)
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

L4 Tipografía PielJSON.marketing.fuentes           sistema (escala)           ✓ conversor visual (lee marketing)
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

L6 Piel       PielJSON completo                    ruta (cara)                ✓ conversor visual (lee marketing)
              Los tokens semánticos de L2           /carta → marketing
              reciben valores CONCRETOS             /comandero → trabajo
              aquí. Dos caras por proyecto:
              marketing (marca completa)
              trabajo (hue + contraste).

L7 Movimiento PielJSON.marketing.motion            prefers-reduced-motion     ✓ conversor visual (lee marketing)
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

## Resumen por fuente (corregido — PielJSON es conversor, no dato)

| Fuente real | Capas que alimenta | Vía |
|---|---|---|
| **strategy + marca-cliente** | L1, L2, L4, L6, L7 (5 capas) | → conversor visual → PielJSON → capas |
| **content + strategy** | L5 (1 capa) | → esquematizador → componentes-esqueleto |
| **strategy.categoria** | L3 (1 capa) | → routing de arquetipo → estructura de páginas |
| **audience + channels** | L8 (1 capa) | → responsive por público/plataforma |
| **funnel** | L9 (1 capa) | → estados por tipo de acción |
| **nadie** | L0 (1 capa) | fijo |

### Módulos de marketing → capas que alimentan

| Módulo | Capas | Rol |
|---|---|---|
| **strategy** | L1,L2,L3,L4,L5,L6,L7 (7 capas) | El más transversal: arquetipo+posicionamiento+atributos |
| **content** | L5 (1 capa) | Los contenidos definen qué componentes existen |
| **marca-cliente** | L1,L2,L4,L6,L7 (5 capas) | La voz de marca genera la personalidad visual |
| **audience** | L7,L8 (2 capas) | Público → dispositivos + accesibilidad |
| **channels** | L8 (1 capa) | Plataformas → breakpoints |
| **funnel** | L9 (1 capa) | Acciones → estados |
| budget, analytics, automation | 0 capas | 100% internos |

---

## PielJSON es un CONVERSOR, no un dato que se rellena

PielJSON NO necesita un módulo que lo almacene. Es la **salida de un conversor**
que lee datos de marketing y genera los tokens visuales del proyecto.

### De dónde sale cada pieza de PielJSON

```
PielJSON.marketing
│
├── paleta de colores
│   ├── strategy.territorio.categoria → convenciones del sector
│   │   ("restaurante" → cálidos, orgánicos; "fintech" → azules, limpios)
│   ├── strategy.posicionamiento.atributos_deseados → personalidad visual
│   │   ("artesanal" → texturas; "premium" → sombras suaves; "DOP" → dorado)
│   └── marca-cliente.voz.tono → temperatura del color
│       ("cercano" → cálido; "profesional" → neutro; "disruptivo" → saturado)
│
├── tipografía
│   ├── strategy.territorio.categoria → convenciones tipográficas
│   │   ("restaurante" → serif display; "tech" → sans geométrica)
│   └── marca-cliente.voz.tono → peso y forma
│       ("cercano" → rounded; "premium" → serif con contraste; "minimalista" → thin)
│
├── radii
│   ├── strategy.territorio.categoria → convenciones de forma
│   │   ("restaurante" → generoso; "fintech" → tight; "infantil" → pill)
│   └── marca-cliente.voz.tono → orgánico vs angular
│
├── motion
│   ├── marca-cliente.voz.tono → expresividad
│   │   ("expresivo" → ease-out largos; "austero" → casi nulo)
│   └── audience.personas → capacidades del público
│       (mayor edad → menos animación; tech-savvy → más interacción)
│
└── sombras/bordes
    └── strategy.posicionamiento.atributos_deseados → materialidad
        ("premium" → sombras suaves difuminadas; "industrial" → bordes duros;
         "orgánico" → sombras cálidas)
```

### Los módulos que alimentan PielJSON

| Módulo | Qué aporta a PielJSON | Tipo de aporte |
|---|---|---|
| **strategy** | categoria → sector visual; atributos → personalidad; declaración → keywords | DIRECTA (determina la dirección visual) |
| **marca-cliente** | voz.tono → temperatura, peso, expresividad | DIRECTA (personalidad de marca) |
| **audience** | personas → capacidades, preferencias, accesibilidad | CONTEXTUAL (ajusta, no determina) |
| **project-profile** | identidad.que_es → refuerza el sector visual | CONTEXTUAL (confirma) |

### Implicación

PielJSON se genera como cualquier otro fragmento del esquematizador:

```
strategy.categoria    ─┐
strategy.atributos    ─┤
strategy.declaracion  ─┼──→ CONVERSOR visual ──→ PielJSON
marca-cliente.voz     ─┤                          ├── tokens (paleta, radii, sombras)
audience.personas     ─┘                          ├── fuentes (display, body)
                                                  └── motion (duración, easing)
```

No hay hueco: PielJSON es GENERADO, no almacenado. El conversor visual es una pieza
más del ensamblador, al lado del conversor de contenido (L5) y el de estructura (L3).

---

## Qué nos ayuda a determinar cada fuente

| Capa | ¿Cómo se determina lo que entra? |
|---|---|
| L0 | Nada — es fijo |
| L1 | Conversor visual lee strategy.categoria + atributos + marca-cliente.voz → genera paleta + radii |
| L2 | Conversor visual mapea la paleta bruta (L1) a roles semánticos según personalidad de marca |
| L3 | strategy.categoria → skill page-generator correspondiente al arquetipo |
| L4 | Conversor visual lee strategy.categoria + marca-cliente.voz → genera familias tipográficas |
| L5 | El ESQUEMATIZADOR lo clasifica: content (formato→componente) + strategy (campo→sección) |
| L6 | El MOTOR aplica PielJSON (generado en L1+L2) según la ruta (marketing vs trabajo) |
| L7 | Conversor visual lee marca-cliente.voz + audience → genera curvas de motion |
| L8 | audience.personas[].canales_preferidos → dispositivos dominantes |
| L9 | funnel.etapas[].acciones → estados necesarios por tipo de interacción |

---

## Lectura

**Hay DOS conversores principales que alimentan las 10 capas:**

1. **Conversor visual** (genera PielJSON) — lee strategy + marca-cliente + audience →
   produce tokens de color, tipografía, radii, motion, sombras. Alimenta L1, L2, L4, L6, L7.

2. **Conversor de contenido** (esquematizador) — lee content + strategy →
   produce componentes-esqueleto tipados. Alimenta L5.

El resto son reflejos: L3 usa el arquetipo (strategy.categoria), L8 usa audience+channels,
L9 usa funnel. L0 es fijo.

**strategy es el módulo más transversal** — alimenta 7 de 10 capas, directa o indirectamente.
Después marca-cliente (5 capas, todas vía el conversor visual). Content solo alimenta L5,
pero L5 es donde vive TODO el contenido visible.

**No hay hueco.** PielJSON no necesita módulo propio: es la salida del conversor visual,
igual que los fragmentos de content son la salida del esquematizador. Ambos conversores
leen módulos de marketing existentes y producen lo que las capas de UI necesitan.
