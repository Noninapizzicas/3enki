/**
 * ESP32-P4 Pantalla Cocina — Main Entry Point
 *
 * Modos:
 * 1. CONFIG (GPIO_0 presionado 2+ segundos) — Setup WiFi + MQTT
 * 2. TRABAJO (normal) — WebView kiosko
 */

#include <stdio.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_task_wdt.h"
#include "nvs_flash.h"
#include "esp_system.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "driver/gpio.h"

// Componentes propios
#include "nvstorage.h"
#include "display.h"
#include "wifi_manager.h"
#include "mqtt_client.h"
#include "webview.h"
#include "config_mode.h"
#include "trabajo_mode.h"

static const char *TAG = "main";

// GPIO para botones
#define CONFIG_BUTTON_GPIO    GPIO_NUM_0
#define TRABAJO_BUTTON_GPIO   GPIO_NUM_1

// Estados del firmware
typedef enum {
  MODE_SELECTION,
  MODE_CONFIG,
  MODE_TRABAJO
} firmware_mode_t;

// Estructura global de estado
typedef struct {
  firmware_mode_t current_mode;
  nvstorage_config_t config;
  bool wifi_connected;
  bool mqtt_connected;
} firmware_state_t;

static firmware_state_t g_state = {0};

// ============================================================================
// BUTTON HANDLING
// ============================================================================

static void gpio_init() {
  gpio_config_t io_conf = {
    .pin_bit_mask = (1ULL << CONFIG_BUTTON_GPIO) | (1ULL << TRABAJO_BUTTON_GPIO),
    .mode = GPIO_MODE_INPUT,
    .pull_up_en = 1,
    .pull_down_en = 0,
    .intr_type = GPIO_INTR_DISABLE
  };
  gpio_config(&io_conf);
}

static firmware_mode_t detect_mode_at_startup() {
  uint32_t press_time = 0;
  uint32_t max_wait = 5000; // 5 segundos de espera máxima
  uint32_t start_ms = esp_timer_get_time() / 1000;

  // Mostrar splash mientras espera
  display_show_message("Detectando modo...", "CONFIG: Mantén presionado GPIO_0", 2000);

  // Esperar a que usuario presione CONFIG
  while ((esp_timer_get_time() / 1000 - start_ms) < max_wait) {
    if (gpio_get_level(CONFIG_BUTTON_GPIO) == 0) {
      // Botón presionado — contar tiempo
      press_time++;
      vTaskDelay(10 / portTICK_PERIOD_MS);

      // Si lleva 2+ segundos presionado → CONFIG
      if (press_time > 200) { // 200 * 10ms = 2000ms
        ESP_LOGI(TAG, "CONFIG mode selected");
        return MODE_CONFIG;
      }
    } else {
      press_time = 0; // Reset si se suelta
      vTaskDelay(10 / portTICK_PERIOD_MS);
    }
  }

  // Timeout → TRABAJO mode
  ESP_LOGI(TAG, "TRABAJO mode (default)");
  return MODE_TRABAJO;
}

// ============================================================================
// WIFI EVENT HANDLER
// ============================================================================

static void wifi_event_handler(void *handler_arg, esp_event_base_t base,
                               int32_t event_id, void *event_data) {
  if (event_id == WIFI_EVENT_STA_CONNECTED) {
    ESP_LOGI(TAG, "WiFi connected");
    g_state.wifi_connected = true;
    display_update_status("WiFi", "OK");
  } else if (event_id == WIFI_EVENT_STA_DISCONNECTED) {
    ESP_LOGW(TAG, "WiFi disconnected");
    g_state.wifi_connected = false;
    display_update_status("WiFi", "OFFLINE");
  }
}

static void ip_event_handler(void *handler_arg, esp_event_base_t base,
                             int32_t event_id, void *event_data) {
  if (event_id == IP_EVENT_STA_GOT_IP) {
    ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
    ESP_LOGI(TAG, "Got IP: " IPSTR, IP2STR(&event->ip_info.ip));
    char ip_str[32];
    snprintf(ip_str, sizeof(ip_str), "" IPSTR, IP2STR(&event->ip_info.ip));
    display_show_ip(ip_str);
  }
}

// ============================================================================
// MQTT EVENT HANDLER
// ============================================================================

static void mqtt_event_handler(esp_mqtt_event_handle_t event) {
  if (event->event_id == MQTT_EVENT_CONNECTED) {
    ESP_LOGI(TAG, "MQTT connected");
    g_state.mqtt_connected = true;
    display_update_status("MQTT", "OK");

    // Suscribirse a topics de cocina
    esp_mqtt_client_subscribe(event->client, "pedido.enviado_cocina", 0);
    esp_mqtt_client_subscribe(event->client, "cocina.item_preparado", 0);
    esp_mqtt_client_subscribe(event->client, "cocina.pedido_listo", 0);
    esp_mqtt_client_subscribe(event->client, "pedido.cancelado", 0);
  } else if (event->event_id == MQTT_EVENT_DISCONNECTED) {
    ESP_LOGW(TAG, "MQTT disconnected");
    g_state.mqtt_connected = false;
    display_update_status("MQTT", "OFFLINE");
  } else if (event->event_id == MQTT_EVENT_DATA) {
    // Recibido evento MQTT → enviar a WebView
    mqtt_on_message_received(event->topic, event->data, event->data_len);
  }
}

// ============================================================================
// MODO CONFIG
// ============================================================================

static void run_config_mode() {
  ESP_LOGI(TAG, "Starting CONFIG mode");
  g_state.current_mode = MODE_CONFIG;

  // Inicializar pantalla para UI configuración
  display_init_config_mode();

  // Mostrar UI de configuración (bloqueante hasta guardar)
  config_mode_run();

  // Guardar config en NVS
  nvstorage_save_config(&g_state.config);

  // Mostrar resumen y esperar a TRABAJO
  display_show_message("Configuración guardada",
                       "Presione GPIO_1 para TRABAJO",
                       0);

  // Esperar botón TRABAJO o timeout
  uint32_t timeout_ms = 10000; // 10 segundos
  uint32_t elapsed = 0;
  while (elapsed < timeout_ms) {
    if (gpio_get_level(TRABAJO_BUTTON_GPIO) == 0) {
      // Usuario presionó TRABAJO
      vTaskDelay(100 / portTICK_PERIOD_MS); // Debounce
      break;
    }
    vTaskDelay(100 / portTICK_PERIOD_MS);
    elapsed += 100;
  }

  // Volver a seleccionar modo
  g_state.current_mode = MODE_SELECTION;
}

// ============================================================================
// MODO TRABAJO (WEBVIEW KIOSKO)
// ============================================================================

static void run_trabajo_mode() {
  ESP_LOGI(TAG, "Starting TRABAJO mode");
  g_state.current_mode = MODE_TRABAJO;

  // Leer configuración de NVS
  if (!nvstorage_load_config(&g_state.config)) {
    ESP_LOGE(TAG, "Failed to load config from NVS — entering CONFIG mode");
    run_config_mode();
    return;
  }

  // Mostrar splash screen
  display_init_trabajo_mode();
  display_show_splash("Pantalla de Cocina", "Conectando...");

  // Inicializar WiFi
  ESP_LOGI(TAG, "Initializing WiFi...");
  wifi_manager_init();
  wifi_manager_connect(&g_state.config);

  // Esperar a que WiFi conecte (timeout 30s)
  uint32_t timeout = 30;
  while (!g_state.wifi_connected && timeout-- > 0) {
    display_show_message("Conectando WiFi...",
                        g_state.config.wifi_networks[0].ssid,
                        1000);
    vTaskDelay(1000 / portTICK_PERIOD_MS);
  }

  if (!g_state.wifi_connected) {
    ESP_LOGE(TAG, "WiFi connection timeout");
    display_show_error("Error", "WiFi no disponible");
    vTaskDelay(5000 / portTICK_PERIOD_MS);
    return;
  }

  // Inicializar MQTT
  ESP_LOGI(TAG, "Initializing MQTT...");
  mqtt_client_init(g_state.config.mqtt_broker, g_state.config.mqtt_port);
  mqtt_client_connect();

  // Esperar a que MQTT conecte (timeout 10s)
  timeout = 10;
  while (!g_state.mqtt_connected && timeout-- > 0) {
    display_show_message("Conectando MQTT...",
                        g_state.config.mqtt_broker,
                        1000);
    vTaskDelay(1000 / portTICK_PERIOD_MS);
  }

  if (!g_state.mqtt_connected) {
    ESP_LOGW(TAG, "MQTT connection failed — continuando con cache");
    // No bloqueamos, la pantalla funciona con cache local
  }

  // Inicializar WebView
  ESP_LOGI(TAG, "Initializing WebView...");
  char url[512];
  snprintf(url, sizeof(url), "%s/[project_id]/cocina",
          g_state.config.server_url);

  webview_init(url);

  // WebView ahora está activo y fullscreen
  display_show_splash("Listo", "");
  vTaskDelay(2000 / portTICK_PERIOD_MS);
  webview_show_fullscreen();

  // Main loop — mantener conexiones vivas
  while (1) {
    // Feed watchdog
    esp_task_wdt_reset();

    // Chequear y reconectar WiFi si es necesario
    if (!wifi_manager_is_connected()) {
      ESP_LOGW(TAG, "WiFi lost — reconnecting...");
      wifi_manager_connect(&g_state.config);
    }

    // Chequear y reconectar MQTT si es necesario
    if (!mqtt_client_is_connected()) {
      ESP_LOGW(TAG, "MQTT lost — reconnecting...");
      mqtt_client_connect();
    }

    vTaskDelay(5000 / portTICK_PERIOD_MS);
  }
}

// ============================================================================
// APP MAIN
// ============================================================================

void app_main() {
  ESP_LOGI(TAG, "Pantalla Cocina v1.0.0");

  // Inicializar watchdog (30 segundos)
  esp_task_wdt_init(30, true);
  esp_task_wdt_add(NULL);

  // Inicializar NVS
  esp_err_t ret = nvs_flash_init();
  if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_ERROR_CHECK(nvs_flash_erase());
    ret = nvs_flash_init();
  }
  ESP_ERROR_CHECK(ret);

  // Inicializar event loop
  ESP_ERROR_CHECK(esp_event_loop_create_default());

  // Inicializar GPIO (botones)
  gpio_init();

  // Inicializar pantalla LVGL
  display_init();

  // Registrar event handlers
  esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL);
  esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, &ip_event_handler, NULL);

  // Main loop
  while (1) {
    // Detectar modo al inicio
    firmware_mode_t mode = detect_mode_at_startup();

    if (mode == MODE_CONFIG) {
      run_config_mode();
    } else {
      run_trabajo_mode();
    }

    // Si llegamos acá (fallo), esperar 5s y reintentar
    vTaskDelay(5000 / portTICK_PERIOD_MS);
  }
}
