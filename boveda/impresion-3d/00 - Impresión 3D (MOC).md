---
tipo: moc
sector: impresion-3d
tags: [impresion-3d, FDM, resina, fabricacion-digital, DIY, slicer, CAD, moldes, gridfinity, moc]
---
# Impresión 3D

> De una Bambu Lab A1 Mini de 200€ imprimiendo un llavero de Printables a diseñar tu propia pieza en OpenSCAD, sacar un master, hacer un molde de silicona y producirlo en serie — la impresión 3D es la única disciplina maker donde el software que eliges (slicer, CAD, IA generativa) pesa tanto como la máquina que compras.

---

## La escalera del impresor 3D

```
NIVEL 0 — CONSUMIDOR DE ARCHIVOS (imprime lo que otros diseñan)
  Qué: 1 impresora FDM plug&play · descarga STL de Printables/Makerworld · imprime en PLA
  Software: slicer de fábrica (Bambu Studio / Creality Print) con perfil por defecto
  Inversión: 180-300€ (impresora) + 15-25€/kg filamento
  Tiempo hasta primera pieza útil: 1 tarde

NIVEL 1 — OPERADOR QUE DOMINA SU MÁQUINA
  Qué: calibra flujo, primera capa, retracción · imprime en PETG/ABS/TPU · resuelve warping y stringing
  Software: OrcaSlicer o PrusaSlicer con perfiles propios · calibración de flow rate y pressure advance
  Inversión: +50-100€ en accesorios (secador de filamento, boquillas de repuesto, cama texturizada)
  Salto: deja de culpar a la impresora y empieza a leer los síntomas de la pieza

NIVEL 2 — DISEÑADOR (crea sus propias piezas)
  Qué: modela en Tinkercad → Fusion 360/FreeCAD · diseña con tolerancias reales · escanea objetos
  Software: FreeCAD/Fusion 360 (paramétrico) + Meshmixer (reparación de malla) + Polycam (escaneo)
  Inversión: 0€ (todo el stack tiene capa gratuita/educativa) — el coste es tiempo de aprendizaje
  Salto: ya no busca el modelo que le falta, lo dibuja

NIVEL 3 — MULTITECNOLOGÍA + PRODUCCIÓN
  Qué: añade resina MSLA para detalle fino · hace moldes de silicona desde masters impresos ·
    produce en pequeña serie (jabones, joyería, piezas de repuesto)
  Software: + Lychee/Chitubox para resina · workflow CAD→master→molde→colada
  Inversión: 250-600€ (impresora de resina) + 40-80€/L resina + 60-150€ silicona de platino por molde
  Salto: la impresora deja de ser el producto final y pasa a ser una herramienta de producción

NIVEL EXPERTO — SELF-BUILD Y DISEÑO PARAMÉTRICO PURO
  Qué: construye una Voron desde piezas sueltas · diseña en OpenSCAD con librerías (BOSL2) ·
    tuning de resonancias (input shaper), multimaterial, IA generativa como primer boceto
  Software: OpenSCAD/BOSL2, Klipper, Meshy/Tripo3D como generador de bocetos 3D
  Inversión: 700-1.500€ en piezas sueltas + 40-80h de montaje y calibración
  Aplica cuando: quieres entender y controlar cada tornillo de la máquina, no solo usarla
```

---

## Mapa del sector (15 notas)

| nota | qué cubre |
|---|---|
| [[Tecnologías de impresión — FDM, resina y sinterizado\|Tecnologías de impresión]] | FDM, MSLA/SLA, SLS, MJF — principio físico, cuándo usar cada una, pros/contras reales |
| [[Máquinas FDM — Bambu Lab, Prusa, Creality, Voron\|Máquinas FDM]] | gama 2026 por precio, CoreXY vs bedslinger, Bambu X1C/P1S/A1, Prusa Core One/MK4S, Voron |
| [[Máquinas de resina — MSLA, DLP y Formlabs\|Máquinas de resina]] | Elegoo Saturn/Mars, Anycubic, Formlabs Form 4 — resolución, LCD mono, coste real de uso |
| [[Materiales FDM — PLA, PETG, ABS, ASA, TPU, Nylon, PC\|Materiales FDM]] | propiedades, temperaturas, secado, cuándo usar cada filamento, precios 2026 |
| [[Materiales de resina — estándar, ABS-like, flexible, plant-based\|Materiales de resina]] | tipos de resina, toxicidad, EPIs, water-washable, resinas técnicas |
| [[Software slicers — Bambu Studio, OrcaSlicer, PrusaSlicer, Cura\|Software slicers]] | diferencias, perfiles, parámetros clave, el cisma open-source de 2025-2026 |
| [[Software CAD y diseño paramétrico — FreeCAD, Fusion 360, OpenSCAD\|Software CAD y diseño paramétrico]] | FreeCAD, Fusion 360, Onshape, Tinkercad, OpenSCAD + BOSL2 |
| [[Escaneo 3D e IA generativa — de la realidad al modelo\|Escaneo 3D e IA generativa]] | LIDAR+Polycam, Revopoint, reparación de mallas, Meshy AI, Tripo3D |
| [[Diseño para impresión — tolerancias, ensamblajes, orientación\|Diseño para impresión]] | reglas de diseño, tolerancias de ensamblaje, orientación de pieza, soportes, paredes |
| [[Moldes y fundición — de la impresión a la producción en serie\|Moldes y fundición]] | master impreso, silicona de platino, colada, cera perdida, shrinkage por material |
| [[Calibración y parámetros — layer height, infill, soportes, resonancias\|Calibración y parámetros]] | los parámetros que más importan, pressure advance, input shaper, primeras capas |
| [[Postprocesado — lijado, química, pintura y acabados\|Postprocesado]] | lijado, acetona, XTC-3D, pintura, curado de resina, electrodeposición |
| [[Proyectos — Gridfinity, enclosures, jigs y piezas funcionales\|Proyectos]] | Gridfinity, enclosures electrónicos, jigs de carpintería, piezas de repuesto |
| [[Normativa y seguridad — VOCs, resina, ventilación, reciclaje\|Normativa y seguridad]] | emisiones FDM, toxicidad de resina, ventilación, reciclaje de filamento |
| [[Fuentes — proveedores, comunidades y canales España\|Fuentes]] | tiendas España, foros, Discord, YouTube, librerías de modelos |

---

## Últimas noticias y avances del sector

> Recogido en la investigación de 2025-2026.

```
NOVEDAD 1 (2026): Bambu Lab lanza el X2D (doble boquilla, cámara calefactada, correas
  mejoradas) apenas $100 por encima de su gama media, y el H2C presentado en Formnext 2025
  con hasta 6 boquillas intercambiables enfocado a minimizar residuo de purga en piezas
  multicolor complejas. La gama se abre también por abajo con el A2L (más volumen que el
  A1 a precio de entrada).

NOVEDAD 2 (2025-2026): estalla el cisma del código abierto — Bambu Studio, con licencia
  AGPLv3, está bajo investigación formal de la Software Freedom Conservancy por retener
  código fuente del componente de red. OrcaSlicer (fork comunitario de Bambu Studio, que a
  su vez desciende de PrusaSlicer y de Slic3r) gana terreno como alternativa realmente
  abierta con calibración integrada (pressure advance, flow rate, MVS) y soporte para
  prácticamente cualquier impresora FDM del mercado.

NOVEDAD 3 (2025): la IA generativa de modelos 3D pasa de curiosidad a herramienta real —
  Tripo3D lanza su modelo 3.0 (agosto 2025, ~20.000M de parámetros) con geometría, texturas
  basadas en física y topología limpia en quads, y el modo Ultra (septiembre 2025) para
  activos de mayor calidad. Meshy AI genera modelos listos para producción en 20-30 segundos
  desde texto o imagen. Siguen sin sustituir el diseño CAD para piezas funcionales con
  tolerancias, pero ya sirven como boceto de partida serio.

NOVEDAD 4 (2026): el mercado global de impresión 3D cierra 2025 por encima de 25.000
  millones de dólares en ingresos (+23% interanual), con las ventas de impresoras de gama
  baja disparándose un 47% — la Elegoo Centauri Carbon (250-300€, CoreXY) se convierte en
  la sorpresa de la gama media-baja frente a las bedslingers tradicionales.

NOVEDAD 5 (2026): Prusa consolida su respuesta CoreXY con el Core One+ (montada 1.349€,
  kit 1.049€) y su hermano mayor Core One L con casi el doble de volumen. Creality gana el
  premio a mejor impresora del CES 2026 con la SPARKX i7, y su serie K sigue empujando
  velocidad CoreXY (K1C a 600 mm/s) a precio agresivo.
```

---

## Sectores hermanos

```
→ [[../carpinteria-cnc/00 - Carpintería CNC (MOC)|Carpintería CNC]] — jigs y plantillas de
  carpintería impresas en 3D, FreeCAD compartido como CAD, nesting de piezas
→ [[../electronica-maker/00 - Electrónica Maker (MOC)|Electrónica Maker]] — enclosures
  impresos para PCBs y proyectos ESP32/Arduino, LumenPnP como ejemplo de máquina open-source
```

No se duplican aquí las técnicas de fresado CNC ni el diseño de PCB — solo se referencian donde el flujo de trabajo se cruza (un enclosure diseñado en FreeCAD sirve tanto para impresión 3D como para corte CNC).
