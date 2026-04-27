#pragma once
// screen_home.h — Pantalla de inicio: botones Config y Cocina

#include <lvgl.h>

void screen_home_create();
void screen_home_load();
void screen_home_set_wifi(bool ok);
void screen_home_set_mqtt(bool ok);
