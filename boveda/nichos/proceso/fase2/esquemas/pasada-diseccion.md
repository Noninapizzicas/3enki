# PASADA · DISECCIÓN — FORMA de cada hoja atómica (una a una)

> CINCO formas: **REFLEJO puro** (calcular, cero juicio — test lo afirma) ·
> **MICRO-AGENTE fuzzy** (juicio/lenguaje/ambigüedad — el reflejo hidrata, el agente
> transforma) · **CUSTODIO** (un solo dueño por store) · **CONVERSOR** (frontera de
> formatos/dimensiones) · **PUENTE** (conecta con lo vecino por EVENTO).
> Cada hoja atómica del prisma global + por interlocutor + por rol, sin saltar ninguna.

---

## A. ARRANQUE (semilla-buscador)
1. **captura-semilla** → REFLEJO puro. Acepta/formatea el mensaje entrante, valida
   vacíos, emite `buscar(seed)`. Cero juicio. Test lo afirma.
2. **normalizacion-semilla** → REFLEJO + MICRO-AGENTE. La desambiguación de una
   palabra en intenciones de búsqueda es lenguaje/ambigüedad → micro-agente; la
   normalización estructural es reflejo. FORMA: micro-agente fuzzy (hidratada por reflejo).

## B. BUSCADOR (F1)
3. **sondeo-territorio** → MICRO-AGENTE + REFLEJO. Explora fuentes por demanda:
   el agente juzga qué territorio merece seguir (juicio); el barrido/parseo de
   fuentes es reflejo. FORMA: micro-agente (con reflejos hidratadores).
4. **reglas-exclusion-aprendidas** → MICRO-AGENTE. Aprende de corridas previas qué
   territorios son falsos positivos. Juicio + ajuste → micro-agente.
5. **perfil-limite-busqueda** → CUSTODIO. Store de límites declarables del dueño
   (un solo escritor: el dueño por el canal). Un dueño por store.

## C. VALIDADOR (F2 — ESLABÓN LIMITANTE)
6. **estudio-demanda** → MICRO-AGENTE + REFLEJO. Mide demanda de 1er orden y
   disposición a pagar con fuentes declaradas (reflejos miden los números declarados);
   el agente redacta/interpola la conclusión de mercado. FORMA: micro-agente (con reflejos).
7. **criterio-viabilidad** → CUSTODIO. Store de la regla umbral (50-300 €/semana
   base, refinable) — el dueño es el único escritor vía umbral-declarable. Un dueño.
8. **veredicto-viabilidad** → MICRO-AGENTE. Emite viable/no-viable/puente con el
   dato hidratado; el corte es juicio asistido → micro-agente. (El corte DURO de
   "no viable → no pasa" es el criterio custodio, no el agente.)
9. **camino-encontrar-construir** → MICRO-AGENTE. Decide por oportunidad si hay
   camino rápido a caja o se crea; riesgo declarado → juicio → micro-agente.
10. **batch-validacion** → REFLEJO + CUSTODIO. Buffer/cola de candidatos en
    paralelo (desacople del cuello). La programación de cuántos en paralelo y el
    buffer es reflejo + custodio (cola-candidatos-validacion es el store).

## D. CONSTRUCTOR (F3)
11. **puente-humano** → PUENTE. Conecta con lo vecino (admin/operador) por EVENTO
    cuando hay bloqueo sin alternativa; excepción, no flujo normal. FORMA: puente.
12. **ensamblador-solucion** → MICRO-AGENTE + REFLEJO. Materializa la solución
    operable: el agente decide qué construir (juicio); la ejecución mecánica es reflejo.
13. **catalogo-capacidades-faltantes** → CUSTODIO. Catálogo de lo que falta y por
    crear (invariante) — un solo dueño escribe. FORMA: custodio.
14. **proponedor-modelo-cobro** → MICRO-AGENTE. Propone el modelo de negocio de
    cobro por tipo de nicho (juicio) → confirmado por el dueño en el gate. FORMA: micro-agente.

## E. OPERADOR-COBRO (F4)
15. **estudio-competencia** → MICRO-AGENTE + REFLEJO. Quién sirve el nicho y qué
    ofrecemos distinto: análisis de fuentes (reflejo) + conclusión competitiva (juicio).
    FORMA: micro-agente.
16. **gate-decision-operar** → PUENTE. Paquete cerrado (competencia+modelo+proyección)
    al dueño por EVENTO → aprueba/rechaza; no es reunión síncrona. FORMA: puente.
17. **motor-cobro** → REFLEJO puro. Ejecuta/registra el cobro vía plataformas
    declaradas; distinguir cobro efectivo de promesa es cálculo. FORMA: reflejo.
18. **canal-distribucion** → PUENTE. Lleva la solución al pagador del nicho por su
    canal; conecta con lo vecino (cliente) por evento. FORMA: puente.

## F. MONITOR SALUD FINANCIERA (medida maestra)
19. **registro-cobros** → CUSTODIO + REFLEJO. Store append-only de cobros efectivos
    vs comprometidos; un solo dueño escribe. FORMA: custodio.
20. **imputacion-costes-proyecto** → REFLEJO. Asigna cuánto cuesta cada proyecto
    (construcción+operación+fuentes). Cálculo agregado → reflejo.
21. **cuadro-salud-financiera** → REFLEJO + CUSTODIO. Agrega por proyecto (genera|
    sangra|neutro, flujo a caja). La agregación neta es reflejo; es lecto-escritor de
    su store de estados → custodio del cuadro.
22. **alerta-sangria** → PUENTE. Notifica al canal cuando cruza el techo de pérdida
    → caso a decidir. FORMA: puente.

## G. CANAL SUPERVISIÓN
23. **puerto-canal** → PUENTE. Canal agnóstico (Telegram + otros), conecta por evento,
    intercambiable. FORMA: puente.
24. **escalones-mensaje** → REFLEJO. Clasifica pulso/alerta/decisión y su cadencia.
    Rótalos → reflejo (si la clasificación es regla dura) o micro-agente si hay
    ambigüedad → aquí regla declarada → REFLEJO.
25. **clasificador-intencion** → MICRO-AGENTE. Distingue semilla vs decisión vs
    consulta en el mensaje entrante → lenguaje → micro-agente.

## H. DEL INTERLOCUTOR DUEÑO
26. **paquete-decision-autocxplicado** → MICRO-AGENTE. Construye el paquete claro
    (nicho+evidencia+riesgo+alternativa) para el dueño decidir. Redacción + síntesis
    → micro-agente que hidrata los reflejos.
27. **perfil-supervision** → CUSTODIO. Cadencia/límites declarados del dueño — un
    solo escritor (el dueño). FORMA: custodio.

## I. DEL INTERLOCUTOR CLIENTE / ROL CLIENTE
28. **perfil-cobro-entrega-por-nicho** → CUSTODIO. Contrato de pago/entrega por
    pagador del nicho; declarado en el constructor; un solo dueño por store. FORMA: custodio.
29. **propuesta-valor-canal** → MICRO-AGENTE. Cómo ganar confianza/compra en el
    territorio (juicio de copy/posicionamiento). FORMA: micro-agente.
30. **confirmacion-valor-recibido** → REFLEJO + CUSTODIO. Feedback del pagador; la
    ingesta es reflejo, el store de feedback es custodio. FORMA: custodio (con reflejo).

## J. DEL INTERLOCUTOR PROVEEDOR
31. **puerto-fuente-datos** → PUENTE. Fuente reemplazable por EVENTO, no acoplada a
    un vendor. FORMA: puente.
32. **conversor-fuente** → CONVERSOR. Única frontera donde cruzan formatos/datos del
    proveedor a datos internos homogéneos. FORMA: conversor.
33. **gestion-limites-fuente** → REFLEJO. Cola/rate de consumo para no quemar un
    recurso. Cálculo declarado → reflejo.
34. **imputacion-coste-fuente** → REFLEJO. Coste por fuente → por proyecto.
    Cálculo → reflejo (agregado a imputacion-costes-proyecto).

## K. DEL ROL JEFE
35. **vista-agregada-portafolio** → REFLEJO + CUSTODIO. Agrega la salud de todos los
    proyectos → dashboard del jefe. La agregación es reflejo; su store de vistas es custodio.
36. **cola-decisiones-gate** → CUSTODIO. Una sola cola donde el jefe resuelve gates
    ordenados; un escritor. FORMA: custodio.
37. **ajustador-umbrales** → REFLEJO + CUSTODIO. El jefe retunea criterio en
    caliente; el store de umbrales es custodio, la aplicación es reflejo. FORMA: custodia.

## L. DEL ROL TRABAJADOR
38. **pipeline-por-nicho** → CUSTODIO. Máquina de estados de la cadena semilla→caja
    por proyecto; un solo dueño del estado de cada proyecto. FORMA: custodio.
39. **cola-candidatos-validacion** → CUSTODIO. Buffer del cuello de botella; un
    escritor (el validador). FORMA: custodio.
40. **manejo-fallo-reintento** → REFLEJO + PUENTE. Reintento/alternativa mecánico es
    reflejo; cuando no hay alternativa → puente-humano por EVENTO. FORMA: reflejo + puente.
41. **historial-por-nicho** → CUSTODIO. Registro append-only de estados/decisiones;
    un solo dueño (el pipeline). FORMA: custodio.
42. **pulso-avance-etapa** → REFLEJO. Progreso por etapa → escalones al supervisor.
    Cálculo de progreso → reflejo (consume canal-supervision).

---

## CORTE MAESTRO del vocabulario (resumen)
- **REFLEJO puro (cálculo):** captura-semilla, perfil-limite-busqueda(? cust.), registro-cobros,
  imputacion-costes-proyecto, escalones-mensaje, gestion-limites-fuente, imputacion-coste-fuente,
  pulso-avance-etapa, motor-cobro. (Los que son puro calcular/test)
- **MICRO-AGENTE fuzzy (juicio):** normalizacion-semilla, sondeo-territorio, reglas-exclusion-aprendidas,
  estudio-demanda, veredicto-viabilidad, camino-encontrar-construir, ensamblador-solucion,
  proponedor-modelo-cobro, estudio-competencia, clasificador-intencion, paquete-decision-autocxplicado,
  propuesta-valor-canal. **← el corte maestro pasa por aquí** (donde hay juicio hay agente).
- **CUSTODIO (un escritor):** perfil-limite-busqueda, criterio-viabilidad, catalogo-capacidades-faltantes,
  registro-cobros, cuadro-salud-financiera, perfil-supervision, perfil-cobro-entrega-por-nicho,
  confirmacion-valor-recibido, vista-agregada-portafolio, cola-decisiones-gate, ajustador-umbrales,
  pipeline-por-nicho, cola-candidatos-validacion, historial-por-nicho.
- **CONVERSOR (frontera de formatos):** conversor-fuente.
- **PUENTE (evento):** puente-humano, gate-decision-operar, canal-distribucion, alerta-sangria,
  puerto-canal, puerto-fuente-datos, manejo-fallo-reintento (lado evento).

> Ninguna hoja atómica quedó sin forma.
