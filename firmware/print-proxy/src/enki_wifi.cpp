/**
 * Enki WiFi — Conexión multi-red con fallback y portal cautivo
 *
 * Boot: bloqueante (no hay nada más que hacer).
 * Runtime: non-blocking (no bloquea loop, no pierde MQTT).
 * Fallback: portal AP tras WIFI_MAX_FAILURES ciclos completos.
 */

#include "enki_wifi.h"
#include "enki_base.h"
#include <esp_task_wdt.h>

DNSServer dnsServer;
bool      portalMode = false;

// Estado de reconexión non-blocking
static int8_t        reconnTryingIdx   = -1;
static unsigned long  reconnStartMs    = 0;
static uint8_t        reconnFailCycles = 0;
static bool           reconnActive     = false;
static unsigned long  lastWifiCheckMs  = 0;

// ── Boot: bloqueante ────────────────────────────

static bool wifiTryConnect(int idx) {
  if (idx < 0 || idx >= WIFI_MAX_NETWORKS) return false;
  if (strlen(baseCfg.wifi[idx].ssid) == 0) return false;

  Serial.printf("[WiFi] Intentando red %d: %s...\n", idx + 1, baseCfg.wifi[idx].ssid);
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
  WiFi.disconnect();
  return false;
}

static bool wifiConnectMulti() {
  WiFi.mode(WIFI_STA);
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

  WiFi.disconnect();
  WiFi.mode(WIFI_AP);

  String apName = String(WIFI_AP_NAME_PREFIX) + "-" + String((uint32_t)ESP.getEfuseMac(), HEX).substring(4);
  WiFi.softAP(apName.c_str());

  dnsServer.start(53, "*", WiFi.softAPIP());

  Serial.printf("[WiFi] Portal cautivo activo — SSID: %s  IP: %s\n",
    apName.c_str(), WiFi.softAPIP().toString().c_str());
}

// ── Setup (boot) ────────────────────────────────

bool wifiSetup() {
  bool hasNetworks = false;
  for (int i = 0; i < WIFI_MAX_NETWORKS; i++) {
    if (strlen(baseCfg.wifi[i].ssid) > 0) { hasNetworks = true; break; }
  }

  if (hasNetworks && wifiConnectMulti()) {
    portalMode = false;
    reconnFailCycles = 0;
    enki_led_blink(2);
    return true;
  }

  wifiStartPortal();
  return false;
}

// ── Runtime: non-blocking ───────────────────────

void wifiHandleReconnect() {
  unsigned long now = millis();

  // Conectados — resetear estado
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

    Serial.println("[WiFi] Desconectado, iniciando reconexion non-blocking...");
    reconnActive = true;
    reconnTryingIdx = -1;
    baseCfg.wifiActive = -1;
  }

  // Esperando que una red conecte
  if (reconnTryingIdx >= 0) {
    if (WiFi.status() == WL_CONNECTED) {
      baseCfg.wifiActive = reconnTryingIdx;
      return;
    }
    if (now - reconnStartMs < WIFI_RECONNECT_TIMEOUT) return;

    Serial.printf("[WiFi] Red %d timeout\n", reconnTryingIdx + 1);
    WiFi.disconnect();
  }

  // Siguiente red
  reconnTryingIdx++;
  while (reconnTryingIdx < WIFI_MAX_NETWORKS) {
    if (strlen(baseCfg.wifi[reconnTryingIdx].ssid) > 0) break;
    reconnTryingIdx++;
  }

  if (reconnTryingIdx < WIFI_MAX_NETWORKS) {
    WiFi.mode(WIFI_STA);
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
    Serial.println("[WiFi] Max fallos — abriendo portal para reconfigurar");
    wifiStartPortal();
    return;
  }

  reconnTryingIdx = -1;
  lastWifiCheckMs = now + WIFI_RETRY_DELAY - WIFI_CHECK_INTERVAL;
  reconnActive = false;
}
