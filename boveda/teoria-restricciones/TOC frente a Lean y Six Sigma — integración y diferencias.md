---
tipo: componente
sector: teoria-restricciones
tags: [toc, lean, six-sigma, tls, comparacion, integracion]
---
# TOC frente a Lean y Six Sigma — integración y diferencias

> Las tres metodologías atacan el mismo enemigo (desperdicio de recursos, tiempo y dinero) desde
> ángulos distintos. Elegir "la mejor" es la pregunta equivocada — la pregunta correcta es cuál
> resuelve la restricción que tienes delante ahora mismo.

---

## Foco de cada metodología

```
TOC (Theory of Constraints)
  Foco: optimización del SISTEMA COMPLETO gestionando su(s) restricción(es).
  Pregunta central: "¿qué recurso limita el throughput de todo el sistema,
  y cómo lo exploto/subordino/elevo?"
  Enfoque: sistémico, top-down, prioriza dónde invertir esfuerzo primero.

LEAN
  Foco: eliminación de DESPERDICIO (muda) en el flujo de valor completo —
  7-8 tipos de desperdicio (sobreproducción, espera, transporte, proceso
  innecesario, inventario, movimiento, defectos, talento no aprovechado).
  Pregunta central: "¿qué pasos de este proceso no añaden valor para el
  cliente, y cómo los eliminamos?"
  Enfoque: value stream mapping, mejora continua distribuida (kaizen),
  cambio cultural de "todos mejoran todo el tiempo".

SIX SIGMA
  Foco: reducción de la VARIABILIDAD estadística de un proceso hasta
  niveles de defecto casi nulos (objetivo histórico: 3.4 defectos por
  millón de oportunidades).
  Pregunta central: "¿por qué este proceso produce resultados
  inconsistentes, y cómo lo estabilizamos estadísticamente?"
  Enfoque: DMAIC (Definir, Medir, Analizar, Mejorar, Controlar),
  fuertemente analítico y basado en datos, roles certificados (Green
  Belt, Black Belt, Master Black Belt).
```

---

## Dónde se complementan (no compiten)

```
→ Six Sigma es una CAJA DE HERRAMIENTAS excelente para reducir la
  variabilidad DENTRO de la restricción identificada por TOC — de nada
  sirve aplicar DMAIC a fondo en un recurso no-restrictivo, ni tampoco
  identificar la restricción con TOC y dejarla con alta variabilidad sin
  las herramientas estadísticas de Six Sigma para estabilizarla.
→ Lean aporta la disciplina de flujo continuo y reducción de tiempos de
  cambio (SMED) que hace VIABLE en la práctica reducir el tamaño de lote
  de transferencia que la Nube de Evaporación de TOC identifica como
  supuesto a cuestionar (ver
  [[Procesos de Pensamiento I — Árbol de Realidad Actual y Nube de Evaporación]]).
→ TOC aporta a Lean y Six Sigma el CRITERIO DE PRIORIZACIÓN que a ambos
  les falta por diseño: "¿en qué proceso concreto invierto primero el
  esfuerzo de kaizen o de un proyecto Six Sigma?" — la respuesta es
  siempre "en la restricción del sistema", algo que ni Lean ni Six Sigma
  determinan por sí solos con la misma claridad.
```

---

## TLS — TOC + Lean + Six Sigma como marco integrado

```
SECUENCIA TÍPICA DE UN PROGRAMA TLS
  1. TOC identifica LA restricción del sistema completo (paso 1 de los
     5 pasos) — evita dispersar recursos de mejora en procesos que no
     mueven el resultado global.
  2. Lean aplica value stream mapping y elimina desperdicio grosero
     alrededor y dentro del proceso restrictivo (paradas evitables,
     transporte innecesario, esperas).
  3. Six Sigma aplica DMAIC para atacar la VARIABILIDAD residual de la
     restricción una vez eliminado el desperdicio grosero — es la capa
     de refinamiento estadístico final, no el primer paso.
  4. TOC vuelve a verificar (paso 5, repetir) si la restricción sigue
     en el mismo sitio tras la mejora, o si se ha movido — dispara un
     nuevo ciclo TLS en el nuevo punto crítico.

VENTAJA FRENTE A APLICAR SOLO UNA DE LAS TRES
  → Lean sin TOC: riesgo de "kaizen everywhere" — mejorar procesos que no
    son la restricción, sensación de mucha actividad sin impacto real en
    resultado financiero.
  → Six Sigma sin TOC: riesgo de invertir meses de proyecto Black Belt en
    un proceso estadísticamente relevante pero irrelevante para el
    throughput del sistema.
  → TOC sin Lean/Six Sigma: la restricción se identifica correctamente
    pero se explota de forma poco rigurosa, sin las herramientas de
    reducción de desperdicio y variabilidad que aceleran el paso 2
    (explotar) de los 5 pasos.
```

---

## Diferencia filosófica clave: inventario (WIP)

```
LEAN: el WIP es DESPERDICIO por definición — el objetivo es minimizarlo
  en todo punto del flujo (flujo continuo de una pieza, one-piece flow).
TOC: el WIP es NECESARIO como PROTECCIÓN de tiempo frente a la
  restricción — eliminarlo indiscriminadamente en TODOS los puntos del
  sistema (incluido justo antes de la restricción) puede dejarla sin
  alimentación y PARARLA, lo que es mucho más costoso que el WIP en sí.
CONSECUENCIA PRÁCTICA: en un sistema TLS bien diseñado, el WIP se reduce
  agresivamente en TODO el sistema EXCEPTO en el buffer justo antes de
  la restricción (y en los buffers de proyecto/envío de CCPM/DBR), que
  se dimensiona deliberadamente y se gestiona por colores, no se elimina.
```

---

## Errores comunes al combinar los tres marcos

```
→ Formar "Black Belts" en Six Sigma y lanzarlos a mejorar procesos sin
  que nadie haya diagnosticado antes cuál es la restricción del sistema
  — el proyecto puede tener un ROI local excelente y un ROI de sistema
  nulo.
→ Aplicar principios Lean de "cero inventario" de forma literal al buffer
  de la restricción — rompe la protección que sostiene el throughput y
  genera paradas que antes no existían.
→ Tratar TLS como una certificación más que coleccionar, en vez de como
  una secuencia de diagnóstico-priorización-ejecución aplicada con
  disciplina a UN sistema concreto.
```

## Novedades 2024-2026

```
→ La literatura de gestión de operaciones sigue publicando marcos TLS
  actualizados (2024-2025) para sectores con alta variabilidad de demanda
  post-pandemia — la combinación se recomienda explícitamente en
  entornos donde ni Lean puro (asume demanda relativamente estable) ni
  Six Sigma puro (asume proceso ya identificado a estabilizar) bastan
  por sí solos para el nivel de incertidumbre actual de cadenas de
  suministro globales.
```

Ver: [[Fundamentos TOC — Goldratt y el pensamiento sistémico]] · [[Drum-Buffer-Rope — programación de producción y buffers]].
