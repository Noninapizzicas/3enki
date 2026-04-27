#pragma once
// screen_config.h — Pantalla de configuración (WiFi / MQTT / Identidad / Cocina)

#include <lvgl.h>

#define CFG_SCAN_MAX 20

struct CfgScanResult {
    char   ssid[33];
    int8_t rssi;
    bool   open;
};

void screen_config_create();
void screen_config_load();
void screen_config_populate();
void screen_config_show_msg(const char* msg, bool ok);
void screen_config_scan_start();
void screen_config_scan_results(const CfgScanResult* r, int n);

// Getters — llamados desde app_config_save()
const char* screen_config_get_ssid(int i);
const char* screen_config_get_pass(int i);
const char* screen_config_get_mhost();
const char* screen_config_get_mport();
const char* screen_config_get_muser();
const char* screen_config_get_mpass();
const char* screen_config_get_devid();
const char* screen_config_get_projid();
const char* screen_config_get_nombre();
const char* screen_config_get_tipo();
const char* screen_config_get_filtros();

