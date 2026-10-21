---
tipo: componente
sector: cnc-laser-diy
tags: [cnc, fresadora, shapeoko, onefinity, lowrider3, mpcnc, husillo]
---
# Fresadoras CNC — escritorio y DIY (Shapeoko, Onefinity, LowRider3, MPCNC)

> Donde el láser corta con luz, la fresadora CNC corta con fuerza bruta rotacional — es el complemento natural del taller: aluminio, madera dura, relieve 3D y espesores que ningún láser de sobremesa toca.

---

## Por qué el láser no basta

```
El láser corta perfiles PLANOS en materiales que absorben su longitud de onda. La CNC:
  → Mecaniza ALUMINIO, latón, HDPE, acrílico grueso — el láser reflectante no llega ahí
  → Talla RELIEVE 3D real (no solo grabado superficial de imagen)
  → Corta madera dura y contrachapado de gran espesor sin límite de "pasadas múltiples"
  → Hace pockets, ranuras, agujeros roscados — geometría que el láser no concibe
```

---

## Máquinas comerciales de escritorio 2026

```
SHAPEOKO 5 PRO (Carbide 3D)
  Precio: 2.400-2.900€ (2026) según área de trabajo
  Ecosistema: el más pulido — software Carbide Motion + Carbide Create incluidos,
    soporte oficial excelente, comunidad enorme
  Ideal para: quien quiere resultado fiable sin pelearse con configuración

ONEFINITY FOREMAN
  Precio: ~4.000€ (2026)
  Diferencia clave: NO incluye software CAM propio — llega el usuario con VCarve,
    Fusion 360 o Carveco y ejecuta G-code vía controlador Buildbotics o Masso
  Ventaja: máxima rigidez para su precio, mejor para madera dura y aluminio ligero
  Filosofía: más flexible pero menos "todo en uno" que Shapeoko

X-CARVE PRO (Inventables)
  Precio: 7.495€ (2026)
  Estado: Inventables descontinuó el X-Carve original (kit correa) en diciembre 2024 —
    solo queda esta versión orientada a pequeño negocio/producción, no al hobbyista

SIENCI LONGMILL MK2
  Precio: ~1.799€ (2026)
  Posicionamiento: el pick de mejor relación calidad-precio en formato kit — desplaza
    parte del hueco que dejó el X-Carve original en el segmento de entrada seria

SIENCI ALTMILL
  Rigidez comparable a Onefinity a precio más contenido — alternativa reciente que gana
  tracción en 2025-2026 entre quienes buscan mecanizar aluminio sin pagar precio Onefinity

GENMITSU 3018 (y clones similares)
  Precio: ~399€ (2026)
  Rol real: entrada absoluta de hobby — grabado en madera blanda y plásticos ligeros,
  área de trabajo muy pequeña (30×18cm), no apta para proyectos de mueble o pieza grande
```

---

## Proyectos open-source autoconstruibles

```
LOWRIDER 3 (V1 Engineering / Ryan Zellars)
  Filosofía: CNC de gran formato (hasta un tablero 4×8 ft completo) con estructura ligera
    montada SOBRE el material a cortar, en vez de un pórtico fijo caro
  Coste: 400-800€ en piezas + tiempo de montaje (varios fines de semana)
  Controlador: Grbl sobre Arduino/SKR — mismo ecosistema que MPCNC
  Ideal para: cortar piezas de mueble en tablero grande sin el gasto de una máquina de
    pórtico industrial — el proyecto DIY de mayor formato con mejor relación coste/área

MPCNC — Mostly Printed CNC (V1 Engineering)
  Ya cubierta en detalle en el sector hermano — ver [[../carpinteria-cnc/Máquinas — Maslow, MPCNC, PrintNC|Máquinas — Maslow, MPCNC, PrintNC]]
  Resumen: estructura de tubos con uniones impresas en 3D, multi-herramienta (router,
  láser, plotter, drag knife intercambiables en el mismo cabezal), ~465$ sin impresora.

MASLOW CNC / PRINTNC
  También cubiertas en carpinteria-cnc — Maslow para tableros grandes de bajo coste con
  CNC de cables, PrintNC para rigidez seria con soldadura y guías lineales.
```

---

## Comparativa rápida — cuál elegir

```
"Quiero resultado fiable sin pelearme con configuración" → Shapeoko 5 Pro
"Quiero máxima rigidez para aluminio/madera dura al mejor precio" → Onefinity o Sienci AltMill
"Quiero formato grande (tablero 4×8) al mínimo coste" → LowRider 3 (DIY) o Maslow
"Quiero una máquina multi-herramienta (router+láser+plotter)" → MPCNC
"Solo quiero probar CNC con presupuesto mínimo" → Genmitsu 3018 (limitaciones claras)
"Necesito precisión de taller serio, no me importa soldar" → PrintNC
```

---

## Husillos — la diferencia de calidad real

```
ROUTER TRIM (entrada/intermedio)
  DeWalt DW618      — el estándar de facto en Shapeoko/X-Carve, potente, algo ruidoso
  Makita RT0701     — más ligero y silencioso que el DeWalt, muy apreciado en la comunidad
  Precio: 150-220€ ambos (2026)

SPINDLE REFRIGERADO POR AGUA (gama superior)
  800W-1.5kW, motor de husillo dedicado (no router de mano modificado)
  Ventaja: mucho más silencioso, mejor control de RPM, vida útil superior, corte más
    limpio en aluminio y madera dura por estabilidad de rotación
  Contra: requiere bomba de refrigeración + VFD (variador de frecuencia), más complejidad
    de instalación y coste inicial (300-600€ el kit completo)
  Cuándo pasar a spindle: cuando mecanizas aluminio con regularidad o el ruido del router
    de mano se vuelve un problema en espacio compartido
```

---

## Errores comunes

```
→ Comprar Onefinity esperando un software CAM incluido "como Shapeoko" — no lo trae,
  hay que presupuestar VCarve/Fusion 360 aparte desde el primer día.
→ Subestimar el tiempo de montaje de un LowRider 3/MPCNC — no es "una tarde", son varios
  fines de semana entre impresión de piezas, ensamblaje y calibración fina.
→ Usar un router de mano (DeWalt/Makita) para aluminio con feeds/speeds de madera — genera
  vibración excesiva y desgaste prematuro de fresa; ver parámetros en la nota de router bits.
→ No anclar bien el material en mesa — la vibración en CNC es mucho más agresiva que en
  láser, cualquier holgura se traduce en pieza defectuosa o rotura de fresa.
```

## Novedades 2025-2026

```
→ Descontinuación del X-Carve original (diciembre 2024) reordena el mercado de entrada —
  Sienci LongMill MK2 y Genmitsu ocupan el hueco de precio que dejó libre.
→ Sienci AltMill emerge en 2025 como alternativa de rigidez comparable a Onefinity a
  precio más ajustado, ganando terreno en comparativas de la comunidad CNC 2026.
→ Shapeoko 5 Pro consolida su posición como opción "todo incluido" más pulida del
  segmento 2.000-3.000€, con el ecosistema Carbide Create/Motion como diferenciador.
```

→ Construcción detallada de MPCNC/PrintNC/Maslow: [[../carpinteria-cnc/00 - Carpintería CNC (MOC)|Carpintería CNC (MOC)]]
→ Fresas y parámetros de corte una vez tienes máquina: [[Router bits y parámetros de corte — feeds, speeds, brocas]]
→ El software que genera el G-code: [[Software CAM y control CNC — VCarve, Fusion 360, CAMotics, GRBL]]
