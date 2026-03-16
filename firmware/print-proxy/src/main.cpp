/**
 * ESP32 Print Proxy — MQTT ←→ BLE thermal printer bridge
 *
 * Funcion:
 *   1. Conecta WiFi (portal cautivo o credenciales fijas)
 *   2. Conecta MQTT al VPS (event-core)
 *   3. Escanea y conecta impresora Netum Mini por BLE
 *   4. Recibe ESC/POS en base64 por MQTT → decodifica → envia por BLE
 *   5. Publica ACK y estado periodicamente
 *
 * Topics MQTT:
 *   SUB: impresion/{project}/print/{device}   → payload base64 ESC/POS
 *   PUB: impresion/{project}/printed/{device} → ACK con resultado
 *   PUB: impresion/{project}/status/{device}  → estado periodico
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <NimBLEDevice.h>
#include <ArduinoJson.h>
#include "mbedtls/base64.h"
#include "config.h"

#if USE_WIFI_MANAGER
#include <WiFiManager.h>
#endif

// ============================================
// Estado global
// ============================================

WiFiClient   wifiClient;
PubSubClient mqtt(wifiClient);

NimBLEClient*              bleClient     = nullptr;
NimBLERemoteCharacteristic* printChar    = nullptr;
bool                        printerReady = false;

// Topics construidos en setup()
char topicPrint[80];    // impresion/{project}/print/{device}
char topicPrinted[80];  // impresion/{project}/printed/{device}
char topicStatus[80];   // impresion/{project}/status/{device}

unsigned long lastStatusMs    = 0;
unsigned long lastReconnectMs = 0;
uint32_t     printCount       = 0;
uint32_t     errorCount       = 0;

// Buffer para mensajes MQTT grandes
// Una comanda tipica en base64 son ~1KB, maximo ~4KB
#define MAX_PAYLOAD_SIZE 4096
uint8_t payloadBuffer[MAX_PAYLOAD_SIZE];

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
// WiFi
// ============================================

void setupWiFi() {
  Serial.println("[WiFi] Conectando...");

#if USE_WIFI_MANAGER
  WiFiManager wm;
  wm.setConfigPortalTimeout(180); // 3 min portal
  // Nombre del AP: PrintProxy-XXXX (ultimos 4 del MAC)
  String apName = "PrintProxy-" + String((uint32_t)ESP.getEfuseMac(), HEX).substring(4);
  if (!wm.autoConnect(apName.c_str())) {
    Serial.println("[WiFi] Fallo portal cautivo, reiniciando...");
    ESP.restart();
  }
#else
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\n[WiFi] No se pudo conectar, reiniciando...");
    ESP.restart();
  }
#endif

  Serial.printf("[WiFi] Conectado — IP: %s\n", WiFi.localIP().toString().c_str());
  ledBlink(2);
}

// ============================================
// BLE — Conexion con impresora
// ============================================

/**
 * Escanea BLE buscando la impresora por nombre.
 * Retorna true si la encuentra y conecta.
 */
bool connectPrinter() {
  Serial.printf("[BLE] Escaneando '%s' (%d seg)...\n", PRINTER_BT_NAME, BLE_SCAN_SECONDS);
  printerReady = false;

  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->setActiveScan(true);
  NimBLEScanResults results = scan->start(BLE_SCAN_SECONDS);

  NimBLEAdvertisedDevice* printer = nullptr;
  for (int i = 0; i < results.getCount(); i++) {
    NimBLEAdvertisedDevice dev = results.getDevice(i);
    Serial.printf("[BLE]   Encontrado: %s (%s)\n",
      dev.getName().c_str(), dev.getAddress().toString().c_str());

    if (dev.getName() == PRINTER_BT_NAME) {
      printer = new NimBLEAdvertisedDevice(dev);
      break;
    }
  }
  scan->clearResults();

  if (!printer) {
    Serial.printf("[BLE] Impresora '%s' no encontrada\n", PRINTER_BT_NAME);
    return false;
  }

  Serial.printf("[BLE] Conectando a %s...\n", printer->getAddress().toString().c_str());

  // Desconectar cliente anterior si existe
  if (bleClient && bleClient->isConnected()) {
    bleClient->disconnect();
  }
  if (bleClient) {
    NimBLEDevice::deleteClient(bleClient);
  }

  bleClient = NimBLEDevice::createClient();
  if (!bleClient->connect(printer)) {
    Serial.println("[BLE] Fallo conexion");
    delete printer;
    return false;
  }
  delete printer;

  Serial.println("[BLE] Conectado. Buscando servicio de impresion...");

  // Buscar el servicio y la characteristic de escritura
  NimBLERemoteService* svc = bleClient->getService(PRINTER_SERVICE_UUID);
  if (!svc) {
    Serial.printf("[BLE] Servicio %s no encontrado. Listando servicios:\n", PRINTER_SERVICE_UUID);
    // Debug: listar todos los servicios para diagnostico
    auto* svcs = bleClient->getServices(true);
    if (svcs) {
      for (auto& s : *svcs) {
        Serial.printf("[BLE]   Service: %s\n", s->getUUID().toString().c_str());
        auto chars = s->getCharacteristics(true);
        if (chars) {
          for (auto& c : *chars) {
            Serial.printf("[BLE]     Char: %s [%s%s%s]\n",
              c->getUUID().toString().c_str(),
              c->canRead()   ? "R" : "",
              c->canWrite()  ? "W" : "",
              c->canNotify() ? "N" : "");
          }
        }
      }
    }
    bleClient->disconnect();
    return false;
  }

  printChar = svc->getCharacteristic(PRINTER_CHAR_UUID);
  if (!printChar) {
    Serial.printf("[BLE] Characteristic %s no encontrada\n", PRINTER_CHAR_UUID);
    bleClient->disconnect();
    return false;
  }

  if (!printChar->canWrite() && !printChar->canWriteNoResponse()) {
    Serial.println("[BLE] La characteristic no soporta escritura");
    bleClient->disconnect();
    return false;
  }

  printerReady = true;
  Serial.printf("[BLE] Impresora lista (write%s)\n",
    printChar->canWriteNoResponse() ? " no-response" : " con response");
  ledBlink(3, 200);
  return true;
}

/**
 * Envia buffer ESC/POS a la impresora en chunks BLE.
 * Retorna true si todo se envio OK.
 */
bool sendToPrinter(const uint8_t* data, size_t len) {
  if (!printerReady || !bleClient || !bleClient->isConnected() || !printChar) {
    Serial.println("[BLE] Impresora no conectada");
    return false;
  }

  Serial.printf("[BLE] Enviando %d bytes en chunks de %d...\n", len, BLE_CHUNK_SIZE);
  ledOn();

  bool useNoResponse = printChar->canWriteNoResponse();
  size_t sent = 0;

  while (sent < len) {
    size_t chunkLen = min((size_t)BLE_CHUNK_SIZE, len - sent);

    bool ok;
    if (useNoResponse) {
      ok = printChar->writeValue(data + sent, chunkLen, false);
    } else {
      ok = printChar->writeValue(data + sent, chunkLen, true);
    }

    if (!ok) {
      Serial.printf("[BLE] Error escribiendo en offset %d\n", sent);
      ledOff();
      return false;
    }

    sent += chunkLen;
    if (sent < len) {
      delay(BLE_CHUNK_DELAY);
    }
  }

  ledOff();
  Serial.printf("[BLE] Enviado OK (%d bytes)\n", sent);
  return true;
}

// ============================================
// MQTT
// ============================================

/**
 * Publica ACK o error como respuesta a un print job.
 */
void publishResult(const char* jobId, bool success, const char* error = nullptr) {
  JsonDocument doc;
  doc["device_id"]  = DEVICE_ID;
  doc["job_id"]     = jobId;
  doc["success"]    = success;
  doc["timestamp"]  = millis();
  doc["print_count"] = printCount;
  if (error) doc["error"] = error;

  char buf[256];
  serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topicPrinted, buf);
}

/**
 * Publica estado periodico del dispositivo.
 */
void publishStatus() {
  JsonDocument doc;
  doc["device_id"]      = DEVICE_ID;
  doc["project_id"]     = PROJECT_ID;
  doc["online"]         = true;
  doc["printer_ready"]  = printerReady;
  doc["printer_name"]   = PRINTER_BT_NAME;
  doc["wifi_rssi"]      = WiFi.RSSI();
  doc["ip"]             = WiFi.localIP().toString();
  doc["uptime_sec"]     = millis() / 1000;
  doc["print_count"]    = printCount;
  doc["error_count"]    = errorCount;
  doc["free_heap"]      = ESP.getFreeHeap();

  char buf[384];
  serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topicStatus, buf);
}

/**
 * Callback MQTT — recibe print jobs.
 * Payload esperado: JSON { "job_id": "xxx", "data": "<base64 ESC/POS>" }
 */
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  Serial.printf("[MQTT] Mensaje recibido (%d bytes) en %s\n", length, topic);

  // Parsear JSON
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.printf("[MQTT] Error JSON: %s\n", err.c_str());
    errorCount++;
    publishResult("unknown", false, "JSON parse error");
    return;
  }

  const char* jobId   = doc["job_id"] | "no-id";
  const char* b64data = doc["data"];

  if (!b64data) {
    Serial.println("[MQTT] Falta campo 'data' (base64 ESC/POS)");
    errorCount++;
    publishResult(jobId, false, "Missing 'data' field");
    return;
  }

  // Decodificar base64 (mbedtls incluido en ESP-IDF)
  size_t b64len = strlen(b64data);
  size_t decodedLen = 0;

  int ret = mbedtls_base64_decode(payloadBuffer, MAX_PAYLOAD_SIZE, &decodedLen,
                                   (const unsigned char*)b64data, b64len);
  if (ret == MBEDTLS_ERR_BASE64_BUFFER_TOO_SMALL) {
    Serial.printf("[MQTT] Payload demasiado grande\n");
    errorCount++;
    publishResult(jobId, false, "Payload too large");
    return;
  }
  if (ret != 0) {
    Serial.printf("[MQTT] Error decodificando base64: %d\n", ret);
    errorCount++;
    publishResult(jobId, false, "Base64 decode error");
    return;
  }

  // Reconectar impresora si se desconecto
  if (!printerReady || !bleClient || !bleClient->isConnected()) {
    Serial.println("[MQTT] Impresora desconectada, intentando reconectar...");
    if (!connectPrinter()) {
      errorCount++;
      publishResult(jobId, false, "Printer not connected");
      return;
    }
  }

  // Enviar a impresora
  bool ok = sendToPrinter(payloadBuffer, decodedLen);
  if (ok) {
    printCount++;
    publishResult(jobId, true);
    Serial.printf("[PRINT] Job %s completado (#%d)\n", jobId, printCount);
  } else {
    errorCount++;
    printerReady = false; // forzar reconexion en proximo intento
    publishResult(jobId, false, "BLE write failed");
  }
}

void connectMQTT() {
  if (mqtt.connected()) return;

  Serial.printf("[MQTT] Conectando a %s:%d...\n", MQTT_HOST, MQTT_PORT);

  String clientId = "print-proxy-" + String(DEVICE_ID);

  bool connected;
  if (strlen(MQTT_USER) > 0) {
    connected = mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASS);
  } else {
    connected = mqtt.connect(clientId.c_str());
  }

  if (connected) {
    Serial.println("[MQTT] Conectado");
    mqtt.subscribe(topicPrint);
    Serial.printf("[MQTT] Suscrito a: %s\n", topicPrint);
    publishStatus();
    ledBlink(1, 500);
  } else {
    Serial.printf("[MQTT] Fallo (rc=%d)\n", mqtt.state());
  }
}

// ============================================
// Setup & Loop
// ============================================

void setup() {
  Serial.begin(115200);
  delay(500);
  pinMode(LED_PIN, OUTPUT);

  Serial.println("\n========================================");
  Serial.println("  ESP32 Print Proxy v1.0.0");
  Serial.printf("  Device: %s / Project: %s\n", DEVICE_ID, PROJECT_ID);
  Serial.println("========================================\n");

  // Construir topics MQTT
  snprintf(topicPrint,   sizeof(topicPrint),   "impresion/%s/print/%s",   PROJECT_ID, DEVICE_ID);
  snprintf(topicPrinted, sizeof(topicPrinted), "impresion/%s/printed/%s", PROJECT_ID, DEVICE_ID);
  snprintf(topicStatus,  sizeof(topicStatus),  "impresion/%s/status/%s",  PROJECT_ID, DEVICE_ID);

  // 1. WiFi
  setupWiFi();

  // 2. MQTT
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(MAX_PAYLOAD_SIZE + 256); // payload + JSON wrapper
  connectMQTT();

  // 3. BLE
  NimBLEDevice::init("PrintProxy");
  // Intentar conectar impresora (no es fatal si falla)
  if (!connectPrinter()) {
    Serial.println("[BLE] Impresora no disponible. Reintentara al recibir print job.");
  }

  Serial.println("\n[READY] Print Proxy operativo\n");
}

void loop() {
  // Mantener MQTT vivo
  if (!mqtt.connected()) {
    unsigned long now = millis();
    if (now - lastReconnectMs > 5000) {
      lastReconnectMs = now;
      connectMQTT();
    }
  }
  mqtt.loop();

  // Publicar status periodicamente
  unsigned long now = millis();
  if (now - lastStatusMs > STATUS_INTERVAL_MS) {
    lastStatusMs = now;
    if (mqtt.connected()) {
      publishStatus();
    }
  }

  // Check BLE connection
  if (printerReady && bleClient && !bleClient->isConnected()) {
    Serial.println("[BLE] Impresora desconectada");
    printerReady = false;
  }
}
