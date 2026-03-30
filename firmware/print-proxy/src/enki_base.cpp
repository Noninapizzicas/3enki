/**
 * Enki BASE — Implementación de la plataforma universal ESP32
 *
 * Servicios: WiFi multi-red, MQTT, Portal, NVS, OTA, Watchdog, LED.
 * Implementa los servicios enki_* que la LÓGICA consume.
 */

#include "enki_base.h"
#include "enki_logic.h"
#include "portal.h"

// ============================================
// Estado global de la BASE
// ============================================

EnkiBaseConfig baseCfg;
Preferences    prefs;
WebServer      webServer(PORTAL_PORT);
WiFiClient     wifiClient;
PubSubClient   mqtt(wifiClient);
DNSServer      dnsServer;
bool           portalMode = false;

uint8_t payloadBuffer[MAX_PAYLOAD_SIZE];

// Topics MQTT base
static char topicStatus[80];
static char topicBirth[80];
static char topicLwt[80];
static char topicShadowDelta[80];
static char topicShadowReported[80];

// Timers
static unsigned long lastStatusMs    = 0;
static unsigned long lastReconnectMs = 0;
static unsigned long lastWifiCheckMs = 0;
static unsigned long lastOtaCheckMs  = 0;

// Forward declaration — cola offline MQTT
static void mqttEnqueue(const char* topic, const char* payload, bool retain);

// ============================================
// Servicios enki_* (contrato para la LÓGICA)
// ============================================

void enki_mqtt_publish(const char* topic, const char* payload) {
  if (mqtt.connected()) {
    mqtt.publish(topic, payload);
  } else {
    // Encolar para enviar cuando reconecte
    mqttEnqueue(topic, payload, false);
    Serial.printf("[MQTT] Offline — encolado: %s\n", topic);
  }
}

bool enki_mqtt_subscribe(const char* topic) {
  return mqtt.subscribe(topic);
}

bool enki_mqtt_connected() {
  return mqtt.connected();
}

const char* enki_device_id() {
  return baseCfg.deviceId;
}

const char* enki_project_id() {
  return baseCfg.projectId;
}

void enki_config_set(const char* key, const char* value) {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.putString(key, value);
  prefs.end();
}

const char* enki_config_get(const char* key, const char* defaultValue) {
  static char bufs[4][128];
  static int idx = 0;
  char* buf = bufs[idx];
  idx = (idx + 1) % 4;
  prefs.begin(NVS_NAMESPACE, true);
  strlcpy(buf, prefs.getString(key, defaultValue).c_str(), sizeof(bufs[0]));
  prefs.end();
  return buf;
}

void enki_config_set_u16(const char* key, uint16_t value) {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.putUShort(key, value);
  prefs.end();
}

uint16_t enki_config_get_u16(const char* key, uint16_t defaultValue) {
  prefs.begin(NVS_NAMESPACE, true);
  uint16_t val = prefs.getUShort(key, defaultValue);
  prefs.end();
  return val;
}

void enki_led_blink(int times, int ms) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH); delay(ms);
    digitalWrite(LED_PIN, LOW);  delay(ms);
  }
}

void enki_led_on()  { digitalWrite(LED_PIN, HIGH); }
void enki_led_off() { digitalWrite(LED_PIN, LOW);  }

void enki_request_restart() {
  Serial.println("[BASE] Restart solicitado...");
  delay(500);
  ESP.restart();
}

uint8_t* enki_buffer()      { return payloadBuffer; }
size_t   enki_buffer_size() { return MAX_PAYLOAD_SIZE; }

// ============================================
// Config — Load / Save NVS
// ============================================

void baseConfigLoad() {
  prefs.begin(NVS_NAMESPACE, true);
  strlcpy(baseCfg.deviceId,  prefs.getString("deviceId",  DEFAULT_DEVICE_ID).c_str(),  sizeof(baseCfg.deviceId));
  strlcpy(baseCfg.projectId, prefs.getString("projectId", DEFAULT_PROJECT_ID).c_str(), sizeof(baseCfg.projectId));
  strlcpy(baseCfg.mqttHost,  prefs.getString("mqttHost",  DEFAULT_MQTT_HOST).c_str(),  sizeof(baseCfg.mqttHost));
  baseCfg.mqttPort =          prefs.getUShort("mqttPort", DEFAULT_MQTT_PORT);
  strlcpy(baseCfg.mqttUser,  prefs.getString("mqttUser",  DEFAULT_MQTT_USER).c_str(),  sizeof(baseCfg.mqttUser));
  strlcpy(baseCfg.mqttPass,  prefs.getString("mqttPass",  DEFAULT_MQTT_PASS).c_str(),  sizeof(baseCfg.mqttPass));
  strlcpy(baseCfg.otaUrl,    prefs.getString("otaUrl",    DEFAULT_OTA_URL).c_str(),    sizeof(baseCfg.otaUrl));

  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char keyS[16], keyP[16];
    snprintf(keyS, sizeof(keyS), "wifiSsid%d", i);
    snprintf(keyP, sizeof(keyP), "wifiPass%d", i);
    strlcpy(baseCfg.wifi[i].ssid, prefs.getString(keyS, "").c_str(), sizeof(baseCfg.wifi[i].ssid));
    strlcpy(baseCfg.wifi[i].pass, prefs.getString(keyP, "").c_str(), sizeof(baseCfg.wifi[i].pass));
  }
  baseCfg.wifiActive = -1;
  prefs.end();

  baseCfg.configured = (strlen(baseCfg.mqttHost) > 0);

  Serial.printf("[BASE] device=%s project=%s mqtt=%s:%d configured=%s\n",
    baseCfg.deviceId, baseCfg.projectId, baseCfg.mqttHost, baseCfg.mqttPort,
    baseCfg.configured ? "SI" : "NO");
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    if (strlen(baseCfg.wifi[i].ssid) > 0)
      Serial.printf("[BASE] WiFi[%d] = %s\n", i, baseCfg.wifi[i].ssid);
  }
}

void baseConfigSave() {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.putString("deviceId",  baseCfg.deviceId);
  prefs.putString("projectId", baseCfg.projectId);
  prefs.putString("mqttHost",  baseCfg.mqttHost);
  prefs.putUShort("mqttPort",  baseCfg.mqttPort);
  prefs.putString("mqttUser",  baseCfg.mqttUser);
  prefs.putString("mqttPass",  baseCfg.mqttPass);
  prefs.putString("otaUrl",    baseCfg.otaUrl);

  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char keyS[16], keyP[16];
    snprintf(keyS, sizeof(keyS), "wifiSsid%d", i);
    snprintf(keyP, sizeof(keyP), "wifiPass%d", i);
    prefs.putString(keyS, baseCfg.wifi[i].ssid);
    prefs.putString(keyP, baseCfg.wifi[i].pass);
  }
  prefs.end();

  baseCfg.configured = (strlen(baseCfg.mqttHost) > 0);
  Serial.println("[BASE] Config guardada en NVS");
}

// ============================================
// WiFi — Multi-red con fallback y portal cautivo
// ============================================

// Estado de reconexión non-blocking
static int8_t   reconnTryingIdx    = -1;     // red que estamos intentando (-1 = idle)
static unsigned long reconnStartMs = 0;      // cuándo empezamos a intentar esta red
static uint8_t   reconnFailCycles  = 0;      // ciclos completos fallidos (todas las redes)
static bool      reconnActive      = false;  // hay reconexión en curso

/**
 * Intento de conexión BLOQUEANTE — solo se usa en el boot inicial.
 * En runtime se usa el sistema non-blocking.
 */
static bool wifiTryConnect(int idx) {
  if (idx < 0 || idx >= WIFI_MAX_NETWORKS) return false;
  if (strlen(baseCfg.wifi[idx].ssid) == 0) return false;

  Serial.printf("[WiFi] Intentando red %d: %s...\n", idx + 1, baseCfg.wifi[idx].ssid);
  WiFi.begin(baseCfg.wifi[idx].ssid, baseCfg.wifi[idx].pass);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < WIFI_CONNECT_TIMEOUT) {
    delay(250);
    Serial.print(".");
    esp_task_wdt_reset();  // alimentar watchdog durante espera
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    baseCfg.wifiActive = idx;
    Serial.printf("[WiFi] Conectado a '%s' — IP: %s\n",
      baseCfg.wifi[idx].ssid, WiFi.localIP().toString().c_str());
    return true;
  }

  Serial.printf("[WiFi] Fallo conectar a '%s'\n", baseCfg.wifi[idx].ssid);
  WiFi.disconnect();
  return false;
}

/**
 * Intento bloqueante de todas las redes — solo boot.
 */
static bool wifiConnectMulti() {
  WiFi.mode(WIFI_STA);
  baseCfg.wifiActive = -1;
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    if (wifiTryConnect(i)) return true;
  }
  Serial.println("[WiFi] Ninguna red disponible");
  return false;
}

/**
 * Inicia modo portal AP con captive portal.
 * DNS wildcard redirige todo al ESP32.
 */
static void wifiStartPortal() {
  portalMode = true;
  reconnActive = false;
  WiFi.disconnect();
  WiFi.mode(WIFI_AP);

  String apName = String(WIFI_AP_NAME_PREFIX) + "-" + String((uint32_t)ESP.getEfuseMac(), HEX).substring(4);
  WiFi.softAP(apName.c_str());

  // DNS wildcard — todas las consultas DNS apuntan al ESP32
  dnsServer.start(53, "*", WiFi.softAPIP());

  Serial.printf("[WiFi] Portal cautivo activo — SSID: %s  IP: %s\n",
    apName.c_str(), WiFi.softAPIP().toString().c_str());
}

bool baseSetupWiFi() {
  bool hasNetworks = false;
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    if (strlen(baseCfg.wifi[i].ssid) > 0) { hasNetworks = true; break; }
  }

  // Boot: intento bloqueante (no hay nada más que hacer)
  if (hasNetworks && wifiConnectMulti()) {
    portalMode = false;
    reconnFailCycles = 0;
    enki_led_blink(2);
    return true;
  }

  wifiStartPortal();
  return false;
}

/**
 * Reconexión WiFi NON-BLOCKING para runtime.
 *
 * En vez de bloquear 30s intentando redes, hace:
 *   1. Detecta desconexión cada WIFI_CHECK_INTERVAL
 *   2. Lanza WiFi.begin() para una red (no espera)
 *   3. En siguiente loop() comprueba si conectó
 *   4. Si no: siguiente red. Si todas fallan: cuenta un ciclo.
 *   5. Tras WIFI_MAX_FAILURES ciclos: abre portal para reconfigurar.
 */
void baseHandleWifiReconnect() {
  unsigned long now = millis();

  // Si estamos conectados, resetear estado
  if (WiFi.status() == WL_CONNECTED) {
    if (reconnActive) {
      Serial.printf("[WiFi] Reconectado a '%s' — IP: %s\n",
        baseCfg.wifi[baseCfg.wifiActive].ssid, WiFi.localIP().toString().c_str());
      reconnActive = false;
      reconnFailCycles = 0;
      reconnTryingIdx = -1;
      enki_led_blink(2);
    }
    return;
  }

  // Detectar desconexión
  if (!reconnActive) {
    if (now - lastWifiCheckMs < WIFI_CHECK_INTERVAL) return;
    lastWifiCheckMs = now;

    Serial.println("[WiFi] Desconectado, iniciando reconexión non-blocking...");
    reconnActive = true;
    reconnTryingIdx = -1;  // empezar desde la primera red
    baseCfg.wifiActive = -1;
  }

  // --- Reconexión en curso ---

  // ¿Estamos esperando a que una red conecte?
  if (reconnTryingIdx >= 0) {
    if (WiFi.status() == WL_CONNECTED) {
      // Conectado mientras esperábamos
      baseCfg.wifiActive = reconnTryingIdx;
      return;  // el check de arriba lo procesará en el siguiente loop
    }

    // ¿Timeout de esta red?
    if (now - reconnStartMs < WIFI_RECONNECT_TIMEOUT) {
      return;  // seguir esperando, no bloquear
    }

    // Timeout — esta red falló
    Serial.printf("[WiFi] Red %d timeout\n", reconnTryingIdx + 1);
    WiFi.disconnect();
  }

  // Avanzar a la siguiente red
  reconnTryingIdx++;

  // Buscar la siguiente red configurada
  while (reconnTryingIdx < WIFI_MAX_NETWORKS) {
    if (strlen(baseCfg.wifi[reconnTryingIdx].ssid) > 0) break;
    reconnTryingIdx++;
  }

  // ¿Quedan redes por probar?
  if (reconnTryingIdx < WIFI_MAX_NETWORKS) {
    // Lanzar WiFi.begin() — NO bloqueante, retorna inmediatamente
    WiFi.mode(WIFI_STA);
    WiFi.begin(baseCfg.wifi[reconnTryingIdx].ssid, baseCfg.wifi[reconnTryingIdx].pass);
    reconnStartMs = now;
    Serial.printf("[WiFi] Probando red %d: %s (non-blocking, %dms timeout)\n",
      reconnTryingIdx + 1, baseCfg.wifi[reconnTryingIdx].ssid, WIFI_RECONNECT_TIMEOUT);
    enki_led_blink(1, 50);
    return;
  }

  // Todas las redes fallaron — un ciclo completo
  reconnFailCycles++;
  Serial.printf("[WiFi] Ciclo %d/%d fallido — todas las redes agotadas\n",
    reconnFailCycles, WIFI_MAX_FAILURES);

  // ¿Demasiados ciclos fallidos? → Abrir portal para reconfigurar
  if (reconnFailCycles >= WIFI_MAX_FAILURES) {
    Serial.println("[WiFi] Max fallos alcanzado — abriendo portal para reconfigurar");
    wifiStartPortal();
    return;
  }

  // Reiniciar ciclo tras un delay (non-blocking via timer)
  reconnTryingIdx = -1;
  lastWifiCheckMs = now + WIFI_RETRY_DELAY - WIFI_CHECK_INTERVAL;
  reconnActive = false;  // se re-activará cuando pase el delay
}

// ============================================
// MQTT — Conexión estable, reconexión rápida,
//         cola offline, autodescubrimiento
// ============================================
//
// Contrato MQTT del dispositivo Enki:
//
//   PUBLICA (retained):
//     devices/{project}/{device}/birth    → tipo, driver, firmware, capabilities
//     devices/{project}/{device}/state/reported → estado actual (firmware version)
//
//   PUBLICA (periódico, cada 30s):
//     enki/{project}/status/{device}      → rssi, ip, uptime, heap + campos del driver
//
//   LWT (el broker publica al desconectarse):
//     devices/{project}/{device}/lwt      → {"online":false}
//
//   SUSCRITO:
//     devices/{project}/{device}/state/delta → OTA y config remota
//     (+ topics del driver via logic_on_message)
//
// ============================================

// WiFiClient SEPARADO para OTA — no comparte con PubSubClient
static WiFiClient otaClient;

// Cola de mensajes offline (circular, se envían al reconectar)
#define MQTT_QUEUE_SIZE 8
struct MqttQueueItem {
  char topic[80];
  char payload[256];
  bool retain;
  bool used;
};
static MqttQueueItem mqttQueue[MQTT_QUEUE_SIZE];
static uint8_t mqttQueueHead = 0;

// OTA anti-loop: versión que ya falló (no reintentar)
static char otaFailedVersion[32] = "";

// Backoff para reconexión MQTT
static uint8_t  mqttReconnectAttempts = 0;
static uint32_t mqttReconnectInterval = 2000;  // empieza en 2s, crece hasta 30s

static void buildTopics() {
  snprintf(topicStatus,         sizeof(topicStatus),         "enki/%s/status/%s",                baseCfg.projectId, baseCfg.deviceId);
  snprintf(topicBirth,          sizeof(topicBirth),          "devices/%s/%s/birth",              baseCfg.projectId, baseCfg.deviceId);
  snprintf(topicLwt,            sizeof(topicLwt),            "devices/%s/%s/lwt",                baseCfg.projectId, baseCfg.deviceId);
  snprintf(topicShadowDelta,    sizeof(topicShadowDelta),    "devices/%s/%s/state/delta",        baseCfg.projectId, baseCfg.deviceId);
  snprintf(topicShadowReported, sizeof(topicShadowReported), "devices/%s/%s/state/reported",     baseCfg.projectId, baseCfg.deviceId);
}

// ── Cola offline ──────────────────────────────

/**
 * Encola un mensaje para enviar cuando MQTT reconecte.
 * Si la cola está llena, descarta el más antiguo.
 */
static void mqttEnqueue(const char* topic, const char* payload, bool retain) {
  MqttQueueItem& item = mqttQueue[mqttQueueHead];
  strlcpy(item.topic, topic, sizeof(item.topic));
  strlcpy(item.payload, payload, sizeof(item.payload));
  item.retain = retain;
  item.used = true;
  mqttQueueHead = (mqttQueueHead + 1) % MQTT_QUEUE_SIZE;
}

/**
 * Envía todos los mensajes encolados. Se llama tras reconectar.
 */
static void mqttFlushQueue() {
  int sent = 0;
  for (int i = 0; i < MQTT_QUEUE_SIZE; i++) {
    // Recorrer en orden FIFO desde head
    int idx = (mqttQueueHead + i) % MQTT_QUEUE_SIZE;
    MqttQueueItem& item = mqttQueue[idx];
    if (!item.used) continue;

    mqtt.publish(item.topic, item.payload, item.retain);
    item.used = false;
    sent++;
  }
  if (sent > 0) {
    Serial.printf("[MQTT] Cola: %d mensajes enviados tras reconexión\n", sent);
  }
}

// ── Shadow ────────────────────────────────────

static void publishReportedState() {
  if (!mqtt.connected()) return;
  JsonDocument doc;
  doc["firmware"]["version"] = FIRMWARE_VERSION;
  char buf[128];
  serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topicShadowReported, buf, true);
  Serial.printf("[SHADOW] Reported: %s\n", buf);
}

// ── OTA via Shadow Delta ──────────────────────
//
// La OTA NO se ejecuta inmediatamente al recibir el delta.
// Se PROGRAMA para ejecutarse en el siguiente ciclo del loop,
// dando tiempo a:
//   - Terminar impresiones en curso
//   - Notificar al backend que vamos a actualizar
//   - Alimentar el watchdog durante la descarga
//
// Protecciones:
//   - WiFiClient separado (no mata MQTT)
//   - Anti-loop: versión fallida no se reintenta
//   - Progreso: watchdog + LED durante descarga
//   - Notificación: publica estado OTA por MQTT
//   - Si falla: todo sigue funcionando normal
//
static bool    otaPending     = false;
static char    otaTargetVersion[32] = "";
static char    otaTargetUrl[256]    = "";

/**
 * Publica estado OTA por MQTT para que firmware-manager sepa qué pasa.
 * Topic: enki/{project}/ota/{device}
 */
static void publishOtaStatus(const char* status, const char* detail = nullptr) {
  if (!mqtt.connected()) return;

  char topic[80];
  snprintf(topic, sizeof(topic), "enki/%s/ota/%s", baseCfg.projectId, baseCfg.deviceId);

  JsonDocument doc;
  doc["device_id"] = baseCfg.deviceId;
  doc["firmware"]  = FIRMWARE_VERSION;
  doc["target"]    = otaTargetVersion;
  doc["status"]    = status;
  if (detail) doc["detail"] = detail;

  char buf[256];
  serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topic, buf);
}

/**
 * Callback de progreso OTA — se llama durante httpUpdate.update().
 * Alimenta watchdog y da feedback visual.
 */
static void onOtaProgress(int current, int total) {
  esp_task_wdt_reset();  // alimentar watchdog durante descarga

  static int lastPercent = -1;
  int percent = (total > 0) ? (current * 100 / total) : 0;

  // LED toggle para feedback visual
  digitalWrite(LED_PIN, (percent / 5) % 2);

  // Serial cada 10%
  if (percent / 10 != lastPercent / 10) {
    lastPercent = percent;
    Serial.printf("[OTA] %d%% (%d/%d bytes)\n", percent, current, total);
  }
}

/**
 * Ejecuta la OTA programada. Se llama desde el loop, no desde el callback MQTT.
 * Esto permite que MQTT procese otros mensajes antes de bloquear.
 */
static void executeOta() {
  if (!otaPending) return;
  otaPending = false;

  Serial.printf("[OTA] Ejecutando: v%s → v%s\n", FIRMWARE_VERSION, otaTargetVersion);

  // Notificar al backend
  publishOtaStatus("downloading");
  mqtt.loop();  // flush

  // Configurar callback de progreso
  httpUpdate.onProgress(onOtaProgress);

  // WiFiClient SEPARADO — MQTT sigue vivo
  t_httpUpdate_return ret = httpUpdate.update(otaClient, otaTargetUrl);

  // Alimentar watchdog tras la descarga
  esp_task_wdt_reset();
  digitalWrite(LED_PIN, LOW);

  switch (ret) {
    case HTTP_UPDATE_OK:
      Serial.println("[OTA] OK — reiniciando...");
      publishOtaStatus("success");
      mqtt.loop();  // flush antes del restart
      delay(500);
      ESP.restart();
      break;

    case HTTP_UPDATE_FAILED: {
      const char* errMsg = httpUpdate.getLastErrorString().c_str();
      Serial.printf("[OTA] Fallo: %s\n", errMsg);
      // Marcar como fallida — no reintentar
      strlcpy(otaFailedVersion, otaTargetVersion, sizeof(otaFailedVersion));
      publishOtaStatus("failed", errMsg);
      Serial.printf("[OTA] v%s marcada como fallida. Todo sigue funcionando.\n", otaTargetVersion);
      break;
    }

    case HTTP_UPDATE_NO_UPDATES:
      Serial.println("[OTA] Binario idéntico, nada que hacer");
      publishOtaStatus("no_change");
      break;
  }
}

/**
 * Maneja delta del shadow. NO ejecuta OTA inmediatamente —
 * la programa para el próximo ciclo del loop.
 */
static void handleShadowDelta(JsonDocument& doc) {
  if (!doc["firmware"].is<JsonObject>()) return;

  const char* targetVersion = doc["firmware"]["version"];
  const char* otaUrl        = doc["firmware"]["url"];

  // Delta vacío o incompleto → ignorar
  if (!targetVersion || !otaUrl) return;

  // Ya tenemos esa versión → reportar
  if (strcmp(targetVersion, FIRMWARE_VERSION) == 0) {
    publishReportedState();
    return;
  }

  // ¿Esta versión ya falló? → No reintentar
  if (strlen(otaFailedVersion) > 0 && strcmp(targetVersion, otaFailedVersion) == 0) {
    return;
  }

  // ¿Ya hay OTA pendiente para esta versión?
  if (otaPending && strcmp(otaTargetVersion, targetVersion) == 0) {
    return;
  }

  // Programar OTA para el siguiente ciclo del loop
  strlcpy(otaTargetVersion, targetVersion, sizeof(otaTargetVersion));

  if (strncmp(otaUrl, "http", 4) == 0) {
    strlcpy(otaTargetUrl, otaUrl, sizeof(otaTargetUrl));
  } else {
    snprintf(otaTargetUrl, sizeof(otaTargetUrl), "http://%s:3000%s", baseCfg.mqttHost, otaUrl);
  }

  otaPending = true;
  Serial.printf("[SHADOW] OTA programada: v%s → v%s (se ejecutará en el próximo loop)\n",
    FIRMWARE_VERSION, targetVersion);
  publishOtaStatus("scheduled");
}

// ── Callback de mensajes ──────────────────────

static void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  Serial.printf("[MQTT] RX (%d bytes) %s\n", length, topic);

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.printf("[MQTT] Error JSON: %s\n", err.c_str());
    return;
  }

  // Shadow delta → OTA y configuración remota
  if (strcmp(topic, topicShadowDelta) == 0) {
    handleShadowDelta(doc);
    return;
  }

  // Delegar a la LÓGICA (print jobs, etc.)
  logic_on_message(topic, doc);
}

// ── Setup y conexión ──────────────────────────

void baseSetupMQTT() {
  buildTopics();
  mqtt.setCallback(onMqttMessage);
  mqtt.setBufferSize(MAX_PAYLOAD_SIZE + 256);
  mqtt.setKeepAlive(60);  // keepalive 60s — broker detecta desconexión en 90s

  // Inicializar cola offline
  for (int i = 0; i < MQTT_QUEUE_SIZE; i++) {
    mqttQueue[i].used = false;
  }
}

/**
 * Conecta a MQTT y ejecuta el protocolo de autodescubrimiento:
 *   1. LWT configurado en connect() — broker lo publica si nos caemos
 *   2. Birth message retained — device-registry nos detecta
 *   3. Subscribe shadow delta — para OTA y config remota
 *   4. Reported state — sync con device-shadow
 *   5. Flush cola offline — mensajes pendientes de cuando estábamos desconectados
 *   6. logic_setup re-subscribe — la LÓGICA recibe sus topics
 */
void baseConnectMQTT() {
  if (mqtt.connected()) return;
  if (strlen(baseCfg.mqttHost) == 0) return;

  Serial.printf("[MQTT] Conectando a %s:%d (intento %d)...\n",
    baseCfg.mqttHost, baseCfg.mqttPort, mqttReconnectAttempts + 1);

  String clientId = "enki-" + String(baseCfg.deviceId);

  // LWT: el broker publica esto cuando nos desconectamos inesperadamente
  bool connected;
  if (strlen(baseCfg.mqttUser) > 0) {
    connected = mqtt.connect(clientId.c_str(), baseCfg.mqttUser, baseCfg.mqttPass,
                             topicLwt, 1, true, "{\"online\":false}");
  } else {
    connected = mqtt.connect(clientId.c_str(), nullptr, nullptr,
                             topicLwt, 1, true, "{\"online\":false}");
  }

  if (connected) {
    Serial.println("[MQTT] Conectado");
    mqttReconnectAttempts = 0;
    mqttReconnectInterval = 2000;  // reset backoff

    // 1. Birth message retained — autodescubrimiento
    JsonDocument birthDoc;
    birthDoc["type"]     = DRIVER_TYPE;
    birthDoc["driver"]   = DRIVER_TYPE;
    birthDoc["protocol"] = "mqtt-native";
    birthDoc["firmware"] = FIRMWARE_VERSION;
    char birthBuf[192];
    serializeJson(birthDoc, birthBuf, sizeof(birthBuf));
    mqtt.publish(topicBirth, birthBuf, true);

    // 2. Subscribe shadow delta — OTA y config remota
    mqtt.subscribe(topicShadowDelta, 1);
    Serial.printf("[MQTT] Suscrito a: %s\n", topicShadowDelta);

    // 3. Reported state — sync shadow
    publishReportedState();

    // 4. Flush cola offline
    mqttFlushQueue();

    enki_led_blink(1, 300);
  } else {
    mqttReconnectAttempts++;
    // Backoff exponencial: 2s, 4s, 8s, 16s, 30s max
    mqttReconnectInterval = min((uint32_t)30000, mqttReconnectInterval * 2);
    Serial.printf("[MQTT] Fallo (rc=%d). Próximo intento en %dms\n",
      mqtt.state(), mqttReconnectInterval);
  }
}

/**
 * Loop MQTT: reconexión con backoff + procesar mensajes entrantes.
 * NO bloquea — se llama cada iteración del loop().
 */
void baseHandleMqttReconnect() {
  if (!baseCfg.configured) return;

  if (!mqtt.connected()) {
    unsigned long now = millis();
    if (now - lastReconnectMs > mqttReconnectInterval) {
      lastReconnectMs = now;
      baseConnectMQTT();
    }
    return;
  }

  // Procesar mensajes entrantes — SIEMPRE, cada loop
  mqtt.loop();
}

void basePublishStatus() {
  unsigned long now = millis();
  if (now - lastStatusMs < STATUS_INTERVAL_MS) return;
  lastStatusMs = now;

  if (!mqtt.connected()) return;

  JsonDocument doc;
  // Campos genéricos de la BASE
  doc["device_id"]  = baseCfg.deviceId;
  doc["project_id"] = baseCfg.projectId;
  doc["online"]     = true;
  doc["wifi_rssi"]  = WiFi.RSSI();
  doc["wifi_ssid"]  = (baseCfg.wifiActive >= 0) ? baseCfg.wifi[baseCfg.wifiActive].ssid : "";
  doc["ip"]         = WiFi.localIP().toString();
  doc["uptime_sec"] = millis() / 1000;
  doc["free_heap"]  = ESP.getFreeHeap();
  doc["firmware"]   = FIRMWARE_VERSION;
  doc["driver"]     = DRIVER_TYPE;

  // La LÓGICA añade sus campos
  logic_status(doc);

  char buf[512];
  serializeJson(doc, buf, sizeof(buf));
  mqtt.publish(topicStatus, buf);
}

// ============================================
// OTA — Legacy polling (otaUrl en NVS) + shadow delta
// ============================================

/**
 * OTA por polling HTTP (legacy).
 * Solo se activa si otaUrl está configurado en NVS.
 * Usa otaClient (separado de MQTT) + mismas protecciones.
 */
void baseCheckOTA() {
  // Si hay OTA pendiente via shadow, ejecutarla primero
  if (otaPending) {
    executeOta();
    return;
  }

  // Legacy: polling a otaUrl (solo si configurado)
  if (strlen(baseCfg.otaUrl) == 0) return;

  unsigned long now = millis();
  if (now - lastOtaCheckMs < OTA_CHECK_INTERVAL_MS) return;
  lastOtaCheckMs = now;

  Serial.printf("[OTA] Comprobando en %s...\n", baseCfg.otaUrl);

  char url[200];
  snprintf(url, sizeof(url), "%s?device_id=%s&project_id=%s&firmware=%s",
    baseCfg.otaUrl, baseCfg.deviceId, baseCfg.projectId, FIRMWARE_VERSION);

  httpUpdate.onProgress(onOtaProgress);
  publishOtaStatus("checking");

  // WiFiClient SEPARADO — no mata MQTT
  t_httpUpdate_return ret = httpUpdate.update(otaClient, url);
  esp_task_wdt_reset();
  digitalWrite(LED_PIN, LOW);

  switch (ret) {
    case HTTP_UPDATE_FAILED:
      Serial.printf("[OTA] Fallo: %s\n", httpUpdate.getLastErrorString().c_str());
      publishOtaStatus("failed", httpUpdate.getLastErrorString().c_str());
      break;
    case HTTP_UPDATE_NO_UPDATES:
      break;  // silencioso — es el caso normal
    case HTTP_UPDATE_OK:
      Serial.println("[OTA] OK — reiniciando...");
      publishOtaStatus("success");
      mqtt.loop();
      delay(500);
      ESP.restart();
      break;
  }
}

// ============================================
// Portal web — Endpoints BASE
// ============================================

static void handleRoot() {
  webServer.send_P(200, "text/html", PORTAL_HTML);
}

static void handleGetConfig() {
  JsonDocument doc;
  doc["device_id"]  = baseCfg.deviceId;
  doc["project_id"] = baseCfg.projectId;

  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char keyS[16], keyP[16];
    snprintf(keyS, sizeof(keyS), "wifi_ssid%d", i + 1);
    snprintf(keyP, sizeof(keyP), "wifi_pass%d", i + 1);
    doc[keyS] = baseCfg.wifi[i].ssid;
    doc[keyP] = baseCfg.wifi[i].pass;
  }
  doc["wifi_active"] = (baseCfg.wifiActive >= 0) ? baseCfg.wifi[baseCfg.wifiActive].ssid : "ninguna";

  doc["mqtt_host"] = baseCfg.mqttHost;
  doc["mqtt_port"] = baseCfg.mqttPort;
  doc["mqtt_user"] = baseCfg.mqttUser;
  doc["mqtt_pass"] = baseCfg.mqttPass;
  doc["ota_url"]   = baseCfg.otaUrl;
  doc["ip"]        = portalMode ? WiFi.softAPIP().toString() : WiFi.localIP().toString();
  doc["portal_mode"] = portalMode;

  unsigned long up = millis() / 1000;
  char upStr[32];
  snprintf(upStr, sizeof(upStr), "%luh %lum", up / 3600, (up % 3600) / 60);
  doc["uptime"] = upStr;

  char buf[768];
  serializeJson(doc, buf, sizeof(buf));
  webServer.send(200, "application/json", buf);
}

static void handlePostConfig() {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, webServer.arg("plain"));
  if (err) {
    webServer.send(400, "application/json", "{\"ok\":false,\"error\":\"JSON invalido\"}");
    return;
  }

  if (doc["device_id"].is<const char*>())  strlcpy(baseCfg.deviceId,  doc["device_id"],  sizeof(baseCfg.deviceId));
  if (doc["project_id"].is<const char*>()) strlcpy(baseCfg.projectId, doc["project_id"], sizeof(baseCfg.projectId));

  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    char keyS[16], keyP[16];
    snprintf(keyS, sizeof(keyS), "wifi_ssid%d", i + 1);
    snprintf(keyP, sizeof(keyP), "wifi_pass%d", i + 1);
    if (doc[keyS].is<const char*>()) strlcpy(baseCfg.wifi[i].ssid, doc[keyS], sizeof(baseCfg.wifi[i].ssid));
    if (doc[keyP].is<const char*>()) strlcpy(baseCfg.wifi[i].pass, doc[keyP], sizeof(baseCfg.wifi[i].pass));
  }

  if (doc["mqtt_host"].is<const char*>()) strlcpy(baseCfg.mqttHost, doc["mqtt_host"], sizeof(baseCfg.mqttHost));
  if (doc["mqtt_port"].is<int>())         baseCfg.mqttPort = doc["mqtt_port"];
  if (doc["mqtt_user"].is<const char*>()) strlcpy(baseCfg.mqttUser, doc["mqtt_user"], sizeof(baseCfg.mqttUser));
  if (doc["mqtt_pass"].is<const char*>()) strlcpy(baseCfg.mqttPass, doc["mqtt_pass"], sizeof(baseCfg.mqttPass));
  if (doc["ota_url"].is<const char*>())   strlcpy(baseCfg.otaUrl,   doc["ota_url"],   sizeof(baseCfg.otaUrl));

  baseConfigSave();

  if (portalMode) {
    bool hasNetworks = false;
    for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
      if (strlen(baseCfg.wifi[i].ssid) > 0) { hasNetworks = true; break; }
    }
    if (hasNetworks) {
      webServer.send(200, "application/json", "{\"ok\":true,\"msg\":\"Guardado. Reiniciando para conectar WiFi...\"}");
      delay(1000);
      ESP.restart();
      return;
    }
  }

  // Reconectar servicios
  if (mqtt.connected()) mqtt.disconnect();
  buildTopics();
  mqtt.setServer(baseCfg.mqttHost, baseCfg.mqttPort);
  baseConnectMQTT();

  webServer.send(200, "application/json", "{\"ok\":true}");
}

static void handleGetStatus() {
  JsonDocument doc;
  doc["wifi"]   = (WiFi.status() == WL_CONNECTED);
  doc["mqtt"]   = mqtt.connected();
  doc["portal"] = portalMode;

  // La LÓGICA añade su estado (ej: printer ready)
  logic_portal_status(doc);

  char buf[256];
  serializeJson(doc, buf, sizeof(buf));
  webServer.send(200, "application/json", buf);
}

static void handleWifiScan() {
  Serial.println("[WiFi] Escaneando redes...");
  int n = WiFi.scanNetworks(false, false, false, 300);

  JsonDocument doc;
  auto arr = doc.to<JsonArray>();

  for (int i = 0; i < n; i++) {
    JsonObject obj = arr.add<JsonObject>();
    obj["ssid"] = WiFi.SSID(i);
    obj["rssi"] = WiFi.RSSI(i);
    obj["open"] = (WiFi.encryptionType(i) == WIFI_AUTH_OPEN);
    for (int j = 0; j < WIFI_MAX_NETWORKS; j++) {
      if (strlen(baseCfg.wifi[j].ssid) > 0 && WiFi.SSID(i) == baseCfg.wifi[j].ssid) {
        obj["configured"] = j + 1;
        break;
      }
    }
  }
  WiFi.scanDelete();

  char buf[1024];
  serializeJson(doc, buf, sizeof(buf));
  webServer.send(200, "application/json", buf);
  Serial.printf("[WiFi] Scan: %d redes encontradas\n", n);
}

static void handleReset() {
  prefs.begin(NVS_NAMESPACE, false);
  prefs.clear();
  prefs.end();
  webServer.send(200, "application/json", "{\"ok\":true}");
  delay(1000);
  ESP.restart();
}

/**
 * Captive portal: redirige cualquier URL desconocida a la raíz.
 * Esto dispara el popup automático en Android e iOS porque:
 *   1. DNS wildcard → todo apunta al ESP32
 *   2. El móvil hace GET a connectivitycheck.gstatic.com (Android)
 *      o captive.apple.com (iOS)
 *   3. Recibe 302 redirect → detecta captive portal → abre popup
 */
static void handleCaptiveRedirect() {
  String target = "http://" + WiFi.softAPIP().toString() + "/";
  webServer.sendHeader("Location", target, true);
  webServer.send(302, "text/plain", "");
}

/**
 * Android específicamente espera 204 de generate_204.
 * Devolver cualquier otra cosa (302) dispara el popup.
 */
static void handleGenerate204() {
  handleCaptiveRedirect();
}

void basePortalSetup() {
  webServer.on("/",              HTTP_GET,  handleRoot);
  webServer.on("/api/config",    HTTP_GET,  handleGetConfig);
  webServer.on("/api/config",    HTTP_POST, handlePostConfig);
  webServer.on("/api/status",    HTTP_GET,  handleGetStatus);
  webServer.on("/api/wifi-scan", HTTP_GET,  handleWifiScan);
  webServer.on("/api/reset",     HTTP_POST, handleReset);

  // Captive portal detection endpoints
  webServer.on("/generate_204",                HTTP_GET, handleGenerate204);     // Android
  webServer.on("/gen_204",                     HTTP_GET, handleGenerate204);     // Android alt
  webServer.on("/hotspot-detect.html",         HTTP_GET, handleCaptiveRedirect); // iOS
  webServer.on("/library/test/success.html",   HTTP_GET, handleCaptiveRedirect); // iOS alt
  webServer.on("/ncsi.txt",                    HTTP_GET, handleCaptiveRedirect); // Windows
  webServer.on("/connecttest.txt",             HTTP_GET, handleCaptiveRedirect); // Windows 10+
  webServer.on("/fwlink",                      HTTP_GET, handleCaptiveRedirect); // Windows alt

  // Cualquier otra URL → redirigir al portal (catch-all)
  webServer.onNotFound(handleCaptiveRedirect);

  // Los endpoints específicos del driver se registran en logic_setup()
}
