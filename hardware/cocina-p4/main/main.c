/**
 * @file main.c
 * @brief Cocina P4 — arranque de la pantalla de cocina (Waveshare ESP32-P4-WIFI6-Touch-LCD-10.1).
 *
 * HARDWARE: ESP32-P4 + 10.1" 800x1280 JD9365 por MIPI-DSI (2 lanes) + tactil
 * GT911 por I2C + 32 MB PSRAM + ESP32-C6 (WiFi 6/BLE) por SDIO con esp_hosted.
 *
 * Display, tactil, LVGL y brillo los pone el BSP OFICIAL:
 *   waveshare/esp32_p4_wifi6_touch_lcd_x v2.0.3
 *   (include/bsp/esp32_p4_wifi6_touch_lcd_x.h, bsp_display_start_with_config())
 * Aqui no se inicializa ningun panel a mano ni se cablea ningun GPIO de video.
 *
 * Orden de arranque:
 *   1. NVS + zona horaria + task watchdog
 *   2. BSP display (DSI + GT911 + LVGL) y UI  -> la pantalla NUNCA se queda negra
 *   3. WiFi (backoff infinito) + SNTP
 *   4. MQTT Enki (register-device automatico al conectar)
 *   5. Task de UI: reloj, iconos de enlace, banner de estado
 *
 * La UI se construye ANTES de conectar la red: sin WiFi la pantalla sigue
 * mostrando "Sin pedidos", la hora y un banner explicando el problema.
 */

#include <stdio.h>
#include <string.h>
#include <time.h>
#include <sys/time.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"

#include "esp_check.h"
#include "esp_err.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_netif_sntp.h"
#include "esp_system.h"
#include "esp_task_wdt.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "nvs_flash.h"

#include "lvgl.h"
#include "bsp/esp-bsp.h"
#include "bsp/display.h"

#include "config.h"
#include "mqtt_enki.h"
#include "ui.h"

static const char *TAG = "cocina-p4";

/* Reintento WiFi: 1,2,4,8,16,32 s y luego 32 s indefinidamente */
#define WIFI_MAX_BACKOFF_S  32

/* ------------------------------------------------------------------ */
/* Blindaje del pinout: si el BSP cambia los pines, salta AQUI           */
/* ------------------------------------------------------------------ */
_Static_assert(BSP_I2C_SDA == COCINA_I2C_SDA_GPIO, "BSP_I2C_SDA ya no coincide con config.h");
_Static_assert(BSP_I2C_SCL == COCINA_I2C_SCL_GPIO, "BSP_I2C_SCL ya no coincide con config.h");
_Static_assert(BSP_LCD_BACKLIGHT == COCINA_LCD_BL_GPIO, "BSP_LCD_BACKLIGHT ya no coincide con config.h");
_Static_assert(BSP_LCD_RST == COCINA_LCD_RST_GPIO, "BSP_LCD_RST ya no coincide con config.h");
_Static_assert(BSP_LCD_H_RES == COCINA_LCD_H_RES, "resolucion horizontal distinta de la esperada");
_Static_assert(BSP_LCD_V_RES == COCINA_LCD_V_RES, "resolucion vertical distinta de la esperada");

static lv_display_t *s_disp;

static EventGroupHandle_t s_wifi_eg;
#define WIFI_EV_CONNECTED    BIT0

static volatile bool s_wifi_up;
static int  s_wifi_retry;
static esp_timer_handle_t s_wifi_retry_timer;
static bool s_sntp_started;

/* ------------------------------------------------------------------ */
/* Task watchdog                                                      */
/* ------------------------------------------------------------------ */
static void twdt_setup(void)
{
    const esp_task_wdt_config_t cfg = {
        .timeout_ms     = 15000,
        .idle_core_mask = 0,
        .trigger_panic  = true,
    };
    /* Si el TWDT ya estaba inicializado (CONFIG_ESP_TASK_WDT_INIT) se
     * reconfigura; si no, se inicializa. Asi vale en IDF 5.3 y 5.5. */
    esp_err_t err = esp_task_wdt_reconfigure(&cfg);
    if (err == ESP_ERR_INVALID_STATE) {
        err = esp_task_wdt_init(&cfg);
    }
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "task watchdog no disponible: %s", esp_err_to_name(err));
    }
}

/* ------------------------------------------------------------------ */
/* Pantalla + LVGL + UI (todo via BSP oficial)                        */
/* ------------------------------------------------------------------ */
static esp_err_t display_and_ui_init(void)
{
    bsp_display_cfg_t cfg = {
        .lv_adapter_cfg = ESP_LV_ADAPTER_DEFAULT_CONFIG(),
        .rotation       = ESP_LV_ADAPTER_ROTATE_0,          /* 800x1280 vertical */
        .tear_avoid_mode = ESP_LV_ADAPTER_TEAR_AVOID_MODE_TRIPLE_PARTIAL,
        .touch_flags = {
            .swap_xy  = COCINA_TOUCH_SWAP_XY,
            .mirror_x = COCINA_TOUCH_MIRROR_X,
            .mirror_y = COCINA_TOUCH_MIRROR_Y,
        },
    };

    s_disp = bsp_display_start_with_config(&cfg);
    if (s_disp == NULL) {
        ESP_LOGE(TAG, "bsp_display_start_with_config fallo");
        return ESP_FAIL;
    }

    /* El BSP ya ha hecho reset + init del JD9365 por DSI y ha registrado el
     * tactil GT911; solo falta subir la retroiluminacion. */
    const esp_err_t bl = bsp_display_brightness_set(COCINA_BL_DUTY_PCT);
    if (bl != ESP_OK) {
        ESP_LOGW(TAG, "brightness_set: %s", esp_err_to_name(bl));
    }
    bsp_display_backlight_on();

    ESP_LOGI(TAG, "display %dx%d listo (MIPI-DSI %d lanes, %d Mbps)",
             COCINA_LCD_H_RES, COCINA_LCD_V_RES, COCINA_LCD_MIPI_LANES, COCINA_LCD_MIPI_MBPS);

    ui_init();
    ui_set_station(cocina_cfg_nombre());
    return ESP_OK;
}

/* ------------------------------------------------------------------ */
/* SNTP                                                               */
/* ------------------------------------------------------------------ */
static void sntp_start(void)
{
    if (s_sntp_started) return;

    esp_sntp_config_t cfg = ESP_NETIF_SNTP_DEFAULT_CONFIG(cocina_cfg_ntp());
    if (esp_netif_sntp_init(&cfg) == ESP_OK) {
        s_sntp_started = true;
        ESP_LOGI(TAG, "SNTP iniciado con %s", cocina_cfg_ntp());
    } else {
        ESP_LOGW(TAG, "no se pudo iniciar SNTP");
    }
}

/* ------------------------------------------------------------------ */
/* WiFi                                                               */
/* ------------------------------------------------------------------ */
static void wifi_retry_cb(void *arg)
{
    (void)arg;
    ESP_LOGI(TAG, "reintentando WiFi (intento %d)", s_wifi_retry);
    esp_wifi_connect();
}

static void schedule_wifi_retry(void)
{
    int delay_s = 1 << (s_wifi_retry > 5 ? 5 : s_wifi_retry);
    if (delay_s > WIFI_MAX_BACKOFF_S) delay_s = WIFI_MAX_BACKOFF_S;
    if (s_wifi_retry < 6) s_wifi_retry++;
    ESP_LOGW(TAG, "WiFi caido: reintento en %d s", delay_s);
    esp_timer_stop(s_wifi_retry_timer);
    esp_timer_start_once(s_wifi_retry_timer, (uint64_t)delay_s * 1000ULL * 1000ULL);
}

static void wifi_event_handler(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    (void)arg;

    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();

    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        s_wifi_up = false;
        ui_set_wifi(false, -127);
        ui_set_mqtt(false);
        schedule_wifi_retry();

    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        const ip_event_got_ip_t *ev = (const ip_event_got_ip_t *)data;
        ESP_LOGI(TAG, "IP obtenida: " IPSTR, IP2STR(&ev->ip_info.ip));
        s_wifi_up = true;
        s_wifi_retry = 0;
        xEventGroupSetBits(s_wifi_eg, WIFI_EV_CONNECTED);
        ui_set_wifi(true, 0);
        sntp_start();
        mqtt_enki_start();
    }
}

static void wifi_start(void)
{
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    const esp_timer_create_args_t targs = {
        .callback = wifi_retry_cb,
        .name     = "wifi_retry",
    };
    ESP_ERROR_CHECK(esp_timer_create(&targs, &s_wifi_retry_timer));

    s_wifi_eg = xEventGroupCreate();

    wifi_init_config_t init_cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init_cfg));

    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                                                       wifi_event_handler, NULL, NULL));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP,
                                                       wifi_event_handler, NULL, NULL));

    wifi_config_t wc = {0};
    strlcpy((char *)wc.sta.ssid, cocina_cfg_wifi_ssid(), sizeof(wc.sta.ssid));
    strlcpy((char *)wc.sta.password, cocina_cfg_wifi_pass(), sizeof(wc.sta.password));
    wc.sta.threshold.authmode = (wc.sta.password[0] == '\0') ? WIFI_AUTH_OPEN : WIFI_AUTH_WPA2_PSK;
    wc.sta.pmf_cfg.capable = true;
    wc.sta.pmf_cfg.required = false;

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wc));
    ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));   /* menos latencia en cocina */
    ESP_ERROR_CHECK(esp_wifi_start());

    if (cocina_cfg_wifi_ssid()[0] == '\0') {
        ESP_LOGE(TAG, "WiFi sin configurar: menuconfig -> Cocina P4 -> WiFi SSID");
    }
}

/* ------------------------------------------------------------------ */
/* Callback tactil -> prepare-item                                    */
/* ------------------------------------------------------------------ */
static void on_item_done(const char *item_id)
{
    const esp_err_t err = mqtt_enki_prepare_item(item_id);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "prepare-item de %s no enviado: %s", item_id, esp_err_to_name(err));
    }
}

/* ------------------------------------------------------------------ */
/* Task de UI (reloj + estado de enlace + banner)                      */
/* ------------------------------------------------------------------ */
static void ui_task(void *arg)
{
    (void)arg;
    esp_task_wdt_add(NULL);

    char prev_clock[8]   = "";
    char prev_banner[96] = "";
    int64_t last_mqtt_kick = 0;

    for (;;) {
        esp_task_wdt_reset();

        /* Hora local (SNTP); antes de sincronizar se muestra "--:--". */
        const time_t now = time(NULL);
        struct tm tm_now;
        localtime_r(&now, &tm_now);
        char clock[8];
        if (tm_now.tm_year >= 120) {          /* 2020 o posterior => SNTP OK */
            strftime(clock, sizeof(clock), "%H:%M", &tm_now);
        } else {
            strlcpy(clock, "--:--", sizeof(clock));
        }
        if (strcmp(clock, prev_clock) != 0) {
            ui_set_clock(clock);
            strlcpy(prev_clock, clock, sizeof(prev_clock));
        }

        /* Estado del enlace WiFi (icono + RSSI). */
        if (s_wifi_up) {
            wifi_ap_record_t ap;
            const int rssi = (esp_wifi_sta_get_ap_info(&ap) == ESP_OK) ? ap.rssi : 0;
            ui_set_wifi(true, rssi);
        } else {
            ui_set_wifi(false, -127);
        }

        /* Banner: un solo mensaje, el mas grave primero. */
        const char *banner = NULL;
        if (cocina_cfg_wifi_ssid()[0] == '\0') {
            banner = "Configura WiFi en menuconfig > Cocina P4";
        } else if (!s_wifi_up) {
            banner = "Sin WiFi - reintentando...";
        } else if (!mqtt_enki_is_connected()) {
            banner = "Sin conexion con Enki - reintentando...";
        }
        if (strcmp(banner ? banner : "", prev_banner) != 0) {
            ui_set_banner(banner);
            strlcpy(prev_banner, banner ? banner : "", sizeof(prev_banner));
        }

        /* Red de seguridad: si el MQTT sigue caido, empujar reconexion cada 30 s. */
        if (s_wifi_up && !mqtt_enki_is_connected()) {
            const int64_t now_ms = esp_timer_get_time() / 1000;
            if (now_ms - last_mqtt_kick > 30000) {
                last_mqtt_kick = now_ms;
                mqtt_enki_start();
            }
        }

        vTaskDelay(pdMS_TO_TICKS(500));
    }
}

/* ------------------------------------------------------------------ */
/* app_main                                                           */
/* ------------------------------------------------------------------ */
void app_main(void)
{
    ESP_LOGI(TAG, "=== Cocina P4: pantalla de cocina Enki ===");

    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG, "NVS corrupta: se borra y se reinicia la particion");
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);

    setenv("TZ", cocina_cfg_tz(), 1);
    tzset();

    twdt_setup();

    /* Primero la pantalla: la cocina puede quedarse sin red, pero no a oscuras. */
    ESP_ERROR_CHECK(display_and_ui_init());
    ui_set_on_item_done(on_item_done);

    wifi_start();

    if (xTaskCreate(ui_task, "ui_task", 6144, NULL, 4, NULL) != pdPASS) {
        ESP_LOGE(TAG, "no se pudo crear ui_task");
    }

    ESP_LOGI(TAG, "arranque completado");
}
