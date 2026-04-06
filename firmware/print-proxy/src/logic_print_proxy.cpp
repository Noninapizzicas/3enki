/**
 * LÓGICA: Print Proxy — Bridge MQTT ←→ Bluetooth thermal printer
 *
 * Recibe ESC/POS en base64 por MQTT, decodifica, envía por Bluetooth.
 * Soporta BLE (NimBLE) y SPP (BluetoothSerial), configurable desde portal.
 *
 * v3.2.1 — Basado en v3.2 estable + SPP:
 *   - Todo lo de v3.2 (BLE estable, reconexión por MAC, sin scan en loop)
 *   - SPP: BluetoothSerial, conexión por MAC, sin scan bloqueante en loop
 *   - Selector BLE/SPP en portal, cambio requiere reinicio
 *   - IMPORTANTE: NimBLE y BluetoothSerial NO coexisten, solo se inicia uno
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

#define BT_MODE_BLE  0
#define BT_MODE_SPP  1

// Config de impresora (leída de NVS via enki_config_*)
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
 * Reconecta a la impresora usando la MAC guardada en NVS.
 * Si no hay MAC guardada, no hace nada (esperará scan desde portal web).
 * NUNCA hace scan — la reconexión es rápida (~2-3s).
 */
static bool reconnectPrinter() {
  if (strlen(printerAddr) == 0) {
    // Sin MAC guardada — no podemos reconectar sin scan.
    // El usuario debe configurar desde el portal web.
    return false;
  }

  NimBLEAddress savedAddr(printerAddr);
  return connectPrinterByAddress(savedAddr);
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
// SPP — Bluetooth Clásico (solo conexión por MAC)
// ============================================

static void sppInit() {
  if (sppInitialized) return;
  SerialBT.begin("EnkiPrint", true);  // master mode
  sppInitialized = true;
  Serial.println("[SPP] BluetoothSerial iniciado (master)");
}

static bool sppConnectByMac() {
  if (strlen(printerAddr) == 0) return false;

  sppInit();

  if (SerialBT.connected()) {
    SerialBT.disconnect();
    delay(200);
  }

  Serial.printf("[SPP] Conectando a MAC %s...\n", printerAddr);
  uint8_t mac[6];
  if (sscanf(printerAddr, "%hhx:%hhx:%hhx:%hhx:%hhx:%hhx",
             &mac[0], &mac[1], &mac[2], &mac[3], &mac[4], &mac[5]) != 6) {
    Serial.println("[SPP] MAC invalida");
    return false;
  }

  if (SerialBT.connect(mac)) {
    printerReady = true;
    lastBleCheckMs = millis();
    reconnectCount++;
    Serial.printf("[SPP] Conectado — reconexiones: %d\n", reconnectCount);
    enki_led_blink(3, 200);
    return true;
  }

  Serial.println("[SPP] Conexion fallo");
  return false;
}

static bool sppSend(const uint8_t* data, size_t len) {
  if (!printerReady || !SerialBT.connected()) return false;

  Serial.printf("[SPP] Enviando %d bytes...\n", len);
  enki_led_on();
  size_t written = SerialBT.write(data, len);
  enki_led_off();
  lastBleCheckMs = millis();

  if (written == len) {
    Serial.printf("[SPP] OK (%d bytes)\n", written);
    return true;
  }
  Serial.printf("[SPP] Error: %d de %d bytes\n", written, len);
  return false;
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
  if (btMode == BT_MODE_SPP) {
    webServer.send(200, "application/json", "[]");
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
  // Conectar si no está listo
  if (!printerReady) {
    bool connected = false;
    if (btMode == BT_MODE_SPP) {
      connected = sppConnectByMac();
    } else {
      connected = scanAndConnect();
    }
    if (!connected) {
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
    (uint8_t)(btMode == BT_MODE_SPP ? 'S' : 'B'),
    (uint8_t)(btMode == BT_MODE_SPP ? 'P' : 'L'),
    (uint8_t)(btMode == BT_MODE_SPP ? 'P' : 'E'),
    ' ','O','K', 0x0A,
    0x0A, 0x0A, 0x0A,
    0x1D, 0x56, 0x00
  };

  bool ok;
  if (btMode == BT_MODE_SPP) {
    ok = sppSend(testData, sizeof(testData));
  } else {
    ok = sendToPrinter(testData, sizeof(testData));
  }
  if (ok) {
    printCount++;
    webServer.send(200, "application/json", "{\"ok\":true}");
  } else {
    webServer.send(200, "application/json", "{\"ok\":false,\"error\":\"Error BLE write\"}");
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

  // Cambio de modo BT — requiere reinicio
  bool needRestart = false;
  if (doc["bt_mode"].is<const char*>()) {
    uint8_t newMode = (strcmp(doc["bt_mode"], "spp") == 0) ? BT_MODE_SPP : BT_MODE_BLE;
    if (newMode != btMode) {
      btMode = newMode;
      needRestart = true;
    }
  }

  saveDriverConfig();

  if (needRestart) {
    webServer.send(200, "application/json", "{\"ok\":true,\"restart\":true}");
    delay(1000);
    ESP.restart();
    return;
  }

  // Reconectar con nueva config
  if (strlen(printerAddr) > 0 || strlen(printerName) > 0) {
    if (btMode == BT_MODE_SPP) {
      sppConnectByMac();
    } else {
      scanAndConnect();
    }
  }

  webServer.send(200, "application/json", "{\"ok\":true}");
}

// ============================================
// Contrato: las 5 funciones que la BASE llama
// ============================================

void logic_setup() {
  // 1. Cargar config del driver (incluye btMode)
  loadDriverConfig();

  // 2. Inicializar Bluetooth según modo (NO coexisten)
  if (btMode == BT_MODE_SPP) {
    sppInit();
  } else {
    NimBLEDevice::init("EnkiPrint");
    Serial.println("[BLE] NimBLE iniciado");
  }

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

  // 6. Conectar impresora (solo si NO estamos en portal mode)
  if (!portalMode && (strlen(printerAddr) > 0 || strlen(printerName) > 0)) {
    bool connected = false;
    if (btMode == BT_MODE_SPP) {
      connected = sppConnectByMac();
    } else {
      connected = scanAndConnect();
    }
    if (!connected) {
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

  // ── Verificar conexión impresora ──
  if (printerReady) {
    unsigned long now = millis();
    if (now - lastBleCheckMs > BLE_KEEPALIVE_MS) {
      lastBleCheckMs = now;
      bool connected = false;
      if (btMode == BT_MODE_SPP) {
        connected = sppInitialized && SerialBT.connected();
      } else {
        connected = bleClient && bleClient->isConnected();
      }
      if (!connected) {
        Serial.printf("[%s] Impresora desconectada\n", btMode == BT_MODE_SPP ? "SPP" : "BLE");
        printerReady = false;
        lastBleRetryMs = millis();
      }
    }
  }

  // ── Reconectar por MAC (rápido, sin scan) ──
  if (!printerReady && strlen(printerAddr) > 0) {
    unsigned long now = millis();
    if (now - lastBleRetryMs > BLE_RECONNECT_MS) {
      lastBleRetryMs = now;
      Serial.printf("[%s] Reconectando por MAC...\n", btMode == BT_MODE_SPP ? "SPP" : "BLE");
      if (btMode == BT_MODE_SPP) {
        sppConnectByMac();
      } else {
        reconnectPrinter();
      }
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
  if (!printerReady) {
    Serial.println("[PRINT] Impresora desconectada, reconectando por MAC...");
    bool connected = (btMode == BT_MODE_SPP) ? sppConnectByMac() : reconnectPrinter();
    if (!connected) {
      errorCount++;
      publishResult(jobId, false, "Printer not connected");
      return;
    }
  }

  bool ok = (btMode == BT_MODE_SPP) ? sppSend(buffer, decodedLen) : sendToPrinter(buffer, decodedLen);
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
