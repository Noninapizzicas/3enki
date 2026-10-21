---
tipo: tecnica
sector: baterias-almacenamiento
tags: [reciclaje, recuperacion, testeo, portatiles, epi, descarte]
---
# Reciclaje y recuperación de celdas — testeo, criterios, cuándo descartar

> Cada portátil desechado que pasa por tus manos es, en promedio, entre 6 y 9 celdas 18650 que probablemente todavía tienen una segunda vida útil — y también, si no se manipulan con cuidado, el origen más habitual de accidentes caseros con litio.

---

## De dónde salen las celdas recuperadas

```
BATERÍAS DE PORTÁTIL: la fuente más citada y accesible — típicamente
  packs de 6, 8 o 9 celdas 18650 en configuración 2S3P, 3S2P o 3S3P
HERRAMIENTAS ELÉCTRICAS DE BATERÍA: packs más grandes, celdas de mayor
  descarga habitualmente (útiles para proyectos de tracción)
POWER BANKS DESECHADOS: celdas de calidad muy variable, verificar con
  más cuidado que en portátiles de marca reconocida
PUNTOS LIMPIOS / RECICLAJE ELECTRÓNICO: fuente de mayor volumen pero
  también de mayor incertidumbre sobre el estado real de cada celda
```

---

## Proceso de extracción segura

```
1. DESCARGAR PARCIALMENTE EL PACK ANTES DE ABRIRLO si es posible (usando
   el propio dispositivo hasta que se apague) — reduce el riesgo durante
   la manipulación mecánica de apertura

2. EPI OBLIGATORIO: gafas de protección y guantes — la apertura de un
   pack sellado con herramienta mecánica (destornillador plano, alicates)
   conlleva riesgo de cortocircuito accidental si se toca simultáneamente
   el polo positivo y negativo, o de daño mecánico a una celda

3. TRABAJAR SOBRE SUPERFICIE NO INFLAMABLE, en área ventilada — si una
   celda se daña durante la extracción y empieza a calentarse, minimizar
   el riesgo de propagación

4. DESOLDAR/CORTAR CON CUIDADO las tiras de níquel que unen las celdas,
   evitando doblar o perforar la carcasa metálica de cada celda

5. INSPECCIÓN VISUAL INMEDIATA de cada celda extraída: buscar hinchazón,
   abolladuras, corrosión en los polos, olor a electrolito — cualquier
   signo de estos es motivo de descarte inmediato, sin pasar a la fase
   de testeo eléctrico
```

---

## Testeo — el paso que separa "aprovechable" de "descarte"

```
PASO 1 — VOLTAJE EN REPOSO: medir con multímetro. Una celda 18650/21700
  sana en reposo tras extracción suele estar entre 2,5V y 3,7V según cuánto
  se usó el dispositivo de origen antes de desecharlo — voltaje 0V indica
  celda muerta o con protección interna disparada de forma irreversible

PASO 2 — CARGA DE PRUEBA CONTROLADA: con cargador-tester (Liitokala,
  Opus, ver [[Herramientas y equipamiento — soldadora, cargadores, testers, multímetros]]),
  cargar la celda observando su comportamiento — una celda que se calienta
  de forma anormal durante la carga o no alcanza el voltaje esperado se
  descarta sin completar el ciclo

PASO 3 — TEST DE CAPACIDAD REAL: ciclo completo de carga-descarga-carga,
  midiendo mAh reales extraídos en la descarga (no los mAh de la carga,
  que pueden estar inflados por pérdidas internas)

PASO 4 — RESISTENCIA INTERNA: el propio cargador-tester la reporta en la
  mayoría de modelos — una resistencia interna anormalmente alta frente
  a celdas equivalentes sanas indica degradación avanzada, aunque la
  capacidad medida parezca aceptable
```

---

## Criterios de aceptación — la tabla de decisión

```
CAPACIDAD REAL MEDIDA          DESTINO RECOMENDADO
>85% de la nominal de fábrica   Proyecto de uso general, incluso tracción
70-85% de la nominal            Power bank, iluminación, proyectos de
                                 baja exigencia de descarga
50-70% de la nominal            Solo proyectos muy tolerantes (linterna
                                 ocasional), evaluar si compensa el trabajo
<50% de la nominal o resistencia
interna muy elevada              DESCARTAR — reciclar correctamente

CUALQUIER SIGNO VISUAL DE DAÑO (hinchazón, corrosión, olor) → descartar
sin importar el resultado eléctrico del test
```

---

## Emparejado — el paso que decide la calidad del pack final

```
UNA VEZ ACEPTADAS LAS CELDAS: agruparlas por capacidad real medida
  (dentro de un 3-5% entre sí) y por voltaje de reposo similar antes de
  formar grupos paralelo — mezclar celdas de capacidad muy distinta en
  el mismo grupo paralelo hace que la más débil se sobrecargue en cada
  ciclo mientras la más fuerte nunca se aprovecha del todo

REGISTRO: llevar nota (física o en hoja de cálculo) de qué celda va en
  qué grupo con su capacidad medida — imprescindible en proyectos de
  volumen (decenas o cientos de celdas) donde la memoria no basta
```

---

## Dónde reciclar lo descartado — nunca a la basura general

```
ESPAÑA: las celdas de litio descartadas son residuo peligroso (RAEE) —
  depositar en punto limpio municipal o en los contenedores específicos
  de recogida de pilas/baterías disponibles en muchas tiendas de
  electrónica y grandes superficies (obligación legal del punto de venta
  de aceptar la devolución de baterías portátiles)
  Ver detalle normativo en [[Normativa y transporte — ADR, UN3480, regulación España, gestión de residuos]]

NUNCA: tirar a la basura orgánica/reciclaje genérico, ni almacenar
  celdas claramente dañadas (hinchadas, con signos de fuga) por más
  tiempo del necesario para llevarlas a un punto de recogida adecuado
```

---

## Errores comunes en reciclaje y recuperación

```
★★★★★ Manipular una celda hinchada o con signos de fuga intentando
  "salvarla" en vez de descartarla de inmediato — el riesgo de fuga
  térmica en una celda ya dañada es mucho mayor que en una celda sana
★★★★☆ Confiar solo en el voltaje en reposo sin hacer test de capacidad
  real — una celda puede mostrar voltaje aparentemente normal y tener
  una capacidad real muy por debajo de lo aprovechable
★★★★☆ Mezclar celdas sin emparejar por capacidad en el mismo grupo
  paralelo "porque todas dan 3,7V" — el desequilibrio se manifiesta con
  el uso, no en el test inicial superficial
★★★☆☆ Extraer celdas sin EPI básico pensando que "es solo desmontar un
  portátil" — el riesgo de cortocircuito accidental durante la extracción
  mecánica es real y evitable con guantes y gafas
```

---

## Novedades 2025-2026

```
→ La comunidad maker publica cada vez más guías estructuradas paso a
  paso para recuperación segura de celdas (con criterios de descarte
  explícitos), reduciendo la dependencia de foros dispersos y vídeos
  sueltos de calidad desigual que dominaban esta práctica hace unos años.
→ Los cargadores-tester de gama de entrada (Liitokala) amplían la
  información reportada más allá del mAh simple, incluyendo resistencia
  interna de serie en modelos que antes solo la ofrecían en gama alta.
```

---

→ Herramientas para el testeo: [[Herramientas y equipamiento — soldadora, cargadores, testers, multímetros]]
→ Montaje del pack con las celdas aceptadas: [[Montaje de packs — soldadura por puntos, configuración serie-paralelo, balanceo]]
→ Gestión de residuos y normativa: [[Normativa y transporte — ADR, UN3480, regulación España, gestión de residuos]]
