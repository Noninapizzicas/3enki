---
name: pos-cocina
description: >-
  Skill del módulo COCINA (display de cocina del POS). Store, componentes
  y flujo: pedidos entrantes desde comandero, estados de preparación
  (pendiente→preparando→listo), notificaciones por pedido listo.
  Coherencia en vivo: si un camarero marca desde la tablet, la pantalla
  de cocina se actualiza sola.
fuente: interfaces
tags: [pos, cocina, display, pedidos, svelte, store, cupula-interfaces]
---

# POS · Cocina

> Display de cocina en tiempo real. Los pedidos llegan desde el comandero
> via `pedido.enviado_cocina`. El cocinero marca items como preparando/listo.
> Cada cambio se refleja al instante en las pantallas de los camareros.

## Store

```typescript
interface CocinaState {
  project_id: string | null;
  pedidos: PedidoCocina[];        // pedidos activos en cocina
  filtroEstado: string | null;    // 'pendiente' | 'preparando' | 'listo' | null
  loading: boolean;
  error: string | null;
}

interface PedidoCocina {
  id: string;
  cuenta_id: string;
  ref_display: string;
  items: ItemCocina[];
  notas: string;
  estado: 'pendiente' | 'en_preparacion' | 'completado';
  creado: string;
}

interface ItemCocina {
  id: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  variaciones: string[];         // "sin cebolla", "al punto", etc.
  ingredientes_base: string[];
  estado: 'pendiente' | 'preparando' | 'listo';
  tipo?: string;                 // 'mitad_mitad', 'al_gusto', 'porcion'
  pizza_izquierda?: string;
  pizza_derecha?: string;
}
```

### Acciones MQTT

| Acción | RPC | Descripción |
|--------|-----|-------------|
| `loadPedidos` | `cocina.list` | Carga pedidos activos |
| `marcarPreparando` | `cocina.item-preparando` | Cocinero empieza item |
| `marcarListo` | `cocina.item-preparado` | Item terminado |
| `marcarPedidoListo` | `cocina.pedido-listo` | Todo el pedido listo |

### Eventos que escucha

| Evento | Reacción |
|--------|----------|
| `pedido.enviado_cocina` | Nuevo pedido entra a cocina |
| `cocina.item_preparando` | Item marcado como preparando |
| `cocina.item_preparado` | Item marcado como listo |
| `cocina.pedido_listo` | Pedido completo listo |

## Layout

```
┌──────────────────────────────────────────────┐
│ Header: [Pendientes] [Preparando] [Listos]   │
├──────────────────────────────────────────────┤
│ ┌─── Pedido 1 ────────────────────────────┐  │
│ │ 📄 M-001  ·  hace 5m                    │  │
│ │ ┌────────────────────────────────────┐  │  │
│ │ │ 🍕 Margarita ×2  [▶️ Preparar]     │  │  │
│ │ │    sin cebolla                      │  │  │
│ │ ├────────────────────────────────────┤  │  │
│ │ │ 🥗 César ×1      [🟡 Preparando]   │  │  │
│ │ └────────────────────────────────────┘  │  │
│ └──────────────────────────────────────────┘  │
│ ┌─── Pedido 2 ────────────────────────────┐  │
│ │ 📄 L-002  ·  Delivery · hace 12m       │  │  │
│ │    🍕 Pepperoni ×1  [✅ Listo]          │  │  │
│ └──────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

### Componentes

| Componente | Función |
|------------|---------|
| `CocinaScreen` | Pantalla principal con filtros |
| `PedidoCard` | Tarjeta de pedido completo |
| `ItemLine` | Línea de item con botón de estado |
| `CocinaHeader` | Barra de filtros + reloj |

## Colores por estado

```css
.pendiente   { border-left: 4px solid #f59e0b; }  /* amarillo */
.preparando  { border-left: 4px solid #3b82f6; }  /* azul */
.listo       { border-left: 4px solid #22c55e; }  /* verde */
```

## Flujo típico

```
1. Camarero envía pedido → pedido.enviado_cocina
2. Cocina recibe → PedidoCard aparece en "Pendientes"
3. Cocinero pulsa "Preparar" → item pasa a "Preparando"
4. Cocinero pulsa "Listo" → item pasa verde
5. Todos los items listos → PedidoCard se marca completado
6. Camarero ve en CuentasScreen: ✅ estado 'listo'
```
