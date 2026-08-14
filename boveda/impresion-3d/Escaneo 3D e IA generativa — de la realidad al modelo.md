---
tipo: componente
sector: impresion-3d
tags: [software, escaneo-3D, LIDAR, Polycam, Revopoint, IA-generativa, Meshy, Tripo3D, reparacion-malla]
---
# Escaneo 3D e IA generativa — de la realidad al modelo

> Dos caminos distintos para saltarte el modelado desde cero: capturar un objeto que ya existe, o pedirle a una IA que invente uno — ninguno sustituye al CAD cuando la pieza necesita tolerancias exactas, pero ambos aceleran brutalmente la fase de boceto.

---

## Escaneo 3D con iPhone/iPad LIDAR + Polycam

```
HARDWARE: cualquier iPhone Pro (12 Pro en adelante) o iPad Pro con sensor LIDAR integrado
  — sin comprar hardware adicional, el escáner ya está en el bolsillo de mucha gente
SOFTWARE: Polycam — la app de referencia en iOS, combina fotogrametría (fotos) y LIDAR
  para modelos 3D de calidad variable según el modo elegido
  → Modo LIDAR: rápido, bueno para objetos grandes/habitaciones, menos detalle fino
  → Modo fotogrametría (solo fotos): más lento, mejor detalle en objetos pequeños con
    buena iluminación y textura superficial (superficies muy lisas/reflectantes fallan)
FLUJO: capturar → Polycam procesa la nube de puntos → exporta OBJ/STL → reparar malla en
  Meshmixer/Netfabb antes de imprimir (casi ningún escaneo sale "manifold" a la primera)
```

---

## Escáneres dedicados — Revopoint y similares

```
REVOPOINT RANGE 2 — escáner de mano estructurado por luz
  Velocidad de escaneo hasta 16 fps, conexión WiFi 6 al móvil para maniobrar libremente
  alrededor de objetos grandes sin cable
  Ventaja frente a LIDAR de móvil: mayor precisión dimensional, mejor en superficies
  pequeñas y con detalle fino (joyería, piezas mecánicas a replicar)
CREALITY RAPTOR y equivalentes: gama de escáneres de sobremesa/mano orientados a objetos
  de tamaño medio con buena relación precio/precisión para uso maker semi-profesional
CUÁNDO INVERTIR EN ESCÁNER DEDICADO vs usar el móvil: cuando la pieza necesita precisión
  dimensional real (ingeniería inversa de un repuesto) y no solo una réplica visual
```

---

## Reparación de malla — el paso que casi nadie se salta

```
POR QUÉ HACE FALTA: un escaneo (o un modelo mal exportado) casi nunca es "manifold"
  (sólido cerrado, sin agujeros ni normales invertidas) — el slicer necesita un sólido
  válido para generar G-code correcto, o falla o produce piezas defectuosas

MESHMIXER (Autodesk, gratuito) — el más usado en la comunidad maker
  Repara agujeros, suaviza ruido de escaneo, permite esculpido/edición orgánica de malla,
  herramienta "Make Solid" para forzar un sólido válido desde una malla problemática

NETFABB (Autodesk) — orientado a preparación de impresión industrial/profesional
  Detección y reparación automática avanzada, análisis de espesor de pared, más pensado
  para flujos de producción que para el hobby puro

MICROSOFT 3D BUILDER (Windows, gratuito) — reparación básica integrada en el sistema
  Suficiente para arreglos simples rápidos, mucho más limitado que Meshmixer/Netfabb

CONCEPTO CLAVE — MANIFOLD SOLID: una malla es "manifold" cuando cada arista pertenece
  exactamente a dos caras y no hay normales invertidas ni huecos — es la condición mínima
  para que un sólido sea físicamente imprimible sin ambigüedad
```

---

## IA generativa de modelos 3D — el boceto instantáneo

```
MESHY AI — texto/imagen → modelo 3D en 20-30 segundos
  Genera modelos listos para "producción" en el sentido de tener textura y geometría
  utilizable, pero SIN las tolerancias ni la lógica funcional de una pieza diseñada en CAD

TRIPO3D / TRIPO AI — el más avanzado en 2025-2026
  Modelo 3.0 (agosto 2025, ~20.000 millones de parámetros): geometría más limpia, texturas
  basadas en física, topología dominante en quads con UVs limpios (mejor para retocar
  después en un editor de malla que la topología triangular caótica de generaciones previas)
  Modo Ultra (septiembre 2025): activos de mayor calidad para uso más exigente

SHAP-E (OpenAI, open-source) — generador text-to-3D más antiguo y limitado, útil como
  referencia histórica y para integraciones propias, superado en calidad por Meshy/Tripo3D

LUMA GENIE — otra opción del ecosistema de generación 3D con IA, enfoque similar

DÓNDE ENCAJA REALMENTE ESTA HERRAMIENTA:
  → Bien: bocetos de forma orgánica, arte/decoración, punto de partida para retocar a mano,
    ideación rápida de una figura o pieza sin restricciones mecánicas
  → Mal: piezas con tolerancias de ensamblaje, roscas, agujeros de tornillo exactos,
    cualquier cosa donde 0,2mm de más o de menos rompe el encaje — para eso, CAD paramétrico
```

---

## Flujo completo escaneo → impresión

```
1. Captura con Polycam (LIDAR/foto) o escáner dedicado (Revopoint)
2. Exporta a OBJ o STL de alta densidad de polígonos
3. Repara la malla en Meshmixer — cierra agujeros, elimina ruido, verifica "manifold"
4. Simplifica polígonos si el archivo es excesivamente pesado (decimation) sin perder
   detalle relevante para la impresión
5. Escala/ajusta si es una réplica funcional (verificar dimensiones reales con calibre)
6. Slicing normal en el software elegido
```

---

## Errores comunes

```
★★★★★ Enviar directamente un escaneo sin reparar al slicer — genera errores de slicing o
  piezas con agujeros/geometría imposible que arruinan la impresión a mitad de camino
★★★★☆ Esperar tolerancias mecánicas de un modelo generado por IA — estas herramientas
  optimizan forma y textura visual, no encaje funcional; siempre revisar y ajustar en CAD
  antes de imprimir una pieza que tenga que encajar con otra
★★★☆☆ Escanear superficies muy reflectantes o transparentes sin preparación (spray mate
  temporal) — el LIDAR y la fotogrametría fallan sistemáticamente en estos materiales
★★★☆☆ No verificar la licencia de uso de un modelo generado por IA antes de venderlo —
  las políticas de derechos sobre contenido generado por IA varían entre plataformas
```

---

## Novedades 2025-2026

```
→ Tripo3D lanza su modelo 3.0 (agosto 2025, ~20B parámetros) con topología limpia en quads
  — un salto de calidad notable frente a las mallas triangulares "sucias" de generaciones
  anteriores de IA generativa 3D
→ Meshy AI consolida su posición como generador rápido (20-30s) para iteración veloz de
  ideas, con enfoque claro en assets listos para usar más que en precisión de ingeniería
→ El escaneo LIDAR de móvil (iPhone/iPad Pro) sigue democratizando la captura 3D casual
  — ya no hace falta hardware dedicado para un escaneo aceptable de objetos medianos-grandes
```
