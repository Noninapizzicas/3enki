/**
 * {{PROJECT_NAME}} — Sensor MQTT
 *
 * Lee sensor y publica datos via MQTT.
 * Soporta deep sleep para ahorro de energía.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "config.h"

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

String deviceId;
String projectId = "default";
unsigned long lastRead = 0;

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
    deviceId = String("sensor-") + String(macStr);
  }
}

void setupMQTT() {
  mqtt.setServer(MQTT_HOST, MQTT_PORT);

  String willTopic = "devices/" + projectId + "/" + deviceId + "/lwt";

  int attempts = 0;
  while (!mqtt.connected() && attempts < 3) {
    if (mqtt.connect(deviceId.c_str(), MQTT_USER, MQTT_PASSWORD,
                     willTopic.c_str(), 1, true, "{\"status\":\"offline\"}")) {
      // Publicar birth
      JsonDocument doc;
      doc["device_id"] = deviceId;
      doc["name"] = DEVICE_NAME;
      doc["type"] = DEVICE_TYPE;
      doc["firmware"] = FIRMWARE_VERSION;

      JsonArray caps = doc["capabilities"].to<JsonArray>();
      caps.add("sensor");

      String payload;
      serializeJson(doc, payload);
      String birthTopic = "devices/" + projectId + "/" + deviceId + "/birth";
      mqtt.publish(birthTopic.c_str(), payload.c_str(), true);
    } else {
      delay(2000);
      attempts++;
    }
  }
}

float readSensor() {
  // TODO: Reemplazar con lectura real del sensor
  // Ejemplo: DHT22, DS18B20, analógico, etc.
  return analogRead(SENSOR_PIN) * (3.3 / 4095.0);
}

void publishReading(float value) {
  JsonDocument doc;
  doc["firmware"] = FIRMWARE_VERSION;
  doc["sensor_value"] = value;
  doc["rssi"] = WiFi.RSSI();
  doc["uptime"] = millis() / 1000;
  doc["free_heap"] = ESP.getFreeHeap();

  String payload;
  serializeJson(doc, payload);

  String topic = "devices/" + projectId + "/" + deviceId + "/state/reported";
  mqtt.publish(topic.c_str(), payload.c_str(), true);

  Serial.printf("[sensor] Published: %.2f\n", value);
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n[sensor] Booting " FIRMWARE_VERSION);

  setupWiFi();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[sensor] No WiFi. Sleeping...");
    if (DEEP_SLEEP_US > 0) {
      esp_deep_sleep(DEEP_SLEEP_US);
    }
    return;
  }

  setupMQTT();

  if (mqtt.connected()) {
    float value = readSensor();
    publishReading(value);
    mqtt.loop();
    delay(100);
  }

  // Si deep sleep está activado, dormir después de publicar
  if (DEEP_SLEEP_US > 0) {
    Serial.printf("[sensor] Sleeping %d seconds...\n", (int)(DEEP_SLEEP_US / 1000000));
    mqtt.disconnect();
    WiFi.disconnect(true);
    esp_deep_sleep(DEEP_SLEEP_US);
  }
}

void loop() {
  // Solo se ejecuta si deep sleep está desactivado
  if (WiFi.status() != WL_CONNECTED) setupWiFi();
  if (!mqtt.connected()) setupMQTT();
  mqtt.loop();

  if (millis() - lastRead > READ_INTERVAL_MS) {
    float value = readSensor();
    publishReading(value);
    lastRead = millis();
  }

  delay(10);
}
