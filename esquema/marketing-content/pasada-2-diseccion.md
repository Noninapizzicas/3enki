# Disección — Módulo "marketing-content"

Formas conceptuales asignadas a cada pieza atómica del esquema.
Método: las 6 preguntas del diseccionador sobre cada pieza.

---

## Piezas del Catálogo de piezas

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 1 | Título | **reflejo** | Texto identificador. CRUD puro. |
| 2 | Formato | **reflejo** | Enum cerrado de formatos. Un test afirma pertenencia. |
| 3 | Canal destino | **reflejo** | ID de referencia a marketing-channels. CRUD. |
| 4 | Etapa funnel | **reflejo** | Enum cerrado de etapas. Un test afirma pertenencia. |
| 5 | Estado | **reflejo** | Máquina de estados determinista (idea → borrador → revision → publicado → retirado). |
| 6 | Madre ID | **reflejo** | ID de la pieza madre o null. CRUD. Vincula hijas. |
| 7 | Descripción | **reflejo** | Texto libre descriptivo. CRUD. |
| 8 | Fecha creación | **reflejo** | Timestamp automático. Un test afirma que existe y es válido. |

## Piezas de Reutilización

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 9 | Pieza madre (referencia) | **reflejo** | ID de la pieza original. CRUD. |
| 10 | Plan de fragmentación | **micro-agente** | Requiere juicio: decidir en qué formatos × canales fragmentar una pieza madre. Depende del contenido de la madre, los canales disponibles y la audiencia. El LLM sintetiza el plan. |
| 11 | Piezas generadas | **reflejo** | Las piezas hijas se crean como entradas normales con madre_id. CRUD. |

## Piezas del nivel raíz (contrato)

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 12 | Pieza trazable | **custodio** | Vigila que toda pieza tiene formato, canal y estado. No permite entradas incompletas. |
| 13 | Hijas vinculadas | **reflejo** | Invariante: toda pieza hija tiene madre_id apuntando a una pieza existente. Un test afirma. |
| 14 | Ciclo respetado | **reflejo** | Invariante: las transiciones de estado siguen la máquina. Un test afirma. |

---

## Resumen de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 12 | Título, Formato, Canal destino, Etapa funnel, Estado, Madre ID, Descripción, Fecha creación, Pieza madre (ref), Piezas generadas, Hijas vinculadas, Ciclo respetado |
| **custodio** | 1 | Pieza trazable |
| **micro-agente** | 1 | Plan de fragmentación |
| **conversor** | 0 | — |
| **puente** | 0 | — |
| **TOTAL** | **14** | |

## Lectura del reparto

- **Reflejo dominante (12/14 = 86%)** — el catálogo de piezas es declarativo. El dueño dice qué pieza, en qué formato, para qué canal.
- **Custodio (1/14 = 7%)** — una sola guarda: la completitud de cada pieza.
- **Micro-agente (1/14 = 7%)** — el plan de fragmentación requiere juicio (decidir qué formatos × canales para cada pieza madre). El LLM lo sintetiza.

**El módulo es híbrido: reflejo dominante con un toque de micro-agente.** El reflejo gestiona el catálogo y el ciclo de vida. El micro-agente genera el plan de fragmentación cuando se pide reutilizar una pieza. El custodio vigila la completitud.
