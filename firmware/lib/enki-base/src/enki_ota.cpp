/**
 * Enki OTA — Actualización de firmware
 *
 * Dos modos:
 *   1. Shadow delta: device-shadow escribe desired.firmware → ESP32 descarga
 *   2. Legacy polling: otaUrl en NVS → comprueba cada 5 min
 *
 * Protecciones:
 *   - WiFiClient separado (no mata MQTT)
 *   - Anti-loop: versión fallida no se reintenta
 *   - Watchdog feed durante descarga
 *   - Notificación estado via MQTT
 *   - OTA se PROGRAMA para ejecutarse en loop, no en callback MQTT
 */

#include "enki_ota.h"
#include "enki_base.h"
#include "enki_mqtt.h"
#include <HTTPUpdate.h>
#include <esp_task_wdt.h>

// WiFiClient SEPARADO — no comparte con PubSubClient
static WiFiClient otaClient;

// Estado OTA pendiente
static bool otaPending = false;
static char otaTargetVersion[32] = "";
static char otaTargetUrl[256] = "";

// Anti-loop: versión que ya falló
static char otaFailedVersion[32] = "";

// Timer para legacy polling
static unsigned long lastOtaCheckMs = 0;

// ── Notificación ────────────────────────────────

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

// ── Progreso ────────────────────────────────────

static void onOtaProgress(int current, int total) {
  esp_task_wdt_reset();

  static int lastPercent = -1;
  int percent = (total > 0) ? (current * 100 / total) : 0;

  digitalWrite(LED_PIN, (percent / 5) % 2);

  if (percent / 10 != lastPercent / 10) {
    lastPercent = percent;
    Serial.printf("[OTA] %d%% (%d/%d bytes)\n", percent, current, total);
  }
}

// ── Ejecución ───────────────────────────────────

static void executeOta() {
  if (!otaPending) return;

  // No intentar sin WiFi
  if (WiFi.status() != WL_CONNECTED) return;

  otaPending = false;

  Serial.printf("[OTA] Ejecutando: v%s -> v%s\n", FIRMWARE_VERSION, otaTargetVersion);

  publishOtaStatus("downloading");
  mqtt.loop();

  httpUpdate.onProgress(onOtaProgress);
  t_httpUpdate_return ret = httpUpdate.update(otaClient, otaTargetUrl);

  esp_task_wdt_reset();
  digitalWrite(LED_PIN, LOW);

  switch (ret) {
    case HTTP_UPDATE_OK:
      Serial.println("[OTA] OK — reiniciando...");
      publishOtaStatus("success");
      // Flush MQTT buffer — varios loops para asegurar delivery
      for (int i = 0; i < 5; i++) { mqtt.loop(); delay(100); }
      ESP.restart();
      break;

    case HTTP_UPDATE_FAILED: {
      char errBuf[128];
      strlcpy(errBuf, httpUpdate.getLastErrorString().c_str(), sizeof(errBuf));
      Serial.printf("[OTA] Fallo: %s\n", errBuf);
      strlcpy(otaFailedVersion, otaTargetVersion, sizeof(otaFailedVersion));
      publishOtaStatus("failed", errBuf);
      Serial.printf("[OTA] v%s marcada como fallida. Todo sigue funcionando.\n", otaTargetVersion);
      break;
    }

    case HTTP_UPDATE_NO_UPDATES:
      Serial.println("[OTA] Binario identico, nada que hacer");
      publishOtaStatus("no_change");
      break;
  }
}

// ── Shadow delta handler ────────────────────────

void otaHandleShadowDelta(JsonDocument& doc) {
  if (!doc["firmware"].is<JsonObject>()) return;

  const char* targetVersion = doc["firmware"]["version"];
  const char* otaUrl        = doc["firmware"]["url"];

  if (!targetVersion || !otaUrl) return;

  // Ya tenemos esa versión
  if (strcmp(targetVersion, FIRMWARE_VERSION) == 0) {
    mqttPublishReported();
    return;
  }

  // Esta versión ya falló
  if (strlen(otaFailedVersion) > 0 && strcmp(targetVersion, otaFailedVersion) == 0) return;

  // Ya hay OTA pendiente para esta versión
  if (otaPending && strcmp(otaTargetVersion, targetVersion) == 0) return;

  // Programar OTA
  strlcpy(otaTargetVersion, targetVersion, sizeof(otaTargetVersion));

  if (strncmp(otaUrl, "http", 4) == 0) {
    strlcpy(otaTargetUrl, otaUrl, sizeof(otaTargetUrl));
  } else {
    snprintf(otaTargetUrl, sizeof(otaTargetUrl), "http://%s:3000%s", baseCfg.mqttHost, otaUrl);
  }

  otaPending = true;
  Serial.printf("[SHADOW] OTA programada: v%s -> v%s\n", FIRMWARE_VERSION, targetVersion);
  publishOtaStatus("scheduled");
}

// ── Loop: ejecutar pendiente + legacy polling ───

void otaHandle() {
  // Shadow delta OTA
  if (otaPending) {
    executeOta();
    return;
  }

  // Legacy polling (solo si otaUrl configurado en NVS y WiFi OK)
  if (strlen(baseCfg.otaUrl) == 0) return;
  if (WiFi.status() != WL_CONNECTED) return;

  unsigned long now = millis();
  if (now - lastOtaCheckMs < OTA_CHECK_INTERVAL_MS) return;
  lastOtaCheckMs = now;

  Serial.printf("[OTA] Comprobando en %s...\n", baseCfg.otaUrl);

  char url[200];
  snprintf(url, sizeof(url), "%s?device_id=%s&project_id=%s&firmware=%s",
    baseCfg.otaUrl, baseCfg.deviceId, baseCfg.projectId, FIRMWARE_VERSION);

  httpUpdate.onProgress(onOtaProgress);
  publishOtaStatus("checking");

  t_httpUpdate_return ret = httpUpdate.update(otaClient, url);
  esp_task_wdt_reset();
  digitalWrite(LED_PIN, LOW);

  switch (ret) {
    case HTTP_UPDATE_FAILED: {
      char errBuf[128];
      strlcpy(errBuf, httpUpdate.getLastErrorString().c_str(), sizeof(errBuf));
      Serial.printf("[OTA] Fallo: %s\n", errBuf);
      publishOtaStatus("failed", errBuf);
      break;
    }
    case HTTP_UPDATE_NO_UPDATES:
      break;
    case HTTP_UPDATE_OK:
      Serial.println("[OTA] OK — reiniciando...");
      publishOtaStatus("success");
      for (int i = 0; i < 5; i++) { mqtt.loop(); delay(100); }
      ESP.restart();
      break;
  }
}
