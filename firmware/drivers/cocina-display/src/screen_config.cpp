// screen_config.cpp — Pantalla de configuración
// WiFi (scanner + 3 slots) · MQTT · Identidad · Config cocina

#include "screen_config.h"
#include "app.h"
#include "enki_base.h"

// ─── Colores ─────────────────────────────────────────────────────────────────
#define C_BG     0x0f172a
#define C_CARD   0x1e293b
#define C_BORDER 0x1e3a5f
#define C_ACCENT 0xe94560
#define C_TEXT   0xf1f5f9
#define C_MUTED  0x94a3b8
#define C_INPUT  0x0f3460
#define C_GREEN  0x4ade80

// ─── Geometría ────────────────────────────────────────────────────────────────
static const int32_t PAD   = 16;
static const int32_t GAP   = 8;
static const int32_t TA_H  = 52;
static const int32_t BTN_H = 56;
static const int32_t KBD_H = 420;
static const int32_t SCR_W = 800;
static const int32_t SCR_H = 1280;

// ─── Scan results ─────────────────────────────────────────────────────────────
static CfgScanResult _scan_results[CFG_SCAN_MAX];
static int           _scan_n = 0;

// ─── Widgets ─────────────────────────────────────────────────────────────────
static lv_obj_t* _scr       = nullptr;
static lv_obj_t* _cont      = nullptr;
static lv_obj_t* _kbd       = nullptr;
static lv_obj_t* _scan_list = nullptr;
static lv_obj_t* _scan_lbl  = nullptr;
static lv_obj_t* _msg       = nullptr;

static lv_obj_t* _ta_ssid[3] = {};
static lv_obj_t* _ta_pass[3] = {};
static lv_obj_t* _ta_mhost   = nullptr;
static lv_obj_t* _ta_mport   = nullptr;
static lv_obj_t* _ta_muser   = nullptr;
static lv_obj_t* _ta_mpass   = nullptr;
static lv_obj_t* _ta_devid   = nullptr;
static lv_obj_t* _ta_projid  = nullptr;
static lv_obj_t* _ta_nombre  = nullptr;
static lv_obj_t* _ta_tipo    = nullptr;
static lv_obj_t* _ta_filtros = nullptr;

// ─── Estilos inline ───────────────────────────────────────────────────────────
static void _sty_ta(lv_obj_t* o) {
    lv_obj_set_style_bg_color(o, lv_color_hex(C_INPUT), 0);
    lv_obj_set_style_border_color(o, lv_color_hex(C_BORDER), 0);
    lv_obj_set_style_border_width(o, 1, 0);
    lv_obj_set_style_border_color(o, lv_color_hex(C_ACCENT), LV_STATE_FOCUSED);
    lv_obj_set_style_border_width(o, 2, LV_STATE_FOCUSED);
    lv_obj_set_style_radius(o, 8, 0);
    lv_obj_set_style_text_color(o, lv_color_hex(C_TEXT), 0);
    lv_obj_set_style_text_font(o, &lv_font_montserrat_14, 0);
    lv_obj_set_style_pad_left(o, 10, 0);
    lv_obj_set_style_pad_top(o, 9, 0);
}

// ─── Event handlers ───────────────────────────────────────────────────────────
static void _kbd_cb(lv_event_t* e) {
    lv_event_code_t c = lv_event_get_code(e);
    if (c == LV_EVENT_READY || c == LV_EVENT_CANCEL) {
        lv_obj_add_flag(_kbd, LV_OBJ_FLAG_HIDDEN);
        lv_obj_set_height(_cont, SCR_H);
    }
}

static void _ta_focused(lv_event_t* e) {
    lv_obj_t* ta = (lv_obj_t*)lv_event_get_target(e);
    lv_keyboard_set_textarea(_kbd, ta);
    lv_obj_remove_flag(_kbd, LV_OBJ_FLAG_HIDDEN);
    lv_obj_set_height(_cont, SCR_H - KBD_H);
    lv_obj_scroll_to_view_recursive(ta, LV_ANIM_ON);
}

static void _scan_btn_cb(lv_event_t* e) {
    if (lv_event_get_code(e) == LV_EVENT_CLICKED) app_request_wifi_scan();
}

static void _back_btn_cb(lv_event_t* e) {
    if (lv_event_get_code(e) == LV_EVENT_CLICKED) app_goto(SCREEN_HOME);
}

static void _scan_item_cb(lv_event_t* e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    int i = (int)(uintptr_t)lv_event_get_user_data(e);
    if (i < 0 || i >= _scan_n) return;
    const char* ssid = _scan_results[i].ssid;
    for (int j = 0; j < 3; j++) {
        const char* cur = lv_textarea_get_text(_ta_ssid[j]);
        if (!cur || !cur[0] || strcmp(cur, ssid) == 0) {
            lv_textarea_set_text(_ta_ssid[j], ssid);
            lv_obj_scroll_to_view_recursive(_ta_pass[j], LV_ANIM_ON);
            return;
        }
    }
    lv_textarea_set_text(_ta_ssid[0], ssid);
}

static void _save_cb(lv_event_t* e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    app_config_save();
}

// ─── Widget factories ─────────────────────────────────────────────────────────
static lv_obj_t* _ta(lv_obj_t* p, const char* ph, bool pwd) {
    lv_obj_t* ta = lv_textarea_create(p);
    lv_obj_set_width(ta, LV_PCT(100));
    lv_obj_set_height(ta, TA_H);
    lv_textarea_set_placeholder_text(ta, ph);
    lv_textarea_set_one_line(ta, true);
    if (pwd) lv_textarea_set_password_mode(ta, true);
    _sty_ta(ta);
    lv_obj_add_event_cb(ta, _ta_focused, LV_EVENT_FOCUSED, nullptr);
    return ta;
}

static lv_obj_t* _lbl(lv_obj_t* p, const char* t, uint32_t c, const lv_font_t* f) {
    lv_obj_t* l = lv_label_create(p);
    lv_label_set_text(l, t);
    lv_obj_set_style_text_color(l, lv_color_hex(c), 0);
    lv_obj_set_style_text_font(l, f, 0);
    return l;
}

static lv_obj_t* _card(lv_obj_t* p) {
    lv_obj_t* c = lv_obj_create(p);
    lv_obj_set_width(c, LV_PCT(100));
    lv_obj_set_height(c, LV_SIZE_CONTENT);
    lv_obj_set_layout(c, LV_LAYOUT_FLEX);
    lv_obj_set_flex_flow(c, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_all(c, PAD, 0);
    lv_obj_set_style_pad_row(c, GAP, 0);
    lv_obj_set_style_bg_color(c, lv_color_hex(C_CARD), 0);
    lv_obj_set_style_border_color(c, lv_color_hex(C_BORDER), 0);
    lv_obj_set_style_border_width(c, 1, 0);
    lv_obj_set_style_radius(c, 12, 0);
    lv_obj_clear_flag(c, LV_OBJ_FLAG_SCROLLABLE);
    return c;
}

static lv_obj_t* _row(lv_obj_t* p) {
    lv_obj_t* r = lv_obj_create(p);
    lv_obj_set_width(r, LV_PCT(100));
    lv_obj_set_height(r, LV_SIZE_CONTENT);
    lv_obj_set_layout(r, LV_LAYOUT_FLEX);
    lv_obj_set_flex_flow(r, LV_FLEX_FLOW_ROW);
    lv_obj_set_style_pad_all(r, 0, 0);
    lv_obj_set_style_pad_column(r, GAP, 0);
    lv_obj_set_style_bg_opa(r, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(r, 0, 0);
    lv_obj_clear_flag(r, LV_OBJ_FLAG_SCROLLABLE);
    return r;
}

static lv_obj_t* _btn(lv_obj_t* p, const char* t, uint32_t bg, uint32_t fg,
                       bool outline, lv_event_cb_t cb) {
    lv_obj_t* b = lv_button_create(p);
    lv_obj_set_width(b, LV_PCT(100));
    lv_obj_set_height(b, BTN_H);
    lv_obj_set_style_bg_color(b, lv_color_hex(bg), 0);
    lv_obj_set_style_radius(b, 8, 0);
    lv_obj_set_style_border_width(b, outline ? 1 : 0, 0);
    if (outline) lv_obj_set_style_border_color(b, lv_color_hex(C_ACCENT), 0);
    lv_obj_t* l = lv_label_create(b);
    lv_label_set_text(l, t);
    lv_obj_set_style_text_color(l, lv_color_hex(fg), 0);
    lv_obj_set_style_text_font(l, &lv_font_montserrat_16, 0);
    lv_obj_center(l);
    if (cb) lv_obj_add_event_cb(b, cb, LV_EVENT_CLICKED, nullptr);
    return b;
}

// ─── Public API ───────────────────────────────────────────────────────────────
void screen_config_create() {
    _scr = lv_obj_create(nullptr);
    lv_obj_set_style_bg_color(_scr, lv_color_hex(C_BG), 0);
    lv_obj_clear_flag(_scr, LV_OBJ_FLAG_SCROLLABLE);

    _cont = lv_obj_create(_scr);
    lv_obj_set_size(_cont, SCR_W, SCR_H);
    lv_obj_set_pos(_cont, 0, 0);
    lv_obj_set_layout(_cont, LV_LAYOUT_FLEX);
    lv_obj_set_flex_flow(_cont, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_bg_color(_cont, lv_color_hex(C_BG), 0);
    lv_obj_set_style_border_width(_cont, 0, 0);
    lv_obj_set_style_pad_all(_cont, PAD, 0);
    lv_obj_set_style_pad_row(_cont, PAD, 0);

    // Header: título + botón volver
    lv_obj_t* hdr = _row(_cont);
    lv_obj_t* title_l = _lbl(hdr, "Configuracion", C_ACCENT, &lv_font_montserrat_24);
    lv_obj_set_flex_grow(title_l, 1);
    lv_obj_t* back = lv_button_create(hdr);
    lv_obj_set_size(back, 100, 44);
    lv_obj_set_style_bg_color(back, lv_color_hex(C_INPUT), 0);
    lv_obj_set_style_border_width(back, 0, 0);
    lv_obj_set_style_radius(back, 8, 0);
    lv_obj_t* back_l = lv_label_create(back);
    lv_label_set_text(back_l, "< Volver");
    lv_obj_set_style_text_color(back_l, lv_color_hex(C_MUTED), 0);
    lv_obj_set_style_text_font(back_l, &lv_font_montserrat_14, 0);
    lv_obj_center(back_l);
    lv_obj_add_event_cb(back, _back_btn_cb, LV_EVENT_CLICKED, nullptr);

    // Mensaje de estado
    _msg = lv_label_create(_cont);
    lv_label_set_text(_msg, "");
    lv_obj_set_style_text_font(_msg, &lv_font_montserrat_14, 0);
    lv_obj_add_flag(_msg, LV_OBJ_FLAG_HIDDEN);

    // ── Card WiFi ─────────────────────────────────────────────────────────
    lv_obj_t* wc = _card(_cont);
    _lbl(wc, "WiFi", C_ACCENT, &lv_font_montserrat_16);
    _btn(wc, "Escanear redes", C_INPUT, C_ACCENT, true, _scan_btn_cb);

    _scan_lbl = lv_label_create(wc);
    lv_label_set_text(_scan_lbl, "");
    lv_obj_set_style_text_color(_scan_lbl, lv_color_hex(C_MUTED), 0);
    lv_obj_set_style_text_font(_scan_lbl, &lv_font_montserrat_12, 0);
    lv_obj_add_flag(_scan_lbl, LV_OBJ_FLAG_HIDDEN);

    _scan_list = lv_obj_create(wc);
    lv_obj_set_width(_scan_list, LV_PCT(100));
    lv_obj_set_height(_scan_list, 200);
    lv_obj_set_layout(_scan_list, LV_LAYOUT_FLEX);
    lv_obj_set_flex_flow(_scan_list, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_bg_color(_scan_list, lv_color_hex(C_BG), 0);
    lv_obj_set_style_border_color(_scan_list, lv_color_hex(C_BORDER), 0);
    lv_obj_set_style_border_width(_scan_list, 1, 0);
    lv_obj_set_style_radius(_scan_list, 8, 0);
    lv_obj_set_style_pad_all(_scan_list, 4, 0);
    lv_obj_set_style_pad_row(_scan_list, 4, 0);
    lv_obj_add_flag(_scan_list, LV_OBJ_FLAG_HIDDEN);

    static const char* slots[] = {"Red 1 (principal)", "Red 2 (backup)", "Red 3 (backup)"};
    for (int i = 0; i < 3; i++) {
        _lbl(wc, slots[i], C_MUTED, &lv_font_montserrat_12);
        lv_obj_t* r = _row(wc);
        _ta_ssid[i] = lv_textarea_create(r);
        lv_obj_set_flex_grow(_ta_ssid[i], 1);
        lv_obj_set_height(_ta_ssid[i], TA_H);
        lv_textarea_set_placeholder_text(_ta_ssid[i], "SSID");
        lv_textarea_set_one_line(_ta_ssid[i], true);
        _sty_ta(_ta_ssid[i]);
        lv_obj_add_event_cb(_ta_ssid[i], _ta_focused, LV_EVENT_FOCUSED, nullptr);

        _ta_pass[i] = lv_textarea_create(r);
        lv_obj_set_flex_grow(_ta_pass[i], 1);
        lv_obj_set_height(_ta_pass[i], TA_H);
        lv_textarea_set_placeholder_text(_ta_pass[i], "Password");
        lv_textarea_set_one_line(_ta_pass[i], true);
        lv_textarea_set_password_mode(_ta_pass[i], true);
        _sty_ta(_ta_pass[i]);
        lv_obj_add_event_cb(_ta_pass[i], _ta_focused, LV_EVENT_FOCUSED, nullptr);
    }

    // ── Card MQTT ─────────────────────────────────────────────────────────
    lv_obj_t* mc = _card(_cont);
    _lbl(mc, "MQTT", C_ACCENT, &lv_font_montserrat_16);
    _lbl(mc, "Host",     C_MUTED, &lv_font_montserrat_12); _ta_mhost = _ta(mc, "mqtt.ejemplo.com", false);
    _lbl(mc, "Puerto",   C_MUTED, &lv_font_montserrat_12); _ta_mport = _ta(mc, "1883", false);
    _lbl(mc, "Usuario",  C_MUTED, &lv_font_montserrat_12); _ta_muser = _ta(mc, "(opcional)", false);
    _lbl(mc, "Password", C_MUTED, &lv_font_montserrat_12); _ta_mpass = _ta(mc, "(opcional)", true);

    // ── Card Identidad ────────────────────────────────────────────────────
    lv_obj_t* ic = _card(_cont);
    _lbl(ic, "Identidad", C_ACCENT, &lv_font_montserrat_16);
    _lbl(ic, "Device ID",  C_MUTED, &lv_font_montserrat_12); _ta_devid  = _ta(ic, "cocina-1", false);
    _lbl(ic, "Project ID", C_MUTED, &lv_font_montserrat_12); _ta_projid = _ta(ic, "nonina", false);

    // ── Card Cocina ───────────────────────────────────────────────────────
    lv_obj_t* cc = _card(_cont);
    _lbl(cc, "Cocina", C_ACCENT, &lv_font_montserrat_16);
    _lbl(cc, "Nombre",   C_MUTED, &lv_font_montserrat_12); _ta_nombre  = _ta(cc, "COCINA-1", false);
    _lbl(cc, "Tipo",     C_MUTED, &lv_font_montserrat_12); _ta_tipo    = _ta(cc, "general / horno", false);
    _lbl(cc, "Filtros",  C_MUTED, &lv_font_montserrat_12); _ta_filtros = _ta(cc, "pizzas,bebidas", false);

    // ── Guardar ───────────────────────────────────────────────────────────
    _btn(_cont, "Guardar y reiniciar", C_ACCENT, 0xffffff, false, _save_cb);

    // Espaciado final
    lv_obj_t* sp = lv_obj_create(_cont);
    lv_obj_set_size(sp, 1, 32);
    lv_obj_set_style_bg_opa(sp, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(sp, 0, 0);

    // ── Teclado ───────────────────────────────────────────────────────────
    _kbd = lv_keyboard_create(_scr);
    lv_obj_set_size(_kbd, SCR_W, KBD_H);
    lv_obj_align(_kbd, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_obj_set_style_bg_color(_kbd, lv_color_hex(C_CARD), 0);
    lv_obj_add_flag(_kbd, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_event_cb(_kbd, _kbd_cb, LV_EVENT_READY,  nullptr);
    lv_obj_add_event_cb(_kbd, _kbd_cb, LV_EVENT_CANCEL, nullptr);
}

void screen_config_load() {
    if (_scr) lv_scr_load(_scr);
}

void screen_config_populate() {
    if (!_scr) return;
    for (int i = 0; i < 3; i++) {
        if (baseCfg.wifi[i].ssid[0]) lv_textarea_set_text(_ta_ssid[i], baseCfg.wifi[i].ssid);
        if (baseCfg.wifi[i].pass[0]) lv_textarea_set_text(_ta_pass[i], baseCfg.wifi[i].pass);
    }
    if (baseCfg.mqttHost[0]) lv_textarea_set_text(_ta_mhost, baseCfg.mqttHost);
    char ps[8]; snprintf(ps, sizeof(ps), "%d", baseCfg.mqttPort ? baseCfg.mqttPort : 1883);
    lv_textarea_set_text(_ta_mport, ps);
    if (baseCfg.mqttUser[0])  lv_textarea_set_text(_ta_muser,  baseCfg.mqttUser);
    if (baseCfg.deviceId[0])  lv_textarea_set_text(_ta_devid,  baseCfg.deviceId);
    if (baseCfg.projectId[0]) lv_textarea_set_text(_ta_projid, baseCfg.projectId);

    // Config cocina desde NVS
    const char* n = enki_config_get("coc_nombre", "COCINA");
    const char* t = enki_config_get("coc_tipo",   "general");
    const char* f = enki_config_get("coc_filtros", "");
    if (n[0]) lv_textarea_set_text(_ta_nombre,  n);
    if (t[0]) lv_textarea_set_text(_ta_tipo,    t);
    if (f[0]) lv_textarea_set_text(_ta_filtros, f);
}

// Llamado desde app_config_save() que lee estos getters
const char* screen_config_get_ssid(int i)   { return lv_textarea_get_text(_ta_ssid[i]); }
const char* screen_config_get_pass(int i)   { return lv_textarea_get_text(_ta_pass[i]); }
const char* screen_config_get_mhost()       { return lv_textarea_get_text(_ta_mhost);   }
const char* screen_config_get_mport()       { return lv_textarea_get_text(_ta_mport);   }
const char* screen_config_get_muser()       { return lv_textarea_get_text(_ta_muser);   }
const char* screen_config_get_mpass()       { return lv_textarea_get_text(_ta_mpass);   }
const char* screen_config_get_devid()       { return lv_textarea_get_text(_ta_devid);   }
const char* screen_config_get_projid()      { return lv_textarea_get_text(_ta_projid);  }
const char* screen_config_get_nombre()      { return lv_textarea_get_text(_ta_nombre);  }
const char* screen_config_get_tipo()        { return lv_textarea_get_text(_ta_tipo);    }
const char* screen_config_get_filtros()     { return lv_textarea_get_text(_ta_filtros); }

void screen_config_show_msg(const char* msg, bool ok) {
    if (!_msg) return;
    lv_label_set_text(_msg, msg);
    lv_obj_set_style_text_color(_msg, lv_color_hex(ok ? C_GREEN : 0xf87171), 0);
    lv_obj_remove_flag(_msg, LV_OBJ_FLAG_HIDDEN);
}

void screen_config_scan_start() {
    if (!_scan_lbl) return;
    lv_label_set_text(_scan_lbl, "Escaneando...");
    lv_obj_remove_flag(_scan_lbl, LV_OBJ_FLAG_HIDDEN);
    if (_scan_list) { lv_obj_clean(_scan_list); lv_obj_add_flag(_scan_list, LV_OBJ_FLAG_HIDDEN); }
}

void screen_config_scan_results(const CfgScanResult* r, int n) {
    if (!_scan_list) return;
    _scan_n = (n > CFG_SCAN_MAX) ? CFG_SCAN_MAX : n;
    for (int i = 0; i < _scan_n; i++) _scan_results[i] = r[i];

    lv_obj_clean(_scan_list);
    for (int i = 0; i < _scan_n; i++) {
        lv_obj_t* btn = lv_button_create(_scan_list);
        lv_obj_set_width(btn, LV_PCT(100));
        lv_obj_set_height(btn, LV_SIZE_CONTENT);
        lv_obj_set_layout(btn, LV_LAYOUT_FLEX);
        lv_obj_set_flex_flow(btn, LV_FLEX_FLOW_ROW);
        lv_obj_set_style_bg_color(btn, lv_color_hex(C_INPUT), 0);
        lv_obj_set_style_bg_color(btn, lv_color_hex(C_BORDER), LV_STATE_PRESSED);
        lv_obj_set_style_border_width(btn, 0, 0);
        lv_obj_set_style_radius(btn, 6, 0);
        lv_obj_set_style_pad_all(btn, 8, 0);
        lv_obj_set_style_pad_column(btn, 8, 0);

        lv_obj_t* sl = lv_label_create(btn);
        lv_label_set_text(sl, r[i].ssid);
        lv_obj_set_flex_grow(sl, 1);
        lv_obj_set_style_text_color(sl, lv_color_hex(C_TEXT), 0);
        lv_obj_set_style_text_font(sl, &lv_font_montserrat_14, 0);

        char rs[20]; snprintf(rs, sizeof(rs), "%ddBm%s", r[i].rssi, r[i].open ? "" : " *");
        lv_obj_t* rl = lv_label_create(btn);
        lv_label_set_text(rl, rs);
        lv_obj_set_style_text_color(rl, lv_color_hex(C_MUTED), 0);
        lv_obj_set_style_text_font(rl, &lv_font_montserrat_12, 0);

        lv_obj_add_event_cb(btn, _scan_item_cb, LV_EVENT_CLICKED, (void*)(uintptr_t)i);
    }

    char st[32]; snprintf(st, sizeof(st), "%d redes", _scan_n);
    lv_label_set_text(_scan_lbl, st);
    lv_obj_remove_flag(_scan_lbl, LV_OBJ_FLAG_HIDDEN);
    if (_scan_n > 0) lv_obj_remove_flag(_scan_list, LV_OBJ_FLAG_HIDDEN);
}
