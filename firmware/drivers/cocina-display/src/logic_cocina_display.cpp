/**
 * logic_cocina_display.cpp — Driver lógico cocina display (ESP32-P4)
 *
 * MQTT subscriptions:
 *   core/+/events/cocina/#               item_preparando, item_preparado, item_avanzado, pedido_listo
 *   core/+/events/pedido/enviado_cocina   nuevo pedido
 *   core/+/events/pedido/cancelado        pedido cancelado
 *
 * MQTT requests (ui/request/cocina/*):
 *   register-device  → registrarse con nombre, estación, color asignado
 *   list-active      → cargar pedidos activos al arrancar
 *   prepare-item     → tap en item (pendiente→preparando / preparando→avanza)
 *   mark-ready       → tap en header (todo el pedido → listo)
 *
 * Persistencia (NVS namespace "cocina"):
 *   dev_id     → device_id único, generado una vez
 *   dev_nombre → nombre del dispositivo (ej. "COCINA-1")
 *   dev_tipo   → tipo_estacion: "general" | "horno"
 *   dev_filtros→ familias separadas por coma
 *   dev_color  → color hex asignado por el backend
 */

#include "enki_logic.h"
#include "enki_base.h"
#include "enki_wifi.h"
#include "display_driver.h"
#include "ui_cocina.h"
#include <WiFi.h>
#include <lvgl.h>
#include <time.h>

// ─── Topics ──────────────────────────────────────────────────────────────────

#define TOPIC_COCINA           "core/+/events/cocina/#"
#define TOPIC_PEDIDO_NUEVO     "core/+/events/pedido/enviado_cocina"
#define TOPIC_PEDIDO_CANCELADO "core/+/events/pedido/cancelado"

// ─── NVS keys ────────────────────────────────────────────────────────────────

#define NVS_DEVICE_ID   "dev_id"
#define NVS_NOMBRE      "dev_nombre"
#define NVS_TIPO        "dev_tipo"
#define NVS_FILTROS     "dev_filtros"
#define NVS_COLOR       "dev_color"

// ─── Intervalos ──────────────────────────────────────────────────────────────

#define LIST_INTERVAL_MS   (5UL * 60 * 1000)
#define CLOCK_INTERVAL_MS  30000UL
#define NTP_INTERVAL_MS    (6UL * 60 * 60 * 1000)

// ─── Estado del dispositivo ───────────────────────────────────────────────────

static char    _deviceId[48]      = "";
static char    _deviceNombre[32]  = "COCINA";
static char    _deviceTipo[16]    = "general";
static char    _deviceFiltros[64] = "";
static char    _deviceColor[8]    = "#94a3b8";

// ─── Estado de sesión ────────────────────────────────────────────────────────

static bool     _lvglReady        = false;
static uint32_t _bootMs           = 0;
static uint32_t _lastListMs       = 0;
static uint32_t _lastClockMs      = 0;
static uint32_t _lastNtpMs        = 0;
static bool     _mqttWasConnected = false;
static bool     _registered       = false;

// Request/response pendientes
static char _reqId[64]            = "";
static char _topicReg[96]         = "";
static char _topicList[96]        = "";

// ─── Acción táctil (Core 0 LVGL → Core 1 loop) ────────────────────────────────

struct PendingAction {
    enum Type : uint8_t { NONE = 0, PREPARE_ITEM = 1, MARK_READY = 2 };
    volatile Type type;
    char pedido_id[48];
    char item_id[48];
};
static PendingAction _pending = { PendingAction::NONE, {}, {} };

// ─── Device ID único ──────────────────────────────────────────────────────────

static void _init_device_id() {
    const char* saved = enki_config_get(NVS_DEVICE_ID, "");
    if (strlen(saved) > 6) {
        strlcpy(_deviceId, saved, sizeof(_deviceId));
        return;
    }
    uint32_t mac = (uint32_t)(ESP.getEfuseMac() >> 16);
    snprintf(_deviceId, sizeof(_deviceId), "disp_%06x", mac);
    enki_config_set(NVS_DEVICE_ID, _deviceId);
    Serial.printf("[COCINA] Device ID: %s\n", _deviceId);
}

// ─── Config NVS ───────────────────────────────────────────────────────────────

static void _load_config() {
    strlcpy(_deviceNombre,  enki_config_get(NVS_NOMBRE,  "COCINA"),   sizeof(_deviceNombre));
    strlcpy(_deviceTipo,    enki_config_get(NVS_TIPO,    "general"),  sizeof(_deviceTipo));
    strlcpy(_deviceFiltros, enki_config_get(NVS_FILTROS, ""),          sizeof(_deviceFiltros));
    strlcpy(_deviceColor,   enki_config_get(NVS_COLOR,   "#94a3b8"),  sizeof(_deviceColor));
}

static void _save_config() {
    enki_config_set(NVS_NOMBRE,  _deviceNombre);
    enki_config_set(NVS_TIPO,    _deviceTipo);
    enki_config_set(NVS_FILTROS, _deviceFiltros);
}

// ─── MQTT helpers ─────────────────────────────────────────────────────────────

static void _new_req_id() {
    snprintf(_reqId, sizeof(_reqId), "%s-%lu", _deviceId, (unsigned long)millis());
}

static void _subscribe_topics() {
    enki_mqtt_subscribe(TOPIC_COCINA);
    enki_mqtt_subscribe(TOPIC_PEDIDO_NUEVO);
    enki_mqtt_subscribe(TOPIC_PEDIDO_CANCELADO);
    if (_topicReg[0])  enki_mqtt_subscribe(_topicReg);
    if (_topicList[0]) enki_mqtt_subscribe(_topicList);
}

static void _register_device() {
    _new_req_id();
    snprintf(_topicReg, sizeof(_topicReg), "ui/response/%s", _reqId);
    enki_mqtt_subscribe(_topicReg);

    // Construir array JSON de filtros
    char fj[128] = "[]";
    if (_deviceFiltros[0]) {
        char tmp[64];
        strlcpy(tmp, _deviceFiltros, sizeof(tmp));
        char arr[128] = "[";
        char* ctx = nullptr;
        char* tok = strtok_r(tmp, ",", &ctx);
        bool first = true;
        while (tok) {
            while (*tok == ' ') tok++;  // trim
            if (*tok) {
                if (!first) strlcat(arr, ",", sizeof(arr));
                char q[32];
                snprintf(q, sizeof(q), "\"%s\"", tok);
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
        "\"device_id\":\"%s\","
        "\"nombre\":\"%s\","
        "\"estacion\":\"%s\","
        "\"tipo_estacion\":\"%s\","
        "\"filtros\":{\"familias\":%s}}}",
        _reqId, _deviceId, _deviceNombre,
        _deviceNombre, _deviceTipo, fj);

    enki_mqtt_publish("ui/request/cocina/register-device", payload);
    Serial.printf("[COCINA] register-device → %s tipo=%s\n", _deviceId, _deviceTipo);
}

static void _request_list_active() {
    _new_req_id();
    snprintf(_topicList, sizeof(_topicList), "ui/response/%s", _reqId);
    enki_mqtt_subscribe(_topicList);

    char payload[128];
    snprintf(payload, sizeof(payload), "{\"request_id\":\"%s\",\"data\":{}}", _reqId);
    enki_mqtt_publish("ui/request/cocina/list-active", payload);
    _lastListMs = millis();
    Serial.println("[COCINA] list-active solicitado");
}

static void _do_prepare_item(const char* pedido_id, const char* item_id) {
    char payload[256];
    snprintf(payload, sizeof(payload),
        "{\"data\":{\"item_id\":\"%s\",\"device_id\":\"%s\"}}",
        item_id, _deviceId);
    enki_mqtt_publish("ui/request/cocina/prepare-item", payload);
    Serial.printf("[COCINA] prepare-item %s\n", item_id);
}

static void _do_mark_ready(const char* pedido_id) {
    char payload[192];
    snprintf(payload, sizeof(payload),
        "{\"data\":{\"pedido_id\":\"%s\",\"device_id\":\"%s\"}}",
        pedido_id, _deviceId);
    enki_mqtt_publish("ui/request/cocina/mark-ready", payload);
    Serial.printf("[COCINA] mark-ready %s\n", pedido_id);
}

// ─── Callbacks de touch (llamados desde LVGL task, Core 0) ───────────────────

static void _on_item_tap(const char* pedido_id, const char* item_id) {
    if (_pending.type != PendingAction::NONE) return;
    strlcpy((char*)_pending.pedido_id, pedido_id, sizeof(_pending.pedido_id));
    strlcpy((char*)_pending.item_id,   item_id,   sizeof(_pending.item_id));
    _pending.type = PendingAction::PREPARE_ITEM;
}

static void _on_header_tap(const char* pedido_id) {
    if (_pending.type != PendingAction::NONE) return;
    strlcpy((char*)_pending.pedido_id, pedido_id, sizeof(_pending.pedido_id));
    _pending.type = PendingAction::MARK_READY;
}

// ─── Config panel callback ────────────────────────────────────────────────────

static void _on_config_apply(const UiDeviceConfig& cfg) {
    strlcpy(_deviceNombre,  cfg.nombre,        sizeof(_deviceNombre));
    strlcpy(_deviceTipo,    cfg.tipo_estacion, sizeof(_deviceTipo));
    strlcpy(_deviceFiltros, cfg.filtros,       sizeof(_deviceFiltros));
    _save_config();
    if (enki_mqtt_connected()) _register_device();
    Serial.printf("[COCINA] Config aplicada: tipo=%s\n", _deviceTipo);
}

// ─── Parser de datos de pedido ────────────────────────────────────────────────

static UiItemEstado _parse_estado(const char* s) {
    if (!s || !*s)              return UI_ITEM_PENDIENTE;
    if (strcmp(s, "preparando") == 0) return UI_ITEM_PREPARANDO;
    if (strcmp(s, "listo")      == 0) return UI_ITEM_LISTO;
    return UI_ITEM_PENDIENTE;
}

static bool _pedido_from_json(JsonObjectConst obj, UiPedido& out) {
    const char* id = obj["pedido_id"] | "";
    if (!*id) return false;

    memset(&out, 0, sizeof(out));
    strlcpy(out.pedido_id,        id,                                  sizeof(out.pedido_id));
    strlcpy(out.cuenta_id,        obj["cuenta_id"]        | "",        sizeof(out.cuenta_id));
    strlcpy(out.canal,            obj["canal"]            | "",        sizeof(out.canal));
    strlcpy(out.notas_generales,  obj["notas_generales"]  | "",        sizeof(out.notas_generales));

    // ref_display: nombre_cuenta > ref_display > cuenta_id
    const char* ref = obj["nombre_cuenta"] | obj["ref_display"] | obj["cuenta_id"] | id;
    strlcpy(out.ref_display, ref, sizeof(out.ref_display));

    JsonArrayConst items = obj["items"].as<JsonArrayConst>();
    for (JsonObjectConst it : items) {
        if (out.item_count >= UI_MAX_ITEMS) break;
        UiItem& ui = out.items[out.item_count];

        strlcpy(ui.item_id, it["item_id"] | "", sizeof(ui.item_id));
        strlcpy(ui.nombre,  it["nombre"]  | "?", sizeof(ui.nombre));
        strlcpy(ui.notas,   it["notas"]   | "",  sizeof(ui.notas));
        ui.cantidad = it["cantidad"] | 1;
        ui.pase     = it["pase"]     | 0;
        ui.estado   = _parse_estado(it["estado"] | "pendiente");

        // Variaciones: quitar
        JsonArrayConst quitar = it["variaciones"]["ingredientes_quitar"].as<JsonArrayConst>();
        char qbuf[UI_MAX_VAR_LEN] = "";
        for (const char* q : quitar) {
            if (qbuf[0]) strlcat(qbuf, ", ", sizeof(qbuf));
            strlcat(qbuf, q, sizeof(qbuf));
        }
        strlcpy(ui.quitar, qbuf, sizeof(ui.quitar));

        out.item_count++;
    }

    out.estado      = UI_PEDIDO_ACTIVO;
    out.received_ms = millis();
    out.used        = true;
    return true;
}

// ─── Handlers de mensajes ─────────────────────────────────────────────────────

static void _handle_register_response(JsonDocument& doc) {
    const char* color = doc["data"]["color"] | "";
    if (*color) {
        strlcpy(_deviceColor, color, sizeof(_deviceColor));
        enki_config_set(NVS_COLOR, _deviceColor);
        if (_lvglReady) {
            lv_lock();
            ui_set_device_color(_deviceColor);
            lv_unlock();
        }
        Serial.printf("[COCINA] Color asignado: %s\n", _deviceColor);
    }
    _registered = true;
    _topicReg[0] = '\0';

    // Con el device registrado, pedir lista activa
    _request_list_active();
}

static void _handle_list_active(JsonDocument& doc) {
    JsonArrayConst arr;
    if      (doc["data"]["pedidos"].is<JsonArrayConst>()) arr = doc["data"]["pedidos"].as<JsonArrayConst>();
    else if (doc["pedidos"].is<JsonArrayConst>())         arr = doc["pedidos"].as<JsonArrayConst>();
    else if (doc["data"].is<JsonArrayConst>())            arr = doc["data"].as<JsonArrayConst>();
    else { Serial.println("[COCINA] list-active: formato inesperado"); return; }

    if (_lvglReady) { lv_lock(); ui_clear_orders(); lv_unlock(); }

    int n = 0;
    for (JsonObjectConst obj : arr) {
        UiPedido p;
        if (_pedido_from_json(obj, p)) {
            if (_lvglReady) { lv_lock(); ui_add_order(p); lv_unlock(); }
            n++;
        }
    }
    _topicList[0] = '\0';
    Serial.printf("[COCINA] list-active: %d pedidos activos\n", n);
}

static void _handle_pedido_nuevo(JsonDocument& doc) {
    JsonObjectConst data = doc["data"].as<JsonObjectConst>();
    UiPedido p;
    if (!_pedido_from_json(data, p)) return;
    if (_lvglReady) { lv_lock(); ui_add_order(p); lv_unlock(); }
    Serial.printf("[COCINA] Nuevo pedido: %s (%s)\n", p.ref_display, p.pedido_id);
}

static void _handle_item_preparando(JsonDocument& doc) {
    JsonObjectConst d = doc["data"].as<JsonObjectConst>();
    const char* pid   = d["pedido_id"]    | "";
    const char* iid   = d["item_id"]      | "";
    const char* color = d["device_color"] | "";
    if (!*pid || !*iid) return;
    if (_lvglReady) { lv_lock(); ui_update_item_by_id(pid, iid, UI_ITEM_PREPARANDO, color); lv_unlock(); }
}

static void _handle_item_preparado(JsonDocument& doc) {
    JsonObjectConst d = doc["data"].as<JsonObjectConst>();
    const char* pid = d["pedido_id"] | "";
    const char* iid = d["item_id"]   | "";
    if (!*pid || !*iid) return;
    if (_lvglReady) { lv_lock(); ui_update_item_by_id(pid, iid, UI_ITEM_LISTO); lv_unlock(); }
}

static void _handle_item_avanzado(JsonDocument& doc) {
    // Item pasa a la siguiente estación — reset a pendiente (o preparando si auto_preparar)
    JsonObjectConst d  = doc["data"].as<JsonObjectConst>();
    const char* pid    = d["pedido_id"] | "";
    const char* iid    = d["item_id"]   | "";
    const char* estado = d["estado"]    | "pendiente";
    if (!*pid || !*iid) return;
    // Limpiar device_color al avanzar de estación
    if (_lvglReady) { lv_lock(); ui_update_item_by_id(pid, iid, _parse_estado(estado), ""); lv_unlock(); }
}

static void _handle_pedido_listo(JsonDocument& doc) {
    const char* pid = doc["data"]["pedido_id"] | "";
    if (!*pid) return;
    if (_lvglReady) { lv_lock(); ui_order_listo(pid); lv_unlock(); }
    Serial.printf("[COCINA] Pedido listo: %s\n", pid);
}

static void _handle_pedido_cancelado(JsonDocument& doc) {
    const char* pid = doc["data"]["pedido_id"] | "";
    if (!*pid) return;
    if (_lvglReady) { lv_lock(); ui_remove_order(pid); lv_unlock(); }
    Serial.printf("[COCINA] Pedido cancelado: %s\n", pid);
}

// ─── Contrato BASE + LÓGICA ───────────────────────────────────────────────────

void logic_setup() {
    _bootMs = millis();
    _pending.type = PendingAction::NONE;

    // 1. Device config desde NVS
    _init_device_id();
    _load_config();

    // 2. Display + LVGL
    _lvglReady = display_driver_init();
    display_set_backlight(BACKLIGHT_BRIGHTNESS);

    if (_lvglReady) {
        lv_lock();
        ui_init();
        ui_set_wifi(false);
        ui_set_mqtt(false);
        ui_set_device_color(_deviceColor);
        ui_set_item_tap_cb(_on_item_tap);
        ui_set_header_tap_cb(_on_header_tap);
        UiDeviceConfig cfg;
        strlcpy(cfg.nombre,        _deviceNombre,  sizeof(cfg.nombre));
        strlcpy(cfg.tipo_estacion, _deviceTipo,    sizeof(cfg.tipo_estacion));
        strlcpy(cfg.filtros,       _deviceFiltros, sizeof(cfg.filtros));
        ui_set_config(cfg, _on_config_apply);
        lv_unlock();
        display_lvgl_task_start();
    }

    // 3. NTP
    configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
    _lastNtpMs = millis();

    // 4. MQTT — si ya conectado al arrancar
    if (enki_mqtt_connected()) {
        _subscribe_topics();
        _register_device();  // list-active se pide en la respuesta del register
    }

    if (_lvglReady) {
        lv_lock();
        ui_set_wifi(WiFi.status() == WL_CONNECTED);
        ui_set_mqtt(enki_mqtt_connected());
        lv_unlock();
    }

    Serial.printf("[COCINA] Listo — device=%s tipo=%s\n", _deviceId, _deviceTipo);
}

void logic_loop() {
    uint32_t now = millis();
    bool wifiNow = (WiFi.status() == WL_CONNECTED);
    bool mqttNow = enki_mqtt_connected();

    // Detectar reconexión MQTT → re-suscribir y registrar de nuevo
    if (mqttNow && !_mqttWasConnected) {
        _subscribe_topics();
        _register_device();
        Serial.println("[COCINA] MQTT reconectado — re-suscrito + re-registered");
    }
    _mqttWasConnected = mqttNow;

    // Indicadores de conectividad
    if (_lvglReady) {
        static bool lw = false, lm = false;
        if (wifiNow != lw || mqttNow != lm) {
            lv_lock();
            ui_set_wifi(wifiNow);
            ui_set_mqtt(mqttNow);
            lv_unlock();
            lw = wifiNow; lm = mqttNow;
        }
    }

    // Procesar acción táctil pendiente (vino de Core 0) en Core 1
    if (_pending.type != PendingAction::NONE && mqttNow) {
        PendingAction::Type t = _pending.type;
        char pid[48], iid[48];
        strlcpy(pid, (const char*)_pending.pedido_id, sizeof(pid));
        strlcpy(iid, (const char*)_pending.item_id,   sizeof(iid));
        _pending.type = PendingAction::NONE;
        if      (t == PendingAction::PREPARE_ITEM) _do_prepare_item(pid, iid);
        else if (t == PendingAction::MARK_READY)   _do_mark_ready(pid);
    }

    // Reloj cada 30s
    if (_lvglReady && now - _lastClockMs > CLOCK_INTERVAL_MS) {
        lv_lock();
        ui_tick_clock();
        lv_unlock();
        _lastClockMs = now;
    }

    // Re-pedir lista activa periódicamente
    if (mqttNow && _registered && now - _lastListMs > LIST_INTERVAL_MS) {
        _request_list_active();
    }

    // Re-sync NTP
    if (now - _lastNtpMs > NTP_INTERVAL_MS) {
        configTime(0, 0, "pool.ntp.org");
        _lastNtpMs = now;
    }
}

void logic_on_message(const char* topic, JsonDocument& doc) {
    // Respuestas a requests
    if (_topicReg[0]  && strcmp(topic, _topicReg)  == 0) { _handle_register_response(doc); return; }
    if (_topicList[0] && strcmp(topic, _topicList) == 0) { _handle_list_active(doc);        return; }

    // Nuevo pedido
    if (strstr(topic, "/events/pedido/enviado_cocina")) { _handle_pedido_nuevo(doc);     return; }

    // Pedido cancelado
    if (strstr(topic, "/events/pedido/cancelado"))     { _handle_pedido_cancelado(doc); return; }

    // Eventos cocina/* — extraer nombre del evento (última sección del topic)
    if (!strstr(topic, "/events/cocina/")) return;
    const char* ev = strrchr(topic, '/');
    if (!ev) return;
    ev++;

    if      (strcmp(ev, "item_preparando") == 0) _handle_item_preparando(doc);
    else if (strcmp(ev, "item_preparado")  == 0) _handle_item_preparado(doc);
    else if (strcmp(ev, "item_avanzado")   == 0) _handle_item_avanzado(doc);
    else if (strcmp(ev, "pedido_listo")    == 0) _handle_pedido_listo(doc);
}

void logic_status(JsonDocument& doc) {
    doc["device_id"]     = _deviceId;
    doc["device_nombre"] = _deviceNombre;
    doc["tipo_estacion"] = _deviceTipo;
    doc["registered"]    = _registered;
    doc["lvgl_ready"]    = _lvglReady;
}

void logic_portal_status(JsonDocument& doc) {
    doc["device_id"]     = _deviceId;
    doc["tipo_estacion"] = _deviceTipo;
    doc["registered"]    = _registered;
}
