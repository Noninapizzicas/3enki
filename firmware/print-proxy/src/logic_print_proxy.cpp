/**
 * LÓGICA: Print Proxy — Bridge MQTT ←→ BLE thermal printer
 *
 * Recibe ESC/POS en base64 por MQTT, decodifica, envía por BLE.
 * Implementa el contrato enki_logic.h.
 *
 * v3.1 — Fixes de estabilidad:
 *   - Keepalive BLE: isConnected() en vez de ESC@ (no resetea impresora)
 *   - Reconnect: solo conexión directa por MAC, sin scan bloqueante
 *   - Scan BLE: solo desde portal web o primer setup (no en loop)
 *   - on_message: reconecta por MAC antes de fallar un job
 */

#include "enki_logic.h"
#include "enki_base.h"
#include "enki_portal.h"
#include "enki_wifi.h"
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
static unsigned long lastBleCheckMs = 0;

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

  Serial.printf("[PRINT] printer=%s addr=%s\n", printerName, printerAddr);
}

static void saveDriverConfig() {
  enki_config_set("printerName", printerName);
  enki_config_set("printerAddr", printerAddr);
  enki_config_set("printerSvc",  printerSvcUuid);
  enki_config_set("printerChar", printerCharUuid);
}

// ============================================
// BLE — Conexión directa por MAC (no bloquea)
// ============================================

/**
 * Conecta a la impresora por dirección MAC.
 * Tarda ~2-3s (vs 10s de scan). No bloquea el loop más de lo necesario.
 */
static bool connectPrinterByAddress(NimBLEAddress addr) {
  Serial.printf("[BLE] Conectando a %s...\n", addr.toString().c_str());

  if (bleClient && bleClient->isConnected()) bleClient->disconnect();
  if (bleClient) NimBLEDevice::deleteClient(bleClient);

  bleClient = NimBLEDevice::createClient();

  // Timeout de conexión de 5 segundos (default es 30s)
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
  lastBleCheckMs = millis();
  reconnectCount++;
  Serial.printf("[BLE] Impresora lista (write%s) — reconexiones: %d\n",
    printChar->canWriteNoResponse() ? " no-response" : " con response", reconnectCount);
  enki_led_blink(3, 200);
  return true;
}

/**
 * Reconecta a la impresora.
 * 1. Intenta conexión directa por MAC (rápido, ~2-3s)
 * 2. Si falla, scan corto de 3s como fallback (algunas impresoras
 *    no aceptan conexión directa por MAC)
 */
static bool reconnectPrinter() {
  if (strlen(printerAddr) == 0 && strlen(printerName) == 0) {
    return false;
  }

  // 1. Intentar por MAC (rápido)
  if (strlen(printerAddr) > 0) {
    if (connectPrinterByAddress(NimBLEAddress(printerAddr))) return true;
    Serial.println("[BLE] Conexion directa fallo, scan corto...");
  }

  // 2. Fallback: scan corto (3s, no 10s)
  if (strlen(printerName) == 0) return false;

  Serial.printf("[BLE] Scan rapido '%s' (3s)...\n", printerName);
  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->setActiveScan(true);
  NimBLEScanResults results = scan->start(3);  // 3s, no 10s

  for (int i = 0; i < results.getCount(); i++) {
    NimBLEAdvertisedDevice dev = results.getDevice(i);
    if (dev.getName() == printerName) {
      scan->clearResults();
      // Actualizar MAC si cambió
      String foundAddr = dev.getAddress().toString().c_str();
      if (strcmp(printerAddr, foundAddr.c_str()) != 0) {
        strlcpy(printerAddr, foundAddr.c_str(), sizeof(printerAddr));
        saveDriverConfig();
        Serial.printf("[BLE] MAC actualizada: %s\n", printerAddr);
      }
      return connectPrinterByAddress(dev.getAddress());
    }
  }
  scan->clearResults();

  Serial.printf("[BLE] '%s' no encontrada\n", printerName);
  return false;
}

/**
 * Primer setup: escanea por nombre, guarda MAC, conecta.
 * Solo se usa desde portal web o primer arranque. NUNCA en loop.
 */
static bool scanAndConnect() {
  if (strlen(printerName) == 0) {
    Serial.println("[BLE] No hay impresora configurada.");
    return false;
  }

  // Primero intentar por MAC guardada (rápido)
  if (strlen(printerAddr) > 0) {
    if (reconnectPrinter()) return true;
    Serial.println("[BLE] Conexion directa fallo, escaneando...");
  }

  // Scan por nombre (bloqueante, solo setup)
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

  // Guardar MAC para reconexión directa (sin scan)
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

/**
 * Envía datos ESC/POS a la impresora BLE en chunks.
 */
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
  lastBleCheckMs = millis();
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
    if (!scanAndConnect()) {
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

  if (strlen(printerName) > 0) {
    scanAndConnect();
  }

  webServer.send(200, "application/json", "{\"ok\":true}");
}

// ============================================
// Contrato: las 5 funciones que la BASE llama
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
  if (!portalMode && strlen(printerName) > 0) {
    if (!scanAndConnect()) {
      Serial.println("[PRINT] Impresora no disponible. Configura desde el portal web.");
    }
  }
}

void logic_loop() {
  // ── MQTT: re-suscribir si se reconectó ──────
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

  // ── BLE: verificar conexión (non-destructive) ──
  //
  // FIX v3.1: En vez de enviar ESC@ como keepalive (que RESETEA la impresora
  // y puede causar desconexión), simplemente comprobamos isConnected().
  // NimBLE mantiene la conexión BLE activa internamente.
  //
  if (printerReady && bleClient) {
    unsigned long now = millis();
    if (now - lastBleCheckMs > BLE_KEEPALIVE_MS) {
      lastBleCheckMs = now;

      if (!bleClient->isConnected()) {
        Serial.println("[BLE] Impresora desconectada (detectado en check)");
        printerReady = false;
        lastBleRetryMs = millis();
      }
    }
  }

  // ── BLE: reconectar por MAC (rápido, ~2-3s) ──
  //
  // FIX v3.1: Solo reconecta por MAC guardada. NUNCA escanea en loop.
  // El scan bloqueante de 10s impedía que MQTT procesara mensajes.
  //
  if (!printerReady && strlen(printerAddr) > 0) {
    unsigned long now = millis();
    if (now - lastBleRetryMs > BLE_RECONNECT_MS) {
      lastBleRetryMs = now;
      Serial.println("[BLE] Reconectando por MAC...");
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

  // Si la impresora está desconectada, intentar reconectar por MAC (rápido)
  if (!printerReady || !bleClient || !bleClient->isConnected()) {
    Serial.println("[PRINT] Impresora desconectada, reconectando por MAC...");
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
    Serial.printf("[PRINT] Job %s OK (#%d)\n", jobId, printCount);
  } else {
    errorCount++;
    printerReady = false;
    publishResult(jobId, false, "BLE write failed");
  }
}

void logic_status(JsonDocument& doc) {
  doc["printer_ready"]   = printerReady;
  doc["printer_name"]    = printerName;
  doc["printer_addr"]    = printerAddr;
  doc["print_count"]     = printCount;
  doc["error_count"]     = errorCount;
  doc["reconnect_count"] = reconnectCount;
}

void logic_portal_status(JsonDocument& doc) {
  doc["printer"] = printerReady;
}
