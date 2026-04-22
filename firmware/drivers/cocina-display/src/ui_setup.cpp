/**
 * ui_setup.cpp — Pantalla de configuración nativa LVGL
 *
 * Layout (800×1280, portrait):
 *   Título → card WiFi (scan + 3 slots) → card MQTT → card Identidad → Guardar
 *   Teclado LVGL fijo al fondo, aparece al hacer foco en un textarea.
 */

#include "ui_setup.h"
#include "enki_base.h"

// ─── Geometría ────────────────────────────────────────────────────────────────

static const int32_t SCR_W  = 800;
static const int32_t SCR_H  = 1280;
static const int32_t KBD_H  = 420;
static const int32_t PAD    = 16;
static const int32_t GAP    = 8;
static const int32_t TA_H   = 52;
static const int32_t BTN_H  = 56;
static const int32_t LIST_H = 220;

// ─── Colores ─────────────────────────────────────────────────────────────────

#define C_BG      0x0f172a
#define C_SURFACE 0x1e293b
#define C_BORDER  0x1e3a5f
#define C_ACCENT  0xe94560
#define C_TEXT    0xf1f5f9
#define C_MUTED   0x94a3b8
#define C_INPUT   0x0f3460
#define C_GREEN   0x4ade80

// ─── Scan results storage ─────────────────────────────────────────────────────

static UiSetupScanResult _results[UI_SETUP_UI_SETUP_MAX_SCAN];
static int               _results_n = 0;

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

static UiSetupScanCb _scan_cb = nullptr;

// ─── Estilos compartidos ─────────────────────────────────────────────────────

static void _style_ta(lv_obj_t* o) {
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
    lv_event_code_t code = lv_event_get_code(e);
    if (code == LV_EVENT_READY || code == LV_EVENT_CANCEL) {
        lv_obj_add_flag(_kbd, LV_OBJ_FLAG_HIDDEN);
        lv_obj_set_height(_cont, SCR_H);
    }
}

static void _ta_focused(lv_event_t* e) {
    lv_obj_t* ta = lv_event_get_target(e);
    lv_keyboard_set_textarea(_kbd, ta);
    lv_obj_remove_flag(_kbd, LV_OBJ_FLAG_HIDDEN);
    lv_obj_set_height(_cont, SCR_H - KBD_H);
    lv_obj_scroll_to_view_recursive(ta, LV_ANIM_ON);
}

static void _scan_btn_cb(lv_event_t* e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    if (_scan_cb) _scan_cb();
}

static void _scan_item_cb(lv_event_t* e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;
    int idx = (int)(uintptr_t)lv_event_get_user_data(e);
    if (idx < 0 || idx >= _results_n) return;
    const char* ssid = _results[idx].ssid;
    for (int i = 0; i < 3; i++) {
        const char* cur = lv_textarea_get_text(_ta_ssid[i]);
        if (!cur || !cur[0] || strcmp(cur, ssid) == 0) {
            lv_textarea_set_text(_ta_ssid[i], ssid);
            lv_obj_scroll_to_view_recursive(_ta_pass[i], LV_ANIM_ON);
            return;
        }
    }
    lv_textarea_set_text(_ta_ssid[0], ssid);
}

static void _save_cb(lv_event_t* e) {
    if (lv_event_get_code(e) != LV_EVENT_CLICKED) return;

    for (int i = 0; i < 3; i++) {
        strlcpy(baseCfg.wifi[i].ssid, lv_textarea_get_text(_ta_ssid[i]), sizeof(baseCfg.wifi[i].ssid));
        strlcpy(baseCfg.wifi[i].pass, lv_textarea_get_text(_ta_pass[i]), sizeof(baseCfg.wifi[i].pass));
    }
    strlcpy(baseCfg.mqttHost, lv_textarea_get_text(_ta_mhost), sizeof(baseCfg.mqttHost));
    baseCfg.mqttPort = (uint16_t)atoi(lv_textarea_get_text(_ta_mport));
    if (!baseCfg.mqttPort) baseCfg.mqttPort = 1883;
    strlcpy(baseCfg.mqttUser,   lv_textarea_get_text(_ta_muser),   sizeof(baseCfg.mqttUser));
    strlcpy(baseCfg.mqttPass,   lv_textarea_get_text(_ta_mpass),   sizeof(baseCfg.mqttPass));
    strlcpy(baseCfg.deviceId,   lv_textarea_get_text(_ta_devid),   sizeof(baseCfg.deviceId));
    strlcpy(baseCfg.projectId,  lv_textarea_get_text(_ta_projid),  sizeof(baseCfg.projectId));

    baseConfigSave();

    lv_label_set_text(_msg, "Guardado. Reiniciando...");
    lv_obj_set_style_text_color(_msg, lv_color_hex(C_GREEN), 0);
    lv_obj_remove_flag(_msg, LV_OBJ_FLAG_HIDDEN);

    lv_timer_create([](lv_timer_t*) { ESP.restart(); }, 1500, nullptr);
}

// ─── Widget factories ─────────────────────────────────────────────────────────

static lv_obj_t* _make_ta(lv_obj_t* p, const char* ph, bool pwd) {
    lv_obj_t* ta = lv_textarea_create(p);
    lv_obj_set_width(ta, LV_PCT(100));
    lv_obj_set_height(ta, TA_H);
    lv_textarea_set_placeholder_text(ta, ph);
    lv_textarea_set_one_line(ta, true);
    if (pwd) lv_textarea_set_password_mode(ta, true);
    _style_ta(ta);
    lv_obj_add_event_cb(ta, _ta_focused, LV_EVENT_FOCUSED, nullptr);
    return ta;
}

static lv_obj_t* _make_lbl(lv_obj_t* p, const char* txt, uint32_t color, const lv_font_t* font) {
    lv_obj_t* l = lv_label_create(p);
    lv_label_set_text(l, txt);
    lv_obj_set_style_text_color(l, lv_color_hex(color), 0);
    lv_obj_set_style_text_font(l, font, 0);
    return l;
}

static lv_obj_t* _make_card(lv_obj_t* p) {
    lv_obj_t* c = lv_obj_create(p);
    lv_obj_set_width(c, LV_PCT(100));
    lv_obj_set_height(c, LV_SIZE_CONTENT);
    lv_obj_set_layout(c, LV_LAYOUT_FLEX);
    lv_obj_set_flex_flow(c, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_pad_all(c, PAD, 0);
    lv_obj_set_style_pad_row(c, GAP, 0);
    lv_obj_set_style_bg_color(c, lv_color_hex(C_SURFACE), 0);
    lv_obj_set_style_border_color(c, lv_color_hex(C_BORDER), 0);
    lv_obj_set_style_border_width(c, 1, 0);
    lv_obj_set_style_radius(c, 12, 0);
    lv_obj_clear_flag(c, LV_OBJ_FLAG_SCROLLABLE);
    return c;
}

static lv_obj_t* _make_row(lv_obj_t* p) {
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

static lv_obj_t* _make_btn(lv_obj_t* p, const char* txt, uint32_t bg, uint32_t fg, bool outline) {
    lv_obj_t* b = lv_button_create(p);
    lv_obj_set_width(b, LV_PCT(100));
    lv_obj_set_height(b, BTN_H);
    lv_obj_set_style_bg_color(b, lv_color_hex(bg), 0);
    lv_obj_set_style_radius(b, 8, 0);
    if (outline) {
        lv_obj_set_style_border_color(b, lv_color_hex(C_ACCENT), 0);
        lv_obj_set_style_border_width(b, 1, 0);
    } else {
        lv_obj_set_style_border_width(b, 0, 0);
    }
    lv_obj_t* l = lv_label_create(b);
    lv_label_set_text(l, txt);
    lv_obj_set_style_text_color(l, lv_color_hex(fg), 0);
    lv_obj_set_style_text_font(l, &lv_font_montserrat_16, 0);
    lv_obj_center(l);
    return b;
}

// ─── Public API ───────────────────────────────────────────────────────────────

void ui_setup_create(UiSetupScanCb scan_cb) {
    _scan_cb = scan_cb;

    _scr = lv_obj_create(nullptr);
    lv_obj_set_style_bg_color(_scr, lv_color_hex(C_BG), 0);
    lv_obj_set_style_pad_all(_scr, 0, 0);
    lv_obj_clear_flag(_scr, LV_OBJ_FLAG_SCROLLABLE);

    // Scrollable content container
    _cont = lv_obj_create(_scr);
    lv_obj_set_size(_cont, SCR_W, SCR_H);
    lv_obj_set_pos(_cont, 0, 0);
    lv_obj_set_layout(_cont, LV_LAYOUT_FLEX);
    lv_obj_set_flex_flow(_cont, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_bg_color(_cont, lv_color_hex(C_BG), 0);
    lv_obj_set_style_border_width(_cont, 0, 0);
    lv_obj_set_style_pad_all(_cont, PAD, 0);
    lv_obj_set_style_pad_row(_cont, PAD, 0);

    // Título
    _make_lbl(_cont, "Enki Setup", C_ACCENT, &lv_font_montserrat_24);
    _make_lbl(_cont, "Configuracion del dispositivo", C_MUTED, &lv_font_montserrat_12);

    // Mensaje de estado (oculto)
    _msg = lv_label_create(_cont);
    lv_label_set_text(_msg, "");
    lv_obj_set_style_text_font(_msg, &lv_font_montserrat_14, 0);
    lv_obj_add_flag(_msg, LV_OBJ_FLAG_HIDDEN);

    // ── Card WiFi ────────────────────────────────────────────────────────────
    lv_obj_t* wcard = _make_card(_cont);
    _make_lbl(wcard, "WiFi", C_ACCENT, &lv_font_montserrat_16);

    lv_obj_t* sbtn = _make_btn(wcard, "Escanear redes WiFi", C_INPUT, C_ACCENT, true);
    lv_obj_add_event_cb(sbtn, _scan_btn_cb, LV_EVENT_CLICKED, nullptr);

    _scan_lbl = lv_label_create(wcard);
    lv_label_set_text(_scan_lbl, "");
    lv_obj_set_style_text_color(_scan_lbl, lv_color_hex(C_MUTED), 0);
    lv_obj_set_style_text_font(_scan_lbl, &lv_font_montserrat_12, 0);
    lv_obj_add_flag(_scan_lbl, LV_OBJ_FLAG_HIDDEN);

    _scan_list = lv_obj_create(wcard);
    lv_obj_set_width(_scan_list, LV_PCT(100));
    lv_obj_set_height(_scan_list, LIST_H);
    lv_obj_set_layout(_scan_list, LV_LAYOUT_FLEX);
    lv_obj_set_flex_flow(_scan_list, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_style_bg_color(_scan_list, lv_color_hex(C_BG), 0);
    lv_obj_set_style_border_color(_scan_list, lv_color_hex(C_BORDER), 0);
    lv_obj_set_style_border_width(_scan_list, 1, 0);
    lv_obj_set_style_radius(_scan_list, 8, 0);
    lv_obj_set_style_pad_all(_scan_list, 4, 0);
    lv_obj_set_style_pad_row(_scan_list, 4, 0);
    lv_obj_add_flag(_scan_list, LV_OBJ_FLAG_HIDDEN);

    static const char* slotnames[] = {"Red 1 (principal)", "Red 2 (backup)", "Red 3 (backup)"};
    for (int i = 0; i < 3; i++) {
        _make_lbl(wcard, slotnames[i], C_MUTED, &lv_font_montserrat_12);
        lv_obj_t* row = _make_row(wcard);

        _ta_ssid[i] = lv_textarea_create(row);
        lv_obj_set_flex_grow(_ta_ssid[i], 1);
        lv_obj_set_height(_ta_ssid[i], TA_H);
        lv_textarea_set_placeholder_text(_ta_ssid[i], "SSID");
        lv_textarea_set_one_line(_ta_ssid[i], true);
        _style_ta(_ta_ssid[i]);
        lv_obj_add_event_cb(_ta_ssid[i], _ta_focused, LV_EVENT_FOCUSED, nullptr);

        _ta_pass[i] = lv_textarea_create(row);
        lv_obj_set_flex_grow(_ta_pass[i], 1);
        lv_obj_set_height(_ta_pass[i], TA_H);
        lv_textarea_set_placeholder_text(_ta_pass[i], "Password");
        lv_textarea_set_one_line(_ta_pass[i], true);
        lv_textarea_set_password_mode(_ta_pass[i], true);
        _style_ta(_ta_pass[i]);
        lv_obj_add_event_cb(_ta_pass[i], _ta_focused, LV_EVENT_FOCUSED, nullptr);
    }

    // ── Card MQTT ────────────────────────────────────────────────────────────
    lv_obj_t* mcard = _make_card(_cont);
    _make_lbl(mcard, "MQTT", C_ACCENT, &lv_font_montserrat_16);

    _make_lbl(mcard, "Host", C_MUTED, &lv_font_montserrat_12);
    _ta_mhost = _make_ta(mcard, "mqtt.ejemplo.com", false);

    _make_lbl(mcard, "Puerto", C_MUTED, &lv_font_montserrat_12);
    _ta_mport = _make_ta(mcard, "1883", false);

    _make_lbl(mcard, "Usuario", C_MUTED, &lv_font_montserrat_12);
    _ta_muser = _make_ta(mcard, "(opcional)", false);

    _make_lbl(mcard, "Password", C_MUTED, &lv_font_montserrat_12);
    _ta_mpass = _make_ta(mcard, "(opcional)", true);

    // ── Card Identidad ───────────────────────────────────────────────────────
    lv_obj_t* icard = _make_card(_cont);
    _make_lbl(icard, "Identidad", C_ACCENT, &lv_font_montserrat_16);

    _make_lbl(icard, "Device ID", C_MUTED, &lv_font_montserrat_12);
    _ta_devid = _make_ta(icard, "cocina-1", false);

    _make_lbl(icard, "Project ID", C_MUTED, &lv_font_montserrat_12);
    _ta_projid = _make_ta(icard, "nonina", false);

    // ── Guardar ──────────────────────────────────────────────────────────────
    lv_obj_t* savebtn = _make_btn(_cont, "Guardar y reiniciar", C_ACCENT, 0xffffff, false);
    lv_obj_add_event_cb(savebtn, _save_cb, LV_EVENT_CLICKED, nullptr);

    // Espacio final
    lv_obj_t* spacer = lv_obj_create(_cont);
    lv_obj_set_size(spacer, 1, PAD * 2);
    lv_obj_set_style_bg_opa(spacer, LV_OPA_TRANSP, 0);
    lv_obj_set_style_border_width(spacer, 0, 0);

    // ── Teclado ───────────────────────────────────────────────────────────────
    _kbd = lv_keyboard_create(_scr);
    lv_obj_set_size(_kbd, SCR_W, KBD_H);
    lv_obj_align(_kbd, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_obj_set_style_bg_color(_kbd, lv_color_hex(C_SURFACE), 0);
    lv_obj_add_flag(_kbd, LV_OBJ_FLAG_HIDDEN);
    lv_obj_add_event_cb(_kbd, _kbd_cb, LV_EVENT_READY,  nullptr);
    lv_obj_add_event_cb(_kbd, _kbd_cb, LV_EVENT_CANCEL, nullptr);
}

void ui_setup_load() {
    if (_scr) lv_scr_load(_scr);
}

void ui_setup_populate() {
    if (!_scr) return;
    for (int i = 0; i < 3; i++) {
        if (baseCfg.wifi[i].ssid[0])
            lv_textarea_set_text(_ta_ssid[i], baseCfg.wifi[i].ssid);
        if (baseCfg.wifi[i].pass[0])
            lv_textarea_set_text(_ta_pass[i], baseCfg.wifi[i].pass);
    }
    if (baseCfg.mqttHost[0])  lv_textarea_set_text(_ta_mhost, baseCfg.mqttHost);
    char pstr[8];
    snprintf(pstr, sizeof(pstr), "%d", baseCfg.mqttPort ? baseCfg.mqttPort : 1883);
    lv_textarea_set_text(_ta_mport, pstr);
    if (baseCfg.mqttUser[0])  lv_textarea_set_text(_ta_muser,  baseCfg.mqttUser);
    if (baseCfg.deviceId[0])  lv_textarea_set_text(_ta_devid,  baseCfg.deviceId);
    if (baseCfg.projectId[0]) lv_textarea_set_text(_ta_projid, baseCfg.projectId);
}

void ui_setup_scan_start() {
    if (!_scan_lbl) return;
    lv_label_set_text(_scan_lbl, "Escaneando...");
    lv_obj_remove_flag(_scan_lbl, LV_OBJ_FLAG_HIDDEN);
    if (_scan_list) {
        lv_obj_clean(_scan_list);
        lv_obj_add_flag(_scan_list, LV_OBJ_FLAG_HIDDEN);
    }
}

void ui_setup_scan_results(const UiSetupScanResult* r, int n) {
    if (!_scan_list) return;

    _results_n = (n > UI_SETUP_MAX_SCAN) ? UI_SETUP_MAX_SCAN : n;
    for (int i = 0; i < _results_n; i++) _results[i] = r[i];

    lv_obj_clean(_scan_list);

    for (int i = 0; i < _results_n; i++) {
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

        lv_obj_t* ssid_l = lv_label_create(btn);
        lv_label_set_text(ssid_l, _results[i].ssid);
        lv_obj_set_flex_grow(ssid_l, 1);
        lv_obj_set_style_text_color(ssid_l, lv_color_hex(C_TEXT), 0);
        lv_obj_set_style_text_font(ssid_l, &lv_font_montserrat_14, 0);

        char rssi_s[20];
        snprintf(rssi_s, sizeof(rssi_s), "%ddBm%s", _results[i].rssi, _results[i].open ? "" : " *");
        lv_obj_t* rssi_l = lv_label_create(btn);
        lv_label_set_text(rssi_l, rssi_s);
        lv_obj_set_style_text_color(rssi_l, lv_color_hex(C_MUTED), 0);
        lv_obj_set_style_text_font(rssi_l, &lv_font_montserrat_12, 0);

        lv_obj_add_event_cb(btn, _scan_item_cb, LV_EVENT_CLICKED, (void*)(uintptr_t)i);
    }

    char status[32];
    snprintf(status, sizeof(status), "%d redes encontradas", _results_n);
    lv_label_set_text(_scan_lbl, status);
    lv_obj_remove_flag(_scan_lbl, LV_OBJ_FLAG_HIDDEN);
    if (_results_n > 0) lv_obj_remove_flag(_scan_list, LV_OBJ_FLAG_HIDDEN);
}
