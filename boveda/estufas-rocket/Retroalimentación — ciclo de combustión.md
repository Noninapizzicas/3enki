---
tipo: pilar
sector: estufas-rocket
tags: [retroalimentacion, combustion, secundaria]
---
# Retroalimentación — ciclo de combustión

La estufa rocket es un sistema con **retroalimentación positiva**: cuanto más caliente arde, más limpio quema, y cuanto más limpio quema, más calor genera. El ciclo se autosostiene una vez cruzado el umbral.

## El bucle

```
1. Leña arde en el burn tunnel → gases calientes suben por el riser
2. Riser aislado → gases alcanzan 700–1000 °C
3. A esa temperatura, la radiación del riser precalienta el aire entrante
4. Aire precalentado + volátiles sin quemar = combustión SECUNDARIA
5. La combustión secundaria libera más calor → volver a 2
```

## Umbral de autosuficiencia: ~600 °C

Por debajo de 600 °C, los volátiles (humo) escapan sin quemar. Por encima:

| Compuesto | Temperatura de ignición |
|---|---|
| Monóxido de carbono (CO) | 609 °C |
| Metano (CH₄) | 580 °C |
| Alquitranes y breas | 600–700 °C |

**Hallazgo de Aprovecho (Winiarski):** a **850 °C** con **0.5 segundos** de tiempo de residencia, la eliminación de partículas (PM) es casi completa. El riser aislado proporciona ambas cosas: temperatura y tiempo.

## Por qué se limpia sola

Una chimenea convencional opera a 200–400 °C → los volátiles condensan como creosota. El riser a >700 °C los **requema**: el humo ES combustible sin quemar. La retroalimentación radiante cierra el ciclo — no necesita inyección de aire secundario mecánica (aunque algunos diseños la añaden: ver [[Variantes — batch box y sin riser|Pre-Port de Walker]]).

## Control: damper y entrada de aire

- **Damper** en el feed tube: regula cuánto aire entra. Más aire = llama más activa pero más fría; menos aire = temperatura más alta pero riesgo de humo si baja de 600 °C.
- **Régimen óptimo**: llama azul-transparente en la parte alta del riser = combustión completa.
- **Diagnóstico**: humo visible en chimenea = retroalimentación rota (riser frío, leña húmeda, o restricción de flujo).

## Problemas de retroalimentación negativa

**Backdraft**: si el banco de masa está frío y la chimenea tiene poca altura, el aire frío puede invertir el flujo al abrir el feed. Solución: precalentar con papel/cartón hasta que el riser tire.

**Humo al recargar**: abrir el feed rompe momentáneamente la presión negativa. Diseños con alimentación superior (J-tube) minimizan esto porque la gravedad ayuda.

→ Cómo el diseño geométrico sostiene este bucle: [[Flujo — tiro natural y geometría]]
→ Qué pasa con el calor que sale: [[Readsorción — masa térmica]]
