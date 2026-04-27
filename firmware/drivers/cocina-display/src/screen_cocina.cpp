// screen_cocina.cpp — Pantalla de pedidos (réplica /cocina)

#include "screen_cocina.h"
#include "app.h"

// ─── Colores ─────────────────────────────────────────────────────────────────
#define C_BG      0x0f172a
#define C_CARD    0x1e293b
#define C_BORDER  0x1e3a5f
#define C_ACCENT  0xe94560
#define C_TEXT    0xf1f5f9
#define C_MUTED   0x94a3b8
#define C_GREEN   0x4ade80
#define C_YELLOW  0xfbbf24
#define C_RED     0xf87171

// ─── Estado de slots ─────────────────────────────────────────────────────────

struct OrderSlot {
    char      id[COC_ID_LEN];
    lv_obj_t* card;
    lv_obj_t* timer_lbl;
    uint32_t  received_ms;
    bool      used;
};

struct ItemSlot {
    char      order_id[COC_ID_LEN];
    char      item_id[COC_ID_LEN];
    lv_obj_t* row;
    lv_obj_t* dot;
    lv_obj_t* name_lbl;
    char      dev_color[COC_COLOR_LEN];
    bool      used;
};

static OrderSlot _orders[COC_MAX_ORDERS] = {};
static ItemSlot  _items[COC_MAX_ORDERS * COC_MAX_ITEMS] = {};

// ─── Widgets ─────────────────────────────────────────────────────────────────
static lv_obj_t* _scr        = nullptr;
static lv_obj_t* _scroll     = nullptr;
static lv_obj_t* _bar_wifi   = nullptr;
static lv_obj_t* _bar_mqtt   = nullptr;
static lv_obj_t* _bar_count  = nullptr;
static lv_obj_t* _dev_dot    = nullptr;
static char      _dev_color[COC_COLOR_LEN] = "#94a3b8";

static CocItemTapCb   _on_item   = nullptr;
static CocHeaderTapCb _on_header = nullptr;

// ─── Helpers ─────────────────────────────────────────────────────────────────

static uint32_t _parse_color(const char* hex) {
    if (!hex || !hex[0]) return 0x94a3b8;
    const char* p = (hex[0] == '#') ? hex + 1 : hex;
    return (uint32_t)strtol(p, nullptr, 16);
}

static OrderSlot* _find_order(const char* id) {
    for (auto& s : _orders) if (s.used && strcmp(s.id, id) == 0) return &s;
    return nullptr;
}

static ItemSlot* _find_item(const char* order_id, const char* item_id) {
    for (auto& s : _items)
        if (s.used && strcmp(s.order_id, order_id) == 0 && strcmp(s.item_id, item_id) == 0) return &s;
    return nullptr;
}

static OrderSlot* _alloc_order(const char* id) {
    for (auto& s : _orders) if (!s.used) { s.used = true; strlcpy(s.id, id, COC_ID_LEN); return &s; }
    return nullptr;
}

static ItemSlot* _alloc_item(const char* oid, const char* iid) {
    for (auto& s : _items) if (!s.used) {
        s.used = true;
        strlcpy(s.order_id, oid, COC_ID_LEN);
        strlcpy(s.item_id,  iid, COC_ID_LEN);
        return &s;
    }
    return nullptr;
}

static void _update_count() {
    if (!_bar_count) return;
    int n = 0;
    for (auto& s : _orders) if (s.used) n++;
    char buf[16]; snprintf(buf, sizeof(buf), "%d pedido%s", n, n == 1 ? "" : "s");
    lv_label_set_text(_bar_count, buf);
}

static void _apply_item_state(ItemSlot* s, CocItemState state, const char* dev_color) {
    if (!s) return;
    if (dev_color) strlcpy(s->dev_color, dev_color, COC_COLOR_LEN);

    uint32_t dot_c;
    bool faded = false;
    switch (state) {
        case COC_PREPARANDO:
            dot_c = (s->dev_color[0]) ? _parse_color(s->dev_color) : C_YELLOW;
            break;
        case COC_LISTO:
            dot_c = C_GREEN; faded = true;
            break;
        default:
            dot_c = C_MUTED; break;
    }
    if (s->dot)      lv_obj_set_style_bg_color(s->dot, lv_color_hex(dot_c), 0);
    if (s->name_lbl) lv_obj_set_style_text_color(s->name_lbl, lv_color_hex(faded ? C_MUTED : C_TEXT), 0);
}

static void _timer_str(uint32_t ms, char* buf, size_t sz) {
    uint32_t mins = (millis() - ms) / 60000;
    if (mins < 60) snprintf(buf, sz, "%um", mins);
    else           snprintf(buf, sz, "%uh%um", mins/60, mins%60);
}

// ─── Tap event data ───────────────────────────────────────────────────────────

struct TapData {
    char order_id[COC_ID_LEN];
    char item_id[COC_ID_LEN];
    bool is_header;
};

static TapData _tap_pool[COC_MAX_ORDERS * (COC_MAX_ITEMS + 1)] = {};
static int _tap_pool_n = 0;

static TapData* _alloc_tap(const char* oid, const char* iid, bool hdr) {
    if (_tap_pool_n >= (int)(sizeof(_tap_pool)/sizeof(_tap_pool[0]))) return nullptr;
    TapData* t = &_tap_pool[_tap_pool_n++];
    strlcpy(t->order_id, oid, COC_ID_LEN);
    strlcpy(t->item_id,  iid ? iid : "", COC_ID_LEN);
    t->is_header = hdr;
    return t;
}

static void _tap_cb(lv_event_t* e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    TapData* d = (TapData*)lv_event_get_user_data(e);
    if (!d) return;
    if (d->is_header) {
        if (_on_header) _on_header(d->order_id);
    } else {
        if (_on_item) _on_item(d->order_id, d->item_id);
    }
}

// ─── Construir tarjeta de pedido ──────────────────────────────────────────────

static void _build_card(const CocOrder& o) {
    OrderSlot* os = _alloc_order(o.id);
    if (!os) { Serial.println("[COCINA] Sin slots de pedido"); return; }
    os->received_ms = o.received_ms;

    // Card container
    lv_obj_t* card = lv_obj_create(_scroll);
    lv_obj_set_width(card, LV_PCT(100));
    lv_obj_set_height(card, LV_SIZE_CONTENT);
    lv_obj_set_layout(card, LV_LAYOUT_FLEX);
    lv_obj_set_flex_flow(card, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_bg_color(card, lv_color_hex(C_CARD), 0);
    lv_obj_set_style_border_color(card, lv_color_hex(C_BORDER), 0);
    lv_obj_set_style_border_width(card, 1, 0);
    lv_obj_set_style_radius(card, 12, 0);
    lv_obj_set_style_pad_all(card, 0, 0);
    lv_obj_set_style_pad_row(card, 0, 0);
    lv_obj_clear_flag(card, LV_OBJ_FLAG_SCROLLABLE);
    os->card = card;

    // Header (tappable → mark-ready)
    lv_obj_t* hdr = lv_obj_create(card);
    lv_obj_set_width(hdr, LV_PCT(100));
    lv_obj_set_height(hdr, 60);
    lv_obj_set_layout(hdr, LV_LAYOUT_FLEX);
    lv_obj_set_flex_flow(hdr, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(hdr, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_bg_color(hdr, lv_color_hex(0x162032), 0);
    lv_obj_set_style_bg_color(hdr, lv_color_hex(0x1e3a5f), LV_STATE_PRESSED);
    lv_obj_set_style_border_width(hdr, 0, 0);
    lv_obj_set_style_pad_left(hdr, 14, 0);
    lv_obj_set_style_pad_right(hdr, 14, 0);
    lv_obj_set_style_pad_column(hdr, 10, 0);
    lv_obj_set_style_radius(hdr, 0, 0);
    lv_obj_add_flag(hdr, LV_OBJ_FLAG_CLICKABLE);
    TapData* htd = _alloc_tap(o.id, nullptr, true);
    lv_obj_add_event_cb(hdr, _tap_cb, LV_EVENT_CLICKED, htd);

    // Ref
    lv_obj_t* ref_l = lv_label_create(hdr);
    lv_label_set_text(ref_l, o.ref);
    lv_obj_set_flex_grow(ref_l, 1);
    lv_obj_set_style_text_color(ref_l, lv_color_hex(C_TEXT), 0);
    lv_obj_set_style_text_font(ref_l, &lv_font_montserrat_16, 0);

    // Canal badge
    if (o.canal[0]) {
        lv_obj_t* canal = lv_label_create(hdr);
        lv_label_set_text(canal, o.canal);
        lv_obj_set_style_text_color(canal, lv_color_hex(C_MUTED), 0);
        lv_obj_set_style_text_font(canal, &lv_font_montserrat_12, 0);
    }

    // Timer
    char tstr[12]; _timer_str(o.received_ms, tstr, sizeof(tstr));
    lv_obj_t* timer_l = lv_label_create(hdr);
    lv_label_set_text(timer_l, tstr);
    lv_obj_set_style_text_color(timer_l, lv_color_hex(C_MUTED), 0);
    lv_obj_set_style_text_font(timer_l, &lv_font_montserrat_12, 0);
    os->timer_lbl = timer_l;

    // Nota general
    if (o.notas[0]) {
        lv_obj_t* nota = lv_label_create(card);
        lv_label_set_long_mode(nota, LV_LABEL_LONG_WRAP);
        lv_obj_set_width(nota, LV_PCT(100));
        char nb[96]; snprintf(nb, sizeof(nb), "  %s", o.notas);
        lv_label_set_text(nota, nb);
        lv_obj_set_style_text_color(nota, lv_color_hex(C_YELLOW), 0);
        lv_obj_set_style_text_font(nota, &lv_font_montserrat_12, 0);
        lv_obj_set_style_pad_left(nota, 14, 0);
        lv_obj_set_style_pad_top(nota, 4, 0);
    }

    // Separador
    lv_obj_t* sep = lv_obj_create(card);
    lv_obj_set_size(sep, LV_PCT(100), 1);
    lv_obj_set_style_bg_color(sep, lv_color_hex(C_BORDER), 0);
    lv_obj_set_style_border_width(sep, 0, 0);

    // Items
    for (int i = 0; i < o.item_count; i++) {
        const CocItem& it = o.items[i];

        lv_obj_t* row = lv_obj_create(card);
        lv_obj_set_width(row, LV_PCT(100));
        lv_obj_set_height(row, LV_SIZE_CONTENT);
        lv_obj_set_layout(row, LV_LAYOUT_FLEX);
        lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
        lv_obj_set_flex_align(row, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
        lv_obj_set_style_bg_color(row, lv_color_hex(C_CARD), 0);
        lv_obj_set_style_bg_color(row, lv_color_hex(0x253347), LV_STATE_PRESSED);
        lv_obj_set_style_border_width(row, 0, 0);
        lv_obj_set_style_pad_left(row, 14, 0);
        lv_obj_set_style_pad_right(row, 14, 0);
        lv_obj_set_style_pad_top(row, 8, 0);
        lv_obj_set_style_pad_bottom(row, 8, 0);
        lv_obj_set_style_pad_column(row, 10, 0);
        lv_obj_add_flag(row, LV_OBJ_FLAG_CLICKABLE);
        TapData* itd = _alloc_tap(o.id, it.item_id, false);
        lv_obj_add_event_cb(row, _tap_cb, LV_EVENT_CLICKED, itd);

        // Dot de estado
        lv_obj_t* dot = lv_obj_create(row);
        lv_obj_set_size(dot, 10, 10);
        lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
        lv_obj_set_style_border_width(dot, 0, 0);
        lv_obj_set_style_bg_color(dot, lv_color_hex(C_MUTED), 0);

        // Nombre + cantidad
        lv_obj_t* nl = lv_label_create(row);
        char nbuf[80];
        if (it.cantidad > 1) snprintf(nbuf, sizeof(nbuf), "x%d %s", it.cantidad, it.nombre);
        else                  snprintf(nbuf, sizeof(nbuf), "%s", it.nombre);
        lv_label_set_text(nl, nbuf);
        lv_obj_set_flex_grow(nl, 1);
        lv_obj_set_style_text_color(nl, lv_color_hex(C_TEXT), 0);
        lv_obj_set_style_text_font(nl, &lv_font_montserrat_14, 0);

        // Pase (si > 0)
        if (it.pase > 0) {
            char pb[8]; snprintf(pb, sizeof(pb), "P%d", it.pase);
            lv_obj_t* pl = lv_label_create(row);
            lv_label_set_text(pl, pb);
            lv_obj_set_style_text_color(pl, lv_color_hex(C_ACCENT), 0);
            lv_obj_set_style_text_font(pl, &lv_font_montserrat_12, 0);
        }

        // Sub-fila: notas + quitar (si hay)
        if (it.notas[0] || it.quitar[0]) {
            lv_obj_t* sub = lv_obj_create(card);
            lv_obj_set_width(sub, LV_PCT(100));
            lv_obj_set_height(sub, LV_SIZE_CONTENT);
            lv_obj_set_style_bg_opa(sub, LV_OPA_TRANSP, 0);
            lv_obj_set_style_border_width(sub, 0, 0);
            lv_obj_set_style_pad_left(sub, 38, 0);
            lv_obj_set_style_pad_top(sub, 0, 0);
            lv_obj_set_style_pad_bottom(sub, 4, 0);
            char sb[128] = "";
            if (it.notas[0])  snprintf(sb, sizeof(sb), "%s", it.notas);
            if (it.quitar[0]) {
                if (sb[0]) strlcat(sb, " | sin: ", sizeof(sb));
                strlcat(sb, it.quitar, sizeof(sb));
            }
            lv_obj_t* sl = lv_label_create(sub);
            lv_label_set_long_mode(sl, LV_LABEL_LONG_WRAP);
            lv_obj_set_width(sl, LV_PCT(100));
            lv_label_set_text(sl, sb);
            lv_obj_set_style_text_color(sl, lv_color_hex(C_MUTED), 0);
            lv_obj_set_style_text_font(sl, &lv_font_montserrat_12, 0);
        }

        ItemSlot* is = _alloc_item(o.id, it.item_id);
        if (is) {
            is->row      = row;
            is->dot      = dot;
            is->name_lbl = nl;
            _apply_item_state(is, it.state, it.dev_color);
        }
    }

    // Padding final
    lv_obj_t* pad = lv_obj_create(card);
    lv_obj_set_size(pad, 1, 8);
    lv_obj_set_style_bg_opa(pad, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(pad, 0, 0);
}

// ─── API pública ─────────────────────────────────────────────────────────────

void screen_cocina_create(CocItemTapCb on_item, CocHeaderTapCb on_header) {
    _on_item   = on_item;
    _on_header = on_header;
    memset(_orders, 0, sizeof(_orders));
    memset(_items,  0, sizeof(_items));
    _tap_pool_n = 0;

    _scr = lv_obj_create(nullptr);
    lv_obj_set_style_bg_color(_scr, lv_color_hex(C_BG), 0);
    lv_obj_clear_flag(_scr, LV_OBJ_FLAG_SCROLLABLE);

    // ── Status bar ───────────────────────────────────────────────────────
    lv_obj_t* sbar = lv_obj_create(_scr);
    lv_obj_set_size(sbar, 800, 56);
    lv_obj_set_pos(sbar, 0, 0);
    lv_obj_set_layout(sbar, LV_LAYOUT_FLEX);
    lv_obj_set_flex_flow(sbar, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(sbar, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_bg_color(sbar, lv_color_hex(0x0a1020), 0);
    lv_obj_set_style_border_width(sbar, 0, 0);
    lv_obj_set_style_pad_left(sbar, 16, 0);
    lv_obj_set_style_pad_right(sbar, 16, 0);
    lv_obj_set_style_pad_column(sbar, 12, 0);
    lv_obj_clear_flag(sbar, LV_OBJ_FLAG_SCROLLABLE);

    // Título
    lv_obj_t* ttl = lv_label_create(sbar);
    lv_label_set_text(ttl, "COCINA");
    lv_obj_set_style_text_color(ttl, lv_color_hex(C_ACCENT), 0);
    lv_obj_set_style_text_font(ttl, &lv_font_montserrat_16, 0);
    lv_obj_set_flex_grow(ttl, 1);

    // Counter
    _bar_count = lv_label_create(sbar);
    lv_label_set_text(_bar_count, "0 pedidos");
    lv_obj_set_style_text_color(_bar_count, lv_color_hex(C_MUTED), 0);
    lv_obj_set_style_text_font(_bar_count, &lv_font_montserrat_12, 0);

    // Dot WiFi
    _bar_wifi = lv_obj_create(sbar);
    lv_obj_set_size(_bar_wifi, 10, 10);
    lv_obj_set_style_radius(_bar_wifi, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(_bar_wifi, lv_color_hex(C_RED), 0);
    lv_obj_set_style_border_width(_bar_wifi, 0, 0);

    // Dot MQTT
    _bar_mqtt = lv_obj_create(sbar);
    lv_obj_set_size(_bar_mqtt, 10, 10);
    lv_obj_set_style_radius(_bar_mqtt, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(_bar_mqtt, lv_color_hex(C_RED), 0);
    lv_obj_set_style_border_width(_bar_mqtt, 0, 0);

    // Dot dispositivo (color asignado por backend)
    _dev_dot = lv_obj_create(sbar);
    lv_obj_set_size(_dev_dot, 10, 10);
    lv_obj_set_style_radius(_dev_dot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(_dev_dot, lv_color_hex(_parse_color(_dev_color)), 0);
    lv_obj_set_style_border_width(_dev_dot, 0, 0);

    // Botón volver a HOME
    lv_obj_t* home_btn = lv_button_create(sbar);
    lv_obj_set_size(home_btn, 70, 36);
    lv_obj_set_style_bg_color(home_btn, lv_color_hex(C_BORDER), 0);
    lv_obj_set_style_border_width(home_btn, 0, 0);
    lv_obj_set_style_radius(home_btn, 6, 0);
    lv_obj_t* hl = lv_label_create(home_btn);
    lv_label_set_text(hl, "Menu");
    lv_obj_set_style_text_color(hl, lv_color_hex(C_MUTED), 0);
    lv_obj_set_style_text_font(hl, &lv_font_montserrat_12, 0);
    lv_obj_center(hl);
    lv_obj_add_event_cb(home_btn, [](lv_event_t* e) {
        if (lv_event_get_code(e) == LV_EVENT_CLICKED) app_goto(SCREEN_HOME);
    }, LV_EVENT_CLICKED, nullptr);

    // Separador bajo status bar
    lv_obj_t* sep = lv_obj_create(_scr);
    lv_obj_set_size(sep, 800, 1);
    lv_obj_set_pos(sep, 0, 56);
    lv_obj_set_style_bg_color(sep, lv_color_hex(C_BORDER), 0);
    lv_obj_set_style_border_width(sep, 0, 0);

    // ── Scroll container de tarjetas ─────────────────────────────────────
    _scroll = lv_obj_create(_scr);
    lv_obj_set_size(_scroll, 800, 1280 - 57);
    lv_obj_set_pos(_scroll, 0, 57);
    lv_obj_set_layout(_scroll, LV_LAYOUT_FLEX);
    lv_obj_set_flex_flow(_scroll, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_bg_color(_scroll, lv_color_hex(C_BG), 0);
    lv_obj_set_style_border_width(_scroll, 0, 0);
    lv_obj_set_style_pad_all(_scroll, 12, 0);
    lv_obj_set_style_pad_row(_scroll, 12, 0);
}

void screen_cocina_load() {
    if (_scr) lv_scr_load(_scr);
}

void screen_cocina_set_wifi(bool ok) {
    if (_bar_wifi) lv_obj_set_style_bg_color(_bar_wifi, lv_color_hex(ok ? C_GREEN : C_RED), 0);
}

void screen_cocina_set_mqtt(bool ok) {
    if (_bar_mqtt) lv_obj_set_style_bg_color(_bar_mqtt, lv_color_hex(ok ? C_GREEN : C_RED), 0);
}

void screen_cocina_set_device_color(const char* hex) {
    strlcpy(_dev_color, hex, COC_COLOR_LEN);
    if (_dev_dot) lv_obj_set_style_bg_color(_dev_dot, lv_color_hex(_parse_color(hex)), 0);
}

void screen_cocina_add_order(const CocOrder& o) {
    if (_find_order(o.id)) return;  // ya existe
    _build_card(o);
    _update_count();
}

void screen_cocina_update_item(const char* oid, const char* iid,
                               CocItemState state, const char* dev_color) {
    ItemSlot* s = _find_item(oid, iid);
    _apply_item_state(s, state, dev_color);
}

void screen_cocina_order_done(const char* oid) {
    OrderSlot* os = _find_order(oid);
    if (!os) return;
    // Marcar card con fondo verde breve → luego eliminar
    if (os->card)
        lv_obj_set_style_border_color(os->card, lv_color_hex(C_GREEN), 0);
    // Limpiar items del pool
    for (auto& is : _items)
        if (is.used && strcmp(is.order_id, oid) == 0) is.used = false;
    // Eliminar card tras 1.5s via timer
    lv_obj_t* card_ref = os->card;
    os->used = false;
    lv_timer_create([](lv_timer_t* t) {
        lv_obj_t* c = (lv_obj_t*)lv_timer_get_user_data(t);
        if (c) lv_obj_delete(c);
        lv_timer_delete(t);
    }, 1500, card_ref);
    _update_count();
}

void screen_cocina_remove_order(const char* oid) {
    OrderSlot* os = _find_order(oid);
    if (!os) return;
    for (auto& is : _items)
        if (is.used && strcmp(is.order_id, oid) == 0) is.used = false;
    if (os->card) lv_obj_delete(os->card);
    os->used = false;
    _update_count();
}

void screen_cocina_clear() {
    for (auto& os : _orders) {
        if (os.used && os.card) lv_obj_delete(os.card);
        os.used = false;
    }
    for (auto& is : _items) is.used = false;
    _tap_pool_n = 0;
    _update_count();
}

void screen_cocina_tick() {
    char buf[12];
    for (auto& os : _orders) {
        if (os.used && os.timer_lbl) {
            _timer_str(os.received_ms, buf, sizeof(buf));
            lv_label_set_text(os.timer_lbl, buf);
        }
    }
}
