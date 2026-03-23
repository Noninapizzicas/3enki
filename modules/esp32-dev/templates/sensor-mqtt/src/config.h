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
#define DEVICE_TYPE        "sensor"
#define FIRMWARE_VERSION   "1.0.0"

// ─── Sensor ─────────────────────────────────────────────
#define SENSOR_PIN         4
#define READ_INTERVAL_MS   30000   // 30 segundos
#define DEEP_SLEEP_US      300000000  // 5 minutos en deep sleep (0 = desactivado)

#endif
