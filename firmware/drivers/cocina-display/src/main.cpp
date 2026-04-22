/**
 * Enki ESP32 Firmware — Cocina Display
 *
 * Board:  Guition JC8012P4A1 (ESP32-P4 + ESP32-C6)
 * Panel:  JD9365 MIPI-DSI 800x1280
 * Touch:  GT911 I2C
 *
 * Sin portal web cautivo. La configuración inicial se hace desde la
 * pantalla táctil nativa (ui_setup). App cocina arranca si está configurado.
 */

#include "enki_base.h"
#include "enki_wifi.h"
#include "enki_mqtt.h"
#include "enki_ota.h"
#include "enki_logic.h"
#include <esp_task_wdt.h>

static inline void _wdt_feed() {
    if (esp_task_wdt_status(NULL) == ESP_OK) {
        esp_task_wdt_reset();
    }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n========================================");
  Serial.println("  Enki ESP32 — Cocina Display v1.3");
  Serial.println("  Guition JC8012P4A1");
  Serial.println("========================================\n");
  Serial.flush();

  Serial.println("[SETUP] 1/4 Config NVS...");
  _wdt_feed();
  baseConfigLoad();

  Serial.println("[SETUP] 2/4 WiFi...");
  _wdt_feed();
  wifiSetPortalEnabled(false);
  wifiSetup();

  Serial.println("[SETUP] 3/4 MQTT...");
  _wdt_feed();
  if (baseCfg.configured && WiFi.status() == WL_CONNECTED) {
    mqttSetup();
    mqtt.setServer(baseCfg.mqttHost, baseCfg.mqttPort);
    mqttConnect();
  }

  Serial.println("[SETUP] 4/4 Display + LVGL...");
  _wdt_feed();
  logic_setup();

  Serial.println("[READY] Cocina Display operativo\n");
  Serial.flush();
}

void loop() {
  _wdt_feed();
  wifiHandleReconnect();
  if (baseCfg.configured) {
    mqttHandleReconnect();
    mqttPublishStatus();
  }
  otaHandle();
  logic_loop();
}
