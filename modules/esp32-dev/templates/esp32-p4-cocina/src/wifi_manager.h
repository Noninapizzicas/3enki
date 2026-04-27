/**
 * WiFi Manager
 */

#pragma once

#include "nvstorage.h"
#include <stdbool.h>

void wifi_manager_init();
bool wifi_manager_connect(const nvstorage_config_t *config);
bool wifi_manager_is_connected();
void wifi_manager_disconnect();
void wifi_manager_scan_networks(char **networks_out, int *count_out, int max_networks);
