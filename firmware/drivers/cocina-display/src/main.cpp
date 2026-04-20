/**
 * Enki ESP32 Firmware — Cocina Display
 *
 * Board:  Guition JC8012P4A1 (ESP32-P4 + ESP32-C6)
 * Panel:  ILI9881C MIPI-DSI 800x1280
 * Touch:  GT911 I2C
 */

#include "enki_base.h"
#include "enki_wifi.h"
#include "enki_mqtt.h"
#include "enki_ota.h"
#include "enki_portal.h"
#include "enki_logic.h"
#include <esp_task_wdt.h>

static unsigned long portalStartMs = 0;

// En ESP32-P4 Arduino 3.x, el WDT se gestiona diferente — no añadir/resetear manualmente
static inline void _wdt_feed() {
    if (esp_task_wdt_status(NULL) == ESP_OK) {
        esp_task_wdt_reset();
    }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n========================================");
  Serial.println("  Enki ESP32 — Cocina Display v1.2");
  Serial.println("  Guition JC8012P4A1");
  Serial.println("========================================\n");
  Serial.flush();

  Serial.println("[SETUP] 1/5 Config NVS...");
  _wdt_feed();
  baseConfigLoad();

  Serial.println("[SETUP] 2/5 WiFi...");
  _wdt_feed();
  wifiSetup();

  Serial.println("[SETUP] 3/5 Portal web...");
  _wdt_feed();
  portalSetup();
  webServer.begin();

  if (portalMode) {
    portalStartMs = millis();
    Serial.printf("[WEB] Portal cautivo en http://%s/\n", WiFi.softAPIP().toString().c_str());
  } else {
    Serial.printf("[WEB] Portal en http://%s/\n", WiFi.localIP().toString().c_str());

    Serial.println("[SETUP] 4/5 MQTT...");
    _wdt_feed();
    if (baseCfg.configured) {
      mqttSetup();
      mqtt.setServer(baseCfg.mqttHost, baseCfg.mqttPort);
      mqttConnect();
    }
  }

  Serial.println("[SETUP] 5/5 Display + LVGL...");
  _wdt_feed();
  logic_setup();

  Serial.println("[READY] Cocina Display operativo\n");
  Serial.flush();
}

void loop() {
  _wdt_feed();

  // LVGL siempre corre — el display funciona con o sin WiFi
  logic_loop();

  if (portalMode) {
    dnsServer.processNextRequest();
    webServer.handleClient();
    if (portalStartMs == 0) portalStartMs = millis();
    if (millis() - portalStartMs > WIFI_PORTAL_TIMEOUT) {
      Serial.println("[BASE] Portal timeout — reiniciando...");
      delay(500);
      ESP.restart();
    }
    return;
  }
  portalStartMs = 0;

  webServer.handleClient();
  wifiHandleReconnect();
  mqttHandleReconnect();
  mqttPublishStatus();
  otaHandle();
}
