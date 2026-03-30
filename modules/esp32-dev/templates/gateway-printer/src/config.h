#ifndef CONFIG_H
#define CONFIG_H

// ─── WiFi ───────────────────────────────────────────────
#define WIFI_SSID          "{{WIFI_SSID}}"
#define WIFI_PASSWORD      "{{WIFI_PASSWORD}}"

// ─── MQTT ───────────────────────────────────────────────
#define MQTT_HOST          "{{MQTT_HOST}}"
#define MQTT_PORT          1883
#define MQTT_USER          "{{MQTT_USER}}"
#define MQTT_PASSWORD      "{{MQTT_PASSWORD}}"

// ─── Device ─────────────────────────────────────────────
#define DEVICE_NAME        "{{DEVICE_NAME}}"
#define DEVICE_TYPE        "impresora-termica"
#define FIRMWARE_VERSION   "1.0.0"

// ─── BLE Printer ────────────────────────────────────────
#define PRINTER_BLE_NAME   "{{PRINTER_BLE_NAME}}"
#define BLE_SCAN_TIMEOUT   10  // segundos
#define BLE_RECONNECT_MS   5000

// ─── ESC/POS ────────────────────────────────────────────
#define MAX_PRINT_PAYLOAD  4096  // bytes máximos por mensaje de impresión

#endif
