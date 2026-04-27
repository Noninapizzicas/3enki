// app.cpp — Máquina de estados, WiFi, MQTT, navegación

#include "app.h"
#include "display_driver.h"
#include "screen_home.h"
#include "screen_config.h"
#include "screen_cocina.h"
#include "enki_base.h"
#include "enki_wifi.h"
#include "enki_mqtt.h"
#include "enki_ota.h"
#include <WiFi.h>
#include <freertos/portmacro.h>
#include <esp_task_wdt.h>

// ─── NVS keys cocina ─────────────────────────────────────────────────────────
#define NVS_NOMBRE   "coc_nombre"
#define NVS_TIPO     "coc_tipo"
#define NVS_FILTROS  "coc_filtros"
#define NVS_COLOR    "coc_color"
#define NVS_DEV_ID   "coc_dev_id"

// ─── MQTT topics ─────────────────────────────────────────────────────────────
#define T_COCINA           "core/+/events/cocina/#"
#define T_PEDIDO_NUEVO     "core/+/events/pedido/enviado_cocina"
#define T_PEDIDO_CANCELADO "core/+/events/pedido/cancelado"

// ─── Estado ──────────────────────────────────────────────────────────────────
static AppScreen _screen      = SCREEN_HOME;
static bool      _lvgl_ready  = false;
static bool      _mqtt_was_ok = false;
static bool      _registered  = false;

static char _dev_id[48]     = "";
static char _dev_nombre[32] = "COCINA";
static char _dev_tipo[16]   = "general";
static char _dev_filtros[64]= "";
static char _dev_color[8]   = "#94a3b8";

static char _topic_reg[96]  = "";
static char _topic_list[96] = "";
static char _req_id[64]     = "";

static uint32_t _last_list_ms   = 0;
static uint32_t _last_clock_ms  = 0;
static uint32_t _last_ntp_ms    = 0;
static uint32_t _last_status_ms = 0;

// ─── Pending actions (Core 0 → Core 1) ───────────────────────────────────────
struct Pending {
    enum Type : uint8_t { NONE, PREPARE_ITEM, MARK_READY, SCAN_WIFI, GOTO_SCREEN };
    Type type;
    char order_id[48];
    char item_id[48];
    AppScreen target_screen;
};
static Pending     _pending    = {};
static portMUX_TYPE _pend_mux  = portMUX_INITIALIZER_UNLOCKED;

// ─── WDT helper ──────────────────────────────────────────────────────────────
static inline void _wdt() {
    if (esp_task_wdt_status(NULL) == ESP_OK) esp_task_wdt_reset();
}

// ─── Device ID ───────────────────────────────────────────────────────────────
static void _init_dev_id() {
    const char* saved = enki_config_get(NVS_DEV_ID, "");
    if (strlen(saved) > 4) { strlcpy(_dev_id, saved, sizeof(_dev_id)); return; }
    uint32_t mac = (uint32_t)(ESP.getEfuseMac() >> 16);
    snprintf(_dev_id, sizeof(_dev_id), "disp_%06x", mac);
    enki_config_set(NVS_DEV_ID, _dev_id);
}

static void _load_cocina_cfg() {
    strlcpy(_dev_nombre,  enki_config_get(NVS_NOMBRE,  "COCINA"),   sizeof(_dev_nombre));
    strlcpy(_dev_tipo,    enki_config_get(NVS_TIPO,    "general"),  sizeof(_dev_tipo));
    strlcpy(_dev_filtros, enki_config_get(NVS_FILTROS, ""),          sizeof(_dev_filtros));
    strlcpy(_dev_color,   enki_config_get(NVS_COLOR,   "#94a3b8"),  sizeof(_dev_color));
}

// ─── MQTT helpers ─────────────────────────────────────────────────────────────
static void _new_req() {
    snprintf(_req_id, sizeof(_req_id), "%s-%lu", _dev_id, (unsigned long)millis());
}

static void _subscribe_all() {
    enki_mqtt_subscribe(T_COCINA);
    enki_mqtt_subscribe(T_PEDIDO_NUEVO);
    enki_mqtt_subscribe(T_PEDIDO_CANCELADO);
    if (_topic_reg[0])  enki_mqtt_subscribe(_topic_reg);
    if (_topic_list[0]) enki_mqtt_subscribe(_topic_list);
}

static void _register_device() {
    _new_req();
    snprintf(_topic_reg, sizeof(_topic_reg), "ui/response/%s", _req_id);
    enki_mqtt_subscribe(_topic_reg);

    char fj[256] = "[]";
    if (_dev_filtros[0]) {
        char tmp[64]; strlcpy(tmp, _dev_filtros, sizeof(tmp));
        char arr[256] = "[";
        char* ctx = nullptr;
        char* tok = strtok_r(tmp, ",", &ctx);
        bool first = true;
        while (tok) {
            while (*tok == ' ') tok++;
            if (*tok) {
                if (!first) strlcat(arr, ",", sizeof(arr));
                char q[32]; snprintf(q, sizeof(q), "\"%s\"", tok);
                strlcat(arr, q, sizeof(arr));
                first = false;
            }
            tok = strtok_r(nullptr, ",", &ctx);
        }
        strlcat(arr, "]", sizeof(arr));
        strlcpy(fj, arr, sizeof(fj));
    }

    char payload[512];
    snprintf(payload, sizeof(payload),
        "{\"request_id\":\"%s\",\"data\":{"
        "\"device_id\":\"%s\",\"nombre\":\"%s\","
        "\"estacion\":\"%s\",\"tipo_estacion\":\"%s\","
        "\"filtros\":{\"familias\":%s}}}",
        _req_id, _dev_id, _dev_nombre,
        _dev_nombre, _dev_tipo, fj);
    enki_mqtt_publish("ui/request/cocina/register-device", payload);
}

static void _request_list() {
    _new_req();
    snprintf(_topic_list, sizeof(_topic_list), "ui/response/%s", _req_id);
    enki_mqtt_subscribe(_topic_list);
    char p[128]; snprintf(p, sizeof(p), "{\"request_id\":\"%s\",\"data\":{}}", _req_id);
    enki_mqtt_publish("ui/request/cocina/list-active", p);
    _last_list_ms = millis();
}

// ─── MQTT message parsing ─────────────────────────────────────────────────────

static CocItemState _parse_estado(const char* s) {
    if (strcmp(s, "preparando") == 0) return COC_PREPARANDO;
    if (strcmp(s, "listo")      == 0) return COC_LISTO;
    return COC_PENDIENTE;
}

static void _pedido_to_coc(JsonObjectConst obj, CocOrder& out) {
    memset(&out, 0, sizeof(out));
    strlcpy(out.id,    obj["pedido_id"] | "", COC_ID_LEN);
    strlcpy(out.canal, obj["canal"]     | "", 16);
    strlcpy(out.notas, obj["notas_generales"] | "", COC_NOTA_LEN);
    const char* ref = obj["nombre_cuenta"] | obj["ref_display"] | obj["cuenta_id"] | out.id;
    strlcpy(out.ref, ref, COC_REF_LEN);

    JsonArrayConst items = obj["items"].as<JsonArrayConst>();
    for (JsonObjectConst it : items) {
        if (out.item_count >= COC_MAX_ITEMS) break;
        CocItem& ci = out.items[out.item_count];
        strlcpy(ci.id,     it["item_id"] | "", COC_ID_LEN);
        strlcpy(ci.nombre, it["nombre"]  | "?", COC_NAME_LEN);
        strlcpy(ci.notas,  it["notas"]   | "",  COC_NOTA_LEN);
        ci.cantidad = it["cantidad"] | 1;
        ci.pase     = it["pase"]     | 0;
        ci.state    = _parse_estado(it["estado"] | "pendiente");
        JsonArrayConst q = it["variaciones"]["ingredientes_quitar"].as<JsonArrayConst>();
        char qb[COC_VAR_LEN] = "";
        for (const char* qi : q) {
            if (qb[0]) strlcat(qb, ", ", sizeof(qb));
            strlcat(qb, qi, sizeof(qb));
        }
        strlcpy(ci.quitar, qb, COC_VAR_LEN);
        out.item_count++;
    }
    out.state       = COC_ACTIVO;
    out.received_ms = millis();
    out.used        = true;
}

static void _on_register_resp(JsonDocument& doc) {
    const char* color = doc["data"]["color"] | "";
    if (*color) {
        strlcpy(_dev_color, color, sizeof(_dev_color));
        enki_config_set(NVS_COLOR, _dev_color);
        if (_lvgl_ready) {
            lv_lock();
            screen_cocina_set_device_color(_dev_color);
            lv_unlock();
        }
    }
    _registered = true;
    _topic_reg[0] = '\0';
    _request_list();
}

static void _on_list_active(JsonDocument& doc) {
    JsonArrayConst arr;
    if      (doc["data"]["pedidos"].is<JsonArrayConst>()) arr = doc["data"]["pedidos"].as<JsonArrayConst>();
    else if (doc["pedidos"].is<JsonArrayConst>())         arr = doc["pedidos"].as<JsonArrayConst>();
    else if (doc["data"].is<JsonArrayConst>())            arr = doc["data"].as<JsonArrayConst>();
    else return;

    if (_lvgl_ready) { lv_lock(); screen_cocina_clear(); lv_unlock(); }
    for (JsonObjectConst obj : arr) {
        CocOrder o; _pedido_to_coc(obj, o);
        if (o.id[0] && _lvgl_ready) { lv_lock(); screen_cocina_add_order(o); lv_unlock(); }
    }
    _topic_list[0] = '\0';
}

// ─── Acciones táctiles (Core 1) ───────────────────────────────────────────────

static void _do_prepare(const char* oid, const char* iid) {
    char p[256];
    snprintf(p, sizeof(p), "{\"data\":{\"item_id\":\"%s\",\"device_id\":\"%s\"}}", iid, _dev_id);
    enki_mqtt_publish("ui/request/cocina/prepare-item", p);
}

static void _do_mark_ready(const char* oid) {
    char p[192];
    snprintf(p, sizeof(p), "{\"data\":{\"pedido_id\":\"%s\",\"device_id\":\"%s\"}}", oid, _dev_id);
    enki_mqtt_publish("ui/request/cocina/mark-ready", p);
}

// ─── Navegación de pantalla ────────────────────────────────────────────────────

static void _do_goto(AppScreen s) {
    _screen = s;
    if (!_lvgl_ready) return;
    lv_lock();
    switch (s) {
        case SCREEN_HOME:
            screen_home_set_wifi(app_wifi_ok());
            screen_home_set_mqtt(app_mqtt_ok());
            screen_home_load();
            break;
        case SCREEN_CONFIG:
            screen_config_populate();
            screen_config_load();
            break;
        case SCREEN_COCINA:
            screen_cocina_load();
            break;
    }
    lv_unlock();
}

// ─── Public API ───────────────────────────────────────────────────────────────

bool app_wifi_ok() { return WiFi.status() == WL_CONNECTED; }
bool app_mqtt_ok() { return enki_mqtt_connected(); }

void app_goto(AppScreen s) {
    portENTER_CRITICAL(&_pend_mux);
    if (_pending.type == Pending::NONE) {
        _pending.type          = Pending::GOTO_SCREEN;
        _pending.target_screen = s;
    }
    portEXIT_CRITICAL(&_pend_mux);
}

void app_request_wifi_scan() {
    portENTER_CRITICAL(&_pend_mux);
    if (_pending.type == Pending::NONE) _pending.type = Pending::SCAN_WIFI;
    portEXIT_CRITICAL(&_pend_mux);
}

void app_cocina_item_tap(const char* oid, const char* iid) {
    portENTER_CRITICAL(&_pend_mux);
    if (_pending.type == Pending::NONE) {
        _pending.type = Pending::PREPARE_ITEM;
        strlcpy(_pending.order_id, oid, sizeof(_pending.order_id));
        strlcpy(_pending.item_id,  iid, sizeof(_pending.item_id));
    }
    portEXIT_CRITICAL(&_pend_mux);
}

void app_cocina_header_tap(const char* oid) {
    portENTER_CRITICAL(&_pend_mux);
    if (_pending.type == Pending::NONE) {
        _pending.type = Pending::MARK_READY;
        strlcpy(_pending.order_id, oid, sizeof(_pending.order_id));
    }
    portEXIT_CRITICAL(&_pend_mux);
}

void app_config_save() {
    // Leer campos desde screen_config y guardar en baseCfg + NVS
    lv_lock();
    for (int i = 0; i < 3; i++) {
        strlcpy(baseCfg.wifi[i].ssid, screen_config_get_ssid(i), sizeof(baseCfg.wifi[i].ssid));
        strlcpy(baseCfg.wifi[i].pass, screen_config_get_pass(i), sizeof(baseCfg.wifi[i].pass));
    }
    strlcpy(baseCfg.mqttHost,  screen_config_get_mhost(), sizeof(baseCfg.mqttHost));
    baseCfg.mqttPort = (uint16_t)atoi(screen_config_get_mport());
    if (!baseCfg.mqttPort) baseCfg.mqttPort = 1883;
    strlcpy(baseCfg.mqttUser,  screen_config_get_muser(),  sizeof(baseCfg.mqttUser));
    strlcpy(baseCfg.mqttPass,  screen_config_get_mpass(),  sizeof(baseCfg.mqttPass));
    strlcpy(baseCfg.deviceId,  screen_config_get_devid(),  sizeof(baseCfg.deviceId));
    strlcpy(baseCfg.projectId, screen_config_get_projid(), sizeof(baseCfg.projectId));

    enki_config_set(NVS_NOMBRE,  screen_config_get_nombre());
    enki_config_set(NVS_TIPO,    screen_config_get_tipo());
    enki_config_set(NVS_FILTROS, screen_config_get_filtros());

    screen_config_show_msg("Guardado. Reiniciando...", true);
    lv_unlock();

    baseConfigSave();
    lv_timer_create([](lv_timer_t*) { ESP.restart(); }, 1500, nullptr);
}

// ─── logic_on_message — implementa el contrato enki_logic.h ───────────────────

void logic_on_message(const char* topic, JsonDocument& doc) {
    if (_topic_reg[0]  && strcmp(topic, _topic_reg)  == 0) { _on_register_resp(doc); return; }
    if (_topic_list[0] && strcmp(topic, _topic_list) == 0) { _on_list_active(doc);   return; }

    if (strstr(topic, "/events/pedido/enviado_cocina")) {
        CocOrder o; _pedido_to_coc(doc["data"].as<JsonObjectConst>(), o);
        if (o.id[0] && _lvgl_ready) { lv_lock(); screen_cocina_add_order(o); lv_unlock(); }
        return;
    }
    if (strstr(topic, "/events/pedido/cancelado")) {
        const char* pid = doc["data"]["pedido_id"] | "";
        if (*pid && _lvgl_ready) { lv_lock(); screen_cocina_remove_order(pid); lv_unlock(); }
        return;
    }
    if (!strstr(topic, "/events/cocina/")) return;
    const char* ev = strrchr(topic, '/'); if (!ev) return; ev++;

    JsonObjectConst d = doc["data"].as<JsonObjectConst>();
    const char* pid = d["pedido_id"] | "";
    const char* iid = d["item_id"]   | "";

    if (strcmp(ev, "item_preparando") == 0 && *pid && *iid && _lvgl_ready) {
        lv_lock();
        screen_cocina_update_item(pid, iid, COC_PREPARANDO, d["device_color"] | "");
        lv_unlock();
    } else if (strcmp(ev, "item_preparado") == 0 && *pid && *iid && _lvgl_ready) {
        lv_lock();
        screen_cocina_update_item(pid, iid, COC_LISTO);
        lv_unlock();
    } else if (strcmp(ev, "item_avanzado") == 0 && *pid && *iid && _lvgl_ready) {
        lv_lock();
        screen_cocina_update_item(pid, iid, _parse_estado(d["estado"] | "pendiente"), "");
        lv_unlock();
    } else if (strcmp(ev, "pedido_listo") == 0 && *pid && _lvgl_ready) {
        lv_lock();
        screen_cocina_order_done(pid);
        lv_unlock();
    }
}

void logic_status(JsonDocument& doc) {
    doc["device_id"] = _dev_id;
    doc["nombre"]    = _dev_nombre;
    doc["tipo"]      = _dev_tipo;
    doc["registered"]= _registered;
    doc["screen"]    = (int)_screen;
}

void logic_portal_status(JsonDocument& doc) {
    doc["device_id"] = _dev_id;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

void app_init() {
    _init_dev_id();
    _load_cocina_cfg();

    _lvgl_ready = display_driver_init();
    display_set_backlight(BACKLIGHT_BRIGHTNESS);

    if (_lvgl_ready) {
        lv_lock();
        screen_home_create();
        screen_config_create();
        screen_cocina_create(app_cocina_item_tap, app_cocina_header_tap);
        screen_home_set_wifi(false);
        screen_home_set_mqtt(false);
        screen_home_load();  // Arrancar siempre en HOME
        lv_unlock();
        display_lvgl_task_start();
    }

    wifiSetPortalEnabled(false);
    wifiSetup();

    if (baseCfg.configured && app_wifi_ok()) {
        mqttSetup();
        mqtt.setServer(baseCfg.mqttHost, baseCfg.mqttPort);
        mqttConnect();
    }

    configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
    _last_ntp_ms = millis();

    // Actualizar indicadores iniciales
    if (_lvgl_ready) {
        lv_lock();
        bool w = app_wifi_ok(), m = app_mqtt_ok();
        screen_home_set_wifi(w);
        screen_home_set_mqtt(m);
        screen_cocina_set_wifi(w);
        screen_cocina_set_mqtt(m);
        screen_cocina_set_device_color(_dev_color);
        lv_unlock();
    }

    Serial.printf("[APP] Listo — dev=%s tipo=%s\n", _dev_id, _dev_tipo);
}

// ─── Loop ─────────────────────────────────────────────────────────────────────

void app_loop() {
    _wdt();
    wifiHandleReconnect();
    if (baseCfg.configured) {
        mqttHandleReconnect();
        mqttPublishStatus();
    }
    otaHandle();

    uint32_t now = millis();
    bool wifi_ok = app_wifi_ok();
    bool mqtt_ok = app_mqtt_ok();

    // MQTT reconectado → re-suscribir + registrar
    if (mqtt_ok && !_mqtt_was_ok && baseCfg.configured) {
        _subscribe_all();
        _register_device();
    }
    _mqtt_was_ok = mqtt_ok;

    // Actualizar indicadores de conectividad (cada 2s)
    if (now - _last_status_ms > 2000) {
        _last_status_ms = now;
        if (_lvgl_ready) {
            lv_lock();
            screen_home_set_wifi(wifi_ok);
            screen_home_set_mqtt(mqtt_ok);
            screen_cocina_set_wifi(wifi_ok);
            screen_cocina_set_mqtt(mqtt_ok);
            lv_unlock();
        }
    }

    // Procesar pending action
    Pending::Type ptype = Pending::NONE;
    char poid[48] = "", piid[48] = "";
    AppScreen ptarget = SCREEN_HOME;

    portENTER_CRITICAL(&_pend_mux);
    if (_pending.type != Pending::NONE) {
        ptype   = _pending.type;
        strlcpy(poid, _pending.order_id, sizeof(poid));
        strlcpy(piid, _pending.item_id,  sizeof(piid));
        ptarget = _pending.target_screen;
        _pending.type = Pending::NONE;
    }
    portEXIT_CRITICAL(&_pend_mux);

    switch (ptype) {
        case Pending::GOTO_SCREEN:
            _do_goto(ptarget);
            break;
        case Pending::PREPARE_ITEM:
            if (mqtt_ok) _do_prepare(poid, piid);
            break;
        case Pending::MARK_READY:
            if (mqtt_ok) _do_mark_ready(poid);
            break;
        case Pending::SCAN_WIFI:
            if (_lvgl_ready) { lv_lock(); screen_config_scan_start(); lv_unlock(); }
            {
                int n = WiFi.scanNetworks(false, false, false, 500);
                CfgScanResult results[CFG_SCAN_MAX];
                int cnt = 0;
                if (n > 0) {
                    for (int i = 0; i < n && cnt < CFG_SCAN_MAX; i++) {
                        strlcpy(results[cnt].ssid, WiFi.SSID(i).c_str(), 33);
                        results[cnt].rssi = (int8_t)WiFi.RSSI(i);
                        results[cnt].open = (WiFi.encryptionType(i) == WIFI_AUTH_OPEN);
                        cnt++;
                    }
                    WiFi.scanDelete();
                }
                if (_lvgl_ready) { lv_lock(); screen_config_scan_results(results, cnt); lv_unlock(); }
                Serial.printf("[APP] Scan: %d redes\n", cnt);
            }
            break;
        default: break;
    }

    // Tick timers cocina (cada 30s)
    if (now - _last_clock_ms > 30000) {
        _last_clock_ms = now;
        if (_lvgl_ready) { lv_lock(); screen_cocina_tick(); lv_unlock(); }
    }

    // Re-pedir lista activa (cada 5 min)
    if (mqtt_ok && _registered && now - _last_list_ms > 5UL*60*1000) {
        _request_list();
    }

    // Re-sync NTP (cada 6h)
    if (now - _last_ntp_ms > 6UL*60*60*1000) {
        configTime(0, 0, "pool.ntp.org");
        _last_ntp_ms = now;
    }
}
