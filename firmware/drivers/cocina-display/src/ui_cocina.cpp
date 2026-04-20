/**
 * ui_cocina.cpp — LVGL UI para pantalla de cocina (ESP32-P4, 800×1280)
 *
 * Diseño oscuro, minimalista: fondo #0f172a, tarjetas #1e293b.
 * Sin librerías de terceros — solo LVGL 9.x puro.
 */

#include "ui_cocina.h"

// ─── Paleta de colores ───────────────────────────────────────────────────────

#define C_BG          lv_color_hex(0x0f172a)
#define C_SURFACE     lv_color_hex(0x1e293b)
#define C_BORDER      lv_color_hex(0x334155)
#define C_TEXT        lv_color_hex(0xf1f5f9)
#define C_TEXT_DIM    lv_color_hex(0x94a3b8)
#define C_GREEN       lv_color_hex(0x22c55e)
#define C_AMBER       lv_color_hex(0xf59e0b)
#define C_RED         lv_color_hex(0xef4444)
#define C_GRAY        lv_color_hex(0x475569)
#define C_TITLE       lv_color_hex(0xf8fafc)

// ─── Estado interno ──────────────────────────────────────────────────────────

static lv_obj_t* _screen       = nullptr;
static lv_obj_t* _lbl_clock    = nullptr;
static lv_obj_t* _dot_wifi     = nullptr;
static lv_obj_t* _dot_mqtt     = nullptr;
static lv_obj_t* _lbl_count    = nullptr;
static lv_obj_t* _scroll_cont  = nullptr;

struct CardSlot {
    UiPedido   data;
    lv_obj_t*  card;         // contenedor raíz de la tarjeta
    lv_obj_t*  item_labels[UI_MAX_ITEMS];
    lv_obj_t*  item_badges[UI_MAX_ITEMS];
    bool       fading;
};

static CardSlot _cards[UI_MAX_ORDERS];
static int      _card_count = 0;

// ─── Helpers de estilo ───────────────────────────────────────────────────────

static void _bg(lv_obj_t* o, lv_color_t c) {
    lv_obj_set_style_bg_color(o, c, 0);
    lv_obj_set_style_bg_opa(o, LV_OPA_COVER, 0);
}

static void _text(lv_obj_t* o, lv_color_t c) {
    lv_obj_set_style_text_color(o, c, 0);
}

static void _border(lv_obj_t* o, lv_color_t c, int w = 1) {
    lv_obj_set_style_border_color(o, c, 0);
    lv_obj_set_style_border_width(o, w, 0);
    lv_obj_set_style_border_opa(o, LV_OPA_COVER, 0);
}

static lv_color_t _estado_color(UiItemEstado e) {
    switch (e) {
        case UI_ITEM_PREPARANDO: return C_AMBER;
        case UI_ITEM_LISTO:      return C_GREEN;
        default:                 return C_GRAY;
    }
}

static const char* _estado_label(UiItemEstado e) {
    switch (e) {
        case UI_ITEM_PREPARANDO: return "prep";
        case UI_ITEM_LISTO:      return "listo";
        default:                 return "pend";
    }
}

static const char* _canal_icon(const char* canal) {
    if (!canal || !*canal) return "";
    if (strcmp(canal, "mesa")     == 0) return "M";
    if (strcmp(canal, "telefono") == 0) return "T";
    if (strcmp(canal, "llevar")   == 0) return "L";
    if (strcmp(canal, "glovo")    == 0) return "G";
    if (strcmp(canal, "whatsapp") == 0) return "W";
    return "?";
}

static void _update_count_label() {
    if (!_lbl_count) return;
    char buf[24];
    snprintf(buf, sizeof(buf), "%d pedido%s activo%s",
        _card_count,
        _card_count == 1 ? "" : "s",
        _card_count == 1 ? "" : "s");
    lv_label_set_text(_lbl_count, buf);
}

// ─── Construcción de tarjetas ────────────────────────────────────────────────

static lv_obj_t* _make_badge(lv_obj_t* parent, UiItemEstado estado) {
    lv_obj_t* badge = lv_obj_create(parent);
    lv_obj_set_size(badge, 60, 22);
    lv_obj_set_style_radius(badge, 4, 0);
    lv_obj_set_style_pad_all(badge, 0, 0);
    lv_obj_set_style_border_width(badge, 0, 0);
    _bg(badge, _estado_color(estado));

    lv_obj_t* lbl = lv_label_create(badge);
    lv_label_set_text(lbl, _estado_label(estado));
    lv_obj_set_style_text_font(lbl, &lv_font_montserrat_12, 0);
    _text(lbl, C_TEXT);
    lv_obj_center(lbl);

    return badge;
}

static lv_obj_t* _make_card(lv_obj_t* parent, const UiPedido& p) {
    lv_obj_t* card = lv_obj_create(parent);
    lv_obj_set_width(card, lv_pct(100));
    lv_obj_set_height(card, LV_SIZE_CONTENT);
    lv_obj_set_style_radius(card, 10, 0);
    lv_obj_set_style_pad_all(card, 14, 0);
    lv_obj_set_style_pad_row(card, 8, 0);
    lv_obj_set_style_margin_bottom(card, 10, 0);
    lv_obj_set_style_border_width(card, 1, 0);
    lv_obj_set_style_border_color(card, C_BORDER, 0);
    lv_obj_set_flex_flow(card, LV_FLEX_FLOW_COLUMN);
    lv_obj_clear_flag(card, LV_OBJ_FLAG_SCROLLABLE);
    _bg(card, C_SURFACE);

    // ── Cabecera: canal | ref_display ──────────────────────────────────────
    lv_obj_t* header = lv_obj_create(card);
    lv_obj_set_width(header, lv_pct(100));
    lv_obj_set_height(header, LV_SIZE_CONTENT);
    lv_obj_set_style_pad_all(header, 0, 0);
    lv_obj_set_style_border_width(header, 0, 0);
    lv_obj_set_flex_flow(header, LV_FLEX_FLOW_ROW);
    lv_obj_set_style_flex_main_place(header, LV_FLEX_ALIGN_START, 0);
    lv_obj_set_style_flex_cross_place(header, LV_FLEX_ALIGN_CENTER, 0);
    lv_obj_set_style_flex_track_place(header, LV_FLEX_ALIGN_CENTER, 0);
    _bg(header, C_SURFACE);
    lv_obj_clear_flag(header, LV_OBJ_FLAG_SCROLLABLE);

    // Canal badge
    lv_obj_t* canal_badge = lv_obj_create(header);
    lv_obj_set_size(canal_badge, 28, 28);
    lv_obj_set_style_radius(canal_badge, 14, 0);
    lv_obj_set_style_pad_all(canal_badge, 0, 0);
    lv_obj_set_style_border_width(canal_badge, 0, 0);
    lv_obj_set_style_margin_right(canal_badge, 10, 0);
    _bg(canal_badge, C_GRAY);
    lv_obj_t* canal_lbl = lv_label_create(canal_badge);
    lv_label_set_text(canal_lbl, _canal_icon(p.canal));
    lv_obj_set_style_text_font(canal_lbl, &lv_font_montserrat_12, 0);
    _text(canal_lbl, C_TEXT);
    lv_obj_center(canal_lbl);

    // Ref display (nombre del pedido)
    lv_obj_t* ref_lbl = lv_label_create(header);
    lv_label_set_text(ref_lbl, p.ref_display[0] ? p.ref_display : p.pedido_id);
    lv_obj_set_style_text_font(ref_lbl, &lv_font_montserrat_20, 0);
    _text(ref_lbl, C_TITLE);
    lv_obj_set_flex_grow(ref_lbl, 1);

    // Tiempo desde recibido
    lv_obj_t* time_lbl = lv_label_create(header);
    char time_buf[16];
    uint32_t elapsed_s = (millis() - p.received_ms) / 1000;
    if (elapsed_s < 60)       snprintf(time_buf, sizeof(time_buf), "%ds", (int)elapsed_s);
    else                      snprintf(time_buf, sizeof(time_buf), "%dm", (int)(elapsed_s / 60));
    lv_label_set_text(time_lbl, time_buf);
    lv_obj_set_style_text_font(time_lbl, &lv_font_montserrat_12, 0);
    _text(time_lbl, C_TEXT_DIM);

    // ── Items ───────────────────────────────────────────────────────────────
    for (int i = 0; i < p.item_count && i < UI_MAX_ITEMS; i++) {
        const UiItem& item = p.items[i];

        lv_obj_t* row = lv_obj_create(card);
        lv_obj_set_width(row, lv_pct(100));
        lv_obj_set_height(row, LV_SIZE_CONTENT);
        lv_obj_set_style_pad_all(row, 0, 0);
        lv_obj_set_style_border_width(row, 0, 0);
        lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
        lv_obj_set_style_flex_main_place(row, LV_FLEX_ALIGN_START, 0);
        lv_obj_set_style_flex_cross_place(row, LV_FLEX_ALIGN_CENTER, 0);
        _bg(row, C_SURFACE);
        lv_obj_clear_flag(row, LV_OBJ_FLAG_SCROLLABLE);

        // Dot de color según estado
        lv_obj_t* dot = lv_obj_create(row);
        lv_obj_set_size(dot, 8, 8);
        lv_obj_set_style_radius(dot, 4, 0);
        lv_obj_set_style_border_width(dot, 0, 0);
        lv_obj_set_style_margin_right(dot, 8, 0);
        _bg(dot, _estado_color(item.estado));

        // Nombre + cantidad
        char item_buf[80];
        snprintf(item_buf, sizeof(item_buf), "x%d %s", item.cantidad, item.nombre);
        lv_obj_t* item_lbl = lv_label_create(row);
        lv_label_set_text(item_lbl, item_buf);
        lv_label_set_long_mode(item_lbl, LV_LABEL_LONG_DOT);
        lv_obj_set_style_text_font(item_lbl, &lv_font_montserrat_14, 0);
        _text(item_lbl, C_TEXT);
        lv_obj_set_flex_grow(item_lbl, 1);

        // Badge de estado
        _make_badge(row, item.estado);
    }

    return card;
}

static int _find_card(const char* pedido_id) {
    for (int i = 0; i < UI_MAX_ORDERS; i++) {
        if (_cards[i].data.used &&
            strcmp(_cards[i].data.pedido_id, pedido_id) == 0) {
            return i;
        }
    }
    return -1;
}

static int _alloc_slot() {
    for (int i = 0; i < UI_MAX_ORDERS; i++) {
        if (!_cards[i].data.used) return i;
    }
    // Desalojar el más antiguo
    uint32_t oldest = UINT32_MAX;
    int idx = 0;
    for (int i = 0; i < UI_MAX_ORDERS; i++) {
        if (_cards[i].data.received_ms < oldest) {
            oldest = _cards[i].data.received_ms;
            idx = i;
        }
    }
    if (_cards[idx].card) {
        lv_obj_delete(_cards[idx].card);
        _cards[idx].card = nullptr;
    }
    _card_count = (_card_count > 0) ? _card_count - 1 : 0;
    return idx;
}

// ─── API pública ─────────────────────────────────────────────────────────────

void ui_init() {
    lv_obj_t* scr = lv_screen_active();
    _screen = scr;
    _bg(scr, C_BG);
    lv_obj_set_style_pad_all(scr, 0, 0);
    lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);

    // ── Status bar ──────────────────────────────────────────────────────────
    lv_obj_t* bar = lv_obj_create(scr);
    lv_obj_set_size(bar, DISPLAY_WIDTH, 60);
    lv_obj_align(bar, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_flex_flow(bar, LV_FLEX_FLOW_ROW);
    lv_obj_set_style_flex_cross_place(bar, LV_FLEX_ALIGN_CENTER, 0);
    lv_obj_set_style_pad_hor(bar, 20, 0);
    lv_obj_set_style_pad_ver(bar, 0, 0);
    lv_obj_set_style_border_width(bar, 0, 0);
    lv_obj_set_style_border_side(bar, LV_BORDER_SIDE_BOTTOM, 0);
    lv_obj_set_style_border_color(bar, C_BORDER, 0);
    lv_obj_set_style_border_width(bar, 1, 0);
    lv_obj_clear_flag(bar, LV_OBJ_FLAG_SCROLLABLE);
    _bg(bar, lv_color_hex(0x111827));

    // Titulo
    lv_obj_t* title = lv_label_create(bar);
    lv_label_set_text(title, "COCINA");
    lv_obj_set_style_text_font(title, &lv_font_montserrat_16, 0);
    lv_obj_set_style_text_letter_space(title, 3, 0);
    _text(title, C_TITLE);
    lv_obj_set_flex_grow(title, 0);

    // Contador (stretch)
    _lbl_count = lv_label_create(bar);
    lv_label_set_text(_lbl_count, "");
    lv_obj_set_style_text_font(_lbl_count, &lv_font_montserrat_14, 0);
    _text(_lbl_count, C_TEXT_DIM);
    lv_obj_set_style_pad_left(_lbl_count, 20, 0);
    lv_obj_set_flex_grow(_lbl_count, 1);

    // Punto WiFi
    _dot_wifi = lv_obj_create(bar);
    lv_obj_set_size(_dot_wifi, 10, 10);
    lv_obj_set_style_radius(_dot_wifi, 5, 0);
    lv_obj_set_style_border_width(_dot_wifi, 0, 0);
    lv_obj_set_style_margin_right(_dot_wifi, 6, 0);
    _bg(_dot_wifi, C_GRAY);

    // Punto MQTT
    _dot_mqtt = lv_obj_create(bar);
    lv_obj_set_size(_dot_mqtt, 10, 10);
    lv_obj_set_style_radius(_dot_mqtt, 5, 0);
    lv_obj_set_style_border_width(_dot_mqtt, 0, 0);
    lv_obj_set_style_margin_right(_dot_mqtt, 16, 0);
    _bg(_dot_mqtt, C_GRAY);

    // Reloj
    _lbl_clock = lv_label_create(bar);
    lv_label_set_text(_lbl_clock, "--:--");
    lv_obj_set_style_text_font(_lbl_clock, &lv_font_montserrat_14, 0);
    _text(_lbl_clock, C_TEXT_DIM);

    // ── Área scrollable de tarjetas ─────────────────────────────────────────
    _scroll_cont = lv_obj_create(scr);
    lv_obj_set_size(_scroll_cont, DISPLAY_WIDTH, DISPLAY_HEIGHT - 60);
    lv_obj_align(_scroll_cont, LV_ALIGN_TOP_LEFT, 0, 60);
    lv_obj_set_flex_flow(_scroll_cont, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_all(_scroll_cont, 12, 0);
    lv_obj_set_style_pad_row(_scroll_cont, 0, 0);
    lv_obj_set_style_border_width(_scroll_cont, 0, 0);
    lv_obj_set_scroll_dir(_scroll_cont, LV_DIR_VER);
    lv_obj_set_scrollbar_mode(_scroll_cont, LV_SCROLLBAR_MODE_AUTO);
    _bg(_scroll_cont, C_BG);

    // ── Placeholder vacío ───────────────────────────────────────────────────
    lv_obj_t* empty = lv_label_create(_scroll_cont);
    lv_label_set_text(empty, "Esperando pedidos...");
    lv_obj_set_style_text_font(empty, &lv_font_montserrat_16, 0);
    _text(empty, C_GRAY);
    lv_obj_align(empty, LV_ALIGN_CENTER, 0, 0);

    _update_count_label();
}

void ui_set_wifi(bool connected) {
    if (!_dot_wifi) return;
    _bg(_dot_wifi, connected ? C_GREEN : C_RED);
}

void ui_set_mqtt(bool connected) {
    if (!_dot_mqtt) return;
    _bg(_dot_mqtt, connected ? C_GREEN : C_AMBER);
}

void ui_add_order(const UiPedido& p) {
    if (_find_card(p.pedido_id) >= 0) {
        // Ya existe — no duplicar
        return;
    }

    int idx = _alloc_slot();
    _cards[idx].data = p;
    _cards[idx].data.used = true;
    _cards[idx].fading = false;

    // Limpiar placeholder si es el primer pedido
    if (_card_count == 0) {
        lv_obj_clean(_scroll_cont);
    }

    _cards[idx].card = _make_card(_scroll_cont, p);
    _card_count++;
    _update_count_label();
}

void ui_update_item(const char* pedido_id, const char* item_nombre, UiItemEstado estado) {
    int idx = _find_card(pedido_id);
    if (idx < 0 || !_cards[idx].card) return;

    UiPedido& p = _cards[idx].data;
    bool changed = false;

    for (int i = 0; i < p.item_count; i++) {
        if (strcmp(p.items[i].nombre, item_nombre) == 0) {
            p.items[i].estado = estado;
            changed = true;
            break;
        }
    }

    if (!changed) return;

    // Reconstruir tarjeta
    lv_obj_delete(_cards[idx].card);
    _cards[idx].card = _make_card(_scroll_cont, p);
}

void ui_order_listo(const char* pedido_id) {
    int idx = _find_card(pedido_id);
    if (idx < 0 || !_cards[idx].card) return;

    _cards[idx].data.estado = UI_PEDIDO_LISTO;
    _cards[idx].fading = true;

    // Borde verde al marcar listo
    _border(_cards[idx].card, C_GREEN, 2);

    // Fade out tras 5 segundos
    lv_anim_t a;
    lv_anim_init(&a);
    lv_anim_set_var(&a, _cards[idx].card);
    lv_anim_set_exec_cb(&a, [](void* obj, int32_t v) {
        lv_obj_set_style_opa((lv_obj_t*)obj, (lv_opa_t)v, 0);
    });
    lv_anim_set_values(&a, LV_OPA_COVER, LV_OPA_TRANSP);
    lv_anim_set_duration(&a, 1000);
    lv_anim_set_delay(&a, 5000);
    lv_anim_set_deleted_cb(&a, [](lv_anim_t* anim) {
        lv_obj_t* card = (lv_obj_t*)anim->var;
        // Buscar y limpiar el slot por el puntero del card
        for (int i = 0; i < UI_MAX_ORDERS; i++) {
            if (_cards[i].card == card) {
                lv_obj_delete(card);
                _cards[i].card = nullptr;
                _cards[i].data.used = false;
                _card_count = (_card_count > 0) ? _card_count - 1 : 0;
                _update_count_label();
                break;
            }
        }
    });
    lv_anim_start(&a);
}

void ui_remove_order(const char* pedido_id) {
    int idx = _find_card(pedido_id);
    if (idx < 0) return;

    if (_cards[idx].card) {
        lv_obj_delete(_cards[idx].card);
        _cards[idx].card = nullptr;
    }
    _cards[idx].data.used = false;
    _card_count = (_card_count > 0) ? _card_count - 1 : 0;
    _update_count_label();
}

void ui_clear_orders() {
    for (int i = 0; i < UI_MAX_ORDERS; i++) {
        if (_cards[i].data.used) {
            if (_cards[i].card) {
                lv_obj_delete(_cards[i].card);
                _cards[i].card = nullptr;
            }
            _cards[i].data.used = false;
        }
    }
    _card_count = 0;
    _update_count_label();
    if (_scroll_cont) lv_obj_clean(_scroll_cont);
}

void ui_tick_clock() {
    if (!_lbl_clock) return;
    // Actualizar cada minuto (llamada desde logic_loop)
    struct tm t;
    if (getLocalTime(&t)) {
        char buf[8];
        snprintf(buf, sizeof(buf), "%02d:%02d", t.tm_hour, t.tm_min);
        lv_label_set_text(_lbl_clock, buf);
    }
}
