# PASADA · INTERLOCUTOR: `asesor / contable`

> Actor externo-relacional del mapa **cerrado en F0** (`resumen.interlocutores[1]`).
> `rol`: **asesor / contable** · `canal`: **revisión** · `relación`: **revisa, corrige, presenta
> impuestos, firma — SE MANTIENE, no se sustituye**.
> Decisión F0 cerrada (`decisiones_cerradas.asesor`): *"SE MANTIENE — automatiza, el asesor revisa y
> firma; requiere exportación y camino de ajuste"*.
> **Frontera con la pieza `revision-asesor`** (`pasada-2-revision-asesor.md`): aquella describía el
> **punto del árbol** (grupo L: exportación · vista · firma); aquí se describe **desde dónde mira el
> asesor** y qué exige para **poder firmar**. Las piezas ya existentes se citan como **REF**.
> **Agnosticismo:** cero tecnologías. **Cero supuestos:** lo no declarado va `[ABIERTO]`.

---

## Prisma de los 5 huecos DESDE la silla del asesor

### 1 · IDENTIDAD — ¿qué es la contabilidad PARA el asesor?
Un **borrador bajo su responsabilidad**: un libro que él **no ha digitado** y que debe poder **validar,
corregir y elevar a definitivo**. Para el asesor la contabilidad no es su herramienta de trabajo diaria
(no la alimenta) sino su **cliente/pupilo al que audita**: le llega hecho, lo revisa, lo ajusta y lo
firma. La herramienta es su **auxiliar**, jamás su sustituto (F0). Su producto no es el asiento: es la
**declaración presentable** y su **firma**.

### 2 · RESTRICCIONES — ¿qué le limita AL ASESOR en esta relación?
- **FRENO**: la **responsabilidad legal es suya**; no firma lo que no puede verificar. → **EMPUJÓN**:
  REF `vista-revisable` (L2) + **`expediente-documental`** (cada cifra con el **documento origen
  archivado y enlazado**: la evidencia que sostiene la firma ante una inspección). L2 *explica*; el
  expediente **conserva la prueba**.
- **FRENO**: revisar miles de asientos a mano es imposible → el asesor revisa por **excepción y muestra**,
  no todo. → **EMPUJÓN**: **`control-calidad-muestreo`** (qué exige ojo humano: alto importe, sin regla,
  contrapartida nueva, cuadre dudoso). Sin esta pieza la automatización le obliga a revisar todo **o** a
  firmar a ciegas.
- **FRENO**: el libro es **vivo**; entre su revisión y la siguiente cambia y no sabe qué es nuevo. →
  **EMPUJÓN**: **`cambio-desde-ultima-revision`** (delta: asientos nuevos, ajustes y reglas cambiadas
  desde su último visto bueno).
- **FRENO**: el sistema **aprende reglas** (REF `regla-contrapartida` A6.2) y podría asentar en masa sin
  que él lo sepa. → **EMPUJÓN**: **`ratificacion-regla-aprendida`** (el asesor ratifica o bloquea la
  regla ANTES de que actúe sobre el volumen).
- **FRENO**: tiene su **propio programa** y sus formatos; si debe recodificar a mano, no acepta. →
  **EMPUJÓN**: REF `puerto-exportacion` (L1) + REF `puerto-plan-contable` (B6); el formato concreto queda
  `[ABIERTO]` (L6).
- **FRENO**: si corrige, no puede perder la historia ni la traza. → **EMPUJÓN**: REF `asiento-ajuste`
  (B5) + REF `traza-asiento` (B4).
- **FRENO**: lo que la automatización no resuelve debe llegarle **ordenado**, no como un atasco. →
  **EMPUJÓN**: REF `cola-revision` (A8) + `[ABIERTO]` quién la resuelve (A8.3).
- **FRENO**: él **no firma en el sistema** (el sistema no puede suplantarle). → **EMPUJÓN**:
  REF `flujo-firma` (L3) — marca de revisado/firmado hecha por el asesor.

### 3 · CONTRATO — qué intercambia con la contabilidad
- **DA**: su **revisión**, su **corrección** (asiento de ajuste), su **plan contable** (import), los
  **tipos/bases que él conoce** (`[ABIERTO]`, D11) y su **firma**.
- **RECIBE**: el **libro completo y explicado**; la **cola de excepciones ordenada**; los **cálculos
  fiscales preparados** (REF D1–D7); la **muestra a revisar**; el **delta** desde su última revisión.
- **A cambio el conjunto gana**: el **aval del asesor** (la medida maestra de F0) y la **presentabilidad**.

### 4 · NO-OBJETIVOS — qué NO quiere el asesor
- NO quiere **digitar** (esa es la promesa que el sistema le quita de encima).
- NO quiere ser **caja negra** ni firmar lo que no entiende.
- NO quiere que la herramienta le **sustituya** ni que firme por él (F0).
- NO quiere recibir el diario crudo **sin criterio de revisión** (por eso muestreo/excepción).
- NO presenta sin poder verificar; NO decide la corrección "en abstracto" (la propone y entra como ajuste).

### 5 · PREGUNTAS ABIERTAS (cero supuestos — no se estima)
1. **`formato-exportacion`** (L6) — ¿qué formato exige su programa? NO declarado.
2. **Modo de revisión** — ¿revisa por excepción/muestra o exige el libro entero? NO declarado.
3. **Forma del ajuste** — ¿el ajuste **suma** (B5) o **reemplaza**? `[ABIERTO]` (L4/B5).
4. **`dueno-cola-revision`** (A8.3) — ¿resuelve él la cola o el dueño? NO declarado.
5. **Ratificación de reglas** — ¿ratifica cada regla aprendida o sólo revisa el resultado? NO declarado.
6. **Nivel de la firma** — ¿firma por periodo, por estado o por documento? NO declarado.
7. **Plan contable** — ¿lo importa él (B1/B6) o lo declara el negocio? NO declarado (compartido con el ROL jefe).

---

## FRENOS → EMPUJONES (consolidado del asesor)
| Freno | Empujón |
|---|---|
| La responsabilidad legal es suya; no firma sin verificar | `expediente-documental` (REF vista-revisable L2) |
| Revisar miles de asientos es imposible | `control-calidad-muestreo` (excepción + muestra) |
| El libro cambia entre revisiones | `cambio-desde-ultima-revision` (delta) |
| El sistema aprende reglas y podría asentar en masa | `ratificacion-regla-aprendida` |
| Tiene su propio programa y formato | REF `puerto-exportacion` L1 + `puerto-plan-contable` B6 (formato `[ABIERTO]` L6) |
| Si corrige, pierde la historia | REF `asiento-ajuste` B5 + `traza-asiento` B4 |
| Lo no resuelto debe llegar ordenado | REF `cola-revision` A8 (+ `dueno-cola-revision` A8.3 `[ABIERTO]`) |
| Quién firma no es el sistema | REF `flujo-firma` L3 |

## PIEZAS que emergen SOLO desde el asesor → al árbol
- **`expediente-documental`** — ATÓMICO (documento origen archivado y enlazado a su cifra; prueba de la firma). **LÓGICA NUEVA** (L2 explica, no conserva evidencia).
- **`control-calidad-muestreo`** — ATÓMICO (selección de lo que exige ojo humano: excepción + muestra). **LÓGICA NUEVA** (invisible desde la vista global: la automatización sin esta pieza obliga a revisar todo).
- **`cambio-desde-ultima-revision`** — ATÓMICO (delta entre revisiones). **LÓGICA NUEVA.**
- **`ratificacion-regla-aprendida`** — ATÓMICO (el asesor ratifica/bloquea la regla aprendida antes de que actúe). **LÓGICA NUEVA** (A6.2 crea la regla, nadie la ratifica).
- **REF** (no se duplican): `vista-revisable` L2 · `puerto-exportacion` L1 · `flujo-firma` L3 · `asiento-ajuste` B5 · `traza-asiento` B4 · `puerto-plan-contable` B6 · `regla-contrapartida` A6.2 · `cola-revision` A8 · `generador-modelo`/`liquidacion-iva`/`retenciones` (D1–D7) · `formato-exportacion` L6 · `parametros-fiscales` D11.

> Punto **SECO** salvo los `[ABIERTO]`, que los cierra el asesor/dueño (no se estiman).
