# Disección — Módulo "marketing-competitors"

Formas conceptuales asignadas a cada pieza atómica del esquema.
Método: las 6 preguntas del diseccionador sobre cada pieza.

---

## Piezas del Registro de competidores

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 1 | Nombre | **reflejo** | Texto identificador. CRUD puro. |
| 2 | Tipo | **reflejo** | Enum: directo / indirecto / aspiracional. Un test afirma pertenencia. |
| 3 | Descripción | **reflejo** | Texto declarado por el dueño. CRUD. |
| 4 | Fortalezas | **reflejo** | Lista de strings declarada. CRUD puro. |
| 5 | Debilidades | **reflejo** | Lista de strings declarada. CRUD puro. |
| 6 | Canales activos | **reflejo** | Lista de canales donde opera. CRUD. |
| 7 | URL / Localizador | **reflejo** | Texto. CRUD. |
| 8 | Estado | **reflejo** | Máquina de estados determinista (identificado → vigilado → descartado). Un test afirma transiciones. |

## Piezas de Monitorización

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 9 | Observación | **custodio** | Se ACUMULA con el tiempo, no se reemplaza. El custodio es único dueño del historial de observaciones — vigila y protege el registro. |
| 10 | Tipo de señal | **reflejo** | Enum fijo de categorías (cambio_precio, nuevo_producto, campaña, movimiento_canal, otro). Un test afirma pertenencia. |
| 11 | Frecuencia de revisión | **reflejo** | Enum declarado (semanal/mensual/trimestral/ad-hoc). CRUD puro. |
| 12 | Alerta de cambio | **custodio** | Flag que se activa al detectar cambio relevante y se cierra al revisar. El custodio vigila el ciclo abierta → revisada. |

## Piezas de Benchmarking

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 13 | Dimensión | **reflejo** | Registro tipado de un eje de comparación: nombre + descripción. Declarado por el dueño. |
| 14 | Puntuación propia | **reflejo** | Valor numérico + fecha. Declarado o importado. Un test afirma que tiene valor y fecha. |
| 15 | Puntuación competidor | **reflejo** | Misma forma que la propia. Declarado o importado. |
| 16 | Comparativa | **conversor** | Transforma datos de entrada (mis puntuaciones + las suyas) en salida (posición relativa, diferencia). Función pura sin estado propio — se recalcula con datos frescos. |

## Piezas del nivel raíz (pasada 1)

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 17 | Diferenciación | **reflejo** | Lo que el proyecto hace distinto — se destila del posicionamiento y del mapa. Un test afirma que existe y no es vacío. |
| 18 | Mapa competitivo | **reflejo** | Vista consolidada computada. Un test afirma completitud. |
| 19 | Información accesible | **reflejo** | Declaración de qué datos se tienen del mercado. CRUD. |
| 20 | Registro completo | **reflejo** | Invariante: cada competidor tiene nombre + tipo + fortalezas + debilidades. Un test afirma. |
| 21 | Vigilancia viva | **reflejo** | Invariante: las observaciones tienen fecha. Un test afirma. |
| 22 | Comparativa actualizable | **reflejo** | Invariante: el benchmarking se puede recalcular. Un test afirma. |
| 23 | Diferenciación trazable | **reflejo** | Invariante: la diferenciación tiene vínculo con posicionamiento. Un test afirma. |

---

## Resumen de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 20 | Nombre, Tipo, Descripción, Fortalezas, Debilidades, Canales activos, URL, Estado, Tipo de señal, Frecuencia de revisión, Dimensión, Puntuación propia, Puntuación competidor, Diferenciación, Mapa competitivo, Información accesible, Registro completo, Vigilancia viva, Comparativa actualizable, Diferenciación trazable |
| **custodio** | 2 | Observación, Alerta de cambio |
| **conversor** | 1 | Comparativa |
| **micro-agente** | 0 | — |
| **puente** | 0 | — |
| **TOTAL** | **23** | |

## Lectura del reparto

- **Reflejo absoluto (20/23 = 87%)** — el registro de competidores es enteramente declarativo. El dueño escribe lo que sabe.
- **Custodio mínimo (2/23 = 9%)** — solo dos piezas vigilan estado a lo largo del tiempo: las observaciones que se acumulan y las alertas que se abren/cierran.
- **Conversor puntual (1/23 = 4%)** — la comparativa es función pura: datos de entrada → comparativa de salida. Sin estado, sin juicio.

**El módulo es reflejo puro con conversor integrado.** No necesita blueprint — no hay juicio fuzzy. La comparativa (conversor) se implementa como función determinista dentro del reflejo: dados los inputs (puntuaciones propias + ajenas), la salida es mecánica. El conversor NO necesita LLM; es código JS puro.
