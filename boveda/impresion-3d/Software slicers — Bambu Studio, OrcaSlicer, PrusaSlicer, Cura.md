---
tipo: componente
sector: impresion-3d
tags: [software, slicer, Bambu-Studio, OrcaSlicer, PrusaSlicer, Cura, SuperSlicer, parametros]
---
# Software slicers — Bambu Studio, OrcaSlicer, PrusaSlicer, Cura

> El slicer es el software que más horas de vida útil te va a dar de todo el hobby — cámbialo bien una vez y ahorra años de fricción, porque el 80% de la calidad de una impresión se decide aquí, no en la máquina.

---

## El árbol genealógico — quién viene de quién

```
Slic3r (el origen open-source, 2011)
  → PrusaSlicer (fork de Prusa, motor de slicing propio muy refinado — soportes orgánicos
    "tree supports" de referencia)
    → Bambu Studio (fork de Bambu Lab, añade AMS/multicolor y perfiles calibrados de fábrica
      — licencia AGPLv3, pero bajo investigación 2025-2026 de la Software Freedom Conservancy
      por retener código fuente del componente de red)
      → OrcaSlicer (fork COMUNITARIO de Bambu Studio, mantiene el espíritu abierto, añade
        soporte para prácticamente cualquier impresora FDM del mercado)

CADA GENERACIÓN mantiene el motor de slicing core y añade una capa de funcionalidad —
  entender el árbol ayuda a entender por qué comparten atajos de teclado y estructura de
  perfiles casi idénticos
```

---

## Comparativa práctica 2026

```
BAMBU STUDIO — el flujo "todo integrado" de fábrica
  Fortaleza: workflow AMS sin fricción, RFID de filamento automático, integración cloud
  Limitación: pensado ante todo para hardware Bambu propio; código de red no completamente
  abierto pese a licencia AGPLv3 (investigación SFC en curso 2025-2026)
  Elígelo si: tienes impresora Bambu y quieres el camino de menor resistencia

ORCASLICER — la alternativa abierta que gana terreno
  Fortaleza: asistente de calibración integrado (pressure advance, flow rate, velocidad
  volumétrica máxima), soporte multi-impresora amplísimo, comunidad muy activa de perfiles
  Elígelo si: tienes máquina no-Bambu, o quieres control fino y transparencia del proyecto

PRUSASLICER — el más maduro y depurado
  Fortaleza: perfiles de máquina Prusa insuperables, soportes orgánicos ("tree supports")
  de referencia del sector, motor de slicing muy estable con años de refinamiento
  Elígelo si: tienes impresora Prusa, o valoras estabilidad por encima de features nuevas

CURA (Ultimaker) — el histórico gratuito y universal
  Fortaleza: gratuito, curva de aprendizaje suave, enorme cantidad de tutoriales en español
  Limitación: interfaz percibida como menos moderna, calibración avanzada menos integrada
  Elígelo si: eres principiante absoluto o tu impresora no tiene buen perfil en las otras

SUPERSLICER — el fork "todo ajustable" de PrusaSlicer
  Fortaleza: expone prácticamente todos los parámetros posibles del motor de slicing
  Limitación: la sobreabundancia de opciones puede abrumar a quien empieza
  Elígelo si: ya dominas los fundamentos y quieres ajuste milimétrico de cada variable
```

---

## Los parámetros que más importan (y por qué)

```
LAYER HEIGHT (altura de capa) — 0,08-0,3mm típico con boquilla 0,4mm
  Menor altura = más detalle vertical y mejor acabado, pero más tiempo de impresión
  0,2mm es el estándar razonable por defecto — bajar a 0,1-0,12mm solo si el detalle lo pide

INFILL (relleno) — % de material interior, no es sólido salvo que se indique
  15-20% es suficiente para la mayoría de piezas decorativas/prototipo
  40-60%+ para piezas con carga mecánica real — más allá de 80% rara vez compensa el
  tiempo/material extra frente a subir el número de perímetros
  Patrón: gyroid es el equilibrio resistencia/velocidad más citado; cúbico para carga
  multidireccional; líneas rectas solo para piezas de prueba rápida

PERIMETERS (paredes) — 2-3 es el mínimo razonable, 4-5 para piezas estructurales
  Más peso en la resistencia real de la pieza que el infill en muchos casos — una pieza
  con 4 perímetros y 15% infill suele ser más resistente que 2 perímetros y 50% infill

SUPPORTS (soportes) — necesarios en voladizos >45-50° sin soporte propio de la geometría
  Tree supports (soporte orgánico, PrusaSlicer/OrcaSlicer): usan menos material, más
  fáciles de retirar, mejor acabado en la zona de contacto que el soporte tipo rejilla clásico
  Soporte normal (grid): más predecible en piezas técnicas, mejor para superficies planas

COOLING (enfriamiento del ventilador de capa) — crítico en PLA, mínimo en ABS/ASA/Nylon
  PLA: ventilador alto desde capa 2-3 (voladizos y puentes necesitan enfriamiento agresivo)
  ABS/ASA/PC: ventilador bajo o apagado — el enfriamiento brusco provoca delaminación

IRONING (planchado de superficies superiores) — pasa la boquilla caliente sin extruir tras
  la última capa superior para fundir las líneas visibles → superficie superior muy lisa
  Coste: añade tiempo de impresión notable — reservarlo para caras visibles/estéticas
```

---

## Errores comunes de configuración

```
★★★★★ Copiar un perfil de internet sin adaptar la temperatura al filamento real que se
  usa — cada marca (incluso el mismo material) tiene rangos de temperatura distintos
★★★★☆ Subir el infill pensando que da más resistencia cuando el problema real es pocos
  perímetros — el número de paredes suele pesar más que el porcentaje de relleno
★★★★☆ Usar soporte normal (grid) por defecto en vez de tree supports cuando el slicer lo
  ofrece — se gasta más material y deja peor acabado en la zona de contacto sin necesidad
★★★☆☆ No recalibrar flow rate/pressure advance al cambiar de marca de filamento, aunque
  sea "el mismo material" — la viscosidad real varía entre fabricantes
```

---

## Flujo de trabajo recomendado para empezar

```
1. Instala OrcaSlicer (universal) o Bambu Studio/PrusaSlicer si tu máquina es de esa marca
2. Usa el perfil de fábrica del filamento más cercano al tuyo como punto de partida
3. Imprime una torre de calibración de temperatura (built-in en la mayoría de slicers)
4. Calibra flow rate (100% de referencia, ajustar ±2-5% según resultado visual)
5. Calibra pressure advance con el asistente integrado (OrcaSlicer lo trae de serie)
6. Guarda tu propio perfil por material — no repitas la calibración cada vez
```

---

## Novedades 2025-2026

```
→ Bambu Studio bajo investigación formal de la Software Freedom Conservancy (2025-2026)
  por retención de código fuente del componente de red pese a su licencia AGPLv3 — el
  debate empuja a parte de la comunidad hacia OrcaSlicer como alternativa "realmente abierta"
→ OrcaSlicer consolida su posición como el slicer comunitario de referencia, con soporte
  para prácticamente cualquier impresora FDM y un asistente de calibración muy completo
  integrado de serie (pressure advance, flow rate, velocidad volumétrica máxima)
→ Los cuatro slicers principales convergen en features (todos ofrecen ya tree supports,
  calibración asistida, perfiles multimaterial) — la diferencia real hoy está más en
  filosofía de apertura del proyecto que en capacidad técnica pura
```
