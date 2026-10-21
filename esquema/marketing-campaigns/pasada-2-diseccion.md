# Disección — Módulo "marketing-campaigns"

Formas conceptuales asignadas a cada pieza atómica del esquema.
Método: las 6 preguntas del diseccionador sobre cada pieza.

---

## Piezas del Briefing

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 1 | Nombre | **reflejo** | Texto identificador. CRUD puro. |
| 2 | Objetivo | **reflejo** | Texto + métrica objetivo. CRUD. |
| 3 | Audiencia | **reflejo** | ID de referencia a marketing-audience. CRUD. |
| 4 | Canales | **reflejo** | IDs de referencia a marketing-channels. CRUD. |
| 5 | Presupuesto | **reflejo** | Importe asignado. CRUD. |
| 6 | Periodo | **reflejo** | Fechas inicio/fin. Un test afirma inicio <= fin. |
| 7 | KPIs | **reflejo** | Lista tipada de métricas objetivo. CRUD. |
| 8 | Estado | **reflejo** | Máquina de estados determinista (borrador → aprobado → activa → cerrada → cancelada). |

## Piezas del nivel raíz

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 9 | Assets | **reflejo** | Lista de IDs de piezas de contenido. CRUD. |
| 10 | Lanzamiento | **reflejo** | Acto de transicionar la campaña a activa. Determinista: cambia estado. |
| 11 | Cierre | **micro-agente** | Evaluar resultados vs objetivos requiere juicio: ¿funcionó? ¿qué se repite? ¿qué se cambia? El LLM interpreta datos y emite veredicto con aprendizajes. |
| 12 | Briefing completo | **custodio** | Vigila que toda campaña tiene objetivo, audiencia, canales y fechas. No permite campañas incompletas. |
| 13 | Ciclo cerrado | **reflejo** | Invariante: toda campaña cerrada tiene un cierre. Un test afirma. |
| 14 | Assets trazables | **reflejo** | Invariante: toda pieza de la campaña existe en marketing-content. Un test afirma. |

---

## Resumen de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 12 | Nombre, Objetivo, Audiencia, Canales, Presupuesto, Periodo, KPIs, Estado, Assets, Lanzamiento, Ciclo cerrado, Assets trazables |
| **custodio** | 1 | Briefing completo |
| **micro-agente** | 1 | Cierre (veredicto + aprendizajes) |
| **conversor** | 0 | — |
| **puente** | 0 | — |
| **TOTAL** | **14** | |

## Lectura del reparto

- **Reflejo dominante (12/14 = 86%)** — el briefing y la gestión de campaña son declarativos.
- **Custodio (1/14 = 7%)** — una sola guarda: la completitud del briefing.
- **Micro-agente (1/14 = 7%)** — el cierre de campaña requiere juicio del LLM (evaluar resultados vs objetivos).

**El módulo es híbrido: reflejo dominante con un toque de micro-agente.** El reflejo gestiona el briefing y la máquina de estados. El micro-agente evalúa al cerrar.
