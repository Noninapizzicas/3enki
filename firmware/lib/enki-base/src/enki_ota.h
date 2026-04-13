#ifndef ENKI_OTA_H
#define ENKI_OTA_H

/**
 * Enki OTA — Actualización de firmware via shadow delta o polling HTTP.
 *
 * La OTA se PROGRAMA (no ejecuta inmediatamente) para no bloquear MQTT.
 * Protecciones: anti-loop, watchdog feed, WiFiClient separado, notificación.
 */

#include <Arduino.h>
#include <ArduinoJson.h>

/**
 * Maneja delta del shadow. Programa OTA si hay nueva versión.
 * Llamar desde el callback MQTT cuando topic == shadow/delta.
 */
void otaHandleShadowDelta(JsonDocument& doc);

/**
 * Ejecuta OTA programada + legacy polling.
 * Llamar en cada iteración del loop().
 */
void otaHandle();

#endif // ENKI_OTA_H
