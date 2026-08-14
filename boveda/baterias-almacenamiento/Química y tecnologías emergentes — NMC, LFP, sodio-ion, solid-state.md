---
tipo: componente
sector: baterias-almacenamiento
tags: [quimica, nmc, lfp, sodio-ion, solid-state, m3p, shenxing, catl, byd]
---
# Química y tecnologías emergentes — NMC, LFP, sodio-ion, solid-state

> La química que elijas hoy para tu banco de baterías es una apuesta a 10-15 años de vida útil — y en 2026, por primera vez desde que el litio ganó la partida hace una década, hay una alternativa real (sodio-ion) empezando a comprarse en España, no solo a anunciarse en un laboratorio.

---

## El mapa de químicas — qué prioriza cada una

```
NMC/NCA (Níquel-Manganeso-Cobalto / Níquel-Cobalto-Aluminio)
  Prioriza: densidad energética (más kWh por kg/litro)
  Ciclos: 500-1.500 según formulación y profundidad de descarga
  Riesgo térmico: alto — la química con mayor tendencia a fuga térmica autoacelerada
  Uso hoy: vehículo eléctrico de mayor autonomía, electrónica portátil, cada vez
  menos presente en almacenamiento estacionario nuevo

LFP / LiFePO4 (Litio Ferrofosfato)
  Prioriza: seguridad y longevidad sobre densidad
  Ciclos: 2.000-6.000 (80% DoD) — 3-4× más que NMC en vida útil
  Riesgo térmico: bajo — estructura cristalina estable, no libera oxígeno con
  facilidad, umbral de fuga térmica muy superior al NMC
  Uso hoy: ESTÁNDAR del almacenamiento estacionario residencial e industrial,
  mayoría de VE chinos de gama media (BYD Blade, Tesla Model 3 RWD con celdas CATL)

LMFP / M3P (Litio-Manganeso-Ferrofosfato, LFP "dopado" con manganeso)
  Prioriza: cerrar la brecha de densidad entre LFP y NMC sin cobalto/níquel
  Densidad objetivo: ~230 Wh/kg (frente a ~160 Wh/kg del LFP estándar)
  Estado 2026: CATL (M3P) y otros fabricantes en producción para automoción,
  aún no presente como celda suelta para DIY

SODIO-ION (Na-ion)
  Prioriza: coste de materia prima y comportamiento en frío
  Ciclos: 3.000-10.000 según fabricante (BYD anuncia hasta 10.000 en su 3ª gen)
  Densidad: menor que LFP hoy, pero la brecha se reduce cada generación
  Materia prima: carbonato de sodio ≈0,05$/kg frente a carbonato de litio ≈15$/kg
  (mediados 2025) — la ventaja de coste es estructural, no coyuntural

SOLID-STATE (electrolito sólido, litio o sodio)
  Prioriza: densidad extrema + eliminar el riesgo de fuga de electrolito líquido
  inflamable — la frontera de seguridad y densidad combinadas
  Estado 2026: BYD produce celdas piloto (20-60Ah) de solid-state sulfídico,
  previsión de producción a pequeña escala 2027 · CATL presenta celda "condensed
  matter" de 350 Wh/kg en su Tech Day de abril 2026 — aún no comercial
```

---

## Sodio-ion en 2026 — de promesa a producto comprable

```
YA EN VENTA EN ESPAÑA (residencial):
  Accupower (Austria) — sistema Natec Home: 7,68 kWh, 3,8 kW, ≈3.990€ (2026)
  Freen (Estonia) — sistemas de almacenamiento doméstico con sodio-ion,
  aceptando pedidos para el mercado español

EN AUTOMOCIÓN:
  Changan (celdas CATL) — batería de sodio de 60 kWh a ≈2.700€, precio ya
  comparable al LFP equivalente, con previsión de abaratarse más en 2027
  CATL — línea comercial "Naxtra", producción en masa anunciada para
  finales de 2026
  BYD — 3ª generación de sodio-ion en desarrollo, objetivo de hasta
  10.000 ciclos de vida

QUÉ FALTA PARA EL DIY:
  Catálogo de celdas sodio-ion sueltas (formato cilíndrico o prismático) para
  comprar y montar pack propio todavía muy limitado en 2026 — la mayoría del
  producto disponible es sistema cerrado (caja + BMS de fábrica), no celda
  suelta comparable a lo que hoy existe para LiFePO4

RECOMENDACIÓN PRÁCTICA: para proyecto DIY hoy, seguir con LiFePO4 prismática.
  Para sistema doméstico llave en mano y sin interés en el montaje propio,
  el sodio-ion residencial (Accupower, Freen) ya es una opción real a valorar
  frente a un LiFePO4 comercial equivalente — comparar precio por kWh y
  garantía antes de decidir.
```

---

## LFP de nueva generación — Shenxing, Qilin, Blade

```
CATL SHENXING (3ª generación, presentada abril 2026)
  Carga del 10% al 98% en aproximadamente 6 minutos, incluso en frío extremo
  Autonomía en aplicación automotriz por encima de 1.000 km
  Relevancia DIY: la mejora de velocidad de carga y comportamiento en frío
  de la química LFP en general beneficia también a las celdas prismáticas
  de consumo (mejor rendimiento invernal en instalaciones exteriores)

CATL QILIN (3ª generación, NCM, mismo evento)
  600 Wh/L volumétrico, 280 Wh/kg gravimétrico — referencia de densidad
  para el segmento premium, no la química de interés para almacenamiento DIY

BYD BLADE (LFP, formato celda-a-pack sin módulo intermedio)
  Diseño estructural que usa la celda como elemento de refuerzo del propio
  pack — mejora densidad volumétrica del LFP sin cambiar la química base
  Relevancia DIY: origen de módulos de segunda vida cada vez más disponibles
  a medida que envejece el parque de vehículos BYD con esta tecnología
```

---

## Errores comunes al elegir química

```
★★★★★ Elegir NMC/NCA para almacenamiento doméstico fijo "porque tiene más
  capacidad" — en una instalación fija el peso/volumen apenas importa, y se
  renuncia a 3-4× más ciclos de vida y mucha más seguridad térmica sin motivo
★★★★☆ Comprar sodio-ion DIY hoy pensando en catálogo amplio de celdas sueltas
  — en 2026 el producto disponible es mayoritariamente sistema cerrado, no
  celda para montar pack propio
★★★☆☆ Ignorar el comportamiento en frío de la química elegida en instalación
  exterior o garaje sin calefactar — el LFP pierde capacidad utilizable de
  forma notable por debajo de 0°C, algo que las nuevas generaciones (Shenxing)
  mitigan pero no eliminan del todo
```

---

## Novedades 2025-2026

```
→ El sodio-ion pasa de anuncio a producto comprable en España en sistemas
  residenciales cerrados (Accupower Natec Home, Freen) durante 2026.
→ CATL anuncia producción en masa de su línea sodio-ion Naxtra para finales
  de 2026, lo que debería empezar a abaratar el segmento en 2027.
→ La 3ª generación de LFP (CATL Shenxing) mejora sustancialmente carga rápida
  y comportamiento en frío, tecnología que con los años suele bajar en cascada
  hacia la celda prismática de consumo DIY.
```

---

→ Elegir celda física según la química decidida aquí: [[Celdas de litio — 18650, 21700, LiFePO4 cilíndricas y prismáticas]]
→ Seguridad térmica por química: [[Seguridad — thermal runaway, almacenamiento, extinción de incendios]]
