/**
 * {{PROJECT_NAME}} — Enki Node
 *
 * El ESP32 como un modulo mas del sistema Enki.
 * Habla el mismo protocolo MQTT que los modulos Node.js:
 *   - Escucha ui/request/node/{action}
 *   - Responde en ui/response/{request_id}
 *   - Emite y recibe eventos via core/*/events/...
 *
 * Handlers registrados:
 *   node/status     → estado del dispositivo
 *   node/config     → leer configuracion actual
 *   node/config-set → guardar configuracion
 *   node/wifi-scan  → escanear redes WiFi
 *   node/restart    → reiniciar dispositivo
 *
 * Eventos que escucha:
 *   firmware.ota_requested → descarga y aplica firmware via HTTP
 *
 * Flujo inicial:
 *   Flash USB → portal cautivo → config WiFi+MQTT → modulo activo
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
#include "enki_module.h"

// ============================================
// Estado global
// ============================================

NodeConfig cfg;
Preferences prefs;
WebServer webServer(PORTAL_PORT);
WiFiClient wifiClient;
WiFiClient otaClient;
PubSubClient mqtt(wifiClient);
DNSServer dnsServer;

// El modulo Enki (se inicializa en setup con el deviceId correcto)
EnkiModule* mod = nullptr;

unsigned long lastHeartbeatMs = 0;
unsigned long lastReconnectMs = 0;
unsigned long lastWifiCheckMs = 0;
bool portalMode = false;

// ============================================
// Forward declarations
// ============================================

int handleStatus(JsonDocument& req, JsonDocument& res);
int handleConfig(JsonDocument& req, JsonDocument& res);
int handleConfigSet(JsonDocument& req, JsonDocument& res);
int handleWifiScan(JsonDocument& req, JsonDocument& res);
int handleRestart(JsonDocument& req, JsonDocument& res);
void onOtaRequested(JsonDocument& data);

// ============================================
// Config — NVS Load / Save
// ============================================

void configLoad() {
  prefs.begin(NVS_NAMESPACE, true);
  strlcpy(cfg.deviceId,  prefs.getString("deviceId",  DEFAULT_DEVICE_ID).c_str(),  sizeof(cfg.deviceId));
  strlcpy(cfg.projectId, prefs.getString("projectId", DEFAULT_PROJECT_ID).c_str(), sizeof(cfg.projectId));
  strlcpy(cfg.mqttHost,  prefs.getString("mqttHost",  DEFAULT_MQTT_HOST).c_str(),  sizeof(cfg.mqttHost));
  cfg.mqttPort =          prefs.getUShort("mqttPort",  DEFAULT_MQTT_PORT);
  strlcpy(cfg.mqttUser,  prefs.getString("mqttUser",  DEFAULT_MQTT_USER).c_str(),  sizeof(cfg.mqttUser));
  strlcpy(cfg.mqttPass,  prefs.getString("mqttPass",  DEFAULT_MQTT_PASS).c_str(),  sizeof(cfg.mqttPass));
  cfg.httpPort =          prefs.getUShort("httpPort",  DEFAULT_HTTP_PORT);
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char ks[16], kp[16];
    snprintf(ks, sizeof(ks), "wifiSsid%d", i);
    snprintf(kp, sizeof(kp), "wifiPass%d", i);
    strlcpy(cfg.wifi[i].ssid, prefs.getString(ks, "").c_str(), sizeof(cfg.wifi[i].ssid));
    strlcpy(cfg.wifi[i].pass, prefs.getString(kp, "").c_str(), sizeof(cfg.wifi[i].pass));
  }
  cfg.wifiActive = -1;
  prefs.end();
  cfg.configured = (strlen(cfg.mqttHost) > 0);
}

void configSave() {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.putString("deviceId",  cfg.deviceId);
  prefs.putString("projectId", cfg.projectId);
  prefs.putString("mqttHost",  cfg.mqttHost);
  prefs.putUShort("mqttPort",  cfg.mqttPort);
  prefs.putString("mqttUser",  cfg.mqttUser);
  prefs.putString("mqttPass",  cfg.mqttPass);
  prefs.putUShort("httpPort",  cfg.httpPort);
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char ks[16], kp[16];
    snprintf(ks, sizeof(ks), "wifiSsid%d", i);
    snprintf(kp, sizeof(kp), "wifiPass%d", i);
    prefs.putString(ks, cfg.wifi[i].ssid);
    prefs.putString(kp, cfg.wifi[i].pass);
  }
  prefs.end();
  cfg.configured = (strlen(cfg.mqttHost) > 0);
}

// ============================================
// Device ID — genera desde MAC si vacio
// ============================================

void ensureDeviceId() {
  if (strlen(cfg.deviceId) > 0) return;
  uint8_t mac[6];
  WiFi.macAddress(mac);
  snprintf(cfg.deviceId, sizeof(cfg.deviceId), "enki-%02x%02x%02x%02x%02x%02x",
    mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
  configSave();
  Serial.printf("[node] Device ID: %s\n", cfg.deviceId);
}

// ============================================
// LED
// ============================================

void ledBlink(int times, int ms = 100) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH); delay(ms);
    digitalWrite(LED_PIN, LOW);  delay(ms);
  }
}

// ============================================
// WiFi — Dual con fallback + portal cautivo
// ============================================

bool wifiTryConnect(int idx) {
  if (idx < 0 || idx >= WIFI_MAX_NETWORKS) return false;
  if (strlen(cfg.wifi[idx].ssid) == 0) return false;

  Serial.printf("[wifi] Red %d: %s...", idx + 1, cfg.wifi[idx].ssid);
  WiFi.begin(cfg.wifi[idx].ssid, cfg.wifi[idx].pass);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < WIFI_CONNECT_TIMEOUT) {
    delay(250); Serial.print("."); esp_task_wdt_reset();
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    cfg.wifiActive = idx;
    Serial.printf("[wifi] OK — IP: %s\n", WiFi.localIP().toString().c_str());
    return true;
  }
  WiFi.disconnect();
  return false;
}

bool wifiConnectMulti() {
  WiFi.mode(WIFI_STA);
  cfg.wifiActive = -1;
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    if (wifiTryConnect(i)) return true;
  }
  return false;
}

void wifiStartPortal() {
  portalMode = true;
  WiFi.disconnect();
  WiFi.mode(WIFI_AP);
  String apName = String(WIFI_AP_NAME_PREFIX) + "-" + String((uint32_t)ESP.getEfuseMac(), HEX).substring(4);
  WiFi.softAP(apName.c_str());
  dnsServer.start(53, "*", WiFi.softAPIP());
  Serial.printf("[wifi] Portal cautivo: %s → %s\n", apName.c_str(), WiFi.softAPIP().toString().c_str());
}

bool setupWiFi() {
  bool hasNets = false;
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++)
    if (strlen(cfg.wifi[i].ssid) > 0) { hasNets = true; break; }

  if (hasNets && wifiConnectMulti()) {
    portalMode = false;
    ledBlink(2);
    return true;
  }
  wifiStartPortal();
  return false;
}

// ============================================
// MQTT — Conexion como modulo Enki
// ============================================

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  if (mod) mod->onMessage(topic, payload, length);
}

void connectMQTT() {
  if (mqtt.connected()) return;
  if (!cfg.configured) return;

  Serial.printf("[mqtt] Conectando a %s:%d...\n", cfg.mqttHost, cfg.mqttPort);
  String clientId = "enki-node-" + String(cfg.deviceId);

  bool ok;
  if (strlen(cfg.mqttUser) > 0)
    ok = mqtt.connect(clientId.c_str(), cfg.mqttUser, cfg.mqttPass);
  else
    ok = mqtt.connect(clientId.c_str());

  if (ok) {
    Serial.println("[mqtt] Conectado");
    mod->begin();  // suscribe a topics del modulo
    ledBlink(1, 500);

    // Emitir evento: modulo online
    JsonDocument data;
    data["device_id"] = cfg.deviceId;
    data["type"] = DEVICE_TYPE;
    data["firmware"] = MODULE_VERSION;
    data["ip"] = WiFi.localIP().toString();
    data["capabilities"][0] = "wifi";
    data["capabilities"][1] = "mqtt";
    data["capabilities"][2] = "ota";
    mod->emit("device.online", data);
  } else {
    Serial.printf("[mqtt] Fallo (rc=%d)\n", mqtt.state());
  }
}

// ============================================
// UI Handlers — Lo que el modulo sabe hacer
// ============================================

int handleStatus(JsonDocument& req, JsonDocument& res) {
  res["device_id"]  = cfg.deviceId;
  res["project_id"] = cfg.projectId;
  res["type"]       = DEVICE_TYPE;
  res["firmware"]   = MODULE_VERSION;
  res["ip"]         = WiFi.localIP().toString();
  res["rssi"]       = WiFi.RSSI();
  res["uptime_sec"] = millis() / 1000;
  res["free_heap"]  = ESP.getFreeHeap();
  res["wifi_ssid"]  = (cfg.wifiActive >= 0) ? cfg.wifi[cfg.wifiActive].ssid : "";
  res["mqtt"]       = mqtt.connected();
  res["portal"]     = portalMode;
  return 200;
}

int handleConfig(JsonDocument& req, JsonDocument& res) {
  res["device_id"]   = cfg.deviceId;
  res["project_id"]  = cfg.projectId;
  res["mqtt_host"]   = cfg.mqttHost;
  res["mqtt_port"]   = cfg.mqttPort;
  res["http_port"]   = cfg.httpPort;
  res["firmware"]    = MODULE_VERSION;
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char k[16];
    snprintf(k, sizeof(k), "wifi_ssid%d", i + 1);
    res[k] = cfg.wifi[i].ssid;
  }
  return 200;
}

int handleConfigSet(JsonDocument& req, JsonDocument& res) {
  if (req["device_id"].is<const char*>())   strlcpy(cfg.deviceId,  req["device_id"],  sizeof(cfg.deviceId));
  if (req["project_id"].is<const char*>())  strlcpy(cfg.projectId, req["project_id"], sizeof(cfg.projectId));
  if (req["mqtt_host"].is<const char*>())   strlcpy(cfg.mqttHost,  req["mqtt_host"],  sizeof(cfg.mqttHost));
  if (req["mqtt_port"].is<int>())           cfg.mqttPort = req["mqtt_port"];
  if (req["http_port"].is<int>())           cfg.httpPort = req["http_port"];

  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char ks[16], kp[16];
    snprintf(ks, sizeof(ks), "wifi_ssid%d", i + 1);
    snprintf(kp, sizeof(kp), "wifi_pass%d", i + 1);
    if (req[ks].is<const char*>()) strlcpy(cfg.wifi[i].ssid, req[ks], sizeof(cfg.wifi[i].ssid));
    if (req[kp].is<const char*>()) strlcpy(cfg.wifi[i].pass, req[kp], sizeof(cfg.wifi[i].pass));
  }

  configSave();
  res["saved"] = true;
  return 200;
}

int handleWifiScan(JsonDocument& req, JsonDocument& res) {
  int n = WiFi.scanNetworks(false, false, false, 300);
  JsonArray arr = res["networks"].to<JsonArray>();
  for (int i = 0; i < n && i < 20; i++) {
    JsonObject net = arr.add<JsonObject>();
    net["ssid"] = WiFi.SSID(i);
    net["rssi"] = WiFi.RSSI(i);
    net["open"] = (WiFi.encryptionType(i) == WIFI_AUTH_OPEN);
  }
  WiFi.scanDelete();
  return 200;
}

int handleRestart(JsonDocument& req, JsonDocument& res) {
  res["restarting"] = true;
  // Delay restart para que la respuesta llegue
  delay(500);
  ESP.restart();
  return 200;  // nunca llega
}

// ============================================
// Event Listener — OTA via firmware-manager
// ============================================

void onOtaRequested(JsonDocument& data) {
  const char* deviceId = data["device_id"];
  if (!deviceId || strcmp(deviceId, cfg.deviceId) != 0) return;  // no es para nosotros

  const char* url     = data["firmware_url"];
  const char* version = data["target_version"];
  if (!url || !version) return;

  Serial.printf("[ota] Firmware nuevo: %s → %s\n", MODULE_VERSION, version);

  // Construir URL completa
  char fullUrl[256];
  snprintf(fullUrl, sizeof(fullUrl), "http://%s:%d%s", cfg.mqttHost, cfg.httpPort, url);
  Serial.printf("[ota] Descargando: %s\n", fullUrl);

  // Notificar inicio
  JsonDocument evt;
  evt["device_id"] = cfg.deviceId;
  evt["status"]    = "downloading";
  evt["target"]    = version;
  mod->emit("node.ota_progress", evt);

  // Ejecutar OTA
  digitalWrite(LED_PIN, HIGH);
  t_httpUpdate_return ret = httpUpdate.update(otaClient, fullUrl);
  digitalWrite(LED_PIN, LOW);

  // Si llegamos aqui, fallo (exito = reinicio automatico)
  Serial.printf("[ota] Error: %s\n", httpUpdate.getLastErrorString().c_str());

  JsonDocument fail;
  fail["device_id"] = cfg.deviceId;
  fail["status"]    = "failed";
  fail["error"]     = httpUpdate.getLastErrorString();
  mod->emit("node.ota_progress", fail);
}

// ============================================
// Portal web — API endpoints (para config inicial)
// ============================================

void webHandleRoot()    { webServer.send_P(200, "text/html", PORTAL_HTML); }

void webHandleGetConfig() {
  JsonDocument doc;
  doc["device_id"]   = cfg.deviceId;
  doc["project_id"]  = cfg.projectId;
  doc["firmware"]    = MODULE_VERSION;
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char ks[16], kp[16];
    snprintf(ks, sizeof(ks), "wifi_ssid%d", i + 1);
    snprintf(kp, sizeof(kp), "wifi_pass%d", i + 1);
    doc[ks] = cfg.wifi[i].ssid;
    doc[kp] = cfg.wifi[i].pass;
  }
  doc["mqtt_host"] = cfg.mqttHost;
  doc["mqtt_port"] = cfg.mqttPort;
  doc["http_port"] = cfg.httpPort;
  doc["mqtt_user"] = cfg.mqttUser;
  doc["mqtt_pass"] = cfg.mqttPass;
  doc["ip"] = portalMode ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
  char buf[512];
  serializeJson(doc, buf, sizeof(buf));
  webServer.send(200, "application/json", buf);
}

void webHandlePostConfig() {
  JsonDocument doc;
  if (deserializeJson(doc, webServer.arg("plain"))) {
    webServer.send(400, "application/json", "{\"ok\":false}");
    return;
  }
  if (doc["device_id"].is<const char*>())   strlcpy(cfg.deviceId,  doc["device_id"],  sizeof(cfg.deviceId));
  if (doc["project_id"].is<const char*>())  strlcpy(cfg.projectId, doc["project_id"], sizeof(cfg.projectId));
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char ks[16], kp[16];
    snprintf(ks, sizeof(ks), "wifi_ssid%d", i + 1);
    snprintf(kp, sizeof(kp), "wifi_pass%d", i + 1);
    if (doc[ks].is<const char*>()) strlcpy(cfg.wifi[i].ssid, doc[ks], sizeof(cfg.wifi[i].ssid));
    if (doc[kp].is<const char*>()) strlcpy(cfg.wifi[i].pass, doc[kp], sizeof(cfg.wifi[i].pass));
  }
  if (doc["mqtt_host"].is<const char*>()) strlcpy(cfg.mqttHost, doc["mqtt_host"], sizeof(cfg.mqttHost));
  if (doc["mqtt_port"].is<int>())         cfg.mqttPort = doc["mqtt_port"];
  if (doc["http_port"].is<int>())         cfg.httpPort = doc["http_port"];
  if (doc["mqtt_user"].is<const char*>()) strlcpy(cfg.mqttUser, doc["mqtt_user"], sizeof(cfg.mqttUser));
  if (doc["mqtt_pass"].is<const char*>()) strlcpy(cfg.mqttPass, doc["mqtt_pass"], sizeof(cfg.mqttPass));
  configSave();

  if (portalMode) {
    webServer.send(200, "application/json", "{\"ok\":true,\"msg\":\"Reiniciando...\"}");
    delay(1000);
    ESP.restart();
    return;
  }
  webServer.send(200, "application/json", "{\"ok\":true,\"msg\":\"Guardado\"}");
}

void webHandleGetStatus() {
  JsonDocument doc;
  doc["wifi"] = (WiFi.status() == WL_CONNECTED);
  doc["mqtt"] = mqtt.connected();
  doc["enki"] = (mqtt.connected() && mod != nullptr);
  char buf[96];
  serializeJson(doc, buf, sizeof(buf));
  webServer.send(200, "application/json", buf);
}

void webHandleWifiScan() {
  int n = WiFi.scanNetworks(false, false, false, 300);
  JsonDocument doc;
  auto arr = doc.to<JsonArray>();
  for (int i = 0; i < n; i++) {
    JsonObject o = arr.add<JsonObject>();
    o["ssid"] = WiFi.SSID(i);
    o["rssi"] = WiFi.RSSI(i);
    o["open"] = (WiFi.encryptionType(i) == WIFI_AUTH_OPEN);
  }
  WiFi.scanDelete();
  char buf[1024];
  serializeJson(doc, buf, sizeof(buf));
  webServer.send(200, "application/json", buf);
}

void webHandleReset() {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.clear();
  prefs.end();
  webServer.send(200, "application/json", "{\"ok\":true}");
  delay(1000);
  ESP.restart();
}

// ============================================
// Setup
// ============================================

void setup() {
  Serial.begin(115200);
  delay(500);
  pinMode(LED_PIN, OUTPUT);

  Serial.println("\n========================================");
  Serial.println("  Enki Node v" MODULE_VERSION);
  Serial.println("  ESP32 como modulo del sistema");
  Serial.println("========================================\n");

  esp_task_wdt_init(WDT_TIMEOUT_SEC, true);
  esp_task_wdt_add(NULL);

  // 1. Config
  configLoad();
  setupWiFi();
  ensureDeviceId();

  // 2. Crear modulo Enki (usa deviceId como coreId)
  mod = new EnkiModule(mqtt, MODULE_DOMAIN, cfg.deviceId);

  // 3. Registrar handlers — lo que este modulo sabe hacer
  mod->handle("status",     handleStatus);
  mod->handle("config",     handleConfig);
  mod->handle("config-set", handleConfigSet);
  mod->handle("wifi-scan",  handleWifiScan);
  mod->handle("restart",    handleRestart);

  // 4. Registrar listeners — lo que este modulo escucha
  mod->onEvent("firmware.ota_requested", onOtaRequested);

  // 5. Portal web (siempre disponible)
  webServer.on("/",              HTTP_GET,  webHandleRoot);
  webServer.on("/api/config",    HTTP_GET,  webHandleGetConfig);
  webServer.on("/api/config",    HTTP_POST, webHandlePostConfig);
  webServer.on("/api/status",    HTTP_GET,  webHandleGetStatus);
  webServer.on("/api/wifi-scan", HTTP_GET,  webHandleWifiScan);
  webServer.on("/api/reset",     HTTP_POST, webHandleReset);
  webServer.begin();

  // 6. MQTT
  if (!portalMode && cfg.configured) {
    mqtt.setCallback(onMqttMessage);
    mqtt.setBufferSize(MQTT_BUFFER_SIZE);
    mqtt.setServer(cfg.mqttHost, cfg.mqttPort);
    connectMQTT();
  }

  Serial.printf("[node] %s listo (portal=%s mqtt=%s)\n",
    cfg.deviceId, portalMode ? "SI" : "NO", mqtt.connected() ? "SI" : "NO");
}

// ============================================
// Loop
// ============================================

void loop() {
  esp_task_wdt_reset();

  if (portalMode) {
    dnsServer.processNextRequest();
    webServer.handleClient();
    return;
  }

  webServer.handleClient();

  unsigned long now = millis();

  // WiFi check
  if (now - lastWifiCheckMs > WIFI_CHECK_INTERVAL) {
    lastWifiCheckMs = now;
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[wifi] Desconectado, reconectando...");
      if (!wifiConnectMulti()) {
        delay(10000);
        ESP.restart();
      }
    }
  }

  // MQTT
  if (cfg.configured) {
    if (!mqtt.connected()) {
      now = millis();
      if (now - lastReconnectMs > MQTT_RECONNECT_MS) {
        lastReconnectMs = now;
        connectMQTT();
      }
    }
    mqtt.loop();

    // Heartbeat: emitir evento periodico
    now = millis();
    if (now - lastHeartbeatMs > HEARTBEAT_INTERVAL_MS) {
      lastHeartbeatMs = now;
      if (mqtt.connected()) {
        JsonDocument hb;
        hb["device_id"]  = cfg.deviceId;
        hb["firmware"]   = MODULE_VERSION;
        hb["ip"]         = WiFi.localIP().toString();
        hb["rssi"]       = WiFi.RSSI();
        hb["uptime"]     = millis() / 1000;
        hb["free_heap"]  = ESP.getFreeHeap();
        mod->emit("node.heartbeat", hb);
      }
    }
  }
}
