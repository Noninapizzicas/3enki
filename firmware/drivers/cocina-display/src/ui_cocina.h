#pragma once
/**
 * ui_cocina.h — LVGL UI para pantalla de cocina (800×1280)
 *
 * Layout:
 *  ┌─────────────────────────────────────────────────┐
 *  │ COCINA  N pedidos  ● WiFi  ● MQTT  ◉ device  HH:MM  ⚙ │ ← status bar
 *  ├─────────────────────────────────────────────────┤
 *  │ ┌─────────────────────────────────────────────┐ │
 *  │ │ [M] MESA 5                         ⏱ 3m    │ │ ← tap → mark-ready
 *  │ │  ● x2 Pizza Margherita       [prep]         │ │ ← tap → prepare-item
 *  │ │  ● x1 Coca-Cola              [pend]         │ │
 *  │ └─────────────────────────────────────────────┘ │
 *  │ ... más tarjetas (scroll) ...                   │
 *  └─────────────────────────────────────────────────┘
 */

#include <Arduino.h>
#include <lvgl.h>

// ─── Límites ──────────────────────────────────────────────────────────────────

#define UI_MAX_ORDERS    16
#define UI_MAX_ITEMS     12
#define UI_MAX_ID_LEN    48
#define UI_MAX_NAME_LEN  64
#define UI_MAX_REF_LEN   48
#define UI_MAX_CANAL_LEN 16
#define UI_MAX_NOTA_LEN  80
#define UI_MAX_VAR_LEN   80
#define UI_MAX_COLOR_LEN  8   // "#3b82f6"

// ─── Tipos ───────────────────────────────────────────────────────────────────

enum UiItemEstado : uint8_t {
    UI_ITEM_PENDIENTE  = 0,
    UI_ITEM_PREPARANDO = 1,
    UI_ITEM_LISTO      = 2,
};

enum UiPedidoEstado : uint8_t {
    UI_PEDIDO_ACTIVO = 0,
    UI_PEDIDO_LISTO  = 1,
};

struct UiItem {
    char         item_id[UI_MAX_ID_LEN];
    char         nombre[UI_MAX_NAME_LEN];
    char         notas[UI_MAX_NOTA_LEN];
    char         quitar[UI_MAX_VAR_LEN];      // "cebolla, tomate"
    char         device_color[UI_MAX_COLOR_LEN]; // "#3b82f6" — device que lo prepara
    uint8_t      cantidad;
    uint8_t      pase;
    UiItemEstado estado;
};

struct UiPedido {
    char           pedido_id[UI_MAX_ID_LEN];
    char           cuenta_id[UI_MAX_ID_LEN];
    char           ref_display[UI_MAX_REF_LEN];
    char           canal[UI_MAX_CANAL_LEN];
    char           notas_generales[UI_MAX_NOTA_LEN];
    UiItem         items[UI_MAX_ITEMS];
    uint8_t        item_count;
    UiPedidoEstado estado;
    uint32_t       received_ms;
    bool           used;
};

// ─── Config del dispositivo (panel ⚙️) ────────────────────────────────────────

struct UiDeviceConfig {
    char nombre[32];
    char tipo_estacion[16];  // "general" | "horno"
    char filtros[64];        // "pizzas,bebidas"
};

typedef void (*UiConfigApplyCb)(const UiDeviceConfig& cfg);
typedef void (*UiItemTapCb)(const char* pedido_id, const char* item_id);
typedef void (*UiHeaderTapCb)(const char* pedido_id);

// ─── API pública ─────────────────────────────────────────────────────────────

/** Inicializar UI. Llamar con lv_lock() adquirido. */
void ui_init();

/** Registrar callbacks de touch — llamar antes de ui_init o justo después. */
void ui_set_item_tap_cb(UiItemTapCb cb);
void ui_set_header_tap_cb(UiHeaderTapCb cb);

/** Actualizar indicadores de conectividad en status bar. */
void ui_set_wifi(bool connected);
void ui_set_mqtt(bool connected);

/** Mostrar color del device asignado por el backend. */
void ui_set_device_color(const char* hex_color);

/** Pedidos. */
void ui_add_order(const UiPedido& p);
void ui_update_item_by_id(const char* pedido_id, const char* item_id,
                           UiItemEstado estado, const char* device_color = nullptr);
void ui_order_listo(const char* pedido_id);
void ui_remove_order(const char* pedido_id);
void ui_clear_orders();

/** Reloj HH:MM en status bar. */
void ui_tick_clock();

/** Actualizar config actual del device (para que ⚙️ muestre valores correctos). */
void ui_set_config(const UiDeviceConfig& cfg, UiConfigApplyCb on_apply);

/** Panel de configuración del device (modal). */
void ui_show_config_panel(const UiDeviceConfig& current, UiConfigApplyCb on_apply);
