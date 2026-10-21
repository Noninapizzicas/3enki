# Pasada 2 — Expansión de los SPAWN de "marketing-calendar"

Método: prisma sobre cada sub-producto SPAWN de la pasada 1.

---

## SPAWN 1 — Planificación

La agenda de acciones de marketing. Cada entrada es una acción planificada: qué se hace, cuándo, en qué canal, quién lo hace, en qué estado está.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 1 | **Título** | ATÓMICO | Nombre legible de la entrada ("Newsletter febrero", "Post Instagram lanzamiento"). |
| 2 | **Tipo de acción** | ATÓMICO | Enum: publicación / campaña / evento / mantenimiento / otro. Clasifica la naturaleza. |
| 3 | **Canal destino** | ATÓMICO | ID del canal donde se ejecuta (referencia a marketing-channels). |
| 4 | **Fecha programada** | ATÓMICO | Fecha (y opcionalmente hora) de ejecución. |
| 5 | **Responsable** | ATÓMICO | Quién produce o ejecuta la acción (nombre o rol). |
| 6 | **Estado** | ATÓMICO | Máquina de estados: borrador → programado → ejecutado → cancelado. |
| 7 | **Notas** | ATÓMICO | Texto libre de contexto ("incluir promo 2x1", "coordinar con diseño"). |

**Suelo alcanzado** — piezas atómicas.

---

## SPAWN 2 — Estacionalidad

Marcas invariantes en el calendario: eventos recurrentes, temporadas comerciales, fechas señaladas que condicionan el plan de marketing.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 8 | **Nombre del evento** | ATÓMICO | Identificador legible ("Navidad", "Black Friday", "Lanzamiento verano"). |
| 9 | **Tipo de marca** | ATÓMICO | Enum: festividad / temporada / lanzamiento / otro. |
| 10 | **Periodo** | ATÓMICO | Fechas inicio y fin de la marca estacional. |
| 11 | **Recurrencia** | ATÓMICO | Si se repite: anual / mensual / puntual. |
| 12 | **Impacto** | ATÓMICO | Enum: alto / medio / bajo. Peso en la planificación. |

**Suelo alcanzado** — piezas atómicas.

---

## SPAWN 3 — Cadencia

Frecuencia de publicación comprometida por canal. Regla determinista que establece el ritmo del marketing.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 13 | **Canal** | ATÓMICO | ID del canal al que aplica la regla (referencia a marketing-channels). |
| 14 | **Frecuencia** | ATÓMICO | Número de publicaciones por unidad de tiempo: { cantidad, unidad }. |
| 15 | **Unidad temporal** | ATÓMICO | Enum: diario / semanal / quincenal / mensual. |
| 16 | **Activa** | ATÓMICO | Boolean: si la cadencia está vigente o suspendida. |

**Suelo alcanzado** — piezas atómicas.

---

## Convergencias detectadas

| Patrón | Piezas que convergen | Resolución |
|---|---|---|
| Canal | Piezas 3 (destino en planificación) y 13 (canal en cadencia) | Misma referencia a marketing-channels pero rol distinto: destino de acción vs regla de frecuencia. |
| Periodo/Fecha | Piezas 4 (fecha programada) y 10 (periodo estacional) | Misma forma temporal pero rol distinto: instante vs rango. |

## Resumen de la pasada

| Métrica | Valor |
|---|---|
| Piezas atómicas nuevas | 16 |
| SPAWN residual | 0 |
| Convergencias | 2 |
