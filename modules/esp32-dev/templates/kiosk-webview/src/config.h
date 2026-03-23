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

// ─── Kiosk ──────────────────────────────────────────────
#define KIOSK_URL          "{{KIOSK_URL}}"
#define DEVICE_NAME        "{{DEVICE_NAME}}"
#define DEVICE_TYPE        "display-kiosk"

// ─── OTA ────────────────────────────────────────────────
#define FIRMWARE_VERSION   "1.0.0"
#define OTA_CHECK_INTERVAL 300000  // 5 minutos

// ─── Watchdog ───────────────────────────────────────────
#define WDT_TIMEOUT_S      30

// ─── Portal cautivo ─────────────────────────────────────
#define AP_SSID            "Enki-Kiosk-Setup"
#define AP_PASSWORD        "enki1234"
#define CONFIG_PORTAL_TIMEOUT 180  // 3 minutos

#endif
