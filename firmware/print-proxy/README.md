# ESP32 Print Proxy

Puente MQTT ←→ BLE entre el VPS (event-core) y una impresora termica Netum Mini en la red local de la pizzeria.

## Arquitectura

```
VPS (event-core) ──MQTT──→ ESP32 (WiFi local) ──BLE──→ Netum Mini (58mm)
                  ←─ACK──
```

## Requisitos

- ESP32 DevKit (~5€) — cualquier ESP32 con WiFi+BLE
- Impresora Netum NT-1809 o similar 58mm BLE
- PlatformIO (CLI o extension VS Code)

## Paso 0: Verificar la impresora

Instalar **nRF Connect** en el movil, encender la Netum, escanear. Anotar:
- Nombre BT (probablemente "NT-1809")
- UUIDs del servicio y characteristic de escritura
- Actualizar `config.h` si difieren de los defaults

## Configurar

Editar `include/config.h`:
- WiFi: SSID/password o usar WiFiManager (portal cautivo)
- MQTT: host y puerto del VPS
- Identidad: DEVICE_ID y PROJECT_ID
- Impresora: nombre BT y UUIDs

## Build & Flash

```bash
# Instalar PlatformIO CLI
pip install platformio

# Compilar
cd firmware/print-proxy
pio run

# Flashear (conectar ESP32 por USB)
pio run -t upload

# Monitor serial (debug)
pio device monitor
```

## Topics MQTT

| Direccion | Topic | Payload |
|-----------|-------|---------|
| VPS → ESP32 | `impresion/{project}/print/{device}` | `{ job_id, data: "base64 ESC/POS" }` |
| ESP32 → VPS | `impresion/{project}/printed/{device}` | `{ job_id, success, error? }` |
| ESP32 → VPS | `impresion/{project}/status/{device}` | `{ online, printer_ready, wifi_rssi, ... }` |

## Config backend (event-core)

En `config.json` del proyecto:
```json
{
  "impresion": {
    "ancho": "58mm",
    "transporte": {
      "modo": "mqtt",
      "mqtt_device": "cocina-1",
      "mqtt_project": "nonina",
      "mqtt_timeout": 10000
    }
  }
}
```

## LED feedback

- 2 parpadeos: WiFi conectado
- 1 parpadeo largo: MQTT conectado
- 3 parpadeos: Impresora BLE conectada
- LED fijo durante envio BLE

## Troubleshooting

- **Impresora no encontrada**: Verificar nombre BT en config.h. Usar nRF Connect para confirmar.
- **Servicio no encontrado**: El firmware lista todos los servicios por serial. Actualizar UUIDs en config.h.
- **MQTT no conecta**: Verificar host/puerto. Sin TLS usa puerto 1883.
- **WiFiManager**: Si USE_WIFI_MANAGER=true, el ESP32 crea AP "PrintProxy-XXXX". Conectar y configurar WiFi desde el movil.
