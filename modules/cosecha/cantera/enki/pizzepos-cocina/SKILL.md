---
name: cocina
description: >-
  Display de cocina en tiempo real — sistema de preparación de pedidos con
  pases multi-estación (general, horno) + multi-device con colores. Snapshot
  persistente atómico. Publica periferico.display para pantallas externas.
  Control item a item: pendiente → preparando → pase++ → listo.
fuente: enki
dominio: comercio
tags: [pizzepos, cocina, cocina, pedidos, multi-estacion, device, ticket, display]
---

# Pizzepos · cocina

> **Qué es.** El display de cocina en tiempo real. Recibe pedidos desde el
> módulo Pedidos, los despliega por estación (general, horno), y permite al
> cocinero avanzar items: pendiente → preparando → pase++ → listo.
> Multi-device con colores, filtros por familia de ingrediente, y pantallas
> externas (TV, LED, tablet) vía `periferico.display`.
>
> **Reflejo puro:** toda la lógica es determinista. Sin blueprint. Sin LLM.
> 12 tools + 12 ui_handlers.
>
> **Red de salida (v3.3.0):** descarta items sin nombre con `logger.warn` —
> defensa en profundidad contra líneas fantasma.
> **Terminado directo (v3.4.0):** botón rojo — `done:true` marca listo desde
> cualquier estado en un solo paso.
>
> Código: `modules/pizzepos/cocina/index.js` · v`3.4.0`

---

## 1 · LÓGICA (sistema de pases)

### Las estaciones

| Estación | Pase mínimo | Flujo |
|----------|-------------|-------|
| **General** | pase 0 | `pendiente → preparando → pase++ (avanza a horno)` |
| **Horno** | pase 1 | Llega como `preparando`, 1 tap → `ticket + listo` |

Extensible a más estaciones. Cada una declara su `pase_minimo` y sus reglas.

### Ciclo de un item

```
comandero                        cocina
─────────                        ──────
enviar_cocina
       │
       ▼
pedido.enviado_cocina ──────→ onPedidoEnviadoCocina()
                                  │
                                  ▼
                            pedidosActivos[pedido_id]
                            ├── items: [{ estado: "pendiente", pase: 0 }]
                            │
       cocinero tapa ──────→ cocina.prepare-item { item_id }
                                  │
                                  ▼
                            pendiente → preparando
                            (asigna device color, emite cocina.item_preparando)
                                  │
       cocinero tapa ──────→ cocina.prepare-item { item_id } (otra vez)
                                  │
                                  ▼
                            preparando → pase++ (avanza estación)
                            (emite cocina.item_avanzado)
                                  │
       cocinero tapa ──────→ cocina.prepare-item { item_id, done: true }
                                  │
                                  ▼
                            item LISTO
                            emite cocina.item_preparado
                            imprime ticket si estación tiene imprime_al_completar
                                  │
                                  ▼
                            ¿todos los items listos?
                              → sí → cocina.pedido_listo → cuentas → estado listo
```

### Displays externos

Cuando un item cambia de estado, se publica `periferico.display` con:
- `accion` (avance, completado, nuevo pedido)
- `contenido` (item, cantidad, mesa)
- `prioridad` (alta para nuevos pedidos, normal para avances)

Los displays (TV, LED, tablet) se registran vía `cocina.register-device` y reciben
un color único. Pueden filtrar por familias de ingrediente.
El snapshot persiste atómicamente (tmp + rename) para sobrevivir reinicios.

---

## 2 · TOOLS (invocables por LLM)

### `cocina.list-active`

```jsonc
// → 200
{
  "pedidos": [
    {
      "pedido_id": "ped_001",
      "cuenta_id": "mesa_5",
      "ref_display": "Mesa 5",
      "items": [
        { "id": "item_001", "nombre": "Margarita", "cantidad": 2,
          "estado": "preparando", "pase": 0, "device_id": "cocina_01" },
        { "id": "item_002", "nombre": "Barbacoa", "cantidad": 1,
          "estado": "pendiente", "pase": 0 }
      ],
      "total_items": 3,
      "completados": 0
    }
  ]
}
```

### `cocina.get`

```jsonc
{ "pedido_id": "ped_001" }
// → 200 { "pedido": { /* mismo shape que list-active para un pedido */ } }
```

### `cocina.history`

```jsonc
{ "limit": 20 }
// → 200 { "historial": [ /* pedidos completados */ ] }
```

### `cocina.prepare-item`

```jsonc
{ "item_id": "item_001", "device_id": "cocina_01" }    // tap normal
// → 200 { "item": { "estado": "preparando", "pase": 0 } }

{ "item_id": "item_001", "done": true }                // botón rojo (terminado directo)
// → 200 { "item": { "estado": "listo", "pase": 0 } }
```

`done:true` (v3.4.0): marca LISTO desde cualquier estado en un solo paso.
Cierra la fase abierta, publica `cocina.item_preparado`, y cierra el pedido
si todos los items están listos.

Errores: `404 RESOURCE_NOT_FOUND`, `409 CONFLICT_STATE`.

### `cocina.mark-ready`

```jsonc
{ "pedido_id": "ped_001" }
// → 200 { "pedido_id": "ped_001", "estado": "listo" }
```

Marca el pedido completo como listo. Emite `cocina.pedido_listo`.
Solo si todos los items están en estado `listo`.

### `cocina.register-device`

```jsonc
{
  "device_id": "cocina_tv_01",
  "nombre": "TV Cocina Principal",
  "estacion": "general",
  "tipo_estacion": "general",
  "filtros": { "familias": ["queso", "verdura"] },
  "impresora": "EPSON_TM_U220"
}
// → 201 { "device_id": "cocina_tv_01", "color": "#FF5733" }
```

### `cocina.unregister-device`

```jsonc
{ "device_id": "cocina_tv_01" }
// → 200 { "unregistered": true }
```

### `cocina.list-devices` / `cocina.list-station-types` / `cocina.list-displays`

```jsonc
// list-devices → [{ device_id, nombre, estacion, color, filtros, ... }]
// list-station-types → [{ id, nombre, pase_minimo, ... }]
// list-displays → [{ device_id, nombre, ... }]
```

---

## 3 · EVENTOS (el contrato del bus)

### Publica

| Evento | Cuándo |
|--------|--------|
| `cocina.item_preparando` | Cocinero empieza a preparar (pendiente → preparando) |
| `cocina.item_avanzado` | Item avanza de estación (pase++). Incluye `desde_estacion` + `estado` |
| `cocina.item_preparado` | Item terminado en estación final |
| `cocina.item_ticket` | Ticket de pieza (cuando estación tiene `imprime_al_completar`). Incluye ingredientes, variaciones, notas, impresora |
| `cocina.pedido_listo` | Pedido completamente preparado y listo para servir |
| `periferico.display` | Notificación a display externo (acción + contenido + prioridad) |
| `cocina.device_registered` | Device físico registrado con color asignado |
| `cocina.device_unregistered` | Device físico removido |
| `cocina.device_updated` | Device reconectado o metadata actualizada |

### Escucha

| Evento | Handler | Procedencia |
|--------|---------|-------------|
| `pedido.enviado_cocina` | `onPedidoEnviadoCocina` | Módulo Pedidos (pedido formal) |
| `pedido.cancelado` | `onPedidoCancelado` | Módulo Pedidos |
| `cuenta.creada` | `onCuentaCreada` | Cachea ref_display |
| `cuenta.actualizada` | `onCuentaActualizada` | Actualiza ref_display y propaga a pedidos activos |
| `cuenta.eliminada` | `onCuentaEliminada` | Limpia caché + huérfanos |
| `caja.cerrada` | `onCajaCerrada` | Reset de pedidos activos |
| `dia.iniciado` | `onDiaIniciado` | Reset de estado de cocina |

---

## 4 · UI (frontend)

| Ruta | Handler | Zona |
|------|---------|------|
| `cocina.list-active` | `handleGetActivos` | barra_modulos |
| `cocina.get` | `handleGetPedido` | barra_modulos |
| `cocina.history` | `handleGetHistorial` | barra_modulos |
| `cocina.prepare-item` | `handlePrepararItem` | barra_modulos |
| `cocina.mark-ready` | `handleMarcarListo` | barra_modulos |
| `cocina.register-device` | `handleRegisterDevice` | barra_modulos |
| `cocina.unregister-device` | `handleUnregisterDevice` | barra_modulos |
| `cocina.list-devices` | `handleListDevices` | barra_modulos |
| `cocina.list-station-types` | `handleListTiposEstacion` | barra_modulos |
| `cocina.list-displays` | `handleListarDisplays` | barra_modulos |
| `cocina.health` | `handleHealthCheck` | barra_modulos |
| `cocina.metrics` | `handleGetMetrics` | barra_modulos |

---

## 5 · FLUJO TÍPICO (extremo a extremo)

```
1. CAMARERO envía pedido      → comandero.enviar_cocina
2. PEDIDOS recibe y crea      → pedido.enviado_cocina
3. COCINA recibe el pedido     → onPedidoEnviadoCocina()
                                → aparece en display de cocina
                                → periferico.display (alta prioridad)
4. COCINERO tapa item          → cocina.prepare-item { item_id }
                                → pendiente → preparando, device color asignado
5. COCINERO tapa (avance)      → cocina.prepare-item { item_id }
                                → pase++ (general→horno si aplica)
6. COCINERO botón rojo         → cocina.prepare-item { item_id, done:true }
                                → item_listo + ticket (si aplica)
7. TODOS listos                → cocina.pedido_listo → cuentas → listo
```

---

## 6 · INTEGRACIÓN

> **Tools principales:** `list-active` (ver cola), `prepare-item` (avanzar),
> `mark-ready` (completar pedido), `register-device` (configurar displays).

> **Persistencia:** snapshot atómico en `data/current/cocina_snapshot.json`
> (tmp + rename, debounce 1s). Sobrevive reinicios.

> **Red de salida:** items sin nombre se descartan con `logger.warn`
> (defensa en profundidad, nunca en silencio).

> **Terminado directo:** el botón rojo (`done:true`) marca listo desde
> cualquier estado — el frontend ya no avanza estado al tocar el producto
> (solo despliega/pliega el detalle). Terminar es un acto explícito.
