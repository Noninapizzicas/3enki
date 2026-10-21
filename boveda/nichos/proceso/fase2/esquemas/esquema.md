# ESQUEMA MAESTRO — Sistema "Nichos Autónomos"

> **Fase:** 2 · esquematizar-negocio · **Proyecto:** nichos · **Entregable gate:** este árbol.
> **Sujeto (de F0):** herramienta autónoma que detecta el nicho → valida la solución →
> monta el modelo de negocio → opera hasta cobrar, generando ingresos al dueño.
> **Medida maestra:** salud financiera por proyecto (cuántos generan, cuáles sangran, flujo real a caja).
> Sin tecnologías: puertos abiertos, agnosticismo.

---

## 0 · El flujo declarado y el ESLABÓN LIMITANTE

**Flujo (F0):** semilla (dueño, canal) → F1 **buscador** (demanda-primero, limitable,
reglas aprendidas) → F2 **validación** (estudio de mercado) → F3 **construcción**
(puente humano si Enki no sabe) → F4 **operación y cobro** (competencia + reunión
con admin) → F5 **autonomía** (opera solo, supervisa el dueño).

**ESLABÓN LIMITANTE = F2 · VALIDACIÓN.** El buscador es abundante y barato; la
construcción+operación son caras. La validación es el embudo que decide QUÉ nichos
entran al tramo caro, y su criterio (demanda de 1er orden + disposición a pagar +
umbral 50-300 €/semana) está **NO declarado** y atado a "experiencia" no codificada.
Su calidad gobierna directamente la medida maestra: cuántos proyectos generan vs
cuántos sangran, y el flujo real a caja. Sin dato declarado, el validador no puede
cortar ni dejar pasar con criterio → la cadena no puede llegar a caja con control.

### El cuello expandido al máximo (frenos → empujones)
| Freno del cuello | Empujón (pieza que lo abre) |
|---|---|
| Umbral depende de experiencia no codificada | **criterio-viabilidad** (CUSTODIO) declarable por el dueño + refinado por **reglas-aprendidas** |
| "Quién demuestra la demanda" sin autoridad | puerto de **proveedores de datos** (pasada proveedor): cada fuente declarada y reemplazable; si no existe, se crea |
| Validar exige juicio | **veredicto-viabilidad** (MICRO-AGENTE) hidratado por **estudio-demanda** (reflejos) |
| Estudio de mercado manual = lento | **estudio-demanda** AUTOMATIZADO en el embudo |
| Validar en serie atasca el cuello | **batch-validacion** + **cola-candidatos-validacion** (desacople: N nichos en paralelo) |
| Sangrar en construcción inútil | **corte-temprano** → "no viable" no pasa a F3, protege el **cuadro-salud-financiera** |

**Los empujones del cuello son las piezas C6–C10** (abajo), el corazón del esquema.

---

## 1 · ÁRBOL DEL SISTEMA — piezas del prisma global (A–G)

- **A · SEMILLA-BUSCADOR** (arranque)
  - A1 captura-semilla — REFLEJO puro (acepta/formatea → `buscar(seed)`)
  - A2 normalizacion-semilla — MICRO-AGENTE (desambigua la palabra a intenciones)
- **B · BUSCADOR (F1)** — demanda-primero
  - B1 sondeo-territorio — MICRO-AGENTE (+reflejos de barrido)
  - B2 reglas-exclusion-aprendidas — MICRO-AGENTE (afina con historial)
  - B3 perfil-limite-busqueda — CUSTODIO (límites declarables del dueño)
- **C · VALIDADOR (F2 — ESLABÓN LIMITANTE)**
  - C1 estudio-demanda — MICRO-AGENTE (+reflejos: demanda 1er orden + disposición a pagar)
  - C2 criterio-viabilidad — CUSTODIO (umbral declarable, base 50-300 €/semana)
  - C3 veredicto-viabilidad — MICRO-AGENTE (viable|no-viable|puente)
  - C4 camino-encontrar-construir — MICRO-AGENTE (decisión por oportunidad)
  - C5 batch-validacion — REFLEJO (desacople del cuello, N en paralelo)
  - C6 corte-temprano-sangria — REFLEJO (no-viable no pasa a F3)
  - C7 reglas-aprendidas (validación) — MICRO-AGENTE (umbral se refina con resultados reales)
- **D · CONSTRUCTOR (F3)**
  - D1 ensamblador-solucion — MICRO-AGENTE (+reflejos)
  - D2 puente-humano — PUENTE (excepción: bloqueo sin alternativa → admin por EVENTO)
  - D3 catalogo-capacidades-faltantes — CUSTODIO (se crea lo que falta — invariante)
  - D4 proponedor-modelo-cobro — MICRO-AGENTE (modelo de negocio por nicho)
- **E · OPERADOR-COBRO (F4)**
  - E1 estudio-competencia — MICRO-AGENTE (+reflejos) — antes del gate
  - E2 gate-decision-operar — PUENTE (paquete al dueño por EVENTO → aprueba/rechaza)
  - E3 motor-cobro — REFLEJO puro (ejecuta/registra cobro, plataformas declaradas)
  - E4 canal-distribucion — PUENTE (lleva la solución al pagador del nicho)
- **F · MONITOR SALUD FINANCIERA (medida maestra)**
  - F1 registro-cobros — CUSTODIO (cobro efectivo vs comprometido, append-only)
  - F2 imputacion-costes-proyecto — REFLEJO (lo que cuesta cada proyecto)
  - F3 cuadro-salud-financiera — CUSTODIO (genera|sangra|neutro + flujo a caja por proyecto)
  - F4 alerta-sangria — PUENTE (techo de pérdida → canal, caso a decidir)
- **G · CANAL SUPERVISIÓN** (Telegram/u otro)
  - G1 puerto-canal — PUENTE (agnóstico, varios canales intercambiables)
  - G2 escalones-mensaje — REFLEJO (pulso|alerta|decisión y cadencia)
  - G3 clasificador-intencion — MICRO-AGENTE (semilla vs decisión vs consulta)

## 2 · ÁRBOL — piezas SOLO desde INTERLOCUTORES (H–J)

- **H · DUEÑO** (operador, sujeta el sistema, percibe todo lo generado)
  - H1 paquete-decision-autocxplicado — MICRO-AGENTE (nicho+evidencia+riesgo+alternativa)
  - H2 perfil-supervision — CUSTODIO (cadencia/límites declarables; canal + monitor lo consumen)
- **I · CLIENTE** (pagador del nicho — empresa o suscripción)
  - I1 perfil-cobro-entrega-por-nicho — CUSTODIO (contrato de pago/entrega por pagador)
  - I2 propuesta-valor-canal — MICRO-AGENTE (cómo gana confianza/compra en el territorio)
  - I3 confirmacion-valor-recibido — CUSTODIO (+reflejo de ingesta; feedback post-compra)
- **J · PROVEEDOR** (fuentes de datos + plataformas de cobro/distribución)
  - J1 puerto-fuente-datos — PUENTE (reemplazable por EVENTO, no vendor-acoplado)
  - J2 conversor-fuente — CONVERSOR (frontera de formatos → datos homogéneos)
  - J3 gestion-limites-fuente — REFLEJO (cola/rate, no quemar recursos)
  - J4 imputacion-coste-fuente — REFLEJO (coste por fuente → por proyecto)
  - (El costo de las fuentes alimenta F2/imputacion-costes-proyecto → salud financiera)

## 3 · ÁRBOL — piezas SOLO desde ROLES (K–L)

- **K · ROL JEFE** (visión del portafolio, decide futuro)
  - K1 vista-agregada-portafolio — REFLEJO+CUSTODIO (dashboard que cruza la salud de todos los módulos)
  - K2 cola-decisiones-gate — CUSTODIO (una sola cola de gates por resolver)
  - K3 ajustador-umbrales — CUSTODIO (+reflejo; el jefe retunea criterio en caliente)
- **L · ROL TRABAJADOR** (opera el proceso HOY)
  - L1 pipeline-por-nicho — CUSTODIO (máquina de estados semilla→caja por proyecto)
  - L2 cola-candidatos-validacion — CUSTODIO (buffer del cuello de botella)
  - L3 manejo-fallo-reintento — REFLEJO+PUENTE (reintento mecánico; sin alternativa → puente)
  - L4 historial-por-nicho — CUSTODIO (registro append-only de estados/decisiones)
  - L5 pulso-avance-etapa — REFLEJO (progreso por etapa → escalones al supervisor)
- **M · ROL CLIENTE** (cara interna de cobro/entrega)
  - M1 perfil-cobro-entrega-por-nicho (refuerza I1)
  - M2 propuesta-valor-canal (refuerza I2)
  - M3 confirmacion-valor-recibido (refuerza I3)

---

## 4 · RELACIONES clave (cómo fluye la cadena)
1. **A** (semilla) → **B** (candidatos) → **C** (veredicto/embudo) → **D** (solución+modelo) → **E** (operar+cobrar) → **F** (salud financiera).
2. **C4** (encontrar|construir) decide el carácter que **D1** materializa; si **C3**=no-viable → **C6** corta, no avanza a D.
3. **D2** y **E2** son los únicos tapones humanos: por EVENTO (paquete-cerrado), no por reunión síncrona → **G** los entrega al dueño (H1+H2).
4. **F** alimenta **K1** (jefe) y **F4** alerta al canal (G); **F** también retroalimenta **C7** (reglas de validación aprendidas con resultados reales) — el bucle que afina el cuello.
5. **J2** (conversor) es la única frontera de formatos entre fuentes externas y datos internos.
6. **L1** (pipeline) orquesta y mantiene **L4** (historial) de cada proyecto; **L2** da cola al **C5** (batch).

---

## 5 · ESLABÓN LIMITANTE — decisión y qué lo gobierna
El cuello es **C (validación)**. Se expande con: **criterio-viabilidad declarable**,
**estudio-demanda automatizado**, **veredicto asistido por micro-agente**, **batch en
paralelo** con su cola, y **corte temprano** que protege la salud financiera. El bucle
**resultados reales → C7 → C2** convierte la experiencia estática del F0 en un criterio
auto-aprendido: cada proyecto que cobra o sangra recalibra el umbral. La cadena queda
tan fuerte como lo que mida este embudo — por eso es el corazón, no una sección.

---

## 6 · PUERTOS ABIERTOS (agnosticismo — cero tecnologías)
- **Canal de supervisión** (G1): puerto declarable — Telegram es una implementación, no el portador.
- **Fuentes de datos** (J1): las autorizadas por el dueño (buscador, APIs, scraping, comunidades);
  reemplazables por evento; si falta una, se crea (invariante).
- **Plataformas de cobro/distribución** (E3, E4, I1): por nicho, declaradas en el constructor.
- **Procesamiento**: cero tecnologías nombradas — cada pieza expone su puerto (entrada/salida),
  no su stack.
- **Notas**: `nodo-decision-nichos` del F0 = C4 (encontrar|construir). `puente humano` = D2.

---

## 7 · PREGUNTAS ABIERTAS AL DUEÑO (cero supuestos — el guion de la siguiente conversación)
1. **Validación (eslabón):** ¿cuál es el mínimo exigible de demanda de 1er orden y la
   disposición a pagar concreta para declarar un nicho "viable"? ¿Alcanza el umbral
   50-300 €/semana del F1 para todo o varía por tipo de nicho?
2. **Fuentes de validación:** ¿qué fuentes exactas autorizan "demanda de 1er orden"
   (buscador, APIs, scraping, comunidades)?
3. **Salud financiera:** ¿qué KPI define "genera" vs "sangra" y con qué techo de
   pérdida se mata/corta un proyecto? ¿Cómo se imputa el coste por proyecto
   (construcción + operación + fuentes)?
4. **Supervisión:** ¿qué cadencia de pulso acepta (diario/semanal)? ¿Qué casos exigen
   SÍ o SÍ su respuesta (gate de operar, corte de sangría, puente-humano)? ¿"Otro canal
   elegido" = cuáles?
5. **Cobro/operación:** ¿qué plataformas de cobro y distribución se declaran de
   partida? ¿Qué define "operar hasta cobrar" como terminado (primer cobro, flujo N semanas)?
6. **Autonomía vs control:** ¿acepta que el sistema decida solo el camino **construir**
   (riesgo alto), o toda decisión de construir exige su visto bueno previo?
7. **Puente humano (D2):** ¿qué constituye "Enki no sabe" (umbral de duda)? ¿El admin
   que valora el puente es el propio dueño?
8. **Batch:** ¿cuántos nichos en paralelo valida la primera corrida?
9. **Cliente post-compra (I3):** ¿se recoge satisfacción/valor recibido del pagador o
   el sistema solo cobra?

> Estas preguntas son el guion de la conversación siguiente. Hasta que se respondan,
> los valores quedan abiertos — nada se estima.

## 8 · DISECCIÓN — recuento de FORMAS (detalle en pasada-diseccion.md)
- **REFLEJO puro:** A1, C5, C6, E3, F2, G2, J3, J4, L5, + reflejos hidratadores (B1, C1, D1, E1, I3).
- **MICRO-AGENTE fuzzy (el corte maestro del juicio):** A2, B1, B2, C1, C3, C4, C7, D1, D4, E1, G3, H1, I2.
- **CUSTODIO (un escritor por store):** B3, C2, D3, F1, F3, H2, I1, I3, K1, K2, K3, L1, L2, L4 (+ M1·M2·M3 refuerzan).
- **CONVERSOR:** J2.
- **PUENTE (evento):** D2, E2, E4, F4, G1, J1, L3(lado evento).
- **Total de hojas atómicas con forma: 42** — ninguna sin forma.

---

## 9 · Estado de la fase
Prisma global seco (1 ronda global + 7 pasadas-2 por punto) + 3 interlocutores + 3 roles
+ disección de 42 hojas atómicas. Siguiente encadenamiento: FASE 3 · PLASMA
(planificar-construccion → diseno-oop.md). Fase lista para `completar_fase { fase:'esquematizado' }`
tras responder/investigar el guion de preguntas abiertas.
