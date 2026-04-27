/**
 * Display Management — LVGL + esp_lcd
 */

#pragma once

#include <stdint.h>
#include <stdbool.h>

void display_init();
void display_init_config_mode();
void display_init_trabajo_mode();
void display_show_splash(const char *title, const char *subtitle);
void display_show_message(const char *title, const char *message, uint32_t duration_ms);
void display_show_error(const char *title, const char *message);
void display_update_status(const char *label, const char *status);
void display_show_ip(const char *ip_str);
void display_clear();

// Config mode specific
void display_config_show_networks(const char **networks, int count);
void display_config_show_keyboard();
void display_config_input_text(const char *label, char *buffer, int max_len);
void display_config_show_summary(const char *ssid, const char *broker, const char *url);

// Trabajo mode specific
void display_trabajo_show_status_bar();
void display_trabajo_update_wifi(bool connected);
void display_trabajo_update_mqtt(bool connected);
