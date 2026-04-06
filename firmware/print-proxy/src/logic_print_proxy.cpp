/**
 * LOGICA: Print Proxy — Bridge MQTT <-> Bluetooth thermal printer
 *
 * Orquestador: config NVS, topics MQTT, endpoints portal, despacho BLE/SPP.
 * No toca NimBLE ni BluetoothSerial directamente — delega a bt_ble/bt_spp.
 *
 * v3.4.1:
 *   - Cola de impresion: on_message encola, loop ejecuta
 *     MQTT no se bloquea durante impresion SPP
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
// Cola de impresion (desacopla MQTT de BT)
// ============================================
// on_message decodifica base64 y encola.
// logic_loop procesa la cola.
// MQTT nunca se bloquea por impresion.

#define PRINT_QUEUE_SIZE 2
#define PRINT_QUEUE_BUF  4096  // max bytes por job en cola (suficiente para ticket sin logo)

struct PrintJob {
  char    jobId[32];
  size_t  dataLen;
  bool    pending;
};

static PrintJob printQueue[PRINT_QUEUE_SIZE];
static uint8_t  pqHead = 0;
static uint8_t  pqTail = 0;
static uint8_t  pqCount = 0;

// Cada slot tiene su propio buffer para no pisar datos.
// 2 slots x 4KB = 8KB RAM estatica.
static uint8_t  pqBuffers[PRINT_QUEUE_SIZE][PRINT_QUEUE_BUF];

static bool pqEnqueue(const char* jobId, const uint8_t* data, size_t len) {
  if (pqCount >= PRINT_QUEUE_SIZE) {
    Serial.printf("[QUEUE] Llena (%d jobs). Descartando %s\n", pqCount, jobId);
    return false;
  }
  if (len > PRINT_QUEUE_BUF) {
    Serial.printf("[QUEUE] Job %s demasiado grande (%d > %d)\n", jobId, len, PRINT_QUEUE_BUF);
    return false;
  }

  PrintJob& job = printQueue[pqHead];
  strlcpy(job.jobId, jobId, sizeof(job.jobId));
  job.dataLen = len;
  job.pending = true;
  memcpy(pqBuffers[pqHead], data, len);

  pqHead = (pqHead + 1) % PRINT_QUEUE_SIZE;
  pqCount++;

  Serial.printf("[QUEUE] Encolado %s (%d bytes). Cola: %d/%d\n",
    jobId, len, pqCount, PRINT_QUEUE_SIZE);
  return true;
}

static PrintJob* pqPeek() {
  if (pqCount == 0) return nullptr;
  return &printQueue[pqTail];
}

static uint8_t* pqPeekData() {
  if (pqCount == 0) return nullptr;
  return pqBuffers[pqTail];
}

static void pqDequeue() {
  if (pqCount == 0) return;
  printQueue[pqTail].pending = false;
  pqTail = (pqTail + 1) % PRINT_QUEUE_SIZE;
  pqCount--;
}

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
  Serial.printf("[SPP] Job: init > connect > send > disconnect > deinit\n");

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
// Ejecutar un job (BLE o SPP)
// ============================================

static bool executeJob(const uint8_t* data, size_t len) {
  if (btMode == BT_MODE_SPP) {
    return sppPrintJob(data, len);
  }

  // BLE: reconectar si hace falta
  if (!printerReady || !ble_is_connected()) {
    Serial.println("[BLE] Reconectando para job...");
    if (ble_connect(printerAddr)) {
      printerReady = true;
      reconnectCount++;
    } else {
      return false;
    }
  }
  return ble_send(data, len);
}

// ============================================
// Procesar cola (llamado desde logic_loop)
// ============================================

static void processQueue() {
  PrintJob* job = pqPeek();
  if (!job) return;

  uint8_t* data = pqPeekData();
  bool ok = executeJob(data, job->dataLen);

  if (ok) {
    printCount++;
    Serial.printf("[PRINT] Job %s OK (#%d) [%s]\n", job->jobId, printCount,
      btMode == BT_MODE_SPP ? "SPP" : "BLE");
  } else {
    errorCount++;
    printerReady = false;
    Serial.printf("[PRINT] Job %s FALLO [%s]\n", job->jobId,
      btMode == BT_MODE_SPP ? "SPP" : "BLE");
  }

  // Publicar resultado (MQTT puede estar disponible ahora)
  {
    JsonDocument doc;
    doc["device_id"]   = enki_device_id();
    doc["job_id"]      = job->jobId;
    doc["success"]     = ok;
    doc["timestamp"]   = millis();
    doc["print_count"] = printCount;
    if (!ok) doc["error"] = "Write failed";
    char buf[256];
    serializeJson(doc, buf, sizeof(buf));
    enki_mqtt_publish(topicPrinted, buf);
  }

  pqDequeue();
}

// ============================================
// Portal web — endpoints del driver
// ============================================

static void handleScan() {
  if (btMode == BT_MODE_SPP) {
    webServer.send(200, "application/json", "[]");
    return;
  }

  // Desconectar impresora antes de escanear — el radio no puede hacer ambos
  bool wasConnected = ble_is_connected();
  if (wasConnected) {
    Serial.println("[BLE] Desconectando para scan...");
    ble_disconnect();
    printerReady = false;
  }

  JsonDocument doc;
  ble_scan(doc);

  char buf[1024];
  serializeJson(doc, buf, sizeof(buf));
  webServer.send(200, "application/json", buf);

  // Reconectar si estaba conectada
  if (wasConnected && strlen(printerAddr) > 0) {
    Serial.println("[BLE] Reconectando tras scan...");
    if (ble_connect(printerAddr)) {
      printerReady = true;
    }
  }
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

  // Test print es sincrono (el usuario espera respuesta)
  bool ok = executeJob(testData, sizeof(testData));

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
  doc["queue_count"]   = pqCount;

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

  // Reconectar con nueva config (solo BLE, solo MAC directa)
  if (btMode == BT_MODE_BLE && strlen(printerAddr) > 0) {
    ble_connect(printerAddr);
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

  // 6. Conectar impresora (solo BLE, solo MAC directa, NUNCA scan al boot)
  if (btMode == BT_MODE_BLE && !portalMode && strlen(printerAddr) > 0) {
    if (ble_connect(printerAddr)) {
      printerReady = true;
      reconnectCount++;
    } else {
      Serial.println("[PRINT] Impresora no responde. Reintentara en el loop.");
    }
  }

  // 7. Inicializar cola
  for (int i = 0; i < PRINT_QUEUE_SIZE; i++) {
    printQueue[i].pending = false;
  }

  Serial.printf("[PRINT] Heap libre: %d\n", ESP.getFreeHeap());
}

void logic_loop() {
  // -- MQTT: re-subscribe si reconecto --
  static bool wasConnected = false;
  static bool subscribed = false;
  bool isConn = enki_mqtt_connected();

  if (isConn && (!wasConnected || !subscribed)) {
    subscribed = enki_mqtt_subscribe(topicPrint);
    if (subscribed) Serial.printf("[PRINT] Suscrito OK: %s\n", topicPrint);
  }
  if (!isConn) subscribed = false;
  wasConnected = isConn;

  // -- BLE: keepalive + reconnect (solo modo BLE) --
  if (btMode == BT_MODE_BLE) {
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

  // -- Procesar cola de impresion --
  processQueue();
}

void logic_on_message(const char* topic, JsonDocument& doc) {
  if (strcmp(topic, topicPrint) != 0) return;

  const char* jobId   = doc["job_id"] | "no-id";
  const char* b64data = doc["data"];

  if (!b64data) {
    errorCount++;
    // Publicar error directamente (no necesita cola)
    JsonDocument err;
    err["device_id"] = enki_device_id();
    err["job_id"]    = jobId;
    err["success"]   = false;
    err["error"]     = "Missing 'data' field";
    char buf[256];
    serializeJson(err, buf, sizeof(buf));
    enki_mqtt_publish(topicPrinted, buf);
    return;
  }

  // Decodificar base64 al buffer compartido (luego se copia a la cola)
  uint8_t* decodeBuf = enki_buffer();
  size_t decodedLen = 0;
  int ret = mbedtls_base64_decode(decodeBuf, enki_buffer_size(), &decodedLen,
                                   (const unsigned char*)b64data, strlen(b64data));

  if (ret == MBEDTLS_ERR_BASE64_BUFFER_TOO_SMALL) {
    errorCount++;
    JsonDocument err;
    err["device_id"] = enki_device_id();
    err["job_id"]    = jobId;
    err["success"]   = false;
    err["error"]     = "Payload too large";
    char buf[256];
    serializeJson(err, buf, sizeof(buf));
    enki_mqtt_publish(topicPrinted, buf);
    return;
  }
  if (ret != 0) {
    errorCount++;
    JsonDocument err;
    err["device_id"] = enki_device_id();
    err["job_id"]    = jobId;
    err["success"]   = false;
    err["error"]     = "Base64 decode error";
    char buf[256];
    serializeJson(err, buf, sizeof(buf));
    enki_mqtt_publish(topicPrinted, buf);
    return;
  }

  // Encolar — NO imprimir aqui. logic_loop procesara.
  if (!pqEnqueue(jobId, decodeBuf, decodedLen)) {
    errorCount++;
    JsonDocument err;
    err["device_id"] = enki_device_id();
    err["job_id"]    = jobId;
    err["success"]   = false;
    err["error"]     = "Queue full";
    char buf[256];
    serializeJson(err, buf, sizeof(buf));
    enki_mqtt_publish(topicPrinted, buf);
  }
}

void logic_status(JsonDocument& doc) {
  doc["printer_ready"]   = (btMode == BT_MODE_BLE) ? printerReady : (strlen(printerAddr) > 0);
  doc["printer_name"]    = printerName;
  doc["printer_addr"]    = printerAddr;
  doc["bt_mode"]         = btMode == BT_MODE_SPP ? "spp" : "ble";
  doc["print_count"]     = printCount;
  doc["error_count"]     = errorCount;
  doc["reconnect_count"] = reconnectCount;
  doc["queue_pending"]   = pqCount;
  doc["free_heap"]       = ESP.getFreeHeap();
}

void logic_portal_status(JsonDocument& doc) {
  // BLE: true si conectada. SPP: true si tiene MAC (puede imprimir bajo demanda)
  doc["printer"] = (btMode == BT_MODE_BLE) ? printerReady : (strlen(printerAddr) > 0);
  doc["bt_mode"] = btMode == BT_MODE_SPP ? "spp" : "ble";
}
