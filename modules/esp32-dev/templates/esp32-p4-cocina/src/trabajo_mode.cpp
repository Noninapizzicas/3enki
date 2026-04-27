/**
 * TRABAJO Mode Implementation — WebView Kiosko
 */

#include "trabajo_mode.h"
#include "display.h"
#include "nvstorage.h"
#include "wifi_manager.h"
#include "mqtt_client.h"
#include "webview.h"
#include "esp_log.h"
#include "esp_task_wdt.h"
#include <string.h>
#include <stdio.h>

static const char *TAG = "trabajo_mode";

void trabajo_mode_run() {
  ESP_LOGI(TAG, "Starting TRABAJO mode");

  // Cargar configuración
  nvstorage_config_t config = {0};
  if (!nvstorage_load_config(&config)) {
    ESP_LOGE(TAG, "Failed to load config");
    display_show_error("Error", "Configuración no encontrada");
    vTaskDelay(5000 / portTICK_PERIOD_MS);
    return;
  }

  // Inicializar pantalla
  display_init_trabajo_mode();
  display_show_splash("Pantalla de Cocina", "Iniciando...");

  // ========== Conectar WiFi ==========
  ESP_LOGI(TAG, "Connecting to WiFi...");
  display_show_message("Conectando WiFi", "Por favor espere...", 0);

  wifi_manager_init();
  uint32_t wifi_timeout = 30;
  bool wifi_ok = false;

  while (wifi_timeout-- > 0) {
    if (wifi_manager_connect(&config)) {
      wifi_ok = true;
      break;
    }
    display_update_status("WiFi", "Reintentando...");
    vTaskDelay(1000 / portTICK_PERIOD_MS);
  }

  if (wifi_ok) {
    display_update_status("WiFi", "✓ Conectado");
    ESP_LOGI(TAG, "WiFi connected");
    display_trabajo_update_wifi(true);
  } else {
    display_update_status("WiFi", "✗ Sin conexión");
    ESP_LOGW(TAG, "WiFi connection timeout");
    display_trabajo_update_wifi(false);
    // No bloqueamos, continuamos (WebView funcionará con cache)
  }

  vTaskDelay(1000 / portTICK_PERIOD_MS);

  // ========== Conectar MQTT ==========
  ESP_LOGI(TAG, "Connecting to MQTT broker: %s:%u", config.mqtt_broker, config.mqtt_port);
  display_show_message("Conectando MQTT", "Por favor espere...", 0);

  mqtt_client_init(config.mqtt_broker, config.mqtt_port);
  uint32_t mqtt_timeout = 10;
  bool mqtt_ok = false;

  while (mqtt_timeout-- > 0) {
    if (mqtt_client_connect()) {
      mqtt_ok = true;
      break;
    }
    display_update_status("MQTT", "Reintentando...");
    vTaskDelay(1000 / portTICK_PERIOD_MS);
  }

  if (mqtt_ok) {
    display_update_status("MQTT", "✓ Conectado");
    ESP_LOGI(TAG, "MQTT connected");
    display_trabajo_update_mqtt(true);
  } else {
    display_update_status("MQTT", "✗ Sin conexión");
    ESP_LOGW(TAG, "MQTT connection timeout");
    display_trabajo_update_mqtt(false);
    // No bloqueamos, WebView funciona offline
  }

  vTaskDelay(1000 / portTICK_PERIOD_MS);

  // ========== Inicializar WebView ==========
  ESP_LOGI(TAG, "Initializing WebView");
  display_show_message("Cargando página", "Por favor espere...", 0);

  char webview_url[512];
  snprintf(webview_url, sizeof(webview_url), "%s/%s/cocina",
          config.server_url, config.project_id);

  webview_init(webview_url);
  display_show_splash("Listo", "");
  vTaskDelay(2000 / portTICK_PERIOD_MS);

  // Mostrar WebView fullscreen
  webview_show_fullscreen();

  ESP_LOGI(TAG, "WebView fullscreen active");

  // ========== Main Loop — Mantener conexiones vivas ==========
  uint32_t reconnect_counter = 0;

  while (1) {
    // Feed watchdog
    esp_task_wdt_reset();

    // Chequear WiFi cada 30 segundos
    if (++reconnect_counter >= 30) {
      reconnect_counter = 0;

      if (!wifi_manager_is_connected()) {
        ESP_LOGW(TAG, "WiFi lost — attempting reconnect");
        display_trabajo_update_wifi(false);

        if (wifi_manager_connect(&config)) {
          display_trabajo_update_wifi(true);
          ESP_LOGI(TAG, "WiFi reconnected");
        }
      }

      // Chequear MQTT
      if (!mqtt_client_is_connected()) {
        ESP_LOGW(TAG, "MQTT lost — attempting reconnect");
        display_trabajo_update_mqtt(false);

        mqtt_client_init(config.mqtt_broker, config.mqtt_port);
        if (mqtt_client_connect()) {
          display_trabajo_update_mqtt(true);
          ESP_LOGI(TAG, "MQTT reconnected");
        }
      }
    }

    vTaskDelay(1000 / portTICK_PERIOD_MS);
  }
}
