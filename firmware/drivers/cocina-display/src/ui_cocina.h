#pragma once
/**
 * ui_cocina.h — LVGL UI para pantalla de cocina
 *
 * Layout (800×1280 portrait):
 *
 *  ┌──────────────────────────────────────────────┐
 *  │ COCINA   N pedidos activos   ● ●  HH:MM      │  ← status bar (60px)
 *  ├──────────────────────────────────────────────┤
 *  │  ┌────────────────────────────────────────┐  │
 *  │  │ [canal] REF_DISPLAY          ⏱ Xm      │  │  ← card header
 *  │  │  · Nombre item x2    [pendiente]        │  │
 *  │  │  · Otro item   x1    [preparando]       │  │
 *  │  └────────────────────────────────────────┘  │  ← scroll vertical
 *  │  ...más cards...                             │
 *  └──────────────────────────────────────────────┘
 *
 * Colores de estado:
 *   pendiente  → #64748b (gris)
 *   preparando → #f59e0b (ámbar)
 *   listo      → #22c55e (verde)
 */

#include <Arduino.h>
#include <lvgl.h>

// ─── Estructuras de datos de UI ─────────────────────────────────────────────

#define UI_MAX_ORDERS      16
#define UI_MAX_ITEMS       8
#define UI_MAX_NAME_LEN    64
#define UI_MAX_ID_LEN      32
#define UI_MAX_REF_LEN     32
#define UI_MAX_CANAL_LEN   16

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
    char      nombre[UI_MAX_NAME_LEN];
    uint8_t   cantidad;
    UiItemEstado estado;
};

struct UiPedido {
    char           pedido_id[UI_MAX_ID_LEN];
    char           ref_display[UI_MAX_REF_LEN];
    char           canal[UI_MAX_CANAL_LEN];
    UiItem         items[UI_MAX_ITEMS];
    uint8_t        item_count;
    UiPedidoEstado estado;
    uint32_t       received_ms;
    bool           used;
};

// ─── API pública ─────────────────────────────────────────────────────────────

/** Inicializa la UI sobre la pantalla activa de LVGL. */
void ui_init();

/** Estado de conectividad: puntos de color en el status bar. */
void ui_set_wifi(bool connected);
void ui_set_mqtt(bool connected);

/** Añadir un pedido completo (desde list-active o nuevo evento). */
void ui_add_order(const UiPedido& p);

/** Actualizar estado de un ítem de un pedido. */
void ui_update_item(const char* pedido_id, const char* item_nombre, UiItemEstado estado);

/** Marcar pedido como listo y desvanecerlo tras 5s. */
void ui_order_listo(const char* pedido_id);

/** Eliminar pedido inmediatamente (ya no activo). */
void ui_remove_order(const char* pedido_id);

/** Limpiar todos los pedidos. */
void ui_clear_orders();

/** Refrescar reloj del status bar. */
void ui_tick_clock();
