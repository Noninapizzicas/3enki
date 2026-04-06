/**
 * Transporte BLE — NimBLE
 *
 * Conexion permanente, scan por nombre, chunked write.
 * Consume ~15KB RAM. Se inicia al boot y queda vivo.
 */

#include "bt_common.h"
#include "enki_base.h"
#include "config.h"
#include <NimBLEDevice.h>

// Estado interno
static NimBLEClient*               bleClient = nullptr;
static NimBLERemoteCharacteristic* printChar = nullptr;
static char svc[48];
static char chr[48];

// ─── Interfaz publica ───────────────────────────

void ble_init(const char* svcUuid, const char* charUuid) {
  strlcpy(svc, svcUuid, sizeof(svc));
  strlcpy(chr, charUuid, sizeof(chr));
  NimBLEDevice::init("EnkiPrint");
  Serial.println("[BLE] NimBLE iniciado");
}

void ble_deinit() {
  // NimBLE es ligero, no merece deinit
}

bool ble_connect(const char* addr) {
  if (strlen(addr) == 0) return false;

  Serial.printf("[BLE] Conectando a %s...\n", addr);

  if (bleClient && bleClient->isConnected()) bleClient->disconnect();
  if (bleClient) NimBLEDevice::deleteClient(bleClient);

  bleClient = NimBLEDevice::createClient();
  bleClient->setConnectTimeout(5);

  NimBLEAddress nimAddr(addr);
  if (!bleClient->connect(nimAddr)) {
    Serial.println("[BLE] Fallo conexion directa");
    return false;
  }

  Serial.println("[BLE] Conectado. Buscando servicio...");

  NimBLERemoteService* service = bleClient->getService(svc);
  if (!service) {
    Serial.printf("[BLE] Servicio %s no encontrado\n", svc);
    bleClient->disconnect();
    return false;
  }

  printChar = service->getCharacteristic(chr);
  if (!printChar) {
    Serial.printf("[BLE] Characteristic %s no encontrada\n", chr);
    bleClient->disconnect();
    return false;
  }

  if (!printChar->canWrite() && !printChar->canWriteNoResponse()) {
    Serial.println("[BLE] Characteristic no soporta escritura");
    bleClient->disconnect();
    return false;
  }

  Serial.printf("[BLE] Impresora lista (write%s)\n",
    printChar->canWriteNoResponse() ? " no-response" : " con response");
  enki_led_blink(3, 200);
  return true;
}

bool ble_send(const uint8_t* data, size_t len) {
  if (!bleClient || !bleClient->isConnected() || !printChar) {
    Serial.println("[BLE] No conectada");
    return false;
  }

  Serial.printf("[BLE] Enviando %d bytes en chunks de %d...\n", len, BLE_CHUNK_SIZE);
  enki_led_on();

  bool useNoResponse = printChar->canWriteNoResponse();
  size_t sent = 0;

  while (sent < len) {
    size_t chunkLen = min((size_t)BLE_CHUNK_SIZE, len - sent);
    bool ok = printChar->writeValue(data + sent, chunkLen, !useNoResponse);
    if (!ok) {
      Serial.printf("[BLE] Error en offset %d\n", sent);
      enki_led_off();
      return false;
    }
    sent += chunkLen;
    if (sent < len) delay(BLE_CHUNK_DELAY);
  }

  enki_led_off();
  Serial.printf("[BLE] Enviado OK (%d bytes)\n", sent);
  return true;
}

bool ble_is_connected() {
  return bleClient && bleClient->isConnected();
}

void ble_disconnect() {
  if (bleClient && bleClient->isConnected()) {
    bleClient->disconnect();
  }
}

void ble_scan(JsonDocument& doc) {
  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->setActiveScan(true);
  NimBLEScanResults results = scan->start(BLE_SCAN_SECONDS);

  auto arr = doc.to<JsonArray>();
  for (int i = 0; i < results.getCount(); i++) {
    NimBLEAdvertisedDevice dev = results.getDevice(i);
    String name = dev.getName().c_str();
    if (name.length() == 0) continue;

    JsonObject obj = arr.add<JsonObject>();
    obj["name"] = name;
    obj["addr"] = dev.getAddress().toString().c_str();
    obj["rssi"] = dev.getRSSI();
  }
  scan->clearResults();
}

bool ble_scan_and_connect(const char* name, char* addrOut, size_t addrSize,
                          void (*save_callback)()) {
  if (strlen(name) == 0) {
    Serial.println("[BLE] No hay nombre configurado");
    return false;
  }

  // Intentar por MAC guardada primero (rapido)
  if (strlen(addrOut) > 0) {
    if (ble_connect(addrOut)) return true;
    Serial.println("[BLE] MAC directa fallo, escaneando...");
  }

  // Scan por nombre (bloqueante, solo setup/portal)
  Serial.printf("[BLE] Escaneando '%s' (%ds)...\n", name, BLE_SCAN_SECONDS);

  NimBLEScan* scan = NimBLEDevice::getScan();
  scan->setActiveScan(true);
  NimBLEScanResults results = scan->start(BLE_SCAN_SECONDS);

  NimBLEAdvertisedDevice* found = nullptr;
  for (int i = 0; i < results.getCount(); i++) {
    NimBLEAdvertisedDevice dev = results.getDevice(i);
    Serial.printf("[BLE]   %s (%s)\n",
      dev.getName().c_str(), dev.getAddress().toString().c_str());
    if (dev.getName() == name) {
      found = new NimBLEAdvertisedDevice(dev);
      break;
    }
  }
  scan->clearResults();

  if (!found) {
    Serial.printf("[BLE] '%s' no encontrada\n", name);
    return false;
  }

  // Guardar MAC
  String foundAddr = found->getAddress().toString().c_str();
  if (strcmp(addrOut, foundAddr.c_str()) != 0) {
    strlcpy(addrOut, foundAddr.c_str(), addrSize);
    if (save_callback) save_callback();
    Serial.printf("[BLE] MAC guardada: %s\n", addrOut);
  }

  NimBLEAddress addr = found->getAddress();
  delete found;

  return ble_connect(addrOut);
}
