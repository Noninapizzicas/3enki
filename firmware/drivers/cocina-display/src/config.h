#ifndef CONFIG_H
#define CONFIG_H

// Board: Guition JC8012P4A1
// SoC:   ESP32-P4 (main) + ESP32-C6 (WiFi via SDIO/ESP-Hosted)
// Panel: JD9365 MIPI-DSI 800×1280  Touch: GT911 I2C

#define DRIVER_TYPE      "cocina-display"
#define FIRMWARE_VERSION "2.0.0"

// Display
#define DISPLAY_WIDTH   800
#define DISPLAY_HEIGHT  1280
#define DISPLAY_ROTATION 0

// MIPI-DSI
#define MIPI_DSI_NUM_DATA_LANES  2
#define MIPI_DSI_LANE_BITRATE    1500
#define MIPI_DPI_CLK_MHZ         80
#define MIPI_HSYNC_BACK_PORCH    20
#define MIPI_HSYNC_PULSE_WIDTH   20
#define MIPI_HSYNC_FRONT_PORCH   40
#define MIPI_VSYNC_BACK_PORCH    12
#define MIPI_VSYNC_PULSE_WIDTH   4
#define MIPI_VSYNC_FRONT_PORCH   30
#define MIPI_DSI_PHY_LDO_CHAN    3
#define MIPI_DSI_PHY_LDO_VOLTAGE_MV 2500

// LCD Reset
#define LCD_RST_PIN  27

// Backlight
#define BACKLIGHT_PIN          23
#define BACKLIGHT_BRIGHTNESS   255
#define BACKLIGHT_LEDC_CHANNEL 0
#define BACKLIGHT_LEDC_FREQ    5000

// Touch GT911 I2C
#define TOUCH_SDA      7
#define TOUCH_SCL      8
#define TOUCH_INT      21
#define TOUCH_RST      22
#define TOUCH_I2C_ADDR 0x14   // GT911: 0x14 (INT low at reset) or 0x5D

// ESP32-C6 WiFi coprocessor
#define C6_RESET_PIN   54

// No LED on JC8012P4A1
#define LED_PIN  -1

// Intervalos
#define STATUS_INTERVAL_MS  60000
#define WIFI_MAX_NETWORKS   3

#endif // CONFIG_H
