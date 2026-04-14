#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// DRIVER: Cocina Display — Kiosk web para pedidos
// ============================================
// ESP32-P4 + pantalla 10.1" 800x1280 MIPI-DSI
// Carga la URL /cocina del VPS y muestra pedidos.
// ============================================

// --- Driver identity ---
#define DRIVER_TYPE             "cocina-display"
#define FIRMWARE_VERSION        "1.0.0"

// --- Display ---
#define DISPLAY_WIDTH           800
#define DISPLAY_HEIGHT          1280
#define DISPLAY_ROTATION        0       // 0=portrait, 1=landscape

// --- Kiosk ---
// URL base del servidor. El portal web permite configurarla.
// La URL completa será: KIOSK_URL_BASE + "/" + projectId + "/cocina"
#define DEFAULT_KIOSK_URL       ""
#define KIOSK_RELOAD_INTERVAL   0       // 0 = no auto-reload, N = reload cada N ms

// --- LED (puede no existir en ESP32-P4 boards) ---
#define LED_PIN                 -1      // -1 = no LED

// --- Backlight ---
#define BACKLIGHT_PIN           45      // GPIO para retroiluminación
#define BACKLIGHT_BRIGHTNESS    255     // 0-255
#define BACKLIGHT_DIM_AFTER_MS  0       // 0 = no atenuar, N = atenuar tras N ms inactividad

// --- Touch ---
#define TOUCH_SDA               8
#define TOUCH_SCL               9
#define TOUCH_INT               3
#define TOUCH_RST               -1

// --- Status interval más largo (pantalla no necesita reportar cada 30s) ---
#define STATUS_INTERVAL_MS      60000   // cada 60s

#endif // CONFIG_H
