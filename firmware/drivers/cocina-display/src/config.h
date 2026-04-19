#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// DRIVER: Cocina Display
// ============================================
// Board:   Guition JC8012P4A1
// SoC:     ESP32-P4 (main) + ESP32-C6 (WiFi/BLE)
// Display: ILI9881C MIPI-DSI 800×1280 (4 lanes)
// Touch:   GT911 I2C (capacitivo)
// ============================================

// --- Driver identity ---
#define DRIVER_TYPE             "cocina-display"
#define FIRMWARE_VERSION        "1.1.0"

// --- Display (ILI9881C via MIPI-DSI) ---
#define DISPLAY_WIDTH           800
#define DISPLAY_HEIGHT          1280
#define DISPLAY_ROTATION        0       // 0=portrait, 1=landscape

// MIPI-DSI bus
#define MIPI_DSI_NUM_DATA_LANES 2
#define MIPI_DSI_LANE_BITRATE   1000    // Mbps por lane
#define MIPI_DPI_CLK_MHZ        80      // DPI pixel clock

// MIPI-DSI video timing (ILI9881C típico para 800×1280)
#define MIPI_HSYNC_BACK_PORCH   40
#define MIPI_HSYNC_PULSE_WIDTH  4
#define MIPI_HSYNC_FRONT_PORCH  40
#define MIPI_VSYNC_BACK_PORCH   16
#define MIPI_VSYNC_PULSE_WIDTH  4
#define MIPI_VSYNC_FRONT_PORCH  16

// --- Backlight (PWM) ---
#define BACKLIGHT_PIN           26      // Guition JC8012P4A1 backlight GPIO
#define BACKLIGHT_BRIGHTNESS    255     // 0-255
#define BACKLIGHT_DIM_AFTER_MS  0       // 0 = no atenuar, N = ms inactividad
#define BACKLIGHT_LEDC_CHANNEL  0
#define BACKLIGHT_LEDC_FREQ     5000    // Hz

// --- Touch (GT911 via I2C) ---
#define TOUCH_SDA               8
#define TOUCH_SCL               9
#define TOUCH_INT               3
#define TOUCH_RST               -1      // -1 si no hay RST dedicado
#define TOUCH_I2C_ADDR          0x5D    // GT911: 0x5D o 0x14

// --- LED (no hay LED en JC8012P4A1) ---
#define LED_PIN                 -1

// --- Status interval ---
#define STATUS_INTERVAL_MS      60000   // cada 60s

#endif // CONFIG_H
