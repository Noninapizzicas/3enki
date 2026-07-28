---
name: variaciones
description: >-
  Gestión de variaciones de productos pizzepos (quitar/añadir ingredientes).
  Reglas por producto: qué se puede quitar, qué se puede añadir, máximo de
  extras. Se configura desde la CARTA (carta.actualizada/editada). Calcula
  precio final consultando al módulo ingredientes. Auto-valida cada
  comandero.item_agregado y emite variacion.{validada,rechazada}.
fuente: enki
dominio: comercio
tags: [pizzepos, variaciones, producto, ingredientes, opciones, precio, validacion]
---

# Pizzepos · variaciones

> **Qué es.** El módulo que gestiona las variaciones de producto: qué
> ingredientes se pueden quitar, cuáles añadir, cuántos extras máximo.
> Se configura automáticamente desde la carta (carta-manager es la fuente)
> y auto-valida cada item que el comandero añade al buffer.
>
> **Subsistema Opciones:** banco de pruebas del motor de opciones. Cada
> producto NACE con sus opciones desde carta-manager/menu-generator
> (QUITAR=ingredientes propios + ELEGIR_VARIOS=paleta de su categoría).
>
> **En memoria:** se pierde en reinicio pero se recupera automáticamente
> vía `project.activated` (warm desde productos.carta_completa).
>
> Código: `modules/pizzepos/variaciones/index.js` · v`4.4.0`

---

## 1 · LÓGICA

### Reglas de variación por producto

```jsonc
{
  "permite_quitar": ["cebolla", "champinon"],    // ingredientes que el cliente puede quitar
  "permite_anadir": true,                          // si permite añadir extras
  "max_ingredientes_extra": 5,                     // máximo de extras permitidos
  "extras_sugeridos": [                            // sugeridos (precio extra opcional)
    { "ingrediente_id": "champinon", "precio_extra": 1.0 }
  ]
}
```

### Ciclo de configuración

```
carta-manager         variaciones
─────────────         ───────────
carta.actualizada ──→ onCartaActualizada()
                          │
                          ▼
                      _configurar()
                      Lee productos de la carta
                      Por cada producto:
                        · ingredientes propios → QUITAR
                        · paleta de categoría → ELEGIR_VARIOS
                        · derivar-opciones() desde _shared/
                      Guarda en Map<producto_id, config>
```

### Validación en línea (al añadir item)

```
comandero                    variaciones
─────────                    ──────────
comandero.item_agregado ──→ onComanderoItemAgregado()
                              │
                              ▼
                          _validar(item)
                          1. ¿ingredientes_quitar existen en permite_quitar[]?
                          2. ¿ingredientes_anadir ≤ max_ingredientes_extra?
                          3. ¿cada extra tiene precio conocido en ingredientes?
                              │
                              ▼
                          ✅ variacion.validada
                          ❌ variacion.rechazada { motivos: [...] }
```

### Evaluar opciones (server-side)

`variaciones.evaluar` (v4.4.0): valida + precia server-side usando
`_shared/motor-opciones`. Gemelo del tasador. Devuelve precio final
en céntimos.

---

## 2 · TOOLS (invocables por LLM)

### `variaciones.get`

```jsonc
{ "producto_id": "pizzas_margarita" }
// → 200 {
//     "producto_id": "pizzas_margarita",
//     "permite_quitar": ["cebolla"],
//     "permite_anadir": true,
//     "max_ingredientes_extra": 5,
//     "extras_sugeridos": [{ "ingrediente_id": "champinon", "precio_extra": 1.0 }],
//     "opciones": [ /* derivadas */ ]
//   }
```

### `variaciones.validar`

```jsonc
{
  "producto_id": "pizzas_margarita",
  "ingredientes_quitar": ["cebolla"],
  "ingredientes_anadir": [{ "ingrediente_id": "champinon", "cantidad": 1 }]
}
// → 200 { "valida": true }
// → 200 { "valida": false, "motivos": ["cebolla no está en permite_quitar del producto"] }
```

### `variaciones.calcular_precio`

```jsonc
{
  "producto_id": "pizzas_margarita",
  "ingredientes_anadir": [{ "ingrediente_id": "champinon", "cantidad": 1 }]
}
// → 200 { "producto_id": "pizzas_margarita", "precio_base": 850, "extras": 100, "total": 950 }
```

Precio en céntimos. Consulta precios al módulo ingredientes (fuente única).

---

## 3 · EVENTOS

### Publica

| Evento | Cuándo |
|--------|--------|
| `variacion.validada` | Variación válida (item aceptado) |
| `variacion.rechazada` | Variación no permitida o ingrediente no disponible |

### Escucha

| Evento | Handler | Procedencia |
|--------|---------|-------------|
| `project.activated` | `onProjectActivated` | WARM: recarga desde productos.carta_completa |
| `carta.actualizada` | `onCartaActualizada` | Carta save/restore/clonar — reconfigura todo |
| `carta.editada` | `onCartaActualizada` | Carta editada — reconfigura |
| `producto.creado` | `onProductoCreado` | LEGACY: compat (hoy nadie lo emite) |
| `comandero.item_agregado` | `onComanderoItemAgregado` | Auto-validar variaciones |

---

## 4 · FLUJO TÍPICO

### Pizza con extras (desde el pedido)

```
1. CLIENTE pide         → "Margarita con champiñones, sin cebolla"
2. CAMARERO pone        → comandero.agregar_item {
                            producto_id: "pizzas_margarita",
                            variaciones: { ingredientes_quitar: ["cebolla"],
                                           ingredientes_anadir: [{ingrediente_id:"champinon", cantidad:1}] }
                          }
3. COMANDERO emite      → comandero.item_agregado
4. VARIACIONES valida   → onComanderoItemAgregado()
                          → ¿cebolla en permite_quitar? ✅
                          → ¿champiñón ≤ max_extras? ✅
                          → variacion.validada
5. COMANDERO resuelve   → precio final = base + precio_extra(champiñón)
6. CUENTAS actualiza    → total con extras
```

---

## 5 · INTEGRACIÓN

> **Tools principales:** `variaciones.get` (ver reglas de un producto),
> `variaciones.validar` (validar variación concreta),
> `variaciones.calcular_precio` (precio final con extras).

> **Fuente de verdad:** `carta-manager`. Variaciones se configura desde la
> carta. Si la carta cambia, variaciones se reconfigura automáticamente.

> **En memoria:** se pierde en reinicio. Pero se recupera en el siguiente
> `project.activated` vía warm desde `productos.carta_completa`.

> **Dependencia:** `ingredientes` para resolver precios de extras.
> `evaluar` usa `_shared/motor-opciones` para tasar server-side.
