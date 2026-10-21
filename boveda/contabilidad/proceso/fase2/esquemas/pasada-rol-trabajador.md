# PASADA · ROL: `trabajador` (función interna: OPERA HOY · cara de control del proceso)

> El ROL es la **función INTERNA** que el sistema debe servir. El ROL trabajador es el que
> **opera HOY**: ve su producción/proceso, qué hay en cola, qué está pendiente, qué bloquea.
> **Agnosticismo:** cero tecnologías. **Cero supuestos:** lo no declarado va `[ABIERTO]`.
>
> ⚠️ **AVISO DE HONESTIDAD (ley: no forzar el rol).** En contabilidad el trabajador **NO es
> obvio**. En las demás verticales el trabajador es una persona (el que corta, el que cocina,
> el que imprime). Aquí **no está declarado quién ejecuta el trabajo contable diario** (F0 no
> nombra operador; al contrario, la promesa central es *"sin operador"* y *"sin una persona
> digitando"*). Por eso este fichero **NO inventa un trabajador-humano**: documenta las dos
> únicas lecturas que los hechos del F0 permiten, y eleva la ambigüedad al dueño como
> **PREGUNTA ABIERTA**. Es más honesto que fabricar un rol que no existe.

---

## Las dos lecturas declarables del trabajador (no se elige: se documenta la ambigüedad)

**Lectura A — el trabajador ES el propio sistema (la automatización).**
Soporte en F0: *"Automatizar todo el proceso… Sin operador"*; *"cuadra sin una persona
digitando"*; la vertical **no produce hechos**, reconstruye. Aquí el ROL trabajador es la
**función interna de ejecución del pipeline contable** (A→B→C): su "producción" es el
volumen procesado, su "cola" es la entrada de hechos, sus "pendientes" son las excepciones.
Esta lectura es la que el F0 sostiene como default. **Sin humano en la silla.**

**Lectura B — el trabajador es el asesor/gestor humano que revisa y resuelve.**
Soporte en F0: *"el asesor SE MANTIENE"*; `cola_revision` existe (`unidad`: *"no declarado
que pasa con un documento ilegible o un dato que no cuadra"*). Aquí el ROL trabajador es
**quien desatasca la cola**: revisa el documento dudoso, decide la contrapartida, resuelve
la excepción. Es el trabajo contable "de hoy".
**Pero**: `dueno-cola-revision (A8.3)` está **`[ABIERTO]`** — *"¿quién resuelve la cola:
asesor o dueño?"*. Como no está declarado, **no se puede dar por firme** que exista este
trabajador-humano. → **PREGUNTA ABIERTA 0** (la raíz).

> **Regla de esta pasada:** esquematizo el ROL trabajador de forma que **sirva a AMBAS
> lecturas**. Su cara y su lógica de proceso son las mismas; lo que cambia es **quién ocupa la
> silla** (el motor solo, o el asesor delante de la cola) — y eso lo decide el dueño, no yo.

---

## Prisma de los 5 huecos DESDE la silla del trabajador + LÓGICA que exige

### 1 · IDENTIDAD — ¿qué es la contabilidad para el ROL trabajador?
El **proceso que corre HOY**, no el resultado de mañana. No es "mis cuentas" (jefe) ni "lo que
entrego" (cliente): es **la cadena en marcha** con estados y colas: `entrada-hechos (A) →
asiento (B) → estados/cierre (C)`. Su idioma es **"qué ha entrado, qué está en cola, qué se
atascó, qué no cuadra, qué queda pendiente de procesar"**. Para el trabajador la contabilidad
es una **línea de producción de asientos** que hay que mantener fluyendo.

### 2 · RESTRICCIONES — ¿qué le limita al ROL trabajador?
- **FRENO**: cada hecho/documento entra **en serie** y el embudo se atasca. → **EMPUJÓN**:
  REF `lote-admision` (A9) — N hechos en paralelo.
- **FRENO**: un documento ilegible o un dato que no cuadra **bloquea** todo lo de detrás.
  → **EMPUJÓN**: REF `cola-revision` (A8) — el flujo **NO se bloquea**, lo dudoso se encola.
- **FRENO**: reprocesar **duplicaría** asientos (colapso/bucle). → **EMPUJÓN**: REF
  `deduplicacion-hecho` (A7) + REF `clave-natural` (M3).
- **FRENO**: no se sabe si la cadena avanza o se ha parado en silencio (una pantalla muda).
  → **EMPUJÓN**: **`panel-proceso-contable`** (latido del proceso: qué entra/hora, qué hay en
  cola, qué falla, qué se atasca — pieza NUEVA, no existe en el esquema).
- **FRENO**: el trabajador no tiene **memoria de lo que hizo/falló** en la pasada anterior.
  → **EMPUJÓN**: **`historial-proceso-contable`** (registro append-only de lo procesado y lo
  fallado — pieza NUEVA; el esquema tiene `traza-asiento` B4 para el asiento, pero **no** un
  historial de PROCESO de la entrada).
- **FRENO**: cuando algo se atasca, no hay camino de desatasco declarado. → **EMPUJÓN**:
  **`desatasco-entrada`** (resolver/reencolar/descartar una excepción con su rastro — pieza
  NUEVA; es la **acción** del trabajador, complementa la cola que sólo encola).
- **FRENO**: la calidad de la entrada decide todo (es el eslabón limitante A) y hoy nadie la
  mide. → **EMPUJÓN**: **`tasa-cobertura-entrada`** (qué % de hechos entra sin intervención vs
  cuántos caen a cola — es la **métrica que prueba la promesa "sin operador"**; NO existe hoy).

### 3 · CONTRATO — qué espera VER y ACTUAR el ROL trabajador
**CARA DE INTERFAZ (lo que alimenta las fases de interfaz):**
- **VER**: el **estado del pipeline** de contabilidad en vivo (qué está entrando, qué se ha
  procesado, qué está en cola, qué ha fallado); la **cola de revisión** con lo dudoso
  (documento ilegible, dato que no cuadra, hecho incompleto); los **pendientes** por antigüedad;
  los **fallos y reintentos**; la **tasa de cobertura** (cuánto entra solo).
- **ACTUAR**: **desatascar** una excepción (resolver la contrapartida, confirmar un importe,
  reencolar o descartar con motivo); **empujar** el lote para desacoplar el embudo; reintentar
  lo fallido; **enseñar la regla** (cuando resuelve una contrapartida, eso alimenta
  `regla-contrapartida` A6.2 — el bucle de aprendizaje declarado en el cuello).
- **Recibe**: hechos ya normalizados y documentos abiertos a dato (A2/A4).
- **Entrega**: asientos correctos a B y excepciones resueltas con su rastro.

**LÓGICA DE DOMINIO que el rol trabajador exige construir (lo que el interlocutor NO exige):**
el esquema actual tiene **las piezas del flujo** (A: puertas, cola, dedup, lote) pero **NO tiene
la cara de CONTROL del proceso** — quién vigila que la cadena anda, cómo desatasca y cómo mide
su propia cobertura. **Ese es el aporte del ROL trabajador**: un **plano de proceso** (no un
asiento más) que hace observable y operable la entrada. Emerge como módulo nuevo.

### 4 · NO-OBJETIVOS del ROL trabajador
- NO decide el futuro ni declara criterios → eso es el **jefe**.
- NO firma, no presenta impuestos, no avala los estados → eso es el **asesor** (la medida
  maestra es del asesor, no del trabajador).
- NO recibe informes como destinatario externo → eso es el **cliente**.
- NO es un asiento: no escribe en el libro (eso es `escritor-diario` B2, single-writer). El
  trabajador **controla el flujo hacia** el libro; no lo escribe directamente (M2).

### 5 · PREGUNTAS ABIERTAS del ROL trabajador (cero supuestos)
1. **[RAÍZ] ¿Existe un trabajador-humano o el trabajador es la automatización?** `dueno-cola-revision`
   (A8.3) está `[ABIERTO]`: *"¿quién resuelve la cola: asesor o dueño?"*. Hasta resolverlo, **no se
   da por firme** la lectura B. **Esta es la pregunta que decide si esta pasada describe un rol
   humano o un rol-motor.**
2. **¿Cuándo es "hoy"?** El ritmo del trabajo (al día / al cierre) = `momento_de_uso` (C7) +
   `cuando_reconstruye`, NO declarados. Sin ritmo, no se puede fijar la cara de "pendientes".
3. **¿Qué hace el trabajador con un hecho incompleto mientras espera?** `regla-hecho-incompleto`
   (A6.3) `[ABIERTO]` — ¿asienta provisional / espera / avisa? NO declarado.
4. **¿El desatasco es del trabajador o escala?** Cuando una excepción no se puede resolver sola,
   ¿la resuelve él o sube al asesor/jefe? NO declarado (liga A8.3 con L5).
5. **¿Quién atiende los avisos de cuadre que fallan?** `aviso-cuadre` (C6) avisa, pero **a quién**
   y **quién actúa** no está declarado.
6. **¿Hay turnos / concurrencia de trabajadores?** Si el trabajador es humano, ¿varios a la vez
   sobre la misma cola? NO declarado (y choca con M2 single-writer → **puerto de turno abierto**).

### FRENOS → EMPUJONES (consolidado del ROL trabajador)
| Freno | Empujón |
|---|---|
| Entrada en serie atasca el embudo | REF `lote-admision` (A9) |
| Un documento ilegible bloquea la cadena | REF `cola-revision` (A8) |
| Reprocesar duplicaría asientos | REF `deduplicacion-hecho` (A7) + `clave-natural` (M3) |
| No se sabe si la cadena avanza (muda) | **`panel-proceso-contable`** (latido) — NUEVA |
| Sin memoria de lo procesado/fallado | **`historial-proceso-contable`** (append-only) — NUEVA |
| Cuando se atasca, no hay camino de desatasco | **`desatasco-entrada`** (acción) — NUEVA |
| La promesa "sin operador" no se mide | **`tasa-cobertura-entrada`** (métrica) — NUEVA |
| Quién ocupa la silla no está declarado | **PREGUNTA ABIERTA 0** (no se estima) |

## PIEZAS que emergen SOLO desde el ROL trabajador → al árbol
- **`panel-proceso-contable`** — ATÓMICO (latido del pipeline contable: entra/procesa/cola/falla;
  el "display de cocina" de la contabilidad). LÓGICA NUEVA.
- **`historial-proceso-contable`** — ATÓMICO (registro append-only de lo procesado y lo fallado
  con su rastro; distinto de `traza-asiento` B4, que es del ASIENTO, no del PROCESO). LÓGICA NUEVA.
- **`desatasco-entrada`** — ATÓMICO (resolver/reencolar/descartar una excepción con motivo;
  la **acción** que completa `cola-revision` A8, que sólo encola). LÓGICA NUEVA.
- **`tasa-cobertura-entrada`** — ATÓMICO (proporción de hechos que entran sin intervención vs
  caen a cola — la métrica que prueba la medida maestra *"sin una persona digitando"*). LÓGICA NUEVA.
- **REF** (no se duplican): `lote-admision` (A9) · `cola-revision` (A8) · `deduplicacion-hecho`
  (A7) · `clave-natural` (M3) · `regla-contrapartida` (A6.2) · `traza-asiento` (B4) ·
  `escritor-diario` (B2).

> Punto **SECO** en la cara de interfaz y en la lógica de proceso. **Pendiente de decisión
> humana** (no de prisma): PREGUNTA ABIERTA 0 — si el trabajador es humano. Hasta entonces, la
> cara y la lógica valen para AMBAS lecturas; **no se fuerza ninguna.**
