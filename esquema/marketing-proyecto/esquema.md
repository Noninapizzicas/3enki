# Esquema — Concepto "Marketing por Proyecto" (universal, sin sistema)

## Árbol completo

```
Marketing por Proyecto
│
├── [IDENTIDAD] — ¿Qué es el marketing de un proyecto?
│   ├── SPAWN  Estrategia
│   │   ├── ATÓMICO  Posicionamiento ················· reflejo
│   │   └── ATÓMICO  Objetivos ······················· reflejo
│   │   (Segmentación → funde con Audiencia.Segmentos)
│   │   (Mix de canales → funde con Canales)
│   │   (Presupuesto → funde con Presupuesto de marketing)
│   │
│   ├── SPAWN  Ejecución
│   │   ├── ATÓMICO  Publicación ····················· puente
│   │   ├── SPAWN    Campañas
│   │   │   ├── ATÓMICO  Briefing ···················· reflejo
│   │   │   ├── REF      Assets ······················ → Contenido.Tipos de pieza
│   │   │   ├── ATÓMICO  Lanzamiento ················· puente
│   │   │   ├── REF      Seguimiento ················· → Medición
│   │   │   └── ATÓMICO  Cierre ······················ micro-agente
│   │   ├── SPAWN    Automatización
│   │   │   ├── ATÓMICO  Trigger ····················· reflejo
│   │   │   ├── ATÓMICO  Secuencia ··················· reflejo
│   │   │   └── ATÓMICO  Reglas ······················ reflejo
│   │   (Producción de contenido → funde con Contenido)
│   │   (Calendario → funde con Calendario editorial)
│   │
│   └── SPAWN  Medición
│       ├── ATÓMICO  Métricas ························ reflejo
│       ├── ATÓMICO  Atribución ······················ micro-agente
│       ├── ATÓMICO  Reporting ······················· conversor
│       └── ATÓMICO  Experimentación ················· micro-agente
│
├── [RESTRICCIONES] — ¿Qué limita el marketing de un proyecto?
│   ├── REF     Identidad de marca ··················· → marca-cliente (voz + presencia)
│   ├── REF     Directrices de marca ················· → marca-cliente.voz + piel.marketing
│   ├── ATÓMICO Compliance ··························· (reglas fijas, un test las afirma)
│   │
│   ├── SPAWN   Competencia
│   │   ├── ATÓMICO  Monitorización ·················· custodio
│   │   ├── ATÓMICO  Benchmarking ···················· conversor
│   │   └── ATÓMICO  Diferenciación ·················· reflejo
│   │
│   ├── SPAWN   Presupuesto de marketing
│   │   ├── ATÓMICO  Asignación ······················ reflejo
│   │   ├── ATÓMICO  Control ························· custodio
│   │   (ROI por canal → funde con Medición.Atribución)
│   │
│   └── SPAWN   Calendario editorial
│       ├── ATÓMICO  Planificación ··················· custodio
│       ├── ATÓMICO  Estacionalidad ·················· reflejo
│       └── ATÓMICO  Cadencia ························ reflejo
│
├── [CONTRATO] — ¿Qué promete el marketing de un proyecto?
│   ├── SPAWN   Funnel
│   │   ├── ATÓMICO  Awareness ······················· reflejo
│   │   ├── ATÓMICO  Consideration ··················· micro-agente
│   │   ├── ATÓMICO  Conversion ······················ puente
│   │   ├── ATÓMICO  Retention ······················· custodio
│   │   └── ATÓMICO  Advocacy ························ puente
│   │
│   ├── SPAWN   Contenido
│   │   ├── ATÓMICO  Tipos de pieza ·················· reflejo
│   │   ├── ATÓMICO  Ciclo de vida ··················· reflejo
│   │   └── ATÓMICO  Reutilización ··················· conversor
│   │
│   ├── REF     Presencia digital ···················· → marca-cliente.presencia
│   │
│   ├── SPAWN   Relación
│   │   ├── ATÓMICO  Email/Newsletter ················ puente
│   │   ├── ATÓMICO  Comunidad ······················· custodio
│   │   ├── ATÓMICO  Soporte como marketing ·········· puente
│   │   └── ATÓMICO  Personalización ················· conversor
│   │
│   ├── SPAWN   Audiencia
│   │   ├── ATÓMICO  Segmentos ······················· reflejo
│   │   ├── ATÓMICO  Personas ························ micro-agente
│   │   (Journey → funde con Funnel)
│   │
│   └── SPAWN   Canales
│       ├── ATÓMICO  Propios ························· custodio
│       ├── ATÓMICO  Ganados ························· custodio
│       ├── ATÓMICO  Pagados ························· custodio
│       └── ATÓMICO  Compartidos ····················· custodio
│
├── [NO-OBJETIVOS] — ¿Qué NO es el marketing de un proyecto?
│   ├── ATÓMICO Marketing vs Ventas ·················· (frontera)
│   └── ATÓMICO Marketing vs Comunicación corporativa  (frontera)
│
└── [PREGUNTAS_ABIERTAS] — [ABIERTO]
    ├── ¿Autonomía del marketing del proyecto vs estrategia global del dueño?
    ├── ¿Límite entre marketing orgánico y de pago para proyecto pequeño?
    ├── ¿Incluye relación con partners/distribuidores o solo cliente final?
    ├── ¿Un proyecto que no vende (ONG, proyecto interno) tiene marketing?
    └── ¿Cómo se mide ROI cuando el funnel es largo e indirecto (ej: SEO)?
```

## Referencias a módulos existentes

| Pieza REF | Módulo destino | Qué aporta |
|---|---|---|
| Identidad de marca | marca-cliente | Voz de marca (tono, valores), presencia digital (canales) |
| Directrices de marca | marca-cliente.voz + piel.marketing | Reglas de coherencia visual y verbal |
| Presencia digital | marca-cliente.presencia | Los sitios donde el proyecto existe en el mundo digital |
| Assets (de Campañas) | Contenido.Tipos de pieza | Las piezas ya definidas en el catálogo de contenido |
| Seguimiento (de Campañas) | Medición | El sistema de medición ya definido |

## Convergencias (fusiones dentro del árbol)

| Pieza que converge | Destino | Razón |
|---|---|---|
| Segmentación (de Estrategia) | Audiencia.Segmentos | Un solo lugar para definir grupos accionables |
| Mix de canales (de Estrategia) | Canales | Un solo catálogo de canales con su peso |
| Presupuesto (de Estrategia) | Presupuesto de marketing | Un solo módulo de recursos |
| Producción de contenido (de Ejecución) | Contenido | Un solo módulo de piezas |
| Calendario (de Ejecución) | Calendario editorial | Una sola agenda |
| Journey (de Audiencia) | Funnel | Un solo modelo del camino del desconocido al fiel |
| ROI por canal (de Presupuesto) | Medición.Atribución | La atribución vive en medición |

## Reparto de formas (disección)

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 15 | Posicionamiento, Objetivos, Métricas, Diferenciación, Segmentos, Asignación, Estacionalidad, Cadencia, Awareness, Tipos de pieza, Ciclo de vida, Briefing, Trigger, Secuencia, Reglas |
| **custodio** | 9 | Monitorización, Propios, Ganados, Pagados, Compartidos, Control, Planificación, Retention, Comunidad |
| **puente** | 6 | Publicación, Conversion, Advocacy, Email/Newsletter, Soporte como marketing, Lanzamiento |
| **micro-agente** | 5 | Atribución, Experimentación, Personas, Consideration, Cierre |
| **conversor** | 4 | Reporting, Benchmarking, Reutilización, Personalización |

## Recuento

| Métrica | Valor |
|---|---|
| Pasadas hasta el suelo | 2 |
| Piezas totales | 51 |
| ATÓMICAS con forma (diseccionadas) | 39 |
| ATÓMICAS sin forma (fronteras) | 3 (Compliance, Marketing vs Ventas, Marketing vs Comunicación) |
| REF (deduplicadas) | 5 (Identidad de marca, Directrices de marca, Presencia digital, Assets, Seguimiento) |
| Convergencias (fusiones) | 7 |
| SPAWN residual | 0 (convergió en pasada 2) |
| [ABIERTO] | 1 (PREGUNTAS_ABIERTAS — 5 preguntas) |

## Lectura del esquema

El marketing de un proyecto es **mayoritariamente estructura determinista** (reflejo + custodio = 24/39 = 61%). El juicio (micro-agente) aparece concentrado en cinco puntos precisos: interpretar causas (Atribución), sintetizar personas (Personas), evaluar resultados (Cierre, Experimentación) y juzgar relevancia (Consideration). Los puentes (6) conectan las tres fronteras naturales: contenido↔canal, marketing↔acción, soporte↔reputación. Los conversores (4) cubren las transformaciones de formato puras.

El árbol tiene tres ramas principales que mapean a las tres naturalezas del marketing:
- **Estrategia** (IDENTIDAD) — decidir qué hacer: posicionamiento + objetivos
- **Ejecución** (IDENTIDAD) — producir y publicar: publicación + campañas + automatización
- **Medición** (IDENTIDAD) — saber si funciona: métricas + atribución + experimentación

Las restricciones son los recursos (presupuesto, calendario) y el entorno (competencia, marca). El contrato es lo que el marketing entrega: visibilidad (funnel), contenido, relación, audiencia definida, canales operativos.

Cinco módulos existentes ya cubren piezas REF del árbol (marca-cliente, publicador, redactor, project-profile, piel.marketing). Las 39 piezas atómicas son las que este módulo marketing debe implementar, cada una con su forma ya asignada.
