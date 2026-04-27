#pragma once
// display_driver.h — Guition JC8012P4A1
// JD9365 MIPI-DSI 800×1280 + GT911 I2C touch
// LVGL en tarea FreeRTOS Core 0

#include <Arduino.h>
#include <lvgl.h>
#include "config.h"

bool display_driver_init();
void display_lvgl_task_start();
void display_set_backlight(uint8_t brightness);
