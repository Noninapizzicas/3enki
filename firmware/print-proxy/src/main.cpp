/**
 * Enki ESP32 Firmware — Arquitectura BASE + LÓGICA
 *
 * main.cpp es el punto de entrada que cablea la BASE (plataforma)
 * con la LÓGICA (driver específico del dispositivo).
 *
 * BASE:   WiFi multi-red, MQTT, Portal web, NVS, OTA, Watchdog, LED
 * LÓGICA: Print Proxy (MQTT ←→ BLE thermal printer bridge)
 *
 * Para crear un nuevo tipo de dispositivo, reemplaza
 * logic_print_proxy.cpp por tu propio logic_*.cpp
 * que implemente las 4 funciones del contrato enki_logic.h.
 */

#include "enki_base.h"
#include "enki_logic.h"

void setup() {
  Serial.begin(115200);
  delay(500);
  pinMode(LED_PIN, OUTPUT);

  Serial.println("\n========================================");
  Serial.println("  Enki ESP32 — Print Proxy v3.0");
  Serial.println("  Arquitectura BASE + LOGICA");
  Serial.println("========================================\n");

  // Watchdog — reinicia si se queda colgado
  esp_task_wdt_init(WDT_TIMEOUT_SEC, true);
  esp_task_wdt_add(NULL);

  // 1. Cargar config base de NVS
  baseConfigLoad();

  // 2. WiFi multi-red o portal cautivo
  baseSetupWiFi();

  // 3. Portal web (endpoints base)
  basePortalSetup();
  webServer.begin();

  if (portalMode) {
    Serial.printf("[WEB] Portal cautivo en http://%s/\n", WiFi.softAPIP().toString().c_str());
    Serial.println("[!] Conectate al AP y abre el portal para configurar WiFi");
  } else {
    Serial.printf("[WEB] Portal en http://%s/\n", WiFi.localIP().toString().c_str());

    // 4. MQTT
    if (baseCfg.configured) {
      baseSetupMQTT();
      mqtt.setServer(baseCfg.mqttHost, baseCfg.mqttPort);
      baseConnectMQTT();
    } else {
      Serial.println("\n[!] No configurado. Abre el portal web para configurar.");
    }
  }

  // 5. Inicializar la LÓGICA (driver)
  // Siempre se llama, incluso en portal mode, para que registre sus endpoints web
  logic_setup();

  Serial.println("[READY] Enki operativo\n");
}

void loop() {
  // Watchdog feed
  esp_task_wdt_reset();

  // DNS para captive portal (solo en modo AP)
  if (portalMode) {
    dnsServer.processNextRequest();
  }

  // Servir portal web
  webServer.handleClient();

  // Si estamos en modo portal, no hay más que hacer
  if (portalMode) return;

  // --- BASE: WiFi monitoring ---
  baseHandleWifiReconnect();

  // --- BASE: MQTT reconnect + loop ---
  baseHandleMqttReconnect();

  // --- BASE: Status periódico ---
  basePublishStatus();

  // --- BASE: OTA check ---
  baseCheckOTA();

  // --- LÓGICA: ciclo del driver ---
  logic_loop();
}
