/**
 * Enki BASE — Config NVS + servicios enki_* para la LÓGICA
 *
 * Solo dos responsabilidades:
 *   1. Cargar/guardar config en flash NVS
 *   2. Implementar los servicios enki_* que la LÓGICA consume
 *
 * WiFi, MQTT, OTA y Portal están en sus propios archivos.
 */

#include "enki_base.h"
#include "enki_mqtt.h"

// ============================================
// Estado global
// ============================================

EnkiBaseConfig baseCfg;
uint8_t payloadBuffer[MAX_PAYLOAD_SIZE];

static Preferences prefs;

// ============================================
// Config NVS — Load / Save
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
// Servicios enki_* (contrato para la LÓGICA)
// ============================================

void enki_mqtt_publish(const char* topic, const char* payload) {
  mqttPublishOrQueue(topic, payload);
}

bool enki_mqtt_subscribe(const char* topic) {
  return mqtt.subscribe(topic, 1);  // QoS 1: at-least-once delivery
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
  static char bufs[4][128];
  static int idx = 0;
  char* buf = bufs[idx];
  idx = (idx + 1) % 4;
  prefs.begin(NVS_NAMESPACE, true);
  strlcpy(buf, prefs.getString(key, defaultValue).c_str(), sizeof(bufs[0]));
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
  if (LED_PIN < 0) return;
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH); delay(ms);
    digitalWrite(LED_PIN, LOW);  delay(ms);
  }
}

void enki_led_on()  { if (LED_PIN >= 0) digitalWrite(LED_PIN, HIGH); }
void enki_led_off() { if (LED_PIN >= 0) digitalWrite(LED_PIN, LOW);  }

void enki_request_restart() {
  Serial.println("[BASE] Restart solicitado...");
  delay(500);
  ESP.restart();
}

uint8_t* enki_buffer()      { return payloadBuffer; }
size_t   enki_buffer_size() { return MAX_PAYLOAD_SIZE; }
