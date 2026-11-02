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

# Variante de panel de la placa GUITION (ver main/config.h):
#   1 = JC8012P4A1      (pclk 60 MHz, 2 lanes a 1000 Mbps)
#   2 = JC8012P4A1-V2   (pclk 70 MHz, 2 lanes a 1500 Mbps)
# Se elige sin tocar el codigo:  COCINA_PANEL_VARIANT=2 idf.py -B build-v2 build
if(DEFINED ENV{COCINA_PANEL_VARIANT})
    target_compile_definitions(${COMPONENT_LIB} PRIVATE
        COCINA_PANEL_VARIANT=$ENV{COCINA_PANEL_VARIANT})
endif()
