---
tipo: herramienta
sector: eolica-hogar
tags: [selector, decision, hawt, vawt]
---
# Selector de turbina (regla de decisión)

```
SEGÚN entorno y viento:
  rural + viento limpio (v_media >5 m/s) + espacio para torre
    → HAWT 3 palas (máx Cp, máx producción)
  urbano/suburbano + viento turbulento + tejado
    → VAWT H-rotor o híbrido Savonius-Darrieus (omnidireccional, menos ruido, mantenimiento en base)
  costero/montañoso + viento fuerte constante (>6 m/s)
    → HAWT 3 palas con furling (protección sobreviento pasiva)
  zona aislada + bombeo de agua
    → Multi-pala (alto par, bajo TSR)
  proyecto educativo / bajo presupuesto
    → Savonius (construcción simple, autoarranca, bajo Cp pero robusto)

SEGÚN presupuesto:
  <300 EUR   → kit genérico 400W (Vevor, Pikasola) o DIY Savonius
  300-1500   → kit 1-2 kW (Damia Solar) o DIY Hugh Piggott
  1500-8000  → Bornay/Enair 3-5 kW (fabricación española)
  >10000     → Bergey Excel 6 (6.7 kW) o Enair 160 (10.5 kW)

REGLA DE ORO:
  SI v_media_anual < 4.5 m/s a la altura del buje → NO VIABLE
  SI presupuesto limitado Y sol disponible → solar FV gana en la mayoría de España
  COMPLEMENTO: híbrido eólica+solar es la combinación óptima (noche + invierno)
```

Entradas: entorno (rural/urbano/costero), v_media, presupuesto, uso (autoconsumo/aislada/bombeo), espacio disponible.
Salida: tipo de turbina + rango de potencia + fabricante sugerido + alertas.

Ver [[Ecuación de potencia y Betz]] para la física. Ver [[Productos comerciales 2025–2026]] para precios.
