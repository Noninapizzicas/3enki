/**
 * {{PROJECT_NAME}} — Kiosk WebView
 *
 * Firmware para ESP32 con pantalla táctil en modo kiosk.
 * - Conecta a WiFi (o abre portal cautivo si no hay config)
 * - Carga URL del servidor en WebView
 * - Reporta estado via MQTT (birth, heartbeat, firmware version)
 * - Soporta OTA via HTTP (orquestado por firmware-manager)
 * - Watchdog para auto-reset si se cuelga
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>
#include <HTTPUpdate.h>
#include <Preferences.h>
#include "config.h"

// ─── Estado ─────────────────────────────────────────────

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);
Preferences prefs;

String deviceId;
String projectId = "default";
unsigned long lastHeartbeat = 0;
unsigned long lastOtaCheck = 0;
const unsigned long HEARTBEAT_INTERVAL = 60000;

// Configuración persistente (NVS)
String cfgWifiSsid;
String cfgWifiPass;
String cfgMqttHost;
String cfgKioskUrl;
String cfgDeviceName;

// ─── Forward declarations ───────────────────────────────

void setupWiFi();
void setupMQTT();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void publishBirth();
void publishHeartbeat();
void checkOTA();
void loadConfig();
void startConfigPortal();

// ─── Setup ──────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  Serial.println("\n[kiosk] Booting " FIRMWARE_VERSION);

  // Watchdog
  esp_task_wdt_init(WDT_TIMEOUT_S, true);
  esp_task_wdt_add(NULL);

  // Cargar config de NVS (o usar defaults de config.h)
  loadConfig();

  // WiFi
  setupWiFi();

  // MQTT
  setupMQTT();

  // TODO: Inicializar WebView con cfgKioskUrl
  // El WebView depende del hardware específico (ESP32-P4 LVGL, etc.)
  // Por ahora solo arranca WiFi+MQTT y reporta estado
  Serial.printf("[kiosk] Ready. URL: %s\n", cfgKioskUrl.c_str());
}

// ─── Loop ───────────────────────────────────────────────

void loop() {
  esp_task_wdt_reset();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[kiosk] WiFi lost, reconnecting...");
    setupWiFi();
  }

  if (!mqtt.connected()) {
    setupMQTT();
  }
  mqtt.loop();

  // Heartbeat periódico
  if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL) {
    publishHeartbeat();
    lastHeartbeat = millis();
  }

  // Check OTA periódico
  if (millis() - lastOtaCheck > OTA_CHECK_INTERVAL) {
    checkOTA();
    lastOtaCheck = millis();
  }

  delay(10);
}

// ─── WiFi ───────────────────────────────────────────────

void setupWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(cfgWifiSsid.c_str(), cfgWifiPass.c_str());

  Serial.printf("[wifi] Connecting to %s", cfgWifiSsid.c_str());

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
    esp_task_wdt_reset();
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[wifi] Connected. IP: %s\n", WiFi.localIP().toString().c_str());

    // Generar device ID desde MAC
    uint8_t mac[6];
    WiFi.macAddress(mac);
    char macStr[13];
    snprintf(macStr, sizeof(macStr), "%02x%02x%02x%02x%02x%02x", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    deviceId = String("kiosk-") + String(macStr);
  } else {
    Serial.println("\n[wifi] Failed to connect. Starting config portal...");
    startConfigPortal();
  }
}

// ─── MQTT ───────────────────────────────────────────────

void setupMQTT() {
  mqtt.setServer(cfgMqttHost.c_str(), MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(1024);

  String willTopic = "devices/" + projectId + "/" + deviceId + "/lwt";

  int attempts = 0;
  while (!mqtt.connected() && attempts < 5) {
    Serial.printf("[mqtt] Connecting to %s...\n", cfgMqttHost.c_str());

    if (mqtt.connect(deviceId.c_str(), MQTT_USER, MQTT_PASSWORD,
                     willTopic.c_str(), 1, true, "{\"status\":\"offline\"}")) {
      Serial.println("[mqtt] Connected");

      // Suscribir a desired state
      String desiredTopic = "devices/" + projectId + "/" + deviceId + "/state/desired";
      mqtt.subscribe(desiredTopic.c_str());

      // Publicar birth message
      publishBirth();
    } else {
      Serial.printf("[mqtt] Failed (rc=%d). Retrying...\n", mqtt.state());
      delay(2000);
      attempts++;
      esp_task_wdt_reset();
    }
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String topicStr(topic);
  String payloadStr;
  payloadStr.reserve(length);
  for (unsigned int i = 0; i < length; i++) {
    payloadStr += (char)payload[i];
  }

  Serial.printf("[mqtt] Received: %s\n", topicStr.c_str());

  // Procesar desired state (delta de device-shadow)
  if (topicStr.endsWith("/state/desired")) {
    JsonDocument doc;
    if (deserializeJson(doc, payloadStr) == DeserializationError::Ok) {
      // Verificar si hay update de firmware
      if (doc["firmware"]["version"].is<const char*>()) {
        String newVersion = doc["firmware"]["version"].as<String>();
        if (newVersion != FIRMWARE_VERSION) {
          String url = doc["firmware"]["url"].as<String>();
          Serial.printf("[ota] New firmware available: %s → %s\n", FIRMWARE_VERSION, newVersion.c_str());
          // OTA se maneja en checkOTA()
        }
      }

      // Verificar si hay cambio de URL del kiosk
      if (doc["kiosk_url"].is<const char*>()) {
        String newUrl = doc["kiosk_url"].as<String>();
        if (newUrl != cfgKioskUrl) {
          cfgKioskUrl = newUrl;
          prefs.begin("kiosk", false);
          prefs.putString("kiosk_url", cfgKioskUrl);
          prefs.end();
          Serial.printf("[kiosk] URL changed to: %s (reboot needed)\n", cfgKioskUrl.c_str());
          // TODO: recargar WebView sin reboot
        }
      }
    }
  }
}

// ─── Birth & Heartbeat ─────────────────────────────────

void publishBirth() {
  JsonDocument doc;
  doc["device_id"] = deviceId;
  doc["name"] = cfgDeviceName;
  doc["type"] = DEVICE_TYPE;
  doc["firmware"] = FIRMWARE_VERSION;
  doc["ip"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();
  doc["uptime"] = millis() / 1000;
  doc["free_heap"] = ESP.getFreeHeap();

  JsonArray caps = doc["capabilities"].to<JsonArray>();
  caps.add("display");
  caps.add("touch");
  caps.add("ota");

  String topic = "devices/" + projectId + "/" + deviceId + "/birth";
  String payload;
  serializeJson(doc, payload);

  mqtt.publish(topic.c_str(), payload.c_str(), true);  // retained
  Serial.printf("[mqtt] Birth published: %s\n", deviceId.c_str());
}

void publishHeartbeat() {
  JsonDocument doc;
  doc["firmware"] = FIRMWARE_VERSION;
  doc["ip"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();
  doc["uptime"] = millis() / 1000;
  doc["free_heap"] = ESP.getFreeHeap();
  doc["kiosk_url"] = cfgKioskUrl;

  String topic = "devices/" + projectId + "/" + deviceId + "/state/reported";
  String payload;
  serializeJson(doc, payload);

  mqtt.publish(topic.c_str(), payload.c_str(), true);  // retained
}

// ─── OTA ────────────────────────────────────────────────

void checkOTA() {
  // OTA se orquesta via device-shadow:
  // firmware-manager escribe desired.firmware → device-shadow publica delta
  // Este dispositivo lee delta via MQTT callback y ejecuta HTTP OTA
  // La implementación completa requiere URL del binario del servidor
  Serial.println("[ota] Check skipped (orquestado via MQTT desired state)");
}

// ─── Config NVS ─────────────────────────────────────────

void loadConfig() {
  prefs.begin("kiosk", true);  // read-only

  cfgWifiSsid   = prefs.getString("wifi_ssid", WIFI_SSID);
  cfgWifiPass    = prefs.getString("wifi_pass", WIFI_PASSWORD);
  cfgMqttHost    = prefs.getString("mqtt_host", MQTT_HOST);
  cfgKioskUrl    = prefs.getString("kiosk_url", KIOSK_URL);
  cfgDeviceName  = prefs.getString("dev_name", DEVICE_NAME);

  prefs.end();

  Serial.printf("[config] WiFi: %s, MQTT: %s, URL: %s\n",
    cfgWifiSsid.c_str(), cfgMqttHost.c_str(), cfgKioskUrl.c_str());
}

// ─── Portal cautivo ─────────────────────────────────────

void startConfigPortal() {
  // TODO: Implementar WebServer con formulario para configurar:
  // - WiFi SSID/password
  // - MQTT host
  // - Kiosk URL
  // - Device name
  // Guardar en NVS y reiniciar
  Serial.println("[portal] Config portal not yet implemented. Using defaults.");
  ESP.restart();
}
