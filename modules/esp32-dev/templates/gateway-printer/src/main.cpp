/**
 * {{PROJECT_NAME}} — Gateway Impresora MQTT ↔ BLE
 *
 * Bridge que recibe comandos ESC/POS via MQTT y los reenvía
 * a una impresora térmica por Bluetooth (BLE).
 *
 * Tópicos MQTT:
 * - Suscribe: impresion/{project}/print/{device_id}  (comando de impresión)
 * - Publica:  impresion/{project}/printed/{device_id} (ACK de impresión)
 * - Publica:  devices/{project}/{device_id}/birth     (birth message)
 * - Publica:  devices/{project}/{device_id}/state/reported (estado)
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>
#include "config.h"

// ─── Estado ─────────────────────────────────────────────

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

String deviceId;
String projectId = "default";
unsigned long lastHeartbeat = 0;
const unsigned long HEARTBEAT_INTERVAL = 30000;

// BLE
NimBLEClient* bleClient = nullptr;
NimBLERemoteCharacteristic* printChar = nullptr;
bool printerConnected = false;
unsigned long lastBleReconnect = 0;

// ─── Forward declarations ───────────────────────────────

void setupWiFi();
void setupMQTT();
void setupBLE();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void publishBirth();
void publishHeartbeat();
void publishPrintAck(const char* jobId, bool success, const char* error);
bool sendToPrinter(const uint8_t* data, size_t length);
void reconnectBLE();

// ─── Setup ──────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  Serial.println("\n[gateway] Booting " FIRMWARE_VERSION);

  setupWiFi();
  setupBLE();
  setupMQTT();

  Serial.println("[gateway] Ready");
}

// ─── Loop ───────────────────────────────────────────────

void loop() {
  if (WiFi.status() != WL_CONNECTED) setupWiFi();
  if (!mqtt.connected()) setupMQTT();
  mqtt.loop();

  // Reconectar BLE si se perdió
  if (!printerConnected && millis() - lastBleReconnect > BLE_RECONNECT_MS) {
    reconnectBLE();
    lastBleReconnect = millis();
  }

  // Heartbeat
  if (millis() - lastHeartbeat > HEARTBEAT_INTERVAL) {
    publishHeartbeat();
    lastHeartbeat = millis();
  }

  delay(10);
}

// ─── WiFi ───────────────────────────────────────────────

void setupWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    uint8_t mac[6];
    WiFi.macAddress(mac);
    char macStr[13];
    snprintf(macStr, sizeof(macStr), "%02x%02x%02x%02x%02x%02x", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    deviceId = String("printer-") + String(macStr);
    Serial.printf("[wifi] Connected. IP: %s\n", WiFi.localIP().toString().c_str());
  }
}

// ─── BLE ────────────────────────────────────────────────

void setupBLE() {
  NimBLEDevice::init("EnkiGateway");
  reconnectBLE();
}

void reconnectBLE() {
  Serial.printf("[ble] Scanning for '%s'...\n", PRINTER_BLE_NAME);

  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->setActiveScan(true);
  NimBLEScanResults results = scan->start(BLE_SCAN_TIMEOUT);

  for (int i = 0; i < results.getCount(); i++) {
    NimBLEAdvertisedDevice device = results.getDevice(i);

    if (device.getName() == PRINTER_BLE_NAME) {
      Serial.printf("[ble] Found printer: %s\n", device.getAddress().toString().c_str());

      if (bleClient) {
        NimBLEDevice::deleteClient(bleClient);
      }

      bleClient = NimBLEDevice::createClient();
      if (bleClient->connect(&device)) {
        // Buscar servicio de impresión (genérico SPP-like)
        NimBLERemoteService* svc = bleClient->getService("49535343-FE7D-4AE5-8FA9-9FAFD205E455");
        if (svc) {
          printChar = svc->getCharacteristic("49535343-8841-43F4-A8D4-ECBE34729BB3");
          if (printChar) {
            printerConnected = true;
            Serial.println("[ble] Printer connected and ready");
            return;
          }
        }
        Serial.println("[ble] Service/characteristic not found");
        bleClient->disconnect();
      } else {
        Serial.println("[ble] Connection failed");
      }
    }
  }

  printerConnected = false;
  Serial.println("[ble] Printer not found");
}

// ─── MQTT ───────────────────────────────────────────────

void setupMQTT() {
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(MAX_PRINT_PAYLOAD + 256);

  String willTopic = "devices/" + projectId + "/" + deviceId + "/lwt";

  int attempts = 0;
  while (!mqtt.connected() && attempts < 3) {
    if (mqtt.connect(deviceId.c_str(), MQTT_USER, MQTT_PASSWORD,
                     willTopic.c_str(), 1, true, "{\"status\":\"offline\"}")) {
      // Suscribir a comandos de impresión
      String printTopic = "impresion/" + projectId + "/print/" + deviceId;
      mqtt.subscribe(printTopic.c_str());

      // Suscribir a desired state
      String desiredTopic = "devices/" + projectId + "/" + deviceId + "/state/desired";
      mqtt.subscribe(desiredTopic.c_str());

      publishBirth();
      Serial.println("[mqtt] Connected");
    } else {
      delay(2000);
      attempts++;
    }
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String topicStr(topic);

  if (topicStr.indexOf("/print/") >= 0) {
    // Comando de impresión — reenviar a BLE
    Serial.printf("[print] Received %d bytes\n", length);

    bool success = sendToPrinter(payload, length);

    // Extraer job_id del payload si es JSON, sino usar timestamp
    String jobId = String(millis());
    publishPrintAck(jobId.c_str(), success, success ? nullptr : "printer_disconnected");
  }
}

bool sendToPrinter(const uint8_t* data, size_t length) {
  if (!printerConnected || !printChar) {
    Serial.println("[print] Printer not connected");
    return false;
  }

  // Enviar en chunks de 200 bytes (límite BLE)
  const size_t chunkSize = 200;
  for (size_t offset = 0; offset < length; offset += chunkSize) {
    size_t remaining = length - offset;
    size_t toSend = remaining < chunkSize ? remaining : chunkSize;

    if (!printChar->writeValue(data + offset, toSend, true)) {
      Serial.printf("[print] Write failed at offset %d\n", (int)offset);
      printerConnected = false;
      return false;
    }
    delay(20);  // Dar tiempo a la impresora
  }

  Serial.printf("[print] Sent %d bytes OK\n", (int)length);
  return true;
}

// ─── Birth, Heartbeat, ACK ─────────────────────────────

void publishBirth() {
  JsonDocument doc;
  doc["device_id"] = deviceId;
  doc["name"] = DEVICE_NAME;
  doc["type"] = DEVICE_TYPE;
  doc["firmware"] = FIRMWARE_VERSION;
  doc["protocol"] = "ble";

  JsonArray caps = doc["capabilities"].to<JsonArray>();
  caps.add("imprimir");
  caps.add("ota");

  String payload;
  serializeJson(doc, payload);
  String topic = "devices/" + projectId + "/" + deviceId + "/birth";
  mqtt.publish(topic.c_str(), payload.c_str(), true);
}

void publishHeartbeat() {
  JsonDocument doc;
  doc["firmware"] = FIRMWARE_VERSION;
  doc["printer_connected"] = printerConnected;
  doc["rssi"] = WiFi.RSSI();
  doc["uptime"] = millis() / 1000;
  doc["free_heap"] = ESP.getFreeHeap();

  String payload;
  serializeJson(doc, payload);
  String topic = "devices/" + projectId + "/" + deviceId + "/state/reported";
  mqtt.publish(topic.c_str(), payload.c_str(), true);
}

void publishPrintAck(const char* jobId, bool success, const char* error) {
  JsonDocument doc;
  doc["job_id"] = jobId;
  doc["device_id"] = deviceId;
  doc["success"] = success;
  if (error) doc["error"] = error;

  String payload;
  serializeJson(doc, payload);
  String topic = "impresion/" + projectId + "/printed/" + deviceId;
  mqtt.publish(topic.c_str(), payload.c_str());
}
