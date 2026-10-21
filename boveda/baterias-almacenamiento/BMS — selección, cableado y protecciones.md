---
tipo: componente
sector: baterias-almacenamiento
tags: [bms, balanceo, jk-bms, daly, seplos, overkill, proteccion, can, rs485]
---
# BMS — selección, cableado y protecciones

> El BMS es el único componente del pack que, si falla en silencio, no avisa hasta que ya es demasiado tarde — no es el sitio para ahorrar los últimos 20€ del presupuesto.

---

## Qué hace un BMS — las cuatro funciones que no son negociables

```
1. PROTECCIÓN — corta la carga si detecta sobretensión (OVP), corta la descarga
   si detecta subtensión (UVP), corta ambas si detecta sobrecorriente (OCP) o
   cortocircuito (SCP), y corta por temperatura fuera de rango (OTP/UTP)

2. BALANCEO — iguala el voltaje entre celdas de un mismo string en serie durante
   la carga, para que ninguna celda llegue antes que las demás al límite superior
   y limite artificialmente la capacidad útil de todo el pack

3. MEDICIÓN — voltaje individual de cada celda, corriente total, temperatura
   (uno o varios sensores), y con eso deriva el SOC (estado de carga) y SOH
   (estado de salud) del pack

4. COMUNICACIÓN (en BMS de gama media/alta) — expone esos datos por Bluetooth,
   RS485, CAN o UART para monitorización externa (app móvil, Home Assistant,
   inversor híbrido)
```

---

## Balanceo activo vs pasivo — la decisión que más impacta la vida útil

```
BALANCEO PASIVO (el más común, el más barato)
  Funcionamiento: quema el exceso de energía de la celda más cargada en forma
  de calor a través de una resistencia, hasta igualarla con las demás
  Corriente de balanceo típica: 30-150mA — LENTO, tarda horas en igualar
  celdas muy desviadas
  Coste: incluido en la mayoría de BMS económicos (Daly, JBD genéricos)
  Cuándo basta: packs pequeños (hasta 8-10S) con celdas bien emparejadas
  de origen (mismo lote, capacidad medida similar)

BALANCEO ACTIVO (gama media-alta)
  Funcionamiento: transfiere energía de la celda más cargada a las menos
  cargadas (capacitivo o inductivo), en vez de disiparla en calor
  Corriente de balanceo típica: 1-2A (JK-BMS) hasta varios amperios en
  modelos industriales — órdenes de magnitud más rápido que el pasivo
  Coste: sobreprecio de 30-80€ frente al equivalente pasivo
  Cuándo compensa: packs grandes (16S+), celdas recuperadas con capacidad
  desigual, o cualquier pack donde maximizar la capacidad utilizable real
  importe más que el coste extra del BMS
```

---

## Marcas de referencia — mapa de la comunidad DIY 2026

```
JK-BMS — el favorito de la comunidad internacional para almacenamiento DIY
  Balanceo activo de serie en la mayoría de modelos, buena documentación,
  app Bluetooth funcional, integración RS485/CAN con inversores Victron/
  Growatt/Deye bien probada en foros (diysolarforum, secondlifestorage)
  Rango de precio: 80-250€ según amperaje y número de celdas soportadas

DALY BMS — la opción económica de entrada, balanceo pasivo
  Buena relación precio/protecciones básicas, comunicación más limitada
  Rango de precio: 25-70€ (8S-16S, 60-150A)

SEPLOS — enfocado en kits completos "todo en uno" para pack 280/314Ah
  Kits Mason con carcasa + busbars + BMS integrado, pensados para montar
  un banco de 51,2V (16S) sin diseñar el cableado desde cero
  Rango de precio: 150-350€ el kit BMS+carcasa (sin celdas)

OVERKILL SOLAR (EEUU, referencia histórica en la comunidad DIY solar)
  BMS robusto orientado específicamente a instalación solar residencial,
  buena reputación de fiabilidad a largo plazo, algo más caro
  Rango de precio: 150-300€

DIYBMS (Stuart Pittaway, open source, GitHub) — la vía "hazlo tú mismo" del BMS
  Hardware open source + firmware para ESP32/ESP8266, monitorización por
  módulo individual de celda, integración directa con ESPHome/Home Assistant
  Coste: solo componentes (PCB + microcontrolador), pedido a fabricante
  de PCB (JLCPCB) — más barato que comercial pero exige montar y flashear
  cada módulo uno a uno
```

---

## Cableado y protecciones — lo que va SIEMPRE en un pack

```
FUSIBLE PRINCIPAL: dimensionado a la corriente máxima de descarga del pack,
  colocado lo más cerca posible del terminal positivo de la batería —
  protege contra cortocircuito antes de que el BMS pueda reaccionar

DISYUNTOR/INTERRUPTOR DE CORTE MANUAL: permite aislar físicamente el pack
  para mantenimiento sin depender del BMS ni desconectar celda a celda

CABLES DE BALANCEO: hilo fino (habitualmente AWG 22-26) que va del BMS a
  cada unión entre celdas — NO llevan la corriente de potencia, solo la
  señal de voltaje individual; un error aquí (invertir el orden) puede
  destruir el BMS al instante

BUSBAR DE POTENCIA (packs prismáticos): cobre de sección suficiente para la
  corriente máxima esperada, con torque de apriete especificado por el
  fabricante de la celda — un apriete insuficiente genera resistencia de
  contacto y calentamiento localizado con el tiempo

SHUNT DE CORRIENTE (si el BMS no lo integra): resistencia de precisión que
  mide la corriente real que entra/sale del pack para el cálculo de SOC
  por coulomb counting — ver [[Software y monitorización — SOC, balanceadores, Node-RED, Home Assistant, Victron]]
```

---

## Cómo elegir el BMS correcto — la pregunta que decide todo

```
1. ¿Cuántas celdas en serie (S)? → el BMS debe soportar EXACTAMENTE ese número
   (o un rango que lo incluya, ej. BMS "4-8S" ajustable)
2. ¿Qué corriente máxima de descarga necesita el sistema? → sumar el consumo
   pico de todas las cargas simultáneas + margen de seguridad del 20-30%
3. ¿Necesita comunicación con un inversor/sistema externo? → confirmar
   protocolo compatible (CAN para Victron/Growatt/Deye, RS485 como alternativa
   más universal) ANTES de comprar, no después
4. ¿El pack usará celdas recuperadas/desiguales? → priorizar balanceo activo
5. ¿Va a estar en exterior o con variación térmica fuerte? → confirmar rango
   de temperatura de operación del BMS, no solo de las celdas
```

---

## Errores comunes con el BMS

```
★★★★★ Comprar un BMS por precio sin verificar que soporta la corriente pico
  real del sistema (no solo la media) — corte inesperado en el momento de
  mayor demanda, típicamente al arrancar una carga inductiva (compresor,
  motor) que consume varias veces su corriente nominal en el arranque
★★★★☆ No verificar compatibilidad de protocolo de comunicación con el
  inversor ANTES de comprar batería de una marca y BMS de otra — algunos
  inversores híbridos exigen protocolo propietario y rechazan BMS de terceros
★★★★☆ Invertir el orden de los cables de balanceo al conectar el BMS por
  primera vez — puede destruir el BMS instantáneamente; verificar SIEMPRE
  con multímetro antes de la primera conexión, celda por celda
★★★☆☆ Confiar el balanceo pasivo lento de un BMS económico a un pack de
  celdas muy desiguales (ej. recuperadas de fuentes distintas) — el pack
  nunca llega a balancearse del todo y pierde capacidad utilizable real
★★★☆☆ No instalar fusible principal "porque el BMS ya protege" — el BMS
  puede fallar o no reaccionar a tiempo ante un cortocircuito franco; el
  fusible es la protección física de última instancia
```

---

## Novedades 2025-2026

```
→ El balanceo activo baja de precio y se generaliza en gama media (JK-BMS,
  Seplos) frente a hace unos años, cuando era casi exclusivo de gama alta.
→ La integración de BMS DIY y comerciales con Home Assistant vía MQTT/Modbus
  madura notablemente — soluciones de comunidad mantenidas (ha-victron-mqtt
  y similares) sustituyen a los scripts caseros frágiles de hace unos años.
→ diyBMS (Stuart Pittaway) sigue activo en su versión 4 con soporte ESP32,
  consolidándose como la vía open source de referencia para quien quiere
  entender y controlar cada línea del firmware de su propio BMS.
```

---

→ Montaje físico del cableado descrito aquí: [[Montaje de packs — soldadura por puntos, configuración serie-paralelo, balanceo]]
→ Lectura de SOC/SOH y dashboards: [[Software y monitorización — SOC, balanceadores, Node-RED, Home Assistant, Victron]]
→ Herramientas para verificar el cableado: [[Herramientas y equipamiento — soldadora, cargadores, testers, multímetros]]
