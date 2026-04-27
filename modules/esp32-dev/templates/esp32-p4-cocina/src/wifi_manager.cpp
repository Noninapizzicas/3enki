/**
 * WiFi Manager Implementation
 */

#include "wifi_manager.h"
#include "esp_wifi.h"
#include "esp_netif.h"
#include "esp_log.h"

static const char *TAG = "wifi_manager";
static esp_netif_t *sta_netif = NULL;
static bool connected = false;

void wifi_manager_init() {
  ESP_LOGI(TAG, "Initializing WiFi");

  esp_netif_init();
  sta_netif = esp_netif_create_default_wifi_sta();

  wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
  ESP_ERROR_CHECK(esp_wifi_init(&cfg));
  ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
  ESP_ERROR_CHECK(esp_wifi_start());

  ESP_LOGI(TAG, "WiFi initialized");
}

bool wifi_manager_connect(const nvstorage_config_t *config) {
  if (!config || config->network_count == 0) {
    ESP_LOGW(TAG, "No networks configured");
    return false;
  }

  // Intentar conectar con cada red en orden de prioridad
  for (int i = 0; i < config->network_count; i++) {
    const wifi_network_t *net = &config->networks[i];

    ESP_LOGI(TAG, "Connecting to %s", net->ssid);

    wifi_config_t wifi_config = {
      .sta = {
        .ssid_len = strlen((char *)net->ssid),
        .scan_method = WIFI_ALL_CHANNEL_SCAN,
        .bssid_set = 0,
        .channel = 0,
        .listen_interval = 0,
        .sort_method = WIFI_CONNECT_AP_BY_SIGNAL,
        .threshold.rssi = -127,
        .threshold.authmode = WIFI_AUTH_OPEN,
      },
    };
    strcpy((char *)wifi_config.sta.ssid, (char *)net->ssid);
    strcpy((char *)wifi_config.sta.password, (char *)net->password);

    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    esp_err_t ret = esp_wifi_connect();

    if (ret == ESP_OK) {
      // Esperar conexión (timeout 10s)
      uint32_t timeout = 100; // 100 * 100ms = 10s
      while (timeout-- > 0 && !connected) {
        vTaskDelay(100 / portTICK_PERIOD_MS);
      }

      if (connected) {
        ESP_LOGI(TAG, "Connected to %s", net->ssid);
        return true;
      }
    }

    // Si falló, intentar siguiente red
    esp_wifi_disconnect();
    vTaskDelay(500 / portTICK_PERIOD_MS);
  }

  ESP_LOGW(TAG, "Failed to connect to any network");
  return false;
}

bool wifi_manager_is_connected() {
  return connected;
}

void wifi_manager_disconnect() {
  if (connected) {
    esp_wifi_disconnect();
    connected = false;
    ESP_LOGI(TAG, "WiFi disconnected");
  }
}

void wifi_manager_scan_networks(char **networks_out, int *count_out, int max_networks) {
  if (!networks_out || !count_out || max_networks <= 0) return;

  uint16_t number = max_networks;
  wifi_ap_record_t ap_records[max_networks];

  esp_err_t ret = esp_wifi_scan_get_ap_records(&number, ap_records);
  if (ret != ESP_OK) {
    *count_out = 0;
    return;
  }

  *count_out = number;
  for (int i = 0; i < number; i++) {
    strcpy(networks_out[i], (char *)ap_records[i].ssid);
  }

  ESP_LOGI(TAG, "Scanned %d networks", number);
}
