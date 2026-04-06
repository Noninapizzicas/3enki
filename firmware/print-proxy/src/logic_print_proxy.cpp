/**
 * LOGICA: Print Proxy — Bridge MQTT <-> Bluetooth thermal printer
 *
 * Orquestador: config NVS, topics MQTT, endpoints portal, despacho BLE/SPP.
 * No toca NimBLE ni BluetoothSerial directamente — delega a bt_ble/bt_spp.
 *
 * v3.4.0:
 *   - BLE: conexion permanente, scan, chunked write (~15KB RAM)
 *   - SPP: bajo demanda, init/deinit por job (~70KB RAM solo durante impresion)
 *   - Portal siempre accesible (Bluedroid no vive entre jobs SPP)
 */

#include "enki_logic.h"
#include "enki_base.h"
#include "enki_portal.h"
#include "enki_wifi.h"
#include "bt_common.h"
#include "mbedtls/base64.h"

// ============================================
// Estado del driver
// ============================================

// Config (NVS)
static char    printerName[32];
static char    printerAddr[20];
static char    printerSvcUuid[48];
static char    printerCharUuid[48];
static uint8_t btMode = BT_MODE_BLE;

// Estado
static bool printerReady = false;

// Topics MQTT
static char topicPrint[80];
static char topicPrinted[80];

// Timers (solo BLE — SPP no tiene conexion permanente)
static unsigned long lastRetryMs = 0;
static unsigned long lastCheckMs = 0;

// Contadores
static uint32_t printCount = 0;
static uint32_t errorCount = 0;
static uint32_t reconnectCount = 0;

// ============================================
// Config NVS
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
// SPP bajo demanda — ciclo completo por job
// ============================================

static bool sppPrintJob(const uint8_t* data, size_t len) {
  Serial.printf("[SPP] Job: init → connect → send → disconnect → deinit\n");

  spp_init();

  if (!spp_connect(printerAddr)) {
    spp_deinit();
    return false;
  }

  bool ok = spp_send(data, len);

  spp_disconnect();
  spp_deinit();

  return ok;
}

// ============================================
// MQTT — resultado de impresion
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
// Portal web — endpoints del driver
// ============================================

static void handleScan() {
  if (btMode == BT_MODE_SPP) {
    webServer.send(200, "application/json", "[]");
    return;
  }
  JsonDocument doc;
  ble_scan(doc);
  char buf[1024];
  serializeJson(doc, buf, sizeof(buf));
  webServer.send(200, "application/json", buf);
}

static void handleTestPrint() {
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
    ok = sppPrintJob(testData, sizeof(testData));
  } else {
    if (!ble_is_connected()) {
      ble_scan_and_connect(printerName, printerAddr, sizeof(printerAddr), saveDriverConfig);
    }
    ok = ble_send(testData, sizeof(testData));
  }

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

  // Cambio de modo BT
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

  // Reconectar con nueva config (solo BLE — SPP es bajo demanda)
  if (btMode == BT_MODE_BLE && (strlen(printerAddr) > 0 || strlen(printerName) > 0)) {
    ble_scan_and_connect(printerName, printerAddr, sizeof(printerAddr), saveDriverConfig);
  }

  webServer.send(200, "application/json", "{\"ok\":true}");
}

// ============================================
// Contrato: las 5 funciones que la BASE llama
// ============================================

void logic_setup() {
  // 1. Config NVS
  loadDriverConfig();

  // 2. Inicializar transporte
  if (btMode == BT_MODE_BLE) {
    ble_init(printerSvcUuid, printerCharUuid);
  }
  // SPP: nada al boot — bajo demanda

  // 3. Topics MQTT
  snprintf(topicPrint,   sizeof(topicPrint),   "impresion/%s/print/%s",   enki_project_id(), enki_device_id());
  snprintf(topicPrinted, sizeof(topicPrinted), "impresion/%s/printed/%s", enki_project_id(), enki_device_id());

  // 4. Subscribe MQTT
  if (enki_mqtt_connected()) {
    enki_mqtt_subscribe(topicPrint);
    Serial.printf("[PRINT] Suscrito a: %s\n", topicPrint);
  }

  // 5. Endpoints portal
  webServer.on("/api/scan",         HTTP_GET,  handleScan);
  webServer.on("/api/test-print",   HTTP_POST, handleTestPrint);
  webServer.on("/api/printer",      HTTP_GET,  handleGetDriverConfig);
  webServer.on("/api/printer",      HTTP_POST, handlePostDriverConfig);

  // 6. Conectar impresora (solo BLE, solo si no es portal mode)
  if (btMode == BT_MODE_BLE && !portalMode) {
    if (strlen(printerAddr) > 0 || strlen(printerName) > 0) {
      if (ble_scan_and_connect(printerName, printerAddr, sizeof(printerAddr), saveDriverConfig)) {
        printerReady = true;
        reconnectCount++;
      } else {
        Serial.println("[PRINT] Impresora no disponible. Configura desde el portal.");
      }
    }
  }

  Serial.printf("[PRINT] Heap libre: %d\n", ESP.getFreeHeap());
}

void logic_loop() {
  // ── MQTT: re-subscribe si reconecto ──
  static bool wasConnected = false;
  static bool subscribed = false;
  bool isConn = enki_mqtt_connected();

  if (isConn && (!wasConnected || !subscribed)) {
    subscribed = enki_mqtt_subscribe(topicPrint);
    if (subscribed) Serial.printf("[PRINT] Suscrito OK: %s\n", topicPrint);
  }
  if (!isConn) subscribed = false;
  wasConnected = isConn;

  // ── BLE: keepalive + reconnect (solo modo BLE) ──
  if (btMode == BT_MODE_BLE) {
    // Keepalive cada 30s
    if (printerReady) {
      unsigned long now = millis();
      if (now - lastCheckMs > BLE_KEEPALIVE_MS) {
        lastCheckMs = now;
        if (!ble_is_connected()) {
          Serial.println("[BLE] Desconectada");
          printerReady = false;
          lastRetryMs = millis();
        }
      }
    }

    // Reconnect cada 15s
    if (!printerReady && strlen(printerAddr) > 0) {
      unsigned long now = millis();
      if (now - lastRetryMs > BLE_RECONNECT_MS) {
        lastRetryMs = now;
        Serial.println("[BLE] Reconectando...");
        if (ble_connect(printerAddr)) {
          printerReady = true;
          reconnectCount++;
        }
      }
    }
  }

  // SPP: nada en loop — bajo demanda
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

  // Decodificar base64
  size_t decodedLen = 0;
  uint8_t* buffer = enki_buffer();
  int ret = mbedtls_base64_decode(buffer, enki_buffer_size(), &decodedLen,
                                   (const unsigned char*)b64data, strlen(b64data));
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

  // Imprimir
  bool ok = false;
  if (btMode == BT_MODE_SPP) {
    // SPP bajo demanda: init → connect → send → disconnect → deinit
    ok = sppPrintJob(buffer, decodedLen);
  } else {
    // BLE: reconectar si hace falta, luego enviar
    if (!printerReady || !ble_is_connected()) {
      Serial.println("[BLE] Reconectando para job...");
      if (ble_connect(printerAddr)) {
        printerReady = true;
        reconnectCount++;
      }
    }
    ok = ble_send(buffer, decodedLen);
  }

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
  doc["free_heap"]       = ESP.getFreeHeap();
}

void logic_portal_status(JsonDocument& doc) {
  doc["printer"] = printerReady;
  doc["bt_mode"] = btMode == BT_MODE_SPP ? "spp" : "ble";
}
