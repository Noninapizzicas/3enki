/**
 * {{PROJECT_NAME}} — Bootstrap OTA
 *
 * Firmware base para ESP32. Se flashea una sola vez por USB.
 * Despues, todo se actualiza via OTA desde el sistema Enki.
 *
 * Flujo:
 *   1. Lee config de NVS (o usa defaults de config.h)
 *   2. WiFi dual (primaria + fallback). Si ambas fallan → portal cautivo
 *   3. Portal web en http://<ip>/ para configurar WiFi, MQTT, identidad
 *   4. MQTT: birth message + heartbeat + suscripcion a desired state
 *   5. OTA: cuando Enki publica firmware nuevo via shadow, descarga por HTTP
 *
 * Toda la config se gestiona desde el portal web y se guarda en NVS (flash).
 * No necesitas editar codigo para cada instalacion.
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
#include "portal.h"

// ============================================
// Estado global
// ============================================

BootstrapConfig cfg;
Preferences prefs;
WebServer webServer(PORTAL_PORT);
WiFiClient wifiClient;
WiFiClient otaClient;        // cliente separado para OTA (no bloquea MQTT)
PubSubClient mqtt(wifiClient);
DNSServer dnsServer;

// MQTT topics (construidos en runtime desde config)
char topicBirth[96];
char topicReported[96];
char topicDesired[96];
char topicLwt[96];

unsigned long lastHeartbeatMs   = 0;
unsigned long lastReconnectMs   = 0;
unsigned long lastWifiCheckMs   = 0;

bool portalMode   = false;
bool otaInProgress = false;

// ============================================
// Config — Load / Save NVS
// ============================================

void configLoad() {
  prefs.begin(NVS_NAMESPACE, true);  // read-only

  strlcpy(cfg.deviceId,  prefs.getString("deviceId",  DEFAULT_DEVICE_ID).c_str(),  sizeof(cfg.deviceId));
  strlcpy(cfg.projectId, prefs.getString("projectId", DEFAULT_PROJECT_ID).c_str(), sizeof(cfg.projectId));
  strlcpy(cfg.mqttHost,  prefs.getString("mqttHost",  DEFAULT_MQTT_HOST).c_str(),  sizeof(cfg.mqttHost));
  cfg.mqttPort =          prefs.getUShort("mqttPort",  DEFAULT_MQTT_PORT);
  strlcpy(cfg.mqttUser,  prefs.getString("mqttUser",  DEFAULT_MQTT_USER).c_str(),  sizeof(cfg.mqttUser));
  strlcpy(cfg.mqttPass,  prefs.getString("mqttPass",  DEFAULT_MQTT_PASS).c_str(),  sizeof(cfg.mqttPass));
  cfg.httpPort =          prefs.getUShort("httpPort",  DEFAULT_HTTP_PORT);

  // Cargar las 2 redes WiFi
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char keyS[16], keyP[16];
    snprintf(keyS, sizeof(keyS), "wifiSsid%d", i);
    snprintf(keyP, sizeof(keyP), "wifiPass%d", i);
    strlcpy(cfg.wifi[i].ssid, prefs.getString(keyS, "").c_str(), sizeof(cfg.wifi[i].ssid));
    strlcpy(cfg.wifi[i].pass, prefs.getString(keyP, "").c_str(), sizeof(cfg.wifi[i].pass));
  }
  cfg.wifiActive = -1;
  prefs.end();

  cfg.configured = (strlen(cfg.mqttHost) > 0);

  Serial.printf("[CFG] device=%s project=%s mqtt=%s:%d http=%d configured=%s\n",
    cfg.deviceId, cfg.projectId, cfg.mqttHost, cfg.mqttPort, cfg.httpPort,
    cfg.configured ? "SI" : "NO");
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    if (strlen(cfg.wifi[i].ssid) > 0)
      Serial.printf("[CFG] WiFi[%d] = %s\n", i, cfg.wifi[i].ssid);
  }
}

void configSave() {
  prefs.begin(NVS_NAMESPACE, false);  // read-write

  prefs.putString("deviceId",  cfg.deviceId);
  prefs.putString("projectId", cfg.projectId);
  prefs.putString("mqttHost",  cfg.mqttHost);
  prefs.putUShort("mqttPort",  cfg.mqttPort);
  prefs.putString("mqttUser",  cfg.mqttUser);
  prefs.putString("mqttPass",  cfg.mqttPass);
  prefs.putUShort("httpPort",  cfg.httpPort);

  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char keyS[16], keyP[16];
    snprintf(keyS, sizeof(keyS), "wifiSsid%d", i);
    snprintf(keyP, sizeof(keyP), "wifiPass%d", i);
    prefs.putString(keyS, cfg.wifi[i].ssid);
    prefs.putString(keyP, cfg.wifi[i].pass);
  }
  prefs.end();

  cfg.configured = (strlen(cfg.mqttHost) > 0);
  Serial.println("[CFG] Guardado en NVS");
}

// ============================================
// Device ID — genera desde MAC si esta vacio
// ============================================

void ensureDeviceId() {
  if (strlen(cfg.deviceId) > 0) return;

  uint8_t mac[6];
  WiFi.macAddress(mac);
  snprintf(cfg.deviceId, sizeof(cfg.deviceId), "enki-%02x%02x%02x%02x%02x%02x",
    mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

  Serial.printf("[ID] Device ID generado: %s\n", cfg.deviceId);
  configSave();
}

// ============================================
// Build MQTT topics desde config
// ============================================

void buildTopics() {
  snprintf(topicBirth,    sizeof(topicBirth),    "devices/%s/%s/birth",          cfg.projectId, cfg.deviceId);
  snprintf(topicReported, sizeof(topicReported), "devices/%s/%s/state/reported", cfg.projectId, cfg.deviceId);
  snprintf(topicDesired,  sizeof(topicDesired),  "devices/%s/%s/state/desired",  cfg.projectId, cfg.deviceId);
  snprintf(topicLwt,      sizeof(topicLwt),      "devices/%s/%s/lwt",            cfg.projectId, cfg.deviceId);
}

// ============================================
// LED feedback
// ============================================

void ledOn()  { digitalWrite(LED_PIN, HIGH); }
void ledOff() { digitalWrite(LED_PIN, LOW);  }

void ledBlink(int times, int ms = 100) {
  for (int i = 0; i < times; i++) {
    ledOn(); delay(ms); ledOff(); delay(ms);
  }
}

// ============================================
// WiFi — Dual con fallback y portal cautivo
// ============================================

bool wifiTryConnect(int idx) {
  if (idx < 0 || idx >= WIFI_MAX_NETWORKS) return false;
  if (strlen(cfg.wifi[idx].ssid) == 0) return false;

  Serial.printf("[WiFi] Intentando red %d: %s...\n", idx + 1, cfg.wifi[idx].ssid);
  WiFi.begin(cfg.wifi[idx].ssid, cfg.wifi[idx].pass);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < WIFI_CONNECT_TIMEOUT) {
    delay(250);
    Serial.print(".");
    esp_task_wdt_reset();
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    cfg.wifiActive = idx;
    Serial.printf("[WiFi] Conectado a '%s' — IP: %s\n",
      cfg.wifi[idx].ssid, WiFi.localIP().toString().c_str());
    return true;
  }

  Serial.printf("[WiFi] Fallo conectar a '%s'\n", cfg.wifi[idx].ssid);
  WiFi.disconnect();
  return false;
}

bool wifiConnectMulti() {
  WiFi.mode(WIFI_STA);
  cfg.wifiActive = -1;

  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    if (wifiTryConnect(i)) return true;
  }

  Serial.println("[WiFi] Ninguna red disponible");
  return false;
}

void wifiStartPortal() {
  portalMode = true;
  WiFi.disconnect();
  WiFi.mode(WIFI_AP);

  String apName = String(WIFI_AP_NAME_PREFIX) + "-" + String((uint32_t)ESP.getEfuseMac(), HEX).substring(4);
  WiFi.softAP(apName.c_str());

  Serial.printf("[WiFi] Portal cautivo activo — SSID: %s  IP: %s\n",
    apName.c_str(), WiFi.softAPIP().toString().c_str());

  // DNS que resuelve todo al ESP32 (captive portal)
  dnsServer.start(53, "*", WiFi.softAPIP());
}

bool setupWiFi() {
  bool hasNetworks = false;
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    if (strlen(cfg.wifi[i].ssid) > 0) { hasNetworks = true; break; }
  }

  if (hasNetworks && wifiConnectMulti()) {
    portalMode = false;
    ledBlink(2);
    return true;
  }

  wifiStartPortal();
  return false;
}

// ============================================
// MQTT — Birth, Heartbeat, Desired State
// ============================================

void publishBirth() {
  JsonDocument doc;
  doc["device_id"]  = cfg.deviceId;
  doc["name"]       = cfg.deviceId;
  doc["type"]       = DEVICE_TYPE;
  doc["firmware"]   = FIRMWARE_VERSION;
  doc["ip"]         = WiFi.localIP().toString();
  doc["rssi"]       = WiFi.RSSI();
  doc["uptime"]     = millis() / 1000;
  doc["free_heap"]  = ESP.getFreeHeap();

  JsonArray caps = doc["capabilities"].to<JsonArray>();
  caps.add("wifi");
  caps.add("mqtt");
  caps.add("ota");

  char buf[384];
  serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topicBirth, buf, true);  // retained
  Serial.printf("[MQTT] Birth publicado: %s\n", cfg.deviceId);
}

void publishHeartbeat() {
  JsonDocument doc;
  doc["firmware"]   = FIRMWARE_VERSION;
  doc["ip"]         = WiFi.localIP().toString();
  doc["rssi"]       = WiFi.RSSI();
  doc["uptime"]     = millis() / 1000;
  doc["free_heap"]  = ESP.getFreeHeap();
  doc["wifi_ssid"]  = (cfg.wifiActive >= 0) ? cfg.wifi[cfg.wifiActive].ssid : "";

  char buf[256];
  serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topicReported, buf, true);  // retained
}

// ============================================
// OTA — Descarga firmware por HTTP
// ============================================

void performOta(const char* url, const char* expectedVersion) {
  if (otaInProgress) {
    Serial.println("[OTA] Ya hay un OTA en progreso");
    return;
  }

  // Construir URL completa: http://{mqttHost}:{httpPort}{path}
  char fullUrl[256];
  snprintf(fullUrl, sizeof(fullUrl), "http://%s:%d%s", cfg.mqttHost, cfg.httpPort, url);

  Serial.printf("[OTA] Descargando firmware: %s\n", fullUrl);
  Serial.printf("[OTA] Version actual: %s → nueva: %s\n", FIRMWARE_VERSION, expectedVersion);

  otaInProgress = true;
  ledOn();

  // Publicar estado: OTA iniciado
  {
    JsonDocument doc;
    doc["firmware"]   = FIRMWARE_VERSION;
    doc["ota_status"] = "downloading";
    doc["ota_target"] = expectedVersion;
    char buf[192];
    serializeJson(doc, buf, sizeof(buf));
    mqtt.publish(topicReported, buf, true);
    mqtt.loop();  // flush
  }

  // Ejecutar OTA via HTTP
  httpUpdate.setLedPin(LED_PIN, LOW);
  t_httpUpdate_return ret = httpUpdate.update(otaClient, fullUrl);

  // Si llegamos aqui, OTA fallo (si tiene exito el ESP reinicia automaticamente)
  otaInProgress = false;
  ledOff();

  const char* errMsg;
  switch (ret) {
    case HTTP_UPDATE_FAILED:
      errMsg = httpUpdate.getLastErrorString().c_str();
      Serial.printf("[OTA] Error: %s\n", errMsg);
      break;
    case HTTP_UPDATE_NO_UPDATES:
      errMsg = "No updates available";
      Serial.println("[OTA] No hay actualizaciones");
      break;
    default:
      errMsg = "Unknown error";
      break;
  }

  // Publicar estado: OTA fallo
  {
    JsonDocument doc;
    doc["firmware"]   = FIRMWARE_VERSION;
    doc["ota_status"] = "failed";
    doc["ota_error"]  = errMsg;
    char buf[256];
    serializeJson(doc, buf, sizeof(buf));
    mqtt.publish(topicReported, buf, true);
  }
}

// ============================================
// MQTT Callback — Procesar desired state
// ============================================

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  Serial.printf("[MQTT] Mensaje recibido (%d bytes) en %s\n", length, topic);

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.printf("[MQTT] Error JSON: %s\n", err.c_str());
    return;
  }

  // Verificar si es un update de firmware (shadow pattern)
  if (doc["firmware"]["version"].is<const char*>()) {
    const char* newVersion = doc["firmware"]["version"];
    if (strcmp(newVersion, FIRMWARE_VERSION) != 0) {
      const char* url = doc["firmware"]["url"];
      if (url && strlen(url) > 0) {
        Serial.printf("[OTA] Firmware nuevo disponible: %s → %s\n", FIRMWARE_VERSION, newVersion);
        performOta(url, newVersion);
      }
    }
  }
}

void connectMQTT() {
  if (mqtt.connected()) return;
  if (strlen(cfg.mqttHost) == 0) return;

  Serial.printf("[MQTT] Conectando a %s:%d...\n", cfg.mqttHost, cfg.mqttPort);

  String clientId = "enki-boot-" + String(cfg.deviceId);

  bool connected;
  if (strlen(cfg.mqttUser) > 0) {
    connected = mqtt.connect(clientId.c_str(), cfg.mqttUser, cfg.mqttPass,
                             topicLwt, 1, true, "{\"status\":\"offline\"}");
  } else {
    connected = mqtt.connect(clientId.c_str(), nullptr, nullptr,
                             topicLwt, 1, true, "{\"status\":\"offline\"}");
  }

  if (connected) {
    Serial.println("[MQTT] Conectado");

    // Suscribir a desired state (para recibir OTA y comandos)
    mqtt.subscribe(topicDesired);
    Serial.printf("[MQTT] Suscrito a: %s\n", topicDesired);

    // Publicar birth
    publishBirth();
    publishHeartbeat();
    ledBlink(1, 500);
  } else {
    Serial.printf("[MQTT] Fallo (rc=%d)\n", mqtt.state());
  }
}

void reconnectServices() {
  if (mqtt.connected()) mqtt.disconnect();
  buildTopics();
  mqtt.setServer(cfg.mqttHost, cfg.mqttPort);
  connectMQTT();
}

// ============================================
// Portal web — API endpoints
// ============================================

void handleRoot() {
  webServer.send_P(200, "text/html", PORTAL_HTML);
}

void handleGetConfig() {
  JsonDocument doc;
  doc["device_id"]   = cfg.deviceId;
  doc["project_id"]  = cfg.projectId;
  doc["firmware"]    = FIRMWARE_VERSION;

  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char keyS[16], keyP[16];
    snprintf(keyS, sizeof(keyS), "wifi_ssid%d", i + 1);
    snprintf(keyP, sizeof(keyP), "wifi_pass%d", i + 1);
    doc[keyS] = cfg.wifi[i].ssid;
    doc[keyP] = cfg.wifi[i].pass;
  }
  doc["wifi_active"] = (cfg.wifiActive >= 0) ? cfg.wifi[cfg.wifiActive].ssid : "ninguna";
  doc["mqtt_host"]   = cfg.mqttHost;
  doc["mqtt_port"]   = cfg.mqttPort;
  doc["http_port"]   = cfg.httpPort;
  doc["mqtt_user"]   = cfg.mqttUser;
  doc["mqtt_pass"]   = cfg.mqttPass;
  doc["ip"]          = portalMode ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
  doc["portal_mode"] = portalMode;

  unsigned long up = millis() / 1000;
  char upStr[32];
  snprintf(upStr, sizeof(upStr), "%luh %lum", up / 3600, (up % 3600) / 60);
  doc["uptime"] = upStr;

  char buf[512];
  serializeJson(doc, buf, sizeof(buf));
  webServer.send(200, "application/json", buf);
}

void handlePostConfig() {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, webServer.arg("plain"));
  if (err) {
    webServer.send(400, "application/json", "{\"ok\":false,\"error\":\"JSON invalido\"}");
    return;
  }

  if (doc["device_id"].is<const char*>())   strlcpy(cfg.deviceId,  doc["device_id"],  sizeof(cfg.deviceId));
  if (doc["project_id"].is<const char*>())  strlcpy(cfg.projectId, doc["project_id"], sizeof(cfg.projectId));

  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char keyS[16], keyP[16];
    snprintf(keyS, sizeof(keyS), "wifi_ssid%d", i + 1);
    snprintf(keyP, sizeof(keyP), "wifi_pass%d", i + 1);
    if (doc[keyS].is<const char*>()) strlcpy(cfg.wifi[i].ssid, doc[keyS], sizeof(cfg.wifi[i].ssid));
    if (doc[keyP].is<const char*>()) strlcpy(cfg.wifi[i].pass, doc[keyP], sizeof(cfg.wifi[i].pass));
  }

  if (doc["mqtt_host"].is<const char*>()) strlcpy(cfg.mqttHost, doc["mqtt_host"], sizeof(cfg.mqttHost));
  if (doc["mqtt_port"].is<int>())         cfg.mqttPort = doc["mqtt_port"];
  if (doc["http_port"].is<int>())         cfg.httpPort = doc["http_port"];
  if (doc["mqtt_user"].is<const char*>()) strlcpy(cfg.mqttUser, doc["mqtt_user"], sizeof(cfg.mqttUser));
  if (doc["mqtt_pass"].is<const char*>()) strlcpy(cfg.mqttPass, doc["mqtt_pass"], sizeof(cfg.mqttPass));

  configSave();

  // Si estamos en portal cautivo y ahora hay redes, reiniciar para conectar
  if (portalMode) {
    bool hasNetworks = false;
    for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
      if (strlen(cfg.wifi[i].ssid) > 0) { hasNetworks = true; break; }
    }
    if (hasNetworks) {
      webServer.send(200, "application/json", "{\"ok\":true,\"msg\":\"Guardado. Reiniciando para conectar WiFi...\"}");
      delay(1000);
      ESP.restart();
      return;
    }
  }

  reconnectServices();
  webServer.send(200, "application/json", "{\"ok\":true,\"msg\":\"Guardado y reconectado\"}");
}

void handleGetStatus() {
  JsonDocument doc;
  doc["wifi"]      = (WiFi.status() == WL_CONNECTED);
  doc["mqtt"]      = mqtt.connected();
  doc["ota_ready"] = (WiFi.status() == WL_CONNECTED && cfg.configured && !otaInProgress);
  doc["portal"]    = portalMode;

  char buf[128];
  serializeJson(doc, buf, sizeof(buf));
  webServer.send(200, "application/json", buf);
}

void handleWifiScan() {
  Serial.println("[WiFi] Escaneando redes...");
  int n = WiFi.scanNetworks(false, false, false, 300);

  JsonDocument doc;
  auto arr = doc.to<JsonArray>();

  for (int i = 0; i < n; i++) {
    JsonObject obj = arr.add<JsonObject>();
    obj["ssid"] = WiFi.SSID(i);
    obj["rssi"] = WiFi.RSSI(i);
    obj["open"] = (WiFi.encryptionType(i) == WIFI_AUTH_OPEN);
    for (int j = 0; j < WIFI_MAX_NETWORKS; j++) {
      if (strlen(cfg.wifi[j].ssid) > 0 && WiFi.SSID(i) == cfg.wifi[j].ssid) {
        obj["configured"] = j + 1;
        break;
      }
    }
  }
  WiFi.scanDelete();

  char buf[1024];
  serializeJson(doc, buf, sizeof(buf));
  webServer.send(200, "application/json", buf);
  Serial.printf("[WiFi] Scan: %d redes encontradas\n", n);
}

void handleReset() {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.clear();
  prefs.end();
  webServer.send(200, "application/json", "{\"ok\":true}");
  delay(1000);
  ESP.restart();
}

void portalSetup() {
  webServer.on("/",                HTTP_GET,  handleRoot);
  webServer.on("/api/config",      HTTP_GET,  handleGetConfig);
  webServer.on("/api/config",      HTTP_POST, handlePostConfig);
  webServer.on("/api/status",      HTTP_GET,  handleGetStatus);
  webServer.on("/api/wifi-scan",   HTTP_GET,  handleWifiScan);
  webServer.on("/api/reset",       HTTP_POST, handleReset);
}

// ============================================
// Setup
// ============================================

void setup() {
  Serial.begin(115200);
  delay(500);
  pinMode(LED_PIN, OUTPUT);

  Serial.println("\n========================================");
  Serial.println("  Enki Bootstrap OTA v" FIRMWARE_VERSION);
  Serial.println("  Dual WiFi + Portal Cautivo + OTA");
  Serial.println("========================================\n");

  // Watchdog
  esp_task_wdt_init(WDT_TIMEOUT_SEC, true);
  esp_task_wdt_add(NULL);

  // 1. Config desde NVS
  configLoad();

  // 2. WiFi dual o portal cautivo
  bool wifiOk = setupWiFi();

  // 3. Generar device ID desde MAC si esta vacio
  ensureDeviceId();
  buildTopics();

  // 4. Portal web (siempre disponible, en STA o AP mode)
  portalSetup();
  webServer.begin();

  if (portalMode) {
    Serial.printf("[WEB] Portal cautivo en http://%s/\n", WiFi.softAPIP().toString().c_str());
    Serial.println("[!] Conectate al AP 'Enki-Setup-XXXX' y configura WiFi + MQTT");
  } else {
    Serial.printf("[WEB] Portal en http://%s/\n", WiFi.localIP().toString().c_str());

    // 5. MQTT (solo si hay config y WiFi)
    mqtt.setCallback(onMqttMessage);
    mqtt.setBufferSize(1024);
    if (cfg.configured) {
      mqtt.setServer(cfg.mqttHost, cfg.mqttPort);
      connectMQTT();
    } else {
      Serial.println("\n[!] No configurado. Abre el portal web para configurar:");
      Serial.printf("    http://%s/\n\n", WiFi.localIP().toString().c_str());
    }
  }

  Serial.println("[READY] Bootstrap OTA operativo\n");
}

// ============================================
// Loop
// ============================================

void loop() {
  esp_task_wdt_reset();

  // DNS para captive portal (solo en modo AP)
  if (portalMode) {
    dnsServer.processNextRequest();
  }

  // Servir portal web
  webServer.handleClient();

  // En modo portal, no hay mas que hacer
  if (portalMode) return;

  unsigned long now = millis();

  // --- WiFi monitoring ---
  if (now - lastWifiCheckMs > WIFI_CHECK_INTERVAL) {
    lastWifiCheckMs = now;
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[WiFi] Desconectado, reconectando...");
      if (!wifiConnectMulti()) {
        Serial.println("[WiFi] Todas las redes fallaron. Reiniciando en 10s...");
        delay(10000);
        ESP.restart();
      }
    }
  }

  // --- MQTT ---
  if (cfg.configured && !otaInProgress) {
    if (!mqtt.connected()) {
      now = millis();
      if (now - lastReconnectMs > MQTT_RECONNECT_MS) {
        lastReconnectMs = now;
        connectMQTT();
      }
    }
    mqtt.loop();

    // Heartbeat periodico
    now = millis();
    if (now - lastHeartbeatMs > HEARTBEAT_INTERVAL_MS) {
      lastHeartbeatMs = now;
      if (mqtt.connected()) publishHeartbeat();
    }
  }
}
