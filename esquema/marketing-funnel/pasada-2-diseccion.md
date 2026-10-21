# Disección — Módulo "marketing-funnel"

Formas conceptuales asignadas a cada pieza atómica del esquema.
Método: las 6 preguntas del diseccionador sobre cada pieza.

---

## Piezas de Etapas

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 1 | Nombre | **reflejo** | Texto identificador. CRUD puro. |
| 2 | Orden | **reflejo** | Número de posición. Un test afirma que es positivo y único. |
| 3 | Descripción | **reflejo** | Texto descriptivo. CRUD. |
| 4 | Métrica principal | **reflejo** | Referencia al KPI o texto libre. CRUD. |
| 5 | Acciones | **reflejo** | Lista de textos descriptivos. CRUD. |
| 6 | Volumen actual | **reflejo** | Último dato registrado. CRUD. |

## Piezas de Flujo

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 7 | Etapa origen | **reflejo** | ID de referencia a etapa. CRUD. |
| 8 | Etapa destino | **reflejo** | ID de referencia a etapa. CRUD. |
| 9 | Tasa | **reflejo** | Porcentaje calculable. Un test afirma 0-100. |
| 10 | Registros | **custodio** | Serie temporal que se ACUMULA. El custodio vigila: no se borra, solo se añade. |

## Piezas del nivel raíz (contrato)

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 11 | Etapa definida | **custodio** | Vigila que toda etapa tiene nombre, métrica y al menos una acción. No permite etapas vacías. |
| 12 | Flujo medido | **reflejo** | Invariante: toda transición tiene al menos un registro. Un test afirma. |
| 13 | Cuello de botella visible | **conversor** | Transforma los datos de flujo en señal: identifica la etapa con peor tasa de conversión. Sin estado, pura transformación. |

---

## Resumen de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 10 | Nombre, Orden, Descripción, Métrica principal, Acciones, Volumen actual, Etapa origen, Etapa destino, Tasa, Flujo medido |
| **custodio** | 2 | Registros, Etapa definida |
| **conversor** | 1 | Cuello de botella visible |
| **micro-agente** | 0 | — |
| **puente** | 0 | — |
| **TOTAL** | **13** | |

## Lectura del reparto

- **Reflejo dominante (10/13 = 77%)** — las etapas y sus atributos son declarativos. El dueño define su embudo.
- **Custodio (2/13 = 15%)** — vigila la inmutabilidad de los registros de flujo y la completitud de las etapas.
- **Conversor (1/13 = 8%)** — el análisis de cuello de botella es transformación pura de datos.

**El módulo es reflejo puro con custodia y un conversor.** El conversor de cuello de botella se implementa como función JS pura (sin LLM). Sin micro-agente. Sin blueprint necesario.
