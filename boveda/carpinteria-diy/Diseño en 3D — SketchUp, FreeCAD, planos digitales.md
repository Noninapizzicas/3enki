---
tipo: componente
sector: carpinteria-diy
tags: [diseño-3D, SketchUp, FreeCAD, Shapr3D, planos, CNC, SVG, DXF, modelado, 3D-Warehouse, OpenCutList]
---
# Diseño en 3D — SketchUp, FreeCAD, planos digitales

> El software de diseño 3D convierte el proceso de diseño en un ensayo virtual. Puedes ver el mueble antes de comprar una sola tabla, detectar errores de proporción antes de cortar, y exportar directamente a CNC para cortes de precisión milimétrica. El tiempo invertido en el modelo 3D se recupera en el taller.

---

## SketchUp — el estándar de la carpintería DIY

```
POR QUÉ SKETCHUP ES EL FAVORITO:
  → Curva de aprendizaje baja: en 2-4 horas dominas lo básico
  → Comunidad enorme: millones de tutoriales y modelos en 3D Warehouse
  → Free version (Web): sin instalación · funciona en cualquier navegador
  → El complemento OpenCutList genera la lista de materiales automáticamente
  → Exporta DXF para CNC directamente desde el modelo

VERSIONES DISPONIBLES (2024):
  SketchUp Free (Web): app.sketchup.com
    → Gratis · online · sin instalación
    → Limitaciones: sin acceso a extensiones · sin 3D Warehouse desde la web (solo importar)
    → SUFICIENTE para el 90% de los proyectos de carpintería DIY
    
  SketchUp Go (antes: Shop): 119€/año
    → Acceso a extensiones · 3D Warehouse · exportar a DXF/DWG
    → Para quien diseña en serie o necesita el DXF para CNC
    
  SketchUp Pro: 349€/año
    → Versión profesional · LayOut (planos 2D automáticos) · documentación técnica
    → Para talleres que generan planos para clientes o para corte CNC extensivo

EMPEZAR EN SKETCHUP (los 10 minutos más importantes):
  1. Crear cuenta gratuita en sketchup.com
  2. Abrir "SketchUp Free" en el navegador
  3. Las 3 herramientas básicas: Rectangle · Push/Pull · Line (teclado: R · P · L)
  4. Para un tablero: Rectangle → define las dimensiones → Push/Pull → da espesor
  5. Para mover: Select (Space) · Move (M) · Rotate (Q)
  6. Grupos: seleccionar toda la pieza · Edit → Make Group (cada pieza es un grupo)
     → SIN grupos: todo se pega a todo al tocarse · ES EL ERROR MÁS COMÚN

EXTENSIONES CLAVE (solo SketchUp Pro/Go):
  OpenCutList (extensión gratuita):
    → Se instala desde la Extension Warehouse
    → Analiza el modelo y genera la lista de cortes optimizados por tablero
    → Define qué piezas son de qué material · calcula el m² necesario
    → Exporta la lista a CSV o PDF · el ahorro de tiempo es enorme
    
  Wood Center (extensión gratuita):
    → Librería de materiales de madera con las propiedades reales
    → Los tableros tienen veta correcta · importante para la visualización
    
  Artisan (extensión de pago ~$39):
    → Para formas orgánicas · live edge · esculturas · bordas curvas
    → No necesaria para muebles estándar

3D WAREHOUSE (warehouse.sketchup.com):
  → La mayor biblioteca de modelos 3D del mundo · gratuita
  → Más de 5 millones de modelos · filtrar por "furniture" · "woodworking"
  → Para carpintería: buscar el tipo de mueble que quieres hacer y ver si alguien ya lo modeló
  → Importar el modelo → adaptarlo a tus medidas → ya tienes el plano
  → CUIDADO: algunos modelos tienen errores · verificar las medidas antes de usar

TUTORIAL BÁSICO — MESA EN 30 MINUTOS:
  1. Rectángulo 800×1600mm (la vista de planta del tablero)
  2. Push/Pull 40mm hacia arriba (el grosor del tablero)
  3. Make Group
  4. Orbit (O) para girar la vista · ver el tablero en 3D
  5. Nuevos grupos para las 4 patas: Rectangle 60×60mm · Push/Pull 720mm
  6. Move (M) para posicionar cada pata en su esquina
  7. View → Hidden Geometry para ver las líneas del modelo
  8. Medidas: Tools → Tape Measure para verificar las dimensiones

PLANOS 2D DESDE SKETCHUP:
  Camera → Standard Views → Front / Side / Top: las 3 vistas clásicas
  → Paralela (Ortográfica): Camera → Parallel Projection (no perspectiva)
  → Hacer captura de pantalla con las vistas
  → En SketchUp Pro: LayOut genera los planos con cotas automáticas
  → En la versión Free: las capturas de pantalla sirven para el taller con algo de práctica
```

---

## FreeCAD — la alternativa open-source completa

```
QUÉ ES FREECAD:
  Software de CAD paramétrico de código abierto · gratuito · sin limitaciones
  → Orientado a ingeniería y diseño mecánico · pero muy útil para carpintería
  → Más potente que SketchUp para: piezas con tolerancias precisas, exportar a CNC, cálculo estructural
  → Más curva de aprendizaje: 10-20 horas para dominar lo básico

INSTALACIÓN Y VERSIONES:
  freecad.org: descarga gratuita para Windows, Mac, Linux
  Versión recomendada: FreeCAD 0.21+ (la última estable de 2024)
  → FreeCAD 1.0 (en desarrollo en 2024): mejoras importantes de estabilidad

WORKBENCHES RELEVANTES PARA CARPINTERÍA:
  Part Design: modelado paramétrico · la forma de trabajo recomendada
  Sketcher: dibujo 2D paramétrico · la base de todo en FreeCAD
  Path Workbench: generación de G-code para CNC · muy potente
  TechDraw Workbench: planos 2D automáticos con cotas · equivalente a LayOut de SketchUp
  Arch Workbench: para arquitectura y construcción · útil para autoconstrucción

FLUJO TRABAJO EN FREECAD (carpintería):
  1. Sketcher: dibujar el perfil 2D con dimensiones paramétricas
  2. Part Design → Pad: extruir el sketch en 3D (equivalente a Push/Pull)
  3. Copiar y posicionar piezas con el Part Workbench
  4. TechDraw: generar los planos con vistas y cotas en formato A4

EXPORTACIÓN PARA CNC:
  Exportar como DXF: File → Export → DXF R12 (el más compatible con CNC)
  Path Workbench → CAM: generación de G-code para fresadora CNC
  → FreeCAD es el único software libre que genera G-code de calidad para CNC de madera

RECURSOS FREECAD:
  freecad.org/wiki: documentación oficial · muchos tutoriales
  YouTube: "Adventures in FreeCAD" · "MangoJelly Solutions" · en inglés
  Forum: forum.freecad.org · la comunidad más activa de usuarios
```

---

## Alternativas — Shapr3D, Fusion 360, LibreCAD

```
SHAPR3D (iOS/iPadOS/Mac/Windows):
  → La mejor opción si trabajas con iPad + Apple Pencil
  → Modelado directo intuitivo (no paramétrico) · arrastrar y estirar
  → Versión gratuita: 2 objetos activos · limitada
  → Pro: 25€/mes o 250€/año
  → El modelado con el Pencil en el iPad es la experiencia más intuitiva del mercado
  → Importa/exporta STEP, DXF, STL

FUSION 360 (Autodesk):
  → Gratuito para uso personal (con limitaciones en 2024)
  → El más potente para piezas de alta precisión y CNC avanzado
  → Curva de aprendizaje alta · más orientado a metalurgia/ingeniería mecánica
  → El CAM integrado es el mejor del mercado para genera G-code de CNC
  → Disponible en Mac/Windows · cloud-based (necesita conexión)

LIBRECAD (2D únicamente):
  → El equivalente libre de AutoCAD para planos 2D
  → Para quien solo necesita dibujar planos técnicos en 2D (planta, alzado, sección)
  → Gratuito · sin necesidad de internet · muy ligero
  → Exporta DXF directo · compatible con cualquier CNC
  → Curva de aprendizaje: 2-4 horas para los básicos

MAKERCASE (makercase.com):
  → Web que genera el patrón de cajas con encastres (finger joints) automáticamente
  → Introduce las medidas → genera el SVG/DXF para cortar en CNC o láser
  → Ideal para cajas de madera o cajones con finger joints
  → Gratuito · sin instalación

CUTLISTOPTIMIZER.COM:
  → Introduce las piezas que necesitas + el tamaño del tablero
  → El optimizador dispone las piezas para minimizar el desperdicio
  → Gratis para proyectos básicos · muy útil para pedidos de corte en maderería
  → Versión avanzada: 10€/mes
```

---

## De la pantalla al CNC — flujo completo

```
EL FLUJO DIGITAL-A-MADERA:

  DISEÑO → SKETCHUP / FREECAD:
  1. Modelar el mueble en 3D con dimensiones exactas
  2. Verificar todas las medidas · simular el ensamblaje
  3. Generar la lista de materiales (OpenCutList / manualmente)
  
  OPTIMIZACIÓN → CUTLISTOPTIMIZER.COM:
  4. Introducir las piezas de la lista de materiales
  5. El optimizador las dispone en tableros estándar (2440×1220mm)
  6. Ver el desperdicio · ajustar orientaciones si es necesario
  7. Imprimir el plano de corte para llevarlo a la maderería o CNC
  
  EXPORTACIÓN → DXF / SVG:
  8. Exportar las piezas en DXF (para CNC de fresado) o SVG (para cortadora láser)
  9. SketchUp Free: exportar vistas como imagen · procesar con Inkscape (gratuito) para DXF
  10. SketchUp Go/Pro: exportar directamente en DXF
  11. FreeCAD: exportar directamente en DXF compatible con CNC
  
  CORTE CNC → TALLER EXTERNO:
  12. Llevar el DXF a un taller de CNC de madera
      → Talleres en España: buscar "corte CNC madera [ciudad]" · también cortarla.com, ponoko.com
      → Precio orientativo: 50-100€/hora de máquina · más el material
  13. El taller corta las piezas numeradas según el diseño
  14. Recoger las piezas y montar
  
  O CORTE EN CNC PROPIO (nivel maker avanzado):
  → Máquinas CNC de madera para taller: ShopBot (USA) · Inventables X-Carve (USA)
  → CNC open-source: LowRider CNC (Ryan Zellars) · Maslow CNC (vertical, barato)
  → En España: Openbuilds es la referencia para máquinas CNC DIY

WIKIHOUSE + CNC (el flujo completo):
  1. Descargar los archivos de wikihouse.cc
  2. Abrir en Rhino + Grasshopper (o adaptación a FreeCAD)
  3. Personalizar las medidas de la estructura
  4. Exportar las piezas en DXF
  5. Llevar el DXF al taller de CNC (contrachapado birch 18mm)
  6. Recoger las piezas numeradas y montar (como IKEA pero de una casa)
```

---

## Herramientas de planos y medición digital

```
APLICACIONES DE MEDICIÓN:
  
  Magic Plan (iOS/Android — magicplan.app):
  → Escanea el espacio con la cámara y genera el plano de planta automáticamente
  → Buena precisión (±2-5%) · gratis para exportar PDF · planos interactivos
  → Uso: medir la habitación antes de diseñar el mueble que la ocupa
  
  Canvas (iOS — canvas.io):
  → Usa el LIDAR del iPhone Pro para escanear espacios en 3D
  → Genera nubes de puntos + planos automáticos · precisión centimétrica
  → Gratis para el escaneo · de pago para la exportación avanzada
  
  RoomScan Pro (iOS):
  → Alternativa económica a Canvas · sin LIDAR · buena precisión para espacios
  → Precio: ~10€ la app · exporta DXF y PDF
  
  Nivel Digital (app de nivel):
  → La app de nivel del teléfono · precisión: ±0,1-0,5°
  → Usar con precaución para carpintería: un nivel de burbuja físico es más preciso
  → Muy útil para: verificar niveles de suelo antes de una obra · verificar inclinaciones de cubierta

CÁLCULO DE MATERIALES:
  spreadsheet (Excel / LibreOffice Calc):
  → Para cada proyecto: crear una hoja con piezas · dimensiones · m² · precio/m²
  → Total automático: el presupuesto exacto antes de comprar
  → Añadir columna "% de merma": 15% para pino · 20% para maderas nobles (defectos)
  
  OpenCutList (en SketchUp):
  → Ya comentado arriba · la automatización completa de la lista de materiales
  
  BuildCalc (iOS/Android):
  → Calculadora de construcción · conversión automática de pies/pulgadas a métrico
  → Para quien trabaja con planos americanos (pies y pulgadas) · imprescindible

APPS DE REFERENCIA:
  Woodworking Tools Guide (iOS/Android):
  → Guía de herramientas con usos y técnicas · para consultar en el taller
  
  Wood Moisture Meter (apps):
  → Simulan un higrómetro de madera pero NO son precisos · solo referencia
  → Para mediciones reales: comprar un higrómetro físico (Wagner, Extech: 15-40€)

GESTIÓN DE PROYECTOS:
  Notion / Obsidian (este vault):
  → Para registrar materiales, costes, fotos del proceso y aprendizajes de cada proyecto
  → La nota de cada proyecto tiene: boceto, lista de materiales, coste real, tiempo real, lo que cambiaría
  
  Trello / Linear:
  → Para proyectos con múltiples fases (como una caseta de jardín)
  → Tarjetas por fase: diseño, materiales, cimentación, estructura, acabados
```

---

## Imprimir los planos — el taller necesita papel

```
POR QUÉ EL PAPEL EN EL TALLER:
  La pantalla se llena de polvo · el papel se puede doblar · el lápiz anota cambios
  → Imprimir los planos en papel A3 (o A4 para piezas pequeñas) antes de empezar
  → Llevar las medidas anotadas a la maderería: el corte sin papel es el principal error

CÓMO IMPRIMIR DESDE SKETCHUP (versión Free):
  1. Camera → Parallel Projection (proyección ortográfica)
  2. Camera → Standard Views → Front (o la vista que necesitas)
  3. Ajustar el zoom para que el mueble ocupe la pantalla
  4. File → Print (o captura de pantalla → imprimir desde el visor)
  → Sin escala automática en la versión Free · añadir una cota de referencia manual visible

CÓMO IMPRIMIR A ESCALA REAL:
  Para piezas pequeñas (< A4): imprimir a escala 1:1 · la pieza es plantilla directa
  Para piezas medianas (A3 / A2): usar plotter si tienes acceso · o dividir en A4
  Para piezas grandes: imprimir a 1:5 o 1:10 con barra de escala visible
  → Tasterilla importante: anotar la escala y las dimensiones clave en el mismo papel

LISTADO DE CORTE — EL PAPEL MÁS IMPORTANTE DEL PROYECTO:
  Nombre pieza | Cant. | Largo (mm) | Ancho (mm) | Grosor (mm) | Material | Notas
  ---|---|---|---|---|---|---
  Tablero superior | 1 | 1.800 | 800 | 40 | Roble | Laminado OK
  Pata delantera dcha | 1 | 720 | 60 | 60 | Roble | Mortaja 8×40mm a 50mm del extremo
  
  → Esta lista es lo que llevas a la maderería
  → Lo más importante: tener la lista ANTES de comprar · no a ojo
```

