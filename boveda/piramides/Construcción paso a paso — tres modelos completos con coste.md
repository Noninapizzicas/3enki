---
tipo: proyecto
sector: piramides
tags: [construccion, proyecto, cobre, madera, PETG, coste, montaje]
---
# Construcción paso a paso — tres modelos completos con coste

> Tres proyectos reales, de menor a mayor compromiso — cada uno pensado para completarse en una sesión de taller razonable.

---

## Modelo 1 — Sobremesa impresa, 15-20 cm de base ★☆☆☆☆

```
MATERIALES:
  - PETG, 1 bobina compartida con otros proyectos (consumo real: 40-80 g) ........ 1-2,5€
  - (opcional) base de madera o corcho para apoyo .................................. 0-3€
TOTAL APROXIMADO: 3-6€ (si ya tienes impresora 3D)

HERRAMIENTA: impresora 3D (SPARKX i7 u otra con cama ≥220×220 mm), slicer
  (OrcaSlicer/Bambu Studio/PrusaSlicer)

PASOS:
  1. Fija base = 18 cm, ángulo = 51,84° → altura 11,45 cm, apotema 14,57 cm, arista 17,13 cm
     (tabla intermedia respecto a la de Geometría; recalcular con el script si cambias base)
  2. Modela en OpenSCAD/Fusion 360 una pirámide hueca con pared 2,5 mm, base cuadrada 18×18 cm
  3. Orienta en el slicer apoyada sobre la base, sin soportes (las 4 caras suben con ángulo
     suficiente para imprimirse sin voladizo problemático a este ángulo)
  4. Infill 15-20%, 3 perímetros, altura de capa 0,2 mm — ajustes estándar PETG
  5. Imprime (tiempo estimado 3-5h según impresora) y despega
  6. Postprocesado opcional: lijado de la línea de capa visible + barniz mate
TIEMPO TOTAL: una tarde (diseño + impresión + acabado)
```

---

## Modelo 2 — Estructura de cobre + conectores impresos, ≈60 cm de base ★★☆☆☆

```
MATERIALES:
  - Tubo de cobre Ø15 mm, ≈2,3 m totales (4 aristas de base 60 cm + 4 aristas laterales
    ≈57 cm, según tabla de Geometría para base 60 cm) — comprar 1 rollo de 25 m sobra para
    varios proyectos, o pedir el corte exacto en ferretería ................... 8-12€
  - 8 conectores impresos en 3D (4 de esquina de base, 1 de ápice que agrupa las 4 aristas
    laterales, 3 adicionales si se usa conector de punto medio) — PETG, ≈150-250 g total ..... 3-5€
  - Cortatubos de fontanería (herramienta reutilizable, no se gasta en el proyecto) ... 8-15€
TOTAL APROXIMADO (sin contar herramienta reutilizable): 11-17€
  + cortatubos si no lo tienes ya: +8-15€ (inversión única, sirve para más proyectos)

HERRAMIENTA: cortatubos, lija fina para rebabas, impresora 3D para los conectores, calibre
  para medir el diámetro exterior real del tubo antes de diseñar el alojamiento

PASOS:
  1. Base 60 cm → según tabla de Geometría: altura 38,18 cm, apotema 48,56 cm, arista 57,08 cm
  2. Mide con calibre el diámetro EXTERIOR real de tu tubo de 15 mm (normalmente ≈15,87 mm)
  3. Diseña/descarga el conector universal (ver nota de Impresión 3D) con ese diámetro +
     holgura de 0,2 mm para ajuste a presión
  4. Imprime: 4 conectores de esquina de base (3 vías) + 1 de ápice (4 vías)
  5. Corta con cortatubos: 4 tramos de 60 cm (base) + 4 tramos de 57,08 cm (aristas laterales)
     — descuenta la profundidad de inserción en cada conector (típicamente 1,5-2 cm por lado)
  6. Lija las rebabas de cada corte (imprescindible para que entre bien en el conector)
  7. Monta primero el cuadrado de la base con los 4 conectores de esquina
  8. Inserta las 4 aristas laterales en los conectores de esquina y júntalas en el conector
     de ápice — hazlo con la pirámide tumbada de lado, es más fácil que montarla ya vertical
  9. Orienta al norte (ver nota de Orientación) y nivela la base
TIEMPO TOTAL: una tarde completa (incluye tiempo de impresión de conectores en paralelo)
```

---

## Modelo 3 — Pirámide de meditación, ≈2 m de base, cobre o madera ★★★★☆

```
VARIANTE A — COBRE (más fiel a la tradición, más cara):
  - Tubo de cobre Ø15-18 mm, ≈8,5 m totales (4×2 m base + 4×2,28 m aristas laterales,
    tabla de Geometría para base 200 cm con factor escalado de 240→200 cm recalculado) ... 60-110€
  - 5 conectores impresos reforzados (pared 3 mm, infill 25-30%, PETG) ............. 8-15€
  - Perfil o pletina para reforzar la base si se va a sentar alguien encima/dentro (opcional,
    evita que el peso lateral abra las esquinas) .................................. 10-20€
  SUBTOTAL: ≈80-145€

VARIANTE B — MADERA:
  - Listón de pino cepillado 30×30 mm, ≈8,5 m totales ............................. 12-20€
  - Cola de carpintero + lija ...................................................... 3-5€
  - 5 conectores impresos reforzados (mismo criterio que arriba) ................... 8-15€
  - Aceite/barniz de acabado para exterior (si va a estar fuera) ................... 8-15€
  SUBTOTAL: ≈30-55€

HERRAMIENTA ADICIONAL FRENTE A MODELO 2: sierra de ingletes (para cortar con precisión
  tramos largos), nivel de burbuja grande, ayuda de una segunda persona para el montaje final
  (los tramos de 2+ m son difíciles de sostener en solitario mientras se encajan)

PASOS (ambas variantes, mismo esquema que el Modelo 2 a mayor escala):
  1. Base 200 cm → altura 127,27 cm, apotema 161,87 cm, arista 190,26 cm (interpolado de la
     tabla de Geometría: recalcula con el script de la nota si usas exactamente 200 cm)
  2. Monta primero el cuadrado de base COMPLETO y nivelado antes de levantar nada vertical
     — es la fase donde más se nota un error de medida
  3. Levanta las 4 aristas laterales apoyándolas en el suelo contra el conector de ápice ya
     puesto en el centro, y ve insertando una a una en los conectores de esquina — necesita
     dos personas a partir de aquí
  4. Si vas a sentarte dentro con frecuencia, añade el refuerzo de base (perfil/pletina) antes
     de dar por terminado el montaje — la base es el punto que más carga lateral recibe
  5. Orienta al norte verdadero con app de brújula en modo "norte real" (ver nota de
     Orientación) y nivela definitivamente
  6. Opcional: añade un cojín/tarima a ≈29% de la altura total (≈37 cm) si quieres replicar
     la proporción de la Cámara del Rey de Keops (ver nota de Orientación)
TIEMPO TOTAL: un fin de semana (diseño/impresión de conectores un día, corte y montaje otro)
```

---

## Comparativa rápida de los 3 modelos

```
MODELO                  │ BASE   │ COSTE APROX. │ DIFICULTAD │ TIEMPO
─────────────────────────┼─────────┼──────────────┼────────────┼───────────────
1. Sobremesa impresa     │ 18 cm  │ 3-6€         │ ★☆☆☆☆      │ 1 tarde
2. Cobre + conectores    │ 60 cm  │ 11-17€       │ ★★☆☆☆      │ 1 tarde
3. Meditación (cobre)    │ 200 cm │ 80-145€      │ ★★★★☆      │ 1 fin de semana
3. Meditación (madera)   │ 200 cm │ 30-55€       │ ★★★☆☆      │ 1 fin de semana
─────────────────────────┴─────────┴──────────────┴────────────┴───────────────
```

---

## Errores comunes de montaje

```
1. MONTAR LA ESTRUCTURA VERTICAL ANTES DE CERRAR BIEN LA BASE — si la base no queda cuadrada
   y nivelada primero, el error se amplifica al subir las 4 aristas hacia el ápice.
2. NO DESCONTAR LA PROFUNDIDAD DE INSERCIÓN DE LOS CONECTORES al cortar el tubo/listón — la
   pirámide queda sistemáticamente más pequeña de lo calculado si no se suma ese margen.
3. APRETAR DEMASIADO LOS TRAMOS EN LOS CONECTORES DE PETG — un ajuste a presión demasiado
   forzado puede fisurar el conector en la línea de capa; si cuesta mucho, lija 0,1-0,2 mm
   más el alojamiento en el siguiente lote en vez de forzar con martillo.
4. OLVIDAR EL REFUERZO DE BASE EN EL MODELO DE MEDITACIÓN si se va a sentar alguien dentro
   con cierta frecuencia — las esquinas de base son el punto que acumula la carga lateral.
```
