---
tipo: componente
sector: impresion-3d
tags: [software, CAD, FreeCAD, Fusion360, Onshape, OpenSCAD, BOSL2, Tinkercad, parametrico]
---
# Software CAD y diseño paramétrico — FreeCAD, Fusion 360, OpenSCAD

> El día que pasas de "buscar el modelo que necesito" a "diseñar el modelo que necesito" es el día que la impresora deja de ser un juguete y se convierte en una herramienta de verdad.

---

## Tinkercad — nivel 0, gratis, sin excusas

```
QUÉ ES: modelador de formas primitivas (cajas, cilindros, agujeros) combinadas por
  suma/resta booleana — 100% navegador, sin instalación
FORTALEZA: la curva de aprendizaje más suave que existe, resultados en minutos
LIMITACIÓN: sin precisión paramétrica real, incómodo para piezas mecánicas complejas
  o con tolerancias exigentes
CUÁNDO USARLO: primera semana con impresora, piezas simples (soportes, cajas, letreros),
  enseñar a niños/principiantes absolutos los conceptos de modelado 3D
```

---

## FreeCAD — el paramétrico gratuito de referencia

```
QUÉ ES: CAD paramétrico open-source con árbol de historial de operaciones (como Fusion 360
  pero gratuito y sin dependencia de cuenta cloud)
FORTALEZA: workbenches especializados (Part Design, Sketcher, Assembly), exporta a STL/STEP,
  desarrollo activo con mejoras notables en usabilidad en las últimas versiones
LIMITACIÓN: curva de aprendizaje más empinada que Tinkercad, interfaz históricamente menos
  pulida que Fusion 360 (aunque mejora versión a versión)
CUÁNDO USARLO: piezas mecánicas con tolerancias reales, ensamblajes, cuando quieres CAD
  paramétrico serio sin depender de licencia ni de servidores de un tercero
```

---

## Fusion 360 — el estándar de facto en la industria maker

```
QUÉ ES: CAD paramétrico con historial + simulación + CAM, todo en una plataforma
FORTALEZA: el flujo más pulido y visual del mercado, gran cantidad de tutoriales, integra
  simulación y mecanizado (útil si el mismo diseño luego se fresa en CNC)
LIMITACIÓN: licencia personal gratuita con restricciones de uso comercial y guardado cloud
  obligatorio — depende de la política de Autodesk, que ha cambiado varias veces
CUÁNDO USARLO: piezas mecánicas complejas, ensamblajes grandes, cuando el mismo modelo
  se necesita también para CNC/CAM (ver [[../carpinteria-cnc/FreeCAD para carpintería|FreeCAD para carpintería]] como alternativa 100% libre para ese cruce)
```

---

## Onshape — el CAD paramétrico gratis online

```
QUÉ ES: CAD paramétrico 100% en navegador, sin instalación, con control de versiones tipo
  Git integrado de fábrica
FORTALEZA: colaboración en tiempo real, cero instalación, plan gratuito robusto para
  uso personal (con documentos públicos)
LIMITACIÓN: el plan gratuito hace tus diseños públicos — no vale para proyectos privados
  sin pasar a plan de pago
CUÁNDO USARLO: trabajar desde cualquier equipo sin instalar nada, colaborar con otra
  persona en el mismo modelo en tiempo real
```

---

## OpenSCAD — el paramétrico puro por código

```
QUÉ ES: NO se dibuja geometría con el ratón — se escribe código que GENERA la geometría.
  Todo el modelo es una función de sus variables de entrada.

VENTAJA CENTRAL: un diseño verdaderamente paramétrico — cambia una variable (diámetro,
  número de compartimentos, grosor de pared) y el modelo entero se regenera coherente,
  sin tener que re-tocar a mano cada arista como en un CAD de historial gráfico

SINTAXIS BÁSICA (ejemplo — caja con agujero paramétrico):
  ancho = 40; alto = 20; grosor_pared = 2;
  difference() {
    cube([ancho, alto, grosor_pared]);
    translate([ancho/2, alto/2, 0]) cylinder(h=grosor_pared, r=5);
  }

MÓDULOS: encapsulan geometría reutilizable — igual que una función en programación,
  permiten construir piezas complejas combinando módulos simples con parámetros propios

BOSL2 (Belfry OpenSCAD Library v2) — LA librería de referencia para makers
  Añade primitivas avanzadas (roundedCube, threaded rods, attachable objects con anclaje
  relativo entre piezas), muy usada en diseño de mecanismos y piezas técnicas complejas

NOPSCADLIB — otra librería popular, fuerte en piezas mecánicas estándar (tornillería,
  rodamientos, perfiles de aluminio) ya modeladas paramétricamente y listas para ensamblar

CUÁNDO USARLO: piezas que se van a repetir en variantes (mismo diseño, distinto tamaño),
  automatización de familias de piezas, cualquier caso donde "generar 20 versiones a mano"
  sea inviable pero "generar 20 versiones cambiando una variable" sea trivial
LIMITACIÓN: sin interfaz visual de arrastre — todo pasa por código, curva de entrada más
  alta para quien viene de CAD gráfico puro
```

---

## Tabla de decisión rápida

```
SOFTWARE       PRECIO         CURVA        MEJOR PARA
Tinkercad       Gratis         Muy baja     Primeras piezas, enseñanza
FreeCAD         Gratis         Media-alta   Piezas mecánicas libres de licencia
Fusion 360      Gratis*/pago   Media        Estándar de industria, CAM integrado
Onshape         Gratis*/pago   Media        Colaboración online, cero instalación
OpenSCAD+BOSL2  Gratis         Alta         Diseño paramétrico puro, familias de piezas

* con restricciones de uso comercial y/o visibilidad pública del proyecto
```

---

## Errores comunes al elegir/usar CAD

```
★★★★☆ Empezar directamente en OpenSCAD sin haber tocado un CAD gráfico antes — la
  abstracción de "programar geometría" es más digerible tras entender conceptos en
  Tinkercad o FreeCAD primero
★★★★☆ Modelar sin pensar en tolerancias de impresión desde el principio — diseñar a medida
  exacta y descubrir después que la pieza no encaja por el shrinkage del material (ver
  [[Diseño para impresión — tolerancias, ensamblajes, orientación]])
★★★☆☆ Depender 100% de Fusion 360 cloud para proyectos críticos sin exportar copias STEP
  locales — los cambios de política de licencia de Autodesk han pillado a usuarios sin backup
★★★☆☆ No aprender módulos en OpenSCAD y escribir todo en un único bloque de código — hace
  el diseño imposible de reutilizar o depurar cuando crece de complejidad
```

---

## Novedades 2025-2026

```
→ FreeCAD sigue puliendo su interfaz y el workbench de ensamblajes en cada release,
  cerrando brecha con Fusion 360 en usabilidad percibida sin perder su naturaleza libre
→ Onshape mantiene su plan gratuito para uso personal como alternativa cloud sin
  instalación frente a la dependencia creciente de suscripción de Autodesk
→ OpenSCAD y BOSL2 se consolidan como el estándar de facto para diseño paramétrico en la
  comunidad maker open-source — gran parte de los generadores de Gridfinity y utillaje
  de taller compartidos en foros están escritos sobre esta base
```
