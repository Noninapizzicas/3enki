#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// ENKI NODE — ESP32 como modulo del sistema
// ============================================
// El ESP32 se comporta como un modulo mas de Enki:
//   - Escucha ui/request/{domain}/{action}
//   - Responde en ui/response/{request_id}
//   - Emite y recibe eventos via core/*/events/...
//
// Toda la config se gestiona desde el portal cautivo
// y se guarda en NVS. No edites este archivo por instalacion.
// ============================================

// --- Modulo Enki ---
#define MODULE_DOMAIN           "node"              // domain para ui/request/node/{action}
#define MODULE_VERSION          "1.0.0"
#define DEVICE_TYPE             "enki-node"

// --- Defaults (solo si no hay config en NVS) ---
#define DEFAULT_DEVICE_ID       ""                  // vacio = se genera desde MAC
#define DEFAULT_PROJECT_ID      "{{PROJECT_ID}}"
#define DEFAULT_MQTT_HOST       "{{MQTT_HOST}}"
#define DEFAULT_MQTT_PORT       1883
#define DEFAULT_MQTT_USER       "{{MQTT_USER}}"
#define DEFAULT_MQTT_PASS       "{{MQTT_PASSWORD}}"
#define DEFAULT_HTTP_PORT       3000

// --- WiFi ---
#define WIFI_MAX_NETWORKS       2
#define WIFI_CONNECT_TIMEOUT    10000   // ms por red
#define WIFI_CHECK_INTERVAL     30000   // ms entre checks
#define WIFI_AP_NAME_PREFIX     "Enki-Setup"

// --- Timings ---
#define HEARTBEAT_INTERVAL_MS   30000   // heartbeat modulo
#define MQTT_RECONNECT_MS       5000

// --- Hardware ---
#define PORTAL_PORT             80
#define LED_PIN                 2
#define WDT_TIMEOUT_SEC         120

// --- NVS ---
#define NVS_NAMESPACE           "enkinode"

// --- Buffers ---
#define MQTT_BUFFER_SIZE        2048    // para request/response JSON
#define JSON_DOC_SIZE           1536

#endif // CONFIG_H
