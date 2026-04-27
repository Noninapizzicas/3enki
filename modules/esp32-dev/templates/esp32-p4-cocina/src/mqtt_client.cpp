/**
 * MQTT Client Implementation
 */

#include "mqtt_client.h"
#include "webview.h"
#include "esp_log.h"
#include "cJSON.h"
#include <string.h>

static const char *TAG = "mqtt_client";

static esp_mqtt_client_handle_t client = NULL;
static bool connected = false;
static mqtt_message_callback_t message_callback = NULL;

static void mqtt_event_handler(void *handler_args, esp_event_base_t base,
                               int32_t event_id, void *event_data) {
  esp_mqtt_event_handle_t event = (esp_mqtt_event_handle_t)event_data;

  switch (event->event_id) {
    case MQTT_EVENT_CONNECTED:
      ESP_LOGI(TAG, "MQTT connected");
      connected = true;
      // Suscribirse a topics
      esp_mqtt_client_subscribe(client, "pedido.enviado_cocina", 0);
      esp_mqtt_client_subscribe(client, "cocina.item_preparado", 0);
      esp_mqtt_client_subscribe(client, "cocina.pedido_listo", 0);
      esp_mqtt_client_subscribe(client, "pedido.cancelado", 0);
      break;

    case MQTT_EVENT_DISCONNECTED:
      ESP_LOGW(TAG, "MQTT disconnected");
      connected = false;
      break;

    case MQTT_EVENT_DATA:
      mqtt_on_message_received(event->topic, event->data, event->data_len);
      break;

    case MQTT_EVENT_ERROR:
      ESP_LOGE(TAG, "MQTT error");
      break;

    default:
      break;
  }
}

void mqtt_client_init(const char *broker, uint16_t port) {
  if (!broker) return;

  char uri[256];
  snprintf(uri, sizeof(uri), "mqtt://%s:%u", broker, port);

  esp_mqtt_client_config_t mqtt_cfg = {
    .broker.address.uri = uri,
    .credentials.username = NULL,
    .credentials.authentication.password = NULL,
    .network.timeout_ms = 10000,
    .session.protocol_ver = MQTT_PROTOCOL_V_3_1_1,
  };

  client = esp_mqtt_client_init(&mqtt_cfg);
  if (client) {
    esp_mqtt_client_register_event(client, ESP_EVENT_ANY_ID, mqtt_event_handler, NULL);
    ESP_LOGI(TAG, "MQTT client initialized");
  }
}

bool mqtt_client_connect() {
  if (!client) {
    ESP_LOGE(TAG, "MQTT client not initialized");
    return false;
  }

  esp_err_t ret = esp_mqtt_client_start(client);
  return ret == ESP_OK;
}

bool mqtt_client_is_connected() {
  return connected;
}

void mqtt_client_disconnect() {
  if (client && connected) {
    esp_mqtt_client_stop(client);
    connected = false;
    ESP_LOGI(TAG, "MQTT disconnected");
  }
}

void mqtt_client_set_message_callback(mqtt_message_callback_t callback) {
  message_callback = callback;
}

/**
 * MQTT → WebView Bridge
 * Recibe evento MQTT y lo envía a WebView vía postMessage
 */
void mqtt_on_message_received(const char *topic, const char *data, int data_len) {
  if (!topic || !data) return;

  ESP_LOGI(TAG, "MQTT received: %s", topic);

  // Parsear JSON payload
  char payload_str[data_len + 1];
  strncpy(payload_str, data, data_len);
  payload_str[data_len] = '\0';

  cJSON *json = cJSON_Parse(payload_str);
  if (!json) {
    ESP_LOGW(TAG, "Failed to parse JSON");
    return;
  }

  // Crear mensaje para WebView
  cJSON *msg = cJSON_CreateObject();
  cJSON_AddStringToObject(msg, "topic", topic);
  cJSON_AddItemToObject(msg, "data", json);

  // Serializar mensaje
  char *msg_str = cJSON_Print(msg);

  // Enviar a WebView
  webview_post_message("mqtt_event", msg_str);

  // Callback opcional
  if (message_callback) {
    message_callback(topic, payload_str, data_len);
  }

  free(msg_str);
  cJSON_Delete(msg);

  ESP_LOGI(TAG, "Message forwarded to WebView");
}
