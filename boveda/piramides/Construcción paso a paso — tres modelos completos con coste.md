---
tipo: proyecto
sector: piramides
tags: [construccion, proyecto, cobre, madera, PETG, coste, montaje]
---
# Construcción paso a paso — tres modelos completos con coste

> Tres proyectos reales, de menor a mayor compromiso — cada uno pensado para completarse en una sesión de taller razonable.
> Todas las medidas usan la proporción de Keops (51,84°). Precios = estimación con los €/m de [[Materiales — cobre, madera, PETG, acrílico y aluminio]]; confirma con tu proveedor.

---

## Modelo 1 — Sobremesa impresa, 15-20 cm de base ★☆☆☆☆

```
MATERIALES:
  - PETG: ≈80 g con pared 1,2 mm (≈170 g con pared 2,5 mm) ......................... 2-4€
  - (opcional) base de madera o corcho para apoyo .................................. 0-3€
TOTAL APROXIMADO: 2-7€ (si ya tienes impresora 3D)

HERRAMIENTA: impresora 3D (SPARKX i7 u otra con cama ≥220×220 mm), slicer
  (OrcaSlicer/Bambu Studio/PrusaSlicer)

PASOS:
  1. Fija base = 18 cm, ángulo = 51,84° → altura 11,45 cm, apotema 14,57 cm, arista 17,12 cm
     (recalcula con el script de Geometría si cambias la base)
  2. Modela en OpenSCAD/Fusion 360 una pirámide hueca de pared 1,2 mm (3 perímetros de 0,4),
     base cuadrada 18×18 cm y BASE ABIERTA para poder colocar el objeto de prueba debajo
  3. Orienta en el slicer apoyada sobre la base, sin soportes (las caras forman 38° con la
     vertical, voladizo imprimible sin problema)
  4. 3 perímetros, sin infill (la pared ES los perímetros), altura de capa 0,2 mm, PETG estándar
  5. Imprime (tiempo estimado 3-5 h según impresora) y despega
  6. Postprocesado opcional: lijado de la línea de capa visible + barniz mate
TIEMPO TOTAL: una tarde (diseño + impresión + acabado)
```

---

## Modelo 2 — Estructura de cobre + conectores impresos, ≈60 cm de base ★★☆☆☆

```
MATERIALES:
  - Tubo de cobre ≈4,7 m totales (4 aristas de base 60 cm + 4 aristas laterales 57,08 cm)
    → compra 5 m para tener margen de corte ................................... ≈20-25€
      · Opción A: 5/8" (Ø15,87 mm) de climatización, rollo, ≈4,5 €/m (blando, endereza a mano)
      · Opción B: barra rígida de fontanería Ø15 mm (Ø exterior 15,0 mm), más recta
  - 5 conectores impresos en 3D (4 de esquina de 3 vías + 1 de ápice de 4 vías)
    — PETG, ≈75-150 g total .......................................................... 2-4€
  - Cortatubos de fontanería (herramienta reutilizable, no se gasta en el proyecto) ... 8-15€
TOTAL APROXIMADO (sin contar herramienta reutilizable): ≈22-29€
  + cortatubos si no lo tienes ya: +8-15€ (inversión única, sirve para más proyectos)

HERRAMIENTA: cortatubos, lija fina para rebabas, impresora 3D para los conectores, calibre
  para medir el diámetro exterior real del tubo antes de diseñar el alojamiento

PASOS:
  1. Base 60 cm → altura 38,18 cm, apotema 48,56 cm, arista 57,08 cm
  2. Mide con calibre el diámetro EXTERIOR real de tu tubo: 15,0 mm si es de fontanería métrica,
     15,87 mm si es 5/8" de climatización — NO son el mismo tubo
  3. Diseña/descarga el conector universal (ver [[Impresión 3D — conectores, piezas modulares y maquetas]])
     con ese diámetro + holgura de 0,2 mm para ajuste a presión
  4. Imprime: 4 conectores de esquina de base (3 vías) + 1 de ápice (4 vías)
  5. Corta con cortatubos aplicando la regla:
       largo_tubo = arista − 2 × d   (d = distancia del vértice teórico al tope del alojamiento,
                                      la da el diseño del conector)
     → 4 tramos de base (60 − 2d) + 4 tramos laterales (57,08 − 2d)
  6. Lija las rebabas de cada corte (imprescindible para que entre bien en el conector)
  7. Monta primero el cuadrado de la base con los 4 conectores de esquina
  8. Inserta las 4 aristas laterales en los conectores de esquina y júntalas en el conector
     de ápice — hazlo con la pirámide tumbada de lado, es más fácil que montarla ya vertical
  9. Orienta al norte (ver [[Orientación y colocación — norte, brújula y cámara del rey]]) y nivela la base
TIEMPO TOTAL: una tarde completa (incluye tiempo de impresión de conectores en paralelo)
```

---

## Modelo 3 — Pirámide de meditación, ≈2 m de base, cobre o madera ★★★★☆

```
MEDIDAS (base 200 cm): altura 127,27 cm · apotema 161,86 cm · arista 190,26 cm
LONGITUD TOTAL DE ESTRUCTURA: 4 × 2,00 m + 4 × 1,90 m = 15,6 m (compra ≈16,5 m con margen)

VARIANTE A — COBRE (más fiel a la tradición, más cara):
  - Tubo de cobre ≈16,5 m — recomendado RÍGIDO (barra de fontanería Ø18 mm): el cobre de
    rollo es blando y se comba en tramos de 1,9-2 m .............................. ≈75-110€
      (referencia: 5/8" rollo ≈4,5 €/m → ≈75€ · Ø18 mm ≈6,5 €/m → ≈107€)
  - 5 conectores impresos reforzados (pared 3 mm, infill 25-30%, PETG) ............. 8-15€
  - Perfil o pletina para reforzar la base si se va a sentar alguien dentro (opcional,
    evita que el peso lateral abra las esquinas) .................................. 10-20€
  SUBTOTAL: ≈95-145€

VARIANTE B — MADERA:
  - Listón de pino cepillado 30×30 mm, ≈16,5 m (tramos de 2,4 m: 8 listones) ....... ≈30-50€
  - Cola de carpintero + lija ...................................................... 3-5€
  - 5 conectores impresos reforzados (mismo criterio que arriba) ................... 8-15€
  - Aceite/barniz de acabado para exterior (si va a estar fuera) ................... 8-15€
  SUBTOTAL: ≈50-85€

HERRAMIENTA ADICIONAL FRENTE A MODELO 2: sierra de ingletes (para cortar con precisión
  tramos largos), nivel de burbuja grande, ayuda de una segunda persona para el montaje final
  (los tramos de ~2 m son difíciles de sostener en solitario mientras se encajan)

PASOS (ambas variantes, mismo esquema que el Modelo 2 a mayor escala):
  1. Corta aplicando la regla del Modelo 2: 4 × (200 − 2d) + 4 × (190,26 − 2d)
  2. Monta primero el cuadrado de base COMPLETO y nivelado antes de levantar nada vertical
     — es la fase donde más se nota un error de medida
  3. Levanta las 4 aristas laterales apoyándolas en el suelo contra el conector de ápice ya
     puesto en el centro, y ve insertando una a una en los conectores de esquina — necesita
     dos personas a partir de aquí
  4. Si vas a sentarte dentro con frecuencia, añade el refuerzo de base (perfil/pletina) antes
     de dar por terminado el montaje — la base es el punto que más carga lateral recibe
  5. Orienta al norte verdadero con app de brújula en modo "norte real" y nivela definitivamente
  6. Opcional: añade un cojín/tarima a ≈29% de la altura total (≈37 cm) si quieres replicar
     la proporción real de la Cámara del Rey de Keops (la tradición dice 1/3 ≈ 42 cm)
TIEMPO TOTAL: un fin de semana (diseño/impresión de conectores un día, corte y montaje otro)
```

---

## Comparativa rápida de los 3 modelos

```
MODELO                  │ BASE   │ MATERIAL   │ COSTE APROX. │ DIFICULTAD │ TIEMPO
────────────────────────┼────────┼────────────┼──────────────┼────────────┼────────────────
1. Sobremesa impresa    │ 18 cm  │ 80-170 g   │ 2-7€         │ ★☆☆☆☆      │ 1 tarde
2. Cobre + conectores   │ 60 cm  │ 4,7 m      │ 22-29€       │ ★★☆☆☆      │ 1 tarde
3. Meditación (cobre)   │ 200 cm │ 15,6 m     │ 95-145€      │ ★★★★☆      │ 1 fin de semana
3. Meditación (madera)  │ 200 cm │ 15,6 m     │ 50-85€       │ ★★★☆☆      │ 1 fin de semana
────────────────────────┴────────┴────────────┴──────────────┴────────────┴────────────────
```

---

## Errores comunes de montaje

```
1. MONTAR LA ESTRUCTURA VERTICAL ANTES DE CERRAR BIEN LA BASE — si la base no queda cuadrada
   y nivelada primero, el error se amplifica al subir las 4 aristas hacia el ápice.
2. NO RESTAR LA DISTANCIA DEL CONECTOR (2 × d) al cortar el tubo/listón — la pirámide queda
   más GRANDE de lo calculado y las aristas no cierran en el ápice.
3. APRETAR DEMASIADO LOS TRAMOS EN LOS CONECTORES DE PETG — un ajuste a presión demasiado
   forzado puede fisurar el conector en la línea de capa; si cuesta mucho, aumenta 0,1-0,2 mm
   la holgura del alojamiento en el siguiente lote en vez de forzar con martillo.
4. CONFUNDIR TUBO DE 15 mm (fontanería, Ø15,0) CON 5/8" (climatización, Ø15,87) — diseña
   el conector con el diámetro medido con calibre, nunca con el nombre comercial.
5. OLVIDAR EL REFUERZO DE BASE EN EL MODELO DE MEDITACIÓN si se va a sentar alguien dentro
   con cierta frecuencia — las esquinas de base son el punto que acumula la carga lateral.
```
