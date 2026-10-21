# Disección — Módulo "marketing-analytics"

Formas conceptuales asignadas a cada pieza atómica del esquema.
Método: las 6 preguntas del diseccionador sobre cada pieza.

---

## Piezas de Métricas

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 1 | Nombre | **reflejo** | Texto identificador del KPI. CRUD puro. |
| 2 | Tipo | **reflejo** | Enum cerrado de tipos de KPI. Un test afirma pertenencia. |
| 3 | Fuente | **reflejo** | Enum: manual / importado / calculado. Un test afirma pertenencia. |
| 4 | Canal asociado | **reflejo** | ID de referencia a marketing-channels. CRUD. |
| 5 | Registros | **custodio** | Serie temporal que se ACUMULA. El custodio vigila: no se borra, solo se añade. Inmutable una vez registrado. |

## Piezas de Atribución

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 6 | Modelo | **reflejo** | Enum cerrado de modelos. Un test afirma pertenencia. |
| 7 | Resultado | **reflejo** | Referencia al evento de resultado. CRUD. |
| 8 | Acciones candidatas | **reflejo** | Lista de touchpoints. CRUD. |
| 9 | Distribución | **micro-agente** | Repartir el crédito entre acciones requiere JUICIO. El modelo (last-touch, multi-touch, decay) interpreta los datos, no los calcula mecánicamente. El LLM aplica el modelo elegido al contexto concreto. |

## Piezas de Experimentación

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 10 | Hipótesis | **reflejo** | Texto declarativo. CRUD. |
| 11 | Variantes | **reflejo** | Lista tipada de versiones. CRUD. |
| 12 | Métrica objetivo | **reflejo** | ID de referencia a una métrica. CRUD. |
| 13 | Datos | **custodio** | Resultados por variante que se ACUMULAN. Inmutable. |
| 14 | Veredicto | **micro-agente** | Interpretar si los datos son significativos y cuál variante gana requiere juicio. El LLM evalúa la evidencia y emite veredicto. |
| 15 | Estado | **reflejo** | Máquina de estados determinista (diseño → activo → cerrado). |

## Piezas del nivel raíz (contrato + reporting)

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 16 | Reporting | **conversor** | Transforma datos crudos en formato legible. Sin estado, sin juicio — pura transformación `visualizar(datos, formato)`. |
| 17 | Métrica trazable | **custodio** | Vigila que toda métrica tiene tipo, fuente y al menos un registro. No permite métricas vacías. |
| 18 | Dato inmutable | **reflejo** | Invariante: los registros no se borran. Un test afirma. |
| 19 | Experimento cerrado | **reflejo** | Invariante: todo experimento cerrado tiene veredicto. Un test afirma. |

---

## Resumen de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 12 | Nombre, Tipo, Fuente, Canal asociado, Modelo, Resultado, Acciones candidatas, Hipótesis, Variantes, Métrica objetivo, Estado, Dato inmutable, Experimento cerrado |
| **custodio** | 3 | Registros (serie temporal), Datos (serie temporal), Métrica trazable |
| **micro-agente** | 2 | Distribución (atribución), Veredicto (experimentación) |
| **conversor** | 1 | Reporting |
| **puente** | 0 | — |
| **TOTAL** | **18** | |

## Lectura del reparto

- **Reflejo (12/18 = 67%)** — el catálogo de métricas, las definiciones de experimentos y los modelos de atribución son declarativos.
- **Custodio (3/18 = 17%)** — tres guardas: los registros de métricas (inmutables), los datos de experimentos (inmutables) y la completitud.
- **Micro-agente (2/18 = 11%)** — la distribución de atribución y el veredicto de experimentación requieren juicio del LLM.
- **Conversor (1/18 = 6%)** — el reporting transforma datos en formato legible. Puro, sin estado.

**El módulo es el más híbrido del ecosistema.** Reflejo gestiona catálogo y definiciones, custodio vigila la inmutabilidad de los datos, micro-agente interpreta (atribución y veredictos) y conversor transforma (reporting). Cuatro formas vivas.
