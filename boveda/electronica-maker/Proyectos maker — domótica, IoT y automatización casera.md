---
tipo: componente
sector: electronica-maker
tags: [proyectos, iot, domotica, automatizacion, esphome, riego, esp32]
---
# Proyectos maker — domótica, IoT y automatización casera

> La mejor forma de aprender electrónica maker no es leer sobre ella — es construir algo que resuelva un problema real de tu casa, aunque sea pequeño. Estos proyectos están ordenados de fácil a complejo, con lista de materiales y coste real.

---

## Proyecto 1 — Estación meteo con Home Assistant ★★☆☆☆

```
QUÉ HACE: mide temperatura, humedad y presión, y las envía a Home Assistant por MQTT

MATERIALES:
  ESP32 DevKit .......................... 5-8€
  BME280 (I2C) ........................... 3€
  Cables Dupont hembra-hembra ............ 2€
  Caja impresa 3D o carcasa reciclada .... 0-5€
  TOTAL: ~10-18€

SOFTWARE: ESPHome (YAML, sin escribir código C++) — configuración de ejemplo:
  sensor BME280 vía I2C, publicación automática a Home Assistant vía API nativa

TIEMPO: 30-60 minutos si ya tienes Home Assistant corriendo
NIVEL: entrada — el proyecto recomendado para el primer contacto con ESP32+HA
```

---

## Proyecto 2 — Interruptor WiFi para enchufe/luz ★★☆☆☆

```
QUÉ HACE: enciende/apaga una carga controlada por relé desde Home Assistant o
  un pulsador físico

MATERIALES:
  ESP32 o ESP8266 (Wemos D1 Mini) ........ 3-6€
  Módulo relé 1 canal (con optoacoplador). 1-2€
  Fuente 5V aislada (si controla 220V) .... 5-10€
  TOTAL: ~10-18€

⚠ SI CONTROLA 220V: usar caja no conductora, aislamiento correcto entre la
  parte de red y la parte de bajo voltaje, y considerar seriamente un enchufe
  inteligente comercial reflasheado (Sonoff) en vez de un relé desnudo si no
  hay experiencia previa trabajando con la red eléctrica

SOFTWARE: Tasmota o ESPHome — ambos soportan control local sin depender de
  la nube del fabricante

TIEMPO: 1-2 horas incluyendo el montaje eléctrico
NIVEL: entrada-intermedio (el riesgo sube si toca 220V)
```

---

## Proyecto 3 — Riego automatizado de plantas ★★★☆☆

```
QUÉ HACE: mide humedad del sustrato y activa una bomba/electroválvula cuando
  baja de un umbral, con registro histórico en Home Assistant

MATERIALES:
  ESP32 DevKit ............................ 6€
  Sensor de humedad capacitivo (no resistivo) 2-4€
  Bomba peristáltica 12V o electroválvula .. 6-15€
  MOSFET logic-level (IRLZ44N) ............. 1€
  Fuente 12V + regulador buck a 5V/3.3V .... 3-5€
  Tubo de silicona + depósito de agua ...... variable
  TOTAL: ~20-35€ por zona de riego

POR QUÉ SENSOR CAPACITIVO Y NO RESISTIVO: el resistivo se corroe en semanas
  por electrólisis constante en tierra húmeda — el capacitivo no toca la
  tierra directamente con electrodos metálicos expuestos y dura años

SOFTWARE: ESPHome con automatización de umbral, o Node-RED para lógica más
  compleja (varios sensores, riego escalonado por horario y humedad)

TIEMPO: medio día incluyendo instalación de tubería
NIVEL: intermedio — primer proyecto real con actuador de potencia
```

---

## Proyecto 4 — Sensor de presencia con radar mmWave ★★★☆☆

```
QUÉ HACE: detecta presencia (incluso persona quieta, a diferencia del PIR) para
  automatizar luces sin el parpadeo típico de los sensores de movimiento clásicos

MATERIALES:
  ESP32-C3 o similar ...................... 4-6€
  Sensor LD2410 (radar mmWave) ............ 5-8€
  TOTAL: ~10-14€

SOFTWARE: ESPHome tiene componente nativo para LD2410 — configuración directa
  sin librería externa, publica "presencia" (no solo "movimiento") a Home Assistant

VENTAJA SOBRE PIR: la luz no se apaga mientras estás sentado quieto leyendo o
  trabajando, el fallo clásico de los sensores PIR en despachos/baños

TIEMPO: 30-45 minutos
NIVEL: intermedio — buen segundo proyecto tras la estación meteo
```

---

## Proyecto 5 — Cerradura inteligente BLE/WiFi para puerta ★★★★☆

```
QUÉ HACE: apertura remota o por proximidad de una cerradura eléctrica

MATERIALES:
  ESP32 (BLE+WiFi) ........................ 6€
  Cerradura solenoide 12V o motor de cerrojo 10-25€
  MOSFET/relé para conmutar 12V ........... 1-2€
  Fuente 12V dedicada ...................... 5-8€
  Carcasa impresa 3D a medida ............. variable
  TOTAL: ~25-45€

CONSIDERACIONES: este proyecto toca seguridad física real de la vivienda —
  probar exhaustivamente el fallback manual (llave física siempre disponible),
  y no depender 100% de la conectividad para poder entrar en casa

SOFTWARE: ESPHome + automatización en Home Assistant con notificación de
  apertura, opcionalmente con lectura BLE de proximidad del móvil

TIEMPO: 1-2 días incluyendo el montaje mecánico de la cerradura
NIVEL: avanzado — primer proyecto que mezcla mecánica, potencia y seguridad
```

---

## Proyecto 6 — Red de sensores mesh con Meshtastic (off-grid) ★★★★☆

```
QUÉ HACE: comunicación de mensajes y localización GPS entre varios dispositivos
  sin depender de red móvil ni WiFi, usando LoRa mesh

MATERIALES (por nodo):
  Placa Heltec LoRa32 o TTGO T-Beam (ESP32+LoRa+GPS integrados) ... 15-30€/nodo
  Batería LiPo 1000-2000mAh ............................ 6-10€/nodo
  TOTAL: ~25-40€ por nodo, mínimo 2 nodos para probar

SOFTWARE: Meshtastic (firmware open-source) — configuración vía app móvil,
  sin necesitar programar nada

USO REAL: comunicación en zonas sin cobertura (montaña, camping, eventos
  masivos), localización de familia/grupo en excursiones

TIEMPO: 1-2 horas de configuración por nodo
NIVEL: avanzado en concepto, pero fácil de configurar gracias al firmware
  ya hecho — ver detalle completo en la nota de domótica/IoT dedicada
```

---

## Tabla resumen — coste y dificultad

```
PROYECTO                          COSTE APROX.   DIFICULTAD   TIEMPO
Estación meteo Home Assistant      10-18€         ★★☆☆☆        1h
Interruptor WiFi enchufe/luz       10-18€         ★★☆☆☆        1-2h
Riego automatizado                 20-35€/zona    ★★★☆☆        medio día
Sensor de presencia mmWave         10-14€         ★★★☆☆        30-45min
Cerradura inteligente BLE/WiFi     25-45€         ★★★★☆        1-2 días
Red mesh Meshtastic (2 nodos)      50-80€         ★★★★☆        2-3h
```

---

## Errores comunes al abordar estos proyectos

```
1. Empezar por el proyecto más ambicioso (cerradura, riego) sin haber hecho
   antes uno simple (estación meteo) → frustración innecesaria por acumular
   varios problemas nuevos a la vez (WiFi + sensor + actuador + carcasa)

2. No dejar el proyecto "a prueba" varios días antes de confiar en él para
   algo importante (riego de plantas que se pueden morir, cerradura de casa)

3. Subestimar el trabajo de carcasa/instalación física frente al trabajo de
   software — en la práctica, montar bien el proyecto en su ubicación final
   suele llevar más tiempo que programarlo

4. No documentar la configuración (YAML de ESPHome, cableado) → en 6 meses,
   cuando falle algo, nadie recuerda cómo estaba montado
```

---

## Novedades 2025-2026

```
→ ESPHome sigue reduciendo la barrera de entrada: cada vez más sensores y
  actuadores nuevos (como el LD2410) tienen componente nativo sin necesitar
  código C++ ni librerías externas, solo configuración YAML.
→ Los kits "todo en uno" tipo Heltec LoRa32 (ESP32+LoRa+pantalla+GPS en una
  sola placa) bajan de precio y simplifican mucho el salto a proyectos mesh
  off-grid sin tener que integrar módulos sueltos.
```

→ Software completo para estos proyectos: [[../domotica-iot/00 - Domótica e IoT (MOC)]]
→ Componentes usados aquí en detalle: [[Sensores — catálogo práctico por tipo]] · [[Actuadores — motores, servos, relés y control de potencia]]
