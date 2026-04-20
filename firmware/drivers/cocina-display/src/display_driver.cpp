/**
 * display_driver.cpp — Guition JC8012P4A1
 *
 * JD9365 (MIPI-DSI 800×1280) — basado en:
 *   - espressif/esp-iot-solution: esp_lcd_jd9365.c
 *   - CelliesProjects/JC8012P4A1-LVGL
 *   - Deep-start9527/guition_product_demo
 *
 * GSL3680 touch: pendiente (necesita firmware blob, complejo).
 * Por ahora display only — touch se añade después.
 */

#include "display_driver.h"
#include <esp_lcd_panel_ops.h>
#include <esp_lcd_mipi_dsi.h>
#include <esp_lcd_panel_io.h>
#include <esp_ldo_regulator.h>
#include <driver/ledc.h>
#include <driver/gpio.h>
#include <esp_heap_caps.h>

// ─── Handles ─────────────────────────────────────────────────────────────────

static esp_lcd_panel_handle_t    _panel   = nullptr;
static esp_lcd_panel_io_handle_t _dbi_io  = nullptr;
static esp_lcd_dsi_bus_handle_t  _dsi_bus = nullptr;
static esp_ldo_channel_handle_t  _ldo_phy = nullptr;
static lv_display_t*             _lv_disp = nullptr;
static bool                      _hw_ready = false;

static void* _buf1 = nullptr;
static void* _buf2 = nullptr;

// ─── Backlight (LEDC PWM) ────────────────────────────────────────────────────

static void _backlight_init() {
    if (BACKLIGHT_PIN < 0) return;
    ledc_timer_config_t t = {};
    t.speed_mode = LEDC_LOW_SPEED_MODE;
    t.timer_num = LEDC_TIMER_0;
    t.duty_resolution = LEDC_TIMER_8_BIT;
    t.freq_hz = BACKLIGHT_LEDC_FREQ;
    t.clk_cfg = LEDC_AUTO_CLK;
    ledc_timer_config(&t);

    ledc_channel_config_t c = {};
    c.speed_mode = LEDC_LOW_SPEED_MODE;
    c.channel = (ledc_channel_t)BACKLIGHT_LEDC_CHANNEL;
    c.timer_sel = LEDC_TIMER_0;
    c.gpio_num = BACKLIGHT_PIN;
    c.duty = 0;
    ledc_channel_config(&c);
}

void display_set_backlight(uint8_t brightness) {
    if (BACKLIGHT_PIN < 0) return;
    ledc_set_duty(LEDC_LOW_SPEED_MODE, (ledc_channel_t)BACKLIGHT_LEDC_CHANNEL, brightness);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, (ledc_channel_t)BACKLIGHT_LEDC_CHANNEL);
}

// ─── LCD hardware reset ──────────────────────────────────────────────────────

static void _lcd_reset() {
    if (LCD_RST_PIN < 0) return;
    gpio_set_direction((gpio_num_t)LCD_RST_PIN, GPIO_MODE_OUTPUT);
    gpio_set_level((gpio_num_t)LCD_RST_PIN, 1);
    delay(5);
    gpio_set_level((gpio_num_t)LCD_RST_PIN, 0);
    delay(10);
    gpio_set_level((gpio_num_t)LCD_RST_PIN, 1);
    delay(120);
    Serial.println("[DISPLAY] LCD reset OK");
}

// ─── MIPI DSI PHY power (LDO) ───────────────────────────────────────────────

static bool _enable_dsi_phy_power() {
    esp_ldo_channel_config_t ldo_cfg = {};
    ldo_cfg.chan_id = MIPI_DSI_PHY_LDO_CHAN;
    ldo_cfg.voltage_mv = MIPI_DSI_PHY_LDO_VOLTAGE_MV;
    esp_err_t ret = esp_ldo_acquire_channel(&ldo_cfg, &_ldo_phy);
    if (ret != ESP_OK) {
        Serial.printf("[DISPLAY] LDO PHY error: 0x%x\n", ret);
        return false;
    }
    Serial.printf("[DISPLAY] MIPI DSI PHY LDO ch%d = %dmV OK\n",
        MIPI_DSI_PHY_LDO_CHAN, MIPI_DSI_PHY_LDO_VOLTAGE_MV);
    return true;
}

// ─── JD9365 init commands (raw DBI) ─────────────────────────────────────────

static void _cmd(uint8_t cmd, uint8_t data) {
    esp_lcd_panel_io_tx_param(_dbi_io, cmd, &data, 1);
}

static void _cmd0(uint8_t cmd) {
    esp_lcd_panel_io_tx_param(_dbi_io, cmd, nullptr, 0);
}

static void _jd9365_init() {
    // Page 0 — password
    _cmd(0xE0, 0x00);
    _cmd(0xE1, 0x93);
    _cmd(0xE2, 0x65);
    _cmd(0xE3, 0xF8);

    // Page 1 — power + VCOM
    _cmd(0xE0, 0x01);
    _cmd(0x00, 0x00);
    _cmd(0x01, 0x4E);
    _cmd(0x03, 0x00);
    _cmd(0x04, 0x65);
    _cmd(0x0C, 0x74);
    _cmd(0x17, 0x00);
    _cmd(0x18, 0xB7);
    _cmd(0x19, 0x00);
    _cmd(0x1A, 0x00);
    _cmd(0x1B, 0xB7);
    _cmd(0x1C, 0x00);
    _cmd(0x24, 0xFE);
    _cmd(0x37, 0x19);
    _cmd(0x38, 0x05);
    _cmd(0x39, 0x00);
    _cmd(0x3A, 0x01);
    _cmd(0x3B, 0x01);
    _cmd(0x3C, 0x70);
    _cmd(0x3D, 0xFF);
    _cmd(0x3E, 0xFF);
    _cmd(0x3F, 0xFF);
    _cmd(0x40, 0x06);
    _cmd(0x41, 0xA0);
    _cmd(0x43, 0x1E);
    _cmd(0x44, 0x0F);
    _cmd(0x45, 0x28);
    _cmd(0x4B, 0x04);
    _cmd(0x55, 0x02);
    _cmd(0x56, 0x01);
    _cmd(0x57, 0xA9);
    _cmd(0x58, 0x0A);
    _cmd(0x59, 0x0A);
    _cmd(0x5A, 0x37);
    _cmd(0x5B, 0x19);

    // Gamma positive
    _cmd(0x5D, 0x78); _cmd(0x5E, 0x63); _cmd(0x5F, 0x54);
    _cmd(0x60, 0x49); _cmd(0x61, 0x45); _cmd(0x62, 0x38);
    _cmd(0x63, 0x3D); _cmd(0x64, 0x28); _cmd(0x65, 0x43);
    _cmd(0x66, 0x41); _cmd(0x67, 0x43); _cmd(0x68, 0x62);
    _cmd(0x69, 0x50); _cmd(0x6A, 0x57); _cmd(0x6B, 0x49);
    _cmd(0x6C, 0x44); _cmd(0x6D, 0x37); _cmd(0x6E, 0x23);
    _cmd(0x6F, 0x10);

    // Gamma negative
    _cmd(0x70, 0x78); _cmd(0x71, 0x63); _cmd(0x72, 0x54);
    _cmd(0x73, 0x49); _cmd(0x74, 0x45); _cmd(0x75, 0x38);
    _cmd(0x76, 0x3D); _cmd(0x77, 0x28); _cmd(0x78, 0x43);
    _cmd(0x79, 0x41); _cmd(0x7A, 0x43); _cmd(0x7B, 0x62);
    _cmd(0x7C, 0x50); _cmd(0x7D, 0x57); _cmd(0x7E, 0x49);
    _cmd(0x7F, 0x44); _cmd(0x80, 0x37); _cmd(0x81, 0x23);
    _cmd(0x82, 0x10);

    // Page 2 — GIP forward mapping
    _cmd(0xE0, 0x02);
    _cmd(0x00, 0x47); _cmd(0x01, 0x47); _cmd(0x02, 0x45);
    _cmd(0x03, 0x45); _cmd(0x04, 0x4B); _cmd(0x05, 0x4B);
    _cmd(0x06, 0x49); _cmd(0x07, 0x49); _cmd(0x08, 0x41);
    _cmd(0x09, 0x1F); _cmd(0x0A, 0x1F); _cmd(0x0B, 0x1F);
    _cmd(0x0C, 0x1F); _cmd(0x0D, 0x1F); _cmd(0x0E, 0x1F);
    _cmd(0x0F, 0x5F); _cmd(0x10, 0x5F); _cmd(0x11, 0x57);
    _cmd(0x12, 0x77); _cmd(0x13, 0x35); _cmd(0x14, 0x1F);
    _cmd(0x15, 0x1F);

    // GIP reverse mapping
    _cmd(0x16, 0x46); _cmd(0x17, 0x46); _cmd(0x18, 0x44);
    _cmd(0x19, 0x44); _cmd(0x1A, 0x4A); _cmd(0x1B, 0x4A);
    _cmd(0x1C, 0x48); _cmd(0x1D, 0x48); _cmd(0x1E, 0x40);
    _cmd(0x1F, 0x1F); _cmd(0x20, 0x1F); _cmd(0x21, 0x1F);
    _cmd(0x22, 0x1F); _cmd(0x23, 0x1F); _cmd(0x24, 0x1F);
    _cmd(0x25, 0x5F); _cmd(0x26, 0x5F); _cmd(0x27, 0x57);
    _cmd(0x28, 0x77); _cmd(0x29, 0x35); _cmd(0x2A, 0x1F);
    _cmd(0x2B, 0x1F);

    // GIP timing
    _cmd(0x58, 0x40); _cmd(0x59, 0x00); _cmd(0x5A, 0x00);
    _cmd(0x5B, 0x10); _cmd(0x5C, 0x06); _cmd(0x5D, 0x40);
    _cmd(0x5E, 0x01); _cmd(0x5F, 0x02); _cmd(0x60, 0x30);
    _cmd(0x61, 0x01); _cmd(0x62, 0x02); _cmd(0x63, 0x03);
    _cmd(0x64, 0x6B); _cmd(0x65, 0x05); _cmd(0x66, 0x0C);
    _cmd(0x67, 0x73); _cmd(0x68, 0x09); _cmd(0x69, 0x03);
    _cmd(0x6A, 0x56); _cmd(0x6B, 0x08); _cmd(0x6C, 0x00);
    _cmd(0x6D, 0x04); _cmd(0x6E, 0x04); _cmd(0x6F, 0x88);
    _cmd(0x70, 0x00); _cmd(0x71, 0x00); _cmd(0x72, 0x06);
    _cmd(0x73, 0x7B); _cmd(0x74, 0x00); _cmd(0x75, 0xF8);
    _cmd(0x76, 0x00); _cmd(0x77, 0xD5); _cmd(0x78, 0x2E);
    _cmd(0x79, 0x12); _cmd(0x7A, 0x03); _cmd(0x7B, 0x00);
    _cmd(0x7C, 0x00); _cmd(0x7D, 0x03); _cmd(0x7E, 0x7B);

    // Page 4
    _cmd(0xE0, 0x04);
    _cmd(0x00, 0x0E); _cmd(0x02, 0xB3); _cmd(0x09, 0x60);
    _cmd(0x0E, 0x2A); _cmd(0x36, 0x59);

    // Page 0 — color mode + DSI lanes
    _cmd(0xE0, 0x00);
    _cmd(0x3A, 0x55);  // COLMOD: RGB565
    _cmd(0x80, 0x01);  // DSI_INT0: 2-lane mode

    // Sleep Out + Display On
    _cmd0(0x11);
    delay(120);
    _cmd0(0x29);
    delay(20);
    _cmd(0x35, 0x00);  // Tearing Effect ON

    Serial.println("[DISPLAY] JD9365 init commands OK");
}

// ─── MIPI-DSI bus + DPI panel ────────────────────────────────────────────────

static bool _init_panel() {
    // 1. Power the MIPI DSI PHY
    if (!_enable_dsi_phy_power()) return false;

    // 2. Hardware reset
    _lcd_reset();

    // 3. MIPI-DSI bus
    esp_lcd_dsi_bus_config_t bus_cfg = {};
    bus_cfg.bus_id             = 0;
    bus_cfg.num_data_lanes     = MIPI_DSI_NUM_DATA_LANES;
    bus_cfg.phy_clk_src        = MIPI_DSI_PHY_CLK_SRC_DEFAULT;
    bus_cfg.lane_bit_rate_mbps = MIPI_DSI_LANE_BITRATE;

    Serial.println("[DISPLAY] Creando MIPI-DSI bus...");
    esp_err_t ret = esp_lcd_new_dsi_bus(&bus_cfg, &_dsi_bus);
    if (ret != ESP_OK) {
        Serial.printf("[DISPLAY] MIPI-DSI bus error: 0x%x\n", ret);
        return false;
    }
    Serial.println("[DISPLAY] MIPI-DSI bus OK");

    // 4. DBI command interface
    esp_lcd_dbi_io_config_t dbi_cfg = {};
    dbi_cfg.virtual_channel = 0;
    dbi_cfg.lcd_cmd_bits    = 8;
    dbi_cfg.lcd_param_bits  = 8;

    ret = esp_lcd_new_panel_io_dbi(_dsi_bus, &dbi_cfg, &_dbi_io);
    if (ret != ESP_OK) {
        Serial.printf("[DISPLAY] DBI IO error: 0x%x\n", ret);
        return false;
    }

    // 5. Send JD9365 vendor init
    _jd9365_init();

    // 6. DPI video panel
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
    dpi_cfg.flags.use_dma2d          = true;

    ret = esp_lcd_new_panel_dpi(_dsi_bus, &dpi_cfg, &_panel);
    if (ret != ESP_OK) {
        Serial.printf("[DISPLAY] DPI panel error: 0x%x\n", ret);
        return false;
    }

    esp_lcd_panel_init(_panel);

    Serial.printf("[DISPLAY] JD9365 OK — %dx%d MIPI-DSI %d lanes %d Mbps\n",
        DISPLAY_WIDTH, DISPLAY_HEIGHT, MIPI_DSI_NUM_DATA_LANES, MIPI_DSI_LANE_BITRATE);
    return true;
}

// ─── LVGL flush callback ─────────────────────────────────────────────────────

static void _flush_cb(lv_display_t* disp, const lv_area_t* area, uint8_t* px_map) {
    if (_panel) {
        esp_lcd_panel_draw_bitmap(_panel,
            area->x1, area->y1,
            area->x2 + 1, area->y2 + 1,
            px_map);
    }
    lv_display_flush_ready(disp);
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

    // 3. Panel MIPI-DSI + JD9365 init
    bool panelOk = _init_panel();

    // 4. Buffers LVGL en PSRAM (full framebuffer × 2)
    const size_t buf_size = DISPLAY_WIDTH * DISPLAY_HEIGHT * sizeof(lv_color_t);
    _buf1 = heap_caps_malloc(buf_size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    _buf2 = heap_caps_malloc(buf_size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);

    if (!_buf1) {
        Serial.printf("[DISPLAY] Sin PSRAM para buffers (%d KB)\n", (int)(buf_size / 1024));
        return false;
    }

    // 5. LVGL display
    _lv_disp = lv_display_create(DISPLAY_WIDTH, DISPLAY_HEIGHT);
    lv_display_set_flush_cb(_lv_disp, _flush_cb);
    lv_display_set_buffers(_lv_disp, _buf1, _buf2, buf_size,
        LV_DISPLAY_RENDER_MODE_FULL);

    // 6. Backlight on si panel OK
    if (panelOk) {
        display_set_backlight(BACKLIGHT_BRIGHTNESS);
    }

    _hw_ready = panelOk;
    Serial.printf("[DISPLAY] LVGL %d.%d — panel=%s — %d KB buf x2\n",
        LVGL_VERSION_MAJOR, LVGL_VERSION_MINOR,
        panelOk ? "OK" : "FAIL",
        (int)(buf_size / 1024));

    return true;
}

// ─── Tarea FreeRTOS de LVGL (Core 0) ────────────────────────────────────────

static void _lvgl_task(void*) {
    for (;;) {
        lv_lock();
        uint32_t ms_until_next = lv_timer_handler();
        lv_unlock();
        vTaskDelay(pdMS_TO_TICKS(ms_until_next < 1 ? 1 : ms_until_next > 10 ? 10 : ms_until_next));
    }
}

void display_lvgl_task_start() {
    xTaskCreatePinnedToCore(
        _lvgl_task, "lvgl",
        16384,      // stack bytes
        nullptr,
        5,          // prioridad (>loop que corre en 1)
        nullptr,
        0           // Core 0
    );
    Serial.println("[DISPLAY] LVGL task pinned to Core 0");
}
