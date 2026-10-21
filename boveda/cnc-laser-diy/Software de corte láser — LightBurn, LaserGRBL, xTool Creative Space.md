---
tipo: software
sector: cnc-laser-diy
tags: [lightburn, lasergrbl, software, xtool-creative-space, grbl, meerk40t]
---
# Software de corte láser — LightBurn, LaserGRBL, xTool Creative Space

> Si hay una sola compra que define la diferencia entre "tengo un láser" y "controlo un láser", es LightBurn — 60-84€ que la comunidad entera considera la mejor relación calidad-precio de todo el hobby, punto de encuentro entre diseño, control de máquina y flujo de trabajo real.

---

## LightBurn — el estándar absoluto

```
QUÉ ES
  Software independiente del fabricante que controla prácticamente cualquier láser del
  mercado (GRBL, DSP tipo Ruida/Trocen, Galvo tipo fibra) desde una única interfaz —
  diseño vectorial + edición de imagen para grabado + control de máquina, todo en uno.

LICENCIAS 2026
  LightBurn Core (GCode solo)   → ~78-84$ (una compra, uso perpetuo, 1 año de updates)
  LightBurn Pro (GCode+DSP+Galvo) → ~156-169$ (soporta también CO2 con controlador DSP
                                       y láser de fibra con controlador Galvo)
  Modelo: "compra una vez, usa para siempre" — tras el primer año se puede seguir usando
  la versión que tienes, renovar mantenimiento (opcional) para acceder a nuevas versiones.
  Prueba gratuita de 30 días con todas las funciones activas antes de decidir.

FUNCIONES CLAVE QUE JUSTIFICAN EL PRECIO
  → Boolean operations: unir, restar, intersectar formas vectoriales directamente en el
    software — evita ir y volver de Inkscape para operaciones simples
  → Array/Grid tool: repetir un diseño en rejilla con offsets automáticos — imprescindible
    para producción en pequeña serie (llaveros, pendientes)
  → Material Test tool: genera automáticamente una rejilla de potencia×velocidad para
    calibrar cualquier material nuevo sin adivinar parámetros
  → Living Hinge library: patrones de corte que flexibilizan madera rígida — para cajas
    curvas, cierres flexibles, un truco de diseño muy usado en proyectos de regalo
  → Rotary setup nativo: configuración directa de accesorios rotary de cualquier marca
  → Compatibilidad universal: la misma licencia sirve si cambias de marca de máquina —
    inversión que "viaja" contigo entre hardware

WORKSPACES
  Perfiles de máquina guardados (parámetros, área de trabajo, offsets) — útil si operas
  más de un láser desde el mismo ordenador, cambio instantáneo entre configuraciones.
```

---

## LaserGRBL — la puerta gratuita

```
QUÉ ES
  Software open-source y gratuito, controla máquinas GRBL — el punto de entrada de
  prácticamente todo el que empieza con un diodo económico antes de invertir en LightBurn.

QUÉ HACE BIEN
  → Grabado de imágenes (raster) — soporte de dithering, ajuste de contraste, buena
    calidad de resultado sin coste de licencia
  → Configuración de GRBL directa desde la interfaz — útil para calibrar la máquina
  → Curva de aprendizaje mínima, ideal para las primeras semanas con la máquina

LIMITACIONES FRENTE A LIGHTBURN
  → Sin boolean operations, sin array avanzado, sin Material Test automatizado
  → Edición vectorial mucho más básica — para diseños complejos exige Inkscape aparte
  → Sin soporte DSP/Galvo — solo GRBL, inútil para CO2 con controlador Ruida o fibra

RECOMENDACIÓN
  Empezar con LaserGRBL las primeras semanas para entender el flujo básico, dar el salto
  a LightBurn en cuanto el proyecto exige boolean ops, array o corte multi-material serio
  — la mayoría de la comunidad hace esta transición en menos de un mes de uso real.
```

---

## Software propietario de marca

```
xTool Creative Space (XCS)
  Gratuito, incluido con toda máquina xTool. Interfaz simplificada orientada a quien
  no quiere curva de aprendizaje — biblioteca de materiales preconfigurada específica
  para modelos xTool (parámetros ya calibrados de fábrica para sus propios accesorios).
  Contra: limitado fuera del ecosistema xTool, menos control fino que LightBurn, no sirve
  si tienes más de una marca de máquina en el taller.

Sculpfun/Ortur/Atomstack — apps propias
  Similares en filosofía a XCS: simplicidad y parámetros preconfigurados a cambio de
  menos control. La comunidad casi unánimemente recomienda migrar a LightBurn en cuanto
  se supera la fase de "primeras piezas de prueba".

MeerK40t
  Alternativa 100% gratuita y open-source específica para controladores K40/M2-Nano sin
  necesidad de hacer el upgrade de hardware a Mini-Gerbil — para quien quiere probar el
  mundo K40 con coste cero antes de invertir en modificar el controlador.
```

---

## Flujo de trabajo recomendado

```
1. DISEÑO VECTORIAL → Inkscape / Affinity Designer / CorelDraw (ver nota Diseño vectorial)
2. IMPORTAR A LIGHTBURN → SVG, DXF, o directamente diseñar en el propio LightBurn
   (tiene herramientas vectoriales básicas suficientes para texto y formas simples)
3. ASIGNAR CAPAS → cada color/capa = una operación (corte, grabado línea, grabado relleno)
   con su propia potencia/velocidad — el corazón del flujo LightBurn
4. MATERIAL TEST → si es material nuevo, correr el grid de calibración primero
5. PREVIEW → simular el recorrido del haz antes de ejecutar, detecta errores de orden
   de operaciones (por ejemplo cortar antes de grabar, que desplaza la pieza)
6. EJECUTAR → con air assist y extracción activos, sin dejar la máquina desatendida
```

---

## Errores comunes

```
→ Comprar LightBurn Pro sin necesitarlo — si solo tienes una máquina GRBL (diodo o K40
  modificado), Core es suficiente; Pro solo aporta valor con DSP (CO2 de fábrica) o Galvo
  (fibra).
→ No usar capas por color de forma disciplinada — mezclar corte y grabado en la misma
  capa genera resultados impredecibles.
→ Ignorar el orden de operaciones — cortar antes de grabar puede desplazar o soltar la
  pieza antes de terminar el grabado; el orden correcto casi siempre es grabar primero,
  cortar al final.
→ No hacer preview antes de piezas caras — el preview de LightBurn tarda segundos y evita
  desperdiciar material de precio alto (acrílico, cuero curtido).
```

## Novedades 2025-2026

```
→ LightBurn v2.1.x amplía compatibilidad de dispositivos y refina el Material Test tool
  — sigue siendo el software de referencia sin competidor real en cuota de mercado DIY.
→ MeerK40t gana adopción entre quien empieza con K40 sin presupuesto para el upgrade de
  controlador, como alternativa gratuita madura al ecosistema LightBurn+Mini-Gerbil.
→ xTool Creative Space añade soporte ampliado para el módulo IR 1064nm del S1, integrando
  parámetros preconfigurados de marcado en metal directamente en su biblioteca.
```

→ Diseño vectorial previo al software de control: [[Diseño vectorial y fuentes de archivos — Inkscape, Affinity, CorelDraw, Etsy, Cults3D]]
→ Software equivalente para CNC (no láser): [[Software CAM y control CNC — VCarve, Fusion 360, CAMotics, GRBL]]
