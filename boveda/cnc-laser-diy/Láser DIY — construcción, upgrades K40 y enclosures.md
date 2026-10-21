---
tipo: componente
sector: cnc-laser-diy
tags: [laser-diy, k40, grbl, mini-gerbil, openbuilds, enclosure, firmware]
---
# Láser DIY — construcción, upgrades K40 y enclosures

> El K40 es el mejor ejemplo del mundo maker: una máquina china barata y mediocre de fábrica que se convierte, con 100€ de electrónica y un domingo de trabajo, en un láser serio capaz de competir con equipos de tres veces su precio.

---

## Tres caminos hacia un láser propio

```
1. COMPRAR MONTADO (xTool, Sculpfun, Ortur) — ver nota Cortadoras láser
   Cero construcción, garantía, soporte oficial. El 90% de la gente debería empezar aquí.

2. MODIFICAR UN K40 — el clásico hack del sector
   Comprar el K40 genérico más barato posible y sustituir su cerebro (controlador M2 Nano)
   por uno compatible con LightBurn. Coste total: 400-600€ (máquina) + 90-200€ (upgrade).

3. CONSTRUIR DESDE CERO sobre perfil V-slot
   Chasis OpenBuilds (perfiles de aluminio V-slot 20×20/20×40mm) + módulo láser plug&play
   (NEJE, JTech Photonics, Opt Lasers) + controlador GRBL. Máximo control, máximo trabajo.
```

---

## Upgrade de K40 — la receta completa

```
PROBLEMA DE ORIGEN
  El K40 de fábrica trae un controlador M2 Nano cerrado y propietario, compatible solo
  con software antiguo (K40 Whisperer, LaserDRW) — NO funciona con LightBurn directamente.

PASO 1 — elegir controlador de reemplazo
  Mini-Gerbil (AwesomeTech)   — ~89$ · GRBL-LPC · la opción más popular, plug&play en el
                                  conector existente del K40, requiere mínima modificación
  Cohesion3D LaserBoard        — ~199$ · más entradas/salidas, mejor para quien además
                                  quiere añadir rotary, sensor de límites, control de aire

PASO 2 — instalación física
  Desmontar la tapa del K40, desconectar el M2 Nano, conectar el Mini-Gerbil en su lugar
  usando el mismo conector de la fuente de alimentación del láser (normalmente plug&play,
  sin soldadura). El botón de encendido rojo sigue funcionando; LEDs y botones del panel
  de potencia dejan de iluminarse (el Mini-Gerbil toma el control total).

PASO 3 — software
  Instalar LightBurn, ejecutar el asistente "New Device" y seleccionar GRBL como controlador.
  A partir de aquí: boolean ops, array, preview de corte, todo lo que el firmware original
  nunca ofreció.

PASO 4 — mejoras adicionales recomendadas en el mismo pase
  → Air assist: compresor pequeño + boquilla coaxial (30-60€) — mejora drásticamente el
    corte limpio y reduce el riesgo de llama
  → Reemplazo de espejos por espejos de oro (mejor reflectividad IR) — 20-40€
  → Lente de enfoque nueva (ZnSe o germanio) si la original está rayada — 15-30€
  → Refrigeración: sustituir la bomba de pecera básica por una con termostato/flujo visible
```

---

## Construir desde cero — el camino OpenBuilds

```
CHASIS
  Perfil V-slot 20×20mm o 20×40mm (aluminio extruido) — OpenBuilds es el estándar de facto,
  compatible con ruedas Delrin/V-wheel, correas GT2, y un ecosistema enorme de piezas
  impresas en 3D para soportes y monturas.

MÓDULO LÁSER
  NEJE (E40, E80)             — gama económica, buen soporte de comunidad, foco automático
                                  en modelos recientes
  JTech Photonics              — módulos de calidad industrial, muy documentados, con
                                  plugin propio para Inkscape (J Tech Photonics Laser Tool)
  Opt Lasers PLH3D-XT series   — kits completos "plug&play" para OpenBuilds WorkBee/Lead/Acro
                                  y para NEJE — el camino con menos fricción de integración

CONTROLADOR
  Arduino Uno + shield GRBL (barato, 8-bit, limitado a PWM 25kHz justo)
  MKS DLC32 (32-bit, WiFi, pantalla táctil opcional) — el salto de calidad recomendado
  LaserBoard (Cohesion3D) — si vienes del mundo K40 y quieres un único ecosistema

COSTE APROXIMADO DE UN BUILD DESDE CERO
  Chasis + electrónica + módulo láser 10W: 350-600€
  Frente a comprar un Ortur LM3 montado (518-795€): la ventaja de construir no es el
  precio, es el control total sobre cada componente y la capacidad de ampliar después
  (cambiar de módulo, añadir un segundo eje, montar sobre una CNC existente).
```

---

## Firmware — qué mueve el láser

```
GRBL (recomendado para láser)
  → El estándar de facto para láser DIY sobre Arduino/32-bit. Laser mode disponible
    desde v0.9. Usa el valor S (velocidad de husillo en CNC) para modular potencia PWM.
  → Rampa la potencia en aceleración/deceleración — evita quemados en curvas y esquinas.

MARLIN — NO recomendado para láser
  → Pensado para impresión 3D. Sin PWM a 25kHz (el K40 lo necesita), sin modulación de
    potencia según velocidad — el láser queda en ON/OFF puro, quema las esquinas.
  → Solo tiene sentido si tu máquina YA corre Marlin para impresión 3D y añades láser
    como accesorio ocasional de bajo uso.

SMOOTHIEWARE
  → 32-bit, mucho más rápido en raster (grabado de imágenes) que Arduino 8-bit — 3-4× más
    veloz. Buena opción si el proyecto es sobre todo grabado fotográfico.
```

---

## Enclosures — la caja de seguridad

```
POR QUÉ CONSTRUIR UNA
  Un láser abierto (Ortur, Sculpfun sin caja) es Clase 4 — el haz reflejado puede dañar la
  vista sin mirar directamente. Un enclosure bien hecho reduce la clase efectiva de
  exposición y es obligatorio en cualquier entorno compartido (casa con niños, taller
  compartido, evento público).

MATERIALES DEL ENCLOSURE
  Panel: contrachapado o MDF de 12-18mm, o perfil V-slot + paneles de policarbonato
  Ventana: policarbonato NARANJA/rojo específico para láser (filtra 450nm y 10.600nm) —
    el policarbonato transparente normal NO filtra longitud de onda, es solo barrera física
  Interlock de seguridad: microswitch en la tapa que corta la alimentación del láser al
    abrir — componente barato (3-8€) que es la diferencia entre un accidente y un susto

CLASE DE LÁSER — referencia rápida
  Clase 1  → seguro incluso mirando directamente (requiere enclosure certificado, ej. xTool S1)
  Clase 3B → dañino con exposición directa, seguro con reflexión difusa
  Clase 4  → dañino incluso con reflexión difusa y puede quemar piel/incendiar materiales —
    la mayoría del diodo DIY abierto (Ortur, Sculpfun, Atomstack) es Clase 4
```

---

## Errores comunes

```
→ Saltarse el interlock "porque da pereza cablearlo" — es el componente de seguridad más
  barato de todo el build y el que previene el accidente más grave (exposición ocular).
→ Usar metacrilato transparente normal como ventana en vez de policarbonato específico
  para láser — no filtra la longitud de onda, expone igual que sin ventana.
→ Instalar el Mini-Gerbil sin comprobar la polaridad del conector de la fuente láser —
  algunos K40 varían el pinout entre lotes de fabricación.
→ No verificar el diámetro del haz al construir con módulo NEJE/JTech en chasis OpenBuilds
  no diseñado para láser — la distancia focal cambia entre módulos y requiere ajustar el
  soporte impreso en 3D.
```

## Novedades 2025-2026

```
→ MKS DLC32 gana tracción como controlador 32-bit económico frente a Cohesion3D para
  builds DIY nuevos — WiFi integrado permite control remoto sin cable USB permanente.
→ Los kits Opt Lasers para OpenBuilds Acro/WorkBee/Lead se consolidan como el camino de
  menor fricción para montar láser sobre una CNC ya existente sin diseñar el soporte.
→ MeerK40t (software gratuito, alternativa a LightBurn específica para K40) sigue activo
  como opción sin coste de licencia para quien empieza con presupuesto cero en software.
```

→ Qué máquina montada comprar si prefieres no construir: [[Cortadoras láser — diodo, CO2 y fibra]]
→ Software una vez tienes el controlador funcionando: [[Software de corte láser — LightBurn, LaserGRBL, xTool Creative Space]]
→ EPIs y normativa de exposición: [[Air assist, extracción y seguridad láser — clase 4, EPIs, normativa]]
