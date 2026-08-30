# Disección — Módulo "marketing-automation"

Formas conceptuales asignadas a cada pieza atómica del esquema.
Método: las 6 preguntas del diseccionador sobre cada pieza.

---

## Piezas de Flujos

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 1 | Nombre | **reflejo** | Texto identificador. CRUD puro. |
| 2 | Trigger | **reflejo** | Evento + condiciones. Matching determinista — un test afirma que el evento correcto dispara el flujo correcto. |
| 3 | Pasos | **reflejo** | Secuencia ordenada de acciones tipadas. Grafo determinista, testable paso a paso. |
| 4 | Reglas | **reflejo** | Predicados deterministas. Dado un perfil, la regla siempre produce el mismo camino. Un test afirma. |
| 5 | Estado | **reflejo** | Máquina de estados determinista (borrador → activo → pausado → retirado). |
| 6 | Historial | **custodio** | Registro de ejecuciones que se ACUMULA. El custodio vigila: no se borra, solo se añade. Inmutable una vez registrado. |

## Piezas del nivel raíz (contrato)

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 7 | Flujo completo | **custodio** | Vigila que todo flujo tiene trigger y al menos un paso. No permite flujos vacíos. |
| 8 | Trigger definido | **reflejo** | Invariante: todo trigger nombra un evento. Un test afirma. |
| 9 | Ejecución trazable | **reflejo** | Invariante: cada ejecución tiene fecha, trigger_data y resultado. Un test afirma. |

---

## Resumen de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 7 | Nombre, Trigger, Pasos, Reglas, Estado, Trigger definido, Ejecución trazable |
| **custodio** | 2 | Historial, Flujo completo |
| **micro-agente** | 0 | — |
| **conversor** | 0 | — |
| **puente** | 0 | — |
| **TOTAL** | **9** | |

## Lectura del reparto

- **Reflejo dominante (7/9 = 78%)** — los flujos, triggers, pasos y reglas son deterministas.
- **Custodio (2/9 = 22%)** — el historial de ejecuciones es inmutable (custodio puro) y la completitud del flujo se vigila.
- **Cero fuzzy** — la automatización es determinismo puro.

**El módulo es reflejo puro con custodia de historial.** Sin blueprint, sin micro-agente. Todo es matching de eventos + grafos de pasos deterministas.
