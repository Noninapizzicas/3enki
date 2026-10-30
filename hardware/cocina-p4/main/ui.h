/**
 * @file ui.h
 * @brief Cocina P4 — construccion y actualizacion de la pantalla LVGL 9.
 *
 * Modelo: la UI es la dueña de la lista de tarjetas. El modulo MQTT solo
 * traduce eventos a llamadas ui_upsert_item()/ui_remove_item()/
 * ui_replace_items(). Todas las funciones publicas son thread-safe: toman
 * el lock de LVGL del BSP (bsp_display_lock) internamente,
 * asi que NO hay que llamarlas ya con el lock tomado.
 */

#pragma once

#include <stdbool.h>
#include <stddef.h>

#include "lvgl.h"

#define COCINA_ITEM_ID_LEN    64
#define COCINA_ITEM_MESA_LEN  32
#define COCINA_ITEM_TEXT_LEN  256

/** Un pedido/linea a mostrar en una tarjeta. */
typedef struct {
    char item_id[COCINA_ITEM_ID_LEN];    /**< id que se devuelve en prepare-item */
    char mesa[COCINA_ITEM_MESA_LEN];     /**< "MESA 4" / "BARRA" / "#123" */
    char texto[COCINA_ITEM_TEXT_LEN];    /**< contenido legible de pie (32 px) */
    int  prioridad;                      /**< 0..3; 2 = urgente (parpadea) */
    int  cantidad;                       /**< unidades; <=1 no se muestra */
    bool hecho;                          /**< ya marcado como hecho por el cocinero */
    bool destacar;                       /**< forzar parpadeo (p.ej. accion pedido_listo) */
} cocina_item_t;

/** Callback al tocar una tarjeta (se publica prepare-item con done:true). */
typedef void (*ui_item_done_cb_t)(const char *item_id);

void ui_init(void);

/* Barra superior */
void ui_set_station(const char *nombre);
void ui_set_clock(const char *hhmm);
void ui_set_wifi(bool ok, int rssi);
void ui_set_mqtt(bool ok);
void ui_set_pedidos_activos(int n);
void ui_set_banner(const char *msg);          /* NULL o "" oculta el aviso */

/* Tarjetas */
void ui_set_on_item_done(ui_item_done_cb_t cb);
void ui_upsert_item(const cocina_item_t *item);
void ui_remove_item(const char *item_id);
void ui_replace_items(const cocina_item_t *items, int count);
void ui_clear_items(void);
int  ui_item_count(void);
