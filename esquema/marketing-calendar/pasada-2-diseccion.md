# Disección — Módulo "marketing-calendar"

Formas conceptuales asignadas a cada pieza atómica del esquema.
Método: las 6 preguntas del diseccionador sobre cada pieza.

---

## Piezas de Planificación

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 1 | Título | **reflejo** | Texto identificador. CRUD puro. |
| 2 | Tipo de acción | **reflejo** | Enum: publicación / campaña / evento / mantenimiento / otro. Un test afirma pertenencia. |
| 3 | Canal destino | **reflejo** | ID de referencia a marketing-channels. CRUD. |
| 4 | Fecha programada | **reflejo** | Fecha/hora de ejecución. Un test afirma que es futura al crear. |
| 5 | Responsable | **reflejo** | Texto libre del productor. CRUD. |
| 6 | Estado | **reflejo** | Máquina de estados determinista (borrador → programado → ejecutado → cancelado). |
| 7 | Notas | **reflejo** | Texto libre de contexto. CRUD. |

## Piezas de Estacionalidad

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 8 | Nombre del evento | **reflejo** | Texto identificador de la marca estacional. CRUD. |
| 9 | Tipo de marca | **reflejo** | Enum: festividad / temporada / lanzamiento / otro. Un test afirma pertenencia. |
| 10 | Periodo | **reflejo** | Fechas inicio/fin. Un test afirma que inicio <= fin. |
| 11 | Recurrencia | **reflejo** | Enum: anual / mensual / puntual. Un test afirma pertenencia. |
| 12 | Impacto | **reflejo** | Enum: alto / medio / bajo. Un test afirma pertenencia. |

## Piezas de Cadencia

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 13 | Canal | **reflejo** | ID de referencia a marketing-channels. CRUD. |
| 14 | Frecuencia | **reflejo** | Número de publicaciones. Un test afirma que es positivo. |
| 15 | Unidad temporal | **reflejo** | Enum: diario / semanal / quincenal / mensual. Un test afirma pertenencia. |
| 16 | Activa | **reflejo** | Boolean: vigente o suspendida. CRUD. |

## Piezas del nivel raíz (contrato)

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 17 | Agenda completa | **custodio** | Vigila que toda acción tiene fecha, canal y responsable. El custodio no permite entradas incompletas. |
| 18 | Sin huecos | **custodio** | Vigila que la cadencia comprometida tiene entradas reales que la cubren. Compara cadencia declarada vs entradas planificadas. |
| 19 | Visibilidad temporal | **reflejo** | Consulta pura: filtrar entradas por rango de fechas. Un test afirma que el filtro funciona. |

---

## Resumen de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 17 | Título, Tipo de acción, Canal destino, Fecha programada, Responsable, Estado, Notas, Nombre del evento, Tipo de marca, Periodo, Recurrencia, Impacto, Canal (cadencia), Frecuencia, Unidad temporal, Activa, Visibilidad temporal |
| **custodio** | 2 | Agenda completa, Sin huecos |
| **micro-agente** | 0 | — |
| **conversor** | 0 | — |
| **puente** | 0 | — |
| **TOTAL** | **19** | |

## Lectura del reparto

- **Reflejo dominante (17/19 = 89%)** — el calendario es pura declaración: qué, cuándo, dónde, quién.
- **Custodio concentrado (2/19 = 11%)** — dos guardas: la completitud de cada entrada y la coherencia cadencia vs agenda.
- **Cero fuzzy** — el calendario es determinismo puro. No hay juicio, no hay interpretación.

**El módulo es reflejo puro con custodia de completitud.** La partición es natural: el reflejo declara el plan (entradas + estacionalidad + cadencia), el custodio vigila que el plan esté completo y sea coherente. Sin blueprint.
