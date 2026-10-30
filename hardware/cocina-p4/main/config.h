/**
 * @file config.h
 * @brief Cocina P4 — configuración de compilación (hardware real + red).
 *
 * PLACA: Waveshare ESP32-P4-WIFI6-Touch-LCD-10.1
 *        (familia ESP32-P4-WIFI6-Touch-LCD-X), 800x1280, 32 MB PSRAM,
 *        tactil capacitivo GT911 por I2C, WiFi 6/BLE por ESP32-C6 (esp_hosted).
 *
 * IMPORTANTE — el panel de 10.1" NO es RGB: es un JD9365 por MIPI-DSI
 * (2 lanes, 1500 Mbps/lane). Por eso aquí no hay defines de pines RGB
 * (PCLK/DE/HSYNC/VSYNC/DATA0..15): el panel se inicializa por DSI desde el
 * BSP oficial, no por GPIO. Ver README.md ("Correcciones respecto al brief").
 *
 * PINES: no se inventa ninguno. Los valores de abajo salen del BSP oficial
 * `waveshare/esp32_p4_wifi6_touch_lcd_x` v2.0.3, fichero
 *   include/bsp/esp32_p4_wifi6_touch_lcd_x.h
 * (https://components.espressif.com/components/waveshare/esp32_p4_wifi6_touch_lcd_x)
 * main.c comprueba por _Static_assert que estos valores siguen coincidiendo
 * con los del BSP: si el BSP cambia, salta en compilación, no en la cocina.
 *
 * Los valores de red (WiFi/MQTT/estación) se pueden fijar de dos formas:
 *   1. menuconfig -> "Cocina P4"  (recomendado, no recompila código)
 *   2. Editando los fallback COCINA_FALLBACK_* de este fichero
 * Las funciones cocina_cfg_*() resuelven "Kconfig si está relleno, si no fallback".
 */

#pragma once

#include <stdbool.h>
#include <string.h>

#include "sdkconfig.h"

/* =====================================================================
 * 1. Pantalla / tactil (pines reales del BSP Waveshare v2.0.3)
 * ===================================================================== */

/* Geometría y formato (include/bsp/display.h:
 *   BSP_LCD_H_RES / BSP_LCD_V_RES / BSP_LCD_MIPI_DSI_LANE_NUM) */
#define COCINA_LCD_H_RES            800
#define COCINA_LCD_V_RES            1280
#define COCINA_LCD_MIPI_LANES       2
#define COCINA_LCD_MIPI_MBPS        1500

/* I2C del tactil: BSP_I2C_SDA / BSP_I2C_SCL (GPIO 7 y 8 en el header del BSP).
 * El bus lo inicializa el BSP (bsp_i2c_init() desde bsp_display_start_*). */
#define COCINA_I2C_SDA_GPIO         7
#define COCINA_I2C_SCL_GPIO         8
#define COCINA_TOUCH_I2C_ADDR       0x5D   /* GT911; el BSP además prueba 0x14 */
#define COCINA_TOUCH_SWAP_XY        false  /* vertical, como el ejemplo 08_lvgl_demo_v9 */
#define COCINA_TOUCH_MIRROR_X       false
#define COCINA_TOUCH_MIRROR_Y       false

/* Retroiluminación y reset del panel (BSP_LCD_BACKLIGHT / BSP_LCD_RST).
 * El PWM de brillo lo gobierna el BSP: bsp_display_brightness_set(%). */
#define COCINA_LCD_BL_GPIO          26
#define COCINA_LCD_RST_GPIO         27
#define COCINA_TOUCH_RST_GPIO       (-1)   /* BSP_LCD_TOUCH_RST = GPIO_NUM_NC */
#define COCINA_TOUCH_INT_GPIO       (-1)   /* BSP_LCD_TOUCH_INT = GPIO_NUM_NC */

#define COCINA_BL_DUTY_PCT          100    /* brillo inicial 0-100 */

/* =====================================================================
 * 2. WiFi 6 / BLE por coprocesador ESP32-C6 (esp_hosted)
 * ---------------------------------------------------------------------
 * El transporte es SDIO y lo configura el componente esp_hosted en su
 * propio Kconfig. En esta placa los pines SDIO del C6 son los del slot 1
 * del ESP32-P4 y vienen fijados por el propio esp_hosted (no hay define
 * de usuario en la app). Si tu revisión de placa los cambia, se ajustan en
 * menuconfig -> "Component config -> ESP-Hosted".
 * ===================================================================== */

/* =====================================================================
 * 3. Red: valores por defecto (menuconfig manda si está relleno)
 * ===================================================================== */
#define COCINA_FALLBACK_WIFI_SSID      ""
#define COCINA_FALLBACK_WIFI_PASS      ""
#define COCINA_FALLBACK_MQTT_URI       "wss://enki-ai.online/mqtt"
#define COCINA_FALLBACK_MQTT_USER      ""
#define COCINA_FALLBACK_MQTT_PASS      ""
#define COCINA_FALLBACK_DEVICE_ID      ""            /* vacío => "cocina-p4-<mac>" */
#define COCINA_FALLBACK_NOMBRE         "Cocina"
#define COCINA_FALLBACK_ESTACION       "cocina"
#define COCINA_FALLBACK_TIPO_ESTACION  "cocina"
#define COCINA_FALLBACK_TZ             "CET-1CEST,M3.5.0,M10.5.0/3"  /* España */
#define COCINA_FALLBACK_NTP            "pool.ntp.org"

/* Topics del contrato MQTT de Enki (modulo cocina) */
#define COCINA_FALLBACK_TOPIC_SUB      "core/+/events/periferico/display"
#define COCINA_FALLBACK_TOPIC_REGISTER "core/core-a/events/cocina/register-device-request"
#define COCINA_FALLBACK_TOPIC_PREPARE  "core/core-a/events/cocina/prepare-item-request"

/* =====================================================================
 * 4. Accesores: Kconfig -> fallback
 * ---------------------------------------------------------------------
 * Son 'static inline' para no arrastrar un .c extra; el compilador los
 * inlinea y no generan simbolos duplicados entre unidades de compilación.
 * ===================================================================== */

static inline const char *cocina_pick(const char *cfg_value, const char *fallback)
{
    return (cfg_value != NULL && cfg_value[0] != '\0') ? cfg_value : fallback;
}

#ifdef CONFIG_COCINA_WIFI_SSID
static inline const char *cocina_cfg_wifi_ssid(void) { return cocina_pick(CONFIG_COCINA_WIFI_SSID, COCINA_FALLBACK_WIFI_SSID); }
static inline const char *cocina_cfg_wifi_pass(void) { return cocina_pick(CONFIG_COCINA_WIFI_PASSWORD, COCINA_FALLBACK_WIFI_PASS); }
static inline const char *cocina_cfg_mqtt_uri(void)  { return cocina_pick(CONFIG_COCINA_MQTT_URI, COCINA_FALLBACK_MQTT_URI); }
static inline const char *cocina_cfg_mqtt_user(void) { return cocina_pick(CONFIG_COCINA_MQTT_USERNAME, COCINA_FALLBACK_MQTT_USER); }
static inline const char *cocina_cfg_mqtt_pass(void) { return cocina_pick(CONFIG_COCINA_MQTT_PASSWORD, COCINA_FALLBACK_MQTT_PASS); }
static inline const char *cocina_cfg_device_id(void) { return cocina_pick(CONFIG_COCINA_DEVICE_ID, COCINA_FALLBACK_DEVICE_ID); }
static inline const char *cocina_cfg_nombre(void)    { return cocina_pick(CONFIG_COCINA_NOMBRE, COCINA_FALLBACK_NOMBRE); }
static inline const char *cocina_cfg_estacion(void)  { return cocina_pick(CONFIG_COCINA_ESTACION, COCINA_FALLBACK_ESTACION); }
static inline const char *cocina_cfg_tipo(void)      { return cocina_pick(CONFIG_COCINA_TIPO_ESTACION, COCINA_FALLBACK_TIPO_ESTACION); }
static inline const char *cocina_cfg_tz(void)        { return cocina_pick(CONFIG_COCINA_TZ, COCINA_FALLBACK_TZ); }
static inline const char *cocina_cfg_ntp(void)       { return cocina_pick(CONFIG_COCINA_NTP_SERVER, COCINA_FALLBACK_NTP); }
static inline const char *cocina_cfg_topic_sub(void)      { return cocina_pick(CONFIG_COCINA_TOPIC_SUB, COCINA_FALLBACK_TOPIC_SUB); }
static inline const char *cocina_cfg_topic_register(void) { return cocina_pick(CONFIG_COCINA_TOPIC_REGISTER, COCINA_FALLBACK_TOPIC_REGISTER); }
static inline const char *cocina_cfg_topic_prepare(void)  { return cocina_pick(CONFIG_COCINA_TOPIC_PREPARE, COCINA_FALLBACK_TOPIC_PREPARE); }
#else
/* Sin Kconfig generado (build incompleto): sólo fallbacks. */
static inline const char *cocina_cfg_wifi_ssid(void) { return COCINA_FALLBACK_WIFI_SSID; }
static inline const char *cocina_cfg_wifi_pass(void) { return COCINA_FALLBACK_WIFI_PASS; }
static inline const char *cocina_cfg_mqtt_uri(void)  { return COCINA_FALLBACK_MQTT_URI; }
static inline const char *cocina_cfg_mqtt_user(void) { return COCINA_FALLBACK_MQTT_USER; }
static inline const char *cocina_cfg_mqtt_pass(void) { return COCINA_FALLBACK_MQTT_PASS; }
static inline const char *cocina_cfg_device_id(void) { return COCINA_FALLBACK_DEVICE_ID; }
static inline const char *cocina_cfg_nombre(void)    { return COCINA_FALLBACK_NOMBRE; }
static inline const char *cocina_cfg_estacion(void)  { return COCINA_FALLBACK_ESTACION; }
static inline const char *cocina_cfg_tipo(void)      { return COCINA_FALLBACK_TIPO_ESTACION; }
static inline const char *cocina_cfg_tz(void)        { return COCINA_FALLBACK_TZ; }
static inline const char *cocina_cfg_ntp(void)       { return COCINA_FALLBACK_NTP; }
static inline const char *cocina_cfg_topic_sub(void)      { return COCINA_FALLBACK_TOPIC_SUB; }
static inline const char *cocina_cfg_topic_register(void) { return COCINA_FALLBACK_TOPIC_REGISTER; }
static inline const char *cocina_cfg_topic_prepare(void)  { return COCINA_FALLBACK_TOPIC_PREPARE; }
#endif

/* Identidad del emisor en el envelope MQTT */
#define COCINA_SOURCE_CORE_ID    "external"
#define COCINA_SOURCE_MODULE_ID  "cocina-p4"
