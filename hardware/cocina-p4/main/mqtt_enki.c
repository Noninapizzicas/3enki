/**
 * @file mqtt_enki.c
 * @brief Cocina P4 — cliente MQTT de Enki (registro, eventos de display, prepare-item).
 *
 * Decisiones de robustez (una cocina no puede quedarse en negro):
 *  - auto-reconexion de esp-mqtt + RE-SUSCRIPCION y RE-REGISTRO en cada
 *    MQTT_EVENT_CONNECTED (el broker no conserva suscripciones de una sesion
 *    limpiada).
 *  - watchdog propio (esp_timer, 15 s) que fuerza esp_mqtt_client_reconnect()
 *    si el cliente lleva rato caido sin que llegue el evento DISCONNECTED.
 *  - reensamblado de payloads troceados por MQTT_EVENT_DATA (data_offset).
 *  - todo lo que no sea para nuestro device_id se ignora (varias pantallas
 *    pueden compartir el topic comodin).
 */

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <inttypes.h>

#include "esp_err.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_random.h"
#include "esp_timer.h"
#include "esp_crt_bundle.h"

#include "mqtt_client.h"
#include "cJSON.h"

#include "config.h"
#include "ui.h"
#include "mqtt_enki.h"

static const char *TAG = "cocina-mqtt";

#define RX_BUF_SIZE        4096
#define HEALTH_PERIOD_S    15

static esp_mqtt_client_handle_t s_client;
static esp_timer_handle_t       s_health_timer;
static bool s_started;
static bool s_connected;
static bool s_registered;
static char s_device_id[48];

/* Reensamblado del payload actual */
static char   s_rx_buf[RX_BUF_SIZE];
static size_t s_rx_len;

/* ------------------------------------------------------------------ */
/* Utilidades                                                         */
/* ------------------------------------------------------------------ */
static void make_request_id(char *out, size_t len)
{
    /* UUID v4 "suficiente": no hace falta unicidad criptografica, solo que
     * el request_id no choque entre peticiones del mismo segundo. */
    const uint32_t a = esp_random();
    const uint32_t b = esp_random();
    const uint32_t c = esp_random();
    const uint32_t d = esp_random();
    snprintf(out, len, "%08" PRIx32 "-%04" PRIx32 "-4%03" PRIx32 "-%04" PRIx32 "-%04" PRIx32 "%08" PRIx32,
             a,
             (b >> 16) & 0xFFFF,
             (b & 0x0FFF),
             ((c >> 16) & 0x3FFF) | 0x8000,
             c & 0xFFFF,
             d);
}

static void resolve_device_id(void)
{
    const char *cfg = cocina_cfg_device_id();
    if (cfg && cfg[0] != '\0') {
        strlcpy(s_device_id, cfg, sizeof(s_device_id));
        return;
    }
    uint8_t mac[6] = {0};
    if (esp_read_mac(mac, ESP_MAC_WIFI_STA) != ESP_OK) {
        ESP_LOGW(TAG, "esp_read_mac(WIFI_STA) fallo, usando MAC base");
        esp_efuse_mac_get_default(mac);
    }
    snprintf(s_device_id, sizeof(s_device_id), "cocina-p4-%02x%02x%02x%02x%02x%02x",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
}

static const cJSON *json_first(const cJSON *obj, const char *const *keys, size_t n)
{
    if (!cJSON_IsObject(obj)) return NULL;
    for (size_t i = 0; i < n; i++) {
        const cJSON *it = cJSON_GetObjectItemCaseSensitive(obj, keys[i]);
        if (it) return it;
    }
    return NULL;
}

static void json_copy_str(const cJSON *item, char *out, size_t len)
{
    if (!item || !out || len == 0) return;
    if (cJSON_IsString(item) && item->valuestring) {
        strlcpy(out, item->valuestring, len);
    } else if (cJSON_IsNumber(item)) {
        snprintf(out, len, "%d", (int)item->valuedouble);
    } else if (cJSON_IsBool(item)) {
        strlcpy(out, cJSON_IsTrue(item) ? "true" : "false", len);
    }
}

static uint32_t fnv1a(const char *s)
{
    uint32_t h = 2166136261u;
    for (; s && *s; s++) {
        h ^= (uint32_t)(uint8_t)*s;
        h *= 16777619u;
    }
    return h;
}

/* ------------------------------------------------------------------ */
/* Publicacion                                                        */
/* ------------------------------------------------------------------ */
static esp_err_t publish_with_data(const char *topic, cJSON *data)
{
    if (!data) return ESP_ERR_INVALID_ARG;
    if (!s_client || !s_connected) {
        cJSON_Delete(data);
        ESP_LOGW(TAG, "sin conexion MQTT: se descarta el evento para %s", topic);
        return ESP_ERR_INVALID_STATE;
    }

    cJSON *root = cJSON_CreateObject();
    if (!root) {
        cJSON_Delete(data);
        return ESP_ERR_NO_MEM;
    }
    char request_id[48];
    make_request_id(request_id, sizeof(request_id));
    cJSON_AddStringToObject(root, "request_id", request_id);

    cJSON *source = cJSON_AddObjectToObject(root, "source");
    cJSON_AddStringToObject(source, "core_id", COCINA_SOURCE_CORE_ID);
    cJSON_AddStringToObject(source, "module_id", COCINA_SOURCE_MODULE_ID);

    cJSON_AddItemToObject(root, "data", data);   /* root pasa a ser dueño */

    char *payload = cJSON_PrintUnformatted(root);
    if (!payload) {
        cJSON_Delete(root);
        return ESP_ERR_NO_MEM;
    }

    const int msg_id = esp_mqtt_client_publish(s_client, topic, payload, 0, 1, 0);
    ESP_LOGI(TAG, "-> %s (msg_id=%d) %s", topic, msg_id, payload);

    free(payload);
    cJSON_Delete(root);
    return (msg_id < 0) ? ESP_FAIL : ESP_OK;
}

esp_err_t mqtt_enki_register_device(void)
{
    const char *topic = cocina_cfg_topic_register();
    cJSON *data = cJSON_CreateObject();
    if (!data) return ESP_ERR_NO_MEM;

    cJSON_AddStringToObject(data, "device_id", s_device_id);
    cJSON_AddStringToObject(data, "nombre", cocina_cfg_nombre());
    cJSON_AddStringToObject(data, "estacion", cocina_cfg_estacion());
    cJSON_AddStringToObject(data, "tipo_estacion", cocina_cfg_tipo());

    esp_err_t err = publish_with_data(topic, data);
    s_registered = (err == ESP_OK);
    if (s_registered) {
        ESP_LOGI(TAG, "registrado como %s", s_device_id);
    }
    return err;
}

esp_err_t mqtt_enki_prepare_item(const char *item_id)
{
    if (!item_id || item_id[0] == '\0') {
        ESP_LOGW(TAG, "prepare-item sin item_id");
        return ESP_ERR_INVALID_ARG;
    }

    cJSON *data = cJSON_CreateObject();
    if (!data) return ESP_ERR_NO_MEM;

    cJSON_AddStringToObject(data, "item_id", item_id);
    cJSON_AddStringToObject(data, "device_id", s_device_id);
    cJSON_AddBoolToObject(data, "done", true);

    return publish_with_data(cocina_cfg_topic_prepare(), data);
}

bool mqtt_enki_is_connected(void)
{
    return s_connected;
}

const char *mqtt_enki_device_id(void)
{
    return s_device_id;
}

/* ------------------------------------------------------------------ */
/* Recepcion: periferico.display                                      */
/* ------------------------------------------------------------------ */
static int json_opt_int(const cJSON *obj, const char *key, int def)
{
    const cJSON *it = cJSON_GetObjectItemCaseSensitive(obj, key);
    return cJSON_IsNumber(it) ? (int)it->valuedouble : def;
}

static bool accion_es_borrado(const char *accion)
{
    if (!accion) return false;
    return (strstr(accion, "elimin") != NULL) ||
           (strstr(accion, "cancel") != NULL) ||
           (strstr(accion, "quitar") != NULL) ||
           (strstr(accion, "borr") != NULL);
}

static bool accion_es_limpieza(const char *accion)
{
    if (!accion) return false;
    return (strstr(accion, "limpiar") != NULL) ||
           (strcmp(accion, "sin_pedidos") == 0) ||
           (strcmp(accion, "vacio") == 0);
}

/* Deriva una tarjeta de un objeto JSON libre (contenido). */
static void item_from_json(const cJSON *obj, int prioridad, bool destacar,
                           const char *fallback_texto, cocina_item_t *out)
{
    memset(out, 0, sizeof(*out));
    out->prioridad = prioridad;
    out->destacar = destacar;
    out->cantidad = 1;

    static const char *const id_keys[]  = {"item_id", "id", "linea_id", "item", "pedido_id"};
    static const char *const mesa_keys[] = {"mesa", "identificador", "mesa_id", "cuenta", "ubicacion"};
    static const char *const txt_keys[] = {"texto", "platos", "descripcion", "titulo", "contenido", "resumen"};

    if (cJSON_IsObject(obj)) {
        json_copy_str(json_first(obj, id_keys, sizeof(id_keys) / sizeof(id_keys[0])),
                      out->item_id, sizeof(out->item_id));
        json_copy_str(json_first(obj, mesa_keys, sizeof(mesa_keys) / sizeof(mesa_keys[0])),
                      out->mesa, sizeof(out->mesa));

        const cJSON *txt = json_first(obj, txt_keys, sizeof(txt_keys) / sizeof(txt_keys[0]));
        if (cJSON_IsArray(txt)) {
            /* lista de platos -> texto multilinea legible de pie */
            size_t off = 0;
            const cJSON *plate = NULL;
            cJSON_ArrayForEach(plate, txt) {
                if (!cJSON_IsString(plate) || !plate->valuestring) continue;
                const int n = snprintf(out->texto + off, sizeof(out->texto) - off, "%s%s",
                                       off ? "\n" : "", plate->valuestring);
                if (n < 0 || (size_t)n >= sizeof(out->texto) - off) break;
                off += (size_t)n;
            }
        } else {
            json_copy_str(txt, out->texto, sizeof(out->texto));
        }

        out->cantidad = json_opt_int(obj, "cantidad", 1);
        if (out->prioridad <= 0) {
            out->prioridad = json_opt_int(obj, "prioridad", 0);
        }
    } else if (cJSON_IsString(obj) && obj->valuestring) {
        strlcpy(out->texto, obj->valuestring, sizeof(out->texto));
    }

    if (out->texto[0] == '\0' && fallback_texto) {
        strlcpy(out->texto, fallback_texto, sizeof(out->texto));
    }
    if (out->item_id[0] == '\0') {
        /* Sin id en el payload: id estable derivado del texto, para que dos
         * eventos del mismo pedido actualicen la misma tarjeta. */
        snprintf(out->item_id, sizeof(out->item_id), "auto-%08" PRIx32, fnv1a(out->texto));
    }
    if (out->mesa[0] == '\0') {
        strlcpy(out->mesa, "COCINA", sizeof(out->mesa));
    }
}

static void handle_display_event(const cJSON *root)
{
    /* 1. Filtro por destino: si viene y no es nuestro, se ignora. */
    const cJSON *destino = cJSON_GetObjectItemCaseSensitive(root, "destino");
    if (cJSON_IsString(destino) && destino->valuestring &&
        strcmp(destino->valuestring, s_device_id) != 0) {
        ESP_LOGD(TAG, "ignorado: destino=%s (soy %s)", destino->valuestring, s_device_id);
        return;
    }

    const cJSON *data = cJSON_GetObjectItemCaseSensitive(root, "data");
    if (!cJSON_IsObject(data)) {
        ESP_LOGW(TAG, "evento sin objeto 'data'");
        return;
    }

    /* 2. Modulo: si viene y no es cocina, se ignora. */
    const cJSON *modulo = cJSON_GetObjectItemCaseSensitive(data, "modulo");
    if (cJSON_IsString(modulo) && modulo->valuestring &&
        strcmp(modulo->valuestring, "cocina") != 0) {
        ESP_LOGD(TAG, "ignorado: modulo=%s", modulo->valuestring);
        return;
    }

    const int prioridad = json_opt_int(data, "prioridad",
                                       json_opt_int(root, "prioridad", 0));
    const int activos = json_opt_int(data, "pedidos_activos", -1);

    const cJSON *accion_json = cJSON_GetObjectItemCaseSensitive(data, "accion");
    const char *accion = cJSON_IsString(accion_json) ? accion_json->valuestring : "";

    const cJSON *contenido = cJSON_GetObjectItemCaseSensitive(data, "contenido");

    ESP_LOGI(TAG, "evento display: accion='%s' prioridad=%d activos=%d", accion, prioridad, activos);

    if (activos >= 0) {
        ui_set_pedidos_activos(activos);
    }

    if (accion_es_limpieza(accion)) {
        ui_clear_items();
        return;
    }

    const bool destacar = (strcmp(accion, "pedido_listo") == 0) || (prioridad == 2);

    /* Evento sin contenido (solo refresca el contador de pedidos activos). */
    if (contenido == NULL || cJSON_IsNull(contenido)) {
        ESP_LOGD(TAG, "evento sin contenido: solo se actualiza el contador");
        return;
    }

    /* 3. Snapshot completo (array) -> reemplaza la lista. */
    if (cJSON_IsArray(contenido)) {
        cocina_item_t items[12];
        int n = 0;
        const cJSON *it = NULL;
        cJSON_ArrayForEach(it, contenido) {
            if (n >= (int)(sizeof(items) / sizeof(items[0]))) break;
            item_from_json(it, prioridad, destacar, NULL, &items[n]);
            n++;
        }
        ui_replace_items(items, n);
        return;
    }

    /* 4. Evento suelto: objeto, cadena o numero. */
    cocina_item_t item;
    const char *accion_texto = accion[0] ? accion : NULL;
    item_from_json(contenido, prioridad, destacar, accion_texto, &item);

    if (accion_es_borrado(accion)) {
        ui_remove_item(item.item_id);
        return;
    }

    ui_upsert_item(&item);
}

/* ------------------------------------------------------------------ */
/* Eventos del cliente                                                */
/* ------------------------------------------------------------------ */
static void mqtt_event_handler(void *args, esp_event_base_t base, int32_t event_id, void *event_data)
{
    (void)args;
    (void)base;
    esp_mqtt_event_handle_t event = (esp_mqtt_event_handle_t)event_data;

    switch ((esp_mqtt_event_id_t)event_id) {

    case MQTT_EVENT_CONNECTED: {
        s_connected = true;
        s_registered = false;
        ui_set_mqtt(true);
        ui_set_banner(NULL);
        ESP_LOGI(TAG, "conectado a %s", cocina_cfg_mqtt_uri());

        /* Re-suscripcion obligatoria en cada conexion. */
        const int sub_id = esp_mqtt_client_subscribe(s_client, cocina_cfg_topic_sub(), 1);
        if (sub_id < 0) {
            ESP_LOGE(TAG, "fallo al suscribirse a %s", cocina_cfg_topic_sub());
        } else {
            ESP_LOGI(TAG, "suscrito a %s (sub_id=%d, qos 1)", cocina_cfg_topic_sub(), sub_id);
        }

        /* Re-registro del dispositivo: el modulo cocina debe volver a saber
         * que esta pantalla existe tras un corte. */
        mqtt_enki_register_device();
        break;
    }

    case MQTT_EVENT_DISCONNECTED:
        s_connected = false;
        s_registered = false;
        ui_set_mqtt(false);
        ESP_LOGW(TAG, "desconectado del broker (esp-mqtt reintenta solo)");
        break;

    case MQTT_EVENT_SUBSCRIBED:
        ESP_LOGI(TAG, "suscripcion confirmada (msg_id=%d)", event->msg_id);
        break;

    case MQTT_EVENT_ERROR:
        if (event->error_handle) {
            ESP_LOGE(TAG, "error MQTT tipo=%d tls=0x%x esp_tls=0x%x sock_errno=%d",
                     event->error_handle->error_type,
                     event->error_handle->esp_tls_last_esp_err,
                     event->error_handle->esp_tls_stack_err,
                     event->error_handle->esp_transport_sock_errno);
        } else {
            ESP_LOGE(TAG, "error MQTT sin detalle");
        }
        break;

    case MQTT_EVENT_DATA: {
        if (event->data == NULL || event->data_len <= 0) break;

        /* Reensamblado: esp-mqtt trocea payloads mayores que el buffer. */
        if (event->data_offset == 0) {
            s_rx_len = 0;
        }
        if (s_rx_len + (size_t)event->data_len >= sizeof(s_rx_buf)) {
            ESP_LOGE(TAG, "payload demasiado grande (%d bytes), descartado",
                     event->total_data_len);
            s_rx_len = 0;
            break;
        }
        memcpy(s_rx_buf + s_rx_len, event->data, (size_t)event->data_len);
        s_rx_len += (size_t)event->data_len;

        if ((int)s_rx_len < event->total_data_len) {
            break;   /* faltan trozos */
        }
        s_rx_buf[s_rx_len] = '\0';
        s_rx_len = 0;

        ESP_LOGD(TAG, "<- %.*s: %s", event->topic_len, event->topic, s_rx_buf);

        cJSON *root = cJSON_Parse(s_rx_buf);
        if (!root) {
            ESP_LOGW(TAG, "JSON invalido, descartado");
            break;
        }
        handle_display_event(root);
        cJSON_Delete(root);
        break;
    }

    default:
        break;
    }
}

/* ------------------------------------------------------------------ */
/* Watchdog de conexion                                               */
/* ------------------------------------------------------------------ */
static void health_timer_cb(void *arg)
{
    (void)arg;
    if (!s_started || !s_client) return;

    if (!s_connected) {
        ESP_LOGW(TAG, "watchdog: MQTT caido, forzando reconexion");
        esp_mqtt_client_reconnect(s_client);
        return;
    }
    if (!s_registered) {
        ESP_LOGW(TAG, "watchdog: conectado pero sin registrar, reenviando register-device");
        mqtt_enki_register_device();
    }
}

/* ------------------------------------------------------------------ */
/* Arranque                                                           */
/* ------------------------------------------------------------------ */
esp_err_t mqtt_enki_start(void)
{
    if (s_started) {
        /* Ya arrancado: si el cliente esta caido, empujar reconexion. */
        if (s_client && !s_connected) {
            esp_mqtt_client_reconnect(s_client);
        }
        return ESP_OK;
    }

    resolve_device_id();
    ESP_LOGI(TAG, "device_id=%s broker=%s", s_device_id, cocina_cfg_mqtt_uri());

    esp_mqtt_client_config_t cfg = {0};
    cfg.broker.address.uri = cocina_cfg_mqtt_uri();

    const char *user = cocina_cfg_mqtt_user();
    const char *pass = cocina_cfg_mqtt_pass();
    if (user[0] != '\0') {
        cfg.credentials.username = user;
        cfg.credentials.authentication.password = pass;
    }

    cfg.session.keepalive = 30;
    cfg.session.last_will.topic = NULL;
    cfg.network.reconnect_timeout_ms = 3000;
    cfg.network.timeout_ms = 10000;
    cfg.buffer.size = RX_BUF_SIZE;
    cfg.buffer.out_size = RX_BUF_SIZE;

#if defined(CONFIG_COCINA_MQTT_SKIP_CN) && CONFIG_COCINA_MQTT_SKIP_CN
    ESP_LOGW(TAG, "verificacion TLS relajada (solo pruebas)");
    cfg.broker.verification.skip_cert_common_name_check = true;
#else
    /* wss:// con el bundle de CAs de mbedTLS (Let's Encrypt incluido). */
    cfg.broker.verification.crt_bundle_attach = esp_crt_bundle_attach;
#endif

    s_client = esp_mqtt_client_init(&cfg);
    if (!s_client) {
        ESP_LOGE(TAG, "esp_mqtt_client_init fallo");
        return ESP_FAIL;
    }

    ESP_ERROR_CHECK(esp_mqtt_client_register_event(s_client, ESP_EVENT_ANY_ID,
                                                  mqtt_event_handler, NULL));

    const esp_err_t err = esp_mqtt_client_start(s_client);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "esp_mqtt_client_start: %s", esp_err_to_name(err));
        return err;
    }

    if (!s_health_timer) {
        const esp_timer_create_args_t targs = {
            .callback = health_timer_cb,
            .name = "mqtt_health",
        };
        if (esp_timer_create(&targs, &s_health_timer) == ESP_OK) {
            esp_timer_start_periodic(s_health_timer, HEALTH_PERIOD_S * 1000ULL * 1000ULL);
        }
    }

    s_started = true;
    return ESP_OK;
}
