# CONTEXT_POS.md - Sistema POS Event-Driven

> Documento de contexto para el sistema POS de Pizzepos.
> Usar como referencia para el chat de IA en menu-generator y futuras integraciones.

---

## Arquitectura General

```
                    ┌─────────────────────────────────────────┐
                    │           menu-generator                 │
                    │      (Chat IA para crear menús)          │
                    └─────────────────┬───────────────────────┘
                                      │
                         menu.generado │ menu.validado
                                      ▼
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
        ▼                             ▼                             ▼
┌───────────────┐           ┌───────────────┐           ┌───────────────┐
│   productos   │           │  categorias   │           │ ingredientes  │
│   (catálogo)  │           │   (menú)      │           │  (alérgenos)  │
└───────┬───────┘           └───────────────┘           └───────────────┘
        │
        │ producto.creado
        ▼
┌───────────────┐
│  variaciones  │ ◄── pedido.item_agregado
│ (quitar/añadir)│
└───────┬───────┘
        │ variacion.validada / variacion.rechazada
        ▼
┌───────────────┐           ┌───────────────┐           ┌───────────────┐
│    cuentas    │ ──────►   │    pedidos    │ ──────►   │    cocina     │
│ (mesas/llevar)│ cuenta.   │  (comandero)  │ enviado_  │   (display)   │
└───────────────┘ creada    └───────┬───────┘ cocina    └───────┬───────┘
                                    │                           │
                                    │ pedido.completado         │ cocina.pedido_listo
                                    ▼                           │
                            ┌───────────────┐                   │
                            │    cobros     │ ◄─────────────────┘
                            │  (7 métodos)  │
                            └───────────────┘
```

---

## Principio de Autonomía

**IMPORTANTE**: Cada módulo es AUTÓNOMO e INDEPENDIENTE.

```
✅ CORRECTO:
- El módulo hace su trabajo
- Publica eventos sobre LO QUE HIZO
- NO sabe quién escucha
- NO llama directamente a otros módulos

❌ INCORRECTO:
- Llamar APIs de otros módulos directamente
- Importar código de otros módulos
- Depender de que alguien escuche
```

---

## Módulos del Sistema

### 1. productos (Catálogo)

**Responsabilidad**: Gestionar el catálogo de productos.

**Estado**:
```javascript
this.productos = new Map();      // producto_id -> producto
this.categorias = new Map();     // categoria_id -> categoria
this.ingredientes = new Map();   // ingrediente_id -> ingrediente
this.menusPendientes = new Map(); // menu_id -> productos_draft
```

**Escucha**:
| Evento | Handler | Acción |
|--------|---------|--------|
| `menu.generado` | `onMenuGenerado` | Guarda productos como pendientes de validación |
| `menu.validado` | `onMenuValidado` | Sincroniza catálogo, aplica correcciones |

**Publica**:
| Evento | Cuándo |
|--------|--------|
| `producto.creado` | Nuevo producto añadido al catálogo |
| `producto.actualizado` | Producto modificado |
| `producto.eliminado` | Producto eliminado |
| `catalogo.actualizado` | Sincronización completa desde menú |

**APIs**:
```
GET  /productos           - Listar (filtros: categoria, activo)
GET  /productos/:id       - Obtener por ID
GET  /productos/search    - Buscar por nombre (q=)
GET  /categorias          - Listar categorías con conteo
GET  /ingredientes        - Listar ingredientes
GET  /pizzas              - Listar pizzas (para mitad y mitad)
PATCH /productos/:id      - Actualizar producto
DELETE /productos/:id     - Eliminar producto
GET  /stats               - Estadísticas del catálogo
```

**Estructura de Producto**:
```javascript
{
  id: "prod_pizza_4quesos",
  nombre: "Pizza 4 Quesos",
  emoji: "🧀",
  categoria: "Pizzas",
  descripcion: "Mozzarella, gorgonzola, parmesano, emmental",
  precio: 12.50,
  ingredientes_base: [
    { id: "ing_mozzarella", nombre: "Mozzarella" },
    { id: "ing_gorgonzola", nombre: "Gorgonzola" }
  ],
  alergenos: ["gluten", "lactosa"],
  variaciones: {
    permite_quitar: ["ing_gorgonzola", "ing_emmental"],
    permite_anadir: true,
    extras_sugeridos: [
      { ingrediente_id: "ing_jamon", precio_extra: 1.50 }
    ],
    max_ingredientes_extra: 5
  },
  activo: true,
  menu_source_id: "menu_abc123",
  created_at: "2024-01-15T10:00:00Z",
  updated_at: "2024-01-15T10:00:00Z"
}
```

---

### 2. categorias

**Responsabilidad**: Gestionar categorías del menú.

**Estado**:
```javascript
this.categorias = new Map(); // categoria_id -> categoria
```

**Escucha**:
| Evento | Handler | Acción |
|--------|---------|--------|
| `menu.generado` | `onMenuGenerado` | Sincroniza categorías del menú |

**Publica**:
| Evento | Cuándo |
|--------|--------|
| `categoria.creada` | Nueva categoría |
| `categoria.actualizada` | Categoría modificada |
| `categoria.orden_actualizado` | Reordenación de categorías |

**APIs**:
```
GET  /categorias           - Listar ordenadas
GET  /categorias/:id       - Obtener por ID
POST /categorias           - Crear manualmente
PATCH /categorias/:id      - Actualizar
POST /categorias/reorder   - Reordenar (drag & drop)
```

**Estructura de Categoría**:
```javascript
{
  id: "cat_pizzas",
  nombre: "Pizzas",
  emoji: "🍕",
  orden: 1,
  activa: true,
  created_at: "2024-01-15T10:00:00Z",
  updated_at: "2024-01-15T10:00:00Z"
}
```

---

### 3. ingredientes

**Responsabilidad**: Catálogo de ingredientes y alérgenos.

**Estado**:
```javascript
this.ingredientes = new Map(); // ingrediente_id -> ingrediente
```

**Escucha**:
| Evento | Handler | Acción |
|--------|---------|--------|
| `menu.generado` | `onMenuGenerado` | Extrae ingredientes del catálogo |
| `producto.creado` | `onProductoCreado` | Registra ingredientes de productos |

**Publica**:
| Evento | Cuándo |
|--------|--------|
| `ingrediente.creado` | Nuevo ingrediente |
| `ingrediente.actualizado` | Ingrediente modificado |

**APIs**:
```
GET  /ingredientes         - Listar (filtros: tipo, alergeno)
GET  /ingredientes/:id     - Obtener por ID
GET  /ingredientes/search  - Buscar por nombre
GET  /alergenos            - Listar alérgenos agrupados por tipo
PATCH /ingredientes/:id    - Actualizar
```

**Estructura de Ingrediente**:
```javascript
{
  id: "ing_mozzarella",
  nombre: "Mozzarella",
  emoji: "🧀",
  tipo: "queso",
  es_alergeno: true,
  alergenos: ["lactosa"],
  precio_extra: 1.00,
  disponible: true,
  created_at: "2024-01-15T10:00:00Z"
}
```

---

### 4. variaciones

**Responsabilidad**: Validar y calcular precio de variaciones (quitar/añadir ingredientes).

**Estado**:
```javascript
this.configuraciones = new Map();        // producto_id -> variacion_config
this.ingredientesDisponibles = new Map(); // ingrediente_id -> {precio, disponible}
```

**Escucha**:
| Evento | Handler | Acción |
|--------|---------|--------|
| `producto.creado` | `onProductoCreado` | Registra configuración de variaciones |
| `pedido.item_agregado` | `onPedidoItemAgregado` | Valida variaciones del item |

**Publica**:
| Evento | Cuándo |
|--------|--------|
| `variacion.validada` | Variación permitida, incluye precio calculado |
| `variacion.rechazada` | Variación no permitida (con motivo) |

**APIs**:
```
GET  /productos/:id/variaciones  - Obtener variaciones permitidas
POST /validar                     - Validar variación
POST /calcular-precio             - Calcular precio con variaciones
```

**Estructura de Variación Validada**:
```javascript
{
  producto_id: "prod_pizza_4quesos",
  ingredientes_quitar: ["ing_gorgonzola"],
  ingredientes_anadir: [
    { ingrediente_id: "ing_jamon", cantidad: 1 }
  ],
  precio_base: 12.50,
  precio_extras: 1.50,
  precio_total: 14.00,
  ingredientes_finales: ["ing_mozzarella", "ing_parmesano", "ing_emmental", "ing_jamon"]
}
```

---

### 5. cuentas

**Responsabilidad**: Gestionar cuentas (mesas, delivery, para llevar).

**Estado**:
```javascript
this.cuentas = new Map();  // cuenta_id -> cuenta
this.counters = { local: 1, delivery: 1, llevar: 1 };
```

**Escucha**:
| Evento | Handler | Acción |
|--------|---------|--------|
| `pedido.item_agregado` | `onPedidoItemAgregado` | Actualiza totales de cuenta |
| `pedido.item_eliminado` | `onPedidoItemEliminado` | Actualiza totales de cuenta |
| `cobro.procesado` | `onCobroProcesado` | Marca cuenta como cobrada |

**Publica**:
| Evento | Cuándo |
|--------|--------|
| `cuenta.creada` | Nueva cuenta abierta |
| `cuenta.actualizada` | Totales actualizados |
| `cuenta.eliminada` | Cuenta cerrada |

**APIs**:
```
POST /cuentas              - Crear cuenta (tipo: local/delivery/llevar)
GET  /cuentas              - Listar (filtros: tipo, estado)
GET  /cuentas/:id          - Obtener por ID
DELETE /cuentas/:id        - Eliminar cuenta
GET  /stats                - Estadísticas
```

**Tipos de Cuenta**:
- `local`: Mesa en el local
- `delivery`: Pedido a domicilio
- `llevar`: Para llevar

**Estructura de Cuenta**:
```javascript
{
  id: "cuenta_abc123",
  tipo: "local",
  nombre: "Mesa 5",
  estado: "pendiente",  // pendiente | en_preparacion | cobrado
  hora: "14:30",
  items: 3,
  total: 35.50,
  alerta: false,
  created_at: "2024-01-15T14:30:00Z"
}
```

---

### 6. pedidos

**Responsabilidad**: Gestión completa de pedidos (reemplazo de comandero).

**Estado**:
```javascript
this.pedidos = new Map();           // pedido_id -> pedido
this.pedidosPorCuenta = new Map();  // cuenta_id -> Set(pedido_ids)
```

**Escucha**:
| Evento | Handler | Acción |
|--------|---------|--------|
| `variacion.validada` | `onVariacionValidada` | Confirma item con precio calculado |
| `variacion.rechazada` | `onVariacionRechazada` | Rechaza item |
| `cuenta.creada` | `onCuentaCreada` | Prepara pedidos para cuenta |

**Publica**:
| Evento | Cuándo |
|--------|--------|
| `pedido.creado` | Nuevo pedido iniciado |
| `pedido.item_agregado` | Item añadido al pedido |
| `pedido.item_actualizado` | Item modificado |
| `pedido.item_eliminado` | Item eliminado |
| `pedido.enviado_cocina` | Pedido enviado a cocina |
| `pedido.completado` | Pedido terminado |
| `pedido.cancelado` | Pedido cancelado |

**APIs**:
```
POST /pedidos                       - Crear pedido
GET  /pedidos                       - Listar (filtros: cuenta_id, estado)
GET  /pedidos/:id                   - Obtener por ID
POST /pedidos/:id/items             - Agregar item
PATCH /pedidos/:id/items/:item_id   - Actualizar item
DELETE /pedidos/:id/items/:item_id  - Eliminar item
POST /pedidos/:id/enviar-cocina     - Enviar a cocina
POST /pedidos/:id/completar         - Marcar completado
POST /pedidos/:id/cancelar          - Cancelar pedido
GET  /pedidos/:id/total             - Calcular total
```

**Estados de Pedido**:
- `borrador`: En edición
- `confirmado`: Listo para enviar
- `en_cocina`: Enviado a cocina
- `completado`: Terminado
- `cancelado`: Cancelado

**Estructura de Item**:
```javascript
{
  item_id: "item_abc123",
  producto_id: "prod_pizza_4quesos",
  nombre: "Pizza 4 Quesos",
  cantidad: 2,
  precio_unitario: 12.50,
  precio_total: 25.00,
  variaciones: {
    ingredientes_quitar: ["ing_gorgonzola"],
    ingredientes_anadir: [{ ingrediente_id: "ing_jamon", cantidad: 1 }]
  },
  notas: "Bien hecha",
  estado: "pendiente"
}
```

---

### 7. cocina

**Responsabilidad**: Display de cocina en tiempo real.

**Estado**:
```javascript
this.pedidosActivos = new Map();  // pedido_id -> pedido_cocina
this.historial = [];              // últimos 50 pedidos
this.sseClients = new Set();      // clientes conectados
```

**Escucha**:
| Evento | Handler | Acción |
|--------|---------|--------|
| `pedido.enviado_cocina` | `onPedidoEnviadoCocina` | Añade pedido a cola activa |
| `pedido.item_agregado` | `onItemAgregado` | Añade item a pedido en cocina |
| `pedido.cancelado` | `onPedidoCancelado` | Remueve pedido de cocina |

**Publica**:
| Evento | Cuándo |
|--------|--------|
| `cocina.item_preparado` | Item marcado como listo |
| `cocina.pedido_listo` | Pedido completo listo para servir |

**APIs**:
```
GET  /cocina/activos              - Pedidos activos en cocina
GET  /cocina/historial            - Historial de completados
GET  /cocina/pedidos/:id          - Detalle de pedido en cocina
POST /cocina/items/:id/preparar   - Marcar item como preparado
POST /cocina/pedidos/:id/listo    - Marcar pedido completo como listo
GET  /cocina/stream               - SSE para actualizaciones real-time
```

**Métricas de Cocina**:
- `tiempo_promedio_preparacion`: Segundos promedio por pedido
- `pedidos_activos`: Cantidad en cola
- `items_pendientes`: Items por preparar

---

### 8. cobros

**Responsabilidad**: Sistema unificado de cobros con 7 métodos de pago.

**Estado**:
```javascript
this.cobros = new Map();  // cobro_id -> cobro
this.metodosPago = ['efectivo', 'tarjeta', 'bizum', 'transferencia', 'mixto', 'link_pago', 'qr'];
```

**Escucha**:
| Evento | Handler | Acción |
|--------|---------|--------|
| `pedido.completado` | `onPedidoCompletado` | Habilita cobro para cuenta |

**Publica**:
| Evento | Cuándo |
|--------|--------|
| `cobro.iniciado` | Cobro iniciado |
| `cobro.completado` | Pago confirmado |
| `cobro.fallido` | Error en pago |
| `cobro.reembolsado` | Devolución procesada |

**APIs**:
```
POST /cobros                  - Iniciar cobro
GET  /cobros                  - Listar (filtros: cuenta_id, estado, metodo_pago)
GET  /cobros/:id              - Obtener por ID
POST /cobros/:id/confirmar    - Confirmar pago
POST /cobros/:id/reembolsar   - Procesar devolución
GET  /metodos-pago            - Listar métodos disponibles
```

**Métodos de Pago**:
| Método | Icono | Características |
|--------|-------|-----------------|
| `efectivo` | 💵 | Calcula cambio automáticamente |
| `tarjeta` | 💳 | Contactless, Redsys/Stripe |
| `bizum` | 📱 | Pago móvil instantáneo |
| `transferencia` | 🏦 | Requiere confirmación |
| `mixto` | 🔀 | Split payment entre métodos |
| `link_pago` | 🔗 | Link para pago online (24h) |
| `qr` | 📲 | QR para Bizum/wallets (30min) |

**Estructura de Cobro**:
```javascript
{
  id: "cobro_abc123",
  cuenta_id: "cuenta_xyz",
  pedido_ids: ["pedido_1", "pedido_2"],
  monto: 35.50,
  propina: 2.00,
  monto_total: 37.50,
  metodo_pago: "efectivo",
  monto_recibido: 50.00,
  cambio: 12.50,
  estado: "completado",
  created_at: "2024-01-15T15:30:00Z",
  completado_at: "2024-01-15T15:31:00Z"
}
```

---

## Módulos Especializados de Cuentas

### cuentas-mesa

**Responsabilidad**: Lógica específica de mesas.

**Configuración**:
```javascript
config: {
  mesas: {
    terraza: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    interior: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    vip: [21, 22, 23, 24, 25]
  }
}
```

**Eventos**:
- `mesa.abierta`: Mesa abierta para servicio
- `mesa.camarero_asignado`: Camarero asignado
- `mesa.cerrada`: Mesa liberada

---

### cuentas-llevar

**Responsabilidad**: Sistema de tickets con display de números.

**Eventos**:
- `llevar.ticket_creado`: Ticket generado
- `llevar.ticket_listo`: Mostrar en display
- `llevar.ticket_entregado`: Entregado al cliente

**Display**: Muestra números listos (máx 10, 5 minutos visible)

---

### cuentas-telefono

**Responsabilidad**: Pedidos telefónicos con Caller ID y WhatsApp.

**Eventos**:
- `telefono.llamada_detectada`: Llamada entrante
- `telefono.contacto_identificado`: Cliente reconocido
- `telefono.pedido_creado`: Pedido registrado
- `telefono.listo_para_recoger`: Notificación WhatsApp enviada

**Integración**:
- Asterisk/FreePBX para Caller ID
- Twilio para WhatsApp

---

## Flujo de Eventos Completo

### 1. Crear Menú con IA

```
Usuario (chat) → menu-generator
                     │
                     ▼ genera menú
              ┌──────────────┐
              │ menu.generado │
              └──────┬───────┘
                     │
     ┌───────────────┼───────────────┐
     ▼               ▼               ▼
productos      categorias      ingredientes
(pendiente)    (sincroniza)    (sincroniza)
     │
     ▼ usuario valida
┌─────────────┐
│menu.validado│
└─────┬───────┘
      │
      ▼
productos → catalogo.actualizado
(activo)
```

### 2. Tomar Pedido

```
Usuario → cuentas → cuenta.creada
                         │
                         ▼
                    pedidos (escucha)
                         │
          agregar item   │
               │         │
               ▼         │
          pedido.item_agregado
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
cuentas    variaciones  (otros)
(total)    (validar)
               │
               ▼
       variacion.validada
               │
               ▼
          pedidos (precio confirmado)
```

### 3. Enviar a Cocina

```
Usuario → pedidos → pedido.enviado_cocina
                           │
                           ▼
                       cocina
                           │
         preparar items    │
               │           │
               ▼           │
       cocina.item_preparado
               │
               ▼ (todos listos)
       cocina.pedido_listo
               │
    ┌──────────┴──────────┐
    ▼                     ▼
cuentas-llevar       cuentas-telefono
(display)            (WhatsApp)
```

### 4. Cobrar

```
Usuario → cobros → cobro.iniciado
                        │
         confirmar pago │
               │        │
               ▼        │
         cobro.completado
               │
               ▼
           cuentas
       (estado: cobrado)
```

---

## Formato de Menú para IA

Cuando el chat de IA genera un menú, debe seguir esta estructura:

```json
{
  "menu_id": "menu_abc123",
  "nombre": "Carta Principal",
  "categorias": [
    {
      "id": "cat_pizzas",
      "nombre": "Pizzas",
      "emoji": "🍕",
      "orden": 1
    }
  ],
  "productos": [
    {
      "id": "prod_pizza_4quesos",
      "nombre": "Pizza 4 Quesos",
      "emoji": "🧀",
      "categoria": "Pizzas",
      "descripcion": "Mozzarella, gorgonzola, parmesano, emmental",
      "precio": 12.50,
      "ingredientes_base": [
        { "id": "ing_mozzarella", "nombre": "Mozzarella", "emoji": "🧀" }
      ],
      "alergenos": ["gluten", "lactosa"],
      "variaciones": {
        "permite_quitar": ["ing_gorgonzola"],
        "permite_anadir": true,
        "extras_sugeridos": [
          { "ingrediente_id": "ing_jamon", "precio_extra": 1.50 }
        ]
      }
    }
  ],
  "ingredientes_catalogo": [
    {
      "id": "ing_mozzarella",
      "nombre": "Mozzarella",
      "emoji": "🧀",
      "tipo": "queso",
      "es_alergeno": true,
      "alergenos": ["lactosa"],
      "precio_extra": 1.00
    }
  ]
}
```

---

## Ubicación de Módulos

```
event-core/
├── modules/                    # Módulos activos
│   └── menu-generator/         # Generador de menús con IA
│
└── otros-modulos/
    └── modules/                # Módulos POS (pendientes de integrar)
        ├── productos/
        ├── categorias/
        ├── ingredientes/
        ├── variaciones/
        ├── cuentas/
        ├── cuentas-mesa/
        ├── cuentas-llevar/
        ├── cuentas-telefono/
        ├── pedidos/
        ├── cocina/
        └── cobros/
```

---

## Notas de Implementación

1. **Persistencia**: Actualmente todos los módulos usan `Map()` en memoria. En producción cambiar a base de datos.

2. **Validación**: Usar JSON Schema para validar payloads de eventos y requests HTTP.

3. **Correlación**: Siempre propagar `correlation_id` para trazabilidad.

4. **Métricas**: Cada módulo reporta:
   - Counters: operaciones totales
   - Gauges: estado actual
   - Timings: duración de operaciones

5. **Logs estructurados**: Formato `{mensaje, datos, correlation_id}`.

---

*Última actualización: 2024-12-04*
*Versión: 1.0.0*
