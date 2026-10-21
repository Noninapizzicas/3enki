---
tipo: componente
sector: hidroponia
tags: [iluminación, LED, PPFD, DLI, PAR, espectro, fotoperíodo, grow-lights]
---
# Iluminación — LED grow lights, PPFD, DLI, espectro

## Conceptos fundamentales de la luz para plantas

```
LUZ VISIBLE Y LUZ PARA LAS PLANTAS:
  El ojo humano es sensible a: 380-780 nm (nanómetros)
  Las plantas absorben:        400-700 nm → PAR (Photosynthetically Active Radiation)
  
  Picos de absorción de la clorofila:
    Clorofila a: 430nm (violeta-azul) + 662nm (rojo-naranja)
    Clorofila b: 453nm (azul) + 642nm (rojo)
    → el verde (520-570nm) NO se absorbe bien → se refleja → por eso las plantas son verdes

  ESPECTROS QUE IMPORTAN:
    Azul (400-500nm):    fototropismo, apertura de estomas, crecimiento compacto, vegetativo
    Verde (500-600nm):   penetra en el dosel, llega a hojas inferiores → eficaz a altas densidades
    Rojo (600-700nm):    fotosíntesis máxima, floración (fotoperíodo en plantas de día corto)
    Far-red (700-750nm): no es PAR pero modula el fitrocromo → floración, extensión de tallos

PPFD — Photosynthetic Photon Flux Density:
  Unidad: µmol/m²/s (micromoles de fotones por metro cuadrado por segundo)
  Lo que mide el quantum sensor (PAR-metro)
  PPFD = la intensidad de luz útil que llega a las plantas
  
  Anclaje con la vida cotidiana:
    Día nublado en interior junto a ventana:   50-200 µmol/m²/s
    Sol directo exterior (mediodía de verano): 1500-2000 µmol/m²/s
    Lechugas en hidroponía (indoor):           150-250 µmol/m²/s
    Tomates en fase de floración:              600-900 µmol/m²/s

DLI — Daily Light Integral:
  Unidad: mol/m²/day (moles de fotones por m² por día)
  DLI = PPFD × horas de luz × 3.6 / 1000

  Ejemplo: PPFD = 200 µmol/m²/s × 16h/día = DLI 11.5 mol/m²/día
  
  RANGO POR CULTIVO:
    Lechugas y hojas:             6-14 mol/m²/día  → rápido crecimiento
    Fresas:                       12-16 mol/m²/día → dulzor y producción
    Tomates / pimientos (flor):   20-30 mol/m²/día → máxima fotosíntesis
    Cucurbitáceas (pepino):       16-25 mol/m²/día
```

---

## Tipos de fuentes de luz

```
T8 / T5 Fluorescentes y CFL (obsoletos para producción):
  Eficiencia: 50-80 µmol/J → la mitad que los LED modernos
  Vida: 15.000-20.000 horas
  Uso actual: solo para semilleros y multiplicación en bandeja pequeña → económicos
  ✗ No competitivos para el ciclo completo del cultivo

HPS (High Pressure Sodium) — Sodio de alta presión:
  Espectro: fuerte en amarillo-rojo (600-700nm) · muy débil en azul → plantas algo estiradas
  Eficiencia: 1.1-1.7 µmol/J (los modernos electrónicos)
  Calor: muy alto → ventilación obligatoria, enfriamiento del cultivo
  Potencia estándar: 400W, 600W, 1000W por luminaria
  → aún usados en grandes plantaciones comerciales de tomate y pimiento
  → para huerto casero: los LED los han superado en eficiencia y comodidad

LED grow lights — el estándar actual para huerto indoor:
  Samsung LM301B, LM301H EVO (los chips de referencia):
    Eficiencia: 2.7-3.5 µmol/J (el doble o el triple del HPS)
    Espectro: white broad-spectrum (blanco) con picos en azul y rojo → la mejor opción
    Temperatura de color: 3000K (warm, más rojo, floración) o 5000K (cool, vegetativo)
    
  Quantum boards (tableros de LED):
    QBoard 240W (Mars Hydro, Spider Farmer, HLG): 4.500-6.000 lumens/W
    Cubre: 0.6m² a 0.9m² por tablero → 1-4 plantas tomate o 12-20 plantas lechuga

  COB (Chip-On-Board):
    Un solo chip de alta potencia → luz muy intensa en un punto
    Mejor para: plantas de alto PPFD (cannabis, tomates) · peor cobertura uniforme

  LED de espectro fijo (rojo+azul, el "blurple"):
    Los primeros LED grow · Eficiencia 1.5-2.0 µmol/J
    Anticuados: las plantas crecen pero el espectro incompleto afecta al sabor y morfología
    → Solo para presupuesto muy ajustado · los white broad-spectrum son mejor elección
```

---

## PPFD objetivos por cultivo y fase

| Cultivo | Fase vegetativa | Floración/fructificación | DLI objetivo |
|---|---|---|---|
| Lechuga (iceberg, romana) | 150-250 µmol/m²/s | — | 12-16 mol/m²/d |
| Rúcula, espinaca, kale | 150-200 µmol/m²/s | — | 8-12 mol/m²/d |
| Albahaca, cilantro | 200-300 µmol/m²/s | — | 12-15 mol/m²/d |
| Fresa | 200-300 µmol/m²/s | 400-600 µmol/m²/s | 14-18 mol/m²/d |
| Tomate cherry | 300-500 µmol/m²/s | 600-900 µmol/m²/s | 20-30 mol/m²/d |
| Pimiento | 300-450 µmol/m²/s | 500-800 µmol/m²/s | 18-25 mol/m²/d |
| Pepino | 400-600 µmol/m²/s | 600-800 µmol/m²/s | 20-28 mol/m²/d |

---

## Fotoperíodo — el reloj de las plantas

```
PLANTAS DE DÍA LARGO (florecen con más de X horas de luz):
  → en realidad responden a NOCHES CORTAS (menos de X horas de oscuridad)
  Lechugas, espinacas, zanahoria, perejil, cebolla — florecen en verano
  En hidroponía indoor: 16-18h de luz / 6-8h de oscuridad → máximo crecimiento vegetativo

PLANTAS DE DÍA CORTO (florecen con menos de X horas de luz):
  → en realidad responden a NOCHES LARGAS (más de X horas de oscuridad)
  Fresa (algunas variedades), crisantemo
  Las fresas de "día neutro" (Monterey, Albión, Seascape): florecen independientemente del fotoperíodo
  → en hidroponía indoor: usar variedades "day-neutral" · 14-16h de luz · sin restricción de floración

PLANTAS NEUTRALES (no les afecta el fotoperíodo):
  Tomates, pimientos, pepinos, albahaca, la mayoría de hortalizas
  → en hidroponía indoor: 16-18h de luz / 6-8h de oscuridad durante TODA la vida
  → la noche obligatoria (al menos 6h) es importante para el descanso metabólico de la planta
  → sin oscuridad (luz 24h): se reduce la fotosíntesis neta y la planta se estresa

EFECTO FAR-RED AL FINAL DEL DÍA (End-of-Day far-red, EOD-FR):
  5-10 minutos de far-red (730nm) al final del periodo de luz:
  → activa el fitocromo Pfr → señaliza "día largo" → acelera floración en plantas de día largo
  → reduce la elongación de los entrenudos → plantas más compactas
  → muchos LED modernos de calidad incluyen LEDs far-red específicamente para esto
```

---

## Cómo medir y planificar la iluminación

```
HERRAMIENTAS:
  Quantum sensor (PAR meter): mide PPFD con precisión
    Apogee MQ-500: el de referencia (~350€)
    Versión económica: Apogee MQ-200 o clones de AliExpress (~30-50€, menos precisos)
  Aplicación para smartphone: no son precisos (el sensor de la cámara no está calibrado para PAR)
    → sirven solo para comparar relativo, no para valores absolutos

HERRAMIENTA ONLINE PPFD:
  photobiology.info/calc — calcula DLI a partir de PPFD y horas
  growlightscience.com — base de datos de LEDs con mediciones reales de PPFD

DISTANCIA DE LA LUZ AL DOSEL:
  Más cerca → más PPFD pero más irregular y riesgo de quemadura
  Más lejos → más uniforme pero menos PPFD
  
  Regla práctica por tipo:
    Quantum board 240W → 30-45cm del dosel para 400-600 µmol/m²/s
    Quantum board 480W → 40-60cm para el mismo rango
    Si la planta se estira: está pidiendo más luz o el LED está muy alto
    Si las hojas se rizan hacia abajo: demasiado PPFD (bajar intensidad o subir el LED)

PRESUPUESTO ORIENTATIVO (LED grow lights):
  Semillero/Kratky lettugas (0.3m²): Spider Farmer SF-600 o Mars Hydro TS-600 → 30-50€
  Rack 1m² lechugas: Spider Farmer SF-2000 (200W, LM301B) → 150-200€
  Tomates 1 planta en cubo DWC: Spider Farmer SF-4000 (400W) o HLG 300L → 250-350€
  Producción 1-2m²: HLG 550 V2 Rspec o Fluence SPYDR → 700-1500€
```

---

## CO₂ — el gas olvidado

```
POR QUÉ EL CO₂ IMPORTA EN CULTIVO INDOOR:
  Exterior: CO₂ atmosférico ≈ 420 ppm (partes por millón)
  Cultivo indoor cerrado: las plantas absorben CO₂ → cae a 200-300 ppm → fotosíntesis limitada
  Enriquecimiento de CO₂: subir a 800-1200 ppm
    → tasa de fotosíntesis puede aumentar 20-40% con el mismo PPFD
    → SOLO tiene efecto si la luz y los nutrientes NO son el factor limitante

CÓMO ENRIQUECER CO₂:
  Fermentación de azúcar + agua + levadura:
    1L de agua + 500g azúcar + 5g levadura → fermentar en botella con tubo hacia el cultivo
    → produce CO₂ durante 2-4 semanas · suficiente para un armario pequeño (0.5-1m²)
  Vinagre + bicarbonato: reacción instantánea pero no controlada · no práctico
  Botella de CO₂ de refresco (10 kg):
    → con regulador + electroválvula → el más eficiente para espacios de hasta 10m²
    → coste: regulador + electroválvula + caudal: 50-100€ · recarga CO₂ 15-30€

NOTA: sin iluminación de alta intensidad (> 400 µmol/m²/s) el CO₂ enriquecido no ayuda
  → primero optimizar luz y nutrientes, el CO₂ es el último paso
```
