# Disección — Módulo "marketing-channels"

Formas conceptuales asignadas a cada pieza atómica del esquema.
Método: las 6 preguntas del diseccionador sobre cada pieza.

---

## Piezas de Canales Propios

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 1 | Registro | **reflejo** | CRUD puro: el dueño declara nombre, tipo, URL, fecha. Un test afirma que existen. |
| 2 | Estado operativo | **reflejo** | Máquina de estados determinista (en_setup → activo → pausado → retirado). Un test afirma transiciones. |
| 3 | Activos vinculados | **reflejo** | Lista de referencias (IDs de landing pages, formularios). CRUD puro. |
| 4 | Frecuencia esperada | **reflejo** | Valor declarado por el dueño (enum: diaria/semanal/mensual/irregular). Un test afirma que pertenece al enum. |
| 5 | Responsable | **reflejo** | Nombre o rol asignado. Un test afirma que no es vacío si el canal está activo. |

## Piezas de Canales Ganados

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 6 | Registro | **reflejo** | CRUD: nombre, tipo, fuente. Declarativo. |
| 7 | Estado de salud | **custodio** | Vigila la evolución en el tiempo: creciendo/estable/decayendo/desconocido. El custodio observa y actualiza; no se limita a almacenar el último valor, sino que mantiene historial y alerta cuando cambia. |
| 8 | Fuentes observadas | **custodio** | Acumula fuentes donde se detecta presencia ganada. Se vigilan, se protegen, se añaden. Único dueño de este registro. |
| 9 | Frecuencia observada | **reflejo** | Valor declarado o derivado (enum: alta/media/baja/esporádica). Un test afirma pertenencia al enum. |

## Piezas de Canales Pagados

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 10 | Registro | **reflejo** | CRUD: nombre, tipo, plataforma. Declarativo. |
| 11 | Estado operativo | **reflejo** | Misma state machine que propios: determinista, transiciones validadas. |
| 12 | Presupuesto asignado | **reflejo** | Número + moneda + periodo. Declarado por el dueño. Un test afirma que es positivo. |
| 13 | ROI esperado | **reflejo** | Target declarado: valor + unidad + umbral. Un test afirma que tiene las tres partes. |
| 14 | Plataforma/Cuenta | **reflejo** | Identificador de cuenta. CRUD puro. Las credenciales reales → credential-manager (REF). |

## Piezas de Canales Compartidos

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 15 | Registro | **reflejo** | CRUD: nombre, tipo, plataforma, handle. Declarativo. |
| 16 | Estado de presencia | **reflejo** | State machine: determinista, mismas transiciones. |
| 17 | Audiencia en el canal | **custodio** | Vigila el tamaño de audiencia a lo largo del tiempo. No es un dato estático — se actualiza y el historial importa. |
| 18 | Engagement declarado | **custodio** | Vigila el nivel de interacción percibido. Cambia con el tiempo, el custodio mantiene el registro y alerta tendencia. |

## Piezas del nivel raíz (pasada 1)

| # | Pieza | Forma | Razón |
|---|---|---|---|
| 19 | Mapa de Canales | **reflejo** | Vista consolidada computada: todos los canales con clasificación, estado, prioridad. Un test afirma completitud. |
| 20 | Capacidad operativa | **reflejo** | Declaración del ancho de banda del equipo: un número o enum. El dueño lo dice, un test lo afirma. |
| 21 | Inventario completo | **reflejo** | Invariante: en todo momento el mapa responde. Un test afirma que la consulta devuelve datos. |
| 22 | Estado vivo | **reflejo** | Invariante: cada canal tiene estado. Un test afirma que no hay canal sin estado. |
| 23 | Priorización | **reflejo** | Orden entre canales. Ordinal declarado. Un test afirma que hay orden sin empates silenciosos. |

---

## Resumen de formas

| Forma | Cantidad | Piezas |
|---|---|---|
| **reflejo** | 19 | Registro (×4), Estado operativo (×3), Activos vinculados, Frecuencia esperada, Responsable, Frecuencia observada, Presupuesto asignado, ROI esperado, Plataforma/Cuenta, Mapa de Canales, Capacidad operativa, Inventario completo, Estado vivo, Priorización |
| **custodio** | 4 | Estado de salud, Fuentes observadas, Audiencia en el canal, Engagement declarado |
| **micro-agente** | 0 | — |
| **conversor** | 0 | — |
| **puente** | 0 | — |
| **TOTAL** | **23** | |

## Lectura del reparto

- **Reflejo dominante (19/23 = 83%)** — el módulo es esencialmente un catálogo declarativo. El dueño registra canales, les pone estado, frecuencia y prioridad; el módulo almacena y valida.
- **Custodio mínimo (4/23 = 17%)** — cuatro piezas vigilan datos que cambian con el tiempo y cuyo historial importa: salud de canales ganados, fuentes observadas, audiencia y engagement de compartidos.
- **Cero fuzzy** — coherente: los canales son infraestructura declarada, no requieren interpretación ni transformación.

El módulo marketing-channels es **reflejo puro con vigilancia selectiva** — un catálogo que almacena, valida estado y vigila las 4 métricas que cambian con el tiempo. Su forma es casi idéntica a marketing-strategy: determinista, sin fuzzy, sin puentes.
