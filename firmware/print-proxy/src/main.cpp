/**
 * Enki ESP32 Firmware — Arquitectura BASE + LÓGICA
 *
 * main.cpp es el punto de entrada que cablea los subsistemas
 * de la BASE con la LÓGICA (driver específico del dispositivo).
 *
 * BASE (5 módulos):
 *   enki_base    — Config NVS + servicios enki_* para la LÓGICA
 *   enki_wifi    — WiFi multi-red + reconexión non-blocking + portal AP
 *   enki_mqtt    — MQTT + cola offline + birth/LWT + shadow + status
 *   enki_ota     — OTA via shadow delta + legacy polling
 *   enki_portal  — Portal web + captive portal detection
 *
 * LÓGICA: Print Proxy (MQTT <-> BLE thermal printer bridge)
 *
 * Para crear un nuevo tipo de dispositivo, reemplaza
 * logic_print_proxy.cpp por tu propio logic_*.cpp
 * que implemente las 5 funciones del contrato enki_logic.h.
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
  pinMode(LED_PIN, OUTPUT);

  Serial.println("\n========================================");
  Serial.println("  Enki ESP32 — Print Proxy v3.0");
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
    Serial.printf("[!] Conectate al AP y abre el portal para configurar WiFi (timeout %ds)\n", WIFI_PORTAL_TIMEOUT / 1000);
  } else {
    Serial.printf("[WEB] Portal en http://%s/\n", WiFi.localIP().toString().c_str());

    // 4. MQTT
    if (baseCfg.configured) {
      mqttSetup();
      mqtt.setServer(baseCfg.mqttHost, baseCfg.mqttPort);
      mqttConnect();
    } else {
      Serial.println("\n[!] No configurado. Abre el portal web para configurar.");
    }
  }

  // 5. Inicializar la LÓGICA (driver)
  logic_setup();

  Serial.println("[READY] Enki operativo\n");
}

void loop() {
  esp_task_wdt_reset();

  // DNS captive portal
  if (portalMode) {
    dnsServer.processNextRequest();
  }

  // Portal web
  webServer.handleClient();

  // Portal timeout
  if (portalMode) {
    if (portalStartMs == 0) portalStartMs = millis();
    if (millis() - portalStartMs > WIFI_PORTAL_TIMEOUT) {
      Serial.println("[BASE] Portal timeout — reiniciando...");
      delay(500);
      ESP.restart();
    }
    return;
  }
  portalStartMs = 0;

  // WiFi reconnect (non-blocking)
  wifiHandleReconnect();

  // MQTT reconnect + loop
  mqttHandleReconnect();

  // Status periódico
  mqttPublishStatus();

  // OTA
  otaHandle();

  // LÓGICA
  logic_loop();
}
