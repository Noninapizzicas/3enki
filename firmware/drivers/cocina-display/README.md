# Cocina Display — Kiosk Web ESP32-P4

Pantalla de cocina que muestra pedidos en tiempo real. Carga la misma UI web SvelteKit (`/cocina`) que se usa en tablets y desktop.

## Hardware

- **Chip:** ESP32-P4 (dual-core RISC-V 400MHz, 32MB PSRAM)
- **Pantalla:** 10.1" 800x1280 MIPI-DSI
- **Touch:** capacitivo I2C (GT911/FT5x06)
- **Alimentación:** USB-C 5V

## Arquitectura

```
VPS (Event Core)              ESP32-P4
┌─────────────────┐           ┌──────────────────┐
│ Frontend /cocina │◄─── HTTP ──►│ Kiosk WebView    │
│ MQTT Broker      │◄── WS ────►│ (la web tiene    │
│ firmware-manager │◄── MQTT ──►│  su propio MQTT) │
│ device-shadow    │            │ enki-base:       │
└─────────────────┘            │  WiFi+OTA+Status │
                               └──────────────────┘
```

El ESP32-P4 NO procesa los pedidos — solo muestra la web. La lógica de pedidos, estados, y sincronización multi-dispositivo corre en la web SvelteKit, que se conecta al VPS por MQTT WebSocket.

## Configuración

1. Flashear firmware al ESP32-P4
2. Conectar al AP `Enki-XXXX` que crea el dispositivo
3. En el portal `http://192.168.4.1/`:
   - Configurar WiFi (hasta 3 redes)
   - Configurar MQTT (host del VPS)
   - Configurar Project ID
4. La URL del kiosk se auto-construye: `http://{mqtt_host}/{project_id}/cocina`

## Topics MQTT

El firmware solo usa MQTT para gestión del dispositivo:

- `devices/{project}/{device}/birth` — autodescubrimiento
- `devices/{project}/{device}/state/reported` — versión firmware
- `devices/{project}/{device}/state/delta` — OTA updates
- `enki/{project}/status/{device}` — heartbeat (cada 60s)

Los pedidos llegan al display via la conexión MQTT WebSocket de la web SvelteKit, NO por el MQTT del firmware.

## Estado actual

- [x] Driver skeleton con enki-base
- [x] Config: URL kiosk, display params, touch pins
- [x] Portal endpoints para configurar display
- [ ] LVGL init + MIPI-DSI driver (necesita hardware)
- [ ] Touch I2C driver (necesita hardware)
- [ ] WebView renderer (experimental en ESP32-P4)
- [ ] Backlight PWM control
- [ ] Kiosk watchdog (auto-reload)

## Compilar

```bash
cd firmware/drivers/cocina-display
pio run
pio run -t upload
pio device monitor
```
