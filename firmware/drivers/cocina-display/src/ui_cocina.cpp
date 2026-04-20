/**
 * ui_cocina.cpp — LVGL UI para pantalla de cocina (ESP32-P4, 800×1280)
 *
 * Diseño oscuro idéntico a la webapp: fondo #0f172a, tarjetas #1e293b.
 * Touch: tap en header → mark-ready, tap en item → prepare-item.
 * Config panel: ⚙️ en status bar → selección de estación.
 */

#include "ui_cocina.h"
#include "config.h"

// ─── Paleta ───────────────────────────────────────────────────────────────────

#define C_BG       lv_color_hex(0x0f172a)
#define C_SURFACE  lv_color_hex(0x1e293b)
#define C_BORDER   lv_color_hex(0x334155)
#define C_TEXT     lv_color_hex(0xf1f5f9)
#define C_DIM      lv_color_hex(0x94a3b8)
#define C_GREEN    lv_color_hex(0x22c55e)
#define C_AMBER    lv_color_hex(0xeab308)
#define C_RED      lv_color_hex(0xef4444)
#define C_GRAY     lv_color_hex(0x475569)
#define C_ORANGE   lv_color_hex(0xf97316)
#define C_BLUE     lv_color_hex(0x3b82f6)
#define C_OVERLAY  lv_color_hex(0x060c18)

// ─── Estado ───────────────────────────────────────────────────────────────────

static lv_obj_t* _lbl_count   = nullptr;
static lv_obj_t* _lbl_clock   = nullptr;
static lv_obj_t* _dot_wifi    = nullptr;
static lv_obj_t* _dot_mqtt    = nullptr;
static lv_obj_t* _dot_device  = nullptr;
static lv_obj_t* _scroll_cont = nullptr;

static UiItemTapCb   _item_tap_cb   = nullptr;
static UiHeaderTapCb _header_tap_cb = nullptr;

// Config panel estado
static UiDeviceConfig   _cfg_pending;
static UiConfigApplyCb  _cfg_apply_cb = nullptr;
static lv_obj_t*        _cfg_panel    = nullptr;

struct CardSlot {
    UiPedido  data;
    lv_obj_t* card;
    bool      fading;
};

static CardSlot _cards[UI_MAX_ORDERS];
static int      _card_count = 0;

// Datos para callbacks de items — puntero estable a slot + índice
struct ItemCbData { CardSlot* slot; uint8_t item_idx; };
static ItemCbData _item_cb[UI_MAX_ORDERS][UI_MAX_ITEMS];

// ─── Helpers ──────────────────────────────────────────────────────────────────

static void _bg(lv_obj_t* o, lv_color_t c) {
    lv_obj_set_style_bg_color(o, c, 0);
    lv_obj_set_style_bg_opa(o, LV_OPA_COVER, 0);
}
static void _txt(lv_obj_t* o, lv_color_t c) { lv_obj_set_style_text_color(o, c, 0); }
static void _border(lv_obj_t* o, lv_color_t c, int w = 1) {
    lv_obj_set_style_border_color(o, c, 0);
    lv_obj_set_style_border_width(o, w, 0);
    lv_obj_set_style_border_opa(o, LV_OPA_COVER, 0);
}

static lv_color_t _color_hex(const char* hex) {
    if (!hex || hex[0] != '#' || strlen(hex) < 7) return C_GRAY;
    unsigned long v = strtoul(hex + 1, nullptr, 16);
    return lv_color_hex((uint32_t)v);
}

static lv_color_t _estado_color(UiItemEstado e) {
    switch (e) {
        case UI_ITEM_PREPARANDO: return C_AMBER;
        case UI_ITEM_LISTO:      return C_GREEN;
        default:                 return C_GRAY;
    }
}

static const char* _canal_icon(const char* c) {
    if (!c || !*c)               return "?";
    if (strcmp(c, "mesa")     == 0) return "M";
    if (strcmp(c, "llevar")   == 0) return "L";
    if (strcmp(c, "telefono") == 0) return "T";
    if (strcmp(c, "glovo")    == 0) return "G";
    if (strcmp(c, "whatsapp") == 0) return "W";
    return c;
}

static lv_color_t _canal_color(const char* c) {
    if (c && strcmp(c, "glovo") == 0) return C_ORANGE;
    return C_BLUE;
}

static void _update_count_label() {
    if (!_lbl_count) return;
    char buf[32];
    snprintf(buf, sizeof(buf), "%d pedido%s", _card_count, _card_count == 1 ? "" : "s");
    lv_label_set_text(_lbl_count, buf);
}

// ─── Borde de tarjeta según estado ───────────────────────────────────────────

static void _update_card_border(int idx) {
    if (!_cards[idx].card || !_cards[idx].data.used) return;
    const UiPedido& p = _cards[idx].data;

    bool any_prep = false;
    bool all_ready = (p.item_count > 0);
    for (int i = 0; i < p.item_count; i++) {
        if (p.items[i].estado == UI_ITEM_PREPARANDO) any_prep = true;
        if (p.items[i].estado != UI_ITEM_LISTO)      all_ready = false;
    }
    uint32_t min_elapsed = (millis() - p.received_ms) / 60000;
    bool glovo = (strcmp(p.canal, "glovo") == 0);

    lv_color_t bc;
    int bw = 2;
    if (all_ready)         bc = C_GREEN;
    else if (min_elapsed >= 10) bc = C_RED;
    else if (glovo)        bc = C_ORANGE;
    else if (any_prep)     bc = C_AMBER;
    else { bc = C_BORDER; bw = 1; }

    _border(_cards[idx].card, bc, bw);
}

// ─── Touch callbacks ──────────────────────────────────────────────────────────

static void _on_header_click(lv_event_t* e) {
    CardSlot* slot = (CardSlot*)lv_event_get_user_data(e);
    if (_header_tap_cb && slot && slot->data.used && !slot->fading) {
        _header_tap_cb(slot->data.pedido_id);
    }
}

static void _on_item_click(lv_event_t* e) {
    ItemCbData* d = (ItemCbData*)lv_event_get_user_data(e);
    if (!_item_tap_cb || !d || !d->slot || !d->slot->data.used) return;
    const UiItem& item = d->slot->data.items[d->item_idx];
    if (item.estado == UI_ITEM_LISTO) return;  // ya listo — no hacer nada
    _item_tap_cb(d->slot->data.pedido_id, item.item_id);
}

// ─── Construcción de tarjeta ──────────────────────────────────────────────────

static int _slot_of(const CardSlot* slot) {
    return (int)(slot - _cards);
}

static lv_obj_t* _make_card(lv_obj_t* parent, int idx) {
    const UiPedido& p = _cards[idx].data;

    lv_obj_t* card = lv_obj_create(parent);
    lv_obj_set_width(card, lv_pct(100));
    lv_obj_set_height(card, LV_SIZE_CONTENT);
    lv_obj_set_style_radius(card, 10, 0);
    lv_obj_set_style_pad_all(card, 14, 0);
    lv_obj_set_style_pad_row(card, 8, 0);
    lv_obj_set_style_margin_bottom(card, 10, 0);
    lv_obj_set_flex_flow(card, LV_FLEX_FLOW_COLUMN);
    lv_obj_clear_flag(card, LV_OBJ_FLAG_SCROLLABLE);
    _bg(card, C_SURFACE);
    _border(card, C_BORDER, 1);

    // ── Cabecera (tap → mark-ready) ────────────────────────────────────────
    lv_obj_t* hdr = lv_obj_create(card);
    lv_obj_set_width(hdr, lv_pct(100));
    lv_obj_set_height(hdr, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(hdr, LV_FLEX_FLOW_ROW);
    lv_obj_set_style_flex_cross_place(hdr, LV_FLEX_ALIGN_CENTER, 0);
    lv_obj_set_style_pad_all(hdr, 6, 0);
    lv_obj_set_style_border_width(hdr, 0, 0);
    lv_obj_set_style_radius(hdr, 6, 0);
    lv_obj_clear_flag(hdr, LV_OBJ_FLAG_SCROLLABLE);
    _bg(hdr, lv_color_hex(0x263348));
    lv_obj_add_flag(hdr, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(hdr, _on_header_click, LV_EVENT_CLICKED, (void*)&_cards[idx]);

    // Canal badge
    lv_obj_t* cbadge = lv_obj_create(hdr);
    lv_obj_set_size(cbadge, 30, 30);
    lv_obj_set_style_radius(cbadge, 15, 0);
    lv_obj_set_style_pad_all(cbadge, 0, 0);
    lv_obj_set_style_border_width(cbadge, 0, 0);
    lv_obj_set_style_margin_right(cbadge, 10, 0);
    _bg(cbadge, _canal_color(p.canal));
    lv_obj_t* clbl = lv_label_create(cbadge);
    lv_label_set_text(clbl, _canal_icon(p.canal));
    lv_obj_set_style_text_font(clbl, &lv_font_montserrat_12, 0);
    _txt(clbl, C_TEXT);
    lv_obj_center(clbl);

    // Ref display
    lv_obj_t* ref = lv_label_create(hdr);
    lv_label_set_text(ref, p.ref_display[0] ? p.ref_display : p.pedido_id);
    lv_obj_set_style_text_font(ref, &lv_font_montserrat_20, 0);
    _txt(ref, C_TEXT);
    lv_obj_set_flex_grow(ref, 1);
    lv_label_set_long_mode(ref, LV_LABEL_LONG_DOT);

    // Tiempo
    lv_obj_t* tlbl = lv_label_create(hdr);
    char tbuf[12];
    uint32_t sec = (millis() - p.received_ms) / 1000;
    if (sec < 60) snprintf(tbuf, sizeof(tbuf), "%ds", (int)sec);
    else          snprintf(tbuf, sizeof(tbuf), "%dm", (int)(sec / 60));
    lv_label_set_text(tlbl, tbuf);
    lv_obj_set_style_text_font(tlbl, &lv_font_montserrat_12, 0);
    _txt(tlbl, C_DIM);

    // ── Notas generales ────────────────────────────────────────────────────
    if (p.notas_generales[0]) {
        lv_obj_t* nota = lv_label_create(card);
        char nbuf[96];
        snprintf(nbuf, sizeof(nbuf), "● %s", p.notas_generales);
        lv_label_set_text(nota, nbuf);
        lv_label_set_long_mode(nota, LV_LABEL_LONG_WRAP);
        lv_obj_set_width(nota, lv_pct(100));
        lv_obj_set_style_text_font(nota, &lv_font_montserrat_12, 0);
        _txt(nota, C_AMBER);
    }

    // ── Items (tap → prepare-item) ─────────────────────────────────────────
    for (int i = 0; i < p.item_count && i < UI_MAX_ITEMS; i++) {
        const UiItem& item = p.items[i];

        lv_obj_t* row = lv_obj_create(card);
        lv_obj_set_width(row, lv_pct(100));
        lv_obj_set_height(row, LV_SIZE_CONTENT);
        lv_obj_set_flex_flow(row, LV_FLEX_FLOW_COLUMN);
        lv_obj_set_style_pad_all(row, 6, 0);
        lv_obj_set_style_border_width(row, 0, 0);
        lv_obj_set_style_radius(row, 6, 0);
        lv_obj_clear_flag(row, LV_OBJ_FLAG_SCROLLABLE);

        // Fondo destacado cuando está preparando
        if (item.estado == UI_ITEM_PREPARANDO) {
            _bg(row, lv_color_hex(0x2a2000));
            lv_obj_set_style_border_side(row, LV_BORDER_SIDE_LEFT, 0);
            _border(row, C_AMBER, 3);
        } else {
            _bg(row, C_SURFACE);
        }

        // Fila principal: dot + nombre + badge
        lv_obj_t* main_row = lv_obj_create(row);
        lv_obj_set_width(main_row, lv_pct(100));
        lv_obj_set_height(main_row, LV_SIZE_CONTENT);
        lv_obj_set_flex_flow(main_row, LV_FLEX_FLOW_ROW);
        lv_obj_set_style_flex_cross_place(main_row, LV_FLEX_ALIGN_CENTER, 0);
        lv_obj_set_style_pad_all(main_row, 0, 0);
        lv_obj_set_style_border_width(main_row, 0, 0);
        _bg(main_row, lv_color_hex(item.estado == UI_ITEM_PREPARANDO ? 0x2a2000 : 0x1e293b));
        lv_obj_clear_flag(main_row, LV_OBJ_FLAG_SCROLLABLE);

        // Dot de estado (o color del device que lo prepara)
        lv_obj_t* dot = lv_obj_create(main_row);
        lv_obj_set_size(dot, 10, 10);
        lv_obj_set_style_radius(dot, 5, 0);
        lv_obj_set_style_border_width(dot, 0, 0);
        lv_obj_set_style_margin_right(dot, 8, 0);
        lv_color_t dot_color = (item.device_color[0] && item.estado == UI_ITEM_PREPARANDO)
            ? _color_hex(item.device_color)
            : _estado_color(item.estado);
        _bg(dot, dot_color);

        // Nombre + cantidad
        char nbuf[96];
        snprintf(nbuf, sizeof(nbuf), "x%d  %s", item.cantidad, item.nombre);
        lv_obj_t* nlbl = lv_label_create(main_row);
        lv_label_set_text(nlbl, nbuf);
        lv_label_set_long_mode(nlbl, LV_LABEL_LONG_DOT);
        lv_obj_set_style_text_font(nlbl,
            item.estado == UI_ITEM_PREPARANDO ? &lv_font_montserrat_16 : &lv_font_montserrat_14, 0);
        lv_color_t tc = (item.estado == UI_ITEM_LISTO) ? C_GRAY : C_TEXT;
        _txt(nlbl, tc);
        lv_obj_set_flex_grow(nlbl, 1);
        if (item.estado == UI_ITEM_LISTO) {
            lv_obj_set_style_text_decor(nlbl, LV_TEXT_DECOR_STRIKETHROUGH, 0);
        }

        // Badge de estado
        lv_obj_t* badge = lv_obj_create(main_row);
        lv_obj_set_size(badge, 52, 20);
        lv_obj_set_style_radius(badge, 4, 0);
        lv_obj_set_style_pad_all(badge, 0, 0);
        lv_obj_set_style_border_width(badge, 0, 0);
        _bg(badge, _estado_color(item.estado));
        lv_obj_t* blbl = lv_label_create(badge);
        lv_obj_set_style_text_font(blbl, &lv_font_montserrat_12, 0);
        _txt(blbl, C_TEXT);
        lv_obj_center(blbl);
        const char* btext = (item.estado == UI_ITEM_PREPARANDO) ? "prep"
                          : (item.estado == UI_ITEM_LISTO)      ? "listo"
                          : "pend";
        lv_label_set_text(blbl, btext);

        // Notas del item
        if (item.notas[0] || item.quitar[0]) {
            lv_obj_t* extra = lv_label_create(row);
            char ebuf[160] = "";
            if (item.quitar[0]) snprintf(ebuf, sizeof(ebuf), "SIN: %s", item.quitar);
            if (item.notas[0]) {
                if (ebuf[0]) strlcat(ebuf, "  ", sizeof(ebuf));
                strlcat(ebuf, item.notas, sizeof(ebuf));
            }
            lv_label_set_text(extra, ebuf);
            lv_label_set_long_mode(extra, LV_LABEL_LONG_WRAP);
            lv_obj_set_width(extra, lv_pct(100));
            lv_obj_set_style_text_font(extra, &lv_font_montserrat_12, 0);
            _txt(extra, item.estado == UI_ITEM_PREPARANDO ? C_AMBER : C_DIM);
        }

        // Touch en la fila del item (solo si no está listo)
        if (item.estado != UI_ITEM_LISTO) {
            lv_obj_add_flag(row, LV_OBJ_FLAG_CLICKABLE);
            _item_cb[_slot_of(&_cards[idx])][i] = { &_cards[idx], (uint8_t)i };
            lv_obj_add_event_cb(row, _on_item_click, LV_EVENT_CLICKED,
                (void*)&_item_cb[_slot_of(&_cards[idx])][i]);
        }
    }

    return card;
}

static int _find_card(const char* pedido_id) {
    for (int i = 0; i < UI_MAX_ORDERS; i++) {
        if (_cards[i].data.used && strcmp(_cards[i].data.pedido_id, pedido_id) == 0)
            return i;
    }
    return -1;
}

static int _alloc_slot() {
    for (int i = 0; i < UI_MAX_ORDERS; i++)
        if (!_cards[i].data.used) return i;
    // Desalojar el más antiguo
    uint32_t oldest = UINT32_MAX;
    int idx = 0;
    for (int i = 0; i < UI_MAX_ORDERS; i++) {
        if (_cards[i].data.received_ms < oldest) { oldest = _cards[i].data.received_ms; idx = i; }
    }
    if (_cards[idx].card) { lv_obj_delete(_cards[idx].card); _cards[idx].card = nullptr; }
    _card_count = _card_count > 0 ? _card_count - 1 : 0;
    return idx;
}

// ─── Panel de configuración ───────────────────────────────────────────────────

static lv_obj_t* _make_station_btn(lv_obj_t* parent, const char* label,
                                    bool selected, lv_color_t active_color) {
    lv_obj_t* btn = lv_obj_create(parent);
    lv_obj_set_flex_grow(btn, 1);
    lv_obj_set_height(btn, 70);
    lv_obj_set_style_radius(btn, 10, 0);
    lv_obj_set_style_pad_all(btn, 0, 0);
    lv_obj_set_style_border_width(btn, 2, 0);
    _bg(btn, selected ? active_color : C_SURFACE);
    _border(btn, selected ? active_color : C_BORDER, 2);
    lv_obj_t* lbl = lv_label_create(btn);
    lv_label_set_text(lbl, label);
    lv_obj_set_style_text_font(lbl, &lv_font_montserrat_16, 0);
    _txt(lbl, C_TEXT);
    lv_obj_center(lbl);
    lv_obj_add_flag(btn, LV_OBJ_FLAG_CLICKABLE);
    return btn;
}

static void _cfg_close(lv_event_t*) {
    if (_cfg_panel) { lv_obj_delete(_cfg_panel); _cfg_panel = nullptr; }
}

static void _cfg_apply(lv_event_t*) {
    if (_cfg_apply_cb) _cfg_apply_cb(_cfg_pending);
    if (_cfg_panel) { lv_obj_delete(_cfg_panel); _cfg_panel = nullptr; }
}

static void _cfg_select_general(lv_event_t* e) {
    strlcpy(_cfg_pending.tipo_estacion, "general", sizeof(_cfg_pending.tipo_estacion));
    // Redibujar panel con nueva selección
    UiDeviceConfig tmp = _cfg_pending;
    UiConfigApplyCb cb = _cfg_apply_cb;
    if (_cfg_panel) { lv_obj_delete(_cfg_panel); _cfg_panel = nullptr; }
    ui_show_config_panel(tmp, cb);
}

static void _cfg_select_horno(lv_event_t* e) {
    strlcpy(_cfg_pending.tipo_estacion, "horno", sizeof(_cfg_pending.tipo_estacion));
    UiDeviceConfig tmp = _cfg_pending;
    UiConfigApplyCb cb = _cfg_apply_cb;
    if (_cfg_panel) { lv_obj_delete(_cfg_panel); _cfg_panel = nullptr; }
    ui_show_config_panel(tmp, cb);
}

void ui_show_config_panel(const UiDeviceConfig& current, UiConfigApplyCb on_apply) {
    if (_cfg_panel) { lv_obj_delete(_cfg_panel); _cfg_panel = nullptr; }
    _cfg_pending  = current;
    _cfg_apply_cb = on_apply;

    bool is_horno = (strcmp(current.tipo_estacion, "horno") == 0);

    _cfg_panel = lv_obj_create(lv_screen_active());
    lv_obj_set_size(_cfg_panel, DISPLAY_WIDTH, DISPLAY_HEIGHT);
    lv_obj_align(_cfg_panel, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_flex_flow(_cfg_panel, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_flex_cross_place(_cfg_panel, LV_FLEX_ALIGN_CENTER, 0);
    lv_obj_set_style_pad_all(_cfg_panel, 30, 0);
    lv_obj_set_style_pad_row(_cfg_panel, 20, 0);
    lv_obj_set_style_border_width(_cfg_panel, 0, 0);
    _bg(_cfg_panel, C_OVERLAY);
    lv_obj_clear_flag(_cfg_panel, LV_OBJ_FLAG_SCROLLABLE);

    // Título
    lv_obj_t* title = lv_label_create(_cfg_panel);
    lv_label_set_text(title, "Configuración del display");
    lv_obj_set_style_text_font(title, &lv_font_montserrat_20, 0);
    _txt(title, C_TEXT);

    // Sección estación
    lv_obj_t* sec_lbl = lv_label_create(_cfg_panel);
    lv_label_set_text(sec_lbl, "Tipo de estación");
    lv_obj_set_style_text_font(sec_lbl, &lv_font_montserrat_14, 0);
    _txt(sec_lbl, C_DIM);

    lv_obj_t* row = lv_obj_create(_cfg_panel);
    lv_obj_set_width(row, lv_pct(100));
    lv_obj_set_height(row, 80);
    lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
    lv_obj_set_style_pad_column(row, 16, 0);
    lv_obj_set_style_pad_all(row, 0, 0);
    lv_obj_set_style_border_width(row, 0, 0);
    _bg(row, C_OVERLAY);
    lv_obj_clear_flag(row, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t* btn_gen   = _make_station_btn(row, "GENERAL", !is_horno, C_BLUE);
    lv_obj_t* btn_horno = _make_station_btn(row, "HORNO",    is_horno,  C_ORANGE);
    lv_obj_add_event_cb(btn_gen,   _cfg_select_general, LV_EVENT_CLICKED, nullptr);
    lv_obj_add_event_cb(btn_horno, _cfg_select_horno,   LV_EVENT_CLICKED, nullptr);

    // Descripción
    lv_obj_t* desc = lv_label_create(_cfg_panel);
    const char* desc_txt = is_horno
        ? "HORNO: items llegan en preparando\nauto. 1 tap = listo + imprime ticket"
        : "GENERAL: 1 tap = preparando\n2 tap = avanza a horno";
    lv_label_set_text(desc, desc_txt);
    lv_obj_set_style_text_font(desc, &lv_font_montserrat_14, 0);
    lv_obj_set_width(desc, lv_pct(100));
    lv_label_set_long_mode(desc, LV_LABEL_LONG_WRAP);
    _txt(desc, C_DIM);

    // Separador
    lv_obj_t* sep = lv_obj_create(_cfg_panel);
    lv_obj_set_size(sep, lv_pct(100), 1);
    _bg(sep, C_BORDER);
    lv_obj_set_style_border_width(sep, 0, 0);

    // Botones Cancelar / Aplicar
    lv_obj_t* btn_row = lv_obj_create(_cfg_panel);
    lv_obj_set_width(btn_row, lv_pct(100));
    lv_obj_set_height(btn_row, 60);
    lv_obj_set_flex_flow(btn_row, LV_FLEX_FLOW_ROW);
    lv_obj_set_style_pad_column(btn_row, 16, 0);
    lv_obj_set_style_pad_all(btn_row, 0, 0);
    lv_obj_set_style_border_width(btn_row, 0, 0);
    _bg(btn_row, C_OVERLAY);
    lv_obj_clear_flag(btn_row, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t* btn_cancel = lv_obj_create(btn_row);
    lv_obj_set_flex_grow(btn_cancel, 1);
    lv_obj_set_height(btn_cancel, 56);
    lv_obj_set_style_radius(btn_cancel, 8, 0);
    lv_obj_set_style_pad_all(btn_cancel, 0, 0);
    _bg(btn_cancel, C_SURFACE);
    _border(btn_cancel, C_BORDER, 1);
    lv_obj_add_flag(btn_cancel, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(btn_cancel, _cfg_close, LV_EVENT_CLICKED, nullptr);
    lv_obj_t* lc = lv_label_create(btn_cancel);
    lv_label_set_text(lc, "Cancelar");
    lv_obj_set_style_text_font(lc, &lv_font_montserrat_14, 0);
    _txt(lc, C_DIM);
    lv_obj_center(lc);

    lv_obj_t* btn_apply = lv_obj_create(btn_row);
    lv_obj_set_flex_grow(btn_apply, 2);
    lv_obj_set_height(btn_apply, 56);
    lv_obj_set_style_radius(btn_apply, 8, 0);
    lv_obj_set_style_pad_all(btn_apply, 0, 0);
    _bg(btn_apply, C_BLUE);
    lv_obj_set_style_border_width(btn_apply, 0, 0);
    lv_obj_add_flag(btn_apply, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(btn_apply, _cfg_apply, LV_EVENT_CLICKED, nullptr);
    lv_obj_t* la = lv_label_create(btn_apply);
    lv_label_set_text(la, "Aplicar");
    lv_obj_set_style_text_font(la, &lv_font_montserrat_16, 0);
    _txt(la, C_TEXT);
    lv_obj_center(la);
}

// ─── Botón ⚙️ en status bar ────────────────────────────────────────────────────

static UiDeviceConfig  _current_cfg      = { "COCINA", "general", "" };
static UiConfigApplyCb _stored_apply_cb  = nullptr;

static void _on_config_btn(lv_event_t*) {
    ui_show_config_panel(_current_cfg, _stored_apply_cb);
}

// ─── API pública ─────────────────────────────────────────────────────────────

void ui_set_item_tap_cb(UiItemTapCb cb)     { _item_tap_cb    = cb; }
void ui_set_header_tap_cb(UiHeaderTapCb cb) { _header_tap_cb  = cb; }
void ui_set_config(const UiDeviceConfig& cfg, UiConfigApplyCb on_apply) {
    _current_cfg     = cfg;
    _stored_apply_cb = on_apply;
}

void ui_init() {
    memset(_cards, 0, sizeof(_cards));
    _card_count = 0;

    lv_obj_t* scr = lv_screen_active();
    _bg(scr, C_BG);
    lv_obj_set_style_pad_all(scr, 0, 0);
    lv_obj_clear_flag(scr, LV_OBJ_FLAG_SCROLLABLE);

    // ── Status bar (80px) ───────────────────────────────────────────────────
    lv_obj_t* bar = lv_obj_create(scr);
    lv_obj_set_size(bar, DISPLAY_WIDTH, 80);
    lv_obj_align(bar, LV_ALIGN_TOP_LEFT, 0, 0);
    lv_obj_set_flex_flow(bar, LV_FLEX_FLOW_ROW);
    lv_obj_set_style_flex_cross_place(bar, LV_FLEX_ALIGN_CENTER, 0);
    lv_obj_set_style_pad_hor(bar, 20, 0);
    lv_obj_set_style_pad_ver(bar, 0, 0);
    lv_obj_set_style_border_side(bar, LV_BORDER_SIDE_BOTTOM, 0);
    _border(bar, C_BORDER, 1);
    lv_obj_clear_flag(bar, LV_OBJ_FLAG_SCROLLABLE);
    _bg(bar, lv_color_hex(0x111827));

    // Título
    lv_obj_t* title = lv_label_create(bar);
    lv_label_set_text(title, "COCINA");
    lv_obj_set_style_text_font(title, &lv_font_montserrat_16, 0);
    lv_obj_set_style_text_letter_space(title, 3, 0);
    _txt(title, C_TEXT);
    lv_obj_set_style_margin_right(title, 16, 0);

    // Contador
    _lbl_count = lv_label_create(bar);
    lv_label_set_text(_lbl_count, "0 pedidos");
    lv_obj_set_style_text_font(_lbl_count, &lv_font_montserrat_14, 0);
    _txt(_lbl_count, C_DIM);
    lv_obj_set_flex_grow(_lbl_count, 1);

    // Dot WiFi
    _dot_wifi = lv_obj_create(bar);
    lv_obj_set_size(_dot_wifi, 10, 10);
    lv_obj_set_style_radius(_dot_wifi, 5, 0);
    lv_obj_set_style_border_width(_dot_wifi, 0, 0);
    lv_obj_set_style_margin_right(_dot_wifi, 4, 0);
    _bg(_dot_wifi, C_GRAY);

    // Dot MQTT
    _dot_mqtt = lv_obj_create(bar);
    lv_obj_set_size(_dot_mqtt, 10, 10);
    lv_obj_set_style_radius(_dot_mqtt, 5, 0);
    lv_obj_set_style_border_width(_dot_mqtt, 0, 0);
    lv_obj_set_style_margin_right(_dot_mqtt, 8, 0);
    _bg(_dot_mqtt, C_GRAY);

    // Dot device (color asignado por backend)
    _dot_device = lv_obj_create(bar);
    lv_obj_set_size(_dot_device, 14, 14);
    lv_obj_set_style_radius(_dot_device, 7, 0);
    lv_obj_set_style_border_width(_dot_device, 2, 0);
    lv_obj_set_style_border_color(_dot_device, C_DIM, 0);
    lv_obj_set_style_margin_right(_dot_device, 8, 0);
    _bg(_dot_device, C_GRAY);

    // Reloj
    _lbl_clock = lv_label_create(bar);
    lv_label_set_text(_lbl_clock, "--:--");
    lv_obj_set_style_text_font(_lbl_clock, &lv_font_montserrat_14, 0);
    _txt(_lbl_clock, C_DIM);
    lv_obj_set_style_margin_right(_lbl_clock, 12, 0);

    // Botón ⚙️
    lv_obj_t* cfg_btn = lv_obj_create(bar);
    lv_obj_set_size(cfg_btn, 40, 40);
    lv_obj_set_style_radius(cfg_btn, 20, 0);
    lv_obj_set_style_pad_all(cfg_btn, 0, 0);
    lv_obj_set_style_border_width(cfg_btn, 1, 0);
    lv_obj_set_style_border_color(cfg_btn, C_BORDER, 0);
    _bg(cfg_btn, C_SURFACE);
    lv_obj_add_flag(cfg_btn, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_add_event_cb(cfg_btn, _on_config_btn, LV_EVENT_CLICKED, nullptr);
    lv_obj_t* cfg_lbl = lv_label_create(cfg_btn);
    lv_label_set_text(cfg_lbl, "#");
    lv_obj_set_style_text_font(cfg_lbl, &lv_font_montserrat_14, 0);
    _txt(cfg_lbl, C_DIM);
    lv_obj_center(cfg_lbl);

    // ── Área de tarjetas ────────────────────────────────────────────────────
    _scroll_cont = lv_obj_create(scr);
    lv_obj_set_size(_scroll_cont, DISPLAY_WIDTH, DISPLAY_HEIGHT - 80);
    lv_obj_align(_scroll_cont, LV_ALIGN_TOP_LEFT, 0, 80);
    lv_obj_set_flex_flow(_scroll_cont, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_all(_scroll_cont, 12, 0);
    lv_obj_set_style_pad_row(_scroll_cont, 0, 0);
    lv_obj_set_style_border_width(_scroll_cont, 0, 0);
    lv_obj_set_scroll_dir(_scroll_cont, LV_DIR_VER);
    lv_obj_set_scrollbar_mode(_scroll_cont, LV_SCROLLBAR_MODE_AUTO);
    _bg(_scroll_cont, C_BG);

    // Placeholder
    lv_obj_t* empty = lv_label_create(_scroll_cont);
    lv_label_set_text(empty, "Esperando pedidos...");
    lv_obj_set_style_text_font(empty, &lv_font_montserrat_16, 0);
    _txt(empty, C_GRAY);
    lv_obj_center(empty);

    _update_count_label();
}

void ui_set_wifi(bool on) {
    if (_dot_wifi) _bg(_dot_wifi, on ? C_GREEN : C_RED);
}
void ui_set_mqtt(bool on) {
    if (_dot_mqtt) _bg(_dot_mqtt, on ? C_GREEN : C_AMBER);
}
void ui_set_device_color(const char* hex) {
    if (_dot_device) _bg(_dot_device, _color_hex(hex));
}

void ui_add_order(const UiPedido& p) {
    if (_find_card(p.pedido_id) >= 0) return;

    int idx = _alloc_slot();
    _cards[idx].data   = p;
    _cards[idx].data.used = true;
    _cards[idx].fading = false;

    if (_card_count == 0) lv_obj_clean(_scroll_cont);

    _cards[idx].card = _make_card(_scroll_cont, idx);
    _update_card_border(idx);
    _card_count++;
    _update_count_label();
}

void ui_update_item_by_id(const char* pedido_id, const char* item_id,
                           UiItemEstado estado, const char* device_color) {
    int idx = _find_card(pedido_id);
    if (idx < 0 || !_cards[idx].card) return;

    UiPedido& p = _cards[idx].data;
    bool changed = false;
    for (int i = 0; i < p.item_count; i++) {
        if (strcmp(p.items[i].item_id, item_id) == 0) {
            p.items[i].estado = estado;
            if (device_color && *device_color)
                strlcpy(p.items[i].device_color, device_color, sizeof(p.items[i].device_color));
            changed = true;
            break;
        }
    }
    if (!changed) return;

    lv_obj_delete(_cards[idx].card);
    _cards[idx].card = _make_card(_scroll_cont, idx);
    _update_card_border(idx);
}

void ui_order_listo(const char* pedido_id) {
    int idx = _find_card(pedido_id);
    if (idx < 0 || !_cards[idx].card) return;

    _cards[idx].data.estado = UI_PEDIDO_LISTO;
    _cards[idx].fading = true;
    _border(_cards[idx].card, C_GREEN, 2);

    lv_anim_t a;
    lv_anim_init(&a);
    lv_anim_set_var(&a, _cards[idx].card);
    lv_anim_set_exec_cb(&a, [](void* obj, int32_t v) {
        lv_obj_set_style_opa((lv_obj_t*)obj, (lv_opa_t)v, 0);
    });
    lv_anim_set_values(&a, LV_OPA_COVER, LV_OPA_TRANSP);
    lv_anim_set_duration(&a, 1000);
    lv_anim_set_delay(&a, 4000);
    lv_anim_set_deleted_cb(&a, [](lv_anim_t* anim) {
        lv_obj_t* card = (lv_obj_t*)anim->var;
        for (int i = 0; i < UI_MAX_ORDERS; i++) {
            if (_cards[i].card == card) {
                lv_obj_delete(card);
                _cards[i].card = nullptr;
                _cards[i].data.used = false;
                _card_count = _card_count > 0 ? _card_count - 1 : 0;
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
    if (_cards[idx].card) { lv_obj_delete(_cards[idx].card); _cards[idx].card = nullptr; }
    _cards[idx].data.used = false;
    _card_count = _card_count > 0 ? _card_count - 1 : 0;
    _update_count_label();
}

void ui_clear_orders() {
    for (int i = 0; i < UI_MAX_ORDERS; i++) {
        if (_cards[i].data.used) {
            if (_cards[i].card) { lv_obj_delete(_cards[i].card); _cards[i].card = nullptr; }
            _cards[i].data.used = false;
        }
    }
    _card_count = 0;
    _update_count_label();
    if (_scroll_cont) lv_obj_clean(_scroll_cont);
}

void ui_tick_clock() {
    if (!_lbl_clock) return;
    struct tm t;
    if (getLocalTime(&t)) {
        char buf[8];
        snprintf(buf, sizeof(buf), "%02d:%02d", t.tm_hour, t.tm_min);
        lv_label_set_text(_lbl_clock, buf);
    }
}
