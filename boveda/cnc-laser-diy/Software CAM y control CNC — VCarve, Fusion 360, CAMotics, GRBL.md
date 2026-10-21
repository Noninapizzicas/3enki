---
tipo: software
sector: cnc-laser-diy
tags: [cam, vcarve, fusion-360, camotics, grbl, gcode, cnc]
---
# Software CAM y control CNC — VCarve, Fusion 360, CAMotics, GRBL

> Si LightBurn es el traductor entre vector y láser, el CAM es el traductor entre modelo 3D/2D y fresa — con la diferencia de que aquí el error no chamusca un borde, rompe una fresa de 30€ o astilla la pieza entera.

---

## VCarve / Aspire (Vectric) — el CAM de madera por excelencia

```
QUÉ SON
  VCarve Desktop/Pro y Aspire (su hermano mayor con más funciones de relieve 3D) son el
  software CAM más usado en el mundo de carpintería CNC hobby/semiprofesional — no
  incluyen CAD potente, están pensados para recibir un diseño 2D/2.5D y generar toolpaths.

PRECIO ORIENTATIVO (2026)
  VCarve Desktop: ~700-900$ · VCarve Pro: ~1.400-1.800$ · Aspire: ~2.500-3.000$
  Sin suscripción — licencia perpetua, coste inicial alto compensado por no pagar cuota

FORTALEZA
  → Interfaz pensada específicamente para carpintería: nesting de piezas, nido-optimizado
    de aprovechamiento de tablero, librería de toolpaths de talla en V (V-carving) muy
    pulida para letreros y relieve decorativo
  → Curva de aprendizaje más suave que Fusion 360 para quien no viene de CAD industrial

CUÁNDO ELEGIRLO
  Onefinity y máquinas sin CAM incluido, proyectos centrados en madera/tablero, quien
  prioriza facilidad de uso sobre potencia de mecanizado 3D complejo o multi-material
```

---

## Fusion 360 CAM — el estándar de precisión

```
QUÉ ES
  Módulo CAM integrado en Fusion 360 (Autodesk) — CAD paramétrico completo + CAM en la
  misma suite, capaz de generar toolpaths para 3, 4 y 5 ejes, control muy fino de
  estrategias de mecanizado (adaptive clearing, contouring, drilling específico)

PRECIO 2026
  Plan personal/hobby: gratuito con limitaciones (uso no comercial, ciertos límites de
    documentos activos) · Plan comercial: ~680$/año (suscripción)

FORTALEZA
  → Mucho más control sobre el G-code generado que VCarve — mejor opción para aluminio,
    metales y mecanizado de precisión donde cada parámetro de estrategia importa
  → Simulación de mecanizado integrada con detección de colisiones
  → El mismo software sirve para diseñar la pieza (CAD) Y generar el toolpath (CAM) —
    flujo de trabajo unificado sin exportar entre programas distintos

CUÁNDO ELEGIRLO
  Mecanizado de aluminio/metal, piezas de precisión, proyectos que ya nacen en Fusion 360
  como CAD, quien no le importa la curva de aprendizaje más empinada que VCarve
```

---

## CAMotics — el simulador gratuito imprescindible

```
QUÉ ES
  Software open-source y gratuito de simulación de G-code — NO genera toolpaths, VERIFICA
  el G-code ya generado por VCarve/Fusion 360/otro CAM antes de enviarlo a la máquina real

POR QUÉ USARLO SIEMPRE
  → Detecta colisiones, profundidades erróneas, recorridos que salen del stock antes de
    que la fresa real toque el material — el equivalente al "preview" de LightBurn pero
    para CNC, donde el coste de un error es mucho mayor (fresa rota, pieza perdida)
  → Soporta formatos .nc, .ngc, .gcode — prácticamente cualquier post-procesador estándar
  → Cero coste, cero excusa para no usarlo en cada programa nuevo antes de la primera
    ejecución física
```

---

## GRBL — el firmware que ejecuta el G-code

```
QUÉ ES
  Firmware open-source que corre en el controlador de la CNC (Arduino, 32-bit como
  MKS DLC32) y traduce el G-code recibido en movimiento real de motores paso a paso —
  el mismo firmware base que domina también el mundo del láser DIY (ver nota Láser DIY)

VERSIÓN RECOMENDADA
  GRBL 1.1+ para CNC estándar de escritorio — soporte de límites de fin de carrera,
  homing automático, mejor gestión de aceleración que versiones antiguas

ALTERNATIVAS SEGÚN MÁQUINA
  FluidNC (ESP32, WiFi) — usado en PrintNC y máquinas más recientes, interfaz web propia
  LinuxCNC (+ tarjeta Mesa) — el estándar profesional de máquinas serias tipo PrintNC de
    gama alta, mucho más control pero requiere un PC dedicado corriendo Linux en tiempo real
  Buildbotics / Masso — controladores propietarios de Onefinity, interfaz táctil dedicada
```

---

## Flujo de trabajo completo — de la idea al G-code verificado

```
1. DISEÑO → FreeCAD/Fusion 360 (CAD) o directamente en VCarve si es 2.5D simple
2. CAM → generar toolpaths en VCarve/Aspire o en el propio Fusion 360
   → elegir estrategia (adaptive, pocket, contour) y fresa según la nota de router bits
3. SIMULAR → CAMotics (si el CAM no tiene su propio simulador integrado) para verificar
   antes de tocar el material real
4. EXPORTAR G-CODE → con el post-procesador correcto para tu controlador (GRBL, FluidNC,
   Buildbotics) — un post-procesador equivocado genera código que la máquina no entiende
5. EJECUTAR → desde el software de control de tu controlador (Carbide Motion en Shapeoko,
   la interfaz web de FluidNC, etc.)
```

---

## Errores comunes

```
→ Saltarse la simulación en CAMotics "porque ya lo hice mil veces" — el error de una vez
  entre mil sigue rompiendo la fresa o la pieza; el hábito de verificar cuesta 30 segundos.
→ Elegir el post-procesador equivocado al exportar de VCarve/Fusion 360 — genera G-code
  técnicamente válido pero con comandos que tu controlador específico no reconoce bien.
→ Comprar Fusion 360 comercial sin necesitarlo — el plan personal gratuito cubre de sobra
  las necesidades de quien fresa como hobby sin fines de reventa.
→ No verificar el origen de coordenadas (work zero) antes de ejecutar — el motivo número
  uno de piezas arruinadas es que la máquina empieza a cortar desde el punto equivocado.
```

## Novedades 2025-2026

```
→ Fusion 360 sigue ampliando su plan personal gratuito como puerta de entrada, mientras
  el segmento profesional se consolida en suscripción anual sin alternativa perpetua.
→ FluidNC gana adopción en builds DIY nuevos (PrintNC, Sienci AltMill) frente a GRBL
  clásico sobre Arduino — la ventaja de WiFi y control web sin cable USB permanente pesa
  cada vez más en decisiones de nuevo montaje.
```

→ Máquinas sobre las que se ejecuta este G-code: [[Fresadoras CNC — escritorio y DIY (Shapeoko, Onefinity, LowRider3, MPCNC)]]
→ Fresas y parámetros que el CAM traduce a toolpaths: [[Router bits y parámetros de corte — feeds, speeds, brocas]]
→ CAD paramétrico compartido (FreeCAD/OpenSCAD): [[../impresion-3d/Software CAD y diseño paramétrico — FreeCAD, Fusion 360, OpenSCAD|Software CAD (impresión 3D)]]
