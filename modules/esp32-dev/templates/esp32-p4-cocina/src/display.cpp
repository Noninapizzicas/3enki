/**
 * Display Implementation — LVGL + esp_lcd
 * Nota: Requires esp_lcd driver para tu display
 */

#include "display.h"
#include "esp_log.h"
#include "lvgl.h"
#include <string.h>

static const char *TAG = "display";

// LVGL objects
static lv_obj_t *scr_main = NULL;
static lv_obj_t *label_title = NULL;
static lv_obj_t *label_message = NULL;
static lv_obj_t *label_status = NULL;

void display_init() {
  ESP_LOGI(TAG, "Initializing display and LVGL");

  // Inicializar esp_lcd driver (específico a tu hardware)
  // Ejemplo: esp_lcd_panel_handle_t panel_handle;
  // esp_lcd_new_panel_dpi(...);

  // Inicializar LVGL
  lv_init();

  // Crear pantalla principal
  scr_main = lv_scr_act();
  lv_obj_set_style_bg_color(scr_main, lv_color_hex(0x0f172a), 0);

  // Crear labels
  label_title = lv_label_create(scr_main);
  lv_obj_set_width(label_title, 800);
  lv_obj_set_y(label_title, 50);
  lv_label_set_text(label_title, "Iniciando...");
  lv_obj_set_style_text_font(label_title, &lv_font_montserrat_32, 0);
  lv_obj_set_style_text_color(label_title, lv_color_hex(0xf8fafc), 0);
  lv_obj_set_style_text_align(label_title, LV_TEXT_ALIGN_CENTER, 0);

  label_message = lv_label_create(scr_main);
  lv_obj_set_width(label_message, 800);
  lv_obj_set_y(label_message, 150);
  lv_label_set_text(label_message, "");
  lv_obj_set_style_text_font(label_message, &lv_font_montserrat_20, 0);
  lv_obj_set_style_text_color(label_message, lv_color_hex(0x94a3b8), 0);
  lv_obj_set_style_text_align(label_message, LV_TEXT_ALIGN_CENTER, 0);

  label_status = lv_label_create(scr_main);
  lv_obj_set_y(label_status, 1250 - 40);
  lv_label_set_text(label_status, "Status");
  lv_obj_set_style_text_font(label_status, &lv_font_montserrat_14, 0);
  lv_obj_set_style_text_color(label_status, lv_color_hex(0x94a3b8), 0);

  lv_refr_now(NULL);
  ESP_LOGI(TAG, "Display initialized");
}

void display_init_config_mode() {
  ESP_LOGI(TAG, "Initializing CONFIG mode UI");
  lv_obj_clean(scr_main);
  // TODO: Crear UI de CONFIG (teclado virtual, lista redes, etc)
}

void display_init_trabajo_mode() {
  ESP_LOGI(TAG, "Initializing TRABAJO mode UI");
  lv_obj_clean(scr_main);
  // Se reemplazará por WebView
}

void display_show_splash(const char *title, const char *subtitle) {
  if (!title) return;

  lv_obj_clean(scr_main);

  // Título
  lv_obj_t *lbl_title = lv_label_create(scr_main);
  lv_obj_set_width(lbl_title, 800);
  lv_obj_set_y(lbl_title, 400);
  lv_label_set_text(lbl_title, title);
  lv_obj_set_style_text_font(lbl_title, &lv_font_montserrat_48, 0);
  lv_obj_set_style_text_color(lbl_title, lv_color_hex(0xf8fafc), 0);
  lv_obj_set_style_text_align(lbl_title, LV_TEXT_ALIGN_CENTER, 0);

  // Subtítulo
  if (subtitle && strlen(subtitle) > 0) {
    lv_obj_t *lbl_sub = lv_label_create(scr_main);
    lv_obj_set_width(lbl_sub, 800);
    lv_obj_set_y(lbl_sub, 500);
    lv_label_set_text(lbl_sub, subtitle);
    lv_obj_set_style_text_font(lbl_sub, &lv_font_montserrat_24, 0);
    lv_obj_set_style_text_color(lbl_sub, lv_color_hex(0x94a3b8), 0);
    lv_obj_set_style_text_align(lbl_sub, LV_TEXT_ALIGN_CENTER, 0);
  }

  lv_refr_now(NULL);
}

void display_show_message(const char *title, const char *message, uint32_t duration_ms) {
  if (!title || !message) return;

  lv_label_set_text(label_title, title);
  lv_label_set_text(label_message, message);
  lv_refr_now(NULL);

  if (duration_ms > 0) {
    vTaskDelay(duration_ms / portTICK_PERIOD_MS);
  }
}

void display_show_error(const char *title, const char *message) {
  display_show_message(title, message, 0);
  lv_obj_set_style_text_color(label_title, lv_color_hex(0xf87171), 0);
}

void display_update_status(const char *label, const char *status) {
  char buf[128];
  if (label && status) {
    snprintf(buf, sizeof(buf), "%s: %s", label, status);
    lv_label_set_text(label_status, buf);
    lv_refr_now(NULL);
  }
}

void display_show_ip(const char *ip_str) {
  if (ip_str) {
    display_update_status("IP", ip_str);
  }
}

void display_clear() {
  lv_obj_clean(scr_main);
  lv_refr_now(NULL);
}

void display_config_show_networks(const char **networks, int count) {
  ESP_LOGI(TAG, "Showing %d networks", count);
  // TODO: Mostrar lista de redes WiFi para seleccionar
}

void display_config_show_keyboard() {
  ESP_LOGI(TAG, "Showing virtual keyboard");
  // TODO: Teclado virtual para ingresar password
}

void display_config_input_text(const char *label, char *buffer, int max_len) {
  ESP_LOGI(TAG, "Input text: %s", label);
  // TODO: Mostrar input field + keyboard
}

void display_config_show_summary(const char *ssid, const char *broker, const char *url) {
  char buf[512];
  snprintf(buf, sizeof(buf), "WiFi: %s\nMQTT: %s\nURL: %s", ssid, broker, url);
  display_show_message("Resumen", buf, 0);
}

void display_trabajo_show_status_bar() {
  ESP_LOGI(TAG, "Showing status bar");
  // TODO: Barra de estado con WiFi + MQTT + IP
}

void display_trabajo_update_wifi(bool connected) {
  const char *status = connected ? "WiFi ✓" : "WiFi ✗";
  ESP_LOGI(TAG, "WiFi status: %s", status);
  display_update_status("WiFi", status);
}

void display_trabajo_update_mqtt(bool connected) {
  const char *status = connected ? "MQTT ✓" : "MQTT ✗";
  ESP_LOGI(TAG, "MQTT status: %s", status);
  display_update_status("MQTT", status);
}
