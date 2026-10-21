# Pasada 2 — Expansión de los SPAWN de "marketing-audience"

Método: prisma sobre cada sub-producto SPAWN de la pasada 1.

---

## SPAWN 1 — Segmentos

Grupos de audiencia definidos por criterios objetivos. Cada segmento es un registro
tipado: quién es el grupo, qué necesita, dónde está y cómo decide.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 1 | **Nombre** | ATÓMICO | Identificador legible del segmento ("Familias urbanas", "Hosteleros artesanales"). |
| 2 | **Criterios demográficos** | ATÓMICO | Edad, género, ubicación, nivel socioeconómico — los filtros duros que definen quién pertenece. |
| 3 | **Necesidad principal** | ATÓMICO | Lo que este segmento busca resolver — en una frase imperativa. |
| 4 | **Comportamiento** | ATÓMICO | Cómo actúa este segmento: frecuencia de compra, canales que usa, sensibilidad al precio. |
| 5 | **Tamaño estimado** | ATÓMICO | Orden de magnitud del segmento (número o rango). Declarado por el dueño. |
| 6 | **Prioridad** | ATÓMICO | Ordinal: cuál es el segmento principal, cuál el secundario. |
| 7 | **Estado** | ATÓMICO | Máquina de estados: hipotesis → validado → activo → descartado. |

**Suelo alcanzado** — todas las piezas son atómicas.

---

## SPAWN 2 — Personas

Arquetipos narrativos que dan cara humana a un segmento. A diferencia de los segmentos
(CRUD puro), construir una persona requiere **síntesis**: interpretar datos, detectar
patrones y condensarlos en un perfil accionable.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 8 | **Nombre y perfil** | ATÓMICO | Nombre ficticio + foto mental + datos demográficos del arquetipo. Lo que hace al arquetipo "persona". |
| 9 | **Segmento vinculado** | ATÓMICO | REF al segmento que esta persona representa. El ancla. |
| 10 | **Necesidad** | ATÓMICO | Lo que esta persona concreta quiere (más específico que la necesidad del segmento). |
| 11 | **Barrera** | ATÓMICO | Lo que le impide actuar — el obstáculo principal. |
| 12 | **Motivación** | ATÓMICO | Lo que la impulsa a buscar solución — el motor. |
| 13 | **Canal preferido** | ATÓMICO | Dónde se la encuentra y cómo prefiere que le hablen. |
| 14 | **Mensaje clave** | ATÓMICO | La frase que conecta con esta persona — lo que necesita oír. |
| 15 | **Origen** | ATÓMICO | Cómo se construyó: manual (el dueño la escribió) o generada (LLM sintetizó desde datos). |

**Suelo alcanzado** — todas las piezas son atómicas.

---

## Convergencias detectadas

| Patrón | Piezas que convergen | Resolución |
|---|---|---|
| Necesidad | Pieza 3 (segmento) y 10 (persona) | Niveles distintos: la del segmento es el grupo, la de la persona es la instancia concreta. No se fusionan. |
| Prioridad | Pieza 6 (segmento) y la prioridad de personas dentro de un segmento | Los segmentos se priorizan entre sí; las personas heredan la prioridad de su segmento. |

## Resumen de la pasada

| Métrica | Valor |
|---|---|
| Piezas atómicas nuevas | 15 |
| SPAWN residual | 0 (todos tocaron suelo) |
| REF nuevas | 0 (las REF del módulo ya estaban en pasada 1) |
| Convergencias | 2 (necesidad, prioridad) |
