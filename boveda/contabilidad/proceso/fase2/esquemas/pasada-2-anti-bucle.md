# PASADA 2 · PUNTO: `anti-bucle` (los 3 cerrojos transversales)

> Los **3 cerrojos anti-bucle declarados en F0** — "realista y no llegue a colapsar o entrar en
> bucle". No son features: son **invariantes transversales** que toda pieza debe respetar. Aquí se
> prisman como punto propio porque **fallan si no se esquematizan**.

---

## Prisma de los 5 huecos

### 1 · IDENTIDAD — ¿qué es el anti-bucle?
Tres invariantes que el sujeto declaró como condición de realidad:
1. **Planos separados** — contabilidad emite **CÁLCULOS** (`contabilidad.*`), **nunca** hechos de
   negocio → no puede disparar la operación → no la realimenta.
2. **Un solo escritor por parcela** — patrón custodio: un único escritor por almacén.
3. **Idempotencia por clave natural** — **"un cierre = un asiento"**: reprocesar no duplica.

### 2 · RESTRICCIONES — ¿qué le limita?
- **FRENO**: si contabilidad emitiera un hecho de negocio, la operación reaccionaría y realimentaría
  el bucle. **EMPUJÓN**: **frontera-planos** (guarda que sólo se emiten cálculos; un test lo afirma).
- **FRENO**: dos escritores sobre la misma parcela corrompen. **EMPUJÓN**: **single-writer** (regla
  de un escritor por parcela, verificable).
- **FRENO**: reprocesar el mismo hecho duplicaría el asiento. **EMPUJÓN**: **clave-natural**
  (idempotencia apoyada en la clave natural del hecho/cierre).
- **FRENO**: la idempotencia depende de `unidad_de_cierre`, que **no está declarado**.
  **EMPUJÓN**: `definicion-cierre` **[ABIERTO]** (sin la clave no hay idempotencia cerrada).

### 3 · CONTRATO — ¿qué intercambia?
- **Recibe:** cada pieza del sistema.
- **Produce:** la garantía de que **no hay bucle ni colisión** (el sujeto sigue "vivo y funcional").
- **A cambio el conjunto gana:** el **derecho a automatizar sin operador**.

### 4 · NO-OBJETIVOS — ¿qué NO hace?
- NO es una feature de usuario (es un invariante). NO impide el ajuste legítimo del asesor
  (ese va por camino de ajuste, con traza).

### 5 · PREGUNTAS ABIERTAS (cero supuestos)
- `unidad_de_cierre` — ¿qué es "un cierre" (jornada/día/mes) y cómo se identifica? Es la **clave
  natural** sobre la que cuelga la idempotencia → sin respuesta, el cerrojo 3 no puede cerrarse.
- ¿La clave natural de un hecho de venta/compra es el id del evento de origen? NO declarado.

---

## FRENOS → EMPUJONES consolidados
1. **frontera-planos** — sólo se emiten cálculos (`contabilidad.*`), nunca hechos de negocio.
2. **single-writer** — un solo escritor por parcela (aplica a cada custodio del sistema).
3. **clave-natural** — idempotencia: reprocesar no duplica ("un cierre = un asiento").
4. **definicion-cierre** — **[ABIERTO]**: qué es un cierre (la clave de todo el cerrojo 3).

## Lo que sale de ESTE punto
- `frontera-planos` — hoja atómica → disección
- `single-writer` — hoja atómica → disección
- `clave-natural` — hoja atómica → disección
- `definicion-cierre` — **[ABIERTO]** (pregunta de F0: `unidad_de_cierre`)

> Punto **SECO**. (Es transversal: se referencia desde todas las piezas con estado.)
