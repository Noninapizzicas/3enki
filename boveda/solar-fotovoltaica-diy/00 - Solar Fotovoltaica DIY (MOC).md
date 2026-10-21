---
tipo: moc
sector: solar-fotovoltaica-diy
tags: [solar, fotovoltaica, autoconsumo, DIY, energia, anclaje, baterias, off-grid, moc]
---
# Solar Fotovoltaica DIY

> Del enchufe de un kit balcón de 400W a una instalación aislada de 5kW con baterías propias — un sector donde comprar bien, calcular bien y anclar bien importan tanto como la propia célula fotovoltaica.

---

## La escalera del instalador solar DIY

```
NIVEL 0 — KIT BALCÓN PLUG&PLAY (sin obra, sin trámite)
  Qué: 1-2 paneles (400-820W) + microinversor ≤800W + soporte de barandilla/suelo
  Herramientas: llave Allen, destornillador — el kit trae todo
  Inversión: 300-800€ · amortización 4-7 años · ahorro 100-180€/año
  Trámite: NINGUNO si ≤800W inyección (consenso 2024, modelo VDE-AR-N 4105)

NIVEL 1 — AUTOCONSUMO CONECTADO A RED SIN BATERÍA (tejado propio)
  Qué: 2-6 kWp · string inverter o microinversores · anclaje sobre cubierta
  Herramientas: taladro, multímetro, pinza amperimétrica, básicas de electricista
  Inversión: 1.000-1.500 €/kWp instalado (2026) → 4.000-8.000€ instalación media
  Trámite: RD 244/2019 — sin permiso de acceso si ≤15kW, compensación simplificada

NIVEL 2 — AUTOCONSUMO CON BATERÍA (híbrido)
  Qué: inversor híbrido + batería LiFePO4 4-15 kWh · gestión de excedentes propia
  Herramientas: + crimpadora de terminales, comprensión de BMS y curvas de carga
  Inversión: +500-950 €/kWh de batería sobre la instalación base
  Ganancia: autoconsumo del 30-40% (sin batería) sube al 70-90% (con batería)

NIVEL 3 — INSTALACIÓN AISLADA (off-grid, sin red)
  Qué: dimensionado completo consumo↔producción↔almacenamiento · generador de respaldo
  Herramientas: + cálculo de caída de tensión, dimensionado de banco de baterías
  Inversión: 6.000-20.000€ según autonomía objetivo (cabaña, caravana, finca rural)
  Riesgo: dimensionar mal el banco de baterías es el error nº1 — sistema desabastecido en invierno

NIVEL EXPERTO — DISEÑO DE ANCLAJE Y ESTRUCTURA A MEDIDA
  Qué: cálculo de cargas de viento/nieve (CTE DB-SE-AE), sistemas lastrados, seguidores solares
  Herramientas: software de cálculo estructural, conocimiento de CTE, memoria técnica
  Aplica cuando: cubierta atípica, terreno irregular, gran superficie, instalación flotante o en fachada
```

---

## Mapa del sector (13 notas)

| nota | qué cubre |
|---|---|
| [[Sistemas de anclaje y estructura — cubierta, suelo, fachada, balcón\|Sistemas de anclaje y estructura]] | ganchos de teja, perfiles rail, lastres cubierta plana, hincado, tornillos helicoidales, trackers, BIPV fachada, FPV flotante, marcas K2/Schletter/Esdec, normativa CTE |
| [[Paneles solares — monocristalino, TOPCon, HJT, bifacial\|Paneles solares]] | tecnologías de célula, eficiencias reales, marcas (Longi, JA Solar, Jinko, REC, QCells), precios €/Wp 2026 |
| [[Inversores — string, microinversores, híbridos\|Inversores]] | string (Fronius, SMA, Huawei, Growatt), microinversores (Enphase, APsystems), híbridos, curva de eficiencia |
| [[Baterías y almacenamiento — LiFePO4, BMS, sodio-ion\|Baterías y almacenamiento]] | química LiFePO4 vs NMC, BMS, ciclos, marcas (Pylontech, BYD, EG4), DIY con celdas EVE, sodio-ion emergente |
| [[Autoconsumo conectado a red — RD 244-2019, trámites España\|Autoconsumo conectado a red]] | RD 244/2019, RDL 7/2026, compensación simplificada, vertido cero, autoconsumo colectivo, trámites paso a paso |
| [[Instalación aislada — off-grid, dimensionado, reguladores\|Instalación aislada (off-grid)]] | dimensionado de consumo/producción/batería, MPPT vs PWM, generador de respaldo, casos reales |
| [[Kit balcón — plug and play, normativa, montaje\|Kit balcón (Plug&Play)]] | normativa 800W España, kits recomendados, montaje en una tarde, límites y letra pequeña |
| [[Dimensionado del sistema — consumo, HSP, inclinación, sombras\|Dimensionado del sistema]] | cálculo de consumo, horas sol pico por provincia, inclinación óptima, análisis de sombras |
| [[Monitorización — apps, plataformas, Home Assistant\|Monitorización]] | apps de fabricante, SolarEdge, Fronius Solar Web, integración Home Assistant, alertas de fallo |
| [[Mantenimiento y degradación — limpieza, termografía, vida útil\|Mantenimiento y degradación]] | limpieza, detección de células calientes, degradación anual, vida útil de componentes |
| [[Seguridad eléctrica — protecciones CC-CA, puesta a tierra\|Seguridad eléctrica]] | diferencial tipo B, fusibles string gPV, SPD, puesta a tierra, REBT, riesgo de arco eléctrico |
| [[Proyectos paso a paso — kit balcón, tejado, cabaña aislada\|Proyectos paso a paso]] | 3 proyectos completos con lista de materiales, coste real y tiempo de ejecución |
| [[Fuentes — proveedores, comunidades, canales España\|Fuentes]] | Autosolar, Atersa, Damia Solar, foros, canales YouTube, calculadoras online |

---

## Últimas noticias y avances del sector

> Datos recogidos en la investigación de 2025-2026.

```
NOVEDAD 1 (2026): Real Decreto-ley 7/2026 amplía el radio del autoconsumo colectivo
  de 2 km a 5 km para instalaciones de hasta 5 MW — abre la puerta a proyectos entre
  comunidades de vecinos, polígonos industriales y pequeños núcleos de población.

NOVEDAD 2 (2024-2026): consenso de la Comisión Sectorial de Energía (modelo alemán
  VDE-AR-N 4105) — instalaciones de balcón conectadas a enchufe schuko hasta 800W de
  inyección NO requieren proyecto, boletín ni alta como autoconsumidor. Por encima de
  800W entra el RD 244/2019 completo.

NOVEDAD 3 (2025-2026): TOPCon consolidado como estándar (≈80% de la producción mundial
  de células nuevas a finales de 2025), con eficiencias comerciales del 24-25% y coste
  ya competitivo con el antiguo PERC. HJT queda como opción premium (24-26%, mejor
  coeficiente térmico) y la perovskita en tándem certifica 34,85% en laboratorio pero
  su llegada comercial masiva se espera para 2027-2028.

NOVEDAD 4 (2026): España marca récord de producción solar fotovoltaica mensual en julio
  (7.696 GWh, +22,2% interanual) y de inyección simultánea (22.299 MW). La capacidad
  instalada nacional alcanza 54 GW; el autoconsumo ya cubre el 4,1% de la demanda
  eléctrica pero crece más despacio tras el fin de los fondos europeos específicos.

NOVEDAD 5 (2026): baterías LiFePO4 siguen bajando de precio (≈500-950 €/kWh instalado
  en Europa) mientras el sodio-ion (CATL Nathium y similares) empieza a asomar como
  alternativa de menor coste y sin litio para almacenamiento estacionario, aunque
  todavía sin despliegue residencial masivo en España.
```

---

## Sector hermano

- [[../eolica-hogar/00 - Eólica a escala hogar (MOC)|Eólica a escala hogar]] — generación distribuida complementaria (produce más de noche y en invierno); comparten normativa de autoconsumo (RD 244/2019) y sistema eléctrico (reguladores, baterías, inversores). No se duplican aquí los conceptos de generación eólica — solo se referencian.

## Conexiones con otros sectores

```
→ [[../domotica-iot/00 - Domótica e IoT (MOC)|Domótica e IoT]] — Home Assistant + MQTT para monitorización y automatización de cargas según producción solar
→ [[../electronica-maker/00 - Electrónica Maker (MOC)|Electrónica Maker]] — ESP32 para monitorización DIY, sensores de corriente, BMS caseros
→ [[../construccion-abierta/00 - Construcción Abierta (MOC)|Construcción Abierta]] — cimentaciones, estructuras y normativa CTE compartida con anclajes de suelo
```
