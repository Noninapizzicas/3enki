#ifndef BT_COMMON_H
#define BT_COMMON_H

/**
 * Contrato de transporte Bluetooth — BLE y SPP implementan estas funciones.
 *
 * bt_ble.cpp y bt_spp.cpp definen las mismas funciones con distinto prefijo
 * imposible en C puro, asi que usamos prefijo ble_/spp_ y el orquestador
 * (logic_print_proxy.cpp) despacha segun btMode.
 *
 * Cada transporte gestiona su propio estado interno.
 * El orquestador solo ve: init, deinit, connect, send, is_connected, disconnect.
 */

#include <Arduino.h>
#include <ArduinoJson.h>

// Modos
#define BT_MODE_BLE  0
#define BT_MODE_SPP  1

// ─── BLE (bt_ble.cpp) ───────────────────────────

/**
 * Inicializar NimBLE. Ligero (~15KB), se queda vivo todo el tiempo.
 * svcUuid/charUuid: UUIDs del servicio GATT de la impresora.
 */
void ble_init(const char* svcUuid, const char* charUuid);

/** Noop — NimBLE consume poca RAM, no merece deinit. */
void ble_deinit();

/** Conectar a impresora por MAC. ~2-3s. */
bool ble_connect(const char* addr);

/** Enviar bytes ESC/POS en chunks de BLE_CHUNK_SIZE. */
bool ble_send(const uint8_t* data, size_t len);

/** Consultar si la conexion BLE sigue viva. */
bool ble_is_connected();

/** Desconectar impresora BLE. */
void ble_disconnect();

/**
 * Scan BLE: buscar dispositivos BT, devolver lista.
 * Resultado en doc (JsonArray): [{name, addr, rssi}, ...]
 * Bloqueante ~5s. Solo usar desde portal web.
 * IMPORTANTE: desconectar impresora ANTES de llamar (radio compartido).
 */
void ble_scan(JsonDocument& doc);

// ─── SPP (bt_spp.cpp) ──────────────────────────

/**
 * Inicializar Bluedroid. Pesado (~70KB RAM).
 * Llamar solo cuando se va a imprimir, deinit despues.
 */
void spp_init();

/** Liberar Bluedroid — devuelve ~70KB RAM. */
void spp_deinit();

/** Conectar a impresora por MAC. ~1-2s. */
bool spp_connect(const char* addr);

/** Enviar bytes ESC/POS de golpe (sin chunks). */
bool spp_send(const uint8_t* data, size_t len);

/** Consultar si la conexion SPP sigue viva. */
bool spp_is_connected();

/** Desconectar impresora SPP. */
void spp_disconnect();

#endif // BT_COMMON_H
