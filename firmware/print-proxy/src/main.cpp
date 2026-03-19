/**
 * ESP32 Print Proxy v2.1 — MQTT ←→ BLE thermal printer bridge
 *
 * Flujo:
 *   1. WiFi multi-red (hasta 3 redes con fallback automatico)
 *      Si ninguna conecta → portal cautivo AP para configurar desde el movil
 *   2. Portal web en http://<ip>/ para configurar MQTT, impresora, redes WiFi
 *   3. Conecta MQTT al VPS (event-core)
 *   4. Escanea y conecta impresora BLE
 *   5. Recibe ESC/POS en base64 por MQTT → decodifica → envia por BLE
 *   6. Publica ACK y estado periodicamente
 *
 * Toda la config se gestiona desde el portal web y se guarda en NVS (flash).
 * No necesitas editar codigo para cada instalacion.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <DNSServer.h>
#include <WebServer.h>
#include <Preferences.h>
#include <PubSubClient.h>
#include <NimBLEDevice.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>
#include "mbedtls/base64.h"
#include "config.h"
#include "portal.h"

// ============================================
// Estado global
// ============================================

PrintProxyConfig cfg;
Preferences prefs;
WebServer webServer(PORTAL_PORT);
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);
DNSServer dnsServer;

NimBLEClient*               bleClient     = nullptr;
NimBLERemoteCharacteristic* printChar     = nullptr;
bool                        printerReady  = false;

char topicPrint[80];
char topicPrinted[80];
char topicStatus[80];

unsigned long lastStatusMs      = 0;
unsigned long lastReconnectMs   = 0;
unsigned long lastBleRetryMs    = 0;
unsigned long lastWifiCheckMs   = 0;
uint32_t     printCount         = 0;
uint32_t     errorCount         = 0;

bool portalMode = false;  // true = AP captive portal activo

uint8_t payloadBuffer[MAX_PAYLOAD_SIZE];

// ============================================
// Config — Load / Save NVS
// ============================================

void configLoad() {
  prefs.begin(NVS_NAMESPACE, true);  // read-only
  strlcpy(cfg.deviceId,       prefs.getString("deviceId",    DEFAULT_DEVICE_ID).c_str(),    sizeof(cfg.deviceId));
  strlcpy(cfg.projectId,      prefs.getString("projectId",   DEFAULT_PROJECT_ID).c_str(),   sizeof(cfg.projectId));
  strlcpy(cfg.mqttHost,       prefs.getString("mqttHost",    DEFAULT_MQTT_HOST).c_str(),    sizeof(cfg.mqttHost));
  cfg.mqttPort =               prefs.getUShort("mqttPort",   DEFAULT_MQTT_PORT);
  strlcpy(cfg.mqttUser,       prefs.getString("mqttUser",    DEFAULT_MQTT_USER).c_str(),    sizeof(cfg.mqttUser));
  strlcpy(cfg.mqttPass,       prefs.getString("mqttPass",    DEFAULT_MQTT_PASS).c_str(),    sizeof(cfg.mqttPass));
  strlcpy(cfg.printerName,    prefs.getString("printerName", DEFAULT_PRINTER_NAME).c_str(), sizeof(cfg.printerName));
  strlcpy(cfg.printerAddr,    prefs.getString("printerAddr", "").c_str(),                   sizeof(cfg.printerAddr));
  strlcpy(cfg.printerSvcUuid, prefs.getString("printerSvc",  DEFAULT_PRINTER_SVC).c_str(),  sizeof(cfg.printerSvcUuid));
  strlcpy(cfg.printerCharUuid,prefs.getString("printerChar", DEFAULT_PRINTER_CHAR).c_str(), sizeof(cfg.printerCharUuid));

  // Cargar las 3 redes WiFi
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char keyS[16], keyP[16];
    snprintf(keyS, sizeof(keyS), "wifiSsid%d", i);
    snprintf(keyP, sizeof(keyP), "wifiPass%d", i);
    strlcpy(cfg.wifi[i].ssid, prefs.getString(keyS, "").c_str(), sizeof(cfg.wifi[i].ssid));
    strlcpy(cfg.wifi[i].pass, prefs.getString(keyP, "").c_str(), sizeof(cfg.wifi[i].pass));
  }
  cfg.wifiActive = -1;
  prefs.end();

  cfg.configured = (strlen(cfg.mqttHost) > 0 && strlen(cfg.printerName) > 0);

  Serial.printf("[CFG] device=%s project=%s mqtt=%s:%d printer=%s addr=%s configured=%s\n",
    cfg.deviceId, cfg.projectId, cfg.mqttHost, cfg.mqttPort,
    cfg.printerName, cfg.printerAddr, cfg.configured ? "SI" : "NO");
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    if (strlen(cfg.wifi[i].ssid) > 0)
      Serial.printf("[CFG] WiFi[%d] = %s\n", i, cfg.wifi[i].ssid);
  }
}

void configSave() {
  prefs.begin(NVS_NAMESPACE, false);  // read-write
  prefs.putString("deviceId",    cfg.deviceId);
  prefs.putString("projectId",   cfg.projectId);
  prefs.putString("mqttHost",    cfg.mqttHost);
  prefs.putUShort("mqttPort",    cfg.mqttPort);
  prefs.putString("mqttUser",    cfg.mqttUser);
  prefs.putString("mqttPass",    cfg.mqttPass);
  prefs.putString("printerName", cfg.printerName);
  prefs.putString("printerAddr", cfg.printerAddr);
  prefs.putString("printerSvc",  cfg.printerSvcUuid);
  prefs.putString("printerChar", cfg.printerCharUuid);

  // Guardar las 3 redes WiFi
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char keyS[16], keyP[16];
    snprintf(keyS, sizeof(keyS), "wifiSsid%d", i);
    snprintf(keyP, sizeof(keyP), "wifiPass%d", i);
    prefs.putString(keyS, cfg.wifi[i].ssid);
    prefs.putString(keyP, cfg.wifi[i].pass);
  }
  prefs.end();

  cfg.configured = (strlen(cfg.mqttHost) > 0 && strlen(cfg.printerName) > 0);
  Serial.println("[CFG] Guardado en NVS");
}

// ============================================
// Rebuild MQTT topics from config
// ============================================

void buildTopics() {
  snprintf(topicPrint,   sizeof(topicPrint),   "impresion/%s/print/%s",   cfg.projectId, cfg.deviceId);
  snprintf(topicPrinted, sizeof(topicPrinted), "impresion/%s/printed/%s", cfg.projectId, cfg.deviceId);
  snprintf(topicStatus,  sizeof(topicStatus),  "impresion/%s/status/%s",  cfg.projectId, cfg.deviceId);
}

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
// WiFi — Multi-red con fallback y portal cautivo
// ============================================

// Intenta conectar a una red especifica. Retorna true si conecta.
bool wifiTryConnect(int idx) {
  if (idx < 0 || idx >= WIFI_MAX_NETWORKS) return false;
  if (strlen(cfg.wifi[idx].ssid) == 0) return false;

  Serial.printf("[WiFi] Intentando red %d: %s...\n", idx + 1, cfg.wifi[idx].ssid);
  WiFi.begin(cfg.wifi[idx].ssid, cfg.wifi[idx].pass);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < WIFI_CONNECT_TIMEOUT) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    cfg.wifiActive = idx;
    Serial.printf("[WiFi] Conectado a '%s' — IP: %s\n",
      cfg.wifi[idx].ssid, WiFi.localIP().toString().c_str());
    return true;
  }

  Serial.printf("[WiFi] Fallo conectar a '%s'\n", cfg.wifi[idx].ssid);
  WiFi.disconnect();
  return false;
}

// Cicla por las 3 redes. Retorna true si alguna conecta.
bool wifiConnectMulti() {
  WiFi.mode(WIFI_STA);
  cfg.wifiActive = -1;

  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    if (wifiTryConnect(i)) return true;
  }

  Serial.println("[WiFi] Ninguna red disponible");
  return false;
}

// Abre portal cautivo en modo AP para configurar WiFi desde el movil
void wifiStartPortal() {
  portalMode = true;
  WiFi.disconnect();
  WiFi.mode(WIFI_AP);

  String apName = String(WIFI_AP_NAME_PREFIX) + "-" + String((uint32_t)ESP.getEfuseMac(), HEX).substring(4);
  WiFi.softAP(apName.c_str());

  Serial.printf("[WiFi] Portal cautivo activo — SSID: %s  IP: %s\n",
    apName.c_str(), WiFi.softAPIP().toString().c_str());

  // DNS que resuelve todo al ESP32 (captive portal)
  dnsServer.start(53, "*", WiFi.softAPIP());
}

// Conecta WiFi o abre portal. Retorna true si conecta a una red.
bool setupWiFi() {
  // Verificar si hay alguna red configurada
  bool hasNetworks = false;
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    if (strlen(cfg.wifi[i].ssid) > 0) { hasNetworks = true; break; }
  }

  if (hasNetworks && wifiConnectMulti()) {
    portalMode = false;
    ledBlink(2);
    return true;
  }

  // Sin redes o todas fallaron → portal cautivo
  wifiStartPortal();
  return false;
}

// ============================================
// BLE — Conexion con impresora
// ============================================

bool connectPrinterByAddress(NimBLEAddress addr) {
  Serial.printf("[BLE] Conectando directo a %s...\n", addr.toString().c_str());

  if (bleClient && bleClient->isConnected()) bleClient->disconnect();
  if (bleClient) NimBLEDevice::deleteClient(bleClient);

  bleClient = NimBLEDevice::createClient();
  if (!bleClient->connect(addr)) {
    Serial.println("[BLE] Fallo conexion directa");
    return false;
  }

  Serial.println("[BLE] Conectado. Buscando servicio...");

  NimBLERemoteService* svc = bleClient->getService(cfg.printerSvcUuid);
  if (!svc) {
    Serial.printf("[BLE] Servicio %s no encontrado. Servicios disponibles:\n", cfg.printerSvcUuid);
    auto* svcs = bleClient->getServices(true);
    if (svcs) {
      for (auto& s : *svcs) {
        Serial.printf("[BLE]   Svc: %s\n", s->getUUID().toString().c_str());
        auto chars = s->getCharacteristics(true);
        if (chars) {
          for (auto& c : *chars) {
            Serial.printf("[BLE]     Char: %s [%s%s%s]\n",
              c->getUUID().toString().c_str(),
              c->canRead() ? "R" : "", c->canWrite() ? "W" : "", c->canNotify() ? "N" : "");
          }
        }
      }
    }
    bleClient->disconnect();
    return false;
  }

  printChar = svc->getCharacteristic(cfg.printerCharUuid);
  if (!printChar) {
    Serial.printf("[BLE] Characteristic %s no encontrada\n", cfg.printerCharUuid);
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

bool connectPrinter() {
  if (strlen(cfg.printerName) == 0) {
    Serial.println("[BLE] No hay impresora configurada. Configura desde el portal web.");
    return false;
  }

  printerReady = false;

  // 1. Si tenemos MAC guardada, intentar conexion directa (sin escaneo — rapido)
  if (strlen(cfg.printerAddr) > 0) {
    Serial.printf("[BLE] MAC guardada: %s — conectando directo...\n", cfg.printerAddr);
    NimBLEAddress savedAddr(cfg.printerAddr);
    if (connectPrinterByAddress(savedAddr)) {
      return true;
    }
    Serial.println("[BLE] Conexion directa fallo, cayendo a escaneo...");
  }

  // 2. Escanear por nombre
  Serial.printf("[BLE] Escaneando '%s' (%d seg)...\n", cfg.printerName, BLE_SCAN_SECONDS);

  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->setActiveScan(true);
  NimBLEScanResults results = scan->start(BLE_SCAN_SECONDS);

  NimBLEAdvertisedDevice* printer = nullptr;
  for (int i = 0; i < results.getCount(); i++) {
    NimBLEAdvertisedDevice dev = results.getDevice(i);
    Serial.printf("[BLE]   Encontrado: %s (%s)\n",
      dev.getName().c_str(), dev.getAddress().toString().c_str());
    if (dev.getName() == cfg.printerName) {
      printer = new NimBLEAdvertisedDevice(dev);
      break;
    }
  }
  scan->clearResults();

  if (!printer) {
    Serial.printf("[BLE] Impresora '%s' no encontrada\n", cfg.printerName);
    return false;
  }

  // Guardar MAC en NVS para reconexion directa la proxima vez
  String foundAddr = printer->getAddress().toString().c_str();
  if (strcmp(cfg.printerAddr, foundAddr.c_str()) != 0) {
    strlcpy(cfg.printerAddr, foundAddr.c_str(), sizeof(cfg.printerAddr));
    configSave();
    Serial.printf("[BLE] MAC guardada en NVS: %s\n", cfg.printerAddr);
  }

  NimBLEAddress addr = printer->getAddress();
  delete printer;

  return connectPrinterByAddress(addr);
}

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
    bool ok = printChar->writeValue(data + sent, chunkLen, !useNoResponse);
    if (!ok) {
      Serial.printf("[BLE] Error escribiendo en offset %d\n", sent);
      ledOff();
      return false;
    }
    sent += chunkLen;
    if (sent < len) delay(BLE_CHUNK_DELAY);
  }

  ledOff();
  Serial.printf("[BLE] Enviado OK (%d bytes)\n", sent);
  return true;
}

// ============================================
// MQTT
// ============================================

void publishResult(const char* jobId, bool success, const char* error = nullptr) {
  JsonDocument doc;
  doc["device_id"]   = cfg.deviceId;
  doc["job_id"]      = jobId;
  doc["success"]     = success;
  doc["timestamp"]   = millis();
  doc["print_count"] = printCount;
  if (error) doc["error"] = error;

  char buf[256];
  serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topicPrinted, buf);
}

void publishStatus() {
  JsonDocument doc;
  doc["device_id"]      = cfg.deviceId;
  doc["project_id"]     = cfg.projectId;
  doc["online"]         = true;
  doc["printer_ready"]  = printerReady;
  doc["printer_name"]   = cfg.printerName;
  doc["printer_addr"]   = cfg.printerAddr;
  doc["wifi_rssi"]      = WiFi.RSSI();
  doc["wifi_ssid"]      = (cfg.wifiActive >= 0) ? cfg.wifi[cfg.wifiActive].ssid : "";
  doc["ip"]             = WiFi.localIP().toString();
  doc["uptime_sec"]     = millis() / 1000;
  doc["print_count"]    = printCount;
  doc["error_count"]    = errorCount;
  doc["free_heap"]      = ESP.getFreeHeap();

  char buf[384];
  serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topicStatus, buf);
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  Serial.printf("[MQTT] Mensaje recibido (%d bytes) en %s\n", length, topic);

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
    errorCount++;
    publishResult(jobId, false, "Missing 'data' field");
    return;
  }

  size_t b64len = strlen(b64data);
  size_t decodedLen = 0;

  int ret = mbedtls_base64_decode(payloadBuffer, MAX_PAYLOAD_SIZE, &decodedLen,
                                   (const unsigned char*)b64data, b64len);
  if (ret == MBEDTLS_ERR_BASE64_BUFFER_TOO_SMALL) {
    errorCount++;
    publishResult(jobId, false, "Payload too large");
    return;
  }
  if (ret != 0) {
    errorCount++;
    publishResult(jobId, false, "Base64 decode error");
    return;
  }

  if (!printerReady || !bleClient || !bleClient->isConnected()) {
    Serial.println("[MQTT] Impresora desconectada, reconectando...");
    if (!connectPrinter()) {
      errorCount++;
      publishResult(jobId, false, "Printer not connected");
      return;
    }
  }

  bool ok = sendToPrinter(payloadBuffer, decodedLen);
  if (ok) {
    printCount++;
    publishResult(jobId, true);
    Serial.printf("[PRINT] Job %s OK (#%d)\n", jobId, printCount);
  } else {
    errorCount++;
    printerReady = false;
    publishResult(jobId, false, "BLE write failed");
  }
}

void connectMQTT() {
  if (mqtt.connected()) return;
  if (strlen(cfg.mqttHost) == 0) return;

  Serial.printf("[MQTT] Conectando a %s:%d...\n", cfg.mqttHost, cfg.mqttPort);

  String clientId = "print-proxy-" + String(cfg.deviceId);

  bool connected;
  if (strlen(cfg.mqttUser) > 0) {
    connected = mqtt.connect(clientId.c_str(), cfg.mqttUser, cfg.mqttPass);
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

// Reconnect MQTT + rebuild topics (llamado tras guardar config)
void reconnectServices() {
  if (mqtt.connected()) mqtt.disconnect();
  buildTopics();
  mqtt.setServer(cfg.mqttHost, cfg.mqttPort);
  connectMQTT();

  if (strlen(cfg.printerName) > 0 && !printerReady) {
    connectPrinter();
  }
}

// ============================================
// Portal web — API endpoints
// ============================================

void handleRoot() {
  webServer.send_P(200, "text/html", PORTAL_HTML);
}

void handleGetConfig() {
  JsonDocument doc;
  doc["device_id"]    = cfg.deviceId;
  doc["project_id"]   = cfg.projectId;

  // WiFi — las 3 redes
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char keyS[16], keyP[16];
    snprintf(keyS, sizeof(keyS), "wifi_ssid%d", i + 1);
    snprintf(keyP, sizeof(keyP), "wifi_pass%d", i + 1);
    doc[keyS] = cfg.wifi[i].ssid;
    doc[keyP] = cfg.wifi[i].pass;
  }
  doc["wifi_active"]  = (cfg.wifiActive >= 0) ? cfg.wifi[cfg.wifiActive].ssid : "ninguna";

  doc["mqtt_host"]    = cfg.mqttHost;
  doc["mqtt_port"]    = cfg.mqttPort;
  doc["mqtt_user"]    = cfg.mqttUser;
  doc["mqtt_pass"]    = cfg.mqttPass;
  doc["printer_name"] = cfg.printerName;
  doc["printer_addr"] = cfg.printerAddr;
  doc["printer_svc"]  = cfg.printerSvcUuid;
  doc["printer_char"] = cfg.printerCharUuid;
  doc["ip"]           = portalMode ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
  doc["portal_mode"]  = portalMode;

  unsigned long up = millis() / 1000;
  char upStr[32];
  snprintf(upStr, sizeof(upStr), "%luh %lum", up / 3600, (up % 3600) / 60);
  doc["uptime"] = upStr;

  char buf[768];
  serializeJson(doc, buf, sizeof(buf));
  webServer.send(200, "application/json", buf);
}

void handlePostConfig() {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, webServer.arg("plain"));
  if (err) {
    webServer.send(400, "application/json", "{\"ok\":false,\"error\":\"JSON invalido\"}");
    return;
  }

  if (doc["device_id"].is<const char*>())    strlcpy(cfg.deviceId,        doc["device_id"],    sizeof(cfg.deviceId));
  if (doc["project_id"].is<const char*>())   strlcpy(cfg.projectId,       doc["project_id"],   sizeof(cfg.projectId));

  // WiFi — las 3 redes
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char keyS[16], keyP[16];
    snprintf(keyS, sizeof(keyS), "wifi_ssid%d", i + 1);
    snprintf(keyP, sizeof(keyP), "wifi_pass%d", i + 1);
    if (doc[keyS].is<const char*>()) strlcpy(cfg.wifi[i].ssid, doc[keyS], sizeof(cfg.wifi[i].ssid));
    if (doc[keyP].is<const char*>()) strlcpy(cfg.wifi[i].pass, doc[keyP], sizeof(cfg.wifi[i].pass));
  }

  if (doc["mqtt_host"].is<const char*>())    strlcpy(cfg.mqttHost,        doc["mqtt_host"],    sizeof(cfg.mqttHost));
  if (doc["mqtt_port"].is<int>())            cfg.mqttPort = doc["mqtt_port"];
  if (doc["mqtt_user"].is<const char*>())    strlcpy(cfg.mqttUser,        doc["mqtt_user"],    sizeof(cfg.mqttUser));
  if (doc["mqtt_pass"].is<const char*>())    strlcpy(cfg.mqttPass,        doc["mqtt_pass"],    sizeof(cfg.mqttPass));
  if (doc["printer_name"].is<const char*>()) strlcpy(cfg.printerName,     doc["printer_name"], sizeof(cfg.printerName));
  if (doc["printer_addr"].is<const char*>()) strlcpy(cfg.printerAddr,     doc["printer_addr"], sizeof(cfg.printerAddr));
  if (doc["printer_svc"].is<const char*>())  strlcpy(cfg.printerSvcUuid,  doc["printer_svc"],  sizeof(cfg.printerSvcUuid));
  if (doc["printer_char"].is<const char*>()) strlcpy(cfg.printerCharUuid, doc["printer_char"], sizeof(cfg.printerCharUuid));

  configSave();

  // Si estamos en portal cautivo y ahora hay redes, intentar conectar
  if (portalMode) {
    bool hasNetworks = false;
    for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
      if (strlen(cfg.wifi[i].ssid) > 0) { hasNetworks = true; break; }
    }
    if (hasNetworks) {
      webServer.send(200, "application/json", "{\"ok\":true,\"msg\":\"Guardado. Reiniciando para conectar WiFi...\"}");
      delay(1000);
      ESP.restart();
      return;
    }
  }

  reconnectServices();
  webServer.send(200, "application/json", "{\"ok\":true}");
}

void handleGetStatus() {
  JsonDocument doc;
  doc["wifi"]    = (WiFi.status() == WL_CONNECTED);
  doc["mqtt"]    = mqtt.connected();
  doc["printer"] = printerReady;
  doc["portal"]  = portalMode;

  char buf[128];
  serializeJson(doc, buf, sizeof(buf));
  webServer.send(200, "application/json", buf);
}

void handleScan() {
  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->setActiveScan(true);
  NimBLEScanResults results = scan->start(BLE_SCAN_SECONDS);

  JsonDocument doc;
  auto arr = doc.to<JsonArray>();

  for (int i = 0; i < results.getCount(); i++) {
    NimBLEAdvertisedDevice dev = results.getDevice(i);
    String name = dev.getName().c_str();
    if (name.length() == 0) continue;

    JsonObject obj = arr.add<JsonObject>();
    obj["name"] = name;
    obj["addr"] = dev.getAddress().toString().c_str();
    obj["rssi"] = dev.getRSSI();
  }
  scan->clearResults();

  char buf[1024];
  serializeJson(doc, buf, sizeof(buf));
  webServer.send(200, "application/json", buf);
}

void handleTestPrint() {
  if (!printerReady || !bleClient || !bleClient->isConnected()) {
    if (!connectPrinter()) {
      webServer.send(200, "application/json", "{\"ok\":false,\"error\":\"Impresora no conectada\"}");
      return;
    }
  }

  uint8_t testData[] = {
    0x1B, 0x40,             // ESC @ — inicializar
    0x1B, 0x61, 0x01,       // ESC a 1 — centrar
    0x1B, 0x45, 0x01,       // ESC E 1 — negrita on
    'P','R','I','N','T',' ','P','R','O','X','Y', 0x0A,
    0x1B, 0x45, 0x00,       // ESC E 0 — negrita off
    '-','-','-','-','-','-','-','-','-','-','-','-','-','-','-','-', 0x0A,
    'T','e','s','t',' ','O','K', 0x0A,
    0x0A, 0x0A, 0x0A,
    0x1D, 0x56, 0x00        // GS V 0 — corte total
  };

  bool ok = sendToPrinter(testData, sizeof(testData));
  if (ok) {
    printCount++;
    webServer.send(200, "application/json", "{\"ok\":true}");
  } else {
    webServer.send(200, "application/json", "{\"ok\":false,\"error\":\"Error BLE write\"}");
  }
}

void handleReset() {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.clear();
  prefs.end();
  webServer.send(200, "application/json", "{\"ok\":true}");
  delay(1000);
  ESP.restart();
}

void portalSetup() {
  webServer.on("/",                HTTP_GET,  handleRoot);
  webServer.on("/api/config",      HTTP_GET,  handleGetConfig);
  webServer.on("/api/config",      HTTP_POST, handlePostConfig);
  webServer.on("/api/status",      HTTP_GET,  handleGetStatus);
  webServer.on("/api/scan",        HTTP_GET,  handleScan);
  webServer.on("/api/test-print",  HTTP_POST, handleTestPrint);
  webServer.on("/api/reset",       HTTP_POST, handleReset);
}

// ============================================
// Setup & Loop
// ============================================

void setup() {
  Serial.begin(115200);
  delay(500);
  pinMode(LED_PIN, OUTPUT);

  Serial.println("\n========================================");
  Serial.println("  ESP32 Print Proxy v2.1");
  Serial.println("  Multi-WiFi + Portal Cautivo");
  Serial.println("========================================\n");

  // Watchdog — reinicia si se queda colgado
  esp_task_wdt_init(WDT_TIMEOUT_SEC, true);
  esp_task_wdt_add(NULL);

  // 1. Cargar config de NVS
  configLoad();
  buildTopics();

  // 2. WiFi multi-red o portal cautivo
  bool wifiOk = setupWiFi();

  // 3. BLE + Portal web (siempre disponible, en STA o AP mode)
  NimBLEDevice::init("PrintProxy");
  portalSetup();
  webServer.begin();

  if (portalMode) {
    Serial.printf("[WEB] Portal cautivo en http://%s/\n", WiFi.softAPIP().toString().c_str());
    Serial.println("[!] Conectate al AP 'PrintProxy-XXXX' y abre el portal para configurar WiFi");
  } else {
    Serial.printf("[WEB] Portal en http://%s/\n", WiFi.localIP().toString().c_str());

    // 4. MQTT (solo si esta configurado y hay WiFi)
    mqtt.setCallback(onMqttMessage);
    mqtt.setBufferSize(MAX_PAYLOAD_SIZE + 256);
    if (cfg.configured) {
      mqtt.setServer(cfg.mqttHost, cfg.mqttPort);
      connectMQTT();

      // 5. Impresora BLE
      if (!connectPrinter()) {
        Serial.println("[BLE] Impresora no disponible. Configura desde el portal web.");
      }
    } else {
      Serial.println("\n[!] No configurado. Abre el portal web para configurar:");
      Serial.printf("    http://%s/\n\n", WiFi.localIP().toString().c_str());
    }
  }

  Serial.println("[READY] Print Proxy operativo\n");
}

void loop() {
  // Watchdog feed
  esp_task_wdt_reset();

  // DNS para captive portal (solo en modo AP)
  if (portalMode) {
    dnsServer.processNextRequest();
  }

  // Servir portal web
  webServer.handleClient();

  // Si estamos en modo portal, no hay nada mas que hacer
  if (portalMode) return;

  // --- WiFi monitoring ---
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

  // --- MQTT ---
  if (cfg.configured) {
    if (!mqtt.connected()) {
      now = millis();
      if (now - lastReconnectMs > 5000) {
        lastReconnectMs = now;
        connectMQTT();
      }
    }
    mqtt.loop();

    // Status periodico
    now = millis();
    if (now - lastStatusMs > STATUS_INTERVAL_MS) {
      lastStatusMs = now;
      if (mqtt.connected()) publishStatus();
    }
  }

  // --- BLE — detectar desconexion y reconectar ---
  if (printerReady && bleClient && !bleClient->isConnected()) {
    Serial.println("[BLE] Impresora desconectada");
    printerReady = false;
    lastBleRetryMs = millis();
  }

  if (!printerReady && cfg.configured && strlen(cfg.printerName) > 0) {
    now = millis();
    if (now - lastBleRetryMs > BLE_RECONNECT_MS) {
      lastBleRetryMs = now;
      Serial.println("[BLE] Reintentando conexion...");
      connectPrinter();
    }
  }
}
