# Pasada 2 — Expansión de los SPAWN de "marketing-analytics"

Método: prisma sobre cada sub-producto SPAWN de la pasada 1.

---

## SPAWN 1 — Métricas

El catálogo de KPIs del proyecto. Cada métrica tiene un tipo, una fuente de datos y una fórmula de cálculo. Los valores se registran con fecha (serie temporal).

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 1 | **Nombre** | ATÓMICO | Identificador legible del KPI ("Tasa de conversión", "CTR email", "Coste por lead"). |
| 2 | **Tipo** | ATÓMICO | Enum: impresiones / clicks / conversiones / coste / roi / engagement / alcance / otro. |
| 3 | **Fuente** | ATÓMICO | De dónde viene el dato: manual / importado / calculado. |
| 4 | **Canal asociado** | ATÓMICO | ID del canal al que aplica la métrica (referencia a marketing-channels). Null si es global. |
| 5 | **Registros** | ATÓMICO | Serie temporal: [{ fecha, valor }]. Se ACUMULA — nunca se reemplaza. |

**Suelo alcanzado** — piezas atómicas.

---

## SPAWN 2 — Atribución

Asignar qué acción de marketing causó qué resultado. Requiere juicio: el modelo de atribución (last-touch, multi-touch, decay) interpreta, no calcula.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 6 | **Modelo** | ATÓMICO | Enum de modelos disponibles: last_touch / first_touch / lineal / decay / personalizado. |
| 7 | **Resultado** | ATÓMICO | Lo que se atribuye: una conversión, un lead, una venta. Referencia al evento de resultado. |
| 8 | **Acciones candidatas** | ATÓMICO | Las acciones de marketing que podrían haber causado el resultado (touchpoints). |
| 9 | **Distribución** | ATÓMICO | Cómo se reparte el crédito entre las acciones candidatas (peso por acción). |

**Suelo alcanzado** — piezas atómicas.

---

## SPAWN 3 — Experimentación

El ciclo de hipótesis → variante → dato → veredicto. A/B testing y variantes de marketing.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 10 | **Hipótesis** | ATÓMICO | Texto: qué se espera ("cambiar el CTA a rojo aumentará clicks un 15%"). |
| 11 | **Variantes** | ATÓMICO | Las versiones que se prueban: [{ nombre, descripcion }]. Mínimo 2. |
| 12 | **Métrica objetivo** | ATÓMICO | ID de la métrica que mide el éxito del experimento. |
| 13 | **Datos** | ATÓMICO | Resultados por variante: [{ variante, valor_metrica }]. Se ACUMULA. |
| 14 | **Veredicto** | ATÓMICO | Resultado: ganadora / inconcluso / negativo. Con variante ganadora si aplica. |
| 15 | **Estado** | ATÓMICO | Máquina de estados: diseño → activo → cerrado. |

**Suelo alcanzado** — piezas atómicas.

---

## Convergencias detectadas

| Patrón | Piezas que convergen | Resolución |
|---|---|---|
| Canal | Pieza 4 (canal de métrica) y canales de atribución/experimentación | Misma referencia a marketing-channels. |
| Acumulación | Piezas 5 (registros de métrica) y 13 (datos de experimento) | Ambos son series temporales inmutables. Mismo patrón append-only. |

## Resumen de la pasada

| Métrica | Valor |
|---|---|
| Piezas atómicas nuevas | 15 |
| SPAWN residual | 0 |
| Convergencias | 2 |
