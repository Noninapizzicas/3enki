#ifndef ENKI_CONFIG_DEFAULTS_H
#define ENKI_CONFIG_DEFAULTS_H

// Driver identity (MUST be overridden by each driver's config.h)
#ifndef DRIVER_TYPE
#define DRIVER_TYPE "generic"
#endif

#ifndef FIRMWARE_VERSION
#define FIRMWARE_VERSION "0.0.0"
#endif

// Device defaults
#ifndef DEFAULT_DEVICE_ID
#define DEFAULT_DEVICE_ID "enki-device-1"
#endif
#ifndef DEFAULT_PROJECT_ID
#define DEFAULT_PROJECT_ID "enki"
#endif
#ifndef DEFAULT_MQTT_HOST
#define DEFAULT_MQTT_HOST ""
#endif
#ifndef DEFAULT_MQTT_PORT
#define DEFAULT_MQTT_PORT 1883
#endif
#ifndef DEFAULT_MQTT_USER
#define DEFAULT_MQTT_USER ""
#endif
#ifndef DEFAULT_MQTT_PASS
#define DEFAULT_MQTT_PASS ""
#endif
#ifndef DEFAULT_OTA_URL
#define DEFAULT_OTA_URL ""
#endif

// WiFi
#ifndef WIFI_MAX_NETWORKS
#define WIFI_MAX_NETWORKS 3
#endif
#ifndef WIFI_CONNECT_TIMEOUT
#define WIFI_CONNECT_TIMEOUT 10000
#endif
#ifndef WIFI_PORTAL_TIMEOUT
#define WIFI_PORTAL_TIMEOUT 300000
#endif
#ifndef WIFI_CHECK_INTERVAL
#define WIFI_CHECK_INTERVAL 5000
#endif
#ifndef WIFI_RECONNECT_TIMEOUT
#define WIFI_RECONNECT_TIMEOUT 8000
#endif
#ifndef WIFI_RETRY_DELAY
#define WIFI_RETRY_DELAY 3000
#endif
#ifndef WIFI_MAX_FAILURES
#define WIFI_MAX_FAILURES 3
#endif
#ifndef WIFI_AP_NAME_PREFIX
#define WIFI_AP_NAME_PREFIX "Enki"
#endif

// Hardware
#ifndef LED_PIN
#define LED_PIN 2
#endif
#ifndef PORTAL_PORT
#define PORTAL_PORT 80
#endif
#ifndef MAX_PAYLOAD_SIZE
#define MAX_PAYLOAD_SIZE 4096
#endif
#ifndef WDT_TIMEOUT_SEC
#define WDT_TIMEOUT_SEC 120
#endif
#ifndef STATUS_INTERVAL_MS
#define STATUS_INTERVAL_MS 30000
#endif

// OTA
#ifndef OTA_CHECK_INTERVAL_MS
#define OTA_CHECK_INTERVAL_MS 300000
#endif

// MQTT
#ifndef MQTT_BUFFER_SIZE
#define MQTT_BUFFER_SIZE 6144
#endif

// NVS
#ifndef NVS_NAMESPACE
#define NVS_NAMESPACE "enki"
#endif

#endif // ENKI_CONFIG_DEFAULTS_H
