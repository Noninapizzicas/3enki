# Pasada 2 — Expansión de los SPAWN de "marketing-funnel"

Método: prisma sobre cada sub-producto SPAWN de la pasada 1.

---

## SPAWN 1 — Etapas

Las fases del embudo. Cada etapa describe un momento del camino del desconocido al cliente fiel, con su métrica principal y las acciones de marketing asociadas.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 1 | **Nombre** | ATÓMICO | Identificador legible de la etapa ("Awareness", "Conversión", "Fidelización"). |
| 2 | **Orden** | ATÓMICO | Posición en el embudo (1 = boca, N = fondo). |
| 3 | **Descripción** | ATÓMICO | Texto breve del propósito de la etapa. |
| 4 | **Métrica principal** | ATÓMICO | El KPI que mide el éxito de esta etapa (referencia a marketing-analytics o texto libre). |
| 5 | **Acciones** | ATÓMICO | Lista de acciones de marketing asociadas a esta etapa (textos descriptivos). |
| 6 | **Volumen actual** | ATÓMICO | Cantidad de personas/leads en esta etapa (último dato registrado). |

**Suelo alcanzado** — piezas atómicas.

---

## SPAWN 2 — Flujo

La medición del paso entre etapas. Cada transición tiene una tasa de conversión que se registra con fecha.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 7 | **Etapa origen** | ATÓMICO | ID de la etapa desde la que se mide el paso. |
| 8 | **Etapa destino** | ATÓMICO | ID de la etapa hacia la que se mide el paso. |
| 9 | **Tasa** | ATÓMICO | Porcentaje de conversión (0-100). |
| 10 | **Registros** | ATÓMICO | Serie temporal: [{ fecha, tasa, volumen_origen, volumen_destino }]. Se ACUMULA. |

**Suelo alcanzado** — piezas atómicas.

---

## Convergencias detectadas

| Patrón | Piezas que convergen | Resolución |
|---|---|---|
| Métrica | Pieza 4 (métrica de etapa) y marketing-analytics | Misma referencia al catálogo de KPIs. |
| Acumulación | Pieza 10 (registros de flujo) | Mismo patrón append-only que en analytics y budget. |

## Resumen de la pasada

| Métrica | Valor |
|---|---|
| Piezas atómicas nuevas | 10 |
| SPAWN residual | 0 |
| Convergencias | 2 |
