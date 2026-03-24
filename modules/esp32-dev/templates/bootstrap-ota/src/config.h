#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// BOOTSTRAP OTA — Configuracion por defecto
// ============================================
// Estos son valores por DEFECTO. Una vez arrancado, todo se
// configura desde el portal cautivo y se guarda en NVS (flash).
// No necesitas editar este archivo para cada instalacion.
// ============================================

// --- Defaults (solo si no hay config guardada en NVS) ---
#define DEFAULT_DEVICE_ID       "{{DEVICE_NAME}}"
#define DEFAULT_PROJECT_ID      "{{PROJECT_ID}}"
#define DEFAULT_MQTT_HOST       "{{MQTT_HOST}}"
#define DEFAULT_MQTT_PORT       1883
#define DEFAULT_MQTT_USER       "{{MQTT_USER}}"
#define DEFAULT_MQTT_PASS       "{{MQTT_PASSWORD}}"
#define DEFAULT_HTTP_PORT       3000

// --- Firmware ---
#define FIRMWARE_VERSION        "1.0.0"
#define DEVICE_TYPE             "enki-node"

// --- WiFi ---
#define WIFI_MAX_NETWORKS       2       // primaria + fallback
#define WIFI_CONNECT_TIMEOUT    10000   // ms para intentar conectar a cada red
#define WIFI_CHECK_INTERVAL     30000   // cada 30s verificar WiFi en el loop
#define WIFI_AP_NAME_PREFIX     "Enki-Setup"

// --- Timings ---
#define HEARTBEAT_INTERVAL_MS   30000   // cada 30s publica heartbeat
#define MQTT_RECONNECT_MS       5000    // reintento MQTT cada 5s
#define STATUS_INTERVAL_MS      30000   // cada 30s publica status

// --- Hardware ---
#define PORTAL_PORT             80
#define LED_PIN                 2       // LED integrado del ESP32
#define WDT_TIMEOUT_SEC         120     // watchdog timeout 2 min

// --- NVS ---
#define NVS_NAMESPACE           "enkiboot"

#endif // CONFIG_H
