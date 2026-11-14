---
tipo: componente
sector: piramides
tags: [impresion-3d, PETG, conectores, tolerancias, openscad, fusion360]
---
# Impresión 3D — conectores, piezas modulares y maquetas

> Un buen conector impreso convierte cualquier tubo de ferretería en una pirámide en 10 minutos — es la pieza que vuelve accesible todo este sector.

---

## El taller de referencia de esta bóveda

```
IMPRESORA: SPARKX i7 (ver [[impresion-3d/00 - Impresión 3D (MOC)|Impresión 3D]] y
  arquitectura/cabecera/impresion-3d/cola-trabajo.md para el detalle del taller)
VOLUMEN DE IMPRESIÓN: 220 × 220 × 250 mm
MATERIAL POR DEFECTO DEL TALLER: PETG
IMPLICACIÓN PRÁCTICA: una pirámide de sobremesa de hasta ≈30 cm de base cabe entera en una
  sola pieza hueca si se diseña tumbada o diagonal; por encima de eso, o si se construye en
  cobre/madera/aluminio a cualquier escala, se necesitan PIEZAS MODULARES (conectores
  separados) — la cama de 220×220 mm es también el límite práctico de cualquier pieza
  individual del diseño, incluidos los conectores más grandes para tubo de 22-28 mm
```

---

## Tipos de conector de vértice

```
CONECTOR DE ÁPICE (vértice superior) — 4 vías que convergen en el punto más alto:
  ángulo entre aristas adyacentes = 63,43° (constante, ver [[Geometría aplicada — proporción
  de Keops, fórmulas y tabla de medidas]]) — el conector debe tener 4 alojamientos cilíndricos
  dispuestos con ese ángulo entre cada par adyacente

CONECTOR DE ESQUINA DE BASE (vértice inferior) — 3 vías: las 2 aristas de base que confluyen
  en la esquina (a 90° entre sí, en el plano horizontal) + la arista lateral que sube hacia
  el ápice (inclinada 41,99° sobre la horizontal) — es el conector más complejo de diseñar
  bien porque combina un ángulo recto (base) con uno oblicuo (arista lateral)

CONECTOR DE PUNTO MEDIO DE BASE (opcional, solo en bases grandes, >1,5 m) — refuerzo en el
  punto medio de cada lado de la base para evitar que el tubo/varilla flexe por su propio peso
  antes de llegar a las esquinas; útil en madera y en cobre de diámetro pequeño (10-12 mm) a
  escala de meditación

ALOJAMIENTO (el "agujero" donde entra el tubo) — diámetro interior del alojamiento =
  diámetro exterior real del tubo/varilla + holgura de tolerancia (ver abajo), NUNCA el
  diámetro nominal comercial (p. ej. un tubo de cobre "15 mm" mide realmente ≈15,87 mm de
  diámetro exterior — mide siempre con un calibre antes de diseñar)
```

---

## Tolerancias PETG — lo que de verdad importa

```
HOLGURA RECOMENDADA PARA AJUSTE A PRESIÓN (tubo entra con algo de fricción, sin pegamento,
  desmontable): diámetro del alojamiento = diámetro exterior medido del tubo + 0,15-0,25 mm
HOLGURA PARA AJUSTE CON PEGAMENTO/PERMANENTE: + 0,3-0,4 mm (deja espacio para la línea de
  cianocrilato/epoxi sin forzar la pieza y arriesgar una grieta por tensión en la capa)
PARED MÍNIMA DEL CONECTOR alrededor del alojamiento: 2-3 mm en PETG con infill 15-20% para
  resistir el peso de estructuras de meditación; en sobremesa pequeña, 1,5-2 mm es suficiente
ORIENTACIÓN DE IMPRESIÓN: imprimir el conector de ápice con las 4 vías apuntando hacia
  arriba/afuera desde una base plana (no necesita soportes si se diseña con una cara plana de
  apoyo); el conector de esquina de base normalmente sí necesita soportes ligeros en el
  alojamiento de la arista inclinada
CALIBRACIÓN PREVIA: imprime SIEMPRE una pieza de prueba con un solo alojamiento antes de
  lanzar el lote completo de conectores — el flow rate y el primer-capa de tu impresora
  concreta cambian el diámetro real resultante respecto al modelo CAD en 0,1-0,3 mm
```

---

## Piezas modulares que caben en la cama de 220×220 mm

```
ESTRATEGIA 1 — PIRÁMIDE COMPLETA EN UNA PIEZA (hasta ≈18-20 cm de base): se imprime hueca,
  tumbada sobre una cara o con la base apoyada y soportes internos ligeros para las caras
  inclinadas; el único límite real es que la diagonal de la base quepa en el plato
ESTRATEGIA 2 — ESTRUCTURA MODULAR CON CONECTORES + VARILLA/TUBO CORTO IMPRESO: para bases
  medianas (30-60 cm) sin usar cobre/madera, se imprimen también las 8 aristas como piezas de
  PETG rígido, cada una por debajo de 220 mm, y se unen con los conectores — más barato que
  cobre, más rápido que esperar una impresión única larga
ESTRATEGIA 3 — SOLO CONECTORES, ARISTAS EN MATERIAL EXTERNO (cobre/madera/aluminio) — el caso
  más habitual para 45 cm en adelante: solo se imprimen los conectores (pequeños, caben varios
  a la vez en el plato), las aristas se cortan a medida con la tabla de la nota de Geometría
```

---

## Diseños existentes — qué usar y por qué

```
GOLDEN RATIO PYRAMID PIPE CONNECTORS (Thingiverse, paramétrico en Fusion 360 .f3d) —
  conectores de pirámide ajustables por parámetro, pensados para tubo de diferentes diámetros;
  punto de partida si quieres modificar el ángulo o el diámetro tú mismo
UNIVERSAL MODULAR PIPE CONNECTOR (MakerWorld) — genera conectores de 3, 4, 5 y 6 vías
  introduciendo solo el diámetro EXTERIOR del tubo; compatible con PVC, aluminio, varilla de
  madera, fibra de carbono y cobre — la opción más versátil si no quieres modelar nada y solo
  necesitas "un conector que encaje con mi tubo"
ARCHIVO 3MF MULTI-PIRÁMIDE (MakerWorld) — pirámides de 3, 4 y 5 lados con conectores y
  varillas en un solo archivo, pensado para imprimir todo en un color o combinación de colores
  en una sola sesión — útil para probar varios tamaños/formas sin diseñar nada
CRITERIO DE ELECCIÓN: si tu tubo es un diámetro "raro" (cobre comercial español: 6, 10, 12-13,
  15-16, 18, 22, 28 mm) usa el conector UNIVERSAL parametrizable antes que uno con medida fija
  pensada para pulgadas americanas
```

---

## Maquetas completas de sobremesa — flujo de trabajo

```
1. Elegir base (10-30 cm, tabla de Geometría) y ángulo (51,84° por defecto)
2. Modelar en OpenSCAD/Fusion 360/Tinkercad (ver [[impresion-3d/Software CAD y diseño paramétrico — FreeCAD, Fusion 360, OpenSCAD|Software CAD y diseño paramétrico]]) con las
   fórmulas de la nota de Geometría como parámetros de entrada (base, ángulo → altura/apotema)
3. Hueca con pared de 2-3 mm si es pieza única, o modular con conectores si prefieres poder
   desmontarla
4. Slicer: 15-20% infill, sin soportes si se orienta bien (apoyada en la base, caras que
   suben sin voladizo agresivo salvo cerca del vértice)
5. Postprocesado opcional: lijado fino + pintura o barniz si se quiere acabado "premium" para
   regalo o venta (ver [[impresion-3d/Postprocesado — lijado, química, pintura y acabados|Postprocesado]])
```

---

## Errores comunes

```
1. DISEÑAR EL ALOJAMIENTO CON EL DIÁMETRO NOMINAL EN VEZ DEL REAL — "tubo de 15 mm" casi
   nunca mide exactamente 15,00 mm; mide siempre con calibre antes de fijar la tolerancia.
2. NO IMPRIMIR UNA PIEZA DE PRUEBA — lanzar 8 conectores de golpe sin validar uno primero es
   la forma más cara de descubrir que la tolerancia estaba mal calculada.
3. OLVIDAR LOS SOPORTES EN EL CONECTOR DE ESQUINA DE BASE — el alojamiento inclinado a 41,99°
   suele necesitar soporte interno o reorientación del modelo, si no sale deformado por voladizo.
4. USAR PLA EN EXTERIOR — una pirámide de PLA en una terraza orientada al sol se deforma en
   verano; PETG o un material con mejor Tg es obligatorio fuera de casa.
```

---

## Novedades 2024-2026

```
→ MakerWorld consolida en 2025-2026 su librería de conectores "universales" parametrizables
  por un solo diámetro, reduciendo a minutos lo que antes exigía modelar desde cero en CAD.
→ El salto de calidad de la IA generativa de modelos 3D (Tripo3D 3.0, Meshy AI) permite ya
  generar un boceto de pirámide o conector en segundos a partir de texto/imagen — útil como
  punto de partida, pero las tolerancias finas de un conector de ajuste a presión siguen
  necesitando el ajuste manual en CAD paramétrico descrito arriba.
```
