# 🗺️ ESQUEMA DEL MOTOR DE AGENTES (árbol maestro)

> Esquematizado con la skill `esquematizador` (prisma recursivo + disección).
> Sujeto: el motor que ejecuta los agentes de Enki. Todo embebido — este archivo
> es el mapa entero, no un índice. Pasadas: pasada-1-identidad.md (ronda 1) ·
> pasada-2-piezas.md (ronda 2) · pasada-3-diseccion.md (6 preguntas).

## El sujeto en una frase
El sistema que convierte el trabajo DECLARADO de Enki en entregables EXISTENTES y
verificados — cada agente es un pipeline casi todo determinista con un punto
fuzzy acotado; el éxito se gana contra el mundo real, no se declara.

## El corte maestro
Separar lo que un test puede afirmar (→ REFLEJO, determinista) de lo que necesita
juicio (→ UN punto fuzzy acotado por pipeline). Todo lo demás se ordena detrás.

## Las 10 piezas (árbol completo, con forma)

```
MOTOR DE AGENTES
├─ P1 · EJECUTOR DE PIPELINES ......... REFLEJO    recorre los pasos; uno a uno;
│                                                  reflejo → ejecuta · fuzzy → abre P5
├─ P2 · REGISTRO DE PIPELINES .......... CUSTODIO   la definición de cada agente:
│                                                  pasos, validaciones, entregable+reglas, presupuesto
├─ P3 · VALIDADOR DE SALIDAS FUZZY .... REFLEJO    checkpoint tras CADA paso fuzzy
│                                                  (estructura/tamaño/campos) → corregir o seguir
├─ P4 · VERIFICADOR DE ENTREGABLE ...... REFLEJO    el JEFE: reglas contra el MUNDO REAL
│   (el JEFE)                                       al final; verificado:false = veredicto, jamás éxito
│                                                  reglas: existe · contenido_min · api_real ·
│                                                  requires_resueltos · plan_acoplable ·
│                                                  en_repo · interfaz_decidida · interfaz_operativa
├─ P5 · PUERTO DE GENERACIÓN .......... MICRO-AGENTE el ÚNICO fuzzy: genera contenido
│                                                  (instrucción + contexto → salida cruda);
│                                                  NUNCA persiste, NUNCA ejecuta, NUNCA decide
├─ P6 · BITÁCORA ...................... CUSTODIO    cada paso de cada ejecución queda ESCRITO
├─ P7 · RAIL DE ESTADOS ................ CUSTODIO   checkpoints entre fases; avanzar() solo
│                                                  tras el veredicto del entregable
├─ P8 · VITRINA ........................ PUENTE      proyecta progreso/pasos/veredicto — no escribe
├─ P9 · REANUDADOR ..................... REFLEJO     retoma pausadas/fallidas desde la bitácora
│   +CUSTODIO                                       con el veredicto anterior como corrección
└─ P10 · CONVERSOR DE SALIDA ........... CONVERSOR   UNA frontera: salida cruda → canónica
```

## El flujo de una ejecución (cómo se mueve el motor)

```
declarar(pipeline)            → P2 registro (el qué)
ejecutar(proyecto, pipeline)  → P1 ejecutor
  │
  ├─ paso REFLEJO  → P1 ejecuta el determinista → P6 registra → P8 proyecta
  │                  (leer_plan deja la hoja del plano en el contexto del
  │                   siguiente fuzzy: el reflejo LEE, el fuzzy PIENSA)
  ├─ paso FUZZY    → P5 genera (instrucción+contexto)
  │                  → P10 convierte (crudo → canónico)
  │                  → P3 valida → ¿corregir? → reintento QUIRÚRGICO de P5 (máx. presupuesto)
  │                  → ok → P6 registra → siguiente paso
  │
  └─ fin → P4 JEFE verifica el entregable contra el mundo real
         → verificado  → P7 avanzar(estado) → P6 sella → P8 proyecta (✅ veredicto)
         → NO verificado y quedan reintentos → P9 reanuda con el veredicto como corrección
         → NO verificado y agotado → P6 sella fallida → P8 proyecta (❌ veredicto completo)
```

## Los 5 principios (los invariantes del motor)

1. **El LLM nunca ejecuta ni decide el flujo** — solo genera en los pasos fuzzy
   declarados; el motor decide (P1).
2. **Cada salida fuzzy se valida antes de continuar** — la puerta es determinista
   (P3) y el reintento es QUIRÚRGICO (solo el paso que falló, con el veredicto
   como corrección).
3. **El éxito se gana contra el mundo real** — el JEFE (P4) lee el mundo; nadie
   declara éxito sin pasar. verificado:false = veredicto, no promesa.
   El mundo se RESUELVE, no se lee por encima: `requires_resueltos` sigue cada
   require relativo hasta el archivo (lección banco-ideas, 11-ago: `api_real`
   veía el texto `_shared/` y selló verificado:true un módulo que reventaba al
   cargar), y `plan_acoplable` exige que el plano lleve su espina tipada.
4. **Todo paso queda escrito** — la bitácora (P6) es la memoria verificable; sin
   paso escrito no hay progreso; la vitrina (P8) y el reanudador (P9) viven de ella.
5. **Lo determinista no miente** — 10 piezas, 1 fuzzy: el motor es ~90% reflejo.

## Puertos (la anatomía NO cuela su sistema — cero tecnologías)

```
leer(proyecto, ruta)                          → el mundo real entra al pipeline
leer_plan(proyecto, plan, slug) → hoja        → el REFLEJO lee el contrato de la hoja
                                                 y se lo pasa al fuzzy que viene detrás
escribir(proyecto, ruta, contenido)           → el pipeline toca el mundo real
generar(instruccion, contexto) → salida_cruda → el ÚNICO puerto fuzzy (P5)
convertir(salida_cruda) → salida_canonica     → la frontera (P10)
validar(salida, reglas) → veredicto_de_paso   → la puerta fuzzy (P3)
verificar(entregable, reglas, mundo) → veredicto → el JEFE (P4)
persistir(paso)                               → la bitácora (P6)
avanzar(estado)                               → el rail (P7)
observar(execucion) → proyeccion              → la vitrina (P8)
reanudar(execucion) → nueva_ejecucion         → el reanudador (P9)
```

## Contadores vivos

- **Pasadas:** 3 (identidad · piezas · disección)
- **Piezas (órganos):** 10
- **Formas:** 4 REFLEJO · 3 CUSTODIO · 1 MICRO-AGENTE · 1 CONVERSOR · 1 PUENTE
- **Fuzzy:** 1 de 10 (~10%) → **el motor es ~90% determinista**
- **Puertos:** 10 · **Tecnologías nombradas: 0** (prueba de fuego superada)

## Preguntas abiertas (cerradas por diseño, declaradas)

- Reintento fuzzy agotado → pipeline `fallido` con veredicto completo (el humano decide). [P3+P9]
- Varios pasos fuzzy → cada salida validada antes del siguiente; fuzzy→fuzzy sin
  validación intermedia, prohibido. [P3]
- Paralelismo → no en v1: pasos en orden, uno a uno (lección del POS: de a una,
  fallo aislado, reintentable). [P1]
