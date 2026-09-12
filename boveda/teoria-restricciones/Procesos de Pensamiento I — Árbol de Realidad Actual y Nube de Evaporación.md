---
tipo: componente
sector: teoria-restricciones
tags: [toc, crt, nube-de-evaporacion, thinking-processes, diagnostico]
---
# Procesos de Pensamiento I — Árbol de Realidad Actual y Nube de Evaporación

> Cuando la restricción no es una máquina sino un conflicto que nadie se atreve a nombrar, hace
> falta lógica de causa-efecto, no más inversión. Estas dos herramientas diagnostican eso.

---

## Las tres preguntas que gobiernan todo el Proceso de Pensamiento

```
1. ¿QUÉ CAMBIAR?            → lo diagnostica el Árbol de Realidad Actual (CRT)
2. ¿A QUÉ CAMBIAR?          → lo diseña el Árbol de Realidad Futura (FRT) — nota II
3. ¿CÓMO PROVOCAR EL CAMBIO? → lo planifican PRT y TT — nota II

La Nube de Evaporación es la bisagra entre 1 y 2: expone el CONFLICTO que
sostiene el problema raíz y da la palanca para diseñar la solución.
```

---

## Árbol de Realidad Actual (CRT) — de síntomas a causa raíz

```
PUNTO DE PARTIDA: los UDE (Undesirable Effects / Efectos Indeseables)
  Lista de 5-10 síntomas observables y verificables del sistema — no
  opiniones ni diagnósticos ya masticados. Ejemplos válidos: "los pedidos
  urgentes retrasan sistemáticamente los pedidos normales", "el 40% del
  tiempo de los mandos se va en reuniones de estado". Ejemplo INVÁLIDO
  (ya es un diagnóstico, no un síntoma): "el equipo no está motivado".

CONSTRUCCIÓN (lógica causa→efecto, de abajo hacia arriba)
  → Se conectan los UDE entre sí y con causas intermedias mediante flechas
    "SI [causa] ENTONCES [efecto]" — cada conexión debe superar la Categoría
    de Reserva Legítima (CLR, ver abajo): un test de rigor lógico.
  → El árbol converge hacia 1-3 CAUSAS RAÍZ que explican la mayoría de los
    UDE observados — normalmente algo bastante más simple y más incómodo
    de lo que la organización cree ("medimos y premiamos X, por eso la
    gente hace Y aunque diga que quiere Z").

CATEGORÍAS DE RESERVA LEGÍTIMA (CLR) — el filtro de rigor lógico
  1. Claridad — la afirmación se entiende sin ambigüedad.
  2. Existencia de la entidad — la causa/efecto realmente existe, no se inventa.
  3. Existencia de la relación causal — el "SI-ENTONCES" es verosímil, no
     solo correlación temporal.
  4. Suficiencia de causa — la causa por sí sola basta para producir el
     efecto (o se nombran las causas adicionales necesarias).
  5. Causa adicional — ¿hay otra causa independiente que también explica
     el efecto y no se ha nombrado?
  6. Causa-efecto invertidos — comprobar que no se ha confundido cuál es
     la causa y cuál el efecto.
  7. Búsqueda de efecto predicho — si la causa es cierta, debe predecir
     OTRO efecto observable, no solo el UDE de partida (esto es lo que da
     solidez real al árbol frente a un argumento circular).
```

---

## Nube de Evaporación (Evaporating Cloud / Conflict Resolution Diagram)

```
ESTRUCTURA (5 cajas, lógica de necesidad "PARA... DEBO...")

              D (requisito de A) ← → D' (requisito de B, en CONFLICTO con D)
             ↗                                                    ↖
   A (objetivo común)                                    A (objetivo común)
             ↘                                                    ↙
              B (necesidad propia)                    C (necesidad propia)

  A = el objetivo compartido que ambas partes del conflicto reconocen como
      válido (ej: "la empresa sea rentable a largo plazo").
  B, C = dos necesidades legítimas, ambas requeridas para lograr A.
  D, D' = las dos acciones/posiciones EN CONFLICTO DIRECTO, cada una
      requerida para satisfacer B y C respectivamente.

EJEMPLO CLÁSICO (lotes de producción)
  A: la fábrica sea rentable.
  B: minimizar el coste por unidad → D: fabricar en LOTES GRANDES.
  C: cumplir plazos de entrega al cliente → D': fabricar en LOTES PEQUEÑOS.
  D y D' están en conflicto directo — parece que hay que elegir uno u otro.

CÓMO "EVAPORA" EL CONFLICTO
  → No se busca un compromiso entre D y D' (eso deja a ambas partes
    insatisfechas). Se cuestiona el SUPUESTO OCULTO detrás de cada flecha
    (B→D, C→D', A→B, A→C). Casi siempre el supuesto oculto es una creencia
    no verificada ("el coste de cambio de formato es alto y fijo") que, si
    se invalida (invirtiendo en SMED, reduciendo tiempos de cambio), hace
    que el conflicto deje de existir — de ahí "evaporación": no se elige un
    bando, se elimina la premisa que obligaba a elegir.
  → El propio ejemplo de lotes es históricamente el que llevó a Goldratt a
    formular Drum-Buffer-Rope: cuestionar "hay que fabricar en lotes
    grandes para ser eficiente" es lo que abre la puerta a lotes de
    transferencia más pequeños que la restricción.
```

---

## Procedimiento práctico para construir una Nube en 20 minutos

```
1. Escribe el UDE o la decisión bloqueada como punto de partida.
2. Identifica las DOS posiciones en conflicto directo (D y D').
3. Para cada una, pregunta "¿QUÉ NECESIDAD satisface esta posición?" → B, C.
4. Para cada necesidad, pregunta "¿PARA QUÉ objetivo mayor sirve?" → debe
   converger en la misma A para ambas ramas.
5. Verbaliza en voz alta cada flecha como "Para [objetivo] debo [acción]" —
   si suena forzado o dudoso, ahí está el supuesto a cuestionar.
6. Lista los supuestos de cada flecha (mínimo 2-3 por flecha) y pregunta:
   "¿es esto SIEMPRE cierto, o solo bajo ciertas condiciones que podemos
   cambiar?"
```

---

## Errores comunes

```
→ Construir el CRT con "diagnósticos" en vez de síntomas observables —
  contamina el árbol con juicios de valor que ningún dato puede verificar
  ni refutar.
→ Saltarse la CLR nº7 (efecto predicho) — sin ella, cualquier cadena de
  causas "suena lógica" pero no se puede distinguir de una narrativa
  post-hoc inventada para justificar una opinión previa.
→ En la Nube, quedarse en la superficie de D vs D' sin subir hasta el
  supuesto oculto — negociar un "término medio" entre lotes grandes y
  pequeños es la trampa más común, y reproduce el conflicto cada trimestre.
→ Usar la Nube para "ganar" un argumento en vez de para encontrar el
  supuesto compartido que ambas partes puedan cuestionar juntas — el valor
  de la herramienta es la conversación estructurada, no el diagrama en sí.
```

## Novedades 2024-2026

```
→ Investigación reciente (System Dynamics Review, 2024) propone un marco
  para combinar los Procesos de Pensamiento TOC con modelado cualitativo
  de dinámica de sistemas — usar la Nube de Evaporación para identificar
  bucles de refuerzo ocultos que la dinámica de sistemas por sí sola no
  siempre hace explícitos en el lenguaje del equipo.
→ Software dedicado (Vithanco, ThinkingTOC) sigue actualizándose para
  facilitar la construcción colaborativa remota de CRT y Nubes — relevante
  desde la consolidación del trabajo híbrido post-2023.
```

Ver: [[Procesos de Pensamiento II — Realidad Futura, Prerrequisitos y Transición]] · [[Fundamentos TOC — Goldratt y el pensamiento sistémico]].
