# Pasada 1 — Prisma sobre "marketing-content" (Contenido de marketing)

## ¿Qué es?

Las piezas que el marketing produce para atraer, informar, convencer y fidelizar. Cada pieza tiene un formato, un canal de destino y una etapa del funnel a la que sirve. El módulo gestiona el catálogo de piezas, su ciclo de vida y la reutilización (una pieza madre se fragmenta para múltiples canales).

---

## [IDENTIDAD] — ¿Qué es el contenido?

- **Catálogo de piezas** — las piezas de contenido del proyecto, con su formato, canal destino y estado actual. → SPAWN (tiene estructura interna)
- **Ciclo de vida** — máquina de estados que gobierna cada pieza: idea → borrador → revisión → publicado → retirado. → ATÓMICO (incluido dentro de cada pieza)
- **Reutilización** — una pieza grande (madre) se fragmenta en piezas menores (hijas) para distintos canales. → SPAWN (tiene estructura interna)

## [RESTRICCIONES] — ¿Qué limita el contenido?

- **REF** Canales activos → marketing-channels (el contenido se publica en canales que existen)
- **REF** Calendario → marketing-calendar (la publicación tiene fecha planificada)
- **REF** Audiencia → marketing-audience (el contenido se dirige a segmentos definidos)
- **REF** Estrategia → marketing-strategy (los objetivos orientan qué contenido producir)
- **REF** Funnel → marketing-funnel (cada pieza sirve a una etapa del funnel)

## [CONTRATO] — ¿Qué promete el módulo?

- **Pieza trazable** — toda pieza tiene formato, canal, estado y fecha de creación. → ATÓMICO
- **Hijas vinculadas** — toda pieza hija apunta a su madre. → ATÓMICO
- **Ciclo respetado** — las transiciones de estado siguen la máquina. → ATÓMICO

## [NO-OBJETIVOS] — ¿Qué NO hace el módulo?

- **No redacta contenido** — eso es del redactor o las skills (frontera → redactor, skills)
- **No publica** — eso es del publicador (frontera → publicador)
- **No mide rendimiento** — eso es de analytics (frontera → marketing-analytics)

## [PREGUNTAS_ABIERTAS] — [ABIERTO]

- ¿Etiquetas/tags por pieza?
- ¿Versiones de una misma pieza?
- ¿Limite de reutilización (profundidad madre→hija)?

---

## Resumen de la pasada

| Tipo | Cantidad | Piezas |
|---|---|---|
| SPAWN | 2 | Catálogo de piezas, Reutilización |
| REF | 5 | marketing-channels, marketing-calendar, marketing-audience, marketing-strategy, marketing-funnel |
| ATÓMICO | 3 | Pieza trazable, Hijas vinculadas, Ciclo respetado |
| [ABIERTO] | 1 | 3 preguntas |
