# Los componentes gestionados (BSP Waveshare, LVGL, esp_hosted, esp_wifi_remote)
# se resuelven solos desde main/idf_component.yml y entran en REQUIRES de main.
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
        mqtt
        json
)
