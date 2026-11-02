# Los componentes gestionados (esp_lcd_jd9365, esp_lcd_touch_gt911,
# esp_lvgl_port, LVGL, esp_hosted, esp_wifi_remote) se resuelven solos desde
# main/idf_component.yml; aqui se declaran explicitos porque main.c/ui.c los
# incluyen directamente.
idf_component_register(
    SRCS
        "main.c"
        "ui.c"
        "mqtt_enki.c"
    INCLUDE_DIRS
        "."
    REQUIRES
        nvs_flash
        esp_wifi
        esp_netif
        esp_event
        esp_timer
        esp_hw_support      # esp_ldo_regulator.h (LDO del PHY MIPI-DSI)
        esp_mm              # esp_cache.h (volcado de cache del framebuffer DSI)
        esp_driver_gpio
        esp_driver_i2c
        esp_driver_ledc
        esp_lcd
        esp_lcd_jd9365
        esp_lcd_touch
        esp_lcd_touch_gt911
        esp_lvgl_port
        mqtt
        json
)
