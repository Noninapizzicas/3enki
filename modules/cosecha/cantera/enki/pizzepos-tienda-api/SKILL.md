---
name: tienda-api
description: >-
  Canal HTTP de pedidos web — recibe POST desde la PWA del cliente
  (generada por carta-digital/static-template) y delega en pedidos vía
  el bus. Stateless: ningún pedido persiste aquí. CORS permisivo origin:*.
  Sin tools del LLM. Patrón heredado de whatsapp-bot.
fuente: enki
dominio: comercio
tags: [pizzepos, tienda, api, web, pedido, pwa, canal, http]
---

# Pizzepos · tienda-api

> **Qué es.** El canal HTTP para pedidos web. La PWA del cliente
> (carta-digital) envía POST a `/tienda/pedido/:project` y tienda-api
> lo transforma en `pedido.crear-tienda` en el bus, que el módulo pedidos
> recoge y persiste.
>
> **Stateless:** ningún pedido se persiste aquí. El dueño del estado es
> `modules/pizzepos/pedidos`.
>
> **Sin tools:** no invocable desde el LLM. Es un canal de entrada web.
>
> **CORS permisivo** (`origin:*`) porque la PWA corre en subdominio del
> proyecto y la API en el dominio principal.
>
> Código: `modules/pizzepos/tienda-api/index.js` · v`1.1.0`

---

## 1 · LÓGICA

### Flujo de un pedido web

```
PWA (cliente)                tienda-api                  pedidos
─────────────                ──────────                  ───────
    │                            │                          │
    │ POST /tienda/pedido/mi-pizza                           │
    │ { nombre, telefono,                                    │
    │   items: [{ id, cantidad }],                           │
    │   direccion, notas }                                   │
    │──→ handlePedidoPost()                                  │
    │     │                                                   │
    │     ├─ AJV valida body contra schema                    │
    │     ├─ project_slug del path param                      │
    │     ├─ canal_origen = 'web'                             │
    │     ├─ nombre_cliente OBLIGATORIO (ancla de recogida)   │
    │     │                                                   │
    │     ├─ publica → pedido.crear-tienda                    │
    │     │              (con request_id + correlation_id)   ──→ onPedidoCrearTienda()
    │     │                                                   │
    │     ├─ espera response (timeout 30s)                    │
    │     │                              ← pedido.crear-tienda.response
    │     │                                                   │
    │     └─ devuelve → { pedido_id, cliente_nombre }         │
    │                    o { error }                          │
    │──→ 200 OK / 4xx / 5xx                                  │
```

### Validación (AJV strict)

Shape canónico de `pedido.crear-tienda`:

```jsonc
{
  "nombre_cliente": "María",            // OBLIGATORIO (ancla de recogida)
  "telefono": "+34 666 111 222",         // opcional
  "items": [{ "id": "pizza_margarita", "cantidad": 2 }],  // OBLIGATORIO
  "direccion": "Calle Mayor 1",         // opcional
  "notas": "sin cebolla",               // opcional
  "total_centimos": 1700                // opcional
}
```

### CORS

```
OPTIONS /tienda/pedido/:project
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: POST, OPTIONS
  Access-Control-Allow-Headers: Content-Type
```

---

## 2 · APIs HTTP

| Método | Path | Handler | Descripción |
|--------|------|---------|-------------|
| `POST` | `/tienda/pedido/:project` | `handlePedidoPost` | Recibe pedido de la PWA, valida, publica al bus, espera response |
| `OPTIONS` | `/tienda/pedido/:project` | `handlePedidoOptions` | CORS preflight |
| `GET` | `/health` | `handleHealthCheck` | Health check del módulo |

---

## 3 · EVENTOS

### Publica

| Evento | Cuándo |
|--------|--------|
| `tienda.pedido.recibido` | Request POST recibido y parseado (informativo) |
| `tienda.pedido.completado` | Response exitosa de pedidos y devuelta al cliente |
| `tienda.pedido.fallido` | Fallo en validación, bus timeout o error de pedidos |
| `pedido.crear-tienda` | Handoff a pedidos (consumer esperado: modules/pizzepos/pedidos) |

### Escucha

| Evento | Handler | Descripción |
|--------|---------|-------------|
| `pedido.crear-tienda.response` | `onPedidoCrearTiendaResponse` | Respuesta correlacionada de pedidos, resuelve promesa HTTP |

---

## 4 · INTEGRACIÓN

> **Sin tools:** módulo de canal HTTP puro. No se invoca desde el LLM.
> Los pedidos web llegan por HTTP y fluyen al bus automáticamente.

> **nombre_cliente obligatorio:** es el ancla de recogida. Sin él el pedido
> se rechaza en validación.

> **Timeout:** 30s (`pedido_wait_timeout_ms`). Si pedidos no responde,
> se devuelve error 502 al cliente.

> **Multi-proyecto:** el `project_slug` llega como path param y se propaga
> al bus. Cada PWA apunta a su propio endpoint.
