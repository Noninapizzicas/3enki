---
tipo: proyecto
sector: cnc-laser-diy
tags: [proyectos-cnc, relieve, letras-3d, moldes, jigs, plantillas]
---
# Proyectos CNC — relieves, letras, moldes, jigs

> Donde el láser trabaja en dos dimensiones, la CNC añade la tercera — y esa profundidad es exactamente lo que diferencia un proyecto de fresado de un proyecto de corte: la CNC no compite con el láser, empieza donde el láser termina.

---

## Relieve en madera (★★★★☆)

```
QUÉ ES
  Talla 2.5D/3D a partir de un modelo de escala de grises o malla 3D — retratos, escenas,
  logotipos con profundidad real (no grabado superficial plano).

SOFTWARE: Aspire (Vectric) es el más pulido para esto, Fusion 360 CAM también lo hace
  con más control técnico pero curva de aprendizaje más dura
FRESA: ballnose de diámetro pequeño (1.5-3mm) para el pase de acabado, desbaste previo
  con fresa recta más grande para quitar volumen rápido antes del detalle fino

FLUJO TÍPICO
  1. Desbaste (roughing) con fresa grande, pasadas rápidas, deja margen de material
  2. Acabado (finishing) con ballnose fina, pasadas lentas y solapadas, define el detalle
  3. Lijado manual final — la CNC no deja superficie perfecta, siempre requiere acabado

DIFICULTAD: alta — tiempos de mecanizado largos (horas), sensible a vibración de máquina
```

---

## Letras y logos 3D (★★★☆☆)

```
QUÉ ES
  Letras exentas o en relieve sobre panel — señalética premium, regalos corporativos,
  decoración de pared con profundidad real.

MATERIALES: MDF, contrachapado, HDPE (letras de exterior, resistente a humedad)
FRESA: V-bit para el bisel del borde + fresa recta o ballnose para el cuerpo si es relieve
TÉCNICA: mismo concepto que backfill en láser pero en volumen — el relieve se puede
  pintar/dorar en las caras elevadas para contraste

DIFICULTAD: media
```

---

## Moldes para colada (★★★★☆)

```
QUÉ ES
  Fresar un molde negativo (o positivo, según técnica) directamente en un bloque de
  material para colar resina, hormigón o chocolate — evita el paso de imprimir un master
  y hacer un molde de silicona, la CNC fresa el negativo directamente.

MATERIALES: HDPE (el más usado — no se pega a resina epoxi ni cera, superficie lisa
  de fábrica), espuma de mecanizado (renshape/ureol para prototipos rápidos)
COMPLEMENTO: para masters de detalle muy fino, el flujo combinado impresión 3D → molde
  de silicona sigue siendo mejor — ver [[../impresion-3d/Moldes y fundición — de la impresión a la producción en serie|Moldes y fundición (impresión 3D)]]

CUÁNDO USAR CNC EN VEZ DE IMPRIMIR+SILICONA
  → Cuando necesitas MUCHOS ciclos de colada (el molde fresado en HDPE aguanta cientos
    de coladas, la silicona se degrada mucho antes)
  → Cuando el detalle no requiere la resolución fina de una impresora de resina

DIFICULTAD: alta — el negativo exacto (draft angles, radios internos) exige planificación
  de diseño específica para desmoldar sin romper la pieza
```

---

## Jigs y plantillas de carpintería (★★☆☆☆)

```
QUÉ ES
  Plantillas de guía para trabajo repetitivo con herramienta manual — plantillas de
  taladrado, guías de router de mano, topes de corte — el proyecto más "útil" y menos
  vistoso de todo el catálogo CNC, pero el que más tiempo ahorra en el taller día a día.

MATERIALES: contrachapado de calidad media (12-18mm) o MDF si no requiere gran durabilidad
FRESA: upcut estándar, sin necesidad de acabado fino (es una herramienta, no un producto)

EJEMPLOS TÍPICOS
  → Plantilla de posiciones de bisagra para puertas de armario en serie
  → Guía de router para ranuras de estantería ajustable (sistema de agujeros tipo 32mm)
  → Tope de ingletadora personalizado para ángulos repetidos

DIFICULTAD: baja — el proyecto ideal para practicar CAM sin arriesgar material caro,
  y el complemento perfecto entre este sector y [[../carpinteria-cnc/00 - Carpintería CNC (MOC)|Carpintería CNC]]
```

---

## Errores comunes

```
→ Saltarse el pase de desbaste e ir directo a acabado con ballnose fina en relieve —
  tiempos de mecanizado desproporcionados y desgaste innecesario de una fresa cara.
→ Diseñar moldes sin ángulo de desmoldeo (draft angle) — la pieza colada queda atrapada
  en el negativo fresado, rompe el molde o la pieza al intentar sacarla.
→ No probar el jig en un recorte de material barato antes de fresarlo en la madera buena
  — un jig con cota mal calculada arruina cada pieza que guíe después.
→ Subestimar el tiempo de mecanizado de un relieve — proyectos que parecen simples en
  pantalla pueden tardar 3-6 horas reales de máquina en fresas pequeñas de acabado.
```

## Novedades 2025-2026

```
→ La combinación CNC-fresado-de-molde + colada en pequeña serie gana tracción como
  alternativa más rápida (sin esperar impresión 3D + curado de silicona) para producción
  de piezas repetidas en HDPE, especialmente en talleres que ya tienen la CNC operativa
  para otros usos y evitan invertir en el flujo completo de moldes de impresión 3D.
```

→ Máquina y fresas para estos proyectos: [[Router bits y parámetros de corte — feeds, speeds, brocas]]
→ Software CAM para generar los toolpaths de relieve: [[Software CAM y control CNC — VCarve, Fusion 360, CAMotics, GRBL]]
→ El flujo alternativo de moldes desde impresión 3D: [[../impresion-3d/Moldes y fundición — de la impresión a la producción en serie|Moldes y fundición (impresión 3D)]]
