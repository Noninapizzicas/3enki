# Pasada 1 — Prisma sobre "marketing-analytics" (Medición de marketing)

## ¿Qué es?

El sistema de medición del marketing del proyecto — captura datos de cada acción, los transforma en información y retroalimenta la estrategia. Sin medición, el marketing es ciego. Gestiona métricas (KPIs), atribución (qué causó qué), reporting (visualización para decidir) y experimentación (A/B testing).

---

## [IDENTIDAD] — ¿Qué es la medición?

- **Métricas** — catálogo de KPIs del proyecto con su tipo, fuente y fórmula. → SPAWN (tiene estructura interna)
- **Atribución** — asignar qué acción de marketing causó qué resultado. Requiere juicio. → SPAWN (tiene estructura interna)
- **Reporting** — transformar datos crudos en formato legible para tomar decisiones. → ATÓMICO (conversor puro)
- **Experimentación** — ciclo de hipótesis → variante → dato → veredicto. → SPAWN (tiene estructura interna)

## [RESTRICCIONES] — ¿Qué limita la medición?

- **REF** Canales → marketing-channels (las métricas vienen de canales activos)
- **REF** Campañas → marketing-campaigns (la atribución conecta acciones con resultados)
- **REF** Presupuesto → marketing-budget (el ROI cruza gasto con resultado)
- **REF** Contenido → marketing-content (las piezas son lo que se mide)

## [CONTRATO] — ¿Qué promete el módulo?

- **Métrica trazable** — toda métrica tiene tipo, fuente y valor registrado con fecha. → ATÓMICO
- **Dato inmutable** — los registros de métricas se acumulan, no se reemplazan. → ATÓMICO
- **Experimento cerrado** — todo experimento termina con un veredicto (positivo/negativo/inconcluso). → ATÓMICO

## [NO-OBJETIVOS] — ¿Qué NO hace el módulo?

- **No ejecuta acciones** — eso es de campañas/automation (frontera → marketing-campaigns)
- **No captura datos del usuario** — eso es del sistema externo (frontera → puertos de datos)
- **No decide estrategia** — eso es de strategy (frontera → marketing-strategy)

## [PREGUNTAS_ABIERTAS] — [ABIERTO]

- ¿Fuentes de datos: manuales, importadas, API?
- ¿Frecuencia de actualización de métricas?
- ¿Significancia estadística para experimentos?

---

## Resumen de la pasada

| Tipo | Cantidad | Piezas |
|---|---|---|
| SPAWN | 3 | Métricas, Atribución, Experimentación |
| ATÓMICO | 4 | Reporting, Métrica trazable, Dato inmutable, Experimento cerrado |
| REF | 4 | marketing-channels, marketing-campaigns, marketing-budget, marketing-content |
| [ABIERTO] | 1 | 3 preguntas |
