/**
 * MQTT Client
 */

#pragma once

#include "esp_mqtt_client.h"
#include <stdbool.h>

typedef void (*mqtt_message_callback_t)(const char *topic, const char *data, int data_len);

void mqtt_client_init(const char *broker, uint16_t port);
bool mqtt_client_connect();
bool mqtt_client_is_connected();
void mqtt_client_disconnect();
void mqtt_client_set_message_callback(mqtt_message_callback_t callback);
void mqtt_on_message_received(const char *topic, const char *data, int data_len);
