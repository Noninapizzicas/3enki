# Pasada 1 — Prisma sobre "marketing-campaigns" (Campañas de marketing)

## ¿Qué es?

Una campaña es una acción coordinada con inicio, fin y objetivo específico. Corta un trozo del funnel y lo trabaja con intensidad. Usa múltiples canales y piezas de contenido alineados. El módulo gestiona el ciclo completo: briefing → lanzamiento → seguimiento → cierre.

---

## [IDENTIDAD] — ¿Qué es una campaña?

- **Briefing** — el encargo: objetivo, audiencia, canales, presupuesto, fechas, KPIs. → SPAWN (tiene estructura interna)
- **Assets** — las piezas de contenido producidas para la campaña. → ATÓMICO (lista de IDs referencia a marketing-content)
- **Lanzamiento** — la coordinación de activar los assets en los canales. → ATÓMICO (acto de transición de estado)
- **Cierre** — evaluación de resultados vs objetivos. → ATÓMICO (veredicto: aprendizaje)

## [RESTRICCIONES] — ¿Qué limita las campañas?

- **REF** Contenido → marketing-content (los assets de la campaña)
- **REF** Canales → marketing-channels (dónde se ejecuta)
- **REF** Presupuesto → marketing-budget (cuánto se invierte)
- **REF** Audiencia → marketing-audience (a quién se dirige)
- **REF** Calendario → marketing-calendar (cuándo se ejecuta)
- **REF** Analytics → marketing-analytics (cómo se mide)

## [CONTRATO] — ¿Qué promete el módulo?

- **Briefing completo** — toda campaña tiene objetivo, audiencia, canales y fechas. → ATÓMICO
- **Ciclo cerrado** — toda campaña termina con un cierre (veredicto). → ATÓMICO
- **Assets trazables** — toda pieza de la campaña se puede rastrear. → ATÓMICO

## [NO-OBJETIVOS] — ¿Qué NO hace el módulo?

- **No produce contenido** — eso es de marketing-content y el redactor
- **No mide** — eso es de marketing-analytics
- **No automatiza** — eso es de marketing-automation

## [PREGUNTAS_ABIERTAS] — [ABIERTO]

- ¿Campañas recurrentes (repetir cada periodo)?
- ¿Plantillas de campaña reutilizables?
- ¿Aprobación de briefing antes de lanzar?

---

## Resumen de la pasada

| Tipo | Cantidad | Piezas |
|---|---|---|
| SPAWN | 1 | Briefing |
| ATÓMICO | 6 | Assets, Lanzamiento, Cierre, Briefing completo, Ciclo cerrado, Assets trazables |
| REF | 6 | marketing-content, marketing-channels, marketing-budget, marketing-audience, marketing-calendar, marketing-analytics |
| [ABIERTO] | 1 | 3 preguntas |
