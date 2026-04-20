/**
 * display_driver.cpp — Guition JC8012P4A1
 *
 * ILI9881C (MIPI-DSI) + GT911 (I2C touch via Wire)
 *
 * Usa las APIs base de esp_lcd (sin componentes IDF externos).
 * El init del ILI9881C se envía como comandos DBI raw.
 * El GT911 se lee via Arduino Wire.
 */

#include "display_driver.h"
#include <Wire.h>
#include <esp_lcd_panel_ops.h>
#include <esp_lcd_mipi_dsi.h>
#include <esp_lcd_panel_io.h>
#include <driver/ledc.h>
#include <esp_heap_caps.h>

// ─── Handles ─────────────────────────────────────────────────────────────────

static esp_lcd_panel_handle_t    _panel   = nullptr;
static esp_lcd_panel_io_handle_t _dbi_io  = nullptr;
static esp_lcd_dsi_bus_handle_t  _dsi_bus = nullptr;
static lv_display_t*             _lv_disp = nullptr;
static lv_indev_t*               _lv_indev = nullptr;
static bool                      _hw_ready = false;
static bool                      _touch_ok = false;

static void* _buf1 = nullptr;
static void* _buf2 = nullptr;

// ─── Backlight (LEDC PWM) ────────────────────────────────────────────────────

static void _backlight_init() {
    if (BACKLIGHT_PIN < 0) return;

    ledc_timer_config_t timer_conf = {};
    timer_conf.speed_mode      = LEDC_LOW_SPEED_MODE;
    timer_conf.timer_num       = LEDC_TIMER_0;
    timer_conf.duty_resolution = LEDC_TIMER_8_BIT;
    timer_conf.freq_hz         = BACKLIGHT_LEDC_FREQ;
    timer_conf.clk_cfg         = LEDC_AUTO_CLK;
    ledc_timer_config(&timer_conf);

    ledc_channel_config_t ch_conf = {};
    ch_conf.speed_mode = LEDC_LOW_SPEED_MODE;
    ch_conf.channel    = (ledc_channel_t)BACKLIGHT_LEDC_CHANNEL;
    ch_conf.timer_sel  = LEDC_TIMER_0;
    ch_conf.gpio_num   = BACKLIGHT_PIN;
    ch_conf.duty       = 0;
    ch_conf.hpoint     = 0;
    ledc_channel_config(&ch_conf);
}

void display_set_backlight(uint8_t brightness) {
    if (BACKLIGHT_PIN < 0) return;
    ledc_set_duty(LEDC_LOW_SPEED_MODE, (ledc_channel_t)BACKLIGHT_LEDC_CHANNEL, brightness);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, (ledc_channel_t)BACKLIGHT_LEDC_CHANNEL);
}

// ─── ILI9881C init commands (raw DBI) ────────────────────────────────────────

static void _dbi_cmd(uint8_t cmd, const uint8_t* data, size_t len) {
    esp_lcd_panel_io_tx_param(_dbi_io, cmd, data, len);
}

static void _ili9881c_init() {
    // CMD2 Page 3 — panel settings
    _dbi_cmd(0xFF, (const uint8_t[]){0x98, 0x81, 0x03}, 3);
    _dbi_cmd(0x01, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x02, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x03, (const uint8_t[]){0x53}, 1);
    _dbi_cmd(0x04, (const uint8_t[]){0x53}, 1);
    _dbi_cmd(0x05, (const uint8_t[]){0x13}, 1);
    _dbi_cmd(0x06, (const uint8_t[]){0x04}, 1);
    _dbi_cmd(0x07, (const uint8_t[]){0x02}, 1);
    _dbi_cmd(0x08, (const uint8_t[]){0x02}, 1);
    _dbi_cmd(0x09, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x0A, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x0B, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x0C, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x0D, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x0E, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x0F, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x10, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x11, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x12, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x13, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x14, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x15, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x16, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x17, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x18, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x19, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x1A, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x1B, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x1C, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x1D, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x1E, (const uint8_t[]){0xC0}, 1);
    _dbi_cmd(0x1F, (const uint8_t[]){0x80}, 1);
    _dbi_cmd(0x20, (const uint8_t[]){0x04}, 1);
    _dbi_cmd(0x21, (const uint8_t[]){0x0B}, 1);
    _dbi_cmd(0x22, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x23, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x24, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x25, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x26, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x27, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x28, (const uint8_t[]){0x33}, 1);
    _dbi_cmd(0x29, (const uint8_t[]){0x03}, 1);
    _dbi_cmd(0x2A, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x2B, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x2C, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x2D, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x2E, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x2F, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x30, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x31, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x32, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x33, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x34, (const uint8_t[]){0x04}, 1);
    _dbi_cmd(0x35, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x36, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x37, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x38, (const uint8_t[]){0x01}, 1);
    _dbi_cmd(0x39, (const uint8_t[]){0x01}, 1);
    _dbi_cmd(0x3A, (const uint8_t[]){0x40}, 1);
    _dbi_cmd(0x3B, (const uint8_t[]){0x40}, 1);
    _dbi_cmd(0x3C, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x3D, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x3E, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x3F, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x40, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x41, (const uint8_t[]){0x88}, 1);
    _dbi_cmd(0x42, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x43, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x44, (const uint8_t[]){0x00}, 1);

    // CMD2 Page 4 — gamma
    _dbi_cmd(0xFF, (const uint8_t[]){0x98, 0x81, 0x04}, 3);
    _dbi_cmd(0x6C, (const uint8_t[]){0x15}, 1);
    _dbi_cmd(0x6E, (const uint8_t[]){0x2A}, 1);
    _dbi_cmd(0x6F, (const uint8_t[]){0x33}, 1);
    _dbi_cmd(0x8D, (const uint8_t[]){0x1B}, 1);
    _dbi_cmd(0x87, (const uint8_t[]){0xBA}, 1);
    _dbi_cmd(0x26, (const uint8_t[]){0x76}, 1);
    _dbi_cmd(0xB2, (const uint8_t[]){0xD1}, 1);

    // CMD2 Page 1 — power
    _dbi_cmd(0xFF, (const uint8_t[]){0x98, 0x81, 0x01}, 3);
    _dbi_cmd(0x22, (const uint8_t[]){0x0A}, 1);
    _dbi_cmd(0x31, (const uint8_t[]){0x00}, 1);
    _dbi_cmd(0x53, (const uint8_t[]){0x78}, 1);
    _dbi_cmd(0x55, (const uint8_t[]){0x78}, 1);
    _dbi_cmd(0x50, (const uint8_t[]){0xA8}, 1);
    _dbi_cmd(0x51, (const uint8_t[]){0xA8}, 1);
    _dbi_cmd(0x60, (const uint8_t[]){0x14}, 1);
    _dbi_cmd(0xA0, (const uint8_t[]){0x08}, 1);
    _dbi_cmd(0xA1, (const uint8_t[]){0x1A}, 1);
    _dbi_cmd(0xA2, (const uint8_t[]){0x27}, 1);
    _dbi_cmd(0xA3, (const uint8_t[]){0x15}, 1);
    _dbi_cmd(0xA4, (const uint8_t[]){0x17}, 1);
    _dbi_cmd(0xA5, (const uint8_t[]){0x2A}, 1);
    _dbi_cmd(0xA6, (const uint8_t[]){0x1E}, 1);
    _dbi_cmd(0xA7, (const uint8_t[]){0x1F}, 1);
    _dbi_cmd(0xA8, (const uint8_t[]){0x8B}, 1);
    _dbi_cmd(0xA9, (const uint8_t[]){0x1B}, 1);
    _dbi_cmd(0xAA, (const uint8_t[]){0x27}, 1);
    _dbi_cmd(0xAB, (const uint8_t[]){0x78}, 1);
    _dbi_cmd(0xAC, (const uint8_t[]){0x18}, 1);
    _dbi_cmd(0xAD, (const uint8_t[]){0x18}, 1);
    _dbi_cmd(0xAE, (const uint8_t[]){0x4C}, 1);
    _dbi_cmd(0xAF, (const uint8_t[]){0x21}, 1);
    _dbi_cmd(0xB0, (const uint8_t[]){0x27}, 1);
    _dbi_cmd(0xB1, (const uint8_t[]){0x54}, 1);
    _dbi_cmd(0xB2, (const uint8_t[]){0x67}, 1);
    _dbi_cmd(0xB3, (const uint8_t[]){0x39}, 1);
    _dbi_cmd(0xC0, (const uint8_t[]){0x08}, 1);
    _dbi_cmd(0xC1, (const uint8_t[]){0x1A}, 1);
    _dbi_cmd(0xC2, (const uint8_t[]){0x27}, 1);
    _dbi_cmd(0xC3, (const uint8_t[]){0x15}, 1);
    _dbi_cmd(0xC4, (const uint8_t[]){0x17}, 1);
    _dbi_cmd(0xC5, (const uint8_t[]){0x2A}, 1);
    _dbi_cmd(0xC6, (const uint8_t[]){0x1E}, 1);
    _dbi_cmd(0xC7, (const uint8_t[]){0x1F}, 1);
    _dbi_cmd(0xC8, (const uint8_t[]){0x8B}, 1);
    _dbi_cmd(0xC9, (const uint8_t[]){0x1B}, 1);
    _dbi_cmd(0xCA, (const uint8_t[]){0x27}, 1);
    _dbi_cmd(0xCB, (const uint8_t[]){0x78}, 1);
    _dbi_cmd(0xCC, (const uint8_t[]){0x18}, 1);
    _dbi_cmd(0xCD, (const uint8_t[]){0x18}, 1);
    _dbi_cmd(0xCE, (const uint8_t[]){0x4C}, 1);
    _dbi_cmd(0xCF, (const uint8_t[]){0x21}, 1);
    _dbi_cmd(0xD0, (const uint8_t[]){0x27}, 1);
    _dbi_cmd(0xD1, (const uint8_t[]){0x54}, 1);
    _dbi_cmd(0xD2, (const uint8_t[]){0x67}, 1);
    _dbi_cmd(0xD3, (const uint8_t[]){0x39}, 1);

    // CMD2 Page 0 — normal mode
    _dbi_cmd(0xFF, (const uint8_t[]){0x98, 0x81, 0x00}, 3);
    _dbi_cmd(0x35, (const uint8_t[]){0x00}, 1);  // TE on

    // Sleep Out
    _dbi_cmd(0x11, nullptr, 0);
    delay(120);

    // Display On
    _dbi_cmd(0x29, nullptr, 0);
    delay(20);
}

// ─── MIPI-DSI + DPI panel ────────────────────────────────────────────────────

static bool _init_panel() {
    // 1. MIPI-DSI bus
    esp_lcd_dsi_bus_config_t bus_cfg = {};
    bus_cfg.bus_id             = 0;
    bus_cfg.num_data_lanes     = MIPI_DSI_NUM_DATA_LANES;
    bus_cfg.phy_clk_src        = MIPI_DSI_PHY_CLK_SRC_DEFAULT;
    bus_cfg.lane_bit_rate_mbps = MIPI_DSI_LANE_BITRATE;

    esp_err_t ret = esp_lcd_new_dsi_bus(&bus_cfg, &_dsi_bus);
    if (ret != ESP_OK) {
        Serial.printf("[DISPLAY] MIPI-DSI bus error: 0x%x\n", ret);
        return false;
    }

    // 2. DBI command interface
    esp_lcd_dbi_io_config_t dbi_cfg = {};
    dbi_cfg.virtual_channel = 0;
    dbi_cfg.lcd_cmd_bits    = 8;
    dbi_cfg.lcd_param_bits  = 8;

    ret = esp_lcd_new_panel_io_dbi(_dsi_bus, &dbi_cfg, &_dbi_io);
    if (ret != ESP_OK) {
        Serial.printf("[DISPLAY] DBI IO error: 0x%x\n", ret);
        return false;
    }

    // 3. Send ILI9881C vendor init sequence
    _ili9881c_init();
    Serial.println("[DISPLAY] ILI9881C init commands sent");

    // 4. DPI video panel
    esp_lcd_dpi_panel_config_t dpi_cfg = {};
    dpi_cfg.virtual_channel          = 0;
    dpi_cfg.dpi_clk_src              = MIPI_DSI_DPI_CLK_SRC_DEFAULT;
    dpi_cfg.dpi_clock_freq_mhz       = MIPI_DPI_CLK_MHZ;
    dpi_cfg.pixel_format             = LCD_COLOR_PIXEL_FORMAT_RGB565;
    dpi_cfg.num_fbs                  = 1;
    dpi_cfg.video_timing.h_size            = DISPLAY_WIDTH;
    dpi_cfg.video_timing.v_size            = DISPLAY_HEIGHT;
    dpi_cfg.video_timing.hsync_back_porch  = MIPI_HSYNC_BACK_PORCH;
    dpi_cfg.video_timing.hsync_pulse_width = MIPI_HSYNC_PULSE_WIDTH;
    dpi_cfg.video_timing.hsync_front_porch = MIPI_HSYNC_FRONT_PORCH;
    dpi_cfg.video_timing.vsync_back_porch  = MIPI_VSYNC_BACK_PORCH;
    dpi_cfg.video_timing.vsync_pulse_width = MIPI_VSYNC_PULSE_WIDTH;
    dpi_cfg.video_timing.vsync_front_porch = MIPI_VSYNC_FRONT_PORCH;

    ret = esp_lcd_new_panel_dpi(_dsi_bus, &dpi_cfg, &_panel);
    if (ret != ESP_OK) {
        Serial.printf("[DISPLAY] DPI panel error: 0x%x\n", ret);
        return false;
    }

    esp_lcd_panel_init(_panel);

    Serial.printf("[DISPLAY] ILI9881C OK — %dx%d MIPI-DSI %d lanes\n",
        DISPLAY_WIDTH, DISPLAY_HEIGHT, MIPI_DSI_NUM_DATA_LANES);
    return true;
}

// ─── GT911 touch (via Arduino Wire) ──────────────────────────────────────────

static bool _gt911_read_reg(uint16_t reg, uint8_t* buf, size_t len) {
    Wire.beginTransmission(TOUCH_I2C_ADDR);
    Wire.write((uint8_t)(reg >> 8));
    Wire.write((uint8_t)(reg & 0xFF));
    if (Wire.endTransmission() != 0) return false;
    size_t got = Wire.requestFrom((uint8_t)TOUCH_I2C_ADDR, (uint8_t)len);
    for (size_t i = 0; i < got && i < len; i++) {
        buf[i] = Wire.read();
    }
    return got == len;
}

static void _gt911_write_reg(uint16_t reg, uint8_t val) {
    Wire.beginTransmission(TOUCH_I2C_ADDR);
    Wire.write((uint8_t)(reg >> 8));
    Wire.write((uint8_t)(reg & 0xFF));
    Wire.write(val);
    Wire.endTransmission();
}

static bool _init_touch() {
    Wire.begin(TOUCH_SDA, TOUCH_SCL, 400000);

    // Check GT911 product ID (register 0x8140, expect "911\0")
    uint8_t id[4] = {};
    if (!_gt911_read_reg(0x8140, id, 4)) {
        Serial.println("[TOUCH] GT911 no responde");
        return false;
    }

    Serial.printf("[TOUCH] GT911 ID: %c%c%c%c — SDA=%d SCL=%d\n",
        id[0], id[1], id[2], id[3], TOUCH_SDA, TOUCH_SCL);
    return (id[0] == '9' && id[1] == '1' && id[2] == '1');
}

static bool _gt911_touch_pressed = false;
static int16_t _gt911_x = 0, _gt911_y = 0;

static void _gt911_poll() {
    _gt911_touch_pressed = false;

    uint8_t status = 0;
    if (!_gt911_read_reg(0x814E, &status, 1)) return;

    uint8_t points = status & 0x0F;
    bool ready = status & 0x80;

    if (ready && points > 0) {
        uint8_t data[4];
        if (_gt911_read_reg(0x8150, data, 4)) {
            _gt911_x = (int16_t)(data[0] | (data[1] << 8));
            _gt911_y = (int16_t)(data[2] | (data[3] << 8));
            _gt911_touch_pressed = true;
        }
    }

    // Clear status
    if (ready) _gt911_write_reg(0x814E, 0);
}

// ─── LVGL callbacks ──────────────────────────────────────────────────────────

static void _flush_cb(lv_display_t* disp, const lv_area_t* area, uint8_t* px_map) {
    if (_panel) {
        esp_lcd_panel_draw_bitmap(_panel,
            area->x1, area->y1,
            area->x2 + 1, area->y2 + 1,
            px_map);
    }
    lv_display_flush_ready(disp);
}

static void _touch_read_cb(lv_indev_t* indev, lv_indev_data_t* data) {
    if (!_touch_ok) {
        data->state = LV_INDEV_STATE_RELEASED;
        return;
    }

    _gt911_poll();

    if (_gt911_touch_pressed) {
        data->point.x = _gt911_x;
        data->point.y = _gt911_y;
        data->state   = LV_INDEV_STATE_PRESSED;
    } else {
        data->state   = LV_INDEV_STATE_RELEASED;
    }
}

// ─── API pública ─────────────────────────────────────────────────────────────

bool display_driver_init() {
    Serial.println("[DISPLAY] Init Guition JC8012P4A1...");

    // 1. LVGL
    lv_init();
    lv_tick_set_cb([]() -> uint32_t { return (uint32_t)millis(); });

    // 2. Backlight off
    _backlight_init();
    display_set_backlight(0);

    // 3. Panel MIPI-DSI + ILI9881C init
    bool panelOk = _init_panel();

    // 4. Touch GT911
    _touch_ok = _init_touch();

    // 5. Buffers LVGL en PSRAM
    const size_t buf_size = DISPLAY_WIDTH * (DISPLAY_HEIGHT / 10) * sizeof(lv_color_t);
    _buf1 = heap_caps_malloc(buf_size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    _buf2 = heap_caps_malloc(buf_size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);

    if (!_buf1) {
        Serial.printf("[DISPLAY] Sin PSRAM para buffers (%d KB)\n", (int)(buf_size / 1024));
        return false;
    }

    // 6. LVGL display
    _lv_disp = lv_display_create(DISPLAY_WIDTH, DISPLAY_HEIGHT);
    lv_display_set_flush_cb(_lv_disp, _flush_cb);
    lv_display_set_buffers(_lv_disp, _buf1, _buf2, buf_size,
        LV_DISPLAY_RENDER_MODE_PARTIAL);

    // 7. LVGL touch indev
    _lv_indev = lv_indev_create();
    lv_indev_set_type(_lv_indev, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(_lv_indev, _touch_read_cb);

    // 8. Backlight on si panel OK
    if (panelOk) {
        display_set_backlight(BACKLIGHT_BRIGHTNESS);
    }

    _hw_ready = panelOk;
    Serial.printf("[DISPLAY] LVGL %d.%d — panel=%s touch=%s — %d KB buf\n",
        LVGL_VERSION_MAJOR, LVGL_VERSION_MINOR,
        panelOk ? "OK" : "FAIL", _touch_ok ? "OK" : "FAIL",
        (int)(buf_size * 2 / 1024));

    return true;
}

void display_driver_tick() {
    // Touch polling happens inside LVGL callback
}
