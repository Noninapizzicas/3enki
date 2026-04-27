#pragma once
// screen_cocina.h — Pantalla de pedidos (réplica web /cocina)

#include <Arduino.h>
#include <lvgl.h>

// ─── Límites ─────────────────────────────────────────────────────────────────
#define COC_MAX_ORDERS  16
#define COC_MAX_ITEMS   12
#define COC_ID_LEN      48
#define COC_NAME_LEN    64
#define COC_REF_LEN     48
#define COC_NOTA_LEN    80
#define COC_VAR_LEN     80
#define COC_COLOR_LEN    8

// ─── Tipos ───────────────────────────────────────────────────────────────────
enum CocItemState  : uint8_t { COC_PENDIENTE = 0, COC_PREPARANDO = 1, COC_LISTO = 2 };
enum CocOrderState : uint8_t { COC_ACTIVO = 0, COC_COMPLETADO = 1 };

struct CocItem {
    char         id[COC_ID_LEN];
    char         nombre[COC_NAME_LEN];
    char         notas[COC_NOTA_LEN];
    char         quitar[COC_VAR_LEN];
    char         dev_color[COC_COLOR_LEN];
    uint8_t      cantidad;
    uint8_t      pase;
    CocItemState state;
};

struct CocOrder {
    char          id[COC_ID_LEN];
    char          ref[COC_REF_LEN];
    char          canal[16];
    char          notas[COC_NOTA_LEN];
    CocItem       items[COC_MAX_ITEMS];
    uint8_t       item_count;
    CocOrderState state;
    uint32_t      received_ms;
    bool          used;
};

// ─── Callbacks (Core 0 → app Core 1) ─────────────────────────────────────────
typedef void (*CocItemTapCb)(const char* order_id, const char* item_id);
typedef void (*CocHeaderTapCb)(const char* order_id);

// ─── API ─────────────────────────────────────────────────────────────────────
void screen_cocina_create(CocItemTapCb on_item, CocHeaderTapCb on_header);
void screen_cocina_load();
void screen_cocina_set_wifi(bool ok);
void screen_cocina_set_mqtt(bool ok);
void screen_cocina_set_device_color(const char* hex);
void screen_cocina_add_order(const CocOrder& o);
void screen_cocina_update_item(const char* order_id, const char* item_id,
                               CocItemState state, const char* dev_color = nullptr);
void screen_cocina_order_done(const char* order_id);
void screen_cocina_remove_order(const char* order_id);
void screen_cocina_clear();
void screen_cocina_tick();  // actualizar timers de pedidos
