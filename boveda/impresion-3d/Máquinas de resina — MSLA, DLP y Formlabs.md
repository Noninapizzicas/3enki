---
tipo: componente
sector: impresion-3d
tags: [maquinas, resina, MSLA, Elegoo, Anycubic, Formlabs]
---
# Máquinas de resina — MSLA, DLP y Formlabs

> En resina, la resolución de la pantalla LCD y la uniformidad de la luz UV importan más que casi cualquier otra especificación del catálogo — y la comunidad detrás de la máquina importa más de lo que parece cuando algo falla.

---

## Cómo leer la ficha técnica de una MSLA

```
RESOLUCIÓN XY (en "K" — miles de píxeles de ancho de la pantalla LCD):
  4K: entrada, suficiente para miniaturas de 28-32mm sin gran exigencia de detalle
  8K/9K: gama media, detalle notable en miniaturas grandes y joyería
  12K/16K: gama alta, tamaño de píxel muy pequeño → detalle extremo, precio proporcional

VELOCIDAD DE CURADO POR CAPA: cuánto tarda en curar cada capa (segundos) — determina el
  tiempo total de impresión junto a la altura de capa elegida

UNIFORMIDAD DE LUZ: cuán homogénea es la matriz de LEDs UV sobre toda la superficie — una
  luz desigual da piezas mal curadas en los bordes aunque la resolución sea alta en el papel
```

---

## Gama Elegoo (referencia de mercado masivo)

```
SATURN 4 ULTRA — la opción más sólida para entrar con garantías (2026)
  Resolución: 12K (también existe variante 16K)
  Precio 2026: ≈524-599$ (12K), con ofertas puntuales bajo 350$
  Fortaleza: comunidad muy activa, repuestos fáciles, buen soporte de terceros (resinas,
  perfiles de slicer, piezas de recambio)

MARS 4 / MARS 5 ULTRA — gama compacta, formato más pequeño
  Mars 5 Ultra destaca por nitidez a 32µm de tamaño de píxel
  Precio 2026: rango medio-bajo dentro del catálogo Elegoo

PÚBLICO OBJETIVO: hobbistas, pintores de miniaturas, creadores de terreno de wargame,
  joyería de pequeña escala, producción en pequeño lote — el segmento donde Elegoo domina
```

---

## Formlabs — la gama profesional

```
FORM 4 — cuarta generación, sistema de impresión industrial de escritorio
  Precio 2026: ≈3.499-4.069$ (standalone) / ≈5.849-6.599$ (con lavado y curado incluidos)
  Diferencial: resinas propias de alta consistencia (79-150+€/L, frente a 20-50€/L de
  resinas de terceros compatibles con Saturn 4 Ultra), soporte profesional, integración
  con flujos de ingeniería, odontología y prototipado industrial

OPEN MATERIAL MODE (OMM) — novedad 2026
  Actualización opcional (~875$) que desbloquea el uso de resinas de terceros 405nm en el
  Form 4 — antes limitado casi en exclusiva al catálogo de resinas Formlabs

PÚBLICO OBJETIVO: equipos de ingeniería, laboratorios dentales, diseño de producto y
  entornos de prototipado industrial donde la consistencia pieza-a-pieza y el soporte con
  SLA (no solo comprar la máquina y ya) justifican 6-8x el precio de una Elegoo equivalente
```

---

## Anycubic y otras alternativas

```
ANYCUBIC PHOTON MONO SERIES — el gran competidor directo de Elegoo
  Similar segmento de precio y resolución, la diferencia frente a Elegoo suele estar en
  robustez de chasis y uniformidad de luz más que en especificación de papel

CRITERIO DE ELECCIÓN ENTRE ELEGOO Y ANYCUBIC:
  Ambas marcas ofrecen especificaciones muy parecidas en el mismo rango de precio —
  la decisión suele venir por disponibilidad de repuestos localmente, comunidad de
  perfiles de resina compartidos y soporte postventa observado, no por diferencia técnica
```

---

## Componentes críticos de una estación de resina completa

```
IMPRESORA — la máquina en sí (250-600€ segmento hobbista)
CUBETA/VAT — la bandeja donde reposa la resina, con film FEP/nFEP que se desgasta y hay
  que cambiar periódicamente (10-20€ el recambio, cada 20-40 impresiones aprox.)
ESTACIÓN DE LAVADO Y CURADO — muchos kits la incluyen o se compra aparte (60-150€) —
  automatiza el lavado en IPA (o agua en water-washable) y el curado UV final
EPI (equipo de protección): guantes de nitrilo (NUNCA látex, la resina los degrada),
  gafas, ventilación — ver [[Normativa y seguridad — VOCs, resina, ventilación, reciclaje]]
```

---

## Errores comunes al comprar/usar

```
★★★★★ No presupuestar la estación de lavado+curado, el IPA y los guantes como parte del
  coste real — el TCO de resina es más alto de lo que sugiere el precio de la máquina sola
★★★★☆ Comprar resolución máxima (16K) sin necesitarla — para piezas medianas sin detalle
  extremo, un 8K/9K bien calibrado da resultados prácticamente indistinguibles
★★★★☆ Dejar la cubeta con resina sin usar durante semanas expuesta a luz — degrada la
  resina y puede curar parcialmente contra el film, dañándolo
★★★☆☆ Ignorar la uniformidad de luz al comparar máquinas de la misma resolución — dos
  impresoras "12K" pueden dar resultados de borde muy distintos por este factor
```

---

## Novedades 2025-2026

```
→ Formlabs abre su ecosistema con Open Material Mode en el Form 4 (2026) — reconoce la
  presión de precio de resinas de terceros y responde con una vía oficial en lugar de
  mantener el catálogo completamente cerrado
→ La brecha de precio Elegoo↔Formlabs sigue siendo de 6-8x en la máquina y 2-4x en la
  resina — la elección depende del uso: hobby/pequeña serie vs entorno profesional exigente
→ Elegoo entra fuerte también en FDM (Centauri Carbon) — la marca deja de ser "solo resina"
  y compite en las dos tecnologías al mismo tiempo
```
