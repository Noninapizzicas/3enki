#pragma once
/**
 * display_driver.h — Guition JC8012P4A1
 *
 * JD9365 (MIPI-DSI 800×1280) + GSL3680 (I2C touch, pendiente)
 *
 * Inicializa LVGL, panel MIPI-DSI y backlight.
 * Arranca tarea FreeRTOS de LVGL en Core 0.
 */

#include <Arduino.h>
#include <lvgl.h>
#include "config.h"

/** Inicializar LVGL + MIPI-DSI + GT911. Retorna true si LVGL está listo. */
bool display_driver_init();

/** Arrancar tarea FreeRTOS de LVGL (Core 0). Llamar después de display_driver_init() y ui_init(). */
void display_lvgl_task_start();

/** Ajustar brillo PWM (0=off, 255=máximo). */
void display_set_backlight(uint8_t brightness);
