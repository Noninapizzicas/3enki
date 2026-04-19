#pragma once
/**
 * display_driver.h — Abstracción hardware del display + touch
 *
 * IMPLEMENTAR según el panel específico:
 *
 * ── Opción A: ESP32-P4-Function-EV-Board (Espressif oficial) ─────────────
 *   Panel:   EK79007AD (MIPI-DSI 2-lane, 1024×600)
 *   Touch:   GT1151QM (I2C)
 *   BSP:     https://github.com/espressif/esp-bsp  (esp32_p4_function_ev_board)
 *   Lib:     esp_lcd_ek79007  (componente IDF)
 *
 * ── Opción B: Panel 10.1" custom (800×1280 portrait) ─────────────────────
 *   Paneles comunes: ILI9881C, HX8394F, ST7701S (MIPI-DSI 4-lane)
 *   Touch:   GT911 (I2C, addr 0x5D o 0x14)
 *   Lib:     esp_lcd_touch_gt911  (componente IDF)
 *
 * ── Patrón de implementación ─────────────────────────────────────────────
 *   1. En display_driver_init():
 *      a. lv_init()
 *      b. init_panel()    → esp_lcd_new_panel_...()
 *      c. init_touch()    → esp_lcd_touch_new_i2c_gt911()
 *      d. lv_display_t* disp = lv_display_create(DISPLAY_WIDTH, DISPLAY_HEIGHT)
 *      e. lv_display_set_flush_cb(disp, flush_cb)
 *      f. lv_display_set_buffers(disp, buf1, buf2, size, LV_DISPLAY_RENDER_MODE_PARTIAL)
 *      g. lv_indev_t* indev = lv_indev_create()
 *      h. lv_indev_set_type(indev, LV_INDEV_TYPE_POINTER)
 *      i. lv_indev_set_read_cb(indev, touch_read_cb)
 *
 *   2. flush_cb:
 *      esp_lcd_panel_draw_bitmap(panel_handle, x1, y1, x2+1, y2+1, color_map);
 *      lv_display_flush_ready(disp_drv);
 *
 *   3. touch_read_cb:
 *      esp_lcd_touch_read_data(tp_handle);
 *      uint16_t x, y; uint8_t strength; uint8_t count = 1;
 *      bool pressed = esp_lcd_touch_get_coordinates(tp_handle, &x, &y, &strength, &count, 1);
 *      data->point.x = x; data->point.y = y;
 *      data->state = pressed ? LV_INDEV_STATE_PRESSED : LV_INDEV_STATE_RELEASED;
 */

#include <Arduino.h>
#include <lvgl.h>
#include "config.h"

/**
 * Inicializar LVGL + panel + touch.
 * Retorna true si el hardware está listo.
 * Con false, LVGL funciona sin salida (útil para depurar lógica sin hardware).
 */
bool display_driver_init();

/**
 * Llamar en cada iteración de loop() ANTES de lv_timer_handler().
 * Actualiza el tick de LVGL y lee touch.
 */
void display_driver_tick();

/**
 * Ajustar brillo del backlight (0=off, 255=máximo).
 * Implementar con ledcWrite() o DAC según el circuito.
 */
void display_set_backlight(uint8_t brightness);
