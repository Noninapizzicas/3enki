---
name: multi-lens-analysis
description: >-
  Analiza un skill, producto o problema aplicando 3 lentes estructurales
  (diseccionador, prisma-modelo-universal, perspectiva-C) y persiste cada
  resultado. El cruce de las 3 vistas revela lo que "chirría" — promesas
  incumplidas, sobreingeniería, pasos que sobran, y contradicciones internas.
when-to-use: >-
  CREANDO una skill nueva → valídala antes de darla por buena.
  UNA skill existente no funciona bien y no sabes por qué → diagnostica.
  LIMPIANDO/consolidando skills duplicadas → revela qué sobra.
  ANTES de construir algo complejo en dominio nuevo → mapea primero.

  NO usar para: debuggear producción, fixes rápidos, crear módulos, desplegar.
  Las lentes son para PENSAR, no para EJECUTAR.
source: hermes
tags: [analisis, metodologia, lentes, validacion, simplificacion, meta]
---

# Multi-Lens Analysis

> Tres perspectivas distintas del mismo objeto. Cada una revela algo que las
> otras no ven. El cruce encuentra lo que chirría.

Aplica 3 lentes a un skill, producto o método. Cada lente se persiste en un
archivo. Luego se cruzan los 3 resultados. El cruce es el paso que más valor
aporta — las lentes por separado son descriptivas; el cruce revela decisiones
de diseño, contradicciones, y simplificaciones posibles.

## Las 3 lentes

Cada lente **existe como skill independiente** en la cantera:

```
Objeto (skill / producto / método)
        │
        ├── LENTE 1: DISECCIONADOR                        ← cantera/enki/diseccionador
        │     "¿Cómo se parte y qué forma tiene cada pieza?"
        │     → verbos atómicos + 6 preguntas
        │     → cada verbo recibe su forma
        │
        ├── LENTE 2: PRISMA-MODELO-UNIVERSAL              ← cantera/enki/prisma-modelo-universal
        │     "¿Qué es esto como producto? ¿Molde de 5 huecos?"
        │     → IDENTIDAD, RESTRICCIONES, CONTRATO,
        │       NO-OBJETIVOS, PREGUNTAS_ABIERTAS
        │
        └── LENTE 3: PERSPECTIVA-C                        ← cantera/enki/agente-perspectiva-c
              "¿Qué parte es REFLEJO o AGENTE?"
              → reparto reflejo/agente con tools:[]
```

## Workflow

### 1. Aplicar cada lente
### 2. Cruzar los 3 análisis
### 3. Persistir hallazgos
### 4. Simplificar (eliminar sobre añadir)
### 5. Probar contra caso real
### 6. Iterar hasta coherencia

Ver `multi-lens-analysis` en Hermes para el detalle completo del workflow.
