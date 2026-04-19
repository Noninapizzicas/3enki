/**
 * display_driver.cpp — Stub de display hasta conocer el panel exacto.
 *
 * SUSTITUIR por la implementación real según el hardware.
 * Ver display_driver.h para instrucciones.
 *
 * Con este stub LVGL queda inicializado con un display virtual:
 *   - La lógica y la UI compilan y funcionan
 *   - No hay salida gráfica en hardware
 *   - Útil para verificar MQTT + estado de órdenes antes de tener hardware
 */

#include "display_driver.h"

static bool _hwReady = false;

// ─── Flush callback ──────────────────────────────────────────────────────────
// Cuando LVGL termina de renderizar un área, llama aquí para enviarlo al panel.

static void _flush_cb(lv_display_t* disp, const lv_area_t* area, uint8_t* px_map) {
    // TODO: llamar esp_lcd_panel_draw_bitmap() con px_map
    // Por ahora marcamos flush como listo inmediatamente (sin hardware)
    lv_display_flush_ready(disp);
}

// ─── Touch read callback ─────────────────────────────────────────────────────

static void _touch_read_cb(lv_indev_t* indev, lv_indev_data_t* data) {
    // TODO: leer GT911/FT5x06 y llenar data->point.x/y + data->state
    data->state = LV_INDEV_STATE_RELEASED;
}

// ─── Buffers de renderizado (en PSRAM) ──────────────────────────────────────

static lv_color_t* _buf1 = nullptr;
static lv_color_t* _buf2 = nullptr;

// ─── display_driver_init() ───────────────────────────────────────────────────

bool display_driver_init() {
    lv_init();

    // Tick via millis() — LVGL 9.x
    lv_tick_set_cb([]() -> uint32_t { return (uint32_t)millis(); });

    // Allocar buffers en PSRAM (1/10 pantalla cada uno)
    const size_t bufSize = (DISPLAY_WIDTH * DISPLAY_HEIGHT / 10) * sizeof(lv_color_t);

#if defined(BOARD_HAS_PSRAM)
    _buf1 = (lv_color_t*)heap_caps_malloc(bufSize, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
    _buf2 = (lv_color_t*)heap_caps_malloc(bufSize, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
#else
    _buf1 = (lv_color_t*)malloc(bufSize);
    _buf2 = nullptr;
#endif

    if (!_buf1) {
        Serial.println("[DISPLAY] Error: sin memoria para buffer LVGL");
        return false;
    }

    // Crear display LVGL
    lv_display_t* disp = lv_display_create(DISPLAY_WIDTH, DISPLAY_HEIGHT);
    lv_display_set_flush_cb(disp, _flush_cb);
    lv_display_set_buffers(disp, _buf1, _buf2, bufSize, LV_DISPLAY_RENDER_MODE_PARTIAL);

    // Crear indev touch
    lv_indev_t* indev = lv_indev_create();
    lv_indev_set_type(indev, LV_INDEV_TYPE_POINTER);
    lv_indev_set_read_cb(indev, _touch_read_cb);

    // TODO: inicializar panel MIPI-DSI real aquí
    // _hwReady = init_panel();
    // if (!_hwReady) Serial.println("[DISPLAY] Panel no inicializado");

    Serial.printf("[DISPLAY] LVGL %d.%d — buffer %d KB x2 — stub (sin panel)\n",
        LVGL_VERSION_MAJOR, LVGL_VERSION_MINOR, (int)(bufSize / 1024));

    _hwReady = false;  // sin hardware real por ahora
    return true;       // LVGL sí está listo
}

// ─── display_driver_tick() ───────────────────────────────────────────────────

void display_driver_tick() {
    // Touch polling: TODO leer GT911 via I2C
    // esp_lcd_touch_read_data(tp_handle);
}

// ─── display_set_backlight() ─────────────────────────────────────────────────

void display_set_backlight(uint8_t brightness) {
    if (BACKLIGHT_PIN < 0) return;
    // TODO: ledcWrite(LEDC_BACKLIGHT_CHANNEL, brightness);
    (void)brightness;
}
