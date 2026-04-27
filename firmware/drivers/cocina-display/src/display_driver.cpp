// display_driver.cpp — Guition JC8012P4A1
// JD9365 MIPI-DSI + GT911 touch + LVGL

#include "display_driver.h"
#include <esp_lcd_panel_ops.h>
#include <esp_lcd_mipi_dsi.h>
#include <esp_lcd_panel_io.h>
#include <esp_ldo_regulator.h>
#include <driver/ledc.h>
#include <driver/gpio.h>
#include <driver/i2c.h>
#include <Wire.h>
#include <esp_heap_caps.h>

// ─── Handles ─────────────────────────────────────────────────────────────────

static esp_lcd_panel_handle_t    _panel   = nullptr;
static esp_lcd_panel_io_handle_t _dbi_io  = nullptr;
static esp_lcd_dsi_bus_handle_t  _dsi_bus = nullptr;
static esp_ldo_channel_handle_t  _ldo_phy = nullptr;
static lv_display_t*             _lv_disp = nullptr;
static lv_indev_t*               _indev   = nullptr;

static void* _buf1 = nullptr;
static void* _buf2 = nullptr;

// ─── Backlight ───────────────────────────────────────────────────────────────

static void _backlight_init() {
    if (BACKLIGHT_PIN < 0) return;
    ledc_timer_config_t t = {};
    t.speed_mode     = LEDC_LOW_SPEED_MODE;
    t.timer_num      = LEDC_TIMER_0;
    t.duty_resolution = LEDC_TIMER_8_BIT;
    t.freq_hz        = BACKLIGHT_LEDC_FREQ;
    t.clk_cfg        = LEDC_AUTO_CLK;
    ledc_timer_config(&t);
    ledc_channel_config_t c = {};
    c.speed_mode = LEDC_LOW_SPEED_MODE;
    c.channel    = (ledc_channel_t)BACKLIGHT_LEDC_CHANNEL;
    c.timer_sel  = LEDC_TIMER_0;
    c.gpio_num   = BACKLIGHT_PIN;
    c.duty       = 0;
    ledc_channel_config(&c);
}

void display_set_backlight(uint8_t brightness) {
    if (BACKLIGHT_PIN < 0) return;
    ledc_set_duty(LEDC_LOW_SPEED_MODE, (ledc_channel_t)BACKLIGHT_LEDC_CHANNEL, brightness);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, (ledc_channel_t)BACKLIGHT_LEDC_CHANNEL);
}

// ─── LCD reset ───────────────────────────────────────────────────────────────

static void _lcd_reset() {
    if (LCD_RST_PIN < 0) return;
    gpio_set_direction((gpio_num_t)LCD_RST_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level((gpio_num_t)LCD_RST_PIN, 1); delay(5);
    gpio_set_level((gpio_num_t)LCD_RST_PIN, 0); delay(10);
    gpio_set_level((gpio_num_t)LCD_RST_PIN, 1); delay(120);
}

// ─── MIPI DSI PHY power ───────────────────────────────────────────────────────

static bool _enable_dsi_phy() {
    esp_ldo_channel_config_t cfg = {};
    cfg.chan_id    = MIPI_DSI_PHY_LDO_CHAN;
    cfg.voltage_mv = MIPI_DSI_PHY_LDO_VOLTAGE_MV;
    return esp_ldo_acquire_channel(&cfg, &_ldo_phy) == ESP_OK;
}

// ─── JD9365 init commands ────────────────────────────────────────────────────

static void _cmd(uint8_t c, uint8_t d)  { esp_lcd_panel_io_tx_param(_dbi_io, c, &d, 1); }
static void _cmd0(uint8_t c)            { esp_lcd_panel_io_tx_param(_dbi_io, c, nullptr, 0); }

static void _jd9365_init() {
    _cmd(0xE0,0x00); _cmd(0xE1,0x93); _cmd(0xE2,0x65); _cmd(0xE3,0xF8);
    _cmd(0xE0,0x01);
    _cmd(0x00,0x00); _cmd(0x01,0x4E); _cmd(0x03,0x00); _cmd(0x04,0x65);
    _cmd(0x0C,0x74); _cmd(0x17,0x00); _cmd(0x18,0xB7); _cmd(0x19,0x00);
    _cmd(0x1A,0x00); _cmd(0x1B,0xB7); _cmd(0x1C,0x00); _cmd(0x24,0xFE);
    _cmd(0x37,0x19); _cmd(0x38,0x05); _cmd(0x39,0x00); _cmd(0x3A,0x01);
    _cmd(0x3B,0x01); _cmd(0x3C,0x70); _cmd(0x3D,0xFF); _cmd(0x3E,0xFF);
    _cmd(0x3F,0xFF); _cmd(0x40,0x06); _cmd(0x41,0xA0); _cmd(0x43,0x1E);
    _cmd(0x44,0x0F); _cmd(0x45,0x28); _cmd(0x4B,0x04); _cmd(0x55,0x02);
    _cmd(0x56,0x01); _cmd(0x57,0xA9); _cmd(0x58,0x0A); _cmd(0x59,0x0A);
    _cmd(0x5A,0x37); _cmd(0x5B,0x19);
    _cmd(0x5D,0x78); _cmd(0x5E,0x63); _cmd(0x5F,0x54); _cmd(0x60,0x49);
    _cmd(0x61,0x45); _cmd(0x62,0x38); _cmd(0x63,0x3D); _cmd(0x64,0x28);
    _cmd(0x65,0x43); _cmd(0x66,0x41); _cmd(0x67,0x43); _cmd(0x68,0x62);
    _cmd(0x69,0x50); _cmd(0x6A,0x57); _cmd(0x6B,0x49); _cmd(0x6C,0x44);
    _cmd(0x6D,0x37); _cmd(0x6E,0x23); _cmd(0x6F,0x10);
    _cmd(0x70,0x78); _cmd(0x71,0x63); _cmd(0x72,0x54); _cmd(0x73,0x49);
    _cmd(0x74,0x45); _cmd(0x75,0x38); _cmd(0x76,0x3D); _cmd(0x77,0x28);
    _cmd(0x78,0x43); _cmd(0x79,0x41); _cmd(0x7A,0x43); _cmd(0x7B,0x62);
    _cmd(0x7C,0x50); _cmd(0x7D,0x57); _cmd(0x7E,0x49); _cmd(0x7F,0x44);
    _cmd(0x80,0x37); _cmd(0x81,0x23); _cmd(0x82,0x10);
    _cmd(0xE0,0x02);
    _cmd(0x00,0x47); _cmd(0x01,0x47); _cmd(0x02,0x45); _cmd(0x03,0x45);
    _cmd(0x04,0x4B); _cmd(0x05,0x4B); _cmd(0x06,0x49); _cmd(0x07,0x49);
    _cmd(0x08,0x41); _cmd(0x09,0x1F); _cmd(0x0A,0x1F); _cmd(0x0B,0x1F);
    _cmd(0x0C,0x1F); _cmd(0x0D,0x1F); _cmd(0x0E,0x1F); _cmd(0x0F,0x5F);
    _cmd(0x10,0x5F); _cmd(0x11,0x57); _cmd(0x12,0x77); _cmd(0x13,0x35);
    _cmd(0x14,0x1F); _cmd(0x15,0x1F);
    _cmd(0x16,0x46); _cmd(0x17,0x46); _cmd(0x18,0x44); _cmd(0x19,0x44);
    _cmd(0x1A,0x4A); _cmd(0x1B,0x4A); _cmd(0x1C,0x48); _cmd(0x1D,0x48);
    _cmd(0x1E,0x40); _cmd(0x1F,0x1F); _cmd(0x20,0x1F); _cmd(0x21,0x1F);
    _cmd(0x22,0x1F); _cmd(0x23,0x1F); _cmd(0x24,0x1F); _cmd(0x25,0x5F);
    _cmd(0x26,0x5F); _cmd(0x27,0x57); _cmd(0x28,0x77); _cmd(0x29,0x35);
    _cmd(0x2A,0x1F); _cmd(0x2B,0x1F);
    _cmd(0x58,0x40); _cmd(0x59,0x00); _cmd(0x5A,0x00); _cmd(0x5B,0x10);
    _cmd(0x5C,0x06); _cmd(0x5D,0x40); _cmd(0x5E,0x01); _cmd(0x5F,0x02);
    _cmd(0x60,0x30); _cmd(0x61,0x01); _cmd(0x62,0x02); _cmd(0x63,0x03);
    _cmd(0x64,0x6B); _cmd(0x65,0x05); _cmd(0x66,0x0C); _cmd(0x67,0x73);
    _cmd(0x68,0x09); _cmd(0x69,0x03); _cmd(0x6A,0x56); _cmd(0x6B,0x08);
    _cmd(0x6C,0x00); _cmd(0x6D,0x04); _cmd(0x6E,0x04); _cmd(0x6F,0x88);
    _cmd(0x70,0x00); _cmd(0x71,0x00); _cmd(0x72,0x06); _cmd(0x73,0x7B);
    _cmd(0x74,0x00); _cmd(0x75,0xF8); _cmd(0x76,0x00); _cmd(0x77,0xD5);
    _cmd(0x78,0x2E); _cmd(0x79,0x12); _cmd(0x7A,0x03); _cmd(0x7B,0x00);
    _cmd(0x7C,0x00); _cmd(0x7D,0x03); _cmd(0x7E,0x7B);
    _cmd(0xE0,0x04);
    _cmd(0x00,0x0E); _cmd(0x02,0xB3); _cmd(0x09,0x60); _cmd(0x0E,0x2A); _cmd(0x36,0x59);
    _cmd(0xE0,0x00);
    _cmd(0x3A,0x55);  // RGB565
    _cmd(0x80,0x01);  // 2-lane DSI
    _cmd0(0x11); delay(120);
    _cmd0(0x29); delay(20);
    _cmd(0x35,0x00);
    Serial.println("[DISP] JD9365 OK");
}

// ─── Panel init ──────────────────────────────────────────────────────────────

static bool _init_panel() {
    if (!_enable_dsi_phy()) { Serial.println("[DISP] LDO PHY fail"); return false; }
    _lcd_reset();

    esp_lcd_dsi_bus_config_t bc = {};
    bc.bus_id             = 0;
    bc.num_data_lanes     = MIPI_DSI_NUM_DATA_LANES;
    bc.phy_clk_src        = MIPI_DSI_PHY_CLK_SRC_DEFAULT;
    bc.lane_bit_rate_mbps = MIPI_DSI_LANE_BITRATE;
    if (esp_lcd_new_dsi_bus(&bc, &_dsi_bus) != ESP_OK) { Serial.println("[DISP] DSI bus fail"); return false; }

    esp_lcd_dbi_io_config_t dc = {};
    dc.virtual_channel  = 0;
    dc.lcd_cmd_bits     = 8;
    dc.lcd_param_bits   = 8;
    if (esp_lcd_new_panel_io_dbi(_dsi_bus, &dc, &_dbi_io) != ESP_OK) return false;

    _jd9365_init();

    esp_lcd_dpi_panel_config_t dpi = {};
    dpi.virtual_channel                  = 0;
    dpi.dpi_clk_src                      = MIPI_DSI_DPI_CLK_SRC_DEFAULT;
    dpi.dpi_clock_freq_mhz               = MIPI_DPI_CLK_MHZ;
    dpi.pixel_format                     = LCD_COLOR_PIXEL_FORMAT_RGB565;
    dpi.num_fbs                          = 1;
    dpi.video_timing.h_size              = DISPLAY_WIDTH;
    dpi.video_timing.v_size              = DISPLAY_HEIGHT;
    dpi.video_timing.hsync_back_porch    = MIPI_HSYNC_BACK_PORCH;
    dpi.video_timing.hsync_pulse_width   = MIPI_HSYNC_PULSE_WIDTH;
    dpi.video_timing.hsync_front_porch   = MIPI_HSYNC_FRONT_PORCH;
    dpi.video_timing.vsync_back_porch    = MIPI_VSYNC_BACK_PORCH;
    dpi.video_timing.vsync_pulse_width   = MIPI_VSYNC_PULSE_WIDTH;
    dpi.video_timing.vsync_front_porch   = MIPI_VSYNC_FRONT_PORCH;
    dpi.flags.use_dma2d                  = true;
    if (esp_lcd_new_panel_dpi(_dsi_bus, &dpi, &_panel) != ESP_OK) { Serial.println("[DISP] DPI fail"); return false; }
    esp_lcd_panel_init(_panel);
    return true;
}

// ─── GT911 touch ─────────────────────────────────────────────────────────────

#define GT911_STATUS_REG 0x814E
#define GT911_DATA_REG   0x8150

static uint8_t _touch_addr = TOUCH_I2C_ADDR;

static bool _gt911_write_reg(uint16_t reg, uint8_t val) {
    Wire.beginTransmission(_touch_addr);
    Wire.write(reg >> 8);
    Wire.write(reg & 0xFF);
    Wire.write(val);
    return Wire.endTransmission() == 0;
}

static int _gt911_read(uint16_t reg, uint8_t* buf, uint8_t len) {
    Wire.beginTransmission(_touch_addr);
    Wire.write(reg >> 8);
    Wire.write(reg & 0xFF);
    if (Wire.endTransmission(false) != 0) return -1;
    Wire.requestFrom(_touch_addr, len);
    int n = 0;
    while (Wire.available() && n < len) buf[n++] = Wire.read();
    return n;
}

static bool _touch_init() {
    gpio_set_direction((gpio_num_t)TOUCH_RST, GPIO_MODE_OUTPUT);
    gpio_set_direction((gpio_num_t)TOUCH_INT, GPIO_MODE_OUTPUT);
    gpio_set_level((gpio_num_t)TOUCH_INT, 0);
    gpio_set_level((gpio_num_t)TOUCH_RST, 0); delay(10);
    gpio_set_level((gpio_num_t)TOUCH_RST, 1); delay(100);
    gpio_set_direction((gpio_num_t)TOUCH_INT, GPIO_MODE_INPUT);

    Wire.begin(TOUCH_SDA, TOUCH_SCL);

    // I2C scan — find GT911 at 0x14 or 0x5D
    Serial.println("[TOUCH] I2C scan...");
    uint8_t candidates[] = { 0x14, 0x5D };
    bool found = false;
    for (uint8_t addr : candidates) {
        Wire.beginTransmission(addr);
        if (Wire.endTransmission() == 0) {
            Serial.printf("[TOUCH] Encontrado dispositivo en 0x%02X\n", addr);
            _touch_addr = addr;
            found = true;
            break;
        }
    }
    if (!found) {
        // Full scan for debugging
        for (uint8_t a = 1; a < 127; a++) {
            Wire.beginTransmission(a);
            if (Wire.endTransmission() == 0)
                Serial.printf("[TOUCH] I2C device @ 0x%02X\n", a);
        }
        Serial.println("[TOUCH] GT911 no detectado — touch desactivado");
        return false;
    }

    uint8_t id[4] = {};
    if (_gt911_read(0x8140, id, 4) < 4) {
        Serial.println("[TOUCH] GT911 ID read failed — touch desactivado");
        return false;
    }
    Serial.printf("[TOUCH] GT911 ID: %c%c%c%c (addr=0x%02X)\n", id[0], id[1], id[2], id[3], _touch_addr);
    return true;
}

static lv_indev_state_t _touch_last_state = LV_INDEV_STATE_RELEASED;
static int32_t          _touch_last_x = 0;
static int32_t          _touch_last_y = 0;

static void _touch_read_cb(lv_indev_t* indev, lv_indev_data_t* data) {
    uint8_t status = 0;
    _gt911_read(GT911_STATUS_REG, &status, 1);

    uint8_t n = status & 0x0F;
    if ((status & 0x80) && n > 0) {
        uint8_t pt[8] = {};
        _gt911_read(GT911_DATA_REG, pt, 8);
        _touch_last_x = (int32_t)((pt[1] << 8) | pt[0]);
        _touch_last_y = (int32_t)((pt[3] << 8) | pt[2]);
        _touch_last_state = LV_INDEV_STATE_PRESSED;
        _gt911_write_reg(GT911_STATUS_REG, 0);  // clear
    } else {
        _touch_last_state = LV_INDEV_STATE_RELEASED;
        if (status & 0x80) _gt911_write_reg(GT911_STATUS_REG, 0);
    }

    data->point.x = _touch_last_x;
    data->point.y = _touch_last_y;
    data->state   = _touch_last_state;
}

// ─── LVGL flush ──────────────────────────────────────────────────────────────

static void _flush_cb(lv_display_t* disp, const lv_area_t* area, uint8_t* px_map) {
    if (_panel)
        esp_lcd_panel_draw_bitmap(_panel, area->x1, area->y1, area->x2+1, area->y2+1, px_map);
    lv_display_flush_ready(disp);
}

// ─── Public API ──────────────────────────────────────────────────────────────

bool display_driver_init() {
    Serial.println("[DISP] Init Guition JC8012P4A1...");

    lv_init();
    lv_tick_set_cb([]() -> uint32_t { return (uint32_t)millis(); });

    _backlight_init();
    display_set_backlight(0);

    bool panel_ok = _init_panel();

    const size_t bsz = DISPLAY_WIDTH * DISPLAY_HEIGHT * sizeof(lv_color_t);
    _buf1 = heap_caps_malloc(bsz, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    _buf2 = heap_caps_malloc(bsz, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    if (!_buf1) { Serial.println("[DISP] Sin PSRAM"); return false; }

    _lv_disp = lv_display_create(DISPLAY_WIDTH, DISPLAY_HEIGHT);
    lv_display_set_flush_cb(_lv_disp, _flush_cb);
    lv_display_set_buffers(_lv_disp, _buf1, _buf2, bsz, LV_DISPLAY_RENDER_MODE_FULL);

    bool touch_ok = _touch_init();
    if (touch_ok) {
        _indev = lv_indev_create();
        lv_indev_set_type(_indev, LV_INDEV_TYPE_POINTER);
        lv_indev_set_read_cb(_indev, _touch_read_cb);
    }

    if (panel_ok) display_set_backlight(BACKLIGHT_BRIGHTNESS);

    Serial.printf("[DISP] OK — panel=%s touch=%s buf=%dKB×2\n",
        panel_ok ? "OK":"FAIL", touch_ok ? "OK":"NO", (int)(bsz/1024));
    return panel_ok;
}

static void _lvgl_task(void*) {
    for (;;) {
        lv_lock();
        uint32_t ms = lv_timer_handler();
        lv_unlock();
        vTaskDelay(pdMS_TO_TICKS(ms < 1 ? 1 : ms > 10 ? 10 : ms));
    }
}

void display_lvgl_task_start() {
    xTaskCreatePinnedToCore(_lvgl_task, "lvgl", 16384, nullptr, 5, nullptr, 0);
    Serial.println("[DISP] LVGL task → Core 0");
}
