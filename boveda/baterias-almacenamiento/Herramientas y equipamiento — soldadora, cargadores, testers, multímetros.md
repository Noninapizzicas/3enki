---
tipo: componente
sector: baterias-almacenamiento
tags: [herramientas, sunkko, liitokala, opus, multimetro, epi]
---
# Herramientas y equipamiento — soldadora, cargadores, testers, multímetros

> El presupuesto de herramientas de este sector no es opcional ni escalable a cero — hay un mínimo de equipo de seguridad y medición por debajo del cual no se debería montar un pack de litio, sea el primero o el número cincuenta.

---

## Soldadora de puntos — la herramienta central del montaje

```
SUNKKO 709A / 709AD — la referencia de entrada en la comunidad DIY
  Potencia: hasta 800A de pico, controlada por microprocesador
  Formato: pluma de mano con dos puntas, cable a la unidad de control
  Precio orientativo (2026): 180-260€ según modelo (709A básico vs 709AD+
  con funciones extra de pulso)
  Dónde comprar: Satkit España (envío nacional), Aliexpress (más barato,
  sin garantía local ni soporte en español)

SUNKKO 738AL — gama superior, brazo telescópico, mayor potencia (3,6kW)
  Pensada para uso más intensivo (packs grandes, uso frecuente)
  Precio orientativo: 300-450€

ALTERNATIVA ECONÓMICA — kits de soldadura por puntos basados en batería de
  coche/condensadores (proyectos DIY con esquemas open source)
  Coste: 30-60€ en componentes si se monta uno mismo, requiere más
  conocimiento de electrónica de potencia y no es tan segura por defecto
  como una unidad comercial con protecciones integradas

QUÉ MIRAR AL COMPRAR: potencia máxima de pulso (mínimo 400-500A para
  18650/21700 con níquel 0,15-0,2mm), control por microprocesador (mejor
  repetibilidad que analógico puro), disponibilidad de puntas de repuesto
```

---

## Cargadores y testers de capacidad — saber qué celda tienes de verdad

```
LIITOKALA LII-500S — el estándar de entrada/gama media de la comunidad
  4 bahías independientes, pantalla LCD, test de capacidad real (mAh) y
  resistencia interna por celda, compatible con 18650/21700/26650/AA/AAA
  Precio orientativo (2026): 25-35€

LIITOKALA LII-M4S — variante con soporte adicional de formatos (20700,
  26700) y mismas funciones de test de capacidad
  Precio orientativo: 20-30€

OPUS BT-C3100 — alternativa histórica, permite ajustar potencia de carga
  por canal y también testea capacidad y resistencia interna
  Precio orientativo: 25-40€ (menos disponible en tiendas España que Liitokala
  en 2026, más habitual vía importación)

QUÉ HACE EL TEST DE CAPACIDAD: carga la celda a fondo, la descarga por
  completo midiendo mAh reales extraídos, y vuelve a cargarla — el número
  que importa es el de la DESCARGA, no el de la carga (la capacidad real
  utilizable de la celda)

CRITERIO DE ACEPTACIÓN PARA CELDAS RECUPERADAS (18650 de portátil):
  → >1.800 mAh reales: aprovechable para pack de uso general
  → 1.200-1.800 mAh: aprovechable para proyectos de menor exigencia
  (power bank de baja potencia, iluminación)
  → <1.200 mAh o resistencia interna muy alta: descartar, reciclar
```

---

## Multímetro — la herramienta que se usa en cada paso

```
GAMA ENTRADA: multímetro digital básico (tipo UNI-T UT139C o similar) con
  medición de voltaje DC, continuidad y resistencia — suficiente para
  verificar voltaje de celdas y grupos durante el montaje
  Precio orientativo: 25-40€

GAMA MEDIA CON PINZA AMPERIMÉTRICA: necesaria para medir corriente real
  en carga/descarga sin cortar el circuito — imprescindible al dimensionar
  BMS y fusibles para un banco doméstico
  Precio orientativo: 50-90€

USO CRÍTICO: verificar SIEMPRE la polaridad y el voltaje esperado antes de
  cada conexión nueva en el montaje — es la comprobación de segundos que
  evita el error de minutos u horas de reparación (o el accidente)
```

---

## Báscula y equipo de medición secundario

```
BÁSCULA DE PRECISIÓN (0,01g): útil para verificar peso de celdas como
  indicador indirecto de estado (una celda anormalmente ligera puede
  indicar pérdida de electrolito) — no imprescindible mas sí recomendable
  en reciclaje de celdas a volumen
  Precio orientativo: 10-20€ (báscula de joyería genérica)

CÁMARA TÉRMICA / TERMÓMETRO IR: para verificar puntos calientes en
  conexiones de potencia bajo carga — especialmente relevante en bancos
  domésticos de varios kWh donde una resistencia de contacto elevada
  puede pasar desapercibida hasta acumular daño
  Precio orientativo: termómetro IR básico 15-25€ · cámara térmica de
  entrada (tipo add-on para móvil, FLIR One o similar) 200-350€
```

---

## EPI y seguridad de taller — no negociable

```
GAFAS DE PROTECCIÓN: obligatorias al soldar por puntos (chispas) y al
  manipular celdas dañadas o en proceso de reciclaje
GUANTES AISLANTES/RESISTENTES AL CALOR: recomendados al manipular packs
  de tensión elevada (16S+ supera los 50V, umbral de tensión peligrosa
  al tacto) y al trabajar con la soldadora de puntos
SUPERFICIE NO INFLAMABLE: mesa de trabajo con base ignífuga (azulejo,
  metal, silicona resistente al calor) para toda carga/descarga de prueba
  y primera carga de packs nuevos
EXTINTOR CLASE D O MANTA IGNÍFUGA cerca del área de trabajo — ver
  [[Seguridad — thermal runaway, almacenamiento, extinción de incendios]]
  para el detalle de qué tipo de extinción usar en fuego de litio
```

---

## Errores comunes al equiparse

```
★★★★☆ Empezar a montar packs sin cargador-tester de capacidad, confiando
  en la capacidad marcada por el vendedor — especialmente arriesgado con
  celdas recuperadas o de origen no verificado, donde la capacidad real
  puede ser una fracción de la anunciada
★★★★☆ Comprar la soldadora de puntos más barata sin control por
  microprocesador — resultados inconsistentes, mayor tasa de puntos mal
  soldados que se sueltan con el uso
★★★☆☆ No tener multímetro con pinza amperimétrica al dimensionar un
  banco doméstico — sin medir corriente real bajo carga es imposible
  verificar si el BMS y el cableado están correctamente dimensionados
★★★☆☆ Ahorrar en EPI básico (gafas, superficie no inflamable) pensando
  que "es solo para probar" — el riesgo de un pack de litio no depende
  de si el proyecto es serio o una prueba rápida
```

---

## Novedades 2025-2026

```
→ Las soldadoras de puntos de gama DIY incorporan controladores por
  microprocesador con perfiles de pulso preconfigurados por grosor de
  níquel, reduciendo la necesidad de calibrar a prueba y error.
→ Los cargadores-tester tipo Liitokala Lii-M4S amplían compatibilidad de
  formato (20700, 26700) siguiendo la expansión del mercado de celdas
  más allá del 18650 clásico.
```

---

→ Técnica de uso de la soldadora en el montaje real: [[Montaje de packs — soldadura por puntos, configuración serie-paralelo, balanceo]]
→ Criterios de descarte al testear celdas recuperadas: [[Reciclaje y recuperación de celdas — testeo, criterios, cuándo descartar]]
→ Dónde comprar cada herramienta en España: [[Fuentes, comunidades y proveedores — tiendas España, foros, canales]]
