---
tipo: componente
sector: impresion-3d
tags: [materiales, PLA, PETG, ABS, ASA, TPU, Nylon, PC, filamento, precios]
---
# Materiales FDM — PLA, PETG, ABS, ASA, TPU, Nylon, PC

> Elegir mal el material es el error más caro del hobby — no por el precio del rollo, sino por las horas de impresión tiradas cuando la pieza no aguanta lo que tenía que aguantar.

---

## PLA — el material por defecto

```
TEMPERATURA EXTRUSIÓN: 190-220°C · CAMA: 0-60°C (no siempre necesaria)
PROPIEDADES: rígido, fácil de imprimir, poca deformación (warping bajo), biodegradable
  en condiciones industriales (NO en compost casero)
LIMITACIÓN: baja resistencia térmica (se ablanda ≈55-60°C — un coche al sol lo deforma),
  quebradizo bajo impacto frente a PETG/ABS
CUÁNDO USARLO: prototipos, piezas decorativas, primera impresora, cualquier pieza que no
  vaya a estar expuesta a calor ni a impacto fuerte
PRECIO ESPAÑA 2026: eSUN PLA-Basic ≈12,59€/kg · Bambu PLA Basic bajo 13€/kg con descuentos
  por volumen · Polymaker Panchroma (silk/efectos) ≈30€/kg
```

---

## PETG — el equilibrio funcional

```
TEMPERATURA EXTRUSIÓN: 230-250°C · CAMA: 70-80°C
PROPIEDADES: más resistente al impacto y a la intemperie que PLA, algo flexible, resistente
  a químicos y humedad — buena opción para piezas de exterior
LIMITACIÓN: más propenso a stringing que PLA, requiere gestión de retracción más fina
CUÁNDO USARLO: piezas funcionales de uso diario, exterior, contenedores, piezas mecánicas
  ligeras — el "material todoterreno" cuando PLA se queda corto y ABS parece excesivo
PRECIO ESPAÑA 2026: Bambu PETG Basic (refill) ≈23,49€/kg · rango general 18-30€/kg
```

---

## ABS y ASA — resistencia térmica y exterior

```
ABS — temperatura extrusión: 230-260°C · cama: 90-110°C · RECINTO CERRADO recomendado
  Alta resistencia térmica (≈100°C) e impacto, se puede alisar con vapor de acetona
  Riesgo: warping fuerte sin recinto cerrado, emisiones de VOC más notables que PLA/PETG
  (ver [[Normativa y seguridad — VOCs, resina, ventilación, reciclaje]])

ASA — el "ABS mejorado para exterior"
  Mismas temperaturas que ABS aprox., MUCHO mejor resistencia a rayos UV — no amarillea
  ni se degrada al sol como el ABS
  CUÁNDO USARLO: piezas de exterior sometidas a sol directo (soportes, carcasas de jardín),
  automoción, cualquier cosa que reemplace al ABS pero viva fuera de casa
```

---

## TPU — el flexible

```
TEMPERATURA EXTRUSIÓN: 210-230°C · CAMA: 30-60°C · velocidad de impresión BAJA
DUREZA (Shore A): 85A-95A es lo más fácil de imprimir en extrusor bowden estándar;
  durezas más blandas (60-70A) requieren extrusor direct drive para no atascar
PROPIEDADES: elástico, buena resistencia a abrasión, absorbe impactos y vibración
CUÁNDO USARLO: fundas, juntas, ruedas, piezas antivibración, calzado técnico
HIGROSCÓPICO: absorbe humedad como Nylon/PC — secar antes de imprimir si lleva tiempo abierto
```

---

## Nylon (PA) y PA-CF — el técnico exigente

```
TEMPERATURA EXTRUSIÓN: 250-270°C · CAMA: 70-100°C · MUY higroscópico
VARIANTES: PA6/PA66 (más rígido, más térmico, más difícil de imprimir) vs PA12/PA612
  (más tolerante y resistente a la humedad, más fácil para el usuario doméstico)
PA-CF (con fibra de carbono corta): mejora rigidez, reduce contracción/warping, sube
  resistencia térmica antes de deformar — a costa de desgastar boquillas de latón
  (usar boquilla de acero endurecido o rubí con materiales cargados de fibra)
SECADO: crítico — 4-8h en deshidratadora a 65°C antes de cada sesión de impresión si el
  filamento lleva más de un día expuesto al aire; sin secar, burbujea y pierde resistencia
CUÁNDO USARLO: piezas mecánicas de alta exigencia, engranajes, piezas de fricción/desgaste
```

---

## PC (Policarbonato) — el más resistente al impacto

```
TEMPERATURA EXTRUSIÓN: 260-310°C · CAMA: 100-120°C · RECINTO CERRADO obligatorio
PROPIEDADES: la mayor resistencia al impacto y temperatura de esta lista (>110°C antes de
  deformar), transparencia posible en algunas variantes
LIMITACIÓN: el más exigente de imprimir de todos — requiere hotend de alta temperatura,
  cama muy caliente y control de corrientes de aire estricto
CUÁNDO USARLO: piezas mecánicas de alta exigencia térmica/impacto donde ni ABS ni Nylon
  bastan — carcasas técnicas, piezas cerca de fuentes de calor
```

---

## Tabla resumen de decisión

```
MATERIAL   TEMP HOTEND   TEMP CAMA   DIFICULTAD   USO TÍPICO
PLA        190-220°C     0-60°C      ★☆☆☆☆        General, decorativo, prototipo
PETG       230-250°C     70-80°C     ★★☆☆☆        Funcional, exterior, contenedores
ABS        230-260°C     90-110°C    ★★★★☆        Térmico, postprocesable (acetona)
ASA        230-260°C     90-110°C    ★★★★☆        Exterior con sol (UV-resistente)
TPU        210-230°C     30-60°C     ★★★☆☆        Flexible, antivibración
Nylon(PA)  250-270°C     70-100°C    ★★★★☆        Mecánico exigente, engranajes
PA-CF      250-280°C     80-100°C    ★★★★★        Mecánico + rigidez extrema
PC         260-310°C     100-120°C   ★★★★★        Impacto + temperatura extrema
```

---

## Errores comunes con materiales

```
★★★★★ No secar Nylon/TPU/PC antes de imprimir — el burbujeo por humedad arruina más
  impresiones técnicas que cualquier ajuste de slicer mal puesto
★★★★☆ Imprimir ABS en máquina abierta esperando el mismo resultado que en recinto cerrado
  — el warping y la delaminación de esquinas son casi garantizados sin control térmico
★★★☆☆ Usar boquilla de latón estándar con materiales cargados de fibra (PA-CF, PETG-CF)
  — la fibra abrasiva desgasta el orificio en pocas horas, deformando el flujo
★★★☆☆ Comparar precio por kilo sin mirar densidad — un PETG y un PLA del mismo peso no
  rinden el mismo volumen de pieza (el PETG es más denso, cunde menos por kg)
```

---

## Novedades 2025-2026

```
→ Los precios de PLA básico siguen bajando por presión competitiva — eSUN PLA-Basic a
  ≈12,59€/kg y Bambu PLA Basic bajo 13€/kg con descuentos de volumen (verano 2026)
→ PA-CF y PETG-CF ganan cuota en piezas mecánicas domésticas gracias a impresoras CoreXY
  de gama media/alta capaces de mantener temperatura de cámara estable
→ Filamentos "reciclados"/menor huella de carbono entran como exigencia de mercado, no
  solo como nicho ecológico — varias marcas empiezan a ofrecer líneas rPET/rPLA a precio
  cercano al material virgen
```
