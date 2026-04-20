#pragma once
/**
 * display_driver.h — Guition JC8012P4A1
 *
 * ILI9881C (MIPI-DSI 800×1280) + GT911 (I2C touch)
 *
 * Inicializa LVGL, panel MIPI-DSI y touch en display_driver_init().
 * Si el hardware falla, LVGL se crea con un display virtual
 * para poder depurar la lógica MQTT sin pantalla conectada.
 */

#include <Arduino.h>
#include <lvgl.h>
#include "config.h"

/** Inicializar LVGL + MIPI-DSI + GT911. Retorna true si LVGL está listo. */
bool display_driver_init();

/** Llamar en cada iteración de loop() para LVGL. */
void display_driver_tick();

/** Ajustar brillo PWM (0=off, 255=máximo). */
void display_set_backlight(uint8_t brightness);
