/**
 * @file ui.c
 * @brief Cocina P4 — pantalla LVGL 9 (barra de estado + tarjetas de pedido).
 *
 * Layout (800x1280 vertical):
 *   [ barra 108px: estacion | WiFi | MQTT | hora | N pedidos ]
 *   [ lista scrolleable de tarjetas, 1 por pedido activo        ]
 *   [ banner inferior de aviso (sin WiFi / sin config)          ]
 *
 * Colores por prioridad:
 *   prioridad 2 (urgente)  -> rojo, borde parpadeante cada 600 ms
 *   prioridad 3            -> ambar
 *   resto                  -> azul grisaceo
 */

#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#include "esp_err.h"
#include "esp_log.h"

/* El lock de LVGL lo expone el BSP (esp_lv_adapter por debajo): no se usa
 * esp_lvgl_port porque el BSP oficial ya monta su propio adapter + task. */
#include "bsp/esp-bsp.h"

#include "config.h"
#include "ui.h"

static const char *TAG = "cocina-ui";

/* ------------------------------------------------------------------ */
/* Paleta                                                             */
/* ------------------------------------------------------------------ */
#define COL_BG         0x0B0E13
#define COL_BAR        0x161C26
#define COL_TEXT       0xE6EDF3
#define COL_MUTED      0x8B949E
#define COL_CARD       0x1B2430
#define COL_CARD_P3    0x3A2E0A
#define COL_BORDER     0x2C3644
#define COL_P2         0xFF4D4F
#define COL_P3         0xF0A500
#define COL_OK         0x3FB950
#define COL_OFF        0x6E7681
#define COL_DONE       0x2E7D4F

/* ------------------------------------------------------------------ */
/* Tipografias (segun lo habilitado en sdkconfig.defaults)            */
/* ------------------------------------------------------------------ */
#if LV_FONT_MONTSERRAT_32
#define F_CONTENIDO  (&lv_font_montserrat_32)
#elif LV_FONT_MONTSERRAT_28
#define F_CONTENIDO  (&lv_font_montserrat_28)
#else
#define F_CONTENIDO  LV_FONT_DEFAULT
#endif

#if LV_FONT_MONTSERRAT_28
#define F_RELOJ      (&lv_font_montserrat_28)
#else
#define F_RELOJ      LV_FONT_DEFAULT
#endif

#if LV_FONT_MONTSERRAT_48
#define F_CONTADOR   (&lv_font_montserrat_48)
#elif LV_FONT_MONTSERRAT_32
#define F_CONTADOR   (&lv_font_montserrat_32)
#else
#define F_CONTADOR   LV_FONT_DEFAULT
#endif

#if LV_FONT_MONTSERRAT_24
#define F_MEDIA      (&lv_font_montserrat_24)
#else
#define F_MEDIA      LV_FONT_DEFAULT
#endif

#if LV_FONT_MONTSERRAT_20
#define F_PEQUENA    (&lv_font_montserrat_20)
#else
#define F_PEQUENA    LV_FONT_DEFAULT
#endif

/* ------------------------------------------------------------------ */
/* Estado                                                             */
/* ------------------------------------------------------------------ */
#define BAR_H        108
#define BANNER_H     52
#define MAX_CARDS    12
#define FLASH_MS     600   /* semiperiodo del parpadeo de prioridad 2 */

typedef struct {
    char        item_id[COCINA_ITEM_ID_LEN];
    lv_obj_t   *obj;
    lv_obj_t   *lbl_meta;
    lv_obj_t   *lbl_texto;
    bool        hecho;
    bool        parpadeando;
    lv_timer_t *timer_quita;
} card_ctx_t;

static lv_obj_t *s_scr;
static lv_obj_t *s_bar;
static lv_obj_t *s_lbl_estacion;
static lv_obj_t *s_lbl_reloj;
static lv_obj_t *s_lbl_wifi;
static lv_obj_t *s_lbl_mqtt;
static lv_obj_t *s_lbl_contador;
static lv_obj_t *s_lbl_contador_caption;
static lv_obj_t *s_list;
static lv_obj_t *s_lbl_vacio;
static lv_obj_t *s_lbl_banner;

static ui_item_done_cb_t s_done_cb;
static int  s_n_items;
static int  s_pedidos_activos;

/* Prototipos internos (orden de definicion) */
static bool  ui_lock(void);
static void  ui_unlock(void);
static void  flash_exec_cb(void *var, int32_t v);
static void  card_event_cb(lv_event_t *e);
static void  remove_timer_cb(lv_timer_t *t);
static void  card_mark_done(card_ctx_t *ctx);
static void  card_apply(card_ctx_t *ctx, const cocina_item_t *item);
static card_ctx_t *card_create(const cocina_item_t *item);
static card_ctx_t *card_find(const char *item_id);
static void  card_start_flash(card_ctx_t *ctx);
static void  refresh_empty_state(void);
static void  refresh_contador(void);
static void  build_bar(void);

/* ------------------------------------------------------------------ */
/* Lock helpers                                                       */
/* ------------------------------------------------------------------ */
static bool ui_lock(void)
{
    /* -1 = esperar indefinidamente (misma convencion que el ejemplo del BSP) */
    const esp_err_t err = bsp_display_lock(-1);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "no se pudo tomar el lock de LVGL: %s", esp_err_to_name(err));
        return false;
    }
    return true;
}

static void ui_unlock(void)
{
    bsp_display_unlock();
}

/* ------------------------------------------------------------------ */
/* Construccion                                                       */
/* ------------------------------------------------------------------ */
static void build_bar(void)
{
    s_bar = lv_obj_create(s_scr);
    lv_obj_set_size(s_bar, lv_pct(100), BAR_H);
    lv_obj_align(s_bar, LV_ALIGN_TOP_MID, 0, 0);
    lv_obj_set_style_bg_color(s_bar, lv_color_hex(COL_BAR), 0);
    lv_obj_set_style_bg_opa(s_bar, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(s_bar, 0, 0);
    lv_obj_set_style_radius(s_bar, 0, 0);
    lv_obj_set_style_pad_all(s_bar, 14, 0);
    lv_obj_set_style_pad_column(s_bar, 14, 0);
    lv_obj_set_flex_flow(s_bar, LV_FLEX_FLOW_ROW);
    lv_obj_set_flex_align(s_bar, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_CENTER);
    lv_obj_clear_flag(s_bar, LV_OBJ_FLAG_SCROLLABLE);

    /* Nombre de la estacion (ocupa el hueco libre) */
    s_lbl_estacion = lv_label_create(s_bar);
    lv_label_set_text(s_lbl_estacion, cocina_cfg_nombre());
    lv_obj_set_style_text_color(s_lbl_estacion, lv_color_hex(COL_TEXT), 0);
    lv_obj_set_style_text_font(s_lbl_estacion, F_MEDIA, 0);
    lv_obj_set_flex_grow(s_lbl_estacion, 1);

    /* Iconos de enlace */
    s_lbl_wifi = lv_label_create(s_bar);
    lv_label_set_text(s_lbl_wifi, LV_SYMBOL_WIFI);
    lv_obj_set_style_text_font(s_lbl_wifi, F_MEDIA, 0);
    lv_obj_set_style_text_color(s_lbl_wifi, lv_color_hex(COL_OFF), 0);
    lv_obj_set_style_text_opa(s_lbl_wifi, LV_OPA_50, 0);

    s_lbl_mqtt = lv_label_create(s_bar);
    lv_label_set_text(s_lbl_mqtt, "MQTT");
    lv_obj_set_style_text_font(s_lbl_mqtt, F_PEQUENA, 0);
    lv_obj_set_style_text_color(s_lbl_mqtt, lv_color_hex(COL_OFF), 0);

    /* Reloj */
    s_lbl_reloj = lv_label_create(s_bar);
    lv_label_set_text(s_lbl_reloj, "--:--");
    lv_obj_set_style_text_font(s_lbl_reloj, F_RELOJ, 0);
    lv_obj_set_style_text_color(s_lbl_reloj, lv_color_hex(COL_TEXT), 0);

    /* Contador de pedidos activos */
    lv_obj_t *box = lv_obj_create(s_bar);
    lv_obj_remove_style_all(box);
    lv_obj_set_size(box, LV_SIZE_CONTENT, LV_SIZE_CONTENT);
    lv_obj_set_flex_flow(box, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(box, LV_FLEX_ALIGN_CENTER, LV_FLEX_ALIGN_END, LV_FLEX_ALIGN_CENTER);
    lv_obj_clear_flag(box, LV_OBJ_FLAG_SCROLLABLE);

    s_lbl_contador = lv_label_create(box);
    lv_label_set_text(s_lbl_contador, "0");
    lv_obj_set_style_text_font(s_lbl_contador, F_CONTADOR, 0);
    lv_obj_set_style_text_color(s_lbl_contador, lv_color_hex(COL_OK), 0);

    s_lbl_contador_caption = lv_label_create(box);
    lv_label_set_text(s_lbl_contador_caption, "pedidos");
    lv_obj_set_style_text_font(s_lbl_contador_caption, F_PEQUENA, 0);
    lv_obj_set_style_text_color(s_lbl_contador_caption, lv_color_hex(COL_MUTED), 0);
}

void ui_init(void)
{
    if (!ui_lock()) {
        return;
    }

    lv_display_t *disp = lv_display_get_default();
    const int32_t hres = lv_display_get_vertical_resolution(disp);
    const int32_t list_h = hres - BAR_H;

    s_scr = lv_obj_create(NULL);
    lv_obj_set_style_bg_color(s_scr, lv_color_hex(COL_BG), 0);
    lv_obj_set_style_bg_opa(s_scr, LV_OPA_COVER, 0);
    lv_obj_set_style_pad_all(s_scr, 0, 0);
    lv_obj_clear_flag(s_scr, LV_OBJ_FLAG_SCROLLABLE);
    lv_screen_load(s_scr);

    build_bar();

    /* Lista central de tarjetas */
    s_list = lv_obj_create(s_scr);
    lv_obj_set_size(s_list, lv_pct(100), list_h - BANNER_H);
    lv_obj_align(s_list, LV_ALIGN_TOP_MID, 0, BAR_H);
    lv_obj_set_style_bg_color(s_list, lv_color_hex(COL_BG), 0);
    lv_obj_set_style_bg_opa(s_list, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(s_list, 0, 0);
    lv_obj_set_style_radius(s_list, 0, 0);
    lv_obj_set_style_pad_all(s_list, 16, 0);
    lv_obj_set_style_pad_row(s_list, 16, 0);
    lv_obj_set_flex_flow(s_list, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(s_list, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
    lv_obj_set_scroll_dir(s_list, LV_DIR_VER);
    lv_obj_set_scrollbar_mode(s_list, LV_SCROLLBAR_MODE_AUTO);

    /* "Sin pedidos" (visible cuando la lista esta vacia) */
    s_lbl_vacio = lv_label_create(s_list);
    lv_label_set_text(s_lbl_vacio, "Sin pedidos");
    lv_obj_set_style_text_font(s_lbl_vacio, F_CONTENIDO, 0);
    lv_obj_set_style_text_color(s_lbl_vacio, lv_color_hex(COL_MUTED), 0);
    lv_obj_align(s_lbl_vacio, LV_ALIGN_CENTER, 0, 0);
    lv_obj_add_flag(s_lbl_vacio, LV_OBJ_FLAG_IGNORE_LAYOUT);

    /* Banner de aviso (oculto por defecto) */
    s_lbl_banner = lv_label_create(s_scr);
    lv_obj_set_size(s_lbl_banner, lv_pct(100), BANNER_H);
    lv_obj_align(s_lbl_banner, LV_ALIGN_BOTTOM_MID, 0, 0);
    lv_obj_set_style_bg_color(s_lbl_banner, lv_color_hex(0xB62324), 0);
    lv_obj_set_style_bg_opa(s_lbl_banner, LV_OPA_COVER, 0);
    lv_obj_set_style_text_color(s_lbl_banner, lv_color_hex(0xFFFFFF), 0);
    lv_obj_set_style_text_font(s_lbl_banner, F_PEQUENA, 0);
    lv_obj_set_style_text_align(s_lbl_banner, LV_TEXT_ALIGN_CENTER, 0);
    lv_obj_set_style_pad_top(s_lbl_banner, 14, 0);
    lv_label_set_text(s_lbl_banner, "");
    lv_obj_add_flag(s_lbl_banner, LV_OBJ_FLAG_HIDDEN);

    refresh_empty_state();
    refresh_contador();

    ui_unlock();
    ESP_LOGI(TAG, "UI construida (%ldx%ld)", (long)lv_display_get_horizontal_resolution(disp), (long)hres);
}

/* ------------------------------------------------------------------ */
/* Barra superior                                                     */
/* ------------------------------------------------------------------ */
void ui_set_station(const char *nombre)
{
    if (!nombre || !s_lbl_estacion) return;
    if (!ui_lock()) return;
    lv_label_set_text(s_lbl_estacion, nombre);
    ui_unlock();
}

void ui_set_clock(const char *hhmm)
{
    if (!hhmm || !s_lbl_reloj) return;
    if (!ui_lock()) return;
    if (strcmp(lv_label_get_text(s_lbl_reloj), hhmm) != 0) {
        lv_label_set_text(s_lbl_reloj, hhmm);
    }
    ui_unlock();
}

void ui_set_wifi(bool ok, int rssi)
{
    if (!s_lbl_wifi) return;
    if (!ui_lock()) return;
    lv_obj_set_style_text_color(s_lbl_wifi, lv_color_hex(ok ? COL_OK : COL_OFF), 0);
    lv_obj_set_style_text_opa(s_lbl_wifi, ok ? LV_OPA_COVER : LV_OPA_50, 0);
    /* rssi < -75 dBm: enlace flojo -> aviso visual sin perder el icono */
    if (ok && rssi < -75) {
        lv_obj_set_style_text_color(s_lbl_wifi, lv_color_hex(COL_P3), 0);
    }
    ui_unlock();
}

void ui_set_mqtt(bool ok)
{
    if (!s_lbl_mqtt) return;
    if (!ui_lock()) return;
    lv_label_set_text(s_lbl_mqtt, ok ? "MQTT" : "MQTT !");
    lv_obj_set_style_text_color(s_lbl_mqtt, lv_color_hex(ok ? COL_OK : COL_OFF), 0);
    lv_obj_set_style_text_opa(s_lbl_mqtt, ok ? LV_OPA_COVER : LV_OPA_50, 0);
    ui_unlock();
}

static void refresh_contador(void)
{
    if (!s_lbl_contador) return;
    int n = s_pedidos_activos > 0 ? s_pedidos_activos : s_n_items;
    char buf[8];
    snprintf(buf, sizeof(buf), "%d", n);
    lv_label_set_text(s_lbl_contador, buf);
    lv_obj_set_style_text_color(s_lbl_contador, lv_color_hex(n > 0 ? COL_OK : COL_MUTED), 0);
}

void ui_set_pedidos_activos(int n)
{
    if (!s_lbl_contador) return;
    if (!ui_lock()) return;
    s_pedidos_activos = (n > 0) ? n : 0;
    refresh_contador();
    ui_unlock();
}

void ui_set_banner(const char *msg)
{
    if (!s_lbl_banner) return;
    if (!ui_lock()) return;
    if (msg && msg[0]) {
        lv_label_set_text(s_lbl_banner, msg);
        lv_obj_clear_flag(s_lbl_banner, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(s_lbl_banner, LV_OBJ_FLAG_HIDDEN);
    }
    ui_unlock();
}

/* ------------------------------------------------------------------ */
/* Tarjetas                                                           */
/* ------------------------------------------------------------------ */
static void refresh_empty_state(void)
{
    if (!s_lbl_vacio) return;
    if (s_n_items == 0) {
        lv_obj_clear_flag(s_lbl_vacio, LV_OBJ_FLAG_HIDDEN);
    } else {
        lv_obj_add_flag(s_lbl_vacio, LV_OBJ_FLAG_HIDDEN);
    }
}

static void flash_exec_cb(void *var, int32_t v)
{
    lv_obj_t *obj = (lv_obj_t *)var;
    /* v: 0..255 -> rojo apagado .. rojo pleno */
    lv_color_t c = lv_color_mix(lv_color_hex(COL_P2), lv_color_hex(0x3A1010), (uint8_t)v);
    lv_obj_set_style_border_color(obj, c, 0);
    lv_obj_set_style_border_width(obj, 3 + (v * 5) / 255, 0);
}

static void card_start_flash(card_ctx_t *ctx)
{
    if (!ctx || !ctx->obj || ctx->parpadeando || ctx->hecho) return;

    lv_anim_t a;
    lv_anim_init(&a);
    lv_anim_set_var(&a, ctx->obj);
    lv_anim_set_values(&a, 0, 255);
    lv_anim_set_duration(&a, FLASH_MS);
    lv_anim_set_playback_duration(&a, FLASH_MS);
    lv_anim_set_repeat_count(&a, LV_ANIM_REPEAT_INFINITE);
    lv_anim_set_exec_cb(&a, flash_exec_cb);
    lv_anim_start(&a);
    ctx->parpadeando = true;
}

static void remove_timer_cb(lv_timer_t *t)
{
    card_ctx_t *ctx = (card_ctx_t *)lv_timer_get_user_data(t);
    if (ctx) {
        ctx->timer_quita = NULL;   /* el timer se autodestruye (repeat_count 1) */
    }
    if (ctx && ctx->obj) {
        lv_obj_t *obj = ctx->obj;
        ctx->obj = NULL;           /* el free() lo hace el handler LV_EVENT_DELETE */
        lv_obj_delete(obj);
    }
}

static void card_mark_done(card_ctx_t *ctx)
{
    if (!ctx || ctx->hecho || !ctx->obj) return;
    ctx->hecho = true;

    lv_anim_delete(ctx->obj, flash_exec_cb);
    ctx->parpadeando = false;

    lv_obj_set_style_bg_color(ctx->obj, lv_color_hex(COL_DONE), 0);
    lv_obj_set_style_border_color(ctx->obj, lv_color_hex(COL_OK), 0);
    lv_obj_set_style_border_width(ctx->obj, 3, 0);
    lv_obj_set_style_text_opa(ctx->obj, LV_OPA_60, 0);
    lv_label_set_text(ctx->lbl_meta, "HECHO");
    lv_obj_set_style_text_color(ctx->lbl_meta, lv_color_hex(0xFFFFFF), 0);

    ESP_LOGI(TAG, "item %s marcado como hecho", ctx->item_id);

    if (s_done_cb) {
        s_done_cb(ctx->item_id);
    }

    /* Se retira de la pantalla tras 1 s */
    if (!ctx->timer_quita) {
        ctx->timer_quita = lv_timer_create(remove_timer_cb, 1000, ctx);
        lv_timer_set_repeat_count(ctx->timer_quita, 1);
    }
}

static void card_event_cb(lv_event_t *e)
{
    const lv_event_code_t code = lv_event_get_code(e);
    lv_obj_t *obj = (lv_obj_t *)lv_event_get_target(e);
    card_ctx_t *ctx = (card_ctx_t *)lv_obj_get_user_data(obj);

    if (code == LV_EVENT_CLICKED) {
        card_mark_done(ctx);
    } else if (code == LV_EVENT_DELETE) {
        lv_anim_delete(obj, flash_exec_cb);
        if (ctx) {
            if (ctx->timer_quita) {
                lv_timer_delete(ctx->timer_quita);
                ctx->timer_quita = NULL;
            }
            free(ctx);
            lv_obj_set_user_data(obj, NULL);
        }
        if (s_n_items > 0) s_n_items--;
        if (s_lbl_vacio) refresh_empty_state();
        if (s_lbl_contador) refresh_contador();
    }
}

static lv_color_t card_bg_for(const cocina_item_t *item)
{
    if (item->prioridad == 2) return lv_color_hex(0x3A1010);
    if (item->prioridad >= 3) return lv_color_hex(COL_CARD_P3);
    return lv_color_hex(COL_CARD);
}

static lv_color_t card_border_for(const cocina_item_t *item)
{
    if (item->prioridad == 2) return lv_color_hex(COL_P2);
    if (item->prioridad >= 3) return lv_color_hex(COL_P3);
    return lv_color_hex(COL_BORDER);
}

static void card_format_meta(const cocina_item_t *item, char *out, size_t len)
{
    const char *mesa = item->mesa[0] ? item->mesa : "SIN MESA";
    if (item->prioridad == 2) {
        snprintf(out, len, "%s  ·  URGENTE", mesa);
    } else if (item->prioridad >= 3) {
        snprintf(out, len, "%s  ·  PREFERENTE", mesa);
    } else {
        snprintf(out, len, "%s", mesa);
    }
}

static void card_apply(card_ctx_t *ctx, const cocina_item_t *item)
{
    if (!ctx || !ctx->obj) return;

    char meta[96];
    card_format_meta(item, meta, sizeof(meta));

    lv_label_set_text(ctx->lbl_meta, meta);
    lv_obj_set_style_text_color(ctx->lbl_meta, lv_color_hex(item->prioridad >= 2 ? COL_P2 : COL_MUTED), 0);

    char texto[COCINA_ITEM_TEXT_LEN + 16];
    if (item->cantidad > 1) {
        snprintf(texto, sizeof(texto), "%dx  %s", item->cantidad, item->texto);
    } else {
        snprintf(texto, sizeof(texto), "%s", item->texto[0] ? item->texto : "(sin contenido)");
    }
    lv_label_set_text(ctx->lbl_texto, texto);

    lv_obj_set_style_bg_color(ctx->obj, card_bg_for(item), 0);
    lv_obj_set_style_border_color(ctx->obj, card_border_for(item), 0);
    lv_obj_set_style_border_width(ctx->obj, item->prioridad >= 2 ? 5 : 3, 0);

    if ((item->prioridad == 2 || item->destacar) && !ctx->hecho) {
        card_start_flash(ctx);
    } else {
        lv_anim_delete(ctx->obj, flash_exec_cb);
        ctx->parpadeando = false;
    }

    if (item->hecho && !ctx->hecho) {
        card_mark_done(ctx);
    }
}

static card_ctx_t *card_create(const cocina_item_t *item)
{
    card_ctx_t *ctx = (card_ctx_t *)calloc(1, sizeof(*ctx));
    if (!ctx) {
        ESP_LOGE(TAG, "sin memoria para la tarjeta %s", item->item_id);
        return NULL;
    }
    strlcpy(ctx->item_id, item->item_id, sizeof(ctx->item_id));

    lv_obj_t *card = lv_obj_create(s_list);
    ctx->obj = card;
    lv_obj_set_width(card, lv_pct(100));
    lv_obj_set_height(card, LV_SIZE_CONTENT);
    lv_obj_set_style_radius(card, 18, 0);
    lv_obj_set_style_pad_all(card, 18, 0);
    lv_obj_set_style_pad_row(card, 10, 0);
    lv_obj_set_style_bg_opa(card, LV_OPA_COVER, 0);
    lv_obj_set_style_border_width(card, 3, 0);
    lv_obj_set_style_shadow_width(card, 0, 0);
    lv_obj_set_flex_flow(card, LV_FLEX_FLOW_COLUMN);
    lv_obj_set_flex_align(card, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START, LV_FLEX_ALIGN_START);
    lv_obj_clear_flag(card, LV_OBJ_FLAG_SCROLLABLE);
    lv_obj_add_flag(card, LV_OBJ_FLAG_CLICKABLE);
    lv_obj_set_user_data(card, ctx);
    lv_obj_add_event_cb(card, card_event_cb, LV_EVENT_CLICKED, NULL);
    lv_obj_add_event_cb(card, card_event_cb, LV_EVENT_DELETE, NULL);

    ctx->lbl_meta = lv_label_create(card);
    lv_obj_set_width(ctx->lbl_meta, lv_pct(100));
    lv_label_set_long_mode(ctx->lbl_meta, LV_LABEL_LONG_DOT);
    lv_obj_set_style_text_font(ctx->lbl_meta, F_MEDIA, 0);
    lv_obj_set_style_text_color(ctx->lbl_meta, lv_color_hex(COL_MUTED), 0);

    ctx->lbl_texto = lv_label_create(card);
    lv_obj_set_width(ctx->lbl_texto, lv_pct(100));
    lv_label_set_long_mode(ctx->lbl_texto, LV_LABEL_LONG_WRAP);
    lv_obj_set_style_text_font(ctx->lbl_texto, F_CONTENIDO, 0);
    lv_obj_set_style_text_color(ctx->lbl_texto, lv_color_hex(COL_TEXT), 0);
    lv_obj_set_style_text_line_space(ctx->lbl_texto, 4, 0);

    s_n_items++;
    card_apply(ctx, item);
    return ctx;
}

static card_ctx_t *card_find(const char *item_id)
{
    const uint32_t n = lv_obj_get_child_count(s_list);
    for (uint32_t i = 0; i < n; i++) {
        lv_obj_t *child = lv_obj_get_child(s_list, (int32_t)i);
        card_ctx_t *ctx = (card_ctx_t *)lv_obj_get_user_data(child);
        if (ctx && strcmp(ctx->item_id, item_id) == 0) {
            return ctx;
        }
    }
    return NULL;
}

/* Si la lista esta llena se libera el hueco mas antiguo (primer hijo real). */
static void evict_oldest_card(void)
{
    const uint32_t n = lv_obj_get_child_count(s_list);
    for (uint32_t i = 0; i < n; i++) {
        lv_obj_t *child = lv_obj_get_child(s_list, (int32_t)i);
        if (lv_obj_get_user_data(child) != NULL) {
            ESP_LOGW(TAG, "lista llena (%d tarjetas): se descarta la mas antigua", MAX_CARDS);
            lv_obj_delete(child);
            return;
        }
    }
}

void ui_set_on_item_done(ui_item_done_cb_t cb)
{
    s_done_cb = cb;
}

void ui_upsert_item(const cocina_item_t *item)
{
    if (!item || item->item_id[0] == '\0') return;
    if (!ui_lock()) return;

    card_ctx_t *ctx = card_find(item->item_id);
    if (ctx) {
        card_apply(ctx, item);
    } else {
        if (s_n_items >= MAX_CARDS) {
            evict_oldest_card();
        }
        if (card_create(item) == NULL) {
            ui_unlock();
            return;
        }
    }
    refresh_empty_state();
    refresh_contador();
    ui_unlock();
}

void ui_remove_item(const char *item_id)
{
    if (!item_id || !item_id[0]) return;
    if (!ui_lock()) return;
    card_ctx_t *ctx = card_find(item_id);
    if (ctx && ctx->obj) {
        lv_obj_t *obj = ctx->obj;
        ctx->obj = NULL;    /* evita doble borrado desde el timer */
        lv_obj_delete(obj);
    }
    refresh_empty_state();
    refresh_contador();
    ui_unlock();
}

void ui_replace_items(const cocina_item_t *items, int count)
{
    if (!ui_lock()) return;

    /* Borra todas las tarjetas (deja el label "Sin pedidos") */
    uint32_t n = lv_obj_get_child_count(s_list);
    for (int32_t i = (int32_t)n - 1; i >= 0; i--) {
        lv_obj_t *child = lv_obj_get_child(s_list, i);
        if (child != s_lbl_vacio) {
            lv_obj_delete(child);
        }
    }
    s_n_items = 0;

    for (int i = 0; items && i < count; i++) {
        if (items[i].item_id[0] == '\0') continue;
        if (s_n_items >= MAX_CARDS) break;
        card_create(&items[i]);
    }
    refresh_empty_state();
    refresh_contador();
    ui_unlock();
}

void ui_clear_items(void)
{
    ui_replace_items(NULL, 0);
}

int ui_item_count(void)
{
    return s_n_items;
}
