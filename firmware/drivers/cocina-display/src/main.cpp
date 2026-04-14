/**
 * Enki ESP32 Firmware — Cocina Display (Kiosk Web)
 *
 * Arquitectura BASE + LÓGICA
 *
 * BASE (librería compartida enki-base):
 *   enki_base    — Config NVS + servicios enki_*
 *   enki_wifi    — WiFi multi-red + reconexión
 *   enki_mqtt    — MQTT + cola offline + birth/LWT
 *   enki_ota     — OTA via shadow
 *   enki_portal  — Portal web de configuración
 *
 * LÓGICA: Cocina Display
 *   - Inicializa display MIPI-DSI + touch
 *   - Muestra pantalla de estado mientras conecta WiFi/MQTT
 *   - Una vez conectado, carga la URL /cocina del VPS
 *   - Mantiene kiosk mode (no se puede salir de la página)
 *   - Reporta status: WiFi RSSI, heap, display state
 *
 * Hardware: ESP32-P4 + 10.1" 800x1280
 */

#include "enki_base.h"
#include "enki_wifi.h"
#include "enki_mqtt.h"
#include "enki_ota.h"
#include "enki_portal.h"
#include "enki_logic.h"
#include <esp_task_wdt.h>

static unsigned long portalStartMs = 0;

void setup() {
  Serial.begin(115200);
  delay(500);

  if (LED_PIN >= 0) pinMode(LED_PIN, OUTPUT);

  Serial.println("\n========================================");
  Serial.println("  Enki ESP32 — Cocina Display v1.0");
  Serial.println("  Arquitectura BASE + LOGICA");
  Serial.println("========================================\n");

  // Watchdog
  esp_task_wdt_init(WDT_TIMEOUT_SEC, true);
  esp_task_wdt_add(NULL);

  // 1. Config NVS
  baseConfigLoad();

  // 2. WiFi
  wifiSetup();

  // 3. Portal web
  portalSetup();
  webServer.begin();

  if (portalMode) {
    portalStartMs = millis();
    Serial.printf("[WEB] Portal cautivo en http://%s/\n", WiFi.softAPIP().toString().c_str());
  } else {
    Serial.printf("[WEB] Portal en http://%s/\n", WiFi.localIP().toString().c_str());

    // 4. MQTT
    if (baseCfg.configured) {
      mqttSetup();
      mqtt.setServer(baseCfg.mqttHost, baseCfg.mqttPort);
      mqttConnect();
    }
  }

  // 5. Inicializar la LÓGICA (display + kiosk)
  logic_setup();

  Serial.println("[READY] Cocina Display operativo\n");
}

void loop() {
  esp_task_wdt_reset();

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

  // LÓGICA: actualizar display, procesar touch
  logic_loop();
}
