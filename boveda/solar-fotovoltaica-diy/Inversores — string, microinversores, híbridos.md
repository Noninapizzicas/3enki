---
tipo: componente
sector: solar-fotovoltaica-diy
tags: [inversor, string, microinversor, hibrido, Fronius, SMA, Huawei, Enphase, Growatt]
---
# Inversores — string, microinversores, híbridos

> El inversor es el cerebro del sistema — decide cuánta energía de la que producen tus paneles llega realmente a convertirse en corriente útil, y es la pieza que con más probabilidad tendrás que sustituir antes que el panel.

---

## Los tres tipos y cuándo usa cada uno

```
STRING INVERTER (inversor central) — el más habitual en tejado sin sombras
  Cómo funciona: todos los paneles de un string en serie conectan a UN inversor
  Ventaja: coste por Wp más bajo, instalación sencilla, robusto y bien conocido
  Desventaja: un panel sombreado o sucio penaliza a TODO el string (el más débil manda)
  Cuándo usarlo: tejado sin sombras parciales, orientación única, presupuesto ajustado

MICROINVERSOR — un inversor pequeño POR PANEL
  Cómo funciona: cada panel tiene su propio microinversor en la parte trasera,
  ya convierte a AC en el propio panel — el string se sustituye por una cadena AC
  Ventaja: cada panel opera en su punto óptimo independiente → sombras parciales,
  orientaciones distintas o suciedad desigual NO penalizan al resto del sistema
  Desventaja: coste por Wp más alto, más puntos de fallo (aunque cada uno es menor)
  Cuándo usarlo: tejados con sombras parciales (chimeneas, árboles), varias
  orientaciones, instalaciones pequeñas donde la granularidad importa (kit balcón)

OPTIMIZADOR DE POTENCIA (SolarEdge, Tigo) — híbrido entre los dos anteriores
  Cómo funciona: cada panel lleva un optimizador DC/DC que corrige su punto de
  trabajo, pero la conversión final a AC sigue siendo de UN inversor central
  Ventaja: resuelve el problema de sombras del string sin llegar al coste del
  microinversor completo por panel
  Cuándo usarlo: término medio — sombras parciales moderadas, presupuesto medio
```

---

## Inversor híbrido — el que gestiona batería

```
QUÉ AÑADE sobre un string/microinversor normal:
  Gestiona simultáneamente: paneles (DC) → batería (DC) → red (AC) → consumo (AC)
  Decide en tiempo real: cargar batería, verter a red, o alimentar consumo directo
  Imprescindible si el proyecto incluye batería (ver [[Baterías y almacenamiento — LiFePO4, BMS, sodio-ion]])

MARCAS CON HÍBRIDO EN CATÁLOGO:
  Huawei (SUN2000 + batería LUNA2000) · Fronius (con batería BYD/Fronius) ·
  Growatt (SPH series) · Deye (muy competitivo en precio, popular en instalación DIY)
```

---

## Marcas de referencia — comparativa práctica (2026)

```
HUAWEI (SUN2000 series) — el más "conectado"
  Eficiencia: hasta 98,6% · app FusionSolar de monitorización muy pulida
  Ecosistema propio: batería LUNA2000 integrada de fábrica
  Posicionamiento: mejor para quien quiere un ecosistema cerrado y coherente

FRONIUS (austriaco) — el de la fiabilidad legendaria
  Reconocido por robustez y durabilidad a largo plazo
  Soporte técnico en España que responde rápido — la opción para "tranquilidad
  absoluta" según instaladores profesionales
  Posicionamiento: gama alta, mayor coste inicial compensado por menor tasa de fallo

SMA (alemán) — el pionero histórico
  Eficiencia ≈98% · soporte técnico europeo consolidado, mucha trayectoria
  Posicionamiento: gama alta, alternativa a Fronius con enfoque similar

GROWATT (chino) — la relación calidad-precio líder
  Lidera cuota de mercado en instalación residencial española por precio ajustado
  sin renunciar a cumplir especificación · "cumple sin lujos"
  Posicionamiento: entrada/media, la opción por defecto para presupuesto ajustado

DEYE (chino) — flexibilidad de batería a buen precio
  Muy popular en comunidad DIY/off-grid por compatibilidad amplia con baterías
  de terceros y buena relación prestaciones/precio en híbridos
  Posicionamiento: off-grid y semi-aislado, favorito en foros de autoinstalación

ENPHASE (americano) — el líder de microinversores
  Serie IQ8 — IQ8MC, IQ8AC, IQ8HC, IQ8P (hasta 480W AC, compatible con paneles
  de hasta 670W DC) · precio 152-247€ por unidad (2026, sin IVA) según modelo
  App Enphase para monitorización panel a panel

APSYSTEMS — alternativa a Enphase en microinversor
  Microinversores dual/quad (varios paneles por unidad física) — buena opción
  cuando se busca reducir el número de unidades sin perder granularidad
```

---

## Especificaciones que importan

```
EFICIENCIA EUROPEA (%): pondera el rendimiento en condiciones reales variables de
  irradiancia (no solo el pico STC) — 97-98,6% en gama alta actual

POTENCIA NOMINAL DE SALIDA (kW AC): debe ajustarse a la potencia DC instalada
  Ratio DC/AC habitual: 1,1-1,3 (más paneles DC que capacidad AC del inversor —
  aprovecha mejor las horas de baja irradiancia sin sobredimensionar el inversor)

NÚMERO DE MPPT (Maximum Power Point Tracker): cuántos strings independientes puede
  gestionar el inversor con puntos de trabajo distintos — relevante si tienes
  paneles en más de una orientación/inclinación

GRADO DE PROTECCIÓN IP: IP65 mínimo para instalación exterior sin caseta técnica

MONITORIZACIÓN: WiFi/Ethernet integrado en toda la gama actual — ver
  [[Monitorización — apps, plataformas, Home Assistant]]
```

---

## Errores comunes con el inversor

```
★★★★★ Subdimensionar el ratio DC/AC (inversor demasiado pequeño para la potencia
  de paneles instalada) — recorta producción en las horas de mayor irradiancia (clipping)
★★★★☆ Sobredimensionar el inversor "por si acaso" — gasto innecesario que no se
  amortiza, rendimiento medio más bajo en condiciones de baja irradiancia
★★★★☆ Instalar string único con sombras parciales conocidas (chimenea, antena,
  árbol) en vez de microinversor u optimizador — pierde producción del string entero
★★★☆☆ No revisar compatibilidad de batería ANTES de elegir inversor si el proyecto
  crecerá a híbrido en el futuro — cambiar de inversor luego duplica coste
★★★☆☆ Ubicar el inversor en exterior sin sombra/ventilación — la temperatura alta
  reduce eficiencia y acelera envejecimiento de componentes electrónicos
```

---

## Novedades 2025-2026

```
→ Deye gana terreno en comunidad DIY/off-grid española por su apertura a baterías
  de terceros (no fuerza ecosistema cerrado como Huawei)
→ Enphase amplía su gama IQ8 con el IQ8P de 480W AC, ya compatible con los paneles
  de mayor potencia actuales (hasta 670W DC) — cierra la brecha que tenían los
  microinversores frente al crecimiento de potencia de los paneles nuevos
→ Los inversores híbridos siguen ganando cuota sobre los inversores "solo red" a
  medida que baja el precio de la batería LiFePO4 — la frontera entre autoconsumo
  simple y autoconsumo con batería se difumina en el catálogo de fabricante
```
