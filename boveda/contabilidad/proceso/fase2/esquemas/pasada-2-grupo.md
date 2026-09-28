# PASADA 2 · PUNTO: `grupo` (multi-sociedad · intercompany · consolidación · vista agregada)

> Bloque declarado en F0 pero con una **pregunta abierta propia**: el dueño preguntó si sirve
> para "una gran empresa o grupo" y se verificó que la pieza de coste existente **no basta**
> (falta coste indirecto, multi-sociedad, periodos).

---

## Prisma de los 5 huecos

### 1 · IDENTIDAD — ¿qué es el grupo?
Contabilidad **de más de una sociedad**: cada sociedad con su propio libro, pero con **relaciones
entre ellas** (compras/ventas internas, préstamos intercompany) que hay que **eliminar** para
presentar una imagen **consolidada** del conjunto. Y **multi-tenant**: cada negocio aislado.

### 2 · RESTRICCIONES — ¿qué le limita?
- **FRENO**: `granularidad_de_grupo` no declarado — ¿hasta dónde llega (grupos de empresas,
  sociedades, sucursales)? **EMPUJÓN**: **marca-sociedad** (cada asiento lleva su sociedad) —
  construible; el **grado** queda **[ABIERTO]**.
- **FRENO**: las operaciones internas inflarían el conjunto. **EMPUJÓN**: **eliminacion-intercompany**
  (detecta y elimina el cruce interno en la consolidación).
- **FRENO**: consolidar exige cuadrar fechas y monedas entre sociedades. **EMPUJÓN**:
  **criterio-consolidacion** (declarable: períodos/monedas) — valores **[ABIERTO]**.
- **FRENO**: el aislamiento multi-tenant debe ser total. **EMPUJÓN**: **aislamiento-negocio**
  (cada negocio en su parcela; sin fuga).
- **FRENO**: ¿una vista de todos los negocios juntos, o un "proyecto-oficina"? **EMPUJÓN**:
  `vista-agregada` **[ABIERTO]**.

### 3 · CONTRATO — ¿qué intercambia?
- **Recibe:** cuentas de cada sociedad (del núcleo/estados-cierre).
- **Produce:** eliminaciones, estados consolidados, vista agregada → los consume `revision-asesor`.
- **A cambio el conjunto gana:** la **imagen del conjunto**, no sólo de una sociedad.

### 4 · NO-OBJETIVOS — ¿qué NO hace?
- NO decide qué es "grupo" (lo declara el negocio). NO mezcla datos de negocios distintos.
- NO duplica un libro por sociedad: reutiliza el mismo núcleo con marca de sociedad.

### 5 · PREGUNTAS ABIERTAS (cero supuestos)
- `granularidad_de_grupo` — ¿grupo de empresas / multi-sociedad / sucursales? NO declarado.
- `vista_agregada` — ¿consolidador **de sólo lectura** o un **proyecto-oficina** activo? NO declarado.
- ¿Multi-moneda? ¿conversión y a qué tipo? NO declarado.

---

## FRENOS → EMPUJONES consolidados
1. **marca-sociedad** — cada asiento etiquetado con su sociedad (base de todo lo de grupo).
2. **eliminacion-intercompany** — quita el cruce interno en la consolidación.
3. **consolidacion** — estados del conjunto con criterio declarado.
4. **criterio-consolidacion** — períodos/monedas declarables (**[ABIERTO]**).
5. **aislamiento-negocio** — multi-tenant sin fuga entre negocios.
6. **vista-agregada** — **[ABIERTO]** (lectura vs proyecto-oficina).

## Lo que sale de ESTE punto
- `marca-sociedad` — hoja atómica → disección
- `eliminacion-intercompany` — hoja atómica → disección
- `consolidacion` — hoja atómica → disección
- `aislamiento-negocio` — hoja atómica → disección
- `criterio-consolidacion` — **[ABIERTO]**
- `vista-agregada` — **[ABIERTO]**
- `granularidad-grupo` — **[ABIERTO]** (pregunta de F0)

> Punto **SECO**.
