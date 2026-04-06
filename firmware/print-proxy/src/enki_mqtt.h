#ifndef ENKI_MQTT_H
#define ENKI_MQTT_H

/**
 * Enki MQTT — Conexión, reconexión con backoff, cola offline,
 *             protocolo birth/LWT/shadow, status periódico.
 */

#include <Arduino.h>
#include <PubSubClient.h>
#include "config.h"

extern PubSubClient mqtt;
extern WiFiClient   wifiClient;

/**
 * Configurar callback, buffer, topics.
 * Llamar después de cargar config NVS.
 */
void mqttSetup();

/**
 * Conectar a MQTT y ejecutar protocolo de autodescubrimiento:
 * LWT, birth retained, subscribe shadow delta, reported state, flush cola.
 */
void mqttConnect();

/**
 * Reconexión con backoff + mqtt.loop().
 * Llamar en cada iteración del loop().
 */
void mqttHandleReconnect();

/**
 * Publicar status periódico (cada STATUS_INTERVAL_MS).
 * Incluye campos genéricos + logic_status().
 */
void mqttPublishStatus();

/**
 * Publicar reported state al shadow (firmware version).
 */
void mqttPublishReported();

/**
 * Reconstruir topics tras cambio de config.
 * Llamar después de guardar nueva config desde el portal.
 */
void mqttRebuildTopics();

#endif // ENKI_MQTT_H
