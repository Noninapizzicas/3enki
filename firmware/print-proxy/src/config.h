#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// CONFIGURACION ENKI ESP32 — BASE + LÓGICA
// ============================================
// Estos son valores por DEFECTO.
// Una vez arrancado, todo se configura desde el portal web
// en http://<ip-del-esp32>/ y se guarda en flash (NVS).
// ============================================

// --- BASE: Identidad del firmware ---
#define DRIVER_TYPE             "print-proxy"
#define FIRMWARE_VERSION        "3.2.1"

// --- BASE: Defaults identidad (solo si no hay config en NVS) ---
#define DEFAULT_DEVICE_ID       "enki-device-1"
#define DEFAULT_PROJECT_ID      "enki"
#define DEFAULT_MQTT_HOST       ""
#define DEFAULT_MQTT_PORT       1883
#define DEFAULT_MQTT_USER       ""
#define DEFAULT_MQTT_PASS       ""
#define DEFAULT_OTA_URL         ""

// --- BASE: WiFi Multi-Network ---
#define WIFI_MAX_NETWORKS       3       // hasta 3 redes WiFi con fallback
#define WIFI_CONNECT_TIMEOUT    10000   // ms para intentar conectar a cada red (solo en boot)
#define WIFI_PORTAL_TIMEOUT     300000  // 5 min portal cautivo antes de reiniciar
#define WIFI_CHECK_INTERVAL     5000    // cada 5s verificar WiFi en el loop (antes 30s)
#define WIFI_RECONNECT_TIMEOUT  8000    // ms máximo esperando reconexión por red (non-blocking)
#define WIFI_RETRY_DELAY        3000    // ms entre ciclos de reconexión
#define WIFI_MAX_FAILURES       3       // ciclos completos fallidos antes de abrir portal
#define WIFI_AP_NAME_PREFIX     "Enki"

// --- BASE: Hardware (no configurables desde portal) ---
#define LED_PIN                 2       // LED integrado del ESP32
#define PORTAL_PORT             80      // puerto del portal web
#define MAX_PAYLOAD_SIZE        8192    // buffer compartido para payloads grandes (8KB para tickets con logo)
#define WDT_TIMEOUT_SEC         120     // watchdog timeout 2 min
#define STATUS_INTERVAL_MS      30000   // cada 30s publica status

// --- BASE: OTA ---
#define OTA_CHECK_INTERVAL_MS   300000  // cada 5 min comprueba OTA

// --- BASE: MQTT ---
#define MQTT_BUFFER_SIZE        8448    // MAX_PAYLOAD_SIZE + 256 overhead

// --- NVS ---
#define NVS_NAMESPACE           "enki"

// ============================================
// LÓGICA: Print Proxy — Defaults específicos
// ============================================

#define DEFAULT_PRINTER_NAME    ""
#define DEFAULT_PRINTER_SVC     "49535343-fe7d-4ae5-8fa9-9fafd205e455"
#define DEFAULT_PRINTER_CHAR    "49535343-8841-43f4-a8d4-ecbe34729bb3"

// --- BLE ---
#define BLE_CHUNK_SIZE          20      // bytes por write BLE (MTU default)
#define BLE_CHUNK_DELAY         20      // ms entre chunks
#define BLE_SCAN_SECONDS        10      // duración del escaneo BLE
#define BLE_RECONNECT_MS        15000   // reintento reconexión BLE cada 15s
#define BLE_KEEPALIVE_MS        30000   // keepalive BLE cada 30s para evitar standby

#endif // CONFIG_H
