/**
 * Transporte SPP — Bluetooth Clasico (BluetoothSerial)
 *
 * BAJO DEMANDA: init/deinit por cada operacion de impresion.
 * Bluedroid consume ~70KB RAM. Solo vive durante el job (~3-5s).
 * Entre jobs: RAM libre, portal web funciona.
 *
 * Coexistencia WiFi/BT:
 *   - Al init: prioridad BT (imprime rapido, ventana corta)
 *   - Al deinit: prioridad WiFi (portal y MQTT libres)
 */

#include "bt_common.h"
#include "enki_base.h"
#include "BluetoothSerial.h"

#if __has_include(<esp_coexist.h>)
  #include <esp_coexist.h>
#elif __has_include("esp_coexist.h")
  #include "esp_coexist.h"
#else
  typedef enum { ESP_COEX_PREFER_WIFI = 0, ESP_COEX_PREFER_BT, ESP_COEX_PREFER_BALANCE } esp_coex_prefer_t;
  extern "C" int esp_coex_preference_set(esp_coex_prefer_t prefer);
#endif

// Estado interno
static BluetoothSerial SerialBT;
static bool initialized = false;

// ─── Interfaz publica ───────────────────────────

void spp_init() {
  if (initialized) return;

  // Prioridad BT durante impresion — imprime mas rapido, ventana mas corta
  esp_coex_preference_set(ESP_COEX_PREFER_BT);

  Serial.println("[SPP] Iniciando Bluedroid...");
  SerialBT.begin("EnkiPrint", true);  // master mode
  initialized = true;
  Serial.printf("[SPP] Bluedroid OK (heap: %d)\n", ESP.getFreeHeap());
}

void spp_deinit() {
  if (!initialized) return;
  if (SerialBT.connected()) {
    SerialBT.disconnect();
    delay(200);
  }
  SerialBT.end();
  initialized = false;

  // Devolver prioridad WiFi — portal y MQTT libres
  esp_coex_preference_set(ESP_COEX_PREFER_WIFI);

  Serial.printf("[SPP] Bluedroid liberado (heap: %d)\n", ESP.getFreeHeap());
}

bool spp_connect(const char* addr) {
  if (strlen(addr) == 0) {
    Serial.println("[SPP] No hay MAC");
    return false;
  }

  if (!initialized) spp_init();

  if (SerialBT.connected()) {
    SerialBT.disconnect();
    delay(200);
  }

  Serial.printf("[SPP] Conectando a %s...\n", addr);
  uint8_t mac[6];
  if (sscanf(addr, "%hhx:%hhx:%hhx:%hhx:%hhx:%hhx",
             &mac[0], &mac[1], &mac[2], &mac[3], &mac[4], &mac[5]) != 6) {
    Serial.println("[SPP] MAC invalida");
    return false;
  }

  if (SerialBT.connect(mac)) {
    Serial.println("[SPP] Conectado");
    enki_led_blink(3, 200);
    return true;
  }

  Serial.println("[SPP] Conexion fallo");
  return false;
}

bool spp_send(const uint8_t* data, size_t len) {
  if (!initialized || !SerialBT.connected()) {
    Serial.println("[SPP] No conectada");
    return false;
  }

  Serial.printf("[SPP] Enviando %d bytes...\n", len);
  enki_led_on();
  size_t written = SerialBT.write(data, len);
  enki_led_off();

  if (written == len) {
    Serial.printf("[SPP] OK (%d bytes)\n", written);
    return true;
  }
  Serial.printf("[SPP] Error: %d de %d bytes\n", written, len);
  return false;
}

bool spp_is_connected() {
  return initialized && SerialBT.connected();
}

void spp_disconnect() {
  if (initialized && SerialBT.connected()) {
    SerialBT.disconnect();
    delay(200);
  }
}
