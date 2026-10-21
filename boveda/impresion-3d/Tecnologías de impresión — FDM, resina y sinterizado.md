---
tipo: componente
sector: impresion-3d
tags: [FDM, MSLA, SLA, SLS, MJF, tecnologias, fundamentos]
---
# Tecnologías de impresión — FDM, resina y sinterizado

> No hay una tecnología "mejor" — hay una tecnología correcta para cada pieza, y confundirlas es la forma más rápida de tirar tiempo y material.

---

## FDM (Fused Deposition Modeling) — extrusión de filamento

```
PRINCIPIO: un filamento termoplástico se funde en un hotend (190-320°C según material) y se
  deposita capa a capa (0,08-0,4 mm de altura típica) sobre una cama, a veces calentada.

VENTAJAS:
  → Material barato (15-30€/kg) y sin manipulación tóxica en estado sólido
  → Piezas mecánicamente resistentes — buena para funcional, no solo estética
  → Escalable a piezas grandes (30x30x30cm y más) sin gran sobrecoste
  → Cero postprocesado obligatorio — la pieza sale "usable" de la impresora

LIMITACIONES:
  → Líneas de capa visibles (0,1-0,3mm de rugosidad Z), anisotropía (más débil entre capas
    que dentro de una capa — una pieza puede romperse "por capas" bajo carga en Z)
  → Detalle mínimo práctico: ~0,4mm (ancho de boquilla estándar) — texto pequeño y
    roscas finas quedan mal sin boquilla 0,2mm

CUÁNDO ELEGIR FDM: piezas funcionales, prototipos rápidos, piezas grandes, jigs y
  utillaje de taller, cualquier cosa donde la resistencia mecánica importa más que el
  acabado superficial
```

---

## MSLA/SLA (resina fotopolimérica)

```
PRINCIPIO: una resina líquida fotosensible se cura capa a capa con luz UV (405nm típico).
  MSLA (Masked SLA) usa una pantalla LCD monocromo como máscara sobre una matriz de LEDs UV
  — es la tecnología dominante en el segmento de escritorio (Elegoo, Anycubic, Formlabs Form
  no-láser). SLA "clásica" (láser + espejos galvanométricos) es la de Formlabs de gama alta.

VENTAJAS:
  → Detalle extraordinario — capas de 0,01-0,05mm, ideal para miniaturas, joyería, dental
  → Superficie lisa sin líneas de capa visibles a simple vista
  → Isotropía mucho mayor que FDM — pieza curada uniforme en todas direcciones

LIMITACIONES:
  → Postprocesado OBLIGATORIO: lavado en IPA (o agua si es water-washable) + curado UV
  → Resina líquida sin curar es tóxica e irritante — requiere guantes nitrilo, ventilación,
    gestión de residuos (ver [[Normativa y seguridad — VOCs, resina, ventilación, reciclaje]])
  → Volumen de impresión más limitado y caro de escalar que FDM
  → Piezas más frágiles y quebradizas que FDM salvo resinas técnicas específicas

CUÁNDO ELEGIR RESINA: miniaturas y figuras, joyería, piezas dentales/médicas, masters para
  moldes de silicona (ver [[Moldes y fundición — de la impresión a la producción en serie]]),
  cualquier pieza donde el detalle fino pesa más que la resistencia mecánica
```

---

## SLS (Selective Laser Sintering) y MJF (Multi Jet Fusion)

```
SLS: un láser sinteriza polvo de nylon (PA11/PA12) capa a capa dentro de una cámara caliente.
  El polvo no sinterizado actúa como soporte propio — NO hacen falta estructuras de soporte.

MJF (HP): tecnología equivalente pero con un agente fusor aplicado por inyección de tinta
  y calor infrarrojo en lugar de láser — más rápida en producción de lotes.

VENTAJAS:
  → Piezas funcionales de nylon con propiedades mecánicas cercanas a inyección de plástico
  → Sin soportes → libertad geométrica total, piezas móviles/articuladas impresas ensambladas
  → Acabado granulado consistente, buena repetibilidad para producción pequeña-media serie

LIMITACIONES:
  → Máquinas de nivel industrial (decenas de miles de euros) — NO es tecnología de escritorio
  → Requiere servicio de impresión externo (Sculpteo, Shapeways-like, talleres locales) para
    el maker/pequeño taller — no se autoconstruye en casa como FDM o resina

CUÁNDO ELEGIR SLS/MJF: piezas funcionales complejas en serie corta-media, geometrías
  imposibles de imprimir en FDM sin soporte, sustituir piezas de inyección para prototipo
  funcional avanzado — normalmente vía servicio de impresión bajo demanda, no compra propia
```

---

## Tabla comparativa rápida

```
CRITERIO          FDM              MSLA/SLA            SLS/MJF
Coste entrada      180-800€         200-600€            servicio externo (no compra)
Coste material     15-30€/kg        30-80€/L            servicio externo
Detalle            0,4mm            0,01-0,05mm         0,08-0,15mm aprox
Resistencia mec.   Alta (anisótropa) Media-baja (frágil) Alta (isótropa, sin soporte)
Postprocesado      Opcional         Obligatorio (tóxico) Sopla polvo, opcional teñido
Volumen máx. típico Grande (300mm+) Medio (200mm)        Medio-grande (industrial)
Mejor para         Funcional, jigs  Detalle, miniaturas   Piezas móviles, serie corta
```

---

## Errores comunes al elegir tecnología

```
★★★★☆ Comprar impresora de resina para piezas funcionales grandes — la resina estándar es
  frágil y el volumen de impresión encarece rápido; FDM en PETG/ASA suele ser mejor elección
★★★★☆ Intentar imprimir miniaturas de alto detalle en FDM esperando resultado de resina —
  el ancho de boquilla (0,4mm) pone un techo físico al detalle que ningún ajuste supera
★★★☆☆ Subestimar el coste real de la resina — no es solo el litro, es el IPA de lavado,
  los guantes, el filtro de aire y el tiempo de postprocesado por pieza
★★★☆☆ No calcular el coste de servicio SLS/MJF por pieza antes de diseñar en serie — puede
  salir más barato un molde de silicona (ver nota de moldes) para tiradas de 20-50 unidades
```

---

## Novedades 2025-2026

```
→ La línea entre FDM y resina se difumina por arriba: impresoras FDM multimaterial/multi-
  boquilla (Bambu H2C, X2D) permiten detalle y combinación de materiales que antes solo
  ofrecía resina, aunque sin igualar su resolución superficial
→ Resinas "plant-based" y water-washable ganan cuota — reducen (no eliminan) el problema de
  toxicidad y gestión de residuos que frena la adopción doméstica de MSLA
→ El mercado global de impresión 3D superó 25.000M$ en ingresos en 2025 (+23% interanual),
  con la gama baja FDM disparándose un 47% en ventas — la tecnología FDM sigue siendo la
  puerta de entrada dominante del sector doméstico
```
