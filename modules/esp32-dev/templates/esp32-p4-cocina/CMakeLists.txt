cmake_minimum_required(VERSION 3.16)

project(esp32-p4-cocina C CXX ASM)

set(SUPPORTED_TARGETS esp32p4)

set(PROJECT_VER "1.0.0")
set(PROJECT_NAME "esp32-p4-cocina")

include($ENV{IDF_PATH}/tools/cmake/project.cmake)

project_start(PROJECT_NAME esp32-p4-cocina
    LANGUAGES C CXX ASM
)

# Incluir componentes
set(COMPONENTS
    main
    esp_wifi
    esp_netif
    nvs_flash
    esp_mqtt
    lvgl
    esp_lcd
    freertos
    esp_common
    esp_event
    driver
)

if(CONFIG_ESP_BROWSER_ENABLED)
    list(APPEND COMPONENTS esp_browser)
endif()

project(${PROJECT_NAME} ${COMPONENTS})
