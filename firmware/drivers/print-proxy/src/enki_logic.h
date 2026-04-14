#ifndef ENKI_LOGIC_H
#define ENKI_LOGIC_H

/**
 * Contrato BASE ↔ LÓGICA
 *
 * La BASE (plataforma) gestiona: WiFi, MQTT, Portal, NVS, OTA, Watchdog, LED.
 * La LÓGICA (driver) implementa el comportamiento específico del dispositivo.
 *
 * La LÓGICA implementa las funciones logic_*
 * La LÓGICA usa los servicios enki_* (incluidos via enki_base.h)
 *
 * Para crear un nuevo tipo de dispositivo:
 *   1. Crea logic_mi_driver.cpp
 *   2. Implementa las 5 funciones logic_*
 *   3. Incluye enki_base.h para acceder a los servicios enki_*
 *   4. Compila con la BASE → firmware.bin
 *   5. Despliega por OTA
 */

#include <ArduinoJson.h>

// ─────────────────────────────────────────────
// LA LÓGICA IMPLEMENTA ESTAS 5 FUNCIONES
// ─────────────────────────────────────────────

/**
 * Inicialización del driver.
 * Se llama una vez, después de WiFi+MQTT conectados.
 * Aquí inicializas tu hardware: BLE, sensores, relés, etc.
 * Suscríbete a tus topics MQTT con enki_mqtt_subscribe().
 */
void logic_setup();

/**
 * Ciclo principal del driver.
 * Se llama en cada iteración del loop, después del manejo de WiFi/MQTT.
 * Aquí haces: reconexión de periféricos, lectura de sensores, etc.
 */
void logic_loop();

/**
 * Mensaje MQTT recibido en uno de tus topics suscritos.
 * topic = topic completo, doc = payload ya parseado como JSON.
 */
void logic_on_message(const char* topic, JsonDocument& doc);

/**
 * Reportar estado específico del driver.
 * Se llama cada STATUS_INTERVAL_MS (~30s) para el heartbeat MQTT.
 * Añade tus campos al doc que la BASE ya llenó con los genéricos
 * (device_id, online, wifi_rssi, uptime, free_heap).
 */
void logic_status(JsonDocument& doc);

/**
 * Reportar estado rápido para el portal web (/api/status).
 * Añade tus campos al doc que la BASE ya llenó (wifi, mqtt, portal).
 * Ejemplo: doc["printer"] = printerReady;
 */
void logic_portal_status(JsonDocument& doc);

// ─────────────────────────────────────────────
// SERVICIOS enki_* — incluir enki_base.h para usarlos
// (No se redeclaran aquí para evitar divergencia de defaults)
// ─────────────────────────────────────────────

#endif // ENKI_LOGIC_H
