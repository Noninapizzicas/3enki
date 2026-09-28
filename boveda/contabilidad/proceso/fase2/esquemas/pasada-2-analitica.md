# PASADA 2 · PUNTO: `analitica` (centros de coste · márgenes · presupuestos · desviaciones)

> El bloque que convierte la contabilidad **general** en contabilidad **de gestión**: no sólo
> cuánto, sino **de qué** (centro, línea, producto) y **contra qué** (presupuesto).

---

## Prisma de los 5 huecos

### 1 · IDENTIDAD — ¿qué es la analítica?
La **dimensión de gestión** de los hechos: cada coste/ingreso se etiqueta con un **centro de
coste** (o línea, o producto) para calcular **márgenes** reales, comparar con **presupuesto** y
medir **desviaciones**. Es lo que permite responder "¿me gana esta línea o me la come?".

### 2 · RESTRICCIONES — ¿qué le limita?
- **FRENO**: los hechos no traen centro de coste declarado. **EMPUJÓN**:
  **etiquetado-analitico** (asigna centro por regla declarable; lo dudoso → `cola-revision`).
- **FRENO**: la gran empresa/grupo exige **coste indirecto** (reparto de gastos no directos);
  `escandallo` no basta (verificado). **EMPUJÓN**: **coste-indirecto** (reparto declarable por
  encima, sin tocar la pieza existente).
- **FRENO**: sin presupuesto no hay desviación. **EMPUJÓN**: **presupuesto** (CUSTODIO declarable)
  + **desviacion** (real vs presupuesto) + aviso si se sale.
- **FRENO**: márgenes exigen coste real del consumo → depende de `fuente_coste_consumo`.
  **EMPUJÓN**: REF `coste-consumo` (enlaza con `existencias`).

### 3 · CONTRATO — ¿qué intercambia?
- **Recibe:** hechos asentados (núcleo) + costes (existencias/personal/inmovilizado).
- **Produce:** margen por centro/línea/producto, desviación vs presupuesto → los consume
  `producto-servicio` (informes ricos) y `revision-asesor`.
- **A cambio el conjunto gana:** la **lectura de gestión**, no sólo la fiscal.

### 4 · NO-OBJETIVOS — ¿qué NO hace?
- NO sustituye la contabilidad general (la **relee** y la reetiqueta). NO inventa presupuestos.
- NO decide el reparto de indirectos: lo declara el negocio.

### 5 · PREGUNTAS ABIERTAS (cero supuestos)
- ¿Qué **centros de coste / dimensiones** declara cada negocio? NO declarado.
- ¿Cómo se reparte el **coste indirecto**? NO declarado → no se estima.
- ¿Hay **presupuesto** cargado y con qué periodicidad? NO declarado.

---

## FRENOS → EMPUJONES consolidados
1. **etiquetado-analitico** — asigna centro/línea/producto a cada hecho (regla declarable).
2. **margen-analitico** — margen real por dimensión (ingreso − coste imputado).
3. **presupuesto** — cifra objetivo por dimensión (CUSTODIO, declarable).
4. **desviacion** — real vs presupuesto → dispara aviso si se sale.
5. **coste-indirecto** — reparto declarable de gastos no directos (cubre el hueco que la pieza
   existente no cubre para grupo).

## Lo que sale de ESTE punto
- `etiquetado-analitico` — hoja atómica → disección
- `margen-analitico` — hoja atómica → disección
- `presupuesto` — hoja atómica → disección
- `desviacion` — hoja atómica → disección
- `coste-indirecto` — hoja atómica → disección
- `dimensiones-analiticas` — **[ABIERTO]** (qué centros/dimensiones declara el negocio)
- `criterio-reparto-indirecto` — **[ABIERTO]**

> Punto **SECO**.
