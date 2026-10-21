---
tipo: tecnica
sector: impresion-3d
tags: [calibracion, pressure-advance, input-shaper, flow-rate, Klipper, first-layer]
---
# Calibración y parámetros — layer height, infill, soportes, resonancias

> Una impresora recién comprada casi nunca imprime al 100% de su capacidad real de fábrica — la diferencia entre una pieza mediocre y una excelente en la misma máquina suele estar en 30 minutos de calibración bien hecha.

---

## Primera capa — la calibración que más impacto tiene

```
NIVELACIÓN DE CAMA: automática (sensor tipo strain-gauge o inductivo) en la mayoría de
  máquinas modernas — verificar igualmente con una hoja de papel en varios puntos si hay
  dudas, el sensor puede desviarse con el tiempo/golpes
Z-OFFSET: la distancia real entre boquilla y cama en la primera capa — demasiado alto
  (boquilla lejos) da mala adherencia, demasiado bajo (boquilla clavada) da rebabas y
  puede dañar la boquilla o la superficie de la cama
VELOCIDAD DE PRIMERA CAPA: siempre más lenta que el resto de la impresión (15-30mm/s
  típico) — da tiempo a que el material se adhiera bien antes de que la siguiente capa
  añada peso/movimiento sobre ella
SÍNTOMA DE PRIMERA CAPA MAL CALIBRADA: líneas separadas y no fusionadas entre sí (Z-offset
  alto) vs líneas aplastadas con textura elefante/"skin de piel de elefante" (Z-offset bajo)
```

---

## Flow rate (multiplicador de flujo) — el ajuste que se olvida al cambiar filamento

```
QUÉ MIDE: si la cantidad de material que realmente sale de la boquilla coincide con lo
  que el firmware CREE que está saliendo — un desajuste da paredes con huecos (flujo bajo)
  o paredes hinchadas/sobre-extruidas (flujo alto)
CÓMO CALIBRAR: imprimir un cubo o pared de calibración de una sola pared (single wall) y
  medir su grosor real con calibre — comparar con el grosor teórico esperado y ajustar el
  % de flujo hasta que coincidan
FRECUENCIA: recalibrar cada vez que se cambia de MARCA de filamento (no solo de material)
  — la viscosidad real varía entre fabricantes incluso siendo "el mismo PLA"
```

---

## Pressure advance / linear advance — compensar el retraso de presión

```
QUÉ RESUELVE: el hotend no responde instantáneamente a los cambios de velocidad del
  cabezal — al acelerar, tarda en aumentar la presión interna y sub-extruye; al frenar en
  una esquina, sigue empujando material de más un instante y sobre-extruye (blobbing)
EFECTO VISIBLE SIN CALIBRAR: esquinas redondeadas donde deberían ser vivas, gotas/blobs
  en el punto donde empieza/termina cada perímetro (la "costura" o seam)
CÓMO CALIBRAR: torre de calibración con distintos valores de PA impresa en una sola
  pasada (OrcaSlicer y Klipper lo automatizan con un asistente integrado) — elegir
  visualmente el valor donde las esquinas quedan más limpias
NOMBRE SEGÚN FIRMWARE: "Pressure Advance" en Klipper, "Linear Advance" en Marlin — mismo
  concepto, implementación distinta
```

---

## Input shaping / resonance tuning — eliminar el ghosting a alta velocidad

```
QUÉ RESUELVE: las vibraciones mecánicas de la propia estructura de la impresora al
  acelerar/frenar el cabezal se transmiten a la pieza como "ringing" o "ghosting" —
  ondulaciones fantasma que replican la forma de una arista cercana en la superficie
CON ACELERÓMETRO (más preciso): un sensor ADXL345 (Klipper) o resonance sensor (Marlin
  2.1+) montado en el cabezal mide la frecuencia de resonancia real de la máquina y el
  firmware calcula el filtro de compensación automáticamente
SIN ACELERÓMETRO (método visual): imprimir piezas de test específicas a distintas
  velocidades/frecuencias y elegir a ojo la que menos ghosting muestra — menos preciso
  pero no requiere hardware adicional
RELACIÓN CON PRESSURE ADVANCE: son ajustes complementarios que resuelven problemas
  distintos — input shaping corrige el MOVIMIENTO de la máquina, pressure advance corrige
  la EXTRUSIÓN del material; máquinas CoreXY de alta velocidad (ver
  [[Máquinas FDM — Bambu Lab, Prusa, Creality, Voron]]) necesitan ambos bien calibrados
  para aprovechar su velocidad real sin sacrificar acabado
```

---

## Parámetros de temperatura y enfriamiento por escenario

```
PUENTES (bridging): tramo de material extruido "en el aire" entre dos puntos de apoyo —
  necesita más ventilador y a veces menos temperatura que el resto de la pieza para no
  colgar/curvarse antes de solidificar
VOLADIZOS (overhangs): zonas donde cada capa sobresale de la anterior sin soporte por
  debajo — el enfriamiento agresivo es clave para que la capa solidifique antes de que
  el peso de la siguiente la deforme
PIEZAS PEQUEÑAS CON POCA ÁREA POR CAPA: riesgo de que la capa anterior no tenga tiempo de
  enfriar antes de que llegue la siguiente (sobrecalentamiento acumulado, "worm-like" en
  la superficie) — el slicer suele tener una opción de "tiempo mínimo de capa" que ralentiza
  automáticamente la impresión en estas zonas
```

---

## Tabla de referencia — parámetros por defecto razonables (PLA, boquilla 0,4mm)

```
PARÁMETRO              VALOR DE PARTIDA        RANGO DE AJUSTE FINO
Layer height            0,2mm                    0,08-0,3mm
Perímetros              3                        2-5 según exigencia mecánica
Infill                  15-20%                   10-80% según carga esperada
Patrón de infill        Gyroid                   Cúbico (multidireccional), líneas (rápido)
Velocidad de impresión  100-150mm/s (CoreXY)     50-80mm/s (bedslinger clásica)
Temperatura hotend      200-210°C                190-220°C según marca de filamento
Temperatura cama        55-60°C                  0-60°C (PLA no siempre la necesita)
Ventilador de capa      100% desde capa 2-3      variable en puentes/voladizos
Retracción (bowden)     4-6mm                    2-3mm en direct drive
```

---

## Errores comunes de calibración

```
★★★★★ No recalibrar flow rate/pressure advance al cambiar de bobina de otra marca —
  aplicar "el mismo perfil de siempre" a un filamento distinto arrastra defectos evitables
★★★★☆ Confundir un problema de primera capa (Z-offset) con un problema de temperatura —
  antes de tocar temperaturas, verificar SIEMPRE que la primera capa esté bien nivelada
★★★★☆ Subir la velocidad de impresión sin haber calibrado input shaping antes en máquinas
  CoreXY rápidas — el resultado es ghosting visible que ninguna otra calibración corrige
★★★☆☆ Ignorar el "tiempo mínimo de capa" en piezas pequeñas y verticales (miniaturas,
  torres finas) — sin este ajuste el material no tiene tiempo de enfriar entre capas
```

---

## Novedades 2025-2026

```
→ Los asistentes de calibración integrados (OrcaSlicer, Bambu Studio) automatizan flow
  rate, pressure advance y velocidad volumétrica máxima con una sola impresión de test,
  reduciendo drásticamente el tiempo que antes requería calibrar a mano cada parámetro
→ Klipper sigue consolidándose como firmware de referencia en máquinas self-build (Voron)
  y cada vez más en máquinas comerciales de gama alta, por su superioridad en input
  shaping con acelerómetro frente a Marlin en la mayoría de comparativas de la comunidad
→ Las impresoras CoreXY de gama media (Elegoo Centauri Carbon, Sovol SV08) democratizan
  velocidades de 400-700mm/s reales, haciendo que el input shaping deje de ser "cosa de
  máquinas premium" y pase a ser imprescindible también en gama de entrada-media
```
