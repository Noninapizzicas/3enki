# PASADA 2 · PUNTO: `revision-asesor` (exportación · diálogo · asiento de ajuste · firma)

> La pieza que materializa la decisión más fuerte del F0: **"el asesor SE MANTIENE"**. La
> herramienta no sustituye al asesor → debe entregar salida **revisable**, **exportable** y con
> **camino de ajuste**.

---

## Prisma de los 5 huecos

### 1 · IDENTIDAD — ¿qué es la revisión del asesor?
La **frontera con el asesor**: entrega los estados de forma **legible y revisable**, permite
**exportarlos** al programa del asesor (formatos contables estándar), y acepta su **corrección**
como **asiento de ajuste** sin romper la traza, para que él **firme y presente**. Es el punto que
decide la **medida maestra**: "que lo acepte y pueda presentarlo".

### 2 · RESTRICCIONES — ¿qué le limita?
- **FRENO**: el asesor usa un programa propio con formato no declarado. **EMPUJÓN**:
  **puerto-exportacion** (formatos contables estándar declarables) — si falta, se crea.
- **FRENO**: si corrige, se perdería la historia. **EMPUJÓN**: REF `asiento-ajuste` + REF `traza-asiento`.
- **FRENO**: no puede ser caja negra (no la aceptaría → rompe la medida maestra). **EMPUJÓN**:
  **vista-revisable** (todo asiento y cálculo explicado con su origen).
- **FRENO**: quién firma no es el sistema. **EMPUJÓN**: **flujo-firma** (marca de revisado/firmado
  por el asesor, sin que el sistema lo haga).
- **FRENO**: lo que la automatización no resuelve debe llegarle ordenado. **EMPUJÓN**: REF `cola-revision`.

### 3 · CONTRATO — ¿qué intercambia?
- **Recibe:** estados/asientos/cálculos del sistema.
- **Produce:** exportación + ajustes de vuelta (asiento de ajuste) + marca de firma.
- **A cambio el conjunto gana:** el **aval del asesor** (medida maestra) y la **presentabilidad**.

### 4 · NO-OBJETIVOS — ¿qué NO hace?
- NO presenta impuestos (firma el asesor). NO decide la corrección (la propone el asesor y entra
  como ajuste). NO escribe en el libro directamente sin traza.

### 5 · PREGUNTAS ABIERTAS (cero supuestos)
- ¿Qué **formato de exportación** exige el programa del asesor? NO declarado.
- ¿El ajuste **reemplaza** o **suma** (forma del camino de ajuste)? NO declarado.
- `cola_revision` — ¿la revisión de lo dudoso pasa por el asesor o por el dueño? NO declarado.

---

## FRENOS → EMPUJONES consolidados
1. **puerto-exportacion** — formatos contables estándar hacia el programa del asesor.
2. **vista-revisable** — todo asiento y cálculo explicado con su origen (no caja negra).
3. **asiento-ajuste** — REF (`libro-nucleo`): la corrección entra como ajuste, con traza intacta.
4. **flujo-firma** — marca de revisado/firmado por el asesor (el sistema no firma).
5. **cola-revision** — REF (`entrada-hechos`): lo no resuelto llega ordenado al asesor.

## Lo que sale de ESTE punto
- `puerto-exportacion` — hoja atómica → disección
- `vista-revisable` — hoja atómica → disección
- `flujo-firma` — hoja atómica → disección
- `asiento-ajuste` — **REF** (ya en `libro-nucleo`)
- `cola-revision` — **REF** (ya en `entrada-hechos`)
- `formato-exportacion` — **[ABIERTO]** (formato que exige el asesor)

> Punto **SECO**.
