---
name: carrito
description: Enseña el módulo prisma/carrito — el BUFFER de venta universal (uno por cuenta_id) que abre el flujo carrito → cuenta → cobro. Expone su lógica (reflejo determinista, dinero en céntimos, tasado por opciones.evaluar, persistente por proyecto), sus eventos (los 6 request→response que atiende + los 4 que emite) y sus funciones (get · add_item · remove_item · update_item · vaciar · list) con payloads exactos. Referencia de integración por el bus MQTT.
fuente: enki
dominio: comercio
lente_dominio: prisma
tags: [prisma, carrito, pos, venta, bus, mqtt, reflejo, centimos, opciones, integracion, referencia]
---

# Prisma · carrito — el buffer de venta universal

> **Qué es.** El carrito de una venta en curso. Uno por `cuenta_id`. Es la ENTRADA del flujo de
> venta de Prisma: `carrito → cuenta → cobro → ticket → cierre`. Reflejo JS determinista, sin IA.
> Copiado de `pizzepos/comandero` y generalizado: tasa con `opciones.evaluar` (no con precio de
> pizza) y NO tiene ganchos de cocina (eso es órgano de hostelería).
>
> Código: `modules/prisma/carrito/index.js` · `reflejo-0.2.0`. Esta skill es la referencia de uso;
> la verdad viva es el código.

---

## 1 · LÓGICA (lo que hay detrás)

```
ESTADO      Map<cuenta_id, { items:[], total_centimos, project_id }>   (en memoria)
PERSISTE    _shared/pos-persistencia → /prisma/pos/carrito.json (snapshot por project_id,
            debounced). Restaura en `project.activated`; vuelca en `onUnload`.
            Sin project_id → solo memoria (honesto: no finge persistir).

DINERO      SIEMPRE céntimos (enteros). Coherente con opciones · cobro · cierre.
            subtotal_centimos = precio_unitario_centimos × cantidad
            total_centimos    = Σ subtotal_centimos de todos los ítems

TASADO      el precio de cada ítem nace de UNA de dos vías:
              a) inline      → pasas `precio_unitario_centimos` (el llamador ya sabe el precio)
              b) por opciones → RPC `opciones.evaluar.request` (producto + selección →
                                precio_final_centimos). El carrito NUNCA tasa en el cliente.
            Si opciones dice `valida:false` → 409 (selección inválida, no se añade).

MULTITENANT el buffer lleva su `project_id`; la persistencia separa por proyecto. Un `cuenta_id`
            es la clave del carrito (lo genera/elige quien abre la venta — normalmente la cuenta).
```

Forma de un ítem del carrito (lo que devuelve `add_item` y vive en `items[]`):

```json
{
  "id": "uuid",
  "producto_id": "regalos_funda-marinero",
  "nombre": "Funda Marinero",
  "cantidad": 2,
  "selecciones": { "color": "azul" },
  "precio_unitario_centimos": 3960,
  "subtotal_centimos": 7920,
  "libres": [],
  "notas": "",
  "created_at": "2026-07-24T..."
}
```

---

## 2 · EVENTOS (el contrato del bus)

**Patrón RPC** — publicas la petición, escuchas la respuesta por `request_id`:

```
publish →  carrito.<op>.request     { request_id, data: { … } }
listen  ←  carrito.<op>.response    { request_id, status, data }
```
Desde fuera (frontend/agente) el envoltorio es `ui/request/carrito/<op>` → `ui/response/<request_id>`.

**Atiende (request → response):**

| topic request | topic response | función |
|---|---|---|
| `carrito.get.request` | `carrito.get.response` | leer el carrito de una cuenta |
| `carrito.add_item.request` | `carrito.add_item.response` | añadir un ítem (lo tasa) |
| `carrito.remove_item.request` | `carrito.remove_item.response` | quitar un ítem por id |
| `carrito.update_item.request` | `carrito.update_item.response` | cambiar cantidad (0 = quita) |
| `carrito.vaciar.request` | `carrito.vaciar.response` | vaciar el carrito entero |
| `carrito.list.request` | `carrito.list.response` | listar todos los carritos activos |

**Emite (fire-and-forget, para que la UI/otros reaccionen):**

```
carrito.item_agregado     { cuenta_id, item_id, producto_id, subtotal_centimos, total_centimos, project_id, correlation_id, timestamp }
carrito.item_eliminado    { cuenta_id, item_id, total_centimos, project_id, timestamp }
carrito.item_actualizado  { cuenta_id, item_id, cantidad, total_centimos, project_id, timestamp }
carrito.vaciado           { cuenta_id, project_id, timestamp }
```

**Escucha (ciclo de vida):** `project.activated` → restaura la persistencia de ese proyecto.

**Depende de (RPC saliente):** `opciones.evaluar.request` (para tasar, salvo precio inline).

---

## 3 · FUNCIONES (payload exacto de cada operación)

### `get` — leer el carrito
```jsonc
// carrito.get.request
{ "cuenta_id": "T-001" }
// → 200
{ "cuenta_id": "T-001", "items": [ /* … */ ], "total_centimos": 7920 }
```
Sin carrito para esa cuenta → devuelve vacío (`items:[]`, `total_centimos:0`), NO 404.
Falta `cuenta_id` → error de validación.

### `add_item` — añadir (y tasar)
```jsonc
// carrito.add_item.request
{
  "cuenta_id": "T-001",
  "producto_id": "regalos_funda-marinero",   // o "nombre", o "producto" (objeto)
  "cantidad": 2,                              // opcional, default 1, se floor-ea, >0
  "selecciones": { "color": "azul" },         // opcional → se pasa a opciones.evaluar
  "catalogo_id": "…",                         // opcional (para resolver el producto)
  "project_id": "959b…",                      // opcional (persistencia + eventos)
  "precio_unitario_centimos": 3960,           // opcional → tasado INLINE (salta opciones)
  "notas": ""                                 // opcional
}
// → 201
{ "item": { /* ítem completo */ }, "carrito": { "cuenta_id", "items": [...], "total_centimos" } }
```
Requiere `cuenta_id` **y** al menos uno de `producto_id | nombre | producto`.
Errores: `502 UPSTREAM_UNREACHABLE` (opciones no responde) · `409 CONFLICT_STATE` (selección inválida, trae `errores[]`).

### `remove_item` — quitar por id
```jsonc
// carrito.remove_item.request
{ "cuenta_id": "T-001", "item_id": "uuid-del-item" }
// → 200
{ "carrito": { "cuenta_id", "items": [...], "total_centimos" } }
```
`404 RESOURCE_NOT_FOUND` si el carrito o el ítem no existen.

### `update_item` — cambiar cantidad
```jsonc
// carrito.update_item.request
{ "cuenta_id": "T-001", "item_id": "uuid", "cantidad": 3 }
// → 200
{ "item": { /* con subtotal recalculado */ }, "carrito": { … } }
```
`cantidad: 0` → **borra el ítem** (delega en `remove_item`). `cantidad < 0` o no numérica → validación.
Recalcula `subtotal_centimos = precio_unitario_centimos × cantidad` y el total.

### `vaciar` — carrito a cero
```jsonc
// carrito.vaciar.request
{ "cuenta_id": "T-001", "project_id": "959b…" }   // project_id opcional
// → 200
{ "cuenta_id": "T-001", "vaciado": true }
```
Borra el buffer entero de esa cuenta.

### `list` — todos los carritos activos
```jsonc
// carrito.list.request
{ }
// → 200
{ "carritos": [ { "cuenta_id": "T-001", "items": 3, "total_centimos": 7920 } ], "total": 1 }
```
`items` aquí es el **conteo**, no el detalle (usa `get` para el detalle de una cuenta).

---

## 4 · Flujo típico (extremo a extremo)

```
1. abrir venta          → cuenta.crear                → obtienes cuenta_id (T-001)
2. añadir producto      → carrito.add_item {cuenta_id, producto_id, selecciones}
                          (el carrito llama a opciones.evaluar y fija el precio en céntimos)
3. ajustar              → carrito.update_item {cuenta_id, item_id, cantidad}
                          carrito.remove_item {cuenta_id, item_id}
4. ver el estado        → carrito.get {cuenta_id}      → items + total_centimos
5. cobrar               → cobro.crear {cuenta_id}      → toma el total del carrito
```

El carrito solo **acumula y tasa**. No cobra, no imprime, no cocina. Cada pieza de ese flujo es su
propio módulo (cuenta · cobro · ticket · cierre), unida por `cuenta_id`.
