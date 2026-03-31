/**
 * Enki Debug Remoto — Serial por MQTT
 *
 * Buffer circular de líneas. En cada debugLoop() se envía el batch
 * acumulado como un solo mensaje MQTT (no uno por línea, para no
 * saturar el broker).
 *
 * El debug se activa/desactiva remotamente via:
 *   enki/{project}/debug/{device}/control → { "enable": true }
 *
 * Output se publica en:
 *   enki/{project}/debug/{device} → { "lines": ["[BLE] ...", ...], "ts": millis }
 */

#include "enki_debug.h"
#include "enki_base.h"
#include "enki_mqtt.h"
#include <ArduinoJson.h>
#include <stdarg.h>

// Estado
static bool debugEnabled = false;

// Topics
static char topicDebug[80];
static char topicControl[80];

// Buffer circular de líneas pendientes
#define DEBUG_MAX_LINES 20
#define DEBUG_LINE_SIZE 200
static char debugBuffer[DEBUG_MAX_LINES][DEBUG_LINE_SIZE];
static uint8_t debugHead = 0;
static uint8_t debugCount = 0;

// Timer — enviar cada 500ms como máximo (no saturar MQTT)
static unsigned long lastDebugFlushMs = 0;
#define DEBUG_FLUSH_INTERVAL_MS 500

// ── Setup ───────────────────────────────────────

void debugSetup() {
  snprintf(topicDebug,   sizeof(topicDebug),   "enki/%s/debug/%s",         enki_project_id(), enki_device_id());
  snprintf(topicControl, sizeof(topicControl), "enki/%s/debug/%s/control", enki_project_id(), enki_device_id());

  // Suscribir al topic de control (activar/desactivar debug)
  if (enki_mqtt_connected()) {
    enki_mqtt_subscribe(topicControl);
  }
}

// ── Control remoto ──────────────────────────────

void enki_debug_enable()  {
  debugEnabled = true;
  Serial.println("[DEBUG] Modo debug remoto ACTIVADO");
}

void enki_debug_disable() {
  debugEnabled = false;
  debugCount = 0;
  Serial.println("[DEBUG] Modo debug remoto DESACTIVADO");
}

bool enki_debug_active() {
  return debugEnabled;
}

void debugHandleControl(const char* topic, const char* payload) {
  if (strcmp(topic, topicControl) != 0) return;

  JsonDocument doc;
  if (deserializeJson(doc, payload)) return;

  if (doc["enable"].is<bool>()) {
    if (doc["enable"]) enki_debug_enable();
    else enki_debug_disable();
  }
}

// ── Imprimir ────────────────────────────────────

void enki_debug(const char* fmt, ...) {
  char line[DEBUG_LINE_SIZE];
  va_list args;
  va_start(args, fmt);
  vsnprintf(line, sizeof(line), fmt, args);
  va_end(args);

  // Siempre a Serial
  Serial.println(line);

  // Si debug activo, añadir al buffer
  if (debugEnabled && enki_mqtt_connected()) {
    strlcpy(debugBuffer[debugHead], line, DEBUG_LINE_SIZE);
    debugHead = (debugHead + 1) % DEBUG_MAX_LINES;
    if (debugCount < DEBUG_MAX_LINES) debugCount++;
  }
}

// ── Loop: flush batch ───────────────────────────

void debugLoop() {
  if (!debugEnabled || debugCount == 0) return;

  unsigned long now = millis();
  if (now - lastDebugFlushMs < DEBUG_FLUSH_INTERVAL_MS) return;
  lastDebugFlushMs = now;

  if (!enki_mqtt_connected()) return;

  // Construir JSON con las líneas pendientes
  JsonDocument doc;
  auto arr = doc["lines"].to<JsonArray>();

  // Leer en orden FIFO
  uint8_t start = (debugHead + DEBUG_MAX_LINES - debugCount) % DEBUG_MAX_LINES;
  for (uint8_t i = 0; i < debugCount; i++) {
    uint8_t idx = (start + i) % DEBUG_MAX_LINES;
    arr.add(debugBuffer[idx]);
  }
  doc["ts"] = millis();
  doc["count"] = debugCount;

  debugCount = 0;

  char buf[2048];
  size_t len = serializeJson(doc, buf, sizeof(buf));
  if (len > 0 && len < sizeof(buf)) {
    enki_mqtt_publish(topicDebug, buf);
  }
}
