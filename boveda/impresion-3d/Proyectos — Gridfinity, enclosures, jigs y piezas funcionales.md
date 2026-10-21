---
tipo: proyecto
sector: impresion-3d
tags: [proyectos, Gridfinity, enclosures, jigs, robotica, drones, piezas-repuesto]
---
# Proyectos — Gridfinity, enclosures, jigs y piezas funcionales

> Los proyectos que enganchan de verdad no son los más vistosos — son los que resuelven un problema real del propio taller, y por eso Gridfinity se ha convertido en el proyecto más replicado de toda la comunidad.

---

## Gridfinity — el sistema de organización que se volvió estándar

```
QUÉ ES: sistema modular de cajones/organizadores basado en una unidad de rejilla de
  42x42mm — cualquier contenedor diseñado con esa base encaja en cualquier bandeja base
  Gridfinity de cualquier persona, sin coordinación previa (estándar abierto de facto)
ORIGEN: creado por Zack Freedman (YouTube), liberado como diseño abierto — de ahí que
  toda la comunidad haya podido construir generadores y variantes sobre la misma base

DÓNDE EMPEZAR:
  → Gridfinity Generator (gridfinitygenerator.com): herramienta web interactiva, exporta
    STL directamente sin tocar ningún CAD — el punto de entrada más rápido posible
  → Colecciones completas en Printables, Makerworld y Cults3D con tag "gridfinity" —
    miles de contenedores ya diseñados para herramientas específicas (destornilladores,
    brocas, componentes SMD, tornillería)
  → Gridfinity Layout Tool: planificador visual de distribución de cajón antes de imprimir,
    con vista previa 3D y colocación por arrastrar y soltar

DIFICULTAD: ★☆☆☆☆ para usar diseños ya hechos · ★★★☆☆ para diseñar variantes propias en
  OpenSCAD/Fusion 360 con la especificación oficial de Gridfinity como base paramétrica
MATERIAL RECOMENDADO: PLA es suficiente (sin carga mecánica exigente), PETG si el cajón
  se usa muy intensivamente o cerca de calor (taller, garaje sin climatizar)
```

---

## Enclosures para electrónica

```
QUÉ RESUELVE: proteger una PCB/ESP32/Arduino con acceso a puertos, botones y ventilación
  necesaria — el paso natural tras terminar un proyecto en
  [[../electronica-maker/00 - Electrónica Maker (MOC)|Electrónica Maker]]

DISEÑO TÍPICO: caja de dos piezas (base + tapa) con postes de tornillo autorroscante
  (M3, agujero de 2,5-2,8mm para autorroscante en plástico), recortes exactos para
  conectores USB-C/puertos y ventilación por rejilla si hay disipación de calor

HERRAMIENTAS ÚTILES: existen generadores paramétricos de enclosures (basados en OpenSCAD)
  que a partir de las dimensiones de la PCB generan la caja completa — mucho más rápido
  que modelar cada caja desde cero para cada proyecto nuevo

DIFICULTAD: ★★☆☆☆ con generador paramétrico · ★★★☆☆ diseñando a medida en CAD desde cero
  con encajes de tornillo, recortes de conector y tolerancias correctas
MATERIAL RECOMENDADO: PETG para uso general (mejor que PLA a temperatura ambiente de
  interior con electrónica que disipa algo de calor), ASA si la caja va a exterior
```

---

## Jigs y plantillas de carpintería

```
QUÉ RESUELVE: plantillas de taladrado repetitivo, topes de corte, guías de fresado —
  el cruce natural con [[../carpinteria-cnc/00 - Carpintería CNC (MOC)|Carpintería CNC]]
  y carpintería DIY tradicional, donde una plantilla impresa sustituye a una de madera
  hecha a mano cuando se necesita repetibilidad exacta

EJEMPLOS TÍPICOS: plantilla de posición de bisagras, guía de taladrado a ángulo fijo,
  tope de corte para repetir la misma longitud en varias piezas, guía de router para
  ranuras/rebajes repetidos

DIFICULTAD: ★★☆☆☆ — geometría normalmente simple (extrusión 2D con agujeros guía), el
  reto real está en medir bien la pieza/herramienta real antes de diseñar el encaje
MATERIAL RECOMENDADO: PETG o ABS (más resistencia al roce y golpes de taller que PLA) —
  para jigs que se reutilizan mucho, Nylon si hay fricción constante con metal (guía de
  broca metálica, por ejemplo)
```

---

## Piezas de repuesto

```
QUÉ RESUELVE: sustituir una pieza de plástico rota de un electrodoméstico, mueble o
  herramienta que ya no se fabrica o cuyo repuesto original tarda semanas en llegar

FLUJO TÍPICO: 1) medir la pieza rota con calibre (o escanear con Polycam si la geometría
  es compleja — ver [[Escaneo 3D e IA generativa — de la realidad al modelo]]) → 2)
  modelar en CAD replicando dimensiones críticas → 3) elegir material según el uso real
  de la pieza original (¿lleva carga? ¿está cerca de calor? ¿fricción con otra pieza?)

DIFICULTAD: ★★★☆☆ — la parte difícil no es imprimir, es medir bien y elegir el material
  correcto para que la pieza dure más que la original que se rompió
MATERIAL RECOMENDADO: depende totalmente del uso — Nylon/PA-CF para engranajes y piezas
  de fricción, PETG/ABS para carcasas y soportes, TPU si la pieza original era de goma
```

---

## Robótica y drones

```
QUÉ RESUELVE: chasis, soportes de motor, brazos de dron, carcasas de robot — el segmento
  donde la relación peso/resistencia del material importa más que en casi ningún otro uso

MATERIALES TÍPICOS: PETG-CF o PA-CF para piezas estructurales que necesitan rigidez sin
  exceso de peso, TPU para amortiguadores de motor/hélice (reduce vibración transmitida
  al chasis), PLA solo para prototipo de forma antes de la pieza definitiva

DIFICULTAD: ★★★★☆ — requiere pensar en tolerancias de rodamiento, disipación de calor de
  motores y resistencia a vibración constante, no solo la forma exterior de la pieza

CRUCE CON ELECTRÓNICA: brazos de dron y chasis de robot casi siempre integran el enclosure
  de la electrónica de control en el mismo diseño — ver
  [[../electronica-maker/Actuadores — motores, servos, relés y control de potencia|Actuadores]]
  para el lado eléctrico del proyecto
```

---

## Tabla resumen de proyectos por dificultad y material

```
PROYECTO              DIFICULTAD   MATERIAL RECOMENDADO   TIEMPO TÍPICO DE IMPRESIÓN
Gridfinity (usar)      ★☆☆☆☆        PLA                     1-4h por contenedor
Gridfinity (diseñar)   ★★★☆☆        PLA                     variable (diseño + impresión)
Enclosure electrónica  ★★☆☆☆-★★★☆☆  PETG/ASA                2-6h
Jig de carpintería     ★★☆☆☆        PETG/ABS/Nylon          1-3h
Pieza de repuesto      ★★★☆☆        Según pieza original    1-4h
Chasis robótica/dron   ★★★★☆        PETG-CF/PA-CF/TPU       4-12h
```

---

## Errores comunes en proyectos

```
★★★★☆ Diseñar un enclosure sin dejar tolerancia en los recortes de conector — el USB-C
  o el botón queda 0,5mm desalineado y no encaja limpio (ver nota de diseño para tolerancias)
★★★★☆ Usar PLA en piezas que van a estar cerca de un motor/electrónica que disipa calor
  constante — se ablanda con el tiempo aunque parezca aguantar bien al principio
★★★☆☆ No medir la pieza de repuesto en varios puntos antes de modelar — piezas
  "aparentemente simples" (bisagras, encajes) suelen tener geometría más compleja de lo
  que parece a simple vista
★★★☆☆ Empezar un proyecto de robótica/dron con el material equivocado por priorizar
  "lo que ya tengo en el rollo" antes que lo que la pieza realmente necesita
```

---

## Novedades 2025-2026

```
→ Gridfinity sigue creciendo como estándar de facto de organización de taller maker —
  las colecciones en Printables y Makerworld ya cubren prácticamente cualquier herramienta
  común, reduciendo cada vez más la necesidad de diseñar contenedores desde cero
→ Los generadores paramétricos de enclosures (sobre OpenSCAD/BOSL2) se multiplican en la
  comunidad, acortando drásticamente el tiempo entre "terminar el proyecto electrónico" y
  "tener una caja a medida impresa"
→ El abaratamiento de filamentos técnicos (PA-CF, PETG-CF) pone piezas de robótica/dron
  de nivel semi-profesional al alcance de presupuesto hobbista, algo impensable hace pocos años
```
