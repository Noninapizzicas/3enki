---
tipo: componente
sector: baterias-almacenamiento
tags: [powerwall, diy, almacenamiento-domestico, dimensionado, inversor-hibrido]
---
# PowerWall DIY — diseño de sistema doméstico de almacenamiento

> Construir tu propio "Powerwall" no es replicar la caja blanca de Tesla — es entender que el producto comercial resuelve el mismo problema físico (kWh disponibles cuando el sol se pone) con márgenes de garantía y certificación que tú puedes decidir asumir o no.

---

## Los tres caminos hacia un banco doméstico DIY

```
CAMINO 1 — CELDAS PRISMÁTICAS LiFePO4 NUEVAS (el más predecible)
  16 celdas EVE/CATL 280-314Ah en serie (16S, 51,2V nominal) + BMS Seplos/
  JK + carcasa → banco de 5-10 kWh con vida útil y comportamiento conocidos
  de fábrica desde el primer día
  Coste total orientativo: 1.500-2.500€ por banco de ~5kWh (2026)
  Recomendado para: quien quiere resultado fiable sin depender de la
  incertidumbre de material recuperado

CAMINO 2 — MÓDULOS DE SEGUNDA VIDA EV (el más económico por kWh, más incierto)
  Módulos de Nissan Leaf/Tesla/Kia recuperados → banco de 15-30 kWh a
  fracción del coste de celdas nuevas equivalentes
  Ver [[Segunda vida EV — Nissan Leaf, Tesla, despiece de módulos]]
  Recomendado para: quien tiene experiencia previa, tolera mayor incertidumbre
  sobre vida útil real, y prioriza kWh totales sobre predictibilidad

CAMINO 3 — CELDAS 18650/21700 RECICLADAS DE PORTÁTILES (el más laborioso)
  Cientos de celdas recuperadas y testeadas individualmente → banco de
  varios kWh a coste casi cero en material, altísimo coste en horas de
  trabajo (testeo, emparejado, soldadura punto a punto de gran volumen)
  El proyecto de referencia de la comunidad (Glubux, foros solares
  españoles) usa esta vía: bancos con ~650-1.000 celdas recuperadas
  Recomendado para: proyecto de aprendizaje explícito, tiempo disponible
  abundante, presupuesto de material muy ajustado
```

---

## Arquitectura de un banco doméstico típico

```
CELDAS/MÓDULOS → BUSBARS/CONEXIÓN → BMS → INTERRUPTOR/FUSIBLE PRINCIPAL
  → CABLEADO DE POTENCIA → INVERSOR HÍBRIDO → PANEL ELÉCTRICO DE LA VIVIENDA

COMPONENTES CLAVE:
  Carcasa: metálica o de fibra resistente, ventilada, con acceso para
  mantenimiento y separación física de la zona habitable si es posible
  (garaje, trastero exterior, caseta) — ver [[Seguridad — thermal runaway, almacenamiento, extinción de incendios]]
  Inversor híbrido: convierte la CC del banco a CA de la vivienda y
  gestiona la carga/descarga según producción solar y consumo — ver
  [[../solar-fotovoltaica-diy/Inversores — string, microinversores, híbridos]]
  para el detalle de esta pieza (compartida con el sector solar)
  Cableado de potencia: sección de cobre dimensionada a la corriente
  máxima esperada, con protección diferencial y magnetotérmica según
  normativa eléctrica de baja tensión aplicable
```

---

## Dimensionado — la cuenta que evita quedarse corto (o gastar de más)

```
PASO 1 — CONSUMO NOCTURNO/DIARIO: medir con analizador de red doméstica o
  estimar sumando el consumo de los aparatos que funcionan fuera de horas
  de producción solar (nevera, standby, iluminación nocturna, etc.)

PASO 2 — MARGEN DE SEGURIDAD: capacidad objetivo (kWh) ≈ consumo diario
  medio × 1,3-1,5 para sistema conectado a red con batería de respaldo/
  autoconsumo; × días de autonomía deseada / DoD máximo para sistema
  off-grid — ver detalle completo en
  [[../solar-fotovoltaica-diy/Baterías y almacenamiento — LiFePO4, BMS, sodio-ion]]

PASO 3 — POTENCIA INSTANTÁNEA: verificar que el inversor y el BMS soportan
  el pico de consumo simultáneo de la vivienda (arranque de compresor de
  nevera/aire acondicionado, horno, varios electrodomésticos a la vez),
  no solo la media diaria

DoD RECOMENDADO SEGÚN QUÍMICA:
  LiFePO4 nueva: 80-90% sin penalizar significativamente ciclos de vida
  Segunda vida EV (NMC): 60-70% recomendado, más conservador dado que la
  celda ya viene con desgaste previo desconocido con precisión
```

---

## Ejemplo de dimensionado real

```
VIVIENDA CON CONSUMO NOCTURNO MEDIO: 8 kWh/noche
CAPACIDAD OBJETIVO: 8 × 1,4 ≈ 11,2 kWh útiles
CON DoD 85% (LiFePO4): capacidad NOMINAL necesaria ≈ 11,2 / 0,85 ≈ 13,2 kWh
CONFIGURACIÓN: 16S de celdas 280Ah (51,2V × 280Ah = 14,3 kWh nominal) —
  un único banco de 16 celdas cubre el objetivo con margen razonable
```

---

## Errores comunes al diseñar el banco

```
★★★★★ Dimensionar por el consumo de un día soleado de verano en vez del
  peor caso de invierno — sistema desabastecido justo en los meses críticos
★★★★☆ No verificar el pico de potencia instantánea que el inversor y BMS
  deben soportar, solo el consumo medio diario — corte inesperado al
  arrancar electrodomésticos con motor
★★★★☆ Ubicar el banco en un espacio sin ventilación ni control de
  temperatura extremo (garaje sin aislar en clima muy frío o muy cálido)
  — acelera degradación y complica la gestión térmica del BMS
★★★☆☆ Subestimar el espacio y peso real del banco al planificar su
  ubicación — un banco de 10-15 kWh en celdas prismáticas pesa fácilmente
  100-150 kg, requiere base sólida y acceso para mantenimiento
```

---

## Novedades 2025-2026

```
→ El coste del banco DIY con celdas nuevas sigue bajando en paralelo al
  precio general de LiFePO4 en Europa (≈40% menos en tres años), acercando
  cada vez más el DIY a la opción "llave en mano" comercial en coste total.
→ La integración de BMS DIY con inversores híbridos vía Home Assistant/
  Node-RED (Victron, Growatt, Deye) permite hoy replicar buena parte de la
  gestión inteligente de carga/descarga de un Powerwall comercial sin
  depender del ecosistema cerrado de un fabricante.
```

---

→ Origen de las celdas o módulos para el banco: [[Celdas de litio — 18650, 21700, LiFePO4 cilíndricas y prismáticas]] y [[Segunda vida EV — Nissan Leaf, Tesla, despiece de módulos]]
→ Proyecto completo paso a paso de un banco de 5kWh: [[Proyectos paso a paso — powerwall 5kWh, pack e-bike, UPS casero, banco de pruebas]]
→ Monitorización del banco terminado: [[Software y monitorización — SOC, balanceadores, Node-RED, Home Assistant, Victron]]
