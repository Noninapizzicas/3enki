# PASADA 2 · PUNTO: `existencias` (inventario valorado · consumo→stock · entrada por compra · conteo)

> Aquí el F0 ya tiene una pieza reutilizable: **`inventario`** (ya es multi-proyecto) — **no se
> duplica**. El prisma de este punto es **sólo lo que falta**: la **valoración** y el puente
> **consumo → stock**.

---

## Prisma de los 5 huecos

### 1 · IDENTIDAD — ¿qué es las existencias?
La **valoración contable del stock**: no *cuánto hay* (eso ya lo sabe `inventario`), sino
*cuánto vale* y cómo ese valor entra y sale del libro. El día normal declarado dice:
**ventas por eventos + facturas de compra → actualizar stock** → este punto convierte
"movimiento de stock" en **asiento valorado**.

### 2 · RESTRICCIONES — ¿qué le limita?
- **FRENO**: el F0 no declara **de dónde sale el coste del consumo** (`fuente_coste_consumo`).
  **EMPUJÓN**: **frontera-ficha-producto** (puerto declarable en el que cada negocio expone el
  coste de sus fichas) — **si no existe, se crea** (invariante). *(REF: dos lógicas de coste
  coexisten hoy — receta y compuestos — y `escandallo` no basta para grupo; se pone POR ENCIMA.)*
- **FRENO**: el sistema ya tiene stock pero **sin valor**. **EMPUJÓN**: **valoracion-existencia**
  (capa de valoración por encima, sin tocar el inventario existente).
- **FRENO**: un consumo reconstruido sin coste no puede asentar. **EMPUJÓN**: `coste-consumo`
  **[ABIERTO]** hasta que se responda `fuente_coste_consumo`.
- **FRENO**: el stock real y el contable divergen (mermas, roturas). **EMPUJÓN**: **ajuste-inventario**
  (regulariza la diferencia con asiento + aviso).

### 3 · CONTRATO — ¿qué intercambia?
- **Recibe:** movimientos de stock (del inventario existente) + coste de ficha (puerto) +
  compras (de la entrada de hecho).
- **Produce:** valor de existencias (balance) + coste de ventas (resultado) + ajuste por merma →
  asiento (núcleo); variaciones → `analitica` (márgenes).
- **A cambio el conjunto gana:** que el **stock se refleje en las cuentas**, no sólo en cantidad.

### 4 · NO-OBJETIVOS — ¿qué NO hace?
- NO duplica el inventario físico existente (lo **lee**). NO inventa el coste: si no lo declara
  el negocio, queda **[ABIERTO]**.

### 5 · PREGUNTAS ABIERTAS (cero supuestos)
- `fuente_coste_consumo` — ¿de dónde sale el coste del consumo (ficha del producto / receta /
  otro)? Pregunta de F0, **no resuelta**.
- `solape_marketing_budget` — ¿contabilidad absorbe o sólo lee lo que ya custodia otra pieza? NO resuelto.
- ¿Método de valoración (FIFO / coste medio / etc.)? NO declarado.
- ¿Las mermas las declara el negocio o las deduce el sistema? NO declarado.

---

## FRENOS → EMPUJONES consolidados
1. **valoracion-existencia** — capa de valor sobre el stock existente (sin duplicar inventario).
2. **frontera-ficha-producto** — puerto declarable del coste de cada negocio (si falta, se crea).
3. **coste-consumo** — coste del consumo reconstruido (**[ABIERTO]** sin `fuente_coste_consumo`).
4. **ajuste-inventario** — regulariza merma/rotura con asiento y aviso.
5. **variacion-stock-valorada** — entrada por compra / salida por consumo, valoradas.

## Lo que sale de ESTE punto
- `valoracion-existencia` — hoja atómica → disección
- `frontera-ficha-producto` — hoja atómica → disección
- `ajuste-inventario` — hoja atómica → disección
- `variacion-stock-valorada` — hoja atómica → disección
- `coste-consumo` — **[ABIERTO]** (se cierra con `fuente_coste_consumo`)
- `solape-custodia-contable` — **[ABIERTO]** (absorbe o lee — F0)

> Punto **SECO**.
