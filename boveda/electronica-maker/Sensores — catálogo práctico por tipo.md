---
tipo: componente
sector: electronica-maker
tags: [sensores, dht22, bme280, sensores-movimiento, sensores-gas, i2c]
---
# Sensores — catálogo práctico por tipo

> Un sensor convierte una magnitud física en una señal eléctrica que el microcontrolador puede leer — la calidad del proyecto depende más de elegir el sensor correcto para lo que realmente se necesita medir que de la potencia del microcontrolador que lo procesa.

---

## Temperatura y humedad

```
DHT11 — el más barato, el menos preciso
  Rango: 0-50°C (±2°C) · 20-80% HR (±5%) · protocolo propietario 1-wire
  Precio: 1-2€ · uso: proyectos educativos donde la precisión no importa

DHT22 / AM2302 — el estándar de entrada razonable
  Rango: -40 a 80°C (±0.5°C) · 0-100% HR (±2-5%) · 1-wire, lectura cada 2s mínimo
  Precio: 3-5€ · uso: estación meteo casera, invernadero, la opción por defecto

BME280 (Bosch) — temperatura + humedad + presión en un solo chip
  Comunicación: I2C o SPI, mucho más rápido que DHT22, oversampling configurable
  Precio: 2-4€ (clones) · uso: estación meteo con altitud/presión, calidad de aire indoor

SHT31/SHT35 (Sensirion) — precisión profesional
  Precio: 6-12€ · uso: cuando ±0.5% HR real importa (invernadero de precisión, laboratorio)

DS18B20 — temperatura sumergible/exterior, 1-wire, direccionable en cadena
  Precio: 2-4€ (versión con sonda estanca) · uso: temperatura de agua, exterior, múltiples
  puntos en un solo cable (hasta decenas de sensores en el mismo bus)
```

---

## Gases y calidad del aire

```
MQ-2 / MQ-135 (serie MQ) — gas genérico, analógico, requiere calentamiento y calibración
  Precio: 2-4€ · uso: detección de humo/gas doméstica DIY, NO apto para seguridad certificada

CCS811 — CO2 equivalente (eCO2) + VOC, I2C
  Precio: 6-10€ · uso: calidad de aire indoor, requiere quemado inicial de 48h

SCD40/SCD41 (Sensirion) — CO2 real por NDIR (no estimado), I2C
  Precio: 20-30€ · uso: cuando el CO2 real importa (aula, oficina, invernadero cerrado) —
  mucho más fiable que el eCO2 del CCS811

MiCS-5524 — monóxido de carbono y otros gases reductores
  Precio: 5-8€ · uso: detector CO DIY (no sustituye a un detector certificado en vivienda)
```

---

## Movimiento y presencia

```
PIR (HC-SR501) — infrarrojo pasivo, el clásico detector de movimiento
  Precio: 1-2€ · alcance 3-7m ajustable · uso: luz que se enciende al pasar, alarma básica
  Limitación: no detecta presencia estática (alguien quieto no "se mueve")

Radar mmWave (LD2410, RCWL-0516) — detección de presencia real, incluso estática
  Precio: 4-8€ (LD2410) · uso: domótica avanzada, detecta si sigues en la habitación
  sin moverte (a diferencia del PIR) — tendencia fuerte en domótica 2025-2026

Acelerómetro/giroscopio MPU6050 — movimiento del propio dispositivo, 6 ejes, I2C
  Precio: 2-4€ · uso: robots, wearables, detección de caídas/vibración
```

---

## Distancia y proximidad

```
HC-SR04 (ultrasonidos) — el clásico, barato, funciona bien en aire limpio
  Precio: 1-2€ · rango 2cm-4m · uso: nivel de depósito, robot evita obstáculos

VL53L0X / VL53L1X (ST, ToF láser) — mucho más preciso y rápido que ultrasonidos
  Precio: 3-6€ · rango hasta 2-4m (L1X) · I2C · uso: robótica de precisión, gestos

Sensor de nivel capacitivo — sin contacto con el líquido, no se corroe
  Precio: 3-5€ · uso: depósitos de agua/nutrientes en hidroponía (alternativa al flotador)
```

---

## Luz y color

```
LDR (fotorresistencia) — analógico, barato, impreciso
  Precio: <1€ · uso: encender luces al anochecer, proyectos educativos

BH1750 — lux real, digital, I2C
  Precio: 2-3€ · uso: automatización de persianas/luces con umbral de lux calibrado

TCS34725 — color RGB + luz ambiental, I2C
  Precio: 4-6€ · uso: clasificador de objetos por color, calibración de pantallas DIY
```

---

## Corriente y energía

```
ACS712 (efecto Hall) — medición de corriente AC/DC sin cortar el circuito
  Precio: 2-4€ · rangos 5A/20A/30A · uso: monitor de consumo eléctrico DIY

INA219 / INA226 — medición de corriente y voltaje de precisión, I2C
  Precio: 3-6€ · uso: monitorización de baterías, consumo real de un proyecto en desarrollo

Pinza SCT-013 (transformador de corriente) — no invasiva, se abre y se pinza al cable
  Precio: 6-12€ · uso: monitor de consumo de vivienda entera sin cortar el cableado
```

---

## Elegir por protocolo — impacto real en el proyecto

```
1-WIRE (DHT22, DS18B20): un solo pin de datos, simple, lento, ideal si hay pocos sensores
I2C (BME280, VL53L0X, INA219...): bus compartido, direcciones distintas, decenas de
  sensores en 2 cables (SDA/SCL) — la opción que escala mejor
ANALÓGICO (LDR, MQ-x, algunos de nivel): un ADC por sensor, simple pero limitado en
  ruido y en número de canales disponibles del microcontrolador
```

---

## Errores comunes

```
1. Leer el DHT22 con más frecuencia que 1 vez cada 2 segundos
   → el sensor devuelve NaN o valores repetidos, no es un fallo del cableado

2. No calibrar sensores MQ-x tras el "burn-in" inicial (24-48h encendidos)
   → lecturas erróneas las primeras horas/días, hay que dejarlos "asentar"

3. Poner dos sensores I2C con la misma dirección fija en el mismo bus
   → conflicto de direcciones, solo responde uno (o ninguno) — usar un multiplexor
     TCA9548A si hace falta repetir el mismo sensor varias veces

4. Alimentar sensores de 5V directamente desde un GPIO de 3.3V (ESP32/RP2040)
   → el sensor no funciona o da lecturas inestables — revisar el rango de voltaje
     de alimentación del datasheet antes de conectar

5. Cables largos sin blindaje en señales analógicas (LDR, MQ-x)
   → ruido inducido, lecturas que saltan sin motivo — preferir I2C/digital si el
     cable va a medir varios metros
```

---

## Novedades 2025-2026

```
→ Los sensores radar mmWave (LD2410 y similares) bajan de precio y se popularizan en
  domótica como sustituto del PIR clásico: detectan presencia estática (persona sentada
  sin moverse), algo que el infrarrojo pasivo nunca pudo hacer.
→ El SCD40/SCD41 de Sensirion (CO2 real por NDIR) se vuelve accesible para el maker
  medio, desplazando al CCS811 (solo eCO2 estimado) en proyectos que buscan dato fiable.
→ Integración creciente de sensores ambientales combinados (temperatura + humedad +
  presión + calidad de aire en un solo módulo I2C) simplifica el cableado en estaciones
  meteo DIY.
```

→ Cómo conectarlos: [[Protocolos cableados — I2C, SPI, UART]]
→ Proyectos completos con estos sensores: [[Proyectos maker — domótica, IoT y automatización casera]]
