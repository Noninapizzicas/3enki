---
tipo: moc
sector: cnc-laser-diy
tags: [cnc, laser, laser-diodo, laser-co2, fresadora, lightburn, fabricacion-digital, diy, maker]
---
# CNC y Láser DIY

> El día que entiendes que un haz de luz enfocado corta madera igual de limpio que una sierra y que el mismo ordenador que dibuja el vector también mueve la máquina, dejas de comprar objetos y empiezas a fabricarlos — este sector es el puente entre el diseño en pantalla y la pieza física, con el láser como la puerta de entrada más barata y la fresadora CNC como el siguiente nivel de fuerza bruta.

---

## La escalera del fabricante digital

```
NIVEL 0 — GRABADOR DE ESCRITORIO (diodo básico)
  Qué: 1 láser de diodo 5-10W óptico · graba madera y cuero · corta cartón fino
  Máquina: Ortur Laser Master 2/3 o Sculpfun S9 (150-300€, 2026)
  Software: LaserGRBL (gratis) para grabado, LightBurn Core (78€, licencia única) en cuanto cortas
  Inversión total: 200-400€ · primera pieza útil: la misma tarde

NIVEL 1 — CORTADOR SERIO (diodo 20-40W)
  Qué: corta madera de 10-20mm en una pasada · air assist integrado · corta acrílico negro
  Máquina: xTool D1 Pro 20W o Sculpfun S30 Ultra 33W (350-1.200€)
  Software: LightBurn Pro + Inkscape para vectorizar
  Inversión: +150-300€ en extracción de humos y honeycomb bed
  Salto: dejas de comprar plantillas y empiezas a diseñarlas

NIVEL 2 — ENCLOSURE + CO2 (seguridad y versatilidad)
  Qué: máquina cerrada clase 1 (sin gafas obligatorias) o CO2 que corta acrílico transparente
    y graba vidrio/piedra, algo que el diodo no hace
  Máquina: xTool S1 40W (enclosure) o K40/OMTech K40+ modificado con LightBurn (600-2.100€)
  Software: LightBurn Pro con boolean ops, rotary attachment
  Inversión: +200-400€ en upgrade de controlador si partes de un K40 de fábrica
  Salto: metes rotary (vasos, botellas) y empiezas a pensar en vender piezas

NIVEL 3 — FRESADORA CNC (el complemento de fuerza)
  Qué: donde el láser no llega — relieves 3D, mecanizado de aluminio, piezas estructurales
  Máquina: Shapeoko 5 Pro (2.400-2.900€) o LowRider 3 DIY (400-800€ en piezas)
  Software: Fusion 360 CAM o VCarve/Aspire + CAMotics para simular antes de cortar
  Inversión: +300-600€ en router bits variados y husillo
  Salto: ya no cortas plano, tallas volumen

NIVEL EXPERTO — TALLER MULTITECNOLOGÍA + NEGOCIO
  Qué: láser + CNC + fibra para metal trabajando en flujo · producción en pequeña serie ·
    servicio de corte para terceros o tienda propia en Etsy
  Software: stack completo (LightBurn + Fusion 360 + gestión de pedidos)
  Inversión: 4.000-8.000€ en equipo completo + 100-300€/mes en consumibles y mantenimiento
  Aplica cuando: la máquina paga su propio upgrade con encargos reales
```

---

## Mapa del sector (13 notas)

| nota | qué cubre |
|---|---|
| [[Cortadoras láser — diodo, CO2 y fibra\|Cortadoras láser]] | tipos de láser, marcas y modelos 2026, potencias reales, qué máquina para qué uso |
| [[Láser DIY — construcción, upgrades K40 y enclosures\|Láser DIY]] | montar tu propio láser, modificar un K40, controladores, firmware, enclosures y clases de seguridad |
| [[Materiales para láser — qué corta cada potencia\|Materiales para láser]] | tabla de materiales por potencia y pasadas, qué NO cortar nunca, humos tóxicos |
| [[Air assist, extracción y seguridad láser — clase 4, EPIs, normativa\|Seguridad láser]] | air assist, extracción HEPA+carbón, honeycomb, rotary, gafas OD, normativa España |
| [[Software de corte láser — LightBurn, LaserGRBL, xTool Creative Space\|Software de corte láser]] | LightBurn a fondo, LaserGRBL, software propietario, flujo de trabajo |
| [[Diseño vectorial y fuentes de archivos — Inkscape, Affinity, CorelDraw, Etsy, Cults3D\|Diseño vectorial y fuentes]] | herramientas de diseño 2D, dónde comprar/descargar archivos de corte |
| [[Fresadoras CNC — escritorio y DIY (Shapeoko, Onefinity, LowRider3, MPCNC)\|Fresadoras CNC]] | máquinas de escritorio comerciales y proyectos open-source autoconstruibles |
| [[Router bits y parámetros de corte — feeds, speeds, brocas\|Router bits y parámetros]] | tipos de fresa, cuándo usar cada una, feedrate/RPM/DOC por material |
| [[Software CAM y control CNC — VCarve, Fusion 360, CAMotics, GRBL\|Software CAM y control]] | de la pieza en pantalla al G-code verificado y ejecutado |
| [[Proyectos láser — ideas y tutoriales paso a paso\|Proyectos láser]] | finger joints, mandalas, personalización, señalética, cutting boards |
| [[Proyectos CNC — relieves, letras, moldes, jigs\|Proyectos CNC]] | relieve en madera, letras 3D, moldes, jigs y plantillas |
| [[Negocio con láser y CNC — servicio, Etsy, cálculo €-hora\|Negocio]] | corte para terceros, personalización, Etsy, cálculo de tarifas reales |
| [[Fuentes — proveedores, comunidades y canales España\|Fuentes]] | dónde comprar en España, foros, Reddit, Discord, YouTube |

---

## Sectores hermanos

```
→ [[../carpinteria-cnc/00 - Carpintería CNC (MOC)|Carpintería CNC]] — routers CNC open-source
  centrados en madera (Maslow, MPCNC, PrintNC), FreeCAD y nesting de piezas. Este sector
  referencia esas máquinas para fresado en madera y no repite el detalle de construcción.
→ [[../impresion-3d/00 - Impresión 3D (MOC)|Impresión 3D]] — Gridfinity, jigs impresos,
  OpenSCAD y FreeCAD como CAD compartido. Los enclosures y soportes de un láser DIY a
  menudo se imprimen en 3D — no se duplica aquí el diseño paramétrico.
```

No se duplica en este sector el detalle de construcción de una MPCNC/PrintNC (ver carpinteria-cnc) ni el diseño paramétrico en FreeCAD/OpenSCAD (ver impresion-3d) — solo se referencian donde el flujo de trabajo se cruza.

---

## Últimas noticias y avances del sector

> Recogido en la investigación de 2025-2026.

```
NOVEDAD 1 (2025-2026): xTool consolida el S1 (enclosure clase 1, cabezales intercambiables
  10W/20W/40W diodo + módulo IR 1064nm para metal) como su buque insignia de seguridad, con
  la revisión de hardware v1.2 (enero 2025) mejorando el interlock de la tapa y añadiendo
  WiFi. En paralelo Sculpfun lanza la serie S30 Ultra (11W/22W/33W con lente intercambiable,
  eje X sobre raíl lineal de 0,005mm) y el S70 MAX de 72W de potencia de corte — la carrera
  de potencia en diodo sigue subiendo cada año.

NOVEDAD 2 (2025): el mercado de diodo se satura de opciones de 40-60W ópticos gracias a
  módulos combinados (8 diodos de 5,5W fusionados en un solo haz en el caso de xTool, por
  ejemplo) que igualan la capacidad de corte de un CO2 de gama media en madera y acrílico
  oscuro, sin el mantenimiento de tubo de vidrio ni espejos que exige el CO2.

NOVEDAD 3 (2025-2026): LightBurn sigue siendo el estándar de facto — versión 2.1.x con
  soporte ampliado de dispositivos GCode/DSP/Galvo, mientras la escena open-source empuja
  alternativas (LaserGRBL para grabado gratuito, MeerK40t para K40 sin licencia) que ganan
  tracción entre quienes empiezan con presupuesto mínimo.

NOVEDAD 4 (2026): xTool presenta en CES 2026 su tecnología de impresión UV, expandiendo su
  catálogo más allá del láser puro hacia personalización de superficies — la marca pasa de
  fabricante de diodo a ecosistema completo (láser + DTF + UV + soldadura láser) en apenas
  tres años, y se consolida como la marca más reseñada en YouTube del sector prosumer.

NOVEDAD 5 (2025-2026): en CNC de escritorio, Inventables descontinúa el X-Carve original
  (diciembre 2024) dejando solo el X-Carve Pro (7.495$, enfoque pequeño negocio) — el hueco
  lo llenan Shapeoko 5 Pro, Onefinity Foreman y la irrupción de Sienci (LongMill MK2,
  AltMill) como alternativas de kit más económicas y con mejor rigidez por precio.
```
