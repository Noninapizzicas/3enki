---
tipo: software
sector: cnc-laser-diy
tags: [inkscape, affinity-designer, coreldraw, illustrator, vectores, etsy, archivos-corte]
---
# Diseño vectorial y fuentes de archivos — Inkscape, Affinity, CorelDraw, Etsy, Cults3D

> El láser y la CNC no entienden fotos, entienden vectores — el software de diseño 2D es donde nace realmente la pieza, mucho antes de que la máquina toque el material, y saber elegir (o comprar) el archivo correcto ahorra horas frente a dibujarlo desde cero.

---

## Herramientas de diseño vectorial

```
INKSCAPE — la opción gratuita de referencia
  Coste: 0€, open-source, multiplataforma
  Fortaleza: formato nativo SVG (el que casi todo software de láser/CNC importa sin
    fricción), curva de aprendizaje razonable, comunidad enorme de tutoriales en español
  Extensiones clave para fabricación digital:
    → J Tech Photonics Laser Tool: genera G-code directamente desde Inkscape para
      controladores GRBL, útil si no quieres pasar por LightBurn para diseños simples
    → Gcodetools: extensión más genérica orientada a CNC, genera toolpaths básicos
  Limitación: curva de aprendizaje más dura que Affinity/Illustrator para quien viene de
    diseño gráfico profesional, interfaz menos pulida

AFFINITY DESIGNER — la alternativa de pago sin suscripción
  Coste: pago único (~70€, sin cuota mensual) — la opción preferida por quien no quiere
    el modelo de suscripción de Adobe
  Fortaleza: interfaz profesional, buen manejo de curvas Bézier, exportación SVG limpia
  Uso en el sector: diseño de piezas complejas, ilustraciones para grabado detallado

CORELDRAW — el histórico de los talleres de CO2
  Coste: suscripción o licencia perpetua (gama alta, 200-500€+ según versión)
  Por qué sigue vivo: la generación de CO2 industriales (Epilog, Trotec, Chinese CO2
    genéricos) llevan décadas integrando plugins directos de CorelDraw — muchos talleres
    profesionales de rotulación y corte siguen operando sobre este flujo heredado
  Relevancia hoy: menos necesario para quien empieza con diodo/LightBurn, pero sigue
    siendo el estándar en talleres profesionales de CO2 con maquinaria más antigua

ADOBE ILLUSTRATOR
  Coste: suscripción Creative Cloud (~24€/mes solo Illustrator, 2026)
  Uso: quien ya lo tiene por trabajo de diseño gráfico lo reutiliza sin coste adicional —
    exportación SVG/DXF sin fricción, mismo flujo que Affinity en la práctica
```

---

## Formatos de archivo — qué exportar y por qué

```
SVG (Scalable Vector Graphics)
  → El formato universal para láser — LightBurn, LaserGRBL, XCS lo importan sin problema
  → Ojo con "convertir texto a trazos" antes de exportar — si no, la fuente puede no
    respetarse en el software de destino

DXF (Drawing Exchange Format, origen AutoCAD)
  → El formato preferido para CNC (VCarve, Fusion 360, CAMotics lo esperan) — conserva
    mejor la información de capas y geometría exacta para mecanizado

AI / PDF
  → Formatos de trabajo intermedios, casi siempre se exportan a SVG/DXF antes de llegar
    a la máquina — rara vez se importan directamente en software de control
```

---

## Fuentes de archivos — comprar en vez de diseñar

```
ETSY — el mercado más grande de archivos de corte
  Miles de vendedores especializados en SVG/DXF para láser: cajas, mandalas, señalética,
  personalización de regalos. Precio típico: 2-8€ por diseño individual, packs de
  temporada (Navidad, San Valentín) desde 10-20€ por decenas de archivos.
  Ventaja real: probado por otros usuarios, ajustes de kerf ya considerados en el diseño.

CREATIVE FABRICA
  Suscripción mensual con acceso a biblioteca extensa de SVG/fuentes/patrones — modelo
  más rentable que compra individual si diseñas con frecuencia (packs, membresías).

DESIGN BUNDLES
  Similar a Creative Fabrica, packs temáticos de vectores orientados específicamente a
  Cricut/láser — buena fuente para quien vende productos personalizados recurrentes.

PONOKO
  Además de marketplace de diseños, ofrece servicio de fabricación bajo demanda — útil
  como referencia de qué tipo de diseño funciona comercialmente en corte láser.

GLOWFORGE CATALOG
  Catálogo curado de diseños listos para su ecosistema, referencia de calidad aunque
  el archivo requiera adaptación de parámetros para máquinas de otras marcas.

CULTS3D
  Aunque nace orientado a impresión 3D, tiene sección creciente de archivos de corte
  láser (cajas, puzzles, decoración) — referenciar con [[../impresion-3d/00 - Impresión 3D (MOC)|Impresión 3D]]
  para el resto de su catálogo, que es mayoritariamente STL/3MF.

THE NOUN PROJECT
  Biblioteca de iconos vectoriales simples (pictogramas) — buena fuente rápida para
  grabados de logo/icono sencillos, licencia por suscripción o atribución gratuita.

FREEPIK
  Vectores generales (ilustraciones, patrones), suscripción o descarga individual —
  hay que revisar la licencia comercial si el diseño se va a vender.
```

---

## Buenas prácticas de diseño para láser/CNC

```
KERF (ancho del corte)
  El haz láser elimina material a su paso (típicamente 0,1-0,3mm en diodo, algo más en
  CO2 con potencia alta) — en piezas con encaje ajustado (finger joints, living hinges)
  hay que compensar este ancho o el ensamblaje queda flojo o demasiado apretado.

COLOR = OPERACIÓN
  La convención universal en LightBurn/Inkscape+plugin: cada color de trazo representa
  una operación distinta (rojo=corte, azul=grabado línea, negro=grabado relleno) — diseñar
  pensando en esta separación desde el principio ahorra reorganizar capas después.

TEXTO A TRAZOS
  Convertir siempre el texto a curvas/trazos antes de exportar a SVG — evita que la fuente
  no se renderice igual si el software de destino no tiene esa fuente instalada.
```

---

## Errores comunes

```
→ Comprar un archivo de Etsy pensado para Cricut (corte por cuchilla) y esperar que
  funcione igual en láser — el kerf y el grosor de línea esperado son diferentes.
→ No revisar la licencia comercial de un vector "gratis" antes de venderlo en productos —
  muchas licencias de Freepik/Noun Project prohíben uso comercial sin plan de pago.
→ Diseñar living hinges sin conocer el kerf real de tu máquina — el patrón de flexión
  depende directamente de cuánto material elimina cada corte.
→ Exportar SVG con texto sin convertir a trazos — resultado: texto que cambia de forma
  o desaparece al abrir en otro ordenador sin la fuente instalada.
```

## Novedades 2025-2026

```
→ Etsy sigue siendo, con diferencia, la fuente más citada por la comunidad hispana de
  corte láser para archivos listos para usar — el modelo de packs temáticos de temporada
  gana terreno sobre la compra de diseños sueltos.
→ Los plugins de Inkscape para GRBL (J Tech Photonics Laser Tool) mantienen actualizaciones
  activas, siguiendo siendo la vía gratuita más directa de diseño→G-code sin pasar por
  LightBurn para quien opera con presupuesto de software cero.
```

→ Software de control una vez tienes el archivo listo: [[Software de corte láser — LightBurn, LaserGRBL, xTool Creative Space]]
→ El mismo diseño vectorial también sirve para grabado en CNC: [[Router bits y parámetros de corte — feeds, speeds, brocas]]
→ CAD paramétrico compartido con impresión 3D y carpintería CNC: [[../impresion-3d/Software CAD y diseño paramétrico — FreeCAD, Fusion 360, OpenSCAD|Software CAD (impresión 3D)]]
