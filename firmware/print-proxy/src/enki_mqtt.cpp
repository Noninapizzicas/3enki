/**
 * Enki MQTT — Conexión estable, cola offline, autodescubrimiento.
 *
 * Protocolo del dispositivo Enki:
 *   PUBLICA (retained): devices/{project}/{device}/birth
 *   PUBLICA (retained): devices/{project}/{device}/state/reported
 *   PUBLICA (periódico): enki/{project}/status/{device}
 *   LWT: devices/{project}/{device}/lwt → {"online":false}
 *   SUSCRITO: devices/{project}/{device}/state/delta (OTA + config)
 */

#include "enki_mqtt.h"
#include "enki_base.h"
#include "enki_logic.h"
#include "enki_ota.h"
#include "enki_debug.h"

WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);

// Topics
static char topicStatus[80];
static char topicBirth[80];
static char topicLwt[80];
static char topicShadowDelta[80];
static char topicShadowReported[80];

// Timers
static unsigned long lastStatusMs    = 0;
static unsigned long lastReconnectMs = 0;

// Backoff
static uint8_t  mqttReconnectAttempts = 0;
static uint32_t mqttReconnectInterval = 2000;

// ── Cola offline (circular, 8 items) ────────────

#define MQTT_QUEUE_SIZE 8
struct MqttQueueItem {
  char topic[80];
  char payload[256];
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
  // mqttQueueHead apunta al próximo slot a escribir.
  // El item más antiguo está en mqttQueueHead (si está llena)
  // o hay que recorrer buscando los used=true en orden.
  // Recorremos desde el slot más antiguo posible.
  int sent = 0;
  for (int i = 0; i < MQTT_QUEUE_SIZE; i++) {
    // Empezar desde mqttQueueHead = el slot más antiguo (circular)
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

// Usado por enki_mqtt_publish() en enki_base.cpp
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

  // Debug control → activar/desactivar debug remoto
  {
    char rawPayload[256];
    if (length < sizeof(rawPayload)) {
      memcpy(rawPayload, payload, length);
      rawPayload[length] = '\0';
      // Si es un mensaje de control de debug, no pasarlo a la lógica
      if (strstr(topic, "/debug/") && strstr(topic, "/control")) {
        debugHandleControl(topic, rawPayload);
        return;
      }
    }
  }

  // Delegar a la LÓGICA
  logic_on_message(topic, doc);
}

// ── Setup ───────────────────────────────────────

void mqttSetup() {
  mqttRebuildTopics();
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(MQTT_BUFFER_SIZE);
  mqtt.setKeepAlive(60);

  for (int i = 0; i < MQTT_QUEUE_SIZE; i++) {
    mqttQueue[i].used = false;
  }
}

// ── Conexión con protocolo autodescubrimiento ───

void mqttConnect() {
  if (mqtt.connected()) return;
  if (strlen(baseCfg.mqttHost) == 0) return;

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

    // 3. Debug control topic
    debugSetup();

    // 4. Reported state
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

// ── Status periódico ────────────────────────────

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
