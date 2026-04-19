# Cocina Display — Guition JC8012P4A1

Pantalla de cocina que muestra pedidos activos en tiempo real via LVGL nativo + MQTT.

## Hardware

| Componente | Detalle |
|---|---|
| Board | Guition JC8012P4A1 |
| SoC principal | ESP32-P4 (RISC-V, 360MHz, 32MB PSRAM) |
| SoC WiFi/BLE | ESP32-C6 |
| Display | ILI9881C, MIPI-DSI 2 lanes, 800×1280 |
| Touch | GT911, I2C (SDA=8, SCL=9, INT=3) |
| Conexión | TYPE-C (⑤ en el board) |

## Arquitectura

```
VPS (Event Core)              ESP32-P4 (Guition JC8012P4A1)
┌─────────────────┐           ┌──────────────────────────────┐
│ cocina module    │           │ LVGL UI (800×1280)           │
│   eventBus ─────╋── MQTT ──►│   cards pedidos por estado   │
│                  │           │                              │
│ MQTT Broker      │◄── MQTT ──│ enki-base:                   │
│ device-registry  │           │   WiFi (via C6) + MQTT      │
│ device-shadow    │           │   OTA + NVS + Portal         │
│ firmware-manager │           │                              │
└─────────────────┘           └──────────────────────────────┘
```

El ESP32-P4 recibe eventos MQTT de la cocina (`core/+/events/cocina/#`) y renderiza los pedidos nativamente con LVGL. No carga la web — UI nativa mucho más rápida y fiable.

## Build y Flash

**Requisito:** PlatformIO CLI (`pip install platformio`)

```bash
cd firmware/drivers/cocina-display

# Compilar
pio run

# Flash via USB-C
pio run -t upload

# Monitor serial (115200 baud)
pio device monitor
```

> **Nota:** usa pioarduino (Arduino 3.x para ESP32-P4). Se descarga automáticamente en el primer `pio run`.

## Primera ejecución

1. **Portal cautivo**: si no hay WiFi configurada, el ESP32 abre un AP
   `Enki-cocina-display-XXXX`. Conéctate y configura:
   - SSID + contraseña WiFi
   - Host MQTT (IP/dominio del VPS)
   - Project ID

2. **MQTT**: una vez conectado, el display suscribe a
   `core/+/events/cocina/#` y pide la lista de pedidos activos.

3. **Display**: se enciende el backlight y muestra la UI LVGL
   (fondo oscuro, cards por pedido, estado por ítem).

## Serial output esperado

```
========================================
  Enki ESP32 — Cocina Display v1.1
  Arquitectura BASE + LOGICA
========================================

[BASE] device=... project=... mqtt=...:1883 configured=SI
[DISPLAY] Init Guition JC8012P4A1...
[DISPLAY] ILI9881C OK — 800x1280 MIPI-DSI 2 lanes
[TOUCH] GT911 OK — addr=0x5D SDA=8 SCL=9 INT=3
[DISPLAY] LVGL 9.2 — panel=OK touch=OK — 400 KB buf
[COCINA-DISPLAY] Listo — LVGL=OK panel=OK
[COCINA] Solicitando lista activa (reqId=...)
[READY] Cocina Display operativo
```

## MQTT Topics

**Suscrito a:**
- `core/+/events/cocina/#` — item_preparando, item_preparado, pedido_listo
- `core/+/events/periferico/display` — push display events (nuevo_pedido, etc.)
- `ui/response/{reqId}` — respuesta a list-active (temporal)

**Publica a:**
- `ui/request/cocina/list-active` — pedir lista de pedidos activos
- `enki/{project}/status/{device}` — heartbeat cada 60s
- `devices/{project}/{device}/birth` — autodescubrimiento (retained)

## Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| `MIPI-DSI bus error: 0x105` | Cable LCD-FPC (⑦) mal conectado | Reconectar flat cable |
| `GT911 error: 0x105` | Cable CTP-FPC (⑧) mal conectado | Reconectar flat cable touch |
| `Sin PSRAM` | Flash mode incorrecto | Verificar `memory_type = qio_opi` |
| Pantalla blanca | Timing MIPI incorrecto | Ajustar `MIPI_*` en `config.h` |
| Touch invertido | Orientación GT911 | Cambiar `DISPLAY_ROTATION` en `config.h` |

## Ajustar pines

Si tu variante del JC8012P4A1 tiene pines diferentes, editar `src/config.h`:

```c
#define BACKLIGHT_PIN   26    // GPIO backlight PWM
#define TOUCH_SDA       8     // I2C SDA
#define TOUCH_SCL       9     // I2C SCL
#define TOUCH_INT       3     // Interrupt
```

## Estructura de archivos

```
src/
  config.h               — pines, MIPI timing, identidad driver
  main.cpp               — setup/loop (BASE + LÓGICA)
  display_driver.h/cpp   — ILI9881C + GT911 via esp_lcd
  ui_cocina.h/cpp        — LVGL UI (status bar, cards pedidos)
  logic_cocina_display.cpp — MQTT, estado pedidos, bridge→UI
  lv_conf.h              — configuración LVGL 9.x
boards/
  guition_jc8012p4a1.json — board definition PlatformIO
driver.json              — metadata para firmware-manager
idf_component.yml        — deps IDF (ili9881c, gt911)
platformio.ini           — build config (pioarduino)
```
