#ifndef CONFIG_H
#define CONFIG_H

// ============================================
// DRIVER: Cocina Display
// ============================================
// Board:   Guition JC8012P4A1
// SoC:     ESP32-P4 (main) + ESP32-C6 (WiFi/BLE via SDIO)
// Display: JD9365 MIPI-DSI 800×1280 (2 lanes)
// Touch:   GSL3680 I2C (capacitivo, necesita firmware blob)
// Audio:   ES8311 + NS4150B (no usado en cocina-display)
// ============================================

// --- Driver identity ---
#define DRIVER_TYPE             "cocina-display"
#define FIRMWARE_VERSION        "1.3.0"

// --- Display (JD9365 via MIPI-DSI) ---
#define DISPLAY_WIDTH           800
#define DISPLAY_HEIGHT          1280
#define DISPLAY_ROTATION        0

// MIPI-DSI bus
#define MIPI_DSI_NUM_DATA_LANES 2
#define MIPI_DSI_LANE_BITRATE   1000    // Mbps por lane
#define MIPI_DPI_CLK_MHZ        60      // DPI pixel clock

// MIPI-DSI video timing (JD9365 — del demo oficial Guition)
#define MIPI_HSYNC_BACK_PORCH   20
#define MIPI_HSYNC_PULSE_WIDTH  20
#define MIPI_HSYNC_FRONT_PORCH  40
#define MIPI_VSYNC_BACK_PORCH   4
#define MIPI_VSYNC_PULSE_WIDTH  8
#define MIPI_VSYNC_FRONT_PORCH  20

// LCD Reset
#define LCD_RST_PIN             27

// --- Backlight (PWM) ---
#define BACKLIGHT_PIN           23
#define BACKLIGHT_BRIGHTNESS    255
#define BACKLIGHT_DIM_AFTER_MS  0
#define BACKLIGHT_LEDC_CHANNEL  0
#define BACKLIGHT_LEDC_FREQ     5000

// --- Touch (GSL3680 via I2C) ---
#define TOUCH_SDA               7
#define TOUCH_SCL               8
#define TOUCH_INT               21
#define TOUCH_RST               22
#define TOUCH_I2C_ADDR          0x40

// --- ESP32-C6 WiFi coprocessor (SDIO, manejado por framework) ---
#define C6_RESET_PIN            54

// --- LED (no hay LED en JC8012P4A1) ---
#define LED_PIN                 -1

// --- Status interval ---
#define STATUS_INTERVAL_MS      60000

#endif // CONFIG_H
