// screen_home.cpp — Pantalla de inicio: 2 botones grandes

#include "screen_home.h"
#include "app.h"

// ─── Colores ─────────────────────────────────────────────────────────────────
#define C_BG     0x0f172a
#define C_CARD   0x1e293b
#define C_BORDER 0x1e3a5f
#define C_ACCENT 0xe94560
#define C_TEXT   0xf1f5f9
#define C_MUTED  0x94a3b8
#define C_GREEN  0x4ade80
#define C_RED    0xf87171

// ─── Widgets ─────────────────────────────────────────────────────────────────
static lv_obj_t* _scr       = nullptr;
static lv_obj_t* _dot_wifi  = nullptr;
static lv_obj_t* _dot_mqtt  = nullptr;

// ─── Evento botones ──────────────────────────────────────────────────────────
static void _btn_config_cb(lv_event_t* e) {
    if (lv_event_get_code(e) == LV_EVENT_CLICKED) app_goto(SCREEN_CONFIG);
}
static void _btn_cocina_cb(lv_event_t* e) {
    if (lv_event_get_code(e) == LV_EVENT_CLICKED) app_goto(SCREEN_COCINA);
}

// ─── Helper: dot de estado ────────────────────────────────────────────────────
static lv_obj_t* _status_dot(lv_obj_t* parent, const char* label) {
    lv_obj_t* row = lv_obj_create(parent);
    lv_obj_set_size(row, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_layout(row, LV_LAYOUT_FLEX);
    lv_obj_set_flex_flow(row, LV_FLEX_FLOW_ROW);
    lv_obj_set_style_pad_all(row, 0, 0);
    lv_obj_set_style_pad_column(row, 6, 0);
    lv_obj_set_style_bg_opa(row, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(row, 0, 0);
    lv_obj_clear_flag(row, LV_OBJ_FLAG_SCROLLABLE);

    lv_obj_t* dot = lv_obj_create(row);
    lv_obj_set_size(dot, 12, 12);
    lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
    lv_obj_set_style_bg_color(dot, lv_color_hex(C_RED), 0);
    lv_obj_set_style_border_width(dot, 0, 0);

    lv_obj_t* lbl = lv_label_create(row);
    lv_label_set_text(lbl, label);
    lv_obj_set_style_text_color(lbl, lv_color_hex(C_MUTED), 0);
    lv_obj_set_style_text_font(lbl, &lv_font_montserrat_12, 0);

    return dot;
}

// ─── Helper: botón grande ─────────────────────────────────────────────────────
static lv_obj_t* _big_btn(lv_obj_t* parent, const char* title, const char* sub,
                           uint32_t accent, lv_event_cb_t cb) {
    lv_obj_t* btn = lv_button_create(parent);
    lv_obj_set_width(btn, 720);
    lv_obj_set_height(btn, 280);
    lv_obj_set_style_bg_color(btn, lv_color_hex(C_CARD), 0);
    lv_obj_set_style_bg_color(btn, lv_color_hex(0x253347), LV_STATE_PRESSED);
    lv_obj_set_style_border_color(btn, lv_color_hex(accent), 0);
    lv_obj_set_style_border_width(btn, 2, 0);
    lv_obj_set_style_radius(btn, 20, 0);
    lv_obj_set_layout(btn, LV_LAYOUT_FLEX);
    lv_obj_set_flex_flow(btn, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(btn, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_add_event_cb(btn, cb, LV_EVENT_CLICKED, nullptr);

    lv_obj_t* t = lv_label_create(btn);
    lv_label_set_text(t, title);
    lv_obj_set_style_text_color(t, lv_color_hex(accent), 0);
    lv_obj_set_style_text_font(t, &lv_font_montserrat_24, 0);

    lv_obj_t* s = lv_label_create(btn);
    lv_label_set_text(s, sub);
    lv_obj_set_style_text_color(s, lv_color_hex(C_MUTED), 0);
    lv_obj_set_style_text_font(s, &lv_font_montserrat_14, 0);

    return btn;
}

// ─── API ─────────────────────────────────────────────────────────────────────
void screen_home_create() {
    _scr = lv_obj_create(nullptr);
    lv_obj_set_style_bg_color(_scr, lv_color_hex(C_BG), 0);
    lv_obj_clear_flag(_scr, LV_OBJ_FLAG_SCROLLABLE);

    // Contenedor central
    lv_obj_t* cont = lv_obj_create(_scr);
    lv_obj_set_size(cont, 800, 1280);
    lv_obj_set_pos(cont, 0, 0);
    lv_obj_set_layout(cont, LV_LAYOUT_FLEX);
    lv_obj_set_flex_flow(cont, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(cont, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_set_style_pad_row(cont, 40, 0);
    lv_obj_set_style_bg_color(cont, lv_color_hex(C_BG), 0);
    lv_obj_set_style_border_width(cont, 0, 0);
    lv_obj_clear_flag(cont, LV_OBJ_FLAG_SCROLLABLE);

    // Título
    lv_obj_t* title = lv_label_create(cont);
    lv_label_set_text(title, "Enki Cocina");
    lv_obj_set_style_text_color(title, lv_color_hex(C_ACCENT), 0);
    lv_obj_set_style_text_font(title, &lv_font_montserrat_24, 0);

    lv_obj_t* ver = lv_label_create(cont);
    lv_label_set_text(ver, FIRMWARE_VERSION);
    lv_obj_set_style_text_color(ver, lv_color_hex(C_MUTED), 0);
    lv_obj_set_style_text_font(ver, &lv_font_montserrat_12, 0);

    // Botón CONFIG
    _big_btn(cont, "CONFIGURACION", "WiFi · MQTT · Identidad", C_ACCENT, _btn_config_cb);

    // Botón COCINA
    _big_btn(cont, "COCINA", "Ver y gestionar pedidos", 0x38bdf8, _btn_cocina_cb);

    // Barra de estado
    lv_obj_t* sbar = lv_obj_create(cont);
    lv_obj_set_size(sbar, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_layout(sbar, LV_LAYOUT_FLEX);
    lv_obj_set_flex_flow(sbar, LV_FLEX_FLOW_ROW);
    lv_obj_set_style_pad_all(sbar, 0, 0);
    lv_obj_set_style_pad_column(sbar, 20, 0);
    lv_obj_set_style_bg_opa(sbar, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(sbar, 0, 0);
    lv_obj_clear_flag(sbar, LV_OBJ_FLAG_SCROLLABLE);

    _dot_wifi = _status_dot(sbar, "WiFi");
    _dot_mqtt = _status_dot(sbar, "MQTT");
}

void screen_home_load() {
    if (_scr) lv_scr_load(_scr);
}

void screen_home_set_wifi(bool ok) {
    if (_dot_wifi) lv_obj_set_style_bg_color(_dot_wifi, lv_color_hex(ok ? C_GREEN : C_RED), 0);
}

void screen_home_set_mqtt(bool ok) {
    if (_dot_mqtt) lv_obj_set_style_bg_color(_dot_mqtt, lv_color_hex(ok ? C_GREEN : C_RED), 0);
}
