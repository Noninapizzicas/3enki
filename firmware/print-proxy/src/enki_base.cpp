/**
 * Enki BASE — Implementación de la plataforma universal ESP32
 *
 * Servicios: WiFi multi-red, MQTT, Portal, NVS, OTA, Watchdog, LED.
 * Implementa los servicios enki_* que la LÓGICA consume.
 */

#include "enki_base.h"
#include "enki_logic.h"
#include "portal.h"

// ============================================
// Estado global de la BASE
// ============================================

EnkiBaseConfig baseCfg;
Preferences    prefs;
WebServer      webServer(PORTAL_PORT);
WiFiClient     wifiClient;
PubSubClient   mqtt(wifiClient);
DNSServer      dnsServer;
bool           portalMode = false;

uint8_t payloadBuffer[MAX_PAYLOAD_SIZE];

// Topics MQTT base
static char topicStatus[80];

// Timers
static unsigned long lastStatusMs    = 0;
static unsigned long lastReconnectMs = 0;
static unsigned long lastWifiCheckMs = 0;
static unsigned long lastOtaCheckMs  = 0;

// ============================================
// Servicios enki_* (contrato para la LÓGICA)
// ============================================

void enki_mqtt_publish(const char* topic, const char* payload) {
  mqtt.publish(topic, payload);
}

bool enki_mqtt_subscribe(const char* topic) {
  return mqtt.subscribe(topic);
}

bool enki_mqtt_connected() {
  return mqtt.connected();
}

const char* enki_device_id() {
  return baseCfg.deviceId;
}

const char* enki_project_id() {
  return baseCfg.projectId;
}

void enki_config_set(const char* key, const char* value) {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.putString(key, value);
  prefs.end();
}

const char* enki_config_get(const char* key, const char* defaultValue) {
  static char buf[128];
  prefs.begin(NVS_NAMESPACE, true);
  strlcpy(buf, prefs.getString(key, defaultValue).c_str(), sizeof(buf));
  prefs.end();
  return buf;
}

void enki_config_set_u16(const char* key, uint16_t value) {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.putUShort(key, value);
  prefs.end();
}

uint16_t enki_config_get_u16(const char* key, uint16_t defaultValue) {
  prefs.begin(NVS_NAMESPACE, true);
  uint16_t val = prefs.getUShort(key, defaultValue);
  prefs.end();
  return val;
}

void enki_led_blink(int times, int ms) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH); delay(ms);
    digitalWrite(LED_PIN, LOW);  delay(ms);
  }
}

void enki_led_on()  { digitalWrite(LED_PIN, HIGH); }
void enki_led_off() { digitalWrite(LED_PIN, LOW);  }

void enki_request_restart() {
  Serial.println("[BASE] Restart solicitado...");
  delay(500);
  ESP.restart();
}

uint8_t* enki_buffer()      { return payloadBuffer; }
size_t   enki_buffer_size() { return MAX_PAYLOAD_SIZE; }

// ============================================
// Config — Load / Save NVS
// ============================================

void baseConfigLoad() {
  prefs.begin(NVS_NAMESPACE, true);
  strlcpy(baseCfg.deviceId,  prefs.getString("deviceId",  DEFAULT_DEVICE_ID).c_str(),  sizeof(baseCfg.deviceId));
  strlcpy(baseCfg.projectId, prefs.getString("projectId", DEFAULT_PROJECT_ID).c_str(), sizeof(baseCfg.projectId));
  strlcpy(baseCfg.mqttHost,  prefs.getString("mqttHost",  DEFAULT_MQTT_HOST).c_str(),  sizeof(baseCfg.mqttHost));
  baseCfg.mqttPort =          prefs.getUShort("mqttPort", DEFAULT_MQTT_PORT);
  strlcpy(baseCfg.mqttUser,  prefs.getString("mqttUser",  DEFAULT_MQTT_USER).c_str(),  sizeof(baseCfg.mqttUser));
  strlcpy(baseCfg.mqttPass,  prefs.getString("mqttPass",  DEFAULT_MQTT_PASS).c_str(),  sizeof(baseCfg.mqttPass));
  strlcpy(baseCfg.otaUrl,    prefs.getString("otaUrl",    DEFAULT_OTA_URL).c_str(),    sizeof(baseCfg.otaUrl));

  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char keyS[16], keyP[16];
    snprintf(keyS, sizeof(keyS), "wifiSsid%d", i);
    snprintf(keyP, sizeof(keyP), "wifiPass%d", i);
    strlcpy(baseCfg.wifi[i].ssid, prefs.getString(keyS, "").c_str(), sizeof(baseCfg.wifi[i].ssid));
    strlcpy(baseCfg.wifi[i].pass, prefs.getString(keyP, "").c_str(), sizeof(baseCfg.wifi[i].pass));
  }
  baseCfg.wifiActive = -1;
  prefs.end();

  baseCfg.configured = (strlen(baseCfg.mqttHost) > 0);

  Serial.printf("[BASE] device=%s project=%s mqtt=%s:%d configured=%s\n",
    baseCfg.deviceId, baseCfg.projectId, baseCfg.mqttHost, baseCfg.mqttPort,
    baseCfg.configured ? "SI" : "NO");
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    if (strlen(baseCfg.wifi[i].ssid) > 0)
      Serial.printf("[BASE] WiFi[%d] = %s\n", i, baseCfg.wifi[i].ssid);
  }
}

void baseConfigSave() {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.putString("deviceId",  baseCfg.deviceId);
  prefs.putString("projectId", baseCfg.projectId);
  prefs.putString("mqttHost",  baseCfg.mqttHost);
  prefs.putUShort("mqttPort",  baseCfg.mqttPort);
  prefs.putString("mqttUser",  baseCfg.mqttUser);
  prefs.putString("mqttPass",  baseCfg.mqttPass);
  prefs.putString("otaUrl",    baseCfg.otaUrl);

  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char keyS[16], keyP[16];
    snprintf(keyS, sizeof(keyS), "wifiSsid%d", i);
    snprintf(keyP, sizeof(keyP), "wifiPass%d", i);
    prefs.putString(keyS, baseCfg.wifi[i].ssid);
    prefs.putString(keyP, baseCfg.wifi[i].pass);
  }
  prefs.end();

  baseCfg.configured = (strlen(baseCfg.mqttHost) > 0);
  Serial.println("[BASE] Config guardada en NVS");
}

// ============================================
// WiFi — Multi-red con fallback y portal cautivo
// ============================================

static bool wifiTryConnect(int idx) {
  if (idx < 0 || idx >= WIFI_MAX_NETWORKS) return false;
  if (strlen(baseCfg.wifi[idx].ssid) == 0) return false;

  Serial.printf("[WiFi] Intentando red %d: %s...\n", idx + 1, baseCfg.wifi[idx].ssid);
  WiFi.begin(baseCfg.wifi[idx].ssid, baseCfg.wifi[idx].pass);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < WIFI_CONNECT_TIMEOUT) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    baseCfg.wifiActive = idx;
    Serial.printf("[WiFi] Conectado a '%s' — IP: %s\n",
      baseCfg.wifi[idx].ssid, WiFi.localIP().toString().c_str());
    return true;
  }

  Serial.printf("[WiFi] Fallo conectar a '%s'\n", baseCfg.wifi[idx].ssid);
  WiFi.disconnect();
  return false;
}

static bool wifiConnectMulti() {
  WiFi.mode(WIFI_STA);
  baseCfg.wifiActive = -1;
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    if (wifiTryConnect(i)) return true;
  }
  Serial.println("[WiFi] Ninguna red disponible");
  return false;
}

static void wifiStartPortal() {
  portalMode = true;
  WiFi.disconnect();
  WiFi.mode(WIFI_AP);

  String apName = String(WIFI_AP_NAME_PREFIX) + "-" + String((uint32_t)ESP.getEfuseMac(), HEX).substring(4);
  WiFi.softAP(apName.c_str());

  Serial.printf("[WiFi] Portal cautivo activo — SSID: %s  IP: %s\n",
    apName.c_str(), WiFi.softAPIP().toString().c_str());

  dnsServer.start(53, "*", WiFi.softAPIP());
}

bool baseSetupWiFi() {
  bool hasNetworks = false;
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    if (strlen(baseCfg.wifi[i].ssid) > 0) { hasNetworks = true; break; }
  }

  if (hasNetworks && wifiConnectMulti()) {
    portalMode = false;
    enki_led_blink(2);
    return true;
  }

  wifiStartPortal();
  return false;
}

void baseHandleWifiReconnect() {
  unsigned long now = millis();
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
}

// ============================================
// MQTT
// ============================================

static void buildTopics() {
  snprintf(topicStatus, sizeof(topicStatus), "enki/%s/status/%s", baseCfg.projectId, baseCfg.deviceId);
}

static void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  Serial.printf("[MQTT] Mensaje recibido (%d bytes) en %s\n", length, topic);

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.printf("[MQTT] Error JSON: %s\n", err.c_str());
    return;
  }

  // Delegar a la LÓGICA
  logic_on_message(topic, doc);
}

void baseSetupMQTT() {
  buildTopics();
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(MAX_PAYLOAD_SIZE + 256);
}

void baseConnectMQTT() {
  if (mqtt.connected()) return;
  if (strlen(baseCfg.mqttHost) == 0) return;

  Serial.printf("[MQTT] Conectando a %s:%d...\n", baseCfg.mqttHost, baseCfg.mqttPort);

  String clientId = "enki-" + String(baseCfg.deviceId);

  bool connected;
  if (strlen(baseCfg.mqttUser) > 0) {
    connected = mqtt.connect(clientId.c_str(), baseCfg.mqttUser, baseCfg.mqttPass);
  } else {
    connected = mqtt.connect(clientId.c_str());
  }

  if (connected) {
    Serial.println("[MQTT] Conectado");
    enki_led_blink(1, 500);
  } else {
    Serial.printf("[MQTT] Fallo (rc=%d)\n", mqtt.state());
  }
}

void baseHandleMqttReconnect() {
  if (!baseCfg.configured) return;
  if (!mqtt.connected()) {
    unsigned long now = millis();
    if (now - lastReconnectMs > 5000) {
      lastReconnectMs = now;
      baseConnectMQTT();
    }
  }
  mqtt.loop();
}

void basePublishStatus() {
  unsigned long now = millis();
  if (now - lastStatusMs < STATUS_INTERVAL_MS) return;
  lastStatusMs = now;

  if (!mqtt.connected()) return;

  JsonDocument doc;
  // Campos genéricos de la BASE
  doc["device_id"]  = baseCfg.deviceId;
  doc["project_id"] = baseCfg.projectId;
  doc["online"]     = true;
  doc["wifi_rssi"]  = WiFi.RSSI();
  doc["wifi_ssid"]  = (baseCfg.wifiActive >= 0) ? baseCfg.wifi[baseCfg.wifiActive].ssid : "";
  doc["ip"]         = WiFi.localIP().toString();
  doc["uptime_sec"] = millis() / 1000;
  doc["free_heap"]  = ESP.getFreeHeap();

  // La LÓGICA añade sus campos
  logic_status(doc);

  char buf[512];
  serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topicStatus, buf);
}

// ============================================
// OTA
// ============================================

void baseCheckOTA() {
  if (strlen(baseCfg.otaUrl) == 0) return;

  unsigned long now = millis();
  if (now - lastOtaCheckMs < OTA_CHECK_INTERVAL_MS) return;
  lastOtaCheckMs = now;

  Serial.printf("[OTA] Comprobando actualizacion en %s...\n", baseCfg.otaUrl);

  // Construir URL con device_id para que el servidor sepa qué firmware enviar
  char url[200];
  snprintf(url, sizeof(url), "%s?device_id=%s&project_id=%s",
    baseCfg.otaUrl, baseCfg.deviceId, baseCfg.projectId);

  t_httpUpdate_return ret = httpUpdate.update(wifiClient, url);

  switch (ret) {
    case HTTP_UPDATE_FAILED:
      Serial.printf("[OTA] Fallo: %s\n", httpUpdate.getLastErrorString().c_str());
      break;
    case HTTP_UPDATE_NO_UPDATES:
      Serial.println("[OTA] Sin actualizaciones");
      break;
    case HTTP_UPDATE_OK:
      Serial.println("[OTA] OK — reiniciando...");
      break;
  }
}

// ============================================
// Portal web — Endpoints BASE
// ============================================

static void handleRoot() {
  webServer.send_P(200, "text/html", PORTAL_HTML);
}

static void handleGetConfig() {
  JsonDocument doc;
  doc["device_id"]  = baseCfg.deviceId;
  doc["project_id"] = baseCfg.projectId;

  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char keyS[16], keyP[16];
    snprintf(keyS, sizeof(keyS), "wifi_ssid%d", i + 1);
    snprintf(keyP, sizeof(keyP), "wifi_pass%d", i + 1);
    doc[keyS] = baseCfg.wifi[i].ssid;
    doc[keyP] = baseCfg.wifi[i].pass;
  }
  doc["wifi_active"] = (baseCfg.wifiActive >= 0) ? baseCfg.wifi[baseCfg.wifiActive].ssid : "ninguna";

  doc["mqtt_host"] = baseCfg.mqttHost;
  doc["mqtt_port"] = baseCfg.mqttPort;
  doc["mqtt_user"] = baseCfg.mqttUser;
  doc["mqtt_pass"] = baseCfg.mqttPass;
  doc["ota_url"]   = baseCfg.otaUrl;
  doc["ip"]        = portalMode ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
  doc["portal_mode"] = portalMode;

  unsigned long up = millis() / 1000;
  char upStr[32];
  snprintf(upStr, sizeof(upStr), "%luh %lum", up / 3600, (up % 3600) / 60);
  doc["uptime"] = upStr;

  char buf[768];
  serializeJson(doc, buf, sizeof(buf));
  webServer.send(200, "application/json", buf);
}

static void handlePostConfig() {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, webServer.arg("plain"));
  if (err) {
    webServer.send(400, "application/json", "{\"ok\":false,\"error\":\"JSON invalido\"}");
    return;
  }

  if (doc["device_id"].is<const char*>())  strlcpy(baseCfg.deviceId,  doc["device_id"],  sizeof(baseCfg.deviceId));
  if (doc["project_id"].is<const char*>()) strlcpy(baseCfg.projectId, doc["project_id"], sizeof(baseCfg.projectId));

  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char keyS[16], keyP[16];
    snprintf(keyS, sizeof(keyS), "wifi_ssid%d", i + 1);
    snprintf(keyP, sizeof(keyP), "wifi_pass%d", i + 1);
    if (doc[keyS].is<const char*>()) strlcpy(baseCfg.wifi[i].ssid, doc[keyS], sizeof(baseCfg.wifi[i].ssid));
    if (doc[keyP].is<const char*>()) strlcpy(baseCfg.wifi[i].pass, doc[keyP], sizeof(baseCfg.wifi[i].pass));
  }

  if (doc["mqtt_host"].is<const char*>()) strlcpy(baseCfg.mqttHost, doc["mqtt_host"], sizeof(baseCfg.mqttHost));
  if (doc["mqtt_port"].is<int>())         baseCfg.mqttPort = doc["mqtt_port"];
  if (doc["mqtt_user"].is<const char*>()) strlcpy(baseCfg.mqttUser, doc["mqtt_user"], sizeof(baseCfg.mqttUser));
  if (doc["mqtt_pass"].is<const char*>()) strlcpy(baseCfg.mqttPass, doc["mqtt_pass"], sizeof(baseCfg.mqttPass));
  if (doc["ota_url"].is<const char*>())   strlcpy(baseCfg.otaUrl,   doc["ota_url"],   sizeof(baseCfg.otaUrl));

  baseConfigSave();

  if (portalMode) {
    bool hasNetworks = false;
    for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
      if (strlen(baseCfg.wifi[i].ssid) > 0) { hasNetworks = true; break; }
    }
    if (hasNetworks) {
      webServer.send(200, "application/json", "{\"ok\":true,\"msg\":\"Guardado. Reiniciando para conectar WiFi...\"}");
      delay(1000);
      ESP.restart();
      return;
    }
  }

  // Reconectar servicios
  if (mqtt.connected()) mqtt.disconnect();
  buildTopics();
  mqtt.setServer(baseCfg.mqttHost, baseCfg.mqttPort);
  baseConnectMQTT();

  webServer.send(200, "application/json", "{\"ok\":true}");
}

static void handleGetStatus() {
  JsonDocument doc;
  doc["wifi"]   = (WiFi.status() == WL_CONNECTED);
  doc["mqtt"]   = mqtt.connected();
  doc["portal"] = portalMode;

  // La LÓGICA añade su estado (ej: printer ready)
  logic_portal_status(doc);

  char buf[256];
  serializeJson(doc, buf, sizeof(buf));
  webServer.send(200, "application/json", buf);
}

static void handleWifiScan() {
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
      if (strlen(baseCfg.wifi[j].ssid) > 0 && WiFi.SSID(i) == baseCfg.wifi[j].ssid) {
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

static void handleReset() {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.clear();
  prefs.end();
  webServer.send(200, "application/json", "{\"ok\":true}");
  delay(1000);
  ESP.restart();
}

void basePortalSetup() {
  webServer.on("/",              HTTP_GET,  handleRoot);
  webServer.on("/api/config",    HTTP_GET,  handleGetConfig);
  webServer.on("/api/config",    HTTP_POST, handlePostConfig);
  webServer.on("/api/status",    HTTP_GET,  handleGetStatus);
  webServer.on("/api/wifi-scan", HTTP_GET,  handleWifiScan);
  webServer.on("/api/reset",     HTTP_POST, handleReset);
  // Los endpoints específicos del driver se registran en logic_setup()
}
