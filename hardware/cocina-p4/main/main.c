/**
 * @file main.c
 * @brief Cocina P4 — arranque de la pantalla de cocina (GUITION JC8012P4A1C, 10.1").
 *
 * HARDWARE: ESP32-P4 + 10.1" 800x1280 JD9365 por MIPI-DSI (2 lanes) + tactil
 * GT911 por I2C + PSRAM + ESP32-C6 (WiFi 6/BLE) por SDIO con esp_hosted.
 *
 * NO HAY BSP para esta placa: el display, el tactil, el brillo y el puente a
 * LVGL se inicializan AQUI con componentes oficiales de Espressif:
 *   espressif/esp_lcd_jd9365      2.0.2  (esp_lcd_new_panel_jd9365)
 *   espressif/esp_lcd_touch_gt911 1.2.1  (esp_lcd_touch_new_i2c_gt911)
 *   espressif/esp_lvgl_port       2.9.0  (lvgl_port_add_disp_dsi + add_touch)
 *   driver/i2c_master + driver/ledc del propio IDF
 *
 * Orden de arranque:
 *   1. NVS + zona horaria + task watchdog
 *   2. LDO del PHY DSI -> bus MIPI -> panel JD9365 -> GT911 -> LVGL -> brillo
 *      y UI  -> la pantalla NUNCA se queda negra
 *   3. WiFi (backoff infinito) + SNTP
 *   4. MQTT Enki (register-device automatico al conectar)
 *   5. Task de UI: reloj, iconos de enlace, banner de estado
 *
 * La UI se construye ANTES de conectar la red: sin WiFi la pantalla sigue
 * mostrando "Sin pedidos", la hora y un banner explicando el problema.
 *
 * PINES: ver config.h, bloque 1 (fuente: device.yaml de la propia placa).
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
#include "esp_ldo_regulator.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_netif_sntp.h"
#include "esp_system.h"
#include "esp_task_wdt.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "nvs_flash.h"

#include "driver/gpio.h"
#include "driver/i2c_master.h"
#include "driver/ledc.h"

#include "esp_lcd_jd9365.h"
#include "esp_lcd_mipi_dsi.h"
#include "esp_lcd_panel_io.h"
#include "esp_lcd_panel_ops.h"
#include "esp_lcd_touch_gt911.h"
#include "esp_lvgl_port.h"
#include "lvgl.h"

#include "config.h"
#include "mqtt_enki.h"
#include "ui.h"

static const char *TAG = "cocina-p4";

/* Reintento WiFi: 1,2,4,8,16,32 s y luego 32 s indefinidamente */
#define WIFI_MAX_BACKOFF_S  32

/* ------------------------------------------------------------------ */
/* Blindaje del pinout                                                */
/* ------------------------------------------------------------------ */
/* Antes esto eran 6 _Static_assert contra las macros del BSP Waveshare
 * (BSP_I2C_SDA, BSP_LCD_RST...). Ya no hay BSP: los pines son defines
 * nuestros, asi que no hay nada externo contra lo que blindar. Lo que SI
 * se puede blindar en compilacion es la COHERENCIA entre esos defines y los
 * requisitos de los drivers, que es de donde vienen los fallos silenciosos
 * (pantalla en negro, tactil muerto, colores mal). Se mantienen 6 asserts,
 * mismo numero, mismo proposito: que un cambio de pin o de formato salte en
 * compilacion y no en la cocina. */
_Static_assert(COCINA_LCD_MIPI_LANES == 2,
               "JD9365_PANEL_BUS_DSI_2CH_CONFIG() fija 2 lanes; config.h dice otra cosa");
_Static_assert(COCINA_LCD_BPP == 16,
               "la UI y el buffer LVGL son RGB565 (16 bpp): panel_config.bits_per_pixel");
_Static_assert(COCINA_TOUCH_I2C_ADDR == ESP_LCD_TOUCH_IO_I2C_GT911_ADDRESS ||
               COCINA_TOUCH_I2C_ADDR == ESP_LCD_TOUCH_IO_I2C_GT911_ADDRESS_BACKUP,
               "el GT911 solo responde en 0x5D (INT bajo al arrancar) o 0x14 (INT alto)");
_Static_assert(COCINA_I2C_FREQ_HZ > 0 && COCINA_I2C_FREQ_HZ <= 400000,
               "el GT911 va a 400 kHz como maximo (device.yaml: frequency 400kHz)");
_Static_assert(COCINA_BL_LEDC_RES_BITS == LEDC_TIMER_10_BIT &&
               COCINA_BL_DUTY_PCT >= 0 && COCINA_BL_DUTY_PCT <= 100,
               "brillo: duty 0-100% sobre 10 bits de resolucion LEDC");
_Static_assert(COCINA_LVGL_BUF_LINES > 0 && COCINA_LVGL_BUF_LINES <= COCINA_LCD_V_RES,
               "el buffer LVGL no puede ser mayor que la pantalla");
/* Un GPIO repetido entre panel/tactil/brillo es un fallo que no se ve hasta
 * el taller: se comprueba aqui. */
_Static_assert(COCINA_LCD_RST_GPIO != COCINA_LCD_BL_GPIO &&
               COCINA_LCD_RST_GPIO != COCINA_I2C_SDA_GPIO &&
               COCINA_LCD_RST_GPIO != COCINA_I2C_SCL_GPIO &&
               COCINA_LCD_BL_GPIO  != COCINA_I2C_SDA_GPIO &&
               COCINA_LCD_BL_GPIO  != COCINA_I2C_SCL_GPIO &&
               COCINA_TOUCH_RST_GPIO != COCINA_TOUCH_INT_GPIO &&
               COCINA_TOUCH_RST_GPIO != COCINA_LCD_RST_GPIO &&
               COCINA_TOUCH_INT_GPIO != COCINA_LCD_RST_GPIO,
               "pin repetido entre panel, tactil y retroiluminacion");

static lv_display_t *s_disp;

/* Handles del subsistema de pantalla (viven toda la vida del firmware) */
static esp_lcd_panel_handle_t    s_panel;
static esp_lcd_panel_io_handle_t s_panel_io;
static i2c_master_bus_handle_t   s_i2c_bus;
static esp_lcd_panel_io_handle_t s_touch_io;
static esp_lcd_touch_handle_t    s_touch;
static bool                      s_touch_ok;

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
/* Panel JD9365 por MIPI-DSI (2 lanes)                                */
/* ------------------------------------------------------------------ */
static esp_err_t panel_init(void)
{
    /* 1. PHY MIPI-DSI: LDO interno del P4 a 2.5 V. Sin esto el panel no
     *    enciende aunque el resto del init devuelva ESP_OK.
     *    (device.yaml: esp_ldo channel 3, 2.5V, adjustable) */
    esp_ldo_channel_handle_t ldo = NULL;
    const esp_ldo_channel_config_t ldo_cfg = {
        .chan_id    = COCINA_LDO_CHAN,
        .voltage_mv = COCINA_LDO_MV,
    };
    ESP_RETURN_ON_ERROR(esp_ldo_acquire_channel(&ldo_cfg, &ldo), TAG,
                        "no se pudo encender el PHY MIPI-DSI (LDO %d)", COCINA_LDO_CHAN);

    /* 2. Bus MIPI-DSI: 2 lanes a 1500 Mbps (macro del driver, .bus_id 0) */
    esp_lcd_dsi_bus_handle_t dsi_bus = NULL;
    const esp_lcd_dsi_bus_config_t bus_cfg = JD9365_PANEL_BUS_DSI_2CH_CONFIG();
    ESP_RETURN_ON_ERROR(esp_lcd_new_dsi_bus(&bus_cfg, &dsi_bus), TAG, "esp_lcd_new_dsi_bus");

    /* 3. Panel IO: los comandos DCS del JD9365 viajan por el mismo DSI */
    const esp_lcd_dbi_io_config_t dbi_cfg = JD9365_PANEL_IO_DBI_CONFIG();
    ESP_RETURN_ON_ERROR(esp_lcd_new_panel_io_dbi(dsi_bus, &dbi_cfg, &s_panel_io), TAG,
                        "esp_lcd_new_panel_io_dbi");

    /* 4. Timing de video (800x1280@60) ya resuelto por el driver */
    const esp_lcd_dpi_panel_config_t dpi_cfg =
        JD9365_800_1280_PANEL_60HZ_DPI_CONFIG(LCD_COLOR_PIXEL_FORMAT_RGB565);

    /* El macro de arriba es un inicializador con llaves: no se puede mirar
     * desde un _Static_assert. Se comprueba aqui, antes de tocar el panel. */
    if (dpi_cfg.video_timing.h_size != COCINA_LCD_H_RES ||
        dpi_cfg.video_timing.v_size != COCINA_LCD_V_RES ||
        bus_cfg.num_data_lanes != COCINA_LCD_MIPI_LANES) {
        ESP_LOGE(TAG, "timing del driver (%ux%u, %u lanes) != config.h (%dx%d, %d lanes)",
                 (unsigned)dpi_cfg.video_timing.h_size, (unsigned)dpi_cfg.video_timing.v_size,
                 (unsigned)bus_cfg.num_data_lanes,
                 COCINA_LCD_H_RES, COCINA_LCD_V_RES, COCINA_LCD_MIPI_LANES);
        return ESP_ERR_INVALID_SIZE;
    }

    jd9365_vendor_config_t vendor_cfg = {
        .mipi_config = {
            .dsi_bus    = dsi_bus,
            .dpi_config = &dpi_cfg,
            .lane_num   = COCINA_LCD_MIPI_LANES,
        },
    };
    const esp_lcd_panel_dev_config_t panel_cfg = {
        .reset_gpio_num = COCINA_LCD_RST_GPIO,          /* GPIO27 */
        .rgb_ele_order  = LCD_RGB_ELEMENT_ORDER_RGB,    /* device.yaml: color_order RGB */
        .bits_per_pixel = COCINA_LCD_BPP,
        .vendor_config  = &vendor_cfg,
    };

    ESP_RETURN_ON_ERROR(esp_lcd_new_panel_jd9365(s_panel_io, &panel_cfg, &s_panel), TAG,
                        "esp_lcd_new_panel_jd9365");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_reset(s_panel), TAG, "panel_reset");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_init(s_panel), TAG, "panel_init");
    ESP_RETURN_ON_ERROR(esp_lcd_panel_disp_on_off(s_panel, true), TAG, "panel_disp_on");

    ESP_LOGI(TAG, "JD9365 %dx%d listo (MIPI-DSI %d lanes, %d Mbps)",
             COCINA_LCD_H_RES, COCINA_LCD_V_RES, COCINA_LCD_MIPI_LANES, COCINA_LCD_MIPI_MBPS);
    return ESP_OK;
}

/* ------------------------------------------------------------------ */
/* Tactil GT911 por I2C (SDA 7, SCL 8, RST 22, INT 21)                */
/* ------------------------------------------------------------------ */
static esp_err_t touch_init(void)
{
    const i2c_master_bus_config_t i2c_cfg = {
        .i2c_port          = COCINA_I2C_PORT,
        .sda_io_num        = COCINA_I2C_SDA_GPIO,
        .scl_io_num        = COCINA_I2C_SCL_GPIO,
        .clk_source        = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .flags = {
            /* device.yaml: sda_pullup_enabled: False / scl_pullup_enabled: False
             * -> los pullups son externos, en placa. */
            .enable_internal_pullup = false,
        },
    };
    ESP_RETURN_ON_ERROR(i2c_new_master_bus(&i2c_cfg, &s_i2c_bus), TAG,
                        "i2c_new_master_bus (SDA %d / SCL %d)",
                        COCINA_I2C_SDA_GPIO, COCINA_I2C_SCL_GPIO);

    esp_lcd_panel_io_i2c_config_t io_cfg = ESP_LCD_TOUCH_IO_I2C_GT911_CONFIG();
    io_cfg.dev_addr     = COCINA_TOUCH_I2C_ADDR;
    io_cfg.scl_speed_hz = COCINA_I2C_FREQ_HZ;
    ESP_RETURN_ON_ERROR(esp_lcd_new_panel_io_i2c(s_i2c_bus, &io_cfg, &s_touch_io), TAG,
                        "esp_lcd_new_panel_io_i2c (GT911)");

    const esp_lcd_touch_config_t tp_cfg = {
        .x_max        = COCINA_LCD_H_RES,
        .y_max        = COCINA_LCD_V_RES,
        .rst_gpio_num = COCINA_TOUCH_RST_GPIO,    /* GPIO22 */
        .int_gpio_num = COCINA_TOUCH_INT_GPIO,    /* GPIO21 */
        .levels = {
            .reset     = 0,   /* RST activo a nivel bajo */
            .interrupt = 0,
        },
        .flags = {
            .swap_xy  = COCINA_TOUCH_SWAP_XY,     /* device.yaml: false */
            .mirror_x = COCINA_TOUCH_MIRROR_X,    /* device.yaml: false */
            .mirror_y = COCINA_TOUCH_MIRROR_Y,    /* device.yaml: true  */
        },
    };
    ESP_RETURN_ON_ERROR(esp_lcd_touch_new_i2c_gt911(s_touch_io, &tp_cfg, &s_touch), TAG,
                        "GT911 no responde en 0x%02X (¿GSL3680? ver README)",
                        COCINA_TOUCH_I2C_ADDR);
    return ESP_OK;
}

/* ------------------------------------------------------------------ */
/* Retroiluminacion por LEDC (GPIO23)                                 */
/* ------------------------------------------------------------------ */
static esp_err_t backlight_init(void)
{
    const ledc_timer_config_t tcfg = {
        .speed_mode      = LEDC_LOW_SPEED_MODE,
        .duty_resolution = LEDC_TIMER_10_BIT,
        .timer_num       = COCINA_BL_LEDC_TIMER,
        .freq_hz         = COCINA_BL_LEDC_FREQ_HZ,
        .clk_cfg         = LEDC_AUTO_CLK,
    };
    ESP_RETURN_ON_ERROR(ledc_timer_config(&tcfg), TAG, "ledc_timer_config");

    const ledc_channel_config_t ccfg = {
        .gpio_num   = COCINA_LCD_BL_GPIO,      /* GPIO23 */
        .speed_mode = LEDC_LOW_SPEED_MODE,
        .channel    = COCINA_BL_LEDC_CHANNEL,
        .intr_type  = LEDC_INTR_DISABLE,
        .timer_sel  = COCINA_BL_LEDC_TIMER,
        .duty       = 0,                       /* negro hasta que la UI exista */
        .hpoint     = 0,
    };
    return ledc_channel_config(&ccfg);
}

static void backlight_set_pct(int pct)
{
    if (pct < 0)   pct = 0;
    if (pct > 100) pct = 100;
    const uint32_t max = (1u << COCINA_BL_LEDC_RES_BITS) - 1u;
    const uint32_t duty = (max * (uint32_t)pct) / 100u;
    (void)ledc_set_duty(LEDC_LOW_SPEED_MODE, COCINA_BL_LEDC_CHANNEL, duty);
    (void)ledc_update_duty(LEDC_LOW_SPEED_MODE, COCINA_BL_LEDC_CHANNEL);
}

/* ------------------------------------------------------------------ */
/* Puente LVGL 9 (esp_lvgl_port)                                      */
/* ------------------------------------------------------------------ */
static esp_err_t lvgl_attach(lv_display_t **out_disp)
{
    const lvgl_port_cfg_t port_cfg = ESP_LVGL_PORT_INIT_CONFIG();
    ESP_RETURN_ON_ERROR(lvgl_port_init(&port_cfg), TAG, "lvgl_port_init");

    const lvgl_port_display_cfg_t disp_cfg = {
        .io_handle    = s_panel_io,
        .panel_handle = s_panel,
        .buffer_size  = COCINA_LCD_H_RES * COCINA_LVGL_BUF_LINES,
        .double_buffer = true,
        .hres = COCINA_LCD_H_RES,
        .vres = COCINA_LCD_V_RES,
        .monochrome = false,
        /* La rotacion del PANEL va aparte de la del tactil: device.yaml solo
         * pone mirror_y en el bloque touchscreen, el display va tal cual. */
        .rotation = {
            .swap_xy  = false,
            .mirror_x = false,
            .mirror_y = false,
        },
#if LVGL_VERSION_MAJOR >= 9
        .color_format = LV_COLOR_FORMAT_RGB565,
#endif
        .flags = {
            .buff_dma    = false,
            .buff_spiram = true,   /* 800x100 RGB565 x2 = 320 KB: a PSRAM */
            .swap_bytes  = false,  /* si los colores salen raros, probar true */
            .full_refresh = false, /* tarjetas pequenas: refresco parcial */
            .direct_mode  = false,
        },
    };
    const lvgl_port_display_dsi_cfg_t dsi_cfg = {
        .flags = {
            .avoid_tearing = false,   /* num_fbs=1 en el DPI config */
        },
    };

    *out_disp = lvgl_port_add_disp_dsi(&disp_cfg, &dsi_cfg);
    if (*out_disp == NULL) {
        ESP_LOGE(TAG, "lvgl_port_add_disp_dsi devolvio NULL");
        return ESP_FAIL;
    }

    if (s_touch_ok) {
        const lvgl_port_touch_cfg_t touch_cfg = {
            .disp   = *out_disp,
            .handle = s_touch,
            .scale  = { .x = 1.0f, .y = 1.0f },
        };
        if (lvgl_port_add_touch(&touch_cfg) == NULL) {
            /* No es fatal: la pantalla sigue mostrando pedidos, solo que no se
             * pueden marcar como hechos. El banner lo avisa. */
            ESP_LOGE(TAG, "lvgl_port_add_touch devolvio NULL: pantalla sin tactil");
            s_touch_ok = false;
        }
    }
    return ESP_OK;
}

/* ------------------------------------------------------------------ */
/* Pantalla + LVGL + UI (todo a mano, sin BSP)                        */
/* ------------------------------------------------------------------ */
static esp_err_t display_and_ui_init(void)
{
    ESP_RETURN_ON_ERROR(panel_init(), TAG, "init del panel JD9365");

    /* El tactil NO es bloqueante: sin tactil la pantalla sigue informando
     * (y el banner lo dice). Con tactil, se marcan los pedidos. */
    const esp_err_t terr = touch_init();
    if (terr == ESP_OK) {
        s_touch_ok = true;
    } else {
        ESP_LOGE(TAG, "tactil GT911 no inicializado (%s): la UI arranca sin tactil",
                 esp_err_to_name(terr));
    }

    ESP_RETURN_ON_ERROR(lvgl_attach(&s_disp), TAG, "puente LVGL");

    /* El LEDC arranca con duty 0 (ver backlight_init): asi no se ve el
     * framebuffer sin pintar. Se sube el brillo cuando la UI ya existe. */
    ESP_RETURN_ON_ERROR(backlight_init(), TAG, "backlight LEDC");

    ui_init();
    ui_set_station(cocina_cfg_nombre());
    backlight_set_pct(COCINA_BL_DUTY_PCT);   /* por fin se ve algo */
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
        } else if (!s_touch_ok) {
            banner = "Tactil no detectado - revisa GT911/GSL3680";
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
