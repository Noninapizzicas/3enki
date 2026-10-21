---
tipo: tecnica
sector: impresion-3d
tags: [diseño, tolerancias, ensamblaje, orientacion, soportes, DFAM]
---
# Diseño para impresión — tolerancias, ensamblajes, orientación

> Una pieza que se diseña sin pensar en cómo se va a imprimir es una pieza que se va a rediseñar después de la primera impresión fallida — DFAM (Design For Additive Manufacturing) no es un lujo académico, es ahorrar horas de máquina.

---

## Tolerancias de ensamblaje — el número que evita el "no encaja"

```
JUEGO ESTÁNDAR RECOMENDADO: 0,1-0,2mm por lado entre piezas que deben encajar a presión
  suave (una tapa que cierra, un eje que gira, un cajón que desliza)
  → Menor de 0,1mm: riesgo real de que no entre según calibración de la máquina
  → Mayor de 0,3mm: la pieza queda floja, sin sujeción funcional

AJUSTE A PRESIÓN FUERTE (press-fit permanente, tipo inserto): 0,05-0,1mm de interferencia
  negativa (el macho ligeramente MÁS grande que el hueco) — requiere fuerza para encajar
  pero luego no se separa sin herramienta

AJUSTE DESLIZANTE (piezas que se mueven entre sí en uso, tipo carril): 0,2-0,4mm de
  juego según la longitud de la superficie de contacto — a mayor superficie, más margen
  necesario para compensar pequeñas imprecisiones dimensionales acumuladas

REGLA PRÁCTICA DE CALIBRACIÓN: imprime una "torre de tolerancias" (varios pares de
  agujero/eje con juegos de 0,05mm en 0,05mm) UNA VEZ por combinación máquina+material y
  anota qué valor encaja como quieres — cada máquina calibra ligeramente distinto
```

---

## Compensación de shrinkage (encogimiento) por material

```
PLA: 0,2-0,5% de encogimiento típico — en piezas pequeñas (<100mm) es prácticamente
  despreciable, en piezas grandes empieza a importar
PETG: 0,3-0,7% — similar orden de magnitud que PLA
ABS: 0,5-1,5% (fuentes menos conservadoras citan hasta el doble en piezas grandes sin
  recinto térmico controlado) — el material con más encogimiento de la familia FDM común
RESINA (SLA/MSLA): 2-4% — el mayor encogimiento de todos, por la propia naturaleza del
  curado fotoquímico (reducción de volumen al polimerizar)

IMPACTO PRÁCTICO: el error escala con el tamaño. Un saliente de 10mm en PLA pierde ≈0,02mm
  por encogimiento (despreciable). Una tapa de 200mm en PLA pierde ≈0,4-1mm — suficiente
  para desalinear agujeros de tornillo si no se compensa. En ABS el mismo cálculo se
  duplica o triplica.

CÓMO COMPENSAR: escalar el modelo antes de exportar por el inverso del encogimiento
  esperado (para un encogimiento del 1%, escalar el modelo al 101%) — la mayoría de
  slicers también permiten aplicar un factor de escala global por eje si el error es
  direccional (más notable en X/Y que en Z, por ejemplo)
```

---

## Orientación de la pieza — la decisión que más impacta el resultado

```
RESISTENCIA MECÁNICA: las capas se adhieren peor entre sí que dentro de la misma capa
  (anisotropía) — orientar la pieza de forma que la carga previsible NO caiga
  perpendicular a las líneas de capa. Un gancho que soporta peso debe imprimirse con las
  capas alineadas a lo largo del esfuerzo, no cruzándolo.

VOLADIZOS Y SOPORTES: ángulos por debajo de 45° respecto a la vertical necesitan soporte
  en FDM estándar (algunas máquinas/perfiles bien calibrados llegan a imprimir voladizos
  de 30-35° limpios sin soporte) — reorientar la pieza para minimizar soporte necesario
  ahorra material, tiempo y mejora el acabado en las zonas de contacto

SUPERFICIE DE CONTACTO CON LA CAMA: cuanto mayor la superficie en la primera capa, mejor
  adherencia y menos riesgo de despegue — pero también más marca visible en esa cara;
  reservar la cara "fea" de la primera capa para la parte no visible/funcional de la pieza

ORIENTACIÓN EN RESINA: además de resistencia, en MSLA importa minimizar el área de
  contacto con la plataforma para reducir fuerzas de despegue entre capas (peel forces) —
  piezas orientadas en ángulo (no plano contra la plataforma) suelen imprimir mejor en resina
```

---

## Espesores de pared y geometría segura

```
ESPESOR MÍNIMO DE PARED FDM: 0,8-1,2mm (2-3 líneas de perímetro con boquilla 0,4mm) para
  que la pared tenga integridad estructural real, no solo apariencia sólida
ESPESOR MÍNIMO DE PARED RESINA: 0,6-1mm — por debajo de esto el riesgo de rotura en el
  postprocesado (lavado, manipulación) sube mucho
AGUJEROS HORIZONTALES: los agujeros impresos en horizontal salen ligeramente ovalados
  (el techo del agujero se imprime "en el aire" y cede un poco) — para tornillería de
  precisión, diseñar el agujero 0,1-0,2mm más pequeño e imprimir vertical si es posible,
  o taladrar/aterrajar después de imprimir
ESQUINAS VIVAS vs REDONDEADAS: las esquinas internas a 90° concentran tensión mecánica —
  añadir un radio de acuerdo (fillet) de 1-2mm en esquinas de piezas funcionales reduce
  notablemente el riesgo de rotura por fatiga
```

---

## Diseño para ensamblaje impreso (sin herramientas ni tornillos)

```
LIVING HINGE (bisagra viva): sección delgada y flexible impresa como parte de la misma
  pieza — funciona bien en PETG/TPU (tenaces), MAL en PLA (quebradizo, rompe con pocos ciclos)
SNAP-FIT (encaje a presión): saliente con retención elástica — requiere material con algo
  de flexibilidad (PETG, ABS) y un cálculo de la deflexión que el material tolera sin
  fisurar; PLA tolera mucho menos ciclos de apertura/cierre antes de fatigarse
DOVETAIL / COLA DE MILANO impresa: une piezas sin tornillo aprovechando la geometría —
  útil para piezas grandes divididas por volumen de impresora, imprimir con 0,15-0,2mm
  de juego en las caras de contacto para que entre a presión sin forzar
```

---

## Errores comunes de diseño

```
★★★★★ Diseñar a medida exacta (0mm de juego) esperando que "la impresora es precisa" —
  ninguna FDM doméstica tiene precisión suficiente para encaje 0-juego fiable; siempre
  dejar 0,1-0,2mm mínimo
★★★★☆ Orientar la pieza solo por "menos soporte" sin considerar la dirección de la carga
  mecánica — una pieza que imprime "bonita" puede romperse enseguida en uso real si las
  capas quedan perpendiculares al esfuerzo principal
★★★★☆ Ignorar el shrinkage en piezas grandes o en ABS/resina — un ensamblaje de varias
  piezas grandes diseñadas sin compensación puede desalinear agujeros varios milímetros
★★★☆☆ Diseñar snap-fits o bisagras vivas en PLA esperando la misma durabilidad que PETG
  o Nylon — el PLA es rígido y quebradizo, falla mucho antes en uso repetido
```

---

## Novedades 2025-2026

```
→ Los slicers modernos (OrcaSlicer, PrusaSlicer) integran calculadoras de tolerancia y
  asistentes de calibración de precisión dimensional, reduciendo la necesidad de imprimir
  torres de calibración manuales para cada combinación máquina/material
→ La proliferación de librerías paramétricas (BOSL2 en OpenSCAD) estandariza patrones de
  ensamblaje ya probados (snap-fits, roscas, dovetails) evitando reinventar la geometría
  desde cero en cada proyecto — ver [[Software CAD y diseño paramétrico — FreeCAD, Fusion 360, OpenSCAD]]
→ El auge de piezas multimaterial (impresoras con AMS/multi-boquilla) abre diseño de
  ensamblajes con materiales distintos en la misma pieza (rígido+flexible) impresos en
  una sola tirada, sin ensamblaje posterior
```
