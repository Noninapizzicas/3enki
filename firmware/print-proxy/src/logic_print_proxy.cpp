/**
 * LÓGICA: Print Proxy — Bridge MQTT ←→ Bluetooth thermal printer
 *
 * Recibe ESC/POS en base64 por MQTT, decodifica, envía por Bluetooth.
 * Soporta dos modos configurables desde el portal web:
 *
 *   BLE (NimBLE):  Bluetooth Low Energy — menor consumo, MTU 240B
 *   SPP (Serial):  Bluetooth Clásico — más estable, mayor ancho de banda
 *
 * El modo se guarda en NVS y se puede cambiar sin recompilar.
 *
 * v4.0 — Dual BLE/SPP:
 *   - Selector de modo en portal web
 *   - SPP: BluetoothSerial, conexión directa por MAC, sin chunks
 *   - BLE: NimBLE, scan + GATT, chunked write
 *   - Ambos: reconexión automática, keepalive, mismo flujo MQTT
 */

#include "enki_logic.h"
#include "enki_base.h"
#include "enki_portal.h"
#include "enki_wifi.h"
#include <NimBLEDevice.h>
#include "BluetoothSerial.h"
#include "mbedtls/base64.h"

// ============================================
// Estado del driver
// ============================================

// Modos
#define BT_MODE_BLE  0
#define BT_MODE_SPP  1

// Config (NVS)
static char    printerName[32];
static char    printerAddr[20];
static char    printerSvcUuid[48];
static char    printerCharUuid[48];
static uint8_t btMode = BT_MODE_BLE;

// BLE
static NimBLEClient*               bleClient    = nullptr;
static NimBLERemoteCharacteristic* printChar    = nullptr;

// SPP
static BluetoothSerial SerialBT;
static bool sppInitialized = false;

// Común
static bool printerReady = false;

// Topics MQTT
static char topicPrint[80];
static char topicPrinted[80];

// Timers
static unsigned long lastRetryMs = 0;
static unsigned long lastCheckMs = 0;

// Contadores
static uint32_t printCount = 0;
static uint32_t errorCount = 0;
static uint32_t reconnectCount = 0;

// ============================================
// Config del driver (NVS)
// ============================================

static void loadDriverConfig() {
  strlcpy(printerName,     enki_config_get("printerName", DEFAULT_PRINTER_NAME), sizeof(printerName));
  strlcpy(printerAddr,     enki_config_get("printerAddr", ""),                   sizeof(printerAddr));
  strlcpy(printerSvcUuid,  enki_config_get("printerSvc",  DEFAULT_PRINTER_SVC),  sizeof(printerSvcUuid));
  strlcpy(printerCharUuid, enki_config_get("printerChar", DEFAULT_PRINTER_CHAR), sizeof(printerCharUuid));
  btMode = enki_config_get_u16("btMode", BT_MODE_BLE);

  Serial.printf("[PRINT] printer=%s addr=%s mode=%s\n",
    printerName, printerAddr, btMode == BT_MODE_SPP ? "SPP" : "BLE");
}

static void saveDriverConfig() {
  enki_config_set("printerName", printerName);
  enki_config_set("printerAddr", printerAddr);
  enki_config_set("printerSvc",  printerSvcUuid);
  enki_config_set("printerChar", printerCharUuid);
  enki_config_set_u16("btMode",  btMode);
}

// ============================================
// SPP — Bluetooth Clásico (Serial Port Profile)
// ============================================

static bool sppConnect() {
  if (strlen(printerAddr) == 0 && strlen(printerName) == 0) {
    Serial.println("[SPP] No hay impresora configurada");
    return false;
  }

  // Inicializar SPP si no lo está
  if (!sppInitialized) {
    SerialBT.begin("EnkiPrint", true);  // true = master mode
    sppInitialized = true;
    Serial.println("[SPP] BluetoothSerial iniciado (master)");
  }

  // Desconectar si estaba conectado
  if (SerialBT.connected()) {
    SerialBT.disconnect();
    delay(200);
  }

  // Conectar por MAC (rápido, ~1-2s)
  if (strlen(printerAddr) > 0) {
    Serial.printf("[SPP] Conectando a MAC %s...\n", printerAddr);

    uint8_t mac[6];
    if (sscanf(printerAddr, "%hhx:%hhx:%hhx:%hhx:%hhx:%hhx",
               &mac[0], &mac[1], &mac[2], &mac[3], &mac[4], &mac[5]) == 6) {
      if (SerialBT.connect(mac)) {
        printerReady = true;
        lastCheckMs = millis();
        reconnectCount++;
        Serial.printf("[SPP] Conectado a %s — reconexiones: %d\n", printerAddr, reconnectCount);
        enki_led_blink(3, 200);
        return true;
      }
    }
    Serial.println("[SPP] Conexion por MAC fallo");
  }

  // Fallback: conectar por nombre
  if (strlen(printerName) > 0) {
    Serial.printf("[SPP] Conectando por nombre '%s'...\n", printerName);
    if (SerialBT.connect(printerName)) {
      printerReady = true;
      lastCheckMs = millis();
      reconnectCount++;
      Serial.printf("[SPP] Conectado a '%s' — reconexiones: %d\n", printerName, reconnectCount);
      enki_led_blink(3, 200);
      return true;
    }
    Serial.printf("[SPP] Conexion a '%s' fallo\n", printerName);
  }

  return false;
}

static bool sppSend(const uint8_t* data, size_t len) {
  if (!printerReady || !SerialBT.connected()) {
    Serial.println("[SPP] Impresora no conectada");
    return false;
  }

  Serial.printf("[SPP] Enviando %d bytes...\n", len);
  enki_led_on();

  size_t written = SerialBT.write(data, len);

  enki_led_off();
  lastCheckMs = millis();

  if (written == len) {
    Serial.printf("[SPP] Enviado OK (%d bytes)\n", written);
    return true;
  } else {
    Serial.printf("[SPP] Error: solo %d de %d bytes enviados\n", written, len);
    return false;
  }
}

static bool sppIsConnected() {
  return sppInitialized && SerialBT.connected();
}

// ============================================
// BLE — Bluetooth Low Energy (NimBLE)
// ============================================

static bool bleConnectByAddress(NimBLEAddress addr) {
  Serial.printf("[BLE] Conectando a %s...\n", addr.toString().c_str());

  if (bleClient && bleClient->isConnected()) bleClient->disconnect();
  if (bleClient) NimBLEDevice::deleteClient(bleClient);

  bleClient = NimBLEDevice::createClient();
  bleClient->setConnectTimeout(5);

  if (!bleClient->connect(addr)) {
    Serial.println("[BLE] Fallo conexion directa");
    return false;
  }

  Serial.println("[BLE] Conectado. Buscando servicio...");

  NimBLERemoteService* svc = bleClient->getService(printerSvcUuid);
  if (!svc) {
    Serial.printf("[BLE] Servicio %s no encontrado\n", printerSvcUuid);
    bleClient->disconnect();
    return false;
  }

  printChar = svc->getCharacteristic(printerCharUuid);
  if (!printChar || (!printChar->canWrite() && !printChar->canWriteNoResponse())) {
    Serial.println("[BLE] Characteristic no encontrada o no escribible");
    bleClient->disconnect();
    return false;
  }

  printerReady = true;
  lastCheckMs = millis();
  reconnectCount++;
  Serial.printf("[BLE] Impresora lista (write%s) — reconexiones: %d\n",
    printChar->canWriteNoResponse() ? " no-response" : " con response", reconnectCount);
  enki_led_blink(3, 200);
  return true;
}

static bool bleReconnect() {
  if (strlen(printerAddr) == 0 && strlen(printerName) == 0) return false;

  // 1. MAC directa
  if (strlen(printerAddr) > 0) {
    if (bleConnectByAddress(NimBLEAddress(printerAddr))) return true;
    Serial.println("[BLE] Conexion directa fallo, scan corto...");
  }

  // 2. Scan corto 3s
  if (strlen(printerName) == 0) return false;

  Serial.printf("[BLE] Scan rapido '%s' (3s)...\n", printerName);
  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->setActiveScan(true);
  NimBLEScanResults results = scan->start(3);

  for (int i = 0; i < results.getCount(); i++) {
    NimBLEAdvertisedDevice dev = results.getDevice(i);
    if (dev.getName() == printerName) {
      scan->clearResults();
      String foundAddr = dev.getAddress().toString().c_str();
      if (strcmp(printerAddr, foundAddr.c_str()) != 0) {
        strlcpy(printerAddr, foundAddr.c_str(), sizeof(printerAddr));
        saveDriverConfig();
        Serial.printf("[BLE] MAC actualizada: %s\n", printerAddr);
      }
      return bleConnectByAddress(dev.getAddress());
    }
  }
  scan->clearResults();
  Serial.printf("[BLE] '%s' no encontrada\n", printerName);
  return false;
}

static bool bleScanAndConnect() {
  if (strlen(printerName) == 0 && strlen(printerAddr) == 0) {
    Serial.println("[BLE] No hay impresora configurada.");
    return false;
  }

  // bleReconnect() ya hace: MAC directa → scan corto 3s
  // No duplicar con otro scan largo
  return bleReconnect();
}

static bool bleSend(const uint8_t* data, size_t len) {
  if (!printerReady || !bleClient || !bleClient->isConnected() || !printChar) {
    Serial.println("[BLE] Impresora no conectada");
    return false;
  }

  Serial.printf("[BLE] Enviando %d bytes en chunks de %d...\n", len, BLE_CHUNK_SIZE);
  enki_led_on();

  bool useNoResponse = printChar->canWriteNoResponse();
  size_t sent = 0;

  while (sent < len) {
    size_t chunkLen = min((size_t)BLE_CHUNK_SIZE, len - sent);
    bool ok = printChar->writeValue(data + sent, chunkLen, !useNoResponse);
    if (!ok) {
      Serial.printf("[BLE] Error escribiendo en offset %d\n", sent);
      enki_led_off();
      return false;
    }
    sent += chunkLen;
    if (sent < len) delay(BLE_CHUNK_DELAY);
  }

  enki_led_off();
  lastCheckMs = millis();
  Serial.printf("[BLE] Enviado OK (%d bytes)\n", sent);
  return true;
}

static bool bleIsConnected() {
  return bleClient && bleClient->isConnected();
}

// ============================================
// Interfaz común — delega al modo activo
// ============================================

static bool connectPrinter() {
  printerReady = false;
  if (btMode == BT_MODE_SPP) return sppConnect();
  return bleScanAndConnect();
}

static bool reconnectPrinter() {
  printerReady = false;
  if (btMode == BT_MODE_SPP) return sppConnect();
  return bleReconnect();
}

static bool sendToPrinter(const uint8_t* data, size_t len) {
  if (btMode == BT_MODE_SPP) return sppSend(data, len);
  return bleSend(data, len);
}

static bool isPrinterConnected() {
  if (btMode == BT_MODE_SPP) return sppIsConnected();
  return bleIsConnected();
}

// ============================================
// MQTT — Publicar resultados
// ============================================

static void publishResult(const char* jobId, bool success, const char* error = nullptr) {
  JsonDocument doc;
  doc["device_id"]   = enki_device_id();
  doc["job_id"]      = jobId;
  doc["success"]     = success;
  doc["timestamp"]   = millis();
  doc["print_count"] = printCount;
  if (error) doc["error"] = error;

  char buf[256];
  serializeJson(doc, buf, sizeof(buf));
  enki_mqtt_publish(topicPrinted, buf);
}

// ============================================
// Portal web — Endpoints del driver
// ============================================

static void handleScan() {
  // BLE scan solo disponible en modo BLE (NimBLE no coexiste con BluetoothSerial)
  if (btMode == BT_MODE_SPP) {
    webServer.send(200, "application/json", "[{\"name\":\"Scan no disponible en modo SPP\",\"addr\":\"\",\"rssi\":0}]");
    return;
  }

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

static void handleTestPrint() {
  if (!printerReady || !isPrinterConnected()) {
    if (!connectPrinter()) {
      webServer.send(200, "application/json", "{\"ok\":false,\"error\":\"Impresora no conectada\"}");
      return;
    }
  }

  uint8_t testData[] = {
    0x1B, 0x40,
    0x1B, 0x61, 0x01,
    0x1B, 0x45, 0x01,
    'E','N','K','I',' ','P','R','I','N','T', 0x0A,
    0x1B, 0x45, 0x00,
    '-','-','-','-','-','-','-','-','-','-','-','-','-','-','-','-', 0x0A,
    'M','o','d','o',':',' ',
    (uint8_t)(btMode == BT_MODE_SPP ? 'S' : 'B'),
    (uint8_t)(btMode == BT_MODE_SPP ? 'P' : 'L'),
    (uint8_t)(btMode == BT_MODE_SPP ? 'P' : 'E'),
    0x0A,
    'T','e','s','t',' ','O','K', 0x0A,
    0x0A, 0x0A, 0x0A,
    0x1D, 0x56, 0x00
  };

  bool ok = sendToPrinter(testData, sizeof(testData));
  if (ok) {
    printCount++;
    webServer.send(200, "application/json", "{\"ok\":true}");
  } else {
    webServer.send(200, "application/json", "{\"ok\":false,\"error\":\"Error write\"}");
  }
}

static void handleGetDriverConfig() {
  JsonDocument doc;
  doc["printer_name"]  = printerName;
  doc["printer_addr"]  = printerAddr;
  doc["printer_svc"]   = printerSvcUuid;
  doc["printer_char"]  = printerCharUuid;
  doc["printer_ready"] = printerReady;
  doc["bt_mode"]       = btMode == BT_MODE_SPP ? "spp" : "ble";

  char buf[300];
  serializeJson(doc, buf, sizeof(buf));
  webServer.send(200, "application/json", buf);
}

static void handlePostDriverConfig() {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, webServer.arg("plain"));
  if (err) {
    webServer.send(400, "application/json", "{\"ok\":false,\"error\":\"JSON invalido\"}");
    return;
  }

  if (doc["printer_name"].is<const char*>()) strlcpy(printerName,     doc["printer_name"], sizeof(printerName));
  if (doc["printer_addr"].is<const char*>()) strlcpy(printerAddr,     doc["printer_addr"], sizeof(printerAddr));
  if (doc["printer_svc"].is<const char*>())  strlcpy(printerSvcUuid,  doc["printer_svc"],  sizeof(printerSvcUuid));
  if (doc["printer_char"].is<const char*>()) strlcpy(printerCharUuid, doc["printer_char"], sizeof(printerCharUuid));

  // Cambio de modo BT — requiere reinicio (NimBLE y BluetoothSerial no coexisten)
  bool needRestart = false;
  if (doc["bt_mode"].is<const char*>()) {
    const char* mode = doc["bt_mode"];
    uint8_t newMode = (strcmp(mode, "spp") == 0) ? BT_MODE_SPP : BT_MODE_BLE;
    if (newMode != btMode) {
      btMode = newMode;
      needRestart = true;
      Serial.printf("[PRINT] Modo cambiado a %s — reinicio necesario\n",
        btMode == BT_MODE_SPP ? "SPP" : "BLE");
    }
  }

  saveDriverConfig();

  if (needRestart) {
    webServer.send(200, "application/json", "{\"ok\":true,\"restart\":true,\"msg\":\"Reiniciando para cambiar modo BT...\"}");
    delay(1000);
    ESP.restart();
    return;
  }

  // Sin cambio de modo: reconectar con nueva config
  if (strlen(printerName) > 0 || strlen(printerAddr) > 0) {
    connectPrinter();
  }

  webServer.send(200, "application/json", "{\"ok\":true}");
}

// ============================================
// Contrato: las 5 funciones que la BASE llama
// ============================================

void logic_setup() {
  // 1. Cargar config (incluye btMode)
  loadDriverConfig();

  // 2. Inicializar stack Bluetooth según modo
  //    IMPORTANTE: NimBLE y BluetoothSerial NO pueden coexistir.
  //    NimBLE reemplaza el stack BT completo del ESP32.
  //    Al cambiar de modo se reinicia el ESP32.
  if (btMode == BT_MODE_SPP) {
    SerialBT.begin("EnkiPrint", true);  // master mode
    sppInitialized = true;
    Serial.println("[SPP] BluetoothSerial iniciado (master)");
    Serial.println("[SPP] Scan BLE no disponible en modo SPP");
  } else {
    NimBLEDevice::init("EnkiPrint");
    Serial.println("[BLE] NimBLE iniciado");
  }

  // 4. Topics MQTT
  snprintf(topicPrint,   sizeof(topicPrint),   "impresion/%s/print/%s",   enki_project_id(), enki_device_id());
  snprintf(topicPrinted, sizeof(topicPrinted), "impresion/%s/printed/%s", enki_project_id(), enki_device_id());

  // 5. Suscribir MQTT
  if (enki_mqtt_connected()) {
    enki_mqtt_subscribe(topicPrint);
    Serial.printf("[PRINT] Suscrito a: %s\n", topicPrint);
  }

  // 6. Portal web
  webServer.on("/api/scan",         HTTP_GET,  handleScan);
  webServer.on("/api/test-print",   HTTP_POST, handleTestPrint);
  webServer.on("/api/printer",      HTTP_GET,  handleGetDriverConfig);
  webServer.on("/api/printer",      HTTP_POST, handlePostDriverConfig);

  // 7. Conectar impresora
  if (!portalMode && (strlen(printerName) > 0 || strlen(printerAddr) > 0)) {
    if (!connectPrinter()) {
      Serial.println("[PRINT] Impresora no disponible. Configura desde el portal web.");
    }
  }
}

void logic_loop() {
  // MQTT re-subscribe
  static bool wasConnected = false;
  static bool subscribed = false;
  bool isConnected = enki_mqtt_connected();

  if (isConnected && (!wasConnected || !subscribed)) {
    if (enki_mqtt_subscribe(topicPrint)) {
      subscribed = true;
      Serial.printf("[PRINT] Suscrito OK a: %s\n", topicPrint);
    } else {
      subscribed = false;
    }
  }
  if (!isConnected) subscribed = false;
  wasConnected = isConnected;

  // Check conexión impresora
  if (printerReady) {
    unsigned long now = millis();
    if (now - lastCheckMs > BLE_KEEPALIVE_MS) {
      lastCheckMs = now;
      if (!isPrinterConnected()) {
        Serial.printf("[%s] Impresora desconectada\n", btMode == BT_MODE_SPP ? "SPP" : "BLE");
        printerReady = false;
        lastRetryMs = millis();
      }
    }
  }

  // Reconexión automática
  if (!printerReady && (strlen(printerAddr) > 0 || strlen(printerName) > 0)) {
    unsigned long now = millis();
    if (now - lastRetryMs > BLE_RECONNECT_MS) {
      lastRetryMs = now;
      Serial.printf("[%s] Reconectando...\n", btMode == BT_MODE_SPP ? "SPP" : "BLE");
      reconnectPrinter();
    }
  }
}

void logic_on_message(const char* topic, JsonDocument& doc) {
  if (strcmp(topic, topicPrint) != 0) return;

  const char* jobId   = doc["job_id"] | "no-id";
  const char* b64data = doc["data"];

  if (!b64data) {
    errorCount++;
    publishResult(jobId, false, "Missing 'data' field");
    return;
  }

  size_t b64len = strlen(b64data);
  size_t decodedLen = 0;
  uint8_t* buffer = enki_buffer();

  int ret = mbedtls_base64_decode(buffer, enki_buffer_size(), &decodedLen,
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

  if (!printerReady || !isPrinterConnected()) {
    Serial.printf("[PRINT] Impresora desconectada, reconectando...\n");
    if (!reconnectPrinter()) {
      errorCount++;
      publishResult(jobId, false, "Printer not connected");
      return;
    }
  }

  bool ok = sendToPrinter(buffer, decodedLen);
  if (ok) {
    printCount++;
    publishResult(jobId, true);
    Serial.printf("[PRINT] Job %s OK (#%d) [%s]\n", jobId, printCount,
      btMode == BT_MODE_SPP ? "SPP" : "BLE");
  } else {
    errorCount++;
    printerReady = false;
    publishResult(jobId, false, "Write failed");
  }
}

void logic_status(JsonDocument& doc) {
  doc["printer_ready"]   = printerReady;
  doc["printer_name"]    = printerName;
  doc["printer_addr"]    = printerAddr;
  doc["bt_mode"]         = btMode == BT_MODE_SPP ? "spp" : "ble";
  doc["print_count"]     = printCount;
  doc["error_count"]     = errorCount;
  doc["reconnect_count"] = reconnectCount;
}

void logic_portal_status(JsonDocument& doc) {
  doc["printer"] = printerReady;
  doc["bt_mode"] = btMode == BT_MODE_SPP ? "spp" : "ble";
}
