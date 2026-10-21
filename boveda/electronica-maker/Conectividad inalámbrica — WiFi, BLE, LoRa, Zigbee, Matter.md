---
tipo: componente
sector: electronica-maker
tags: [wifi, ble, lora, lorawan, zigbee, thread, matter, mqtt]
---
# Conectividad inalámbrica — WiFi, BLE, LoRa, Zigbee, Matter

> Cada protocolo inalámbrico resuelve un compromiso distinto entre alcance, consumo y ancho de banda — elegir mal significa un sensor con batería que dura tres días en vez de tres años, o un hub domótico que no habla con la mitad de tus dispositivos.

---

## El mapa de compromisos

```
                ALCANCE        CONSUMO         ANCHO DE BANDA    TOPOLOGÍA
WiFi            10-50m          Alto            Alto (Mbps)       estrella (a un router)
BLE             10-30m          Muy bajo        Bajo (kbps)       punto a punto / mesh
Zigbee/Thread   10-30m/salto    Bajo            Bajo-medio        mesh (se repite salto a salto)
LoRa/LoRaWAN    2-15km (rural)  Muy bajo        Muy bajo (bytes)  estrella (a un gateway)
Matter          (no es radio, es capa de aplicación sobre WiFi/Thread/Ethernet)
```

---

## WiFi — el más simple, el más sediento de batería

```
Integrado en: ESP32 (todas las variantes), ESP8266, Raspberry Pi Pico W/2W
Consumo: 80-250mA en transmisión activa — inviable para proyectos con batería
  pequeña que deban durar meses (una batería LiPo de 1000mAh se agota en horas
  de uso continuo)
Ventaja real: no necesita gateway/hub adicional, se conecta directo al router
  de casa, protocolo IP nativo (HTTP, MQTT, etc. funcionan sin capa extra)

USO TÍPICO: dispositivos conectados a la red eléctrica (enchufes inteligentes,
  cámaras, estaciones meteo fijas) donde el consumo no es el problema
```

---

## BLE (Bluetooth Low Energy) — bajo consumo, corto alcance

```
Integrado en: ESP32 (todas las variantes salvo P4), nRF52840 (Nordic, referencia
  en wearables), la mayoría de microcontroladores IoT modernos

Consumo: microamperios en reposo, picos bajos en transmisión — ideal para
  dispositivos con batería de botón o pequeña que deben durar meses/años

USO TÍPICO: beacons, wearables, sensores de puerta/ventana con batería CR2032,
  aprovisionamiento inicial (commissioning) de dispositivos Matter/Thread

BLE Mesh: permite que dispositivos BLE se repitan la señal entre sí, extendiendo
  el alcance efectivo más allá de los 10-30m de un salto individual

Bluetooth 6.0: mejoras de precisión de localización (angle-of-arrival) y
  eficiencia energética siguen ganando adopción en chips nuevos de 2025-2026
```

---

## Zigbee, Thread y Matter — el trío de la domótica moderna

```
ZIGBEE (802.15.4, mesh)
  → El estándar histórico de domótica: bombillas Philips Hue, sensores Aqara/Xiaomi
  → Necesita un coordinador/gateway (dongle Zigbee USB, o el propio ESP32-C6/H2)
  → Red mesh: cada dispositivo alimentado por corriente puede repetir la señal

THREAD (802.15.4, mesh, IP nativo)
  → El sucesor moderno de Zigbee — mesh IP nativo (cada dispositivo es routeable),
    más robusto que Zigbee frente a caída de nodos
  → Necesita un "Border Router" (Apple HomePod mini, Google Nest Hub, o un ESP32-C6
    configurado como tal)

MATTER (capa de aplicación, NO es radio)
  → Estándar que define CÓMO hablan los dispositivos entre ecosistemas (Apple Home,
    Google Home, Amazon Alexa, Samsung SmartThings), corriendo sobre WiFi, Thread
    o Ethernet como transporte
  → Recomendación 2025-2026 para domótica nueva: Matter sobre Thread, con BLE
    para el aprovisionamiento inicial del dispositivo
  → Ventaja real: comprar UN dispositivo Matter funciona con CUALQUIER hub
    compatible, sin depender de la marca del ecosistema

CUÁL ELEGIR EN 2026: si empiezas de cero y el presupuesto lo permite, Matter
  sobre Thread (chip ESP32-C6 o equivalente) da la mejor compatibilidad futura.
  Si ya tienes un ecosistema Zigbee (Hue, Aqara) funcionando bien, no hace falta
  migrar solo por moda — Zigbee2MQTT sigue siendo sólido y muy soportado.
```

---

## LoRa y LoRaWAN — el largo alcance de bajísimo consumo

```
LoRa (la capa física de radio) — módulos SX1276/SX1278 (RFM95), chip a ~5-10€
LoRaWAN (el protocolo de red sobre LoRa) — gestiona direccionamiento, seguridad,
  y la comunicación con un gateway

ALCANCE: 2-5km en zona urbana, hasta 15km+ en línea de vista rural — muy superior
  a WiFi/BLE/Zigbee, a cambio de un ancho de banda mínimo (bytes por mensaje,
  no streaming de datos)

CONSUMO: extremadamente bajo — un sensor LoRa con batería puede durar 1-3 años
  enviando una lectura cada 10-15 minutos

USO TÍPICO: sensores de campo/agrícolas, monitorización remota sin cobertura
  WiFi, redes comunitarias (TTN - The Things Network, gratuita y abierta)

MESHTASTIC: firmware open-source sobre LoRa para mensajería y localización mesh
  sin infraestructura de operador — comunicación off-grid entre dispositivos,
  cubierto en detalle en la nota de domótica/IoT dedicada
```

---

## Cuál elegir en la práctica

```
"Sensor con batería que debe durar meses en un rincón de casa"
  → BLE (si está cerca del hub) o Zigbee/Thread (si hace falta mesh)

"Enchufe/bombilla siempre conectado a la red eléctrica"
  → WiFi (sin gateway extra) o Zigbee/Thread (mejor consumo de red, requiere hub)

"Sensor en el campo, a kilómetros de cualquier router"
  → LoRa/LoRaWAN — es la única opción viable a esa distancia sin repetidores

"Quiero comprar dispositivos de distintas marcas que funcionen juntos sin líos"
  → Matter (sobre Thread o WiFi según el fabricante del dispositivo)

"Necesito máximo ancho de banda (cámara, streaming de audio)"
  → WiFi — ningún otro protocolo de esta lista mueve suficiente dato
```

---

## Errores comunes

```
1. Elegir WiFi para un sensor con batería pequeña "porque es lo que conozco"
   → la batería dura horas o pocos días en vez de meses; BLE/Zigbee es la
     elección correcta cuando el consumo importa

2. Mezclar gateways Zigbee de distintos fabricantes sin verificar compatibilidad
   → algunos dispositivos "Zigbee" usan variantes propietarias que no hablan
     bien con coordinadores genéricos (revisar compatibilidad con Zigbee2MQTT)

3. Esperar el mismo alcance de LoRa en interior que en exterior
   → paredes y estructura metálica reducen drásticamente el alcance real frente
     a la cifra de marketing en espacio abierto

4. No considerar la latencia de una red mesh (Zigbee/Thread) con muchos saltos
   → un comando puede tardar segundos en llegar al dispositivo final si la
     ruta mesh tiene varios repetidores intermedios saturados

5. Confundir Matter con un protocolo de radio — Matter no sustituye a WiFi/Thread,
   corre ENCIMA de ellos; comprar un dispositivo "Matter" sin fijarse en si usa
   WiFi o Thread como transporte puede dar sorpresas de compatibilidad de hub
```

---

## Novedades 2025-2026

```
→ Matter sobre Thread se consolida como la recomendación de facto para domótica
  nueva multi-ecosistema (Apple/Google/Amazon/Samsung a la vez), con BLE reservado
  para el aprovisionamiento inicial del dispositivo.
→ El ESP32-C6 (WiFi 6 + BLE 5 + Zigbee + Thread en un chip) simplifica el diseño
  de dispositivos que quieren ser compatibles con varios protocolos a la vez sin
  necesitar un coprocesador de radio separado.
→ Para IoT industrial/agrícola de área amplia, LoRaWAN sigue dominando frente a
  Bluetooth Mesh o Thread, que no están pensados para cubrir kilómetros — la
  elección depende de la escala del despliegue, no de la moda del protocolo.
```

→ Software de domótica sobre estos protocolos: [[../domotica-iot/MQTT en domótica — brokers y patrones]]
→ Redes LoRa mesh: [[../domotica-iot/Meshtastic y redes mesh LoRa]]
