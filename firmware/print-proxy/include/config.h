#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// CONFIGURACION DEL PRINT PROXY ESP32
// ============================================
// Editar estos valores antes de flashear.
// En futuro se pueden mover a WiFiManager
// para configurar desde el movil.
// ============================================

// --- WiFi ---
// Si USE_WIFI_MANAGER es true, ignora SSID/PASS
// y lanza portal cautivo para configurar desde movil.
// Si es false, usa credenciales hardcodeadas.
#define USE_WIFI_MANAGER   true
#define WIFI_SSID          "PizzeriaNonina"
#define WIFI_PASS          "tu_password_wifi"

// --- MQTT ---
// Broker del VPS (event-core)
#define MQTT_HOST          "tu-vps.com"
#define MQTT_PORT          1883         // 1883 plano, 8883 TLS
#define MQTT_USE_TLS       false        // true para produccion
#define MQTT_USER          ""           // vacio si no hay auth
#define MQTT_PASS          ""

// --- Identidad ---
// Cada ESP32 tiene un ID unico. Determina sus topics MQTT.
#define DEVICE_ID          "cocina-1"
#define PROJECT_ID         "nonina"

// --- Topics MQTT ---
// El ESP32 se suscribe a: impresion/{PROJECT_ID}/print/{DEVICE_ID}
// Y publica ACK en:      impresion/{PROJECT_ID}/printed/{DEVICE_ID}
// Y status en:           impresion/{PROJECT_ID}/status/{DEVICE_ID}

// --- Impresora BLE ---
// Nombre BT que anuncia la Netum (verificar con nRF Connect)
#define PRINTER_BT_NAME    "NT-1809"

// UUIDs tipicos de impresoras termicas chinas 58mm
// Si no funcionan, escanear con nRF Connect y actualizar
#define PRINTER_SERVICE_UUID    "49535343-fe7d-4ae5-8fa9-9fafd205e455"
#define PRINTER_CHAR_UUID       "49535343-8841-43f4-a8d4-ecbe34729bb3"

// UUIDs alternativos (descomentar si los de arriba no funcionan)
// #define PRINTER_SERVICE_UUID "18f0"
// #define PRINTER_CHAR_UUID    "2af1"

// --- BLE ---
#define BLE_CHUNK_SIZE     20     // bytes por write BLE (MTU default)
#define BLE_CHUNK_DELAY    20     // ms entre chunks (evita overflow)
#define BLE_SCAN_SECONDS   10     // duracion del escaneo BLE
#define BLE_RECONNECT_MS   5000   // espera antes de reconectar

// --- Comportamiento ---
#define STATUS_INTERVAL_MS 30000  // cada 30s publica status
#define WATCHDOG_TIMEOUT   30     // segundos sin actividad → reinicio WDT
#define LED_PIN            2      // LED integrado del ESP32 (feedback visual)

#endif // CONFIG_H
