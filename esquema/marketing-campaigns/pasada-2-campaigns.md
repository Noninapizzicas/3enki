# Pasada 2 — Expansión de los SPAWN de "marketing-campaigns"

Método: prisma sobre cada sub-producto SPAWN de la pasada 1.

---

## SPAWN 1 — Briefing

El documento-encargo de la campaña. Contiene todo lo necesario para ejecutarla.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 1 | **Nombre** | ATÓMICO | Identificador legible de la campaña ("Lanzamiento verano 2026", "Black Friday Q4"). |
| 2 | **Objetivo** | ATÓMICO | Qué se quiere lograr: texto + métrica objetivo (e.g. "100 leads en 2 semanas"). |
| 3 | **Audiencia** | ATÓMICO | ID del segmento objetivo (referencia a marketing-audience). |
| 4 | **Canales** | ATÓMICO | IDs de los canales donde se ejecuta (referencia a marketing-channels). |
| 5 | **Presupuesto** | ATÓMICO | Importe asignado a la campaña: { cantidad, moneda }. |
| 6 | **Periodo** | ATÓMICO | Fechas inicio y fin de la campaña. |
| 7 | **KPIs** | ATÓMICO | Lista de métricas que miden el éxito: [{ metrica, objetivo_valor }]. |
| 8 | **Estado** | ATÓMICO | Máquina de estados: borrador → aprobado → activa → cerrada → cancelada. |

**Suelo alcanzado** — piezas atómicas.

---

## Convergencias detectadas

| Patrón | Piezas que convergen | Resolución |
|---|---|---|
| Periodo | Pieza 6 (periodo de campaña) y marketing-calendar | Misma forma temporal. |
| Presupuesto | Pieza 5 (presupuesto de campaña) y marketing-budget | La campaña consume una partida del presupuesto. |

## Resumen de la pasada

| Métrica | Valor |
|---|---|
| Piezas atómicas nuevas | 8 |
| SPAWN residual | 0 |
| Convergencias | 2 |
