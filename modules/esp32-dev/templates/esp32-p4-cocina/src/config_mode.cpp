/**
 * CONFIG Mode Implementation
 */

#include "config_mode.h"
#include "display.h"
#include "wifi_manager.h"
#include "esp_log.h"
#include <string.h>
#include <stdio.h>

static const char *TAG = "config_mode";

static nvstorage_config_t config_buffer = {0};

static void get_text_input(const char *label, char *buffer, int max_len) {
  memset(buffer, 0, max_len);
  display_config_input_text(label, buffer, max_len);
}

void config_mode_run() {
  ESP_LOGI(TAG, "Starting CONFIG mode");

  // Leer configuración actual (si existe)
  if (!nvstorage_load_config(&config_buffer)) {
    nvstorage_get_default_config(&config_buffer);
  }

  display_init_config_mode();
  display_show_message("CONFIG MODE", "Presione OK para continuar", 2000);

  // ========== PASO 1: WiFi Networks ==========
  ESP_LOGI(TAG, "Step 1: WiFi Networks");
  display_show_message("Redes WiFi Guardadas", "Scanneando...", 1000);

  // Mostrar redes guardadas
  if (config_buffer.network_count > 0) {
    char networks_str[256] = {0};
    for (int i = 0; i < config_buffer.network_count; i++) {
      strncat(networks_str, config_buffer.networks[i].ssid, sizeof(networks_str) - strlen(networks_str) - 1);
      if (i < config_buffer.network_count - 1) {
        strncat(networks_str, "\n", sizeof(networks_str) - strlen(networks_str) - 1);
      }
    }
    display_show_message("Redes Guardadas", networks_str, 3000);
  }

  // Opción: Agregar nueva red
  display_show_message("¿Agregar nueva red?", "Presione OK para escanear", 2000);

  // TODO: Implementar UI táctil para seleccionar

  // Simulación: SSID
  display_config_input_text("Ingrese SSID", config_buffer.networks[config_buffer.network_count].ssid, MAX_SSID_LEN);
  // TODO: Este debería ser interactivo con teclado virtual

  // Simulación: Password
  display_config_input_text("Ingrese Password", config_buffer.networks[config_buffer.network_count].password, MAX_PASSWORD_LEN);

  // Guardar red
  config_buffer.networks[config_buffer.network_count].priority = config_buffer.network_count + 1;
  config_buffer.network_count++;
  if (config_buffer.network_count > MAX_NETWORKS) {
    config_buffer.network_count = MAX_NETWORKS;
  }

  display_show_message("Red guardada", config_buffer.networks[0].ssid, 2000);

  // ========== PASO 2: MQTT Configuration ==========
  ESP_LOGI(TAG, "Step 2: MQTT Configuration");
  display_show_message("Configuración MQTT", "Ingrese broker IP:puerto", 2000);

  char mqtt_broker[MAX_IP_LEN] = {0};
  strcpy(mqtt_broker, config_buffer.mqtt_broker);
  display_config_input_text("MQTT Broker", mqtt_broker, MAX_IP_LEN);
  strcpy(config_buffer.mqtt_broker, mqtt_broker);

  char mqtt_port_str[16] = {0};
  snprintf(mqtt_port_str, sizeof(mqtt_port_str), "%u", config_buffer.mqtt_port);
  display_config_input_text("MQTT Port", mqtt_port_str, 16);
  config_buffer.mqtt_port = atoi(mqtt_port_str);

  // ========== PASO 3: Server URL ==========
  ESP_LOGI(TAG, "Step 3: Server URL");
  display_show_message("Configuración del Servidor", "Ingrese URL", 2000);

  char server_url[MAX_URL_LEN] = {0};
  strcpy(server_url, config_buffer.server_url);
  display_config_input_text("Server URL", server_url, MAX_URL_LEN);
  strcpy(config_buffer.server_url, server_url);

  // ========== PASO 4: Project ID ==========
  ESP_LOGI(TAG, "Step 4: Project ID");
  char project_id[64] = {0};
  strcpy(project_id, config_buffer.project_id);
  display_config_input_text("Project ID", project_id, 64);
  strcpy(config_buffer.project_id, project_id);

  // ========== PASO 5: Device Name (Opcional) ==========
  ESP_LOGI(TAG, "Step 5: Device Name");
  char device_name[64] = {0};
  strcpy(device_name, config_buffer.device_name);
  display_config_input_text("Device Name (ej: Cocina-1)", device_name, 64);
  strcpy(config_buffer.device_name, device_name);

  // ========== PASO 6: Brightness (Opcional) ==========
  ESP_LOGI(TAG, "Step 6: Brightness");
  char brightness_str[4] = {0};
  snprintf(brightness_str, sizeof(brightness_str), "%u", config_buffer.brightness);
  display_config_input_text("Brightness (0-100)", brightness_str, 4);
  config_buffer.brightness = atoi(brightness_str);
  if (config_buffer.brightness > 100) config_buffer.brightness = 100;

  // ========== PASO 7: Resumen y Guardar ==========
  ESP_LOGI(TAG, "Step 7: Summary");
  display_config_show_summary(
    config_buffer.networks[0].ssid,
    config_buffer.mqtt_broker,
    config_buffer.server_url
  );

  display_show_message("¿Guardar configuración?", "Presione OK para guardar", 2000);

  // Guardar en NVS
  if (nvstorage_save_config(&config_buffer)) {
    display_show_message("✓ Guardado", "Configuración guardada exitosamente", 2000);
  } else {
    display_show_error("✗ Error", "Fallo al guardar configuración");
  }

  // ========== FINAL: Esperar TRABAJO mode ==========
  display_show_message("Configuración completa", "Presione botón TRABAJO para continuar", 0);

  ESP_LOGI(TAG, "CONFIG mode complete");
}
