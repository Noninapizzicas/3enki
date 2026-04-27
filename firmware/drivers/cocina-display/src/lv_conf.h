#ifndef LV_CONF_H
#define LV_CONF_H

#ifndef __ASSEMBLER__
#include <stdint.h>
#endif

#define LV_COLOR_DEPTH      16
#define LV_USE_DRAW_SW_ASM  LV_DRAW_SW_ASM_NONE
#define LV_COLOR_16_SWAP    0

// PSRAM
#define LV_MEM_CUSTOM 1
#define LV_MEM_CUSTOM_INCLUDE        <esp_heap_caps.h>
#define LV_MEM_CUSTOM_ALLOC(size)    heap_caps_malloc((size), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)
#define LV_MEM_CUSTOM_FREE(ptr)      heap_caps_free(ptr)
#define LV_MEM_CUSTOM_REALLOC(p, s)  heap_caps_realloc((p), (s), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT)

#define LV_DPI_DEF          80
#define LV_DRAW_BUF_ALIGN   4
#define LV_DRAW_BUF_STRIDE_ALIGN 1
#define LV_TICK_CUSTOM      0

#define LV_USE_LOG          1
#define LV_LOG_LEVEL        LV_LOG_LEVEL_WARN
#define LV_LOG_PRINTF       1

#define LV_USE_ASSERT_NULL   1
#define LV_USE_ASSERT_MALLOC 1
#define LV_USE_ASSERT_OBJ    0
#define LV_USE_ASSERT_STYLE  0

// Fonts
#define LV_FONT_MONTSERRAT_12 1
#define LV_FONT_MONTSERRAT_14 1
#define LV_FONT_MONTSERRAT_16 1
#define LV_FONT_MONTSERRAT_20 1
#define LV_FONT_MONTSERRAT_24 1
#define LV_FONT_DEFAULT &lv_font_montserrat_14

// Widgets
#define LV_USE_LABEL     1
#define LV_USE_BUTTON    1
#define LV_USE_LINE      1
#define LV_USE_TEXTAREA  1
#define LV_USE_KEYBOARD  1
#define LV_USE_ARC       1
#define LV_USE_SPINNER   1
#define LV_USE_LIST      1
#define LV_USE_FLEX      1

#define LV_USE_BTNMATRIX  0
#define LV_USE_CHECKBOX   0
#define LV_USE_DROPDOWN   0
#define LV_USE_IMG        0
#define LV_USE_ROLLER     0
#define LV_USE_SLIDER     0
#define LV_USE_SWITCH     0
#define LV_USE_TABLE      0
#define LV_USE_BAR        0
#define LV_USE_CHART      0
#define LV_USE_CALENDAR   0
#define LV_USE_LED        0
#define LV_USE_MENU       0
#define LV_USE_MSGBOX     0
#define LV_USE_SPINNER    1
#define LV_USE_TABVIEW    0
#define LV_USE_WIN        0
#define LV_USE_GRID       0

#define LV_USE_ANIMATION  1
#define LV_USE_SCROLL     1

#define LV_INDEV_DEF_READ_PERIOD 30

#define LV_SHADOW_CACHE_SIZE  0
#define LV_CIRCLE_CACHE_SIZE  4

#define LV_USE_OS LV_OS_FREERTOS

#endif /* LV_CONF_H */
