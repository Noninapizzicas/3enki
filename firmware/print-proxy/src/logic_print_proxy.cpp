/**
 * LÓGICA: Print Proxy — Bridge MQTT ←→ BLE thermal printer
 *
 * Recibe ESC/POS en base64 por MQTT, decodifica, envía por BLE.
 * Implementa el contrato enki_logic.h.
 */

#include "enki_logic.h"
#include "enki_base.h"
#include <NimBLEDevice.h>
#include "mbedtls/base64.h"

// ============================================
// Estado del driver
// ============================================

// Config de impresora (leída de NVS via enki_config_*)
static char printerName[32];
static char printerAddr[20];
static char printerSvcUuid[48];
static char printerCharUuid[48];

// BLE
static NimBLEClient*               bleClient    = nullptr;
static NimBLERemoteCharacteristic* printChar    = nullptr;
static bool                        printerReady = false;

// Topics MQTT del driver
static char topicPrint[80];
static char topicPrinted[80];

// Timers
static unsigned long lastBleRetryMs = 0;
static unsigned long lastBleActivityMs = 0;

// Contadores
static uint32_t printCount = 0;
static uint32_t errorCount = 0;

// ============================================
// Config del driver (NVS)
// ============================================

static void loadDriverConfig() {
  strlcpy(printerName,     enki_config_get("printerName", DEFAULT_PRINTER_NAME), sizeof(printerName));
  strlcpy(printerAddr,     enki_config_get("printerAddr", ""),                   sizeof(printerAddr));
  strlcpy(printerSvcUuid,  enki_config_get("printerSvc",  DEFAULT_PRINTER_SVC),  sizeof(printerSvcUuid));
  strlcpy(printerCharUuid, enki_config_get("printerChar", DEFAULT_PRINTER_CHAR), sizeof(printerCharUuid));

  Serial.printf("[PRINT] printer=%s addr=%s\n", printerName, printerAddr);
}

static void saveDriverConfig() {
  enki_config_set("printerName", printerName);
  enki_config_set("printerAddr", printerAddr);
  enki_config_set("printerSvc",  printerSvcUuid);
  enki_config_set("printerChar", printerCharUuid);
}

// ============================================
// BLE — Conexión con impresora
// ============================================

static bool connectPrinterByAddress(NimBLEAddress addr) {
  Serial.printf("[BLE] Conectando directo a %s...\n", addr.toString().c_str());

  if (bleClient && bleClient->isConnected()) bleClient->disconnect();
  if (bleClient) NimBLEDevice::deleteClient(bleClient);

  bleClient = NimBLEDevice::createClient();
  if (!bleClient->connect(addr)) {
    Serial.println("[BLE] Fallo conexion directa");
    return false;
  }

  Serial.println("[BLE] Conectado. Buscando servicio...");

  NimBLERemoteService* svc = bleClient->getService(printerSvcUuid);
  if (!svc) {
    Serial.printf("[BLE] Servicio %s no encontrado. Servicios disponibles:\n", printerSvcUuid);
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

  printChar = svc->getCharacteristic(printerCharUuid);
  if (!printChar) {
    Serial.printf("[BLE] Characteristic %s no encontrada\n", printerCharUuid);
    bleClient->disconnect();
    return false;
  }

  if (!printChar->canWrite() && !printChar->canWriteNoResponse()) {
    Serial.println("[BLE] La characteristic no soporta escritura");
    bleClient->disconnect();
    return false;
  }

  printerReady = true;
  lastBleActivityMs = millis();
  Serial.printf("[BLE] Impresora lista (write%s)\n",
    printChar->canWriteNoResponse() ? " no-response" : " con response");
  enki_led_blink(3, 200);
  return true;
}

static bool connectPrinter() {
  if (strlen(printerName) == 0) {
    Serial.println("[BLE] No hay impresora configurada. Configura desde el portal web.");
    return false;
  }

  printerReady = false;

  // 1. Si tenemos MAC guardada, intentar conexión directa (sin escaneo)
  if (strlen(printerAddr) > 0) {
    Serial.printf("[BLE] MAC guardada: %s — conectando directo...\n", printerAddr);
    NimBLEAddress savedAddr(printerAddr);
    if (connectPrinterByAddress(savedAddr)) {
      return true;
    }
    Serial.println("[BLE] Conexion directa fallo, cayendo a escaneo...");
  }

  // 2. Escanear por nombre
  Serial.printf("[BLE] Escaneando '%s' (%d seg)...\n", printerName, BLE_SCAN_SECONDS);

  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->setActiveScan(true);
  NimBLEScanResults results = scan->start(BLE_SCAN_SECONDS);

  NimBLEAdvertisedDevice* printer = nullptr;
  for (int i = 0; i < results.getCount(); i++) {
    NimBLEAdvertisedDevice dev = results.getDevice(i);
    Serial.printf("[BLE]   Encontrado: %s (%s)\n",
      dev.getName().c_str(), dev.getAddress().toString().c_str());
    if (dev.getName() == printerName) {
      printer = new NimBLEAdvertisedDevice(dev);
      break;
    }
  }
  scan->clearResults();

  if (!printer) {
    Serial.printf("[BLE] Impresora '%s' no encontrada\n", printerName);
    return false;
  }

  // Guardar MAC en NVS para reconexión directa la próxima vez
  String foundAddr = printer->getAddress().toString().c_str();
  if (strcmp(printerAddr, foundAddr.c_str()) != 0) {
    strlcpy(printerAddr, foundAddr.c_str(), sizeof(printerAddr));
    saveDriverConfig();
    Serial.printf("[BLE] MAC guardada en NVS: %s\n", printerAddr);
  }

  NimBLEAddress addr = printer->getAddress();
  delete printer;

  return connectPrinterByAddress(addr);
}

static bool sendToPrinter(const uint8_t* data, size_t len) {
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
  lastBleActivityMs = millis();
  Serial.printf("[BLE] Enviado OK (%d bytes)\n", sent);
  return true;
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
    'E','N','K','I',' ','P','R','I','N','T', 0x0A,
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

static void handleGetDriverConfig() {
  JsonDocument doc;
  doc["printer_name"] = printerName;
  doc["printer_addr"] = printerAddr;
  doc["printer_svc"]  = printerSvcUuid;
  doc["printer_char"] = printerCharUuid;
  doc["printer_ready"] = printerReady;

  char buf[256];
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

  saveDriverConfig();

  // Reconectar impresora con nueva config
  if (strlen(printerName) > 0) {
    connectPrinter();
  }

  webServer.send(200, "application/json", "{\"ok\":true}");
}

// ============================================
// Contrato: las 4 funciones que la BASE llama
// ============================================

void logic_setup() {
  // 1. Inicializar BLE
  NimBLEDevice::init("EnkiPrint");

  // 2. Cargar config del driver
  loadDriverConfig();

  // 3. Construir topics MQTT
  snprintf(topicPrint,   sizeof(topicPrint),   "impresion/%s/print/%s",   enki_project_id(), enki_device_id());
  snprintf(topicPrinted, sizeof(topicPrinted), "impresion/%s/printed/%s", enki_project_id(), enki_device_id());

  // 4. Suscribirse al topic de impresión
  if (enki_mqtt_connected()) {
    enki_mqtt_subscribe(topicPrint);
    Serial.printf("[PRINT] Suscrito a: %s\n", topicPrint);
  }

  // 5. Registrar endpoints del portal web
  webServer.on("/api/scan",         HTTP_GET,  handleScan);
  webServer.on("/api/test-print",   HTTP_POST, handleTestPrint);
  webServer.on("/api/printer",      HTTP_GET,  handleGetDriverConfig);
  webServer.on("/api/printer",      HTTP_POST, handlePostDriverConfig);

  // 6. Conectar impresora BLE (solo si NO estamos en portal mode)
  //    En portal mode el scan BLE bloquea ~10s y puede interferir con WiFi AP
  if (!portalMode && strlen(printerName) > 0) {
    if (!connectPrinter()) {
      Serial.println("[PRINT] Impresora no disponible. Configura desde el portal web.");
    }
  }
}

void logic_loop() {
  // Resuscribir si MQTT se reconectó O si la suscripción no se confirmó
  static bool wasConnected = false;
  static bool subscribed = false;
  bool isConnected = enki_mqtt_connected();

  if (isConnected && (!wasConnected || !subscribed)) {
    if (enki_mqtt_subscribe(topicPrint)) {
      subscribed = true;
      Serial.printf("[PRINT] Suscrito OK a: %s\n", topicPrint);
    } else {
      subscribed = false;
      Serial.println("[PRINT] Subscribe fallo, reintentando...");
    }
  }
  if (!isConnected) {
    subscribed = false;
  }
  wasConnected = isConnected;

  // Detectar desconexión BLE
  if (printerReady && bleClient && !bleClient->isConnected()) {
    Serial.println("[BLE] Impresora desconectada");
    printerReady = false;
    lastBleRetryMs = millis();
  }

  // Reintentar conexión BLE periódicamente
  if (!printerReady && strlen(printerName) > 0) {
    unsigned long now = millis();
    if (now - lastBleRetryMs > BLE_RECONNECT_MS) {
      lastBleRetryMs = now;
      Serial.println("[BLE] Reintentando conexion...");
      connectPrinter();
    }
  }

  // Keepalive BLE: enviar pulso para evitar que la impresora entre en standby
  if (printerReady && bleClient && bleClient->isConnected()) {
    unsigned long now = millis();
    if (now - lastBleActivityMs > BLE_KEEPALIVE_MS) {
      lastBleActivityMs = now;
      // ESC @ (init) — resetea formato sin imprimir nada visible
      static const uint8_t keepalive[] = { 0x1B, 0x40 };
      bool ok = printChar->writeValue(keepalive, sizeof(keepalive), false);
      if (!ok) {
        Serial.println("[BLE] Keepalive fallido, marcando desconectada");
        printerReady = false;
        lastBleRetryMs = millis();
      }
    }
  }
}

void logic_on_message(const char* topic, JsonDocument& doc) {
  // Solo procesamos mensajes de nuestro topic de impresión
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

  if (!printerReady || !bleClient || !bleClient->isConnected()) {
    Serial.println("[PRINT] Impresora desconectada, reconectando...");
    if (!connectPrinter()) {
      errorCount++;
      publishResult(jobId, false, "Printer not connected");
      return;
    }
  }

  bool ok = sendToPrinter(buffer, decodedLen);
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

void logic_status(JsonDocument& doc) {
  doc["printer_ready"] = printerReady;
  doc["printer_name"]  = printerName;
  doc["printer_addr"]  = printerAddr;
  doc["print_count"]   = printCount;
  doc["error_count"]   = errorCount;
}

void logic_portal_status(JsonDocument& doc) {
  doc["printer"] = printerReady;
}
