---
name: pos-comandero
description: >-
  Skill del módulo COMANDERO (TPV / toma de pedidos del POS). Store,
  componentes y flujo: carta completa en memoria, filtrado local por
  categoría, añadir/eliminar items del buffer, enviar a cocina.
  Botones especiales: mitad-y-mitad, al gusto, porciones.
fuente: interfaces
tags: [pos, comandero, tpv, pedido, svelte, store, cupula-interfaces]
---

# POS · Comandero

## Store

```typescript
interface ComanderoState {
  project_id: string | null;
  cuenta_id: string | null;
  pedido: Pedido | null;
  categorias: Categoria[];
  todosProductos: Producto[];   // carta completa en memoria
  productos: Producto[];        // filtrados por categoría activa
  categoriaActiva: string | null;
  loading: boolean;
  error: string | null;
}
```

### Acciones MQTT

| Store | RPC | Descripción |
|-------|-----|-------------|
| `initComandero` | `productos.carta_completa` + `comandero.get` | Carga carta + pedido actual |
| `addItem` | `comandero.add-item` | Añade item al buffer |
| `removeItem` | `comandero.remove-item` | Elimina item |
| `updateItem` | `comandero.update-item` | Cambia cantidad/notas |
| `enviarCocina` | `comandero.send-kitchen` | Buffer → cocina |
| `selectCategoria` | — (local) | Filtra productos sin MQTT |

## Layout

```
┌─────────────────────────────────────────────┐
│ Header: nombre cuenta (editable + voz)      │
├─────────────────────────────────────────────┤
│ Especiales: [Mitad] [Al gusto] [Porción]    │
├─────────────────────────────────────────────┤
│ Familias: scroll horizontal por categoría   │
├───────────────────────┬─────────────────────┤
│ Productos por familia  │ Sidebar acciones    │
│ [Margarita][Pepperoni] │ 📄 Cuenta          │
│ [4 Quesos][Napolitana] │ 🍳 Enviar cocina   │
│                       │ 🖨️ Imprimir         │
│ ─── Pedido ─────────  │ 💶 Cobro           │
│ 🍕Margarita ×2  10€   │ ↩️ Salir           │
│ Total:           18€  │                    │
└───────────────────────┴─────────────────────┘
```

### Componentes

| Componente | Función |
|------------|---------|
| `ComanderoScreen` | Página principal |
| `CategoriaBtn` | Botón categoría (scroll-to) |
| `ProductoBtn` | Botón producto |
| `BotonEspecial` | Mitad, Al gusto, Porción |
| `PedidoList` / `PedidoItem` | Lista del pedido |
| `AccionBtn` | Acciones sidebar |
| `VariacionesPanel` | Quitar/añadir ingredientes |
| `MitadMitadPanel` | Pizza 2 mitades |
| `AlGustoPanel` | Pizza personalizada |
| `CobroPanel` | 7 métodos de pago |

## Payloads

### add-item request
```json
{
  "project_id": "...", "cuenta_id": "...",
  "producto_id": "pizza_margarita",
  "nombre": "Margarita", "precio": 9.50, "cantidad": 2,
  "variaciones": { "ingredientes_quitar": ["cebolla"], "ingredientes_anadir": [] },
  "tipo": "mitad_mitad",
  "pizza_izquierda": { "id": "...", "nombre": "Margarita" },
  "pizza_derecha": { "id": "...", "nombre": "Pepperoni" }
}
```

### add-item response
```json
{
  "status": 200,
  "data": {
    "pedido": { "cuenta_id": "...", "items": [...], "total": 19.00 }
  }
}
```
