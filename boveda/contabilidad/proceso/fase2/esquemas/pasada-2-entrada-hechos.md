# PASADA 2 · PUNTO: `entrada-hechos` (LA PUERTA — EL ESLABÓN LIMITANTE)

> El corazón del esquema. Es el punto cuya capacidad y programación restringen al conjunto:
> todo lo que va aguas abajo (asiento, mayor, estados, fiscal, cierre) sólo cuadra **si la
> entrada está completa y normalizada**. Hoy ese paso lo hace **una persona** (digita o
> digitaliza) → es el único punto donde la promesa "sin operador" se rompe.

---

## Prisma de los 5 huecos

### 1 · IDENTIDAD — ¿qué es la entrada aquí?
El **punto de admisión** del sistema: convierte hechos ocurridos en **hecho normalizado**
(unidad de entrada lista para asentar). Dos naturalezas distintas de hecho:
- **Hecho ya estructurado:** emitido por otra vertical (venta, compra, movimiento de stock).
  Llega limpio y completo.
- **Hecho en documento:** factura digitalizada o recibida digital, extracto bancario, nómina.
  Llega como **documento** y hay que **interpretarlo** → aquí es donde hoy trabaja una persona.

No produce hechos de negocio: **escucha** y **normaliza**. La salida es una **propuesta de
hecho**, nunca un hecho nuevo emitido al mundo.

### 2 · RESTRICCIONES — ¿qué le limita?
- **FRENO**: un documento debe interpretarse → hoy lo digita una persona. **EMPUJÓN**:
  **conversion-documento-a-dato** (conversor de frontera: documento → dato) + **captura-documento**.
- **FRENO**: "recibirlas digitales" no es un canal existente hoy. **EMPUJÓN**:
  **puerto-documento-digital** (recepción digital declarable) — si la fuente no existe, se crea.
- **FRENO**: cada hecho debe hallar su cuenta, su tercero y su periodo → juicio. **EMPUJÓN**:
  **resolucion-contrapartida** (micro-agente: propone la contrapartida con el dato hidratado).
- **FRENO**: documento ilegible / dato que no cuadra **atasca** la entrada. **EMPUJÓN**:
  **cola-revision** (buffer de excepciones: el flujo sigue; lo dudoso se aparta y avisa).
- **FRENO**: reprocesar duplicaría asientos (colapso/bucle). **EMPUJÓN**: **deduplicacion-hecho**
  (idempotencia por **clave natural**; ver `M3`).
- **FRENO**: un hecho incompleto no se sabe si asentar. → **ABIERTO** (`regla-hecho-incompleto`).
- **FRENO**: entrada en serie atasca el embudo. **EMPUJÓN**: admisión **por lotes/hilos**
  (desacople: N hechos en paralelo — mismo patrón que el batch del molde).

### 3 · CONTRATO — ¿qué intercambia?
- **Recibe:** del **bus de las verticales** (hechos ya emitidos) y del **puerto de documento**
  (facturas/recibos/extractos/nóminas).
- **Produce:** **hecho normalizado** + **propuesta de contrapartida** → lo entrega al núcleo
  (`libro-nucleo`) para asentar.
- **A cambio el conjunto gana:** la **cobertura** de la reconstrucción (mide si la contabilidad
  está completa o le falta un documento) y la garantía anti-duplicado.

### 4 · NO-OBJETIVOS — ¿qué NO hace?
- NO decide el hecho de negocio (lo lee, no lo crea). NO asienta (eso es el núcleo). NO presenta
  impuestos (eso es fiscal). NO sustituye al asesor.
- NO inventa un dato no declarado: si falta, lo marca **ABIERTO** y lo pone en **cola-revision**.

### 5 · PREGUNTAS ABIERTAS (cero supuestos)
- `cuando_reconstruye` — ¿en tiempo real, en el cierre, o ambos? (gobierna cómo se programa la entrada)
- `unidad_de_cierre` — ¿qué es "un cierre" (jornada/día/mes) y cómo se identifica? (es la **clave
  natural** de la idempotencia → "un cierre = un asiento" cuelga de aquí)
- `recepcion_digital_facturas` — ¿por qué canal llegan las "recibidas digitales"?
- `fuente_coste_consumo` — ¿de dónde sale el coste del consumo que la entrada debe llevar?
- `cola_revision` — ¿qué pasa con un documento ilegible o un dato que no cuadra? ¿avisa al asesor?
- `momento_de_uso` — ¿con qué ritmo se usa la entrada (día/mes/cierre)?

---

## FRENOS → EMPUJONES consolidados (las piezas que ABREN el cuello)
1. **conversion-documento-a-dato** — el conversor frontal: documento → dato normalizado.
2. **captura-documento** — admisión del documento (digitalizado o recibido).
3. **puerto-documento-digital** — la recepción digital como puerto declarable (si no existe, se crea).
4. **resolucion-contrapartida** — halla cuenta/tercero/periodo del hecho (juicio asistido).
5. **deduplicacion-hecho** — clave natural → "un hecho = un asiento" (reprocesar no duplica).
6. **cola-revision** — buffer de excepciones: el flujo no se bloquea; lo dudoso avisa.
7. **normalizador-hecho** — forma homogénea del hecho (una sola puerta de formato).
8. **entrada-por-lotes** — desacople del cuello: N hechos en paralelo.

## Lo que sale de ESTE punto
- `puerto-evento-vertical` — hoja atómica (bus de hechos ya emitidos) → disección
- `normalizador-hecho` — hoja atómica (forma homogénea) → disección
- `captura-documento` — hoja atómica → disección
- `conversion-documento-a-dato` — hoja atómica → disección
- `puerto-documento-digital` — hoja atómica → disección
- `resolucion-contrapartida` — hoja atómica → disección
- `deduplicacion-hecho` — hoja atómica → disección
- `cola-revision` — hoja atómica → disección
- `entrada-por-lotes` — REF (mismo desacople que el batch del molde) → **pasada-3**
- `catalogo-puertos-documento` — **[ABIERTO]** (qué fuentes/canales declara el negocio)

> Este punto NO se seca en una ronda: la admisión es continua y heterogénea → **pasa a
> `pasada-3-entrada-hechos-expandido.md`**.
