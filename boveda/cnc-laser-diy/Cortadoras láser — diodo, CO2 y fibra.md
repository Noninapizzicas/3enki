---
tipo: componente
sector: cnc-laser-diy
tags: [laser, laser-diodo, laser-co2, laser-fibra, xtool, sculpfun, omtech, ortur, k40]
---
# Cortadoras láser — diodo, CO2 y fibra

> Tres tecnologías con el mismo verbo — cortar con luz — y tres economías totalmente distintas: el diodo democratizó el corte láser de 2.000€ a 200€ en una década, el CO2 sigue siendo el rey de la versatilidad, y la fibra es la única puerta real hacia el metal.

---

## Las tres familias

```
LÁSER DE DIODO (450nm, azul)
  Fuente: semiconductor, como un puntero láser potenciado — sin tubo, sin espejos de vacío
  Corta: madera blanda hasta 15-20mm, cuero, cartón, corcho, acrílico NEGRO (absorbe azul)
  No corta bien: acrílico transparente/claro (el láser azul lo atraviesa sin absorber)
  Vida útil: 10.000-20.000h de diodo, degradación gradual de potencia
  Coste: 150-1.200€ según potencia — la revolución de precio de 2022-2026
  Mantenimiento: casi nulo — limpiar lente cada semana de uso intenso

LÁSER CO2 (10.600nm, infrarrojo, tubo de vidrio con gas CO2+N2+He)
  Fuente: tubo de vidrio sellado excitado eléctricamente, o RF (mejor calidad de haz)
  Corta: madera hasta 20-25mm, TODOS los acrílicos (transparente incluido), tela, papel,
    cuero, corcho, metales anodizados/pintados (marca, no corta metal desnudo)
  No corta: metal desnudo reflectante (aluminio, acero, cobre) sin recubrimiento
  Vida útil: tubo de vidrio 1.000-2.000h (sustituible, 80-300€), RF 10.000h+ (más caro)
  Coste: 400€ (K40 básico) a 5.000-15.000€ (Thunder Laser Nova, gama profesional)
  Mantenimiento: alineación de espejos, refrigeración por agua (bomba + radiador o chiller)

LÁSER DE FIBRA (1064nm, infrarrojo cercano, fuente de fibra dopada)
  Fuente: fibra óptica dopada con itrio, sin partes móviles ni gas
  Corta/marca: METALES desnudos (acero inoxidable, aluminio, latón, oro, plata), plástico
    duro, cerámica — absorción alta en materiales reflectantes que CO2 y diodo no tocan
  No hace: no corta madera/acrílico de forma limpia (pasa a través, poca absorción)
  Vida útil: 100.000h la fuente — prácticamente sin mantenimiento
  Coste: desde 2.500-5.000€ (marcado 20-30W) hasta 15.000€+ (corte de chapa)
  Mantenimiento: mínimo — es la tecnología más "cerrar y usar" de las tres
```

---

## Diodo — marcas y modelos 2026 (España)

```
ENTRADA (150-450€)
  Ortur Laser Master 2 Pro       — 20W óptico · área 400×400mm · sin enclosure
  Sculpfun S9                    — 5,5W óptico · el más barato para probar el mundo láser
  Creality Falcon A1              — 22W · detección automática de material · buena app

INTERMEDIO (450-900€) ← el punto dulce para la mayoría
  xTool D1 Pro 20W                — 1.119-1.260€ (2026) · el más "plug&play" de gama media,
                                      cabezal de precisión, compatible con módulos IR
  Sculpfun S30 Ultra 33W          — 449-999€ según kit (2026) · lente intercambiable
                                      (10× más vida útil), eje X sobre raíl lineal 0,005mm
  Ortur Laser Master 3 (LM3)      — 518-795€ (2026) · dual-laser 10W, hasta 40W con upgrade,
                                      air assist integrado, patas plegables

ALTA POTENCIA DIODO (900-2.000€)
  Sculpfun S70 MAX                — 72W de potencia de corte, el tope de gama diodo actual
  xTool S1 40W (enclosure)        — 1.819-2.899€ según kit (2026) · 8 diodos de 5,5W
                                      combinados en un único haz de 40W, corta cerezo de
                                      18mm o acrílico oscuro de 15mm en una pasada
```

## CO2 — marcas y modelos 2026 (España)

```
K40 — EL CLÁSICO (400-700€)
  El "Model T" del láser: origen chino genérico, tubo de 40W, controlador M2 Nano cerrado
  y propietario. Se compra sabiendo que la mitad del valor está en modificarlo (ver nota
  Láser DIY). OMTech K40+ (~680-690€, 2026) llega ya con LightBurn compatible de fábrica —
  la variante recomendada frente al K40 genérico de AliExpress si no quieres tocar hardware.

GAMA MEDIA (1.000-3.500€)
  OMTech serie Turbo (50W-80W)    — área 500×300mm a 900×600mm según modelo
  Thunder Laser Nova              — RF opcional, calidad de haz superior, cámara de vacío

PROFESIONAL (4.000€+)
  Thunder Laser Nova 63/Bolt      — corte industrial, chiller integrado, área grande
  Epilog                          — 7.500-45.000€ según área y potencia, estándar en talleres
```

## Fibra — cuándo dar el salto al metal

```
Marcado/grabado básico (2.500-5.000€): 20-30W MOPA, joyería, chapas, herramientas
Corte de chapa fina (8.000€+): 500W+, ya es maquinaria industrial, fuera del rango DIY
Sculpfun A5 Pro 40W, ATOMSTACK Swift 7W: entrada de marcas maker al metal, precio contenido
```

---

## Cuál elegir — criterio real, no catálogo

```
"Quiero probar el mundo láser gastando poco"        → Sculpfun S9 o Ortur LM2 Pro
"Quiero cortar madera de verdad, sin enclosure"      → xTool D1 Pro 20W o Sculpfun S30 Ultra
"Tengo niños/mascotas en casa, necesito enclosure"   → xTool S1 40W (clase 1, sin gafas)
"Quiero acrílico transparente y vidrio"              → CO2 (OMTech K40+ o superior) — el
                                                         diodo simplemente no lo corta bien
"Quiero grabar acero inoxidable/aluminio"            → fibra — es la única tecnología que
                                                         funciona de verdad en metal desnudo
"Tengo presupuesto de taller y quiero producir"      → CO2 gama media/alta o combo CO2+fibra
```

---

## Errores comunes al elegir/usar

```
→ Comprar diodo esperando cortar acrílico transparente — físicamente no absorbe 450nm,
  resultado: fundido feo o nada. Usa acrílico NEGRO/oscuro con diodo, transparente con CO2.
→ Subestimar el área de trabajo real — muchos anuncian el área del riel, no el área útil
  tras restar los márgenes de la mesa y el recorrido del cabezal.
→ No comprobar el voltaje/plug del K40 chino — muchos llegan configurados a 110V o con
  clavija no europea; revisar antes de conectar.
→ Ignorar la potencia "óptica" vs "de la fuente" — un módulo "80W" de diodo suele ser en
  realidad 20W ópticos reales con una fuente de alimentación de 80W nominal (confusión de
  marketing extendida en el sector, revisar siempre el dato "potencia óptica").
```

---

## Novedades 2025-2026

```
→ xTool S1: hardware v1.2 (enero 2025) mejora el interlock de la tapa y añade WiFi;
  módulo IR 1064nm en Q4 2024 abre marcado ligero de metal a una máquina de diodo.
→ Sculpfun S30 Ultra: lente reemplazable con vida útil 10× superior a lentes fijas — reduce
  el coste de mantenimiento a largo plazo frente a generaciones anteriores.
→ La brecha de potencia diodo-CO2 sigue cerrándose: 40W diodo (xTool S1, Sculpfun S70 MAX
  a 72W) ya iguala capacidad de corte de un CO2 40-50W en madera y acrílico oscuro, aunque
  el CO2 sigue siendo insustituible en acrílico transparente y vidrio.
→ xTool amplía catálogo en CES 2026 con impresión UV — la marca deja de ser "solo láser".
```

→ Cómo modificar un K40 o construir tu propio láser: [[Láser DIY — construcción, upgrades K40 y enclosures]]
→ Qué corta cada potencia, tabla completa: [[Materiales para láser — qué corta cada potencia]]
→ Air assist, extracción y normativa de seguridad: [[Air assist, extracción y seguridad láser — clase 4, EPIs, normativa]]
