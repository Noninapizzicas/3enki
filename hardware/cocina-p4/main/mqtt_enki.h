/**
 * @file mqtt_enki.h
 * @brief Cocina P4 — enlace MQTT con el modulo cocina de Enki.
 *
 * Contrato (ver README.md):
 *   SUSCRIBE  core/+/events/periferico/display                     (qos 1)
 *   PUBLICA   core/core-a/events/cocina/register-device-request     (qos 1)
 *             core/core-a/events/cocina/prepare-item-request        (qos 1)
 *
 * Envelope de publicacion:
 *   {"request_id":"<uuid>","source":{"core_id":"external","module_id":"cocina-p4"},"data":{...}}
 */

#pragma once

#include <stdbool.h>

#include "esp_err.h"

/** Arranca el cliente MQTT (idempotente; seguro tras cada reconexion WiFi). */
esp_err_t mqtt_enki_start(void);

/** Publica register-device-request (se reenvía solo al reconectar). */
esp_err_t mqtt_enki_register_device(void);

/** Publica prepare-item-request con done:true para ese item. */
esp_err_t mqtt_enki_prepare_item(const char *item_id);

/** true si el cliente esta conectado al broker (para la barra de estado). */
bool mqtt_enki_is_connected(void);

/** device_id resuelto (Kconfig o derivado de la MAC). Nunca NULL. */
const char *mqtt_enki_device_id(void);
