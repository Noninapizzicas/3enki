# Print Proxy — Driver ESP32

Puente MQTT ↔ Bluetooth para impresoras térmicas (Netum, Peripage, etc.).

## Arquitectura

Usa la librería compartida `enki-base` (WiFi, MQTT, OTA, Portal, NVS).
Solo contiene la lógica específica de impresión BLE/SPP.

## Funcionalidad

- Recibe tickets ESC/POS por MQTT (base64)
- Decodifica y envía via BLE o SPP a la impresora
- Cola de impresión (2 slots) para no bloquear MQTT
- Circuit breaker con health check automático
- Heartbeat BLE cada 5 min para detectar conexiones zombie
- Wake preventivo tras idle prolongado

## Topics MQTT

- `impresion/{project}/print/{device}` — Recibe jobs de impresión
- `impresion/{project}/printed/{device}` — Publica resultado (ACK/error)
- `enki/{project}/status/{device}` — Status periódico (cada 30s)

## Compilar

```bash
cd firmware/drivers/print-proxy
pio run
pio run -t upload    # flash via USB
pio device monitor   # monitor serial
```

## Configuración

Vía portal web en http://<ip-del-esp32>/
- WiFi (hasta 3 redes con fallback)
- MQTT broker
- Impresora BLE/SPP (scan + selección)
