/**
 * logic_cocina_display.cpp — Driver lógico: cocina display ESP32-P4
 *
 * Flujo:
 *   1. logic_setup()  → init display + LVGL UI + MQTT subs + pedir lista activa
 *   2. logic_loop()   → LVGL timer handler + NTP clock + watchdog pedidos
 *   3. logic_on_message() → parsear eventos cocina, actualizar estado + UI
 *
 * MQTT subscriptions:
 *   core/+/events/cocina/#          — eventos en tiempo real
 *   core/+/events/periferico/display — display push events
 *   ui/response/{reqId}             — respuesta a list-active (temporal)
 *
 * La URL /cocina se construye automáticamente: http://{mqttHost}/{projectId}/cocina
 */

#include "enki_logic.h"
#include "enki_base.h"
#include "display_driver.h"
#include "ui_cocina.h"
#include <lvgl.h>
#include <time.h>

// ─── Constantes ──────────────────────────────────────────────────────────────

#define MAX_ORDERS        16
#define MAX_ITEMS         8
#define LIST_REQUEST_INTERVAL_MS  (5 * 60 * 1000)  // Re-pedir lista cada 5 min
#define CLOCK_UPDATE_MS   30000
#define NTP_SYNC_INTERVAL_MS (6 * 60 * 60 * 1000)  // Re-sync NTP cada 6h

// Topics del EventBus de Enki:
//   cocina.item_preparando → core/{coreId}/events/cocina/item_preparando
#define TOPIC_COCINA_SUB    "core/+/events/cocina/#"
#define TOPIC_DISPLAY_SUB   "core/+/events/periferico/display"
#define TOPIC_LIST_REQUEST  "ui/request/cocina/list-active"

// ─── Estado ──────────────────────────────────────────────────────────────────

static bool    _displayReady    = false;
static bool    _lvglReady       = false;
static uint32_t _bootMs         = 0;
static uint32_t _lastRequestMs  = 0;
static uint32_t _lastClockMs    = 0;
static uint32_t _lastNtpMs      = 0;
static char    _reqId[48]       = "";
static char    _topicResponse[80] = "";

// ─── MQTT helpers ─────────────────────────────────────────────────────────────

/**
 * Enviar petición a cocina/list-active.
 * Subscribimos al topic de respuesta con un ID único.
 */
static void requestActiveOrders() {
    // ID único por dispositivo + timestamp
    snprintf(_reqId, sizeof(_reqId), "%s-%lu",
        enki_device_id(), (unsigned long)millis());

    // Subscribir antes de publicar para no perder la respuesta
    snprintf(_topicResponse, sizeof(_topicResponse), "ui/response/%s", _reqId);
    enki_mqtt_subscribe(_topicResponse);

    // Publicar request
    char payload[128];
    snprintf(payload, sizeof(payload),
        "{\"request_id\":\"%s\",\"data\":{}}", _reqId);
    enki_mqtt_publish(TOPIC_LIST_REQUEST, payload);

    _lastRequestMs = millis();
    Serial.printf("[COCINA] Solicitando lista activa (reqId=%s)\n", _reqId);
}

// ─── Construcción de UiPedido desde JSON ─────────────────────────────────────

static UiItemEstado parseItemEstado(const char* s) {
    if (!s) return UI_ITEM_PENDIENTE;
    if (strcmp(s, "preparando") == 0) return UI_ITEM_PREPARANDO;
    if (strcmp(s, "listo")      == 0) return UI_ITEM_LISTO;
    return UI_ITEM_PENDIENTE;
}

/**
 * Extraer un UiPedido de un objeto JSON con la estructura de PedidoCocina.
 * Retorna false si faltan campos obligatorios.
 */
static bool pedidoFromJson(JsonObjectConst obj, UiPedido& out) {
    const char* id = obj["pedido_id"];
    if (!id || !*id) return false;

    memset(&out, 0, sizeof(out));
    strlcpy(out.pedido_id,    id,                             sizeof(out.pedido_id));
    strlcpy(out.ref_display,  obj["ref_display"]  | "",       sizeof(out.ref_display));
    strlcpy(out.canal,        obj["canal"]        | "",       sizeof(out.canal));

    // Si ref_display vacío, usar nombre_cuenta
    if (!out.ref_display[0] && obj["nombre_cuenta"].is<const char*>()) {
        strlcpy(out.ref_display, obj["nombre_cuenta"] | "", sizeof(out.ref_display));
    }

    // Items
    JsonArrayConst items = obj["items"].as<JsonArrayConst>();
    out.item_count = 0;
    for (JsonObjectConst item : items) {
        if (out.item_count >= UI_MAX_ITEMS) break;
        UiItem& ui_item = out.items[out.item_count];
        strlcpy(ui_item.nombre, item["nombre"] | "?", sizeof(ui_item.nombre));
        ui_item.cantidad = item["cantidad"] | 1;
        ui_item.estado   = parseItemEstado(item["estado"] | "pendiente");
        out.item_count++;
    }

    out.estado      = UI_PEDIDO_ACTIVO;
    out.received_ms = millis();  // Aproximación — no tenemos el timestamp real
    out.used        = true;
    return true;
}

// ─── Handlers de mensajes MQTT ────────────────────────────────────────────────

static void handleListActive(JsonDocument& doc) {
    // Estructura: { status: 200, data: { pedidos: [...] } }
    // o directamente: { pedidos: [...] }
    JsonArrayConst arr;

    if (doc["data"]["pedidos"].is<JsonArrayConst>()) {
        arr = doc["data"]["pedidos"].as<JsonArrayConst>();
    } else if (doc["pedidos"].is<JsonArrayConst>()) {
        arr = doc["pedidos"].as<JsonArrayConst>();
    } else if (doc["data"].is<JsonArrayConst>()) {
        arr = doc["data"].as<JsonArrayConst>();
    } else {
        Serial.println("[COCINA] list-active: formato inesperado");
        return;
    }

    if (_lvglReady) ui_clear_orders();

    int count = 0;
    for (JsonObjectConst obj : arr) {
        UiPedido p;
        if (pedidoFromJson(obj, p)) {
            if (_lvglReady) ui_add_order(p);
            count++;
        }
    }
    Serial.printf("[COCINA] list-active: %d pedidos activos\n", count);
}

static void handleItemPreparando(JsonDocument& doc) {
    const char* pedido_id  = doc["pedido_id"] | "";
    const char* nombre     = doc["nombre"]    | "";
    if (!*pedido_id || !*nombre) return;

    if (_lvglReady)
        ui_update_item(pedido_id, nombre, UI_ITEM_PREPARANDO);

    Serial.printf("[COCINA] %s — item preparando: %s\n", pedido_id, nombre);
}

static void handleItemPreparado(JsonDocument& doc) {
    const char* pedido_id = doc["pedido_id"] | "";
    const char* nombre    = doc["nombre"]    | "";
    if (!*pedido_id || !*nombre) return;

    if (_lvglReady)
        ui_update_item(pedido_id, nombre, UI_ITEM_LISTO);

    Serial.printf("[COCINA] %s — item listo: %s\n", pedido_id, nombre);
}

static void handlePedidoListo(JsonDocument& doc) {
    const char* pedido_id  = doc["pedido_id"]  | "";
    const char* ref        = doc["ref_display"] | doc["cuenta_id"] | "";
    if (!*pedido_id) return;

    if (_lvglReady)
        ui_order_listo(pedido_id);

    Serial.printf("[COCINA] PEDIDO LISTO: %s (%s)\n", ref, pedido_id);
}

/**
 * Eventos de display push (periferico.display):
 * { "destino": "display-cocina", "data": { "accion": "nuevo_pedido|pedido_listo|actualizar", ... } }
 */
static void handlePerifericoDisplay(JsonDocument& doc) {
    const char* destino = doc["destino"] | "";
    if (strcmp(destino, "display-cocina") != 0) return;  // no es para nosotros

    JsonObjectConst data     = doc["data"].as<JsonObjectConst>();
    const char*     accion   = data["accion"] | "";
    JsonObjectConst contenido = data["contenido"].as<JsonObjectConst>();

    if (strcmp(accion, "nuevo_pedido") == 0) {
        // { pedido_id, cuenta_id, nombre_cuenta, canal, items[{nombre,cantidad,categoria}], items_count }
        UiPedido p;
        memset(&p, 0, sizeof(p));

        strlcpy(p.pedido_id,   contenido["pedido_id"]    | "", sizeof(p.pedido_id));
        strlcpy(p.ref_display, contenido["nombre_cuenta"] | contenido["cuenta_id"] | "",
                sizeof(p.ref_display));
        strlcpy(p.canal,       contenido["canal"]         | "", sizeof(p.canal));
        p.received_ms = millis();
        p.used = true;
        p.estado = UI_PEDIDO_ACTIVO;

        JsonArrayConst items = contenido["items"].as<JsonArrayConst>();
        for (JsonObjectConst item : items) {
            if (p.item_count >= UI_MAX_ITEMS) break;
            strlcpy(p.items[p.item_count].nombre,
                    item["nombre"] | "?", sizeof(p.items[0].nombre));
            p.items[p.item_count].cantidad = item["cantidad"] | 1;
            p.items[p.item_count].estado   = UI_ITEM_PENDIENTE;
            p.item_count++;
        }

        if (_lvglReady && *p.pedido_id) {
            ui_add_order(p);
        }

    } else if (strcmp(accion, "pedido_listo") == 0) {
        const char* pedido_id = contenido["pedido_id"] | "";
        if (*pedido_id && _lvglReady) {
            ui_order_listo(pedido_id);
        }

    } else if (strcmp(accion, "actualizar") == 0) {
        // Refrescar lista completa
        if (enki_mqtt_connected()) requestActiveOrders();
    }
}

// ─── Ruteo de mensajes por topic ──────────────────────────────────────────────

/**
 * Extraer el nombre del evento del topic.
 * "core/core-001/events/cocina/item_preparando" → "item_preparando"
 * "core/core-001/events/cocina/pedido_listo"    → "pedido_listo"
 */
static const char* extractEventName(const char* topic) {
    // Buscar la 4ª '/'
    int slashes = 0;
    const char* p = topic;
    while (*p) {
        if (*p == '/') {
            slashes++;
            if (slashes == 4) return p + 1;
        }
        p++;
    }
    return nullptr;
}

static bool isTopicMatch(const char* topic, const char* prefix, size_t prefixLen) {
    return strncmp(topic, prefix, prefixLen) == 0;
}

// ─── Contrato BASE + LÓGICA ───────────────────────────────────────────────────

void logic_setup() {
    _bootMs = millis();

    // 1. Display LVGL
    _lvglReady = display_driver_init();
    display_set_backlight(BACKLIGHT_BRIGHTNESS);

    if (_lvglReady) {
        ui_init();
        ui_set_wifi(false);
        ui_set_mqtt(false);
    }

    // 2. NTP (usa el host MQTT como servidor de red de referencia)
    configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
    _lastNtpMs = millis();

    // 3. Portal endpoints
    webServer.on("/api/display", HTTP_GET, []() {
        char buf[256];
        snprintf(buf, sizeof(buf),
            "{\"display_ready\":%s,\"lvgl_ready\":%s,\"orders\":0}",
            _displayReady ? "true" : "false",
            _lvglReady ? "true" : "false");
        webServer.send(200, "application/json", buf);
    });

    // 4. Suscribir a topics de cocina
    enki_mqtt_subscribe(TOPIC_COCINA_SUB);
    enki_mqtt_subscribe(TOPIC_DISPLAY_SUB);

    // 5. Pedir lista de pedidos activos
    if (enki_mqtt_connected()) {
        requestActiveOrders();
    }

    if (_lvglReady) {
        ui_set_mqtt(enki_mqtt_connected());
    }

    Serial.printf("[COCINA-DISPLAY] Listo — LVGL=%s panel=%s\n",
        _lvglReady   ? "OK" : "stub",
        _displayReady ? "OK" : "stub");
}

void logic_loop() {
    uint32_t now = millis();

    // LVGL
    if (_lvglReady) {
        display_driver_tick();
        lv_timer_handler();

        // Reloj cada 30s
        if (now - _lastClockMs > CLOCK_UPDATE_MS) {
            ui_tick_clock();
            _lastClockMs = now;
        }
    }

    // Pedir lista activa periódicamente (recovery tras reconexión)
    if (enki_mqtt_connected() &&
        now - _lastRequestMs > LIST_REQUEST_INTERVAL_MS) {
        requestActiveOrders();
    }

    // Re-sync NTP
    if (now - _lastNtpMs > NTP_SYNC_INTERVAL_MS) {
        configTime(0, 0, "pool.ntp.org");
        _lastNtpMs = now;
    }
}

void logic_on_message(const char* topic, JsonDocument& doc) {
    // ── Respuesta a list-active ─────────────────────────────────────────────
    if (_topicResponse[0] && strcmp(topic, _topicResponse) == 0) {
        handleListActive(doc);
        // Unsuscribir del topic temporal
        // (PubSubClient no tiene unsubscribe en la API de enki, así que simplemente
        // ignoraremos futuros mensajes comparando con el reqId)
        _topicResponse[0] = '\0';
        return;
    }

    // ── Evento periferico.display ───────────────────────────────────────────
    // topic: core/+/events/periferico/display
    if (strstr(topic, "/events/periferico/display")) {
        handlePerifericoDisplay(doc);
        return;
    }

    // ── Eventos cocina/* ────────────────────────────────────────────────────
    // topic: core/{coreId}/events/cocina/{event_name}
    if (!strstr(topic, "/events/cocina/")) return;

    const char* eventName = extractEventName(topic);
    if (!eventName) return;

    if (strcmp(eventName, "item_preparando") == 0) {
        handleItemPreparando(doc);
    } else if (strcmp(eventName, "item_preparado") == 0) {
        handleItemPreparado(doc);
    } else if (strcmp(eventName, "pedido_listo") == 0) {
        handlePedidoListo(doc);
    }
    // item_avanzado, device_registered, etc. → ignorar (no afectan la UI de display)
}

void logic_status(JsonDocument& doc) {
    doc["display_ready"] = _displayReady;
    doc["lvgl_ready"]    = _lvglReady;
    doc["uptime_min"]    = (millis() - _bootMs) / 60000;
}

void logic_portal_status(JsonDocument& doc) {
    doc["display"] = _displayReady;
    doc["lvgl"]    = _lvglReady;
}
