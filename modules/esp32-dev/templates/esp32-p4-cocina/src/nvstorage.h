/**
 * NVS Storage — Persistencia de configuración
 */

#pragma once

#include <stdint.h>
#include <stdbool.h>

#define MAX_NETWORKS 3
#define MAX_SSID_LEN 32
#define MAX_PASSWORD_LEN 64
#define MAX_URL_LEN 256
#define MAX_IP_LEN 32

typedef struct {
  char ssid[MAX_SSID_LEN];
  char password[MAX_PASSWORD_LEN];
  uint8_t priority;
} wifi_network_t;

typedef struct {
  wifi_network_t networks[MAX_NETWORKS];
  uint8_t network_count;
  char mqtt_broker[MAX_IP_LEN];
  uint16_t mqtt_port;
  char server_url[MAX_URL_LEN];
  char project_id[64];
  char device_name[64];
  uint8_t brightness;
  char orientation[16];
} nvstorage_config_t;

bool nvstorage_init();
bool nvstorage_load_config(nvstorage_config_t *config);
bool nvstorage_save_config(const nvstorage_config_t *config);
bool nvstorage_save_wifi_network(const wifi_network_t *net);
bool nvstorage_get_default_config(nvstorage_config_t *config);
