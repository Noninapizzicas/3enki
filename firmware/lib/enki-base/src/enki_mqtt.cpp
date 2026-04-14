/**
 * Enki MQTT — Conexion estable, cola offline, autodescubrimiento.
 *
 * Protocolo del dispositivo Enki:
 *   PUBLICA (retained): devices/{project}/{device}/birth
 *   PUBLICA (retained): devices/{project}/{device}/state/reported
 *   PUBLICA (periodico): enki/{project}/status/{device}
 *   LWT: devices/{project}/{device}/lwt → {"online":false}
 *   SUSCRITO: devices/{project}/{device}/state/delta (OTA + config)
 *
 * v3.4 mejoras:
 *   - Verifica WiFi antes de intentar MQTT connect
 *   - Socket timeout reducido a 5s (era 15s default)
 *   - Backoff se resetea cuando WiFi reconecta
 */

#include "enki_mqtt.h"
#include "enki_base.h"
#include "enki_logic.h"
#include "enki_ota.h"

WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);

// Topics — 128 bytes para soportar deviceId/projectId de hasta 31 chars
static char topicStatus[128];
static char topicBirth[128];
static char topicLwt[128];
static char topicShadowDelta[128];
static char topicShadowReported[128];

// Timers
static unsigned long lastStatusMs    = 0;
static unsigned long lastReconnectMs = 0;

// Backoff
static uint8_t  mqttReconnectAttempts = 0;
static uint32_t mqttReconnectInterval = 2000;

// Estado WiFi previo (para detectar reconexion WiFi)
static bool wifiWasConnected = false;

// ── Cola offline (circular, 8 items) ────────────

#define MQTT_QUEUE_SIZE 8
struct MqttQueueItem {
  char topic[128];
  char payload[512];  // ACK payloads con diagnostico pueden superar 256
  bool retain;
  bool used;
};
static MqttQueueItem mqttQueue[MQTT_QUEUE_SIZE];
static uint8_t mqttQueueHead = 0;

static void mqttEnqueue(const char* topic, const char* payload, bool retain) {
  MqttQueueItem& item = mqttQueue[mqttQueueHead];
  strlcpy(item.topic, topic, sizeof(item.topic));
  strlcpy(item.payload, payload, sizeof(item.payload));
  item.retain = retain;
  item.used = true;
  mqttQueueHead = (mqttQueueHead + 1) % MQTT_QUEUE_SIZE;
}

static void mqttFlushQueue() {
  int sent = 0;
  for (int i = 0; i < MQTT_QUEUE_SIZE; i++) {
    int idx = (mqttQueueHead + i) % MQTT_QUEUE_SIZE;
    MqttQueueItem& item = mqttQueue[idx];
    if (!item.used) continue;
    mqtt.publish(item.topic, item.payload, item.retain);
    item.used = false;
    sent++;
  }
  if (sent > 0) {
    Serial.printf("[MQTT] Cola: %d mensajes enviados tras reconexion\n", sent);
  }
}

// ── Publish con cola ────────────────────────────

void mqttPublishOrQueue(const char* topic, const char* payload) {
  if (mqtt.connected()) {
    mqtt.publish(topic, payload);
  } else {
    mqttEnqueue(topic, payload, false);
    Serial.printf("[MQTT] Offline — encolado: %s\n", topic);
  }
}

// ── Topics ──────────────────────────────────────

void mqttRebuildTopics() {
  snprintf(topicStatus,         sizeof(topicStatus),         "enki/%s/status/%s",           baseCfg.projectId, baseCfg.deviceId);
  snprintf(topicBirth,          sizeof(topicBirth),          "devices/%s/%s/birth",         baseCfg.projectId, baseCfg.deviceId);
  snprintf(topicLwt,            sizeof(topicLwt),            "devices/%s/%s/lwt",           baseCfg.projectId, baseCfg.deviceId);
  snprintf(topicShadowDelta,    sizeof(topicShadowDelta),    "devices/%s/%s/state/delta",   baseCfg.projectId, baseCfg.deviceId);
  snprintf(topicShadowReported, sizeof(topicShadowReported), "devices/%s/%s/state/reported", baseCfg.projectId, baseCfg.deviceId);
}

// ── Shadow reported ─────────────────────────────

void mqttPublishReported() {
  if (!mqtt.connected()) return;
  JsonDocument doc;
  doc["firmware"]["version"] = FIRMWARE_VERSION;
  char buf[128];
  serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topicShadowReported, buf, true);
  Serial.printf("[SHADOW] Reported: %s\n", buf);
}

// ── Callback de mensajes ────────────────────────

static void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  Serial.printf("[MQTT] RX (%d bytes) %s\n", length, topic);

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.printf("[MQTT] Error JSON: %s\n", err.c_str());
    return;
  }

  // Shadow delta → OTA
  if (strcmp(topic, topicShadowDelta) == 0) {
    otaHandleShadowDelta(doc);
    return;
  }

  // Delegar a la LOGICA
  logic_on_message(topic, doc);
}

// ── Setup ───────────────────────────────────────

void mqttSetup() {
  mqttRebuildTopics();
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(MQTT_BUFFER_SIZE);
  mqtt.setKeepAlive(60);

  // Reducir timeout del socket TCP (default 15s → 5s)
  // Menos bloqueo si el broker no responde
  wifiClient.setTimeout(5);

  for (int i = 0; i < MQTT_QUEUE_SIZE; i++) {
    mqttQueue[i].used = false;
  }
}

// ── Conexion con protocolo autodescubrimiento ───

void mqttConnect() {
  if (mqtt.connected()) return;
  if (strlen(baseCfg.mqttHost) == 0) return;

  // No intentar si WiFi no esta conectado
  if (WiFi.status() != WL_CONNECTED) return;

  Serial.printf("[MQTT] Conectando a %s:%d (intento %d)...\n",
    baseCfg.mqttHost, baseCfg.mqttPort, mqttReconnectAttempts + 1);

  String clientId = "enki-" + String(baseCfg.deviceId);

  bool connected;
  if (strlen(baseCfg.mqttUser) > 0) {
    connected = mqtt.connect(clientId.c_str(), baseCfg.mqttUser, baseCfg.mqttPass,
                             topicLwt, 1, true, "{\"online\":false}");
  } else {
    connected = mqtt.connect(clientId.c_str(), nullptr, nullptr,
                             topicLwt, 1, true, "{\"online\":false}");
  }

  if (connected) {
    Serial.println("[MQTT] Conectado");
    mqttReconnectAttempts = 0;
    mqttReconnectInterval = 2000;

    // 1. Birth retained — autodescubrimiento
    JsonDocument birthDoc;
    birthDoc["type"]     = DRIVER_TYPE;
    birthDoc["driver"]   = DRIVER_TYPE;
    birthDoc["protocol"] = "mqtt-native";
    birthDoc["firmware"] = FIRMWARE_VERSION;
    char birthBuf[192];
    serializeJson(birthDoc, birthBuf, sizeof(birthBuf));
    mqtt.publish(topicBirth, birthBuf, true);

    // 2. Subscribe shadow delta
    mqtt.subscribe(topicShadowDelta, 1);
    Serial.printf("[MQTT] Suscrito a: %s\n", topicShadowDelta);

    // 3. Reported state
    mqttPublishReported();

    // 4. Flush cola offline
    mqttFlushQueue();

    enki_led_blink(1, 300);
  } else {
    mqttReconnectAttempts++;
    mqttReconnectInterval = min((uint32_t)30000, mqttReconnectInterval * 2);
    Serial.printf("[MQTT] Fallo (rc=%d). Proximo intento en %dms\n",
      mqtt.state(), mqttReconnectInterval);
  }
}

// ── Loop: reconnect + procesar mensajes ─────────

void mqttHandleReconnect() {
  if (!baseCfg.configured) return;

  bool wifiNow = (WiFi.status() == WL_CONNECTED);

  // Detectar reconexion WiFi → resetear backoff MQTT
  if (wifiNow && !wifiWasConnected) {
    Serial.println("[MQTT] WiFi reconecto — reseteando backoff");
    mqttReconnectAttempts = 0;
    mqttReconnectInterval = 2000;
    lastReconnectMs = 0;  // intentar inmediatamente
  }
  wifiWasConnected = wifiNow;

  // Sin WiFi → no intentar MQTT
  if (!wifiNow) return;

  if (!mqtt.connected()) {
    unsigned long now = millis();
    if (now - lastReconnectMs > mqttReconnectInterval) {
      lastReconnectMs = now;
      mqttConnect();
    }
    return;
  }

  mqtt.loop();
}

// ── Status periodico ────────────────────────────

void mqttPublishStatus() {
  unsigned long now = millis();
  if (now - lastStatusMs < STATUS_INTERVAL_MS) return;
  lastStatusMs = now;

  if (!mqtt.connected()) return;

  JsonDocument doc;
  doc["device_id"]  = baseCfg.deviceId;
  doc["project_id"] = baseCfg.projectId;
  doc["online"]     = true;
  doc["wifi_rssi"]  = WiFi.RSSI();
  doc["wifi_ssid"]  = (baseCfg.wifiActive >= 0) ? baseCfg.wifi[baseCfg.wifiActive].ssid : "";
  doc["ip"]         = WiFi.localIP().toString();
  doc["uptime_sec"] = millis() / 1000;
  doc["free_heap"]  = ESP.getFreeHeap();
  doc["firmware"]   = FIRMWARE_VERSION;
  doc["driver"]     = DRIVER_TYPE;

  logic_status(doc);

  char buf[512];
  serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topicStatus, buf);
}
