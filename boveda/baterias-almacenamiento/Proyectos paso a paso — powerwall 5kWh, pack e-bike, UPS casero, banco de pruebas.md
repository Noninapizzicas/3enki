---
tipo: proyecto
sector: baterias-almacenamiento
tags: [proyectos, powerwall, ebike, ups, banco-pruebas, paso-a-paso]
---
# Proyectos paso a paso — powerwall 5kWh, pack e-bike, UPS casero, banco de pruebas

> La teoría de celdas, química y BMS solo se asienta de verdad cuando se aplica a un proyecto concreto con lista de materiales y pasos verificables — estos cuatro cubren el rango completo, del banco de pruebas de una tarde al powerwall de fin de semana largo.

---

## Proyecto 1 — Banco de pruebas de mesa (★☆☆☆☆, una tarde)

```
OBJETIVO: aprender a testear, cargar y medir celdas antes de comprometer
  material en un proyecto grande

MATERIAL:
  4-6 celdas 18650 (nuevas o recuperadas y ya testeadas)
  Cargador-tester Liitokala Lii-500S (25-35€)
  Multímetro básico (25-40€)
  BMS 1S o 4S básico (2-5€ la unidad, comprado en lote)

PASOS:
  1. Testear cada celda individualmente (voltaje, capacidad real)
  2. Cargar todas a un voltaje similar (balanceo manual inicial)
  3. Conectar en paralelo (misma polaridad) para formar un grupo simple
  4. Medir voltaje del grupo, verificar que coincide con lo esperado
  5. Conectar el BMS y probar un ciclo completo de carga/descarga
     controlada, observando temperatura al tacto durante todo el proceso

VERIFICACIÓN DE ÉXITO: el grupo carga y descarga sin desviación de
  temperatura anormal, el BMS corta correctamente en los límites
  configurados
```

---

## Proyecto 2 — Pack 48V para e-bike (★★★☆☆, un fin de semana)

```
OBJETIVO: pack de tracción funcional con celdas testeadas y BMS de
  balanceo activo

MATERIAL:
  52 celdas 18650 (13S4P) o equivalente en 21700, testeadas y emparejadas
  por capacidad (Samsung 30Q o Molicel P42A recomendadas para descarga)
  Tira de níquel puro 0,15mm (rollo 5-10m, 8-15€)
  BMS 13S con balanceo activo (JK-BMS, 80-150€ según amperaje)
  Soldadora de puntos (Sunkko 709A, 180-260€ si no se tiene ya)
  Separadores de celda 18650 (comerciales o impresos en 3D)
  Carcasa (formato tubo/maleta según diseño de la bici)
  Termorretráctil, cable de potencia de sección adecuada

PASOS:
  1. Testear y emparejar las 52 celdas por capacidad (ver
     [[Reciclaje y recuperación de celdas — testeo, criterios, cuándo descartar]]
     si son recuperadas)
  2. Cargar todas al mismo voltaje antes de montar (balanceo inicial)
  3. Soldar por puntos los 4 grupos paralelo, verificando voltaje de
     cada grupo tras terminarlo
  4. Conectar los 13 grupos en serie, verificando voltaje acumulado
     tras cada unión (objetivo final ≈48,1V)
  5. Conectar el BMS SOLO al final, con el pack ya montado y verificado
  6. Primera carga vigilada sobre superficie no inflamable
  7. Montar en carcasa, conectar al controlador del motor, primera
     prueba de rodaje corta antes de uso normal

VERIFICACIÓN DE ÉXITO: voltaje estable bajo carga de tracción real
  (subida de prueba), sin caída de voltaje anormal ni corte del BMS en
  uso normal
```

---

## Proyecto 3 — UPS doméstico casero para router/PC (★★☆☆☆, una tarde-noche)

```
OBJETIVO: continuidad eléctrica de equipos críticos (router, NAS,
  cámaras) ante corte de suministro, con LiFePO4 por seguridad al estar
  en interior habitado de forma continua

MATERIAL:
  4 celdas LiFePO4 cilíndricas o prismáticas pequeñas (4S, ≈12,8V) o
  módulo LiFePO4 comercial pequeño ya montado
  BMS 4S LiFePO4 con protección de sobretensión/subtensión
  Módulo cargador/inversor pequeño o convertidor DC-DC según los
  equipos a alimentar (muchos routers/switches aceptan 12V DC directo)
  Relé de conmutación automática red/batería (o UPS pequeño comercial
  reutilizando solo la parte de batería con el pack propio)

PASOS:
  1. Montar y testear el pack 4S LiFePO4 (más simple que un 13S de e-bike)
  2. Conectar el BMS y verificar límites de corte correctos
  3. Configurar la conmutación automática red→batería (relé o módulo
     comercial) para que el corte de suministro sea invisible para los
     equipos conectados
  4. Probar con un corte de red simulado (desconectar el enchufe) y
     cronometrar cuánto tiempo de autonomía real ofrece el pack bajo la
     carga real de los equipos

VERIFICACIÓN DE ÉXITO: conmutación sin caída de conexión perceptible en
  los equipos, autonomía medida coincide razonablemente con el cálculo
  teórico (capacidad × voltaje / consumo de los equipos)
```

---

## Proyecto 4 — Powerwall doméstico de ~5kWh con celdas prismáticas (★★★★☆, varios fines de semana)

```
OBJETIVO: banco de almacenamiento doméstico completo, integrado con
  inversor híbrido y monitorizado en Home Assistant

MATERIAL:
  16 celdas EVE/CATL 280Ah Grade A (16S, 51,2V nominal) — 1.100-1.300€
  BMS Seplos o JK-BMS 16S con balanceo activo y comunicación CAN/RS485
  — 150-350€
  Kit de carcasa/busbars (Seplos Mason o equivalente) — incluido a
  veces en el kit de BMS
  Fusible principal, disyuntor de corte, cableado de potencia
  dimensionado a la corriente máxima del inversor

PASOS:
  1. Verificar cada celda individualmente al recibirla (voltaje, aspecto
     físico) antes de montar — el proveedor serio ya las entrega
     testeadas, pero la verificación propia es la última red de seguridad
  2. Montar las 16 celdas con busbars de cobre, apriete al torque
     especificado por el fabricante
  3. Instalar separadores/aislamiento entre celdas
  4. Conectar cables de balanceo al BMS, verificando orden correcto con
     multímetro antes de energizar
  5. Instalar fusible principal y disyuntor de corte
  6. Primera carga/descarga completa vigilada, con el pack sobre
     superficie no inflamable en su ubicación definitiva
  7. Conectar el BMS al inversor híbrido vía CAN/RS485 (verificar
     compatibilidad de protocolo antes de este paso, no después)
  8. Integrar monitorización en Home Assistant vía MQTT/Modbus — ver
     [[Software y monitorización — SOC, balanceadores, Node-RED, Home Assistant, Victron]]
  9. Dejar el sistema en observación varios días antes de confiar en él
     como respaldo real de la vivienda

VERIFICACIÓN DE ÉXITO: SOC coherente entre lo mostrado por el BMS y el
  consumo real observado durante varios ciclos completos de carga/
  descarga, sin desviación de celda individual detectada por el BMS
```

---

## Errores comunes al ejecutar estos proyectos

```
★★★★★ Saltarse el paso de testeo/emparejado inicial "para ir más rápido"
  en cualquiera de los cuatro proyectos — es sistemáticamente la causa
  más citada en foros de problemas que aparecen semanas o meses después
★★★★☆ Subestimar el tiempo real del proyecto 4 (powerwall) por comparar
  con el proyecto 2 (e-bike) — el volumen de trabajo de verificación en
  un banco de mayor tensión y capacidad es sustancialmente mayor
★★★☆☆ No documentar la configuración final (qué celda en qué posición,
  capacidad medida, fecha de montaje) — dificulta enormemente el
  diagnóstico si algo falla meses después
```

---

→ Detalle técnico de cada fase: [[Montaje de packs — soldadura por puntos, configuración serie-paralelo, balanceo]], [[BMS — selección, cableado y protecciones]]
→ Herramientas necesarias para todos estos proyectos: [[Herramientas y equipamiento — soldadora, cargadores, testers, multímetros]]
→ Seguridad durante la ejecución: [[Seguridad — thermal runaway, almacenamiento, extinción de incendios]]
