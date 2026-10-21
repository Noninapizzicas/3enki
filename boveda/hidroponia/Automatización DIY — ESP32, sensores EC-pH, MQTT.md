---
tipo: componente
sector: hidroponia
tags: [ESP32, automatización, sensores, EC, pH, MQTT, dosificadores, IoT, hidroponía]
---
# Automatización DIY — ESP32, sensores EC-pH, MQTT

## Arquitectura del sistema de control

```
OBJETIVO: monitorizar y controlar la solución nutritiva de forma continua
  → medir EC, pH y temperatura del agua
  → activar dosificadores cuando EC o pH se salen del rango
  → publicar datos en MQTT → Home Assistant → alertas y visualización
  → encender/apagar bomba de riego según temporizador o nivel del depósito

DIAGRAMA DE BLOQUES:
  [Sensor EC] ────┐
  [Sensor pH] ────┤──→ [ESP32] ──→ [MQTT broker] ──→ [Home Assistant]
  [Sensor Temp.] ─┘         │
                             └──→ [Relay × 4]
                                    ├─ Bomba NFT
                                    ├─ Dosificador A (pH down)
                                    ├─ Dosificador B (pH up)
                                    └─ Dosificador C (solución nutritiva)
```

---

## Hardware — componentes y coste

```
MICROCONTROLADOR:
  ESP32 DevKit v1 (38 pines): 4-6€ en AliExpress
    → WiFi integrado: 802.11 b/g/n (2.4 GHz)
    → Bluetooth: 4.2 (no necesario para esta aplicación)
    → ADC: 12 bits, 12 canales analógicos (GPIOs 32-39)
    → 3.3V lógica · 5V alimentación VIN
    → IMPORTANTE: los GPIOs ADC del ESP32 son sensibles al noise del WiFi en uso simultáneo
      → usar ADC2 (GPIOs 2,4,12-15,25-27) evitar ADC1 cuando el WiFi está activo
      → solución mejor: usar ADS1115 (ADC externo I2C de 16 bits)

SENSOR DE TEMPERATURA DEL AGUA:
  DS18B20 (sonda impermeable sumergible): 2-3€
    → Digital (1-Wire) → no afectado por interferencias · no usa ADC
    → Precisión: ±0.5°C en el rango 10-85°C
    → Conexión: DATA al GPIO4 (o cualquier digital) + resistencia 4.7kΩ pull-up a 3.3V
    → Librería: DallasTemperature + OneWire (Arduino/PlatformIO)

SENSOR DE EC (conductividad eléctrica):
  OPCIÓN A — DIY con electrodos de acero inox:
    2 tornillos M3 de acero inoxidable 316L a 1cm de separación → sonda EC casera
    El ESP32 aplica una señal AC (cuadrada a 1kHz via GPIO + timer hardware)
    Lee el voltaje resultante con el ADC → calcula la resistencia → convierte a EC
    → PRECISIÓN: ±10-15% (suficiente para control de hidroponía)
    → PROBLEMA: electrólisis en DC → hay que usar AC (señal cuadrada alternante)
    Librería de referencia: "Simple EC Meter" de Sparky's Widgets (GitHub)

  OPCIÓN B — Módulo EC DFRobot (Gravity EC Sensor):
    Pre-calibrado de fábrica, sonda de titanio, rango 0-20 mS/cm
    → Salida analógica 0-3.2V → al ADC del ESP32 via ADS1115
    → Precio: 25-35€ · MUCHO más fiable que la DIY
    → Librería: DFRobot_EC (GitHub)

  OPCIÓN C — Módulo Atlas Scientific EZO-EC:
    El de referencia industrial. Comunicación I2C o UART.
    → Precisión: ±2% (la mejor disponible para DIY)
    → Precio: 100-150€ · para instalaciones serias
    → Librería: Atlas Scientific ejemplos en GitHub

SENSOR DE pH:
  OPCIÓN A — Sensor pH con amplificador (módulo BNC + amplificador):
    Electrodo de pH estándar BNC (1-2€ en AliExpress, calidad variable)
    Placa amplificadora + buffer (pH-4502C): 3-5€ en AliExpress
    → Salida analógica 0-5V (escalar a 3.3V con divisor resistivo)
    → CALIBRACIÓN: cada 2-4 semanas con solución buffer pH 7.0 y pH 4.01
    → PROBLEMA: electrodo barato de AliExpress tiene vida corta (2-4 meses)

  OPCIÓN B — DFRobot Gravity pH Sensor (electrodo analógico):
    → Electrodo de calidad · rango pH 0-14 · precisión ±0.1 pH
    → Precio: 30-40€
    → Vida: 1-2 años con mantenimiento (guardar en solución KCl 3M)

  OPCIÓN C — Atlas Scientific EZO-pH:
    → I2C · precisión ±0.001 · auto-calibración
    → Precio: 150-200€ · para producción seria

ADC EXTERNO (recomendado para mejorar la lectura de sensores analógicos):
  ADS1115: ADC de 16 bits por I2C · 4 canales · 15-20€ vs ruido del ADC interno del ESP32
  → Dirección I2C: 0x48 (ADDR a GND) o 0x49/0x4A/0x4B
  → Librería: Adafruit_ADS1X15

MÓDULO RELAY × 4 (para bomba y dosificadores):
  Módulo 4 relés 5V/10A: 3-5€ en AliExpress
  → cada relay puede controlar 220V/10A → bomba de agua, luces LED, dosificadores
  → OPTOACOPLADO: los relay con optoacoplador aíslan el ESP32 del circuito de 220V
  → Conexión: IN1-IN4 a GPIOs del ESP32 · VCC a 5V · GND común

DOSIFICADORES PERISTÁLTICOS:
  Bomba peristáltica 12V DC (tipo Kamoer o similar): 5-15€/unidad
    → caudal: 50-200 ml/min (ajustable por velocidad o tiempo de activación)
    → para pH up/down: impulsos de 100-500ms bastan para 20L de depósito
    → para nutrientes: impulsos de 2-10s
  Driver L298N o L9110S: para controlar la velocidad del motor desde el ESP32
```

---

## Firmware — código base en C++ (PlatformIO / Arduino)

```cpp
// Estructura de datos del estado hidropónico
struct SolucionNutritiva {
  float ec;          // mS/cm
  float ph;          // 0-14
  float temperatura; // °C
  float nivel;       // % del depósito (sensor ultrasónico)
  uint32_t timestamp;
};

// Rangos de control (configurables vía MQTT)
struct RangosControl {
  float ecMin = 1.5;
  float ecMax = 2.5;
  float phMin = 5.8;
  float phMax = 6.3;
  float tempMax = 24.0; // alarma si T > 24°C
};

// Topic MQTT para hidroponía (sigue la convención del sistema)
const char* TOPIC_ESTADO  = "hidro/sala1/estado";       // publica cada 5 min
const char* TOPIC_ALERTA  = "hidro/sala1/alerta";       // publica si fuera de rango
const char* TOPIC_CONTROL = "hidro/sala1/control/cmd";  // suscribe para comandos

// Loop principal de control (simplificado)
void loopControl(SolucionNutritiva& estado, RangosControl& rangos) {
  // Leer sensores
  estado.ec          = leerEC();
  estado.ph          = leerPH();
  estado.temperatura = leerTemperatura();
  estado.timestamp   = millis();

  // Publicar estado
  publicarMQTT(TOPIC_ESTADO, serializar(estado));

  // Control de pH (banda muerta de ±0.1 para evitar oscilaciones)
  if (estado.ph > rangos.phMax + 0.1) {
    activarDosificador(RELAY_PH_DOWN, 200ms); // 200ms de pH down
  } else if (estado.ph < rangos.phMin - 0.1) {
    activarDosificador(RELAY_PH_UP, 200ms);
  }

  // Control de EC
  if (estado.ec < rangos.ecMin - 0.1) {
    activarDosificador(RELAY_NUTRIENTES, 3000ms); // 3s de solución nutritiva
  }

  // Alarmas
  if (estado.temperatura > rangos.tempMax) {
    publicarMQTT(TOPIC_ALERTA, "TEMPERATURA_ALTA");
  }
}
```

---

## Integración con Home Assistant y MQTT

```yaml
# configuration.yaml — sensores MQTT para el hidropónico

mqtt:
  sensor:
    - name: "Hidro EC"
      state_topic: "hidro/sala1/estado"
      value_template: "{{ value_json.ec }}"
      unit_of_measurement: "mS/cm"
      icon: mdi:water-percent

    - name: "Hidro pH"
      state_topic: "hidro/sala1/estado"
      value_template: "{{ value_json.ph }}"
      icon: mdi:test-tube

    - name: "Hidro Temperatura"
      state_topic: "hidro/sala1/estado"
      value_template: "{{ value_json.temperatura }}"
      unit_of_measurement: "°C"
      icon: mdi:thermometer

  binary_sensor:
    - name: "Hidro Alerta"
      state_topic: "hidro/sala1/alerta"
      payload_on: "TEMPERATURA_ALTA"
      device_class: problem

# automations.yaml — alertas por Telegram si fuera de rango
automation:
  - alias: "Hidro pH fuera de rango"
    trigger:
      platform: numeric_state
      entity_id: sensor.hidro_ph
      above: 6.8
    action:
      service: notify.telegram
      data:
        message: "⚠️ pH hidro {{ states('sensor.hidro_ph') }} — fuera de rango (target 5.8-6.3)"
```

---

## Calibración de sensores

```
CALIBRACIÓN EC (DFRobot o DIY):
  1. Preparar solución estándar: KCl 0.1M = 14.9g KCl en 2L agua destilada → EC = 12.88 mS/cm
     Alternativa: solución de calibración comercial 1413 µS/cm y 2764 µS/cm
  2. Sumergir la sonda limpia en la solución
  3. Leer el voltaje ADC → calcular el factor de corrección K_EC:
     K_EC = EC_estandar / (voltaje / voltaje_referencia)
  4. Guardar K_EC en la EEPROM del ESP32 → el firmware lo usa en cada medición
  5. Verificar con agua del grifo (EC conocida, medirla con EC-metro de referencia)

CALIBRACIÓN pH (2 puntos):
  1. Preparar soluciones buffer: pH 7.0 (neutro) y pH 4.01 (ácido)
     → sobres de polvo de calibración (5-10€ en tiendas grow-shop)
  2. Sumergir el electrodo en pH 7.0 → leer voltaje V7 (≈ 1.75V en muchos módulos)
  3. Enjuagar con agua destilada → sumergir en pH 4.01 → leer voltaje V4
  4. Calcular la pendiente: m = (7.0 - 4.01) / (V7 - V4)
  5. Calcular offset: b = 7.0 - m × V7
  6. Guardar m y b en EEPROM
  Verificar cada 2-4 semanas o cuando el electrodo salga de la solución de almacenaje

ALMACENAJE DEL ELECTRODO DE pH:
  → en solución KCl 3M (o solución de almacenaje comercial)
  → NUNCA en agua destilada → el electrodo se degrada rápido
  → NUNCA en seco → el electrodo se seca y pierde la referencia → irreparable
```

---

## Lista de materiales — sistema completo de automatización

| Componente | Precio (AliExpress) | Precio (tienda ES) |
|---|---|---|
| ESP32 DevKit v1 | 4-6€ | 8-12€ |
| ADS1115 (ADC I2C) | 2-4€ | 5-8€ |
| DS18B20 sonda sumergible | 2-3€ | 4-6€ |
| DFRobot EC sensor | — | 30-40€ |
| DFRobot pH sensor | — | 30-40€ |
| Módulo relay 4 canales | 3-5€ | 6-10€ |
| Bomba peristáltica 12V ×3 | 5-15€/u | 15-25€/u |
| Caja estanca IP65 | 3-6€ | 8-15€ |
| PCB prototyping o protoboard | 2-4€ | 5-10€ |
| **TOTAL (solución A/B DFRobot)** | **~85€** | **~130-160€** |
| **TOTAL (Atlas Scientific EZO)** | **~350€** | **~400-500€** |

→ Ver también: [[domotica-iot/00 - Domótica e IoT (MOC)|Domótica e IoT]] para la configuración del broker MQTT y Home Assistant
→ Ver también: [[electronica-maker/00 - Electrónica Maker (MOC)|Electrónica Maker]] para diseño de la PCB del controlador
