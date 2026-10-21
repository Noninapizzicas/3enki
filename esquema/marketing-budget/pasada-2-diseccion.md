# Disección — Módulo "marketing-budget"

Formas conceptuales asignadas a cada pieza atómica del esquema.
Método: las 6 preguntas del diseccionador sobre cada pieza.

---

## Piezas de Asignación por partida

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 1 | Nombre de partida | **reflejo** | Texto identificador. CRUD puro. |
| 2 | Tipo de partida | **reflejo** | Enum: canal / campaña / categoria / otro. Un test afirma pertenencia. |
| 3 | Referencia | **reflejo** | ID de canal o campaña vinculada. CRUD. |
| 4 | Importe asignado | **reflejo** | Número + moneda. Declarado por el dueño. Un test afirma positivo. |
| 5 | Periodo | **reflejo** | Fechas inicio/fin. Un test afirma que inicio < fin. |
| 6 | Estado | **reflejo** | Máquina de estados determinista (planificado → aprobado → activo → cerrado). |

## Piezas de Registro de gastos

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 7 | Gasto | **custodio** | Se ACUMULA con el tiempo. El custodio es único dueño del libro de gastos — vigila, protege, no permite borrar. Inmutable una vez registrado. |
| 8 | Concepto | **reflejo** | Texto descriptivo del gasto. CRUD (parte del registro de gasto). |
| 9 | Fuente | **reflejo** | Enum: manual / importado / automatizado. Un test afirma pertenencia. |

## Piezas del nivel raíz (pasada 1)

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 10 | Presupuesto total | **reflejo** | Número + moneda + periodo. Declarado por el dueño. Un test afirma que es positivo. |
| 11 | Control presupuestario | **custodio** | Vigila la diferencia asignado vs gastado POR PARTIDA a lo largo del tiempo. Alerta cuando se pasa. El custodio mantiene el semáforo vivo. |
| 12 | Techo respetado | **reflejo** | Invariante: sum(asignaciones) <= presupuesto_total. Un test afirma. |
| 13 | Gasto trazable | **reflejo** | Invariante: cada gasto tiene partida_id + fecha + importe. Un test afirma. |
| 14 | Alerta de desvío | **custodio** | Señal que se activa cuando gasto_partida > asignado_partida. El custodio vigila el umbral. |

---

## Resumen de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 11 | Nombre, Tipo, Referencia, Importe asignado, Periodo, Estado, Concepto, Fuente, Presupuesto total, Techo respetado, Gasto trazable |
| **custodio** | 3 | Gasto (acumulado), Control presupuestario, Alerta de desvío |
| **micro-agente** | 0 | — |
| **conversor** | 0 | — |
| **puente** | 0 | — |
| **TOTAL** | **14** | |

## Lectura del reparto

- **Reflejo dominante (11/14 = 79%)** — las asignaciones son declarativas. El dueño dice cuánto y a dónde.
- **Custodio concentrado (3/14 = 21%)** — tres piezas vigilan: el libro de gastos (acumulado e inmutable), el control presupuestario (semáforo asignado vs gastado) y la alerta de desvío.
- **Cero fuzzy** — el presupuesto es pura aritmética. No hay juicio, no hay interpretación.

**El módulo es reflejo puro con custodia contable.** La partición es natural: el reflejo declara el plan (presupuesto + asignaciones), el custodio vigila la ejecución (gastos + control + alertas). Sin blueprint.
