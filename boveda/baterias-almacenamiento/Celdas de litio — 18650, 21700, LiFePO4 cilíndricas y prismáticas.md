---
tipo: componente
sector: baterias-almacenamiento
tags: [celdas, 18650, 21700, lifepo4, prismatico, cilindrico, samsung, molicel, eve, catl]
---
# Celdas de litio — 18650, 21700, LiFePO4 cilíndricas y prismáticas

> Todo pack empieza por elegir la celda correcta, y esa elección sola ya decide si el proyecto será ligero y compacto o barato y seguro — no hay una celda "mejor", hay una celda correcta para cada aplicación.

---

## Formatos cilíndricos — el estándar de facto

```
18650 — 18mm diámetro × 65mm alto (el nombre es literal: 18-65-0 = cilíndrica)
  Capacidad habitual: 2.000-3.600 mAh
  Voltaje nominal: 3,6-3,7V (NMC/NCA) · rango real 2,5V (descarga) a 4,2V (carga completa)
  Uso típico: portátiles (origen habitual de celdas recuperadas), linternas, power banks,
  packs de e-bike de gama económica

21700 — 21mm diámetro × 70mm alto (más grande, ~50% más volumen que 18650)
  Capacidad habitual: 4.000-5.000 mAh
  Voltaje nominal: 3,6-3,7V
  Uso típico: Tesla Model 3/Y (celda propia con Panasonic), herramientas eléctricas de gama
  alta, e-bikes premium, packs donde cada gramo/mAh cuenta

26650 — 26mm diámetro × 65mm alto, menos común en consumo, más en LiFePO4 industrial
  Capacidad habitual: 4.000-6.000 mAh (NMC) o 3.000-5.000 mAh (LiFePO4 cilíndrica)

FORMATO A FORMATO NUEVO — 4680 (Tesla, tab-less, mayor densidad)
  Diámetro 46mm × alto 80mm, diseño "tabless" (sin pestaña de contacto, corriente
  distribuida en todo el borde) — reduce resistencia interna y mejora disipación térmica
  Estado 2026: producción en Giga Texas y Giga Nevada, aún no accesible como celda suelta
  para DIY — vigilar disponibilidad, no comprar hoy para proyecto casero
```

---

## Fabricantes de referencia cilíndricas — quién hace qué

```
SAMSUNG SDI (30Q, 40T, 50S) — el estándar de fiabilidad en 18650/21700
  30Q: 3.000mAh, alta descarga (15A) — favorito en packs de e-bike y herramienta
  50S (21700): 5.000mAh, buena relación capacidad/descarga — el "todoterreno" 21700

MOLICEL (P26A, P28A, P42A) — favorito de la comunidad de alta descarga (vaping, RC, e-bike)
  P42A (21700): 4.200mAh con descarga continua de 45A — de los más agresivos en descarga
  del mercado, precio superior a Samsung/LG en la misma capacidad

LG (MJ1, M50LT) — capacidad alta, descarga moderada, buen equilibrio para power banks
  MJ1 (18650): 3.500mAh, 10A descarga continua

SONY/MURATA (VTC6, VTC6A) — históricamente la referencia en descarga agresiva 18650
  VTC6: 3.000mAh, 15A descarga continua

⚠ CELDAS "REBRANDED" O FALSIFICADAS: el mercado de 18650 sueltas (Aliexpress, vendedores
  no verificados) está lleno de celdas con capacidad marcada muy por encima de la real
  (ej. "9900mAh" en una celda que físicamente no puede superar los 3.500mAh reales).
  Comprar SIEMPRE a proveedor que teste y publique curvas de descarga reales, o testear
  uno mismo con cargador-tester antes de confiar el pack a esas celdas.
```

---

## Celdas prismáticas LiFePO4 — la base del almacenamiento doméstico

```
FORMATO: caja rectangular de aluminio, terminales en la parte superior, apilables en
  serie con busbars de cobre — el estándar del banco doméstico DIY de hoy

CAPACIDADES DE REFERENCIA 2026: 100Ah, 130Ah, 172Ah, 202Ah, 280Ah, 314Ah, 320Ah
  → 280Ah y 314Ah son las capacidades de referencia de la comunidad DIY actual;
  314Ah ha ido desplazando a 280Ah como "la celda por defecto" en 2025-2026

FABRICANTES DE REFERENCIA:
  EVE Energy — el fabricante más citado en la comunidad DIY internacional, celdas
  LF280K/LF314 con curvas de descarga bien documentadas y comparadas en foros
  CATL — mayor fabricante mundial de baterías, celdas de gran calidad pero más
  orientadas a fabricantes de packs que a venta directa suelta al DIY
  Grado de celda: "Grade A" (nueva, sin defectos) vs "Grade A+"/"B" (excedente de
  fábrica o con ligera variación de capacidad) — el DIY serio busca Grade A o A+
  con test de capacidad real incluido por el vendedor

PRECIO ORIENTATIVO (2026, importado o con almacén europeo):
  Celda EVE 280Ah Grade A: 60-70€/ud · Celda 314Ah Grade A: 65-80€/ud
  Pack completo 16S (51,2V nominal) de celdas 280-314Ah: 1.100-1.400€ solo celdas
  → añadir BMS (150-350€), carcasa y busbars (100-200€) para el coste total del banco
```

---

## Voltajes y curvas — lo que hay que saber antes de mezclar celdas

```
QUÍMICA         VOLTAJE NOMINAL   RANGO CARGA/DESCARGA      CICLOS TÍPICOS
NMC/NCA (18650/21700)   3,6-3,7V   2,5V - 4,2V              500-1.000 (80% capacidad)
LiFePO4 (cilíndrica)    3,2V       2,5V - 3,65V              2.000-4.000
LiFePO4 (prismática)    3,2V       2,5V - 3,65V              4.000-6.000 (80% DoD)

REGLA DE ORO: nunca mezclar químicas distintas en el mismo string serie/paralelo — las
  curvas de voltaje no coinciden y el BMS no puede proteger correctamente a ambas a la vez

REGLA DE ORO 2: en un grupo paralelo, usar SIEMPRE celdas del mismo modelo, mismo lote
  si es posible, y con capacidad real medida dentro de un 3-5% entre ellas — celdas
  desiguales en paralelo se descompensan con el uso y una celda débil se sobrecarga
  mientras el grupo aparenta estar bien
```

---

## Novedades 2025-2026

```
→ 314Ah desplaza a 280Ah como capacidad de referencia en la comunidad DIY internacional,
  con mejor precio por Ah en la mayoría de proveedores europeos a partir de 2025.
→ La celda tab-less 4680 de Tesla/Panasonic sigue sin llegar al mercado de celda suelta
  para DIY en 2026 — su ventaja de menor resistencia interna y mejor disipación térmica
  aún no es aprovechable fuera de vehículos de fábrica.
→ CATL y EVE amplían gama de celdas LFP de mayor capacidad unitaria (320Ah+) reduciendo
  el número de celdas necesarias por string y simplificando el balanceo de packs grandes.
```

---

→ Elegir BMS acorde a la configuración de celdas elegida: [[BMS — selección, cableado y protecciones]]
→ Comparativa de químicas y alternativas emergentes: [[Química y tecnologías emergentes — NMC, LFP, sodio-ion, solid-state]]
→ Dónde comprar celdas en España: [[Fuentes, comunidades y proveedores — tiendas España, foros, canales]]
