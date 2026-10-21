# PASADA · ROL: `jefe` (función interna: DECIDE Y DECLARA EL FUTURO · ve el CONJUNTO)

> El ROL es la **función INTERNA** que el sistema debe servir, y se esquematiza por
> separado del **interlocutor** aunque sean el mismo humano. Aquí el interlocutor
> `dueño del negocio` (F0 §interlocutores) es el actor **relacional** (consulta sus
> cuentas); el ROL **jefe** es la función **interna** de *decisión y declaración*:
> mira resultados **agregados** —márgenes, desviaciones, caja, ejercicio— y **fija los
> criterios** con los que el resto del sistema debe trabajar.
> **Agnosticismo:** cero tecnologías — sólo puertos y piezas. **Cero supuestos:** lo no
> declarado va `[ABIERTO]`.
> **Referencias cruzadas:** el árbol vive en `esquema.md`; NO se duplica aquí.

---

## Prisma de los 5 huecos DESDE la silla del jefe + LÓGICA que exige

### 1 · IDENTIDAD — ¿qué es la contabilidad para el ROL jefe?
Su **conjunto económico visto desde arriba**: *¿cuánto gano, dónde lo gano, cuánto se
desvía de lo que esperaba, cuánto dinero hay y cuánto habrá, y con qué reglas se está
llevando la cuenta?* El jefe no opera el proceso diario (eso es el trabajador) ni
entrega/reporta a terceros (eso es el asesor). Su idioma no es "el asiento 1284" sino
**"el margen del centro X", "la desviación del mes contra presupuesto", "la caja a 30
días"**. Y su segunda cara: el jefe es **quien declara los criterios** que el motor
necesita para poder decidir solo (plan de cuentas, política de cobro, periodo de cierre,
dimensiones, parámetros). Sin esas declaraciones el motor tiene huecos; el jefe es la
puerta que los cierra.

### 2 · RESTRICCIONES — ¿qué le limita al ROL jefe?
- **FRENO**: el jefe no puede leer un diario de miles de asientos ni una balanza de
  cientos de cuentas. → **EMPUJÓN**: **`cuadro-mando-contable`** (agregación: caja ·
  margen · resultado · desviación · ejercicio, sin bajar al asiento).
- **FRENO**: decidir sin poder comparar contra lo esperado. → **EMPUJÓN**:
  **`comparador-periodos`** (ejercicio vs ejercicio, mes vs mes, real vs presupuesto —
  reutiliza `presupuesto` (J3) y `desviacion` (J4), no los duplica).
- **FRENO**: el jefe ve el margen global pero no sabe *qué línea* lo mueve. →
  **EMPUJÓN**: **`tablero-margen-dimension`** (cruce de `margen-analitico` (J2) con
  `dimensiones-analiticas` (J6) bajo lente de conjunto: por centro, por familia, por
  sociedad).
- **FRENO**: los criterios están dispersos en 12 campos `[ABIERTO]` del esquema
  (plan contable B1/B7, periodo C7, política cobro E6, amortización F5, dimensiones J6,
  parámetros fiscales D11, consolidación I5…). Si el jefe los declara uno a uno en
  sitios distintos, se pierde. → **EMPUJÓN**: **`cola-declaraciones-criterio`** (UNA sola
  cola donde el jefe fija/ratifica todos los criterios; cada declaración cierra su
  `[ABIERTO]` correspondiente).
- **FRENO**: `vista_agregada` (I6) está `[ABIERTO]`: no se sabe si el jefe quiere un
  **consolidador de sólo lectura** o un **proyecto-oficina** desde el que operar varios
  negocios. → **EMPUJÓN**: puerto declarable; el cuadro-mando sirve a ambos, se decide
  con el dueño. → **PREGUNTA ABIERTA** (no se estima).
- **FRENO**: los avisos que le importan al jefe (sangría de caja, desviación, cuadre que
  no cuadra) no están catalogados. → **EMPUJÓN**: REF `motor-avisos` (K2) + `catalogo-avisos`
  (K6, `[ABIERTO]`) alimentados por `aviso-cuadre` (C6), `desviacion` (J4), `prevision-caja` (E5).
- **FRENO**: el jefe de un grupo no puede decidir sin ver consolidado y sin eliminar lo
  intercompany. → **EMPUJÓN**: REF `consolidacion` (I3) + `eliminacion-intercompany` (I2) +
  `marca-sociedad` (I1); su granularidad sigue `[ABIERTO]` (I7).

### 3 · CONTRATO — qué espera VER y ACTUAR el ROL jefe
**CARA DE INTERFAZ (lo que alimenta las fases de interfaz):**
- **VER**: un **cuadro de conjunto** (caja · resultado · margen · desviación · ejercicio)
  con la posibilidad de bajar por dimensión; comparación real-vs-esperado por periodo;
  avisos priorizados (lo que sangra, lo que no cuadra, lo que se desvía); para grupos, el
  consolidado con la traza de lo eliminado.
- **ACTUAR**: **declarar/ratificar criterios** (plan de cuentas, política de cobro,
  periodo de cierre, dimensiones/centros de coste, parámetros fiscales y de amortización);
  fijar **objetivos/presupuesto** contra los que se mida la desviación; ajustar umbrales de
  aviso; decidir sobre el consolidado.
- **Recibe**: cálculos y estados ya agregados, cada uno **explicado con su origen**
  (REF `vista-revisable` L2 — no caja negra, también para el jefe).
- **NO recibe**: el diario crudo como instrumento de trabajo diario (para eso está el asesor).

**LÓGICA DE DOMINIO que el rol jefe exige construir (lo que el interlocutor `dueño` NO exige):**
la cara del interlocutor `dueño` (canal *consulta*) se satisface con **poder mirar**; la cara del
ROL jefe exige además la **lógica de agregación** y la **lógica declarativa**. Esa es la
diferencia y lo que emerge como módulo nuevo.

### 4 · NO-OBJETIVOS del ROL jefe
- NO opera el proceso contable diario (no revisa asientos uno a uno, no resuelve la cola de
  excepciones) → eso es el **trabajador**.
- NO presenta impuestos ni firma → eso es el **asesor** (interlocutor + ROL trabajador cuando
  revisa).
- NO recibe/consume los informes finales como destinatario externo → eso es el **cliente**.
- NO es el motor contable: no asienta, no cuadra, no liquida. **Mira y declara.**

### 5 · PREGUNTAS ABIERTAS del ROL jefe (cero supuestos)
1. **`vista_agregada` (I6)** — ¿el jefe quiere un **consolidador de sólo lectura** o un
   **proyecto-oficina** desde el que opera varios negocios? NO declarado.
2. **`granularidad_de_grupo` (I7)** — ¿qué sube al cuadro de mando: negocio, sociedad,
   sucursal, centro? NO declarado.
3. **Cadencia del cuadro** — ¿con qué ritmo quiere el jefe los agregados (al día / al mes /
   al cierre)? = `momento_de_uso` (C7), NO declarado.
4. **Umbrales** — ¿qué desviación/sangría dispara aviso y con qué umbral los fija el jefe?
   NO declarado (se liga a `desviacion` J4 y `catalogo-avisos` K6).
5. **Quién declara los criterios** — ¿los declara el jefe (ROL), o los importa del asesor
   (plan contable B1/B6)? NO declarado: puede ser **ambos**, y no está decidido el orden.
6. **¿El jefe ve el margen por dimensión o basta el global?** = `dimensiones-analiticas` (J6),
   NO declarado.

### FRENOS → EMPUJONES (consolidado del ROL jefe)
| Freno | Empujón |
|---|---|
| No puede leer diario ni balanza | `cuadro-mando-contable` (agregación de conjunto) |
| No puede decidir sin comparar con lo esperado | `comparador-periodos` (REF presupuesto J3 + desviacion J4) |
| No sabe qué línea mueve el margen | `tablero-margen-dimension` (REF margen-analitico J2 + dimensiones J6) |
| Criterios dispersos en 12 `[ABIERTO]` | `cola-declaraciones-criterio` (una sola cola declarativa) |
| `vista_agregada` sin decidir (I6) | puerto declarable → **ABIERTO** |
| Avisos del jefe sin catalogar | REF motor-avisos K2 (+ aviso-cuadre C6 · desviacion J4 · prevision-caja E5) |
| Grupo sin consolidar | REF consolidacion I3 + eliminacion-intercompany I2 + marca-sociedad I1 |

## PIEZAS que emergen SOLO desde el ROL jefe → al árbol
- **`cuadro-mando-contable`** — ATÓMICO (agregación de conjunto: caja · resultado · margen ·
  desviación · ejercicio; sin bajar al asiento). LÓGICA NUEVA.
- **`comparador-periodos`** — ATÓMICO (real vs esperado, periodo vs periodo; reutiliza
  presupuesto J3 y desviacion J4). LÓGICA NUEVA.
- **`tablero-margen-dimension`** — ATÓMICO (cruce margen×dimensión bajo lente de conjunto).
  LÓGICA NUEVA (no duplica J2/J6, los cruza con la lente del jefe).
- **`cola-declaraciones-criterio`** — ATÓMICO (una sola cola donde el jefe cierra los
  `[ABIERTO]` de criterio: B1/B7 · C7 · E6 · F5 · J6 · D11 · I5). **LÓGICA NUEVA** — es el
  agujero que hoy nadie cubre: el esquema tiene los criterios abiertos pero **ninguna pieza
  que los recoja declarativamente**.
- **REF** (no se duplican): `vista-agregada` (I6) · `margen-analitico` (J2) · `desviacion`
  (J4) · `presupuesto` (J3) · `dimensiones-analiticas` (J6) · `motor-avisos` (K2) ·
  `vista-revisable` (L2) · `consolidacion` (I3) · `eliminacion-intercompany` (I2).

> Punto **SECO** (salvo los `[ABIERTO]` de criterio, que se cierran con el dueño, no se estiman).
