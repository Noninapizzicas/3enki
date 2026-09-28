# PASADA · INTERLOCUTOR: `dueño del negocio`

> Actor externo-relacional del mapa **cerrado en F0** (`resumen.interlocutores[0]`).
> `rol`: **dueño del negocio** · `canal`: **consulta** · `relación`: **consulta sus cuentas, decide**.
> **Frontera con el ROL jefe** (`pasada-rol-jefe.md`): el ROL jefe es la función **interna** de
> *agregar y declarar criterios*; este interlocutor es el actor **relacional** que *mira y decide*.
> Aquí emerge sólo lo que falta para **poder mirar** — NO se duplica la lógica de agregación ni la
> declarativa (se citan como **REF**). El árbol vive en `esquema.md`.
> **Agnosticismo:** cero tecnologías — sólo puertos y piezas. **Cero supuestos:** lo no declarado va `[ABIERTO]`.

---

## Prisma de los 5 huecos DESDE la silla del dueño

### 1 · IDENTIDAD — ¿qué es la contabilidad PARA el dueño?
Su **espejo económico**. No un deber legal (eso es el asesor y la administración) ni un cuadro con
presupuesto y desviaciones (eso es el ROL jefe): para el dueño la contabilidad es la respuesta a
*"¿cómo voy?"* — cuánto hay, cuánto se debe, cuánto queda — consultada **cuando él quiere**, para
**decidir** (reinvertir, ajustar, cortar, ampliar). F0 lo declara literal: *"consulta sus cuentas,
decide"*. Su idioma no es el asiento: es **caja, deuda, resultado, "¿puedo pagar X?"**.

### 2 · RESTRICCIONES — ¿qué le limita AL DUEÑO en esta relación?
- **FRENO**: no habla el idioma contable (asiento, debe/haber, cuenta 430). Si le llega un diario, no
  decide. → **EMPUJÓN**: **`puente-lenguaje-dueño`** (traduce en los dos sentidos: su pregunta →
  consulta contable; cálculo → cifra en su idioma). REF `informe-rico` (K3) y REF `vista-revisable` (L2)
  para que la cifra llegue con contexto y con su origen.
- **FRENO**: consulta **cuando le apetece**, no con cadencia fija — si al mirar no hay nada al día,
  desiste. → **EMPUJÓN**: **`consulta-cuentas-bajo-demanda`** (puerta *pull*: el dueño pregunta y el
  sistema contesta; no le impone ritmo). Distinta del cuadro del ROL jefe, que sí impone cadencia y
  agregación.
- **FRENO**: no puede decidir sobre un dato **incompleto** creyendo que es el total (mirar una caja con
  la mitad de los hechos procesados es peor que no mirar). → **EMPUJÓN**: **`sello-cobertura`** (marca
  de completitud de lo consultado: si falta cobertura, lo dice ANTES de que decida). REF `aviso-cuadre`
  (C6) · REF `cola-revision` (A8) · REF `lote-admision` (A9).
- **FRENO**: no distingue un **borrador vivo** de algo ya **validado/firmado** por el asesor → podría
  decidir sobre lo provisional como si fuera definitivo. → **EMPUJÓN**: **`marca-borrador-validado`**
  (sello de en qué punto está lo que ve: en curso / revisado / firmado). REF `flujo-firma` (L3).
- **FRENO**: exige proactividad (F0 requisito 4) pero **no quiere una pantalla muda** ni sorpresas de
  dinero. → **EMPUJÓN**: REF `motor-avisos` (K2) + `catalogo-avisos` (K6, `[ABIERTO]`) — el dueño los
  recibe, no los va a buscar.
- **FRENO**: no quiere que la contabilidad sea **adorno** (F0 `no_quiere_que_sea[0]`). → **EMPUJÓN**:
  cada consulta que abre termina en una **cifra accionable** (pagar / reclamar / cortar / invertir),
  entregada como información rica — REF `informe-rico` (K3).

### 3 · CONTRATO — qué intercambia con la contabilidad
- **DA**: su **pregunta** (cuando quiere) y sus **decisiones** (qué hace con lo que ve).
- **RECIBE**: la **cifra en su idioma**, con contexto, origen y **sello de confianza** (cobertura +
  estado); los **avisos** que no pidió; y el **acceso al detalle** cuando quiere bajar
  (REF `vista-revisable` L2 · REF `mayor-balanza` B3).
- **NO intercambia**: firma, presentación fiscal ni la declaración de criterios (eso es asesor / ROL
  jefe → REF `cola-declaraciones-criterio` del ROL jefe).

### 4 · NO-OBJETIVOS — qué NO quiere el dueño
- NO quiere el diario de asientos ni la balanza como instrumento de trabajo (no baja al asiento).
- NO quiere **firmar** ni **presentar** ni cargar con la responsabilidad fiscal (esa es del asesor).
- NO quiere una **herramienta de adorno** ni una **versión mínima/descafeinada** (F0 `no_quiere_que_sea`).
- NO quiere sorpresas de dinero: ni un resultado que se descuadre sin que nadie le avise.
- NO quiere ser él quien declara/ratifica criterios contables si esa carga no es suya — `[ABIERTO]`
  (puede recaer en el ROL jefe o en el asesor).

### 5 · PREGUNTAS ABIERTAS (cero supuestos — no se estima)
1. **`momento_de_uso`** (C7) — ¿con qué ritmo consulta (día / mes / cierre)? NO declarado.
2. **`catalogo_avisos`** (K6) — ¿qué avisos quiere, por qué canal y con qué umbral? NO declarado.
3. **Canal de consulta** — el canal se declara (`consulta`) pero **no su forma**: ¿desde dónde consulta? `[ABIERTO]`.
4. **Profundidad** — ¿hasta dónde quiere bajar cuando algo no le cuadra? NO declarado.
5. **Umbrales de decisión** — ¿qué cifra le hace decidir (caja mínima, deuda máxima)? NO declarado.
6. **Quién declara los criterios** — `[ABIERTO]` compartido con el ROL jefe (`vista_agregada` I6).

---

## FRENOS → EMPUJONES (consolidado del dueño)
| Freno | Empujón |
|---|---|
| No habla el idioma contable | `puente-lenguaje-dueño` (REF informe-rico K3 · vista-revisable L2) |
| Consulta cuando quiere (sin cadencia) | `consulta-cuentas-bajo-demanda` (puerta *pull*) |
| Puede decidir sobre un dato incompleto | `sello-cobertura` (REF aviso-cuadre C6 · cola-revision A8 · lote-admision A9) |
| No distingue borrador de validado | `marca-borrador-validado` (REF flujo-firma L3) |
| Quiere aviso, no pantalla muda | REF `motor-avisos` K2 (+ `catalogo-avisos` K6 `[ABIERTO]`) |
| Que no sea adorno | la cifra llega accionable y con contexto (REF `informe-rico` K3) |

## PIEZAS que emergen SOLO desde el dueño → al árbol
- **`consulta-cuentas-bajo-demanda`** — ATÓMICO (puerta *pull* de consulta; sin cadencia impuesta). **LÓGICA NUEVA** (invisible desde el árbol global, que sólo tiene el cuadro del jefe con cadencia y agregación).
- **`puente-lenguaje-dueño`** — ATÓMICO (traductor bidireccional pregunta↔cifra contable). **LÓGICA NUEVA.**
- **`sello-cobertura`** — ATÓMICO (marca de completitud del dato consultado, fuera de ciclo). **LÓGICA NUEVA** (el árbol sólo tiene `aviso-cuadre` C6 *al cierre*, no en toda consulta *pull*).
- **`marca-borrador-validado`** — ATÓMICO (estado del dato: en curso / revisado / firmado). **LÓGICA NUEVA.**
- **REF** (no se duplican): `informe-rico` K3 · `vista-revisable` L2 · `motor-avisos` K2 · `catalogo-avisos` K6 · `aviso-cuadre` C6 · `cola-revision` A8 · `lote-admision` A9 · `flujo-firma` L3 · `mayor-balanza` B3 · `momento_de_uso` C7 · `vista_agregada` I6.

> Punto **SECO** salvo los `[ABIERTO]`, que los cierra el dueño (no se estiman).
