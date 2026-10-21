# Pasada 1 — Prisma sobre "marketing-funnel" (Embudo de marketing)

## ¿Qué es?

El embudo que modela el camino del desconocido al cliente fiel. Cada etapa tiene una acción del marketing, una métrica asociada y una tasa de conversión hacia la siguiente etapa. El funnel NO ejecuta — declara las etapas, mide el flujo y señala los cuellos de botella.

---

## [IDENTIDAD] — ¿Qué es el funnel?

- **Etapas** — las fases del embudo (awareness → consideration → conversion → retention → advocacy), personalizables por proyecto. → SPAWN (tiene estructura interna)
- **Flujo** — la medición del paso de una etapa a la siguiente: tasa de conversión entre etapas. → SPAWN (tiene estructura interna)

## [RESTRICCIONES] — ¿Qué limita el funnel?

- **REF** Audiencia → marketing-audience (los segmentos entran por la boca del embudo)
- **REF** Canales → marketing-channels (las acciones se ejecutan en canales)
- **REF** Contenido → marketing-content (el contenido sirve a etapas del funnel)
- **REF** Analytics → marketing-analytics (las métricas alimentan las tasas de conversión)

## [CONTRATO] — ¿Qué promete el módulo?

- **Etapa definida** — toda etapa tiene nombre, métrica principal y acciones asociadas. → ATÓMICO
- **Flujo medido** — toda transición entre etapas tiene tasa de conversión registrada. → ATÓMICO
- **Cuello de botella visible** — el módulo señala la etapa con peor tasa de conversión. → ATÓMICO

## [NO-OBJETIVOS] — ¿Qué NO hace el módulo?

- **No ejecuta acciones** — eso es de campañas/automation (frontera → marketing-campaigns)
- **No captura leads** — eso es del sistema externo (frontera → puertos de datos)
- **No decide el mensaje** — eso es de contenido/strategy (frontera → marketing-content, marketing-strategy)

## [PREGUNTAS_ABIERTAS] — [ABIERTO]

- ¿Etapas fijas o personalizables?
- ¿Funnel único o múltiples por proyecto?
- ¿Granularidad temporal de la medición?

---

## Resumen de la pasada

| Tipo | Cantidad | Piezas |
|---|---|---|
| SPAWN | 2 | Etapas, Flujo |
| REF | 4 | marketing-audience, marketing-channels, marketing-content, marketing-analytics |
| ATÓMICO | 3 | Etapa definida, Flujo medido, Cuello de botella visible |
| [ABIERTO] | 1 | 3 preguntas |
