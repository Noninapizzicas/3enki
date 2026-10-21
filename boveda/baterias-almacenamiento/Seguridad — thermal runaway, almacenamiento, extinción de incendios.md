---
tipo: seguridad
sector: baterias-almacenamiento
tags: [seguridad, thermal-runaway, fuga-termica, incendio, extincion, epi]
---
# Seguridad — thermal runaway, almacenamiento, extinción de incendios

> El litio no perdona los atajos: la diferencia entre un proyecto bien hecho y un incidente serio casi nunca está en la mala suerte, está en un paso de seguridad concreto que se saltó porque "total, no pasa nada".

---

## Qué es el thermal runaway (fuga térmica) — el mecanismo real

```
DEFINICIÓN: reacción en cadena autoacelerada dentro de la celda, donde el
  calor generado internamente crece más rápido de lo que puede disiparse
  — la temperatura sube, dispara más reacciones exotérmicas, sube más
  rápido todavía, hasta que el separador interno falla, los electrodos
  entran en contacto directo, y la celda ventea gas, se incendia o explota

DESENCADENANTES PRINCIPALES:
  Sobrecarga (voltaje por encima del límite de la química)
  Cortocircuito interno (daño mecánico, perforación, aplastamiento)
  Cortocircuito externo (error de cableado, herramienta conductiva
  puenteando terminales)
  Temperatura ambiente/de operación excesiva
  Fabricación defectuosa (más probable en celdas de origen no verificado)

PROPAGACIÓN: en un pack denso, una celda en fuga térmica puede calentar
  lo suficiente a sus vecinas como para iniciar el mismo proceso en ellas
  — es la razón por la que los separadores físicos entre celdas y el
  espaciado adecuado no son un detalle estético del montaje
```

---

## Diferencias de riesgo por química

```
NMC/NCA (18650/21700 de consumo): mayor riesgo de fuga térmica —
  estructura cristalina menos estable a temperatura elevada, libera
  oxígeno con más facilidad alimentando la combustión desde dentro
LiFePO4 (cilíndrica y prismática): riesgo sustancialmente menor — la
  estructura del fosfato de hierro es térmicamente mucho más estable,
  el umbral de temperatura para iniciar fuga térmica es notablemente
  más alto y la reacción, si ocurre, suele ser menos violenta
  → Es la razón principal por la que LiFePO4 domina hoy el almacenamiento
  estacionario residencial (ver [[Química y tecnologías emergentes — NMC, LFP, sodio-ion, solid-state]])
SODIO-ION: perfil de seguridad similar o mejor que LiFePO4 según los
  primeros datos de fabricantes, aunque con menos historial de campo
  a gran escala todavía en 2026
```

---

## Señales de alerta — lo que precede a un incidente

```
→ Hinchazón física de la celda o del pack (la carcasa se deforma)
→ Calor anormal al tacto en reposo, sin carga ni descarga activa
→ Olor dulzón/químico característico del electrolito
→ Ruido de silbido o chisporroteo
→ Humo, aunque sea leve

ANTE CUALQUIERA DE ESTAS SEÑALES: desconectar el pack de forma segura si
  es posible sin riesgo personal, alejarlo de materiales inflamables y
  personas, y NO intentar seguir usándolo ni "esperar a ver si se pasa"
```

---

## Almacenamiento seguro — antes de que pase nada

```
UBICACIÓN: espacio ventilado, alejado de materiales inflamables, con
  temperatura ambiente moderada (evitar exposición solar directa
  prolongada o frío extremo constante) — idealmente separado físicamente
  de la zona habitable (garaje, trastero, caseta exterior) en bancos
  domésticos de varios kWh
SUPERFICIE: base no inflamable (metal, cerámica, hormigón) bajo
  cualquier pack en carga, sobre todo durante los primeros ciclos de un
  pack nuevo
NIVEL DE CARGA EN ALMACENAMIENTO PROLONGADO: 40-60% de SOC es el rango
  más seguro y el que menos estresa la celda si el pack no va a usarse
  en semanas — NUNCA almacenar a plena carga (4,2V/3,65V) durante largos
  periodos
SEPARACIÓN FÍSICA entre celdas dentro del pack: separadores rígidos que
  limiten la propagación térmica entre celdas adyacentes
DETECCIÓN TEMPRANA: sensor de humo y, en instalaciones domésticas
  serias, sensor de temperatura independiente del BMS en la sala donde
  vive el banco de baterías
```

---

## Extinción de incendios de litio — lo que hay que saber ANTES de necesitarlo

```
AGUA: contra lo que mucha gente asume, el agua en grandes cantidades SÍ
  es efectiva para ENFRIAR y contener un incendio de litio ya declarado
  (reduce la temperatura y limita la propagación a celdas vecinas) —
  pero no apaga instantáneamente una celda individual en fuga térmica
  activa, que sigue generando su propio oxígeno internamente

EXTINTOR CLASE D (metales): pensado para metales puros, NO es la
  recomendación estándar principal para packs de litio-ion de consumo,
  aunque a veces se menciona en contextos industriales específicos —
  la recomendación de referencia general es agua abundante o arena/
  agente especial para litio si está disponible

MANTA IGNÍFUGA / CAJA DE CONTENCIÓN PARA LITIO: existen mantas y cajas
  específicas diseñadas para packs de litio (habituales ya en flotas de
  e-bike/patinete compartido) que contienen la propagación y el
  desprendimiento de gases mientras se espera a los servicios de
  emergencia — recomendable en instalaciones domésticas de varios kWh

LO MÁS IMPORTANTE: priorizar SIEMPRE la evacuación de personas sobre el
  intento de apagar el fuego uno mismo — un incendio de litio en fuga
  térmica activa puede reavivarse minutos u horas después de parecer
  controlado, y libera gases tóxicos
```

---

## Seguridad eléctrica en bancos de mayor voltaje

```
UMBRAL DE TENSIÓN PELIGROSA AL TACTO: a partir de aproximadamente 50V DC
  se considera tensión peligrosa para el cuerpo humano — un banco 16S de
  LiFePO4 (51,2V nominal) ya está en ese umbral, y un pack de segunda
  vida EV puede superar los 300-400V
GUANTES AISLANTES Y HERRAMIENTA CON MANGO AISLADO: obligatorios al
  trabajar en cableado de potencia de bancos por encima de ese umbral
TRABAJAR SIEMPRE CON UNA SOLA MANO cuando sea posible en zonas de alta
  tensión, evitando crear un camino de corriente a través del pecho
DESCONEXIÓN VERIFICADA antes de cualquier intervención de mantenimiento
  — confirmar con multímetro que el circuito está realmente sin tensión,
  no asumirlo por la posición de un interruptor
```

---

## Errores comunes de seguridad

```
★★★★★ Cargar un pack nuevo sin supervisión la primera vez — la mayoría
  de incidentes documentados en la comunidad ocurren en las primeras
  cargas de un pack recién montado, cuando un error de montaje no
  detectado se manifiesta bajo la corriente real de carga
★★★★★ Almacenar celdas o packs dañados/hinchados "hasta que dé tiempo
  de llevarlos al punto limpio" — cada día de más es riesgo acumulado
  innecesario, llevarlos cuanto antes
★★★★☆ Ignorar el umbral de tensión peligrosa en bancos de 16S+ o
  módulos de segunda vida EV, tratándolos con la misma informalidad que
  un pack de 4S de baja tensión
★★★★☆ No tener plan de contención (manta ignífuga, ubicación separada
  de la vivienda) para un banco doméstico de varios kWh, confiando
  únicamente en que "el BMS lo evita"
★★★☆☆ Reutilizar celdas con signos visuales de daño "porque el voltaje
  parece normal" — la inspección visual es un filtro previo al testeo
  eléctrico, no un paso opcional
```

---

## Novedades 2025-2026

```
→ La adopción de LiFePO4 como estándar del almacenamiento estacionario
  residencial sigue reduciendo el perfil de riesgo agregado del sector
  frente a hace una década, cuando el NMC dominaba también en aplicación
  fija.
→ Mantas y cajas de contención específicas para litio, antes casi
  exclusivas de flotas comerciales de e-bike/patinete, se vuelven más
  accesibles y recomendadas también para instalación doméstica DIY de
  varios kWh.
→ El SAE G27 Lithium Battery Packaging Performance Committee continúa
  trabajando en estandarizar embalaje de contención probado para
  transporte, relevante también para quien envía o recibe celdas/packs
  por mensajería — ver [[Normativa y transporte — ADR, UN3480, regulación España, gestión de residuos]].
```

---

→ Riesgo diferenciado por origen del material: [[Segunda vida EV — Nissan Leaf, Tesla, despiece de módulos]]
→ Detección temprana vía monitorización de temperatura: [[Software y monitorización — SOC, balanceadores, Node-RED, Home Assistant, Victron]]
→ Normativa de transporte y almacenamiento: [[Normativa y transporte — ADR, UN3480, regulación España, gestión de residuos]]
