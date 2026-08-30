# Disección — Módulo "marketing-strategy"

Formas conceptuales asignadas a cada pieza atómica del esquema.
Método: las 6 preguntas del diseccionador sobre cada pieza.

---

## Piezas del Posicionamiento

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 1 | Declaración | **reflejo** | Una frase que un test afirma: "¿puedo decirla sin dudar?" Invariante fundacional, cero juicio para validarla. |
| 2 | Propuesta de valor | **reflejo** | La intersección capacidad ∩ necesidad. Determinista: dados mis atributos y la necesidad del segmento, la propuesta se deriva. |
| 3 | Atributos deseados | **reflejo** | Lista finita de adjetivos priorizados. CRUD puro — el dueño los declara, un test afirma que existen y tienen orden. |
| 4 | Territorio | **reflejo** | Posición en el mapa competitivo: categoría + vecinos. Determinista una vez declarado; cambia por decisión, no por juicio. |
| 5 | Credibilidad | **custodio** | Las evidencias que soportan el posicionamiento (datos, casos, testimonios). Se acumulan, se vigilan, se protegen. Único dueño de su registro. |
| 6 | Consistencia | **custodio** | El registro de estabilidad: cuánto lleva el posicionamiento vigente, historial de giros. Vigila que no se cambie sin documentar. |

## Piezas de los Objetivos

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 7 | Meta | **reflejo** | Enunciado imperativo (verbo + resultado). Un test afirma que tiene verbo y resultado nombrado. |
| 8 | Target | **reflejo** | Número + unidad + dirección. Determinista: un test afirma que es cuantificable. |
| 9 | Horizonte | **reflejo** | Timestamp + tipo (fijo/rolling). Un test afirma la fecha y el tipo. |
| 10 | Prioridad | **reflejo** | Ordinal o peso. Se deriva de la alineación; un test afirma el orden. |
| 11 | Alineación | **reflejo** | El vínculo objetivo→propósito de negocio. Un test afirma que cada objetivo tiene su ancla en el negocio. |
| 12 | Estado | **reflejo** | Máquina de estados: definido → activo → en_revisión → alcanzado|fallido|retirado. Transiciones deterministas. |
| 13 | Criterio de revisión | **reflejo** | Regla: si métrica < umbral en fecha → acción. Determinista, un test afirma la regla. |

## Piezas de la Estrategia (nivel raíz)

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 14 | Alineación negocio↔marketing | **reflejo** | Mapeo trazable: cada acción → objetivo → negocio. Un test afirma la cadena completa. |
| 15 | Conocimiento disponible | **reflejo** | Hueco nombrado. Lo que no se sabe se declara como pregunta abierta, no se inventa. Determinista: existe o no. |
| 16 | Dirección clara | **reflejo** | Invariante: toda acción tiene un porqué trazable. Un test afirma el vínculo acción→objetivo. |
| 17 | Priorización | **reflejo** | Orden entre objetivos. Se computa del peso; un test afirma que hay orden sin empates silenciosos. |
| 18 | Revisabilidad | **custodio** | Vigila que cada objetivo tenga su fecha de revisión y la cumpla. Dueño del calendario de revisiones. |
| 19 | No es ejecución | **reflejo** | Frontera: la estrategia no produce piezas. Un test afirma la separación. |
| 20 | No es medición | **reflejo** | Frontera: la estrategia define qué medir, no mide. Un test afirma la separación. |
| 21 | No es la marca | **reflejo** | Frontera: la marca ya existe; la estrategia la consume. Un test afirma la separación. |

---

## Resumen de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 18 | Declaración, Propuesta de valor, Atributos deseados, Territorio, Meta, Target, Horizonte, Prioridad, Alineación, Estado, Criterio de revisión, Alineación negocio↔marketing, Conocimiento disponible, Dirección clara, Priorización, No es ejecución, No es medición, No es la marca |
| **custodio** | 3 | Credibilidad, Consistencia, Revisabilidad |
| **micro-agente** | 0 | — |
| **conversor** | 0 | — |
| **puente** | 0 | — |
| **TOTAL** | **21** | |

## Lectura del reparto

- **Reflejo absoluto (18/21 = 86%)** — la estrategia es casi enteramente declarativa y determinista. El dueño declara, el módulo almacena y valida. No hay juicio fuzzy ni transformación de formato.
- **Custodio mínimo (3/21 = 14%)** — solo tres piezas vigilan estado a lo largo del tiempo: las evidencias de credibilidad, el historial de consistencia y el calendario de revisiones.
- **Cero micro-agente** — coherente: la estrategia es decisión del DUEÑO, no del sistema. El módulo no interpreta ni sugiere — registra y valida lo que el dueño decide.
- **Cero conversor / cero puente** — la estrategia no transforma formatos ni conecta fronteras; es puro dato declarativo.

El módulo marketing-strategy es el más **determinista** de los 12 módulos de marketing. Su complejidad no está en la lógica sino en la disciplina: asegurar que cada pieza declarada esté completa, alineada y revisable.
