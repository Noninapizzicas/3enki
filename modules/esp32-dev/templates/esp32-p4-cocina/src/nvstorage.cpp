/**
 * NVS Storage Implementation
 */

#include "nvstorage.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "esp_log.h"
#include <string.h>

static const char *TAG = "nvstorage";
static const char *NVS_NAMESPACE = "cocina_cfg";

bool nvstorage_init() {
  esp_err_t ret = nvs_flash_init();
  if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_ERROR_CHECK(nvs_flash_erase());
    ret = nvs_flash_init();
  }
  return ret == ESP_OK;
}

bool nvstorage_load_config(nvstorage_config_t *config) {
  if (!config) return false;

  nvs_handle_t handle;
  esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READONLY, &handle);
  if (err != ESP_OK) {
    ESP_LOGW(TAG, "NVS open failed, returning defaults");
    nvstorage_get_default_config(config);
    return false;
  }

  // Cargar redes WiFi
  size_t required_size = 0;
  nvs_get_blob(handle, "networks", NULL, &required_size);
  if (required_size > 0) {
    uint8_t buffer[required_size];
    nvs_get_blob(handle, "networks", buffer, &required_size);
    memcpy(config->networks, buffer, required_size);
  }

  nvs_get_u8(handle, "net_count", &config->network_count);
  nvs_get_str(handle, "mqtt_broker", config->mqtt_broker, (size_t *)&(uint32_t){MAX_IP_LEN});
  nvs_get_u16(handle, "mqtt_port", &config->mqtt_port);
  nvs_get_str(handle, "server_url", config->server_url, (size_t *)&(uint32_t){MAX_URL_LEN});
  nvs_get_str(handle, "project_id", config->project_id, (size_t *)&(uint32_t){64});
  nvs_get_str(handle, "device_name", config->device_name, (size_t *)&(uint32_t){64});
  nvs_get_u8(handle, "brightness", &config->brightness);
  nvs_get_str(handle, "orientation", config->orientation, (size_t *)&(uint32_t){16});

  nvs_close(handle);
  ESP_LOGI(TAG, "Config loaded from NVS");
  return true;
}

bool nvstorage_save_config(const nvstorage_config_t *config) {
  if (!config) return false;

  nvs_handle_t handle;
  esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &handle);
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "NVS open failed");
    return false;
  }

  // Guardar redes WiFi
  nvs_set_blob(handle, "networks", config->networks, sizeof(config->networks));
  nvs_set_u8(handle, "net_count", config->network_count);
  nvs_set_str(handle, "mqtt_broker", config->mqtt_broker);
  nvs_set_u16(handle, "mqtt_port", config->mqtt_port);
  nvs_set_str(handle, "server_url", config->server_url);
  nvs_set_str(handle, "project_id", config->project_id);
  nvs_set_str(handle, "device_name", config->device_name);
  nvs_set_u8(handle, "brightness", config->brightness);
  nvs_set_str(handle, "orientation", config->orientation);

  err = nvs_commit(handle);
  nvs_close(handle);

  if (err == ESP_OK) {
    ESP_LOGI(TAG, "Config saved to NVS");
    return true;
  } else {
    ESP_LOGE(TAG, "NVS commit failed");
    return false;
  }
}

bool nvstorage_save_wifi_network(const wifi_network_t *net) {
  if (!net) return false;

  nvstorage_config_t config;
  if (!nvstorage_load_config(&config)) {
    nvstorage_get_default_config(&config);
  }

  // Agregar red si no existe
  bool found = false;
  for (int i = 0; i < config.network_count; i++) {
    if (strcmp(config.networks[i].ssid, net->ssid) == 0) {
      strcpy(config.networks[i].password, net->password);
      found = true;
      break;
    }
  }

  if (!found && config.network_count < MAX_NETWORKS) {
    memcpy(&config.networks[config.network_count], net, sizeof(wifi_network_t));
    config.network_count++;
  }

  return nvstorage_save_config(&config);
}

bool nvstorage_get_default_config(nvstorage_config_t *config) {
  if (!config) return false;

  memset(config, 0, sizeof(nvstorage_config_t));
  strcpy(config->mqtt_broker, "192.168.1.1");
  config->mqtt_port = 1883;
  strcpy(config->server_url, "http://192.168.1.1:5173");
  strcpy(config->project_id, "peppone");
  strcpy(config->device_name, "Cocina-1");
  config->brightness = 80;
  strcpy(config->orientation, "portrait");

  return true;
}
