/**
 * @file config.h
 * @brief Cocina P4 — configuración de compilación (hardware real + red).
 *
 * PLACA: GUITION JC8012P4A1C (a.k.a. JC8012P4A1) — SKU 10153001,
 *        "P4-10.1 inch Capacitive touch", 800x1280.
 *        ESP32-P4 + ESP32-C6 por SDIO, 10.1" JD9365 por MIPI-DSI (2 lanes),
 *        tactil capacitivo por I2C (GT911 en esta app), PSRAM, backlight LEDC.
 *
 * IMPORTANTE — el panel de 10.1" NO es RGB: es un JD9365 por MIPI-DSI
 * (2 lanes, 1500 Mbps/lane). Por eso aquí no hay defines de pines RGB
 * (PCLK/DE/HSYNC/VSYNC/DATA0..15): el panel se inicializa por DSI, no por
 * GPIO. Ver README.md ("Diferencias con la Waveshare").
 *
 * PINES: no se inventa ninguno. Los valores de abajo salen de la config
 * ESPHome pública de esta misma placa (jtenniswood/esphome-lvgl,
 * guition-esp32-p4-jc8012p4a1/device/device.yaml); cada define cita la
 * línea de la que viene. Ver el bloque 1.
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
 * 1. Pantalla / tactil — GUITION JC8012P4A1C (10.1", 800x1280)
 * ---------------------------------------------------------------------
 * Panel:  JD9365 (JD9365DA-H3) por MIPI-DSI, 2 lanes.
 * Tactil:  GT911 por I2C.
 * Backlight: LEDC.
 *
 * FUENTE DE LOS PINES (unica, no inventada): config ESPHome publica de la
 * propia placa, fichero device/device.yaml:
 *   https://raw.githubusercontent.com/jtenniswood/esphome-lvgl/main/
 *     guition-esp32-p4-jc8012p4a1/device/device.yaml
 * De ahi salen literalmente:
 *   display:    model JC8012P4A1, reset_pin GPIO27
 *   touchscreen: reset_pin GPIO22, interrupt_pin GPIO21,
 *                transform: swap_xy false, mirror_x false, mirror_y true
 *   i2c:        sda GPIO7, scl GPIO8, 400 kHz,
 *               sda_pullup_enabled False / scl_pullup_enabled False
 *   light/output ledc: pin GPIO23   (retroiluminacion)
 *   esp_ldo:    channel 3, 2.5 V    (alimenta el PHY MIPI-DSI)
 *
 * AVISO sobre el driver tactil: esa config usa el componente externo
 * `gsl3680` (github://kvj/esphome@jd9365_gsl3680) sobre el mismo bus I2C
 * 7/8. Es decir, el pinout esta confirmado pero el CONTROLADOR tactil de
 * esa revision es GSL3680, no GT911. En esta placa montamos GT911 (lo que
 * dice la etiqueta del SKU 10153001 y lo que hay en el Component Registry
 * de Espressif); si el tactil no responde, el primer sospechoso es esto y
 * se comprueba con un scan I2C (GT911 = 0x5D/0x14, GSL3680 = 0x40).
 * Ver README.md, "Tactil: GT911 o GSL3680".
 *
 * NO hay defines de pines RGB (PCLK/DE/HSYNC/VSYNC/DATA0..15): el panel no
 * es RGB, es DSI. El video sale por el PHY MIPI, no por GPIO.
 * ===================================================================== */

/* Geometria y formato. El timing (porches, reloj DPI) lo pone el macro
 * JD9365_800_1280_PANEL_60HZ_DPI_CONFIG() del componente esp_lcd_jd9365,
 * que es exactamente 800x1280. */
#define COCINA_LCD_H_RES            800
#define COCINA_LCD_V_RES            1280
#define COCINA_LCD_MIPI_LANES       2      /* device.yaml: panel de 2 lanes */
#define COCINA_LCD_MIPI_MBPS        1500   /* JD9365_PANEL_BUS_DSI_2CH_CONFIG() */
#define COCINA_LCD_BPP              16     /* RGB565 */
#define COCINA_LCD_DSI_BUS_ID       0

/* PHY MIPI-DSI: LDO interno del P4 (device.yaml: esp_ldo channel 3, 2.5 V).
 * Sin esto el panel no enciende aunque el resto este bien. */
#define COCINA_LDO_CHAN            3
#define COCINA_LDO_MV              2500

/* Reset del panel (device.yaml: display reset_pin GPIO27). */
#define COCINA_LCD_RST_GPIO        27

/* Retroiluminacion (device.yaml: output ledc pin GPIO23). */
#define COCINA_LCD_BL_GPIO         23
#define COCINA_BL_DUTY_PCT         100    /* brillo inicial 0-100 */
#define COCINA_BL_LEDC_FREQ_HZ     5000
#define COCINA_BL_LEDC_RES_BITS    10     /* 0..1023 */
#define COCINA_BL_LEDC_TIMER       1
#define COCINA_BL_LEDC_CHANNEL     1

/* I2C del tactil (device.yaml: sda GPIO7, scl GPIO8, 400 kHz, sin pullups
 * internos -> la placa los trae externos). */
#define COCINA_I2C_PORT            0
#define COCINA_I2C_SDA_GPIO        7
#define COCINA_I2C_SCL_GPIO        8
#define COCINA_I2C_FREQ_HZ         400000

/* Tactil GT911 (device.yaml: reset GPIO22, interrupt GPIO21). */
#define COCINA_TOUCH_RST_GPIO      22
#define COCINA_TOUCH_INT_GPIO      21
#define COCINA_TOUCH_I2C_ADDR      0x5D   /* GT911 con INT a nivel bajo al arrancar */
#define COCINA_TOUCH_SWAP_XY       false  /* device.yaml: swap_xy false */
#define COCINA_TOUCH_MIRROR_X      false  /* device.yaml: mirror_x false */
#define COCINA_TOUCH_MIRROR_Y      true   /* device.yaml: mirror_y true */

/* Buffer de dibujo LVGL: 100 lineas x 2 buffers en PSRAM (800*100*2 B =
 * 160 KB cada uno). Refresco parcial: la UI son tarjetas pequenas. */
#define COCINA_LVGL_BUF_LINES      100

/* =====================================================================
 * 2. WiFi 6 / BLE por coprocesador ESP32-C6 (esp_hosted)
 * ---------------------------------------------------------------------
 * El transporte es SDIO y lo configura el componente esp_hosted en su
 * propio Kconfig, así que la app no toca esos GPIO. Los pines del enlace
 * P4 <-> C6 en esta placa (mismos que declara device.yaml en el bloque
 * `esp32_hosted`) son, solo como referencia/documentación:
 *
 *   reset GPIO54 · cmd GPIO19 · clk GPIO18 · d0 GPIO14 · d1 GPIO15
 *   d2 GPIO16 · d3 GPIO17
 *
 * Coinciden con el slot SDIO por defecto del ESP32-P4, por eso no hace
 * falta reconfigurarlos. Si tu revisión de placa los cambia, se ajustan en
 * menuconfig -> "Component config -> ESP-Hosted".
 * ===================================================================== */

/* =====================================================================
 * 3. Red: valores por defecto (menuconfig manda si está relleno)
 * ===================================================================== */
/* OJO con la dirección del bus: la puerta de la web (deployment/puerta.sh)
 * cierra /mqtt con contraseña, y este chip no sabe mandar cabecera de
 * autenticación. Por eso el panel entra con SU llave en la propia dirección:
 *     wss://<dominio>/mqtt?k=<llave del panel>
 * La llave la emite puerta.sh en el servidor y se graba dentro del firmware
 * (menuconfig -> "Cocina P4" -> URI del broker). Sin ?k=<llave>, /mqtt da 401. */
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
