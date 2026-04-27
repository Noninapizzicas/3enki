#pragma once
// app.h — Máquina de estados: navegación + WiFi + MQTT

#include <Arduino.h>

enum AppScreen : uint8_t { SCREEN_HOME = 0, SCREEN_CONFIG = 1, SCREEN_COCINA = 2 };

// Inicializar display, pantallas, WiFi, MQTT
void app_init();

// Llamar en cada iteración del loop() de Arduino (Core 1)
void app_loop();

// Navegar a otra pantalla (seguro desde Core 0 y Core 1)
void app_goto(AppScreen s);

// Solicitar scan WiFi — ejecutado en Core 1, resultado en screen_config
void app_request_wifi_scan();

// Guardar config desde screen_config → NVS → restart
void app_config_save();

// Acción táctil desde screen_cocina (thread-safe Core 0 → Core 1)
void app_cocina_item_tap(const char* order_id, const char* item_id);
void app_cocina_header_tap(const char* order_id);

// Estado de conectividad
bool app_wifi_ok();
bool app_mqtt_ok();
