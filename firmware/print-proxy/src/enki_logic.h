#ifndef ENKI_LOGIC_H
#define ENKI_LOGIC_H

/**
 * Contrato BASE ↔ LÓGICA
 *
 * La BASE (plataforma) gestiona: WiFi, MQTT, Portal, NVS, OTA, Watchdog, LED.
 * La LÓGICA (driver) implementa el comportamiento específico del dispositivo.
 *
 * La LÓGICA implementa las funciones logic_*
 * La LÓGICA usa los servicios enki_*
 *
 * Para crear un nuevo tipo de dispositivo:
 *   1. Crea logic_mi_driver.cpp
 *   2. Implementa las 4 funciones logic_*
 *   3. Usa los servicios enki_* para comunicarte
 *   4. Compila con la BASE → firmware.bin
 *   5. Despliega por OTA
 */

#include <ArduinoJson.h>

// ─────────────────────────────────────────────
// LA LÓGICA IMPLEMENTA ESTAS 4 FUNCIONES
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
// LA BASE EXPONE ESTOS SERVICIOS (enki_*)
// ─────────────────────────────────────────────

// --- MQTT ---
void enki_mqtt_publish(const char* topic, const char* payload);
bool enki_mqtt_subscribe(const char* topic);
bool enki_mqtt_connected();

// --- Identidad ---
const char* enki_device_id();
const char* enki_project_id();

// --- Config custom del driver (NVS) ---
// La lógica puede guardar/leer hasta 8 pares clave-valor string
void        enki_config_set(const char* key, const char* value);
const char* enki_config_get(const char* key, const char* defaultValue);
void        enki_config_set_u16(const char* key, uint16_t value);
uint16_t    enki_config_get_u16(const char* key, uint16_t defaultValue);

// --- Utilidades ---
void enki_led_blink(int times, int ms);
void enki_led_on();
void enki_led_off();
void enki_request_restart();

// --- Buffer compartido (para payloads grandes: ESC/POS, binarios) ---
uint8_t* enki_buffer();
size_t   enki_buffer_size();

#endif // ENKI_LOGIC_H
