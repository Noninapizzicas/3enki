# Pasada 2 — Expansión de los SPAWN de "marketing-competitors"

Método: prisma sobre cada sub-producto SPAWN de la pasada 1.

---

## SPAWN 1 — Registro de competidores

El catálogo de quiénes compiten con el proyecto. Cada competidor es un registro
tipado con datos declarados por el dueño.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 1 | **Nombre** | ATÓMICO | Nombre del competidor. |
| 2 | **Tipo** | ATÓMICO | Clasificación: directo / indirecto / aspiracional. |
| 3 | **Descripción** | ATÓMICO | Qué es y qué ofrece — en una o dos frases. |
| 4 | **Fortalezas** | ATÓMICO | Lista de lo que hace bien (desde la perspectiva del proyecto). |
| 5 | **Debilidades** | ATÓMICO | Lista de lo que hace mal o donde falla. |
| 6 | **Canales activos** | ATÓMICO | En qué canales opera (web, redes, tienda física, etc.). |
| 7 | **URL / Localizador** | ATÓMICO | Web u otro punto de referencia para observación. |
| 8 | **Estado** | ATÓMICO | Máquina de estados: identificado → vigilado → descartado. |

**Suelo alcanzado** — piezas atómicas.

---

## SPAWN 2 — Monitorización

La vigilancia de lo que hacen los competidores. Cada observación es un dato
fechado que se acumula. El custodio vigila y mantiene el historial.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 9 | **Observación** | ATÓMICO | Un hecho observado: { competidor_id, fecha, tipo, contenido }. Se acumula, no se reemplaza. |
| 10 | **Tipo de señal** | ATÓMICO | Enum de lo que se observa: cambio_precio / nuevo_producto / campaña / movimiento_canal / otro. |
| 11 | **Frecuencia de revisión** | ATÓMICO | Cada cuánto se revisa a este competidor: semanal / mensual / trimestral / ad-hoc. |
| 12 | **Alerta de cambio** | ATÓMICO | Marca cuando se detecta algo relevante — un flag que el dueño revisa y cierra. |

**Suelo alcanzado** — piezas atómicas.

---

## SPAWN 3 — Benchmarking

Comparación del proyecto contra competidores en dimensiones definidas.
Transformación pura: datos propios + datos de referencia → comparativa.

| # | Pieza | Tipo | Descripción |
|---|---|---|---|
| 13 | **Dimensión** | ATÓMICO | Un eje de comparación: { nombre, descripcion }. El dueño las define (precio, calidad, presencia digital, velocidad...). |
| 14 | **Puntuación propia** | ATÓMICO | Valor del proyecto en esa dimensión: { dimension_id, valor, fecha }. |
| 15 | **Puntuación competidor** | ATÓMICO | Valor del competidor en esa dimensión: { competidor_id, dimension_id, valor, fecha }. |
| 16 | **Comparativa** | ATÓMICO | Resultado transformado: { dimension, yo, competidores[], diferencia, posicion }. Función pura, se recalcula con datos frescos. |

**Suelo alcanzado** — piezas atómicas.

---

## Convergencias detectadas

| Patrón | Piezas que convergen | Resolución |
|---|---|---|
| Puntuación | Piezas 14 y 15 | Misma forma { sujeto_id, dimension_id, valor, fecha } — el sujeto es el proyecto o un competidor. Se guardan en la misma estructura. |
| Estado + Vigilancia | Pieza 8 (estado del competidor) y 12 (alerta) | Complementarios: el estado dice si se vigila; la alerta dice que hay algo que mirar. |

## Resumen de la pasada

| Métrica | Valor |
|---|---|
| Piezas atómicas nuevas | 16 |
| SPAWN residual | 0 (todos tocaron suelo) |
| REF nuevas | 0 |
| Convergencias | 2 (puntuación, estado+vigilancia) |
