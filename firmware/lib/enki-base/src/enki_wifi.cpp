/**
 * Enki WiFi — Conexion multi-red con fallback y portal cautivo
 *
 * Boot: bloqueante (no hay nada mas que hacer).
 * Runtime: non-blocking (no bloquea loop, no pierde MQTT).
 * Fallback: portal AP tras WIFI_MAX_FAILURES ciclos completos.
 *
 * v3.4 mejoras:
 *   - WiFi.setAutoReconnect(true) — el driver reintenta solo
 *   - WiFi.onEvent() — deteccion instantanea sin polling
 *   - WiFi.disconnect(true) antes de cambiar de red
 *   - WiFi.mode(WIFI_STA) solo una vez en boot
 */

#include "enki_wifi.h"
#include "enki_base.h"
#include <esp_task_wdt.h>
#include <esp_wifi.h>

// Coexistencia WiFi/BT — no disponible en ESP32-P4 (WiFi corre en co-procesador C6)
#if !defined(CONFIG_IDF_TARGET_ESP32P4)
  #if __has_include(<esp_coexist.h>)
    #include <esp_coexist.h>
  #elif __has_include("esp_coexist.h")
    #include "esp_coexist.h"
  #else
    typedef enum { ESP_COEX_PREFER_WIFI = 0, ESP_COEX_PREFER_BT, ESP_COEX_PREFER_BALANCE } esp_coex_prefer_t;
    extern "C" int esp_coex_preference_set(esp_coex_prefer_t prefer);
  #endif
#endif

DNSServer dnsServer;
bool      portalMode = false;

// Estado de reconexion non-blocking
static int8_t        reconnTryingIdx   = -1;
static unsigned long  reconnStartMs    = 0;
static uint8_t        reconnFailCycles = 0;
static bool           reconnActive     = false;
static unsigned long  lastWifiCheckMs  = 0;

// Evento de desconexion (set por callback, leido por loop)
static volatile bool  wifiLostFlag     = false;
static volatile uint8_t wifiLostReason = 0;

// ── Callback de eventos WiFi ───────────────────

static void onWiFiEvent(WiFiEvent_t event, WiFiEventInfo_t info) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
      wifiLostReason = info.wifi_sta_disconnected.reason;
      wifiLostFlag = true;
      Serial.printf("[WiFi] Desconectado (reason: %d)\n", wifiLostReason);
      break;

    case ARDUINO_EVENT_WIFI_STA_GOT_IP:
      wifiLostFlag = false;
      Serial.printf("[WiFi] IP obtenida: %s\n", WiFi.localIP().toString().c_str());
      break;

    default:
      break;
  }
}

// ── Boot: bloqueante ────────────────────────────

static bool wifiTryConnect(int idx) {
  if (idx < 0 || idx >= WIFI_MAX_NETWORKS) return false;
  if (strlen(baseCfg.wifi[idx].ssid) == 0) return false;

  Serial.printf("[WiFi] Intentando red %d: %s...\n", idx + 1, baseCfg.wifi[idx].ssid);

  WiFi.disconnect(true);  // limpiar estado previo
  delay(100);
  WiFi.begin(baseCfg.wifi[idx].ssid, baseCfg.wifi[idx].pass);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < WIFI_CONNECT_TIMEOUT) {
    delay(250);
    Serial.print(".");
    esp_task_wdt_reset();
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    baseCfg.wifiActive = idx;
    Serial.printf("[WiFi] Conectado a '%s' — IP: %s\n",
      baseCfg.wifi[idx].ssid, WiFi.localIP().toString().c_str());
    return true;
  }

  Serial.printf("[WiFi] Fallo conectar a '%s'\n", baseCfg.wifi[idx].ssid);
  return false;
}

static bool wifiConnectMulti() {
  baseCfg.wifiActive = -1;
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    if (wifiTryConnect(i)) return true;
  }
  Serial.println("[WiFi] Ninguna red disponible");
  return false;
}

// ── Portal cautivo ──────────────────────────────

void wifiStartPortal() {
  portalMode = true;
  reconnActive = false;

  String apName = String(WIFI_AP_NAME_PREFIX) + "-" + String((uint32_t)ESP.getEfuseMac(), HEX).substring(4);

#if defined(CONFIG_IDF_TARGET_ESP32P4)
  // ESP32-P4 + ESP-Hosted (C6): el modo AP puro falla si el driver WiFi ya está iniciado.
  // Secuencia correcta: stop → set_mode(APSTA) → start → softAP.
  // APSTA mantiene el transporte SDIO P4↔C6 activo mientras expone el AP.
  WiFi.disconnect(false);
  delay(100);
  esp_wifi_stop();
  delay(300);
  esp_wifi_set_mode(WIFI_MODE_APSTA);
  esp_wifi_start();
  delay(500);
#else
  WiFi.disconnect(true);
  WiFi.mode(WIFI_AP);
#endif

  bool ok = WiFi.softAP(apName.c_str());
  IPAddress ip = WiFi.softAPIP();

  if (ok && ip != IPAddress(0, 0, 0, 0)) {
    dnsServer.start(53, "*", ip);
    Serial.printf("[WiFi] Portal listo — SSID: %s  http://%s/\n", apName.c_str(), ip.toString().c_str());
  } else {
    Serial.printf("[WiFi] Portal AP no disponible (ok=%d IP=%s) — acceso vía STA cuando conecte\n",
                  (int)ok, ip.toString().c_str());
  }
}

// ── Setup (boot) ────────────────────────────────

bool wifiSetup() {
  // En ESP32-P4 (ESP-Hosted), el framework inicializa el transporte SDIO antes de setup().
  // Llamar WiFi.mode() en ese punto genera "Transport already initialized" y puede fallar.
  // El modo STA ya está activo por defecto, así que lo omitimos en P4.
#if !defined(CONFIG_IDF_TARGET_ESP32P4)
  WiFi.mode(WIFI_STA);
#endif
  WiFi.persistent(false);       // no guardar creds en flash (las gestionamos nosotros via NVS)
  WiFi.setAutoReconnect(true);  // el driver reintenta con la ultima red automaticamente
  WiFi.onEvent(onWiFiEvent);    // deteccion instantanea de desconexion

  // Coexistencia WiFi/BT: WiFi no duerme + prioridad WiFi por defecto
  esp_wifi_set_ps(WIFI_PS_NONE);
#if !defined(CONFIG_IDF_TARGET_ESP32P4)
  esp_coex_preference_set(ESP_COEX_PREFER_WIFI);
#endif

  bool hasNetworks = false;
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    if (strlen(baseCfg.wifi[i].ssid) > 0) { hasNetworks = true; break; }
  }

  if (hasNetworks && wifiConnectMulti()) {
    portalMode = false;
    reconnFailCycles = 0;
    wifiLostFlag = false;
    enki_led_blink(2);
    return true;
  }

  wifiStartPortal();
  return false;
}

// ── Runtime: non-blocking ───────────────────────

void wifiHandleReconnect() {
  // Conectados — resetear estado
  if (WiFi.status() == WL_CONNECTED) {
    if (reconnActive) {
      Serial.printf("[WiFi] Reconectado a '%s' — IP: %s\n",
        baseCfg.wifi[baseCfg.wifiActive].ssid, WiFi.localIP().toString().c_str());
      reconnActive = false;
      reconnFailCycles = 0;
      reconnTryingIdx = -1;
      wifiLostFlag = false;
      enki_led_blink(2);
    }
    return;
  }

  // Detectar desconexion: via evento (instantaneo) o polling (backup cada 5s)
  if (!reconnActive) {
    if (!wifiLostFlag) {
      unsigned long now = millis();
      if (now - lastWifiCheckMs < WIFI_CHECK_INTERVAL) return;
      lastWifiCheckMs = now;
      // Doble check — si status no es connected pero no hubo evento
      if (WiFi.status() == WL_CONNECTED) return;
    }

    Serial.printf("[WiFi] Iniciando reconexion (reason: %d)...\n", wifiLostReason);
    reconnActive = true;
    reconnTryingIdx = -1;
    baseCfg.wifiActive = -1;
    wifiLostFlag = false;
  }

  unsigned long now = millis();

  // Esperando que la red actual conecte
  if (reconnTryingIdx >= 0) {
    if (WiFi.status() == WL_CONNECTED) {
      baseCfg.wifiActive = reconnTryingIdx;
      return;
    }
    if (now - reconnStartMs < WIFI_RECONNECT_TIMEOUT) return;

    Serial.printf("[WiFi] Red %d timeout\n", reconnTryingIdx + 1);
  }

  // Siguiente red
  reconnTryingIdx++;
  while (reconnTryingIdx < WIFI_MAX_NETWORKS) {
    if (strlen(baseCfg.wifi[reconnTryingIdx].ssid) > 0) break;
    reconnTryingIdx++;
  }

  if (reconnTryingIdx < WIFI_MAX_NETWORKS) {
    WiFi.disconnect(true);  // limpiar estado antes de cambiar de red
    delay(100);
    WiFi.begin(baseCfg.wifi[reconnTryingIdx].ssid, baseCfg.wifi[reconnTryingIdx].pass);
    reconnStartMs = now;
    Serial.printf("[WiFi] Probando red %d: %s (non-blocking, %dms timeout)\n",
      reconnTryingIdx + 1, baseCfg.wifi[reconnTryingIdx].ssid, WIFI_RECONNECT_TIMEOUT);
    enki_led_blink(1, 50);
    return;
  }

  // Todas fallaron
  reconnFailCycles++;
  Serial.printf("[WiFi] Ciclo %d/%d fallido\n", reconnFailCycles, WIFI_MAX_FAILURES);

  if (reconnFailCycles >= WIFI_MAX_FAILURES) {
    Serial.println("[WiFi] Max fallos — abriendo portal");
    wifiStartPortal();
    return;
  }

  reconnTryingIdx = -1;
  lastWifiCheckMs = millis() + WIFI_RETRY_DELAY - WIFI_CHECK_INTERVAL;
  reconnActive = false;
}
