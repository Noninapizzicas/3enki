# PASADA 2 · PUNTO: `libro-nucleo` (partida doble: plan · diario · mayor)

> La columna vertebral contable. Es **donde el hecho normalizado se convierte en asiento** y
> donde vive el **cerrojo de single-writer** ("un solo escritor por parcela").

---

## Prisma de los 5 huecos

### 1 · IDENTIDAD — ¿qué es el núcleo?
El **libro de la partida doble**: plan contable (catálogo de cuentas), **diario** (asiento:
debe/haber por cuenta), **mayor** (saldo por cuenta) y **balanza**. Es la pieza que aplica el
principio contable real: todo hecho produce un asiento equilibrado. Guarda la **traza** del
asiento (quién lo creó: la entrada o el asesor) para que el ajuste no rompa la historia.

### 2 · RESTRICCIONES — ¿qué le limita?
- **FRENO**: el plan de cuentas propio no está declarado. **EMPUJÓN**: **catalogo-cuentas**
  (declarable/importable desde el plan del asesor) — el negocio aporta su plan, no se inventa.
- **FRENO**: dos escritores sobre la misma parcela corrompen (bucle/colisión). **EMPUJÓN**:
  **escritor-diario** único (single-writer; patrón custodio).
- **FRENO**: reprocesar el mismo hecho duplicaría el asiento. **EMPUJÓN**: clave natural
  (REF `deduplicacion-hecho`, `M3`).
- **FRENO**: el asesor corrige y podría perder la trazabilidad. **EMPUJÓN**: **asiento-ajuste**
  (asiento de corrección encima, nunca borrado) + **traza-asiento** (inmutable).
- **FRENO**: el plan del asesor tiene otra codificación. **EMPUJÓN**: **puerto-plan-contable**
  (la frontera de codificación: import/export del plan).

### 3 · CONTRATO — ¿qué intercambia?
- **Recibe:** hecho normalizado + contrapartida (de `entrada-hechos`); asiento de ajuste (de
  `revision-asesor`).
- **Produce:** asiento registrado (diario), saldos (mayor/balanza) → los consumen `estados-cierre`,
  `capa-fiscal`, `analitica`, `grupo`.
- **A cambio el conjunto gana:** el **dato contable cuadrado** del que todo lo demás deriva.

### 4 · NO-OBJETIVOS — ¿qué NO hace?
- NO interpreta documentos (eso es la entrada). NO calcula estados (eso es estados-cierre).
- NO emite hechos de negocio. NO permite borrar un asiento (sólo corregir por ajuste).

### 5 · PREGUNTAS ABIERTAS (cero supuestos)
- `unidad_de_cierre` — ¿qué es un cierre y cómo se identifica? (clave natural del asiento)
- ¿El **plan contable** de partida es el del asesor o uno propio del producto? (NO declarado)
- ¿El ajuste del asesor **reemplaza** el asiento original o se **suma** encima? (camino de ajuste
  declarado, forma no declarada)
- `granularidad_de_grupo` — ¿el diario es por sociedad o compartido con marca de sociedad?

---

## FRENOS → EMPUJONES consolidados
1. **catalogo-cuentas** — el plan contable declarable/importable (el negocio lo aporta).
2. **escritor-diario** — single-writer: un solo escritor por parcela (garantía anti-colisión).
3. **asiento-ajuste** — la corrección se suma encima sin romper la traza.
4. **traza-asiento** — inmutabilidad del registro (quién y cuándo creó cada asiento).
5. **puerto-plan-contable** — frontera de codificación del plan (import/export).
6. **mayor-balanza** — saldos por cuenta derivados del diario.

## Lo que sale de ESTE punto
- `catalogo-cuentas` — hoja atómica → disección
- `escritor-diario` — hoja atómica (single-writer) → disección
- `mayor-balanza` — hoja atómica → disección
- `traza-asiento` — hoja atómica → disección
- `asiento-ajuste` — hoja atómica → disección
- `puerto-plan-contable` — hoja atómica → disección
- `criterio-clave-asiento` — **[ABIERTO]** (se cierra con `unidad_de_cierre`)

> Punto **SECO**: cada hoja es atómica o abierta. No se re-prisma.
