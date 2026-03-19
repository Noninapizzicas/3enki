#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// CONFIGURACION DEL PRINT PROXY ESP32
// ============================================
// Estos son valores por DEFECTO.
// Una vez arrancado, todo se configura desde el portal web
// en http://<ip-del-esp32>/ y se guarda en flash (NVS).
// No necesitas editar este archivo para cada instalacion.
// ============================================

// --- Defaults (se usan solo si no hay config guardada en NVS) ---
#define DEFAULT_DEVICE_ID       "cocina-1"
#define DEFAULT_PROJECT_ID      "nonina"
#define DEFAULT_MQTT_HOST       ""
#define DEFAULT_MQTT_PORT       1883
#define DEFAULT_MQTT_USER       ""
#define DEFAULT_MQTT_PASS       ""
#define DEFAULT_PRINTER_NAME    ""
#define DEFAULT_PRINTER_SVC     "49535343-fe7d-4ae5-8fa9-9fafd205e455"
#define DEFAULT_PRINTER_CHAR    "49535343-8841-43f4-a8d4-ecbe34729bb3"

// --- WiFi Multi-Network ---
#define WIFI_MAX_NETWORKS       3       // hasta 3 redes WiFi con fallback
#define WIFI_CONNECT_TIMEOUT    10000   // ms para intentar conectar a cada red
#define WIFI_PORTAL_TIMEOUT     300000  // 5 min portal cautivo antes de reiniciar
#define WIFI_CHECK_INTERVAL     30000   // cada 30s verificar WiFi en el loop
#define WIFI_AP_NAME_PREFIX     "PrintProxy"

// --- Constantes hardware (no configurables desde portal) ---
#define BLE_CHUNK_SIZE          20      // bytes por write BLE (MTU default)
#define BLE_CHUNK_DELAY         20      // ms entre chunks
#define BLE_SCAN_SECONDS        10      // duracion del escaneo BLE
#define BLE_RECONNECT_MS        15000   // reintento reconexion BLE cada 15s
#define STATUS_INTERVAL_MS      30000   // cada 30s publica status
#define PORTAL_PORT             80      // puerto del portal web
#define LED_PIN                 2       // LED integrado del ESP32
#define MAX_PAYLOAD_SIZE        4096    // buffer ESC/POS maximo
#define WDT_TIMEOUT_SEC         120     // watchdog timeout 2 min

// --- NVS ---
#define NVS_NAMESPACE           "printproxy"

#endif // CONFIG_H
