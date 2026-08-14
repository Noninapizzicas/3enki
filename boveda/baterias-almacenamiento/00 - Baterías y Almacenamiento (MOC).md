---
tipo: moc
sector: baterias-almacenamiento
tags: [baterias, litio, lifepo4, 18650, 21700, bms, segunda-vida, powerwall, ebike, sodio-ion, almacenamiento-energetico]
---
# Baterías y Almacenamiento

> Una celda suelta es solo un cilindro de 45 gramos con 3,7 voltios dentro — el salto real está en entender que un pack es un sistema vivo de electroquímica, protección eléctrica y gestión térmica trabajando a la vez, y que ese conocimiento es el mismo tanto si sueldas 40 celdas recuperadas de un portátil como si diseñas el banco de 15 kWh que va a sostener tu casa.

---

## La escalera del constructor de baterías

```
NIVEL 0 — PRIMER PACK (sin experiencia, banco de pruebas de mesa)
  Material: 4-10 celdas 18650 nuevas o recuperadas · BMS básico 1S-4S
  Herramientas: multímetro, cargador-tester Liitokala Lii-500S
  Proyectos: power bank propio, batería para linterna/herramienta pequeña
  Inversión: 40-80€ (celdas + BMS + cargador)

NIVEL 1 — PACK EN SERIE-PARALELO (soldadura por puntos, primer BMS de verdad)
  Herramientas: soldadora de puntos (Sunkko 709A), níquel puro, termorretráctil
  Proyectos: pack 36V/48V para e-bike o patinete, UPS pequeño para router/PC
  Inversión: 200-450€ (soldadora + celdas + BMS 10S-13S + carcasa)

NIVEL 2 — ALMACENAMIENTO DOMÉSTICO EN LIFEPO4 (celdas prismáticas, DIY serio)
  Material: celdas EVE/CATL 280-314Ah · BMS Seplos/JK/Daly · busbars de cobre
  Proyectos: banco de 5-10 kWh acoplado a inversor híbrido, powerwall casero
  Inversión: 1.500-3.500€ (16 celdas + BMS + carcasa + cableado de potencia)

NIVEL 3 — SEGUNDA VIDA EV (despiece de módulos, mayor escala)
  Material: módulos de Nissan Leaf/Tesla/Kia recuperados, adaptador de voltaje
  Herramientas: cargador/descargador de potencia, aislamiento eléctrico de alta tensión
  Proyectos: banco de 15-30 kWh desde módulos EV, sustitución de batería de coche
  Inversión: 2.000-6.000€ según origen y estado de los módulos

NIVEL 4 — SISTEMA COMPLETO INSTRUMENTADO (monitorización, integración, escala)
  Herramientas: BMS con comunicación CAN/RS485, Node-RED/Home Assistant, shunt de precisión
  Proyectos: banco multi-rack con failover, integración con inversor híbrido y domótica,
  gestión remota de SOC/SOH en tiempo real
  Inversión: 5.000€+ (equipo completo, varios racks, instrumentación)
```

---

## Mapa del sector (14 notas)

| nota | qué cubre |
|---|---|
| [[Celdas de litio — 18650, 21700, LiFePO4 cilíndricas y prismáticas\|Celdas de litio]] | formatos, dimensiones, capacidades, fabricantes de referencia (Samsung, LG, Molicel, EVE, CATL) |
| [[Química y tecnologías emergentes — NMC, LFP, sodio-ion, solid-state\|Química y tecnologías emergentes]] | comparativa de químicas, sodio-ion comercial 2025-2026, solid-state, LFP de nueva generación (M3P, Shenxing) |
| [[BMS — selección, cableado y protecciones\|BMS]] | tipos de BMS, balanceo activo/pasivo, protecciones, comunicación CAN/RS485, marcas (JK, Daly, Seplos, Overkill) |
| [[Montaje de packs — soldadura por puntos, configuración serie-paralelo, balanceo\|Montaje de packs]] | técnica de soldadura por puntos, nickel strip, cálculo de configuración SxP, secuencia de montaje segura |
| [[Herramientas y equipamiento — soldadora, cargadores, testers, multímetros\|Herramientas y equipamiento]] | soldadoras de puntos, cargadores/testers de capacidad, multímetros, básculas, EPI |
| [[Segunda vida EV — Nissan Leaf, Tesla, despiece de módulos\|Segunda vida EV]] | despiece de módulos de coche eléctrico, voltajes y capacidades reales, dónde comprar en España |
| [[PowerWall DIY — diseño de sistema doméstico de almacenamiento\|PowerWall DIY]] | arquitectura de un banco doméstico, dimensionado, integración con inversor híbrido |
| [[Baterías de tracción y e-bikes — packs 48V, e-scooters, patinetes\|Baterías de tracción y e-bikes]] | packs para e-bike/patinete, motores y consumo, reparación de packs comerciales |
| [[Software y monitorización — SOC, balanceadores, Node-RED, Home Assistant, Victron\|Software y monitorización]] | cálculo de SOC/SOH, coulomb counting, integración con Home Assistant, Node-RED, Victron |
| [[Reciclaje y recuperación de celdas — testeo, criterios, cuándo descartar\|Reciclaje y recuperación]] | extracción de celdas de portátiles/herramientas, testeo de capacidad, criterios de descarte |
| [[Seguridad — thermal runaway, almacenamiento, extinción de incendios\|Seguridad]] | fuga térmica, señales de alerta, almacenamiento seguro, extinción, EPI |
| [[Normativa y transporte — ADR, UN3480, regulación España, gestión de residuos\|Normativa y transporte]] | ADR/IATA, envío de celdas y packs, normativa de almacenamiento energético en España, RAEE |
| [[Proyectos paso a paso — powerwall 5kWh, pack e-bike, UPS casero, banco de pruebas\|Proyectos paso a paso]] | tres proyectos completos con lista de materiales, pasos y verificación |
| [[Fuentes, comunidades y proveedores — tiendas España, foros, canales\|Fuentes y proveedores]] | tiendas España, foros internacionales, canales YouTube, grupos de Telegram |

---

## Últimas noticias y avances del sector

> El almacenamiento con litio en 2025-2026 se mueve en tres frentes a la vez: el litio LFP sigue bajando de precio y ganando densidad (M3P, Shenxing 3ª gen), el sodio-ion pasa de promesa a producto comprable en España, y la demanda de BESS para centros de datos de IA tensiona la cadena de suministro justo cuando el DIY con celdas recuperadas se vuelve más accesible que nunca.

```
NOVEDAD 1 (2026): CATL presenta en su Tech Day de abril su LFP Shenxing de 3ª generación y
  el Qilin NCM de 3ª generación, con carga del 10% al 98% en 6 minutos incluso en frío extremo
  y autonomías por encima de 1.000-1.500 km en aplicación automotriz — el salto de densidad y
  velocidad de carga en LFP reduce cada año la brecha con el NMC.

NOVEDAD 2 (2026): el sodio-ion llega al mercado residencial español de forma tangible — el
  fabricante austriaco Accupower vende su sistema Natec Home (7,68 kWh, 3,8 kW, ~3.990€) y el
  estonio Freen acepta pedidos en España. CATL anuncia producción en masa de su línea Naxtra
  para finales de 2026. Sigue sin ser la opción de referencia en DIY (catálogo de celdas sueltas
  todavía muy limitado) pero ya no es solo un anuncio de laboratorio.

NOVEDAD 3 (2025-2026): el precio de baterías LiFePO4 instaladas en Europa sigue cayendo — un
  100 Ah ronda 600-900€ y el coste por kWh ha bajado cerca de un 40% en tres años, empujado por
  la sobrecapacidad de fabricación china y la demanda paralela de BESS para IA que, pese a tirar
  del precio del litio al alza (~20.000 USD/tonelada), no ha frenado la caída del precio del pack.

NOVEDAD 4 (2025): Changan (con celdas CATL) anuncia baterías de sodio para VE a precio casi
  igual que LFP hoy, con previsión de abaratarse un tramo adicional en 2027 — la curva de precio
  del sodio-ion empieza a seguir la misma pendiente que vivió el litio hace una década.

NOVEDAD 5 (2025-2026): la integración de BMS DIY (diyBMS de Stuart Pittaway, JK-BMS) con
  Home Assistant vía MQTT/Modbus madura de forma notable — monitorizar SOC, voltaje por celda
  y temperatura en un dashboard propio, con automatizaciones de carga/descarga, ya no exige
  scripts caseros frágiles sino integraciones de comunidad mantenidas y documentadas.
```

---

## Conexiones con otros sectores

```
→ [[../solar-fotovoltaica-diy/00 - Solar Fotovoltaica DIY (MOC)|Solar Fotovoltaica DIY]] — el
  banco de baterías es el complemento natural de una instalación solar; ver su nota
  [[../solar-fotovoltaica-diy/Baterías y almacenamiento — LiFePO4, BMS, sodio-ion]] para el
  enfoque orientado a compra de sistema comercial (Pylontech, BYD, EG4) frente al enfoque DIY
  de este sector (celdas sueltas, BMS externo, segunda vida EV).
→ [[../eolica-hogar/00 - Eólica a escala hogar (MOC)|Eólica a escala hogar]] — otra fuente de carga
  para el mismo banco de baterías en sistemas híbridos solar+eólica.
→ [[../electronica-maker/00 - Electrónica Maker (MOC)|Electrónica Maker]] — la base de
  soldadura, protocolos I2C/CAN y microcontroladores (ESP32) que sostiene el BMS DIY y su
  monitorización; ver también su nota
  [[../electronica-maker/Alimentación — reguladores, baterías LiPo y USB-C PD]] para LiPo a
  pequeña escala (proyectos maker, no almacenamiento doméstico).
→ [[../domotica-iot/00 - Domótica e IoT (MOC)|Domótica e IoT]] — Home Assistant y Node-RED
  como capa de monitorización y automatización del SOC del banco de baterías.
```
