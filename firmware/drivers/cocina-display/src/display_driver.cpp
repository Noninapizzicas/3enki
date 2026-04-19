/**
 * display_driver.cpp — Guition JC8012P4A1
 *
 * ILI9881C (MIPI-DSI 800×1280) + GT911 (I2C touch)
 *
 * Usa las APIs de esp_lcd (parte de ESP-IDF, accesible desde Arduino-ESP32).
 * El componente esp_lcd_ili9881c y esp_lcd_touch_gt911 se añaden via
 * idf_component.yml en la raíz del driver.
 */

#include "display_driver.h"
#include <Wire.h>
#include <esp_lcd_panel_ops.h>
#include <esp_lcd_mipi_dsi.h>
#include <esp_lcd_ili9881c.h>
#include <esp_lcd_touch_gt911.h>
#include <driver/ledc.h>
#include <esp_heap_caps.h>

// ─── Handles globales ────────────────────────────────────────────────────────

static esp_lcd_panel_handle_t    _panel       = nullptr;
static esp_lcd_touch_handle_t    _touch       = nullptr;
static esp_lcd_dsi_bus_handle_t  _dsi_bus     = nullptr;
static lv_display_t*             _lv_disp     = nullptr;
static lv_indev_t*               _lv_indev    = nullptr;
static bool                      _hw_ready    = false;

// Buffers de renderizado (en PSRAM)
static void* _buf1 = nullptr;
static void* _buf2 = nullptr;

// ─── Backlight ───────────────────────────────────────────────────────────────

static void _backlight_init() {
    if (BACKLIGHT_PIN < 0) return;

    ledc_timer_config_t timer_conf = {};
    timer_conf.speed_mode = LEDC_LOW_SPEED_MODE;
    timer_conf.timer_num  = LEDC_TIMER_0;
    timer_conf.duty_resolution = LEDC_TIMER_8_BIT;
    timer_conf.freq_hz    = BACKLIGHT_LEDC_FREQ;
    timer_conf.clk_cfg    = LEDC_AUTO_CLK;
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

// ─── MIPI-DSI bus + ILI9881C panel ───────────────────────────────────────────

static bool _init_panel() {
    // 1. MIPI-DSI bus
    esp_lcd_dsi_bus_config_t bus_cfg = {};
    bus_cfg.bus_id = 0;
    bus_cfg.num_data_lanes = MIPI_DSI_NUM_DATA_LANES;
    bus_cfg.phy_clk_src = MIPI_DSI_PHY_CLK_SRC_DEFAULT;
    bus_cfg.lane_bit_rate_mbps = MIPI_DSI_LANE_BITRATE;

    esp_err_t ret = esp_lcd_new_dsi_bus(&bus_cfg, &_dsi_bus);
    if (ret != ESP_OK) {
        Serial.printf("[DISPLAY] Error MIPI-DSI bus: 0x%x\n", ret);
        return false;
    }

    // 2. Panel IO (DBI command interface)
    esp_lcd_dbi_io_config_t dbi_cfg = {};
    dbi_cfg.virtual_channel = 0;
    dbi_cfg.lcd_cmd_bits = 8;
    dbi_cfg.lcd_param_bits = 8;

    esp_lcd_panel_io_handle_t io_handle = nullptr;
    ret = esp_lcd_new_panel_io_dbi(_dsi_bus, &dbi_cfg, &io_handle);
    if (ret != ESP_OK) {
        Serial.printf("[DISPLAY] Error panel IO: 0x%x\n", ret);
        return false;
    }

    // 3. DPI (video mode) config
    esp_lcd_dpi_panel_config_t dpi_cfg = {};
    dpi_cfg.virtual_channel = 0;
    dpi_cfg.dpi_clk_src = MIPI_DSI_DPI_CLK_SRC_DEFAULT;
    dpi_cfg.dpi_clock_freq_mhz = MIPI_DPI_CLK_MHZ;
    dpi_cfg.pixel_format = LCD_COLOR_PIXEL_FORMAT_RGB565;
    dpi_cfg.num_fbs = 1;
    dpi_cfg.video_timing.h_size = DISPLAY_WIDTH;
    dpi_cfg.video_timing.v_size = DISPLAY_HEIGHT;
    dpi_cfg.video_timing.hsync_back_porch  = MIPI_HSYNC_BACK_PORCH;
    dpi_cfg.video_timing.hsync_pulse_width = MIPI_HSYNC_PULSE_WIDTH;
    dpi_cfg.video_timing.hsync_front_porch = MIPI_HSYNC_FRONT_PORCH;
    dpi_cfg.video_timing.vsync_back_porch  = MIPI_VSYNC_BACK_PORCH;
    dpi_cfg.video_timing.vsync_pulse_width = MIPI_VSYNC_PULSE_WIDTH;
    dpi_cfg.video_timing.vsync_front_porch = MIPI_VSYNC_FRONT_PORCH;

    // 4. ILI9881C vendor config
    ili9881c_vendor_config_t vendor_cfg = {};
    vendor_cfg.mipi_config.dsi_bus = _dsi_bus;
    vendor_cfg.mipi_config.dpi_config = &dpi_cfg;

    esp_lcd_panel_dev_config_t panel_cfg = {};
    panel_cfg.reset_gpio_num = -1;
    panel_cfg.rgb_ele_order = LCD_RGB_ELEMENT_ORDER_RGB;
    panel_cfg.bits_per_pixel = 16;
    panel_cfg.vendor_config = &vendor_cfg;

    ret = esp_lcd_new_panel_ili9881c(io_handle, &panel_cfg, &_panel);
    if (ret != ESP_OK) {
        Serial.printf("[DISPLAY] Error ILI9881C: 0x%x\n", ret);
        return false;
    }

    // 5. Init + encender
    esp_lcd_panel_reset(_panel);
    esp_lcd_panel_init(_panel);
    esp_lcd_panel_disp_on_off(_panel, true);

    Serial.printf("[DISPLAY] ILI9881C OK — %dx%d MIPI-DSI %d lanes\n",
        DISPLAY_WIDTH, DISPLAY_HEIGHT, MIPI_DSI_NUM_DATA_LANES);
    return true;
}

// ─── GT911 touch ─────────────────────────────────────────────────────────────

static bool _init_touch() {
    // I2C bus para touch
    esp_lcd_panel_io_i2c_config_t tp_io_cfg =
        ESP_LCD_TOUCH_IO_I2C_GT911_CONFIG();

    // I2C master bus (usa el nuevo driver I2C de ESP-IDF v5+)
    i2c_master_bus_config_t i2c_bus_cfg = {};
    i2c_bus_cfg.i2c_port = I2C_NUM_0;
    i2c_bus_cfg.sda_io_num = (gpio_num_t)TOUCH_SDA;
    i2c_bus_cfg.scl_io_num = (gpio_num_t)TOUCH_SCL;
    i2c_bus_cfg.clk_source = I2C_CLK_SRC_DEFAULT;
    i2c_bus_cfg.flags.enable_internal_pullup = true;

    i2c_master_bus_handle_t i2c_bus = nullptr;
    esp_err_t ret = i2c_new_master_bus(&i2c_bus_cfg, &i2c_bus);
    if (ret != ESP_OK) {
        Serial.printf("[TOUCH] Error I2C bus: 0x%x\n", ret);
        return false;
    }

    esp_lcd_panel_io_handle_t tp_io = nullptr;
    ret = esp_lcd_new_panel_io_i2c(i2c_bus, &tp_io_cfg, &tp_io);
    if (ret != ESP_OK) {
        Serial.printf("[TOUCH] Error panel IO: 0x%x\n", ret);
        return false;
    }

    esp_lcd_touch_config_t touch_cfg = {};
    touch_cfg.x_max = DISPLAY_WIDTH;
    touch_cfg.y_max = DISPLAY_HEIGHT;
    touch_cfg.rst_gpio_num = (gpio_num_t)TOUCH_RST;
    touch_cfg.int_gpio_num = (gpio_num_t)TOUCH_INT;
    touch_cfg.levels.reset = 0;
    touch_cfg.levels.interrupt = 0;

    ret = esp_lcd_touch_new_i2c_gt911(tp_io, &touch_cfg, &_touch);
    if (ret != ESP_OK) {
        Serial.printf("[TOUCH] Error GT911: 0x%x\n", ret);
        return false;
    }

    Serial.printf("[TOUCH] GT911 OK — SDA=%d SCL=%d INT=%d\n",
        TOUCH_SDA, TOUCH_SCL, TOUCH_INT);
    return true;
}

// ─── LVGL callbacks ──────────────────────────────────────────────────────────

static void _flush_cb(lv_display_t* disp, const lv_area_t* area, uint8_t* px_map) {
    if (_panel) {
        int x1 = area->x1;
        int y1 = area->y1;
        int x2 = area->x2 + 1;
        int y2 = area->y2 + 1;
        esp_lcd_panel_draw_bitmap(_panel, x1, y1, x2, y2, px_map);
    }
    lv_display_flush_ready(disp);
}

static void _touch_read_cb(lv_indev_t* indev, lv_indev_data_t* data) {
    if (!_touch) {
        data->state = LV_INDEV_STATE_RELEASED;
        return;
    }

    esp_lcd_touch_read_data(_touch);

    uint16_t x = 0, y = 0;
    uint8_t  strength = 0;
    uint8_t  count = 1;
    bool pressed = esp_lcd_touch_get_coordinates(_touch, &x, &y, &strength, &count, 1);

    if (pressed && count > 0) {
        data->point.x = x;
        data->point.y = y;
        data->state = LV_INDEV_STATE_PRESSED;
    } else {
        data->state = LV_INDEV_STATE_RELEASED;
    }
}

// ─── API pública ─────────────────────────────────────────────────────────────

bool display_driver_init() {
    Serial.println("[DISPLAY] Inicializando Guition JC8012P4A1...");

    // 1. LVGL init
    lv_init();
    lv_tick_set_cb([]() -> uint32_t { return (uint32_t)millis(); });

    // 2. Backlight
    _backlight_init();
    display_set_backlight(0);  // apagado hasta que el panel esté listo

    // 3. Panel MIPI-DSI
    bool panelOk = _init_panel();
    if (!panelOk) {
        Serial.println("[DISPLAY] Panel MIPI-DSI falló — modo sin hardware");
    }

    // 4. Touch GT911
    bool touchOk = _init_touch();
    if (!touchOk) {
        Serial.println("[TOUCH] GT911 falló — modo sin touch");
    }

    // 5. Buffers LVGL en PSRAM (1/10 pantalla × 2 buffers)
    const size_t buf_size = DISPLAY_WIDTH * (DISPLAY_HEIGHT / 10) * sizeof(lv_color_t);
    _buf1 = heap_caps_malloc(buf_size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    _buf2 = heap_caps_malloc(buf_size, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);

    if (!_buf1) {
        Serial.println("[DISPLAY] Error: sin PSRAM para buffers LVGL");
        return false;
    }

    // 6. Display LVGL
    _lv_disp = lv_display_create(DISPLAY_WIDTH, DISPLAY_HEIGHT);
    lv_display_set_flush_cb(_lv_disp, _flush_cb);
    lv_display_set_buffers(_lv_disp, _buf1, _buf2, buf_size,
        LV_DISPLAY_RENDER_MODE_PARTIAL);

    // 7. Input device (touch)
    _lv_indev = lv_indev_create();
    lv_indev_set_type(_lv_indev, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(_lv_indev, _touch_read_cb);

    // 8. Encender backlight
    if (panelOk) {
        display_set_backlight(BACKLIGHT_BRIGHTNESS);
    }

    _hw_ready = panelOk;
    Serial.printf("[DISPLAY] LVGL %d.%d — panel=%s touch=%s — %d KB buffers\n",
        LVGL_VERSION_MAJOR, LVGL_VERSION_MINOR,
        panelOk ? "OK" : "FAIL",
        touchOk ? "OK" : "FAIL",
        (int)(buf_size * 2 / 1024));

    return true;  // LVGL siempre se inicializa, aunque el hardware falle
}

void display_driver_tick() {
    // Touch polling se hace via el callback de LVGL (_touch_read_cb)
    // No se necesita polling manual adicional
}
