# Pasada 1 · Identidad — el Motor de Agentes (prisma, ronda 1)

> Skill: esquematizador (prisma recursivo) · Sujeto: el motor que ejecuta los
> agentes de Enki. Ley: agnosticismo — cero tecnologías, todo puerto.

## El sujeto en una frase
El sistema que convierte el trabajo DECLARADO de Enki (construir, esquematizar,
planificar, escribir skills) en entregables EXISTENTES y verificados — sin depender
de la voluntad de un LLM autónomo.

## Prisma del sujeto (5 huecos, ronda 1)

### 1 · IDENTIDAD
- **Qué es:** un EJECUTOR DE PROCESOS. Cada agente es un pipeline de pasos
  declarados; el motor los recorre en orden y los ejecuta.
- **Qué trabajo resuelve:** que el trabajo de un proyecto se haga DE VERDAD —
  el entregable aparece en el mundo real y se comprueba antes de declararlo.
- **El corte maestro:** separar lo que un test puede afirmar (→ reflejos,
  deterministas) de lo que necesita juicio (→ un único punto fuzzy acotado).

### 2 · RESTRICCIONES (reglas duras — si se rompen, el motor está MAL)
1. El LLM NUNCA ejecuta ni decide el flujo — solo GENERA en los pasos fuzzy
   declarados del pipeline.
2. Toda salida fuzzy se VALIDA (checkpoint determinista) antes de continuar.
3. Ningún éxito sin verificación contra el mundo real (el JEFE). verificado:false
   = veredicto, jamás éxito.
4. Todo paso de toda ejecución queda ESCRITO (bitácora). Sin paso escrito no hay
   progreso.
5. El determinismo es la mayoría: los reflejos son el ~90% del motor; el fuzzy
   está acotado a los pasos declarados como tales.

### 3 · CONTRATO
- **Atributos que SABER** (por agente/pipeline): pasos (orden, tipo
  reflejo|fuzzy, validaciones por salida fuzzy), entregable (qué promete + reglas
  de verificación), presupuesto (iteraciones, generaciones por paso fuzzy,
  pausas máximas).
- **Opciones** (lo que se puede tocar): pausar, reanudar, reintentar-un-paso,
  consultar-estado, ver-bitácora.
- **Estados (ciclo de vida de una ejecución):** `declarado → ejecutando →
  verificado | fallido | pausado(reanudable)`.

### 4 · NO-OBJETIVOS
- NO es un "LLM con herramientas" (esa fue la visión anterior: un agente autónomo
  decidía y ejecutaba — y mentía).
- NO es un orquestador de conversación (no gestiona chats ni turnos).
- NO decide por sí mismo qué hacer (el qué lo declara el proyecto/la fase).
- NO inventa datos ni resultados (lo que no se verifica, no se declara).

### 5 · PREGUNTAS ABIERTAS
- ¿Qué pasa si un paso fuzzy falla la validación N veces? → respuesta: reintento
  QUIRÚRGICO del mismo paso (máx. declarado) con el veredicto como corrección;
  agotado → el pipeline se marca `fallido` con el veredicto completo (el humano
  decide). [cerrada por diseño, queda declarada]
- ¿Puede un pipeline tener varios pasos fuzzy? → sí, PERO cada salida fuzzy se
  valida antes del siguiente; el encadenamiento fuzzy→fuzzy sin validación
  intermedia está prohibido. [cerrada por diseño]
- ¿Paralelismo entre pasos? → no en v1: los pasos se ejecutan en orden, uno a
  uno (la lección del POS: "todo de golpe" → timeout; de a una → fallo aislado,
  progreso, reintentable). [cerrada por diseño]
- ¿Quién autoriza el paso de fase (rail)? → el propio motor tras el veredicto
  del entregable; el humano solo en lo irreversible. [cerrada por diseño]
