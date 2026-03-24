#ifndef ENKI_BASE_H
#define ENKI_BASE_H

/**
 * Enki BASE — Plataforma universal ESP32
 *
 * Gestiona: WiFi multi-red, MQTT, Portal web, NVS, OTA, Watchdog, LED.
 * La lógica específica se conecta mediante el contrato enki_logic.h.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <DNSServer.h>
#include <WebServer.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>
#include <HTTPUpdate.h>
#include "config.h"

// ─────────────────────────────────────────────
// Config genérica en RAM (cargada de NVS al boot)
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
  char otaUrl[128];           // URL del servidor de firmware
  // Estado (no persistido)
  bool configured;
};

// ─────────────────────────────────────────────
// Acceso global a la BASE
// ─────────────────────────────────────────────

extern EnkiBaseConfig baseCfg;
extern Preferences    prefs;
extern WebServer      webServer;
extern PubSubClient   mqtt;
extern WiFiClient     wifiClient;
extern DNSServer      dnsServer;
extern bool           portalMode;
extern uint8_t        payloadBuffer[];

// ─────────────────────────────────────────────
// Funciones de la BASE
// ─────────────────────────────────────────────

// Config NVS
void baseConfigLoad();
void baseConfigSave();

// WiFi
bool baseSetupWiFi();

// MQTT
void baseSetupMQTT();
void baseConnectMQTT();

// Portal web (endpoints base: config, status, wifi-scan, reset)
void basePortalSetup();

// OTA
void baseCheckOTA();

// Loop helpers
void baseHandleWifiReconnect();
void baseHandleMqttReconnect();
void basePublishStatus();

#endif // ENKI_BASE_H
