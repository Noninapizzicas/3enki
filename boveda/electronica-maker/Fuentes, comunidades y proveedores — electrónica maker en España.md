---
tipo: componente
sector: electronica-maker
tags: [fuentes, comunidades, proveedores, tiendas, normativa, ce, red]
---
# Fuentes, comunidades y proveedores — electrónica maker en España

> Nadie aprende electrónica maker en aislamiento — el proyecto que te atasca ya lo resolvió alguien en un foro hace tres años, y el componente que necesitas ya lo vende alguien en España sin esperar tres semanas de aduana.

---

## Tiendas online España — envío rápido

```
BricoGeek (tienda.bricogeek.com)
  Catálogo: Arduino, Raspberry Pi, ESP32, sensores, robótica — muy amplio
  Envío: 24-48h península

Solectroshop (solectroshop.com)
  Catálogo: Arduino, Raspberry Pi, micro:bit, SparkFun oficial
  Envío: 24h

Electan (electan.com)
  Catálogo: ESP32/ESP8266 Wemos, componentes básicos, buen precio
  Distribuidor para España y Portugal

Tiendatec (tiendatec.es)
  Catálogo: Raspberry Pi 5 oficial, Arduino, RetroPie, kits educativos

Kubii (kubii.com/es)
  Tienda oficial Raspberry Pi para España — stock garantizado de modelos nuevos

Electrohobby (electrohobby.es)
  Enfoque educativo/centros escolares, envíos rápidos a España y UE
```

---

## Proveedores internacionales (para pedidos grandes o componentes específicos)

```
LCSC (lcsc.com) — distribuidor mayorista con 640.000+ referencias
  Ventaja: integración directa con JLCPCB para PCBA, precios de mayorista
  Envío desde China: 1-3 semanas (o exprés más caro)

DigiKey (digikey.es) y Mouser (mouser.es) — catálogo profesional completo
  Ventaja: componentes originales garantizados, datasheets, stock fiable
  Envío EU: 1-3 días, precio superior a LCSC/AliExpress

TME (tme.eu) — distribuidor europeo, buen precio, envío rápido desde Polonia
  Buena alternativa intermedia entre precio chino y servicio DigiKey/Mouser

AliExpress — precio mínimo para módulos genéricos (sensores, drivers, placas)
  Contra: calidad variable entre vendedores, envío 2-4 semanas salvo AliExpress
  Choice/almacén EU (más rápido, algo más caro)
```

---

## Comunidades y foros

```
Foro Arduino oficial en español (forum.arduino.cc, sección Internacional > Español)
  Comunidad activa, buen punto de partida para dudas de principiante

r/esp32, r/arduino, r/raspberry_pi (Reddit, en inglés) — muy activos, respuesta rápida

Discord de Home Assistant y ESPHome (en inglés, canales activísimos)
  Imprescindible si el proyecto integra con domótica — resuelve dudas de
  configuración YAML en minutos

Comunidad AprendiendoArduino (aprendiendoarduino.com) — blog y foro en español,
  muchísimos tutoriales de ESP32 en castellano

Hackaday.io y Instructables — proyectos completos documentados paso a paso,
  buena fuente de inspiración y de solución a problemas ya resueltos por otros

Makespaces/Fablabs en España: Fablab Madrid, Makespace Madrid, Pobre.io (Sevilla),
  L'Ull Cec (Barcelona) — talleres físicos con equipamiento compartido
  (impresoras 3D, láser, pick and place) accesible por cuota o proyecto
```

---

## Canales y formación

```
DroneBot Workshop (YouTube, inglés) — tutoriales muy didácticos de ESP32/Arduino
Andreas Spiess "the guy with the Swiss accent" (YouTube) — proyectos IoT avanzados
Programar Fácil (programarfacil.com, español) — Arduino, domótica, ESPHome en castellano
Aprendiendo Arduino (español) — blog de referencia con cientos de tutoriales
digitalMedievals, Descubre Arduino (español) — proyectos y guías de compra actualizadas
Wokwi (wokwi.com) — simulador online de Arduino/ESP32/RPi Pico, prueba sin hardware físico
```

---

## Normativa relevante en España/UE

```
MARCADO CE — obligatorio para comercializar cualquier producto electrónico en la UE
  Aplica si VENDES el proyecto a terceros, NO aplica al uso personal/hobby

DIRECTIVA DE EQUIPOS RADIOELÉCTRICOS (RED, 2014/53/UE) y su transposición
  española (RD 188/2016, modificado por RD 192/2026 de 11 de marzo de 2026)
  → Aplica a cualquier equipo con radio (WiFi, BLE, LoRa) que se COMERCIALICE
  → Un ESP32 comprado y usado en un proyecto propio NO necesita certificación —
    el módulo ya viene certificado de fábrica para su uso; la certificación
    del PRODUCTO FINAL solo es obligatoria si lo vendes a terceros

RoHS (restricción de sustancias peligrosas, incluye plomo en soldadura)
  → Producto comercial en la UE debe usar estaño sin plomo (SAC305) —
    el hobby personal puede seguir usando estaño con plomo sin problema legal

WEEE (gestión de residuos electrónicos) — aplica a fabricantes/importadores
  que comercializan, no al hobby personal

EN CONCRETO PARA EL MAKER QUE NO VENDE NADA: ninguna de estas normativas te
  afecta legalmente mientras el proyecto sea para uso propio. Se vuelven
  relevantes en el momento en que decides vender el producto a terceros,
  momento en el que conviene asesorarse específicamente (la normativa de
  2026 ha añadido procedimientos de emergencia y vigilancia de mercado más
  estrictos).
```

---

## Errores comunes al buscar recursos

```
1. Comprar solo en AliExpress por precio y esperar 3-4 semanas para un
   componente que necesitabas para "hoy" → tener siempre un proveedor
   nacional de respaldo (BricoGeek, Solectroshop) para lo urgente

2. Confiar en el primer tutorial de YouTube sin verificar fecha — el
   ecosistema ESP32/Arduino cambia rápido (versiones de librería, nuevas
   variantes de chip), un tutorial de 2020 puede tener pasos obsoletos

3. No revisar si un módulo genérico de AliExpress trae ya pull-ups o
   protección integrada antes de asumir que "todos los módulos son iguales"
   entre vendedores distintos — la calidad y el diseño exacto varían

4. Ignorar la normativa por completo asumiendo "esto es solo un hobby" en el
   momento en que empiezas a vender unidades a conocidos o en Etsy/Tindie
   → a partir de ahí sí aplica marcado CE y directiva de radio
```

---

## Novedades 2025-2026

```
→ Real Decreto 192/2026 (BOE, 11 de marzo de 2026) actualiza el reglamento
  español de equipos radioeléctricos, trasponiendo la Directiva UE 2024/2749 —
  añade procedimientos de emergencia de mercado interior y refuerza la
  vigilancia de mercado, relevante solo si el proyecto pasa de hobby a producto
  comercial con radio integrada.
→ Wokwi (simulador online) amplía soporte a más placas (STM32, Raspberry Pi
  Pico) consolidándose como la vía más rápida para probar código antes de
  comprar hardware físico, especialmente útil en la fase de aprendizaje inicial.
```

→ Volver al mapa del sector: [[00 - Electrónica Maker (MOC)]]
→ Proveedores específicos de PCB: [[Fabricación de PCB — del prototipo a la serie corta]]
