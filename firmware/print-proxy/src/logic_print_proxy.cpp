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
// Codigos de error de impresion (diagnostico)
// ============================================

enum PrintError {
  PRINT_OK = 0,
  PRINT_ERR_NO_MAC,          // No hay MAC configurada
  PRINT_ERR_INIT_FAILED,     // SPP no pudo iniciar Bluedroid
  PRINT_ERR_CONNECT_FAILED,  // No se pudo conectar al BT
  PRINT_ERR_WRITE_FAILED,    // Conectado pero escritura fallo
  PRINT_ERR_DISCONNECTED     // Se desconecto durante el envio
};

static const char* printErrorCode(PrintError e) {
  switch (e) {
    case PRINT_OK:                return "ok";
    case PRINT_ERR_NO_MAC:        return "no_mac";
    case PRINT_ERR_INIT_FAILED:   return "init_failed";
    case PRINT_ERR_CONNECT_FAILED: return "connect_failed";
    case PRINT_ERR_WRITE_FAILED:  return "write_failed";
    case PRINT_ERR_DISCONNECTED:  return "disconnected_mid_send";
  }
  return "unknown";
}

// ============================================
// Circuit breaker
// ============================================

#define MAX_RETRIES_PER_JOB     3
#define RETRY_BACKOFF_BASE_MS   2000   // 2s, 4s, 8s
#define BREAKER_OPEN_MS         30000  // 30s pausa tras abrir
#define BREAKER_FAIL_THRESHOLD  3      // fallos consecutivos para abrir

// ============================================
// Mantenimiento preventivo
// ============================================

#define HEARTBEAT_INTERVAL_MS    300000  // 5 min — heartbeat real (ESC @)
#define IDLE_WAKE_MS             300000  // 5 min — wake preventivo si llega job tras idle

// ESC @ — comando "init printer" — no imprime nada, solo verifica que la impresora responde
static const uint8_t HEARTBEAT_BYTES[] = { 0x1B, 0x40 };

static unsigned long lastPrintMs = 0;        // ultima impresion exitosa
static unsigned long lastHeartbeatMs = 0;    // ultimo heartbeat real
static bool printerAlive = false;            // ultima respuesta de heartbeat OK

static uint8_t  consecutiveFailures = 0;
static bool     breakerOpen = false;
static unsigned long breakerOpenedAt = 0;

static void openBreaker() {
  breakerOpen = true;
  breakerOpenedAt = millis();
  Serial.printf("[BREAKER] ABIERTO — pausa impresion %ds tras %d fallos consecutivos\n",
    BREAKER_OPEN_MS / 1000, consecutiveFailures);
}

static void closeBreaker() {
  if (breakerOpen) {
    Serial.println("[BREAKER] CERRADO — reanudando impresion");
  }
  breakerOpen = false;
  consecutiveFailures = 0;
}

// Health check: intenta conectar y desconectar sin enviar datos
static bool healthCheck() {
  if (strlen(printerAddr) == 0) return false;

  Serial.println("[BREAKER] Health check...");
  if (btMode == BT_MODE_SPP) {
    spp_init();
    bool ok = spp_connect(printerAddr);
    if (ok) spp_disconnect();
    spp_deinit();
    return ok;
  } else {
    // BLE: aprovecha conexion existente o intenta nueva
    if (ble_is_connected()) return true;
    return ble_connect(printerAddr);
  }
}

// ============================================
// SPP bajo demanda — ciclo completo por job
// ============================================

static PrintError sppPrintJob(const uint8_t* data, size_t len) {
  Serial.printf("[SPP] Job: init > connect > send > disconnect > deinit\n");

  if (strlen(printerAddr) == 0) {
    return PRINT_ERR_NO_MAC;
  }

  spp_init();

  if (!spp_connect(printerAddr)) {
    spp_deinit();
    return PRINT_ERR_CONNECT_FAILED;
  }

  bool ok = spp_send(data, len);
  bool stillConnected = spp_is_connected();

  spp_disconnect();
  spp_deinit();

  if (!ok) return stillConnected ? PRINT_ERR_WRITE_FAILED : PRINT_ERR_DISCONNECTED;
  return PRINT_OK;
}

// ============================================
// Ejecutar un job (BLE o SPP) con diagnostico
// ============================================

static PrintError executeJob(const uint8_t* data, size_t len) {
  if (strlen(printerAddr) == 0) return PRINT_ERR_NO_MAC;

  if (btMode == BT_MODE_SPP) {
    return sppPrintJob(data, len);
  }

  // BLE: reconectar si hace falta
  if (!printerReady || !ble_is_connected()) {
    Serial.println("[BLE] Reconectando para job...");
    if (!ble_connect(printerAddr)) {
      return PRINT_ERR_CONNECT_FAILED;
    }
    printerReady = true;
    reconnectCount++;
  }

  bool ok = ble_send(data, len);
  if (ok) return PRINT_OK;

  // Fallo: diagnosticar si es desconexion o error de escritura
  return ble_is_connected() ? PRINT_ERR_WRITE_FAILED : PRINT_ERR_DISCONNECTED;
}

// ============================================
// Mantenimiento preventivo
// ============================================

/**
 * Heartbeat real: envia ESC @ (init printer) sin imprimir nada.
 * Si la impresora responde al write, esta viva.
 * Solo se ejecuta en BLE — SPP es bajo demanda y no mantiene conexion.
 */
static void heartbeatBLE() {
  if (btMode != BT_MODE_BLE) return;
  if (strlen(printerAddr) == 0) return;

  // Solo si esta supuestamente conectado
  if (!ble_is_connected()) {
    printerAlive = false;
    return;
  }

  Serial.println("[HB] Heartbeat real (ESC @)...");
  bool ok = ble_send(HEARTBEAT_BYTES, sizeof(HEARTBEAT_BYTES));

  if (ok) {
    printerAlive = true;
    Serial.println("[HB] Impresora viva");
  } else {
    printerAlive = false;
    printerReady = false;
    Serial.println("[HB] Impresora NO responde — marcando para reconectar");
  }
}

/**
 * Wake preventivo: si han pasado >IDLE_WAKE_MS desde la ultima impresion,
 * fuerza una reconexion fresca antes del proximo job.
 * Las impresoras BT entran en standby y la primera escritura tras inactividad
 * suele fallar. Reconectar despierta la impresora.
 */
static bool needsWake() {
  if (lastPrintMs == 0) return false;  // primera impresion del boot
  return (millis() - lastPrintMs) > IDLE_WAKE_MS;
}

static void wakePrinter() {
  if (strlen(printerAddr) == 0) return;
  Serial.println("[WAKE] Refrescando conexion tras idle...");

  if (btMode == BT_MODE_BLE) {
    if (ble_is_connected()) ble_disconnect();
    delay(200);
    if (ble_connect(printerAddr)) {
      printerReady = true;
      printerAlive = true;
      reconnectCount++;
      lastHeartbeatMs = millis();  // wake cuenta como heartbeat reciente
      Serial.println("[WAKE] BLE refrescado OK");
    }
  }
  // SPP no necesita wake — cada job ya hace init/connect/disconnect/deinit
}

// ============================================
// Procesar cola con retry + circuit breaker
// ============================================

// Estado del job en curso (persiste entre llamadas a processQueue)
static uint8_t  currentAttempts = 0;
static unsigned long nextAttemptAt = 0;
static PrintError lastError = PRINT_OK;

// ============================================
// Procesar cola (llamado desde logic_loop)
// ============================================

// Publica resultado con diagnostico completo
static void publishResult(const char* jobId, bool success, PrintError err, uint8_t attempts) {
  JsonDocument doc;
  doc["device_id"]   = enki_device_id();
  doc["job_id"]      = jobId;
  doc["success"]     = success;
  doc["timestamp"]   = millis();
  doc["print_count"] = printCount;
  doc["attempts"]    = attempts;
  doc["bt_mode"]     = btMode == BT_MODE_SPP ? "spp" : "ble";
  doc["free_heap"]   = ESP.getFreeHeap();
  doc["reconnect_count"] = reconnectCount;
  if (!success) {
    doc["error_code"] = printErrorCode(err);
    doc["ble_connected"] = ble_is_connected();
  }
  char buf[384];
  serializeJson(doc, buf, sizeof(buf));
  enki_mqtt_publish(topicPrinted, buf);
}

static void processQueue() {
  // Circuit breaker: si esta abierto, esperar y hacer health check
  if (breakerOpen) {
    unsigned long now = millis();
    if (now - breakerOpenedAt < BREAKER_OPEN_MS) return;  // sigue abierto
    // Tiempo de reintento — health check
    if (healthCheck()) {
      closeBreaker();
    } else {
      // Sigue sin responder — reset timer para otro ciclo
      breakerOpenedAt = now;
      Serial.printf("[BREAKER] Health check fallo — otros %ds de pausa\n",
        BREAKER_OPEN_MS / 1000);
      return;
    }
  }

  PrintJob* job = pqPeek();
  if (!job) return;

  // Respetar backoff entre reintentos
  if (nextAttemptAt > 0 && millis() < nextAttemptAt) return;

  // Wake preventivo: solo en el primer intento del job, si la impresora ha estado idle
  if (currentAttempts == 0 && needsWake()) {
    wakePrinter();
  }

  currentAttempts++;
  uint8_t* data = pqPeekData();
  PrintError err = executeJob(data, job->dataLen);

  if (err == PRINT_OK) {
    // Exito — resetear estado
    printCount++;
    consecutiveFailures = 0;
    lastPrintMs = millis();
    lastHeartbeatMs = millis();  // impresion exitosa cuenta como heartbeat
    printerAlive = true;
    Serial.printf("[PRINT] Job %s OK (#%d) tras %d intento(s) [%s]\n",
      job->jobId, printCount, currentAttempts,
      btMode == BT_MODE_SPP ? "SPP" : "BLE");
    publishResult(job->jobId, true, PRINT_OK, currentAttempts);
    currentAttempts = 0;
    nextAttemptAt = 0;
    lastError = PRINT_OK;
    pqDequeue();
    return;
  }

  // Error
  lastError = err;
  printerReady = false;
  Serial.printf("[PRINT] Job %s fallo intento %d/%d — %s\n",
    job->jobId, currentAttempts, MAX_RETRIES_PER_JOB, printErrorCode(err));

  if (currentAttempts < MAX_RETRIES_PER_JOB) {
    // Programar retry con backoff exponencial (2s, 4s, 8s)
    uint32_t delay = RETRY_BACKOFF_BASE_MS * (1 << (currentAttempts - 1));
    nextAttemptAt = millis() + delay;
    Serial.printf("[PRINT] Retry en %dms\n", delay);
    return;
  }

  // Se agotaron los reintentos — descartar job y abrir breaker si procede
  errorCount++;
  consecutiveFailures++;
  Serial.printf("[PRINT] Job %s DESCARTADO tras %d intentos — %s\n",
    job->jobId, currentAttempts, printErrorCode(err));
  publishResult(job->jobId, false, err, currentAttempts);
  pqDequeue();
  currentAttempts = 0;
  nextAttemptAt = 0;

  if (consecutiveFailures >= BREAKER_FAIL_THRESHOLD) {
    openBreaker();
  }
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
  PrintError err = executeJob(testData, sizeof(testData));

  if (err == PRINT_OK) {
    printCount++;
    webServer.send(200, "application/json", "{\"ok\":true}");
  } else {
    char resp[128];
    snprintf(resp, sizeof(resp), "{\"ok\":false,\"error_code\":\"%s\"}", printErrorCode(err));
    webServer.send(200, "application/json", resp);
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
          printerAlive = false;
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

    // -- Heartbeat real cada 5 min (solo BLE, solo si hay MAC) --
    // Detecta conexiones zombie: BLE dice conectado pero impresora no responde
    // Skip si hay jobs en cola — no interferir con impresion en curso
    if (printerReady && strlen(printerAddr) > 0 && pqCount == 0) {
      unsigned long now = millis();
      if (now - lastHeartbeatMs > HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatMs = now;
        heartbeatBLE();
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
    err["error_code"] = "missing_data";
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
    err["error_code"] = "payload_too_large";
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
    err["error_code"] = "base64_error";
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
    err["error_code"] = "queue_full";
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
  // free_heap ya lo pone base en mqttPublishStatus() — no duplicar

  // Salud preventiva
  doc["printer_alive"]        = printerAlive;       // ultimo heartbeat respondio
  doc["consecutive_failures"] = consecutiveFailures; // fallos seguidos
  doc["breaker_open"]         = breakerOpen;         // circuit breaker activo
  doc["last_error_code"]      = printErrorCode(lastError);
  doc["last_print_ms_ago"]    = lastPrintMs > 0 ? (millis() - lastPrintMs) : 0;
  doc["last_heartbeat_ms_ago"] = lastHeartbeatMs > 0 ? (millis() - lastHeartbeatMs) : 0;
}

void logic_portal_status(JsonDocument& doc) {
  // BLE: true si conectada. SPP: true si tiene MAC (puede imprimir bajo demanda)
  doc["printer"] = (btMode == BT_MODE_BLE) ? printerReady : (strlen(printerAddr) > 0);
  doc["bt_mode"] = btMode == BT_MODE_SPP ? "spp" : "ble";
}
