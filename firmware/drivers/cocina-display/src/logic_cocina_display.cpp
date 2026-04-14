/**
 * LOGICA: Cocina Display — Kiosk web para pantalla de cocina
 *
 * Estrategia:
 *   1. Inicializar display MIPI-DSI con LVGL
 *   2. Mostrar splash screen mientras conecta
 *   3. Cuando WiFi+MQTT OK → cargar URL /cocina en webview
 *   4. El webview carga la misma UI SvelteKit que usan tablets/desktop
 *   5. Touch events se forwardean al webview
 *   6. MQTT se usa solo para status/OTA (la web tiene su propio MQTT WS)
 *
 * TODO (implementación progresiva):
 *   - [ ] Inicialización LVGL + driver MIPI-DSI para el panel específico
 *   - [ ] Framebuffer rendering del webview (requiere esp-idf web renderer)
 *   - [ ] Touch I2C driver (GT911/FT5x06 según panel)
 *   - [ ] Backlight PWM control
 *   - [ ] Kiosk watchdog (reload si la página no responde)
 *
 * NOTA: El rendering web en ESP32-P4 es experimental.
 * Alternativa pragmática: usar el ESP32-P4 con LVGL nativo
 * recibiendo datos por MQTT en vez de cargar la web.
 * Esta decisión se toma cuando se tenga el hardware.
 */

#include "enki_logic.h"
#include "enki_base.h"

// ============================================
// Estado del driver
// ============================================

static char kioskUrl[256] = "";
static bool displayReady = false;
static bool kioskLoaded = false;
static uint32_t lastTouchMs = 0;
static uint32_t bootMs = 0;

// ============================================
// Config NVS
// ============================================

static void loadDriverConfig() {
  const char* url = enki_config_get("kioskUrl", DEFAULT_KIOSK_URL);
  strlcpy(kioskUrl, url, sizeof(kioskUrl));

  Serial.printf("[DISPLAY] kioskUrl=%s\n", kioskUrl);
}

static void saveDriverConfig() {
  enki_config_set("kioskUrl", kioskUrl);
}

// ============================================
// Display initialization (stub — hardware-dependent)
// ============================================

/**
 * Inicializar el display MIPI-DSI.
 * Depende del panel específico (ILI9881C, ST7701S, etc.)
 * y del board (ESP32-P4-Function-EV o custom).
 *
 * TODO: implementar cuando se tenga el hardware.
 */
static bool initDisplay() {
  Serial.printf("[DISPLAY] Inicializando %dx%d...\n", DISPLAY_WIDTH, DISPLAY_HEIGHT);

  // TODO: LVGL init
  // lv_init();
  // lv_display_t *disp = lv_display_create(DISPLAY_WIDTH, DISPLAY_HEIGHT);
  // ... MIPI-DSI driver, framebuffer, etc.

  // TODO: Backlight
  // if (BACKLIGHT_PIN >= 0) {
  //   ledcSetup(0, 5000, 8);
  //   ledcAttachPin(BACKLIGHT_PIN, 0);
  //   ledcWrite(0, BACKLIGHT_BRIGHTNESS);
  // }

  Serial.println("[DISPLAY] Stub — display no inicializado (sin hardware)");
  return false;
}

/**
 * Inicializar touch I2C.
 * TODO: implementar para GT911 o FT5x06 según panel.
 */
static bool initTouch() {
  Serial.printf("[TOUCH] SDA=%d SCL=%d INT=%d\n", TOUCH_SDA, TOUCH_SCL, TOUCH_INT);

  // TODO: Wire.begin(TOUCH_SDA, TOUCH_SCL);
  // TODO: GT911 or FT5x06 init

  Serial.println("[TOUCH] Stub — touch no inicializado (sin hardware)");
  return false;
}

// ============================================
// Kiosk URL builder
// ============================================

static void buildKioskUrl() {
  // Si hay URL configurada manualmente, usarla
  if (strlen(kioskUrl) > 0) return;

  // Auto-construir: http://mqttHost:5173/projectId/cocina
  if (strlen(baseCfg.mqttHost) > 0 && strlen(baseCfg.projectId) > 0) {
    snprintf(kioskUrl, sizeof(kioskUrl), "http://%s/%s/cocina",
      baseCfg.mqttHost, baseCfg.projectId);
    Serial.printf("[KIOSK] URL auto-construida: %s\n", kioskUrl);
  }
}

// ============================================
// Portal web — endpoints del driver
// ============================================

static void handleGetDriverConfig() {
  JsonDocument doc;
  doc["kiosk_url"] = kioskUrl;
  doc["display_ready"] = displayReady;
  doc["kiosk_loaded"] = kioskLoaded;
  doc["display_width"] = DISPLAY_WIDTH;
  doc["display_height"] = DISPLAY_HEIGHT;

  char buf[512];
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

  if (doc["kiosk_url"].is<const char*>()) {
    strlcpy(kioskUrl, doc["kiosk_url"], sizeof(kioskUrl));
  }

  saveDriverConfig();
  webServer.send(200, "application/json", "{\"ok\":true}");
}

// ============================================
// Contrato: las 5 funciones que la BASE llama
// ============================================

void logic_setup() {
  bootMs = millis();

  // 1. Config NVS
  loadDriverConfig();

  // 2. Auto-construir URL si no hay
  buildKioskUrl();

  // 3. Inicializar display
  displayReady = initDisplay();

  // 4. Inicializar touch
  initTouch();

  // 5. Endpoints portal
  webServer.on("/api/display", HTTP_GET,  handleGetDriverConfig);
  webServer.on("/api/display", HTTP_POST, handlePostDriverConfig);

  // 6. NO suscribirse a topics de pedidos — el webview tiene su propio MQTT WS
  // Solo MQTT para status/OTA (gestionado por la BASE)

  Serial.printf("[KIOSK] URL: %s\n", strlen(kioskUrl) > 0 ? kioskUrl : "(no configurada)");
  Serial.printf("[DISPLAY] Heap libre: %d\n", ESP.getFreeHeap());
}

void logic_loop() {
  // TODO: lv_timer_handler() para LVGL
  // TODO: touch polling
  // TODO: kiosk watchdog (reload si no responde)
  // TODO: backlight dimming por inactividad
}

void logic_on_message(const char* topic, JsonDocument& doc) {
  // No procesamos mensajes MQTT directamente.
  // La UI web del kiosk tiene su propia conexión MQTT via WebSocket.
  // Este handler solo se usaría si implementamos UI nativa LVGL.
}

void logic_status(JsonDocument& doc) {
  doc["display_ready"] = displayReady;
  doc["kiosk_loaded"]  = kioskLoaded;
  doc["kiosk_url"]     = kioskUrl;
  doc["display"]       = DISPLAY_WIDTH;
  doc["uptime_min"]    = (millis() - bootMs) / 60000;
}

void logic_portal_status(JsonDocument& doc) {
  doc["display"] = displayReady;
  doc["kiosk"]   = kioskLoaded;
}
