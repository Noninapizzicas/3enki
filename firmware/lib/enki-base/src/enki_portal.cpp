/**
 * Enki Portal — Web server endpoints + captive portal detection
 */

#include "enki_portal.h"
#include "enki_base.h"
#include "enki_wifi.h"
#include "enki_mqtt.h"
#include "enki_logic.h"
#include "portal.h"
#include <esp_wifi.h>

WebServer webServer(PORTAL_PORT);

// ── Handlers ────────────────────────────────────

static void handleRoot() {
  // Enviar HTML en chunks — con SPP activo el heap es limitado
  size_t len = strlen_P(PORTAL_HTML);
  webServer.setContentLength(len);
  webServer.send(200, "text/html", "");

  const size_t CHUNK = 512;
  for (size_t i = 0; i < len; i += CHUNK) {
    size_t n = min(CHUNK, len - i);
    char buf[CHUNK + 1];
    memcpy_P(buf, PORTAL_HTML + i, n);
    buf[n] = 0;
    webServer.sendContent(buf);
  }
  webServer.sendContent("");
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

  // Reconectar MQTT con nueva config
  if (mqtt.connected()) mqtt.disconnect();
  mqttRebuildTopics();
  mqtt.setServer(baseCfg.mqttHost, baseCfg.mqttPort);
  mqttConnect();

  webServer.send(200, "application/json", "{\"ok\":true}");
}

static void handleGetStatus() {
  JsonDocument doc;
  doc["wifi"]      = (WiFi.status() == WL_CONNECTED);
  doc["mqtt"]      = mqtt.connected();
  doc["portal"]    = portalMode;
  doc["free_heap"] = ESP.getFreeHeap();

  logic_portal_status(doc);

  char buf[256];
  serializeJson(doc, buf, sizeof(buf));
  webServer.send(200, "application/json", buf);
}

static void handleWifiScan() {
  Serial.println("[WiFi] Escaneando redes...");

#if defined(CONFIG_IDF_TARGET_ESP32P4)
  // En P4/AP puro: activar STA temporalmente para escanear, luego volver a AP
  esp_wifi_stop();
  delay(100);
  esp_wifi_set_mode(WIFI_MODE_APSTA);
  esp_wifi_start();
  delay(300);
#endif

  int n = WiFi.scanNetworks(false, false, false, 300);

  JsonDocument doc;
  auto arr = doc.to<JsonArray>();

  if (n > 0) {
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
  }

#if defined(CONFIG_IDF_TARGET_ESP32P4)
  // Volver a AP puro — sin STA no hay reconexiones espurias
  WiFi.setAutoReconnect(false);
  WiFi.disconnect(false);
  delay(100);
  esp_wifi_stop();
  delay(100);
  esp_wifi_set_mode(WIFI_MODE_AP);
  esp_wifi_start();
  delay(200);
#endif

  char buf[1024];
  serializeJson(doc, buf, sizeof(buf));
  webServer.send(200, "application/json", buf);
  Serial.printf("[WiFi] Scan: %d redes encontradas\n", n);
}

static void handleReset() {
  Preferences prefs;
  prefs.begin(NVS_NAMESPACE, false);
  prefs.clear();
  prefs.end();
  webServer.send(200, "application/json", "{\"ok\":true}");
  delay(1000);
  ESP.restart();
}

// ── Captive portal detection ────────────────────

static void handleCaptiveRedirect() {
  if (!portalMode) {
    // En modo STA, devolver 404 (no redirigir a 0.0.0.0)
    webServer.send(404, "text/plain", "Not found");
    return;
  }
  String target = "http://" + WiFi.softAPIP().toString() + "/";
  webServer.sendHeader("Location", target, true);
  webServer.send(302, "text/plain", "");
}

// ── Setup ───────────────────────────────────────

void portalSetup() {
  // Endpoints base
  webServer.on("/",              HTTP_GET,  handleRoot);
  webServer.on("/api/config",    HTTP_GET,  handleGetConfig);
  webServer.on("/api/config",    HTTP_POST, handlePostConfig);
  webServer.on("/api/status",    HTTP_GET,  handleGetStatus);
  webServer.on("/api/wifi-scan", HTTP_GET,  handleWifiScan);
  webServer.on("/api/reset",     HTTP_POST, handleReset);

  // Captive portal detection (Android, iOS, Windows)
  webServer.on("/generate_204",              HTTP_GET, handleCaptiveRedirect);
  webServer.on("/gen_204",                   HTTP_GET, handleCaptiveRedirect);
  webServer.on("/hotspot-detect.html",       HTTP_GET, handleCaptiveRedirect);
  webServer.on("/library/test/success.html", HTTP_GET, handleCaptiveRedirect);
  webServer.on("/ncsi.txt",                  HTTP_GET, handleCaptiveRedirect);
  webServer.on("/connecttest.txt",           HTTP_GET, handleCaptiveRedirect);
  webServer.on("/fwlink",                    HTTP_GET, handleCaptiveRedirect);

  // Catch-all → portal
  webServer.onNotFound(handleCaptiveRedirect);
}
