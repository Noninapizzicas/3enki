# Disección — Módulo "marketing-audience"

Formas conceptuales asignadas a cada pieza atómica del esquema.
Método: las 6 preguntas del diseccionador sobre cada pieza.

---

## Piezas de Segmentos

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 1 | Nombre | **reflejo** | Texto identificador. CRUD puro, un test afirma que no es vacío. |
| 2 | Criterios demográficos | **reflejo** | Objeto tipado (edad, género, ubicación, NSE). Declarativo, un test afirma completitud. |
| 3 | Necesidad principal | **reflejo** | Frase imperativa declarada por el dueño. Un test afirma que tiene verbo y resultado. |
| 4 | Comportamiento | **reflejo** | Objeto tipado (frecuencia, canales, sensibilidad). Declarativo, un test afirma campos. |
| 5 | Tamaño estimado | **reflejo** | Número o rango. Declarado, un test afirma que es positivo. |
| 6 | Prioridad | **reflejo** | Ordinal. Se declara, un test afirma el orden sin empates. |
| 7 | Estado | **reflejo** | Máquina de estados determinista (hipotesis → validado → activo → descartado). Un test afirma transiciones. |

## Piezas de Personas

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 8 | Nombre y perfil | **micro-agente** | Crear un nombre ficticio y un perfil narrativo creíble requiere síntesis: interpretar datos y condensarlos en un arquetipo humano. Cuando se escribe manual, es reflejo; cuando se genera, el LLM sintetiza. La pieza puede nacer de ambas vías. |
| 9 | Segmento vinculado | **reflejo** | REF pura: un ID que apunta al segmento. Un test afirma que el segmento existe. |
| 10 | Necesidad | **micro-agente** | La necesidad de la persona es más específica que la del segmento. Requiere interpretación para concretar "familias buscan comida sana" → "María busca menú escolar sin gluten". |
| 11 | Barrera | **micro-agente** | Identificar el obstáculo principal requiere juicio: no se calcula, se interpreta desde el contexto del segmento y el negocio. |
| 12 | Motivación | **micro-agente** | Identificar el motor que impulsa a actuar requiere el mismo juicio que la barrera — síntesis, no cálculo. |
| 13 | Canal preferido | **reflejo** | Elegido de la lista de canales del proyecto. Un test afirma que es un canal válido (REF → marketing-channels). |
| 14 | Mensaje clave | **micro-agente** | La frase que conecta requiere copywriting — juicio para condensar necesidad + motivación + tono en una línea. |
| 15 | Origen | **reflejo** | Enum: manual / generada. Un test afirma pertenencia. |

## Piezas del nivel raíz (pasada 1)

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 16 | Mapa de audiencia | **reflejo** | Vista consolidada computada. Un test afirma que todos los segmentos con sus personas están presentes. |
| 17 | Datos disponibles | **reflejo** | Declaración de calidad de datos: qué se sabe, qué falta. CRUD puro. |
| 18 | Segmentos completos | **reflejo** | Invariante: cada segmento tiene campos obligatorios. Un test afirma completitud. |
| 19 | Personas accionables | **reflejo** | Invariante: cada persona tiene nombre, necesidad, barrera, canal. Un test afirma las 4 partes. |
| 20 | Trazabilidad | **reflejo** | Invariante: cada persona tiene segmento_id. Un test afirma el vínculo. |

---

## Resumen de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 15 | Nombre, Criterios demográficos, Necesidad principal (segmento), Comportamiento, Tamaño estimado, Prioridad, Estado, Segmento vinculado, Canal preferido, Origen, Mapa de audiencia, Datos disponibles, Segmentos completos, Personas accionables, Trazabilidad |
| **micro-agente** | 5 | Nombre y perfil, Necesidad (persona), Barrera, Motivación, Mensaje clave |
| **custodio** | 0 | — |
| **conversor** | 0 | — |
| **puente** | 0 | — |
| **TOTAL** | **20** | |

## Lectura del reparto

- **Reflejo dominante (15/20 = 75%)** — los segmentos son enteramente declarativos (7/7 reflejo). El módulo registra y valida.
- **Micro-agente concentrado (5/20 = 25%)** — las personas son el punto de juicio: sintetizar datos en narrativa humana (nombre, necesidad, barrera, motivación, mensaje). Concentrado en UN sub-dominio.
- **Cero custodio** — las personas y segmentos no se vigilan; se declaran y se revisan por decisión del dueño, no por vigilancia automática.

**El módulo es híbrido**: la mitad de segmentos es reflejo puro (JS determinista), la mitad de personas es micro-agente (LLM). Esto es el primer módulo del ecosistema marketing que necesita **blueprint** además de reflejo.

Partición limpia:
- **Reflejo** (index.js): CRUD de segmentos, CRUD manual de personas, mapa, validaciones, state machine
- **Blueprint** (marketing-audience.blueprint.json): generación de personas desde datos de segmento
