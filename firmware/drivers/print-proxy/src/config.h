#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// DRIVER: Print Proxy — MQTT <-> BLE Thermal Printer
// ============================================
// Overrides de la BASE y config específica del driver.
// Los valores de BASE no definidos aquí usan los defaults
// de enki_config_defaults.h automáticamente.
// ============================================

// --- Driver identity ---
#define DRIVER_TYPE             "print-proxy"
#define FIRMWARE_VERSION        "3.4.0"

// --- LÓGICA: Print Proxy específicos ---
#define DEFAULT_PRINTER_NAME    ""
#define DEFAULT_PRINTER_SVC     "49535343-fe7d-4ae5-8fa9-9fafd205e455"
#define DEFAULT_PRINTER_CHAR    "49535343-8841-43f4-a8d4-ecbe34729bb3"

// BLE
#define BLE_CHUNK_SIZE          20
#define BLE_CHUNK_DELAY         20
#define BLE_SCAN_SECONDS        10
#define BLE_RECONNECT_MS        15000
#define BLE_KEEPALIVE_MS        30000

#endif // CONFIG_H
