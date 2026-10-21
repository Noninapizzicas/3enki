# Pasada 2 — Expansión de los SPAWN de "marketing-budget"

Método: prisma sobre cada sub-producto SPAWN de la pasada 1.

---

## SPAWN 1 — Asignación por partida

El reparto del presupuesto total entre partidas (canales, campañas, categorías).
Cada partida tiene un techo asignado y un tipo.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 1 | **Nombre de partida** | ATÓMICO | Identificador legible ("Google Ads", "Contenido blog", "Diseño gráfico"). |
| 2 | **Tipo de partida** | ATÓMICO | Enum: canal / campaña / categoria / otro. Clasifica a qué se destina. |
| 3 | **Referencia** | ATÓMICO | ID del canal o campaña vinculada (si aplica). Permite cruzar con marketing-channels. |
| 4 | **Importe asignado** | ATÓMICO | Cuánto se destina: { cantidad, moneda }. |
| 5 | **Periodo** | ATÓMICO | A qué periodo aplica la asignación: { inicio, fin }. |
| 6 | **Estado** | ATÓMICO | Máquina de estados: planificado → aprobado → activo → cerrado. |

**Suelo alcanzado** — piezas atómicas.

---

## SPAWN 2 — Registro de gastos

El libro de gastos reales. Cada entrada es un gasto fechado contra una partida.
Se acumula — no se reemplaza.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 7 | **Gasto** | ATÓMICO | Un registro: { partida_id, fecha, importe, moneda, concepto }. Inmutable una vez registrado. |
| 8 | **Concepto** | ATÓMICO | Descripción breve de qué se pagó. |
| 9 | **Fuente** | ATÓMICO | Quién registró el gasto: manual / importado / automatizado. |

**Suelo alcanzado** — piezas atómicas.

---

## Convergencias detectadas

| Patrón | Piezas que convergen | Resolución |
|---|---|---|
| Importe | Piezas 4 (asignado) y 7 (gastado) | Misma forma { cantidad, moneda } pero rol distinto: techo vs registro. |
| Moneda | En todo el módulo | Una sola moneda por presupuesto total — las partidas y gastos la heredan. |

## Resumen de la pasada

| Métrica | Valor |
|---|---|
| Piezas atómicas nuevas | 9 |
| SPAWN residual | 0 |
| Convergencias | 2 |
