---
tipo: componente
sector: solar-fotovoltaica-diy
tags: [bateria, LiFePO4, BMS, Pylontech, BYD, EG4, sodio-ion, DIY]
---
# Baterías y almacenamiento — LiFePO4, BMS, sodio-ion

> La batería es el componente que convierte el autoconsumo del 30% en autoconsumo del 90% — y también el más caro, el más pesado y el que más rápido evoluciona de todo el sistema.

---

## Química — por qué LiFePO4 ganó la batalla residencial

```
LiFePO4 (Litio Ferrofosfato) — el ESTÁNDAR actual en almacenamiento solar
  Ciclos de vida: 4.000-6.000 ciclos al 80% DoD (Depth of Discharge)
  Seguridad: química estable, sin riesgo de fuga térmica descontrolada como el NMC
  Densidad energética: menor que NMC (más peso/volumen por kWh) — irrelevante en
  instalación fija residencial, sí relevante en aplicación móvil (caravana, barco)

NMC (Níquel Manganeso Cobalto) — la opción de mayor densidad
  Ciclos de vida: 2.000-3.000 ciclos — menos de la mitad que LiFePO4
  Riesgo: mayor sensibilidad térmica, requiere gestión térmica más estricta
  Uso típico: vehículo eléctrico, aplicaciones donde el peso/volumen manda sobre
  la longevidad — cada vez menos presente en almacenamiento estacionario residencial

SODIO-ION — la alternativa emergente sin litio
  Estado 2026: CATL Nathium y fabricantes similares empiezan a comercializar,
  todavía sin despliegue residencial masivo en España
  Ventaja potencial: sin litio (menor dependencia de la cadena de suministro),
  mejor comportamiento en frío, coste de materia prima más bajo a largo plazo
  Desventaja actual: menor densidad energética que LiFePO4, catálogo residencial
  aún muy limitado — vigilar la evolución 2026-2027 antes de comprar
```

---

## BMS (Battery Management System) — el guardián de la batería

```
QUÉ HACE:
  Equilibra la carga entre celdas individuales (balanceo activo/pasivo)
  Corta la carga/descarga si detecta sobretensión, subtensión o sobrecorriente
  Gestiona la temperatura (corte por frío/calor extremo)
  Comunica el estado de carga (SOC) al inversor híbrido para gestión conjunta

BMS INTEGRADO (baterías comerciales) vs BMS EXTERNO (proyecto DIY con celdas sueltas):
  Integrado: cero configuración, garantía de fábrica, "caja negra" — recomendado
  salvo que se busque explícitamente el proyecto DIY como aprendizaje/ahorro
  Externo: mayor control, coste por kWh más bajo, pero exige entender curvas de
  carga, balanceo y protocolo de comunicación (CAN/RS485) con el inversor
```

---

## Marcas comerciales de referencia (2026)

```
PYLONTECH — el más extendido en instalación residencial española
  Módulos apilables (US2000/US3000 series), compatible con gran variedad de
  inversores híbridos del mercado (Growatt, Deye, Victron, entre otros)
  Posicionamiento: estándar de facto por compatibilidad amplia

BYD (Battery-Box Premium LVS series) — diseño modular escalable
  Cada módulo aporta 4,0 kWh, escalable de 4,0 kWh hasta 256 kWh apilando módulos
  Posicionamiento: gama residencial a comercial pequeña, muy usado con Huawei/Fronius

EG4 — fuerte presencia en comunidad DIY (más EEUU que España, pero referencia
  de precio y especificación en foros internacionales)
  Modelo LL-S 48V 100Ah destacado en 2026 por buena relación precio/kWh
  BMS robusto, opción de calefacción integrada (relevante en climas fríos)

Precio orientativo instalado (Europa, 2026): 500-950 €/kWh usable, según marca,
  capacidad del pack y complejidad de la instalación
```

---

## DIY con celdas EVE — la vía de menor coste

```
QUÉ ES:
  Comprar celdas LiFePO4 sueltas (formato prismático, típicamente 280Ah o 300Ah,
  marca EVE u otros fabricantes chinos) y montar el pack propio con BMS separado

COMPONENTES DE UN PACK DIY:
  Celdas EVE 280/300Ah (serie de 16 para 48V nominal) · BMS (Seplos, JK-BMS, Daly
  u otros) · separadores de fibra entre celdas · balanceador activo · terminales
  y busbars de cobre · carcasa metálica de protección

DÓNDE COMPRAR EN EUROPA:
  Distribuidores como BASEN ofrecen celdas EVE con almacén europeo — evita
  esperas e impuestos de importación directa desde China
  Comunidad de referencia: bateriaslifepo4.com (guías, pedidos, proceso paso a paso)

CUÁNDO TIENE SENTIDO EL DIY:
  → Presupuesto ajustado y disposición a invertir tiempo en aprender BMS/balanceo
  → Proyecto off-grid donde el coste por kWh es la variable crítica
  → Interés explícito en el proyecto como aprendizaje técnico (no solo el resultado)

CUÁNDO NO:
  → Primera instalación sin experiencia previa en electrónica de potencia
  → Instalación conectada a red con inversor híbrido de marca (compatibilidad
  de comunicación BMS↔inversor no siempre garantizada con pack casero)
```

---

## Dimensionado del banco de baterías

```
REGLA PRÁCTICA para conectado a red con batería:
  Capacidad (kWh) ≈ consumo nocturno diario medio × 1,3-1,5 (margen de seguridad)
  Objetivo: cubrir el consumo de la vivienda desde que se pone el sol hasta que
  vuelve a producir el sistema al día siguiente

REGLA PRÁCTICA para off-grid (ver [[Instalación aislada — off-grid, dimensionado, reguladores]]):
  Capacidad (kWh) ≈ consumo diario total × días de autonomía deseados (2-4 típico)
  / profundidad de descarga máxima recomendada (80% en LiFePO4)
  El dimensionado off-grid es mucho más exigente — aquí SÍ hay que acertar,
  porque no existe la red como respaldo en caso de error de cálculo

DoD (Depth of Discharge) recomendado en LiFePO4: 80% habitual, hasta 90% en
  packs de gama alta sin penalizar significativamente los ciclos de vida
```

---

## Errores comunes con baterías

```
★★★★★ Dimensionar el banco de baterías por el consumo de un día soleado de verano
  en lugar del peor caso de invierno — sistema desabastecido en los meses críticos
★★★★☆ Mezclar celdas de distintos lotes/fabricantes en un pack DIY — descompensa
  el balanceo y acelera la degradación de las celdas más débiles
★★★★☆ No verificar compatibilidad de comunicación BMS↔inversor antes de comprar
  batería de una marca distinta al inversor — algunos híbridos exigen protocolo
  propietario y rechazan baterías de terceros sin adaptador
★★★☆☆ Descargar habitualmente por debajo del DoD recomendado "para aprovechar
  más" — acorta la vida útil de forma medible en pocos años
★★★☆☆ Ubicar el banco de baterías en un lugar sin ventilación ni control de
  temperatura extremo (garaje sin aislar en climas muy fríos o muy cálidos)
```

---

## Novedades 2025-2026

```
→ El precio europeo de batería instalada sigue bajando (≈500-950 €/kWh en 2026),
  acercando cada vez más el retorno de inversión de añadir batería a un sistema
  que ya tenía solo conexión a red
→ El sodio-ion (CATL Nathium y similares) empieza a comercializarse fuera de
  España pero aún sin despliegue residencial local — seguimiento recomendado
  para 2026-2027, todavía no comprar para proyecto residencial español
→ EG4 consolida su posición en la comunidad DIY internacional con modelos de
  mejor precio por kWh y BMS con calefacción integrada de serie
```
