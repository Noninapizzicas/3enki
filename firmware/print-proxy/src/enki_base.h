#ifndef ENKI_BASE_H
#define ENKI_BASE_H

/**
 * Enki BASE — Config NVS + servicios enki_* para la LÓGICA
 *
 * Este archivo define la estructura de config y la API que la LÓGICA consume.
 * Los subsistemas (WiFi, MQTT, OTA, Portal) están en sus propios archivos.
 */

#include <Arduino.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include "config.h"

// ─────────────────────────────────────────────
// Config en RAM (cargada de NVS al boot)
// ─────────────────────────────────────────────

struct WifiEntry {
  char ssid[33];
  char pass[65];
};

struct EnkiBaseConfig {
  // Identidad
  char deviceId[32];
  char projectId[32];
  // WiFi — hasta 3 redes con fallback
  WifiEntry wifi[WIFI_MAX_NETWORKS];
  int8_t wifiActive;
  // MQTT
  char mqttHost[64];
  uint16_t mqttPort;
  char mqttUser[32];
  char mqttPass[64];
  // OTA
  char otaUrl[128];
  // Estado (no persistido)
  bool configured;
};

// ─────────────────────────────────────────────
// Acceso global
// ─────────────────────────────────────────────

extern EnkiBaseConfig baseCfg;
extern uint8_t        payloadBuffer[];

// ─────────────────────────────────────────────
// Config NVS
// ─────────────────────────────────────────────

void baseConfigLoad();
void baseConfigSave();

// ─────────────────────────────────────────────
// Servicios enki_* (contrato para la LÓGICA)
// ─────────────────────────────────────────────

// MQTT
void enki_mqtt_publish(const char* topic, const char* payload);
bool enki_mqtt_subscribe(const char* topic);
bool enki_mqtt_connected();

// Identidad
const char* enki_device_id();
const char* enki_project_id();

// Config custom del driver (NVS)
void        enki_config_set(const char* key, const char* value);
const char* enki_config_get(const char* key, const char* defaultValue = "");
void        enki_config_set_u16(const char* key, uint16_t value);
uint16_t    enki_config_get_u16(const char* key, uint16_t defaultValue = 0);

// Utilidades
void enki_led_blink(int times, int ms = 100);
void enki_led_on();
void enki_led_off();
void enki_request_restart();

// Buffer compartido (payloads grandes: ESC/POS, binarios)
uint8_t* enki_buffer();
size_t   enki_buffer_size();

#endif // ENKI_BASE_H
