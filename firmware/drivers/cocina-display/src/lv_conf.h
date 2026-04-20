/**
 * LVGL 9.x configuration — Cocina Display (ESP32-P4)
 *
 * Ajustar según hardware cuando se conozca el panel específico.
 */

#ifndef LV_CONF_H
#define LV_CONF_H

#include <stdint.h>

/* Color depth: 16 = RGB565, 24 = RGB888 */
#define LV_COLOR_DEPTH 16

/* Swap bytes in RGB565 (1 si el panel espera big-endian) */
#define LV_COLOR_16_SWAP 0

/* Memoria LVGL interna — PSRAM disponible en ESP32-P4 */
#define LV_MEM_CUSTOM 1
#define LV_MEM_CUSTOM_INCLUDE <esp_heap_caps.h>
#define LV_MEM_CUSTOM_ALLOC(size)          heap_caps_malloc((size), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)
#define LV_MEM_CUSTOM_FREE(ptr)            heap_caps_free(ptr)
#define LV_MEM_CUSTOM_REALLOC(ptr, size)   heap_caps_realloc((ptr), (size), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)

/* DPI de la pantalla — 800px / 10" ≈ 80 dpi */
#define LV_DPI_DEF 80

/* Tamaño del buffer de dibujo (en bytes).
   Partial rendering: 1/10 de la pantalla */
#define LV_DRAW_BUF_ALIGN 4
#define LV_DRAW_BUF_STRIDE_ALIGN 1

/* Tick: se provee via lv_tick_set_cb() con millis() */
#define LV_TICK_CUSTOM 0

/* Log */
#define LV_USE_LOG 1
#define LV_LOG_LEVEL LV_LOG_LEVEL_WARN
#define LV_LOG_PRINTF 1

/* Asserción */
#define LV_USE_ASSERT_NULL          1
#define LV_USE_ASSERT_MALLOC        1
#define LV_USE_ASSERT_OBJ           0
#define LV_USE_ASSERT_STYLE         0

/* Fuente por defecto: 14px Montserrat incluida en LVGL */
#define LV_FONT_MONTSERRAT_12 1
#define LV_FONT_MONTSERRAT_14 1
#define LV_FONT_MONTSERRAT_16 1
#define LV_FONT_MONTSERRAT_20 1
#define LV_FONT_MONTSERRAT_24 1
#define LV_FONT_MONTSERRAT_28 0
#define LV_FONT_MONTSERRAT_32 0
#define LV_FONT_MONTSERRAT_36 0
#define LV_FONT_MONTSERRAT_48 0
#define LV_FONT_DEFAULT &lv_font_montserrat_14

/* Widgets utilizados */
#define LV_USE_LABEL    1
#define LV_USE_BTN      0
#define LV_USE_BTNMATRIX 0
#define LV_USE_CHECKBOX 0
#define LV_USE_DROPDOWN 0
#define LV_USE_IMG      0
#define LV_USE_LINE     1
#define LV_USE_ROLLER   0
#define LV_USE_SLIDER   0
#define LV_USE_SWITCH   0
#define LV_USE_TEXTAREA 0
#define LV_USE_TABLE    0
#define LV_USE_ARC      0
#define LV_USE_BAR      0
#define LV_USE_CHART    0
#define LV_USE_CALENDAR 0
#define LV_USE_COLORWHEEL 0
#define LV_USE_IMGBTN   0
#define LV_USE_KEYBOARD 0
#define LV_USE_LED      0
#define LV_USE_LIST     1
#define LV_USE_MENU     0
#define LV_USE_METER    0
#define LV_USE_MSGBOX   0
#define LV_USE_SPAN     0
#define LV_USE_SPINBOX  0
#define LV_USE_SPINNER  1
#define LV_USE_TABVIEW  0
#define LV_USE_TILEVIEW 0
#define LV_USE_WIN      0

/* Extras */
#define LV_USE_FLEX     1
#define LV_USE_GRID     0
#define LV_USE_SNAPSHOT 0
#define LV_USE_MONKEY   0
#define LV_USE_GRIDNAV  0
#define LV_USE_FRAGMENT 0
#define LV_USE_IMGFONT  0
#define LV_USE_MSG      0
#define LV_USE_PINYIN_IME 0
#define LV_USE_ARABIC_PERSIAN_CHARS 0

/* Animaciones */
#define LV_USE_ANIMATION 1

/* Scroll */
#define LV_USE_SCROLL 1

/* Indev (touch input) */
#define LV_INDEV_DEF_READ_PERIOD 30

/* Performance */
#define LV_SHADOW_CACHE_SIZE 0
#define LV_CIRCLE_CACHE_SIZE 4

/* OS — sin RTOS, loop manual */
#define LV_USE_OS LV_OS_NONE

#endif /* LV_CONF_H */
