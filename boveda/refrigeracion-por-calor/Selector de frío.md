---
tipo: herramienta
sector: refrigeracion-por-calor
tags: [selector, decision]
---
# Selector de frío (regla de decisión)

```
SEGÚN T de la fuente:
  55–80 °C   → ADSORCIÓN / eyector
  80–120 °C  → ABSORCIÓN LiBr simple efecto
  140–180 °C → ABSORCIÓN doble/triple efecto
SI T_frío < 0 °C → ABSORCIÓN amoníaco (≥60 °C)
SI prioriza compacidad/GWP/vanguardia → MOF · líquidos iónicos · membrana
```
Entradas: T fuente · potencia de frío · T objetivo · escala · restricciones. Salida: tecnología + par + COP + fabricante + alertas.
