#pragma once
/**
 * ui_setup.h — Pantalla de configuración nativa LVGL
 *
 * Reemplaza el portal web cautivo. Muestra WiFi scanner, 3 slots
 * SSID/pass, MQTT y identidad. Al guardar: baseConfigSave() + restart.
 */

#include <Arduino.h>
#include <lvgl.h>

#define UI_SETUP_MAX_SCAN 20

struct UiSetupScanResult {
    char   ssid[33];
    int8_t rssi;
    bool   open;
};

typedef void (*UiSetupScanCb)();

/** Crear pantalla setup. scan_cb: callback al pulsar "Escanear". */
void ui_setup_create(UiSetupScanCb scan_cb);

/** Cargar la pantalla setup (lv_scr_load). */
void ui_setup_load();

/** Poblar campos desde baseCfg. Llamar con lv_lock adquirido. */
void ui_setup_populate();

/** Mostrar estado "Escaneando..." y limpiar lista anterior. */
void ui_setup_scan_start();

/** Poblar lista WiFi con resultados del scan. Llamar con lv_lock adquirido. */
void ui_setup_scan_results(const UiSetupScanResult* results, int count);
