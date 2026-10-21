# Pasada 1 — Prisma sobre "marketing-calendar" (Calendario editorial de marketing)

## ¿Qué es?

La agenda del marketing del proyecto: cuándo se produce, publica y ejecuta cada pieza de marketing, en qué canal y quién lo hace. Coordina contenido, campañas, estacionalidad y capacidad del equipo. Es el reloj del marketing — la fuente de verdad del CUÁNDO.

---

## [IDENTIDAD] — ¿Qué es el calendario?

- **Planificación** — la agenda en sí: entradas tipadas (pieza × canal × fecha × responsable). Cada entrada es una acción programada. → SPAWN (tiene estructura interna)
- **Estacionalidad** — marcas invariantes en el calendario: festividades, temporadas, lanzamientos programados. Eventos recurrentes que condicionan el plan. → SPAWN (tiene estructura interna)
- **Cadencia** — la frecuencia de publicación por canal: "blog 2/semana, newsletter 1/semana, social 5/semana". Regla determinista. → SPAWN (tiene estructura interna)

## [RESTRICCIONES] — ¿Qué limita el calendario?

- **REF** Canales activos → marketing-channels (solo se planifica en canales operativos)
- **REF** Presupuesto → marketing-budget (la planificación consume partidas del presupuesto)
- **REF** Estrategia → marketing-strategy (los objetivos dictan prioridades del calendario)
- **REF** Audiencia → marketing-audience (el contenido se dirige a segmentos definidos)

## [CONTRATO] — ¿Qué promete el módulo?

- **Agenda completa** — toda acción de marketing tiene fecha, canal y responsable. → ATÓMICO
- **Sin huecos** — la cadencia comprometida se refleja en entradas reales. → ATÓMICO
- **Visibilidad temporal** — cualquier actor puede consultar qué hay planificado para un rango de fechas. → ATÓMICO

## [NO-OBJETIVOS] — ¿Qué NO hace el módulo?

- **No produce contenido** — eso es del módulo de contenido (frontera → marketing-content)
- **No ejecuta campañas** — eso es del módulo de campañas (frontera → marketing-campaigns)
- **No mide resultados** — eso es del módulo de analytics (frontera → marketing-analytics)

## [PREGUNTAS_ABIERTAS] — [ABIERTO]

- ¿Granularidad mínima: día, hora, franja?
- ¿Recurrencia automática (repetir cada semana/mes)?
- ¿Notificación de conflicto de fechas?
- ¿Vista semanal/mensual/trimestral?

---

## Resumen de la pasada

| Tipo | Cantidad | Piezas |
|---|---|---|
| SPAWN | 3 | Planificación, Estacionalidad, Cadencia |
| REF | 4 | marketing-channels, marketing-budget, marketing-strategy, marketing-audience |
| ATÓMICO | 3 | Agenda completa, Sin huecos, Visibilidad temporal |
| [ABIERTO] | 1 | 4 preguntas |
