---
name: impresion
description: >-
  Formateo ESC/POS y envío directo a impresoras ESP32 vía MQTT.
  Autodescubrimiento de impresoras. Sin capas intermedias. Genera
  comandas, tickets de venta y tickets de pieza. Sin tools — la
  impresión se dispara automáticamente desde eventos del bus.
fuente: enki
dominio: comercio
tags: [pizzepos, impresion, ticket, comanda, esc-pos, esp32, mqtt]
---

# Pizzepos · impresion

> **Qué es.** El módulo de impresión del POS. Formatea comandas y tickets
> en ESC/POS y los envía directamente a impresoras térmicas ESP32 vía MQTT.
> Sin middlewares, sin capas intermedias. Autodescubrimiento de impresoras
> en la red.
>
> **Sin tools:** la impresión se dispara automáticamente desde eventos del
> bus (cocina.item_ticket, etc.). No se invoca desde el LLM.
>
> Código: `modules/pizzepos/impresion/index.js` · v`4.0.0`

---

## 1 · LÓGICA

### Qué imprime

| Tipo | Evento disparador | Formato |
|------|-------------------|---------|
| **Comanda** | `cocina.item_ticket` | Item individual + variaciones + notas |
| **Ticket venta** | UI (`ticket-venta`) | Recibo cliente: items, total, método pago |
| **Ticket pieza** | `cocina.item_ticket` (horno) | Pieza individual cuando sale del horno |

### Arquitectura

```
cocina / UI                    impresion                     ESP32
────────                       ─────────                     ─────
cocina.item_ticket ──────────→ onItemTicket()
                                │
                                ├─ Formatea ESC/POS
                                │   (ancho 58mm)
                                │
                                └─ MQTT directo → ESP32
                                   (topic: impresion/comanda)
                                   (autodescubrimiento)
```

### Autodescubrimiento de impresoras

Las impresoras ESP32 se autodescubren en la red. El módulo mantiene un
listado de impresoras disponibles al que la UI puede consultar.

### Sin persistencia

Los tickets se generan en memoria y se envían vía MQTT. El historial es
un ring buffer en memoria (últimos 100). Cachés se limpian en
`caja.cerrada` / `dia.iniciado`.

---

## 2 · UI (frontend)

| Ruta | Handler | Zona |
|------|---------|------|
| `impresion.ticket` | `handleImprimirComanda` | barra_modulos |
| `impresion.ticket-venta` | `handleImprimirTicketVenta` | barra_modulos |
| `impresion.estado` | `handleGetEstado` | barra_modulos |
| `impresion.historial` | `handleGetHistorial` | barra_modulos |
| `impresion.impresoras` | `handleListarImpresoras` | barra_modulos |
| `impresion.health` | `handleHealthCheck` | barra_modulos |
| `impresion.metrics` | `handleGetMetrics` | barra_modulos |

---

## 3 · EVENTOS

### Publica

| Evento | Cuándo |
|--------|--------|
| `impresion.comanda_generada` | Comanda formateada y enviada al ESP32 |
| `impresion.ticket_venta_generado` | Ticket de venta formateado y enviado |
| `impresion.ticket_pieza_generado` | Ticket de pieza individual formateado y enviado |
| `impresion.error` | Error reportado por el ESP32 (código + detalle) |

### Escucha

| Evento | Handler | Procedencia |
|--------|---------|-------------|
| `cocina.item_ticket` | `onItemTicket` | Cocina (item listo con impresión) |
| `cuenta.{creada,actualizada,eliminada}` | — | Cachea ref_display para tickets |
| `mesa.{abierta,renombrada,cerrada}` | — | Cachea nombres de mesa |
| `llevar.ticket_creado` | — | Cachea ticket llevar |
| `caja.cerrada` / `dia.iniciado` | — | Limpieza de cachés |

---

## 4 · FLUJO TÍPICO

### Impresión de comanda al enviar a cocina

```
1. CAMARERO envía cocina  → comandero.enviar_cocina → pedidos → cocina
2. COCINA recibe           → cocina.item_ticket (si la estación imprime al completar)
3. IMPRESION recibe        → onItemTicket()
                            → formatea ESC/POS: "Mesa 5 · 2x Margarita · sin cebolla"
                            → envía vía MQTT al ESP32
4. ESP32 imprime           → comanda en la cocina
```

### Reimpresión manual

```
1. CAMARERO pulsa         → "Reimprimir comanda" en UI
2. IMPRESION recibe       → handleImprimirComanda()
3. VUELVE A ENVIAR        → mismo formato, misma impresora
```

---

## 5 · INTEGRACIÓN

> **Este módulo NO tiene tools.** La impresión se dispara automáticamente
> desde eventos del bus. La reimpresión manual se hace desde la UI.

> **ESC/POS:** formato estándar para impresoras térmicas. Ancho 58mm.

> **ESP32:** las impresoras se conectan vía MQTT. Autodescubrimiento.

> **Ancho de ticket:** 58mm configurable en `config.ancho`.
